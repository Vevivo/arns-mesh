#!/usr/bin/env node
// Explicit online preparation tool. Run separately from the locked-down Mesh process.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canonicalize} from 'json-canonicalize';
import {verifyPublication,validateBandManifest,digest,hashPattern,newestBands} from '../src/index-publication.mjs';
import {decodeIndexValue} from '../src/cdb64-format.mjs';
const GiB=1024**3;
const readJson=(f,fallback)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export const atomicJson=(f,v)=>{const tmp=f+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(v),{mode:0o644});fs.renameSync(tmp,f);};
const event=(event,details={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...details}));
export function validateCdb(bytes,prefix){
 if(bytes.length<4096)throw new Error('cdb_truncated');
 const u=o=>{if(o<0||o+8>bytes.length)throw new Error('cdb_bounds');const v=Number(bytes.readBigUInt64LE(o));if(!Number.isSafeInteger(v))throw new Error('cdb_integer');return v;};
 let end=bytes.length;const tables=[];
 for(let i=0;i<256;i++){const start=u(i*16),slots=u(i*16+8);if(slots){if(start<4096||start+slots*16>bytes.length)throw new Error('cdb_table_bounds');end=Math.min(end,start);tables.push({start,slots});}}
 const records=new Set();let pos=4096;
 while(pos<end){const k=u(pos),v=u(pos+8);if(k!==32||v<1||v>1024||pos+16+k+v>end)throw new Error('cdb_record_bounds');if(bytes[pos+16]!==parseInt(prefix,16))throw new Error('cdb_wrong_partition');decodeIndexValue(bytes.subarray(pos+48,pos+48+v));records.add(pos);pos+=16+k+v;}
 if(pos!==end)throw new Error('cdb_record_end');
 for(const {start,slots} of tables)for(let i=0;i<slots;i++){const p=u(start+i*16+8);if(p&&!records.has(p))throw new Error('cdb_bad_record_pointer');}
 return records.size;
}
async function fileMatches(file,entry){try{if(fs.statSync(file).size!==entry.size)return false;const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex')===entry.sha256;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function boundedJson(url,max=4*1024*1024){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'accept-encoding':'identity'}});if(!r.ok)throw new Error('publication_http_'+r.status);let n=0;const chunks=[];for await(const b of r.body){n+=b.length;if(n>max)throw new Error('publication_too_large');chunks.push(b);}return JSON.parse(Buffer.concat(chunks));}
export async function syncSharedIndex({dir,origin,maxDiskBytes=50*GiB,maxDownloadBytes=4*GiB,maxBands=1024,fetchJson=boundedJson}={}){
 const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('https_index_origin_required');origin=url.origin;
 for(const d of ['', 'blobs','publications'])fs.mkdirSync(path.join(dir,d),{recursive:true});
 // flock in the service serializes processes. This lock also protects manual invocations.
 const lock=path.join(dir,'sync.lock');let fd;
 try{fd=fs.openSync(lock,'wx');fs.writeSync(fd,String(process.pid));}catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(fs.readFileSync(lock,'utf8'));let live=false;try{process.kill(pid,0);live=true;}catch(e){if(e.code==='EPERM')live=true;}if(live)throw new Error('index_sync_already_running');fs.unlinkSync(lock);return syncSharedIndex({dir,origin,maxDiskBytes,maxDownloadBytes,maxBands,fetchJson});}
 const statusFile=path.join(dir,'sync-status.json');
 let received=0;
 try{
  const trust=readJson(path.join(dir,'trust.json'));if(!trust?.publisher||!trust.observerAddress)throw new Error('index_trust_required');
  const highFile=path.join(dir,'accepted.json'),prior=readJson(highFile,{sequence:0});
  const doc=await fetchJson(origin+'/ar-io/indexes');const verified=verifyPublication(doc,trust,{sequence:prior.sequence,acceptedDigest:prior.sha,allowExpired:false});
  const publicationFile=path.join(dir,'publications',verified.sha+'.json');atomicJson(publicationFile,doc);atomicJson(highFile,{sequence:doc.sequence,sha:verified.sha});
  const index=doc.indexes.find(i=>i.name==='root-tx-index'&&i.kind==='cdb64-root-tx');if(!index)throw new Error('root_tx_index_missing');
  const bands=newestBands(index.bands);const allFiles=new Map(bands.flatMap(b=>b.files.map(f=>[f.sha256,f])));if([...allFiles.values()].reduce((n,f)=>n+f.size,0)>maxDiskBytes)throw new Error('offered_index_exceeds_disk_budget');
  const stateFile=path.join(dir,'installed.json'),state=readJson(stateFile,{schema:'arns-shared-index/v1',bands:[]});
  const today=new Date().toISOString().slice(0,10),meterFile=path.join(dir,'download-meter.json');let meter=readJson(meterFile,{day:today,bytes:0});if(meter.day!==today)meter={day:today,bytes:0};
  let diskBytes=fs.readdirSync(path.join(dir,'blobs')).reduce((n,f)=>n+fs.statSync(path.join(dir,'blobs',f)).size,0);
  const used=await fs.promises.statfs(dir);if(Number(used.bavail)*Number(used.bsize)<GiB)throw new Error('index_disk_headroom');
  const status=(extra={})=>atomicJson(statusFile,{at:new Date().toISOString(),origin,publisher:doc.publisher,sequence:doc.sequence,issuedAt:doc.issuedAt,expiresAt:doc.expiresAt,installedBands:state.bands.length,offeredBands:bands.length,receivedBytesThisRun:received,downloadBytesToday:meter.bytes,diskBytes,...extra});
  let lastRequest=0;const pace=async()=>{const now=Date.now(),at=Math.max(now,lastRequest+220);lastRequest=at;if(at>now)await new Promise(r=>setTimeout(r,at-now));};
  async function download(f){
   const dest=path.join(dir,'blobs',f.sha256),partial=dest+'.part';
   if(await fileMatches(dest,f))return dest;
   if(fs.existsSync(dest)){diskBytes-=fs.statSync(dest).size;fs.unlinkSync(dest);}
   let offset=0;try{offset=fs.statSync(partial).size;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(offset>f.size){diskBytes-=offset;fs.unlinkSync(partial);offset=0;}
   if(offset===f.size){if(await fileMatches(partial,f)){fs.renameSync(partial,dest);return dest;}diskBytes-=offset;fs.unlinkSync(partial);offset=0;}
   if(meter.bytes>=maxDownloadBytes)throw new Error('index_daily_download_budget');
   if(diskBytes+f.size-offset>maxDiskBytes)throw new Error('index_disk_budget');
   await pace();
   const r=await fetch(origin+'/ar-io/indexes/blob/'+f.sha256,{redirect:'error',signal:AbortSignal.timeout(180000),headers:{'accept-encoding':'identity',...(offset?{range:`bytes=${offset}-`}:{})}});
   if(!r.ok){await r.body?.cancel();throw new Error('index_http_'+r.status);}
   if(r.headers.get('content-encoding')&&r.headers.get('content-encoding')!=='identity'){await r.body.cancel();throw new Error('index_compressed_response');}
   if(offset&&r.status===200){diskBytes-=offset;offset=0;fs.truncateSync(partial,0);}
   if(offset&&(!r.headers.get('content-range')?.startsWith(`bytes ${offset}-`)||r.status!==206)){await r.body.cancel();throw new Error('index_bad_resume');}
   const out=await fs.promises.open(partial,offset?'a':'w');let count=offset;
   try{for await(const chunk of r.body){if(count+chunk.length>f.size)throw new Error('index_oversize_response');if(meter.bytes+chunk.length>maxDownloadBytes)throw new Error('index_daily_download_budget');await out.write(chunk);count+=chunk.length;meter.bytes+=chunk.length;received+=chunk.length;diskBytes+=chunk.length;}}finally{await out.close();atomicJson(meterFile,meter);}
   if(!await fileMatches(partial,f))throw new Error('index_file_digest_or_size');fs.renameSync(partial,dest);return dest;
  }
  let installedThisRun=0;
  for(const band of bands){
   if(installedThisRun>=maxBands)break;
   const same=state.bands.find(b=>b.bandId===band.id&&b.publication===verified.sha);if(same)continue;
   const mf=band.files.find(f=>f.name==='manifest.json');if(!mf||mf.size>4*1024*1024)throw new Error('shared_manifest_missing');
   status({phase:'downloading',band:band.id});const manifest=JSON.parse(fs.readFileSync(await download(mf),'utf8'));const parts=validateBandManifest(manifest,band);
   // Sequential streaming keeps RAM/CPU bounded on small supporters; files resume.
   for(let i=0;i<parts.length;i++){const f=parts[i],file=await download(f);validateCdb(fs.readFileSync(file),f.prefix);if(i%16===0)status({phase:'downloading',band:band.id,partitions:i+1,totalPartitions:parts.length});}
   const now=new Date().toISOString();
   // Retain old generations until their replacement is completely validated.
   const replaces=new Set([band.id,...(Array.isArray(band.metadata?.supersedes)?band.metadata.supersedes:[band.metadata?.supersedes]).filter(x=>typeof x==='string')]);
   state.bands=state.bands.filter(b=>!replaces.has(b.bandId));state.bands.push({bandId:band.id,publication:verified.sha,installedAt:now});atomicJson(stateFile,state);installedThisRun++;event('index-band-installed',{band:band.id,records:band.records,bytes:band.files.reduce((n,f)=>n+f.size,0)});status({phase:'installed',band:band.id});
  }
  // Retire withdrawn bands only when every offered band is now present.
  if(bands.every(b=>state.bands.some(r=>r.bandId===b.id&&r.publication===verified.sha))){state.bands=state.bands.filter(r=>bands.some(b=>b.id===r.bandId));atomicJson(stateFile,state);
   const keep=new Set(bands.flatMap(b=>b.files.map(f=>f.sha256)));
   for(const name of fs.readdirSync(path.join(dir,'blobs'))){const file=path.join(dir,'blobs',name);if(hashPattern.test(name)&&!keep.has(name)&&Date.now()-fs.statSync(file).mtimeMs>3600000)fs.unlinkSync(file);}
  }
  status({phase:'idle',error:null});return {installedBands:state.bands.length,receivedBytes:received};
 }catch(error){const old=readJson(statusFile,{});atomicJson(statusFile,{...old,at:new Date().toISOString(),phase:'paused',receivedBytesThisRun:received,error:String(error.message)});throw error;}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=process.env.ARNS_SHARED_INDEX_DIR,origin=process.env.ARNS_INDEX_PUBLISHER_URL;
 if(!dir||!origin)throw new Error('Set ARNS_SHARED_INDEX_DIR and ARNS_INDEX_PUBLISHER_URL; create trust.json from a verified registry observation first.');
 syncSharedIndex({dir,origin,maxDiskBytes:Number(process.env.ARNS_INDEX_DISK_GIB||50)*GiB,maxDownloadBytes:Number(process.env.ARNS_INDEX_DOWNLOAD_GIB||4)*GiB,maxBands:Number(process.env.ARNS_INDEX_MAX_BANDS||1024)}).then(r=>event('index-sync-complete',r)).catch(error=>{event('index-sync-paused',{error:error.message});process.exitCode=1;});
}
