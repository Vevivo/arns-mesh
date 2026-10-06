// Keep core transport lockdown in the fixture peer process, separate from the
// Playwright/CDP driver. The packaged application's restrictions stay intact.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {seed} from './seed-saved-fixture.mjs';
import {SearchPublisher,TopicSearchPublisher} from '../../src/search-catalog.mjs';
import {NameSnapshotStore} from '../../src/name-snapshots.mjs';
import {VerifiedContentStore} from '../../src/content-store.mjs';
import {peerIdFromPublicKey,signRecord} from '../../src/common.mjs';
import {startDirectPeerServer} from '../../src/direct-peer.mjs';
import {PeerDiscovery} from '../../src/peer-discovery.mjs';
import {publishNetwork,readNetworkPublication,readNetworkRecovery,peerNetworkScope} from '../../apps/helper/network-publication.mjs';
import {NetworkConnection} from '../../apps/helper/network-connection.mjs';
import {networkId,connectionRecordHash} from '../../src/network-invitation.mjs';
import {applyProfile} from '../../apps/helper/network-profile.mjs';
const output=path.resolve(process.env.QA_OUTPUT),data=path.join(output,'user-data');await seed(data);
const keys=crypto.generateKeyPairSync('ed25519'),publicKeyPem=keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem=keys.privateKey.export({format:'pem',type:'pkcs8'}),witnessPeerId=peerIdFromPublicKey(publicKeyPem);
const sign=record=>{const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId,witnessPublicKeyPem:publicKeyPem,recordJson,signature:signRecord(recordJson,privateKeyPem)};};
const publisher=new SearchPublisher({file:path.join(output,'publisher.json'),snapshots:new NameSnapshotStore(path.join(data,'name-snapshots.json')),contentStore:new VerifiedContentStore(path.join(data,'content')),sign});await publisher.pass();assert.equal(publisher.record.entries.length,1);
const topicPublisher=new TopicSearchPublisher({file:path.join(output,'topics.json'),snapshots:new NameSnapshotStore(path.join(data,'name-snapshots.json')),documents:publisher,metadata:{get:()=>({title:'',description:'',keywords:['konser'],metadataAt:new Date().toISOString()})},sign});topicPublisher.pass();
const providerData=path.join(output,'provider-a');
const peer={identity:{},witnessPeerId,_envelope:sign,requestsServed:0,_handleAsync(req){if(req.op==='snapshot'&&req.name==='')return {ok:false,error:'invalid_arns_name'};assert.equal(req.op,'catalog');assert.equal(Object.hasOwn(req,'query'),false);process.send?.({request:true,route:'a'});return req.version===2?topicPublisher.reply():publisher.reply();}};
const discovery=new PeerDiscovery({dataDir:providerData,scope:()=>peerNetworkScope(providerData),peers:()=>[],identity:peer,listenPort:1});
const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0,discovery,networkAnnouncement:()=>readNetworkPublication(providerData),networkRecovery:()=>readNetworkRecovery(providerData)});discovery.listenPort=server.address.port;
let late=null,seedStopped=false;
const upstream=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/info'?{network:'arweave.QA.fixture'}:{jsonrpc:'2.0',id:1,result:{'solana-core':'QA.fixture'}}));});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
const upstreamAddress='127.0.0.1:'+upstream.address().port;
const profile={schema:'arns-mesh-network-profile/v1',directPeers:['127.0.0.1:'+server.address.port],rpcSources:[upstreamAddress],arweavePeers:[upstreamAddress],trustedPeers:[witnessPeerId]};
applyProfile(data,profile);
const publication=publishNetwork({dataDir:providerData,profile,name:'QA supporter exchange',local:true});
const connection=new NetworkConnection({dataDir:data}),preview=await connection.inspect(publication.code);await connection.join(publication.code,{expectedId:networkId(preview.invitation.key),expectedRevision:preview.payload.revision,expectedHash:connectionRecordHash(preview.envelope,preview.recovery)});
fs.writeFileSync(path.join(data,'preferences.json'),JSON.stringify({accessPolicy:'auto',trustedPeers:[],witnessQuorum:2}));
process.on('message',async message=>{try{
 if(message==='late-supporter'){
  const k=crypto.generateKeyPairSync('ed25519'),pub=k.publicKey.export({format:'pem',type:'spki'}),priv=k.privateKey.export({format:'pem',type:'pkcs8'}),id=peerIdFromPublicKey(pub);
  const b={identity:{},witnessPeerId:id,requestsServed:0,_envelope(record){const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId:id,witnessPublicKeyPem:pub,recordJson,signature:signRecord(recordJson,priv)};},_handleAsync(req){if(req.op==='snapshot'&&req.name==='')return {ok:false,error:'invalid_arns_name'};assert.equal(req.op,'catalog');process.send?.({request:true,route:'b'});return req.version===2?topicPublisher.reply():publisher.reply();}};
  const d=new PeerDiscovery({dataDir:path.join(output,'provider-b'),scope:()=>peerNetworkScope(providerData),peers:()=>[{host:'127.0.0.1',port:server.address.port}],identity:b,listenPort:1});
  const listener=await startDirectPeerServer(b,{host:'127.0.0.1',port:0,discovery:d,networkAnnouncement:()=>readNetworkPublication(providerData),networkRecovery:()=>readNetworkRecovery(providerData)});d.listenPort=listener.address.port;late={discovery:d,server:listener};await d.sync();assert.equal(d.status().acceptedBy,1);process.send?.({lateReady:true});
 }
 if(message==='stop-seed'){await server.close();seedStopped=true;discovery.close();process.send?.({seedStopped:true});}
 if(message==='stop-upstreams'){upstream.closeAllConnections();await new Promise(r=>upstream.close(r));process.send?.({upstreamsStopped:true});}
 if(message==='stop'){upstream.closeAllConnections();upstream.close();discovery.close();if(!seedStopped)await server.close();if(late){late.discovery.close();await late.server.close();}process.exit(0);}
 }catch(error){console.error(error);process.send?.({fixtureError:error.message});}});
process.send?.({ready:true,entries:publisher.record.entries.length});
