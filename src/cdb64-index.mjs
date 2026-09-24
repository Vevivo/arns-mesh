import fs from 'node:fs';
import {discoverArweavePeers,requestJson,rangeFromRoot,locateDataItem} from './arweave-direct.mjs';
import {saveDiscoveredLocations} from './discovery-store.mjs';
import {shareQuery} from './query-work.mjs';
import {lookupOffsetIndex,OFFSET_INDEX_ROOT} from './lmdb-offset-index.mjs';
import {ChunkCache} from './resource-budget.mjs';

// The published index is an untrusted routing aid, never an inclusion proof.
// Only immutable Arweave byte ranges are supported. No HTTP/Gateway fallback.
const idPattern=/^[A-Za-z0-9_-]{43}$/;
const safe=n=>{const value=Number(n);if(!Number.isSafeInteger(value)||value<0)throw new Error('index_integer_out_of_range');return value;};
export function cdbHash(key){let hash=5381n;for(const byte of key)hash=BigInt.asUintN(64,hash*33n^BigInt(byte));return hash;}
export function decodeIndexValue(buffer){
 let pos=0;
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||pos+n>buffer.length)throw new Error('index_value_truncated');const b=buffer.subarray(pos,pos+n);pos+=n;return b;};
 const parse=(depth=0)=>{
  if(depth>4)throw new Error('index_value_depth');const code=take(1)[0];
  if(code<128)return code;
  if(code>=0xa0&&code<=0xbf)return take(code&31).toString('utf8');
  if(code>=0x90&&code<=0x9f){const n=code&15;if(n>10)throw new Error('index_path_too_long');return Array.from({length:n},()=>parse(depth+1));}
  if(code>=0x80&&code<=0x8f){const n=code&15;if(n>8)throw new Error('index_value_map');const out=Object.create(null);for(let i=0;i<n;i++){const key=parse(depth+1);if(!['r','p','i','d','s'].includes(key)||Object.hasOwn(out,key))throw new Error('index_value_key');out[key]=parse(depth+1);}return out;}
  if(code===0xc4){const n=take(1)[0];if(n!==32)throw new Error('index_id_size');return take(n);}
  if(code===0xcc)return take(1)[0];
  if(code===0xcd)return take(2).readUInt16BE();
  if(code===0xce)return take(4).readUInt32BE();
  if(code===0xcf)return safe(take(8).readBigUInt64BE());
  throw new Error('unsupported_index_value_type:'+code);
 };
 const result=parse();if(pos!==buffer.length||!result||typeof result!=='object'||Array.isArray(result))throw new Error('invalid_index_value');
 const ids=result.p||(result.r?[result.r]:[]);
 if(!Array.isArray(ids)||!ids.length||ids.some(x=>!Buffer.isBuffer(x)||x.length!==32))throw new Error('invalid_index_path');
 const path=ids.map(x=>x.toString('base64url'));
 return {rootTxId:path[0],path:path.slice(1),...(result.i!==undefined?{rootOffset:safe(result.i)}:{}),...(result.d!==undefined?{dataOffset:safe(result.d)}:{}),...(result.s!==undefined?{itemSize:safe(result.s)}:{})};
}
let current=null;
export function configureHistoricalIndex({peersFile,locationsFile,retainBundleEntries=true}){
 const index=new HistoricalIndex({peersFile});const pending=new Map(),misses=new Map();let active=0;
 const offsetPending=new Map(),offsetCache=new Map();let offsetActive=0;
 current={
  index,
  status(){return {active,pending:pending.size,negativeCached:misses.size,publishedOffsets:{root:OFFSET_INDEX_ROOT,records:8560638056,active:offsetActive,pending:offsetPending.size},manifests:index.manifests.map(m=>({height:m.height,records:m.records,partitions:m.partitions.length}))};},
  async findOffsets(dataId,options={}){
   options.signal?.throwIfAborted();
   if(!idPattern.test(dataId))throw new Error('invalid_data_id');
   const cached=offsetCache.get(dataId);if(cached&&cached.until>Date.now())return cached.hints;
   if(!offsetPending.has(dataId)&&offsetPending.size>=32)throw new Error('offset_lookup_busy');
   return shareQuery(offsetPending,dataId,async signal=>{
    while(offsetActive>=4){signal.throwIfAborted();await new Promise(r=>setTimeout(r,50));}
    signal.throwIfAborted();offsetActive++;
    try{
     options.onProgress?.({stage:'location',status:'active',message:'Looking up the published offset index through raw Arweave…'});
     await index.read(OFFSET_INDEX_ROOT,0,160,{signal});
     const result=await lookupOffsetIndex((offset,size)=>index.read(OFFSET_INDEX_ROOT,offset,size,{signal}),index.meta.get(OFFSET_INDEX_ROOT).size,dataId);
     signal.throwIfAborted();
     const hints=result.candidates.filter(h=>h.itemSize<=32*1024*1024);
     if(result.candidates.length&&!hints.length)throw new Error('data_item_too_large');
     offsetCache.set(dataId,{until:Date.now()+(hints.length?300000:60000),hints});
     if(offsetCache.size>2048)offsetCache.delete(offsetCache.keys().next().value);
     return hints;
    }finally{offsetActive--;}
   },options);
  },
  async find(dataId,options={}){
   options.signal?.throwIfAborted();
   if((misses.get(dataId)||0)>Date.now())return null;
   if(!pending.has(dataId)&&pending.size>=64)throw new Error('historical_lookup_busy');
   return shareQuery(pending,dataId,async signal=>{
    options={...options,signal};
    while(active>=4){options.signal?.throwIfAborted();await new Promise(r=>setTimeout(r,50));}
    options.signal?.throwIfAborted();active++;
    try{
    const hint=await index.find(dataId,options);options.signal.throwIfAborted();if(!hint){misses.set(dataId,Date.now()+60000);if(misses.size>2048)misses.delete(misses.keys().next().value);return null;}
    const location=await locateDataItem(dataId,hint,{seedsFile:peersFile,signal:options.signal,onLocations:entries=>{if(retainBundleEntries)saveDiscoveredLocations(locationsFile,entries);}});
    saveDiscoveredLocations(locationsFile,[[dataId,location]]);return location;
    }finally{active--;}
   },options);
  }
 };return current;
}
export function getHistoricalIndex(){return current;}
export async function lookupCdb64(read,size,dataId,{maxProbes=128}={}){
 if(!idPattern.test(dataId)||!Number.isSafeInteger(size)||size<4096)throw new Error('invalid_index_lookup');
 const bounded=async(offset,length)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+length>size)throw new Error('index_pointer_out_of_bounds');const bytes=await read(offset,length);if(bytes.length!==length)throw new Error('index_read_truncated');return bytes;};
 const key=Buffer.from(dataId,'base64url'),hash=cdbHash(key);
 const header=await bounded(Number(hash&255n)*16,16);
 const table=safe(header.readBigUInt64LE(0)),slots=safe(header.readBigUInt64LE(8));
 if(!slots)return null;
 if(table<4096||table+slots*16>size)throw new Error('index_table_out_of_bounds');
 let slot=Number((hash>>8n)%BigInt(slots));
 for(let i=0;i<Math.min(slots,maxProbes);i++,slot=(slot+1)%slots){
  const row=await bounded(table+slot*16,16),position=safe(row.readBigUInt64LE(8));
  if(!position)return null;
  if(row.readBigUInt64LE(0)!==hash)continue;
  if(position<4096||position>=table)throw new Error('index_record_out_of_bounds');
  const record=await bounded(position,16),keyLength=safe(record.readBigUInt64LE()),valueLength=safe(record.readBigUInt64LE(8));
  if(keyLength!==32||valueLength<1||valueLength>1024||position+16+keyLength+valueLength>table)throw new Error('invalid_index_record');
  const content=await bounded(position+16,keyLength+valueLength);
  if(content.subarray(0,32).equals(key))return decodeIndexValue(content.subarray(32));
 }
 throw new Error('index_probe_limit');
}
export class HistoricalIndex{
 constructor({peersFile,manifests}={}){
  this.peersFile=peersFile;this.peers=[];this.peersUntil=0;this.meta=new Map();this.chunks=new ChunkCache();this.pending=new Map();this.found=new Map();
  this.manifests=manifests||['historical-web','historical-untyped','historical-ao'].map(name=>JSON.parse(fs.readFileSync(new URL('../resources/'+name+'.json',import.meta.url),'utf8')));
 }
 async getPeers(signal){signal?.throwIfAborted();if(this.peersUntil>Date.now()&&this.peers.length)return this.peers;this.peers=await discoverArweavePeers(JSON.parse(fs.readFileSync(this.peersFile,'utf8')),{maxPeers:16,expand:true,signal});this.peersUntil=Date.now()+120000;return this.peers;}
 async read(rootTxId,offset,size,{signal,onProgress=()=>{}}={}){
  let lastError;
  for(const peer of await this.getPeers(signal)){
   signal?.throwIfAborted();
   try{
    const key=rootTxId;let meta=this.meta.get(key);
    if(!meta){const j=await requestJson({...peer,path:'/tx/'+rootTxId+'/offset',timeout:3000,signal});const end=safe(j.offset),length=safe(j.size);if(length<1||end<length-1)throw new Error('invalid_index_tx_offset');meta={end,size:length,start:end-length+1};this.meta.set(key,meta);}
    const result=await rangeFromRoot(peer,rootTxId,offset,size,meta,{signal,onProgress,chunkCache:this.chunks,timeout:3000,peerSeeds:this.peers});
    return result;
   }catch(error){lastError=error;}
  }
  throw lastError||new Error('no_raw_arweave_peers');
 }
 async find(dataId,{signal=AbortSignal.timeout(25000),onProgress=()=>{}}={}){
  signal.throwIfAborted();
  if(!idPattern.test(dataId))throw new Error('invalid_data_id');
  if(this.found.has(dataId))return this.found.get(dataId);
  return shareQuery(this.pending,dataId,async workSignal=>{
   const signal=workSignal;
   const prefix=Buffer.from(dataId,'base64url')[0].toString(16).padStart(2,'0');const errors=[];
   for(const manifest of this.manifests){
    const part=manifest.partitions.find(x=>x[0]===prefix);if(!part)continue;
    const [,root,offset,size]=part;if(!idPattern.test(root)||!Number.isSafeInteger(offset)||offset<0)throw new Error('invalid_index_manifest');
    onProgress({stage:'location',status:'active',message:'Querying the historical index through raw Arweave…',indexHeight:manifest.height});
    try{
     const result=await lookupCdb64((start,length)=>this.read(root,offset+start,length,{signal}),size,dataId);
     signal.throwIfAborted();
     if(result){const hint={...result,indexHeight:manifest.height,indexSource:root};this.found.set(dataId,hint);if(this.found.size>2048)this.found.delete(this.found.keys().next().value);return hint;}
    }catch(error){signal.throwIfAborted();errors.push(error.message);}
   }
   if(errors.length)throw new Error('historical_index_unavailable:'+errors.join(';'));
   return null;
  },{signal});
 }
}
