import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {signDataItem} from '@ardrive/turbo-upload';
import {LocationIndex} from '../src/location-index.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';
const snapshot=rows=>({schema:'wayfinder-prepared-locations/v1',preparedAt:'2026-09-23T10:00:00Z',origin:{kind:'external-index-preparation',provider:'https://arweave.net/graphql'},rows});
const bundle=items=>{const h=Buffer.alloc(32+64*items.length);h.writeBigUInt64LE(BigInt(items.length));items.forEach((x,i)=>{h.writeBigUInt64LE(BigInt(x.binary.length),32+64*i);Buffer.from(x.idB64Url,'base64url').copy(h,64+64*i);});return Buffer.concat([h,...items.map(x=>x.binary)]);};

test('prepared hints retain external provenance and invalid replacement is never a positive lookup',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-index-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const id='A'.repeat(43),root='B'.repeat(43),preparedFile=path.join(dir,'prepared.json');
 fs.writeFileSync(preparedFile,JSON.stringify(snapshot({[id]:{rootTxId:root}})));
 const index=new LocationIndex(path.join(dir,'local.json'),{preparedFile});
 assert.equal(index.get(id).rootTxId,root);assert.equal(index.get(id).preparation.provider,'arweave-graphql');
 fs.writeFileSync(preparedFile,JSON.stringify(snapshot({[id]:{rootTxId:root,preparation:{kind:'external-index-preparation',provider:'turbo-offsets',at:'2026-09-23T11:00:00Z'}}})));
 assert.equal(index.get(id).preparation.provider,'turbo-offsets','merged snapshots retain each row source');
 fs.writeFileSync(preparedFile,JSON.stringify(snapshot({[id]:{rootTxId:'not an ID'}})));assert.equal(index.get(id),null);
 fs.writeFileSync(preparedFile,'{broken');assert.equal(index.get(id),null);
});

for(const nested of [false,true])test(`prepared ${nested?'nested':'flat'} manifest derives only its own child locations and verifies their bytes`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-nested-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const html=signDataItem(key,{data:Buffer.from('signed HTML child'),tags:[{name:'Content-Type',value:'text/html'}]});
 const unrelated=signDataItem(key,{data:Buffer.from('unrelated'),tags:[]});
 const manifest={manifest:'arweave/paths',version:'0.1.0',index:{path:'index.html'},paths:{'index.html':{id:html.idB64Url}}};
 const leaf=signDataItem(key,{data:Buffer.from(JSON.stringify(manifest)),tags:[{name:'Content-Type',value:'application/x.arweave-manifest+json'}]});
 const inner=bundle([leaf,html,unrelated]);
 const parent=signDataItem(key,{data:inner,tags:[{name:'Bundle-Format',value:'binary'},{name:'Bundle-Version',value:'2.0.0'}]});
 const bytes=nested?bundle([parent]):inner,root=crypto.randomBytes(32).toString('base64url');
 let unrelatedL1Requests=0,metadataAvailable=true,offsetRequests=0;
 const server=http.createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/info')return res.end(JSON.stringify({network:'arweave.N.1',height:10}));
  if(req.url==='/peers')return res.end('[]');
  if(req.url===`/tx/${root}/offset`){offsetRequests++;if(!metadataAvailable){res.statusCode=404;return res.end('{}');}return res.end(JSON.stringify({offset:bytes.length-1,size:bytes.length}));}
  if(req.url.startsWith('/chunk/'))return res.end(JSON.stringify({chunk:bytes.toString('base64url'),absolute_end_offset:bytes.length-1,chunk_size:bytes.length}));
  if(req.url.startsWith('/tx/'))unrelatedL1Requests++;
  res.statusCode=404;res.end('{}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const seeds=path.join(dir,'seeds.json'),prepared=path.join(dir,'prepared.json'),local=path.join(dir,'local.json');
 fs.writeFileSync(seeds,JSON.stringify([{host:'127.0.0.1',port:server.address().port}]));
 fs.writeFileSync(prepared,JSON.stringify(snapshot({[leaf.idB64Url]:{rootTxId:root,path:nested?[parent.idB64Url]:[]}})));
 const env={ARWEAVE_PEERS:seeds,ARWEAVE_PEER_SEEDS:seeds,ARNS_PREPARED_LOCATIONS:prepared,ARNS_HISTORICAL_INDEX:'0'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const client={content:async()=>{throw new Error('empty_peer');},locateCandidates:async()=>[]};
 const result=await fetchMeshContent(leaf.idB64Url,{client,locationsFile:local,signal:AbortSignal.timeout(5000)});
 assert.deepEqual(JSON.parse(result.direct.payload),manifest);assert.equal(result.loc.record.preparation.kind,'external-index-preparation');
 const saved=new LocationIndex(local,{preparedFile:undefined});assert.equal(saved.get(leaf.idB64Url).itemSize,leaf.binary.length);assert.equal(saved.get(leaf.idB64Url).preparation.provider,'arweave-graphql');
 assert.ok(saved.get(html.idB64Url));assert.equal(saved.get(unrelated.idB64Url),null);
 assert.ok(Number.isSafeInteger(saved.get(html.idB64Url).weaveOffset));
 metadataAvailable=false;const beforeChild=offsetRequests;
 fs.rmSync(prepared); // Child location was generated from raw bundle headers.
 const child=await fetchMeshContent(html.idB64Url,{client,locationsFile:local,signal:AbortSignal.timeout(5000)});
 assert.equal(child.direct.payload.toString(),'signed HTML child');assert.equal(child.loc.record.preparation.kind,'external-index-preparation');
 assert.equal(unrelatedL1Requests,0,'a successful known bundle hint must cancel delayed L1 probes');
 assert.equal(offsetRequests,beforeChild,'child access survives loss of the transaction-metadata peer');
});
