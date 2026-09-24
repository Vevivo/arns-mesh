import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {signDataItem} from '@ardrive/turbo-upload';
import {verifyDataItem,parseDataItem} from '../src/ans104.mjs';
import {walkBundleHeaders} from '../src/bundle-walker.mjs';
import {blockSummaryReader} from '../src/block-summary.mjs';
import {requestIpJson} from '../src/ip-transport.mjs';
import {createData,EthereumSigner,SolanaSigner} from '@dha-team/arbundles/node';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {verifyRawItem} from '../src/content-store.mjs';

const bundle=items=>{const h=Buffer.alloc(32+64*items.length);h.writeBigUInt64LE(BigInt(items.length));items.forEach((x,i)=>{h.writeBigUInt64LE(BigInt(x.binary.length),32+64*i);Buffer.from(x.idB64Url,'base64url').copy(h,64+64*i);});return Buffer.concat([h,...items.map(x=>x.binary)]);};
const root=crypto.randomBytes(32).toString('base64url');
test('Ethereum and Solana items, including empty tags, verify and reject tampering',async()=>{
 const signers=[new EthereumSigner(crypto.randomBytes(32).toString('hex')),new SolanaSigner(bs58.encode(nacl.sign.keyPair().secretKey))];
 for(const signer of signers){
  const item=createData('signed multi-format content',signer,{tags:[]});await item.sign(signer);
  const raw=item.getRaw(),verified=await verifyRawItem(raw,item.id);assert.equal(verified.payload.toString(),'signed multi-format content');assert.deepEqual(verified.tags,[]);
  const bad=Buffer.from(raw);bad[bad.length-1]^=1;await assert.rejects(verifyRawItem(bad,item.id),/signature_invalid/);
  const presence=Buffer.from(raw),p=parseDataItem(raw);presence[p.offsets.targetStart]=2;await assert.rejects(verifyRawItem(presence,item.id),/invalid_target_presence/);
 }
});
test('unknown nested data is discovered across serialized restarts and independently verifies',async()=>{
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const leaf=signDataItem(key,{data:Buffer.from('nested page, no preseeded ID'),tags:[{name:'Content-Type',value:'text/html'}]});
 const container=signDataItem(key,{data:bundle([leaf]),tags:[{name:'Bundle-Format',value:'binary'},{name:'Bundle-Version',value:'2.0.0'}]});
 const sibling=signDataItem(key,{data:Buffer.from('other content'),tags:[]});
 const bytes=bundle([container,sibling]);let cursor={},index=new Map();
 const opts={rootTxId:root,rootSize:bytes.length,maxItems:1,read:async(o,n)=>bytes.subarray(o,o+n),onEntries:rows=>rows.forEach(([id,h])=>index.set(id,h))};
 const first=await walkBundleHeaders({...opts,cursor});assert.equal(first.complete,false);assert.ok(index.has(leaf.idB64Url));
 cursor=JSON.parse(JSON.stringify(cursor));const second=await walkBundleHeaders({...opts,cursor});assert.equal(second.complete,false);
 cursor=JSON.parse(JSON.stringify(cursor));const third=await walkBundleHeaders({...opts,cursor});assert.equal(third.complete,true);
 const hint=index.get(leaf.idB64Url);assert.deepEqual(hint.path,[container.idB64Url]);
 const raw=bytes.subarray(hint.rootOffset,hint.rootOffset+hint.itemSize);assert.equal(await verifyDataItem(raw),true);assert.equal(parseDataItem(raw).rawData.toString(),'nested page, no preseeded ID');
 assert.deepEqual([...index.keys()].sort(),[leaf.idB64Url,container.idB64Url,sibling.idB64Url].sort());
 const damaged=Buffer.from(raw);damaged[damaged.length-1]^=1;assert.equal(await verifyDataItem(damaged),false);
});
test('failed index writes and truncated headers cannot advance or complete a cursor',async()=>{
 const bytes=Buffer.alloc(96);bytes.writeBigUInt64LE(1n);bytes.writeBigUInt64LE(4n,32);crypto.randomBytes(32).copy(bytes,64);const full=Buffer.concat([bytes,Buffer.alloc(4)]),cursor={};
 const options={rootTxId:root,rootSize:full.length,cursor,maxItems:0,read:async(o,n)=>full.subarray(o,o+n)};
 await assert.rejects(walkBundleHeaders({...options,onEntries:()=>{throw new Error('disk full');}}),/disk full/);assert.equal(cursor.frames[0].indexed,false);assert.equal(cursor.frames[0].next,0);
 await assert.rejects(walkBundleHeaders({...options,read:async(o,n)=>full.subarray(o,o+Math.min(n,20))}),/truncated/);
 const a=await walkBundleHeaders(options);assert.equal(a.complete,false);assert.equal(cursor.frames[0].next,0);
 await assert.rejects(walkBundleHeaders({...options,rootTxId:'A'.repeat(43)}),/root_mismatch/);
});
test('streaming block summaries handle split UTF-8, escapes, nested decoys and field order',()=>{
 const values={label:'ağ, \\"',fake:{height:999,txs:[root]},txs:[root],height:20,timestamp:123,poa:{chunk:'x'.repeat(10000)}};
 const bytes=Buffer.from(JSON.stringify(values));const reader=blockSummaryReader();let found,consumed=0;
 for(const byte of bytes){consumed++;found=reader(Buffer.from([byte]));if(found)break;}
 assert.equal(found.height,20);assert.deepEqual(found.txs,[root]);assert.ok(consumed<500);
 assert.throws(()=>blockSummaryReader()(Buffer.from('{"height":2,"txs":["bad"]}')),/invalid_block_summary/);
});
test('native block transport closes before downloading the remaining proof body',async()=>{
 const prefix=JSON.stringify({height:55,txs:[root]}).slice(0,-1)+',"poa":{"chunk":"';let closed=false,timer,closeDone;const closedEvent=new Promise(r=>closeDone=r);
 const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.write(prefix);timer=setTimeout(()=>res.end('x'.repeat(1024*1024)+'"}}'),1000);res.on('close',()=>{closed=true;clearTimeout(timer);closeDone();});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let received=0;
 try{const b=await requestIpJson({host:'127.0.0.1',port:server.address().port,path:'/block/height/55',summarizeBlock:true,onBytes:n=>received+=n});assert.equal(b.height,55);assert.ok(received<1024);}
 finally{await closedEvent;await new Promise(r=>server.close(r));}assert.equal(closed,true);
});
