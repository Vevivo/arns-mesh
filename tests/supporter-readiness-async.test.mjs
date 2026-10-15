import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import {supporterReadiness,supporterReadinessAsync} from '../src/supporter-readiness.mjs';
import {createNameSecurityRuntime} from '../src/name-security-runtime.mjs';
import {createNameObservation,nameObservationSigningBytes,witnessKeyId} from '../src/name-certificates.mjs';
import {initialCertificateState} from '../src/name-certificate-state.mjs';

const TARGET='A'.repeat(43),PROGRAM='11111111111111111111111111111111',START=1800000000000;
const clone=value=>JSON.parse(JSON.stringify(value));
function legacyFixture(count=13000){
 const names=Array.from({length:count},(_,i)=>'ready-'+i),rows=Object.fromEntries(names.map(name=>[name,{rootDataId:TARGET,snapshot:{antId:PROGRAM}}]));
 let checked=0,onRecord=()=>{};
 const options={
  getNameContext:()=>null,snapshots:{names:()=>names,exportLocal:name=>({name,txId:TARGET,antId:PROGRAM,provenance:{kind:'local-rpc'}})},
  relay:{entries:()=>[],status:()=>({acceptedRecords:0})},trustedPeerIds:['own'],ownPeerId:'own',
  pinners:[{rows,readySnapshot:()=>null,isReady:()=>{onRecord(++checked);return true;}}],contentStore:{has:()=>true},
 };
 return {options,count,checked:()=>checked,onRecord:fn=>{onRecord=fn;}};
}
class MemoryDriver{
 constructor(state){this.state=clone(state);}
 transaction(work){const result=work(clone(this.state));if(result.state!==undefined)this.state=clone(result.state);return result.value;}
}
async function protectedFixture(count=40){
 const names=Array.from({length:count},(_,i)=>'secured-'+i),keys=Array.from({length:4},()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,index)=>({domain:'fixture-'+index,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'readiness-async-test',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:PROGRAM,threshold:3,maxFaults:1,roundMs:60000,leaseMs:120000,maxFutureSkewMs:1000,validFrom:START-600000,validUntil:START+360000,witnesses};
 let configured=policy,readies=0,roots=0,onReady=()=>{};const drivers=new Map();
 const runtime=createNameSecurityRuntime({
  env:{ARNS_NAME_WITNESS_POLICY:path.resolve('readiness-test-fixture','name-witness-policy.json')},now:()=>START+30000,readPolicy:()=>configured,
  driverForName:(name,{policy:current})=>{if(!drivers.has(name))drivers.set(name,new MemoryDriver(initialCertificateState(current)));return drivers.get(name);},
  collect:async()=>{throw new Error('local_report_must_not_fetch_names');},
 });
 const context=runtime.getContext(),snapshots=new Map();
 for(const name of names){
  const round=START/60000,certificate={schema:'arns-mesh-name-certificate/v1',round,observations:keys.slice(0,3).map((key,index)=>{
   const recordJson=createNameObservation(policy,{name,purpose:'current',antId:PROGRAM,antProgramId:PROGRAM,txId:TARGET,round,slot:100+index,observedAt:START+1000,issuedAt:START+1010});
   return {keyId:witnessKeyId(witnesses[index].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),key.privateKey).toString('base64url')};
  })};
  snapshots.set(name,context.snapshotFrom(await context.store.accept(certificate,{name})));
 }
 const rows=Object.fromEntries(names.map(name=>[name,{rootDataId:TARGET,snapshot:snapshots.get(name)}]));
 const options={getNameContext:()=>runtime.getContext(),snapshots:{names:()=>names,exportLocal:()=>{throw new Error('legacy_authority_used');}},relay:{entries:()=>{throw new Error('legacy_relay_used');},status:()=>{throw new Error('legacy_status_used');}},contentStore:{has:()=>{roots++;return true;}},pinners:[{rows,readySnapshot:name=>{onReady(++readies);return snapshots.get(name)||null;},isReady:row=>{context.verifySnapshot(row.snapshot,{name:row.snapshot.name,mode:'historical'});return true;}}]};
 return {options,context,policy,snapshots,names,roots:()=>roots,readies:()=>readies,onReady:fn=>{onReady=fn;},setPolicy:value=>{configured=value;},revoke:()=>{policy.revoked=true;}};
}

test('async report preserves the synchronous legacy report including missing requested names',async()=>{
 const f=legacyFixture(48);f.options.names=['ready-2','missing','ready-2','ready-20'];
 f.options.contentStore.has=()=>false;
 const expected=supporterReadiness(f.options),actual=await supporterReadinessAsync(f.options);
 assert.deepEqual(actual,expected);assert.equal(actual.names.requested,3);assert.equal(actual.names.missing,1);assert.equal(actual.files.rootsStored,0);
 assert.equal(actual.ready,false);assert.deepEqual(actual.blockers,expected.blockers);
});

test('async report preserves original full-quorum verification and protected report results',async()=>{
 const f=await protectedFixture();
 const expected=supporterReadiness(f.options),actual=await supporterReadinessAsync(f.options);
 assert.deepEqual(actual,expected);assert.equal(actual.names.accepted,40);assert.equal(actual.files.completePreparedSites,40);
 assert.equal(actual.trust.threshold,3);assert.equal(actual.trust.relayedOriginalSignatures,null);
 assert.equal(actual.locallyPrepared,true);assert.equal(actual.ready,false);
});

test('async report rejects an incomplete or altered original certificate before examining content',async()=>{
 for(const alter of [snapshot=>{snapshot.provenance.certificate.observations.pop();},snapshot=>{snapshot.provenance.certificate.observations[0].recordJson=snapshot.provenance.certificate.observations[0].recordJson.replace(TARGET,'B'.repeat(43));}]){
  const f=await protectedFixture(1);alter(f.snapshots.get(f.names[0]));
  await assert.rejects(supporterReadinessAsync(f.options),/name_certificate_(quorum_unmet|signature_invalid)/);
  assert.equal(f.roots(),0);
 }
});

test('async report cancellation interrupts a large report without returning partial readiness',async t=>{
 const f=legacyFixture(),controller=new AbortController();let immediate;
 t.after(()=>{if(immediate)clearImmediate(immediate);});
 f.onRecord(checked=>{if(checked===33)immediate=setImmediate(()=>controller.abort(new Error('cancel_readiness_report')));});
 await assert.rejects(supporterReadinessAsync(f.options,{signal:controller.signal}),error=>error.message==='cancel_readiness_report'||error.cause?.message==='cancel_readiness_report');
 assert.ok(f.checked()>=33&&f.checked()<=48,'cancellation is observed by the next 16-name boundary');assert.ok(f.checked()<f.count);
 const early=new AbortController();early.abort(new Error('cancel_before_scan'));let started=false;
 await assert.rejects(supporterReadinessAsync({...f.options,getNameContext:()=>{started=true;return null;}},{signal:early.signal}),/cancel_before_scan/);assert.equal(started,false);
});

test('async report serves real HTTP and timers while checking a large catalogue',{timeout:15000},async t=>{
 const f=legacyFixture();let duringHttp=false,duringTimer=false,probe,timer;const requests=new Set();
 const server=http.createServer((_req,res)=>{duringHttp=f.checked()>32&&f.checked()<f.count;res.end('ok');});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const get=()=>new Promise((resolve,reject)=>{
  const request=http.get({host:'127.0.0.1',port:server.address().port},res=>{let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve(body));res.on('error',reject);});
  requests.add(request);request.on('close',()=>requests.delete(request));request.on('error',reject);
 });
 t.after(async()=>{clearTimeout(timer);for(const request of requests)request.destroy();await new Promise(resolve=>server.close(resolve));});
 await get();duringHttp=false;
 f.onRecord(checked=>{if(checked===33){probe=get();timer=setTimeout(()=>{duringTimer=f.checked()>32&&f.checked()<f.count;},0);}});
 const report=await supporterReadinessAsync(f.options);assert.equal(await probe,'ok');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(duringHttp,true,'peer request handled before catalogue report completed');assert.equal(duringTimer,true,'timers progressed during readiness checking');assert.equal(report.names.accepted,f.count);
});

test('async report refuses policy activation while a legacy report is yielding',async t=>{
 const f=legacyFixture(128);let active=null,immediate;
 f.options.getNameContext=()=>active;
 f.onRecord(checked=>{if(checked===1)immediate=setImmediate(()=>{active={policyId:'new-policy',assertCurrent(){}};});});
 t.after(()=>{if(immediate)clearImmediate(immediate);});
 await assert.rejects(supporterReadinessAsync(f.options),/name_security_context_changed/);assert.ok(f.checked()<f.count);
});

test('async report refuses real runtime policy revocation, replacement or removal at a yield',async t=>{
 for(const change of [f=>f.revoke(),f=>f.setPolicy({...f.policy,networkId:'replacement-policy'}),f=>f.setPolicy(null)]){
  const f=await protectedFixture();let immediate;
  f.onReady(checked=>{if(checked===1)immediate=setImmediate(()=>change(f));});
  t.after(()=>{if(immediate)clearImmediate(immediate);});
  await assert.rejects(supporterReadinessAsync(f.options),/name_policy_(revoked|migration_required)|name_witness_policy_required/);
  assert.equal(f.readies(),16);assert.equal(f.roots(),0);
 }
});

test('async report checks policy again at completion and never reuses prior authorization',async()=>{
 const f=await protectedFixture(1),expected=await supporterReadinessAsync(f.options);assert.equal(expected.names.accepted,1);
 const oldIsReady=f.options.pinners[0].isReady;
 f.options.pinners[0].isReady=row=>{const ready=oldIsReady(row);f.revoke();return ready;};
 await assert.rejects(supporterReadinessAsync(f.options),/name_policy_revoked/);
 await assert.rejects(supporterReadinessAsync(f.options),/name_policy_revoked/);
});
