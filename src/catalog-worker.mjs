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
 if(!Number.isSafeInteger(mib)||mib<8||mib>65536)throw new Error('invalid_catalog_daily_mib');
 return mib*1024*1024;
}

export function nameDailyBudget(env=process.env){
 const mib=Number(env.ARNS_NAMES_DAILY_MIB??64);
 if(!Number.isSafeInteger(mib)||mib<8||mib>65536)throw new Error('invalid_names_daily_mib');
 return mib*1024*1024;
}

// Demand is observed from ArNS/ANT records and signed manifests/text, never from a
// curated list. Discovery failures must not starve work already in the queue.
export class CatalogWorker {
 constructor({dataDir,peer,endpoint,client,dailyBytes=catalogDailyBudget(),nameDailyBytes=nameDailyBudget(),intervalMs=60000,mintsPerPass=16,bulkScan=false,independentNames=false,namesIntervalMs=5000,registryIntervalMs=15*60000,bulkIntervalMs=6*3600000,
  passTimeoutMs=60000,catalogTimeoutMs=30000,maxPassBytes=8*1024*1024,fetchContent=fetchMeshContent,maxJobs=32768,snapshotStore=null,jobsPerPass=1,pinner=null,maxPreparedSites=32}){
  if(!Number.isSafeInteger(dailyBytes)||dailyBytes<1||!Number.isSafeInteger(passTimeoutMs)||passTimeoutMs<2||!Number.isSafeInteger(catalogTimeoutMs)||catalogTimeoutMs<1)throw new Error('invalid_catalog_budget');
  if(!Number.isSafeInteger(maxJobs)||maxJobs<4||maxJobs>32768)throw new Error('invalid_catalog_queue_budget');
  if(!Number.isSafeInteger(jobsPerPass)||jobsPerPass<1||jobsPerPass>16||!Number.isSafeInteger(maxPreparedSites)||maxPreparedSites<0||maxPreparedSites>20000)throw new Error('invalid_preparation_budget');
  if(!Number.isSafeInteger(namesIntervalMs)||namesIntervalMs<1||!Number.isSafeInteger(bulkIntervalMs)||bulkIntervalMs<1)throw new Error('invalid_names_interval');
  this.independentNames=independentNames;this.namesIntervalMs=namesIntervalMs;this.bulkIntervalMs=bulkIntervalMs;this.namesRunning=null;this.namesTimer=null;
  if(!Number.isSafeInteger(maxPassBytes)||maxPassBytes<1||maxPassBytes>128*1024*1024)throw new Error('invalid_catalog_pass_budget');this.maxPassBytes=maxPassBytes;
  this.jobsPerPass=jobsPerPass;this.pinner=pinner;this.maxPreparedSites=maxPreparedSites;this.snapshotStore=snapshotStore;
  this.maxJobs=maxJobs;this.rootSlots=Math.floor(maxJobs*0.75);this.maxWorkBytes=16*1024*1024;
  if(!Number.isSafeInteger(nameDailyBytes)||nameDailyBytes<1)throw new Error('invalid_names_budget');
  this.nameDailyBytes=nameDailyBytes;
  this.peer=peer;this.dailyBytes=dailyBytes;this.intervalMs=intervalMs;this.timer=null;this.stopped=true;this.running=null;
  this.passTimeoutMs=passTimeoutMs;this.catalogTimeoutMs=independentNames?Math.max(120000,catalogTimeoutMs):Math.min(catalogTimeoutMs,Math.floor(passTimeoutMs/2));this.fetchContent=fetchContent;
  this.mintsPerPass=Math.max(1,Math.min(32,mintsPerPass));this.bulkScan=bulkScan;
  this.client=client??createSwarmMeshClient({excludeWitnesses:[peer.witnessPeerId].filter(Boolean)});
  this.catalog=new TargetCatalog({file:path.join(dataDir,'target-catalog.json'),endpoint,snapshotStore,registryIntervalMs,hasContent:id=>Boolean(peer.contentStore.has?.(id))});
  this.file=path.join(dataDir,'catalog-work.json');this.state={day:'',bytes:0,jobs:[],seen:{},completed:0,failed:0,lastError:null};
  try{if(fs.statSync(this.file).size<=this.maxWorkBytes)this.state=JSON.parse(fs.readFileSync(this.file));}catch{}
  this.state.priorityJobs??=[];
  this.queuedIds=new Set([...this.state.jobs,...this.state.priorityJobs].map(j=>j.id));
 }
 save(){const encoded=JSON.stringify(this.state);if(Buffer.byteLength(encoded)>this.maxWorkBytes)throw new Error('catalog_work_disk_budget');fs.writeFileSync(this.file+'.tmp',encoded,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 enqueue(id){if(!/^[A-Za-z0-9_-]{43}$/.test(id)||this.queuedIds.has(id)||this.state.jobs.length>=this.maxJobs)return false;if((this.state.seen[id]||0)>Date.now())return false;this.state.jobs.push({id,attempt:0,after:0});this.queuedIds.add(id);return true;}
 enqueueDemand(id){
  if(!/^[A-Za-z0-9_-]{43}$/.test(id)||this.peer.contentStore.has?.(id))return false;
  const priority=this.state.priorityJobs.find(j=>j.id===id);
  if(priority?.demand||this.state.priorityJobs.filter(j=>j.demand).length>=64)return false;
  if(priority){priority.demand=true;this.save();return true;}
  if(this.state.priorityJobs.length>=256)return false;
  const existing=this.state.jobs.find(j=>j.id===id);
  if(existing&&existing===this.activeJob)return false;
  if(existing)this.state.jobs.splice(this.state.jobs.indexOf(existing),1);
  // Repeated requests preserve failure backoff instead of forcing new scans.
  this.state.priorityJobs.push({...existing,id,attempt:existing?.attempt||0,after:existing?.after||0,demand:true});
  this.queuedIds.add(id);this.save();return true;
 }
 prioritizeRoots(){
  const ids=[...new Set(Object.values(this.catalog.state.targets).map(row=>row.dataId))].sort();
  let cursor=(this.state.priorityCursor||0)%Math.max(1,ids.length),visited=0;
  // Leave 64 slots for live demand even when the asset queue is full.
  while(visited<ids.length&&this.state.priorityJobs.filter(j=>!j.demand).length<192){
   const id=ids[cursor];cursor=(cursor+1)%ids.length;visited++;
   if(this.state.priorityJobs.some(j=>j.id===id)||(this.state.seen[id]||0)>Date.now())continue;
   const existing=this.state.jobs.find(j=>j.id===id);
   if(existing)this.state.jobs.splice(this.state.jobs.indexOf(existing),1);
   this.state.priorityJobs.push(existing||{id,attempt:0,after:0});this.queuedIds.add(id);
  }
  this.state.priorityCursor=cursor;
 }
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
 async refreshNames(parentSignal){
  if(this.namesRunning)return this.namesRunning;
  this.namesRunning=this._refreshNames(parentSignal).finally(()=>this.namesRunning=null);return this.namesRunning;
 }
 async _refreshNames(parentSignal){
  const day=new Date().toISOString().slice(0,10);
  if(this.state.nameDay!==day){this.state.nameDay=day;this.state.nameBytes=0;}
  const left=Math.max(0,this.nameDailyBytes-(this.state.nameBytes||0));
  const controller=this.namesController=new AbortController();
  const abort=()=>controller.abort(parentSignal.reason);
  parentSignal?.addEventListener('abort',abort,{once:true});if(parentSignal?.aborted)abort();
  const timer=setTimeout(()=>controller.abort(new Error('catalog_refresh_timeout')),this.catalogTimeoutMs);
  const previous=new Map(Object.entries(this.catalog.state.targets).map(([name,r])=>[name,r.dataId]));
  try{
   if(!left)throw new Error('name_daily_budget_reached');
   const result=await withByteBudget(Math.min(left,(this.bulkScan?32:16)*1024*1024),controller,async()=>{
    if(this.bulkScan&&Date.now()-(this.catalog.state.targetScanAt||0)>this.bulkIntervalMs&&Date.now()-(this.state.bulkAttemptAt||0)>this.bulkIntervalMs){
     this.state.bulkAttemptAt=Date.now();
     try{await this.catalog.refreshTargets({signal:controller.signal});this.state.bulkError=null;}
     catch(error){this.state.bulkError=String(error.message).slice(0,240);controller.signal.throwIfAborted();}
    }
    await this.catalog.step({mints:this.mintsPerPass,signal:controller.signal});
   });
   this.state.nameBytes+=result.bytes;this.state.catalogError=null;
  }catch(error){this.state.nameBytes+=(error.receivedBytes||0);this.state.catalogError=String(error.message).slice(0,400);this.state.catalogFailures=(this.state.catalogFailures||0)+1;}
  finally{
   clearTimeout(timer);parentSignal?.removeEventListener('abort',abort);
   this.state.namesPassAt=new Date().toISOString();
   // Newly discovered targets get a separate bounded priority lane, including
   // while an unrelated download is blocked. Existing retry backoff is kept.
   for(const [name,row] of Object.entries(this.catalog.state.targets)){
    if(previous.get(name)===row.dataId||this.peer.contentStore.has?.(row.dataId)||this.state.priorityJobs.filter(j=>!j.demand).length>=192)continue;
    if(this.state.priorityJobs.some(j=>j.id===row.dataId))continue;
    const job=this.state.jobs.find(j=>j.id===row.dataId);if(job===this.activeJob&&job)continue;
    if(job)this.state.jobs.splice(this.state.jobs.indexOf(job),1);
    this.state.priorityJobs.push(job||{id:row.dataId,attempt:0,after:0});this.queuedIds.add(row.dataId);
   }
   this.save();
  }
  return this.status();
 }
 async _pass(){
  const day=new Date().toISOString().slice(0,10);if(this.state.day!==day){this.state.day=day;this.state.bytes=0;}
  if(this.state.nameDay!==day){this.state.nameDay=day;this.state.nameBytes=0;}
  const left=Math.max(0,this.dailyBytes-this.state.bytes),nameLeft=Math.max(0,this.nameDailyBytes-(this.state.nameBytes||0));
  this.state.lastPassAt=new Date().toISOString();
  if(!left&&!nameLeft){this.state.lastError='content_daily_budget_reached';this.state.catalogError='name_daily_budget_reached';this.save();return this.status();}
  const passBudget=Math.min(left,this.maxPassBytes);let used=0;
  const controller=this.controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new Error('catalog_pass_timeout')),this.passTimeoutMs);
  // Independent daily quotas include failed responses. Exhausting downloads
  // must not stop registry observations.
  const phase=async(budget,control,work,names=false)=>{
   const charge=bytes=>{if(names)this.state.nameBytes=(this.state.nameBytes||0)+bytes;else{used+=bytes;this.state.bytes+=bytes;}};
   try{const r=await withByteBudget(budget,control,work);charge(r.bytes);return r.value;}
   catch(error){charge(error.receivedBytes||0);throw error;}
  };
  try{
   if(!this.independentNames)await this.refreshNames(controller.signal);
   // Even a partial catalog refresh can have produced usable observations.
   if(this.maxJobs>=256)this.prioritizeRoots();
   this.enqueueRoots();
   if(!left){this.state.lastError='content_daily_budget_reached';return this.status();}
   if(this.pinner&&used<passBudget&&!controller.signal.aborted){
    const preparationController=new AbortController(),preparationSignal=AbortSignal.any([controller.signal,preparationController.signal]);
    const preparationTimer=setTimeout(()=>preparationController.abort(new Error('site_preparation_timeout')),Math.max(1,Math.floor(this.passTimeoutMs/3)));
    try{await phase(Math.max(1,Math.floor((passBudget-used)/2)),preparationController,()=>this.prepareOne(preparationSignal));}
    catch(error){this.state.preparationError=String(error.message).slice(0,240);}
    finally{clearTimeout(preparationTimer);}
   }
   for(let count=0;count<this.jobsPerPass;count++){
   const priorityFirst=(this.state.workTurn||0)%2===0;
   const ready=q=>q===this.state.priorityJobs?q.find(j=>j.demand&&j.after<=Date.now())||q.find(j=>j.after<=Date.now()):q.find(j=>j.after<=Date.now());
   let queue=priorityFirst?this.state.priorityJobs:this.state.jobs,job=ready(queue);
   if(!job){queue=priorityFirst?this.state.jobs:this.state.priorityJobs;job=ready(queue);}
   if(!job)return this.status();
   this.state.workTurn=(this.state.workTurn||0)+1;
   if(controller.signal.aborted){this.state.lastError=String(controller.signal.reason?.message||'catalog_stopped');return this.status();}
   if(used>=passBudget){this.state.lastError='catalog_network_budget';return this.status();}
   // Keep the in-flight job on disk. A crash between fetching and committing
   // must not silently drop an item, nor mark an unverified object completed.
   this.activeJob=job;this.save();
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
    queue.splice(queue.indexOf(job),1);
    if(graphPending){
     // The immutable verified content supplies the remaining IDs next time.
     // Persist its cursor, rotate it behind existing work, and refetch if the
     // bounded content cache has evicted it. Never drop the tail of a graph.
     job.after=0;queue.push(job);
    }else{this.queuedIds.delete(job.id);this.state.seen[job.id]=Date.now()+6*3600000;}
   }catch(error){
    this.state.failed++;this.state.lastError=String(error.message).slice(0,400);
    job.attempt++;job.after=Date.now()+Math.min(24*3600000,60000*2**Math.min(job.attempt,10));
    queue.splice(queue.indexOf(job),1);queue.push(job);
   }finally{this.activeJob=null;}
   }
  }finally{
   clearTimeout(timer);
   for(const [id,until] of Object.entries(this.state.seen))if(until<=Date.now())delete this.state.seen[id];
   const keys=Object.keys(this.state.seen);for(const id of keys.slice(0,Math.max(0,keys.length-50000)))delete this.state.seen[id];
   this.save();
  }
  return this.status();
 }
 async prepareOne(signal){
  const names=this.snapshotStore?.names()||[];if(!names.length||!this.maxPreparedSites)return;
  let cursor=(this.state.prepareCursor||0)%names.length;
  for(let checked=0;checked<names.length;checked++){
   const name=names[cursor];cursor=(cursor+1)%names.length;this.state.prepareCursor=cursor;
   const snapshot=this.snapshotStore.get(name),row=this.pinner.rows[name];
   if(!this.peer.contentStore.has?.(snapshot.txId))continue;
   if(row&&this.pinner.isReady(row)&&row.rootDataId===snapshot.txId)continue;
   if(!row&&Object.keys(this.pinner.rows).length>=this.maxPreparedSites){
    const stale=Object.values(this.pinner.rows).find(r=>r.managedBy==='catalog'&&!this.pinner.isReady(r)&&!this.pinner.jobs.has(r.name)&&Date.now()-Date.parse(r.updatedAt||0)>=5*60000);
    if(stale)this.pinner.remove(stale.name);else{this.state.preparationError='prepared_site_limit';continue;}
   }
   const pending=row?.update||row;
   if(pending?.rootDataId===snapshot.txId&&Date.now()-Date.parse(pending.updatedAt||0)<5*60000)continue;
   // Pin verified cached content; the durable download queue fills any gaps.
   const result=await this.pinner.start(name,{signal,managedBy:'catalog',contentSources:'local-only'});
   this.state.preparationError=this.pinner.isReady(result)?null:result.errors?.[0]?.error||'preparation_incomplete';
   this.state.lastPreparation={name,target:snapshot.txId,status:result.status,at:new Date().toISOString()};return;
  }
 }
 status(){return {catalog:this.catalog.status(),preparation:{maxSites:this.maxPreparedSites,last:this.state.lastPreparation||null,error:this.state.preparationError||null},queued:this.state.jobs.length+this.state.priorityJobs.length,priorityQueued:this.state.priorityJobs.length,maxQueued:this.maxJobs+256,deferredRoots:this.state.deferredRoots||0,pendingGraphs:[...this.state.jobs,...this.state.priorityJobs].filter(j=>j.graphPending).length,completed:this.state.completed,meshReplicated:this.state.meshReplicated||0,locationsReplicated:this.state.locationsReplicated||0,lastSuccess:this.state.lastSuccess||null,failed:this.state.failed,dayResponseBytes:this.state.bytes,maxDailyResponseBytes:this.dailyBytes,lastPassAt:this.state.lastPassAt||null,contentBudgetExhausted:this.state.bytes>=this.dailyBytes,nameSync:{independent:this.independentNames,lastPassAt:this.state.namesPassAt||null,intervalMs:this.namesIntervalMs,bulkIntervalMs:this.bulkScan?this.bulkIntervalMs:null,bulkError:this.state.bulkError||null,dayResponseBytes:this.state.nameBytes||0,maxDailyResponseBytes:this.nameDailyBytes,budgetExhausted:(this.state.nameBytes||0)>=this.nameDailyBytes},byteScope:'HTTP response bodies and Mesh response streams; excludes UDP discovery/control overhead',lastError:this.state.lastError,catalogError:this.state.catalogError||null,catalogFailures:this.state.catalogFailures||0,lastGraphError:this.state.lastGraphError||null,generalCoverage:false};}
 start(){if(!this.stopped)return;this.stopped=false;
  if(this.independentNames){const namesLoop=async()=>{if(this.stopped)return;await this.refreshNames().catch(e=>{this.state.catalogError=e.message;});if(!this.stopped){this.namesTimer=setTimeout(namesLoop,this.namesIntervalMs);this.namesTimer.unref?.();}};void namesLoop();}
  const loop=async()=>{if(this.stopped)return;await this.pass().catch(e=>{this.state.lastError=e.message;});if(!this.stopped){this.timer=setTimeout(loop,this.intervalMs);this.timer.unref?.();}};void loop();}
 stop(){this.stopped=true;clearTimeout(this.timer);clearTimeout(this.namesTimer);this.namesController?.abort(new Error('catalog_stopped'));this.controller?.abort(new Error('catalog_stopped'));}
}
