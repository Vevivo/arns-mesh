import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {NameCertificateCollector} from '../src/name-certificate-collector.mjs';
import {collectNameCertificates} from '../src/name-certificate-transport.mjs';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,witnessKeyId} from '../src/name-certificates.mjs';
const program='11111111111111111111111111111111',target='A'.repeat(43),start=1800000000000,roundMs=60000,round=start/roundMs;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const peers=n=>Array.from({length:n},(_,i)=>({host:'127.0.0.1',port:5000+i}));
function fixture(){
 const keys=Array.from({length:4},()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,i)=>({domain:String.fromCharCode(97+i),publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'network-one',chainId:'solana-mainnet-genesis',registryProgramId:program,threshold:3,maxFaults:1,roundMs,leaseMs:120000,maxFutureSkewMs:1000,validFrom:start-600000,validUntil:start+86400000,witnesses};
 let now=start+30000;
 const observation=(i,patch={})=>{const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId:target,round,slot:100+i,observedAt:start+1000,issuedAt:start+1010,...patch});return {keyId:witnessKeyId(witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[i].privateKey).toString('base64url')};};
 const reply=(observations=[],certificates=[])=>({ok:true,recordJson:JSON.stringify({schema:'arns-mesh-name-certificate-reply/v1',name:'alpha',policyId:namePolicyId(policy),observations,certificates})});
 const collector=()=>new NameCertificateCollector({policy,name:'alpha',now:()=>now});
 const run=(options={})=>collectNameCertificates({name:'alpha',policy,collector:options.collector??collector(),peers:peers(4),dhtEnabled:false,timeoutMs:500,now:()=>now,...options});
 return {policy,observation,reply,collector,run,setNow:value=>{now=value;}};
}

test('a bad fast courier cannot terminate aggregation before three independent original votes arrive',async()=>{
 const f=fixture(),gates=new Map(),requests=[];let completed=false;
 const work=f.run({directQuery:(peer,request,options)=>{requests.push({peer,request,options});return new Promise(resolve=>gates.set(peer.port,resolve));}}).finally(()=>{completed=true;});
 assert.equal(gates.size,4);gates.get(5000)({ok:true,recordJson:'malformed'});await tick();assert.equal(completed,false);
 gates.get(5001)(f.reply([f.observation(0)]));await tick();assert.equal(completed,false);
 gates.get(5002)(f.reply([f.observation(1)]));await tick();assert.equal(completed,false);
 gates.get(5003)(f.reply([f.observation(2)]));
 const result=await work;assert.deepEqual(result.verification.domains,['a','b','c']);
 for(const call of requests){assert.equal(call.request.op,'name-certificates');assert.equal(call.request.historical,false);assert.equal(call.options.maxBytes,512*1024);assert.equal(call.options.signal.aborted,true);}
});

test('caller cancellation rejects with the original reason and aborts every in-flight direct query',async()=>{
 const f=fixture(),controller=new AbortController(),reason=new Error('user-cancelled');let active=0;
 const work=f.run({signal:controller.signal,directQuery:(peer,request,{signal})=>new Promise((resolve,reject)=>{
  active++;signal.addEventListener('abort',()=>{active--;reject(signal.reason);},{once:true});
 })});
 assert.equal(active,4);controller.abort(reason);
 await assert.rejects(work,error=>error===reason);assert.equal(active,0);
});

test('missing current quorum waits for its deadline; expired full quorum is available only as dated history',async()=>{
 const f=fixture(),observations=[0,1,2].map(i=>f.observation(i));f.setNow(start+roundMs+f.policy.leaseMs+1);
 const options={peers:peers(1),timeoutMs:30,directQuery:async()=>f.reply(observations)};
 const begin=Date.now();assert.equal(await f.run(options),null);assert(Date.now()-begin>=20);
 const history=await f.run({...options,mode:'historical'});
 assert.equal(history.verification.historical,true);assert.equal(history.verification.currentWindow,false);assert.equal(history.verification.observedAt,start+1000);
 assert.equal(history.verification.expiresAt,start+roundMs+f.policy.leaseMs);
});

test('only sixteen numeric direct peers are contacted, with at most four simultaneous requests',async()=>{
 const f=fixture();let active=0,peak=0;const contacted=[];
 const result=await f.run({peers:[{host:'example.invalid',port:5000},...peers(25)],timeoutMs:60,directQuery:async(peer)=>{
  contacted.push(peer);active++;peak=Math.max(peak,active);await tick();active--;return {ok:false,error:'unavailable'};
 }});
 assert.equal(result,null);assert.equal(contacted.length,16);assert(peak<=4);assert(peak>1);assert.equal(active,0);
 assert(contacted.every(peer=>peer.host==='127.0.0.1'));
});

test('all original votes in a reply are considered before a cached quorum can hide equivocation',async()=>{
 const f=fixture(),bad=f.observation(0,{txId:'B'.repeat(43)});
 const certificates=[{schema:'arns-mesh-name-certificate/v1',round,observations:[bad,f.observation(3)]}];
 const result=await f.run({peers:peers(1),directQuery:async()=>f.reply([0,1,2].map(i=>f.observation(i)),certificates)});
 assert.deepEqual(result.verification.domains,['b','c','d']);assert.deepEqual(result.verification.discardedDomains,[{domain:'a',reason:'equivocation'}]);
});

test('authenticated quorum rejection is preserved, but another honest response may restore quorum',async()=>{
 const f=fixture(),collector=f.collector();collector.add([0,1,2].map(i=>f.observation(i)));collector.add([f.observation(0,{txId:'B'.repeat(43)})]);
 await assert.rejects(f.run({collector,peers:[],timeoutMs:20}),error=>error.code==='name_certificate_quorum_rejected');
 const result=await f.run({collector,peers:peers(1),directQuery:async()=>f.reply([f.observation(3)])});
 assert.deepEqual(result.verification.domains,['b','c','d']);
});

test('policy/floor errors remain semantic failures and an oversized routing payload cannot poison good peers',async()=>{
 const f=fixture();let calls=0;
 const result=await f.run({directQuery:async peer=>{
  calls++;return peer.port===5000?{ok:true,recordJson:'x'.repeat(512*1024+1)}:f.reply([f.observation(peer.port-5001)]);
 }});
 assert.equal(calls,4);assert.equal(result.verification.domains.length,3);
 await assert.rejects(f.run({floor:{schema:'invalid'},peers:peers(1),directQuery:async()=>f.reply([0,1,2].map(i=>f.observation(i)))}),error=>error.code==='name_certificate_floor_invalid');
 const pinned=f.collector();f.policy.revoked=true;await assert.rejects(f.run({collector:pinned}),error=>error.code==='name_policy_revoked');
});

class Socket extends EventEmitter{
 constructor(envelope){super();this.envelope=envelope;this.destroyed=false;this.writes=0;}
 setTimeout(){return this;}
 write(request){this.writes++;this.request=JSON.parse(request);if(this.envelope)queueMicrotask(()=>{if(!this.destroyed)this.emit('data',Buffer.from(JSON.stringify(this.envelope)+'\n'));});return true;}
 destroy(){if(!this.destroyed){this.destroyed=true;this.emit('close');}}
}
function fakeDht(){
 const swarm=new EventEmitter(),joined=[];let swarmClosed=0,dhtClosed=0,discoveryClosed=0;
 swarm.join=(topic,options)=>{joined.push({topic,options});return {destroy:async()=>{discoveryClosed++;}};};
 swarm.joinPeer=()=>{};swarm.destroy=async()=>{swarmClosed++;};
 const dht={destroy:async()=>{dhtClosed++;}};
 return {swarm,dht,joined,closed:()=>({swarmClosed,dhtClosed,discoveryClosed})};
}

test('direct-IP and DHT votes share one collector and all discovery resources close at quorum',async()=>{
 const f=fixture(),transport=fakeDht();
 const work=f.run({peers:peers(1),dhtEnabled:true,createDhtTransport:async()=>transport,directQuery:async()=>f.reply([f.observation(0)])});
 await tick();assert.equal(transport.joined.length,2);
 const one=new Socket(f.reply([f.observation(1)])),two=new Socket(f.reply([f.observation(2)]));
 transport.swarm.emit('connection',one);transport.swarm.emit('connection',two);
 const result=await work;assert.deepEqual(result.verification.domains,['a','b','c']);
 assert.equal(one.destroyed,true);assert.equal(two.destroyed,true);assert.deepEqual(transport.closed(),{swarmClosed:1,dhtClosed:1,discoveryClosed:2});
});

test('DHT limits lifetime connections and rejects oversized frames while cleanup closes admitted sockets',async()=>{
 const f=fixture(),transport=fakeDht(),sockets=Array.from({length:34},()=>new Socket());
 const work=f.run({peers:[],timeoutMs:40,dhtEnabled:true,createDhtTransport:async()=>transport});
 await tick();for(const socket of sockets)transport.swarm.emit('connection',socket);
 assert.equal(sockets.filter(socket=>socket.writes).length,32);assert.equal(sockets[32].destroyed,true);assert.equal(sockets[33].destroyed,true);
 sockets[0].emit('data',Buffer.alloc(512*1024+1));
 assert.equal(sockets[0].destroyed,true);assert.equal(await work,null);assert(sockets.every(socket=>socket.destroyed));
 assert.deepEqual(transport.closed(),{swarmClosed:1,dhtClosed:1,discoveryClosed:2});
});

