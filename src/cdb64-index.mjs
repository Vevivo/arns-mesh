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
import {lookupCdb64} from './cdb64-format.mjs';
export {lookupCdb64,cdbHash,decodeIndexValue} from './cdb64-format.mjs';
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
