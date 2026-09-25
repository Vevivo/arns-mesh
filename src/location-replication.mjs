import {LocationIndex,normalizeLocation} from './location-index.mjs';
import {saveDiscoveredLocations} from './discovery-store.mjs';
import {verifyStoredContent} from './content-store.mjs';
import {firstVerified} from './query-work.mjs';

// Copy routing knowledge as well as bytes. A signed peer response authenticates
// its speaker, not its claimed byte offset: every later download still verifies
// the requested ID and item signature. External preparation provenance survives.
export async function replicateLocationHint(dataId,{client,contentStore,locationsFile,signal,timeoutMs=2000}={}){
 if(!locationsFile||!client?.locateCandidates||!contentStore)return {status:'unavailable'};
 const index=new LocationIndex(locationsFile);
 if(index.get(dataId))return {status:'existing'};
 const bytes=contentStore.get(dataId);
 if(!bytes)return {status:'content-not-stored'};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new Error('location_replication_timeout')),Math.max(1,Math.min(5000,timeoutMs)));
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 try{
  await verifyStoredContent(bytes,dataId);
  return await firstVerified([async s=>{
   const candidates=await client.locateCandidates(dataId,{signal:s});
   s.throwIfAborted();
   // Another fetch may have learned a proven position while this query ran.
   if(index.get(dataId))return {status:'existing'};
   for(const candidate of candidates.slice(0,4)){
    let hint;
    try{
     if(candidate.record?.dataId!==dataId)continue;
     hint=normalizeLocation(dataId,candidate.record);
    }catch{continue;}
    saveDiscoveredLocations(locationsFile,[[dataId,hint]]);
    return {status:'replicated',positionVerified:false};
   }
   return {status:'missing'};
  }],{signal:combined});
 }catch{return {status:combined.aborted?'cancelled':'unavailable'};}
 finally{clearTimeout(timer);}
}
