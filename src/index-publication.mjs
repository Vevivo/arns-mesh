// AR.IO r84 index publications are signed routing hints, never content proofs.
import crypto from 'node:crypto';
import bs58 from 'bs58';
import {canonicalize} from 'json-canonicalize';
export const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const safeName=s=>typeof s==='string'&&/^[A-Za-z0-9._-]{1,128}$/.test(s)&&!['.','..'].includes(s)&&!Object.hasOwn(Object.prototype,s);
export const hashPattern=/^[a-f0-9]{64}$/;
export function verifyPublication(doc,trust,{sequence=0,acceptedDigest=null,now=Date.now(),allowExpired=true}={}){
 if(!doc||doc.version!==1||doc.publisher!==trust.publisher||!Number.isSafeInteger(doc.sequence)||doc.sequence<1||!Number.isFinite(Date.parse(doc.issuedAt))||!Number.isFinite(Date.parse(doc.expiresAt))||Date.parse(doc.expiresAt)<=Date.parse(doc.issuedAt)||Date.parse(doc.issuedAt)>now+300000)throw new Error('invalid_index_publication');
 if(!Array.isArray(doc.indexes)||doc.indexes.length>64)throw new Error('invalid_index_shape');
 const names=new Set();
 for(const index of doc.indexes){
  if(!safeName(index.name)||names.has(index.name)||!safeName(index.kind)||!Array.isArray(index.bands)||index.bands.length>1024)throw new Error('invalid_index_shape');names.add(index.name);
  const bands=new Set();
  for(const band of index.bands){
   if(!safeName(band.id)||bands.has(band.id)||!Array.isArray(band.files)||band.files.length>1024)throw new Error('invalid_index_band');bands.add(band.id);
   if(band.heightRange&&(!Array.isArray(band.heightRange)||band.heightRange.length!==2||!Number.isSafeInteger(band.heightRange[0])||band.heightRange[0]<0||(band.heightRange[1]!==null&&(!Number.isSafeInteger(band.heightRange[1])||band.heightRange[1]<band.heightRange[0]))))throw new Error('invalid_index_height');
   const files=new Set();for(const f of band.files){if(!safeName(f.name)||files.has(f.name)||!hashPattern.test(f.sha256)||!Number.isSafeInteger(f.size)||f.size<0||f.size>128*1024*1024)throw new Error('invalid_index_file');files.add(f.name);}
  }
 }
 const {signature,...unsigned}=doc;
 if(signature?.alg!=='ed25519'||signature.keyId!==trust.observerAddress)throw new Error('index_publisher_key_mismatch');
 const raw=bs58.decode(trust.observerAddress),sig=Buffer.from(signature.sig||'','base64');
 if(raw.length!==32||sig.length!==64)throw new Error('invalid_index_signature');
 const key=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
 if(!crypto.verify(null,Buffer.from('ar-io-index-publication/v1\n'+canonicalize(unsigned)),key,sig))throw new Error('invalid_index_signature');
 const sha=digest(Buffer.from(canonicalize(doc)));
 if(doc.sequence<sequence||(doc.sequence===sequence&&acceptedDigest&&sha!==acceptedDigest))throw new Error('index_publication_rollback');
 const stale=Date.parse(doc.expiresAt)<now;if(stale&&!allowExpired)throw new Error('index_publication_expired');
 return {sha,stale};
}
export const newestBands=bands=>[...bands].sort((a,b)=>((b.heightRange?.[1]??Number.MAX_SAFE_INTEGER)-(a.heightRange?.[1]??Number.MAX_SAFE_INTEGER))||((b.heightRange?.[0]||0)-(a.heightRange?.[0]||0)));
export function validateBandManifest(manifest,band){
 if(!manifest||!Array.isArray(manifest.partitions)||manifest.partitions.length>256)throw new Error('invalid_shared_manifest');
 const prefixes=new Set(),files=new Map(band.files.map(f=>[f.name,f]));
 return manifest.partitions.map(p=>{
  const f=files.get(p.location?.filename);
  if(!/^[a-f0-9]{2}$/.test(p.prefix)||prefixes.has(p.prefix)||p.location?.type!=='file'||!f||!f.name.endsWith('.cdb')||f.size<4096)throw new Error('invalid_shared_partition');
  prefixes.add(p.prefix);return {...f,prefix:p.prefix};
 });
}
