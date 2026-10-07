import fs from 'node:fs';
import path from 'node:path';
import {withByteBudget} from './byte-budget.mjs';
import {validateSnapshot} from './name-snapshots.mjs';

const bindingCache=new WeakMap();

// Prefer the original publisher's last fully prepared binding. A separate
// pinner namespace retains it even while local RPC learns a newer target.
export function acceptedReplicaBindings(relay){
 const version=relay.version?.(),cached=bindingCache.get(relay);
 if(version!==undefined&&cached?.version===version)return cached.result;
 const groups=new Map(),conflicts=new Set();
 for(const {envelope,row} of relay.entries()){
  const key=row.name+'|'+(row.prepared===true),old=groups.get(key);
  const candidate={...row,provenance:{kind:'trusted-peer',witnessPeerId:envelope.witnessPeerId}};
  if(!old||candidate.slot>old.slot)groups.set(key,candidate);
  else if(candidate.slot===old.slot&&(candidate.txId!==old.txId||candidate.antId!==old.antId)){conflicts.add(row.name);groups.delete(key);}
 }
 const choices=new Map();
 for(const row of groups.values()){
  if(conflicts.has(row.name))continue;
  const old=choices.get(row.name);
  if(!old||row.prepared===true||old.prepared!==true&&row.slot>old.slot)choices.set(row.name,row);
 }
 const result={bindings:[...choices.values()].sort((a,b)=>Number(b.prepared===true)-Number(a.prepared===true)||a.name.localeCompare(b.name)),conflicts:[...conflicts]};
 if(version!==undefined)bindingCache.set(relay,{version,result});
 return result;
}

export class SupporterReplication{
 constructor({file,relay,pinner,maxSites=20000,dailyBytes=8192*1024*1024,maxPassBytes=32*1024*1024,passTimeoutMs=45000,contentSources=()=> 'all',scanPerPass=128,enabled=true}){
  if(!Number.isSafeInteger(maxSites)||maxSites<1||maxSites>20000||!Number.isSafeInteger(dailyBytes)||dailyBytes<1||dailyBytes>65536*1024*1024||!Number.isSafeInteger(maxPassBytes)||maxPassBytes<1||maxPassBytes>128*1024*1024||!Number.isSafeInteger(passTimeoutMs)||passTimeoutMs<1)throw new Error('invalid_supporter_replication_capacity');
  if(!Number.isSafeInteger(scanPerPass)||scanPerPass<1||scanPerPass>2048)throw new Error('invalid_replication_scan_budget');
  if(typeof enabled!=='boolean')throw new Error('invalid_replication_enabled');
  Object.assign(this,{file,relay,pinner,maxSites,dailyBytes,maxPassBytes,passTimeoutMs,contentSources,scanPerPass,enabled});
  this.state={day:'',bytes:0,cursor:0,retries:{},completed:0,last:null,lastError:null};this.running=null;this.timer=null;this.stopped=true;
  try{if(fs.statSync(file).size<=4*1024*1024)this.state={...this.state,...JSON.parse(fs.readFileSync(file))};}catch{}
 }
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.state),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 async pass(signal){
  if(!this.enabled)return this.status({verify:false});
  if(this.running)return this.running;
  this.running=this._pass(signal).finally(()=>this.running=null);return this.running;
 }
 async _pass(parentSignal){
  const day=new Date().toISOString().slice(0,10);if(this.state.day!==day){this.state.day=day;this.state.bytes=0;}
  const {bindings,conflicts}=acceptedReplicaBindings(this.relay);this.state.conflicts=conflicts.length;this.state.acceptedNames=bindings.length;
  if(!bindings.length){this.state.lastError='accepted_name_bindings_unavailable';this.save();return this.status({verify:false});}
  if(this.state.bytes>=this.dailyBytes){this.state.lastError='replication_daily_budget_reached';this.save();return this.status({verify:false});}
  let candidate;const siteCount=Object.keys(this.pinner.rows).length;
  for(let i=0;i<Math.min(this.scanPerPass,bindings.length);i++){
   const row=bindings[this.state.cursor++%bindings.length],old=this.pinner.rows[row.name];
   if(this.pinner.isReady(old)&&old.rootDataId===row.txId&&old.snapshot?.antId===row.antId)continue;
   const retry=this.state.retries[row.name];if(retry?.target===row.txId&&retry.after>Date.now())continue;
   if(!old&&siteCount>=this.maxSites){this.state.lastError='replication_site_capacity_reached';continue;}
   candidate=row;break;
  }
  if(!candidate){this.save();return this.status({verify:false});}
  const controller=this.controller=new AbortController(),signal=parentSignal?AbortSignal.any([parentSignal,controller.signal]):controller.signal;
  const timer=setTimeout(()=>controller.abort(new Error('replication_pass_timeout')),this.passTimeoutMs);
  let result;
  try{
   const value=await withByteBudget(Math.min(this.maxPassBytes,this.dailyBytes-this.state.bytes),controller,()=>this.pinner.start(candidate.name,{snapshot:{...validateSnapshot(candidate,candidate.name),provenance:candidate.provenance},trustedPeers:this.relay.trusted(),signal,contentSources:this.contentSources()}));
   this.state.bytes+=value.bytes;result=value.value;
   if(!this.pinner.isReady(result))throw new Error(result.errors?.[0]?.error||'replication_incomplete');
   delete this.state.retries[candidate.name];this.state.completed++;this.state.lastError=null;
  }catch(error){
   this.state.bytes+=error.receivedBytes||0;this.state.lastError=String(error.message).slice(0,240);
   const attempts=(this.state.retries[candidate.name]?.attempts||0)+1;
   this.state.retries[candidate.name]={target:candidate.txId,attempts,after:Date.now()+Math.min(3600000,30000*2**Math.min(attempts,6))};
   for(const name of Object.keys(this.state.retries).slice(0,Math.max(0,Object.keys(this.state.retries).length-this.maxSites)))delete this.state.retries[name];
  }finally{
   clearTimeout(timer);this.state.last={name:candidate.name,target:candidate.txId,preparedBinding:candidate.prepared===true,status:result?.status||'incomplete',at:new Date().toISOString()};this.save();
  }
  return this.status({verify:false});
 }
 status({verify=true,completeSites}={}){
  const rows=Object.values(this.pinner.rows),checked=completeSites!==undefined?completeSites:verify?rows.filter(row=>this.pinner.isReady(row)).length:null;
  return {enabled:this.enabled,acceptedNames:this.state.acceptedNames||0,conflicts:this.state.conflicts||0,sites:rows.length,completeSites:checked,readinessChecked:checked!==null,scanPerPass:this.scanPerPass,maxSites:this.maxSites,dayResponseBytes:this.state.bytes,maxDailyResponseBytes:this.dailyBytes,maxPassResponseBytes:this.maxPassBytes,completed:this.state.completed,last:this.state.last,error:this.state.lastError,byteScope:'HTTP response bodies and Mesh response streams'};}
 start(intervalMs=5000){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<1000)throw new Error('invalid_replication_interval');
  if(!this.enabled||!this.stopped)return;this.stopped=false;
  const loop=async()=>{if(this.stopped)return;await this.pass().catch(error=>{this.state.lastError=String(error.message).slice(0,240);});if(!this.stopped){this.timer=setTimeout(loop,intervalMs);this.timer.unref?.();}};void loop();
 }
 stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort(new Error('replication_stopped'));}
}
