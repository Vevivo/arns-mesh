import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {signDataItem} from '@ardrive/turbo-upload';
import {lookupCdb64,cdbHash,decodeIndexValue} from '../src/cdb64-index.mjs';
import {NavigationProgress} from '../apps/helper/progress.mjs';
import {syncRecordCovers,fetchDataItemDirect,locateDataItem} from '../src/arweave-direct.mjs';

// Fixture follows the published CDB64 layout. Payload is a MessagePack
// map {r: bin32}; random keys prevent a name/data-ID-specific implementation.
function fixture(){
 const key=crypto.randomBytes(32),root=crypto.randomBytes(32),value=Buffer.concat([Buffer.from([0x81,0xa1,0x72,0xc4,0x20]),root]);
 const hash=cdbHash(key),record=4096,table=record+16+32+value.length,bytes=Buffer.alloc(table+32);
 bytes.writeBigUInt64LE(BigInt(table),Number(hash&255n)*16);bytes.writeBigUInt64LE(2n,Number(hash&255n)*16+8);
 bytes.writeBigUInt64LE(32n,record);bytes.writeBigUInt64LE(BigInt(value.length),record+8);key.copy(bytes,record+16);value.copy(bytes,record+48);
 const slot=Number((hash>>8n)%2n);bytes.writeBigUInt64LE(hash,table+slot*16);bytes.writeBigUInt64LE(BigInt(record),table+slot*16+8);
 return {bytes,key,root,table,hash};
}
test('CDB64 performs bounded random reads, returns a routing hint, and misses an unrelated ID',async()=>{
 const {bytes,key,root}=fixture();let total=0;const read=async(o,n)=>{total+=n;return bytes.subarray(o,o+n);};
 const result=await lookupCdb64(read,bytes.length,key.toString('base64url'));assert.deepEqual(result,{rootTxId:root.toString('base64url'),path:[]});assert.ok(total<160);
 assert.equal(await lookupCdb64(read,bytes.length,crypto.randomBytes(32).toString('base64url')),null);
});
test('untrusted index pointers, truncated replies and unsafe value integers fail closed',async()=>{
 const {bytes,key,hash}=fixture();bytes.writeBigUInt64LE(BigInt(bytes.length+100),Number(hash&255n)*16);
 await assert.rejects(lookupCdb64(async(o,n)=>bytes.subarray(o,o+n),bytes.length,key.toString('base64url')),/bounds/);
 await assert.rejects(lookupCdb64(async()=>Buffer.alloc(0),5000,key.toString('base64url')),/truncated/);
 assert.throws(()=>decodeIndexValue(Buffer.from([0x81,0xa1,0x69,0xcf,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff])),/out_of_range/);
});
test('a navigation failure stops every running stage',()=>{
 const progress=new NavigationProgress();progress.event({stage:'location'});progress.event({stage:'download'});progress.fail();
 assert.equal(progress.snapshot().stages.some(s=>s.status==='active'),false);assert.equal(progress.snapshot().stages.find(s=>s.id==='download').status,'error');
});
test('native storage records use (start,end] intervals and reject malformed records',()=>{
 assert.equal(syncRecordCovers([{'200':'100'}],101),true);assert.equal(syncRecordCovers([{'200':'100'}],200),true);
 assert.equal(syncRecordCovers([{'200':'100'}],100),false);assert.equal(syncRecordCovers([{'bad':'0'}],100),false);assert.equal(syncRecordCovers({},100),false);
});
test('metadata and verified bytes may come from different raw peers, including a nested bundle',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-storage-'));
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const target=signDataItem(key,{data:Buffer.from('a real signed nested payload'),tags:[{name:'Content-Type',value:'text/plain'}]});
 const bundle=item=>{const h=Buffer.alloc(96);h.writeBigUInt64LE(1n);h.writeBigUInt64LE(BigInt(item.binary.length),32);Buffer.from(item.idB64Url,'base64url').copy(h,64);return Buffer.concat([h,item.binary]);};
 const nested=signDataItem(key,{data:bundle(target),tags:[{name:'Bundle-Format',value:'binary'},{name:'Bundle-Version',value:'2.0.0'}]});
 const bytes=bundle(nested),root=crypto.randomBytes(32).toString('base64url');let chunks=0,syncQueries=0;
 const server=(hasMetadata)=>http.createServer((req,res)=>{
  let result;
  if(req.url==='/info')result={network:'arweave.N.1',height:100};
  else if(req.url==='/peers')result=[];
  else if(req.url===`/tx/${root}/offset`&&hasMetadata)result={offset:bytes.length,size:bytes.length};
  else if(req.url.startsWith('/data_sync_record/')){syncQueries++;result=hasMetadata?[]:[{[bytes.length]:'0'}];}
  else if(req.url.startsWith('/chunk/')&&!hasMetadata){chunks++;result={chunk:bytes.toString('base64url'),absolute_end_offset:bytes.length,chunk_size:bytes.length};}
  else{res.writeHead(404);res.end('{}');return;}
  res.end(JSON.stringify(result));
 });
 const metadata=server(true),storage=server(false);await Promise.all([new Promise(r=>metadata.listen(0,'127.0.0.1',r)),new Promise(r=>storage.listen(0,'127.0.0.1',r))]);
 try{
  const seedsFile=path.join(dir,'peers.json');fs.writeFileSync(seedsFile,JSON.stringify([metadata,storage].map(s=>({host:'127.0.0.1',port:s.address().port}))));const siblings=[];
  const location=await locateDataItem(target.idB64Url,{rootTxId:root,path:[nested.idB64Url]},{seedsFile,onLocations:rows=>siblings.push(...rows)});
  const actual=await fetchDataItemDirect({dataId:target.idB64Url,location,seedsFile,maxPeers:2,chunkCache:new Map()});
  assert.equal(actual.payload.toString(),'a real signed nested payload');assert.equal(actual.peer.port,storage.address().port);assert.ok(syncQueries>0&&chunks>0);assert.ok(siblings.some(([id])=>id===target.idB64Url));
 }finally{await Promise.all([metadata,storage].map(s=>new Promise(r=>s.close(r))));fs.rmSync(dir,{recursive:true,force:true});}
});
