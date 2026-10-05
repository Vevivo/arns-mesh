// Keep core transport lockdown in the fixture peer process, separate from the
// Playwright/CDP driver. The packaged application's restrictions stay intact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {seed} from './seed-saved-fixture.mjs';
import {SearchPublisher} from '../../src/search-catalog.mjs';
import {NameSnapshotStore} from '../../src/name-snapshots.mjs';
import {VerifiedContentStore} from '../../src/content-store.mjs';
import {peerIdFromPublicKey,signRecord} from '../../src/common.mjs';
import {startDirectPeerServer} from '../../src/direct-peer.mjs';
import {applyProfile} from '../../apps/helper/network-profile.mjs';
const output=path.resolve(process.env.QA_OUTPUT),data=path.join(output,'user-data');await seed(data);
const keys=crypto.generateKeyPairSync('ed25519'),publicKeyPem=keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem=keys.privateKey.export({format:'pem',type:'pkcs8'}),witnessPeerId=peerIdFromPublicKey(publicKeyPem);
const sign=record=>{const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId,witnessPublicKeyPem:publicKeyPem,recordJson,signature:signRecord(recordJson,privateKeyPem)};};
const publisher=new SearchPublisher({file:path.join(output,'publisher.json'),snapshots:new NameSnapshotStore(path.join(data,'name-snapshots.json')),contentStore:new VerifiedContentStore(path.join(data,'content')),sign});await publisher.pass();assert.equal(publisher.record.entries.length,1);
const peer={identity:{},requestsServed:0,_handleAsync(req){assert.equal(req.op,'catalog');assert.equal(Object.hasOwn(req,'query'),false);process.send?.({request:true});return publisher.reply();}};
const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
applyProfile(data,{schema:'arns-mesh-network-profile/v1',directPeers:['127.0.0.1:'+server.address.port],rpcSources:['127.0.0.1:59003'],arweavePeers:[],trustedPeers:[witnessPeerId]});
fs.writeFileSync(path.join(data,'preferences.json'),JSON.stringify({accessPolicy:'auto',trustedPeers:[],witnessQuorum:2}));
process.on('message',async message=>{if(message==='stop'){await server.close();process.exit(0);}});
process.send?.({ready:true,entries:publisher.record.entries.length});
