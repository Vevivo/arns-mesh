import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import {
  verifyDataItem,
  parseDataItem,
  deserializeTags,
  idFromSignature
} from './ans104.mjs';
import Arweave from 'arweave';
import { generateTransactionChunks } from 'arweave/node/lib/merkle.js';
import { sha256 } from './common.mjs';
import {normalizeLocation} from './location-index.mjs';
import {firstVerified} from './query-work.mjs';
import {ChunkCache} from './resource-budget.mjs';

const arweave=Arweave.init({});
const sharedChunkCache=new ChunkCache();
const recentStoragePeers=new Map();
function evictRootChunks(cache,rootTxId){if(cache)for(const [key,value] of cache)if(value.namespace===rootTxId)cache.delete(key);}

function assertIp(host){ if(!net.isIP(host)) throw new Error('non_ip_arweave_peer:'+host); }
function loadPeerSeeds(file){
  const primary=JSON.parse(fs.readFileSync(file,'utf8'));
  let discovered=[];
  const extraFile=process.env.ARWEAVE_PEER_SEEDS||'arweave-peer-seeds.json';
  if(file!==extraFile && fs.existsSync(extraFile)){
    try{discovered=JSON.parse(fs.readFileSync(extraFile,'utf8'));}catch{}
  }
  const out=[],seen=new Set();
  for(const p of [...primary,...discovered]){
    if(!p?.host||!p?.port) continue;
    const k=p.host+':'+p.port;
    if(seen.has(k)) continue;
    seen.add(k);out.push({host:p.host,port:Number(p.port)});
  }
  return out;
}
export {requestIpJson as requestJson} from './ip-transport.mjs';
import {requestIpJson as requestJson} from './ip-transport.mjs';

function u256le(buf){ return Number(BigInt('0x'+Buffer.from(buf).reverse().toString('hex'))); }

export async function discoverArweavePeers(seeds,{maxPeers=32,expand=false,signal}={}){
  signal?.throwIfAborted();
  const uniq=[];
  const seen=new Set();
  for(const p of seeds){
    const key=p.host+':'+p.port;
    if(seen.has(key)) continue;
    seen.add(key); uniq.push({host:p.host,port:Number(p.port)});
  }
  const initial=(await Promise.all(uniq.slice(0,maxPeers).map(async p=>{
    try{
      assertIp(p.host);
      const info=await requestJson({host:p.host,port:p.port,path:'/info',timeout:2200,signal});
      return info?.network==='arweave.N.1'?{...p,height:info.height}:null;
    }catch{return null;}
  }))).filter(Boolean);
  signal?.throwIfAborted();
  if(!expand||initial.length>=maxPeers) return initial.slice(0,maxPeers);

  const discovered=[];
  for(const p of initial.slice(0,3)){
    signal?.throwIfAborted();
    try{
      const peers=await requestJson({host:p.host,port:p.port,path:'/peers',timeout:2200,signal});
      for(const s of peers||[]){
        const m=String(s).match(/^([0-9a-fA-F:.]+):(\d+)$/);
        if(!m||!net.isIP(m[1])) continue;
        const key=m[1]+':'+m[2];
        if(seen.has(key)) continue;
        seen.add(key); discovered.push({host:m[1],port:Number(m[2])});
        if(initial.length+discovered.length>=maxPeers) break;
      }
    }catch{}
    if(initial.length+discovered.length>=maxPeers) break;
  }
  const verified=(await Promise.all(discovered.map(async p=>{
    try{
      const info=await requestJson({host:p.host,port:p.port,path:'/info',timeout:1800,signal});
      return info?.network==='arweave.N.1'?{...p,height:info.height}:null;
    }catch{return null;}
  }))).filter(Boolean);
  signal?.throwIfAborted();return [...initial,...verified].slice(0,maxPeers);
}

export async function txOffset(peer,txId,options={}){
  const j=await requestJson({host:peer.host,port:peer.port,path:'/tx/'+txId+'/offset',signal:options.signal,onBytes:options.onNetworkBytes});
  const end=Number(j.offset),size=Number(j.size),start=end-size+1;
  if(!Number.isSafeInteger(end)||!Number.isSafeInteger(size)||size<1||!Number.isSafeInteger(start)||start<0)throw new Error('invalid_transaction_offset');
  return {end,size,start};
}
async function chunkAt(peer,absoluteOffset,options={}){
  const cache=options.chunkCache;
  if(cache)for(const value of cache.values())if(value.namespace===options.cacheNamespace&&absoluteOffset>=value.start&&absoluteOffset<=value.end)return value;
  const j=await requestJson({host:peer.host,port:peer.port,path:'/chunk/'+absoluteOffset,timeout:options.timeout||9000,signal:options.signal,onBytes:options.onNetworkBytes});
  const body=Buffer.from(j.chunk,'base64url');
  const end=Number(j.absolute_end_offset);
  const size=Number(j.chunk_size ?? body.length);
  const start=end-size+1;
  if(!Number.isSafeInteger(end)||!Number.isSafeInteger(size)||size<1||size>262144||body.length!==size||!Number.isSafeInteger(start)||start<0) throw new Error('chunk_size_mismatch');
  const result={body,start,end,namespace:options.cacheNamespace};
  if(cache){cache.set((options.cacheNamespace||'')+':'+start,result);if(cache.size>128)cache.delete(cache.keys().next().value);}
  return result;
}
let storageCandidates=[],storageCandidatesUntil=0,storageCandidatesKey='';
function publicPeer(value){
 const m=String(value).match(/^([0-9.]+):(\d+)$/);if(!m||net.isIP(m[1])!==4||!Number.isInteger(Number(m[2]))||Number(m[2])<1||Number(m[2])>65535)return null;
 const [a,b]=m[1].split('.').map(Number);
 if(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127))return null;
 return {host:m[1],port:Number(m[2])};
}
async function storagePeerPool(seeds,options){
 const seedKey=seeds.map(p=>p.host+':'+p.port).sort().join('|');
 if(storageCandidatesKey===seedKey&&storageCandidatesUntil>Date.now()&&storageCandidates.length)return storageCandidates;
 const map=new Map(seeds.map(p=>[p.host+':'+p.port,p]));
 const results=await Promise.allSettled(seeds.slice(0,5).map(p=>requestJson({...p,path:'/peers',timeout:1800,signal:options.signal,onBytes:options.onNetworkBytes})));
 for(const result of results)if(result.status==='fulfilled'&&Array.isArray(result.value))for(const s of result.value){const peer=publicPeer(s);if(peer)map.set(peer.host+':'+peer.port,peer);if(map.size>=512)break;}
 storageCandidates=[...map.values()].sort((a,b)=>(a.host+':'+a.port).localeCompare(b.host+':'+b.port));storageCandidatesUntil=Date.now()+120000;storageCandidatesKey=seedKey;return storageCandidates;
}
export function syncRecordCovers(record,offset){
 if(!Array.isArray(record)||record.length>16)return false;
 return record.some(entry=>entry&&typeof entry==='object'&&!Array.isArray(entry)&&Object.entries(entry).some(([end,start])=>Number.isSafeInteger(Number(start))&&Number.isSafeInteger(Number(end))&&Number(start)<offset&&offset<=Number(end)));
}
async function discoverStoredChunk(offset,seeds,options={}){
 const controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(25000),...(options.signal?[options.signal]:[])]);
 for(const peer of recentStoragePeers.values()){
  try{const chunk=await chunkAt(peer,offset,{...options,signal,timeout:1200});if(offset>=chunk.start&&offset<=chunk.end)return {peer,chunk};}catch{}
 }
 const candidates=await storagePeerPool(seeds,{...options,signal});let position=0,found=null;
 const worker=async()=>{
  while(position<candidates.length&&!signal.aborted&&!found){
   const peer=candidates[position++];
   try{
    const record=await requestJson({...peer,path:`/data_sync_record/${Math.max(0,offset-1)}/${offset}/1`,timeout:1200,maxBytes:16384,signal,onBytes:options.onNetworkBytes});
    if(!syncRecordCovers(record,offset))continue;
    const chunk=await chunkAt(peer,offset,{...options,signal,timeout:4000});
    if(offset<chunk.start||offset>chunk.end)continue;
    found={peer,chunk};recentStoragePeers.set(peer.host+':'+peer.port,peer);if(recentStoragePeers.size>8)recentStoragePeers.delete(recentStoragePeers.keys().next().value);controller.abort(new Error('storage_peer_found'));
   }catch{/* Try another advertised raw Arweave peer within the shared deadline. */}
  }
 };
 await Promise.all(Array.from({length:12},worker));options.signal?.throwIfAborted();
 if(!found)throw new Error('raw_chunk_provider_not_found:'+offset);
 return found;
}
export async function rangeFromRoot(peer,rootTxId,relativeOffset,size,rootMeta,options={}){
  options.chunkCache??=sharedChunkCache;
  options.cacheNamespace=rootTxId;
  const meta=rootMeta||await txOffset(peer,rootTxId,options);
  if(!Number.isSafeInteger(relativeOffset)||!Number.isSafeInteger(size)||relativeOffset<0||size<0||relativeOffset+size>meta.size)throw new Error('invalid_content_range');
  let absolute=meta.start+relativeOffset;
  const endWanted=absolute+size;
  const parts=[];
  while(absolute<endWanted){
    let c;
    try{c=await chunkAt(options.dataPeer||peer,absolute,options);}
    catch(error){if(!options.peerSeeds)throw error;options.signal?.throwIfAborted();const found=await discoverStoredChunk(absolute,options.peerSeeds,options);options.dataPeer=found.peer;c=found.chunk;}
    if(absolute<c.start||absolute>c.end) throw new Error('chunk_does_not_cover_offset');
    const from=absolute-c.start;
    const take=Math.min(c.body.length-from,endWanted-absolute);
    if(take<=0) throw new Error('zero_chunk_progress');
    parts.push(c.body.subarray(from,from+take));
    absolute+=take;const source=options.dataPeer||peer;options.onProgress?.({stage:'download',status:absolute===endWanted?'done':'active',received:absolute-(meta.start+relativeOffset),total:size,source:source.host+':'+source.port});
  }
  return Buffer.concat(parts,size);
}
function parseBundleEntries(header){
  const count=u256le(header.subarray(0,32));
  const needed=32+count*64;
  if(header.length<needed) throw new Error('bundle_header_truncated');
  const entries=[]; let p=32, rel=needed;
  for(let i=0;i<count;i++){
    const size=u256le(header.subarray(p,p+32));
    const id=Buffer.from(header.subarray(p+32,p+64)).toString('base64url');
    entries.push({index:i,id,size,relativeOffset:rel});
    rel+=size; p+=64;
  }
  return {count,headerSize:needed,entries,totalSize:rel};
}
async function inspectRootOnPeer(peer,rootTxId,targetId,options={}){
  const {meta,parsed}=await inspectBundleOnPeer(peer,rootTxId,options);
  const entry=parsed.entries.find(x=>x.id===targetId);
  if(!entry) throw new Error('target_not_in_bundle');
  return {meta,parsed,entry};
}
export async function inspectBundleOnPeer(peer,rootTxId,options={}){
  options={...options,chunkCache:options.chunkCache||new Map()};
  if(!/^[A-Za-z0-9_-]{43}$/.test(rootTxId))throw new Error('invalid_root_tx_id');
  const meta=await txOffset(peer,rootTxId,options);
  const first32=await rangeFromRoot(peer,rootTxId,0,32,meta,options);
  const count=u256le(first32);
  if(!Number.isSafeInteger(count)||count<1||count>262144) throw new Error('invalid_bundle_count');
  const headerSize=32+count*64;
  const header=await rangeFromRoot(peer,rootTxId,0,headerSize,meta,options);
  const parsed=parseBundleEntries(header);
  if(!Number.isSafeInteger(parsed.totalSize)||parsed.totalSize!==meta.size||parsed.entries.some(x=>!Number.isSafeInteger(x.size)||x.size<1||!Number.isSafeInteger(x.relativeOffset)))throw new Error('invalid_bundle_layout');
  return {meta,parsed};
}

// Resolve nested routing hints by reading bundle headers; target bytes must
// still pass fetchDataItemDirect's ID and signature verification afterwards.
export async function locateDataItem(dataId,hint,{seedsFile=process.env.ARWEAVE_PEERS||'arweave-peers.json',signal=AbortSignal.timeout(25000),onLocations,onBundleEntries}={}){
  if(!/^[A-Za-z0-9_-]{43}$/.test(dataId)||!/^[A-Za-z0-9_-]{43}$/.test(hint?.rootTxId))throw new Error('invalid_location_hint');
  const path=hint.path||[];
  if(!Array.isArray(path)||path.length>8||path.some(id=>!/^[A-Za-z0-9_-]{43}$/.test(id)))throw new Error('invalid_location_path');
  const peers=await discoverArweavePeers(loadPeerSeeds(seedsFile),{maxPeers:32,expand:true,signal});let lastError;
  for(const peer of peers){
    signal.throwIfAborted();
    try{
      const meta=await txOffset(peer,hint.rootTxId,{signal}),options={signal,chunkCache:sharedChunkCache,timeout:3000,peerSeeds:loadPeerSeeds(seedsFile)};
      let base=0,bundleSize=meta.size;const walked=[];
      for(let depth=0;depth<=8;depth++){
        const first=await rangeFromRoot(peer,hint.rootTxId,base,32,meta,options),count=u256le(first),headerSize=32+count*64;
        if(!Number.isSafeInteger(count)||count<1||count>262144||headerSize>bundleSize)throw new Error('invalid_bundle_count');
        const header=await rangeFromRoot(peer,hint.rootTxId,base,headerSize,meta,options),parsed=parseBundleEntries(header);
        if(parsed.totalSize!==bundleSize||parsed.entries.some(x=>!Number.isSafeInteger(x.size)||x.size<1||!Number.isSafeInteger(x.relativeOffset)))throw new Error('invalid_bundle_layout');
        onBundleEntries?.({entries:parsed.entries,rootTxId:hint.rootTxId,base,weaveBase:meta.start+base-1,path:[...walked]});
        onLocations?.(parsed.entries.filter(x=>x.size<=32*1024*1024).map(x=>[x.id,{rootTxId:hint.rootTxId,rootOffset:base+x.relativeOffset,itemSize:x.size,path:[...walked]}]));
        const target=parsed.entries.find(x=>x.id===dataId);
        if(target)return normalizeLocation(dataId,{rootTxId:hint.rootTxId,rootOffset:base+target.relativeOffset,itemSize:target.size,path:walked});
        const next=path[depth]?parsed.entries.find(x=>x.id===path[depth]):Number.isSafeInteger(hint.rootOffset)?parsed.entries.find(x=>hint.rootOffset>=base+x.relativeOffset&&hint.rootOffset<base+x.relativeOffset+x.size):null;
        if(!next)throw new Error('target_not_in_bundle');
        const prefix=await rangeFromRoot(peer,hint.rootTxId,base+next.relativeOffset,Math.min(8192,next.size),meta,options),item=parseDataItem(prefix);
        const start=item.offsets.dataStart;
        if(!Number.isSafeInteger(start)||start<item.offsets.tagsStart+16||start+32>next.size||Buffer.from(idFromSignature(item.rawSignature)).toString('base64url')!==next.id)throw new Error('invalid_nested_header');
        base+=next.relativeOffset+start;bundleSize=next.size-start;walked.push(next.id);
      }
      throw new Error('bundle_nesting_limit');
    }catch(error){lastError=error;}
  }
  throw lastError||new Error('no_raw_arweave_peers');
}


function decodeTags(tags){
  return (tags||[]).map(t=>({
    name:Buffer.from(String(t.name||''),'base64url').toString('utf8'),
    value:Buffer.from(String(t.value||''),'base64url').toString('utf8')
  }));
}

export async function fetchL1Direct({dataId,seedsFile=process.env.ARWEAVE_PEERS||'arweave-peers.json',maxPeers=96,maxBytes=128*1024*1024,onProgress=()=>{},signal=AbortSignal.timeout(60000)}){
  const seeds=loadPeerSeeds(seedsFile);
  const peers=await discoverArweavePeers(seeds,{maxPeers,expand:true,signal});
  const errors=[],excluded=new Set();let started=0;
  const key=peer=>peer.host+':'+peer.port;
  const probe=peer=>async probeSignal=>{
    try{
      onProgress({stage:'location',status:'active',message:`Looking for raw L1 transaction · ${++started} attempts · ${peers.length} sources`,source:'arweave-l1'});
      const rawTx=await requestJson({host:peer.host,port:peer.port,path:'/tx/'+dataId,timeout:5000,signal:probeSignal});
      const tx=arweave.transactions.fromRaw(rawTx);
      if(tx.id!==dataId) throw new Error('l1_tx_id_mismatch');
      if(![1,2].includes(tx.format))throw new Error('unsupported_l1_format');
      if(!(await arweave.transactions.verify(tx))) throw new Error('l1_signature_invalid');
      // Legacy V1 signs inline data; an empty V2 object has no weave offset.
      const inline=tx.format===1?Buffer.from(tx.data):null;
      const declared=tx.format===1?inline.length:Number(tx.data_size);
      const meta=tx.format===1||declared===0?{size:declared,start:0,end:Math.max(0,declared-1)}:await txOffset(peer,dataId,{signal:probeSignal});
      if(!Number.isSafeInteger(declared)||declared<0) throw new Error('invalid_l1_data_size');
      if(declared!==meta.size) throw new Error('l1_offset_size_mismatch');
      if(declared>maxBytes) throw new Error('l1_payload_too_large:'+declared);
      return {peer,rawTx,tx,meta,declared,inline};
    }catch(error){
      probeSignal.throwIfAborted();excluded.add(key(peer));errors.push({peer:key(peer),error:String(error.message||error)});throw error;
    }
  };
  while(excluded.size<peers.length){
    signal?.throwIfAborted();let candidate;
    // Probe only transaction metadata concurrently. Download one payload at a
    // time, and keep alternatives available if that payload cannot be verified.
    try{candidate=await firstVerified(peers.filter(peer=>!excluded.has(key(peer))).map(probe),{signal,concurrency:4});}
    catch{signal?.throwIfAborted();break;}
    const {peer,rawTx,tx,meta,declared,inline}=candidate;excluded.add(key(peer));
    try{
      onProgress({stage:'download',status:'active',message:'Downloading data for the verified L1 transaction…',source:'arweave-l1'});
      const options={onProgress,signal,peerSeeds:seeds,chunkCache:sharedChunkCache};
      const payload=inline??await rangeFromRoot(peer,dataId,0,declared,meta,options);
      onProgress({stage:'verify',status:'active',dataId});
      if(tx.format===2){
        const computedRoot=payload.length?arweave.utils.bufferTob64Url((await generateTransactionChunks(payload)).data_root):'';
        if(computedRoot!==tx.data_root){evictRootChunks(sharedChunkCache,dataId);throw new Error('l1_data_root_mismatch');}
      }
      onProgress({stage:'verify',status:'done',dataId});
      return {
        payload,
        rawTransaction:rawTx,
        storageKind:'l1',
        peer:options.dataPeer||peer,
        rootTxId:dataId,
        payloadSize:payload.length,
        payloadSha256:sha256(payload),
        tags:decodeTags(rawTx.tags),
        l1SignatureVerified:true,
        l1DataRootVerified:tx.format===2
      };
    }catch(e){
      signal?.throwIfAborted();
      errors.push({peer:peer.host+':'+peer.port,error:String(e.message||e)});
    }
  }
  const failure=new Error('direct_l1_retrieval_failed '+JSON.stringify(errors.slice(0,12)));
  failure.peerAttempts=errors;failure.peersDiscovered=peers.length;throw failure;
}

export async function fetchDataItemDirect({dataId,location,seedsFile=process.env.ARWEAVE_PEERS||'arweave-peers.json',maxPeers=96,onProgress=()=>{},onBundleEntries,signal=AbortSignal.timeout(45000),chunkCache=sharedChunkCache}){
  location=normalizeLocation(dataId,location);
  if(location.path?.length&&location.rootOffset===undefined) throw new Error('nested_bundle_requires_absolute_item_offset');
  const seeds=loadPeerSeeds(seedsFile);
  const peers=await discoverArweavePeers(seeds,{maxPeers,expand:true,signal});
  const errors=[];
  for(const peer of peers){
    signal?.throwIfAborted();
    try{
      const absolute=location.weaveOffset!==undefined;
      const namespace=absolute?'weave:'+dataId+':'+location.weaveOffset:location.rootTxId;
      const {meta,entry,parsed:bundleTable}=absolute
        ?{meta:{start:location.weaveOffset+1,end:location.weaveOffset+location.itemSize,size:location.itemSize},entry:{relativeOffset:0,size:location.itemSize}}
        :location.rootOffset!==undefined
        ?{meta:await txOffset(peer,location.rootTxId,{signal}),entry:{relativeOffset:location.rootOffset,size:location.itemSize}}
        :await inspectRootOnPeer(peer,location.rootTxId,dataId,{signal,peerSeeds:seeds});
      if(!Number.isSafeInteger(entry.size)||entry.size>32*1024*1024)throw new Error('data_item_too_large');
      const options={onProgress,signal,peerSeeds:seeds,chunkCache};
      const raw=await rangeFromRoot(peer,namespace,entry.relativeOffset,entry.size,meta,options);
      onProgress({stage:'verify',status:'active',dataId});
      let parsed;
      try{
       parsed=parseDataItem(raw);
       const computedId=Buffer.from(idFromSignature(parsed.rawSignature)).toString('base64url');
       if(computedId!==dataId)throw new Error('data_item_id_mismatch');
       if(!(await verifyDataItem(raw)))throw new Error('data_item_signature_invalid');
      }catch(error){evictRootChunks(chunkCache,namespace);throw error;}
      onProgress({stage:'verify',status:'done',dataId});
      const payload=Buffer.from(parsed.rawData);
      const tags=deserializeTags(parsed.rawTags);
      if(bundleTable)onBundleEntries?.({entries:bundleTable.entries,rootTxId:location.rootTxId,base:0,weaveBase:meta.start-1,path:[]});
      return {
        payload,
        rawItem:raw,
        peer:options.dataPeer||peer,
        rootTxId:location.rootTxId||null,
        ...(absolute?{weaveOffset:location.weaveOffset}:{relativeItemOffset:entry.relativeOffset}),
        itemSize:entry.size,
        absoluteItemOffset:meta.start+entry.relativeOffset-1,
        payloadSize:payload.length,
        payloadSha256:sha256(payload),
        tags,
        signatureType:parsed.signatureType
      };
    }catch(e){ signal?.throwIfAborted();errors.push({peer:peer.host+':'+peer.port,error:String(e.message||e)}); }
  }
  throw new Error('direct_arweave_retrieval_failed '+JSON.stringify(errors.slice(0,12)));
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  const record=JSON.parse(fs.readFileSync(process.argv[2]||'record.json','utf8'));
  const r=await fetchDataItemDirect({dataId:record.txId,location:record.arweaveLocation});
  console.log(JSON.stringify({...r,payload:undefined},null,2));
}
