import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {CatalogWorker,catalogDailyBudget} from '../src/catalog-worker.mjs';
import {accountBudgetBytes} from '../src/byte-budget.mjs';
const id='A'.repeat(43);
const numbered=n=>crypto.createHash('sha256').update(String(n)).digest('base64url');
function setup(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-fairness-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 // Scheduling-only fixtures. Cryptographic/network replication has independent tests.
 const peer={witnessPeerId:'a'.repeat(64),contentStore:{get:()=>Buffer.from('fixture')},locationIndex:{file:path.join(dir,'locations.json')}};
 const worker=new CatalogWorker({dataDir:dir,peer,endpoint:'http://127.0.0.1:1',client:{},fetchContent:async()=>({direct:{storedBytes:Buffer.from('fixture'),payload:Buffer.from('fixture'),tags:[],transport:'p2p-content'},storageKind:'l1'}),...options});
 worker.catalog.step=async()=>{};worker.enqueue(id);return worker;
}
test('catalog errors do not discard or starve existing content demand',async t=>{
 const w=setup(t);w.catalog.step=async()=>{throw new Error('rpc_temporary_failure');};
 await w.pass();assert.equal(w.status().completed,1);assert.equal(w.status().queued,0);assert.equal(w.status().catalogError,'rpc_temporary_failure');assert.equal(w.status().lastError,null);
});
test('catalog refresh timeout leaves the content phase a live, separate deadline',async t=>{
 let contentRan=false;const w=setup(t,{passTimeoutMs:1000,catalogTimeoutMs:15,fetchContent:async(_id,{signal})=>{signal.throwIfAborted();contentRan=true;return {direct:{storedBytes:Buffer.from('x'),payload:Buffer.from('x'),tags:[]}};}});
 w.catalog.step=({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 await w.pass();assert.ok(contentRan);assert.equal(w.status().completed,1);assert.match(w.status().catalogError,/catalog_refresh_timeout/);
});
test('catalog byte-budget exhaustion reserves bytes for content and counts both phases',async t=>{
 const w=setup(t,{dailyBytes:1024,fetchContent:async()=>{accountBudgetBytes(200);return {direct:{storedBytes:Buffer.from('x'),payload:Buffer.from('x'),tags:[]}};}});
 w.catalog.step=async()=>{accountBudgetBytes(778);};await w.pass();
 assert.equal(w.status().completed,1);assert.equal(w.status().dayResponseBytes,978);assert.match(w.status().catalogError,/catalog_network_budget/);
});
test('in-flight job is persisted before fetch and failed work survives restart',async t=>{
 let w;w=setup(t,{fetchContent:async()=>{const disk=JSON.parse(fs.readFileSync(w.file));assert.equal(disk.jobs[0].id,id);throw new Error('missing_location');}});
 await w.pass();assert.equal(w.status().completed,0);assert.equal(w.status().queued,1);assert.equal(w.state.jobs[0].attempt,1);
 const resumed=new CatalogWorker({dataDir:path.dirname(w.file),peer:w.peer,endpoint:'http://127.0.0.1:1',client:{}});
 assert.equal(resumed.state.jobs[0].id,id);assert.ok(resumed.state.jobs[0].after>Date.now());assert.equal(resumed.state.lastError,'missing_location');
});
test('uncached results never count as completed or replicated',async t=>{
 const w=setup(t,{fetchContent:async()=>({direct:{payload:Buffer.from('not stored'),tags:[]}})});await w.pass();
 assert.equal(w.status().completed,0);assert.equal(w.status().meshReplicated,0);assert.equal(w.status().queued,1);assert.match(w.status().lastError,/not_stored/);
});
test('invalid manifest graph is not simultaneously counted as successful and failed transfer',async t=>{
 const w=setup(t,{fetchContent:async()=>({direct:{storedBytes:Buffer.from('x'),payload:Buffer.from('{invalid'),tags:[{name:'Content-Type',value:'application/x.arweave-manifest+json'}]}})});
 await w.pass();assert.equal(w.status().completed,1);assert.equal(w.status().failed,0);assert.equal(w.status().queued,0);assert.ok(w.status().lastGraphError);
});
test('stopping during catalog refresh preserves pending jobs and does not start content',async t=>{
 let ran=false;const w=setup(t,{fetchContent:async()=>{ran=true;throw new Error('must not start');}});
 w.catalog.step=({signal})=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});queueMicrotask(()=>w.stop());});
 await w.pass();assert.equal(ran,false);assert.equal(w.status().queued,1);assert.equal(w.status().completed,0);assert.match(w.status().lastError,/stopped/);
});

test('an operator budget reallocation resumes queued work without resetting the persisted daily meter',async t=>{
 let fetched=0;
 const initial=setup(t);initial.state.day=new Date().toISOString().slice(0,10);
 initial.state.bytes=64*1024*1024;initial.save();
 await initial.pass();assert.equal(initial.status().queued,1);
 const resumed=new CatalogWorker({dataDir:path.dirname(initial.file),peer:initial.peer,endpoint:'http://127.0.0.1:1',client:{},
  dailyBytes:catalogDailyBudget({ARNS_CATALOG_DAILY_MIB:'256'}),
  fetchContent:async()=>{fetched++;accountBudgetBytes(200);return {direct:{storedBytes:Buffer.from('x'),payload:Buffer.from('x'),tags:[]}};}});
 resumed.catalog.step=async()=>{};
 await resumed.pass();assert.equal(fetched,1);
 assert.equal(resumed.status().dayResponseBytes,64*1024*1024+200);
 assert.equal(resumed.status().maxDailyResponseBytes,256*1024*1024);
 assert.equal(resumed.status().completed,1);
 assert.throws(()=>catalogDailyBudget({ARNS_CATALOG_DAILY_MIB:'NaN'}),/invalid_catalog_daily_mib/);
});

test('registry demand beyond the former 2048 limit survives a restart',async t=>{
 const w=setup(t);w.catalog.state.targets=Object.fromEntries(Array.from({length:6000},(_,n)=>['name'+n,{dataId:numbered(n)}]));
 w.enqueueRoots();w.save();
 const next=new CatalogWorker({dataDir:path.dirname(w.file),peer:w.peer,endpoint:'http://127.0.0.1:1',client:{}});
 assert.equal(next.state.jobs.length,6001);assert.ok(next.queuedIds.has(numbered(5999)));assert.equal(w.status().deferredRoots,0);
});

test('bounded root admission rotates through the complete catalog',async t=>{
 const seen=new Set();const w=setup(t,{maxJobs:4,fetchContent:async id=>{seen.add(id);return {direct:{storedBytes:Buffer.from('x'),payload:Buffer.from('x'),tags:[]}};}});
 const ids=Array.from({length:12},(_,n)=>numbered(n));
 w.catalog.state.targets=Object.fromEntries(ids.map((dataId,n)=>['name'+n,{dataId}]));
 for(let i=0;i<16;i++){await w.pass();assert.ok(w.state.jobs.length<=4);}
 for(const id of ids)assert.ok(seen.has(id));assert.equal(w.status().deferredRoots,0);
});

test('a full queue preserves the manifest tail and resumes it after restart',async t=>{
 const children=Array.from({length:19},(_,n)=>numbered(n));const seen=new Set();
 const manifest={manifest:'arweave/paths',version:'0.1.0',paths:Object.fromEntries(children.map((id,n)=>[String(n),{id}]))};
 const fetchContent=async requested=>{seen.add(requested);return {direct:{storedBytes:Buffer.from('x'),payload:Buffer.from(requested===id?JSON.stringify(manifest):'x'),tags:requested===id?[{name:'Content-Type',value:'application/x.arweave-manifest+json'}]:[]}};};
 const w=setup(t,{maxJobs:8,fetchContent});await w.pass();assert.equal(w.status().pendingGraphs,1);assert.equal(w.status().queued,8);
 const next=new CatalogWorker({dataDir:path.dirname(w.file),peer:w.peer,endpoint:'http://127.0.0.1:1',client:{},maxJobs:8,fetchContent});next.catalog.step=async()=>{};
 for(let i=0;i<25;i++){await next.pass();assert.ok(next.status().queued<=8);}
 for(const id of children)assert.ok(seen.has(id));assert.equal(next.status().queued,0);assert.equal(next.status().completed,20);assert.equal(next.status().lastGraphError,null);
});

test('verified manifest graphs are no longer truncated at 1024 assets',async t=>{
 const children=Array.from({length:1200},(_,n)=>numbered(n));
 const manifest={manifest:'arweave/paths',version:'0.1.0',paths:Object.fromEntries(children.map((id,n)=>[String(n),{id}]))};
 const w=setup(t,{fetchContent:async()=>({direct:{storedBytes:Buffer.from('x'),payload:Buffer.from(JSON.stringify(manifest)),tags:[{name:'Content-Type',value:'application/x.arweave-manifest+json'}]}})});
 await w.pass();assert.equal(w.status().queued,1200);assert.ok(w.queuedIds.has(children[1199]));
});
