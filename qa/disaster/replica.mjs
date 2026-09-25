// Real public content is verified before a separate cache-only process serves it.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {MeshPeer} from '../../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../../src/direct-peer.mjs';
import {NameSnapshotStore} from '../../src/name-snapshots.mjs';
import {configureNetworkAudit,networkAuditSnapshot} from '../../src/network-audit.mjs';
const dir=path.resolve(process.env.QA_REPLICA_DIR),mode=process.argv[2];
fs.mkdirSync(dir,{recursive:true});
process.env.ARNS_MESH_DIRECT_ONLY='1';
if(mode==='prepare-index'){
 // Run before origin isolation. Retain metadata through the same production
 // replication function used by catalog/supporter peers, using signed content
 // obtained during the first Windows phase. No gateway preparation is run here.
 const {applyProfile,validateProfile}=await import('../../apps/helper/network-profile.mjs');
 const {configureRuntime}=await import('../../apps/helper/runtime.mjs');
 const {coreRoot}=await import('../../apps/helper/core-adapter.mjs');
 const {VerifiedContentStore}=await import('../../src/content-store.mjs');
 const {replicateLocationHint}=await import('../../src/location-replication.mjs');
 const {createSwarmMeshClient}=await import('../../src/swarm-client.mjs');
 const profile=validateProfile(JSON.parse(process.env.MESH_QA_PROFILE));delete process.env.MESH_QA_PROFILE;
 applyProfile(dir,{...profile,arweavePeers:[]});configureRuntime(coreRoot,dir,{role:'index'});
 const store=new VerifiedContentStore(path.join(process.env.QA_SEED_DIR,'content'));
 const locationsFile=path.join(dir,'locations.json');
 const client=createSwarmMeshClient({dhtEnabled:false,cacheOnly:true});
 const rows=[];
 for(const {dataId} of store.stats().files){
  const copied=await replicateLocationHint(dataId,{client,contentStore:store,locationsFile,timeoutMs:5000});
  rows.push({dataId,...copied});
 }
 fs.writeFileSync(path.join(dir,'seed-report.json'),JSON.stringify({fixture:false,preparedFrom:'Signed routing replies from original Mesh peer before outage',samePhysicalHost:true,contentCopied:0,rows}));
 console.log(JSON.stringify({event:'routing-replicated',rows}));
}else if(mode==='seed'){
 const {applyProfile,validateProfile}=await import('../../apps/helper/network-profile.mjs');
 const {configureRuntime}=await import('../../apps/helper/runtime.mjs');
 const {resolveArUrl,coreRoot}=await import('../../apps/helper/core-adapter.mjs');
 const {SitePinner}=await import('../../src/site-pinner.mjs');
 const profile=validateProfile(JSON.parse(process.env.MESH_QA_PROFILE));
 const secrets=[...profile.directPeers,...profile.rpcSources,...profile.arweavePeers].flatMap(x=>[x,x.slice(0,x.lastIndexOf(':'))]);
 const clean=s=>secrets.reduce((a,v)=>a.split(v).join('[operator-endpoint]'),String(s));
 delete process.env.MESH_QA_PROFILE;
 applyProfile(dir,{...profile,arweavePeers:[]});
 const runtime=configureRuntime(coreRoot,dir,{role:'client'});
 const peer=new MeshPeer({dataDir:path.join(dir,'peer'),allowRemoteFetch:false,snapshotStore:runtime.snapshots});
 const pinner=new SitePinner({file:path.join(dir,'saved-sites.json'),snapshots:runtime.snapshots,contentStore:peer.contentStore});
 const rows=[];
 for(const name of ['vevivo','internetfireplace','permahistory','kh-laboratory']){
  try{
   const result=await resolveArUrl('ar://'+name,{contentStore:peer.contentStore,snapshotStore:runtime.snapshots,signal:AbortSignal.timeout(90000)});
   assert.equal(result.meta.contentSignatureVerified,true);
   const pin=await pinner.start(name);
   rows.push({name,dataId:result.meta.dataId,rootDataId:result.meta.nameTargetId,sha256:result.meta.sha256,signatureVerified:true,pinStatus:pin.status,saved:pin.saved,total:pin.total});
  }catch(e){rows.push({name,error:clean(e.message).slice(0,1000)});}
 }
 fs.writeFileSync(path.join(dir,'seed-report.json'),JSON.stringify({fixture:false,preparedFromExistingOperator:true,rows}));
 // The serving process has no upstream connection profile or location catalog.
 for(const f of ['mesh-ip-peers.json','solana-rpc-seeds.json','arweave-peers.json','arweave-peer-seeds.json','hyper-bootstrap.json'])fs.writeFileSync(path.join(dir,f),'[]');
 assert.ok(rows.every(r=>r.signatureVerified),'All four real names must be replicated');
 console.log(JSON.stringify({event:'replicated',rows}));
}else if(mode==='serve'){
 // Install the production network policy; the cache-only peer never fetches.
 await import('../../src/network-lockdown.mjs');
 configureNetworkAudit(path.join(dir,'serving-audit'));
 const snapshots=new NameSnapshotStore(path.join(dir,'name-snapshots.json'));
 const peer=new MeshPeer({dataDir:path.join(dir,'peer'),allowRemoteFetch:false,snapshotStore:snapshots,locationsFile:path.join(dir,'locations.json')});
 await peer.start();
 const port=Number(process.env.QA_REPLICA_PORT||49741);
 const server=await startDirectPeerServer(peer,{host:'0.0.0.0',port});
 const reportFile=path.join(dir,'serving-report.json');
 const save=()=>fs.writeFileSync(reportFile,JSON.stringify({replica:process.env.QA_REPLICA_ID,remoteFetchEnabled:peer.allowRemoteFetch,witnessPeerId:peer.witnessPeerId,requestsServed:peer.requestsServed,contentFiles:peer.contentStore.stats().files.length,contentChunksServed:peer.contentChunksServed,contentBytesServed:peer.contentBytesServed,network:networkAuditSnapshot(),seed:JSON.parse(fs.readFileSync(path.join(dir,'seed-report.json')))}));
 save();fs.writeFileSync(path.join(dir,'ready.json'),JSON.stringify({host:process.env.QA_PUBLIC_IP,port:server.address.port,witnessPeerId:peer.witnessPeerId,replica:process.env.QA_REPLICA_ID,fixture:false}));
 const timer=setInterval(save,1000);
 const stop=async()=>{clearInterval(timer);save();await server.close();await peer.stop();process.exit(0);};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);setTimeout(stop,18*60*1000).unref();
}else throw new Error('Expected seed, prepare-index or serve');
