import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {requestIpJson} from '../src/ip-transport.mjs';
import {recoverFromBundle} from '../src/recover-bundle.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {LocationIndex} from '../src/location-index.mjs';
import {signDataItem} from '@ardrive/turbo-upload';

test('a transfer budget callback rejects the request without crashing the process',async()=>{
 const server=http.createServer((_q,r)=>r.end('{"large":"data"}'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(requestIpJson({host:'127.0.0.1',port:server.address().port,path:'/info',onBytes:()=>{throw new Error('test_budget_reached');}}),/test_budget_reached/);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('a publisher bundle ID recovers a signed nested item over IP and corrupt bytes never enter the cache',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-recovery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const item=signDataItem(key,{data:Buffer.from('nested recovery'),tags:[{name:'Content-Type',value:'text/plain'}]});
 const bundle=item=>{const h=Buffer.alloc(96);h.writeBigUInt64LE(1n);h.writeBigUInt64LE(BigInt(item.binary.length),32);Buffer.from(item.idB64Url,'base64url').copy(h,64);return Buffer.concat([h,item.binary]);};
 const parent=signDataItem(key,{data:bundle(item),tags:[{name:'Bundle-Format',value:'binary'},{name:'Bundle-Version',value:'2.0.0'}]});
 const body=bundle(parent),root=crypto.randomBytes(32).toString('base64url');let corrupted=false;
 const server=http.createServer((req,res)=>{
  let data;if(req.url==='/info')data={network:'arweave.N.1',height:123};else if(req.url==='/peers')data=[];
  else if(req.url===`/tx/${root}/offset`)data={offset:body.length,size:body.length};
  else if(req.url.startsWith('/chunk/')){const b=Buffer.from(body);if(corrupted)b[b.length-1]^=1;data={chunk:b.toString('base64url'),chunk_size:b.length,absolute_end_offset:b.length};}
  else{res.writeHead(404);res.end('{}');return;}res.end(JSON.stringify(data));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const peersFile=path.join(dir,'peers.json');fs.writeFileSync(peersFile,JSON.stringify([{host:'127.0.0.1',port:server.address().port}]));
 const store=new VerifiedContentStore(path.join(dir,'content')),locationsFile=path.join(dir,'locations.json');
 const result=await recoverFromBundle({rootTxId:root,dataId:item.idB64Url,locationsFile,contentStore:store,peersFile});
 assert.equal(result.signatureVerified,true);assert.ok(store.get(item.idB64Url));assert.deepEqual(new LocationIndex(locationsFile).get(item.idB64Url).path,[parent.idB64Url]);
 corrupted=true;const otherStore=new VerifiedContentStore(path.join(dir,'bad-content'));
 // The same root uses a shared immutable chunk cache, so use a distinct root ID
 // for a truly independent corrupt source response.
 const badRoot=crypto.randomBytes(32).toString('base64url');
 server.removeAllListeners('request');server.on('request',(req,res)=>{let data;if(req.url==='/info')data={network:'arweave.N.1',height:123};else if(req.url==='/peers')data=[];else if(req.url===`/tx/${badRoot}/offset`)data={offset:body.length,size:body.length};else if(req.url.startsWith('/chunk/')){const b=Buffer.from(body);b[b.length-1]^=1;data={chunk:b.toString('base64url'),chunk_size:b.length,absolute_end_offset:b.length};}else{res.writeHead(404);res.end('{}');return;}res.end(JSON.stringify(data));});
 await assert.rejects(recoverFromBundle({rootTxId:badRoot,dataId:item.idB64Url,locationsFile,contentStore:otherStore,peersFile}));assert.equal(otherStore.get(item.idB64Url),null);
});
