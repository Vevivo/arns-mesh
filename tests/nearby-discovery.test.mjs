import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {discoverNearbyLocations} from '../src/nearby-discovery.mjs';
import {fetchDataItemDirect} from '../src/arweave-direct.mjs';
import {RelatedResources} from '../apps/helper/related-resources.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {saveDiscoveredLocations} from '../src/discovery-store.mjs';

test('native block search finds a requested sibling location, while only full signature verification accepts bytes',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-nearby-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex')),item=createData('real signed fixture',signer,{tags:[{name:'Content-Type',value:'text/plain'}]});await item.sign(signer);
 const header=Buffer.alloc(96);header.writeBigUInt64LE(1n);header.writeBigUInt64LE(BigInt(item.getRaw().length),32);Buffer.from(item.id,'base64url').copy(header,64);
 let bundle=Buffer.concat([header,item.getRaw()]);const root='R'.repeat(43),offset=500000,seen=[];
 const server=http.createServer((req,res)=>{
  seen.push(req.url);res.setHeader('content-type','application/json');let value;
  if(req.url==='/info')value={network:'arweave.N.1',height:4};
  else if(req.url==='/peers')value=[];
  else if(/^\/block\/height\/[0-4]$/.test(req.url)){const height=Number(req.url.split('/').at(-1));value={height,weave_size:height*400000,txs:height===2?[root]:[]};}
  else if(req.url==='/tx/'+root)value={id:root,tags:[{name:Buffer.from('Bundle-Format').toString('base64url'),value:Buffer.from('binary').toString('base64url')},{name:Buffer.from('Bundle-Version').toString('base64url'),value:Buffer.from('2.0.0').toString('base64url')}]};
  else if(req.url==='/tx/'+root+'/offset')value={offset:offset+bundle.length,size:bundle.length};
  else if(/^\/chunk\/\d+$/.test(req.url)){const at=Number(req.url.split('/').at(-1));if(at>offset&&at<=offset+bundle.length)value={chunk:bundle.toString('base64url'),chunk_size:bundle.length,absolute_end_offset:offset+bundle.length};}
  if(!value){res.writeHead(404);value={};}res.end(JSON.stringify(value));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const peers=path.join(dir,'peers.json');fs.writeFileSync(peers,JSON.stringify([{host:'127.0.0.1',port:server.address().port}]));
 const old=process.env.ARWEAVE_PEER_SEEDS;process.env.ARWEAVE_PEER_SEEDS=peers;t.after(()=>{if(old===undefined)delete process.env.ARWEAVE_PEER_SEEDS;else process.env.ARWEAVE_PEER_SEEDS=old;});
 const anchor={dataId:'A'.repeat(43),weaveOffset:1200000,itemSize:1000},found=[];
 const result=await discoverNearbyLocations(anchor,[item.id],{seedsFile:peers,onFound:h=>found.push(h)});
 assert.equal(result.anchorHeight,4);assert.equal(found.length,1);assert.equal(found[0].weaveOffset,offset+96);assert.equal(found[0].itemSize,item.getRaw().length);
 const verified=await fetchDataItemDirect({dataId:item.id,location:found[0],seedsFile:peers,chunkCache:new Map()});assert.equal(verified.payload.toString(),'real signed fixture');
 bundle[bundle.length-1]^=1;await assert.rejects(fetchDataItemDirect({dataId:item.id,location:found[0],seedsFile:peers,chunkCache:new Map()}),/signature_invalid/);
 await assert.rejects(discoverNearbyLocations(anchor,[item.id],{seedsFile:peers,maxBytes:1}),/byte_budget/);
 const before=seen.length;await assert.rejects(discoverNearbyLocations(anchor,[item.id],{seedsFile:peers,signal:AbortSignal.abort(new Error('navigation changed'))}),/navigation changed/);assert.equal(seen.length,before);
});

test('related discovery shares one scan, persists a quota reservation, and rejects corrupt anchor bytes before discovery',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-related-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex')),page=createData('<h1>Parent</h1>',signer);await page.sign(signer);
 const contentStore=new VerifiedContentStore(path.join(dir,'content'));await contentStore.put(page.id,page.getRaw());
 const locationsFile=path.join(dir,'locations.json'),file=path.join(dir,'quota.json');saveDiscoveredLocations(locationsFile,[[page.id,{weaveOffset:1000,itemSize:page.getRaw().length}]]);
 let calls=0;const discover=async(_anchor,ids,{onFound,signal})=>{calls++;await new Promise(r=>setTimeout(r,10));signal.throwIfAborted();onFound({dataId:ids[0],weaveOffset:2000,itemSize:200});return {matches:ids};};
 const related=new RelatedResources({file,contentStore,locationsFile,discover}),client={locateCandidates(){throw new Error('existing anchor must not query peers');}},id='B'.repeat(43);
 await Promise.all([related.find(page.id,[id],{client}),related.find(page.id,[id],{client})]);assert.equal(calls,1);assert.equal(JSON.parse(fs.readFileSync(file)).reserved,96*1024*1024);
 const corrupt=Buffer.from(page.getRaw());corrupt[corrupt.length-1]^=1;fs.writeFileSync(contentStore.file(page.id),corrupt);
 await assert.rejects(new RelatedResources({file,contentStore,locationsFile,discover}).find(page.id,[id],{client}),/signature_invalid/);assert.equal(calls,1);
 await contentStore.put(page.id,page.getRaw());fs.writeFileSync(file,JSON.stringify({day:new Date().toISOString().slice(0,10),reserved:256*1024*1024}));
 await assert.rejects(new RelatedResources({file,contentStore,locationsFile,discover}).find(page.id,[id],{client}),/daily_budget/);assert.equal(calls,1);
});
