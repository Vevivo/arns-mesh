import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {signDataItem} from '@ardrive/turbo-upload';
import {lookupOffsetIndex,OFFSET_INDEX_ROOT} from '../src/lmdb-offset-index.mjs';
import {fetchDataItemDirect} from '../src/arweave-direct.mjs';
import {normalizeLocation} from '../src/location-index.mjs';
import {configureHistoricalIndex} from '../src/cdb64-index.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {queryDirectPeer} from '../src/direct-peer.mjs';

test('a cold direct peer can finish a pending lookup; cancellation and real misses do not retry',async()=>{
 let count=0,mode='pending';
 const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{count++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(mode==='missing'?{ok:false,error:'location_not_found'}:count===1?{ok:false,error:'location_lookup_pending'}:{ok:true,recordJson:'{}'}));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const peer={host:'127.0.0.1',port:server.address().port},request={op:'location',dataId:'A'.repeat(43)};
  assert.equal((await queryDirectPeer(peer,request)).ok,true);assert.equal(count,2);
  count=0;mode='missing';assert.equal((await queryDirectPeer(peer,request)).error,'location_not_found');assert.equal(count,1);
  count=0;mode='pending';await assert.rejects(queryDirectPeer(peer,request,{signal:AbortSignal.timeout(50)}));assert.equal(count,1);
 }finally{await new Promise(r=>server.close(r));}
});

const width=256;
function fixture(id){
 const prefix=BigInt('0x'+Buffer.from(id,'base64url').toString('hex'))>>179n;
 const row=(p,offset,size)=>Buffer.from(((p<<83n)|(BigInt(offset)<<34n)|BigInt(size)).toString(16).padStart(40,'0'),'hex');
 const rows=[row(prefix,5000,120),row(prefix,9000,240),row(prefix+1n,13000,360)];
 const b=Buffer.alloc(width*6);
 const db=(at,{flags=20,depth=1,root,entries=1,pad=20})=>{b.writeUInt32LE(pad,at);b.writeUInt16LE(flags,at+4);b.writeUInt16LE(depth,at+6);b.writeBigUInt64LE(BigInt(entries),at+32);b.writeBigUInt64LE(BigInt(root),at+40);};
 const page=(n,flags,count,pad=0)=>{const at=n*width;b.writeBigUInt64LE(BigInt(n),at);b.writeUInt16LE(pad,at+16);b.writeUInt16LE(flags,at+18);b.writeUInt16LE(count*2,at+20);};
 for(let i=0;i<2;i++){const at=i*width;page(i,8,0);b.writeUInt32LE(0xbeefc0de,at+24);b.writeUInt32LE(3,at+28);b.writeUInt32LE(width,at+48);db(at+96,{root:2});b.writeBigUInt64LE(5n,at+144);b.writeBigUInt64LE(BigInt(i),at+152);}
 const node=(pg,slot,at,key,{flags=0,lo=0,hi=0}={})=>{const base=pg*width;b.writeUInt16LE(at-24,base+24+slot*2);b.writeUInt16LE(lo,base+at);b.writeUInt16LE(hi,base+at+2);b.writeUInt16LE(flags,base+at+4);b.writeUInt16LE(key.length,base+at+6);key.copy(b,base+at+8);return base+at+8+key.length+(key.length&1);};
 page(2,2,1);const at=node(2,0,160,Buffer.from([0]),{flags:6,lo:48});db(at,{root:3,depth:2,entries:3});
 page(3,1,2);node(3,0,220,Buffer.alloc(0),{lo:4});node(3,1,180,rows[1],{lo:5});
 page(4,34,1,20);rows[0].copy(b,4*width+24);
 page(5,34,2,20);rows[1].copy(b,5*width+24);rows[2].copy(b,5*width+44);
 return {b,rows};
}
test('LMDB index finds all prefix collisions across leaf boundaries and proves misses',async()=>{
 const id=Buffer.alloc(32,0x45).toString('base64url'),{b}=fixture(id);
 const result=await lookupOffsetIndex(async(o,n)=>b.subarray(o,o+n),b.length,id);
 assert.deepEqual(result.candidates.map(x=>[x.weaveOffset,x.itemSize]),[[5000,120],[9000,240]]);
 assert.equal(result.records,3);assert.ok(result.pagesRead<=8);
 const miss=Buffer.alloc(32,0x99).toString('base64url');
 assert.equal((await lookupOffsetIndex(async(o,n)=>b.subarray(o,o+n),b.length,miss)).candidates.length,0);
});
test('malformed LMDB geometry, pointers, budgets and truncation are errors rather than misses',async()=>{
 const id=Buffer.alloc(32,0x45).toString('base64url');
 for(const change of [b=>b.writeUInt32LE(0,24),b=>b.writeUInt16LE(1000,2*width+24),b=>b.writeUInt16LE(99,3*width+220),b=>b.writeUInt16LE(0,4*width+16)]){
  const {b}=fixture(id);change(b);await assert.rejects(lookupOffsetIndex(async(o,n)=>b.subarray(o,o+n),b.length,id),/offset_index_/);
 }
 const {b}=fixture(id);
 await assert.rejects(lookupOffsetIndex(async()=>Buffer.alloc(0),b.length,id),/short_read/);
 await assert.rejects(lookupOffsetIndex(async(o,n)=>b.subarray(o,o+n),b.length,id,{maxPages:3}),/budget/);
 await assert.rejects(lookupOffsetIndex(async(o,n)=>b.subarray(o,o+n),b.length,id,{maxCandidates:1}),/candidate_limit/);
});
test('absolute weave retrieval checks complete ID and signature, rejects tampering, and needs no root transaction',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-absolute-'));
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const signed=signDataItem(key,{data:Buffer.from('automatic offset content'),tags:[{name:'Content-Type',value:'text/html'}]});
 let bytes=Buffer.from(signed.binary);const seen=[];
 const server=http.createServer((req,res)=>{seen.push(req.url);res.setHeader('Content-Type','application/json');if(req.url==='/info')return res.end(JSON.stringify({network:'arweave.N.1',height:1}));if(req.url==='/chunk/5001')return res.end(JSON.stringify({chunk:bytes.toString('base64url'),chunk_size:bytes.length,absolute_end_offset:5000+bytes.length}));res.writeHead(404);res.end('{}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const peers=path.join(dir,'peers.json');fs.writeFileSync(peers,JSON.stringify([{host:'127.0.0.1',port:server.address().port}]));
  // Do not merge the release's public fallback peers into this local fixture.
  const oldSeeds=process.env.ARWEAVE_PEER_SEEDS;process.env.ARWEAVE_PEER_SEEDS=peers;
  t.after(()=>{if(oldSeeds===undefined)delete process.env.ARWEAVE_PEER_SEEDS;else process.env.ARWEAVE_PEER_SEEDS=oldSeeds;});
  const location={weaveOffset:5000,itemSize:bytes.length},dataId=signed.idB64Url;
  const options={dataId,location,seedsFile:peers,maxPeers:1,chunkCache:new Map()};
  assert.equal((await fetchDataItemDirect(options)).payload.toString(),'automatic offset content');
  assert.equal(seen.some(x=>x.startsWith('/tx/')),false);
  const wrongId=Buffer.from(dataId,'base64url');wrongId[31]^=1; // Same 77-bit prefix.
  await assert.rejects(fetchDataItemDirect({...options,dataId:wrongId.toString('base64url'),chunkCache:new Map()}),/id_mismatch/);
  bytes[bytes.length-1]^=1;await assert.rejects(fetchDataItemDirect({...options,chunkCache:new Map()}),/signature_invalid/);bytes[bytes.length-1]^=1;
  for(const offset of [-1,0.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>normalizeLocation(dataId,{...location,weaveOffset:offset}));
  assert.throws(()=>normalizeLocation(dataId,{...location,rootTxId:OFFSET_INDEX_ROOT}),/ambiguous/);
  // Exercise the public browser retrieval path: only the offset branch can
  // succeed, and it must verify before writing its location or cached bytes.
  const old=process.env.ARWEAVE_PEERS;process.env.ARWEAVE_PEERS=peers;
  try{
   const locationsFile=path.join(dir,'locations.json');fs.writeFileSync(locationsFile,'{}');
   let oldIndexRequests=0;
   const index=configureHistoricalIndex({peersFile:peers,locationsFile});index.findOffsets=async()=>[location];index.find=async()=>{oldIndexRequests++;return null;};
   const store=new VerifiedContentStore(path.join(dir,'content'));
   const result=await fetchMeshContent(dataId,{locationsFile,contentStore:store,client:{content:async()=>{throw new Error('no mesh copy');},locateCandidates:async()=>[]},signal:AbortSignal.timeout(4000)});
   assert.equal(result.loc.transport,'published-offset-index');assert.equal(result.direct.payload.toString(),'automatic offset content');assert.ok(store.get(dataId));
   assert.equal(oldIndexRequests,0);assert.equal(seen.some(x=>x.startsWith('/tx/')),false);
   // A real miss releases the older sources immediately; no eight-second wait.
   index.findOffsets=async()=>[];index.find=async()=>{oldIndexRequests++;return location;};
   const other=new VerifiedContentStore(path.join(dir,'other-content')),otherLocations=path.join(dir,'other-locations.json');fs.writeFileSync(otherLocations,'{}');
   const fallback=await fetchMeshContent(dataId,{locationsFile:otherLocations,contentStore:other,client:{content:async()=>{throw new Error('no copy');},locateCandidates:async()=>[]},signal:AbortSignal.timeout(3000)});
   assert.equal(fallback.loc.transport,'historical-index');assert.equal(oldIndexRequests,1);
  }finally{if(old===undefined)delete process.env.ARWEAVE_PEERS;else process.env.ARWEAVE_PEERS=old;}
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
