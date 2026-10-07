import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {SnapshotRelay,snapshotPage,SNAPSHOT_PAGE_BYTES} from '../src/snapshot-relay.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {SitePinner} from '../src/site-pinner.mjs';
import {SupporterReplication} from '../src/supporter-replication.mjs';
import {supporterReadiness,probeSupporter} from '../src/supporter-readiness.mjs';
import {startDirectPeerServer,queryDirectPeer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {signNetworkContinuity,signNetwork,networkPublicKey} from '../src/network-invitation.mjs';

const scope={id:'c'.repeat(64),local:true};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'supporter-replication-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const empty=path.join(dir,'empty.json');fs.writeFileSync(empty,'[]');
 const env={ARWEAVE_PEERS:empty,ARWEAVE_PEER_SEEDS:empty,HYPER_BOOTSTRAP:empty,ARNS_HISTORICAL_INDEX:'0',HYPER_PEER_CACHE:path.join(dir,'learned.json')};
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 t.after(()=>{for(const [key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});
 const peer=name=>{
  const dataDir=path.join(dir,name),snapshots=new NameSnapshotStore(path.join(dataDir,'names.json'));
  const p=new MeshPeer({dataDir,snapshotStore:snapshots,locationsFile:path.join(dataDir,'locations.json'),allowRemoteFetch:false});
  const keys=crypto.generateKeyPairSync('ed25519');p.identity={publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'})};p.witnessPeerId=peerIdFromPublicKey(p.identity.publicKeyPem);
  p.snapshotPageReply=request=>snapshotPage({request,relay:p.snapshotRelay,snapshotStore:p.snapshotStore,pinner:p.pinner,witnessPeerId:p.witnessPeerId,sign:row=>p._envelope(row)});
  return p;
 };
 const relay=(p,trust,options={})=>p.snapshotRelay=new SnapshotRelay({file:path.join(p.dataDir,'relay.json'),trusted:()=>trust,scope:()=>scope,...options});
 return {dir,peer,relay};
}
const row=(name,txId='A'.repeat(43),slot=100)=>({schema:'arns-mesh-name-snapshot/v1',name,txId,antId:'1'.repeat(32),observedAt:new Date(Date.now()-1000).toISOString(),slot,ttlSeconds:60});
const direct=server=>({host:'127.0.0.1',port:server.address.port});
const client=server=>createSwarmMeshClient({directPeers:[direct(server)],dhtEnabled:false,cacheOnly:true,directory:null});

test('cold relays paginate more than 512 names and 1MiB, resume, and feed another new supporter with origin offline',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b'),c=f.peer('c'),trust=[a.witnessPeerId];
 a.snapshotStore.putMany(Array.from({length:2400},(_,i)=>row('name-'+String(i).padStart(4,'0'))),{kind:'local-rpc'});
 const current=row('updated','B'.repeat(43),200),prepared=row('updated','A'.repeat(43),100);a.snapshotStore.put(current,{kind:'local-rpc'});
 a.pinner={rows:{updated:{}},readySnapshot:name=>name==='updated'?{...prepared,provenance:{kind:'local-rpc'}}:null};
 let serverA=await startDirectPeerServer(a,{host:'127.0.0.1',port:0});t.after(async()=>{if(serverA)await serverA.close();});
 let relayB=f.relay(b,trust,{pagesPerPass:1});
 await relayB.sync({peers:[direct(serverA)]});assert.equal(relayB.status().records,256);
 relayB=f.relay(b,trust);assert.equal(relayB.status().records,256);
 await relayB.sync({peers:[{host:'127.0.0.1',port:1},direct(serverA)]});
 for(let n=0;n<2;n++)await relayB.sync({peers:[direct(serverA)]});
 assert.equal(relayB.status().records,2402);assert.ok(fs.statSync(relayB.file).size>1024*1024);
 assert.equal(JSON.parse(relayB.reply({name:'updated'}).recordJson).txId,current.txId);
 assert.equal(JSON.parse(relayB.reply({name:'updated',prepared:true}).recordJson).txId,prepared.txId);
 const page=await queryDirectPeer(direct(serverA),{op:'snapshots',witnessPeerIds:trust,limit:256});
 assert.ok(Buffer.byteLength(JSON.stringify(page))<=SNAPSHOT_PAGE_BYTES);
 await serverA.close();serverA=null;
 const serverB=await startDirectPeerServer(b,{host:'127.0.0.1',port:0});t.after(()=>serverB.close());
 const relayC=f.relay(c,trust);assert.equal(c.snapshotStore.names().length,0);
 for(let n=0;n<2;n++)await relayC.sync({peers:[direct(serverB)]});
 assert.equal(relayC.status().records,2402);assert.equal(relayC.status().preparedRecords,1);
 assert.equal(relayC.reply({name:'updated'}).witnessPeerId,a.witnessPeerId);
 assert.equal(relayC.reply({name:'updated',prepared:true}).signature,relayB.reply({name:'updated',prepared:true}).signature);
 trust.length=0;assert.equal(relayC.reply({name:'updated'}),null);assert.equal(relayC.status().acceptedRecords,0);
});

test('relay capacity, untrusted records, forgery, rollback and page cursor failures preserve accepted records',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b'),other=f.peer('other'),trust=[a.witnessPeerId],relay=f.relay(b,trust,{maxRecords:2});
 const first=a._envelope(row('first'));relay.put(first);relay.put(a._envelope(row('second')));
 assert.throws(()=>relay.put(a._envelope(row('third'))),/record_limit/);assert.equal(relay.status().records,2);assert.equal(relay.reply({name:'first'}).signature,first.signature);
 assert.throws(()=>relay.put(other._envelope(row('first','B'.repeat(43),101))),/untrusted/);
 assert.throws(()=>relay.put({...first,signature:'A'.repeat(86)}),/signature/);
 assert.throws(()=>relay.put(a._envelope(row('first','A'.repeat(43),99))),/rollback/);
 assert.throws(()=>relay.put(a._envelope(row('first','B'.repeat(43),100))),/conflict/);
 const hostile=new SnapshotRelay({file:path.join(f.dir,'hostile.json'),trusted:()=>trust,scope:()=>scope,query:async()=>({ok:true,schema:'arns-mesh-snapshot-page/v1',records:[first],nextCursor:Buffer.from('bad').toString('base64url'),complete:false})});
 await hostile.sync({peers:[{host:'127.0.0.1',port:1}]});assert.equal(hostile.status().records,0);assert.match(hostile.status().error,/cursor/);
});

test('replication pins actual signed static graph and a fresh reader uses B with A offline; arbitrary B name changes stay untrusted',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b'),trust=[a.witnessPeerId],relay=f.relay(b,trust),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const make=async(data,type)=>{const item=createData(data,signer,{tags:[{name:'Content-Type',value:type}]});await item.sign(signer);await a.contentStore.put(item.id,item.getRaw());return item;};
 const css=await make('h1{color:teal}','text/css'),html=await make('<link rel="stylesheet" href="https://arweave.net/'+css.id+'"><h1>Independent copy</h1>','text/html');
 const root=await make(JSON.stringify({manifest:'arweave/paths',version:'0.1.0',index:{path:'index.html'},paths:{'index.html':{id:html.id}}}),'application/x.arweave-manifest+json');
 const snapshot=row('backup',root.id);a.snapshotStore.put(snapshot,{kind:'local-rpc'});
 let serverA=await startDirectPeerServer(a,{host:'127.0.0.1',port:0});t.after(async()=>{if(serverA)await serverA.close();});
 await relay.sync({peers:[direct(serverA)]});assert.equal(relay.status().records,1);
 const pinner=new SitePinner({file:path.join(b.dataDir,'replicated-sites.json'),snapshots:b.snapshotStore,contentStore:b.contentStore,pinNamespace:'replica',createClient:()=>client(serverA)});
 const worker=new SupporterReplication({file:path.join(b.dataDir,'replication.json'),relay,pinner,contentSources:()=> 'mesh-only'});
 const before=supporterReadiness({snapshots:b.snapshotStore,relay,pinners:[pinner],contentStore:b.contentStore,trustedPeerIds:trust,ownPeerId:b.witnessPeerId,index:{enabled:true,bands:5}});
 assert.equal(before.names.accepted,1);assert.equal(before.files.completePreparedSites,0);assert.equal(before.locallyPrepared,false);
 await worker.pass();assert.equal(worker.status().completeSites,1);assert.ok(worker.status().dayResponseBytes>0);assert.equal(b.contentStore.pinnedIds().size,3);
 await serverA.close();serverA=null;
 const after=supporterReadiness({snapshots:b.snapshotStore,relay,pinners:[pinner],contentStore:b.contentStore,trustedPeerIds:trust,ownPeerId:b.witnessPeerId});
 assert.equal(after.locallyPrepared,true);assert.equal(after.ready,false);assert.match(after.externalReachability.status,/independent/);
 const serverB=await startDirectPeerServer(b,{host:'127.0.0.1',port:0});let bClosed=false;t.after(async()=>{if(!bClosed)await serverB.close();});
 const result=await probeSupporter({peer:direct(serverB),trustedPeers:trust,names:['backup'],exclude:['127.0.0.1:1']});
 assert.equal(result.ready,true);assert.equal(result.names[0].files,3);assert.equal(result.names[0].publisher,a.witnessPeerId);assert.equal(result.rpcUsed,false);assert.equal(result.arweaveUsed,false);
 b.snapshotStore.put(row('new-unaccepted',root.id),{kind:'local-rpc'});
 const missing=await probeSupporter({peer:direct(serverB),trustedPeers:trust,names:['new-unaccepted']});
 assert.equal(missing.ready,false);assert.equal(missing.names[0].ready,false);
 // C is first installed after A has already stopped: it learns original A
 // bindings and verifies/pins bytes from B without ever talking to A.
 const c=f.peer('late-c'),relayC=f.relay(c,trust);await relayC.sync({peers:[direct(serverB)]});
 const pinnerC=new SitePinner({file:path.join(c.dataDir,'replicated-sites.json'),snapshots:c.snapshotStore,contentStore:c.contentStore,pinNamespace:'replica',createClient:()=>client(serverB)});
 const workerC=new SupporterReplication({file:path.join(c.dataDir,'replication.json'),relay:relayC,pinner:pinnerC,contentSources:()=> 'mesh-only'});
 await workerC.pass();assert.equal(workerC.status().completeSites,1);
 const serverC=await startDirectPeerServer(c,{host:'127.0.0.1',port:0});t.after(()=>serverC.close());
 await serverB.close();bClosed=true;
 const afterBothSourcesStop=await probeSupporter({peer:direct(serverC),trustedPeers:trust,names:['backup']});
 assert.equal(afterBothSourcesStop.ready,true);assert.equal(afterBothSourcesStop.names[0].files,3);assert.equal(afterBothSourcesStop.names[0].publisher,a.witnessPeerId);
 fs.unlinkSync(c.contentStore.file(css.id));
 const incomplete=await probeSupporter({peer:direct(serverC),trustedPeers:trust,names:['backup']});
 assert.equal(incomplete.ready,false);assert.equal(incomplete.names[0].ready,false);
});

test('replica namespace preserves accepted prepared bytes through local catalogue updates',async t=>{
 const f=fixture(t),p=f.peer('p'),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const make=async text=>{const item=createData(text,signer,{tags:[{name:'Content-Type',value:'text/html'}]});await item.sign(signer);await p.contentStore.put(item.id,item.getRaw());return item;};
 const old=await make('prepared old'),latest=await make('local new'),snapOld={...row('versions',old.id),provenance:{kind:'local-rpc'}},snapNew={...row('versions',latest.id,101),provenance:{kind:'local-rpc'}};
 const noNetwork=()=>({setName(){},async stop(){}});
 const replica=new SitePinner({file:path.join(p.dataDir,'replica.json'),snapshots:p.snapshotStore,contentStore:p.contentStore,pinNamespace:'replica',createClient:noNetwork});
 const local=new SitePinner({file:path.join(p.dataDir,'local.json'),snapshots:p.snapshotStore,contentStore:p.contentStore,createClient:noNetwork});
 await replica.start('versions',{snapshot:snapOld,contentSources:'local-only'});
 await local.start('versions',{snapshot:snapOld,contentSources:'local-only'});
 await local.start('versions',{snapshot:snapNew,contentSources:'local-only'});
 assert.equal(p.contentStore.pinnedIds().has(old.id),true);assert.equal(p.contentStore.pinnedIds().has(latest.id),true);
 assert.notEqual(replica.rows.versions.pinGroup,local.rows.versions.pinGroup);
 assert.equal(replica.isReady(replica.rows.versions),true);
 local.remove('versions');assert.equal(p.contentStore.pinnedIds().has(old.id),true);
});

test('durable signed network definitions preserve accepted publishers in independent readiness checks',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b'),trust=[a.witnessPeerId];f.relay(b,trust);
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex')),item=createData('durable accepted bytes',signer);await item.sign(signer);await b.contentStore.put(item.id,item.getRaw());b.snapshotRelay.put(a._envelope(row('durable',item.id)));
 const authority=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});
 let definition;
 const server=await startDirectPeerServer(b,{host:'127.0.0.1',port:0,networkAnnouncement:()=>definition});t.after(()=>server.close());
 const endpoint='127.0.0.1:'+server.address.port,seeds=[endpoint],profile={schema:'arns-mesh-network-profile/v1',directPeers:seeds,rpcSources:['127.0.0.1:8899'],arweavePeers:[],trustedPeers:trust};
 definition=signNetworkContinuity({name:'Local test network',profile,seeds,bootstrap:['127.0.0.1:49739'],local:true},authority);
 const invitation={version:2,key:networkPublicKey(authority),seeds,local:true,definition};
 const result=await probeSupporter({peer:direct(server),invitation,names:['durable']});
 assert.equal(result.ready,true);assert.equal(result.names[0].publisher,a.witnessPeerId);assert.equal(result.network.expired,false);
});

test('replication response budget cannot declare a missing graph ready',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b'),trust=[a.witnessPeerId],relay=f.relay(b,trust),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=createData('too large for this tiny budget'.repeat(1000),signer);await item.sign(signer);await a.contentStore.put(item.id,item.getRaw());relay.put(a._envelope(row('limited',item.id)));
 const server=await startDirectPeerServer(a,{host:'127.0.0.1',port:0});t.after(()=>server.close());
 const pinner=new SitePinner({file:path.join(b.dataDir,'replica.json'),snapshots:b.snapshotStore,contentStore:b.contentStore,pinNamespace:'replica',createClient:()=>client(server)});
 const worker=new SupporterReplication({file:path.join(b.dataDir,'replication.json'),relay,pinner,dailyBytes:128,maxPassBytes:128,contentSources:()=> 'mesh-only'});
 await worker.pass();assert.equal(worker.status().completeSites,0);assert.equal(b.contentStore.has(item.id),false);assert.ok(worker.status().dayResponseBytes>128);
 const requests=a.requestsServed;await worker.pass();assert.equal(a.requestsServed,requests);assert.equal(worker.status().error,'replication_daily_budget_reached');
});


test('expired remote lists cannot reinstate retired publishers in readiness checks',async t=>{
 const f=fixture(t),current=f.peer('current'),retired=f.peer('retired'),b=f.peer('mirror');f.relay(b,[current.witnessPeerId,retired.witnessPeerId]);
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex')),item=createData('verified bytes do not authorize retired name publishers',signer);await item.sign(signer);await b.contentStore.put(item.id,item.getRaw());
 b.snapshotRelay.put(retired._envelope(row('retired-test',item.id)));
 const authority=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});let replay;
 const server=await startDirectPeerServer(b,{host:'127.0.0.1',port:0,networkAnnouncement:()=>replay});t.after(()=>server.close());
 const seeds=['127.0.0.1:'+server.address.port],profile={schema:'arns-mesh-network-profile/v1',directPeers:seeds,rpcSources:['127.0.0.1:8899'],arweavePeers:[],trustedPeers:[current.witnessPeerId]};
 const definition=signNetworkContinuity({name:'Current durable definition',profile,seeds,bootstrap:['127.0.0.1:49739'],local:true},authority);
 const invitation={version:2,key:networkPublicKey(authority),seeds,local:true,definition},past=Date.now()-7200000;
 replay=signNetwork({schema:'arns-mesh-network/v1',name:'Expired retired profile',revision:1,issuedAt:past,expiresAt:past+3600000,profile:{...profile,trustedPeers:[retired.witnessPeerId]}},authority,{local:true,now:past});
 const rejected=await probeSupporter({peer:direct(server),invitation,names:['retired-test']});
 assert.equal(rejected.ready,false);assert.equal(rejected.network.remotePublicationRejected,true);assert.equal(rejected.network.trustSource,'durable-definition');
 b.snapshotRelay.put(current._envelope(row('current-test',item.id)));
 const anchored=await probeSupporter({peer:direct(server),invitation,names:['current-test']});
 assert.equal(anchored.ready,true);assert.equal(anchored.names[0].publisher,current.witnessPeerId);
 const legacy={version:1,key:invitation.key,seeds,local:true};
 const unanchored=await probeSupporter({peer:direct(server),invitation:legacy,names:['retired-test']});
 assert.equal(unanchored.ready,false);assert.equal(unanchored.error,'accepted_name_publishers_required');
 const pinned=await probeSupporter({peer:direct(server),invitation:legacy,trustedPeers:[current.witnessPeerId],names:['current-test']});
 assert.equal(pinned.ready,true);assert.equal(pinned.network.trustSource,'caller-pinned');assert.equal(pinned.names[0].publisher,current.witnessPeerId);
 const invalid=await probeSupporter({peer:direct(server),trustedPeers:['not-an-identity'],names:['current-test']});
 assert.equal(invalid.ready,false);assert.match(invalid.error,/Invalid saved-name witness/);
});


test('a current signed publisher revocation overrides durable fallback anchors',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b');f.relay(b,[a.witnessPeerId]);
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex')),item=createData('retained bytes with revoked publisher',signer);await item.sign(signer);await b.contentStore.put(item.id,item.getRaw());b.snapshotRelay.put(a._envelope(row('revoked-test',item.id)));
 const authority=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});let live;
 const server=await startDirectPeerServer(b,{host:'127.0.0.1',port:0,networkAnnouncement:()=>live});t.after(()=>server.close());
 const seeds=['127.0.0.1:'+server.address.port],profile={schema:'arns-mesh-network-profile/v1',directPeers:seeds,rpcSources:['127.0.0.1:8899'],arweavePeers:[],trustedPeers:[a.witnessPeerId]};
 const definition=signNetworkContinuity({name:'Earlier durable anchors',profile,seeds,bootstrap:['127.0.0.1:49739'],local:true},authority),now=Date.now();
 const invitation={version:2,key:networkPublicKey(authority),seeds,local:true,definition};
 live=signNetwork({schema:'arns-mesh-network/v1',name:'Current publisher revocation',revision:2,issuedAt:now,expiresAt:now+3600000,profile:{...profile,trustedPeers:[]}},authority,{local:true});
 const result=await probeSupporter({peer:direct(server),invitation,names:['revoked-test']});
 assert.equal(result.ready,false);assert.equal(result.error,'accepted_name_publishers_required');assert.equal(result.network.trustSource,'live-network-list');
 await assert.rejects(probeSupporter({peer:{host:'::ffff:127.0.0.1',port:49740},trustedPeers:[a.witnessPeerId],names:['revoked-test'],exclude:['127.0.0.1:49740']}),/peer_is_excluded/);
});

test('relay batches trust and scope reads and verifies each received signature once',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b'),records=Array.from({length:256},(_,n)=>a._envelope(row('batch-'+String(n).padStart(4,'0'))));
 let trustReads=0,scopeReads=0,verifications=0;
 const originalVerify=crypto.verify;
 const relay=f.relay(b,[a.witnessPeerId],{trusted:()=>{trustReads++;return [a.witnessPeerId];},scope:()=>{scopeReads++;return scope;},query:async()=>({ok:true,schema:'arns-mesh-snapshot-page/v1',records,nextCursor:null,complete:true})});
 trustReads=0;scopeReads=0;
 crypto.verify=(...args)=>{verifications++;return originalVerify(...args);};
 try{await relay.sync({peers:[{host:'127.0.0.1',port:1}]});}finally{crypto.verify=originalVerify;}
 assert.equal(relay.rows.size,256);assert.equal(verifications,256,'each new record gets one cryptographic verification');
 assert.ok(trustReads<10,'profile reads are bounded per batch, not per binding');assert.ok(scopeReads<10,'durable-scope verification is bounded per batch');
 trustReads=0;scopeReads=0;
 const resumed=new SnapshotRelay({file:relay.file,trusted:()=>{trustReads++;return [a.witnessPeerId];},scope:()=>{scopeReads++;return scope;}});
 assert.equal(resumed.rows.size,256);assert.ok(trustReads<3);assert.ok(scopeReads<3);
});

test('worker bounds candidate file checks, reuses unchanged bindings, and immediately drops revoked trust',async t=>{
 const f=fixture(t),a=f.peer('a'),b=f.peer('b'),trust=[a.witnessPeerId],relay=f.relay(b,trust);
 for(let n=0;n<256;n++)relay.put(a._envelope(row('bounded-'+String(n).padStart(4,'0'))),false);
 let enumerations=0,checks=0,missing=null;const entries=relay.entries.bind(relay);relay.entries=()=>{enumerations++;return entries();};
 const rows=Object.fromEntries(Array.from({length:256},(_,n)=>{const name='bounded-'+String(n).padStart(4,'0');return [name,{name,rootDataId:'A'.repeat(43),snapshot:{antId:'1'.repeat(32)}}];}));
 const pinner={rows,isReady:saved=>{checks++;return saved?.name!==missing;},start:()=>{throw new Error('all candidates should already be ready');}};
 const worker=new SupporterReplication({file:path.join(f.dir,'bounded-worker.json'),relay,pinner,scanPerPass:8});
 const first=await worker.pass();assert.equal(checks,8);assert.equal(first.completeSites,null,'internal pass does not claim a new full readiness check');assert.equal(enumerations,1);
 checks=0;await worker.pass();assert.equal(checks,8);assert.equal(enumerations,1,'unchanged signed bindings are not rebuilt and sorted every tick');
 missing='bounded-0000';checks=0;assert.equal(worker.status().completeSites,255);assert.equal(checks,256,'an explicit truth check still observes a missing site');
 checks=0;assert.equal(worker.status({completeSites:255}).completeSites,255);assert.equal(checks,0,'main may reuse its freshly measured pinner status');
 trust.length=0;checks=0;await worker.pass();assert.equal(checks,0);assert.equal(enumerations,2);assert.equal(worker.status({verify:false}).acceptedNames,0);
 assert.equal(relay.reply({name:'bounded-0000',witnessPeerIds:[a.witnessPeerId]}),null);
 assert.deepEqual(snapshotPage({request:{witnessPeerIds:[a.witnessPeerId]},relay}).records,[]);
});

test('disabled replication neither schedules work nor writes a preparation state',async t=>{
 const f=fixture(t),b=f.peer('b'),relay=f.relay(b,[]),file=path.join(f.dir,'disabled-worker.json');
 const worker=new SupporterReplication({file,relay,pinner:{rows:{},isReady:()=>{throw new Error('disabled worker must not inspect files');}},enabled:false});
 worker.start();const result=await worker.pass();assert.equal(result.enabled,false);assert.equal(worker.timer,null);assert.equal(fs.existsSync(file),false);
});

test('in-flight pages and legacy replies cannot cross publisher revocation or network changes',async t=>{
 for(const legacy of [false,true])for(const change of ['trust','scope']){
  const f=fixture(t),a=f.peer('a'),b=f.peer('b'),trusted=[a.witnessPeerId];let currentScope=scope;
  const envelope=a._envelope(row('inflight'));
  const relay=f.relay(b,trusted,{scope:()=>currentScope,query:async(_peer,request)=>{
   if(legacy&&request.op==='snapshots')return {ok:false,error:'unknown_op'};
   await Promise.resolve();
   if(change==='trust')trusted.length=0;else currentScope={id:'d'.repeat(64),local:true};
   return legacy?envelope:{ok:true,schema:'arns-mesh-snapshot-page/v1',records:[envelope],nextCursor:null,complete:true};
  }});
  await relay.sync({names:['inflight'],peers:[{host:'127.0.0.1',port:1}]});
  assert.equal(relay.rows.size,0,legacy+':'+change);
  assert.match(relay.lastError,change==='scope'?/snapshot_network_changed/:/untrusted_snapshot_relay/);
 }
});
