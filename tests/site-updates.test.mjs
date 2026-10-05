import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {SitePinner} from '../src/site-pinner.mjs';
import {VerifiedContentStore,verifyStoredContent} from '../src/content-store.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';
import {resolveWithRecovery} from '../src/resilient-access.mjs';
import {writeOperatorStatus,startOperatorDashboard} from '../src/operator-status.mjs';
import http from 'node:http';
import net from 'node:net';

async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-site-update-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=async(body,type='text/html')=>{const d=createData(body,signer,{tags:[{name:'Content-Type',value:type}]});await d.sign(signer);return d;};
 const a=await item('<h1>old complete version</h1>'),b=await item('<h1>new complete version</h1>');
 const root=await item(JSON.stringify({manifest:'arweave/paths',version:'0.1.0',index:{path:'index.html'},paths:{'index.html':{id:b.id}}}),'application/x.arweave-manifest+json');
 const store=new VerifiedContentStore(path.join(dir,'content')),names=new NameSnapshotStore(path.join(dir,'names.json'));
 const observe=(id,slot)=>names.put({schema:'arns-mesh-name-snapshot/v1',name:'update',txId:id,antId:'B'.repeat(43),observedAt:new Date().toISOString(),slot,ttlSeconds:1},{kind:'local-rpc'});
 const source=new Map([[a.id,a.getRaw()],[root.id,root.getRaw()]]);
 const fetchContent=async id=>{let raw=store.get(id);if(!raw){raw=source.get(id);if(!raw)throw new Error('content_location_unavailable');await store.put(id,raw);}return {direct:await verifyStoredContent(raw,id)};};
 const options={file:path.join(dir,'sites.json'),snapshots:names,contentStore:store,fetchContent,createClient:()=>({setName(){},async stop(){}})};
 return {dir,a,b,root,store,names,observe,source,options};
}
test('failed updates and restarts retain the previous complete version; success replaces its pins',async t=>{
 const f=await fixture(t);let pinner=new SitePinner(f.options);f.observe(f.a.id,1);await pinner.start('update');
 assert.equal(pinner.readySnapshot('update').txId,f.a.id);
 f.observe(f.root.id,2);const failed=await pinner.start('update');assert.equal(failed.status,'partial');assert.equal(pinner.rows.update.rootDataId,f.a.id);assert.equal(pinner.rows.update.update.rootDataId,f.root.id);
 f.store.maxBytes=0;f.store.prune();assert.ok(f.store.has(f.a.id));assert.equal(pinner.readySnapshot('update').txId,f.a.id);
 pinner=new SitePinner(f.options);assert.equal(pinner.readySnapshot('update').txId,f.a.id);
 f.store.maxBytes=100000;f.source.set(f.b.id,f.b.getRaw());const ready=await pinner.start('update');assert.equal(ready.status,'manifest-saved');assert.equal(pinner.readySnapshot('update').txId,f.root.id);
 f.store.maxBytes=0;f.store.prune();assert.equal(f.store.has(f.a.id),false);assert.ok(f.store.has(f.root.id));assert.ok(f.store.has(f.b.id));assert.equal(f.store.pinStats().files,2);
 pinner.remove('update');assert.equal(f.store.pinStats().files,0);assert.equal(f.store.stats().files.length,0);
});
test('disk failure at version publication never unpins the previously published files',async t=>{
 const f=await fixture(t),pinner=new SitePinner(f.options);f.observe(f.a.id,1);await pinner.start('update');f.observe(f.root.id,2);f.source.set(f.b.id,f.b.getRaw());
 const save=pinner.save.bind(pinner);pinner.save=()=>{if(pinner.rows.update.rootDataId===f.root.id&&pinner.isReady(pinner.rows.update))throw new Error('disk_failure');save();};
 await assert.rejects(pinner.start('update'),/disk_failure/);f.store.maxBytes=0;f.store.prune();assert.ok(f.store.has(f.a.id));
 assert.equal(new SitePinner(f.options).readySnapshot('update').txId,f.a.id);
});
test('strict Mesh-only content asks for cached bytes and never consults raw/index alternatives',async t=>{
 const f=await fixture(t);let requests=0;
 const client={content:async(id,options)=>{assert.equal(options.cacheOnly,true);requests++;return verifyStoredContent(f.a.getRaw(),id);},locateCandidates(){throw new Error('must not use index');}};
 const r=await fetchMeshContent(f.a.id,{client,contentStore:f.store,contentSources:'mesh-only',locationsFile:'/this-path-must-not-be-read'});assert.equal(r.direct.payload.toString(),'<h1>old complete version</h1>');assert.equal(requests,1);
 client.content=async()=>{throw new Error('missing');};await assert.rejects(fetchMeshContent(f.b.id,{client,contentSources:'mesh-only'}),/content_location_unavailable/);
});
test('unavailable latest content reports its target when a prepared historical version is used',async()=>{
 const result=await resolveWithRecovery({live:async()=>{const e=new Error('content_location_unavailable');e.diagnostics={nameResolution:{rootDataId:'new'}};throw e;},saved:()=>{throw new Error('must not resolve a second live mapping');},prepared:async()=>({recovery:{observedAt:'2026-01-01T00:00:00Z'},verification:{currentStateVerified:false}})});
 assert.equal(result.recovery.reason,'current-content-unavailable');assert.equal(result.recovery.latestTargetId,'new');assert.equal(result.recovery.automatic,true);
});
test('operator dashboard is loopback-only, read-only, and rejects cross-origin requests',async t=>{
 const f=await fixture(t);writeOperatorStatus(f.dir,{retainedNames:7});const server=await startOperatorDashboard({dataDir:f.dir,port:0});
 const read=(route,headers={})=>new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:server.address.port,path:route,headers},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);});
 try{assert.equal(server.address.address,'127.0.0.1');assert.equal(JSON.parse((await read('/status')).text).retainedNames,7);assert.match((await read('/')).text,/SERVICE PROVIDER/);assert.equal((await read('/status',{Origin:'https://example.com'})).status,403);const hostile=await new Promise((resolve,reject)=>{const socket=net.connect(server.address.port,'127.0.0.1',()=>socket.write('GET /status HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'));let body='';socket.on('data',b=>body+=b);socket.on('end',()=>resolve(body));socket.on('error',reject);});assert.match(hostile,/^HTTP\/1.1 403/);assert.equal((await read('/../identity.json')).status,404);}finally{await server.close();}
});
