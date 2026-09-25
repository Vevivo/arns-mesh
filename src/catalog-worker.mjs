import fs from 'node:fs';
import path from 'node:path';
import {TargetCatalog} from './target-catalog.mjs';
import {fetchMeshContent} from './content-fetcher.mjs';
import {withByteBudget} from './byte-budget.mjs';
import {manifestTargetIds} from './manifest-path.mjs';
import {createSwarmMeshClient} from './swarm-client.mjs';
import {discoverArweaveReferences} from './arweave-references.mjs';

export function catalogDailyBudget(env=process.env){
 const mib=env.ARNS_CATALOG_DAILY_MIB===undefined?64:Number(env.ARNS_CATALOG_DAILY_MIB);
 if(!Number.isSafeInteger(mib)||mib<8||mib>1024)throw new Error('invalid_catalog_daily_mib');
 return mib*1024*1024;
}

// Demand is observed from ArNS/ANT records and signed manifests/text, never from a
// curated list. Discovery failures must not starve work already in the queue.
export class CatalogWorker {
 constructor({dataDir,peer,endpoint,client,dailyBytes=catalogDailyBudget(),intervalMs=60000,mintsPerPass=16,bulkScan=false,
  passTimeoutMs=45000,catalogTimeoutMs=15000,fetchContent=fetchMeshContent,maxJobs=32768}){
  if(!Number.isSafeInteger(dailyBytes)||dailyBytes<1||!Number.isSafeInteger(passTimeoutMs)||passTimeoutMs<2||!Number.isSafeInteger(catalogTimeoutMs)||catalogTimeoutMs<1)throw new Error('invalid_catalog_budget');
  if(!Number.isSafeInteger(maxJobs)||maxJobs<4||maxJobs>32768)throw new Error('invalid_catalog_queue_budget');
  this.maxJobs=maxJobs;this.rootSlots=Math.floor(maxJobs*0.75);this.maxWorkBytes=16*1024*1024;
  this.peer=peer;this.dailyBytes=dailyBytes;this.intervalMs=intervalMs;this.timer=null;this.stopped=true;this.running=null;
  this.passTimeoutMs=passTimeoutMs;this.catalogTimeoutMs=Math.min(catalogTimeoutMs,Math.floor(passTimeoutMs/2));this.fetchContent=fetchContent;
  this.mintsPerPass=Math.max(1,Math.min(32,mintsPerPass));this.bulkScan=bulkScan;
  this.client=client??createSwarmMeshClient({excludeWitnesses:[peer.witnessPeerId].filter(Boolean)});
  this.catalog=new TargetCatalog({file:path.join(dataDir,'target-catalog.json'),endpoint});
  this.file=path.join(dataDir,'catalog-work.json');this.state={day:'',bytes:0,jobs:[],seen:{},completed:0,failed:0,lastError:null};
  try{if(fs.statSync(this.file).size<=this.maxWorkBytes)this.state=JSON.parse(fs.readFileSync(this.file));}catch{}
  this.queuedIds=new Set(this.state.jobs.map(j=>j.id));
 }
 save(){const encoded=JSON.stringify(this.state);if(Buffer.byteLength(encoded)>this.maxWorkBytes)throw new Error('catalog_work_disk_budget');fs.writeFileSync(this.file+'.tmp',encoded,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 enqueue(id){if(!/^[A-Za-z0-9_-]{43}$/.test(id)||this.queuedIds.has(id)||this.state.jobs.length>=this.maxJobs)return false;if((this.state.seen[id]||0)>Date.now())return false;this.state.jobs.push({id,attempt:0,after:0});this.queuedIds.add(id);return true;}
 enqueueRoots(){
  const ids=[...new Set(Object.values(this.catalog.state.targets).map(row=>row.dataId))].sort();
  let cursor=(this.state.rootCursor||0)%Math.max(1,ids.length),visited=0;
  // Leave room for assets; continue from the last root after restarts instead
  // of continually refilling the queue with the first names in the catalog.
  while(visited<ids.length&&this.state.jobs.length<this.rootSlots){this.enqueue(ids[cursor]);cursor=(cursor+1)%ids.length;visited++;}
  this.state.rootCursor=cursor;
  this.state.deferredRoots=ids.filter(id=>!this.queuedIds.has(id)&&(this.state.seen[id]||0)<=Date.now()).length;
 }
 async pass(){
  if(this.running)return this.running;
  this.running=this._pass().finally(()=>this.running=null);return this.running;
 }
 async _pass(){
  const day=new Date().toISOString().slice(0,10);if(this.state.day!==day){this.state.day=day;this.state.bytes=0;}
  const left=this.dailyBytes-this.state.bytes;if(left<=0)return this.status();
  const passBudget=Math.min(left,8*1024*1024);let used=0;
  const controller=this.controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new Error('catalog_pass_timeout')),this.passTimeoutMs);
  const catalogController=new AbortController();
  const abortCatalog=()=>catalogController.abort(controller.signal.reason);
  controller.signal.addEventListener('abort',abortCatalog,{once:true});
  const catalogTimer=setTimeout(()=>catalogController.abort(new Error('catalog_refresh_timeout')),this.catalogTimeoutMs);
  // Each phase has a separate byte scope; aggregate both, including bytes from
  // failed responses. Reserve at least one quarter for queued content work.
  const phase=async(budget,control,work)=>{
   try{const r=await withByteBudget(budget,control,work);used+=r.bytes;this.state.bytes+=r.bytes;return r.value;}
   catch(error){const bytes=error.receivedBytes||0;used+=bytes;this.state.bytes+=bytes;throw error;}
  };
  try{
   try{
    await phase(Math.max(1,Math.floor(passBudget*0.75)),catalogController,async()=>{
     if(this.bulkScan&&Date.now()-(this.catalog.state.targetScanAt||0)>6*3600000&&Date.now()-(this.state.bulkAttemptAt||0)>6*3600000){
      this.state.bulkAttemptAt=Date.now();
      try{await this.catalog.refreshTargets({signal:catalogController.signal});this.state.bulkError=null;}
      catch(error){this.state.bulkError=String(error.message).slice(0,240);catalogController.signal.throwIfAborted();await this.catalog.step({mints:this.mintsPerPass,signal:catalogController.signal});}
     }else await this.catalog.step({mints:this.mintsPerPass,signal:catalogController.signal});
    });this.state.catalogError=null;
   }catch(error){this.state.catalogError=String(error.message).slice(0,400);this.state.catalogFailures=(this.state.catalogFailures||0)+1;}
   finally{clearTimeout(catalogTimer);controller.signal.removeEventListener('abort',abortCatalog);}
   // Even a partial catalog refresh can have produced usable observations.
   this.enqueueRoots();
   const job=this.state.jobs.find(j=>j.after<=Date.now());
   if(!job)return this.status();
   if(controller.signal.aborted){this.state.lastError=String(controller.signal.reason?.message||'catalog_stopped');return this.status();}
   if(used>=passBudget){this.state.lastError='catalog_network_budget';return this.status();}
   // Keep the in-flight job on disk. A crash between fetching and committing
   // must not silently drop an item, nor mark an unverified object completed.
   this.save();
   try{
    const result=await phase(passBudget-used,controller,()=>this.fetchContent(job.id,{client:this.client,contentStore:this.peer.contentStore,locationsFile:this.peer.locationIndex.file,signal:controller.signal,replicateLocation:true}));
    if(result.cacheError)throw new Error('catalog_cache_failed: '+result.cacheError);
    const stored=Boolean((result.direct.storedBytes||result.direct.rawItem)&&this.peer.contentStore.get(job.id));
    if(!stored)throw new Error('catalog_content_not_stored');
    const source=result.direct.transport||result.loc?.transport||(result.direct.peer?.host==='local-cache'?'local-cache':'raw-arweave');
    if(!job.fetchedAt&&['p2p-content','mesh-index'].includes(source))this.state.meshReplicated=(this.state.meshReplicated||0)+1;
    if(result.locationReplication?.status==='replicated')this.state.locationsReplicated=(this.state.locationsReplicated||0)+1;
    this.state.lastSuccess={dataId:job.id,source,stored,locationReplication:result.locationReplication?.status||null,storageKind:result.storageKind||result.direct.storageKind||'ans104',at:new Date().toISOString()};
    if(!job.fetchedAt){job.fetchedAt=Date.now();this.state.completed++;}
    this.state.lastError=null;let graphPending=false;
    const references=discoverArweaveReferences(result.direct);
    const isManifest=result.direct.tags?.some(t=>t.name.toLowerCase()==='content-type'&&t.value.toLowerCase().includes('application/x.arweave-manifest'));
    if(isManifest||references.scanned){
     try{
      let ids=references.ids;
      if(isManifest){const manifest=JSON.parse(result.direct.payload.toString());if(manifest.manifest!=='arweave/paths'||!manifest.paths)throw new Error('invalid_manifest');ids=manifestTargetIds(manifest);}
      let cursor=job.graphCursor||0;
      while(cursor<ids.length){
       const id=ids[cursor];
       if(!this.queuedIds.has(id)&&(this.state.seen[id]||0)<=Date.now()&&!this.enqueue(id))break;
       cursor++;
      }
      job.graphCursor=cursor;graphPending=cursor<ids.length;this.state.lastGraphError=references.truncated?'static_arweave_reference_scan_limit':null;
     }catch(error){this.state.lastGraphError=String(error.message).slice(0,240);}
    }
    job.graphPending=graphPending;
    this.state.jobs.splice(this.state.jobs.indexOf(job),1);
    if(graphPending){
     // The immutable verified content supplies the remaining IDs next time.
     // Persist its cursor, rotate it behind existing work, and refetch if the
     // bounded content cache has evicted it. Never drop the tail of a graph.
     job.after=0;this.state.jobs.push(job);
    }else{this.queuedIds.delete(job.id);this.state.seen[job.id]=Date.now()+6*3600000;}
   }catch(error){
    this.state.failed++;this.state.lastError=String(error.message).slice(0,400);
    job.attempt++;job.after=Date.now()+Math.min(24*3600000,60000*2**Math.min(job.attempt,10));
   }
  }finally{
   clearTimeout(timer);clearTimeout(catalogTimer);controller.signal.removeEventListener('abort',abortCatalog);
   for(const [id,until] of Object.entries(this.state.seen))if(until<=Date.now())delete this.state.seen[id];
   const keys=Object.keys(this.state.seen);for(const id of keys.slice(0,Math.max(0,keys.length-50000)))delete this.state.seen[id];
   this.save();
  }
  return this.status();
 }
 status(){return {catalog:this.catalog.status(),queued:this.state.jobs.length,maxQueued:this.maxJobs,deferredRoots:this.state.deferredRoots||0,pendingGraphs:this.state.jobs.filter(j=>j.graphPending).length,completed:this.state.completed,meshReplicated:this.state.meshReplicated||0,locationsReplicated:this.state.locationsReplicated||0,lastSuccess:this.state.lastSuccess||null,failed:this.state.failed,dayResponseBytes:this.state.bytes,maxDailyResponseBytes:this.dailyBytes,byteScope:'HTTP response bodies and Mesh response streams; excludes UDP discovery/control overhead',lastError:this.state.lastError,catalogError:this.state.catalogError||null,catalogFailures:this.state.catalogFailures||0,lastGraphError:this.state.lastGraphError||null,generalCoverage:false};}
 start(){if(!this.stopped)return;this.stopped=false;const loop=async()=>{if(this.stopped)return;await this.pass().catch(e=>{this.state.lastError=e.message;});if(!this.stopped){this.timer=setTimeout(loop,this.intervalMs);this.timer.unref?.();}};void loop();}
 stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort(new Error('catalog_stopped'));}
}
