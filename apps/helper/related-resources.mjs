import fs from 'node:fs';
import {WorkBudget} from '../../src/resource-budget.mjs';
import {shareQuery} from '../../src/query-work.mjs';
import {LocationIndex,normalizeLocation} from '../../src/location-index.mjs';
import {verifyStoredContent} from '../../src/content-store.mjs';
import {saveDiscoveredLocations} from '../../src/discovery-store.mjs';
import {discoverNearbyLocations} from '../../src/nearby-discovery.mjs';

// One search per page at a time, independent of the ordinary page-fetch slots.
// Reserve quota before starting so crashes/restarts cannot reset its allowance.
export class RelatedResources{
 constructor({file,contentStore,locationsFile,discover=discoverNearbyLocations}){
  Object.assign(this,{file,contentStore,locationsFile,discover});this.jobs=new Map();this.recent=new Map();this.work=new WorkBudget({active:1,pending:4});
 }
 async find(pageId,resourceIds,{client,signal,onProgress=()=>{}}){
  if(this.recent.get(pageId)>Date.now())return;
  if(this.jobs.size>=5&&!this.jobs.has(pageId))throw new Error('related_discovery_busy');
  return shareQuery(this.jobs,pageId,shared=>this.work.run(async()=>{
   const raw=this.contentStore.get(pageId);if(!raw)throw new Error('related_page_not_stored');
   await verifyStoredContent(raw,pageId);shared.throwIfAborted();
   const index=new LocationIndex(this.locationsFile);let anchor=index.get(pageId);
   if(anchor?.weaveOffset===undefined){
    const candidates=await client.locateCandidates(pageId,{signal:AbortSignal.any([shared,AbortSignal.timeout(6000)])});
    anchor=null;
    for(const candidate of candidates.slice(0,4)){try{if(candidate.record?.dataId===pageId){const value=normalizeLocation(pageId,candidate.record);if(value.weaveOffset!==undefined){anchor=value;break;}}}catch{}}
   }
   if(!anchor)throw new Error('related_page_location_unavailable');
   const day=new Date().toISOString().slice(0,10);let quota={day,reserved:0};
   try{const saved=JSON.parse(fs.readFileSync(this.file));if(saved.day===day&&Number.isSafeInteger(saved.reserved)&&saved.reserved>=0)quota=saved;}catch(error){if(error.code!=='ENOENT')throw new Error('related_discovery_quota_unreadable');}
   const maxBytes=Math.min(96*1024*1024,256*1024*1024-quota.reserved);
   if(maxBytes<8*1024*1024)throw new Error('related_discovery_daily_budget');
   quota.reserved+=maxBytes;fs.writeFileSync(this.file+'.tmp',JSON.stringify(quota),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
   try{
    return await this.discover(anchor,[...new Set(resourceIds)].slice(0,32),{signal:shared,maxBytes,onFound:hint=>saveDiscoveredLocations(this.locationsFile,[[hint.dataId,hint]]),onStep:state=>onProgress({checked:state.blocks.length,found:state.matches.length,networkBytes:state.networkBytes})});
   }finally{if(!shared.aborted){this.recent.set(pageId,Date.now()+3600000);if(this.recent.size>128)this.recent.delete(this.recent.keys().next().value);}}
  },{signal:shared}),{signal});
 }
}
