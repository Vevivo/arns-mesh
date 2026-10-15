import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validateProfile} from '../apps/helper/network-profile.mjs';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,validateNameWitnessPolicy,verifyNameCertificate,witnessKeyId} from '../src/name-certificates.mjs';

// Simulated operators establish protocol behavior, never operational independence.
const NOW=1800000030000,ROUND_MS=60000,PROGRAM='11111111111111111111111111111111',TARGET='A'.repeat(43);
function fixture(n,q,f){
 const keys=Array.from({length:n},()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,index)=>({domain:'simulated-'+index,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'pilot-policy-test',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:PROGRAM,threshold:q,maxFaults:f,roundMs:ROUND_MS,leaseMs:120000,maxFutureSkewMs:1000,validFrom:NOW-3600000,validUntil:NOW+3600000,witnesses};
 const round=Math.floor(NOW/ROUND_MS),observedAt=round*ROUND_MS+1000;
 const observations=keys.map((key,index)=>{
  const recordJson=createNameObservation(policy,{name:'pilot',purpose:'current',antId:PROGRAM,antProgramId:PROGRAM,txId:TARGET,round,slot:100+index,observedAt,issuedAt:observedAt+10});
  return {keyId:witnessKeyId(witnesses[index].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),key.privateKey).toString('base64url')};
 });
 const certificate=indices=>({schema:'arns-mesh-name-certificate/v1',round,observations:indices.map(i=>observations[i])});
 return {policy,certificate};
}

for(const [n,q,f]of [[4,3,1],[10,7,3]])test(`pilot ${q}-of-${n}: threshold is required, copies do not help, and configured unavailable domains are tolerated`,()=>{
 const value=fixture(n,q,f);
 assert.equal(validateNameWitnessPolicy(value.policy,{now:NOW}).threshold,q);
 const verify=indices=>verifyNameCertificate(value.certificate(indices),value.policy,{name:'pilot',now:NOW});
 assert.throws(()=>verify([0]),/name_certificate_quorum_unmet/);
 assert.throws(()=>verify(Array.from({length:q},()=>0)),/name_certificate_quorum_unmet/);
 assert.throws(()=>verify(Array.from({length:q-1},(_,i)=>i)),/name_certificate_quorum_unmet/);
 assert.equal(verify(Array.from({length:n-f},(_,i)=>i)).binding.txId,TARGET);
 assert.equal(verify(Array.from({length:q},(_,i)=>n-q+i)).domains.length,q,'a different available set reaches the same configured threshold');
});

test('ten-operator reader and operator profiles may use distinct RPC lists without changing the pinned witness authority',()=>{
 const {policy}=fixture(10,7,3);
 const shared={schema:'arns-mesh-network-profile/v1',directPeers:Array.from({length:10},(_,i)=>'192.0.2.'+(i+1)+':49741'),arweavePeers:[],nameWitnessPolicy:policy};
 const reader=validateProfile({...shared,rpcSources:[]},{now:NOW});
 const operator=validateProfile({...shared,rpcSources:['198.51.100.20:8899']},{now:NOW});
 assert.equal(namePolicyId(reader.nameWitnessPolicy),namePolicyId(operator.nameWitnessPolicy));
 assert.equal(reader.rpcSources.length,0);assert.equal(operator.rpcSources.length,1);
 assert(Buffer.byteLength(JSON.stringify(operator,null,2))<8192,'ten ordinary public keys and endpoints fit the profile CLI file limit');
 assert.throws(()=>validateProfile({...shared,nameWitnessPolicy:undefined,rpcSources:[]},{now:NOW}),/Solana RPC/);
});

test('ten operators cannot lower the required threshold to six while claiming three tolerated faults',()=>{
 const {policy}=fixture(10,7,3);
 assert.throws(()=>validateNameWitnessPolicy({...policy,threshold:6},{now:NOW}),/name_policy_quorum_unsafe/);
 assert.throws(()=>validateNameWitnessPolicy({...policy,threshold:8},{now:NOW}),/name_policy_quorum_unsafe/);
});
