import net from 'node:net';
import {loadDirectPeers} from './direct-peer.mjs';
import {requestIpJson} from './ip-transport.mjs';
import {loadHyperBootstrap} from './hyper-bootstrap.mjs';
import {swarmTopic,locationIndexTopic} from './swarm-common.mjs';
import {accountBudgetBytes} from './byte-budget.mjs';
import {namePolicyId} from './name-certificates.mjs';

const MAX_RESPONSE_BYTES=512*1024,MAX_RESPONSE_VOTES=128,MAX_CONNECTIONS=32;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function directPeers(input){
 if(!Array.isArray(input)||input.length>256)fail('name_certificate_peers_invalid');
 const peers=new Map();
 for(const value of input){
  if(!value||typeof value.host!=='string'||!net.isIP(value.host)||!integer(value.port,1,65535))continue;
  const key=JSON.stringify([value.host,value.port]);
  if(!peers.has(key))peers.set(key,{host:value.host,port:value.port});
  if(peers.size===16)break;
 }
 return [...peers.values()];
}
async function directQueryDefault(peer,request,{signal,timeoutMs,maxBytes}){
 return requestIpJson({...peer,path:'/mesh/v1/query',method:'POST',body:request,purpose:'mesh-peer',maxBytes,timeout:timeoutMs,signal});
}
async function dhtDefault({bootstrapFile,signal}){
 const [{default:Hyperswarm},{default:DHT}]=await Promise.all([import('hyperswarm'),import('hyperdht')]);
 signal.throwIfAborted();
 const dht=new DHT({bootstrap:loadHyperBootstrap({bootstrapFile})});
 try{return {swarm:new Hyperswarm({dht}),dht};}catch(error){await dht.destroy();throw error;}
}
// Couriers are not voters. The unsigned routing wrapper only selects the
// bounded original observations fed into the authenticating collector.
function responseVotes(envelope,name,policyId){
 if(!envelope||envelope.ok!==true||typeof envelope.recordJson!=='string'||Buffer.byteLength(envelope.recordJson)>MAX_RESPONSE_BYTES)return null;
 let record;try{record=JSON.parse(envelope.recordJson);}catch{return null;}
 if(!record||record.schema!=='arns-mesh-name-certificate-reply/v1'||record.name!==name||record.policyId!==policyId)return null;
 if(!Array.isArray(record.observations)||record.observations.length>64||!Array.isArray(record.certificates)||record.certificates.length>8)return null;
 const votes=[...record.observations];
 for(const cert of record.certificates){
  if(!cert||cert.schema!=='arns-mesh-name-certificate/v1'||!integer(cert.round,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(cert.observations)||cert.observations.length>64)continue;
  if(votes.length+cert.observations.length>MAX_RESPONSE_VOTES)return null;
  votes.push(...cert.observations);
 }
 return votes;
}
export async function collectNameCertificates({
 name,policy,collector,mode='current',signal,peers=loadDirectPeers(),bootstrapFile,
 peerKeys=[],timeoutMs=12000,dhtEnabled=true,floor=null,
 directQuery=directQueryDefault,createDhtTransport=dhtDefault,now=()=>Date.now()
}={}){
 signal?.throwIfAborted();
 if(typeof name!=='string'||!/^[a-z0-9_-]{1,255}$/.test(name)||!['current','historical'].includes(mode)||!integer(timeoutMs,1,60000)||!collector||typeof collector.add!=='function'||typeof collector.best!=='function'||typeof now!=='function')fail('name_certificate_query_invalid');
 if(!Array.isArray(peerKeys)||peerKeys.length>64)fail('name_certificate_peer_keys_invalid');
 const keys=[...new Set(peerKeys.filter(key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key)))].slice(0,32);
 const addresses=directPeers(peers),policyId=namePolicyId(policy);
 if(collector.name!==name||collector.policyId!==policyId||collector.purpose!=='current')fail('name_certificate_collector_scope_mismatch');
 const batchSize=Number.isSafeInteger(collector.maxBatch)?Math.min(64,collector.maxBatch):64;
 if(batchSize<1)fail('name_certificate_query_invalid');
 const request={op:'name-certificates',name,policyId,historical:mode==='historical'};
 const controller=new AbortController(),sockets=new Set(),discoveries=[];
 let swarm,dht,settled=false,timer,resolveDone,rejectDone,lastSemantic,connectionCount=0;
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
 const cleanup=async()=>{
  for(const socket of sockets){try{socket.destroy();}catch{}}sockets.clear();
  await Promise.allSettled(discoveries.map(discovery=>Promise.resolve().then(()=>discovery.destroy())));
  if(swarm){try{await swarm.destroy();}catch{}}
  if(dht){try{await dht.destroy();}catch{}}
 };
 const finish=(error,result=null)=>{
  if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
  controller.abort(error||new Error('name_certificate_query_finished'));
  // Socket destruction is synchronous; teardown promises are bounded so a
  // transport implementation cannot hold up cancellation or a verified answer.
  const close=cleanup();let cleanupTimer;
  const bounded=new Promise(resolve=>{cleanupTimer=setTimeout(resolve,500);});
  Promise.race([close,bounded]).finally(()=>{clearTimeout(cleanupTimer);if(error)rejectDone(error);else resolveDone(result);});
 };
 const cancel=()=>finish(signal.reason||new Error('name_certificate_query_cancelled'));
 const candidate=()=>{
  try{return collector.best({floor,mode,now:now()});}
  catch(error){
   // New evidence may exclude one domain while another honest reply is still
   // in flight. Preserve this failure unless a complete valid quorum repairs it.
   if(error.code==='name_certificate_quorum_rejected'){lastSemantic=error;return null;}
   throw error;
  }
 };
 const consider=()=>{
  if(settled)return;
  try{const best=candidate();if(best){lastSemantic=null;finish(null,best);}}
  catch(error){finish(error);}
 };
 const finishCandidate=()=>{
  if(settled)return;
  try{const best=candidate();finish(best?null:lastSemantic,best);}
  catch(error){finish(error);}
 };
 const feed=envelope=>{
  if(settled)return;
  const votes=responseVotes(envelope,name,policyId);if(!votes)return;
  try{
   for(let offset=0;offset<votes.length;offset+=batchSize)collector.add(votes.slice(offset,offset+batchSize),{mode,now:now()});
   // Check once after the whole bounded reply, including any equivocation in it.
   consider();
  }catch(error){finish(error);}
 };
 signal?.addEventListener('abort',cancel,{once:true});
 if(signal?.aborted){cancel();return done;}
 timer=setTimeout(finishCandidate,timeoutMs);
 consider();if(settled)return done;
 let cursor=0;
 const directWorker=async()=>{
  while(!settled&&cursor<addresses.length){
   const peer=addresses[cursor++];
   try{feed(await directQuery(peer,request,{signal:controller.signal,timeoutMs,maxBytes:MAX_RESPONSE_BYTES}));}
   catch(error){if(signal?.aborted)cancel();/* Untrusted courier or transport miss. */}
  }
 };
 const directWorkers=Array.from({length:Math.min(4,addresses.length)},()=>directWorker());
 void Promise.allSettled(directWorkers).then(()=>{
  // With discovery disabled, exhausted couriers cannot supply further evidence.
  // Keep the deadline's exact quorum/error semantics, after every queued peer.
  if(!dhtEnabled)finishCandidate();
 });
 if(dhtEnabled)void (async()=>{
  let created;
  try{
   created=await createDhtTransport({bootstrapFile,signal:controller.signal});
   if(settled){try{await created.swarm.destroy();}catch{}try{await created.dht?.destroy();}catch{}return;}
   swarm=created.swarm;dht=created.dht;
   swarm.on('error',()=>{});
   swarm.on('connection',socket=>{
    if(settled||connectionCount++>=MAX_CONNECTIONS){socket.destroy();return;}
    sockets.add(socket);let size=0,chunks=[],handled=false;
    const close=()=>{sockets.delete(socket);};socket.once('close',close);socket.on('error',()=>{});
    socket.setTimeout(Math.min(timeoutMs,8000),()=>socket.destroy());
    socket.on('data',chunk=>{
     if(settled||handled)return;
     const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
     try{accountBudgetBytes(bytes.length);}catch(error){finish(error);return;}
     size+=bytes.length;
     if(size>MAX_RESPONSE_BYTES){handled=true;socket.destroy();return;}
     const end=bytes.indexOf(10);
     chunks.push(end<0?bytes:bytes.subarray(0,end));
     if(end<0)return;
     handled=true;
     let envelope;try{envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{socket.destroy();return;}
     chunks=[];feed(envelope);socket.destroy();
    });
    try{socket.write(JSON.stringify(request)+'\n');}catch{socket.destroy();}
   });
   for(const topic of [swarmTopic('name',name),locationIndexTopic()])discoveries.push(swarm.join(topic,{server:false,client:true}));
   for(const key of keys)swarm.joinPeer(Buffer.from(key,'hex'));
  }catch(error){
   // Discovery/connection failures do not cancel still useful direct requests.
   // The deadline and caller cancellation remain authoritative.
   if(signal?.aborted)cancel();
   if(created?.swarm&&created.swarm!==swarm){try{await created.swarm.destroy();}catch{}}
   if(created?.dht&&created.dht!==dht){try{await created.dht.destroy();}catch{}}
  }
 })();
 return done;
}

