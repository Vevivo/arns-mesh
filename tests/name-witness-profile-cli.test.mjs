import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {namePolicyId} from '../src/name-certificates.mjs';
import {loadProfile,profileSchema} from '../apps/helper/network-profile.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),script=fileURLToPath(new URL('../scripts/profile.mjs',import.meta.url));
function fixture(t,{count=4}={}){
 const parent=path.join(root,'.test-state'),dir=path.join(parent,'profile-cli-'+crypto.randomUUID());
 fs.mkdirSync(parent,{recursive:true});fs.mkdirSync(dir);
 t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(parent));fs.rmSync(dir,{recursive:true,force:true});});
 const now=Date.now(),policy={schema:'arns-mesh-name-policy/v1',networkId:'test-only-never-deploy',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:'1'.repeat(32),threshold:count===10?7:3,maxFaults:count===10?3:1,roundMs:60000,leaseMs:0,maxFutureSkewMs:1000,validFrom:now-60000,validUntil:now+3600000,witnesses:Array.from({length:count},(_,i)=>({domain:'operator-'+i,publicKeyPem:crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})}))};
 const policyFile=path.join(dir,'test-only-policy.json'),output=path.join(dir,'network-profile.json');
 fs.writeFileSync(policyFile,JSON.stringify(policy));
 const args=['--peer','192.0.2.1:49152','--peer','192.0.2.2:49152','--name-policy',policyFile,'--name-policy-id',namePolicyId(policy),'--output',output];
 const run=(values=args)=>{const result=spawnSync(process.execPath,[script,...values],{encoding:'utf8',timeout:5000,windowsHide:true});assert.ifError(result.error);return result;};
 const reject=(values,pattern)=>{const result=run(values);assert.equal(result.status,1,result.stdout);assert.match(result.stderr,pattern);assert.equal(fs.existsSync(output),false);return result;};
 const replace=(flag,value)=>{const next=[...args];next[next.indexOf(flag)+1]=value;return next;};
 return {dir,policy,policyFile,output,args,run,reject,replace};
}
test('generator produces an active pinned protected profile without shared RPC sources or activation',t=>{
 const f=fixture(t),policyBytes=fs.readFileSync(f.policyFile),result=f.run();assert.equal(result.status,0,result.stderr);
 const profile=loadProfile(f.output);assert.equal(profile.schema,profileSchema);assert.equal(namePolicyId(profile.nameWitnessPolicy),namePolicyId(f.policy));assert.equal(profile.nameWitnessPolicy.threshold,3);
 assert.deepEqual(profile.directPeers,['192.0.2.1:49152','192.0.2.2:49152']);assert.deepEqual(profile.rpcSources,[]);assert.deepEqual(profile.arweavePeers,[]);
 assert.deepEqual(fs.readFileSync(f.policyFile),policyBytes);assert.deepEqual(fs.readdirSync(f.dir).sort(),['network-profile.json','test-only-policy.json']);assert.ok(!result.stdout.includes('PRIVATE KEY'));
 const checked=f.run(['check',f.output]);assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).valid,true);
});
test('ten-domain q7 policy round-trips through profile generator and existing loader',t=>{
 const f=fixture(t,{count:10}),result=f.run();assert.equal(result.status,0,result.stderr);const profile=loadProfile(f.output);
 assert.equal(profile.nameWitnessPolicy.threshold,7);assert.equal(profile.nameWitnessPolicy.witnesses.length,10);assert.equal(namePolicyId(profile.nameWitnessPolicy),namePolicyId(f.policy));
});
test('wrong authenticated policy pin is refused before output',t=>{
 const f=fixture(t);f.reject(f.replace('--name-policy-id','a'.repeat(64)),/name_policy_pin_mismatch/);
});
test('both policy flags are mandatory together',t=>{
 const f=fixture(t);for(const flag of ['--name-policy','--name-policy-id']){const args=[...f.args];args.splice(args.indexOf(flag),2);f.reject(args,/required together/);}
});
test('malformed or duplicate policy pins cannot silently select another policy',t=>{
 const f=fixture(t);for(const pin of ['abc','A'.repeat(64),'https://example.test/policy'])f.reject(f.replace('--name-policy-id',pin),/pin_invalid/);
 f.reject([...f.args,'--name-policy-id',namePolicyId(f.policy)],/Duplicate option/);f.reject([...f.args,'--name-policy',f.policyFile],/Duplicate option/);
});
test('unsafe, malformed and revoked policy input is refused without output',t=>{
 const f=fixture(t);
 fs.writeFileSync(f.policyFile,'{broken');f.reject(f.args,/json_invalid/);
 fs.writeFileSync(f.policyFile,JSON.stringify({...f.policy,threshold:2}));f.reject(f.args,/quorum_unsafe/);
 fs.writeFileSync(f.policyFile,JSON.stringify({...f.policy,revoked:true}));f.reject(f.args,/revoked/);
});
test('expired and not-yet-active policies cannot enter a newly generated profile',t=>{
 const f=fixture(t),now=Date.now();for(const patch of [{validFrom:now-120000,validUntil:now-60000},{validFrom:now+60000,validUntil:now+120000}]){
  const policy={...f.policy,...patch};fs.writeFileSync(f.policyFile,JSON.stringify(policy));f.reject(f.replace('--name-policy-id',namePolicyId(policy)),/inactive/);
 }
});
test('oversized and non-file policy inputs are rejected before output',t=>{
 const f=fixture(t);fs.writeFileSync(f.policyFile,' '.repeat(65537));f.reject(f.args,/input_invalid/);f.reject(f.replace('--name-policy',f.dir),/input_invalid/);
});
test('existing output is retained byte-for-byte and never activates an updated policy',t=>{
 const f=fixture(t),prior=Buffer.from('original-profile-do-not-overwrite');fs.writeFileSync(f.output,prior);
 const result=f.run();assert.equal(result.status,1);assert.match(result.stderr,/EEXIST/);assert.deepEqual(fs.readFileSync(f.output),prior);
 assert.deepEqual(fs.readdirSync(f.dir).sort(),['network-profile.json','test-only-policy.json']);
});
test('legacy generator preserves endpoint, raw-source and trusted-peer options',t=>{
 const f=fixture(t),witness='a'.repeat(64),result=f.run(['--peer','192.0.2.1:49152','--rpc','192.0.2.3:8899','--arweave','192.0.2.4:1984','--trust-peer',witness,'--output',f.output]);assert.equal(result.status,0,result.stderr);
 assert.deepEqual(loadProfile(f.output),{schema:profileSchema,directPeers:['192.0.2.1:49152'],rpcSources:['192.0.2.3:8899'],arweavePeers:['192.0.2.4:1984'],trustedPeers:[witness]});
});
test('legacy profiles still require a live-name RPC when no certificate policy is configured',t=>{
 const f=fixture(t);f.reject(['--peer','192.0.2.1:49152','--output',f.output],/RPC is required/);
});
