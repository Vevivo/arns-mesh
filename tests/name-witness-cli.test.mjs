import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runNameWitnessCommand} from '../scripts/name-witness.mjs';
import {namePolicyId,witnessKeyId} from '../src/name-certificates.mjs';
import {ShardedNameSignerState} from '../src/sharded-name-state.mjs';
import {MemoryFs} from './helpers/memory-fs.mjs';

const NOW=Date.parse('2026-10-15T12:00:01Z');
function fixture(){
 const parent=path.resolve('witness-cli-fixture'),dir=path.join(parent,'operator'),sourceRoot=path.join(parent,'source'),io=new MemoryFs(parent);
 const events=[];const open=io.openSync.bind(io),mkdir=io.mkdirSync.bind(io);
 io.openSync=(file,flags,mode)=>{events.push({operation:'open',file,flags,mode});return open(file,flags,mode);};
 io.mkdirSync=(file,options)=>{events.push({operation:'mkdir',file,options});return mkdir(file,options);};
 const options={io,platform:'linux',now:()=>NOW,sourceRoot};
 const peerDir=path.join(parent,'existing-peer');io.mkdirSync(peerDir);
 io.entries.set(path.join(peerDir,'existing-content-fixture'),{type:'file',data:'Existing synthetic fixture must remain unchanged.'});
 const run=(args,extra={})=>runNameWitnessCommand(args,{...options,...extra});
 const generate=()=>run(['keygen','--data-dir',dir]);
 function policy({own=true,overrides={}}={}){
  const publicKeyPem=io.readFileSync(path.join(dir,'public-key.pem'));
  const witnesses=Array.from({length:4},(_,i)=>({domain:'operator-'+i,publicKeyPem:i===0&&own?publicKeyPem:crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})}));
  return {schema:'arns-mesh-name-policy/v1',networkId:'mesh-test',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:'1'.repeat(32),threshold:3,maxFaults:1,roundMs:60000,leaseMs:0,maxFutureSkewMs:500,validFrom:NOW-1000,validUntil:NOW+86400000,witnesses,...overrides};
 }
 const policyFile=path.join(parent,'policy.json');
 function savePolicy(value){io.entries.set(policyFile,{type:'file',data:JSON.stringify(value)});if(!value.revoked){io.entries.set(path.join(peerDir,'name-witness-policy.json'),{type:'file',data:JSON.stringify(value)});io.entries.set(path.join(peerDir,'name-security-required.json'),{type:'file',data:JSON.stringify({schema:'arns-mesh-name-security-required/v1',policyId:namePolicyId(value)})});}return value;}
 function enroll(value,extra=[]){savePolicy(value);return run(['enroll','--data-dir',dir,'--peer-data-dir',peerDir,'--policy',policyFile,'--policy-id',namePolicyId(value),...extra]);}
 return {parent,dir,peerDir,io,events,run,generate,policy,savePolicy,policyFile,enroll};
}
test('keygen creates real Ed25519 key privately without printing key bytes',()=>{
 const f=fixture(),result=f.generate();
 const privatePem=f.io.readFileSync(path.join(f.dir,'private-key.pem'));
 const publicPem=f.io.readFileSync(result.publicKeyFile);
 assert.equal(crypto.createPrivateKey(privatePem).asymmetricKeyType,'ed25519');
 assert.equal(witnessKeyId(publicPem),result.keyId);
 assert.ok(!JSON.stringify(result).includes('BEGIN PRIVATE KEY'));
 assert.equal(f.events.find(e=>e.operation==='mkdir'&&e.file===f.dir).options.mode,0o700);
 assert.equal(f.events.find(e=>e.file===path.join(f.dir,'private-key.pem')).mode,0o600);
 assert.equal(f.events.find(e=>e.file===path.join(f.dir,'private-key.pem')).flags,'wx');
 const signature=crypto.sign(null,Buffer.from('fixture'),privatePem);
 assert.ok(crypto.verify(null,Buffer.from('fixture'),publicPem,signature));
});
test('existing identity directory cannot be overwritten or regenerated',()=>{const f=fixture();f.generate();const before=f.io.readFileSync(path.join(f.dir,'private-key.pem'));assert.throws(()=>f.generate(),/already_exists/);assert.equal(f.io.readFileSync(path.join(f.dir,'private-key.pem')),before);});
test('new enrollment pins policy, key and epoch and supplies runtime environment paths',()=>{
 const f=fixture(),key=f.generate(),p=f.policy(),result=f.enroll(p);
 assert.equal(result.keyId,key.keyId);assert.equal(result.policyId,namePolicyId(p));assert.equal(result.domain,'operator-0');
 const env=JSON.parse(f.io.readFileSync(result.configurationFile));
 assert.deepEqual(Object.keys(env).sort(),['ARNS_NAME_SIGNER_EPOCH','ARNS_NAME_SIGNER_KEY','ARNS_NAME_SIGNER_STATE']);
 assert.equal(env.ARNS_NAME_SIGNER_EPOCH,result.stateEpoch);
 assert.deepEqual(JSON.parse(f.io.readFileSync(path.join(f.dir,'name-security-required.json'))),{schema:'arns-mesh-name-security-required/v1',policyId:result.policyId});
 const state=new ShardedNameSignerState({directory:env.ARNS_NAME_SIGNER_STATE,policyId:result.policyId,keyId:result.keyId,stateEpoch:result.stateEpoch,io:f.io,now:()=>NOW});
 assert.equal(state.forName('vevivo').read().maxRound,-1);state.close();
 assert.ok(!JSON.stringify(result).includes('BEGIN PRIVATE KEY'));assert.ok(!f.io.readFileSync(result.configurationFile).includes('BEGIN PRIVATE KEY'));
});
test('enrollment reservation is fsynced before state directory creation',()=>{
 const f=fixture();f.generate();f.enroll(f.policy());
 const marker=path.join(f.dir,'enrollment-consumed.json');
 const sync=f.io.events.findIndex(e=>e.op==='syncfile'&&e.path===marker),directorySync=f.io.events.findIndex((e,i)=>i>sync&&e.op==='syncdir'&&e.path===f.dir),created=f.io.events.findIndex(e=>e.op==='mkdir'&&e.path===path.join(f.dir,'signer-state'));
 assert.ok(sync>=0&&directorySync>sync&&created>directorySync);
});
test('repeated enrollment is rejected and no signatures or state are reset',()=>{
 const f=fixture();f.generate();const p=f.policy(),result=f.enroll(p),marker=f.io.readFileSync(path.join(f.dir,'enrollment-consumed.json'));
 assert.throws(()=>f.enroll(p),/already_enrolled_or_interrupted/);assert.equal(f.io.readFileSync(path.join(f.dir,'enrollment-consumed.json')),marker);
 assert.equal(JSON.parse(f.io.readFileSync(result.configurationFile)).ARNS_NAME_SIGNER_EPOCH,result.stateEpoch);
});
test('failed state initialization cannot reenroll old key after interruption',()=>{
 const f=fixture();f.generate();const p=f.policy();
 f.io.fault=e=>e.op==='mkdir'&&e.path===path.join(f.dir,'signer-state');
 assert.throws(()=>f.enroll(p),/EIO/);assert.throws(()=>f.enroll(p),/already_enrolled_or_interrupted/);
 assert.ok(f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));assert.ok(!f.io.entries.has(path.join(f.dir,'runtime-env.json')));
});
test('missing signer root after enrollment cannot create fresh old-key state',()=>{
 const f=fixture();f.generate();const p=f.policy();f.enroll(p);const root=path.join(f.dir,'signer-state');
 for(const key of f.io.entries.keys())if(key===root||key.startsWith(root+path.sep))f.io.entries.delete(key);
 assert.throws(()=>f.enroll(p),/already_enrolled_or_interrupted/);assert.ok(!f.io.entries.has(root));
});
test('wrong authenticated policy pin consumes no enrollment state',()=>{
 const f=fixture();f.generate();f.savePolicy(f.policy());
 assert.throws(()=>f.run(['enroll','--data-dir',f.dir,'--peer-data-dir',f.peerDir,'--policy',f.policyFile,'--policy-id','a'.repeat(64)]),/pin_mismatch/);
 assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
});
test('key absent from policy and inactive policy are rejected before enrollment',()=>{
 const f=fixture();f.generate();assert.throws(()=>f.enroll(f.policy({own:false})),/not_in_policy/);
 assert.throws(()=>f.enroll(f.policy({overrides:{validUntil:NOW-1,validFrom:NOW-5000}})),/inactive/);
 assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
});
test('parallel keys in the local operator domain require shared-state migration',()=>{
 const f=fixture();f.generate();const p=f.policy();
 p.witnesses.push({domain:'operator-0',publicKeyPem:crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})});
 assert.throws(()=>f.enroll(p),/domain_key_rotation_requires_shared_state/);
 assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
});
test('revoked policy fails without consuming identity',()=>{
 const f=fixture();f.generate();const p=f.policy(),pin=namePolicyId(p);p.revoked=true;f.savePolicy(p);
 assert.throws(()=>f.run(['enroll','--data-dir',f.dir,'--peer-data-dir',f.peerDir,'--policy',f.policyFile,'--policy-id',pin]),/revoked/);
 assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
});
test('tampered private key cannot be enrolled with generated identity',()=>{
 const f=fixture();f.generate();const p=f.policy();
 f.io.entries.set(path.join(f.dir,'private-key.pem'),{type:'file',data:crypto.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'})});
 assert.throws(()=>f.enroll(p),/identity_key_mismatch/);
});
test('incomplete key generation is not accepted as an unused identity',()=>{
 const f=fixture();f.io.fault=e=>e.op==='open-new'&&e.path===path.join(f.dir,'identity.json');assert.throws(()=>f.generate(),/EIO/);
 assert.throws(()=>f.enroll(f.policy()),/json_invalid/);assert.throws(()=>f.generate(),/already_exists/);
});
test('no import-key flag, reset flag, duplicate argument or relative data path',()=>{
 const f=fixture();
 for(const args of [['keygen','--data-dir',f.dir,'--private-key','old.pem'],['enroll','--reset','yes'],['keygen','--data-dir',f.dir,'--data-dir',f.dir],['keygen','--data-dir','relative']])assert.throws(()=>f.run(args),/usage|absolute_data/);
 assert.ok(!f.io.entries.has(f.dir));
});
test('source directory and unsupported platform are rejected before writes',()=>{
 const f=fixture();assert.throws(()=>f.run(['keygen','--data-dir',path.join(f.parent,'source','keys')]),/inside_source/);
 assert.throws(()=>f.run(['keygen','--data-dir',f.dir],{platform:'win32'}),/linux_required/);assert.ok(!f.io.entries.has(f.dir));
});
test('symlink ancestor and key files are rejected',()=>{
 const f=fixture();f.io.entries.set(path.join(f.parent,'linked'),{type:'symlink'});assert.throws(()=>f.run(['keygen','--data-dir',path.join(f.parent,'linked','operator')]),/directory_invalid/);
 f.generate();const p=f.policy();f.io.entries.set(path.join(f.dir,'private-key.pem'),{type:'symlink'});assert.throws(()=>f.enroll(p),/file_invalid/);
});
test('invalid capacity and non-Solana chain consume no reservation',()=>{
 const f=fixture();f.generate();for(const value of ['0','1000001','1e3','01','2.5'])assert.throws(()=>f.enroll(f.policy(),['--max-names',value]),/capacity_invalid/);
 assert.throws(()=>f.enroll(f.policy({overrides:{chainId:'other-chain'}})),/chain_invalid/);
 assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
});
test('clock rollback between keygen and enrollment fails closed',()=>{
 const f=fixture();f.generate();const p=f.savePolicy(f.policy());assert.throws(()=>f.run(['enroll','--data-dir',f.dir,'--peer-data-dir',f.peerDir,'--policy',f.policyFile,'--policy-id',namePolicyId(p)],{now:()=>NOW-1}),/clock_rollback/);
});
test('successful enrollment returns only public metadata and paths',()=>{
 const f=fixture();f.generate();const result=f.enroll(f.policy());
 assert.deepEqual(Object.keys(result).sort(),['command','configurationFile','domain','keyId','maxNames','peerDataDirectory','policyId','stateEpoch']);
});
test('enrollment checks existing protected peer directory without modifying its contents',()=>{
 const f=fixture();f.generate();const p=f.savePolicy(f.policy());
 const before=[...f.io.entries].filter(([key])=>key.startsWith(f.peerDir+path.sep)).map(([key,value])=>[key,structuredClone(value)]);
 const result=f.run(['enroll','--data-dir',f.dir,'--peer-data-dir',f.peerDir,'--policy',f.policyFile,'--policy-id',namePolicyId(p)]);
 assert.equal(result.peerDataDirectory,f.peerDir);
 assert.deepEqual([...f.io.entries].filter(([key])=>key.startsWith(f.peerDir+path.sep)),before);
 assert.ok(!Object.hasOwn(JSON.parse(f.io.readFileSync(result.configurationFile)),'ARNS_MESH_DATA'));
});
test('missing or mismatched existing peer policy fails before consuming new key',()=>{
 for(const mutation of ['missing','different','marker']){
  const f=fixture();f.generate();const p=f.savePolicy(f.policy());
  if(mutation==='missing')f.io.entries.delete(path.join(f.peerDir,'name-witness-policy.json'));
  if(mutation==='different')f.io.entries.set(path.join(f.peerDir,'name-witness-policy.json'),{type:'file',data:JSON.stringify({...p,networkId:'different'})});
  if(mutation==='marker')f.io.entries.delete(path.join(f.peerDir,'name-security-required.json'));
  assert.throws(()=>f.run(['enroll','--data-dir',f.dir,'--peer-data-dir',f.peerDir,'--policy',f.policyFile,'--policy-id',namePolicyId(p)]),/json_invalid|peer_policy_mismatch/);
  assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
 }
});
test('real CLI process rejects imported-key arguments without echoing their contents',()=>{
 const secret='PRIVATE_KEY_INPUT_MUST_NOT_APPEAR';
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/name-witness.mjs',import.meta.url)),'keygen','--private-key',secret],{encoding:'utf8',timeout:5000,windowsHide:true});
 assert.ifError(child.error);assert.equal(child.status,1);assert.equal(child.stdout,'');assert.equal(child.stderr.trim(),'name_witness_usage');assert.ok(!child.stderr.includes(secret));
});

test('pilot enrollment validates a dedicated numeric RPC file and preserves shared peer settings',()=>{
 const f=fixture();f.generate();const p=f.policy(),rpcFile=path.join(f.parent,'operator-rpc.json');
 const original='[{"host":"192.0.2.10","port":8899}]';f.io.entries.set(rpcFile,{type:'file',data:original});
 const sharedFile=path.join(f.peerDir,'solana-rpc-seeds.json'),shared='[{"host":"198.51.100.10","port":8899}]';f.io.entries.set(sharedFile,{type:'file',data:shared});
 const result=f.enroll(p,['--rpc-seeds',rpcFile]),env=JSON.parse(f.io.readFileSync(result.configurationFile));
 assert.equal(env.ARNS_NAME_SIGNER_RPC_SEEDS,rpcFile);assert.equal(f.io.readFileSync(sharedFile),shared);assert.equal(f.io.readFileSync(rpcFile),original);
});

test('malformed or managed RPC seed files fail before consuming a new witness identity',()=>{
 for(const seeds of [[],[{host:'rpc.example',port:8899}],[{host:'192.0.2.1',port:0}],[{host:'192.0.2.1',port:8899,token:'do not accept'}],Array.from({length:17},()=>({host:'192.0.2.1',port:8899}))]){
  const f=fixture();f.generate();const rpcFile=path.join(f.parent,'invalid-rpc.json');f.io.entries.set(rpcFile,{type:'file',data:JSON.stringify(seeds)});
  assert.throws(()=>f.enroll(f.policy(),['--rpc-seeds',rpcFile]),/rpc_seeds_invalid/);assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
 }
 const f=fixture();f.generate();const sharedFile=path.join(f.peerDir,'solana-rpc-seeds.json');f.io.entries.set(sharedFile,{type:'file',data:'[{"host":"192.0.2.1","port":8899}]'});
 assert.throws(()=>f.enroll(f.policy(),['--rpc-seeds',sharedFile]),/dedicated_rpc_file_required/);assert.ok(!f.io.entries.has(path.join(f.dir,'enrollment-consumed.json')));
});
