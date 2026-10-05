import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {MAINNET_PROGRAM_IDS,getAntRecordPDA} from '@ar.io/sdk';
import crypto from 'node:crypto';
import {getArnsRecordEncoder} from '@ar.io/solana-contracts/arns';
import {getArnsRecordPDA} from '@ar.io/sdk';
import {TargetCatalog,decodeRegistry} from '../src/target-catalog.mjs';
import {withByteBudget,accountBudgetBytes} from '../src/byte-budget.mjs';
const mint='11111111111111111111111111111111';
async function row(undername,target,options={}){
 const [pubkey]=await getAntRecordPDA(mint,undername);
 const raw=getAntRecordEncoder().encode({mint,undername,target,targetProtocol:0,ttlSeconds:60,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version:{major:1,minor:0,patch:0},...options});
 return {pubkey:String(pubkey),account:{owner:MAINNET_PROGRAM_IDS.ant,data:[Buffer.from(raw).toString('base64'),'base64']}};
}
test('catalog tracks undernames and target updates and refuses bad bindings without replacing the last observation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let response={context:{slot:100},value:[await row('@','A'.repeat(43)),await row('docs','B'.repeat(43))]};
 const catalog=new TargetCatalog({file:path.join(dir,'catalog.json'),endpoint:'http://127.0.0.1:1',rpc:async(_endpoint,method)=>method==='getAccountInfo'?{context:{slot:99},value:null}:response});
 catalog.state.registry=[{name:'example',mint}];catalog.state.registryAt=Date.now();catalog.state.slot=99;
 await catalog.step();assert.equal(catalog.state.targets.docs_example.dataId,'B'.repeat(43));
 response={context:{slot:101},value:[await row('@','C'.repeat(43))]};await catalog.step();
 assert.equal(catalog.state.targets.example.dataId,'C'.repeat(43));assert.equal(catalog.state.targets.docs_example,undefined);
 response.value[0].account.owner=mint;await catalog.step();assert.equal(catalog.state.targets.example.dataId,'C'.repeat(43));assert.match(catalog.state.errors.at(-1).error,/owner_mismatch/);
 response={context:{slot:98},value:[]};await catalog.step();assert.equal(catalog.state.targets.example.dataId,'C'.repeat(43));
 response={context:{slot:102},value:[await row('@','D'.repeat(43),{targetProtocol:1})]};await catalog.step();assert.equal(catalog.state.targets.example,undefined);
 assert.equal(new TargetCatalog({file:path.join(dir,'catalog.json'),endpoint:'http://127.0.0.1:1'}).state.cursor,0);
});
test('index work byte budget cancels the request scope and reports consumed bytes',async()=>{
 const controller=new AbortController();await assert.rejects(withByteBudget(10,controller,async()=>{accountBudgetBytes(8);accountBudgetBytes(8);}),e=>e.message==='catalog_network_budget'&&e.receivedBytes===16);assert.equal(controller.signal.aborted,true);
 accountBudgetBytes(100); // unrelated tasks are not charged to the old scope
});

test('program-wide ANT observation follows all registered targets and rejects rollback or incomplete data',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-bulk-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let response={context:{slot:200},value:[await row('@','A'.repeat(43)),await row('docs','B'.repeat(43))]},request;
 const catalog=new TargetCatalog({file:path.join(dir,'catalog.json'),endpoint:'http://127.0.0.1:1',rpc:async(_endpoint,method,params,options)=>{if(method==='getAccountInfo')return {context:{slot:100},value:null};request={method,params,options};return response;}});
 catalog.state.registry=[{name:'one',mint},{name:'alias',mint}];catalog.state.registryAt=Date.now();catalog.state.slot=100;
 await catalog.refreshTargets();assert.equal(Object.keys(catalog.state.targets).length,4);
 assert.equal(catalog.state.targets.docs_alias.dataId,'B'.repeat(43));assert.equal(request.params[1].filters.length,1);
 assert.equal(request.options.maxBytes,16*1024*1024);
 response={context:{slot:199},value:[]};await assert.rejects(catalog.refreshTargets(),/invalid_ant_catalog_scan/);assert.equal(Object.keys(catalog.state.targets).length,4);
 // Per-ANT refresh also cannot replace a newer observation with older RPC data.
 await catalog.step();assert.equal(Object.keys(catalog.state.targets).length,4);
 response={context:{slot:201},value:[await row('@','C'.repeat(43))]};response.value[0].pubkey=mint;
 await assert.rejects(catalog.refreshTargets(),/binding_mismatch/);assert.equal(catalog.state.targets.one.dataId,'A'.repeat(43));
 response={context:{slot:202},value:[await row('@','C'.repeat(43))]};await catalog.refreshTargets();
 assert.equal(catalog.state.targets.one.dataId,'C'.repeat(43));assert.equal(catalog.state.targets.docs_one,undefined);
 assert.equal(new TargetCatalog({file:catalog.file}).state.targetScanSlot,202);
});

test('new name priority survives restart while existing names still refresh',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-priority-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'catalog.json'),rpc=async(_endpoint,method)=>method==='getAccountInfo'?{context:{slot:99},value:null}:{context:{slot:100},value:[await row('@','A'.repeat(43))]};
 const catalog=new TargetCatalog({file,endpoint:'http://127.0.0.1:1',rpc});
 catalog.state.registry=Array.from({length:100},(_,i)=>({name:'name'+i,mint}));catalog.state.registryAt=Date.now();catalog.state.slot=99;
 catalog.state.pendingNames=['name99'];catalog.save();
 const resumed=new TargetCatalog({file,endpoint:catalog.endpoint,rpc});await resumed.step({mints:2});
 assert.ok(resumed.state.targets.name99);assert.ok(resumed.state.targets.name0);assert.equal(resumed.state.cursor,1);assert.equal(resumed.state.pendingNames.length,0);
});

test('reused PDA derivations never bypass account owner, name-hash or binding validation',async()=>{
 const name='cached-derivation-fixture',version={major:1,minor:0,patch:0},[pda]=await getArnsRecordPDA(name);
 const raw=Buffer.from(getArnsRecordEncoder().encode({name,nameHash:crypto.createHash('sha256').update(name).digest(),owner:mint,ant:mint,purchaseType:1,startTimestamp:1,endTimestamp:null,undernameLimit:10,purchasePrice:0,bump:255,version}));
 const record={pubkey:String(pda),account:{owner:MAINNET_PROGRAM_IDS.arns,data:[raw.toString('base64'),'base64']}};
 const decode=()=>decodeRegistry({context:{slot:100},value:[record]});
 assert.equal((await decode()).records[0].name,name);
 assert.equal((await decode()).records[0].name,name);
 record.pubkey=mint;assert.equal((await decode()).quarantine[0].error,'pda_mismatch');
 record.pubkey=String(pda);record.account.owner=mint;assert.equal((await decode()).quarantine[0].error,'owner_mismatch');
 record.account.owner=MAINNET_PROGRAM_IDS.arns;raw[8]^=1;record.account.data[0]=raw.toString('base64');assert.equal((await decode()).quarantine[0].error,'name_hash_mismatch');
});

test('legacy discovery targets queue missing retained names without manufacturing snapshots',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-retained-backfill-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'catalog.json'),old=new TargetCatalog({file});
 old.state.registry=['ordinary','missing','complete','updated','rebound','new'].map(name=>({name,mint}));old.state.registryAt=Date.now();old.state.slot=100;
 const target=(baseName,extra={})=>({baseName,mint,dataId:'A'.repeat(43),slot:100,...extra});
 old.state.targets={missing:target('missing'),docs_missing:target('missing'),complete:target('complete'),updated:target('updated'),rebound:target('rebound',{mint:'invalid-old-mint'})};
 old.state.pendingNames=['new'];old.save();
 let writes=0;const requested=[];
 const snapshots={get:name=>name==='complete'?{slot:100,txId:'A'.repeat(43),antId:mint}:name==='updated'?{slot:99,txId:'B'.repeat(43),antId:mint}:null,putMany:()=>writes++,names:()=>['complete','updated']};
 const resumed=new TargetCatalog({file,snapshotStore:snapshots,rpc:async(_ep,method,params)=>{requested.push(params[0]);return {context:{slot:100},value:null};}});
 assert.deepEqual(resumed.state.pendingNames,['new','missing','updated']);assert.equal(writes,0);
 const available=new TargetCatalog({file,snapshotStore:snapshots,hasContent:()=>true});
 assert.deepEqual(available.state.pendingNames,['missing','updated','new']);assert.equal(writes,0);
 await resumed.step({mints:2});
 assert.equal(requested.length,2);assert.equal(resumed.state.cursor,1);assert.equal(writes,0);
 assert.equal(resumed.state.errors.length,2);assert.deepEqual(resumed.state.pendingNames,['missing','updated']);
});
