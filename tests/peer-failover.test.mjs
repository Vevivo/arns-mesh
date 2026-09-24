import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {signDataItem} from '@ardrive/turbo-upload';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {accessError} from '../src/access-error.mjs';
test('two loopback peer stores: one listener lost, remaining signed copy verifies (single host only)',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-failover-')),oldPeers=process.env.ARNS_IP_PEERS,oldCache=process.env.HYPER_PEER_CACHE;
 t.after(()=>{if(oldPeers)process.env.ARNS_IP_PEERS=oldPeers;else delete process.env.ARNS_IP_PEERS;if(oldCache)process.env.HYPER_PEER_CACHE=oldCache;else delete process.env.HYPER_PEER_CACHE;fs.rmSync(dir,{recursive:true,force:true});});
 const bootstrap=path.join(dir,'bootstrap.json');fs.writeFileSync(bootstrap,'[]');process.env.HYPER_PEER_CACHE=path.join(dir,'learned.json');
 const peers=[];
 for(const label of ['a','b']){
  const peer=new MeshPeer({dataDir:path.join(dir,label),locationsFile:path.join(dir,'locations.json'),allowRemoteFetch:false});
  const key=crypto.generateKeyPairSync('ed25519');peer.identity={publicKeyPem:key.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:key.privateKey.export({format:'pem',type:'pkcs8'})};peer.witnessPeerId=peerIdFromPublicKey(peer.identity.publicKeyPem);peers.push(peer);
 }
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'}),item=signDataItem(key,{data:Buffer.from('independently stored signed fixture'),tags:[]});
 for(const peer of peers)await peer.contentStore.put(item.idB64Url,item.binary);
 const servers=[];for(const peer of peers)servers.push(await startDirectPeerServer(peer,{host:'127.0.0.1',port:0}));
 process.env.ARNS_IP_PEERS=path.join(dir,'peers.json');fs.writeFileSync(process.env.ARNS_IP_PEERS,JSON.stringify(servers.map(s=>'127.0.0.1:'+s.address.port)));
 const client=createSwarmMeshClient({bootstrapFile:bootstrap,witnessPeerFile:path.join(dir,'witness.json')});
 try{
  const before=await client.content(item.idB64Url,{signal:AbortSignal.timeout(8000)});assert.equal(before.payload.toString(),'independently stored signed fixture');
  await servers[0].close();
  const after=await client.content(item.idB64Url,{signal:AbortSignal.timeout(8000)});assert.deepEqual(after.payload,before.payload);assert.ok(peers[1].contentChunksServed>0);
 }finally{await servers[1].close();await client.stop();}
});
test('user errors separate missing name from unavailable location without leaking operational addresses',()=>{
 const a=accessError(new Error('current_name_state_unavailable: account_not_found:secret-address'));
 const b=accessError(new Error('content_location_unavailable: peer 192.0.2.1:1234'));
 assert.equal(a.code,'name_account_not_found');assert.equal(b.code,'content_location_unavailable');assert.ok(!JSON.stringify(b).includes('192.0.2.1'));
});
