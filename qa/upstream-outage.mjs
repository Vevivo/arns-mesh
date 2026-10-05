import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer,queryDirectPeer} from '../src/direct-peer.mjs';
import {SnapshotRelay} from '../src/snapshot-relay.mjs';
import {verifyPeerEnvelope} from '../src/peer-directory.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {VerifiedContentStore,verifyStoredContent} from '../src/content-store.mjs';
import {configureRuntime} from '../apps/helper/runtime.mjs';
import {resolveArUrl,coreRoot} from '../apps/helper/core-adapter.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';
import {networkAuditSnapshot} from '../src/network-audit.mjs';
const mode=process.argv[2],dir=path.resolve(process.env.QA_OUTAGE_DIR);
const write=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2));
if(mode==='capture'){
 assert.ok(!fs.existsSync(dir),'Use a fresh evidence directory');
 fs.mkdirSync(path.join(dir,'public-content'),{recursive:true,mode:0o700});
 const provider=path.resolve(process.env.QA_PROVIDER_DATA);
 const sites=JSON.parse(fs.readFileSync(path.join(provider,'saved-sites.json')));
 const pins=JSON.parse(fs.readFileSync(path.join(provider,'peer/content/pins.json')));
 const upstream={rpc:JSON.parse(fs.readFileSync(path.join(provider,'solana-rpc-seeds.json'))),raw:JSON.parse(fs.readFileSync(path.join(provider,'arweave-peers.json')))};
 const names=[...new Set([...Object.keys(sites),'iainball','toon_boughtviatoonnode','ardrive-logo-2026'])];
 const endpoint={host:'127.0.0.1',port:Number(process.env.QA_PROVIDER_PORT)};
 const trusted=process.env.QA_TRUSTED_PEER;
 assert.match(trusted,/^[a-f0-9]{64}$/);
 const envelopes=[],samples=[],ids=new Set();
 for(const name of names){
  const row=sites[name];const sample={name,preparedStatus:row?.status||'not-prepared',scope:row?.scope||'root-only',expectedFiles:row?.total||1,preparedIds:pins[row?.pinGroup||name]||[],envelopeCount:0};
  for(const prepared of [false,true]){
   const env=await queryDirectPeer(endpoint,{op:'snapshot',name,witnessPeerIds:[trusted],...(prepared?{prepared:true}:{})},{signal:AbortSignal.timeout(5000)});
   if(env?.ok){const value=verifyPeerEnvelope(env);assert.equal(env.witnessPeerId,trusted);assert.equal(value.name,name);envelopes.push(env);ids.add(value.txId);sample.envelopeCount++;}
  }
  sample.preparedIds.forEach(id=>ids.add(id));samples.push(sample);
 }
 let bytes=0,copied=0;
 for(const id of ids)for(const ext of ['ans104','l1']){
  const source=path.join(provider,'peer/content',id+'.'+ext);
  if(!fs.existsSync(source))continue;
  const raw=fs.readFileSync(source);await verifyStoredContent(raw,id);
  fs.copyFileSync(source,path.join(dir,'public-content',id+'.'+ext));bytes+=raw.length;copied++;break;
 }
 write('capture-private.json',{at:new Date().toISOString(),trusted,envelopes,samples,upstream});
 console.log(JSON.stringify({capturedNames:samples.length,signedNameEnvelopes:envelopes.length,verifiedObjects:copied,bytes,productionModified:false}));
}else if(mode==='test'){
 const input=JSON.parse(fs.readFileSync(path.join(dir,'capture-private.json')));
 assert.deepEqual(Object.keys(os.networkInterfaces()),['lo'],'Run with unshare --net and loopback only');
 process.env.ARNS_MESH_DIRECT_ONLY='1';delete process.env.ARNS_SHARED_INDEX_DIR;
 const providerDir=path.join(dir,'isolated-supporter');
 fs.mkdirSync(path.join(providerDir,'content'),{recursive:true});
 for(const f of fs.readdirSync(path.join(dir,'public-content')))fs.copyFileSync(path.join(dir,'public-content',f),path.join(providerDir,'content',f));
 const peer=new MeshPeer({dataDir:providerDir,allowRemoteFetch:false,locationsFile:path.join(dir,'empty-locations.json'),storageLimits:{maxBytes:256*1024*1024}});
 const keys=crypto.generateKeyPairSync('ed25519');peer.identity={privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'}),publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'})};
 const {peerIdFromPublicKey}=await import('../src/common.mjs');peer.witnessPeerId=peerIdFromPublicKey(peer.identity.publicKeyPem);
 peer.snapshotRelay=new SnapshotRelay({file:path.join(dir,'relay.json'),trusted:()=>[input.trusted],scope:()=>({id:'isolated-outage-validation'})});
 for(const envelope of input.envelopes)peer.snapshotRelay.put(envelope,false);
 const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
 const connect=({host,port})=>JSON.parse(execFileSync(process.execPath,['--max-old-space-size=32','-e',"const net=require('node:net');const c=JSON.parse(process.argv[1]);const s=net.connect(c);let done=false;const end=(ok,error)=>{if(done)return;done=true;s.destroy();console.log(JSON.stringify({ok,error}));};s.setTimeout(1500,()=>end(false,'timeout'));s.on('connect',()=>end(true));s.on('error',e=>end(false,e.code));",JSON.stringify({host,port})],{encoding:'utf8',timeout:5000}));
 const endpoint=x=>typeof x==='string'?{host:x.slice(0,x.lastIndexOf(':')).replace(/^\[|\]$/g,''),port:Number(x.slice(x.lastIndexOf(':')+1))}:x;
 const report={schema:'arns-mesh-upstream-outage/v1',at:new Date().toISOString(),runtimeVersion:JSON.parse(fs.readFileSync(path.join(coreRoot,'package.json'))).version,interfaces:Object.keys(os.networkInterfaces()),samePhysicalHost:true,originalPublisherSignaturesPreserved:true,providerRemoteFetch:false,readerInitiallyEmpty:true,controls:[],samples:[],limits:['OS network namespace on one Linux host; not independent-provider failover','Content and name records were retained before isolation','This run verifies the desktop access engine and stored resources; GUI rendering is tested separately']};
 try{
  report.controls.push({kind:'local-mesh',...await connect({host:'127.0.0.1',port:server.address.port})});
  for(const [kind,values] of [['solana-rpc',input.upstream.rpc],['arweave',input.upstream.raw],['dns-tcp',[{host:endpoint(input.upstream.rpc[0]).host,port:53}]],['external-https',[{host:endpoint(input.upstream.rpc[0]).host,port:443}]]]){
   assert.ok(values.length,kind+' needs a configured control');
   for(const value of values.slice(0,2))report.controls.push({kind,...await connect(endpoint(value))});
  }
  assert.ok(report.controls[0].ok);assert.ok(report.controls.slice(1).every(c=>!c.ok));
  const readerDir=path.join(dir,'fresh-reader');assert.ok(!fs.existsSync(readerDir));fs.mkdirSync(readerDir);
  fs.writeFileSync(path.join(readerDir,'solana-rpc-seeds.json'),JSON.stringify(input.upstream.rpc));
  fs.writeFileSync(path.join(readerDir,'arweave-peers.json'),JSON.stringify(input.upstream.raw));
  fs.writeFileSync(path.join(readerDir,'arweave-peer-seeds.json'),JSON.stringify(input.upstream.raw));
  fs.writeFileSync(path.join(readerDir,'hyper-bootstrap.json'),'[]');
  fs.writeFileSync(path.join(readerDir,'mesh-ip-peers.json'),JSON.stringify(['127.0.0.1:'+server.address.port]));
  const runtime=configureRuntime(coreRoot,readerDir,{applyDefaultPeers:false,role:'client'});
  assert.equal(runtime.snapshots.names().length,0);
  const store=new VerifiedContentStore(path.join(readerDir,'content'));
  for(const sample of input.samples){
   const row={name:sample.name,preparedStatus:sample.preparedStatus,scope:sample.scope,expectedFiles:sample.expectedFiles,resources:[]};
   const at=Date.now();
   try{
    const result=await resolveArUrl('ar://'+sample.name,{snapshotStore:runtime.snapshots,contentStore:store,accessPolicy:'auto',trustedPeers:[input.trusted],signal:AbortSignal.timeout(18000),nameTimeoutMs:1200});
    assert.equal(result.meta.contentSignatureVerified,true);assert.ok(result.meta.recovery?.automatic);
    row.opened=true;row.contentType=result.contentType;row.bytes=result.body.length;row.sha256=result.meta.sha256;row.dataId=result.meta.dataId;row.recovery=result.meta.recovery.reason;row.contentSource=result.meta.contentSource;row.nameObservedAt=result.meta.nameObservedAt;
    const client=createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:server.address.port}],dhtEnabled:false,cacheOnly:true});
    try{for(const id of sample.preparedIds){try{const r=await fetchMeshContent(id,{client,contentStore:store,contentSources:'mesh-only',signal:AbortSignal.timeout(5000)});row.resources.push({id,verified:true,bytes:r.direct.payload.length});}catch(e){row.resources.push({id,verified:false,error:e.message.slice(0,180)});}}}finally{await client.stop();}
    row.preparedResourcesVerified=row.resources.filter(x=>x.verified).length;
    row.completePreparedSet=sample.preparedIds.length===sample.expectedFiles&&row.resources.every(x=>x.verified);
   }catch(e){row.opened=false;row.error=String(e.message).slice(0,400);}
   row.elapsedMs=Date.now()-at;report.samples.push(row);
   console.log(JSON.stringify({name:row.name,opened:row.opened,completePreparedSet:row.completePreparedSet,elapsedMs:row.elapsedMs}));
   write('outage-results.json',report);
  }
  report.requests=networkAuditSnapshot().requests;
  report.summary={names:report.samples.length,opened:report.samples.filter(x=>x.opened).length,completePreparedSets:report.samples.filter(x=>x.completePreparedSet).length,distinctMainObjects:new Set(report.samples.filter(x=>x.opened).map(x=>x.dataId)).size};
  assert.ok(report.samples.find(x=>x.name==='vevivo')?.opened,'vevivo must open');
  for(const row of report.samples.filter(x=>['document-saved','manifest-saved','linked-resources-saved'].includes(x.preparedStatus)))assert.ok(row.opened&&row.completePreparedSet,'Prepared site incomplete: '+row.name);
  report.passed=true;write('outage-results.json',report);console.log(JSON.stringify({passed:true,...report.summary}));
 }finally{await server.close();}
}else throw new Error('Use capture or test');
