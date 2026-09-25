import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {LocationIndex} from '../src/location-index.mjs';
import {saveDiscoveredLocations} from '../src/discovery-store.mjs';
import {replicateLocationHint} from '../src/location-replication.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';

async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-routing-replica-'));
 const empty=path.join(dir,'empty.json');fs.writeFileSync(empty,'[]');
 const env={ARWEAVE_PEERS:empty,ARWEAVE_PEER_SEEDS:empty,HYPER_PEER_CACHE:path.join(dir,'learned.json'),ARNS_HISTORICAL_INDEX:'0',ARNS_PREPARED_LOCATIONS:'',HYPER_BOOTSTRAP:empty};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;fs.rmSync(dir,{recursive:true,force:true});});
 const peer=(name,locationsFile=path.join(dir,name+'-locations.json'))=>{
  const p=new MeshPeer({dataDir:path.join(dir,name),locationsFile,allowRemoteFetch:false});
  const k=crypto.generateKeyPairSync('ed25519');p.identity={publicKeyPem:k.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:k.privateKey.export({format:'pem',type:'pkcs8'})};p.witnessPeerId=peerIdFromPublicKey(p.identity.publicKeyPem);return p;
 };
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=createData('<h1>Verified disaster content</h1>',signer,{tags:[{name:'Content-Type',value:'text/html'}]});await item.sign(signer);
 return {dir,peer,item};
}
const direct=server=>createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:server.address.port}],dhtEnabled:false,cacheOnly:true});

test('replicated location survives source loss and supplies verified raw bytes to an empty client',async t=>{
 const {dir,peer,item}=await fixture(t),source=peer('source'),replica=peer('replica');
 await source.contentStore.put(item.id,item.getRaw());
 const preparation={kind:'external-index-preparation',provider:'turbo-offsets',at:'2026-09-25T00:00:00Z'};
 saveDiscoveredLocations(source.locationIndex.file,[[item.id,{dataId:item.id,weaveOffset:0,itemSize:item.getRaw().length,preparation}]]);
 let a=await startDirectPeerServer(source,{host:'127.0.0.1',port:0}),b;
 let tamper=false,chunks=0,base=0;
 const raw=http.createServer((req,res)=>{
  if(req.url==='/info')return res.end(JSON.stringify({network:'arweave.N.1',height:10}));
  if(req.url==='/peers')return res.end('[]');
  if(req.url.startsWith('/chunk/')){chunks++;const bytes=Buffer.from(item.getRaw());if(tamper)bytes[bytes.length-1]^=1;return res.end(JSON.stringify({chunk:bytes.toString('base64url'),absolute_end_offset:base+bytes.length,chunk_size:bytes.length}));}
  res.statusCode=404;res.end('{}');
 });
 await new Promise(r=>raw.listen(0,'127.0.0.1',r));
 try{
  const r=await fetchMeshContent(item.id,{client:direct(a),contentStore:replica.contentStore,locationsFile:replica.locationIndex.file,replicateLocation:true,meshHeadStartMs:3000});
  assert.equal(r.locationReplication.status,'replicated');assert.equal(r.locationReplication.positionVerified,false);
  assert.deepEqual(new LocationIndex(replica.locationIndex.file).get(item.id).preparation,preparation);
  await a.close();a=null;
  // Restart as an index-only peer: no content bytes copied to this process.
  const indexOnly=peer('index-only',replica.locationIndex.file);assert.equal(indexOnly.contentStore.get(item.id),null);
  b=await startDirectPeerServer(indexOnly,{host:'127.0.0.1',port:0});
  const seeds=path.join(dir,'raw.json');fs.writeFileSync(seeds,JSON.stringify([{host:'127.0.0.1',port:raw.address().port}]));process.env.ARWEAVE_PEERS=seeds;process.env.ARWEAVE_PEER_SEEDS=seeds;
  const fresh=peer('fresh');
  const opened=await fetchMeshContent(item.id,{client:direct(b),contentStore:fresh.contentStore,locationsFile:fresh.locationIndex.file,signal:AbortSignal.timeout(5000)});
  assert.equal(opened.direct.payload.toString(),'<h1>Verified disaster content</h1>');assert.equal(opened.loc.transport,'mesh-index');assert.ok(chunks>0);assert.equal(indexOnly.contentBytesServed,0);
  tamper=true;base=1024;saveDiscoveredLocations(indexOnly.locationIndex.file,[[item.id,{dataId:item.id,weaveOffset:base,itemSize:item.getRaw().length}]]);const damaged=peer('damaged');
  await assert.rejects(fetchMeshContent(item.id,{client:direct(b),contentStore:damaged.contentStore,locationsFile:damaged.locationIndex.file,signal:AbortSignal.timeout(5000)}));
  assert.equal(damaged.contentStore.get(item.id),null,'routing metadata cannot authorize a corrupted signature');
 }finally{if(a)await a.close();if(b)await b.close();raw.closeAllConnections();await new Promise(r=>raw.close(r));}
});

test('hint replication is bounded, rejects mismatched hints, and preserves an existing position',async t=>{
 const {peer,item}=await fixture(t),replica=peer('replica'),options={contentStore:replica.contentStore,locationsFile:replica.locationIndex.file};
 await replica.contentStore.put(item.id,item.getRaw());
 let requestedSignal;
 const start=Date.now();
 const timeout=await replicateLocationHint(item.id,{...options,timeoutMs:30,client:{locateCandidates:(_id,{signal})=>{requestedSignal=signal;return new Promise(()=>{});}}});
 assert.equal(timeout.status,'cancelled');assert.equal(requestedSignal.aborted,true);assert.ok(Date.now()-start<1000);
 const good={dataId:item.id,weaveOffset:12,itemSize:item.getRaw().length};
 const copied=await replicateLocationHint(item.id,{...options,client:{locateCandidates:async()=>[{record:{...good,dataId:'A'.repeat(43)}},{record:{...good,weaveOffset:-1}},{record:good}]}});
 assert.equal(copied.status,'replicated');
 const kept=await replicateLocationHint(item.id,{...options,client:{locateCandidates:()=>{throw new Error('must not overwrite an existing location');}}});
 assert.equal(kept.status,'existing');assert.equal(replica.locationIndex.get(item.id).weaveOffset,12);
 const empty=peer('empty');
 assert.equal((await replicateLocationHint(item.id,{...options,contentStore:empty.contentStore,locationsFile:empty.locationIndex.file,client:{locateCandidates:()=>{throw new Error('must not fetch arbitrary unsolicited IDs');}}})).status,'content-not-stored');
 assert.equal((await replicateLocationHint(item.id,{...options,locationsFile:empty.locationIndex.file,contentStore:{get(){throw new Error('disk unavailable');}},client:{locateCandidates(){}}})).status,'unavailable','optional routing replication cannot fail a successful content fetch on a disk error');
});
