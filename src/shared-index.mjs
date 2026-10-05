// Disk-only reader. Never imports a downloader or changes network lockdown.
import fs from 'node:fs';
import path from 'node:path';
import {lookupCdb64} from './cdb64-format.mjs';
import {verifyPublication,validateBandManifest,digest,hashPattern,newestBands} from './index-publication.mjs';
const readJson=(file,max=4*1024*1024)=>{if(fs.statSync(file).size>max)throw new Error('shared_index_metadata_too_large');return JSON.parse(fs.readFileSync(file,'utf8'));};
export class SharedIndex{
 constructor(dir){this.dir=dir;this.bands=[];this.stamp=null;this.nextCheck=0;this.lookups=0;this.hits=0;this.errors=0;this.lastError=null;this.cache=new Map();}
 refresh(){
  if(Date.now()<this.nextCheck)return;this.nextCheck=Date.now()+2000;
  try{
   const file=path.join(this.dir,'installed.json'),s=fs.statSync(file),stamp=s.mtimeMs+':'+s.size;
   if(stamp===this.stamp)return;
   const state=readJson(file),trust=readJson(path.join(this.dir,'trust.json')),publications=new Map(),loaded=[];
   if(state.schema!=='arns-shared-index/v1'||!Array.isArray(state.bands)||state.bands.length>1024)throw new Error('invalid_shared_install');
   for(const row of state.bands){
    if(!hashPattern.test(row.publication))throw new Error('invalid_shared_publication_path');
    let doc=publications.get(row.publication);
    if(!doc){doc=readJson(path.join(this.dir,'publications',row.publication+'.json'));const checked=verifyPublication(doc,trust);if(checked.sha!==row.publication)throw new Error('shared_publication_digest');publications.set(row.publication,doc);}
    const band=doc.indexes.find(i=>i.name==='root-tx-index'&&i.kind==='cdb64-root-tx')?.bands.find(b=>b.id===row.bandId);if(!band)throw new Error('shared_band_not_signed');
    const mf=band.files.find(f=>f.name==='manifest.json');if(!mf||mf.size>4*1024*1024)throw new Error('shared_manifest_missing');
    const mb=fs.readFileSync(path.join(this.dir,'blobs',mf.sha256));if(mb.length!==mf.size||digest(mb)!==mf.sha256)throw new Error('shared_manifest_digest');
    const parts=validateBandManifest(JSON.parse(mb),band);
    loaded.push({...band,parts,publication:row.publication,issuedAt:doc.issuedAt,expiresAt:doc.expiresAt,installedAt:row.installedAt});
   }
   this.bands=newestBands(loaded);this.stamp=stamp;this.cache.clear();this.lastError=null;
  }catch(error){this.lastError=String(error.message);/* Atomic replacement failures retain the last validated generation. */}
 }
 status(){this.refresh();return {enabled:true,bands:this.bands.length,records:this.bands.reduce((n,b)=>n+(b.records||0),0),bytes:this.bands.reduce((n,b)=>n+b.files.reduce((n,f)=>n+f.size,0),0),newestIssuedAt:this.bands.map(b=>b.issuedAt).sort().at(-1)||null,stale:this.bands.some(b=>Date.parse(b.expiresAt)<Date.now()),lookups:this.lookups,hits:this.hits,errors:this.errors,lastError:this.lastError};}
 async find(dataId,{signal}={}){
  if(!/^[A-Za-z0-9_-]{43}$/.test(dataId))throw new Error('invalid_data_id');signal?.throwIfAborted();this.refresh();this.lookups++;
  const cached=this.cache.get(dataId);if(cached){this.hits++;return cached;}
  const prefix=Buffer.from(dataId,'base64url')[0].toString(16).padStart(2,'0');
  for(const band of this.bands){
   const f=band.parts.find(p=>p.prefix===prefix);if(!f)continue;let handle;
   try{
    handle=await fs.promises.open(path.join(this.dir,'blobs',f.sha256),'r');const stat=await handle.stat();if(stat.size!==f.size)throw new Error('shared_partition_size');
    const hint=await lookupCdb64(async(offset,length)=>{signal?.throwIfAborted();const b=Buffer.alloc(length);const {bytesRead}=await handle.read(b,0,length,offset);return b.subarray(0,bytesRead);},f.size,dataId);
    if(hint){this.hits++;const result={...hint,sharedIndex:{band:band.id,publication:band.publication,issuedAt:band.issuedAt}};this.cache.set(dataId,result);if(this.cache.size>2048)this.cache.delete(this.cache.keys().next().value);return result;}
   }catch(error){signal?.throwIfAborted();this.errors++;this.lastError=String(error.message);}finally{await handle?.close();}
  }
  return null;
 }
}
let current=null;
export function getSharedIndex(){const dir=process.env.ARNS_SHARED_INDEX_DIR;if(!dir)return null;if(current?.dir!==dir)current=new SharedIndex(dir);return current;}
export function sharedLocation(hint){if(!hint)return null;const result={rootTxId:hint.rootTxId,path:hint.path||[]};if(Number.isSafeInteger(hint.rootOffset)&&Number.isSafeInteger(hint.itemSize)&&hint.itemSize>0&&hint.itemSize<=32*1024*1024){result.rootOffset=hint.rootOffset;result.itemSize=hint.itemSize;}return result;}
