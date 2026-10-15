import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyProfile,assertNameWitnessPolicyUpdate,mergeProfiles,profileSchema,readNameWitnessPolicy,readProfile,validateProfile} from '../apps/helper/network-profile.mjs';
import {connectionProfile,decodeInvitation,encodeInvitation,invitationScope,networkPublicKey,profileHash,signNetwork,signNetworkContinuity,validateInvitation,verifyNetwork} from '../src/network-invitation.mjs';
import {namePolicyId} from '../src/name-certificates.mjs';

const now=Date.now(),program='11111111111111111111111111111111';
const is=code=>error=>error.code===code||error.message===code;
function directory(t){
 const root=path.resolve(process.env.ARNS_TEST_TMP_ROOT||os.tmpdir()),dir=fs.mkdtempSync(path.join(root,'arns-name-policy-test-'));
 t.after(()=>{assert.equal(path.dirname(dir),root);assert.ok(path.basename(dir).startsWith('arns-name-policy-test-'));fs.rmSync(dir,{recursive:true,force:true});});
 return dir;
}
function fixture(){
 const privateKey=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});
 const witnesses=['a','b','c','d'].map(domain=>({domain,publicKeyPem:crypto.generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'profile-test',chainId:'solana:11111111111111111111111111111111',registryProgramId:program,threshold:3,maxFaults:1,roundMs:60000,leaseMs:120000,maxFutureSkewMs:1000,validFrom:now-60000,validUntil:now+600000,witnesses};
 const legacy={schema:profileSchema,directPeers:['192.0.2.11:49740'],rpcSources:['198.51.100.11:8899'],arweavePeers:['203.0.113.11:1984'],trustedPeers:['a'.repeat(64)]};
 const profile={...legacy,nameWitnessPolicy:policy};
 const invitation={version:1,key:networkPublicKey(privateKey),local:false,seeds:legacy.directPeers};
 const publication=(value=profile,revision=1)=>signNetwork({schema:'arns-mesh-network/v1',name:'Profile test',revision,issuedAt:now,expiresAt:now+3600000,profile:value},privateKey,{now});
 return {privateKey,policy,legacy,profile,invitation,publication};
}
test('legacy profiles keep ordinary endpoint and publisher compatibility without enabling name certificates',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.legacy,{now});
 assert.equal(readNameWitnessPolicy(dir),null);
 assert.deepEqual(readProfile(dir),validateProfile(f.legacy,{now}));
 assert.equal(fs.existsSync(path.join(dir,'name-security-required.json')),false);
 const merged=mergeProfiles(f.legacy,{...f.legacy,directPeers:['192.0.2.12:49740'],trustedPeers:['b'.repeat(64)]});
 assert.deepEqual(merged.directPeers,['192.0.2.11:49740','192.0.2.12:49740']);assert.equal(merged.trustedPeers.length,2);
});
test('applying a protected profile persists its exact policy and durable refusal marker together',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.profile,{now});
 assert.equal(namePolicyId(readNameWitnessPolicy(dir)),namePolicyId(f.policy));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'name-security-required.json'))),{schema:'arns-mesh-name-security-required/v1',policyId:namePolicyId(f.policy)});
 assert.equal(profileHash(readProfile(dir),{now}),profileHash(f.profile,{now}));
 const reordered={...f.profile,nameWitnessPolicy:{...f.policy,witnesses:[...f.policy.witnesses].reverse()}};
 assert.equal(profileHash(reordered,{now}),profileHash(f.profile,{now}));
});
test('a protected reader can use certificate Mesh peers without a local RPC source',t=>{
 const f=fixture(),dir=directory(t),profile={...f.profile,rpcSources:[]};
 assert.equal(validateProfile(profile,{now}).rpcSources.length,0);applyProfile(dir,profile,{now});
 assert.deepEqual(readProfile(dir).rpcSources,[]);assert.equal(namePolicyId(readNameWitnessPolicy(dir)),namePolicyId(f.policy));
 assert.throws(()=>validateProfile({...f.legacy,rpcSources:[]},{now}),/Solana RPC/);
 assert.throws(()=>validateProfile({...profile,directPeers:[]},{now}),/Solana RPC/);
});
test('omitted or null policy cannot downgrade an accepted protected installation',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.profile,{now});const before=readProfile(dir);
 for(const value of [f.legacy,{...f.legacy,nameWitnessPolicy:null}]){
  assert.throws(()=>assertNameWitnessPolicyUpdate(dir,value,{now}),is('name_witness_policy_required'));
  assert.throws(()=>applyProfile(dir,value,{now}),is('name_witness_policy_required'));
  assert.deepEqual(readProfile(dir),before);
 }
 assert.equal(fs.existsSync(path.join(dir,'connections.lock')),false);
});
test('committees are never unioned and a different accepted policy requires explicit migration',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.profile,{now});
 const replacement={...f.profile,nameWitnessPolicy:{...f.policy,networkId:'different-network'}};
 assert.throws(()=>mergeProfiles(f.profile,f.legacy),/cannot omit/);
 assert.throws(()=>mergeProfiles(f.profile,replacement),/cannot be merged/);
 assert.throws(()=>applyProfile(dir,replacement,{now}),is('name_policy_migration_required'));
 assert.equal(namePolicyId(readNameWitnessPolicy(dir)),namePolicyId(f.policy));
});
test('membership detach and a missing or null protected policy fail closed',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.profile,{now,networkState:{schema:'arns-mesh-membership/v1',envelope:f.publication()}});
 fs.writeFileSync(path.join(dir,'network-membership.json'),'null\n');
 fs.unlinkSync(path.join(dir,'name-witness-policy.json'));
 assert.throws(()=>readNameWitnessPolicy(dir),is('name_witness_policy_required'));
 assert.throws(()=>applyProfile(dir,f.legacy,{now}),is('name_witness_policy_required'));
 fs.writeFileSync(path.join(dir,'name-witness-policy.json'),'null\n');
 assert.throws(()=>readNameWitnessPolicy(dir),is('name_witness_policy_required'));
});
test('malformed refusal marker, corrupt policy and mismatched policy cannot become legacy mode',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.profile,{now});
 const markerPath=path.join(dir,'name-security-required.json'),policyPath=path.join(dir,'name-witness-policy.json'),marker=fs.readFileSync(markerPath);
 for(const value of [null,{}, {schema:'arns-mesh-name-security-required/v1',policyId:'0'.repeat(64),extra:true}]){
  fs.writeFileSync(markerPath,JSON.stringify(value));assert.throws(()=>readNameWitnessPolicy(dir),is('invalid_name_security_marker'));
 }
 fs.writeFileSync(markerPath,marker);fs.writeFileSync(policyPath,'{');
 assert.throws(()=>readNameWitnessPolicy(dir),SyntaxError);
 fs.writeFileSync(policyPath,JSON.stringify({...f.policy,networkId:'other'}));
 assert.throws(()=>readNameWitnessPolicy(dir),is('name_policy_migration_required'));
});
test('retained membership is a refusal-only guard when an older installation has no marker',t=>{
 const dir=directory(t),f=fixture();
 fs.writeFileSync(path.join(dir,'network-membership.json'),JSON.stringify({schema:'arns-mesh-membership/v1',envelope:f.publication()}));
 assert.throws(()=>readNameWitnessPolicy(dir),is('name_witness_policy_required'));
 assert.throws(()=>applyProfile(dir,f.legacy,{now}),is('name_witness_policy_required'));
 fs.writeFileSync(path.join(dir,'network-membership.json'),JSON.stringify({schema:'arns-mesh-membership/v1',envelope:{recordJson:'not-json'}}));
 assert.throws(()=>readNameWitnessPolicy(dir),is('invalid_accepted_name_policy_state'));
});
test('same policy permits endpoint changes without replacing the committee or weakening its threshold',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.profile,{now});
 const incoming={...f.profile,directPeers:['192.0.2.12:49740'],trustedPeers:['b'.repeat(64)]},merged=mergeProfiles(readProfile(dir),incoming);
 applyProfile(dir,merged,{now});
 assert.equal(namePolicyId(readNameWitnessPolicy(dir)),namePolicyId(f.policy));assert.equal(readNameWitnessPolicy(dir).threshold,3);
 assert.deepEqual(readProfile(dir).directPeers,['192.0.2.11:49740','192.0.2.12:49740']);assert.equal(readProfile(dir).trustedPeers.length,2);
});
test('inactive policy is readable only through explicit local-history validation and remains in profile hashes',t=>{
 const dir=directory(t),f=fixture(),expiredAt=f.policy.validUntil;
 applyProfile(dir,f.profile,{now});
 assert.throws(()=>validateProfile(readProfile(dir),{now:expiredAt}),is('name_policy_inactive'));
 const retained=validateProfile(readProfile(dir),{allowInactiveNamePolicy:true,now:expiredAt});
 assert.equal(namePolicyId(retained.nameWitnessPolicy),namePolicyId(f.policy));
 assert.equal(profileHash(retained,{allowInactiveNamePolicy:true,now:expiredAt}),profileHash(f.profile,{now}));
 assert.throws(()=>applyProfile(dir,f.profile,{now:expiredAt}),is('name_policy_inactive'));
 assert.throws(()=>validateProfile({...f.profile,nameWitnessPolicy:{...f.policy,revoked:true}},{allowInactiveNamePolicy:true,now:expiredAt}),is('name_policy_revoked'));
});
test('signed network publication binds exact policy and forbids network acceptance after policy expiry',()=>{
 const f=fixture(),signed=f.publication();
 assert.equal(namePolicyId(verifyNetwork(signed,f.invitation,{now}).profile.nameWitnessPolicy),namePolicyId(f.policy));
 const tampered={...signed,recordJson:signed.recordJson.replace('"profile-test"','"attacker"')};
 assert.throws(()=>verifyNetwork(tampered,f.invitation,{now}),/Invalid network signature/);
 assert.throws(()=>verifyNetwork(signed,f.invitation,{now:f.policy.validUntil}),is('name_policy_inactive'));
 const historical=verifyNetwork(signed,f.invitation,{now:f.policy.validUntil,allowExpired:true});
 assert.equal(namePolicyId(connectionProfile(historical,[],{allowInactiveNamePolicy:true,now:f.policy.validUntil}).nameWitnessPolicy),namePolicyId(f.policy));
 assert.throws(()=>connectionProfile(historical,[],{now:f.policy.validUntil}),is('name_policy_inactive'));
});
test('an old durable invitation remains authority identity but cannot activate its expired embedded policy',()=>{
 const f=fixture(),definition=signNetworkContinuity({name:'Durable test',profile:f.profile,seeds:f.invitation.seeds,bootstrap:['192.0.2.12:49741'],now},f.privateKey);
 const invitation={...f.invitation,version:2,definition},code=encodeInvitation(invitation),expiredAt=f.policy.validUntil;
 assert.throws(()=>validateInvitation(invitation,{now:expiredAt}),is('name_policy_inactive'));
 const identity=decodeInvitation(code,{allowInactiveNamePolicy:true,now:expiredAt});
 assert.equal(identity.key,f.invitation.key);assert.equal(invitationScope(identity,{allowInactiveNamePolicy:true,now:expiredAt}).id.length,64);
 assert.throws(()=>verifyNetwork(definition,identity,{now:expiredAt}),is('name_policy_inactive'));
 assert.equal(verifyNetwork(definition,identity,{now:expiredAt,allowExpired:true}).revision,0);
 const renewedPolicy={...f.policy,validFrom:expiredAt,validUntil:expiredAt+600000},renewed=signNetwork({schema:'arns-mesh-network/v1',name:'Durable test',revision:2,issuedAt:expiredAt,expiresAt:expiredAt+3600000,profile:{...f.profile,nameWitnessPolicy:renewedPolicy}},f.privateKey,{now:expiredAt});
 assert.equal(verifyNetwork(renewed,identity,{now:expiredAt}).revision,2,'expired invitation identity can discover a fresh authority-signed list; policy application still requires explicit migration');
});
test('a newer authority-signed list omitting the policy cannot silently unprotect the local installation',t=>{
 const dir=directory(t),f=fixture();applyProfile(dir,f.profile,{now});
 const next=verifyNetwork(f.publication(f.legacy,2),f.invitation,{now});
 assert.equal(next.revision,2);
 assert.throws(()=>applyProfile(dir,next.profile,{now}),is('name_witness_policy_required'));
 assert.equal(namePolicyId(readNameWitnessPolicy(dir)),namePolicyId(f.policy));
});
