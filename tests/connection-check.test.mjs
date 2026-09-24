import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {checkConnections} from '../apps/helper/connection-check.mjs';

test('connection checks use bounded cache-only requests and identify protocol failures',async()=>{
 const seen=[];let active=0,peak=0;
 const server=http.createServer(async(req,res)=>{
  active++;peak=Math.max(peak,active);let body='';for await(const part of req)body+=part;
  seen.push({method:req.method,path:req.url,body:body?JSON.parse(body):null});
  await new Promise(r=>setTimeout(r,20));active--;
  res.setHeader('content-type','application/json');
  if(req.url==='/mesh/v1/query')res.end(JSON.stringify({ok:false,error:'location_not_found'}));
  else if(req.url==='/info')res.end(JSON.stringify({network:'arweave.N.1'}));
  else res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:{'solana-core':'test'}}));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const address='127.0.0.1:'+server.address().port;
  const rows=await checkConnections({directPeers:[address],rpcSources:[address],arweavePeers:[address]});
  assert.equal(rows.length,3);assert.ok(rows.every(r=>r.status==='responded'));assert.ok(peak<=2);
  assert.deepEqual(seen.find(r=>r.path==='/mesh/v1/query').body,{op:'location',dataId:'A'.repeat(43),cacheOnly:true});
  assert.equal(seen.find(r=>r.path==='/').body.method,'getVersion');
  server.removeAllListeners('request');server.on('request',(_req,res)=>res.end(JSON.stringify({wrong:'protocol'})));
  assert.equal((await checkConnections({directPeers:[address],rpcSources:[],arweavePeers:[]}))[0].status,'unavailable');
  server.removeAllListeners('request');server.on('request',(_req,res)=>res.end(' '.repeat(33000)));
  const oversize=(await checkConnections({directPeers:[address],rpcSources:[],arweavePeers:[]}))[0];
  assert.equal(oversize.status,'unavailable');assert.match(oversize.error,/response_too_large/);
  const count=seen.length,controller=new AbortController();controller.abort();
  const stopped=await checkConnections({directPeers:[address],rpcSources:[],arweavePeers:[]},{signal:controller.signal});
  assert.equal(stopped[0].status,'unavailable');assert.equal(seen.length,count);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
