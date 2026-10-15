import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createReviewedNamePolicy,checkReviewedNamePolicy,runNameWitnessPolicyCommand} from '../scripts/name-witness-policy.mjs';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,verifyNameCertificate,witnessKeyId} from '../src/name-certificates.mjs';
import {MemoryFs} from './helpers/memory-fs.mjs';

const START=1800000000000,NOW=START+1000,GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',PROGRAM='1'.repeat(32),TARGET='A'.repeat(43),OTHER='B'.repeat(43);
function fixture(n=4,maxFaults=1){
 const keys=Array.from({length:n},()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,i)=>({domain:'operator-'+String(i).padStart(2,'0'),publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const input={roster:{schema:'arns-mesh-name-witness-roster/v1',witnesses},networkId:'reviewed-pilot',genesisHash:GENESIS,registryProgramId:PROGRAM,maxFaults,validFrom:START-60000,validUntil:START+86400000,roundMs:60000,leaseMs:0,maxFutureSkewMs:1000};
 const make=patch=>createReviewedNamePolicy({...input,...patch},{now:()=>NOW}),policy=make();
 const vote=(i,{target=TARGET,round=START/60000,slot=100+i}={})=>{
  const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:PROGRAM,antProgramId:PROGRAM,txId:target,round,slot,observedAt:round*60000+500,issuedAt:round*60000+600});
  return {keyId:witnessKeyId(witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[i].privateKey).toString('base64url')};
 };
 const certificate=observations=>({schema:'arns-mesh-name-certificate/v1',round:START/60000,observations});
 const check=(cert,patch={})=>verifyNameCertificate(cert,policy,{name:'alpha',now:NOW,...patch});
 return {input,make,keys,witnesses,policy,vote,certificate,check};
}
function commandFixture(n=10,f=3){
 const base=fixture(n,f),dir=path.resolve('policy-command-fixture'),io=new MemoryFs(dir),roster=path.join(dir,'roster.json'),output=path.join(dir,'policy.json');
 io.entries.set(roster,{type:'file',data:JSON.stringify(base.input.roster)});
 const args=['create','--roster',roster,'--network-id','reviewed-pilot','--genesis-hash',GENESIS,'--registry-program-id',PROGRAM,'--max-faults',String(f),'--valid-from',new Date(START-60000).toISOString(),'--valid-until',new Date(START+86400000).toISOString(),'--round-ms','60000','--lease-ms','0','--max-future-skew-ms','1000','--output',output];
 const run=(values=args,options={})=>runNameWitnessPolicyCommand(values,{io,now:()=>NOW,...options});
 return {...base,dir,io,roster,output,args,run};
}

test('reviewed four-domain policy computes q3 f1 and stable policy identity',()=>{
 const f=fixture();assert.equal(f.policy.threshold,3);assert.equal(f.policy.maxFaults,1);
 assert.equal(namePolicyId(f.policy),namePolicyId(f.make({roster:{...f.input.roster,witnesses:[...f.witnesses].reverse()}})));
 assert.equal(checkReviewedNamePolicy(f.policy,{now:()=>NOW}).threshold,3);
});
test('reviewed ten-domain policy computes q7 f3 with Byzantine quorum intersection',()=>{
 const f=fixture(10,3);assert.equal(f.policy.threshold,7);assert.equal(2*f.policy.threshold-f.policy.witnesses.length,4);assert.equal(f.policy.witnesses.length-f.policy.maxFaults,7);
});
test('actual ten-key certificate accepts seven matching observations and rejects six',()=>{
 const f=fixture(10,3),votes=Array.from({length:7},(_,i)=>f.vote(i));
 const verified=f.check(f.certificate(votes));assert.equal(verified.domains.length,7);assert.equal(verified.binding.txId,TARGET);assert.equal(verified.maxFaults,3);
 assert.throws(()=>f.check(f.certificate(votes.slice(0,6))),/quorum_unmet/);
});
test('ten-domain core tolerates three dissenting targets without counting their votes',()=>{
 const f=fixture(10,3),votes=Array.from({length:10},(_,i)=>f.vote(i,{target:i<7?TARGET:OTHER}));
 const verified=f.check(f.certificate(votes));assert.equal(verified.binding.txId,TARGET);assert.equal(verified.domains.length,7);
});
test('replaying one signature seven times never satisfies the ten-domain policy',()=>{
 const f=fixture(10,3),vote=f.vote(0);assert.throws(()=>f.check(f.certificate(Array(7).fill(vote))),/quorum_unmet/);
});
test('equivocating domain is discarded and the other seven matching domains succeed',()=>{
 const f=fixture(10,3),votes=[f.vote(0),f.vote(0,{target:OTHER}),...Array.from({length:7},(_,i)=>f.vote(i+1))];
 const verified=f.check(f.certificate(votes));assert.equal(verified.domains.length,7);assert.deepEqual(verified.discardedDomains,[{domain:'operator-00',reason:'equivocation'}]);
});
test('ten-domain history retains original times and cannot become current after expiry',()=>{
 const f=fixture(10,3),cert=f.certificate(Array.from({length:7},(_,i)=>f.vote(i)));
 assert.throws(()=>f.check(cert,{now:START+60000}),/expired/);
 const historical=f.check(cert,{now:START+120000,mode:'historical'});assert.equal(historical.observedAt,START+500);assert.equal(historical.expiresAt,START+60000);assert.equal(historical.currentWindow,false);
});
test('changed roster or scope changes policy ID and cannot authorize old signatures',()=>{
 const f=fixture(10,3),cert=f.certificate(Array.from({length:7},(_,i)=>f.vote(i))),other=f.make({networkId:'another-reviewed-pilot'});
 assert.notEqual(namePolicyId(other),namePolicyId(f.policy));assert.throws(()=>verifyNameCertificate(cert,other,{name:'alpha',now:NOW}),/scope_mismatch/);
});
test('unsafe majority and unavailable threshold choices are rejected',()=>{
 const f=fixture(10,3);for(const threshold of [2,6,8,10])assert.throws(()=>f.make({threshold}),/quorum_unsafe/);
 assert.throws(()=>f.make({maxFaults:4}),/quorum_unsafe/);
 const four=fixture();assert.throws(()=>four.make({maxFaults:2}),/quorum_unsafe/);
});
test('duplicate operator domains and cloned keys cannot create apparent independence',()=>{
 const f=fixture(),witnesses=structuredClone(f.witnesses);witnesses[1].domain=witnesses[0].domain;
 assert.throws(()=>f.make({roster:{schema:f.input.roster.schema,witnesses}}),/duplicate_domain/);
 witnesses[1]={domain:'another-operator',publicKeyPem:witnesses[0].publicKeyPem.replace(/\n/g,'\r\n')};
 assert.throws(()=>f.make({roster:{schema:f.input.roster.schema,witnesses}}),/duplicate_key/);
});
test('private key PEM and non-Ed25519 keys are refused before any output',()=>{
 const f=fixture(),witnesses=structuredClone(f.witnesses);
 witnesses[0].publicKeyPem=f.keys[0].privateKey.export({type:'pkcs8',format:'pem'});
 assert.throws(()=>f.make({roster:{schema:f.input.roster.schema,witnesses}}),/public_key_required/);
 witnesses[0].publicKeyPem=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'});
 assert.throws(()=>f.make({roster:{schema:f.input.roster.schema,witnesses}}),/public_key_invalid/);
});
test('program must decode to32 bytes while genesis remains an exact base58 token',()=>{
 const f=fixture();assert.equal(f.policy.chainId,'solana:'+GENESIS);
 for(const program of ['z'.repeat(44),'1'.repeat(31),'1'.repeat(33)])assert.throws(()=>f.make({registryProgramId:program}),/program_invalid/);
 for(const genesisHash of ['https://example.test','0'.repeat(32),' '+GENESIS])assert.throws(()=>f.make({genesisHash}),/genesis_invalid/);
});
test('create writes one public policy only and exposes useful public review summary',()=>{
 const f=commandFixture(),before=f.io.readFileSync(f.roster),result=f.run();
 assert.equal(result.witnessDomains,10);assert.equal(result.threshold,7);assert.equal(result.maxFaults,3);assert.equal(result.minimumQuorumIntersection,4);assert.equal(result.availableWithMaxFaults,7);
 assert.equal(result.policyId,namePolicyId(JSON.parse(f.io.readFileSync(f.output))));assert.equal(result.active,true);assert.equal(result.witnesses.length,10);
 assert.equal(f.io.readFileSync(f.roster),before);assert.ok(!JSON.stringify(result).includes('PRIVATE KEY'));
 assert.deepEqual(f.io.events.filter(e=>e.op==='open-new').map(e=>e.path),[f.output]);
});
test('create never overwrites an existing or pinned policy file',()=>{
 const f=commandFixture();f.run();const before=f.io.readFileSync(f.output);
 assert.throws(()=>f.run(),/output_exists/);assert.equal(f.io.readFileSync(f.output),before);
});
test('check is read-only and can compare an independently authenticated policy ID',()=>{
 const f=commandFixture(),created=f.run(),before=f.io.events.length;
 const result=f.run(['check','--policy',f.output,'--policy-id',created.policyId]);assert.equal(result.valid,true);assert.equal(result.policyId,created.policyId);
 assert.equal(f.io.events.slice(before).filter(e=>['write','open-new','mkdir'].includes(e.op)).length,0);
 assert.throws(()=>f.run(['check','--policy',f.output,'--policy-id','a'.repeat(64)]),/pin_mismatch/);
});
test('future candidate may be reviewed, but active check and enrollment timing are not bypassed',()=>{
 const f=commandFixture(),args=[...f.args],at=args.indexOf('--valid-from');args[at+1]=new Date(START+60000).toISOString();
 const result=f.run(args);assert.equal(result.active,false);assert.throws(()=>f.run(['check','--policy',f.output]),/inactive/);
});
test('expired and revoked policies cannot pass active check',()=>{
 const f=commandFixture();f.run();assert.throws(()=>f.run(['check','--policy',f.output],{now:()=>START+86400000}),/inactive/);
 const policy=JSON.parse(f.io.readFileSync(f.output));policy.revoked=true;f.io.entries.set(f.output,{type:'file',data:JSON.stringify(policy)});
 assert.throws(()=>f.run(['check','--policy',f.output]),/revoked/);
});
test('all time and scope options are explicit; unknown or duplicate options fail',()=>{
 const f=commandFixture();for(const args of [f.args.slice(0,-2),[...f.args,'--max-faults','0'],[...f.args,'--supporters','10'],['create','--output',f.output]])assert.throws(()=>f.run(args),/usage/);
 assert.ok(!f.io.entries.has(f.output));
});
test('invalid UTC calendar dates, timezone offsets and unsafe integer forms are refused',()=>{
 const f=commandFixture();
 for(const [option,value] of [['--valid-from','2026-02-30T00:00:00Z'],['--valid-from','2026-10-15T12:00:00+03:00'],['--valid-from','now'],['--max-faults','3e0'],['--round-ms','060000']]){
  const args=[...f.args];args[args.indexOf(option)+1]=value;assert.throws(()=>f.run(args),/time_invalid|utc_time_required|integer_required/);
 }
 assert.ok(!f.io.entries.has(f.output));
});
test('oversized and symlink inputs are rejected; malformed roster has no output',()=>{
 const f=commandFixture();f.io.entries.set(f.roster,{type:'file',data:' '.repeat(65537)});assert.throws(()=>f.run(),/input_invalid/);
 f.io.entries.set(f.roster,{type:'symlink'});assert.throws(()=>f.run(),/input_invalid/);
 f.io.entries.set(f.roster,{type:'file',data:'{"schema":"unexpected","witnesses":[]}'});assert.throws(()=>f.run(),/roster_invalid/);
 assert.ok(!f.io.entries.has(f.output));
});
test('pilot helper refuses key-rotation-shaped policies that current signer cannot enroll',()=>{
 const f=fixture(),policy=structuredClone(f.policy);policy.witnesses.push({domain:policy.witnesses[0].domain,publicKeyPem:crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})});
 assert.throws(()=>checkReviewedNamePolicy(policy,{now:()=>NOW}),/duplicate_domain/);
});
test('policy helper does not weaken deployment maxFaults or mutate inputs',()=>{
 const f=fixture(10,3),before=JSON.stringify(f.input);assert.throws(()=>f.make({threshold:6}),/quorum_unsafe/);assert.equal(JSON.stringify(f.input),before);
 const g=fixture(4,1);assert.equal(g.make({threshold:3}).threshold,3);
});
test('real CLI creates and checks a public test policy without overwriting existing file',t=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),parent=path.join(root,'.test-state'),dir=path.join(parent,'policy-cli-'+crypto.randomUUID());
 fs.mkdirSync(parent,{recursive:true});fs.mkdirSync(dir);
 t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(parent));fs.rmSync(dir,{recursive:true,force:true});});
 const f=fixture(10,3),roster=path.join(dir,'test-only-roster.json'),output=path.join(dir,'test-only-policy.json');
 fs.writeFileSync(roster,JSON.stringify(f.input.roster));
 const start=Math.floor(Date.now()/60000)*60000;
 const script=fileURLToPath(new URL('../scripts/name-witness-policy.mjs',import.meta.url));
 const args=['create','--roster',roster,'--network-id','test-only-never-deploy','--genesis-hash',GENESIS,'--registry-program-id',PROGRAM,'--max-faults','3','--valid-from',new Date(start-60000).toISOString(),'--valid-until',new Date(start+3600000).toISOString(),'--round-ms','60000','--lease-ms','0','--max-future-skew-ms','1000','--output',output];
 const run=values=>{const result=spawnSync(process.execPath,[script,...values],{encoding:'utf8',timeout:5000,windowsHide:true});assert.ifError(result.error);return result;};
 const created=run(args);assert.equal(created.status,0,created.stderr);const report=JSON.parse(created.stdout);assert.equal(report.threshold,7);assert.equal(report.witnessDomains,10);
 assert.ok(!created.stdout.includes('PRIVATE KEY'));const bytes=fs.readFileSync(output);
 const checked=run(['check','--policy',output,'--policy-id',report.policyId]);assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).valid,true);
 const duplicate=run(args);assert.equal(duplicate.status,1);assert.equal(duplicate.stderr.trim(),'name_witness_policy_output_exists');assert.deepEqual(fs.readFileSync(output),bytes);
 assert.deepEqual(fs.readdirSync(dir).sort(),['test-only-policy.json','test-only-roster.json']);
});
