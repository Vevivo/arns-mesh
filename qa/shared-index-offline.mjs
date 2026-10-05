// Run inside a temporary network namespace with loopback only. Never isolates the live service.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {NameSnapshotStore,resolveSavedName} from '../src/name-snapshots.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {networkAuditSnapshot} from '../src/network-audit.mjs';
const provider=process.env.QA_PROVIDER_DATA,input=JSON.parse(fs.readFileSync(process.env.QA_INPUT_REPORT));
if(Object.keys(os.networkInterfaces()).some(x=>x!=='lo'))throw new Error('network_namespace_not_isolated');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-index-offline-')),results=[];
const peer=new MeshPeer({dataDir:path.join(temp,'peer'),locationsFile:path.join(temp,'locations.json'),snapshotStore:new NameSnapshotStore(path.join(provider,'name-snapshots.json')),allowRemoteFetch:false});
const keys=crypto.generateKeyPairSync('ed25519');peer.identity={privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'}),publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'})};peer.witnessPeerId=peerIdFromPublicKey(peer.identity.publicKeyPem);
let server;
try{
 for(const row of input.samples.filter(r=>r.meshPayloadMatches)){
  // Copy only public signed bytes obtained by the preceding real demand test.
  const file=path.join(provider,'peer/content',row.dataId+'.ans104');await peer.contentStore.put(row.dataId,fs.readFileSync(file));
 }
 server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
 const client=createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:server.address.port}],dhtEnabled:false,cacheOnly:true});
 const emptyNames=new NameSnapshotStore(path.join(temp,'empty-reader-names.json'));
 for(const row of input.samples.filter(r=>r.meshPayloadMatches)){
  const result={name:row.name,dataId:row.dataId};
  try{
   const name=await resolveSavedName(row.name,{store:emptyNames,client,trustedPeers:[peer.witnessPeerId],signal:AbortSignal.timeout(5000)});if(name.txId!==row.dataId)throw new Error('retained_binding_changed');
   const locations=await client.locateCandidates(row.dataId,{signal:AbortSignal.timeout(5000)});if(!locations.length)throw new Error('offline_index_miss');
   const data=await client.content(name.txId,{signal:AbortSignal.timeout(5000)});
   result.ok=crypto.createHash('sha256').update(data.payload).digest('hex')===row.payloadSha256;result.bytes=data.payload.length;result.observedAt=name.observedAt;result.currentStateVerified=false;
  }catch(error){result.ok=false;result.error=String(error.message);}
  results.push(result);
 }
 const audit=networkAuditSnapshot();if(audit.events.some(e=>e.type==='request'&&e.host!=='127.0.0.1'))throw new Error('non_loopback_request');
 const report={at:new Date().toISOString(),interfaces:Object.keys(os.networkInterfaces()),scope:'temporary same-host network namespace; retained name observations and previously acquired signed bytes; no live RPC/raw/publisher',results,requests:audit.requests,sharedIndex:peer.status().sharedIndex};fs.writeFileSync(process.env.QA_REPORT||'/tmp/mesh-shared-offline.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(results.length!==3||results.some(r=>!r.ok))process.exitCode=1;
}finally{await server?.close();fs.rmSync(temp,{recursive:true,force:true});}
