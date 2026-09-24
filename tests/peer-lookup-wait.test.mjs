import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {signDataItem} from '@ardrive/turbo-upload';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {NavigationProgress} from '../apps/helper/progress.mjs';
import {startDirectPeerServer,queryDirectPeer} from '../src/direct-peer.mjs';
import {verifyRawItem} from '../src/content-store.mjs';
import {verifyRecord,peerIdFromPublicKey} from '../src/common.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';

function testPeer(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-content-wait-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'locations.json');fs.writeFileSync(file,'{}');
 const peer=new MeshPeer({dataDir:path.join(dir,'peer'),locationsFile:file});
 const keys=crypto.generateKeyPairSync('ed25519');peer.identity={privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'}),publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'})};
 peer.witnessPeerId=peerIdFromPublicKey(peer.identity.publicKeyPem);return peer;
}
function post(address,body){return new Promise((resolve,reject)=>{
 const req=http.request({host:address.host,port:address.port,path:'/mesh/v1/query',method:'POST'},res=>{const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(parts))}));});
 req.on('error',reject);req.end(JSON.stringify(body));
});}

test('cold content request waits for signed bytes and returns them over the real peer endpoint',async t=>{
 const peer=testPeer(t),key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const item=signDataItem(key,{data:Buffer.from('cold content regression fixture'),tags:[]});
 let release;const ready=new Promise(r=>release=r);
 const job=ready.then(()=>peer.contentStore.put(item.idB64Url,item.binary));peer.historyLookups.set(item.idB64Url,job);
 const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
 const timer=setTimeout(release,50);
 try{
  const result=await post({host:'127.0.0.1',port:server.address.port},{op:'content',dataId:item.idB64Url,offset:0,waitMs:1500});
  assert.equal(result.status,200);assert.equal(result.body.ok,true);
  assert.equal(verifyRecord(result.body.recordJson,result.body.signature,result.body.witnessPublicKeyPem),true);
  const chunk=JSON.parse(result.body.recordJson),verified=await verifyRawItem(Buffer.from(chunk.data,'base64'),item.idB64Url);
  assert.equal(verified.payload.toString(),'cold content regression fixture');
 }finally{clearTimeout(timer);release();await job;await server.close();}
});

test('missing content and pending content are HTTP 200 outcomes; malformed requests remain HTTP 400',async t=>{
 const peer=testPeer(t),id='A'.repeat(43),server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0}),address={host:'127.0.0.1',port:server.address.port};
 let release;
 try{
  assert.deepEqual(await post(address,{op:'content',dataId:id,offset:0}),{status:200,body:{ok:false,error:'content_not_cached'}});
  peer.historyLookups.set(id,new Promise(r=>release=r));
  assert.deepEqual(await post(address,{op:'content',dataId:id,offset:0,waitMs:0}),{status:200,body:{ok:false,error:'content_lookup_pending'}});
  assert.equal((await post(address,{op:'content',dataId:'../invalid',offset:0})).status,400);
  assert.equal((await post(address,{op:'content',dataId:id,offset:1})).status,400);
 }finally{release?.();await server.close();}
});

test('direct content client retries pending responses within a fixed bound and honors cancellation',async()=>{
 let requests=0;
 const server=http.createServer((req,res)=>{requests++;req.resume();res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:false,error:'content_lookup_pending'}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const peer={host:'127.0.0.1',port:server.address().port},request={op:'content',dataId:'A'.repeat(43),offset:0};
 try{
  assert.equal((await queryDirectPeer(peer,request)).error,'content_lookup_pending');assert.equal(requests,4);
  const controller=new AbortController();controller.abort(new Error('navigation_changed'));
  await assert.rejects(queryDirectPeer(peer,request,{signal:controller.signal}),/navigation_changed/);assert.equal(requests,4);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('a cold location request sees a newly indexed hint before full content is cached',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-wait-')),id='A'.repeat(43),root='B'.repeat(43),file=path.join(dir,'locations.json');
 fs.writeFileSync(file,'{}');
 const peer=new MeshPeer({dataDir:path.join(dir,'peer'),locationsFile:file});
 const keys=crypto.generateKeyPairSync('ed25519');peer.identity={privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'}),publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'})};
 let finish;peer.historyLookups.set(id,new Promise(resolve=>{finish=resolve;}));
 const timer=setTimeout(()=>fs.writeFileSync(file,JSON.stringify({[id]:{rootTxId:root,path:[]}})),50);
 try{const reply=await peer._handleAsync({op:'location',dataId:id,waitMs:1000});assert.equal(reply.ok,true);assert.equal(JSON.parse(reply.recordJson).rootTxId,root);assert.equal(peer.contentStore.get(id),null);}
 finally{clearTimeout(timer);finish();fs.rmSync(dir,{recursive:true,force:true});}
});

test('a bounded lookup reports pending instead of claiming the content is absent',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-wait-')),id='A'.repeat(43),file=path.join(dir,'locations.json');fs.writeFileSync(file,'{}');
 const peer=new MeshPeer({dataDir:path.join(dir,'peer'),locationsFile:file});let finish;peer.historyLookups.set(id,new Promise(resolve=>{finish=resolve;}));
 try{const reply=await peer._handleAsync({op:'location',dataId:id,waitMs:0});assert.equal(reply.error,'location_lookup_pending');}
 finally{finish();fs.rmSync(dir,{recursive:true,force:true});}
});

test('location failure is attributed to the location stage after L1 fallback',()=>{
 const p=new NavigationProgress();p.event({stage:'location',status:'active'});p.event({stage:'download',status:'active'});p.fail('location');
 assert.equal(p.snapshot().stages.find(x=>x.id==='location').status,'error');assert.equal(p.snapshot().stages.find(x=>x.id==='download').status,'interrupted');
});

test('cache-only misses neither start nor wait for a downstream lookup',async t=>{
 const peer=testPeer(t),id='A'.repeat(43);let warmed=0;
 peer._warmLocation=()=>{warmed++;};peer.historyLookups.set(id,new Promise(()=>{}));
 const result=await Promise.race([peer._handleAsync({op:'content',dataId:id,offset:0,cacheOnly:true,waitMs:8000}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('cache-only waited')),250);timer.unref();})]);
 assert.equal(result.error,'content_not_cached');assert.equal(warmed,0);
 const location=await peer._handleAsync({op:'location',dataId:id,cacheOnly:true});assert.equal(location.error,'location_not_found');assert.equal(warmed,0);
});

test('bounded replication requests retain signature verification and carry cache-only intent',async t=>{
 const peer=testPeer(t),key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const item=signDataItem(key,{data:Buffer.from('replicated signed content'),tags:[]});
 await peer.contentStore.put(item.idB64Url,item.binary);
 const original=peer._handleAsync.bind(peer);let intent;
 peer._handleAsync=async req=>{intent=req.cacheOnly;return original(req);};
 const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
 try{const r=await createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:server.address.port}],dhtEnabled:false,cacheOnly:true}).content(item.idB64Url);assert.equal(intent,true);assert.equal(r.payload.toString(),'replicated signed content');}
 finally{await server.close();}
});
