// Disposable loopback protocol fixture. No production identities or live-chain claims.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import createTestnet from 'hyperdht/testnet.js';
import {seed} from './seed-saved-fixture.mjs';
import {MeshPeer} from '../../apps/peer/embedded-peer.mjs';
import {NameSnapshotStore} from '../../src/name-snapshots.mjs';
import {SnapshotRelay} from '../../src/snapshot-relay.mjs';
import {PeerDiscovery} from '../../src/peer-discovery.mjs';
import {startDirectPeerServer,loadConfiguredPeers} from '../../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../../src/swarm-client.mjs';
import {peerIdFromPublicKey,signRecord} from '../../src/common.mjs';
import {NetworkConnection} from '../../apps/helper/network-connection.mjs';
import {mirrorAcceptedMembership,readNetworkPublication,readNetworkRecovery} from '../../apps/helper/network-publication.mjs';
import {encodeInvitation,networkPublicKey,signNetworkContinuity,invitationScope,networkId,connectionRecordHash} from '../../src/network-invitation.mjs';
const output=path.resolve(process.env.QA_OUTPUT),provider=path.join(output,'new-supporter'),seedAddress='127.0.0.1:1';
fs.mkdirSync(output,{recursive:true});
assert.ok(!fs.existsSync(provider),'Fixture supporter directory must be fresh');
process.env.ARNS_MESH_DIRECT_ONLY='1';
let testnet,discovery,server,reader,timer,stopping=false,identityChecks=0;
const absent=()=>new Promise((resolve,reject)=>{
 const socket=net.connect({host:'127.0.0.1',port:1});socket.setTimeout(1500);
 socket.once('connect',()=>{socket.destroy();reject(new Error('Original-seed fixture port unexpectedly accepts connections'));});
 socket.once('error',()=>resolve(true));socket.once('timeout',()=>{socket.destroy();reject(new Error('Original-seed absence probe timed out'));});
});
async function join(dir,code){
 const network=new NetworkConnection({dataDir:dir});const preview=await network.inspect(code);
 await network.join(code,{expectedId:networkId(preview.invitation.key),expectedRevision:preview.payload.revision,expectedHash:connectionRecordHash(preview.envelope,preview.recovery)});
 return network;
}
async function cleanup(){
 if(stopping)return;stopping=true;clearInterval(timer);
 await reader?.close();await discovery?.close();await server?.close();await testnet?.destroy();
}
try{
 await absent();
 const content=await seed(provider),snapshots=new NameSnapshotStore(path.join(provider,'name-snapshots.json'));
 testnet=await createTestnet(5);const bootstrap=testnet.nodes[0];await bootstrap.fullyBootstrapped();
 const publisher=crypto.generateKeyPairSync('ed25519'),publisherPublic=publisher.publicKey.export({format:'pem',type:'spki'}),publisherPrivate=publisher.privateKey.export({format:'pem',type:'pkcs8'}),publisherId=peerIdFromPublicKey(publisherPublic);
 const authority=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});
 const profile={schema:'arns-mesh-network-profile/v1',directPeers:[seedAddress],rpcSources:[seedAddress],arweavePeers:[],trustedPeers:[publisherId]};
 const definition=signNetworkContinuity({name:'QA independent supporter',profile,seeds:[seedAddress],local:true,bootstrap:['127.0.0.1:'+bootstrap.address().port]},authority);
 const invitation={version:2,key:networkPublicKey(authority),seeds:[seedAddress],local:true,definition},code=encodeInvitation(invitation);
 const network=await join(provider,code);assert.equal(network.status().continuity,true);mirrorAcceptedMembership(provider,network);
 const peer=new MeshPeer({dataDir:provider,allowRemoteFetch:false,locationsFile:path.join(output,'empty-locations.json')});
 const identity=crypto.generateKeyPairSync('ed25519');peer.identity={publicKeyPem:identity.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:identity.privateKey.export({format:'pem',type:'pkcs8'})};peer.witnessPeerId=peerIdFromPublicKey(peer.identity.publicKeyPem);
 assert.notEqual(peer.witnessPeerId,publisherId,'A newly discovered supporter is not the accepted name publisher');
 peer.snapshotRelay=new SnapshotRelay({file:path.join(provider,'snapshot-relay.json'),trusted:()=>[publisherId],scope:()=>invitationScope(invitation)});
 for(const prepared of [false,true]){
  const recordJson=JSON.stringify({...snapshots.exportLocal('mesh-qa'),...(prepared?{prepared:true}:{})});
  peer.snapshotRelay.put({ok:true,witnessPeerId:publisherId,witnessPublicKeyPem:publisherPublic,recordJson,signature:signRecord(recordJson,publisherPrivate)});
 }
 discovery=new PeerDiscovery({dataDir:provider,scope:()=>invitationScope(invitation),peers:()=>loadConfiguredPeers(path.join(provider,'mesh-ip-peers.json')),identity:peer,listenPort:1,advertise:'127.0.0.1:1'});
 const handle=discovery.handle.bind(discovery);discovery.handle=async(req,options)=>{if(req.op==='peer-check')identityChecks++;return handle(req,options);};
 server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0,discovery,networkAnnouncement:()=>readNetworkPublication(provider),networkRecovery:()=>readNetworkRecovery(provider)});
 discovery.listenPort=server.address.port;discovery.advertise='127.0.0.1:'+server.address.port;
 await discovery.rendezvous.start();await discovery.rendezvous.discovery.flushed();
 const status=()=>({originalSeed:seedAddress,originalSeedNeverStarted:true,provider:'127.0.0.1:'+server.address.port,publisherId,providerId:peer.witnessPeerId,providerJoinedWithoutOriginal:true,privateAuthorityFileOnProvider:fs.existsSync(path.join(provider,'network-authority.private.json')),remoteFetch:peer.allowRemoteFetch,identityChecks,contentChunksServed:peer.contentChunksServed,contentBytesServed:peer.contentBytesServed,requestsServed:peer.requestsServed,realSignedFiles:true,realPublicContent:false});
 const save=()=>fs.writeFileSync(path.join(output,'serving-summary.json'),JSON.stringify(status(),null,2));save();timer=setInterval(save,500);
 const ready={ready:true,code,networkId:networkId(invitation.key),name:content.name,manifest:content.manifest,files:content.items,...status()};
 if(process.argv.includes('--smoke')){
  const dir=path.join(output,'smoke-reader'),joined=await join(dir,code);
  reader=new PeerDiscovery({dataDir:dir,scope:()=>invitationScope(joined.state.invitation),peers:()=>loadConfiguredPeers(path.join(dir,'mesh-ip-peers.json'))});
  const deadline=Date.now()+20000;do{await reader.sync();}while(!reader.directory.addresses().length&&Date.now()<deadline);
  assert.deepEqual(reader.directory.addresses(),[{host:'127.0.0.1',port:server.address.port}]);assert.ok(identityChecks>0);
  const client=createSwarmMeshClient({directPeers:reader.directory.addresses(),dhtEnabled:false,cacheOnly:true});
  try{
   const binding=await client.snapshot(content.name,{trustedPeers:[publisherId],signal:AbortSignal.timeout(5000)});assert.equal(binding.record.txId,content.manifest);
   const manifest=await client.content(content.manifest,{cacheOnly:true,signal:AbortSignal.timeout(5000)});
   const htmlId=JSON.parse(manifest.payload).paths['index.html'].id;
   const html=await client.content(htmlId,{cacheOnly:true,signal:AbortSignal.timeout(5000)});
   assert.match(html.payload.toString(),/A verified page, opened locally/);
  }finally{await client.stop();}
  await absent();save();console.log(JSON.stringify({smokePassed:true,...status()}));await cleanup();
 }else{
  process.send?.(ready);
  process.on('message',async message=>{try{
   if(message==='status'){await absent();save();process.send?.({status:status()});}
   if(message==='stop'){await absent();save();await cleanup();process.exit(0);}
  }catch(error){process.send?.({fixtureError:error.message});console.error(error);await cleanup();process.exit(1);}});
  process.on('disconnect',()=>void cleanup().finally(()=>process.exit(0)));
 }
}catch(error){console.error(error.stack);await cleanup();process.exitCode=1;}
