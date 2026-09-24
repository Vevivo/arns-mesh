import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {signDataItem} from '@ardrive/turbo-upload';
import {requestIpJson} from '../src/ip-transport.mjs';
import {RawLedgerDiscovery} from '../src/raw-ledger-discovery.mjs';
import {LocationIndex} from '../src/location-index.mjs';
import {networkAuditSnapshot} from '../src/network-audit.mjs';
import {NavigationProgress} from '../apps/helper/progress.mjs';
import {fetchDataItemDirect} from '../src/arweave-direct.mjs';

test('domain, TLS, gateway routes and unrestricted fetch are rejected before connection',async()=>{
 assert.throws(()=>http.get('http://example.com/info'),/domain_forbidden/);
 assert.throws(()=>https.get('https://127.0.0.1/info'),/tls_forbidden/);
 assert.throws(()=>http.get('http://192.0.2.1:1984/graphql'),/gateway_route_forbidden/);
 assert.throws(()=>http.get({host:'192.0.2.1',port:1984,path:'/info',headers:{Host:'gateway.example'}}),/host_header_override/);
 assert.throws(()=>dns.lookup('example.com',()=>{}),/dns_forbidden/);
 await assert.rejects(fetch('https://example.com'),/unrestricted_fetch/);
 const value=await dns.promises.lookup('127.0.0.1');assert.equal(value.address,'127.0.0.1');
 assert.ok(networkAuditSnapshot().blocked>=6);
});
test('IP transport refuses redirects instead of following a gateway',async()=>{
 let followups=0;const server=http.createServer((req,res)=>{followups++;res.writeHead(302,{location:'https://example.com/'});res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(requestIpJson({host:'127.0.0.1',port:server.address().port,path:'/info'}),/HTTP 302/);assert.equal(followups,1);}finally{await new Promise(r=>server.close(r));}
});
test('unknown bundle is found from a block, failures survive restart, and bytes are separately verified',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-ledger-'));
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const item=signDataItem(key,{data:Buffer.from('previously unknown content'),tags:[{name:'Content-Type',value:'text/plain'}]});
 const root=crypto.randomBytes(32).toString('base64url');const header=Buffer.alloc(96);header.writeBigUInt64LE(1n,0);header.writeBigUInt64LE(BigInt(item.binary.length),32);Buffer.from(item.idB64Url,'base64url').copy(header,64);
 const bundle=Buffer.concat([header,item.binary]);let unavailable=true;
 const server=http.createServer((req,res)=>{let value;const tags=[['Bundle-Format','binary'],['Bundle-Version','2.0.0']].map(([n,v])=>({name:Buffer.from(n).toString('base64url'),value:Buffer.from(v).toString('base64url')}));
  if(req.url==='/info')value={network:'arweave.N.1',height:12};
  else if(req.url==='/block/height/10')value={height:10,txs:[root]};
  else if(req.url===`/tx/${root}`){if(unavailable){res.writeHead(503);res.end('{}');return;}value={id:root,tags};}
  else if(req.url===`/tx/${root}/offset`)value={offset:bundle.length-1,size:bundle.length};
  else if(req.url.startsWith('/chunk/'))value={chunk:bundle.toString('base64url'),absolute_end_offset:bundle.length-1,chunk_size:bundle.length};
  else if(req.url.startsWith('/block/height/'))value={height:Number(req.url.split('/').at(-1)),txs:[]};
  else{res.writeHead(404);res.end('{}');return;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const locationsFile=path.join(dir,'locations.json'),peersFile=path.join(dir,'peers.json'),stateFile=path.join(dir,'state.json');fs.writeFileSync(locationsFile,'{}');fs.writeFileSync(peersFile,JSON.stringify([{host:'127.0.0.1',port:server.address().port}]));
  const config={locationsFile,peersFile,stateFile,maxTransactions:1};
  const first=new RawLedgerDiscovery(config);await first.pass();assert.equal(first.status().retryCount,1);assert.equal(new LocationIndex(locationsFile).get(item.idB64Url),null);
  unavailable=false;const second=new RawLedgerDiscovery(config);await second.pass();assert.equal(second.status().retryCount,0);
  const location=new LocationIndex(locationsFile).get(item.idB64Url);assert.equal(location.rootTxId,root);assert.equal(location.rootOffset,96);
  const actual=await fetchDataItemDirect({dataId:item.idB64Url,location,seedsFile:peersFile,maxPeers:1});assert.equal(actual.payload.toString(),'previously unknown content');
  assert.equal(second.status().allHistoryCovered,false);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('progress is based on completed stages and byte events, never elapsed-time percentages',()=>{
 const p=new NavigationProgress();p.event({stage:'name',status:'done'});p.event({stage:'download',status:'active',received:128,total:1024});const s=p.snapshot();assert.equal(s.completed,1);assert.equal(s.detail.received,128);assert.equal(s.stages.find(x=>x.id==='download').status,'active');p.fail();assert.equal(p.snapshot().stages.find(x=>x.id==='download').status,'error');
});

test('daily crawl quota survives process restart and resets on a new UTC day',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-quota-'));
 try{
  const config={locationsFile:path.join(dir,'locations.json'),peersFile:path.join(dir,'peers.json'),stateFile:path.join(dir,'state.json'),dailyBudgetBytes:1024};
  fs.writeFileSync(config.locationsFile,'{}');fs.writeFileSync(config.peersFile,'[]');
  const first=new RawLedgerDiscovery(config);first.state.quotaBytes=1024;first.save();
  const second=new RawLedgerDiscovery(config);await second.pass();assert.equal(second.status().phase,'daily-budget-reached');assert.equal(second.status().quotaBytes,1024);
  second.state.quotaDay='2000-01-01';await second.pass();assert.equal(second.status().quotaBytes,0);assert.notEqual(second.status().phase,'daily-budget-reached');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
