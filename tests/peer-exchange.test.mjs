import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {signDataItem} from '@ardrive/turbo-upload';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {PeerDiscovery} from '../src/peer-discovery.mjs';
import {PeerDirectory,PEER_TTL,discoveryAddress,verifyAdvertisement} from '../src/peer-directory.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {SnapshotRelay} from '../src/snapshot-relay.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';

const network={id:'c'.repeat(64),local:true};
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-exchange-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function identity(dir){const p=new MeshPeer({dataDir:dir,locationsFile:path.join(dir,'locations.json'),allowRemoteFetch:false});const key=crypto.generateKeyPairSync('ed25519');p.identity={publicKeyPem:key.publicKey.export({type:'spki',format:'pem'}),privateKeyPem:key.privateKey.export({type:'pkcs8',format:'pem'})};p.witnessPeerId=peerIdFromPublicKey(p.identity.publicKeyPem);return p;}
async function supporter(dir,seeds=[]){const peer=identity(dir);const discovery=new PeerDiscovery({dataDir:dir,scope:()=>network,peers:()=>seeds,identity:peer,listenPort:1});const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0,discovery});discovery.listenPort=server.address.port;return {peer,discovery,server,address:{host:'127.0.0.1',port:server.address.port},async close(){discovery.close();await server.close();}};}
function ad(peer,{now=Date.now(),sequence=1,address='127.0.0.1:49741',scope=network}={}){return peer._envelope({schema:'arns-mesh-peer/v1',networkId:scope.id,peerId:peer.witnessPeerId,address,sequence,issuedAt:now,expiresAt:now+PEER_TTL,capabilities:['content','peers']});}

test('an existing reader learns a later supporter, restarts, and verifies its content after the seed stops',async t=>{
 const dir=setup(t),a=await supporter(path.join(dir,'a'));let aClosed=false;t.after(async()=>{if(!aClosed)await a.close();});
 const reader=new PeerDiscovery({dataDir:path.join(dir,'reader'),scope:()=>network,peers:()=>[a.address]});t.after(()=>reader.close());
 await reader.sync();assert.equal(reader.directory.addresses().length,0);
 const b=await supporter(path.join(dir,'b'),[a.address]);t.after(()=>b.close());
 await b.discovery.sync();assert.equal(b.discovery.status().acceptedBy,1);assert.equal(a.discovery.directory.addresses().length,1);
 await reader.sync();assert.ok(reader.directory.addresses().some(p=>p.port===b.address.port));
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'}),item=signDataItem(key,{data:Buffer.from('late supporter verified bytes'),tags:[]});
 // Actual content replication over the protocol, not a shared data directory.
 await a.peer.contentStore.put(item.idB64Url,item.binary);
 const replicator=createSwarmMeshClient({directPeers:[a.address],dhtEnabled:false});const downloaded=await replicator.content(item.idB64Url);await b.peer.contentStore.put(item.idB64Url,downloaded.rawItem||downloaded.storedBytes);
 await a.close();aClosed=true;
 const restarted=new PeerDiscovery({dataDir:path.join(dir,'reader'),scope:()=>network,peers:()=>[a.address]});t.after(()=>restarted.close());
 const client=createSwarmMeshClient({directPeers:[a.address],directory:restarted.directory,dhtEnabled:false});
 const result=await client.content(item.idB64Url,{signal:AbortSignal.timeout(8000)});assert.equal(result.payload.toString(),'late supporter verified bytes');assert.ok(b.peer.contentBytesServed>0);
 // The surviving supporter also teaches a second reader the reachable route.
 const c=new PeerDiscovery({dataDir:path.join(dir,'reader-c'),scope:()=>network,peers:()=>[b.address]});t.after(()=>c.close());await c.sync();assert.ok(c.directory.addresses().some(p=>p.port===b.address.port));
});

test('discovery rejects forged, expired, wrong-network and rollback records without calling private targets',async t=>{
 const dir=setup(t),peer=identity(path.join(dir,'signer')),now=Date.now();let calls=0;
 const discovery=new PeerDiscovery({dataDir:dir,scope:()=>({id:network.id,local:false}),peers:()=>[],request:async()=>{calls++;throw new Error('must not probe');}});t.after(()=>discovery.close());
 for(const host of ['127.0.0.1','::1',[169,254,169,254].join('.'),[10,0,0,1].join('.')])await assert.rejects(discovery.verifyReachable(ad(peer,{address:(host.includes(':')?'['+host+']':host)+':80'})),/private_discovery/);
 assert.equal(calls,0);assert.throws(()=>discoveryAddress('example.com:80',network));
 const directory=new PeerDirectory({file:path.join(dir,'directory.json'),scope:()=>network});
 const first=ad(peer,{sequence:2});directory.accept(first);
 assert.throws(()=>directory.accept(ad(peer,{sequence:1})),/rollback/);
 assert.throws(()=>directory.accept(ad(peer,{sequence:2,address:'127.0.0.1:49742'})),/conflict/);
 const forged={...first,signature:'A'.repeat(86)};assert.throws(()=>verifyAdvertisement(forged,network),/signature/);
 assert.throws(()=>verifyAdvertisement(ad(peer,{now:now-PEER_TTL-1}),network),/expired/);
 assert.throws(()=>verifyAdvertisement(first,{...network,id:'d'.repeat(64)}),/network/);
 const before=directory.rows.size;for(let i=0;i<5;i++){const other=identity(path.join(dir,'other'+i));try{directory.accept(ad(other,{address:'127.0.0.1:'+(50000+i)}));}catch{}}
 assert.equal(directory.rows.size,4);assert.ok(directory.rows.size>before);
});

test('inbound announcements require source-address matching and a live nonce signature from the advertised identity',async t=>{
 const dir=setup(t),a=await supporter(path.join(dir,'a')),b=await supporter(path.join(dir,'b'));t.after(()=>a.close());t.after(()=>b.close());
 const envelope=ad(b.peer,{address:'127.0.0.1:'+b.address.port});
 let r=await a.discovery.handle({op:'peers',networkId:network.id,announce:envelope},{remoteAddress:'127.0.0.2'});assert.equal(r.accepted,false);assert.match(r.error,/source_address/);
 const impostor=identity(path.join(dir,'impostor'));
 r=await a.discovery.handle({op:'peers',networkId:network.id,announce:ad(impostor,{address:'127.0.0.1:'+b.address.port})},{remoteAddress:'127.0.0.1'});assert.equal(r.accepted,false);assert.match(r.error,/identity_mismatch/);
 r=await a.discovery.handle({op:'peers',networkId:network.id,announce:envelope},{remoteAddress:'127.0.0.1'});assert.equal(r.accepted,true);
});

test('a discovered mirror relays the original trusted name signature without becoming a name authority',async t=>{
 const dir=setup(t),a=await supporter(path.join(dir,'a')),b=await supporter(path.join(dir,'b'));let closed=false;t.after(async()=>{if(!closed)await a.close();});t.after(()=>b.close());
 a.peer.snapshotStore=new NameSnapshotStore(path.join(dir,'names.json'));
 const snap={schema:'arns-mesh-name-snapshot/v1',name:'retained',txId:'A'.repeat(43),antId:'1'.repeat(32),observedAt:new Date().toISOString(),slot:100,ttlSeconds:60};a.peer.snapshotStore.put(snap,{kind:'local-rpc'});
 const trust=[a.peer.witnessPeerId];const relay=new SnapshotRelay({file:path.join(dir,'relay.json'),trusted:()=>trust,scope:()=>network});b.peer.snapshotRelay=relay;
 await relay.sync({names:['retained'],peers:[a.address],signal:AbortSignal.timeout(5000)});assert.equal(relay.status().records,1);
 await a.close();closed=true;
 const client=createSwarmMeshClient({directPeers:[b.address],dhtEnabled:false});const r=await client.snapshot('retained',{trustedPeers:trust});assert.equal(r.record.txId,snap.txId);assert.equal(r.providers[0].witnessPeerId,a.peer.witnessPeerId);
 assert.ok(!trust.includes(b.peer.witnessPeerId));
 await assert.rejects(client.snapshot('retained',{trustedPeers:[b.peer.witnessPeerId]}));
 assert.throws(()=>relay.put(a.peer._envelope({...snap,slot:99})),/rollback/);
 trust.length=0;assert.equal(relay.reply({name:'retained'}),null);
});

test('fast signed but invalid content loses to verified bytes and the valid route is preferred next time',async t=>{
 const dir=setup(t),bad=await supporter(path.join(dir,'bad')),good=await supporter(path.join(dir,'good'));t.after(()=>bad.close());t.after(()=>good.close());
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'}),item=signDataItem(key,{data:Buffer.from('verified winner'),tags:[]});await good.peer.contentStore.put(item.idB64Url,item.binary);
 let badRequests=0;const corrupt=Buffer.from('not an Arweave signed item');
 bad.peer._handleAsync=async req=>{badRequests++;return bad.peer._envelope({dataId:req.dataId,offset:0,total:corrupt.length,sha256:crypto.createHash('sha256').update(corrupt).digest('hex'),data:corrupt.toString('base64')});};
 const directory=new PeerDirectory({file:path.join(dir,'routes.json'),scope:()=>network}),client=createSwarmMeshClient({directPeers:[bad.address,good.address],directory,dhtEnabled:false});
 const result=await client.content(item.idB64Url);assert.equal(result.payload.toString(),'verified winner');assert.ok(badRequests>0);
 const count=badRequests;assert.equal((await client.content(item.idB64Url)).payload.toString(),'verified winner');assert.equal(badRequests,count,'verified content affinity starts the useful route first');
 assert.equal(directory.rank([bad.address,good.address],item.idB64Url)[0].port,good.address.port);
});

test('discovery scope changes clear old announcements and successful admissions',async t=>{
 const dir=setup(t);let scope=network;const peer=identity(path.join(dir,'peer')),discovery=new PeerDiscovery({dataDir:dir,scope:()=>scope,peers:()=>[],identity:peer,listenPort:49740,advertise:'127.0.0.1:49740'});t.after(()=>discovery.close());
 discovery.self();discovery.accepted('127.0.0.1:49741');assert.equal(discovery.status().acceptedBy,1);
 scope={...network,id:'d'.repeat(64)};assert.equal(discovery.status().address,null);assert.equal(discovery.status().acceptedBy,0);assert.equal(JSON.parse(discovery.self().recordJson).networkId,scope.id);
});
