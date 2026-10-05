// Read-only selection from the real catalog; no curated names or prepared locations.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {SharedIndex,sharedLocation} from '../src/shared-index.mjs';
import {LocationIndex} from '../src/location-index.mjs';
import {queryDirectPeer,parsePeerAddresses} from '../src/direct-peer.mjs';
import {verifyRecord} from '../src/common.mjs';
import {fetchDataItemDirect} from '../src/arweave-direct.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {configureNetworkAudit,networkAuditSnapshot} from '../src/network-audit.mjs';
const root=process.env.ARNS_SHARED_INDEX_DIR,provider=process.env.QA_PROVIDER_DATA;
if(!root||!provider)throw new Error('shared index and provider data required');
const report={startedAt:new Date().toISOString(),scope:'same-VPS reader using public numeric-IP peer endpoint; not a Windows GUI test',samples:[]};
const index=new SharedIndex(root),catalog=JSON.parse(fs.readFileSync(path.join(provider,'target-catalog.json')));
const known=new LocationIndex(path.join(provider,'locations.json'));
const hasContent=id=>['ans104','l1'].some(kind=>fs.existsSync(path.join(provider,'peer/content',id+'.'+kind))); 
const rows=Object.entries(catalog.targets).sort((a,b)=>crypto.createHash('sha256').update(a[0]).digest('hex').localeCompare(crypto.createHash('sha256').update(b[0]).digest('hex')));
const peers=parsePeerAddresses(process.env.QA_PEER_ADDRESS||'');if(peers.length!==1)throw new Error('QA_PEER_ADDRESS requires one numeric IP:port');const peer=peers[0],selected=[];
for(const [name,row] of rows){if(hasContent(row.dataId)||known.get(row.dataId))continue;const hint=await index.find(row.dataId);if(hint){selected.push({name,...row,hint});if(selected.length>=3)break;}}
report.selectedWithoutPreloading=selected.map(x=>({name:x.name,dataId:x.dataId,band:x.hint.sharedIndex.band}));
report.catalogTargets=rows.length;report.index=index.status();console.log(JSON.stringify({event:'samples-selected',...report}));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-shared-live-'));
try{
 configureNetworkAudit(temp);
 process.env.ARWEAVE_PEERS=path.join(provider,'arweave-peers.json');process.env.ARWEAVE_PEER_SEEDS=path.join(provider,'arweave-peer-seeds.json');
 const client=createSwarmMeshClient({directPeers:[peer],dhtEnabled:false,cacheOnly:true});
 for(const row of selected){
  const sample={name:row.name,dataId:row.dataId,band:row.hint.sharedIndex.band,preexistingContent:false,preexistingLocation:false};const start=Date.now();
  try{
   const reply=await queryDirectPeer(peer,{op:'location',dataId:row.dataId,cacheOnly:true},{timeoutMs:10000});
   if(!reply.ok||!verifyRecord(reply.recordJson,reply.signature,reply.witnessPublicKeyPem))throw new Error('peer_location_signature');
   const location=JSON.parse(reply.recordJson);if(location.rootTxId!==row.hint.rootTxId)throw new Error('peer_location_mismatch');sample.peerLocationMs=Date.now()-start;
   const result=await fetchDataItemDirect({dataId:row.dataId,location,seedsFile:process.env.ARWEAVE_PEERS,signal:AbortSignal.timeout(60000)});
   sample.rawVerifiedBytes=result.payload.length;sample.rawMs=Date.now()-start;sample.payloadSha256=crypto.createHash('sha256').update(result.payload).digest('hex');sample.contentType=result.tags?.find(t=>t.name.toLowerCase()==='content-type')?.value;
   // Ask normally for the same real ID: this is user-demand retrieval, not pinning.
   const demandClient=createSwarmMeshClient({directPeers:[peer],dhtEnabled:false});
   try{const mesh=await demandClient.content(row.dataId,{signal:AbortSignal.timeout(60000)});sample.meshVerifiedBytes=mesh.payload.length;sample.meshPayloadMatches=crypto.createHash('sha256').update(mesh.payload).digest('hex')===sample.payloadSha256;}catch(e){sample.meshError=String(e.message).slice(0,300);}
  }catch(e){sample.error=String(e.message).slice(0,600);}
  report.samples.push(sample);console.log(JSON.stringify({event:'sample-result',...sample}));
 }
 report.finishedAt=new Date().toISOString();report.audit=networkAuditSnapshot();fs.writeFileSync(process.env.QA_REPORT||'/tmp/mesh-shared-live.json',JSON.stringify(report,null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
