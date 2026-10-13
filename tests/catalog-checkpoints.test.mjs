import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {getArnsRecordEncoder} from '@ar.io/solana-contracts/arns';
import {MAINNET_PROGRAM_IDS,getAntRecordPDA,getArnsRecordPDA} from '@ar.io/sdk';
import {TargetCatalog} from '../src/target-catalog.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
const mint='11111111111111111111111111111111',target='A'.repeat(43),version={major:1,minor:0,patch:0};
async function setup(t,{count=32,abortAt=0,badAt=0}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-checkpoint-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const snapshots=new NameSnapshotStore(path.join(dir,'names.json')),controller=new AbortController(),accounts=new Map();
 const names=Array.from({length:count},(_,i)=>'batch-'+i);
 for(const name of names){
  const [pda]=await getArnsRecordPDA(name),raw=getArnsRecordEncoder().encode({name,nameHash:crypto.createHash('sha256').update(name).digest(),owner:mint,ant:mint,purchaseType:1,startTimestamp:1,endTimestamp:null,undernameLimit:10,purchasePrice:0,bump:255,version});
  accounts.set(String(pda),{owner:MAINNET_PROGRAM_IDS.arns,data:[Buffer.from(raw).toString('base64'),'base64']});
 }
 const [pda]=await getAntRecordPDA(mint,'@'),raw=getAntRecordEncoder().encode({mint,undername:'@',target,targetProtocol:0,ttlSeconds:60,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version});
 const ant={pubkey:String(pda),account:{owner:MAINNET_PROGRAM_IDS.ant,data:[Buffer.from(raw).toString('base64'),'base64']}};
 let scans=0,targetWrites=0,nameWrites=0;
 const catalog=new TargetCatalog({file:path.join(dir,'targets.json'),snapshotStore:snapshots,rpc:async(_ep,method,params)=>{
  if(method==='getAccountInfo')return {context:{slot:100},value:accounts.get(params[0])||null};
  scans++;
  if(scans===abortAt){controller.abort(new Error('fixture_abort'));throw controller.signal.reason;}
  if(scans===badAt)return {context:{slot:100},value:[{...ant,account:{...ant.account,owner:mint}}]};
  return {context:{slot:100},value:[ant]};
 }});
 catalog.state.registry=names.map(name=>({name,mint}));catalog.state.registryAt=Date.now();catalog.state.slot=99;
 const saveCatalog=catalog.save.bind(catalog),saveNames=snapshots.save.bind(snapshots);
 catalog.save=()=>{targetWrites++;saveCatalog();};snapshots.save=()=>{nameWrites++;saveNames();};
 return {catalog,snapshots,controller,names,dir,counts:()=>({targetWrites,nameWrites,scans})};
}
test('bounded catalogue checkpoints reduce writes and persist every validated binding before returning',async t=>{
 const f=await setup(t),originalNow=Date.now,fixedNow=originalNow();Date.now=()=>fixedNow;t.after(()=>{Date.now=originalNow;});await f.catalog.step({mints:32});
 assert.equal(f.snapshots.names().length,32);assert.equal(f.counts().nameWrites,32);
 assert.ok(f.counts().targetWrites<=8,'32 buffered replies group target checkpoints while snapshots remain immediately durable');
 assert.ok(f.counts().targetWrites<f.counts().nameWrites);
 assert.equal(new NameSnapshotStore(f.snapshots.file).names().length,32);
 const restored=new TargetCatalog({file:f.catalog.file});assert.equal(Object.keys(restored.state.targets).length,32);assert.equal(restored.state.cursor,0);
 for(const name of f.names)assert.equal(f.snapshots.get(name).provenance.kind,'local-rpc');
});
test('abort flushes successful earlier observations and scan progress before rejecting',async t=>{
 const f=await setup(t,{count:5,abortAt:3});
 await assert.rejects(f.catalog.step({mints:5,signal:f.controller.signal}),/fixture_abort/);
 assert.deepEqual(new NameSnapshotStore(f.snapshots.file).names(),f.names.slice(0,2));
 const restored=new TargetCatalog({file:f.catalog.file});assert.equal(restored.state.cursor,3);assert.equal(Object.keys(restored.state.targets).length,2);assert.match(restored.state.errors.at(-1).error,/fixture_abort/);
});
test('an invalid mint cannot contaminate a checkpoint or prevent later valid names from persisting',async t=>{
 const f=await setup(t,{count:5,badAt:3});await f.catalog.step({mints:5});
 const names=new NameSnapshotStore(f.snapshots.file).names();assert.equal(names.length,4);assert.equal(names.includes(f.names[2]),false);assert.equal(names.includes(f.names[4]),true);assert.match(f.catalog.state.errors.at(-1).error,/owner_mismatch/);
});
test('elapsed checkpoint flushes current observations before the next slow mint request',async t=>{
 const f=await setup(t,{count:3}),rpc=f.catalog.rpc,originalNow=Date.now;let clock=originalNow(),mintCalls=0;
 Date.now=()=>clock;t.after(()=>{Date.now=originalNow;});
 f.catalog.rpc=async(...args)=>{
  if(args[1]==='getProgramAccounts'){mintCalls++;if(mintCalls===2)assert.equal(Object.keys(new TargetCatalog({file:f.catalog.file}).state.targets).length,1);clock+=1001;}
  return rpc(...args);
 };
 await f.catalog.step({mints:3});assert.equal(f.counts().targetWrites,3);
});
test('name batch rollback restores only touched rows after a conflict or disk failure',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'name-journal-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new NameSnapshotStore(path.join(dir,'names.json'));
 const row=(name,slot,txId=target)=>({schema:'arns-mesh-name-snapshot/v1',name,antId:mint,txId,slot,ttlSeconds:60,observedAt:new Date().toISOString()});
 store.putMany([row('existing',10),row('untouched',10)],{kind:'local-rpc'});
 const untouched=store.rows.untouched,existing=store.rows.existing,rows=store.rows;
 assert.throws(()=>store.putMany([row('existing',11),row('new-name',11),row('existing',9)],{kind:'local-rpc'}),/rollback/);
 assert.equal(store.rows,rows);assert.equal(store.rows.untouched,untouched);assert.equal(store.rows.existing,existing);assert.equal(store.get('new-name'),null);
 const save=store.save;store.save=()=>{throw new Error('fixture_disk_failure');};
 assert.throws(()=>store.putMany([row('existing',12),row('new-name',12)],{kind:'local-rpc'}),/fixture_disk_failure/);
 store.save=save;assert.equal(store.rows.existing,existing);assert.equal(store.get('new-name'),null);
 assert.equal(new NameSnapshotStore(store.file).get('existing').slot,10);
 store.putMany([row('existing',11),row('existing',12),row('new-name',12)],{kind:'local-rpc'});
 assert.equal(new NameSnapshotStore(store.file).get('existing').slot,12);assert.equal(store.rows.untouched,untouched);
});

test('a newer accepted snapshot rejects only its stale mint while the rest of the checkpoint persists',async t=>{
 const f=await setup(t,{count:5});
 f.snapshots.put({schema:'arns-mesh-name-snapshot/v1',name:f.names[2],antId:mint,txId:'B'.repeat(43),slot:101,ttlSeconds:60,observedAt:new Date().toISOString()},{kind:'local-rpc'});
 await f.catalog.step({mints:5});
 const restored=new NameSnapshotStore(f.snapshots.file);
 assert.equal(restored.names().length,5);
 assert.equal(restored.get(f.names[2]).slot,101);
 assert.equal(restored.get(f.names[2]).txId,'B'.repeat(43));
 assert.equal(restored.get(f.names[4]).slot,100);
 assert.match(f.catalog.state.errors.at(-1).error,/snapshot_rollback/);
});
