import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {enrollNewNameSignerState,ShardedNameSignerState} from '../src/sharded-name-state.mjs';

const linuxOnly={skip:process.platform!=='linux'?'Requires the Linux directory-fsync contract':false};
const POLICY='a'.repeat(64),EPOCH='b'.repeat(32);
function fixture(t){
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-name-state-test-'));
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const keyId=crypto.createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
 const options={directory:path.join(parent,'state'),policyId:POLICY,keyId,stateEpoch:EPOCH};
 enrollNewNameSignerState({...options,maxNames:10});
 const state={parent,options,store:new ShardedNameSignerState(options),privateKey,publicKey};
 t.after(()=>{
  try{state.store?.close();}catch{}
  // Only the exact mkdtemp-created test directory is removed.
  assert.equal(path.dirname(parent),path.resolve(os.tmpdir()));
  fs.rmSync(parent,{recursive:true,force:true});
 });
 return state;
}
function issue(x,name,round,slot){
 const recordJson=JSON.stringify({name,policyId:POLICY,round,slot});
 const envelope={keyId:x.options.keyId,recordJson,signature:crypto.sign(null,Buffer.from(recordJson),x.privateKey).toString('base64url')};
 return x.store.forName(name).transaction(state=>({state:{...state,maxRound:round,names:{[name]:{round,slot,envelope}}},value:envelope}));
}
function stateFile(x,name){
 const hash=crypto.createHash('sha256').update('signer\0'+POLICY+'\0'+x.options.keyId+'\0'+name).digest('hex');
 return path.join(x.options.directory,hash.slice(0,2),hash,'state.json');
}

test('native Linux: persisted original signature survives close and reopen',linuxOnly,t=>{
 const x=fixture(t),envelope=issue(x,'vevivo',10,200);
 x.store.close();x.store=new ShardedNameSignerState(x.options);
 const restored=x.store.forName('vevivo').read().names.vevivo.envelope;
 assert.deepEqual(restored,envelope);
 assert.ok(crypto.verify(null,Buffer.from(restored.recordJson),x.publicKey,Buffer.from(restored.signature,'base64url')));
 assert.equal(JSON.parse(fs.readFileSync(path.join(x.options.directory,'root.json'),'utf8')).allocatedNames,1);
});

test('native Linux: another process cannot open the active signer root',linuxOnly,t=>{
 const x=fixture(t),sourceUrl=new URL('../src/sharded-name-state.mjs',import.meta.url).href;
 const code='import {ShardedNameSignerState} from '+JSON.stringify(sourceUrl)+';try{new ShardedNameSignerState('+JSON.stringify(x.options)+');process.exitCode=2;}catch(e){if(e.message!=="name_signer_writer_already_open"){console.error(e);process.exitCode=3;}}';
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000,windowsHide:true});
 assert.ifError(child.error);assert.equal(child.status,0,child.stderr);
});

test('native Linux: missing known state is fatal and does not recreate a file',linuxOnly,t=>{
 const x=fixture(t);issue(x,'vevivo',10,200);
 const file=stateFile(x,'vevivo');fs.unlinkSync(file);
 assert.throws(()=>x.store.forName('vevivo').read(),/missing_for_known_name/);
 assert.throws(()=>issue(x,'vevivo',11,201),/missing_for_known_name/);
 assert.equal(fs.existsSync(file),false);
});

test('native Linux: a state-file symlink is rejected',linuxOnly,t=>{
 const x=fixture(t);issue(x,'vevivo',10,200);
 const file=stateFile(x,'vevivo'),backup=path.join(x.parent,'saved-state.json');
 fs.renameSync(file,backup);fs.symlinkSync(backup,file);
 assert.throws(()=>x.store.forName('vevivo').read(),/state_file_invalid/);
});

// These are real filesystem integration checks, not power-loss simulations.
// Linux staging still needs crash/recovery and storage-specific durability QA.
