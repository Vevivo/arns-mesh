import fs from 'node:fs';
import path from 'node:path';
import {decodeInvitation,validateInvitation,verifyNetwork,networkId,networkRecordHash,profileHash,MAX_NETWORK_BYTES} from '../../src/network-invitation.mjs';
import {parsePeerAddresses} from '../../src/direct-peer.mjs';
import {requestIpJson} from '../../src/ip-transport.mjs';
import {applyProfile,readProfile} from './network-profile.mjs';

export async function findNetwork(invitation,{signal,current=null,query=requestIpJson,now=Date.now()}={}){
 const invite=validateInvitation(invitation);
 const seeds=[...new Set([...(current?.profile.directPeers||[]),...invite.seeds])].slice(0,24);
 const results=[],errors=[];let cursor=0;
 const controller=new AbortController(),bounded=AbortSignal.any([controller.signal,AbortSignal.timeout(18000),...(signal?[signal]:[])]);
 async function worker(){while(cursor<seeds.length){
  bounded.throwIfAborted();const endpoint=seeds[cursor++];
  try{
   const peer=parsePeerAddresses(endpoint)[0];
   const reply=await query({...peer,path:'/mesh/v1/query',method:'POST',body:{op:'network'},purpose:'mesh-peer',maxBytes:MAX_NETWORK_BYTES+256,timeout:3000,signal:bounded});
   if(!reply?.ok||!reply.network)throw new Error('This peer does not publish network connections.');
   const payload=verifyNetwork(reply.network,invite,{now});
   if(current&&payload.revision<current.revision)throw new Error('Older network revision rejected.');
   results.push({payload,envelope:reply.network,endpoint});
  }catch(error){errors.push(String(error.message).slice(0,180));}
 }}
 const work=await Promise.allSettled([worker(),worker()]);
 signal?.throwIfAborted();
 // A deadline can leave valid candidates. Abort all outstanding work before
 // considering them; caller cancellation must never apply a late result.
 controller.abort();
 const hashes=new Map();
 for(const item of results){const hash=networkRecordHash(item.envelope);const known=hashes.get(item.payload.revision);if(known&&known!==hash)throw new Error('Conflicting signed lists for the same network revision.');hashes.set(item.payload.revision,hash);}
 if(current?.recordHash&&hashes.has(current.revision)&&hashes.get(current.revision)!==current.recordHash)throw new Error('A signed network revision was changed without increasing its revision.');
 results.sort((a,b)=>b.payload.revision-a.payload.revision);
 if(!results.length)throw new Error(errors[0]||work.find(r=>r.status==='rejected')?.reason?.message||'No network starting peer responded.');
 return results[0];
}

export class NetworkConnection{
 constructor({dataDir,onChange=()=>{},query=requestIpJson,now=()=>Date.now()}){
  this.dataDir=dataDir;this.file=path.join(dataDir,'network-membership.json');this.onChange=onChange;this.query=query;this.now=now;this.state=null;this.running=null;this.controller=null;this.timer=null;this.error=null;this.lastChecked=null;this.epoch=0;
  try{
   if(fs.statSync(this.file).size>65536)throw new Error('Network membership is too large.');
   const state=JSON.parse(fs.readFileSync(this.file));
   if(state?.schema==='arns-mesh-membership/v1'){
    const payload=verifyNetwork(state.envelope,state.invitation,{now:this.now(),allowExpired:true});
    if(state.recordHash!==networkRecordHash(state.envelope)||state.profileHash!==profileHash(payload.profile))throw new Error('Invalid saved network membership.');
    this.state={...state,payload};
    if(profileHash(readProfile(dataDir))!==state.profileHash){this.state=null;this.error='Connections were changed manually. Automatic network updates are paused.';}
   }
  }catch(error){if(error.code!=='ENOENT')this.error=String(error.message).slice(0,240);}
 }
 status(){const p=this.state?.payload;return {joined:Boolean(p),name:p?.name||null,id:this.state?networkId(this.state.invitation.key):null,local:this.state?.invitation.local||false,revision:p?.revision||null,expiresAt:p?.expiresAt||null,expired:Boolean(p&&p.expiresAt<=this.now()),refreshing:Boolean(this.running),lastChecked:this.lastChecked,error:this.error};}
 async inspect(code,{signal}={}){
  const invitation=decodeInvitation(code),current=this.state?.invitation.key===invitation.key?{...this.state.payload,recordHash:this.state.recordHash}:null;
  const found=await findNetwork(invitation,{signal,current,query:this.query,now:this.now()});
  return {invitation,...found};
 }
 async join(code,{expectedId,expectedRevision,expectedHash,signal}={}){
  if(this.running)throw new Error('A network connection is already being checked.');
  const invitation=decodeInvitation(code);
  if(expectedId!==networkId(invitation.key))throw new Error('Review this network before joining it.');
  const controller=this.controller=new AbortController(),epoch=++this.epoch;
  const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const work=(async()=>{
   const current=this.state?.invitation.key===invitation.key?{...this.state.payload,recordHash:this.state.recordHash}:null;
   const found=await findNetwork(invitation,{signal:bounded,current,query:this.query,now:this.now()});
   if(found.payload.revision!==expectedRevision||networkRecordHash(found.envelope)!==expectedHash)throw new Error('The connection list changed. Review the network again before joining.');
   bounded.throwIfAborted();if(epoch!==this.epoch)throw new Error('Network connection cancelled.');
   this.commit(invitation,found);return this.status();
  })();
  this.running=work;
  try{return await work;}catch(error){this.error=String(error.message).slice(0,240);throw error;}
  finally{if(this.running===work){this.running=null;this.controller=null;}}
 }
 commit(invitation,found){
  const {payload,envelope}=found;
  const state={schema:'arns-mesh-membership/v1',invitation,envelope,recordHash:networkRecordHash(envelope),profileHash:profileHash(payload.profile)};
  applyProfile(this.dataDir,payload.profile,{networkState:state});
  this.state={...state,payload};this.error=null;this.lastChecked=this.now();this.onChange(this.status());
 }
 async refresh({signal}={}){
  if(!this.state)return this.status();
  if(this.running)return this.running;
  // An explicit profile import/edit takes priority over a managed list.
  if(profileHash(readProfile(this.dataDir))!==this.state.profileHash){this.detach();this.error='Connections were changed manually. Network updates stopped.';return this.status();}
  const state=this.state,epoch=this.epoch,controller=this.controller=new AbortController();
  const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const work=(async()=>{
   const found=await findNetwork(state.invitation,{current:{...state.payload,recordHash:state.recordHash},signal:bounded,query:this.query,now:this.now()});
   bounded.throwIfAborted();if(epoch!==this.epoch)throw new Error('Network update cancelled.');
   if(found.payload.revision>state.payload.revision)this.commit(state.invitation,found);
   this.error=null;this.lastChecked=this.now();return this.status();
  })();
  this.running=work;
  try{return await work;}catch(error){this.error=String(error.message).slice(0,240);throw error;}
  finally{if(this.running===work){this.running=null;this.controller=null;}}
 }
 start(){if(this.timer||!this.state)return;this.timer=setInterval(()=>void this.refresh().catch(()=>{}),15*60*1000);this.timer.unref?.();}
 stop(){clearInterval(this.timer);this.timer=null;this.epoch++;this.controller?.abort(new Error('Network operation cancelled.'));}
 detach(){this.stop();fs.mkdirSync(this.dataDir,{recursive:true,mode:0o700});fs.writeFileSync(this.file+'.tmp','null\n',{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);this.state=null;this.error=null;return this.status();}
}
