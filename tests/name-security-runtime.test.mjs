import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {createNameSecurityRuntime} from '../src/name-security-runtime.mjs';
import {createNameObservation,nameObservationSigningBytes,witnessKeyId,namePolicyId} from '../src/name-certificates.mjs';
import {initialCertificateState} from '../src/name-certificate-state.mjs';

const START=1800000000000,ROUND_MS=60000,PROGRAM='11111111111111111111111111111111',TARGET='A'.repeat(43),OTHER='B'.repeat(43);
const clone=value=>JSON.parse(JSON.stringify(value));
const has=code=>error=>error.code===code||error.message===code;
class MemoryDriver{
 constructor(initial){this.state=clone(initial);this.writes=0;this.rejectCommit=false;}
 transaction(work){
  const result=work(clone(this.state));
  if(result.state!==undefined){if(this.rejectCommit)throw new Error('simulated_durable_commit_failure');this.state=clone(result.state);this.writes++;}
  return result.value;
 }
}
function fixture({absent=false}={}){
 const keys=Array.from({length:4},()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,index)=>({domain:'simulated-'+index,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'runtime-test',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:PROGRAM,threshold:3,maxFaults:1,roundMs:ROUND_MS,leaseMs:120000,maxFutureSkewMs:1000,validFrom:START-600000,validUntil:START+360000,witnesses};
 let clock=START+30000,configured=absent?null:policy,answer,collectCalls=0,collectHook=null;
 const env={ARNS_NAME_WITNESS_POLICY:path.resolve('runtime-test-fixture','name-witness-policy.json'),ARNS_MESH_DIRECT_ONLY:'1'};
 const drivers=new Map(),files=new Map();
 const cert=({name='alpha',round=Math.floor(START/ROUND_MS),txId=TARGET,indices=[0,1,2],slot=100}={})=>({
  schema:'arns-mesh-name-certificate/v1',round,observations:indices.map(index=>{
   const recordJson=createNameObservation(policy,{name,purpose:'current',antId:PROGRAM,antProgramId:PROGRAM,txId,round,slot:slot+index,observedAt:round*ROUND_MS+1000,issuedAt:round*ROUND_MS+1010});
   return {keyId:witnessKeyId(witnesses[index].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[index].privateKey).toString('base64url')};
  }),
 });
 answer={certificate:cert(),verification:{binding:{name:'wrong',txId:OTHER}}};
 const runtime=createNameSecurityRuntime({
  env,now:()=>clock,readPolicy:()=>configured,
  driverForName:(name,{file,policy})=>{files.set(name,file);if(!drivers.has(name))drivers.set(name,new MemoryDriver(initialCertificateState(policy)));return drivers.get(name);},
  collect:async options=>{collectCalls++;return collectHook?collectHook(options):answer;},
 });
 return {runtime,env,policy,cert,drivers,files,context:()=>runtime.getProtectedNameContext(),setNow:value=>{clock=value;},setPolicy:value=>{configured=value;},setAnswer:value=>{answer=value;},setCollect:fn=>{collectHook=fn;},calls:()=>collectCalls};
}

test('unprotected configuration remains inactive, but a previously protected runtime cannot downgrade',()=>{
 const f=fixture({absent:true});assert.equal(f.context(),null);assert.equal(f.drivers.size,0);
 f.setPolicy(f.policy);const context=f.context();assert.equal(context.policyId,namePolicyId(f.policy));assert.strictEqual(f.context(),context);
 f.setPolicy(null);assert.throws(()=>f.context(),has('name_witness_policy_required'));
 assert.throws(()=>context.assertCurrent(),has('name_witness_policy_required'));
});

test('policy replacement, revocation and loss of the configured path fail closed on cached context',()=>{
 for(const change of [
  f=>f.setPolicy({...f.policy,networkId:'changed'}),
  f=>{f.policy.revoked=true;},
  f=>{delete f.env.ARNS_NAME_WITNESS_POLICY;},
 ]){
  const f=fixture(),context=f.context();change(f);
  assert.throws(()=>context.store.floor('alpha'),error=>/policy|migration/.test(error.code||error.message));
 }
});

test('current lookup verifies real quorum and persists before returning immutable certified snapshot metadata',async()=>{
 const f=fixture(),context=f.context(),snapshot=await context.authorizeName('alpha');
 assert.equal(f.calls(),1);assert.equal(snapshot.txId,TARGET,'untrusted collector verification fields were ignored');
 assert.equal(snapshot.antProgramId,PROGRAM);assert.equal(snapshot.slot,100);
 assert.equal(snapshot.observedAt,new Date(START+1000).toISOString());assert.equal(snapshot.expiresAt,new Date(START+180000).toISOString());
 assert.equal(snapshot.ttlSeconds,179,'lease metadata is fixed, not remaining wall-clock TTL');
 assert.equal(snapshot.provenance.kind,'quorum-witness');assert.equal(snapshot.provenance.currentStateVerified,false);
 assert.equal(f.drivers.get('alpha').writes,1);
 const checked=context.verifySnapshot(snapshot);assert.equal(checked.verification.binding.txId,TARGET);
 assert(context.store.known('alpha',{hash:snapshot.provenance.certificateHash}));
 assert.match(path.basename(f.files.get('alpha')),/^[a-f0-9]{64}\.json$/);assert(!f.files.get('alpha').includes('alpha'));
});

test('a partial certificate and a failed state commit cannot expose an accepted snapshot',async()=>{
 const f=fixture(),context=f.context();f.setAnswer({certificate:f.cert({indices:[0]})});
 await assert.rejects(context.authorizeName('alpha'),has('name_certificate_quorum_unmet'));
 assert.equal(f.drivers.get('alpha').writes,0);
 f.setAnswer({certificate:f.cert()});f.drivers.get('alpha').rejectCommit=true;
 await assert.rejects(context.authorizeName('alpha'),/simulated_durable_commit_failure/);
 assert.equal(context.store.known('alpha'),null);
});

test('current lookup does not silently reuse cached history when fresh quorum collection is unavailable',async()=>{
 const f=fixture(),context=f.context();await context.authorizeName('alpha');f.setAnswer(null);
 await assert.rejects(context.authorizeName('alpha'),has('NAME_CERTIFICATE_UNAVAILABLE'));
 assert.equal(f.calls(),2);
 const historical=await context.authorizeName('alpha',{mode:'historical'});
 assert.equal(historical.txId,TARGET);assert.equal(historical.provenance.historical,true);assert.equal(f.calls(),2);
});

test('snapshot checks bind every immutable field and never trust mutated provenance',async()=>{
 const f=fixture(),context=f.context(),snapshot=await context.authorizeName('alpha');
 for(const [field,value]of [['txId',OTHER],['antId','B'.repeat(32)],['antProgramId','B'.repeat(32)],['observedAt',new Date(START+2000).toISOString()],['expiresAt',new Date(START+180001).toISOString()],['slot',101],['ttlSeconds',180]]){
  assert.throws(()=>context.verifySnapshot({...snapshot,[field]:value}),has('name_certificate_snapshot_metadata_mismatch'));
 }
 assert.throws(()=>context.verifySnapshot({...snapshot,provenance:{...snapshot.provenance,currentStateVerified:true}}),has('name_certificate_snapshot_provenance_mismatch'));
 const altered=clone(snapshot);altered.provenance.certificate.observations[0].recordJson=altered.provenance.certificate.observations[0].recordJson.replace(TARGET,OTHER);
 assert.throws(()=>context.verifySnapshot(altered),has('name_certificate_signature_invalid'));
 const oversized=clone(snapshot);oversized.provenance.certificate.observations[0].recordJson='x'.repeat(4097);
 assert.throws(()=>context.verifySnapshot(oversized),has('name_certificate_snapshot_invalid'));
 f.setNow(START+90000);
 assert.equal(context.verifySnapshot(snapshot).snapshot.ttlSeconds,179,'stored TTL does not change as time passes');
});

test('policy expiry permits only exact previously accepted dated history, never fresh network acceptance',async()=>{
 const f=fixture(),context=f.context(),snapshot=await context.authorizeName('alpha');
 f.setNow(f.policy.validUntil+1);
 const history=await context.authorizeName('alpha',{mode:'historical'});
 assert.equal(history.provenance.policyExpired,true);assert.equal(history.provenance.currentWindow,false);
 assert.equal(history.observedAt,snapshot.observedAt);assert.equal(history.expiresAt,snapshot.expiresAt);
 assert.equal(context.verifySnapshot(snapshot,{mode:'historical',requireKnown:true}).snapshot.txId,TARGET);
 await assert.rejects(context.authorizeName('alpha'),has('name_policy_inactive'));
 await assert.rejects(context.authorizeName('beta',{mode:'historical'}),has('name_policy_inactive'));
 assert.equal(f.calls(),1);
 f.policy.revoked=true;await assert.rejects(context.authorizeName('alpha',{mode:'historical'}),has('name_policy_revoked'));
});

test('historical target selection returns the requested old binding without lowering the current floor',async()=>{
 const f=fixture(),context=f.context(),old=await context.authorizeName('alpha');
 f.setNow(START+ROUND_MS+30000);f.setAnswer({certificate:f.cert({round:Math.floor(START/ROUND_MS)+1,txId:OTHER,slot:200})});
 await context.authorizeName('alpha');
 const floorBefore=clone(context.store.floor('alpha'));
 const historical=await context.authorizeName('alpha',{mode:'historical',txId:TARGET});
 assert.equal(historical.txId,TARGET);assert.equal(historical.observedAt,old.observedAt);
 assert.deepEqual(context.store.floor('alpha'),floorBefore);assert.equal(f.calls(),2);
});

test('revocation during an asynchronous collection rejects its result before durable acceptance',async()=>{
 const f=fixture(),context=f.context(),certificate=f.cert();let release;
 f.setCollect(()=>new Promise(resolve=>{release=resolve;}));
 const work=context.authorizeName('alpha');f.policy.revoked=true;release({certificate});
 await assert.rejects(work,has('name_policy_revoked'));
 assert.equal(f.drivers.get('alpha').writes,0);
});

test('lazy supporter reply rechecks the accepted policy after its awaited operation',async()=>{
 const f=fixture(),context=f.context(),request={op:'name-certificates',name:'alpha',policyId:context.policyId,historical:true};
 const first=await context.service.reply(request);assert.deepEqual(first.observations,[]);assert.deepEqual(first.certificates,[]);
 const pending=context.service.reply(request);queueMicrotask(()=>{f.policy.revoked=true;});
 await assert.rejects(pending,has('name_policy_revoked'));
});

test('lazy supporter warm-up creates no observation and rechecks policy after initialization',async()=>{
 const f=fixture(),context=f.context();
 assert.deepEqual(await context.service.ready(),{ready:true,policyId:context.policyId});
 assert.equal(f.calls(),0);assert.equal(f.drivers.size,0);
 const pending=context.service.ready();queueMicrotask(()=>{f.policy.revoked=true;});
 await assert.rejects(pending,has('name_policy_revoked'));
});

test('a partial signer configuration cannot create keys or silently become an unsigned supporter',async()=>{
 const f=fixture();f.env.ARNS_NAME_SIGNER_STATE=path.resolve('unprovisioned-signer');
 const context=f.context();
 await assert.rejects(context.service.reply({op:'name-certificates',name:'alpha',policyId:context.policyId,historical:false}),has('name_signer_configuration_incomplete'));
});

test('changing a pinned dedicated witness RPC path requires a restart and cannot change an active context',()=>{
 const f=fixture();f.env.ARNS_NAME_SIGNER_RPC_SEEDS=path.resolve('operator-rpc-a.json');
 const context=f.context();f.env.ARNS_NAME_SIGNER_RPC_SEEDS=path.resolve('operator-rpc-b.json');
 assert.throws(()=>context.assertCurrent(),has('name_signer_configuration_changed_requires_restart'));
 assert.throws(()=>context.store.floor('alpha'),has('name_signer_configuration_changed_requires_restart'));
});

