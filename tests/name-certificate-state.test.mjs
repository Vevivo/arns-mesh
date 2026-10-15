import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {CertifiedNameStore,NameCertificateSigner,initialCertificateState,initialSignerState} from '../src/name-certificate-state.mjs';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,verifyNameObservation,witnessKeyId} from '../src/name-certificates.mjs';

const copy=value=>JSON.parse(JSON.stringify(value)),program='11111111111111111111111111111111',target='A'.repeat(43),other='B'.repeat(43);
class MemoryDriver{
 constructor(value){this.value=copy(value);this.writes=0;this.failCommit=false;}
 transaction(work){const result=work(copy(this.value));if(result.state!==undefined){if(this.failCommit)throw new Error('injected_persistence_failure');this.value=copy(result.state);this.writes++;}return result.value;}
}
function fixture(){
 const start=Math.floor(Date.now()/60000)*60000,round=start/60000;
 let now=start+1000;
 const keys=['a','b','c','d'].map(domain=>({domain,...crypto.generateKeyPairSync('ed25519')}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'state-test',chainId:'solana:11111111111111111111111111111111',registryProgramId:program,threshold:3,maxFaults:1,roundMs:60000,leaseMs:120000,maxFutureSkewMs:1000,validFrom:start-60000,validUntil:start+3600000,witnesses:keys.map(k=>({domain:k.domain,publicKeyPem:k.publicKey.export({type:'spki',format:'pem'})}))};
 const certificate=(r=round,indices=[0,1,2],txId=target)=>({schema:'arns-mesh-name-certificate/v1',round:r,observations:indices.map(i=>{
  const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId,round:r,slot:r+i,observedAt:r*60000,issuedAt:r*60000});
  return {keyId:witnessKeyId(policy.witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[i].privateKey).toString('base64url')};
 })});
 const observation=({name='alpha',txId=target,slot=round}={})=>({schema:'arns-mesh-coherent-name-observation/v1',name,chainId:policy.chainId,genesisHash:policy.chainId.slice(7),registryProgramId:program,antId:program,antProgramId:program,txId,slot,observedAt:new Date(now).toISOString(),leaseEndsAt:null,provenance:{coherentAccountRead:true,strictAssetValidation:true,finalizedCommitmentRequested:true,genesisChecked:true}});
 const driver=new MemoryDriver(initialCertificateState(policy));
 const store=new CertifiedNameStore({policy:()=>policy,driver,now:()=>now});
 const privateKeyPem=keys[0].privateKey.export({type:'pkcs8',format:'pem'}),signerDriver=()=>new MemoryDriver(initialSignerState(policy,policy.witnesses[0].publicKeyPem));
 const signer=(driver,observe)=>new NameCertificateSigner({policy:()=>policy,privateKeyPem,driver,observe,now:()=>now});
 return {start,round,policy,certificate,driver,store,signer,signerDriver,observation,setNow:v=>{now=v;}};
}
test('partial quorum never advances a reader floor or persists a version',async()=>{
 const f=fixture();await assert.rejects(f.store.accept(f.certificate(f.round,[0,1]),{name:'alpha'}),/name_certificate_quorum_unmet/);
 assert.equal(f.driver.writes,0);assert.equal(f.store.floor('alpha'),null);assert.equal(f.store.known('alpha'),null);
 await f.store.accept(f.certificate(),{name:'alpha'});assert.equal(f.driver.writes,1);assert.equal(f.store.floor('alpha').round,f.round);
});
test('reader does not return an accepted result when state persistence fails',async()=>{
 const f=fixture();f.driver.failCommit=true;
 await assert.rejects(f.store.accept(f.certificate(),{name:'alpha'}),/injected_persistence_failure/);
 assert.equal(f.store.floor('alpha'),null);assert.equal(f.store.known('alpha'),null);assert.equal(f.driver.writes,0);
});
test('explicit older history retains its date and leaves the accepted floor unchanged',async()=>{
 const f=fixture();await f.store.accept(f.certificate(),{name:'alpha'});const floor=copy(f.store.floor('alpha'));
 const old=await f.store.accept(f.certificate(f.round-1),{name:'alpha',mode:'historical'});
 assert.equal(old.verification.round,f.round-1);assert.equal(old.verification.historical,true);assert.deepEqual(f.store.floor('alpha'),floor);
 await assert.rejects(f.store.accept(f.certificate(f.round-1),{name:'alpha',mode:'current'}),/name_certificate_rollback/);
});
test('equivalent signer subsets consume one semantic version and preserve original evidence',async()=>{
 const f=fixture(),first=await f.store.accept(f.certificate(),{name:'alpha'});
 const second=await f.store.accept(f.certificate(f.round,[1,2,3]),{name:'alpha'});
 assert.equal(f.store.export('alpha').length,1);assert.equal(first.hash,second.hash);assert.deepEqual(first.certificate,second.certificate);
});
test('cached metadata and acceptance time are verified against signed certificate and local clock',async()=>{
 const f=fixture();await f.store.accept(f.certificate(),{name:'alpha'});
 const original=copy(f.driver.value);
 f.driver.value.names.alpha.versions[0].binding.txId=other;
 assert.throws(()=>f.store.known('alpha',{txId:other}),/name_certificate_cached_metadata_mismatch/);
 f.driver.value=copy(original);f.driver.value.names.alpha.versions[0].acceptedAt=f.start+1001;
 assert.throws(()=>f.store.known('alpha'),/name_certificate_cached_time_invalid/);
 f.driver.value=copy(original);f.driver.value.names.alpha.versions[0].acceptedAt=NaN;
 assert.throws(()=>f.store.known('alpha'),/name_certificate_cached_time_invalid/);
});
test('retained prepared proof survives more than eight new rounds and policy expiry',async()=>{
 const f=fixture(),first=await f.store.accept(f.certificate(),{name:'alpha'});
 f.store.retain('alpha',{hash:first.hash,owner:'site'});
 for(let step=1;step<=12;step++){f.setNow(f.start+step*60000+1000);await f.store.accept(f.certificate(f.round+step),{name:'alpha'});}
 assert.equal(f.store.export('alpha').length,9);assert.equal(f.store.known('alpha',{hash:first.hash}).verification.round,f.round);
 const advertised=f.store.advertised('alpha');assert.equal(advertised.length,8);assert.equal(advertised[0].round,f.round);assert.equal(advertised[1].round,f.round+12);
 f.setNow(f.policy.validUntil+1);
 const retained=f.store.known('alpha',{hash:first.hash});
 assert.equal(retained.verification.policyExpired,true);assert.equal(retained.verification.currentWindow,false);
 assert.equal(retained.verification.observedAt,f.start);
 await assert.rejects(f.store.accept(first.certificate,{name:'alpha',mode:'historical'}),/name_policy_inactive/);
});
test('retention slots are bounded, cannot invent prior acceptance, and release prunes excess history',async()=>{
 const f=fixture();await assert.rejects(f.store.accept(f.certificate(f.round,[0]),{name:'alpha'}),/quorum/);
 assert.throws(()=>f.store.retain('alpha',{hash:'a'.repeat(64),owner:'site'}),/not_previously_accepted/);
 const first=await f.store.accept(f.certificate(),{name:'alpha'});f.store.retain('alpha',{hash:first.hash,owner:'site'});
 assert.throws(()=>f.store.retain('alpha',{hash:first.hash,owner:'arbitrary-owner'}),/retention_invalid/);
 for(let step=1;step<=10;step++){f.setNow(f.start+step*60000+1000);await f.store.accept(f.certificate(f.round+step),{name:'alpha'});}
 assert.equal(f.store.release('alpha',{owner:'site'}),true);assert.equal(f.store.known('alpha',{hash:first.hash}),null);assert.equal(f.store.export('alpha').length,8);
 assert.equal(f.store.release('alpha',{owner:'site'}),false);
});
test('retention write failure preserves earlier prepared proof while an update is staged',async()=>{
 const f=fixture(),first=await f.store.accept(f.certificate(),{name:'alpha'});f.store.retain('alpha',{hash:first.hash,owner:'site'});
 f.setNow(f.start+60000+1000);const next=await f.store.accept(f.certificate(f.round+1,[0,1,2],other),{name:'alpha'});
 f.store.retain('alpha',{hash:next.hash,owner:'site-update'});f.driver.failCommit=true;
 assert.throws(()=>f.store.retain('alpha',{hash:next.hash,owner:'site'}),/injected_persistence_failure/);
 assert.equal(f.driver.value.names.alpha.retained.site,first.hash);assert.equal(f.driver.value.names.alpha.retained['site-update'],next.hash);
});
test('signer persists its first decision before releasing an envelope and repeats identical bytes within round',async()=>{
 const f=fixture(),driver=f.signerDriver();let observed=0;
 const signer=f.signer(driver,async()=>{observed++;return f.observation();});
 const first=await signer.issue('alpha');assert.equal(driver.writes,1);assert.equal(observed,1);
 const second=await signer.issue('alpha');assert.deepEqual(second,first);assert.equal(driver.writes,1);assert.equal(observed,1);
 assert.equal(verifyNameObservation(first,f.policy,{name:'alpha',round:f.round,now:f.start+1000}).record.txId,target);
 const failed=f.signerDriver();failed.failCommit=true;
 await assert.rejects(f.signer(failed,async()=>f.observation()).issue('alpha'),/injected_persistence_failure/);assert.equal(failed.value.names.alpha,undefined);
});
test('concurrent signer requests coalesce and a policy revocation during observation releases no signature',async()=>{
 const f=fixture(),driver=f.signerDriver();let calls=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const signer=f.signer(driver,async()=>{calls++;await gate;return f.observation();});
 const a=signer.issue('alpha'),b=signer.issue('alpha');release();
 assert.deepEqual(await a,await b);assert.equal(calls,1);assert.equal(driver.writes,1);
 const f2=fixture(),driver2=f2.signerDriver();let finish;
 const pending=f2.signer(driver2,async()=>{await new Promise(resolve=>{finish=resolve;});return f2.observation();}).issue('alpha');
 await Promise.resolve();f2.policy.revoked=true;finish();
 await assert.rejects(pending,/name_policy_revoked/);assert.equal(driver2.writes,0);
});
test('signer rejects restarted missing/mismatched state and signed observation rollback',async()=>{
 const f=fixture(),wrong=f.signerDriver();wrong.value.policyId='0'.repeat(64);
 assert.throws(()=>f.signer(wrong,async()=>f.observation()),/missing_invalid_or_migration_required/);
 assert.throws(()=>f.signer(new MemoryDriver(null),async()=>f.observation()),/missing_invalid_or_migration_required/);
 const driver=f.signerDriver(),signer=f.signer(driver,async()=>f.observation({slot:f.round}));
 await signer.issue('alpha');f.setNow(f.start+60000+1000);
 const restarted=f.signer(driver,async()=>f.observation({slot:f.round-1}));
 await assert.rejects(restarted.issue('alpha'),/name_signer_observation_rollback/);assert.equal(driver.writes,1);
});
test('revocation still invalidates already accepted historical or retained evidence',async()=>{
 const f=fixture(),first=await f.store.accept(f.certificate(),{name:'alpha'});f.store.retain('alpha',{hash:first.hash,owner:'site'});
 f.policy.revoked=true;
 assert.throws(()=>f.store.known('alpha',{hash:first.hash}),/name_policy_revoked/);
 assert.throws(()=>f.store.retain('alpha',{hash:first.hash,owner:'replica'}),/name_policy_revoked/);
});
