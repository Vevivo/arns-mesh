import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {decodeVerifiedPayload,MAX_DECODED_BYTES} from '../src/content-decoding.mjs';
import {verifyRawItem,VerifiedContentStore} from '../src/content-store.mjs';
import {resolveArweaveResource} from '../apps/helper/resource-adapter.mjs';
import {contentResponse,plainError} from '../apps/browser/response.mjs';
import {ResponseCache} from '../apps/helper/response-cache.mjs';

const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
const pack={gzip:gzipSync,br:brotliCompressSync,identity:bytes=>bytes};
async function signed(text,encoding,type='text/html',tags=[]){
 const payload=pack[encoding](Buffer.from(text));
 const data=createData(payload,signer,{tags:[{name:'Content-Type',value:type},...(encoding==='identity'?[]:[{name:'Content-Encoding',value:encoding}]),...tags]});
 await data.sign(signer);
 return {data,verified:await verifyRawItem(data.getRaw(),data.id),payload};
}
test('signed gzip, Brotli and plain HTML/JS/CSS render decoded views with original bytes and hashes unchanged',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-compression-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new VerifiedContentStore(dir);
 for(const encoding of ['gzip','br','identity'])for(const [type,text] of [
  ['text/html','<!doctype html><h1>✓ verified compressed content</h1>'],
  ['application/javascript','globalThis.compressionTest = "✓";'],
  ['text/css','body{color:rgb(12,34,56)}']]){
  const {data,payload,verified}=await signed(text,encoding,type),raw=Buffer.from(data.getRaw()),hash=verified.payloadSha256;
  await store.put(data.id,raw);
  const result=await resolveArweaveResource('https://arweave.net/raw/'+data.id,{contentStore:store,localOnly:true});
  assert.equal(result.body.toString(),text);assert.equal(result.bodyDecoded,true);
  assert.equal(result.contentEncoding,encoding==='identity'?null:encoding);
  assert.equal(result.meta.sha256,hash);assert.equal(result.meta.contentSignatureVerified,true);
  assert.deepEqual(store.get(data.id),raw);assert.deepEqual(verified.payload,payload);
  assert.equal((await verifyRawItem(store.get(data.id),data.id)).payloadSha256,hash);
  const cache=new ResponseCache();cache.set(data.id,result);
  for(const view of [result,cache.get(data.id)]){
   const response=contentResponse(view,new Request('ar://fixture/'));
   assert.equal(response.headers.get('content-type'),type);assert.equal(response.headers.get('content-encoding'),null);
   assert.equal(response.headers.get('content-length'),String(Buffer.byteLength(text)));
   assert.equal(await response.text(),text);
   const range=contentResponse(view,new Request('ar://fixture/',{headers:{range:'bytes=2-6'}}));
   assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 2-6/${Buffer.byteLength(text)}`);
   assert.equal(range.headers.get('content-length'),'5');assert.deepEqual(Buffer.from(await range.arrayBuffer()),Buffer.from(text).subarray(2,7));
   const head=contentResponse(view,new Request('ar://fixture/',{method:'HEAD'}));
   assert.equal(head.headers.get('content-length'),String(Buffer.byteLength(text)));assert.equal(await head.text(),'');
   assert.equal(contentResponse(view,new Request('ar://fixture/',{headers:{range:'bytes=99999-'}})).status,416);
  }
 }
});
test('only signed Content-Encoding selects decoding; unsupported, empty, stacked and duplicate values fail closed',async()=>{
 const {verified}=await signed('<h1>identity</h1>','identity');
 assert.equal((await decodeVerifiedPayload(verified)).contentEncoding,null);
 assert.equal((await decodeVerifiedPayload({...verified,tags:[{name:'content-encoding',value:'IDENTITY'}]})).body.toString(),'<h1>identity</h1>');
 for(const value of ['deflate','zstd','','gzip, br','gzip;foo=bar'])await assert.rejects(decodeVerifiedPayload({...verified,tags:[{name:'Content-Encoding',value}]}),/content_encoding_unsupported/);
 await assert.rejects(decodeVerifiedPayload({...verified,tags:[{name:'Content-Encoding',value:'gzip'},{name:'content-encoding',value:'gzip'}]}),/content_encoding_ambiguous/);
 const gzip=await signed('gzip remains encoded without signed tag','gzip');
 const withoutTag=await decodeVerifiedPayload({...gzip.verified,tags:[]});assert.deepEqual(withoutTag.body,gzip.payload,'no magic byte inference');
 const normalized=await decodeVerifiedPayload({...gzip.verified,tags:[{name:'cOnTeNt-EnCoDiNg',value:' GZip '}]});assert.equal(normalized.body.toString(),'gzip remains encoded without signed tag');
});
test('valid signatures do not make malformed compression displayable',async()=>{
 for(const encoding of ['gzip','br']){
  const data=createData(Buffer.from('not a compressed stream'),signer,{tags:[{name:'Content-Encoding',value:encoding}]});await data.sign(signer);
  await assert.rejects(decodeVerifiedPayload(await verifyRawItem(data.getRaw(),data.id)),/content_encoding_corrupt/);
  const good=await signed('truncated compressed data '.repeat(100),encoding);
  await assert.rejects(decodeVerifiedPayload({...good.verified,payload:good.payload.subarray(0,good.payload.length-2)}),/content_encoding_corrupt/);
 }
 assert.match(plainError(new Error('content_encoding_corrupt')),/compressed data is damaged/);
});
test('expansion is capped for gzip and Brotli including exact boundary, and custom limits cannot bypass global cap',async()=>{
 for(const encoding of ['gzip','br']){
  const sample=await signed('A'.repeat(4097),encoding);
  await assert.rejects(decodeVerifiedPayload(sample.verified,{maxOutputBytes:4096}),/content_decoded_size_limit/);
  assert.equal((await decodeVerifiedPayload(sample.verified,{maxOutputBytes:4097})).body.length,4097);
 }
 const bomb=await signed(Buffer.alloc(MAX_DECODED_BYTES+1,65),'gzip');
 assert.ok(bomb.payload.length<65536);
 await assert.rejects(decodeVerifiedPayload(bomb.verified),/content_decoded_size_limit/);
 await assert.rejects(decodeVerifiedPayload(bomb.verified,{maxOutputBytes:MAX_DECODED_BYTES+1}),/invalid_decoded_size_limit/);
 const plain=await signed('12345','identity');await assert.rejects(decodeVerifiedPayload(plain.verified,{maxOutputBytes:4}),/content_decoded_size_limit/);
 assert.match(plainError(new Error('content_decoded_size_limit')),/32 MiB/);
});
test('decoder deadlines terminate work, aborted queues are removed, and later requests still work',async()=>{
 const {verified}=await signed('time bounded '.repeat(1000),'gzip');
 await assert.rejects(decodeVerifiedPayload(verified,{timeoutMs:1}),/content_decode_timeout/);
 const first=decodeVerifiedPayload(verified);
 const controller=new AbortController(),queued=decodeVerifiedPayload(verified,{signal:controller.signal});
 controller.abort(new Error('fixture_aborted'));
 await assert.rejects(queued,/fixture_aborted/);assert.ok((await first).body.length);
 const cancelled=AbortSignal.abort(new Error('already_aborted'));
 await assert.rejects(decodeVerifiedPayload(verified,{signal:cancelled}),/already_aborted/);
 assert.ok((await decodeVerifiedPayload(verified)).body.length);
});
test('verification failure blocks rendering; encoded bytes without a decoded marker are never served as HTML',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-compression-tamper-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new VerifiedContentStore(dir),{data,verified}=await signed('<h1 id="unsafe">NEVER DISPLAY</h1>','gzip');
 const changed=Buffer.from(data.getRaw());changed[changed.length-1]^=1;
 await assert.rejects(store.put(data.id,changed),/signature_invalid/);assert.equal(store.has(data.id),false);
 // A malicious disk change must also fail the read-time signature check.
 fs.writeFileSync(store.file(data.id),changed);
 await assert.rejects(resolveArweaveResource('https://arweave.net/raw/'+data.id,{contentStore:store,localOnly:true}),/signature_invalid/);
 assert.throws(()=>contentResponse({body:verified.payload,contentType:'text/html',contentEncoding:'gzip',meta:{contentSignatureVerified:true}},new Request('ar://fixture/')),/content_decoding_required/);
 const view=await decodeVerifiedPayload(verified);
 assert.throws(()=>contentResponse({...view,contentType:'text/html',meta:{contentSignatureVerified:false}},new Request('ar://fixture/')),/unverified_content_rejected/);
 const second=await decodeVerifiedPayload(verified);assert.deepEqual(second.body,view.body);assert.deepEqual(verified.payload,data.rawData);
});
test('concurrent decode queue is bounded and cancelling active work frees the worker for later reads',async()=>{
 const {verified}=await signed('queued compressed content','gzip');
 const controller=new AbortController();
 const jobs=Array.from({length:18},()=>decodeVerifiedPayload(verified,{signal:controller.signal}));
 const settled=Promise.allSettled(jobs);
 controller.abort(new Error('bounded_queue_cancel'));
 const outcomes=await settled;
 assert.equal(outcomes.filter(row=>row.status==='rejected'&&row.reason.message==='content_decode_busy').length,1);
 assert.equal(outcomes.filter(row=>row.status==='rejected'&&row.reason.message==='bounded_queue_cancel').length,17);
 assert.equal((await decodeVerifiedPayload(verified)).body.toString(),'queued compressed content');
});
