import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {requestJson,discoverArweavePeers,txOffset,rangeFromRoot} from './arweave-direct.mjs';
import {walkBundleHeaders} from './bundle-walker.mjs';
import {saveDiscoveredLocations} from './discovery-store.mjs';
import {LocationIndex} from './location-index.mjs';
import {withNetworkAudit} from './network-audit.mjs';
import {indexPartition} from './index-partition.mjs';
const valid=id=>/^[A-Za-z0-9_-]{43}$/.test(id);
const decode=s=>Buffer.from(String(s||''),'base64url').toString('utf8');
const atomic=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);};
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const lanes=['retry','history','live'];

// A local, resumable source of *hints*. It never asserts ledger inclusion or
// full history coverage. Failed transactions/bundles remain in the retry queue.
export class RawLedgerDiscovery extends EventEmitter{
 constructor({locationsFile,peersFile,stateFile,intervalMs=15000,maxTransactions=24,budgetBytes=16*1024*1024,dailyBudgetBytes=64*1024*1024,partition='0/1',transactionTimeoutMs=12000}={}){
  super();this.locationsFile=locationsFile;this.peersFile=peersFile;this.stateFile=stateFile;
  this.partition=indexPartition(partition);
  if(!Number.isSafeInteger(transactionTimeoutMs)||transactionTimeoutMs<1||transactionTimeoutMs>40000)throw new Error('invalid_transaction_timeout');
  this.transactionTimeoutMs=transactionTimeoutMs;
  this.intervalMs=intervalMs;this.maxTransactions=maxTransactions;this.budgetBytes=budgetBytes;this.dailyBudgetBytes=dailyBudgetBytes;this.timer=null;this.running=null;this.stopped=true;this.peers=[];this.peersAt=0;
  this.state={schema:'arns-mesh-ledger-discovery/v1',historyCursor:null,tip:null,blocksVisited:0,blocksCompleted:0,transactionsChecked:0,bundlesIndexed:0,locationsAdded:0,nestedBundlesIndexed:0,bundleTreesCompleted:0,itemHeadersChecked:0,retries:[],queue:[],activeBlock:null,lastError:null,quotaDay:new Date().toISOString().slice(0,10),quotaBytes:0};
  const saved=read(stateFile,null);if(saved?.schema===this.state.schema)this.state={...this.state,...saved};
  if(saved?.schema===this.state.schema&&(saved.partition||'0/1')!==this.partition.key)throw new Error('index_partition_changed_requires_separate_scan_state');
  this.state.partition=this.partition.key;
  if(saved?.schema===this.state.schema&&saved.recursiveScannerVersion!==1){
   this.state.previousOuterScan={tip:saved.tip,historyCursor:saved.historyCursor};
   if(Number.isSafeInteger(saved.tip))this.state.historyCursor=saved.tip;
   if(this.state.activeBlock){this.state.activeBlock.position=0;this.state.activeBlock.work=null;}
  }
  this.state.recursiveScannerVersion=1;
  // Each lane keeps its own cursor. A busy tip or a slow bundle must not
  // permanently starve historical discovery, even across process restarts.
  this.state.activeBlocks??={history:this.state.activeBlock||null,live:null};
  delete this.state.activeBlock;
  this.state.schedulerVersion=1;
  if(!lanes.includes(this.state.nextLane))this.state.nextLane='retry';
  this.state.laneAttempts??={retry:0,history:0,live:0};
  this.state.retries=this.state.retries.slice(0,4096);this.state.queue=this.state.queue.slice(0,512);
  this.sessionBytes=0;this.bundleChunks=new Map();this.current={phase:'idle',bytesThisPass:0,requestsThisPass:0,activeHeight:null};
  this.index=new LocationIndex(locationsFile);
 }
 status(){const {retries,queue,activeBlocks,...s}=this.state;const activeBlock=activeBlocks[this.current.lane];const frame=activeBlock?.work?.cursor?.frames?.at(-1);return {...s,laneAttempts:{...s.laneAttempts},...this.current,retryCount:retries.length,pendingBundleScans:retries.filter(x=>x.error==='nested_scan_pending').length,queuedBlocks:queue.length,pendingTailBlocks:Math.max(0,(this.state.observedTip??this.state.tip??0)-(this.state.tip??0)),historyActiveHeight:activeBlocks.history?.height??null,liveActiveHeight:activeBlocks.live?.height??null,activeTransaction:activeBlock?.position||0,activeBlockTransactions:activeBlock?.txIds?.length||0,activeBundleDepth:frame?.path.length||0,activeBundleItem:frame?.next??null,activeBundleItems:frame?.total??null,allHistoryCovered:false,byteBudgetPerPass:this.budgetBytes,sessionBytes:this.sessionBytes,dailyBudgetBytes:this.dailyBudgetBytes};}
 save(){atomic(this.stateFile,this.state);this.emit('progress',this.status());}
 accountBytes(n){this.current.bytesThisPass+=n;this.state.quotaBytes+=n;if(this.current.bytesThisPass>=this.budgetBytes||this.state.quotaBytes>=this.dailyBudgetBytes)this.abort.abort(new Error('index_budget_reached'));}
 async getPeers(signal=this.abort?.signal){signal?.throwIfAborted();if(this.peers.length&&Date.now()-this.peersAt<120000)return this.peers;this.peers=await discoverArweavePeers(read(this.peersFile,[]),{maxPeers:8,expand:true,signal});this.peersAt=Date.now();if(!this.peers.length)throw new Error('no_raw_arweave_peers');return this.peers;}
 async json(route,options={}){
  let error;const signal=options.signal||this.abort?.signal;
  for(const peer of await this.getPeers(signal)){
   try{return await requestJson({...peer,...options,path:route,signal,onBytes:n=>this.accountBytes(n),timeout:6500});}
   catch(e){error=e;if(signal?.aborted)throw e;}
   finally{this.current.requestsThisPass++;}
  }
  throw error;
 }
 enqueueHeight(height){if(!this.partition.owns(height)||height>(this.state.tip??Number.MAX_SAFE_INTEGER)||this.state.queue.includes(height))return;this.state.queue.unshift(height);this.state.queue=this.state.queue.slice(0,512);this.save();}
 retry(txId,height,error,work){
  if(!this.state.retries.some(x=>x.txId===txId)){
   if(this.state.retries.length>=4096)throw new Error('retry_queue_full');
   this.state.retries.push({txId,height,error:String(error).slice(0,240),work});
  }
 }
 async inspectWithinBudget(txId,height,work){
  // A missing chunk must not retain the head of a live/history block forever.
  // Keep its cursor in the retry queue while letting other transactions run.
  const deadline=new AbortController();
  const timer=setTimeout(()=>deadline.abort(new Error('index_transaction_deadline')),this.transactionTimeoutMs);
  const signal=AbortSignal.any([this.abort.signal,deadline.signal]);
  try{return await this.inspectTransaction(txId,height,work,signal);}
  catch(error){signal.throwIfAborted();throw error;}
  finally{clearTimeout(timer);}
 }
 async inspectTransaction(txId,height,work={},signal=this.abort.signal){
  if(!work.bundle){
   const tx=await this.json('/tx/'+txId,{signal});if(tx.id!==txId)throw new Error('tx_metadata_id_mismatch');
   const tags=Object.fromEntries((tx.tags||[]).map(t=>[decode(t.name),decode(t.value)]));
   if(tags['Bundle-Format']!=='binary'||tags['Bundle-Version']!=='2.0.0')return true;
   work.bundle=true;work.cursor={};
  }
  let lastError;
  const options={signal,onNetworkBytes:n=>this.accountBytes(n),peerSeeds:read(this.peersFile,[]),chunkCache:this.bundleChunks};
  for(const peer of await this.getPeers(signal)){
   try{
    const meta=await txOffset(peer,txId,options);
    const result=await walkBundleHeaders({rootTxId:txId,rootSize:meta.size,cursor:work.cursor,signal,maxItems:32,
     read:(offset,size)=>rangeFromRoot(peer,txId,offset,size,meta,options),
     onEntries:entries=>{
      const rows=entries.map(([id,location])=>[id,{...location,blockHeight:height,discoveredVia:'raw-ledger-recursive-scan'}]);
      const written=saveDiscoveredLocations(this.locationsFile,rows);this.state.locationsAdded+=written.added;
      if(written.full.length)throw new Error('index_storage_limit');
      this.state.bundlesIndexed++;if(work.cursor.frames.at(-1)?.path.length)this.state.nestedBundlesIndexed++;
     }});
    this.state.itemHeadersChecked+=result.checked;
    if(result.complete)this.state.bundleTreesCompleted++;
    return result.complete;
   }
   catch(e){lastError=e;if(signal.aborted)throw e;}
  }
  throw lastError||new Error('no_raw_arweave_peers');
 }
 nextLane(){
  const start=lanes.indexOf(this.state.nextLane);
  for(let i=0;i<lanes.length;i++){
   const lane=lanes[(start+i)%lanes.length];
   const available=lane==='retry'?this.state.retries.length:lane==='live'?(this.state.activeBlocks.live||this.state.queue.length):(this.state.activeBlocks.history||this.state.historyCursor>=0);
   if(!available)continue;
   this.state.nextLane=lanes[(start+i+1)%lanes.length];
   this.current.lane=lane;this.state.laneAttempts[lane]++;return lane;
  }
  return null;
 }
 async stepLane(lane){
  if(lane==='retry'){
   const retry=this.state.retries[0];this.current.activeHeight=retry.height;
   try{
    retry.work??={};const complete=await this.inspectWithinBudget(retry.txId,retry.height,retry.work);
    this.state.retries.shift();if(!complete)this.state.retries.push({...retry,error:'nested_scan_pending'});
   }catch(e){
    this.state.retries.shift();this.state.retries.push({...retry,error:String(e.message).slice(0,240)});
    if(this.abort.signal.aborted)throw e;
    this.state.lastError=String(e.message).slice(0,300);
   }
   return;
  }
  if(!this.state.activeBlocks[lane]){
   const height=lane==='live'?this.state.queue[0]:this.state.historyCursor;
   this.current.activeHeight=height;
   const block=await this.json('/block/height/'+height,{summarizeBlock:true});
   if(Number(block.height)!==height||!Array.isArray(block.txs)||block.txs.length>100000||block.txs.some(x=>!valid(x)))throw new Error('invalid_block_metadata');
   this.state.activeBlocks[lane]={height,txIds:block.txs,position:0,hadErrors:false};this.state.blocksVisited++;
   if(lane==='live')this.state.queue.shift();else this.state.historyCursor-=this.partition.count;
  }
  const block=this.state.activeBlocks[lane];this.current.activeHeight=block.height;
  if(block.position<block.txIds.length){
   const txId=block.txIds[block.position];block.work??={};
   try{const complete=await this.inspectWithinBudget(txId,block.height,block.work);if(!complete){this.retry(txId,block.height,'nested_scan_pending',block.work);block.hadErrors=true;}}
   catch(e){if(this.abort.signal.aborted)throw e;this.retry(txId,block.height,e.message,block.work);block.hadErrors=true;this.state.lastError=String(e.message).slice(0,300);}
   block.work=null;block.position++;this.state.transactionsChecked++;
  }
  if(block.position>=block.txIds.length){if(!block.hadErrors)this.state.blocksCompleted++;this.state.activeBlocks[lane]=null;}
 }
 async pass(){
  if(this.running)return this.running;
  const day=new Date().toISOString().slice(0,10);if(this.state.quotaDay!==day){this.state.quotaDay=day;this.state.quotaBytes=0;}
  if(this.state.quotaBytes>=this.dailyBudgetBytes){this.current.phase='daily-budget-reached';this.save();return this.status();}
  this.running=withNetworkAudit('raw-ledger-discovery',async()=>{
   this.abort=new AbortController();this.current={phase:'scanning',bytesThisPass:0,requestsThisPass:0,activeHeight:null};
   const deadline=setTimeout(()=>this.abort.abort(new Error('index_pass_deadline')),40000);
   try{
    const info=await this.json('/info');if(info.network!=='arweave.N.1'||!Number.isSafeInteger(info.height)||info.height<3)throw new Error('invalid_arweave_info');
    const tip=info.height-2;
    this.state.observedTip=tip;
    if(this.state.historyCursor===null)this.state.historyCursor=this.partition.before(tip);
    if(this.state.tip!==null&&tip>this.state.tip){
     let added=0;
     for(let h=this.partition.after(this.state.tip);h<=tip&&added<64&&this.state.queue.length<512;h+=this.partition.count){
      if(!this.state.queue.includes(h)){this.state.queue.push(h);added++;}
     }
    }
    // Large offline gaps are queued gradually instead of silently marked scanned.
    this.state.tip=this.state.tip===null?tip:Math.max(this.state.tip,...this.state.queue);
    for(let attempted=0;attempted<this.maxTransactions&&!this.abort.signal.aborted;attempted++){
     const lane=this.nextLane();if(!lane)break;
     await this.stepLane(lane);this.save();
    }
    this.current.phase='waiting';
   }catch(e){this.state.lastError=String(e.message||e).slice(0,400);this.current.phase=this.state.quotaBytes>=this.dailyBudgetBytes?'daily-budget-reached':this.abort.signal.aborted?'budget-wait':'retry-wait';}
   finally{clearTimeout(deadline);this.sessionBytes+=this.current.bytesThisPass;this.save();}
   return this.status();
  }).finally(()=>{this.running=null;});return this.running;
 }
 start(){if(!this.stopped)return;this.stopped=false;const loop=async()=>{if(this.stopped)return;await this.pass();if(!this.stopped){this.timer=setTimeout(loop,this.intervalMs);this.timer.unref?.();}};void loop();}
 stop(){this.stopped=true;clearTimeout(this.timer);this.abort?.abort(new Error('discovery_stopped'));}
 async find(id,{timeout=20000,onProgress=()=>{}}={}){
  const hit=this.index.get(id);if(hit)return hit;this.start();
  return new Promise(resolve=>{let timer,poll;
   const end=value=>{clearTimeout(timer);clearInterval(poll);this.off('progress',check);resolve(value);};
   const check=()=>{const row=this.index.get(id);onProgress(this.status());if(row)end(row);};
   this.on('progress',check);timer=setTimeout(()=>end(null),timeout);poll=setInterval(check,1000);check();
  });
 }
}
let singleton=null;
export function configureRawDiscovery({dataDir,locationsFile,peersFile,enabled=true}){
 singleton?.stop();singleton=null;
 if(!enabled)return {start(){},stop(){},async find(){return null;},status(){return {enabled:false,phase:'disabled-on-client',quotaBytes:0,dailyBudgetBytes:0};}};
 singleton=new RawLedgerDiscovery({locationsFile,peersFile,stateFile:path.join(dataDir,'ledger-discovery.json'),partition:process.env.ARNS_INDEX_PARTITION||'0/1',dailyBudgetBytes:Math.min(4096,Math.max(8,Number(process.env.ARNS_INDEX_DAILY_MIB)||64))*1024*1024});return singleton;
}
export function getRawDiscovery(){return singleton;}
