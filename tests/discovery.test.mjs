import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {signDataItem} from '@ardrive/turbo-upload';
import {normalizeLocation,LocationIndex} from '../src/location-index.mjs';
import {contentTopic} from '../src/swarm-common.mjs';
import {fetchDataItemDirect} from '../src/arweave-direct.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';

test('location hints reject unsafe IDs and ranges, and content topics preserve ID case',()=>{
 const id='A'.repeat(43),root='B'.repeat(43);
 assert.throws(()=>normalizeLocation(id,{rootTxId:'../../secret'}));
 for(const n of [-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>normalizeLocation(id,{rootTxId:root,rootOffset:n,itemSize:12}));
 assert.throws(()=>normalizeLocation(id,{rootTxId:root,rootOffset:0,itemSize:33*1024*1024}));
 assert.notDeepEqual(contentTopic(id),contentTopic('a'.repeat(43)));
});
test('an index peer answers a content location without knowing or sharing the ArNS name',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-index-'));
 try{
  const id='A'.repeat(43),root='B'.repeat(43),file=path.join(dir,'locations.json');
  fs.writeFileSync(file,JSON.stringify({[id]:{rootTxId:root,path:[]}}));
  const peer=new MeshPeer({dataDir:path.join(dir,'peer'),locationsFile:file});
  const pair=crypto.generateKeyPairSync('ed25519');peer.identity={privateKeyPem:pair.privateKey.export({format:'pem',type:'pkcs8'}),publicKeyPem:pair.publicKey.export({format:'pem',type:'spki'})};
  const reply=JSON.parse(peer._handle({op:'location',dataId:id}).recordJson);
  assert.equal(reply.rootTxId,root);assert.deepEqual(peer.status().sharedNames,[]);
  assert.equal(peer._handle({op:'location',dataId:'C'.repeat(43)}).error,'location_not_found');
  const index=new LocationIndex(file);assert.equal(index.get(id).rootTxId,root);
  fs.writeFileSync(file,JSON.stringify({[id]:{rootTxId:'D'.repeat(43),path:[],itemSize:10,rootOffset:20}}));
  assert.equal(index.get(id).rootTxId,'D'.repeat(43));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('raw offset hints fetch signature-verified items and reject wrong offsets or tampering',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-offset-'));
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const item=signDataItem(key,{data:Buffer.from('live-shaped offset test'),tags:[{name:'Content-Type',value:'text/plain'}]});
 const root='B'.repeat(43);let rootBytes=Buffer.concat([Buffer.alloc(64),item.binary,Buffer.alloc(8)]);
 const server=http.createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/info')return res.end(JSON.stringify({network:'arweave.N.1',height:10}));
  if(req.url===`/tx/${root}/offset`)return res.end(JSON.stringify({offset:rootBytes.length-1,size:rootBytes.length}));
  if(req.url.startsWith('/chunk/'))return res.end(JSON.stringify({chunk:rootBytes.toString('base64url'),absolute_end_offset:rootBytes.length-1,chunk_size:rootBytes.length}));
  res.statusCode=404;res.end('{}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const seeds=path.join(dir,'peers.json');fs.writeFileSync(seeds,JSON.stringify([{host:'127.0.0.1',port:server.address().port}]));
  const opts={dataId:item.idB64Url,location:{rootTxId:root,rootOffset:64,itemSize:item.binary.length,path:[root]},seedsFile:seeds,maxPeers:1};
  const valid=await fetchDataItemDirect(opts);assert.equal(valid.payload.toString(),'live-shaped offset test');
  await assert.rejects(fetchDataItemDirect({...opts,location:{...opts.location,rootOffset:65}}));
  // Failed verification evicts the affected root; refill with authentic bytes.
  assert.equal((await fetchDataItemDirect(opts)).payload.toString(),'live-shaped offset test');
  rootBytes[64+item.binary.length-1]^=1;
  // A valid immutable cached chunk remains usable if its provider later lies.
  assert.equal((await fetchDataItemDirect(opts)).payload.toString(),'live-shaped offset test');
  // A fresh network read must still reject the tampered bytes.
  const freshCache=new Map();
  await assert.rejects(fetchDataItemDirect({...opts,chunkCache:freshCache}),/signature_invalid/);
  rootBytes[64+item.binary.length-1]^=1;
  assert.equal((await fetchDataItemDirect({...opts,chunkCache:freshCache})).payload.toString(),'live-shaped offset test');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
