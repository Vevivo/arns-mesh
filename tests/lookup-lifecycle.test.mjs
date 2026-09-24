import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import Arweave from 'arweave';
import {HistoricalIndex,cdbHash,configureHistoricalIndex} from '../src/cdb64-index.mjs';
import {shareQuery} from '../src/query-work.mjs';
import {fetchL1Direct} from '../src/arweave-direct.mjs';

function fixture(){
 const key=crypto.randomBytes(32),root=crypto.randomBytes(32),value=Buffer.concat([Buffer.from([0x81,0xa1,0x72,0xc4,0x20]),root]);
 const hash=cdbHash(key),record=4096,table=record+16+32+value.length,bytes=Buffer.alloc(table+32);
 bytes.writeBigUInt64LE(BigInt(table),Number(hash&255n)*16);bytes.writeBigUInt64LE(2n,Number(hash&255n)*16+8);
 bytes.writeBigUInt64LE(32n,record);bytes.writeBigUInt64LE(BigInt(value.length),record+8);key.copy(bytes,record+16);value.copy(bytes,record+48);
 const slot=Number((hash>>8n)%2n);bytes.writeBigUInt64LE(hash,table+slot*16);bytes.writeBigUInt64LE(BigInt(record),table+slot*16+8);
 return {bytes,key,root};
}

test('cancelling a page does not cancel another consumer of the same historical lookup',async()=>{
 const {bytes,key,root}=fixture(),dataId=key.toString('base64url');
 const index=new HistoricalIndex({manifests:[{height:10,partitions:[[key[0].toString(16).padStart(2,'0'),root.toString('base64url'),0,bytes.length]]}]});
 let release,started,reads=0;
 const blocked=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 index.read=async(_root,offset,length,{signal})=>{reads++;started();await blocked;signal.throwIfAborted();return bytes.subarray(offset,offset+length);};
 const first=new AbortController(),second=new AbortController();
 const before=index.find(dataId,{signal:first.signal});
 const rejected=assert.rejects(before,/navigation_changed/);
 await entered;
 const after=index.find(dataId,{signal:second.signal});
 first.abort(new Error('navigation_changed'));release();
 await rejected;
 assert.equal((await after).rootTxId,root.toString('base64url'));
 assert.equal(reads,4);
});

test('a new attempt survives late cleanup of the cancelled attempt',async()=>{
 const jobs=new Map(),controller=new AbortController();let releaseOld,releaseNew,startedOld,startedNew,calls=0;
 const oldEntered=new Promise(r=>startedOld=r),newEntered=new Promise(r=>startedNew=r);
 const old=shareQuery(jobs,'same-url',async()=>{calls++;startedOld();await new Promise(r=>releaseOld=r);return 'old';},{signal:controller.signal});
 const rejected=assert.rejects(old,/navigation_changed/);await oldEntered;controller.abort(new Error('navigation_changed'));
 const fresh=shareQuery(jobs,'same-url',async()=>{calls++;startedNew();await new Promise(r=>releaseNew=r);return 'new';});
 await newEntered;releaseOld();await rejected;await new Promise(r=>setImmediate(r));
 const joined=shareQuery(jobs,'same-url',()=>{throw new Error('must reuse current attempt');});
 releaseNew();assert.deepEqual(await Promise.all([fresh,joined]),['new','new']);assert.equal(calls,2);assert.equal(jobs.size,0);
});

test('an aborted historical request is not stored as a negative result',async()=>{
 const resolver=configureHistoricalIndex({});const id=crypto.randomBytes(32).toString('base64url');let calls=0,entered;
 const started=new Promise(r=>entered=r),controller=new AbortController();
 resolver.index.find=async(_id,{signal})=>{calls++;entered();return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});};
 const first=resolver.find(id,{signal:controller.signal}),rejected=assert.rejects(first,/navigation_changed/);
 await started;controller.abort(new Error('navigation_changed'));await rejected;
 resolver.index.find=async()=>{calls++;return null;};
 assert.equal(await resolver.find(id),null);assert.equal(calls,2);
 assert.equal(await resolver.find(id),null);assert.equal(calls,2);
});

test('L1 metadata probes bypass a stalled peer and reject a forged transaction before downloading',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-l1-race-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const arweave=Arweave.init({}),key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const payload=Buffer.from('signed L1 bytes from another peer');
 const tx=await arweave.createTransaction({data:payload,reward:'0',last_tx:crypto.randomBytes(32).toString('base64url')},key);await arweave.transactions.sign(tx,key);
 const raw=tx.toJSON(),forged={...raw,signature:Buffer.alloc(512,1).toString('base64url')};
 let stalled=0,forgedQueries=0,downloads=0;
 const servers=['stall','forged','honest'].map(kind=>http.createServer((req,res)=>{
  if(req.url==='/info'){res.end(JSON.stringify({network:'arweave.N.1',height:10}));return;}
  if(req.url===`/tx/${tx.id}`){if(kind==='stall'){stalled++;return;}if(kind==='forged')forgedQueries++;res.end(JSON.stringify(kind==='forged'?forged:raw));return;}
  if(req.url===`/tx/${tx.id}/offset`&&kind==='honest'){res.end(JSON.stringify({offset:payload.length-1,size:payload.length}));return;}
  if(req.url.startsWith('/chunk/')&&kind==='honest'){downloads++;res.end(JSON.stringify({chunk:payload.toString('base64url'),absolute_end_offset:payload.length-1,chunk_size:payload.length}));return;}
  res.writeHead(404);res.end('{}');
 }));
 await Promise.all(servers.map(s=>new Promise(r=>s.listen(0,'127.0.0.1',r))));
 try{
  const seedsFile=path.join(dir,'seeds.json');fs.writeFileSync(seedsFile,JSON.stringify(servers.map(s=>({host:'127.0.0.1',port:s.address().port}))));
  const result=await fetchL1Direct({dataId:tx.id,seedsFile,maxPeers:3,signal:AbortSignal.timeout(3000)});
  assert.deepEqual(result.payload,payload);assert.equal(result.l1SignatureVerified,true);assert.equal(result.l1DataRootVerified,true);
  assert.equal(stalled,1);assert.equal(forgedQueries,1);assert.equal(downloads,1);assert.equal(result.peer.port,servers[2].address().port);
 }finally{for(const s of servers)s.closeAllConnections();await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
});
