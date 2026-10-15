import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {checkNameWitnesses,runNameWitnessCheck} from '../scripts/check-name-witnesses.mjs';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,witnessKeyId} from '../src/name-certificates.mjs';

// These are simulated operator keys and injected HTTP couriers. They test real
// authentication/aggregation, not independence or actual network reachability.
function fixture(n=4,q=3,f=1){
 const start=Math.floor(Date.now()/60000)*60000;let clock=start+30000;
 const keys=Array.from({length:n},(_,i)=>({domain:'operator-'+i,...crypto.generateKeyPairSync('ed25519')}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'probe-test',chainId:'solana:11111111111111111111111111111111',registryProgramId:'1'.repeat(32),threshold:q,maxFaults:f,roundMs:60000,leaseMs:120000,maxFutureSkewMs:1000,validFrom:start-60000,validUntil:start+3600000,witnesses:keys.map(key=>({domain:key.domain,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}))};
 const policyId=namePolicyId(policy),target='A'.repeat(43);
 const vote=(i,txId=target)=>{const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:'1'.repeat(32),antProgramId:'1'.repeat(32),txId,round:start/60000,slot:100+i,observedAt:start+10,issuedAt:start+20});return{keyId:witnessKeyId(policy.witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[i].privateKey).toString('base64url')};};
 const reply=(observations=[],certificates=[])=>({ok:true,recordJson:JSON.stringify({schema:'arns-mesh-name-certificate-reply/v1',name:'alpha',policyId,observations,certificates})});
 const peers=Array.from({length:n},(_,i)=>({host:'192.0.2.'+(i+1),port:49741}));
 const options={policy,policyId,name:'alpha',peers,timeoutMs:25,now:()=>clock};
 return{policy,policyId,options,keys,peers,vote,reply,target,setClock:value=>{clock=value;},start};
}

test('a simulated four-witness pilot authenticates three matching original signatures',async()=>{
 const f=fixture(),r=await checkNameWitnesses({...f.options,directQuery:async peer=>f.reply([f.vote(Number(peer.host.split('.').at(-1))-1)])});
 assert.equal(r.ready,true);assert.equal(r.requiredDomains,3);assert.equal(r.configuredDomains,4);assert.equal(r.txId,f.target);assert.equal(r.contentChecked,false);assert.equal(r.readerStateWritten,false);assert.equal(r.currentStateVerified,false);assert.equal(r.operatorIndependence,'requires-external-verification');
});
test('ten configured witnesses require seven matching domains, not three or six',async()=>{
 for(const available of [3,6,7]){
  const f=fixture(10,7,3),r=await checkNameWitnesses({...f.options,directQuery:async peer=>{const i=Number(peer.host.split('.').at(-1))-1;return f.reply(i<available?[f.vote(i)]:[]);}});
  assert.equal(r.ready,available>=7);assert.equal(r.requiredDomains,7);assert.equal(r.configuredDomains,10);
 }
});
test('copied observations cannot make one operator into a quorum',async()=>{
 const f=fixture(),one=f.vote(0),r=await checkNameWitnesses({...f.options,directQuery:async()=>f.reply([one,one,one])});
 assert.equal(r.ready,false);assert.equal(r.authenticatedDomains,1);
});
test('one courier can deliver a complete original seven-domain certificate',async()=>{
 const f=fixture(10,7,3),certificate={schema:'arns-mesh-name-certificate/v1',round:f.start/60000,observations:Array.from({length:7},(_,i)=>f.vote(i))};
 const r=await checkNameWitnesses({...f.options,peers:[f.peers[0]],directQuery:async()=>f.reply([], [certificate])});
 assert.equal(r.ready,true);assert.equal(r.courierEndpoints,1);assert.equal(r.authenticatedDomains,7);
});
test('expired proof fails current mode and remains explicitly dated history',async()=>{
 const f=fixture(),certificate={schema:'arns-mesh-name-certificate/v1',round:f.start/60000,observations:[0,1,2].map(i=>f.vote(i))};f.setClock(f.start+240000);
 const args={...f.options,peers:[f.peers[0]],directQuery:async()=>f.reply([], [certificate])};
 assert.equal((await checkNameWitnesses(args)).ready,false);const history=await checkNameWitnesses({...args,mode:'historical'});
 assert.equal(history.ready,true);assert.equal(history.historical,true);assert.equal(history.currentWindow,false);assert.equal(history.observedAt,new Date(f.start+10).toISOString());
});
test('a different target or invalid signatures cannot turn the selected mapping into a quorum',async()=>{
 const f=fixture(),votes=[f.vote(0),f.vote(1),f.vote(2,'B'.repeat(43))];
 const r=await checkNameWitnesses({...f.options,peers:[f.peers[0]],directQuery:async()=>f.reply(votes)});assert.equal(r.ready,false);
 votes[2]=f.vote(2);votes[2].recordJson= votes[2].recordJson.replace(f.target,'B'.repeat(43));
 assert.equal((await checkNameWitnesses({...f.options,peers:[f.peers[0]],directQuery:async()=>f.reply(votes)})).ready,false);
});

test('skew-tolerated future evidence is not a current readiness pass',async()=>{
 const f=fixture(),begins=f.start+60000,round=begins/60000;
 const observations=[0,1,2].map(i=>{
  const recordJson=createNameObservation(f.policy,{name:'alpha',purpose:'current',antId:'1'.repeat(32),antProgramId:'1'.repeat(32),txId:f.target,round,slot:200+i,observedAt:begins,issuedAt:begins});
  return {keyId:witnessKeyId(f.policy.witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),f.keys[i].privateKey).toString('base64url')};
 });
 const certificate={schema:'arns-mesh-name-certificate/v1',round,observations};
 f.setClock(begins-1);
 const args={...f.options,peers:[f.peers[0]],directQuery:async()=>f.reply([], [certificate])};
 const early=await checkNameWitnesses(args);assert.equal(early.ready,false);assert.equal(early.status,'outside-current-window');assert.equal(early.currentWindow,false);
 f.setClock(begins);assert.equal((await checkNameWitnesses(args)).ready,true);
});
test('wrong policy pin and invalid CLI input are rejected before contacting any endpoint',async()=>{
 const f=fixture();let calls=0;const directQuery=async()=>{calls++;throw Error('must not query');};
 await assert.rejects(checkNameWitnesses({...f.options,policyId:'0'.repeat(64),directQuery}),/pin_mismatch/);
 await assert.rejects(runNameWitnessCheck(['--private-key','DO_NOT_ECHO'],{directQuery}),/probe_usage/);assert.equal(calls,0);
});
test('cancellation preserves caller reason and stops active certificate requests',async()=>{
 const f=fixture(),controller=new AbortController();let aborted=0;
 const work=checkNameWitnesses({...f.options,signal:controller.signal,directQuery:async(_peer,_req,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(signal.reason);},{once:true}))});
 controller.abort(new Error('pilot_cancelled'));await assert.rejects(work,/pilot_cancelled/);assert.ok(aborted>0);
});
