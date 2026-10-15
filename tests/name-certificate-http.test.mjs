import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {NameCertificateSigner,CertifiedNameStore,initialSignerState,initialCertificateState} from '../src/name-certificate-state.mjs';
import {NameCertificateService} from '../src/name-certificate-service.mjs';
import {NameCertificateCollector} from '../src/name-certificate-collector.mjs';
import {collectNameCertificates} from '../src/name-certificate-transport.mjs';
import {namePolicyId,nameObservationSigningBytes,verifyNameObservation} from '../src/name-certificates.mjs';
import {requestIpJson} from '../src/ip-transport.mjs';
import {observeNetworkAudit} from '../src/network-audit.mjs';

// These are simulated operators with separate test keys and in-memory state.
// They do not demonstrate independence of real production administrators.
// Only name metadata is exchanged; the tests store no Arweave content.
const NAME='alpha',PROGRAM='11111111111111111111111111111111',TARGET='A'.repeat(43),WRONG='B'.repeat(43);
const START=1800000000000,ROUND_MS=60000,GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const clone=value=>JSON.parse(JSON.stringify(value));
let networkDenied=null;
function loopbackTest(name,work){
 test(name,{timeout:10000},async t=>{
  if(networkDenied){t.skip('Loopback was denied by the operating system; no alternate transport attempted.');return;}
  try{return await work(t);}
  catch(error){if(['EACCES','EPERM'].includes(error.code))networkDenied=error;throw error;}
 });
}
class MemoryTransactions{
 constructor(state){this.state=clone(state);}
 transaction(work){
  const result=work(clone(this.state));
  if(result.state!==undefined)this.state=clone(result.state);
  return result.value;
 }
}
function gate(){
 let release;
 const promise=new Promise(resolve=>{release=resolve;});
 return {promise,release};
}
async function until(predicate,message,timeoutMs=2000){
 const deadline=Date.now()+timeoutMs;
 while(!predicate()){
  if(Date.now()>=deadline)throw new Error(message);
  await delay(5);
 }
}
function fixture({count=4,threshold=3,maxFaults=1}={}){
 const keys=Array.from({length:count},()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,index)=>({domain:'simulated-operator-'+index,publicKeyPem:key.publicKey.export({format:'pem',type:'spki'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'http-integration-fixture',chainId:'solana:'+GENESIS,registryProgramId:PROGRAM,threshold,maxFaults,roundMs:ROUND_MS,leaseMs:120000,maxFutureSkewMs:1000,validFrom:START-600000,validUntil:START+86400000,witnesses};
 let clock=START+30000;
 const now=()=>clock;
 const stores=witnesses.map(()=>new CertifiedNameStore({policy,driver:new MemoryTransactions(initialCertificateState(policy)),now}));
 const targets=keys.map(()=>TARGET);
 const signers=keys.map((key,index)=>new NameCertificateSigner({
  policy,privateKeyPem:key.privateKey.export({format:'pem',type:'pkcs8'}),
  driver:new MemoryTransactions(initialSignerState(policy,witnesses[index].publicKeyPem)),now,
  observe:async(name,{signal})=>{
   signal?.throwIfAborted();
   return {schema:'arns-mesh-coherent-name-observation/v1',name,chainId:policy.chainId,genesisHash:GENESIS,registryProgramId:PROGRAM,antId:PROGRAM,antProgramId:PROGRAM,txId:targets[index],slot:1000+index,observedAt:new Date(clock-1).toISOString(),leaseEndsAt:null,provenance:{coherentAccountRead:true,strictAssetValidation:true,finalizedCommitmentRequested:true,genesisChecked:true}};
  }
 }));
 const services=signers.map((signer,index)=>new NameCertificateService({policy,signer,store:stores[index],now}));
 const collector=()=>new NameCertificateCollector({policy,name:NAME,now});
 const run=(peers,options={})=>collectNameCertificates({name:NAME,policy,collector:options.collector??collector(),peers,dhtEnabled:false,timeoutMs:3000,now,...options});
 const reply=(observations=[],certificates=[])=>({schema:'arns-mesh-name-certificate-reply/v1',name:NAME,policyId:namePolicyId(policy),observations,certificates});
 return {policy,keys,stores,targets,signers,services,now,collector,run,reply,setNow:value=>{clock=value;}};
}
async function serve(t,handler){
 const sockets=new Set(),state={requests:0,aborted:0};
 const server=http.createServer((request,response)=>{
  const controller=new AbortController();state.requests++;
  response.on('close',()=>{if(!response.writableEnded){state.aborted++;controller.abort(new Error('HTTP client disconnected'));}});
  let bytes=0,body='';
  request.on('error',()=>{});
  request.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192){request.destroy();return;}body+=chunk;});
  request.on('end',async()=>{
   try{
    assert.equal(request.method,'POST');assert.equal(request.url,'/mesh/v1/query');
    const record=await handler(JSON.parse(body),{signal:controller.signal,response});
    if(record===null||response.destroyed||response.writableEnded)return;
    response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    response.end(JSON.stringify({ok:true,recordJson:JSON.stringify(record)}));
   }catch(error){
    if(!response.destroyed&&!response.writableEnded){response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({ok:false,error:error.message}));}
   }
  });
 });
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 t.after(async()=>{
  server.closeAllConnections();
  if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 });
 await new Promise((resolve,reject)=>{
  const failed=error=>{server.removeListener('listening',ready);reject(error);};
  const ready=()=>{server.removeListener('error',failed);resolve();};
  server.once('error',failed);server.once('listening',ready);
  server.listen({host:'127.0.0.1',port:0,exclusive:true});
 });
 return {peer:{host:'127.0.0.1',port:server.address().port},state,sockets,server};
}
const serviceHandler=service=>(request,{signal})=>service.reply(request,{signal});

loopbackTest('actual IP HTTP request reaches the real signer and service with a verifiable original observation',async t=>{
 const f=fixture(),server=await serve(t,serviceHandler(f.services[0])),events=[];
 const stop=observeNetworkAudit(event=>events.push(event));t.after(stop);
 const envelope=await requestIpJson({...server.peer,path:'/mesh/v1/query',method:'POST',body:{op:'name-certificates',name:NAME,policyId:namePolicyId(f.policy),historical:false},purpose:'mesh-peer',maxBytes:512*1024,timeout:2000});
 assert.equal(envelope.ok,true);
 const reply=JSON.parse(envelope.recordJson);assert.equal(reply.observations.length,1);
 const record=JSON.parse(reply.observations[0].recordJson);
 const checked=verifyNameObservation(reply.observations[0],f.policy,{name:NAME,round:record.round,now:f.now()});
 assert.equal(checked.record.txId,TARGET);assert.equal(checked.domain,'simulated-operator-0');
 assert.equal(server.state.requests,1);
 assert(events.some(event=>event.type==='response'&&event.purpose==='mesh-peer'&&event.remoteAddress==='127.0.0.1'),'actual numeric-IP transport recorded the loopback response');
});

loopbackTest('three honest HTTP supporters form quorum despite a fast wrong target and repeated relay copies',async t=>{
 const f=fixture(),collector=f.collector(),release=gate();f.targets[0]=WRONG;t.after(release.release);
 const wrong=await f.signers[0].issue(NAME);
 const bad=await serve(t,async()=>f.reply(Array.from({length:8},()=>wrong)));
 const honest=[];
 for(let index=1;index<4;index++)honest.push(await serve(t,async(request,options)=>{await release.promise;return f.services[index].reply(request,options);}));
 let completed=false;
 const work=f.run([bad.peer,...honest.map(server=>server.peer)],{collector}).finally(()=>{completed=true;});
 await until(()=>collector.stats().partialDomains===1,'Fast signed bad response was not received');
 assert.equal(completed,false,'one signed domain cannot provide an accepted name binding');
 assert.equal(collector.best(),null);release.release();
 const accepted=await work;
 assert.equal(accepted.verification.binding.txId,TARGET);
 assert.deepEqual(accepted.verification.domains,['simulated-operator-1','simulated-operator-2','simulated-operator-3']);
 assert.equal(bad.state.requests,1);assert(honest.every(server=>server.state.requests===1));
});

loopbackTest('three HTTP couriers relaying one original signer never become three independent votes',async t=>{
 const f=fixture(),one=await f.signers[0].issue(NAME),servers=[];
 for(let index=0;index<3;index++)servers.push(await serve(t,async()=>f.reply([one,one,one])));
 const result=await f.run(servers.map(server=>server.peer),{timeoutMs:150});
 assert.equal(result,null);assert(servers.every(server=>server.state.requests===1));
});

loopbackTest('ten real HTTP endpoints require seven honest domains despite three wrong targets, then one courier can relay the full proof',async t=>{
 const f=fixture({count:10,threshold:7,maxFaults:3}),servers=[];
 for(let i=0;i<3;i++)f.targets[i]=WRONG;
 let honestAvailable=6;
 for(let i=0;i<10;i++)servers.push(await serve(t,(request,options)=>i<3||i-3<honestAvailable?f.services[i].reply(request,options):f.reply()));
 const endpoints=servers.map(server=>server.peer);
 assert.equal(await f.run(endpoints,{timeoutMs:500}),null,'three wrong plus six honest observations do not meet either threshold');
 honestAvailable=7;
 const accepted=await f.run(endpoints);
 assert.equal(accepted.verification.binding.txId,TARGET);
 assert.equal(accepted.verification.domains.length,7);
 assert.ok(accepted.verification.domains.every(domain=>Number(domain.split('-').at(-1))>=3));
 const courier=await serve(t,()=>f.reply([], [accepted.certificate]));
 const relayed=await f.run([courier.peer]);
 assert.equal(relayed.verification.binding.txId,TARGET);
 assert.equal(relayed.verification.domains.length,7);
 assert.equal(courier.state.requests,1);
});

loopbackTest('same-round HTTP equivocation is excluded while the three honest signers remain usable',async t=>{
 const f=fixture(),collector=f.collector(),release=gate();t.after(release.release);
 const original=await f.signers[0].issue(NAME),recordJson=JSON.stringify({...JSON.parse(original.recordJson),txId:WRONG});
 // A compromised key can bypass the honest issuer's durable sign-once rule.
 const conflicting={...original,recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),f.keys[0].privateKey).toString('base64url')};
 const bad=await serve(t,async()=>f.reply([original,conflicting])),honest=[];
 for(let index=1;index<4;index++)honest.push(await serve(t,async(request,options)=>{await release.promise;return f.services[index].reply(request,options);}));
 const work=f.run([bad.peer,...honest.map(server=>server.peer)],{collector});
 await until(()=>collector.stats().retainedVotes===2,'Equivocation evidence was not received');
 assert.equal(collector.best(),null);release.release();
 const accepted=await work;
 assert.equal(accepted.verification.binding.txId,TARGET);
 assert.deepEqual(accepted.verification.domains,['simulated-operator-1','simulated-operator-2','simulated-operator-3']);
 assert.deepEqual(accepted.verification.discardedDomains,[{domain:'simulated-operator-0',reason:'equivocation'}]);
});

loopbackTest('an expired original certificate replayed over HTTP remains dated history and cannot become current',async t=>{
 const f=fixture(),observations=await Promise.all([0,1,2].map(index=>f.signers[index].issue(NAME)));
 const certificate={schema:'arns-mesh-name-certificate/v1',round:Math.floor(f.now()/ROUND_MS),observations};
 const accepted=await f.stores[0].accept(certificate,{name:NAME,mode:'current'});
 const originalDates={observedAt:accepted.verification.observedAt,issuedAt:accepted.verification.issuedAt,expiresAt:accepted.verification.expiresAt};
 f.setNow(originalDates.expiresAt+1);
 const relay=new NameCertificateService({policy:f.policy,store:f.stores[0],now:f.now});
 const server=await serve(t,serviceHandler(relay));
 assert.equal(await f.run([server.peer],{timeoutMs:150}),null);
 const historical=await f.run([server.peer],{mode:'historical'});
 assert.equal(historical.verification.historical,true);assert.equal(historical.verification.currentWindow,false);
 for(const [field,value]of Object.entries(originalDates))assert.equal(historical.verification[field],value);
 assert.deepEqual(historical.certificate.observations,certificate.observations);
 assert.equal(server.state.requests,2);
});

loopbackTest('caller cancellation closes all real outstanding HTTP requests and preserves its reason',async t=>{
 const f=fixture(),controller=new AbortController(),reason=new Error('cancel actual HTTP name lookup'),servers=[],started=[];
 for(let index=0;index<4;index++){
  const ready=gate();started.push(ready);
  servers.push(await serve(t,async(request,{signal})=>{
   ready.release();
   await new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return;}
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
   });
  }));
 }
 const work=f.run(servers.map(server=>server.peer),{signal:controller.signal});
 await Promise.all(started.map(ready=>ready.promise));controller.abort(reason);
 await assert.rejects(work,error=>error===reason);
 await until(()=>servers.every(server=>server.sockets.size===0&&server.state.aborted===1),'Cancelled HTTP requests remained open');
});

loopbackTest('an oversized actual HTTP reply is stopped at the byte limit without suppressing honest quorum',async t=>{
 const f=fixture(),release=gate(),events=[];t.after(release.release);
 const stop=observeNetworkAudit(event=>events.push(event));t.after(stop);
 const bad=await serve(t,async(request,{response})=>{
  response.writeHead(200,{'content-type':'application/json'});
  response.end(JSON.stringify({ok:true,recordJson:'x'.repeat(600*1024)}));return null;
 }),honest=[];
 for(let index=1;index<4;index++)honest.push(await serve(t,async(request,options)=>{await release.promise;return f.services[index].reply(request,options);}));
 const work=f.run([bad.peer,...honest.map(server=>server.peer)]);
 await until(()=>events.some(event=>event.type==='request-error'&&event.port===bad.peer.port&&event.error==='response_too_large'),'Oversized HTTP reply was not rejected');
 release.release();const result=await work;
 assert.equal(result.verification.binding.txId,TARGET);
 assert.deepEqual(result.verification.domains,['simulated-operator-1','simulated-operator-2','simulated-operator-3']);
});

