import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {MeshPeer} from '../../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer,parsePeerAddresses,queryDirectPeer} from '../../src/direct-peer.mjs';
import {verifyPeerEnvelope} from '../../src/peer-directory.mjs';
import {SnapshotRelay} from '../../src/snapshot-relay.mjs';
import {VerifiedContentStore} from '../../src/content-store.mjs';
import {createSwarmMeshClient} from '../../src/swarm-client.mjs';
import {discoverArweaveReferences} from '../../src/arweave-references.mjs';
import {manifestTargetIds} from '../../src/manifest-path.mjs';
import {applyProfile,validateProfile} from '../../apps/helper/network-profile.mjs';
import {peerIdFromPublicKey} from '../../src/common.mjs';
const dir=path.resolve(process.env.QA_OUTPUT),mode=process.argv[2];
const names=['vevivo','bilolbabagate','bionica','ardrive-logo-2026'];
process.env.ARNS_MESH_DIRECT_ONLY='1';
if(mode==='seed'){
 fs.mkdirSync(dir,{recursive:true});
 const profile=validateProfile(JSON.parse(process.env.MESH_QA_PROFILE));delete process.env.MESH_QA_PROFILE;
 assert.ok(profile.trustedPeers?.length,'The private QA profile must contain accepted name publishers');
 const peers=profile.directPeers.flatMap(parsePeerAddresses),envelopes=[],rows=[];
 const store=new VerifiedContentStore(path.join(dir,'provider','content'));
 const client=createSwarmMeshClient({directPeers:peers,dhtEnabled:false,cacheOnly:true});
 try{
  for(const name of names){
   let record;
   for(const p of peers){try{const env=await queryDirectPeer(p,{op:'snapshot',name,witnessPeerIds:profile.trustedPeers},{signal:AbortSignal.timeout(10000)});const r=verifyPeerEnvelope(env);assert.ok(profile.trustedPeers.includes(env.witnessPeerId));assert.equal(r.name,name);envelopes.push(env);record=r;break;}catch{}}
   assert.ok(record,'No trusted retained name: '+name);
   const ids=[record.txId],seen=new Set(ids),files=[];
   for(let i=0;i<ids.length;i++){
    assert.ok(ids.length<=64,'Bounded acceptance corpus');
    const item=await client.content(ids[i],{signal:AbortSignal.timeout(25000),cacheOnly:true});
    await store.put(ids[i],item.storedBytes||item.rawItem);
    files.push({dataId:ids[i],bytes:item.payload.length,sha256:crypto.createHash('sha256').update(item.payload).digest('hex')});
    const children=discoverArweaveReferences(item).ids;
    if(item.tags?.some(t=>t.name.toLowerCase()==='content-type'&&t.value.includes('application/x.arweave-manifest')))children.push(...manifestTargetIds(JSON.parse(item.payload)));
    for(const id of children)if(!seen.has(id)){seen.add(id);ids.push(id);}
   }
   rows.push({name,target:record.txId,files});
  }
 }finally{await client.stop();}
 fs.writeFileSync(path.join(dir,'seed-private.json'),JSON.stringify({profile,envelopes,rows}));
 fs.writeFileSync(path.join(dir,'seed-summary.json'),JSON.stringify({realPublicContent:true,cacheOnlyCapture:true,rows},null,2));
 console.log(JSON.stringify({seeded:names.length,files:store.stats().files.length,bytes:store.stats().bytes}));
}else if(mode==='serve'){
 const input=JSON.parse(fs.readFileSync(path.join(dir,'seed-private.json')));
 const peer=new MeshPeer({dataDir:path.join(dir,'provider'),allowRemoteFetch:false,locationsFile:path.join(dir,'empty-locations.json')});
 const keys=crypto.generateKeyPairSync('ed25519');peer.identity={privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'}),publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'})};peer.witnessPeerId=peerIdFromPublicKey(peer.identity.publicKeyPem);
 peer.snapshotRelay=new SnapshotRelay({file:path.join(dir,'relay-unused.json'),trusted:()=>input.profile.trustedPeers,scope:()=>({id:'public-content-outage-test'})});
 for(const env of input.envelopes)peer.snapshotRelay.put(env,false);
 const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
 const reader=path.join(dir,'fresh-user');
 assert.ok(!fs.existsSync(reader),'Every GUI run starts without reader names or content');
 applyProfile(reader,{...input.profile,directPeers:['127.0.0.1:'+server.address.port]});
 fs.writeFileSync(path.join(dir,'ready-private.json'),JSON.stringify({port:server.address.port,names,profile:input.profile}));
 const save=()=>fs.writeFileSync(path.join(dir,'serving-summary.json'),JSON.stringify({remoteFetch:false,originalPublisherSignaturesPreserved:true,requestsServed:peer.requestsServed,contentChunksServed:peer.contentChunksServed,contentBytesServed:peer.contentBytesServed}));
 const timer=setInterval(save,1000);save();
 process.on('message',async m=>{if(m==='stop'){clearInterval(timer);save();await server.close();process.exit(0);}});
}else throw new Error('Use seed or serve');
