import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,validateNameWitnessPolicy,verifyNameCertificate,verifyNameObservation,witnessKeyId} from '../src/name-certificates.mjs';

const program='11111111111111111111111111111111',target='A'.repeat(43),other='B'.repeat(43);
const start=1800000000000,roundMs=60000,round=start/roundMs,now=start+30000;
const is=code=>error=>error.code===code;
function fixture(domainNames=['a','b','c','d']){
 const keys=domainNames.map(()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,i)=>({domain:domainNames[i],publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'network-one',chainId:'solana-mainnet-genesis',registryProgramId:program,threshold:3,maxFaults:1,roundMs,leaseMs:120000,maxFutureSkewMs:1000,validFrom:start-600000,validUntil:start+86400000,witnesses};
 const sign=(i,recordJson,domainSeparate=true)=>({keyId:witnessKeyId(witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,domainSeparate?nameObservationSigningBytes(recordJson):Buffer.from(recordJson),keys[i].privateKey).toString('base64url')});
 const observation=(i,patch={})=>{const r=patch.round??round;return sign(i,createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId:target,round:r,slot:100+i,observedAt:r*roundMs+1000,issuedAt:r*roundMs+1010,...patch}));};
 const certificate=(observations,r=round)=>({schema:'arns-mesh-name-certificate/v1',round:r,observations});
 const check=(cert,options={})=>verifyNameCertificate(cert,policy,{name:'alpha',now,...options});
 return {keys,policy,witnesses,sign,observation,certificate,check};
}

test('safe independent-domain committees require Byzantine intersection and availability bounds',()=>{
 const f=fixture();assert.equal(validateNameWitnessPolicy(f.policy,{now}).threshold,3);
 for(const bad of [{...f.policy,threshold:2},{...f.policy,threshold:4},{...f.policy,maxFaults:2},{...f.policy,witnesses:f.witnesses.slice(0,3),threshold:2,maxFaults:1},{...f.policy,threshold:1}])assert.throws(()=>namePolicyId(bad),is('name_policy_quorum_unsafe'));
 const reordered={...f.policy,witnesses:[...f.witnesses].reverse()};
 assert.equal(namePolicyId(f.policy),namePolicyId(reordered),'policy identity is independent of input ordering');
 assert.equal(namePolicyId(validateNameWitnessPolicy(f.policy,{now})),namePolicyId(f.policy));
});

test('cloned PEM encodings and multiple keys in one domain do not create independent votes',()=>{
 const f=fixture(),clone=f.witnesses[0].publicKeyPem.replace(/\n/g,'\r\n');
 assert.equal(witnessKeyId(clone),witnessKeyId(f.witnesses[0].publicKeyPem));
 assert.throws(()=>namePolicyId({...f.policy,witnesses:[...f.witnesses,{domain:'alias',publicKeyPem:clone}]}),is('name_policy_key_domain_conflict'));
 assert.throws(()=>namePolicyId({...f.policy,witnesses:[...f.witnesses,{domain:'a',publicKeyPem:clone}]}),is('name_policy_duplicate_key'));
 const aliases=fixture(['a','a','a','b','c','d']);
 const cert=aliases.certificate([0,1,2].map(i=>aliases.observation(i,{slot:100})));
 assert.throws(()=>aliases.check(cert),is('name_certificate_quorum_unmet'));
});

test('a shared-round matching binding reaches quorum with differing finalized observation slots',()=>{
 const f=fixture(),cert=f.certificate([0,1,2].map(i=>f.observation(i,{slot:100+i*50})));
 const result=f.check(cert);
 assert.deepEqual(result.domains,['a','b','c']);assert.equal(result.binding.txId,target);
 assert.equal(result.round,round);assert.equal(result.currentWindow,true);assert.equal(result.historical,false);
 assert.equal(result.currentStateVerified,false);assert.equal(result.trustModel,'configured-independent-witnesses');
 assert.equal(result.nextFloor.domains.c.slot,200);
});

test('relay copies, one signer and a reduced committee cannot satisfy the configured threshold',()=>{
 const f=fixture(),one=f.observation(0);
 for(const observations of [[one],[one,one,one],[one,f.observation(1)]])assert.throws(()=>f.check(f.certificate(observations)),is('name_certificate_quorum_unmet'));
 assert.throws(()=>f.check(f.certificate([one]),{mode:'historical'}),is('name_certificate_quorum_unmet'));
});

test('signature verification binds the exact record and a protocol-specific signing prefix',()=>{
 const f=fixture(),valid=[0,1,2].map(i=>f.observation(i)),tampered={...valid[0],recordJson:valid[0].recordJson.replace(target,other)};
 assert.throws(()=>f.check(f.certificate([tampered,...valid.slice(1)])),is('name_certificate_signature_invalid'));
 const plain=f.sign(0,valid[0].recordJson,false);
 assert.throws(()=>f.check(f.certificate([plain,...valid.slice(1)])),is('name_certificate_signature_invalid'));
 const wrongKey={...valid[0],keyId:valid[1].keyId};
 assert.throws(()=>f.check(f.certificate([wrongKey,...valid.slice(1)])),is('name_certificate_signature_invalid'));
});

test('name, purpose, chain, network, registry and policy identity are signed scope requirements',()=>{
 const f=fixture();
 for(const [field,value,code] of [['name','beta','name_observation_context_mismatch'],['purpose','prepared','name_observation_context_mismatch'],['chainId','another-chain','name_observation_scope_mismatch'],['networkId','another-network','name_observation_scope_mismatch'],['registryProgramId','B'.repeat(32),'name_observation_scope_mismatch'],['policyId','0'.repeat(64),'name_observation_scope_mismatch']]){
  const records=[0,1,2].map(i=>f.sign(i,JSON.stringify({...JSON.parse(f.observation(i).recordJson),[field]:value})));
  assert.throws(()=>f.check(f.certificate(records)),is(code));
 }
 const prepared=f.certificate([0,1,2].map(i=>f.observation(i,{purpose:'prepared'})));
 assert.throws(()=>f.check(prepared),is('name_observation_context_mismatch'));
 assert.equal(f.check(prepared,{purpose:'prepared'}).binding.txId,target);
});

test('different bindings or different rounds are never combined into a quorum',()=>{
 const f=fixture();
 assert.throws(()=>f.check(f.certificate([f.observation(0),f.observation(1),f.observation(2,{txId:other})])),is('name_certificate_quorum_unmet'));
 const mixed=f.certificate([f.observation(0),f.observation(1),f.observation(2,{round:round-1})]);
 assert.throws(()=>f.check(mixed),is('name_observation_context_mismatch'));
});

test('fixed signed lease expires for current access and remains explicitly dated history',()=>{
 const f=fixture(),cert=f.certificate([0,1,2].map(i=>f.observation(i))),expires=start+roundMs+f.policy.leaseMs;
 assert.throws(()=>f.check(cert,{now:expires}),is('name_certificate_expired'));
 const history=f.check(cert,{mode:'historical',now:expires+1});
 assert.equal(history.historical,true);assert.equal(history.currentWindow,false);assert.equal(history.currentStateVerified,false);
 assert.equal(history.observedAt,start+1000);assert.equal(history.issuedAt,start+1010);assert.equal(history.expiresAt,expires,'replay cannot renew the signed lease');
 const freshened=[0,1,2].map(i=>f.sign(i,JSON.stringify({...JSON.parse(f.observation(i).recordJson),expiresAt:expires+1})));
 assert.throws(()=>f.check(f.certificate(freshened)),is('name_observation_time_invalid'));
 const future=f.certificate([0,1,2].map(i=>f.observation(i,{round:round+1})),round+1);
 assert.throws(()=>f.check(future),is('name_observation_from_future'));
});

test('historical network acceptance never bypasses policy expiry, revocation or changed authority scope',()=>{
 const f=fixture(),cert=f.certificate([0,1,2].map(i=>f.observation(i)));
 assert.throws(()=>f.check(cert,{mode:'historical',now:f.policy.validUntil}),is('name_policy_inactive'));
 assert.throws(()=>verifyNameCertificate(cert,{...f.policy,revoked:true},{name:'alpha',now,mode:'historical'}),is('name_policy_revoked'));
 assert.throws(()=>verifyNameCertificate(cert,{...f.policy,chainId:'different'},{name:'alpha',now}),is('name_observation_scope_mismatch'));
});

test('an equivocating domain is excluded and cannot prevent the remaining honest quorum',()=>{
 const f=fixture(),a=f.observation(0),contradiction=f.observation(0,{txId:other});
 const result=f.check(f.certificate([a,contradiction,...[1,2,3].map(i=>f.observation(i))]));
 assert.deepEqual(result.domains,['b','c','d']);assert.deepEqual(result.discardedDomains,[{domain:'a',reason:'equivocation'}]);
 assert.throws(()=>f.check(f.certificate([a,contradiction,f.observation(1),f.observation(2)])),is('name_certificate_quorum_rejected'));
});

test('certified rounds advance monotonically while explicit older history leaves the floor unchanged',()=>{
 const f=fixture(),oldRound=round-1,old=f.certificate([0,1,2].map(i=>f.observation(i,{round:oldRound,slot:90+i})),oldRound);
 const floor=f.check(f.certificate([0,1,2].map(i=>f.observation(i)))).nextFloor,serialized=JSON.stringify(floor);
 assert.throws(()=>f.check(old,{floor}),is('name_certificate_rollback'));
 const history=f.check(old,{floor,mode:'historical'});
 assert.equal(history.olderThanAccepted,true);assert.strictEqual(history.nextFloor,floor);assert.equal(JSON.stringify(floor),serialized);
 assert.equal(history.round,oldRound);assert.equal(history.observedAt,oldRound*roundMs+1000);
 const conflicting=f.certificate([0,1,2].map(i=>f.observation(i,{txId:other})));
 assert.throws(()=>f.check(conflicting,{floor}),error=>['name_certificate_conflict','name_certificate_quorum_rejected'].includes(error.code));
 assert.throws(()=>f.check(conflicting,{floor,mode:'historical'}),error=>['name_certificate_conflict','name_certificate_quorum_rejected'].includes(error.code));
 for(const bad of [{...floor,name:'beta'},{...floor,policyId:'0'.repeat(64)}])assert.throws(()=>f.check(old,{floor:bad,mode:'historical'}),is('name_certificate_floor_invalid'));
});

test('one domain claiming an enormous slot cannot poison other domains future acceptance',()=>{
 const f=fixture(),first=f.certificate([f.observation(0,{slot:Number.MAX_SAFE_INTEGER}),f.observation(1),f.observation(2)]),floor=f.check(first).nextFloor;
 const nextRound=round+1,second=f.certificate([0,1,2,3].map(i=>f.observation(i,{round:nextRound,slot:200+i})),nextRound);
 const result=f.check(second,{now:start+roundMs+30000,floor});
 assert.deepEqual(result.domains,['b','c','d']);assert.deepEqual(result.discardedDomains,[{domain:'a',reason:'rollback'}]);
 assert.equal(result.nextFloor.round,nextRound);assert.equal(result.nextFloor.domains.b.slot,201);
 assert.equal(result.nextFloor.domains.a.slot,Number.MAX_SAFE_INTEGER,'the untrusted claim is isolated to its own domain');
 assert.equal(floor.round,round,'the verifier does not mutate a caller floor before persistence');
});

test('inactive policy normalization is explicit local inspection and cannot relax certificate verification',()=>{
 const f=fixture(),cert=f.certificate([0,1,2].map(i=>f.observation(i))),expired=f.policy.validUntil;
 assert.throws(()=>validateNameWitnessPolicy(f.policy,{now:expired}),is('name_policy_inactive'));
 const local=validateNameWitnessPolicy(f.policy,{now:expired,allowInactive:true});
 assert.equal(namePolicyId(local),namePolicyId(f.policy));
 assert.throws(()=>verifyNameCertificate(cert,local,{name:'alpha',now:expired,mode:'historical'}),is('name_policy_inactive'));
 assert.throws(()=>validateNameWitnessPolicy({...f.policy,revoked:true},{now:expired,allowInactive:true}),is('name_policy_revoked'));
 assert.throws(()=>validateNameWitnessPolicy(f.policy,{now:expired,allowInactive:'true'}),is('name_policy_invalid'));
 assert.throws(()=>validateNameWitnessPolicy(f.policy,{now:NaN,allowInactive:true}),is('name_certificate_clock_invalid'));
});

test('a future round tolerated by clock skew is never labelled inside the current window',()=>{
 const f=fixture(),r=round+1,begins=r*roundMs;
 const cert=f.certificate([0,1,2].map(i=>f.observation(i,{round:r,observedAt:begins,issuedAt:begins})),r);
 assert.equal(f.check(cert,{now:begins-1}).currentWindow,false);
 assert.equal(f.check(cert,{now:begins}).currentWindow,true);
 assert.equal(f.check(cert,{now:begins+roundMs+f.policy.leaseMs,mode:'historical'}).currentWindow,false);
});

test('individual observations expose authenticated domain identity without granting a certificate quorum',()=>{
 const f=fixture(),envelope=f.observation(0),result=verifyNameObservation(envelope,f.policy,{name:'alpha',round,now});
 assert.equal(result.domain,'a');assert.equal(result.keyId,envelope.keyId);assert.match(result.recordHash,/^[a-f0-9]{64}$/);
 assert.equal(result.record.txId,target);
 assert.throws(()=>verifyNameObservation({...envelope,recordJson:envelope.recordJson.replace(target,other)},f.policy,{name:'alpha',round,now}),is('name_certificate_signature_invalid'));
 assert.throws(()=>verifyNameObservation(envelope,f.policy,{name:'beta',round,now}),is('name_observation_context_mismatch'));
 assert.throws(()=>f.check(f.certificate([envelope])),is('name_certificate_quorum_unmet'));
});

