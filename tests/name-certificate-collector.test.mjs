import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {NameCertificateCollector} from '../src/name-certificate-collector.mjs';
import {createNameObservation,nameObservationSigningBytes,verifyNameCertificate,witnessKeyId} from '../src/name-certificates.mjs';

const program='11111111111111111111111111111111',target='A'.repeat(43),other='B'.repeat(43);
const start=1800000000000,roundMs=60000,round=start/roundMs;
const is=code=>error=>error.code===code;
function fixture(domainNames=['a','b','c','d'],options={}){
 const keys=domainNames.map(()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,i)=>({domain:domainNames[i],publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'network-one',chainId:'solana-mainnet-genesis',registryProgramId:program,threshold:3,maxFaults:1,roundMs,leaseMs:120000,maxFutureSkewMs:1000,validFrom:start-200*roundMs,validUntil:start+86400000,witnesses};
 let clock=start+30000;
 const observation=(i,patch={})=>{
  const r=patch.round??round;
  const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId:target,round:r,slot:100+i,observedAt:r*roundMs+1000,issuedAt:r*roundMs+1010,...patch});
  return {keyId:witnessKeyId(witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[i].privateKey).toString('base64url')};
 };
 const cert=(observations,r=round)=>({schema:'arns-mesh-name-certificate/v1',round:r,observations});
 const collector=new NameCertificateCollector({policy,name:'alpha',now:()=>clock,...options});
 return {keys,policy,observation,cert,collector,setNow:n=>{clock=n;},getNow:()=>clock};
}

test('couriers contribute original signed votes until independent domains reach quorum',()=>{
 const f=fixture(),c=f.collector,a=f.observation(0);
 assert.equal(c.add([a]).authenticated,1);assert.equal(c.best(),null);
 c.add([a,a,f.observation(1)]);assert.equal(c.best(),null,'relay copies do not create authority');
 c.add([f.observation(2,{slot:987})]);
 const result=c.best();
 assert.deepEqual(result.verification.domains,['a','b','c']);
 assert.equal(result.verification.binding.txId,target);
 assert.deepEqual(result.certificate.observations.map(v=>v.recordJson),[a.recordJson,f.observation(1).recordJson,f.observation(2,{slot:987}).recordJson]);
});

test('invalid, unknown, oversized and wrong-scope courier votes cannot poison later honest evidence',()=>{
 const f=fixture(),c=f.collector,valid=f.observation(0);
 const bad=[
  {...valid,recordJson:valid.recordJson.replace(target,other)},
  {...valid,keyId:'0'.repeat(64)},
  {...valid,recordJson:'x'.repeat(4097)},
  f.observation(0,{name:'beta'}),
  f.observation(0,{purpose:'prepared'}),
  {...valid,extra:true},
  {recordJson:'{',keyId:valid.keyId,signature:valid.signature}
 ];
 const report=c.add(bad);
 assert.equal(report.authenticated,0);assert.equal(report.rejected,bad.length);assert.equal(c.stats().retainedVotes,0);
 c.add([0,1,2].map(i=>f.observation(i)));
 assert.equal(c.best().verification.binding.txId,target);
});

test('caller mutation and unsigned routing round cannot change authenticated records',()=>{
 const f=fixture(),c=f.collector,rows=[0,1,2].map(i=>f.observation(i));
 c.addCertificate(f.cert(rows,round+1000));
 rows[0].recordJson=rows[0].recordJson.replace(target,other);rows[1].signature='x'.repeat(86);rows.length=0;
 const result=c.best();assert.equal(result.certificate.round,round);assert.equal(result.verification.binding.txId,target);
 assert.doesNotThrow(()=>verifyNameCertificate(result.certificate,f.policy,{name:'alpha',now:f.getNow()}));
});

test('new incomplete rounds never erase a previously complete certificate',()=>{
 const f=fixture(),c=f.collector;
 c.add([0,1,2].map(i=>f.observation(i)));
 f.setNow(start+roundMs+30000);
 c.add([f.observation(0,{round:round+1,slot:200})]);
 assert.equal(c.best().verification.round,round);
 c.add([f.observation(1,{round:round+1,slot:201}),f.observation(2,{round:round+1,slot:202})]);
 assert.equal(c.best().verification.round,round+1);
});

test('multiple keys in one administrator domain and copied votes count only once',()=>{
 const f=fixture(['a','a','a','b','c','d']),c=f.collector;
 c.add([0,1,2].map(i=>f.observation(i,{slot:100})));
 assert.equal(c.best(),null);
 c.add([f.observation(3),f.observation(4)]);
 assert.deepEqual(c.best().verification.domains,['a','b','c']);
});

test('equivocation invalidates cached quorum until enough other honest domains answer',()=>{
 const f=fixture(),c=f.collector;
 c.add([0,1,2].map(i=>f.observation(i)));
 assert.equal(c.best().verification.domains.length,3);
 c.add([f.observation(0,{txId:other})]);
 assert.throws(()=>c.best(),is('name_certificate_quorum_rejected'));
 for(let i=0;i<40;i++)c.add([f.observation(0,{slot:500+i})]);
 assert.throws(()=>c.best(),is('name_certificate_quorum_rejected'),'extra variants cannot remove retained equivocation');
 c.add([f.observation(3)]);
 const result=c.best();
 assert.deepEqual(result.verification.domains,['b','c','d']);
 assert.deepEqual(result.verification.discardedDomains,[{domain:'a',reason:'equivocation'}]);
 assert.equal(result.certificate.observations.filter(v=>v.keyId===f.observation(0).keyId).length,2);
});

test('one authenticated domain flooding rounds cannot evict honest-domain histories or cached evidence',()=>{
 const f=fixture(undefined,{mode:'historical',maxRounds:8,maxCertificates:2}),c=f.collector,r=round-100;
 c.add([f.observation(1,{round:r}),f.observation(2,{round:r})]);
 for(let n=r;n<=round;n++)c.add([f.observation(0,{round:n})]);
 c.add([f.observation(3,{round:r})]);
 assert.equal(c.best().verification.round,r);
 for(let n=r;n<=round;n++)c.add([f.observation(0,{round:n,slot:500+n-r})]);
 assert.equal(c.best().verification.round,r);
 const stats=c.stats();
 assert(stats.retainedVotes<=stats.maxVotes);assert(stats.retainedBytes<=stats.maxBytes);
 assert(stats.retainedRounds<=stats.maxRounds);assert.equal(stats.retainedCertificates,1);
 assert.equal(stats.partialDomains,4);
});

test('round, result, vote and byte limits remain bounded across many complete and partial rounds',()=>{
 const f=fixture(undefined,{mode:'historical',maxRounds:8,maxCertificates:2}),c=f.collector;
 for(let r=round-20;r<=round;r++){
  c.add([0,1,2].map(i=>f.observation(i,{round:r,slot:100+r-(round-20)+i})));
  c.add([f.observation(3,{round:r})]);
 }
 const stats=c.stats();
 assert.equal(stats.retainedCertificates,2);assert(stats.retainedRounds<=stats.maxRounds);
 assert(stats.retainedVotes<=stats.maxVotes);assert(stats.retainedBytes<=stats.maxBytes);
 assert.equal(c.certificates().length,2);assert.equal(c.certificates({limit:1}).length,1);
 assert.equal(c.best().verification.round,round);
 const before=JSON.stringify(c.stats());
 assert.throws(()=>c.add(Array.from({length:65},()=>f.observation(0))),is('name_certificate_batch_limit'));
 assert.equal(JSON.stringify(c.stats()),before,'rejected oversized batch has no retained-state effects');
 assert.throws(()=>c.certificates({limit:3}),is('name_certificate_collector_request_invalid'));
});

test('expired observations require explicit history and preserve their original signed dates',()=>{
 const f=fixture(),c=f.collector,rows=[0,1,2].map(i=>f.observation(i));
 c.add(rows);f.setNow(start+roundMs+f.policy.leaseMs+1);
 assert.equal(c.best(),null);
 const history=c.best({mode:'historical'});
 assert.equal(history.verification.historical,true);assert.equal(history.verification.currentWindow,false);
 assert.equal(history.verification.observedAt,start+1000);
 assert.equal(history.verification.expiresAt,start+roundMs+f.policy.leaseMs);
 const fresh=new NameCertificateCollector({policy:f.policy,name:'alpha',now:f.getNow});
 assert.equal(fresh.add(rows).rejected,3);assert.equal(fresh.best(),null);
 assert.equal(fresh.add(rows,{mode:'historical'}).authenticated,3);
 assert.equal(fresh.best({mode:'historical'}).verification.expiresAt,history.verification.expiresAt);
});

test('floor rollback never silently becomes current and older historical acceptance leaves floor unchanged',()=>{
 const f=fixture(),c=f.collector,oldRound=round-1;
 c.add([0,1,2].map(i=>f.observation(i,{round:oldRound,slot:90+i})));
 const current=f.cert([0,1,2].map(i=>f.observation(i)));
 const floor=verifyNameCertificate(current,f.policy,{name:'alpha',now:f.getNow()}).nextFloor;
 const before=JSON.stringify(floor);
 assert.equal(c.best({floor}),null);
 const historical=c.best({floor,mode:'historical'});
 assert.equal(historical.verification.olderThanAccepted,true);
 assert.strictEqual(historical.verification.nextFloor,floor);
 assert.equal(JSON.stringify(floor),before);
 assert.throws(()=>c.best({floor:{...floor,policyId:'0'.repeat(64)},mode:'historical'}),is('name_certificate_floor_invalid'));
});

test('first network acceptance and retained collector evidence cannot bypass policy changes or revocation',()=>{
 const f=fixture(),c=f.collector;c.add([0,1,2].map(i=>f.observation(i)));
 f.policy.revoked=true;assert.throws(()=>c.best({mode:'historical'}),is('name_policy_revoked'));
 delete f.policy.revoked;f.policy.networkId='another-network';
 assert.throws(()=>c.best(),is('name_certificate_policy_changed'));
 f.policy.networkId='network-one';f.setNow(f.policy.validUntil);
 assert.throws(()=>c.best({mode:'historical'}),is('name_policy_inactive'));
});

test('a newer valid quorum supersedes an older equivocating cache without hiding same-round conflict',()=>{
 const f=fixture(),c=f.collector;c.add([0,1,2].map(i=>f.observation(i)));
 c.add([f.observation(0,{txId:other})]);assert.throws(()=>c.best(),is('name_certificate_quorum_rejected'));
 f.setNow(start+roundMs+30000);c.add([1,2,3].map(i=>f.observation(i,{round:round+1,slot:200+i})));
 assert.equal(c.best().verification.round,round+1);
});

