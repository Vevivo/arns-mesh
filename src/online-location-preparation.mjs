// Optional ONLINE preparation only. This module is never imported by the
// locked-down reader/peer. Published rows are untrusted routing hints; fetching
// and verifying the original item remains mandatory in content-fetcher.
import fs from 'node:fs';
import path from 'node:path';
import {normalizeLocation} from './location-index.mjs';
const valid=id=>/^[A-Za-z0-9_-]{43}$/.test(id);
export const preparationProviders=['https://turbo-gateway.com/graphql','https://arweave.net/graphql'];
const providerNames={'https://turbo-gateway.com/graphql':'turbo-graphql','https://arweave.net/graphql':'arweave-graphql'};
const read=(file,fallback,max=16*1024*1024)=>{try{if(fs.statSync(file).size>max)throw new Error('preparation_file_too_large');return JSON.parse(fs.readFileSync(file));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export function atomicPreparationJson(file,value){
 const tmp=file+'.tmp-'+process.pid;
 fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,file);
}
export async function queryParents(origin,ids,{signal,fetchImpl=fetch,onBytes=()=>{}}={}){
 if(!preparationProviders.includes(origin)||!Array.isArray(ids)||!ids.length||ids.length>32||ids.some(id=>!valid(id)))throw new Error('invalid_preparation_query');
 const query='{ transactions(ids: '+JSON.stringify([...new Set(ids)])+', first: 32) { edges { node { id bundledIn { id } } } } }';
 const response=await fetchImpl(origin,{method:'POST',redirect:'error',headers:{'content-type':'application/json','accept-encoding':'identity'},body:JSON.stringify({query}),signal});
 if(!response.ok){await response.body?.cancel();throw new Error('preparation_http_'+response.status);}
 const chunks=[];let bytes=0;
 try{for await(const chunk of response.body){bytes+=chunk.length;onBytes(chunk.length);if(bytes>512*1024)throw new Error('preparation_response_too_large');chunks.push(chunk);}}
 catch(e){await response.body?.cancel().catch(()=>{});throw e;}
 const body=JSON.parse(Buffer.concat(chunks));
 const edges=body.data?.transactions?.edges;
 if(body.errors?.length||!Array.isArray(edges)||edges.length>32)throw new Error('invalid_preparation_response');
 const wanted=new Set(ids),result=new Map();
 for(const {node} of edges){
  if(!node||!wanted.has(node.id)||result.has(node.id))throw new Error('unexpected_preparation_id');
  const parent=node.bundledIn?.id||null;
  if(parent!==null&&!valid(parent))throw new Error('invalid_bundle_parent');
  result.set(node.id,parent);
 }
 return result;
}
export async function discoverPreparedLocations(ids,{origin=preparationProviders[0],query=queryParents,signal,onBytes}={}){
 if(ids.some(id=>!valid(id))||ids.length>32)throw new Error('invalid_preparation_ids');
 const parents=new Map();let pending=[...new Set(ids)];
 for(let depth=0;depth<=9&&pending.length;depth++){
  signal?.throwIfAborted();
  const found=await query(origin,pending,{signal,onBytes});
  for(const [id,parent] of found)parents.set(id,parent);
  pending=[...new Set([...found.values()].filter(id=>id&&!parents.has(id)))];
 }
 const rows={};
 for(const id of ids){
  let at=id;const chain=[],seen=new Set([id]);
  while(parents.has(at)&&parents.get(at)){
   at=parents.get(at);if(seen.has(at))throw new Error('bundle_parent_cycle');
   seen.add(at);chain.push(at);if(chain.length>9)throw new Error('bundle_nesting_limit');
  }
  // Missing parent metadata is not evidence of a root transaction.
  if(!chain.length||!parents.has(at)||parents.get(at)!==null)continue;
  rows[id]=normalizeLocation(id,{rootTxId:chain.at(-1),path:chain.slice(0,-1).reverse(),preparation:{kind:'external-index-preparation',provider:providerNames[origin],at:new Date().toISOString()}});
 }
 return rows;
}
export class OnlineLocationPreparer{
 constructor({dataDir,dailyBytes=64*1024*1024,query=queryParents,now=()=>Date.now()}={}){
  if(!Number.isSafeInteger(dailyBytes)||dailyBytes<1)throw new Error('invalid_preparation_budget');
  this.dir=dataDir;this.inbox=path.join(dataDir,'location-preparation-inbox');this.file=path.join(dataDir,'prepared-locations.json');this.stateFile=path.join(dataDir,'location-preparation-state.json');
  fs.mkdirSync(this.inbox,{recursive:true});this.query=query;this.now=now;this.dailyBytes=dailyBytes;
  this.state=read(this.stateFile,{day:'',bytes:0,retries:{},cursor:0,completed:0});
  const previous=read(this.file,null);
  this.rows=previous?.schema==='wayfinder-prepared-locations/v1'?previous.rows:{};
  this.running=null;this.lastError=null;this.lastPassAt=null;this.dirty=!previous;
 }
 save(){
  const keys=Object.keys(this.rows);
  // Keep recent successful hints within the existing snapshot reader's budget.
  for(const id of keys.slice(0,Math.max(0,keys.length-40000)))delete this.rows[id];
  if(this.dirty)atomicPreparationJson(this.file,{schema:'wayfinder-prepared-locations/v1',preparedAt:new Date(this.now()).toISOString(),origin:{kind:'external-index-preparation',provider:preparationProviders[0]},rows:this.rows});
  this.dirty=false;
  atomicPreparationJson(this.stateFile,this.state);
  atomicPreparationJson(path.join(this.dir,'location-preparation-status.json'),this.status());
 }
 status(){return {enabled:true,at:new Date(this.now()).toISOString(),lastPassAt:this.lastPassAt,knownHints:Object.keys(this.rows).length,completed:this.state.completed,dayResponseBytes:this.state.bytes,maxDailyResponseBytes:this.dailyBytes,budgetExhausted:this.state.bytes>=this.dailyBytes,lastError:this.lastError};}
 pass(){if(this.running)return this.running;this.running=this._pass().finally(()=>{this.running=null;});return this.running;}
 async _pass(){
  const day=new Date(this.now()).toISOString().slice(0,10);
  if(day!==this.state.day){this.state.day=day;this.state.bytes=0;}
  this.lastPassAt=new Date(this.now()).toISOString();
  if(this.state.bytes>=this.dailyBytes){this.lastError='preparation_daily_budget_reached';this.save();return this.status();}
  const due=id=>valid(id)&&(this.state.retries[id]?.after||0)<=this.now();
  const requested=fs.readdirSync(this.inbox).filter(due);
  const catalog=read(path.join(this.dir,'target-catalog.json'),{targets:{}});
  const work=read(path.join(this.dir,'catalog-work.json'),{priorityJobs:[],jobs:[]});
  const targets=[...new Set(Object.values(catalog.targets||{}).sort((a,b)=>(b.observedAt||0)-(a.observedAt||0)).map(r=>r.dataId))].filter(due);
  // Live demand and changed/new names precede the older asset backlog.
  const jobs=[...(work.priorityJobs||[]).filter(j=>j.demand),...(work.priorityJobs||[]),...(work.jobs||[])].map(j=>j.id).filter(due);
  const staleRequested=new Set(requested.filter(id=>!this.rows[id]||this.now()-Date.parse(this.rows[id].preparation.at)>60000));
  const candidates=[...new Set([...requested,...targets,...jobs])].filter(id=>!this.rows[id]||staleRequested.has(id));
  const ids=candidates.slice(0,24);
  for(const id of requested.filter(id=>this.rows[id]&&!staleRequested.has(id)))fs.unlinkSync(path.join(this.inbox,id));
  if(!ids.length){this.lastError=null;this.save();return this.status();}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('preparation_timeout')),18000);
  const onBytes=n=>{this.state.bytes+=n;if(this.state.bytes>this.dailyBytes){controller.abort(new Error('preparation_daily_budget_reached'));throw controller.signal.reason;}};
  const found={};let failure=null;
  try{
   for(const origin of preparationProviders){
    const missing=ids.filter(id=>!found[id]);if(!missing.length)break;
    try{Object.assign(found,await discoverPreparedLocations(missing,{origin,query:this.query,signal:controller.signal,onBytes}));}
    catch(e){failure=e;controller.signal.throwIfAborted();}
   }
   for(const [id,row] of Object.entries(found)){
    delete this.rows[id];this.rows[id]=row;this.dirty=true;delete this.state.retries[id];this.state.completed++;
    try{fs.unlinkSync(path.join(this.inbox,id));}catch(e){if(e.code!=='ENOENT')throw e;}
   }
   for(const id of ids.filter(id=>!found[id])){
    const attempt=(this.state.retries[id]?.attempt||0)+1;
    this.state.retries[id]={attempt,after:this.now()+Math.min(3600000,30000*2**Math.min(attempt,7))};
   }
   this.lastError=Object.keys(found).length?null:failure?.message||'location_not_yet_published';
  }catch(e){this.lastError=e.message;for(const id of ids)if(!found[id])this.state.retries[id]={attempt:1,after:this.now()+60000};}
  finally{
   clearTimeout(timer);
   const retries=Object.keys(this.state.retries);
   for(const id of retries.slice(0,Math.max(0,retries.length-40000)))delete this.state.retries[id];
   this.save();
  }
  return this.status();
 }
}
