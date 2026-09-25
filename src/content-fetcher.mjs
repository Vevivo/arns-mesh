import {encodeL1Content} from './l1-content.mjs';
import {verifyStoredContent} from './content-store.mjs';
import {fetchDataItemDirect,fetchL1Direct,locateDataItem} from './arweave-direct.mjs';
import {LocationIndex,normalizeLocation} from './location-index.mjs';
import {saveDiscoveredLocations} from './discovery-store.mjs';
import {getHistoricalIndex} from './cdb64-index.mjs';
import {firstVerified} from './query-work.mjs';
import {withTransferBudget} from './resource-budget.mjs';
import {manifestTargetIds} from './manifest-path.mjs';
import {replicateLocationHint} from './location-replication.mjs';
export {firstVerified} from './query-work.mjs';

function sourceError(error,depth=0){
 const detail={error:String(error?.message||error).slice(0,500)};
 if(error?.observations)detail.peerResponses=error.observations.slice(-8);
 if(error?.peerAttempts)detail.rawPeers={discovered:error.peersDiscovered,attempts:error.peerAttempts.length,notFound:error.peerAttempts.filter(x=>x.error.startsWith('HTTP 404 ')).length,sample:error.peerAttempts.slice(0,4)};
 if(depth<2&&Array.isArray(error?.errors))detail.causes=error.errors.slice(0,8).map(e=>sourceError(e,depth+1));
 return detail;
}

export async function fetchMeshContent(dataId,{client,contentStore,onProgress=()=>{},locationsFile=process.env.ARNS_LOCATIONS||'locations.json',signal=AbortSignal.timeout(45000),replicateLocation=false,meshHeadStartMs=Math.max(0,Math.min(10000,Number(process.env.ARNS_MESH_HEAD_START_MS)||0))}={}){
 if(!/^[A-Za-z0-9_-]{43}$/.test(dataId))throw new Error('invalid_data_id');
 const cached=contentStore?.get(dataId);
 if(cached){try{const direct=await verifyStoredContent(cached,dataId);onProgress({stage:'verify',status:'done',dataId,source:'Local copy'});const locationReplication=replicateLocation?await replicateLocationHint(dataId,{client,contentStore,locationsFile,signal}):undefined;return {loc:null,direct:{...direct,peer:{host:'local-cache',port:0},rootTxId:direct.rootTxId||null},storageKind:direct.storageKind,...(locationReplication?{locationReplication}:{})};}catch{}}
 const attempts=[],index=new LocationIndex(locationsFile),historical=getHistoricalIndex(),hint=index.get(dataId);
 // Give the broader published index a short first opportunity. Launching 72
 // L1 probes and three older index lookups for every bundled asset caused
 // thousands of unnecessary requests during the real manifest test.
 let releasePreferred;
 let preferredPending=Number(Boolean(hint))+Number(Boolean(historical?.findOffsets));
 const preferredFailure=()=>{if(--preferredPending<=0)releasePreferred();};
 const preferredFailed=new Promise(resolve=>{releasePreferred=resolve;});
 const waitForPreferred=s=>preferredPending<=0?Promise.resolve():new Promise((resolve,reject)=>{
  let finished=false;
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);s.removeEventListener('abort',cancel);error?reject(error):resolve();};
  const cancel=()=>finish(s.reason||new Error('query_cancelled'));
  const timer=setTimeout(()=>finish(),8000);
  s.addEventListener('abort',cancel,{once:true});preferredFailed.then(()=>finish());if(s.aborted)cancel();
 });
 let active=true;
 const progress=e=>{if(active)onProgress(e);};
 // A reader first asks existing peers for verified bytes. Avoid probing the raw
 // network and sparse historical indexes for every already replicated asset.
 // Failure releases alternatives immediately; a slow peer has a bounded head start.
 let releaseMesh;const meshFinished=new Promise(resolve=>{releaseMesh=resolve;});
 const waitForMesh=s=>!meshHeadStartMs?Promise.resolve():new Promise((resolve,reject)=>{
  let finished=false;
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);s.removeEventListener('abort',cancel);error?reject(error):resolve();};
  const cancel=()=>finish(s.reason||new Error('query_cancelled'));
  const timer=setTimeout(()=>finish(),meshHeadStartMs);
  s.addEventListener('abort',cancel,{once:true});meshFinished.then(()=>finish());if(s.aborted)cancel();
 });
 const attempt=(source,run)=>async s=>{try{if(source!=='mesh-content')await waitForMesh(s);s.throwIfAborted();return await run(s);}catch(error){if(source==='mesh-content')releaseMesh();attempts.push({source,...sourceError(error)});throw error;}};
 const retrieve=async(hint,transport,s)=>{
  let record=normalizeLocation(dataId,hint);
  // Bundle headers are routing hints, not content proofs. Retain only the
  // innermost table; after the requested manifest verifies, keep locations
  // for its referenced children, never every unrelated item in the bundle.
  let table=null;
  const onBundleEntries=value=>{table=value;};
  const direct=await withTransferBudget(async()=>{
   if(record.path?.length&&record.rootOffset===undefined){
    const resolved=await locateDataItem(dataId,record,{signal:s,onBundleEntries});
    record={...resolved,...(record.preparation?{preparation:record.preparation}:{})};
   }
   progress({stage:'location',status:'done',dataId,source:transport,...(record.preparation?{indexPreparation:record.preparation}:{})});
   return fetchDataItemDirect({dataId,location:record,onProgress:progress,onBundleEntries,signal:s});
  },s);
  if(record.weaveOffset===undefined&&Number.isSafeInteger(direct.relativeItemOffset))record={...record,rootOffset:direct.relativeItemOffset,itemSize:direct.itemSize};
  // Keep the proven byte position: the peer holding transaction metadata can
  // disappear while other raw peers still hold the requested chunks.
  if(Number.isSafeInteger(direct.absoluteItemOffset)&&direct.absoluteItemOffset>=0)record=normalizeLocation(dataId,{weaveOffset:direct.absoluteItemOffset,itemSize:direct.itemSize,...(record.preparation?{preparation:record.preparation}:{})});
  // Only cache a location after it actually led to the matching signed bytes.
  try{saveDiscoveredLocations(locationsFile,[[dataId,record]]);}catch{}
  if(table&&direct.tags?.some(t=>t.name.toLowerCase()==='content-type'&&t.value.includes('application/x.arweave-manifest'))){
   try{
    const children=new Set(manifestTargetIds(JSON.parse(direct.payload))),hints=[];
    for(const row of table.entries)if(children.has(row.id)&&row.size<=32*1024*1024){
     const offset=table.weaveBase+row.relativeOffset;
     const position=Number.isSafeInteger(offset)&&offset>=0?{weaveOffset:offset,itemSize:row.size}:{rootTxId:table.rootTxId,rootOffset:table.base+row.relativeOffset,itemSize:row.size,path:table.path};
     hints.push([row.id,normalizeLocation(row.id,{...position,...(record.preparation?{preparation:record.preparation}:{})})]);
    }
    if(hints.length)saveDiscoveredLocations(locationsFile,hints);
   }catch{/* A hint/cache failure cannot authorize bytes or invalidate a verified parent. */}
  }
  return {loc:{record,transport},direct,storageKind:'ans104'};
 };
 const tasks=[
  attempt('mesh-content',async s=>{const direct=await withTransferBudget(()=>client.content(dataId,{onProgress:progress,signal:s}),s);return {loc:null,direct,storageKind:direct.storageKind||'ans104'};}),
  attempt('mesh-index',async s=>{
   const candidates=await client.locateCandidates(dataId,{signal:s});
   return firstVerified(candidates.map(loc=>inner=>retrieve(loc.record,'mesh-index',inner)),{signal:s});
  })
 ];
 if(hint)tasks.push(attempt('local-index',async s=>{try{return await retrieve(hint,'local-index',s);}catch(error){preferredFailure();throw error;}}));
 if(historical?.findOffsets)tasks.push(attempt('published-offset-index',async s=>{
  try{
  const hints=await historical.findOffsets(dataId,{onProgress:progress,signal:s});
  if(!hints.length)throw new Error('not_in_published_offset_index');
  return await firstVerified(hints.map(hint=>inner=>retrieve(hint,'published-offset-index',inner)),{signal:s,concurrency:2});
  }catch(error){preferredFailure();throw error;}
 }));
 if(historical)tasks.push(attempt('historical-index',async s=>{await waitForPreferred(s);const found=await historical.find(dataId,{onProgress:progress,signal:s});if(!found)throw new Error('not_in_published_index');return retrieve(found,'historical-index',s);}));
 tasks.push(attempt('arweave-l1',async s=>{await waitForPreferred(s);return {loc:null,direct:await withTransferBudget(()=>fetchL1Direct({dataId,maxBytes:32*1024*1024,onProgress:progress,signal:s}),s),storageKind:'l1'};}));
 onProgress({stage:'location',status:'active',message:'Looking for content through peers and raw Arweave in parallel…'});
 try{
  const result=await firstVerified(tasks,{signal});
  try{
   if(result.storageKind==='l1'&&!result.direct.storedBytes)result.direct.storedBytes=encodeL1Content(result.direct.rawTransaction,result.direct.payload);
   const bytes=result.direct.storedBytes||result.direct.rawItem;
   if(bytes&&contentStore)await contentStore.put(dataId,bytes);
  }catch(error){result.cacheError=String(error.message||error);}
  // Supporters retain this small hint within the caller's time/byte budget.
  // Reader navigation and saved/offline opening perform no extra request.
  if(replicateLocation&&!result.cacheError)result.locationReplication=await replicateLocationHint(dataId,{client,contentStore,locationsFile,signal});
  return result;
 }catch(error){
  signal?.throwIfAborted();
  const failure=new Error('content_location_unavailable: '+JSON.stringify({dataId,attempts}));
  failure.diagnostics={stage:'content-location',requestedDataId:dataId,locationAttempts:attempts};throw failure;
 }finally{active=false;}
}
