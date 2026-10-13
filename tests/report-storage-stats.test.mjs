import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
const source=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const content=source('../src/content-store.mjs'),pinner=source('../src/site-pinner.mjs'),peer=source('../apps/peer/embedded-peer.mjs'),main=source('../apps/peer/main.mjs');
const contentClass=content.slice(content.indexOf('export class VerifiedContentStore')).replace('export class ','class ')+'; VerifiedContentStore;';
const pinnerStart=pinner.indexOf('\n status('),pinnerStatus=pinner.slice(pinnerStart,pinner.indexOf('\n',pinnerStart+1)).trim();
const peerStart=peer.indexOf('\n  status('),peerStatus=peer.slice(peerStart,peer.indexOf('\n  async stop(',peerStart)).trim();
const reportStart=main.indexOf('const publishStatus=()=>{')+'const publishStatus=()=>{'.length,reportEnd=main.indexOf(' const replicationStatus=',reportStart),report=main.slice(reportStart,reportEnd);
assert.ok(pinnerStart>=0&&peerStart>=0&&reportEnd>reportStart,'exercise production status methods and report wiring');
const id=letter=>letter.repeat(43);
function fixture(directory='/content'){
 const files=new Map(),verified=[];let scans=0;
 const fakeFs={mkdirSync(){},existsSync:file=>files.has(file),readdirSync:()=>[...files.keys()].map(file=>path.basename(file)),statSync:file=>{const raw=files.get(file);if(!raw)throw Object.assign(new Error('missing'),{code:'ENOENT'});return {size:raw.length,mtimeMs:1};},readFileSync:file=>files.get(file),writeFileSync:(file,raw)=>files.set(file,Buffer.from(raw)),renameSync:(from,to)=>{files.set(to,files.get(from));files.delete(from);},unlinkSync:file=>files.delete(file)};
 // Isolate accounting; existing signed-content tests exercise the real verifier.
 const verifyStoredContent=async(raw,dataId)=>{assert.ok(Buffer.isBuffer(raw));verified.push(dataId);return {storageKind:'ans104'};};
 const Store=vm.runInNewContext(contentClass,{fs:fakeFs,path,EventEmitter,verifyStoredContent,MAX_ITEM_BYTES:32*1024*1024,MAX_CONTENT_BYTES:32*1024*1024,Buffer});
 const store=new Store(directory,{maxBytes:Infinity,maxPinnedBytes:Infinity}),scan=store.stats.bind(store);store.stats=()=>{scans++;return scan();};
 const peerStatusMethod=vm.runInNewContext('({'+peerStatus+'}).status',{getSharedIndex:()=>null});
 const pinnerStatusMethod=vm.runInNewContext('({'+pinnerStatus+'}).status');
 const peer={contentStore:store,cache:{records:{},locations:{}},discoveries:new Map(),locationIndex:{size:0},status:peerStatusMethod};
 const makePinner=()=>({store,rows:{},isReady:()=>false,status:pinnerStatusMethod});
 return {store,peer,pinner:makePinner(),replicationPinner:makePinner(),verified,add:(dataId,size)=>files.set(store.file(dataId),Buffer.alloc(size)),scans:()=>scans};
}
function runReport(f,replicationPinner=f.replicationPinner){return vm.runInNewContext('(()=>{'+report+';return {peerStatus,savedStatus,replicatedStatus};})()',{peer:f.peer,pinner:f.pinner,replicationPinner,peerDiscovery:{status:()=>({})}});}
test('one report shares one fresh scan; the next report observes external file changes',()=>{
 const f=fixture();f.add(id('A'),10);f.store.pins.saved=[id('A')];const first=runReport(f);assert.equal(f.scans(),1);assert.equal(first.peerStatus.cachedContent,1);assert.equal(first.savedStatus.storage.bytes,10);assert.equal(first.replicatedStatus.storage.bytes,10);
 f.add(id('A'),25);f.add(id('B'),5);const next=runReport(f);assert.equal(f.scans(),2);assert.equal(next.peerStatus.cachedContent,2);assert.equal(next.savedStatus.storage.bytes,25);assert.equal(next.replicatedStatus.storage.bytes,25);
});
test('distinct stores never share statistics and callers without a report still scan freshly',()=>{
 const f=fixture('/primary'),other=fixture('/other');f.add(id('A'),10);other.add(id('B'),20);other.add(id('C'),30);other.store.pins.saved=[id('B')];const report=runReport(f,other.pinner);assert.equal(f.scans(),1);assert.equal(other.scans(),1);assert.equal(report.peerStatus.cachedContent,1);assert.equal(report.replicatedStatus.storage.bytes,20);
 const before=f.scans();f.peer.status();f.pinner.status();f.replicationPinner.status();f.store.pinStats();assert.equal(f.scans()-before,4);
});
test('report reuse cannot weaken the live pin budget or skip content verification',async()=>{
 const f=fixture();f.add(id('A'),10);f.store.maxPinnedBytes=15;await f.store.pin(id('A'),'saved');runReport(f);f.add(id('B'),10);const before=f.scans();
 await assert.rejects(f.store.pin(id('B'),'saved'),/pin_budget_exceeded/);assert.equal(f.scans(),before+1);assert.deepEqual(f.verified,[id('A'),id('B')]);assert.deepEqual(Array.from(f.store.pins.saved),[id('A')]);
});
