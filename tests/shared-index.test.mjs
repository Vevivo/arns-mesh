import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import bs58 from 'bs58';
import {canonicalize} from 'json-canonicalize';
import {verifyPublication,digest} from '../src/index-publication.mjs';
import {cdbHash,decodeIndexValue} from '../src/cdb64-format.mjs';
import {SharedIndex} from '../src/shared-index.mjs';
import {syncSharedIndex,validateCdb,atomicJson} from '../scripts/sync-shared-index.mjs';
const pair=crypto.generateKeyPairSync('ed25519'),key=bs58.encode(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32));
const trust={publisher:key,observerAddress:key};
function sign(doc){return {...doc,signature:{alg:'ed25519',keyId:key,sig:crypto.sign(null,Buffer.from('ar-io-index-publication/v1\n'+canonicalize(doc)),pair.privateKey).toString('base64')}};}
function fixture(sequence=1){
 const id=crypto.randomBytes(32),root=crypto.randomBytes(32),prefix=id[0].toString(16).padStart(2,'0');
 const float=Buffer.alloc(9);float[0]=0xcb;float.writeDoubleBE(2**40,1);
 const value=Buffer.concat([Buffer.from([0x83,0xa1,0x72,0xc4,32]),root,Buffer.from([0xa1,0x69]),float,Buffer.from([0xa1,0x73,0xcd,0x10,0x00])]);
 const table=4096+48+value.length,b=Buffer.alloc(table+32),h=cdbHash(id),slot=Number((h>>8n)%2n);
 b.writeBigUInt64LE(BigInt(table),Number(h&255n)*16);b.writeBigUInt64LE(2n,Number(h&255n)*16+8);b.writeBigUInt64LE(32n,4096);b.writeBigUInt64LE(BigInt(value.length),4104);id.copy(b,4112);value.copy(b,4144);b.writeBigUInt64LE(h,table+slot*16);b.writeBigUInt64LE(4096n,table+slot*16+8);
 const manifest=Buffer.from(JSON.stringify({version:1,partitions:[{prefix,location:{type:'file',filename:prefix+'.cdb'},recordCount:1,size:b.length}]}));
 const files=[{name:prefix+'.cdb',size:b.length,sha256:digest(b)},{name:'manifest.json',size:manifest.length,sha256:digest(manifest)}];
 const doc=sign({version:1,publisher:key,sequence,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),extra:{unicode:'😀',fraction:1e-7},indexes:[{name:'root-tx-index',kind:'cdb64-root-tx',bands:[{id:'tip',heightRange:[123,null],records:1,files}]}]});
 return {doc,id:id.toString('base64url'),root:root.toString('base64url'),prefix,b,files:new Map([[digest(b),b],[digest(manifest),manifest]])};
}
test('publication verifies complete JCS document and rejects forgery, wrong publisher, rollback and same-sequence equivocation',()=>{
 const f=fixture(),checked=verifyPublication(f.doc,trust);
 assert.equal(checked.stale,false);
 assert.throws(()=>verifyPublication({...f.doc,extra:{fraction:1}},trust),/signature/);
 assert.throws(()=>verifyPublication(f.doc,{...trust,publisher:'wrong'}),/publication/);
 assert.throws(()=>verifyPublication(f.doc,trust,{sequence:2}),/rollback/);
 assert.throws(()=>verifyPublication(f.doc,trust,{sequence:1,acceptedDigest:'0'.repeat(64)}),/rollback/);
 assert.equal(verifyPublication(f.doc,trust,{now:Date.now()+2*86400000}).stale,true);
 assert.throws(()=>verifyPublication(f.doc,trust,{now:Date.now()+2*86400000,allowExpired:false}),/expired/);
});
test('r84 float64 offsets are exact integers, malformed fractions and CDB pointers are rejected',()=>{
 const f=fixture();assert.equal(validateCdb(f.b,f.prefix),1);
 const unsafe=Buffer.alloc(12);unsafe.set([0x81,0xa1,0x69,0xcb]);unsafe.writeDoubleBE(1.5,4);assert.throws(()=>decodeIndexValue(unsafe),/out_of_range/);
 const broken=Buffer.from(f.b);broken.writeBigUInt64LE(99n,4096);assert.throws(()=>validateCdb(broken,f.prefix),/record_bounds/);
});
test('downloads are hashed, installed atomically, read without network, survive expiry and keep previous generation on failed update',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-shared-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));atomicJson(path.join(dir,'trust.json'),trust);
 let f=fixture(),broken=false,calls=0;const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url)=>{calls++;const bytes=f.files.get(String(url).split('/').at(-1));return new Response(broken?Buffer.from('corrupt'):bytes,{status:200});};
 await syncSharedIndex({dir,origin:'https://publisher.example',fetchJson:async()=>f.doc});
 const reader=new SharedIndex(dir);globalThis.fetch=()=>{throw new Error('network_forbidden');};
 const result=await reader.find(f.id);assert.equal(result.rootTxId,f.root);assert.equal(result.rootOffset,2**40);assert.equal(result.itemSize,4096);assert.equal(calls,2);assert.equal(reader.status().bands,1);
 const previous=f;f=fixture(2);broken=true;globalThis.fetch=async()=>new Response('corrupt',{status:200});
 await assert.rejects(syncSharedIndex({dir,origin:'https://publisher.example',fetchJson:async()=>f.doc}),/digest_or_size/);
 reader.nextCheck=0;assert.equal((await reader.find(previous.id)).rootTxId,previous.root);assert.equal(await reader.find(f.id),null);
 await assert.rejects(syncSharedIndex({dir,origin:'https://publisher.example',fetchJson:async()=>previous.doc}),/rollback/);
});
test('disk lookup refuses a tampered signed manifest and does not trust a replacement public key',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-index-tamper-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const f=fixture();fs.mkdirSync(path.join(dir,'blobs'));fs.mkdirSync(path.join(dir,'publications'));atomicJson(path.join(dir,'trust.json'),trust);
 const sha=verifyPublication(f.doc,trust).sha;atomicJson(path.join(dir,'publications',sha+'.json'),f.doc);atomicJson(path.join(dir,'installed.json'),{schema:'arns-shared-index/v1',bands:[{bandId:'tip',publication:sha}]});
 for(const [hash,bytes] of f.files)fs.writeFileSync(path.join(dir,'blobs',hash),bytes);
 const mf=f.doc.indexes[0].bands[0].files.find(x=>x.name==='manifest.json');fs.writeFileSync(path.join(dir,'blobs',mf.sha256),'{}');const reader=new SharedIndex(dir);assert.equal(await reader.find(f.id),null);assert.match(reader.status().lastError,/manifest_digest/);
});
