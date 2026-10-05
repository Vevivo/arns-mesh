import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import Arweave from 'arweave';
import {getArnsRecordEncoder} from '@ar.io/solana-contracts/arns';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {MAINNET_PROGRAM_IDS,getArnsRecordPDA,getAntRecordPDA} from '@ar.io/sdk';
import {resolveArUrl} from '../apps/helper/core-adapter.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {buildArNSStateEvidence} from '../src/solana-evidence.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {encodeL1Content} from '../src/l1-content.mjs';
import {resolveWithRecovery} from '../src/resilient-access.mjs';
import {SitePinner} from '../src/site-pinner.mjs';
import {TargetCatalog} from '../src/target-catalog.mjs';

const mint='11111111111111111111111111111111';
const version={major:1,minor:0,patch:0};
const account=(owner,data)=>({owner,data:[Buffer.from(data).toString('base64'),'base64'],lamports:1,executable:false,rentEpoch:0});
async function serve(handler){const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,address:{host:'127.0.0.1',port:server.address().port},close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};}
async function rpcFixture(name,target){
 const [arns]=await getArnsRecordPDA(name),[ant]=await getAntRecordPDA(mint,'@');
 const arnsAccount=account(MAINNET_PROGRAM_IDS.arns,getArnsRecordEncoder().encode({name,nameHash:crypto.createHash('sha256').update(name).digest(),owner:mint,ant:mint,purchaseType:1,startTimestamp:1,endTimestamp:null,undernameLimit:10,purchasePrice:0,bump:255,version}));
 const antAccount=account(MAINNET_PROGRAM_IDS.ant,getAntRecordEncoder().encode({mint,undername:'@',target,targetProtocol:0,ttlSeconds:1,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version}));
 let calls=0;
 const listener=await serve((req,res)=>{let text='';req.on('data',b=>text+=b);req.on('end',()=>{calls++;const q=JSON.parse(text);let value=q.params[0]===String(arns)?arnsAccount:q.params[0]===String(ant)?antAccount:null;
  if(q.method==='getProgramAccounts')value=q.params[0]===MAINNET_PROGRAM_IDS.arns?[{pubkey:String(arns),account:arnsAccount}]:[{pubkey:String(ant),account:antAccount}];
  res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{context:{slot:100},value}}));});});
 return {...listener,arnsAccount,get calls(){return calls;}};
}
const arweave=Arweave.init({}),key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
async function item(){const tx=await arweave.createTransaction({data:Buffer.from('<h1>Controlled outage fixture</h1>'),reward:'0',last_tx:crypto.randomBytes(32).toString('base64url')},key);tx.format=1;tx.addTag('Content-Type','text/html');await arweave.transactions.sign(tx,key);return {id:tx.id,header:tx.toJSON(),raw:encodeL1Content(tx.toJSON(),Buffer.from(tx.data))};}
function env(t,dir){const keys=['ARNS_MESH_DIRECT_ONLY','ARNS_IP_PEERS','SOLANA_RPC_SEEDS','ARWEAVE_PEERS','ARWEAVE_PEER_SEEDS','ARNS_LOCATIONS','HYPER_BOOTSTRAP','HYPER_PEER_CACHE'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const name of ['rpc','raw','direct','empty'])fs.writeFileSync(path.join(dir,name+'.json'),'[]');
 Object.assign(process.env,{ARNS_MESH_DIRECT_ONLY:'1',ARNS_IP_PEERS:path.join(dir,'direct.json'),SOLANA_RPC_SEEDS:path.join(dir,'rpc.json'),ARWEAVE_PEERS:path.join(dir,'raw.json'),ARWEAVE_PEER_SEEDS:path.join(dir,'raw.json'),ARNS_LOCATIONS:path.join(dir,'locations.json'),HYPER_BOOTSTRAP:path.join(dir,'empty.json'),HYPER_PEER_CACHE:path.join(dir,'learned.json')});
 t.after(()=>{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];fs.rmSync(dir,{recursive:true,force:true});});}

test('four availability combinations use real local RPC/Arweave/Mesh transports with a fresh reader',async t=>{
 for(const [rpcOn,rawOn] of [[true,true],[true,false],[false,true],[false,false]])await t.test(`RPC ${rpcOn} / Arweave ${rawOn}`,async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-matrix-'));env(t,dir);const data=await item(),name='matrix';
  const rpc=await rpcFixture(name,data.id);let rawRequests=0;
  const raw=await serve((req,res)=>{rawRequests++;res.setHeader('content-type','application/json');if(req.url==='/info')res.end(JSON.stringify({network:'arweave.N.1',height:1}));else if(req.url==='/peers')res.end('[]');else if(req.url==='/tx/'+data.id)res.end(JSON.stringify(data.header));else{res.writeHead(404);res.end('{}');}});
  fs.writeFileSync(process.env.SOLANA_RPC_SEEDS,JSON.stringify([rpc.address]));fs.writeFileSync(process.env.ARWEAVE_PEERS,JSON.stringify([raw.address]));
  const names=new NameSnapshotStore(path.join(dir,'provider-names.json'));names.observe(await buildArNSStateEvidence(name));const before=rpc.calls;
  const provider=new MeshPeer({dataDir:path.join(dir,'provider'),snapshotStore:names,allowRemoteFetch:false});
  const keys=crypto.generateKeyPairSync('ed25519');provider.identity={publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'})};provider.witnessPeerId=peerIdFromPublicKey(provider.identity.publicKeyPem);
  if(!rawOn)await provider.contentStore.put(data.id,data.raw);
  const mesh=await startDirectPeerServer(provider,{host:'127.0.0.1',port:0});fs.writeFileSync(process.env.ARNS_IP_PEERS,JSON.stringify(['127.0.0.1:'+mesh.address.port]));
  if(!rpcOn)await rpc.close();if(!rawOn)await raw.close();
  try{
   const result=await resolveArUrl('ar://'+name,{accessPolicy:'auto',contentStore:new VerifiedContentStore(path.join(dir,'reader')),snapshotStore:new NameSnapshotStore(path.join(dir,'reader-names.json')),trustedPeers:[provider.witnessPeerId]});
   assert.match(result.body.toString(),/Controlled outage fixture/);assert.equal(result.meta.contentSignatureVerified,true);
   assert.equal(Boolean(result.meta.recovery),!rpcOn);assert.equal(rpc.calls>before,rpcOn);
   assert.equal(rawRequests>0,rawOn);if(!rpcOn){assert.equal(result.meta.recovery.automatic,true);assert.equal(result.meta.verification.currentStateVerified,false);}
  }finally{await mesh.close();if(rpcOn)await rpc.close();if(rawOn)await raw.close();}
 });
});

test('catalog persists independently rechecked registry bindings for future RPC outages',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-catalog-snapshot-'));env(t,dir);const data=await item(),rpc=await rpcFixture('catalog-check',data.id);
 try{const snapshots=new NameSnapshotStore(path.join(dir,'names.json')),catalog=new TargetCatalog({file:path.join(dir,'catalog.json'),endpoint:'http://127.0.0.1:'+rpc.address.port,snapshotStore:snapshots});
  await catalog.step();assert.equal(snapshots.exportLocal('catalog-check').txId,data.id);
  rpc.arnsAccount.owner=mint;await catalog.step();assert.match(catalog.state.errors.at(-1).error,/binding_changed/);assert.equal(snapshots.exportLocal('catalog-check').txId,data.id);
 }finally{await rpc.close();}
});

test('automatic recovery never hides verification failures or cancellation',async()=>{
 let calls=0;const saved=async()=>{calls++;return {verification:{}};};
 for(const message of ['rpc_sources_conflict','owner_mismatch','arns_lease_expired','snapshot_conflict'])await assert.rejects(resolveWithRecovery({live:async()=>{throw new Error(message);},saved,prepared:saved}),new RegExp(message));
 assert.equal(calls,0);const stop=new AbortController();stop.abort(new Error('cancelled'));await assert.rejects(resolveWithRecovery({signal:stop.signal,live:async()=>{throw Object.assign(new Error('unavailable'),{code:'NAME_SOURCE_UNAVAILABLE'});},saved,prepared:saved}),/cancelled/);assert.equal(calls,0);
});


test('a fresh reader obtains a prepared older binding from its trusted peer when live target bytes are absent',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-prepared-'));env(t,dir);const old=await item(),latest=await item(),rpc=await rpcFixture('prepared',latest.id);
 fs.writeFileSync(process.env.SOLANA_RPC_SEEDS,JSON.stringify([rpc.address]));
 const names=new NameSnapshotStore(path.join(dir,'provider-names.json'));
 names.put({schema:'arns-mesh-name-snapshot/v1',name:'prepared',txId:old.id,antId:mint,observedAt:new Date(Date.now()-60000).toISOString(),slot:99,ttlSeconds:1},{kind:'local-rpc'});
 const provider=new MeshPeer({dataDir:path.join(dir,'provider'),snapshotStore:names,allowRemoteFetch:false});
 const keys=crypto.generateKeyPairSync('ed25519');provider.identity={publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'})};provider.witnessPeerId=peerIdFromPublicKey(provider.identity.publicKeyPem);
 await provider.contentStore.put(old.id,old.raw);provider.pinner=new SitePinner({file:path.join(dir,'saved.json'),snapshots:names,contentStore:provider.contentStore});await provider.pinner.start('prepared');names.observe(await buildArNSStateEvidence('prepared'));
 const server=await startDirectPeerServer(provider,{host:'127.0.0.1',port:0});fs.writeFileSync(process.env.ARNS_IP_PEERS,JSON.stringify(['127.0.0.1:'+server.address.port]));
 try{
  const readerNames=new NameSnapshotStore(path.join(dir,'reader-names.json'));
  const result=await resolveArUrl('ar://prepared',{accessPolicy:'auto',contentSources:'mesh-only',snapshotStore:readerNames,trustedPeers:[provider.witnessPeerId],signal:AbortSignal.timeout(10000)});
  assert.equal(result.meta.dataId,old.id);assert.equal(result.meta.recovery.latestTargetId,latest.id);assert.equal(result.meta.recovery.automatic,true);assert.equal(result.meta.recovery.source,'trusted-peer');
  assert.equal(readerNames.get('prepared').txId,latest.id,'prepared binding must not overwrite the newer accepted name');
 }finally{await server.close();await rpc.close();}
});
