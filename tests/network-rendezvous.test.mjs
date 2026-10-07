import '../src/network-lockdown.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import createTestnet from 'hyperdht/testnet.js';
import {signRecord,peerIdFromPublicKey} from '../src/common.mjs';
import {NetworkRendezvous} from '../src/network-rendezvous.mjs';
import {PeerDiscovery} from '../src/peer-discovery.mjs';
import {NetworkConnection} from '../apps/helper/network-connection.mjs';
import {startDirectPeerServer,loadConfiguredPeers} from '../src/direct-peer.mjs';
import {readProfile} from '../apps/helper/network-profile.mjs';
import {encodeInvitation,networkPublicKey,signNetworkContinuity,invitationScope,networkId,connectionRecordHash} from '../src/network-invitation.mjs';
// This test starts a real local UDP DHT and HTTP supporter. It neither depends on
// public Internet bootstrap availability nor claims independent physical hosts.
test('fresh supporter appears after the original seed vanished; fresh same-code reader discovers it over numeric-IP rendezvous', {timeout:45000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-rendezvous-')),testnet=await createTestnet(5),bootstrap=testnet.nodes[0];
 let supporter,reader,direct;t.after(async()=>{await reader?.close();await supporter?.close();await direct?.close();await testnet.destroy();fs.rmSync(root,{recursive:true,force:true});});
 await bootstrap.fullyBootstrapped();
 const identity=crypto.generateKeyPairSync('ed25519'),publicKeyPem=identity.publicKey.export({format:'pem',type:'spki'}),privateKeyPem=identity.privateKey.export({format:'pem',type:'pkcs8'});
 const witnessPeerId=peerIdFromPublicKey(publicKeyPem),peer={identity:{publicKeyPem,privateKeyPem},witnessPeerId,requestsServed:0,_envelope(record){const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId,witnessPublicKeyPem:publicKeyPem,recordJson,signature:signRecord(recordJson,privateKeyPem)};},async _handleAsync(){return {ok:false,error:'fixture'};}};
 const authority=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'}),seeds=['127.0.0.1:1'],profile={schema:'arns-mesh-network-profile/v1',directPeers:seeds,rpcSources:['127.0.0.1:8899'],arweavePeers:[],trustedPeers:['a'.repeat(64)]};
 const definition=signNetworkContinuity({name:'Independent rendezvous',profile,seeds,local:true,bootstrap:['127.0.0.1:'+bootstrap.address().port]},authority),invitation={version:2,key:networkPublicKey(authority),seeds,local:true,definition},code=encodeInvitation(invitation);
 async function join(dir){const network=new NetworkConnection({dataDir:dir});const p=await network.inspect(code);await network.join(code,{expectedId:networkId(p.invitation.key),expectedRevision:p.payload.revision,expectedHash:connectionRecordHash(p.envelope,p.recovery)});return network;}
 const supporterDir=path.join(root,'new-supporter'),supporterNetwork=await join(supporterDir);
 supporter=new PeerDiscovery({dataDir:supporterDir,scope:()=>invitationScope(supporterNetwork.state.invitation),peers:()=>loadConfiguredPeers(path.join(supporterDir,'mesh-ip-peers.json')),identity:peer,listenPort:49740,advertise:'127.0.0.1:49740'});
 direct=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0,discovery:supporter});supporter.listenPort=direct.address.port;supporter.advertise='127.0.0.1:'+direct.address.port;
 await supporter.rendezvous.start();await supporter.rendezvous.discovery.flushed();
 const readerDir=path.join(root,'fresh-reader'),network=await join(readerDir);
 reader=new PeerDiscovery({dataDir:readerDir,scope:()=>invitationScope(network.state.invitation),peers:()=>loadConfiguredPeers(path.join(readerDir,'mesh-ip-peers.json'))});
 const deadline=Date.now()+20000;
 do{await reader.sync();}while(!reader.directory.addresses().length&&Date.now()<deadline);
 assert.deepEqual(reader.directory.addresses(),[{host:'127.0.0.1',port:direct.address.port}]);
 assert.deepEqual(readProfile(readerDir).trustedPeers,['a'.repeat(64)],'discovery must not promote a new supporter to name authority');
 assert.notEqual(witnessPeerId,'a'.repeat(64));assert.equal(fs.existsSync(path.join(supporterDir,'network-authority.private.json')),false);
 assert.equal(network.status().continuity,true);assert.ok(reader.rendezvous.received>0);
});

test('stopping again while a previous DHT close is pending cancels a queued restart',async()=>{
 let release,created=0;const scope={id:'b'.repeat(64),local:true,bootstrap:['127.0.0.1:49737']};
 const rendezvous=new NetworkRendezvous({scope:()=>scope,makeDht:()=>{created++;throw new Error('A cancelled start must not create a UDP node');}});
 rendezvous.swarm={destroy:()=>new Promise(resolve=>release=resolve)};
 const closing=rendezvous.close(),starting=rendezvous.start();
 const stoppedAgain=rendezvous.close();release();
 await Promise.all([closing,stoppedAgain]);assert.equal(await starting,false);
 assert.equal(created,0);assert.equal(rendezvous.status().running,false);
});

test('a scope change during DHT shutdown does not restart the revoked network',async()=>{
 let release,created=0,scope={id:'b'.repeat(64),local:true,bootstrap:['127.0.0.1:49737']};
 const rendezvous=new NetworkRendezvous({scope:()=>scope,makeDht:()=>{created++;throw new Error('A revoked start must not create a UDP node');}});
 rendezvous.swarm={destroy:()=>new Promise(resolve=>release=resolve)};
 const closing=rendezvous.close(),starting=rendezvous.start();scope=null;release();
 await closing;assert.equal(await starting,false);assert.equal(created,0);
});

test('cancelling sync while shutdown is pending cannot leave a new DHT running',async()=>{
 let release,created=0;const scope={id:'b'.repeat(64),local:true,bootstrap:['127.0.0.1:49737']},controller=new AbortController();
 const rendezvous=new NetworkRendezvous({scope:()=>scope,makeDht:()=>{created++;throw new Error('An aborted sync must not create a UDP node');}});
 rendezvous.swarm={destroy:()=>new Promise(resolve=>release=resolve)};
 const closing=rendezvous.close(),sync=rendezvous.sync({signal:controller.signal});
 controller.abort(new Error('User selected Saved mode'));release();
 await closing;await assert.rejects(sync,/Saved mode/);assert.equal(created,0);
});
