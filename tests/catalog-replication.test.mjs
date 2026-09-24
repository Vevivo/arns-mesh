import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {MAINNET_PROGRAM_IDS,getAntRecordPDA} from '@ar.io/sdk';
import {CatalogWorker} from '../src/catalog-worker.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';

function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-replication-'));
 const empty=path.join(dir,'empty.json');fs.writeFileSync(empty,'[]');
 const keys=['ARWEAVE_PEERS','ARWEAVE_PEER_SEEDS','HYPER_BOOTSTRAP','HYPER_PEER_CACHE','ARNS_LOCATIONS'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{ARWEAVE_PEERS:empty,ARWEAVE_PEER_SEEDS:empty,HYPER_BOOTSTRAP:empty,HYPER_PEER_CACHE:path.join(dir,'learned.json'),ARNS_LOCATIONS:path.join(dir,'locations.json')});
 t.after(()=>{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];fs.rmSync(dir,{recursive:true,force:true});});
 const peer=name=>{
  const p=new MeshPeer({dataDir:path.join(dir,name),allowRemoteFetch:false});
  const keys=crypto.generateKeyPairSync('ed25519');p.identity={publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'})};p.witnessPeerId=peerIdFromPublicKey(p.identity.publicKeyPem);return p;
 };
 return {dir,peer};
}
async function registry(worker,target){
 // Controlled RPC fixture exercises the actual ANT decoder. It is not a
 // claim of a live name observation or Solana account inclusion.
 const mint='11111111111111111111111111111111';
 const name='registry-'+crypto.randomBytes(6).toString('hex');
 worker.catalog.state.registry=[{name,mint}];worker.catalog.state.registryAt=Date.now();worker.catalog.state.slot=100;
 const [pubkey]=await getAntRecordPDA(mint,'@');
 const raw=getAntRecordEncoder().encode({mint,undername:'@',target,targetProtocol:0,ttlSeconds:60,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version:{major:1,minor:0,patch:0}});
 worker.catalog.rpc=async(_endpoint,method)=>method==='getAccountInfo'?{context:{slot:101},value:null}:({context:{slot:101},value:[{pubkey:String(pubkey),account:{owner:MAINNET_PROGRAM_IDS.ant,data:[Buffer.from(raw).toString('base64'),'base64']}}]});
 return name;
}
const direct=(server,options={})=>createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:server.address.port}],dhtEnabled:false,...options});

test('catalog automatically replicates a verified manifest graph and survives source loss',async t=>{
 const {dir,peer}=fixture(t),a=peer('a'),b=peer('b');
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=async(data,type)=>{const d=createData(data,signer,{tags:[{name:'Content-Type',value:type}]});await d.sign(signer);await a.contentStore.put(d.id,d.getRaw());return d;};
 const html=await item('<h1>Catalog replica</h1>','text/html'),css=await item('h1{color:teal}','text/css');
 const root=await item(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{id:html.id},paths:{'style.css':{id:css.id}}}),'application/x.arweave-manifest+json');
 let serverA=await startDirectPeerServer(a,{host:'127.0.0.1',port:0}),serverB;
 try{
  const worker=new CatalogWorker({dataDir:path.join(dir,'b'),peer:b,endpoint:'http://127.0.0.1:1',client:direct(serverA,{excludeWitnesses:[b.witnessPeerId]})});
  const name=await registry(worker,root.id);
  assert.equal(b.contentStore.stats().files.length,0);assert.equal(worker.state.jobs.length,0);
  for(let i=0;i<3;i++)await worker.pass();
  assert.equal(worker.catalog.state.targets[name].dataId,root.id);
  assert.equal(worker.status().meshReplicated,3);assert.equal(worker.status().completed,3);
  assert.equal(worker.status().lastSuccess.source,'p2p-content');assert.ok(worker.status().dayResponseBytes>0);
  assert.equal(worker.status().queued,0);assert.equal(b.contentStore.stats().files.length,3);
  await serverA.close();serverA=null;
  serverB=await startDirectPeerServer(b,{host:'127.0.0.1',port:0});
  const fresh=direct(serverB);
  for(const original of [root,html,css])assert.deepEqual((await fresh.content(original.id)).rawItem,original.getRaw());
  const resumed=new CatalogWorker({dataDir:path.join(dir,'b'),peer:b,endpoint:'http://127.0.0.1:1',client:fresh});
  assert.equal(resumed.status().meshReplicated,3);assert.equal(resumed.status().dayResponseBytes,worker.status().dayResponseBytes);
  // Exclusion is enforced by signed identity, even if an endpoint is aliased.
  await assert.rejects(direct(serverB,{excludeWitnesses:[b.witnessPeerId]}).content(root.id),/direct_peer_unavailable/);
 }finally{if(serverA)await serverA.close();if(serverB)await serverB.close();}
});

test('catalog response budget aborts replication without storing or reporting success',async t=>{
 const {dir,peer}=fixture(t),a=peer('a'),b=peer('b');
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=createData('budget'.repeat(1000),signer);await item.sign(signer);await a.contentStore.put(item.id,item.getRaw());
 const server=await startDirectPeerServer(a,{host:'127.0.0.1',port:0});
 try{
  const worker=new CatalogWorker({dataDir:path.join(dir,'b'),peer:b,endpoint:'http://127.0.0.1:1',client:direct(server),dailyBytes:128});
  await registry(worker,item.id);await worker.pass();
  assert.equal(worker.status().completed,0);assert.equal(worker.status().meshReplicated,0);
  assert.equal(b.contentStore.get(item.id),null);assert.ok(worker.status().dayResponseBytes>128);
  assert.equal(worker.status().queued,1);assert.match(worker.status().lastError,/catalog_network_budget/);
  const requests=a.requestsServed;await worker.pass();assert.equal(a.requestsServed,requests);
 }finally{await server.close();}
});
