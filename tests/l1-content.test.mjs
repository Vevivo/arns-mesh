import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {fetchL1Direct} from '../src/arweave-direct.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {SitePinner} from '../src/site-pinner.mjs';
import {resolveArUrl} from '../apps/helper/core-adapter.mjs';
import {startLocalBridge} from '../apps/helper/local-bridge.mjs';
import Arweave from 'arweave';
import {encodeL1Content,verifyL1Content} from '../src/l1-content.mjs';
import {VerifiedContentStore,verifyStoredContent} from '../src/content-store.mjs';
import {CatalogWorker} from '../src/catalog-worker.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';

const arweave=Arweave.init({});
const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
async function signed(data,type='text/plain',format=2){
 const payload=Buffer.from(data);
 const tx=await arweave.createTransaction({data:payload,reward:'0',last_tx:crypto.randomBytes(32).toString('base64url')},key);
 tx.format=format;tx.addTag('Content-Type',type);await arweave.transactions.sign(tx,key);
 const header=tx.toJSON();return {id:tx.id,header,payload,raw:encodeL1Content(header,payload)};
}
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-l1-'));
 const empty=path.join(dir,'empty.json');fs.writeFileSync(empty,'[]');
 const keys=['ARWEAVE_PEERS','ARWEAVE_PEER_SEEDS','ARNS_LOCATIONS','HYPER_BOOTSTRAP','HYPER_PEER_CACHE','ARNS_IP_PEERS'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{ARWEAVE_PEERS:empty,ARWEAVE_PEER_SEEDS:empty,ARNS_LOCATIONS:path.join(dir,'locations.json'),HYPER_BOOTSTRAP:empty,HYPER_PEER_CACHE:path.join(dir,'learned.json'),ARNS_IP_PEERS:empty});
 t.after(()=>{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];fs.rmSync(dir,{recursive:true,force:true});});
 const peer=name=>{const p=new MeshPeer({dataDir:path.join(dir,name),allowRemoteFetch:false});const k=crypto.generateKeyPairSync('ed25519');p.identity={publicKeyPem:k.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:k.privateKey.export({format:'pem',type:'pkcs8'})};p.witnessPeerId=peerIdFromPublicKey(p.identity.publicKeyPem);return p;};
 return {dir,peer};
}
const direct=(server,extra={})=>createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:server.address.port}],dhtEnabled:false,...extra});

test('L1 V2 envelope retains and locally verifies original signature, Merkle root and payload',async()=>{
 const item=await signed('signed L1 payload');const v=await verifyStoredContent(item.raw,item.id);
 assert.equal(v.storageKind,'l1');assert.equal(v.l1SignatureVerified,true);assert.equal(v.l1DataRootVerified,true);
 assert.deepEqual(v.payload,item.payload);assert.equal(v.rawItem,undefined);assert.deepEqual(v.storedBytes,item.raw);
 assert.deepEqual(v.tags,[{name:'Content-Type',value:'text/plain'}]);assert.equal(v.rootTxId,item.id);
});
test('L1 envelope rejects payload edits, wrong IDs, truncated lengths and unknown versions',async()=>{
 const item=await signed('integrity test');const changed=Buffer.from(item.raw);changed[changed.length-1]^=1;
 await assert.rejects(verifyL1Content(changed,item.id),/l1_data_root_mismatch/);
 await assert.rejects(verifyL1Content(item.raw,'A'.repeat(43)),/l1_tx_id_mismatch/);
 await assert.rejects(verifyL1Content(item.raw.subarray(0,14),item.id),/header_length/);
 const excessive=Buffer.from(item.raw);excessive.writeUInt32BE(0xffffffff,8);await assert.rejects(verifyL1Content(excessive,item.id),/header_length/);
 assert.throws(()=>encodeL1Content({...item.header,format:3},item.payload),/invalid_l1_transaction/);
});
test('a valid data root does not authenticate altered L1 tags or declared metadata',async()=>{
 const item=await signed('signed tags');
 const changed=encodeL1Content({...item.header,tags:[{name:Buffer.from('Content-Type').toString('base64url'),value:Buffer.from('text/html').toString('base64url')}]},item.payload);
 await assert.rejects(verifyL1Content(changed,item.id),/l1_signature_invalid/);
 const size=encodeL1Content({...item.header,data_size:'1'},item.payload);await assert.rejects(verifyL1Content(size,item.id),/payload_size/);
});
test('empty L1 V2 data and legacy V1 payload signatures are handled separately',async()=>{
 const empty=await signed('');assert.equal((await verifyL1Content(empty.raw,empty.id)).payload.length,0);
 const legacy=await signed('legacy signed bytes','text/plain',1);const v=await verifyL1Content(legacy.raw,legacy.id);
 assert.equal(v.l1SignatureVerified,true);assert.equal(v.l1DataRootVerified,false);assert.deepEqual(v.payload,legacy.payload);
 const bad=Buffer.from(legacy.raw);bad[bad.length-1]^=1;await assert.rejects(verifyL1Content(bad,legacy.id),/l1_signature_invalid/);
});
test('L1 store verifies before writing, survives restart, and pin/eviction budgets include L1 bytes',async t=>{
 const {dir}=fixture(t),item=await signed('pinned'),other=await signed('evict me');
 const store=new VerifiedContentStore(path.join(dir,'store'));await store.put(item.id,item.raw);assert.ok(store.has(item.id));
 assert.equal(store.stats().files[0].storageKind,'l1');assert.equal(store.stats().files[0].dataId,item.id);
 await store.pin(item.id,'site');await store.put(other.id,other.raw);store.maxBytes=0;store.prune();
 assert.deepEqual(store.get(item.id),item.raw);assert.equal(store.get(other.id),null);assert.equal(store.pinStats().bytes,item.raw.length);
 const resumed=new VerifiedContentStore(store.directory,{maxBytes:0});assert.ok(resumed.has(item.id));resumed.unpin('site');assert.equal(resumed.get(item.id),null);
 const bad=Buffer.from(other.raw);bad[bad.length-1]^=1;await assert.rejects(store.put(other.id,bad));assert.equal(store.has(other.id),false);
});
test('automatic L1 manifest replication and fresh reads continue after the source listener closes (one machine)',async t=>{
 const {dir,peer}=fixture(t),a=peer('a'),b=peer('b');
 const html=await signed('<h1>L1 replica</h1>','text/html'),css=await signed('h1{font-size:20px}','text/css');
 const root=await signed(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{id:html.id},paths:{'style.css':{id:css.id}}}),'application/x.arweave-manifest+json');
 for(const item of [root,html,css])await a.contentStore.put(item.id,item.raw);
 let source=await startDirectPeerServer(a,{host:'127.0.0.1',port:0}),replica;
 try{
  const worker=new CatalogWorker({dataDir:path.join(dir,'b'),peer:b,endpoint:'http://127.0.0.1:1',client:direct(source)});
  worker.catalog.state.targets={observed:{dataId:root.id}};worker.catalog.step=async()=>{};
  for(let i=0;i<3;i++)await worker.pass();
  assert.equal(worker.status().completed,3);assert.equal(worker.status().meshReplicated,3);assert.equal(worker.status().queued,0);
  assert.equal(worker.status().lastSuccess.storageKind,'l1');
  await source.close();source=null;replica=await startDirectPeerServer(b,{host:'127.0.0.1',port:0});
  const fresh=direct(replica),store=new VerifiedContentStore(path.join(dir,'fresh-content'));
  for(const item of [root,html,css]){
   const got=await fetchMeshContent(item.id,{client:fresh,contentStore:store});
   assert.equal(got.storageKind,'l1');assert.equal(got.direct.l1SignatureVerified,true);assert.equal(got.direct.l1DataRootVerified,true);assert.equal(got.direct.rawItem,undefined);assert.deepEqual(got.direct.payload,item.payload);
  }
  await replica.close();replica=null;
  const cached=await fetchMeshContent(html.id,{client:{content(){throw new Error('no peers');}},contentStore:store});
  assert.equal(cached.storageKind,'l1');assert.equal(cached.direct.peer.host,'local-cache');assert.equal(cached.direct.rootTxId,html.id);
 }finally{if(source)await source.close();if(replica)await replica.close();}
});
test('corrupted L1 replica is rejected even with a freshly signed peer envelope; a second provider works',async t=>{
 const {peer}=fixture(t),a=peer('bad'),b=peer('good'),item=await signed('correct replica');
 for(const p of [a,b])await p.contentStore.put(item.id,item.raw);
 const bad=Buffer.from(item.raw);bad[bad.length-1]^=1;fs.writeFileSync(a.contentStore.file(item.id,'l1'),bad);
 const sa=await startDirectPeerServer(a,{host:'127.0.0.1',port:0}),sb=await startDirectPeerServer(b,{host:'127.0.0.1',port:0});
 try{
  await assert.rejects(direct(sa).content(item.id),/direct_peer_unavailable|root_mismatch/);
  const client=createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:sa.address.port},{host:'127.0.0.1',port:sb.address.port}],dhtEnabled:false});
  assert.deepEqual((await client.content(item.id)).payload,item.payload);
 }finally{await sa.close();await sb.close();}
});


test('raw IP L1 chunk fetch is stored and served by a Mesh peer after raw-node shutdown',async t=>{
 const {dir,peer}=fixture(t),item=await signed(Buffer.alloc(300000,65)),empty=await signed(''),legacy=await signed('legacy raw','text/plain',1);
 const items=new Map([item,empty,legacy].map(i=>[i.id,i]));const routes=[];
 const node=http.createServer((req,res)=>{
  routes.push(req.url);let data;
  if(req.url==='/info')data={network:'arweave.N.1',height:1};
  else if(req.url==='/peers')data=[];
  else if(req.url.startsWith('/tx/')){
   const id=req.url.split('/')[2],i=items.get(id);if(i)data=req.url.endsWith('/offset')?{offset:i.payload.length,size:i.payload.length}:i.header;
  }else if(req.url.startsWith('/chunk/')){
   const offset=Number(req.url.split('/')[2]),start=Math.floor((offset-1)/262144)*262144,body=item.payload.subarray(start,start+262144);
   data={chunk:body.toString('base64url'),chunk_size:body.length,absolute_end_offset:start+body.length};
  }
  if(!data){res.writeHead(404);res.end('{}');return;}res.end(JSON.stringify(data));
 });await new Promise(r=>node.listen(0,'127.0.0.1',r));
 t.after(()=>{node.closeAllConnections();node.close();});
 const seeds=path.join(dir,'raw-seeds.json');fs.writeFileSync(seeds,JSON.stringify([{host:'127.0.0.1',port:node.address().port}]));process.env.ARWEAVE_PEERS=seeds;
 const replica=peer('raw-replica'),absent={async content(){throw new Error('no cached provider');},async locateCandidates(){return [];}};
 const result=await fetchMeshContent(item.id,{client:absent,contentStore:replica.contentStore,signal:AbortSignal.timeout(10000)});
 assert.equal(result.storageKind,'l1');assert.equal(result.cacheError,undefined);assert.equal(result.direct.l1DataRootVerified,true);assert.deepEqual(result.direct.payload,item.payload);assert.ok(replica.contentStore.has(item.id));
 for(const small of [empty,legacy]){
  const r=await fetchL1Direct({dataId:small.id,seedsFile:seeds,signal:AbortSignal.timeout(5000)});
  assert.deepEqual(r.payload,small.payload);assert.equal(r.l1DataRootVerified,small.header.format===2);
  assert.equal(routes.includes(`/tx/${small.id}/offset`),false);
 }
 assert.ok(routes.some(p=>p==='/chunk/1'));assert.ok(routes.some(p=>p==='/chunk/262145'));
 node.closeAllConnections();await new Promise(r=>node.close(r));
 const server=await startDirectPeerServer(replica,{host:'127.0.0.1',port:0});
 try{const restored=await direct(server).content(item.id);assert.deepEqual(restored.payload,item.payload);assert.equal(restored.storageKind,'l1');}finally{await server.close();}
});

test('saved-name L1 manifest pins and opens through the local HTTP bridge with no peer or RPC',async t=>{
 const {dir}=fixture(t),html=await signed('<h1>Saved L1 page</h1>','text/html'),css=await signed('h1{margin:0}','text/css');
 const root=await signed(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{path:'index.html'},paths:{'index.html':{id:html.id},'style.css':{id:css.id}}}),'application/x.arweave-manifest+json');
 const store=new VerifiedContentStore(path.join(dir,'content'));for(const item of [root,html,css])await store.put(item.id,item.raw);
 const snapshots=new NameSnapshotStore(path.join(dir,'names.json')),observedAt=new Date(Date.now()-3600000).toISOString();
 // Synthetic observation for the routing test, deliberately not current-state evidence.
 snapshots.put({schema:'arns-mesh-name-snapshot/v1',name:'fixture',txId:root.id,antId:'B'.repeat(43),slot:1,ttlSeconds:60,observedAt},{kind:'local-rpc'});
 const pinner=new SitePinner({file:path.join(dir,'pins-index.json'),snapshots,contentStore:store});
 const pin=await pinner.start('fixture');assert.equal(pin.status,'manifest-saved');assert.equal(pin.saved,3);assert.equal(pin.failed,0);
 // A later live observation changes the target. Explicit saved access must
 // still select the pinned manifest and its original observation date.
 snapshots.put({schema:'arns-mesh-name-snapshot/v1',name:'fixture',txId:css.id,antId:'B'.repeat(43),slot:2,ttlSeconds:60,observedAt:new Date().toISOString()},{kind:'local-rpc'});
 const reopened=new SitePinner({file:pinner.file,snapshots,contentStore:store});
 assert.equal(reopened.snapshotStore().get('fixture').txId,root.id);
 // Saving again while viewing the saved copy must not replace it with the
 // newer live target. Exercise the public start path as the desktop does.
 const savedAgain=await reopened.start('fixture',{accessPolicy:'saved'});
 assert.equal(savedAgain.rootDataId,root.id);assert.equal(savedAgain.observedAt,observedAt);
 assert.equal(savedAgain.status,'manifest-saved');assert.equal(savedAgain.saved,3);
 assert.equal(snapshots.get('fixture').txId,css.id,'saved access leaves the live observation intact');
 store.maxBytes=0;store.prune();assert.equal(store.pinStats().files,3);
 const resolve=url=>resolveArUrl(url,{contentStore:store,snapshotStore:reopened.snapshotStore(),accessPolicy:'saved'});
 const result=await resolve('ar://fixture/');assert.deepEqual(result.body,html.payload);assert.equal(result.meta.storageKind,'l1');assert.equal(result.meta.l1SignatureVerified,true);assert.equal(result.meta.dataItemSignatureVerified,false);
 assert.equal(result.meta.verification.currentStateVerified,false);assert.equal(result.meta.verification.rpcUsed,false);assert.equal(result.meta.recovery.observedAt,observedAt);
 const bridge=await startLocalBridge({dataDir:path.join(dir,'bridge'),resolve,share:async()=>{}});
 try{
  const address=await bridge.open('ar://fixture/');assert.match(new URL(address).hostname,/^127\./);
  const read=url=>new Promise((resolve,reject)=>{const req=http.get(url,res=>{const data=[];res.on('data',b=>data.push(b));res.on('end',()=>resolve({code:res.statusCode,body:Buffer.concat(data),type:res.headers['content-type'],trust:res.headers['x-arns-mesh-name-trust']}));});req.on('error',reject);});
  const page=await read(address),asset=await read(new URL('style.css',address));assert.equal(page.code,200);assert.equal(page.trust,'saved-observation');assert.deepEqual(page.body,html.payload);assert.equal(asset.code,200);assert.deepEqual(asset.body,css.payload);
 }finally{bridge.close();}
});
