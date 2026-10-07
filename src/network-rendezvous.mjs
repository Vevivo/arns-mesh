import crypto from 'node:crypto';
import Hyperswarm from 'hyperswarm';
import DHT from 'hyperdht';
import {discoveryAddress,verifyAdvertisement} from './peer-directory.mjs';

export const networkTopic=id=>crypto.createHash('sha256').update('arns-mesh/network-rendezvous/v1/').update(id).digest();
// Rendezvous is an address-finding transport. Every result must still pass the
// HTTP identity challenge; neither DHT membership nor peer count grants trust.
export class NetworkRendezvous{
 constructor({scope,self=null,onPeer=async()=>{},now=()=>Date.now(),makeDht=options=>new DHT(options)}){
  this.scope=scope;this.self=self;this.onPeer=onPeer;this.now=now;this.makeDht=makeDht;this.swarm=null;this.dht=null;this.id=null;this.session=0;this.lifecycle=0;this.starting=null;this.stopping=null;this.lastError=null;this.received=0;this.startedAt=null;this.offers=[];this.waiters=new Set();this.sockets=new Set();
 }
 async start({signal}={}){
  signal?.throwIfAborted();
  const scope=this.scope();if(!scope?.bootstrap?.length){if(this.swarm)await this.close();return false;}
  const configuration=JSON.stringify([scope.id,scope.local,scope.bootstrap]);
  if(this.swarm&&this.configuration===configuration)return true;
  if(this.starting)return this.starting;
  let lifecycle=this.lifecycle;
  const validStart=()=>{
   signal?.throwIfAborted();
   const current=this.scope();
   return lifecycle===this.lifecycle&&configuration===JSON.stringify([current?.id,current?.local,current?.bootstrap]);
  };
  const work=(async()=>{
   if(this.stopping)await this.stopping;
   if(!validStart())return false;
   if(this.swarm){
    // Our own reconfiguration closes the old session. Any further stop while
    // that close is pending invalidates this start as well.
    const closing=this.close();lifecycle=this.lifecycle;await closing;
    if(!validStart())return false;
   }
   const bootstrap=scope.bootstrap.slice(0,8).map(v=>discoveryAddress(v,scope));
   const session=++this.session;this.id=scope.id;this.configuration=configuration;const controller=this.controller=new AbortController();
   const dht=this.dht=this.makeDht({bootstrap,host:scope.local?'127.0.0.1':'0.0.0.0',...(scope.local?{firewalled:false}:{}),connectionKeepAlive:false});
   const swarm=this.swarm=new Hyperswarm({dht,maxPeers:12,maxClientConnections:2,maxServerConnections:4,maxParallel:2});
   swarm.on('connection',socket=>{
    if(session!==this.session){socket.destroy();return;}
    this.sockets.add(socket);socket.on('close',()=>this.sockets.delete(socket));socket.on('error',()=>{});socket.setEncoding('utf8');socket.setTimeout(4000,()=>socket.destroy());
    let bytes=0,buf='',handled=false;
    socket.on('data',chunk=>{
     if(handled)return;bytes+=Buffer.byteLength(chunk);
     if(bytes>8192){handled=true;socket.destroy();return;}
     buf+=chunk;const at=buf.indexOf('\n');if(at<0)return;handled=true;
     try{
      const value=JSON.parse(buf.slice(0,at));
      if(value?.schema!=='arns-mesh-network-rendezvous/v1'||value.networkId!==scope.id||Object.keys(value).some(k=>!['schema','networkId','peer'].includes(k)))throw new Error('invalid_rendezvous_reply');
      if(value.peer){
       verifyAdvertisement(value.peer,scope,this.now());
       this.offers=this.offers.filter(t=>this.now()-t<60000);
       if(this.offers.length>=8)throw new Error('rendezvous_offer_budget');
       this.offers.push(this.now());this.received++;
       void Promise.resolve(this.onPeer(value.peer,{signal:controller.signal})).then(()=>{for(const resolve of this.waiters)resolve();this.waiters.clear();}).catch(e=>{this.lastError=String(e.message).slice(0,160);});
      }
     }catch(e){this.lastError=String(e.message).slice(0,160);}
     socket.end();
    });
    try{const peer=this.self?.()||null;socket.write(JSON.stringify({schema:'arns-mesh-network-rendezvous/v1',networkId:scope.id,peer})+'\n');}catch{socket.destroy();}
   });
   // Keep one network topic apart from content-topic eviction. New supporters
   // can appear after every address in the invitation has disappeared.
   this.discovery=swarm.join(networkTopic(scope.id),{server:Boolean(this.self),client:true});
   this.discovery.flushed().catch(e=>{if(session===this.session)this.lastError=String(e.message).slice(0,160);});
   this.startedAt=this.now();return true;
  })();this.starting=work;try{return await work;}finally{if(this.starting===work)this.starting=null;}
 }
 async sync({signal,timeoutMs=4000}={}){
  signal?.throwIfAborted();if(!await this.start({signal}))return;signal?.throwIfAborted();
  await new Promise((resolve,reject)=>{
   let timer;const finish=()=>{cleanup();resolve();},cancel=()=>{cleanup();reject(signal.reason||new Error('rendezvous_cancelled'));};
   const cleanup=()=>{clearTimeout(timer);this.waiters.delete(finish);signal?.removeEventListener('abort',cancel);};
   this.waiters.add(finish);timer=setTimeout(finish,Math.max(0,Math.min(8000,timeoutMs)));signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  });
 }
 async close(){
  // Repeated stops must cancel starts waiting on the same close promise.
  this.lifecycle++;
  if(this.stopping)return this.stopping;
  this.session++;this.controller?.abort(new Error('rendezvous_stopped'));for(const resolve of this.waiters)resolve();this.waiters.clear();
  const swarm=this.swarm,dht=this.dht;this.swarm=null;this.dht=null;this.id=null;
  for(const socket of this.sockets)socket.destroy();this.sockets.clear();
  const work=(async()=>{try{await swarm?.destroy();}finally{await dht?.destroy();}})();this.stopping=work;
  try{await work;}finally{if(this.stopping===work)this.stopping=null;}
 }
 status(){return {enabled:Boolean(this.scope()?.bootstrap?.length),running:Boolean(this.swarm),received:this.received,startedAt:this.startedAt,error:this.lastError};}
}
