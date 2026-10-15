import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {getArnsRecordEncoder} from '@ar.io/solana-contracts/arns';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {MAINNET_PROGRAM_IDS,getArnsRecordPDA,getAntRecordPDA} from '@ar.io/sdk';

// Optional read-only comparison against an extracted pre-fix candidate.
// Ordinary test runs always exercise this repository's production modules.
const sourceRoot=process.env.QA_LEGACY_SOURCE_ROOT?path.resolve(process.env.QA_LEGACY_SOURCE_ROOT):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=file=>import(pathToFileURL(path.join(sourceRoot,file)));
const [{NameSnapshotStore},{createSwarmMeshClient},{resolveArUrl},{resolveWithRecovery},{VerifiedContentStore},{peerIdFromPublicKey,signRecord}]=await Promise.all([
 source('src/name-snapshots.mjs'),source('src/swarm-client.mjs'),source('apps/helper/core-adapter.mjs'),
 source('src/resilient-access.mjs'),source('src/content-store.mjs'),source('src/common.mjs'),
]);
const mint='1'.repeat(32),target='A'.repeat(43),other='B'.repeat(43);
const row=(name,slot=100,txId=target)=>({schema:'arns-mesh-name-snapshot/v1',name,txId,antId:mint,slot,ttlSeconds:60,observedAt:new Date(Date.now()-1000).toISOString()});
function directory(t){
 const root=path.resolve(os.tmpdir()),dir=fs.mkdtempSync(path.join(root,'mesh-legacy-name-security-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),root);assert(path.basename(dir).startsWith('mesh-legacy-name-security-'));fs.rmSync(dir,{recursive:true,force:true});});
 return dir;
}
function environment(t,dir){
 const keys=['ARNS_NAME_WITNESS_POLICY','ARNS_MESH_DATA','ARNS_MESH_DIRECT_ONLY','ARNS_IP_PEERS','SOLANA_RPC_SEEDS','SOLANA_RPC_QUORUM','ARWEAVE_PEERS','ARWEAVE_PEER_SEEDS','ARNS_LOCATIONS','HYPER_BOOTSTRAP','HYPER_PEER_CACHE','MESH_DEEP_PROOFS','CHAIN_PROOF_REQUIRED','ANT_UPDATE_PROOF_REQUIRED','TRANSITION_JOURNAL_REQUIRED'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 for(const key of keys)delete process.env[key];
 for(const name of ['rpc','raw','peers','bootstrap'])fs.writeFileSync(path.join(dir,name+'.json'),'[]');
 Object.assign(process.env,{ARNS_MESH_DIRECT_ONLY:'1',ARNS_IP_PEERS:path.join(dir,'peers.json'),SOLANA_RPC_SEEDS:path.join(dir,'rpc.json'),SOLANA_RPC_QUORUM:'1',ARWEAVE_PEERS:path.join(dir,'raw.json'),ARWEAVE_PEER_SEEDS:path.join(dir,'raw.json'),ARNS_LOCATIONS:path.join(dir,'locations.json'),HYPER_BOOTSTRAP:path.join(dir,'bootstrap.json'),HYPER_PEER_CACHE:path.join(dir,'learned.json')});
 t.after(()=>{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];});
}
async function listen(t,handler){
 const server=http.createServer(handler);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return {host:'127.0.0.1',port:server.address().port};
}
function signer(){
 const keys=crypto.generateKeyPairSync('ed25519'),publicKeyPem=keys.publicKey.export({type:'spki',format:'pem'}),privateKeyPem=keys.privateKey.export({type:'pkcs8',format:'pem'});
 return {id:peerIdFromPublicKey(publicKeyPem),envelope(record){const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId:this.id,witnessPublicKeyPem:publicKeyPem,recordJson,signature:signRecord(recordJson,privateKeyPem)};}};
}
async function publisher(t,sign,record,{delay=0,forged=false,hold=false}={}){
 const queries=[];
 const peer=await listen(t,(req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
  const request=JSON.parse(body);queries.push(request);if(hold)return;
  const send=()=>{const envelope=sign.envelope(typeof record==='function'?record(request):record);if(forged)envelope.signature='A'.repeat(86);res.setHeader('content-type','application/json');res.end(JSON.stringify(envelope));};
  if(delay)setTimeout(send,delay);else send();
 });});
 return {...peer,queries};
}
function client(peers){return createSwarmMeshClient({directPeers:peers,dhtEnabled:false,quorum:1,timeoutMs:3000});}
function rejectedPolicy(reason){return error=>{assert.equal(error.code,'SNAPSHOT_POLICY_REJECTED');assert.equal(error.cause?.message,reason);assert.match(error.message,/^snapshot_policy_rejected: /);return true;};}

test('legacy local RPC replaces a remote claimed-slot poison and then enforces its own floor',t=>{
 const dir=directory(t),store=new NameSnapshotStore(path.join(dir,'names.json')),remote={kind:'trusted-peer',witnessPeerId:'c'.repeat(64)};
 store.put(row('floor',Number.MAX_SAFE_INTEGER,other),remote);
 assert.equal(store.put(row('floor',100),{kind:'local-rpc'}).txId,target);
 assert.equal(store.get('floor').slot,100);
 assert.throws(()=>store.put(row('floor',99,other),{kind:'local-rpc'}),/snapshot_rollback_rejected/);
 assert.throws(()=>store.put(row('floor',100,other),{kind:'local-rpc'}),/snapshot_conflict/);
 assert.equal(store.put(row('floor',Number.MAX_SAFE_INTEGER,other),remote).txId,target);
 assert.equal(store.get('floor').provenance.kind,'local-rpc');
});

test('legacy persistence failures are distinguishable from semantic rejections and restore memory',t=>{
 const dir=directory(t),store=new NameSnapshotStore(path.join(dir,'names.json'));
 store.put(row('disk',100),{kind:'local-rpc'});
 const failure=Object.assign(new Error('fixture_disk_full'),{code:'ENOSPC'});
 store.save=()=>{throw failure;};
 assert.throws(()=>store.put(row('disk',101,other),{kind:'local-rpc'}),error=>{assert.equal(error.code,'SNAPSHOT_PERSISTENCE_FAILED');assert.equal(error.cause,failure);return true;});
 assert.equal(store.get('disk').slot,100);assert.equal(store.get('disk').txId,target);
 assert.throws(()=>store.put(row('disk',99),{kind:'local-rpc'}),error=>{assert.notEqual(error.code,'SNAPSHOT_PERSISTENCE_FAILED');assert.equal(error.message,'snapshot_rollback_rejected');return true;});
 assert.throws(()=>store.putMany([row('disk',101),row('new-name',101)],{kind:'local-rpc'}),/fixture_disk_full/);
 assert.equal(store.get('disk').slot,100);assert.equal(store.get('new-name'),null);
});

test('legacy real signed snapshot purposes accept normal/prepared and reject crossed or malformed markers',async t=>{
 const sign=signer();
 for(const [label,marker,prepared,expected] of [
  ['normal absent',undefined,false,null],['normal explicit false',false,false,null],['prepared',true,true,null],
  ['prepared returned as normal',true,false,'unexpected_prepared_snapshot'],
  ['string marker','true',false,'invalid_snapshot_purpose'],['null marker',null,false,'invalid_snapshot_purpose'],
  ['prepared request without marker',undefined,true,'prepared_snapshot_required'],
 ])await t.test(label,async t=>{
  const record={...row('purpose'),...(marker===undefined?{}:{prepared:marker})},peer=await publisher(t,sign,record),reader=client([peer]);
  if(expected)await assert.rejects(reader.snapshot('purpose',{trustedPeers:[sign.id],prepared}),rejectedPolicy(expected));
  else{const result=await reader.snapshot('purpose',{trustedPeers:[sign.id],prepared});assert.equal(result.record.txId,target);assert.equal(result.record.prepared,marker);}
  assert.equal(peer.queries.length,1);assert.equal(peer.queries[0].prepared,prepared?true:undefined);
 });
});

test('legacy valid publisher still wins when another selected publisher sends signed wrong-purpose data',async t=>{
 const bad=signer(),good=signer(),first=await publisher(t,bad,{...row('mixed',9999,other),prepared:true}),second=await publisher(t,good,row('mixed'),{delay:35});
 const result=await client([first,second]).snapshot('mixed',{trustedPeers:[bad.id,good.id]});
 assert.equal(result.record.txId,target);assert.equal(result.record.slot,100);assert.equal(result.providers.length,1);assert.equal(result.providers[0].witnessPeerId,good.id);
 assert.equal(first.queries.length,1);assert.equal(second.queries.length,1);
});

test('legacy unknown or forged publisher cannot turn an unavailable route into policy rejection',async t=>{
 const selected=signer(),outsider=signer();
 for(const [label,sign,forged] of [['unknown',outsider,false],['forged',selected,true]])await t.test(label,async t=>{
  const peer=await publisher(t,sign,{...row('untrusted'),prepared:true},{forged});
  await assert.rejects(client([peer]).snapshot('untrusted',{trustedPeers:[selected.id]}),error=>{assert.notEqual(error.code,'SNAPSHOT_POLICY_REJECTED');assert.equal(error.message,'direct_peer_unavailable');return true;});
 });
});

test('legacy authenticated schema failure cannot be masked as outage and enable prepared fallback',async t=>{
 const sign=signer(),peer=await publisher(t,sign,row('different-name')),reader=client([peer]);let preparedCalls=0;
 await assert.rejects(resolveWithRecovery({
  live:async()=>{throw Object.assign(new Error('rpc_fixture_unavailable'),{code:'NAME_SOURCE_UNAVAILABLE'});},
  saved:()=>reader.snapshot('expected-name',{trustedPeers:[sign.id]}),
  prepared:async()=>{preparedCalls++;return {verification:{},recovery:{}};},
 }),rejectedPolicy('invalid_name_snapshot'));
 assert.equal(preparedCalls,0);assert.equal(peer.queries.length,1);assert.equal(peer.queries[0].prepared,undefined);
});

test('legacy caller cancellation takes priority over an earlier authenticated policy failure',async t=>{
 const sign=signer(),bad=await publisher(t,sign,{...row('cancel'),prepared:true}),held=await publisher(t,sign,row('cancel'),{hold:true});
 const abort=new AbortController(),reason=new Error('caller-cancelled'),result=client([bad,held]).snapshot('cancel',{trustedPeers:[sign.id],signal:abort.signal});
 const check=assert.rejects(result,error=>error===reason);
 for(let i=0;i<100&&!bad.queries.length;i++)await pause(2);
 assert.equal(bad.queries.length,1);await pause(20);abort.abort(reason);await check;
});

async function rpc(t,name,txId){
 const [arns]=await getArnsRecordPDA(name),[ant]=await getAntRecordPDA(mint,'@'),version={major:1,minor:0,patch:0};
 const account=(owner,data)=>({owner,data:[Buffer.from(data).toString('base64'),'base64'],lamports:1,executable:false,rentEpoch:0});
 const arnsAccount=account(MAINNET_PROGRAM_IDS.arns,getArnsRecordEncoder().encode({name,nameHash:crypto.createHash('sha256').update(name).digest(),owner:mint,ant:mint,purchaseType:1,startTimestamp:1,endTimestamp:null,undernameLimit:10,purchasePrice:0,bump:255,version}));
 const antAccount=account(MAINNET_PROGRAM_IDS.ant,getAntRecordEncoder().encode({mint,undername:'@',target:txId,targetProtocol:0,ttlSeconds:60,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version}));
 let calls=0;
 const address=await listen(t,(req,res)=>{let text='';req.on('data',chunk=>text+=chunk);req.on('end',()=>{calls++;const query=JSON.parse(text),key=query.params[0];res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:query.id,result:{context:{slot:100},value:key===String(arns)?arnsAccount:key===String(ant)?antAccount:null}}));});});
 return {...address,get calls(){return calls;}};
}
async function liveFixture(t,name){
 const dir=directory(t);environment(t,dir);
 const contentStore=new VerifiedContentStore(path.join(dir,'content')),sign=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=createData(Buffer.from('<h1>Locally verified legacy bytes</h1>'),sign,{tags:[{name:'Content-Type',value:'text/html'}]});await item.sign(sign);await contentStore.put(item.id,Buffer.from(item.getRaw()));
 let reads=0,preparedReads=0;const get=contentStore.get.bind(contentStore);contentStore.get=(...args)=>{reads++;return get(...args);};
 const endpoint=await rpc(t,name,item.id);fs.writeFileSync(process.env.SOLANA_RPC_SEEDS,JSON.stringify([{host:endpoint.host,port:endpoint.port}]));
 const snapshotStore=new NameSnapshotStore(path.join(dir,'names.json'));
 const resolve=()=>resolveArUrl('ar://'+name,{accessPolicy:'auto',contentStore,contentSources:'local-only',snapshotStore,preparedSnapshotStore:{get(){preparedReads++;return null;}},signal:AbortSignal.timeout(10000)});
 return {name,id:item.id,endpoint,snapshotStore,resolve,get reads(){return reads;},get preparedReads(){return preparedReads;}};
}
test('legacy RPC rollback and same-slot conflict stop before content bytes or historical fallback',async t=>{
 for(const [label,slot] of [['rollback',200],['conflict',100]])await t.test(label,async t=>{
  const f=await liveFixture(t,'legacy-'+label);f.snapshotStore.put(row(f.name,slot,other),{kind:'local-rpc'});
  await assert.rejects(f.resolve(),new RegExp(label==='rollback'?'snapshot_rollback_rejected':'snapshot_conflict'));
  assert(f.endpoint.calls>0);assert.equal(f.reads,0);assert.equal(f.preparedReads,0);assert.equal(f.snapshotStore.get(f.name).txId,other);
 });
});
test('legacy memoized RPC evidence is rechecked after the reader advances its watermark',async t=>{
 const f=await liveFixture(t,'legacy-cached'),first=await f.resolve();assert.equal(first.meta.contentSignatureVerified,true);
 const rpcCalls=f.endpoint.calls,contentReads=f.reads;f.snapshotStore.put(row(f.name,200,other),{kind:'local-rpc'});
 await assert.rejects(f.resolve(),/snapshot_rollback_rejected/);
 assert.equal(f.endpoint.calls,rpcCalls,'Evidence came from memo cache, not a new RPC request');assert.equal(f.reads,contentReads);assert.equal(f.preparedReads,0);
});
test('legacy direct RPC recovers from remote claimed-slot poison end to end',async t=>{
 const f=await liveFixture(t,'legacy-poison');
 f.snapshotStore.put(row(f.name,Number.MAX_SAFE_INTEGER,other),{kind:'trusted-peer',witnessPeerId:'c'.repeat(64)});
 const result=await f.resolve();assert.equal(result.meta.contentSignatureVerified,true);assert.match(result.body.toString(),/Locally verified legacy bytes/);
 assert.equal(f.snapshotStore.get(f.name).txId,f.id);assert.equal(f.snapshotStore.get(f.name).slot,100);assert.equal(f.snapshotStore.get(f.name).provenance.kind,'local-rpc');
});
test('legacy live RPC rendering survives only a classified local persistence failure',async t=>{
 const f=await liveFixture(t,'legacy-disk');f.snapshotStore.save=()=>{throw Object.assign(new Error('fixture_disk_full'),{code:'ENOSPC'});};
 const result=await f.resolve();assert.equal(result.meta.contentSignatureVerified,true);assert.match(result.body.toString(),/Locally verified legacy bytes/);assert.match(result.meta.snapshotSaveError,/snapshot_persistence_failed: fixture_disk_full/);
 assert.equal(f.snapshotStore.get(f.name),null);assert.equal(f.preparedReads,0);
});
