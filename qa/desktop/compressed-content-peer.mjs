// Disposable compression acceptance corpus. Real ANS-104 signatures, synthetic
// names; no public-chain or independent-provider claim and no external fetches.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {VerifiedContentStore,verifyStoredContent} from '../../src/content-store.mjs';
import {NameSnapshotStore} from '../../src/name-snapshots.mjs';
import {SitePinner} from '../../src/site-pinner.mjs';
import {SnapshotRelay} from '../../src/snapshot-relay.mjs';
import {MeshPeer} from '../../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../../src/direct-peer.mjs';
import {applyProfile} from '../../apps/helper/network-profile.mjs';
import {resolveArUrl} from '../../apps/helper/core-adapter.mjs';
import {contentResponse} from '../../apps/browser/response.mjs';

const output=path.resolve(process.env.QA_OUTPUT),provider=path.join(output,'supporter'),reader=path.join(output,'reader');
fs.mkdirSync(output,{recursive:true});
assert.ok(!fs.existsSync(provider),'Fixture supporter directory must be fresh');
process.env.ARNS_MESH_DIRECT_ONLY='1';
const snapshots=new NameSnapshotStore(path.join(provider,'name-snapshots.json'));
const store=new VerifiedContentStore(path.join(provider,'content'));
const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
const records=[],sites=[],failures=[];
let peer,server,timer,stopped=false,preparedSnapshotsServed=0,publicSite=null;
function encode(data,encoding){
 const bytes=Buffer.from(data);
 return encoding==='gzip'?gzipSync(bytes):encoding==='br'?brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}):bytes;
}
async function item(data,type,encoding,{encoded=false,tamper=false}={}){
 const bytes=encoded?Buffer.from(data):encode(data,encoding);
 const signed=createData(bytes,signer,{tags:[{name:'Content-Type',value:type},...(encoding?[{name:'Content-Encoding',value:encoding}]:[])]});
 await signed.sign(signer);const raw=Buffer.from(signed.getRaw());await store.put(signed.id,raw);
 if(tamper){
  // Deliberately emulate an untrusted peer/damaged disk. Never use this bypass
  // in production: a normal VerifiedContentStore refuses the altered item.
  raw[raw.length-1]^=1;fs.writeFileSync(store.file(signed.id),raw);
  await assert.rejects(()=>verifyStoredContent(raw,signed.id),/signature/);
 }
 records.push({id:signed.id,encoding:encoding||'identity',type,encodedBytes:bytes.length,rawSha256:crypto.createHash('sha256').update(raw).digest('hex'),tamper});
 return signed.id;
}
function bind(name,txId){
 snapshots.put({schema:'arns-mesh-name-snapshot/v1',name,txId,antId:'B'.repeat(43),slot:1,ttlSeconds:60,observedAt:new Date().toISOString()},{kind:'local-rpc'});
}
async function seed(){
 for(const encoding of [null,'gzip','br']){
  const label=encoding||'plain',name='compression-'+label;
  const css='body{background:#f6f4ef;color:#23232d;font:18px system-ui;margin:40px}h1{color:rgb(84,39,200)}';
  const script="document.getElementById('script-status').textContent='Verified "+label+" JavaScript ran';";
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Compression '+label+'</title><link rel="stylesheet" href="style.css"><main><p>CONTROLLED SIGNED COMPRESSION FIXTURE</p><h1 id="proof">'+label+' HTML decoded once</h1><p id="script-status">Script pending</p><p>Signed manifest, HTML, CSS and JavaScript.</p></main><script src="app.js"></script></html>';
  const paths={};
  for(const [file,text,type] of [['index.html',html,'text/html'],['style.css',css,'text/css'],['app.js',script,'text/javascript']])paths[file]={id:await item(text,type,encoding)};
  const manifest=await item(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{path:'index.html'},paths}),'application/x.arweave-manifest+json',encoding);
  bind(name,manifest);sites.push({name,label,manifest,files:Object.keys(paths).length+1,html,css,script,paths});
 }
 const bad=[
  ['corrupt-gzip',Buffer.from('not a gzip stream'),'gzip',{encoded:true}],
  ['corrupt-br',Buffer.from([255,255,255,255,255]),'br',{encoded:true}],
  ['unsupported','<!doctype html><h1 id="unsafe">UNSAFE COMPRESSION CONTENT</h1>','zstd',{encoded:true}],
  ['signature','<!doctype html><h1 id="unsafe">UNSAFE COMPRESSION CONTENT</h1>','gzip',{tamper:true}]
 ];
 // A small gzip expands one byte beyond the actual application limit.
 // Do not lower the production limit through a test-only environment switch.
 const {MAX_DECODED_BYTES}=await import('../../src/content-decoding.mjs');
 bad.push(['expanded-limit',gzipSync(Buffer.alloc(MAX_DECODED_BYTES+1,65)),'gzip',{encoded:true}]);
 for(const [label,payload,encoding,options] of bad){
  const name='compression-'+label,id=await item(payload,'text/html',encoding,options);
  bind(name,id);failures.push({name,label,id});
 }
 fs.writeFileSync(path.join(output,'corpus.json'),JSON.stringify({sites,failures,records},null,2));
}
function summary(){return {realSignedFiles:true,realPublicContent:Boolean(publicSite),remoteFetch:false,preparedSnapshotsServed,requestsServed:peer?.requestsServed||0,contentChunksServed:peer?.contentChunksServed||0,contentBytesServed:peer?.contentBytesServed||0,prepared:peer?.pinner?.status().sites.map(r=>({name:r.name,status:r.status,saved:r.saved,total:r.total,failed:r.failed}))||[]};}
function persist(){fs.writeFileSync(path.join(output,'serving-summary.json'),JSON.stringify(summary(),null,2));}
async function stop(){
 if(stopped)return;stopped=true;clearInterval(timer);persist();await server?.close();await peer?.stop();
}
try{
 await seed();
 const publicFile=path.join(output,'public-content.json');
 if(fs.existsSync(publicFile)){
  publicSite=JSON.parse(fs.readFileSync(publicFile,'utf8'));
  assert.ok(publicSite.items.length<=64,'Public acceptance corpus is bounded');
  let total=0;
  for(const entry of publicSite.items){
   assert.match(entry.id,/^[A-Za-z0-9_-]{43}$/);
   const raw=fs.readFileSync(path.join(output,'public-content',entry.id+'.ans104'));
   total+=raw.length;assert.ok(total<=16*1024*1024,'Public acceptance corpus stays below 16 MiB');
   await store.put(entry.id,raw);
  }
  assert.ok(store.has(publicSite.manifest));
 }
 peer=new MeshPeer({dataDir:provider,snapshotStore:snapshots,allowRemoteFetch:false,locationsFile:path.join(output,'empty-locations.json')});
 await peer.start();
 if(publicSite){
  peer.snapshotRelay=new SnapshotRelay({file:path.join(provider,'snapshot-relay.json'),trusted:()=>[publicSite.nameEnvelope.witnessPeerId],scope:()=>({id:'public-compression-qa'})});
  peer.snapshotRelay.put(publicSite.nameEnvelope);
 }
 peer.pinner=new SitePinner({file:path.join(provider,'prepared-sites.json'),snapshots,contentStore:peer.contentStore});
 for(const site of sites){
  const row=await peer.pinner.start(site.name,{contentSources:'local-only'});
  assert.equal(row.status,'manifest-saved',site.label+' compressed manifest must prepare');
  assert.equal(row.saved,site.files);assert.equal(peer.pinner.isReady(row),true);
 }
 // Serving preserves the original signed compressed representation on disk.
 for(const record of records)assert.equal(crypto.createHash('sha256').update(store.get(record.id)).digest('hex'),record.rawSha256);
 const handle=peer._handleAsync.bind(peer);
 peer._handleAsync=async request=>{
  // Successful pages are available only as fully prepared retained versions.
  // This forces the real automatic recovery branch, not a warm reader cache.
  if(request.op==='snapshot'&&sites.some(site=>site.name===request.name)){
   if(request.prepared!==true)return {ok:false,error:'snapshot_not_found'};
   preparedSnapshotsServed++;
  }
  return handle(request);
 };
 server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
 const address='127.0.0.1:'+server.address.port;
 const profile={schema:'arns-mesh-network-profile/v1',directPeers:[address],rpcSources:['127.0.0.1:1'],arweavePeers:[],trustedPeers:[peer.witnessPeerId,...(publicSite?[publicSite.nameEnvelope.witnessPeerId]:[])]};
 applyProfile(reader,profile);
 fs.writeFileSync(path.join(reader,'preferences.json'),JSON.stringify({accessPolicy:'auto',trustedPeers:[],witnessQuorum:2}));
 // Deliberately no reader name records or files before real supporter access.
 assert.equal(fs.existsSync(path.join(reader,'name-snapshots.json')),false);
 assert.equal(fs.existsSync(path.join(reader,'content')),false);
 const ready={ready:true,address,publisherId:peer.witnessPeerId,sites,failures,publicSite,...summary()};
 persist();
 if(process.argv.includes('--smoke')){
  process.env.ARNS_IP_PEERS=path.join(reader,'mesh-ip-peers.json');
  process.env.SOLANA_RPC_SEEDS=path.join(reader,'solana-rpc-seeds.json');
  process.env.ARWEAVE_PEERS=path.join(reader,'arweave-peers.json');
  process.env.ARWEAVE_PEER_SEEDS=path.join(reader,'arweave-peer-seeds.json');
  const cache=new VerifiedContentStore(path.join(reader,'content')),names=new NameSnapshotStore(path.join(reader,'name-snapshots.json'));
  const saved=new SitePinner({file:path.join(reader,'saved-sites.json'),snapshots:names,contentStore:cache});
  for(const site of sites){
   const result=await resolveArUrl('ar://'+site.name+'/',{contentStore:cache,snapshotStore:names,accessPolicy:'auto',nameTimeoutMs:1000,trustedPeers:[peer.witnessPeerId],contentSources:'mesh-only',signal:AbortSignal.timeout(15000)});
   const response=contentResponse(result,new Request('ar://'+site.name+'/'));
   assert.equal(await response.text(),site.html);assert.equal(response.headers.has('content-encoding'),false);
   const kept=await saved.start(site.name,{snapshot:result.meta.accessSnapshot,trustedPeers:[peer.witnessPeerId],contentSources:'mesh-only'});assert.equal(kept.status,'manifest-saved');
  }
  if(publicSite)for(const check of publicSite.checks){
   const result=await resolveArUrl('ar://'+publicSite.name+check.path,{contentStore:cache,snapshotStore:names,accessPolicy:'saved',trustedPeers:[publicSite.nameEnvelope.witnessPeerId],contentSources:'mesh-only',signal:AbortSignal.timeout(15000)});
   assert.equal(crypto.createHash('sha256').update(result.body).digest('hex'),check.decodedSha256);
  }
  const fetched=summary().contentBytesServed;assert.ok(fetched>0);
  await stop();
  for(const site of sites){
   const result=await resolveArUrl('ar://'+site.name+'/',{contentStore:cache,snapshotStore:saved.snapshotStore({trustedPeers:[peer.witnessPeerId]}),accessPolicy:'saved',trustedPeers:[peer.witnessPeerId],contentSources:'local-only',signal:AbortSignal.timeout(15000)});
   assert.equal(result.body.toString(),site.html);
  }
  if(publicSite)for(const check of publicSite.checks){
   const result=await resolveArUrl('ar://'+publicSite.name+check.path,{contentStore:cache,snapshotStore:names,accessPolicy:'saved',trustedPeers:[publicSite.nameEnvelope.witnessPeerId],contentSources:'local-only',signal:AbortSignal.timeout(15000)});
   assert.equal(crypto.createHash('sha256').update(result.body).digest('hex'),check.decodedSha256);
  }
  console.log(JSON.stringify({smokePassed:true,publicDocumentationChecks:publicSite?.checks.length||0,...summary()}));
 }else{
  timer=setInterval(persist,500);process.send?.(ready);
  process.on('message',async message=>{try{
   if(message==='status'){persist();process.send?.({status:summary()});}
   if(message==='verify-reader'){
    const kept=[];
    for(const record of records){
     const file=path.join(reader,'content',record.id+'.ans104');
     if(record.tamper){assert.equal(fs.existsSync(file),false,'Tampered item must not enter reader verified cache');continue;}
     if(!fs.existsSync(file))continue;
     const raw=fs.readFileSync(file);await verifyStoredContent(raw,record.id);
     assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),record.rawSha256,'Reader must retain original signed bytes');
     kept.push(record.id);
    }
    for(const site of sites)for(const id of [site.manifest,...Object.values(site.paths).map(row=>row.id)])assert.ok(kept.includes(id));
    process.send?.({readerOriginals:{verified:kept.length,compressedRawPreserved:true,tamperedItemAbsent:true}});
   }
   if(message==='stop'){await stop();process.exit(0);}
  }catch(error){console.error(error.stack);process.send?.({fixtureError:error.message});await stop();process.exit(1);}});
  process.on('disconnect',()=>void stop().finally(()=>process.exit(0)));
 }
}catch(error){console.error(error.stack);process.send?.({fixtureError:error.message});await stop();process.exitCode=1;}
