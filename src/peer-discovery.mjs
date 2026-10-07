import path from 'node:path';
import crypto from 'node:crypto';
import {NetworkRendezvous} from './network-rendezvous.mjs';
import {requestIpJson} from './ip-transport.mjs';
import {PeerDirectory,PEER_TTL,bindPeerDirectory,discoveryAddress,normalizePeerHost,peerAddress,verifyPeerEnvelope} from './peer-directory.mjs';

// Open content-source discovery, not a grant of name/publisher authority.
export class PeerDiscovery{
 constructor({dataDir,scope,peers,identity=null,listenPort=null,advertise='auto',onChange=()=>{},now=()=>Date.now(),request=requestIpJson,intervalMs=60000}){
  this.scope=scope;this.peers=peers;this.identity=identity;this.listenPort=listenPort;this.advertise=advertise;this.onChange=onChange;this.now=now;this.request=request;this.intervalMs=intervalMs;
  this.directory=new PeerDirectory({file:path.join(dataDir,'peer-directory.json'),scope,now});this.unbind=bindPeerDirectory(path.join(dataDir,'mesh-ip-peers.json'),this.directory);
  this.rendezvous=new NetworkRendezvous({scope:()=>this.context(),self:identity&&advertise!=='off'?()=>this.self():null,onPeer:(env,{signal})=>this.verifyReachable(env,AbortSignal.any([signal,AbortSignal.timeout(3500)])),now});
  this.own=null;this.observed=null;this.acceptedBy=new Map();this.networkId=scope()?.id||null;this.lastError=null;this.lastSync=null;this.running=null;this.timer=null;this.controller=null;this.cursor=0;this.exportCursor=0;this.loopEpoch=0;this.probes=0;this.probeTimes=[];this.stopped=true;
 }
 context(){const scope=this.scope();if((scope?.id||null)!==this.networkId){void this.rendezvous?.close().catch(()=>{});this.networkId=scope?.id||null;this.own=null;this.observed=null;this.acceptedBy.clear();this.lastError=null;this.lastSync=null;}for(const [address,at] of this.acceptedBy)if(this.now()-at>=PEER_TTL)this.acceptedBy.delete(address);return scope;}
 accepted(address){this.acceptedBy.delete(address);this.acceptedBy.set(address,this.now());while(this.acceptedBy.size>32)this.acceptedBy.delete(this.acceptedBy.keys().next().value);}
 sign(value){return this.identity?._envelope(value);}
 self(observed=this.observed){
  const scope=this.context();if(!scope||!this.identity||!this.listenPort||this.advertise==='off')return null;
  let address;
  try{address=peerAddress(discoveryAddress(this.advertise==='auto'?peerAddress({host:normalizePeerHost(observed),port:this.listenPort}):this.advertise,scope));}catch{return null;}
  if(this.own){const r=JSON.parse(this.own.recordJson);if(r.networkId===scope.id&&r.address===address&&r.expiresAt-this.now()>PEER_TTL/2)return this.own;}
  const at=this.now();this.own=this.sign({schema:'arns-mesh-peer/v1',networkId:scope.id,peerId:this.identity.witnessPeerId,address,sequence:this.directory.nextSequence(),issuedAt:at,expiresAt:at+PEER_TTL,capabilities:['content','location','snapshot-relay','catalog','peers']});return this.own;
 }
 async query(peer,body,signal){return this.request({...peer,path:'/mesh/v1/query',method:'POST',body,purpose:'mesh-peer',maxBytes:48*1024,timeout:2500,signal});}
 async verifyReachable(env,signal){
  const {record}=this.directory.check(env);if(record.peerId===this.identity?.witnessPeerId)return false;
  this.probeTimes=this.probeTimes.filter(t=>this.now()-t<60000);
  if(this.probes>=2||this.probeTimes.length>=8)throw new Error('peer_probe_budget');
  const existing=this.directory.rows.get(record.peerId);if(existing?.env.recordJson===env.recordJson)return true;
  this.probes++;this.probeTimes.push(this.now());
  try{const nonce=crypto.randomBytes(32).toString('hex'),started=this.now(),address=discoveryAddress(record.address,this.scope());
   const reply=await this.query(address,{op:'peer-check',networkId:record.networkId,nonce},signal),check=verifyPeerEnvelope(reply);
   if(reply.witnessPeerId!==record.peerId||check.schema!=='arns-mesh-peer-check/v1'||check.networkId!==record.networkId||check.nonce!==nonce)throw new Error('peer_reachability_identity_mismatch');
   signal?.throwIfAborted();this.directory.accept(env);this.directory.success(record.address,this.now()-started);this.onChange();return true;
  }finally{this.probes--;}
 }
 async handle(req,{remoteAddress,signal}={}){
  const scope=this.context();if(!scope||req.networkId!==scope.id)return {ok:false,error:'peer_network_mismatch'};
  if(req.op==='peer-check'){
   if(!this.identity||typeof req.nonce!=='string'||!/^[a-f0-9]{64}$/.test(req.nonce))return {ok:false,error:'invalid_peer_challenge'};
   return this.sign({schema:'arns-mesh-peer-check/v1',networkId:scope.id,nonce:req.nonce});
  }
  if(req.op!=='peers')return {ok:false,error:'invalid_discovery_operation'};
  let accepted=false,error=null;
  if(req.announce){try{
   const {record}=this.directory.check(req.announce),endpoint=discoveryAddress(record.address,scope);
   if(endpoint.host!==normalizePeerHost(remoteAddress))throw new Error('announcement_source_address_mismatch');
   accepted=await this.verifyReachable(req.announce,signal);
  }catch(e){error=String(e.message).slice(0,120);}}
  const own=this.self(),records=this.directory.exports(own?15:16,this.exportCursor++);
  return {ok:true,networkId:scope.id,observedAddress:normalizePeerHost(remoteAddress),peers:[...(own?[own]:[]),...records],accepted,error};
 }
 async sync({signal}={}){
  if(this.running)return this.running;
  const scope=this.context();if(!scope)return;
  const controller=this.controller=new AbortController(),bounded=AbortSignal.any([controller.signal,AbortSignal.timeout(15000),...(signal?[signal]:[])]);
  const work=(async()=>{
   await this.rendezvous.sync({signal:bounded,timeoutMs:this.directory.addresses().length?500:4000}).catch(e=>{if(bounded.aborted)throw e;this.lastError=String(e.message).slice(0,160);});
   const candidates=this.directory.rank([...this.peers(),...this.directory.addresses()]).filter(p=>peerAddress(p)!==this.selfAddress());
   if(!candidates.length)return;
   // Always visit one known route and rotate a second route. No unbounded fanout.
   const selected=[candidates[0],candidates[(++this.cursor)%candidates.length]].filter((p,i,a)=>a.findIndex(q=>peerAddress(q)===peerAddress(p))===i);
   let reached=0,checked=0;
   for(const endpoint of selected){
    bounded.throwIfAborted();
    try{const announce=this.self(),reply=await this.query(endpoint,{op:'peers',networkId:scope.id,...(announce?{announce}:{})},bounded);
     if(!reply?.ok||reply.networkId!==scope.id||!Array.isArray(reply.peers)||reply.peers.length>16)throw new Error('peer_exchange_unavailable');
     reached++;this.observed=normalizePeerHost(reply.observedAddress);
     if(this.identity&&this.advertise!=='off'&&!announce){const own=this.self();if(own){const ack=await this.query(endpoint,{op:'peers',networkId:scope.id,announce:own},bounded);if(ack?.accepted)this.accepted(peerAddress(endpoint));else if(ack?.error)this.lastError=ack.error;}}
     else if(reply.accepted)this.accepted(peerAddress(endpoint));else if(reply.error)this.lastError=reply.error;
     for(const env of reply.peers){if(checked>=4)break;try{const {record}=this.directory.check(env);if(record.peerId===this.identity?.witnessPeerId||this.directory.rows.get(record.peerId)?.env.recordJson===env.recordJson)continue;checked++;await this.verifyReachable(env,bounded);}catch(e){if(bounded.aborted)throw e;}}
    }catch(e){this.directory.failure(peerAddress(endpoint));this.lastError=String(e.message).slice(0,160);}
   }
   bounded.throwIfAborted();this.lastSync=this.now();if(reached)this.lastError=this.acceptedBy.size||!this.identity?null:this.lastError;this.onChange();
  })();this.running=work;
  try{return await work;}finally{if(this.running===work){this.running=null;this.controller=null;}}
 }
 selfAddress(){try{return this.own?JSON.parse(this.own.recordJson).address:null;}catch{return null;}}
 start(){if(!this.stopped)return;this.stopped=false;const epoch=++this.loopEpoch;const loop=async()=>{if(this.stopped||epoch!==this.loopEpoch)return;await this.sync().catch(e=>{this.lastError=String(e.message).slice(0,160);});if(!this.stopped&&epoch===this.loopEpoch){this.timer=setTimeout(loop,this.intervalMs);this.timer.unref?.();}};void loop();}
 stop(){this.stopped=true;this.loopEpoch++;void this.rendezvous.close().catch(()=>{});clearTimeout(this.timer);this.timer=null;this.controller?.abort(new Error('peer_discovery_stopped'));}
 close(){this.stop();this.unbind();return this.rendezvous.close();}
 status(){this.context();return {...this.directory.status(),announcing:Boolean(this.identity)&&this.advertise!=='off',address:this.selfAddress(),acceptedBy:this.acceptedBy.size,lastSync:this.lastSync,error:this.lastError,rendezvous:this.rendezvous.status()};}
}
