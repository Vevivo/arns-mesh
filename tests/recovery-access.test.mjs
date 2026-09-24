import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {NameSnapshotStore,resolveSavedName} from '../src/name-snapshots.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {SitePinner} from '../src/site-pinner.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer,queryDirectPeer,parsePeerAddresses} from '../src/direct-peer.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {resolveArUrl} from '../apps/helper/core-adapter.mjs';
import {firstVerified} from '../src/content-fetcher.mjs';
import {networkAuditSnapshot} from '../src/network-audit.mjs';

const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-recovery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const snapshot=(name='alpha',extra={})=>({schema:'arns-mesh-name-snapshot/v1',name,txId:'A'.repeat(43),antId:'B'.repeat(43),observedAt:new Date(Date.now()-86400000).toISOString(),slot:123,ttlSeconds:60,...extra});
const identity=peer=>{const keys=crypto.generateKeyPairSync('ed25519');peer.identity={publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'})};peer.witnessPeerId=peerIdFromPublicKey(peer.identity.publicKeyPem);};

test('saved names preserve original time, reject rollback/conflicts and recheck revoked trust',async t=>{
 const store=new NameSnapshotStore(path.join(temp(t),'names.json'));const row=snapshot();store.put(row,{kind:'local-rpc'});
 assert.equal((await resolveSavedName('alpha',{store,client:{snapshot(){throw new Error('network must not run');}}})).observedAt,row.observedAt);
 assert.throws(()=>store.put(snapshot('alpha',{slot:122}),{kind:'local-rpc'}),/rollback/);
 assert.throws(()=>store.put(snapshot('alpha',{txId:'C'.repeat(43)}),{kind:'local-rpc'}),/conflict/);
 const id='d'.repeat(64);store.put(snapshot('beta'),{kind:'trusted-peer',witnessPeerId:id});
 assert.equal((await resolveSavedName('beta',{store,trustedPeers:[id]})).name,'beta');
 await assert.rejects(resolveSavedName('beta',{store,trustedPeers:[]}),/saved_name_unavailable/);
 assert.equal(store.exportLocal('beta'),null);
 const restarted=new NameSnapshotStore(store.file);assert.equal(restarted.exportLocal('alpha').observedAt,row.observedAt);
 const controller=new AbortController();
 await assert.rejects(resolveSavedName('gamma',{store,trustedPeers:[id],signal:controller.signal,client:{async snapshot(name,{signal}){assert.equal(signal,controller.signal);controller.abort(new Error('settings_changed'));return {record:snapshot(name),providers:[{witnessPeerId:id}]};}}}),/settings_changed/);
 assert.equal(store.get('gamma'),null);
});

test('fast successful content cancels losing work and external cancellation terminates the race',async()=>{
 let cancelled=false;
 const slow=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{cancelled=true;reject(signal.reason);},{once:true}));
 assert.equal(await firstVerified([slow,async()=>42]),42);assert.equal(cancelled,true);
 const controller=new AbortController();const pending=firstVerified([slow],{signal:controller.signal});controller.abort(new Error('stop-now'));
 await assert.rejects(pending,/stop-now/);
});

test('pinned signed files survive pruning and restart, and budget failure preserves existing pins',async t=>{
 const dir=temp(t),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const make=async text=>{const item=createData(text,signer,{tags:[]});await item.sign(signer);return item;};
 const a=await make('keep'),b=await make('evict'),store=new VerifiedContentStore(dir,{maxBytes:600,maxPinnedBytes:a.getRaw().length});
 await store.put(a.id,a.getRaw());await store.pin(a.id,'alpha');await store.put(b.id,b.getRaw());
 await assert.rejects(store.pin(b.id,'beta'),/pin_budget/);
 store.maxBytes=0;store.prune();assert.ok(store.get(a.id));assert.equal(store.get(b.id),null);
 const restarted=new VerifiedContentStore(dir,{maxBytes:0});restarted.prune();assert.ok(restarted.get(a.id));restarted.unpin('alpha');assert.equal(restarted.get(a.id),null);
});

test('direct IP replication serves a fresh client after the original peer stops, with no RPC or DNS',async t=>{
 const dir=temp(t),empty=path.join(dir,'empty.json');fs.writeFileSync(empty,'[]');
 const variables=['ARWEAVE_PEERS','ARWEAVE_PEER_SEEDS','ARNS_LOCATIONS','HYPER_BOOTSTRAP','HYPER_PEER_CACHE','ARNS_IP_PEERS','SOLANA_RPC_SEEDS'];const previous=Object.fromEntries(variables.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{ARWEAVE_PEERS:empty,ARWEAVE_PEER_SEEDS:empty,ARNS_LOCATIONS:path.join(dir,'locations.json'),HYPER_BOOTSTRAP:empty,HYPER_PEER_CACHE:path.join(dir,'learned.json'),ARNS_IP_PEERS:path.join(dir,'direct.json'),SOLANA_RPC_SEEDS:path.join(dir,'MUST-NOT-READ.json')});
 t.after(()=>{for(const key of variables)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];});
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const make=async(data,type)=>{const item=createData(data,signer,{tags:[{name:'Content-Type',value:type}]});await item.sign(signer);return item;};
 const html=await make('<!doctype html><link rel="stylesheet" href="style.css"><h1>Recovery transfer</h1>','text/html');
 const css=await make('h1 { color: purple }','text/css');
 const root=await make(JSON.stringify({manifest:'arweave/paths',version:'0.1.0',index:{path:'index.html'},paths:{'index.html':{id:html.id},'style.css':{id:css.id}}}),'application/x.arweave-manifest+json');
 const record=snapshot('alpha',{txId:root.id});
 const namesA=new NameSnapshotStore(path.join(dir,'a-names.json'));namesA.put(record,{kind:'local-rpc'});
 const a=new MeshPeer({dataDir:path.join(dir,'a'),snapshotStore:namesA});identity(a);
 for(const item of [root,html,css])await a.contentStore.put(item.id,item.getRaw());
 let serverA=await startDirectPeerServer(a,{host:'127.0.0.1',port:0});
 const namesB=new NameSnapshotStore(path.join(dir,'b-names.json'));
 // Both providers independently have the same controlled name observation.
 // This fixture is not evidence of Solana account inclusion or live ArNS access.
 namesB.put(record,{kind:'local-rpc'});
 const b=new MeshPeer({dataDir:path.join(dir,'b'),snapshotStore:namesB});identity(b);
 let serverB;
 try{
  fs.writeFileSync(process.env.ARNS_IP_PEERS,JSON.stringify(['127.0.0.1:'+serverA.address.port]));
  const pinner=new SitePinner({file:path.join(dir,'sites.json'),snapshots:namesB,contentStore:b.contentStore});
  const pinned=await pinner.start('alpha');assert.equal(pinned.status,'manifest-saved');assert.equal(pinned.saved,3);assert.equal(pinned.failed,0);
  const addressA='127.0.0.1:'+serverA.address.port;await serverA.close();serverA=null;
  serverB=await startDirectPeerServer(b,{host:'127.0.0.1',port:0});
  fs.writeFileSync(process.env.ARNS_IP_PEERS,JSON.stringify([addressA,'127.0.0.1:'+serverB.address.port]));
  const freshNames=new NameSnapshotStore(path.join(dir,'fresh-names.json')),freshStore=new VerifiedContentStore(path.join(dir,'fresh-content'));
  assert.deepEqual(freshNames.names(),[]);assert.equal(freshStore.stats().files.length,0);
  const options={contentStore:freshStore,snapshotStore:freshNames,accessPolicy:'saved',trustedPeers:[b.witnessPeerId]};
  const page=await resolveArUrl('ar://alpha/',options),style=await resolveArUrl('ar://alpha/style.css',options);
  assert.equal(page.body.toString(),html.rawData.toString());assert.equal(style.body.toString(),css.rawData.toString());
  assert.equal(page.meta.contentSignatureVerified,true);assert.equal(page.meta.recovery.rpcUsed,false);assert.equal(page.meta.verification.currentStateVerified,false);assert.equal(page.meta.recovery.observedAt,record.observedAt);assert.equal(page.peerPayload,null);
  assert.ok(b.contentBytesServed>0);assert.equal(a.directAddress,null);
  const audit=networkAuditSnapshot();assert.equal(audit.events.filter(e=>e.purpose==='solana-rpc').length,0);assert.equal(audit.events.filter(e=>/dns/i.test(e.reason||'')).length,0);
  const unknown=new NameSnapshotStore(path.join(dir,'unknown.json'));
  await assert.rejects(resolveArUrl('ar://alpha/',{...options,snapshotStore:unknown,trustedPeers:['0'.repeat(64)]}));
  assert.deepEqual(unknown.names(),[]);
  // Corrupt an already cached content item: a local read must reverify, and a
  // sender's envelope/hash must not make bad content acceptable.
  const corrupted=Buffer.from(css.getRaw());corrupted[corrupted.length-1]^=1;
  fs.writeFileSync(b.contentStore.file(css.id),corrupted);
  fs.unlinkSync(freshStore.file(css.id));
  const c=new MeshPeer({dataDir:path.join(dir,'c')});identity(c);await c.contentStore.put(css.id,css.getRaw());
  const serverC=await startDirectPeerServer(c,{host:'127.0.0.1',port:0});
  try{
   fs.writeFileSync(process.env.ARNS_IP_PEERS,JSON.stringify(['127.0.0.1:'+serverB.address.port,'127.0.0.1:'+serverC.address.port]));
   assert.equal((await resolveArUrl('ar://alpha/style.css',options)).body.toString(),css.rawData.toString());
  }finally{await serverC.close();}
  fs.writeFileSync(process.env.ARNS_IP_PEERS,JSON.stringify(['127.0.0.1:'+serverB.address.port]));
  fs.unlinkSync(freshStore.file(css.id));
  await assert.rejects(resolveArUrl('ar://alpha/style.css',options),/content_location_unavailable/);
 }finally{if(serverA)await serverA.close();if(serverB)await serverB.close();}
});

test('direct peer addresses reject domain names, unsafe ports and oversized lists',()=>{
 assert.throws(()=>parsePeerAddresses('example.com:49740'));
 assert.throws(()=>parsePeerAddresses('127.0.0.1:0'));
 assert.throws(()=>parsePeerAddresses(Array(17).fill('127.0.0.1:49740')));
 assert.deepEqual(parsePeerAddresses('[::1]:49740'),[{host:'::1',port:49740}]);
});
