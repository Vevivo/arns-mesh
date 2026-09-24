import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {configureRuntime} from '../apps/helper/runtime.mjs';
import {coreRoot} from '../apps/helper/core-adapter.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {ResponseCache} from '../apps/helper/response-cache.mjs';
import {WorkBudget,ChunkCache,configureTransferBudget} from '../src/resource-budget.mjs';
import {getRawDiscovery} from '../src/raw-ledger-discovery.mjs';
import {configureLocationCache,saveDiscoveredLocations} from '../src/discovery-store.mjs';
import {LocationIndex} from '../src/location-index.mjs';
import {VerifiedContentStore,verifyRawItem} from '../src/content-store.mjs';
import {networkAuditSnapshot} from '../src/network-audit.mjs';

const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-light-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const turn=()=>new Promise(r=>setImmediate(r));

test('client starts no crawler; the explicit index role retains resumable scanning',async t=>{
 const dir=temp(t),before={...process.env};t.after(()=>{for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);configureTransferBudget('index');getRawDiscovery()?.stop();});
 fs.writeFileSync(path.join(dir,'locations.json'),JSON.stringify({legacy:'leave intact'}));
 const desktop=configureRuntime(coreRoot,dir,{applyDefaultPeers:false});
 const requests=networkAuditSnapshot().requests;desktop.discovery.start();await turn();
 assert.equal(networkAuditSnapshot().requests,requests);assert.equal(getRawDiscovery(),null);
 assert.equal(desktop.discovery.status().enabled,false);assert.equal(await desktop.discovery.find('A'.repeat(43)),null);
 assert.equal(fs.existsSync(path.join(dir,'ledger-discovery.json')),false);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'locations.json'))),{legacy:'leave intact'});
 assert.equal(path.basename(process.env.ARNS_LOCATIONS),'desktop-locations.json');
 const index=configureRuntime(coreRoot,path.join(dir,'index'),{applyDefaultPeers:false,role:'index'});
 assert.equal(index.discovery,getRawDiscovery());assert.equal(index.discovery.stopped,true);assert.equal(index.role,'index');
 assert.throws(()=>configureRuntime(coreRoot,dir,{role:'typo'}),/invalid_runtime_role/);
});

test('a light peer serves cached signed data but never starts work for incoming misses',async t=>{
 const peer=new MeshPeer({dataDir:temp(t),allowRemoteFetch:false,maxTopics:64});
 const keys=crypto.generateKeyPairSync('ed25519');peer.identity={publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'})};
 const before=networkAuditSnapshot().requests,id=crypto.randomBytes(32).toString('base64url');
 assert.equal((await peer._handleAsync({op:'location',dataId:id})).error,'location_not_found');
 assert.equal((await peer._handleAsync({op:'content',dataId:id,offset:0})).error,'content_not_cached');
 assert.equal(peer.historyLookups.size,0);assert.equal(networkAuditSnapshot().requests,before);
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex')),item=createData('signed cached bytes',signer);await item.sign(signer);await peer.contentStore.put(item.id,item.getRaw());
 const reply=await peer._handleAsync({op:'content',dataId:item.id,offset:0});
 assert.equal((await verifyRawItem(Buffer.from(JSON.parse(reply.recordJson).data,'base64'),item.id)).payload.toString(),'signed cached bytes');
 assert.equal(peer.status().remoteFetchEnabled,false);
});

test('location caching stays bounded after many different IDs without accumulating shards',t=>{
 const file=path.join(temp(t),'locations.json');fs.writeFileSync(file,'{}');configureLocationCache(file,{maxEntries:64,maxBytes:16000});
 const ids=Array.from({length:2000},()=>crypto.randomBytes(32).toString('base64url'));
 for(let i=0;i<ids.length;i+=50)saveDiscoveredLocations(file,ids.slice(i,i+50).map(id=>[id,{rootTxId:'B'.repeat(43),rootOffset:1,itemSize:2}]));
 const rows=JSON.parse(fs.readFileSync(file));assert.ok(Object.keys(rows).length<=64);assert.ok(fs.statSync(file).size<=16000);assert.equal(fs.existsSync(file+'.d'),false);
 assert.equal(new LocationIndex(file).get(ids[0]),null);assert.equal(new LocationIndex(file).get(ids.at(-1)).rootOffset,1);
});

test('resource queue bounds active work and cancellation cannot release an occupied slot early',async()=>{
 const budget=new WorkBudget({active:2,pending:8}),releases=[];let started=0;
 const run=()=>{started++;return new Promise(r=>releases.push(r));};
 const a=new AbortController(),b=new AbortController();
 const one=budget.run(run,{signal:a.signal}),two=budget.run(run);
 const cancelled=budget.run(run,{signal:b.signal}),rejected=assert.rejects(cancelled,/cancel-waiting/);
 const four=budget.run(run);await turn();assert.equal(started,2);
 b.abort(new Error('cancel-waiting'));await rejected;a.abort();await turn();
 assert.equal(started,2);assert.equal(budget.status().active,2);assert.equal(budget.status().queued,1);
 releases.shift()('one');await one;await turn();assert.equal(started,3);
 while(releases.length)releases.shift()('done');await Promise.all([two,four]);await turn();assert.equal(budget.status().active,0);
});

test('rendered page cache does not retain signed sharing bundles and evicts by bytes',()=>{
 const cache=new ResponseCache({maxBytes:100,maxEntries:8});
 cache.set('a',{body:Buffer.alloc(40),contentType:'text/plain',meta:{},peerPayload:{items:[{rawItem:Buffer.alloc(1024*1024)}]}});
 assert.equal('peerPayload' in cache.get('a'),false);
 cache.set('b',{body:Buffer.alloc(80),meta:{}});assert.equal(cache.has('a'),false);assert.ok(cache.bytes<=100);
 cache.clear();assert.equal(cache.bytes,0);assert.equal(cache.size,0);
});

test('raw chunk memory cache enforces its byte ceiling, including replacements',()=>{
 const cache=new ChunkCache(32);cache.set('a',{body:Buffer.alloc(20)});cache.set('b',{body:Buffer.alloc(20)});
 assert.equal(cache.has('a'),false);assert.equal(cache.bytes,20);cache.set('b',{body:Buffer.alloc(5)});assert.equal(cache.bytes,5);
 cache.set('too-big',{body:Buffer.alloc(33)});assert.equal(cache.has('too-big'),false);cache.clear();assert.equal(cache.bytes,0);
});

test('automatic file-count pruning preserves explicitly saved files across restart',async t=>{
 const dir=temp(t),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const store=new VerifiedContentStore(dir,{maxFiles:2});const ids=[];
 for(let i=0;i<5;i++){const item=createData('file '+i,signer);await item.sign(signer);await store.put(item.id,item.getRaw());ids.push(item.id);if(i===0)await store.pin(item.id,'saved');}
 assert.equal(store.stats().files.length,3);assert.ok(store.get(ids[0]));assert.equal(store.get(ids[1]),null);
 const restarted=new VerifiedContentStore(dir,{maxFiles:1});assert.equal(restarted.stats().files.length,2);assert.ok(restarted.get(ids[0]));
});
