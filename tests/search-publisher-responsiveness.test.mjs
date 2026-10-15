import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {SearchPublisher,TopicSearchPublisher,verifySearchEnvelope,TOPIC_LIMITS} from '../src/search-catalog.mjs';
import {peerIdFromPublicKey,signRecord} from '../src/common.mjs';

const TARGET='A'.repeat(43),ANT='11111111111111111111111111111111';
function fixture(t,{count=13392,metadataBytes=0}={}){
 const parent=path.resolve(process.env.ARNS_TEST_TMP_ROOT||os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'mesh-search-yield-'));
 t.after(()=>{assert.equal(path.dirname(dir),parent);assert.ok(path.basename(dir).startsWith('mesh-search-yield-'));fs.rmSync(dir,{recursive:true,force:true});});
 const at=new Date(Date.now()-1000).toISOString(),rows=Object.fromEntries(Array.from({length:count},(_,i)=>{
  const name='site-'+String(i).padStart(5,'0');return [name,{schema:'arns-mesh-name-snapshot/v1',name,txId:TARGET,antId:ANT,slot:1,observedAt:at,ttlSeconds:60,provenance:{kind:'local-rpc'}}];
 }));
 const snapshotFile=path.join(dir,'names.json');fs.writeFileSync(snapshotFile,JSON.stringify({schema:'arns-mesh-name-snapshots/v1',rows}));
 const snapshots=new NameSnapshotStore(snapshotFile),contentStore=new VerifiedContentStore(path.join(dir,'content'));
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519'),pem=publicKey.export({type:'spki',format:'pem'}),privatePem=privateKey.export({type:'pkcs8',format:'pem'}),peerId=peerIdFromPublicKey(pem);
 const sign=record=>{const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId:peerId,witnessPublicKeyPem:pem,recordJson,signature:signRecord(recordJson,privatePem)};};
 const metadata={get:()=>({title:metadataBytes?'t'.repeat(160):'A test site',description:metadataBytes?'d'.repeat(320):'Astronomy and photography',keywords:metadataBytes?Array.from({length:12},(_,i)=>String(i)+'k'.repeat(47)):['space','photography'],metadataAt:at})};
 return {dir,count,snapshots,contentStore,sign,peerId,metadata,documents:{record:{entries:[]}},topic:()=>new TopicSearchPublisher({file:path.join(dir,'topics.json'),snapshots,documents:{record:{entries:[]}},metadata,sign}),search:()=>new SearchPublisher({file:path.join(dir,'documents.json'),snapshots,contentStore,sign})};
}
async function httpProbe(t,isDuring){
 let during=false;const requests=new Set(),server=http.createServer((_req,res)=>{during=isDuring();res.end('ok');});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const get=()=>new Promise((resolve,reject)=>{
  const request=http.get({host:'127.0.0.1',port:server.address().port},res=>{let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve(body));res.on('error',reject);});
  requests.add(request);request.once('close',()=>requests.delete(request));request.on('error',reject);
 });
 t.after(async()=>{for(const request of requests)request.destroy();await new Promise(resolve=>server.close(resolve));});
 await get();during=false;return {get,during:()=>during};
}

test('large real snapshot/cache scan serves HTTP before finishing its uncached names',{timeout:20000},async t=>{
 const f=fixture(t),publisher=f.search();let checked=0,pending,timer,timerDuring=false;
 const probe=await httpProbe(t,()=>checked>32&&checked<f.count),has=f.contentStore.has.bind(f.contentStore);
 f.contentStore.has=id=>{checked++;if(checked===33){pending=probe.get();timer=setTimeout(()=>{timerDuring=checked<f.count;},0);}return has(id);};
 t.after(()=>clearTimeout(timer));
 const result=await publisher.pass();assert.equal(await pending,'ok');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(probe.during(),true);assert.equal(timerDuring,true);assert.equal(checked,f.count);assert.equal(result.entries,0);
 assert.equal(verifySearchEnvelope(publisher.reply(),[f.peerId]).entries.length,0);
});

test('document scan cancellation preserves its previously signed record and file',async t=>{
 const f=fixture(t),publisher=f.search(),old=publisher.record,oldEnvelope=publisher.reply(),oldFile=JSON.stringify(old);fs.writeFileSync(publisher.file,oldFile);
 const controller=new AbortController(),has=f.contentStore.has.bind(f.contentStore);let checked=0,immediate;
 f.contentStore.has=id=>{if(++checked===33)immediate=setImmediate(()=>controller.abort(new Error('cancel_document_scan')));return has(id);};
 t.after(()=>clearImmediate(immediate));
 await assert.rejects(publisher.pass({signal:controller.signal}),/cancel_document_scan/);
 assert.ok(checked>=33&&checked<=48);assert.strictEqual(publisher.record,old);assert.strictEqual(publisher.reply(),oldEnvelope);
 assert.equal(fs.readFileSync(publisher.file,'utf8'),oldFile);assert.equal(fs.existsSync(publisher.file+'.tmp'),false);
});

test('document pass still verifies at most32 candidates in the original prepared-name ordering',async t=>{
 const f=fixture(t,{count:80}),publisher=f.search(),visited=[];publisher.pinner={rows:{'site-00079':{},'site-00060':{}},isReady:()=>false};let currentName;
 // The large scan uses real snapshots; isolate the existing verification work
 // budget with cache misses at get(), before any unsigned payload is accepted.
 f.contentStore.has=()=>true;f.contentStore.get=id=>{assert.equal(id,TARGET);visited.push(currentName);return null;};
 const exported=f.snapshots.exportLocal.bind(f.snapshots);f.snapshots.exportLocal=name=>{currentName=name;return exported(name);};
 await publisher.pass();assert.equal(visited.length,32);assert.deepEqual(visited.slice(0,2),['site-00060','site-00079']);assert.equal(publisher.record.entries.length,0);
});

test('async topic build serves HTTP and retains old signed catalogue until atomic publication',{timeout:20000},async t=>{
 const f=fixture(t),publisher=f.topic(),old=publisher.record,oldEnvelope=publisher.reply();let checked=0,pending;
 const probe=await httpProbe(t,()=>checked>32&&checked<f.count),local=f.snapshots.exportLocal.bind(f.snapshots);
 f.snapshots.exportLocal=name=>{if(++checked===33)pending=probe.get();return local(name);};
 const work=publisher.passAsync();assert.strictEqual(publisher.record,old);assert.strictEqual(publisher.reply(),oldEnvelope);
 const result=await work;assert.equal(await pending,'ok');assert.equal(probe.during(),true);assert.equal(result.entries,f.count);
 assert.equal(verifySearchEnvelope(publisher.reply(),[f.peerId]).entries.length,f.count);
 assert.equal(fs.readFileSync(publisher.file,'utf8'),JSON.stringify(publisher.record),'incremental row encoding preserves the exact catalogue JSON');
});

test('async and synchronous topic APIs retain identical ordering, limits and entry metadata',async t=>{
 const f=fixture(t,{count:13392,metadataBytes:1}),sync=f.topic(),asyncPublisher=new TopicSearchPublisher({...f,file:path.join(f.dir,'topics-async.json')});
 const expected=sync.pass(),actual=await asyncPublisher.passAsync();
 assert.deepEqual(asyncPublisher.record.entries,sync.record.entries);assert.equal(actual.entries,expected.entries);assert.equal(actual.withTopics,expected.withTopics);
 assert.ok(actual.entries>5000&&actual.entries<f.count,'fixture exercises the byte cap, not just the count cap');
 const encoded=fs.readFileSync(asyncPublisher.file,'utf8');assert.equal(encoded,JSON.stringify(asyncPublisher.record));assert.ok(Buffer.byteLength(encoded)<=TOPIC_LIMITS.recordBytes);
 verifySearchEnvelope(asyncPublisher.reply(),[f.peerId]);
});

test('async topic publication is single-flight and refuses a racing synchronous pass',async t=>{
 const f=fixture(t,{count:128}),publisher=f.topic(),local=f.snapshots.exportLocal.bind(f.snapshots);let checked=0;
 f.snapshots.exportLocal=name=>{checked++;return local(name);};
 const first=publisher.passAsync(),second=publisher.passAsync();assert.throws(()=>publisher.pass(),/search_catalog_busy/);
 assert.strictEqual(await first,await second);assert.equal(checked,f.count);assert.equal(publisher.running,null);
 assert.equal(publisher.pass().entries,f.count,'synchronous API remains usable after async completion');
});

test('cancelled topic build preserves disk and signed record and permits a later retry',async t=>{
 const f=fixture(t,{count:128}),publisher=f.topic(),old=publisher.record,oldEnvelope=publisher.reply(),oldFile=JSON.stringify(old);fs.writeFileSync(publisher.file,oldFile);
 const controller=new AbortController(),local=f.snapshots.exportLocal.bind(f.snapshots);let checked=0,immediate;
 f.snapshots.exportLocal=name=>{if(++checked===33)immediate=setImmediate(()=>controller.abort(new Error('cancel_topic_build')));return local(name);};
 t.after(()=>clearImmediate(immediate));
 await assert.rejects(publisher.passAsync({signal:controller.signal}),/cancel_topic_build/);
 assert.ok(checked>=33&&checked<=48);assert.strictEqual(publisher.record,old);assert.strictEqual(publisher.reply(),oldEnvelope);assert.equal(fs.readFileSync(publisher.file,'utf8'),oldFile);
 assert.equal(fs.existsSync(publisher.file+'.tmp'),false);assert.equal(publisher.running,null);
 f.snapshots.exportLocal=local;assert.equal((await publisher.passAsync()).entries,f.count);
});

test('invalid topic entry cannot replace a valid published catalogue',async t=>{
 const f=fixture(t,{count:1}),publisher=f.topic();publisher.pass();const old=publisher.record,oldEnvelope=publisher.reply(),oldFile=fs.readFileSync(publisher.file,'utf8');
 publisher.documents.record.entries=[{name:'site-00000',targetId:TARGET,documentId:'invalid-document-id',availability:'document'}];
 await assert.rejects(publisher.passAsync(),/invalid_search_entry/);assert.strictEqual(publisher.record,old);assert.strictEqual(publisher.reply(),oldEnvelope);assert.equal(fs.readFileSync(publisher.file,'utf8'),oldFile);
});
