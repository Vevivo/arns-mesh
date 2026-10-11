import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import Arweave from 'arweave';
import {getArnsRecordEncoder} from '@ar.io/solana-contracts/arns';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {MAINNET_PROGRAM_IDS,getArnsRecordPDA,getAntRecordPDA} from '@ar.io/sdk';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {VerifiedContentStore,verifyStoredContent} from '../src/content-store.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {SitePinner} from '../src/site-pinner.mjs';
import {CatalogWorker} from '../src/catalog-worker.mjs';
import {SupporterReplication} from '../src/supporter-replication.mjs';
import {SearchPublisher} from '../src/search-catalog.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';
import {encodeL1Content} from '../src/l1-content.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {resolveArUrl} from '../apps/helper/core-adapter.mjs';
import {resolveArweaveResource} from '../apps/helper/resource-adapter.mjs';
import {probeSupporter} from '../src/supporter-readiness.mjs';

const compress=(data,encoding)=>encoding==='gzip'?gzipSync(data):encoding==='br'?brotliCompressSync(data):Buffer.from(data);
const observe=(names,name,txId)=>names.put({schema:'arns-mesh-name-snapshot/v1',name,txId,antId:'B'.repeat(43),observedAt:new Date().toISOString(),slot:1,ttlSeconds:60},{kind:'local-rpc'});
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-compression-integration-')),empty=path.join(dir,'empty.json');fs.writeFileSync(empty,'[]');
 const env={ARNS_MESH_DIRECT_ONLY:'1',SOLANA_RPC_SEEDS:path.join(dir,'rpc.json'),ARWEAVE_PEERS:empty,ARWEAVE_PEER_SEEDS:empty,ARNS_LOCATIONS:path.join(dir,'locations.json'),HYPER_BOOTSTRAP:empty,HYPER_PEER_CACHE:path.join(dir,'learned.json'),ARNS_IP_PEERS:empty,ARNS_HISTORICAL_INDEX:'0',ARNS_PREPARED_LOCATIONS:'',ARNS_PREPARATION_INBOX:'',ARNS_MESH_HEAD_START_MS:'0'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;fs.rmSync(dir,{recursive:true,force:true});});
 const peer=name=>{
  const p=new MeshPeer({dataDir:path.join(dir,name),allowRemoteFetch:false,locationsFile:path.join(dir,name,'locations.json')});
  const k=crypto.generateKeyPairSync('ed25519');p.identity={publicKeyPem:k.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:k.privateKey.export({format:'pem',type:'pkcs8'})};p.witnessPeerId=peerIdFromPublicKey(p.identity.publicKeyPem);return p;
 };
 return {dir,peer};
}
test('signed gzip/Brotli HTML, JS, CSS and manifest survive raw IP L1 download, supporter preparation, transfer and saved restart',async t=>{
 const f=fixture(t),arweave=Arweave.init({}),key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const samples=[];
 const signed=async(body,type,encoding)=>{
  const original=Buffer.from(body),payload=compress(original,encoding);
  const tx=await arweave.createTransaction({data:payload,reward:'0',last_tx:crypto.randomBytes(32).toString('base64url')},key);
  tx.addTag('Content-Type',type);if(encoding)tx.addTag('Content-Encoding',encoding);await arweave.transactions.sign(tx,key);
  const header=tx.toJSON(),item={id:tx.id,header,payload,original,type,encoding,base:(samples.length+1)*262144};
  item.raw=encodeL1Content(header,payload);samples.push(item);return item;
 };
 const paths={};
 for(const encoding of ['gzip','br'])for(const [ext,type,body] of [['html','text/html','<title>Compressed fixture</title><h1>Verified '+encoding+'</h1>'],['js','text/javascript','globalThis.compressedFixture="'+encoding+'";'],['css','text/css','h1 { color: teal; }']]){
  const item=await signed(body,type,encoding);paths[encoding+'.'+ext]={id:item.id};
 }
 const root=await signed(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{path:'gzip.html'},paths}),'application/x.arweave-manifest+json','br');
 const routes=[],raw=http.createServer((req,res)=>{
  routes.push(req.url);let data;
  if(req.url==='/info')data={network:'arweave.N.1',height:1};else if(req.url==='/peers')data=[];
  else if(req.url.startsWith('/tx/')){const item=samples.find(i=>i.id===req.url.split('/')[2]);if(item)data=req.url.endsWith('/offset')?{offset:item.base+item.payload.length,size:item.payload.length}:item.header;}
  else if(req.url.startsWith('/chunk/')){const offset=Number(req.url.split('/')[2]),item=samples.find(i=>offset>i.base&&offset<=i.base+i.payload.length);if(item)data={chunk:item.payload.toString('base64url'),chunk_size:item.payload.length,absolute_end_offset:item.base+item.payload.length};}
  if(!data){res.writeHead(404);res.end('{}');return;}res.end(JSON.stringify(data));
 });
 await new Promise(r=>raw.listen(0,'127.0.0.1',r));let rawOpen=true;
 t.after(()=>{if(rawOpen){raw.closeAllConnections();raw.close();}});
 const seeds=path.join(f.dir,'raw.json');fs.writeFileSync(seeds,JSON.stringify([{host:'127.0.0.1',port:raw.address().port}]));process.env.ARWEAVE_PEERS=seeds;
 const source=f.peer('source'),noMesh={async content(){throw new Error('fixture_no_mesh');},async locateCandidates(){return [];}};
 for(const item of samples){
  const result=await fetchMeshContent(item.id,{client:noMesh,contentStore:source.contentStore,signal:AbortSignal.timeout(15000)});
  assert.equal(result.contentSource,'arweave');assert.equal(result.storageKind,'l1');assert.equal(result.direct.l1SignatureVerified,true);assert.equal(result.direct.l1DataRootVerified,true);
  assert.deepEqual(result.direct.payload,item.payload);assert.deepEqual(source.contentStore.get(item.id),item.raw);
 }
 assert.equal(routes.filter(route=>route.startsWith('/chunk/')).length,samples.length);
 raw.closeAllConnections();await new Promise(r=>raw.close(r));rawOpen=false;
 // The prepared supporter has only the original signed compressed objects.
 source.snapshotStore=new NameSnapshotStore(path.join(source.dataDir,'names.json'));observe(source.snapshotStore,'compressed-l1',root.id);
 source.pinner=new SitePinner({file:path.join(source.dataDir,'sites.json'),snapshots:source.snapshotStore,contentStore:source.contentStore});
 const prepared=await source.pinner.start('compressed-l1',{contentSources:'local-only'});assert.equal(prepared.status,'manifest-saved');assert.equal(prepared.saved,7);assert.equal(prepared.failed,0);
 const server=await startDirectPeerServer(source,{host:'127.0.0.1',port:0});let serving=true;
 t.after(async()=>{if(serving)await server.close();});
 const peer={host:'127.0.0.1',port:server.address.port},client=createSwarmMeshClient({directPeers:[peer],dhtEnabled:false,cacheOnly:true,directory:null});
 const store=new VerifiedContentStore(path.join(f.dir,'reader')),names=new NameSnapshotStore(path.join(f.dir,'reader-names.json'));observe(names,'compressed-l1',root.id);
 try{
  const readiness=await probeSupporter({peer,trustedPeers:[source.witnessPeerId],names:['compressed-l1'],signal:AbortSignal.timeout(20000)});
  assert.equal(readiness.ready,true,JSON.stringify(readiness));assert.equal(readiness.names[0].files,7);assert.equal(readiness.names[0].preparedBinding,true);
  for(const item of samples.slice(0,-1)){
   const result=await resolveArweaveResource('https://arweave.net/'+root.id+'/'+Object.keys(paths).find(p=>paths[p].id===item.id),{client,contentStore:store,signal:AbortSignal.timeout(10000)});
   assert.deepEqual(result.body,item.original);assert.equal(result.contentEncoding,item.encoding);assert.equal(result.bodyDecoded,true);assert.equal(result.meta.contentSignatureVerified,true);
   assert.equal(result.meta.sha256,crypto.createHash('sha256').update(item.payload).digest('hex'));
   assert.deepEqual(store.get(item.id),item.raw);
  }
 }finally{await client.stop();}
 await server.close();serving=false;
 const restarted=new VerifiedContentStore(store.directory),pinner=new SitePinner({file:path.join(f.dir,'reader-sites.json'),snapshots:names,contentStore:restarted});
 const pinned=await pinner.start('compressed-l1',{contentSources:'local-only'});assert.equal(pinned.saved,7);assert.equal(pinned.failed,0);
 for(const [route,{id}] of Object.entries(paths)){
  const item=samples.find(i=>i.id===id),result=await resolveArUrl('ar://compressed-l1/'+route,{contentStore:restarted,snapshotStore:pinner.snapshotStore(),accessPolicy:'saved',contentSources:'local-only'});
  assert.deepEqual(result.body,item.original);assert.equal(result.meta.storageKind,'l1');assert.equal(result.meta.verification.rpcUsed,false);assert.equal(result.meta.l1DataRootVerified,true);
 }
 const search=new SearchPublisher({file:path.join(f.dir,'search.json'),snapshots:names,contentStore:restarted,pinner,sign:x=>x});
 await search.pass();assert.equal(search.record.entries[0].title,'Compressed fixture');assert.equal(search.record.entries[0].availability,'prepared');
 // Invalid original bytes are rejected before they can be decompressed or rendered.
 const invalid=Buffer.from(samples[0].raw);invalid[invalid.length-1]^=1;fs.writeFileSync(restarted.file(samples[0].id,'l1'),invalid);
 await assert.rejects(resolveArweaveResource('https://arweave.net/'+samples[0].id,{contentStore:restarted,localOnly:true}),/l1_data_root_mismatch/);
});

test('legacy compressed false-ready copies are audited within background preparation and plain saved copies stay available',async t=>{
 const f=fixture(t),store=new VerifiedContentStore(path.join(f.dir,'content')),names=new NameSnapshotStore(path.join(f.dir,'names.json')),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const signed=async(body,type,encoding)=>{
  const item=createData(compress(Buffer.from(body),encoding),signer,{tags:[{name:'Content-Type',value:type},...(encoding?[{name:'Content-Encoding',value:encoding}]:[])]});await item.sign(signer);return item;
 };
 const css=await signed('h1{color:teal}','text/css','br'),html=await signed('<link href="https://arweave.net/'+css.id+'"><h1>Legacy compressed</h1>','text/html','gzip'),plain=await signed('<h1>Existing plain site</h1>','text/html');
 const pinner=new SitePinner({file:path.join(f.dir,'sites.json'),snapshots:names,contentStore:store});
 for(const [name,item] of [['legacy-compressed',html],['legacy-plain',plain]]){
  await store.put(item.id,item.getRaw());await store.pin(item.id,name);observe(names,name,item.id);const snapshot=names.get(name);
  pinner.rows[name]={name,rootDataId:item.id,observedAt:snapshot.observedAt,snapshot,pinGroup:name,status:'document-saved',scope:'document',saved:1,total:1,failed:0,errors:[]};
 }
 pinner.save();assert.equal(pinner.isReady(pinner.rows['legacy-compressed']),true);assert.equal(pinner.isReady(pinner.rows['legacy-plain']),true);
 const peer={contentStore:store,witnessPeerId:'a'.repeat(64),locationIndex:{file:path.join(f.dir,'locations.json')}};
 const catalog=new CatalogWorker({dataDir:f.dir,peer,endpoint:'http://127.0.0.1:1',client:{},pinner,snapshotStore:names,maxPreparedSites:10});
 await catalog.prepareOne(AbortSignal.timeout(10000));
 assert.equal(pinner.isReady(pinner.rows['legacy-compressed']),false,'a missing reference in decoded HTML withdraws the old false-ready claim');
 assert.equal(pinner.rows['legacy-compressed'].status,'partial');assert.equal(pinner.rows['legacy-compressed'].total,2);
 assert.equal(pinner.isReady(pinner.rows['legacy-plain']),true,'other existing copies remain usable');
 assert.deepEqual(store.get(html.id),html.getRaw(),'failed audit retains original verified bytes and pins');
 await catalog.prepareOne(AbortSignal.timeout(10000));assert.equal(pinner.isReady(pinner.rows['legacy-plain']),true);assert.equal(pinner.needsDecodingAudit(pinner.rows['legacy-plain']),false);
 await store.put(css.id,css.getRaw());const repaired=await pinner.start('legacy-compressed',{contentSources:'local-only'});
 assert.equal(repaired.status,'linked-resources-saved');assert.equal(repaired.saved,2);assert.equal(pinner.isReady(repaired),true);
 // The replica path also revisits old ready metadata even when the binding is unchanged.
 delete pinner.rows['legacy-compressed'].contentDecodingVersion;
 const publisher='c'.repeat(64),binding={...names.get('legacy-compressed'),prepared:true};
 const relay={entries:()=>[{row:binding,envelope:{witnessPeerId:publisher}}],trusted:()=>[publisher]};
 const replica=new SupporterReplication({file:path.join(f.dir,'replication.json'),relay,pinner,contentSources:()=> 'local-only'});
 await replica.pass();assert.equal(replica.state.completed,1);assert.equal(replica.state.lastError,null);assert.equal(pinner.needsDecodingAudit(pinner.rows['legacy-compressed']),false);
 const verified=await verifyStoredContent(store.get(html.id),html.id);assert.deepEqual(verified.payload,html.rawData);
 // Cache corruption is detected before tags can be trusted, and must also
 // withdraw the same-target legacy ready claim without deleting its files.
 delete pinner.rows['legacy-plain'].contentDecodingVersion;
 const corrupt=Buffer.from(plain.getRaw());corrupt[corrupt.length-1]^=1;fs.writeFileSync(store.file(plain.id),corrupt);
 await pinner.start('legacy-plain',{contentSources:'local-only'});
 assert.equal(pinner.isReady(pinner.rows['legacy-plain']),false);assert.deepEqual(store.get(plain.id),corrupt);
});

async function rpcFixture(name,target){
 const mint='11111111111111111111111111111111',version={major:1,minor:0,patch:0};
 const account=(owner,data)=>({owner,data:[Buffer.from(data).toString('base64'),'base64'],lamports:1,executable:false,rentEpoch:0});
 const [arns]=await getArnsRecordPDA(name),[ant]=await getAntRecordPDA(mint,'@');
 const arnsAccount=account(MAINNET_PROGRAM_IDS.arns,getArnsRecordEncoder().encode({name,nameHash:crypto.createHash('sha256').update(name).digest(),owner:mint,ant:mint,purchaseType:1,startTimestamp:1,endTimestamp:null,undernameLimit:10,purchasePrice:0,bump:255,version}));
 const antAccount=account(MAINNET_PROGRAM_IDS.ant,getAntRecordEncoder().encode({mint,undername:'@',target,targetProtocol:0,ttlSeconds:1,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version}));
 let calls=0;
 const server=http.createServer((req,res)=>{let text='';req.on('data',b=>text+=b);req.on('end',()=>{
  calls++;const q=JSON.parse(text),value=q.params[0]===String(arns)?arnsAccount:q.params[0]===String(ant)?antAccount:null;
  res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{context:{slot:100},value}}));
 });});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {address:{host:'127.0.0.1',port:server.address().port},get calls(){return calls;},close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
test('live ArNS resolution preserves signed gzip/Brotli tags through manifests, assets and original sharing bundles',async t=>{
 const f=fixture(t),provider=f.peer('live-provider'),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const signed=async(body,type,encoding)=>{
  const original=Buffer.from(body),payload=compress(original,encoding),item=createData(payload,signer,{tags:[{name:'Content-Type',value:type},{name:'Content-Encoding',value:encoding}]});
  await item.sign(signer);await provider.contentStore.put(item.id,item.getRaw());return {id:item.id,raw:item.getRaw(),original,payload};
 };
 const server=await startDirectPeerServer(provider,{host:'127.0.0.1',port:0});
 const directFile=path.join(f.dir,'direct.json');fs.writeFileSync(directFile,JSON.stringify(['127.0.0.1:'+server.address.port]));process.env.ARNS_IP_PEERS=directFile;
 try{
  for(const encoding of ['gzip','br']){
   const name='live-compressed-'+encoding,html=await signed('<h1>Live compressed '+encoding+'</h1>','text/html',encoding),js=await signed('globalThis.encoding="'+encoding+'";','text/javascript',encoding),css=await signed('h1{color:teal}','text/css',encoding);
   const root=await signed(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{path:'index.html'},paths:{'index.html':{id:html.id},'app.js':{id:js.id},'style.css':{id:css.id}}}),'application/x.arweave-manifest+json',encoding);
   const rpc=await rpcFixture(name,root.id);fs.writeFileSync(process.env.SOLANA_RPC_SEEDS,JSON.stringify([rpc.address]));
   try{
    const store=new VerifiedContentStore(path.join(f.dir,name)),snapshots=new NameSnapshotStore(path.join(f.dir,name+'-names.json'));
    for(const [route,item] of [['',html],['app.js',js],['style.css',css]]){
     const result=await resolveArUrl('ar://'+name+'/'+route,{accessPolicy:'live',contentSources:'mesh-only',contentStore:store,snapshotStore:snapshots,signal:AbortSignal.timeout(10000)});
     assert.deepEqual(result.body,item.original);assert.equal(result.contentEncoding,encoding);assert.equal(result.bodyDecoded,true);assert.equal(result.meta.recovery,null);assert.equal(result.meta.contentSignatureVerified,true);
     assert.equal(result.meta.nameTargetId,root.id);assert.ok(result.meta.verification.rpcSources>=1);assert.equal(result.meta.sha256,crypto.createHash('sha256').update(item.payload).digest('hex'));
     const share=result.peerPayload.items.find(row=>row.dataId===item.id);assert.deepEqual(share.storedBytes,item.raw);
     assert.deepEqual(store.get(item.id),item.raw);assert.deepEqual((await verifyStoredContent(share.storedBytes,item.id)).payload,item.payload);
    }
    assert.ok(rpc.calls>0);assert.equal(snapshots.get(name).txId,root.id);
   }finally{await rpc.close();}
  }
 }finally{await server.close();}
});
