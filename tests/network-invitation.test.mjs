import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {encodeInvitation,decodeInvitation,networkPublicKey,networkId,networkRecordHash,signNetwork,verifyNetwork,publicNetworkHost,MAX_NETWORK_AGE} from '../src/network-invitation.mjs';
import {publishNetwork,readNetworkPublication,mirrorNetwork,renewNetworkPublication} from '../apps/helper/network-publication.mjs';
import {NetworkConnection,findNetwork} from '../apps/helper/network-connection.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {readProfile,applyProfile} from '../apps/helper/network-profile.mjs';

const profile=(peers=['127.0.0.1:49741'])=>({schema:'arns-mesh-network-profile/v1',directPeers:peers,rpcSources:['127.0.0.1:8899'],arweavePeers:[]});
function fixture(){const privateKey=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'}),invitation={version:1,key:networkPublicKey(privateKey),seeds:['127.0.0.1:49741'],local:true},now=Date.now();const payload={schema:'arns-mesh-network/v1',name:'Test Mesh',revision:1,issuedAt:now,expiresAt:now+86400000,profile:profile()};return {privateKey,invitation,payload,envelope:signNetwork(payload,privateKey,{local:true})};}
function directory(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-network-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
const peer=()=>({identity:{},requestsServed:0,_handleAsync:async()=>({ok:false,error:'invalid_arns_name'})});
const expectations=(invite,envelope,payload)=>({expectedId:networkId(invite.key),expectedRevision:payload.revision,expectedHash:networkRecordHash(envelope)});

test('invitations preserve a pinned key, use literal IPs and detect typing mistakes',()=>{
 const f=fixture(),code=encodeInvitation(f.invitation);assert.deepEqual(decodeInvitation(code),f.invitation);
 assert.throws(()=>decodeInvitation(code.slice(0,-1)+'z'),/mistyped/);
 assert.throws(()=>decodeInvitation('x'.repeat(5000)),/Invalid/);
 assert.throws(()=>encodeInvitation({...f.invitation,seeds:['example.com:80']}),/numeric/);
 assert.throws(()=>encodeInvitation({...f.invitation,hidden:'secret'}),/Invalid/);
 assert.throws(()=>encodeInvitation({...f.invitation,local:false}),/private/);
 assert.equal(publicNetworkHost('127.0.0.1'),false);assert.equal(publicNetworkHost('::1'),false);assert.equal(publicNetworkHost('::ffff:7f00:1'),false);assert.equal(publicNetworkHost('0.0.0.0'),false);
 assert.equal(publicNetworkHost('192.0.2.10'),true);
});
test('signed lists reject tampering, wrong key, expiry, future issue times and oversized validity',()=>{
 const f=fixture();assert.equal(verifyNetwork(f.envelope,f.invitation).name,'Test Mesh');
 const changed={...f.envelope,recordJson:f.envelope.recordJson.replace('Test Mesh','Fake Mesh')};assert.throws(()=>verifyNetwork(changed,f.invitation),/signature/);
 assert.throws(()=>verifyNetwork(f.envelope,fixture().invitation),/key/);
 assert.throws(()=>verifyNetwork(f.envelope,f.invitation,{now:f.payload.expiresAt+1}),/expired/);
 assert.equal(verifyNetwork(f.envelope,f.invitation,{now:f.payload.expiresAt+1,allowExpired:true}).revision,1);
 assert.throws(()=>signNetwork({...f.payload,expiresAt:f.payload.issuedAt+MAX_NETWORK_AGE+1},f.privateKey,{local:true}),/time/);
 assert.throws(()=>signNetwork({...f.payload,issuedAt:Date.now()+600000},f.privateKey,{local:true}),/time/);
 assert.throws(()=>verifyNetwork({...f.envelope,recordJson:'x'.repeat(25000)},f.invitation),/large/);
});
test('public signed lists cannot add reader-local destinations or fields outside the profile schema',()=>{
 const f=fixture(),invite={...f.invitation,local:false,seeds:['192.0.2.10:49741']};
 assert.throws(()=>verifyNetwork(f.envelope,invite),/private/);
 assert.throws(()=>signNetwork({...f.payload,profile:{...f.payload.profile,password:'bad'}},f.privateKey,{local:true}),/Unexpected/);
});
test('provider publication increments revisions and mirrors share no signing key',t=>{
 const d=directory(t),source=path.join(d,'source'),mirror=path.join(d,'mirror');
 const a=publishNetwork({dataDir:source,profile:profile(),name:'Fixture network',local:true});
 const b=publishNetwork({dataDir:source,profile:profile(),name:'Fixture network',local:true});
 assert.equal(b.revision,a.revision+1);assert.equal(a.code,b.code);
 const invitation=decodeInvitation(b.code),envelope=readNetworkPublication(source);mirrorNetwork(mirror,invitation,envelope);
 assert.deepEqual(readNetworkPublication(mirror),envelope);assert.equal(fs.existsSync(path.join(mirror,'network-authority.private.json')),false);
 assert.equal(fs.existsSync(path.join(source,'network-publication.lock')),false);
});
test('real HTTP join, restart, stale-seed loss and signed address update preserve usable connections',async t=>{
 const d=directory(t),serverData=path.join(d,'server'),readerData=path.join(d,'reader');let envelope=null;
 const a=await startDirectPeerServer(peer(),{host:'127.0.0.1',port:0,networkAnnouncement:()=>envelope});
 const b=await startDirectPeerServer(peer(),{host:'127.0.0.1',port:0,networkAnnouncement:()=>envelope});
 let closedA=false;t.after(async()=>{if(!closedA)await a.close();await b.close();});
 const aa='127.0.0.1:'+a.address.port,bb='127.0.0.1:'+b.address.port;
 const publication=publishNetwork({dataDir:serverData,profile:profile([aa,bb]),name:'Two HTTP peers',seeds:[aa],local:true});envelope=readNetworkPublication(serverData);
 const connection=new NetworkConnection({dataDir:readerData}),inspected=await connection.inspect(publication.code);
 assert.equal(fs.existsSync(readerData),false,'inspection must not create or replace connection settings');
 await connection.join(publication.code,expectations(inspected.invitation,inspected.envelope,inspected.payload));
 assert.equal(connection.status().joined,true);assert.deepEqual(readProfile(readerData),profile([aa,bb]));
 await a.close();closedA=true;
 const next=publishNetwork({dataDir:serverData,profile:profile([bb]),name:'Two HTTP peers',seeds:[bb],local:true});envelope=readNetworkPublication(serverData);
 const restarted=new NetworkConnection({dataDir:readerData});await restarted.refresh();
 assert.equal(restarted.status().revision,next.revision);assert.deepEqual(readProfile(readerData),profile([bb]));
 assert.equal(restarted.status().name,'Two HTTP peers');
});
test('forged replies and rollback cannot replace an accepted profile',async t=>{
 const d=directory(t),f=fixture();let envelope=f.envelope;
 const query=async()=>({ok:true,network:envelope});const connection=new NetworkConnection({dataDir:d,query});const code=encodeInvitation(f.invitation);
 await connection.join(code,expectations(f.invitation,f.envelope,f.payload));
 const next={...f.payload,revision:2,name:'Next list'};envelope=signNetwork(next,f.privateKey,{local:true});await connection.refresh();
 envelope=f.envelope;await assert.rejects(connection.refresh(),/Older/);assert.equal(connection.status().revision,2);
 await assert.rejects(connection.inspect(code),/Older/);
 envelope={...f.envelope,signature:'A'.repeat(86)};await assert.rejects(connection.refresh(),/signature/);
 assert.deepEqual(readProfile(d),f.payload.profile);assert.equal(new NetworkConnection({dataDir:d}).status().revision,2);
});
test('same-revision equivocation and changes after preview fail closed',async t=>{
 const d=directory(t),f=fixture();let envelope=f.envelope;
 const connection=new NetworkConnection({dataDir:d,query:async()=>({ok:true,network:envelope})});const code=encodeInvitation(f.invitation);
 const inspected=await connection.inspect(code);envelope=signNetwork({...f.payload,revision:2},f.privateKey,{local:true});
 await assert.rejects(connection.join(code,expectations(inspected.invitation,inspected.envelope,inspected.payload)),/changed/);assert.equal(fs.existsSync(path.join(d,'mesh-ip-peers.json')),false);
 envelope=f.envelope;await connection.join(code,expectations(f.invitation,f.envelope,f.payload));
 envelope=signNetwork({...f.payload,name:'Changed without new revision'},f.privateKey,{local:true});
 await assert.rejects(connection.refresh(),/revision was changed/);assert.equal(connection.status().name,'Test Mesh');
});
test('conflicting same-revision mirrors are rejected before accepting a network',async()=>{
 const f=fixture(),other=signNetwork({...f.payload,name:'Other'},f.privateKey,{local:true});let count=0;
 await assert.rejects(findNetwork({...f.invitation,seeds:['127.0.0.1:49741','127.0.0.1:49742']},{query:async()=>({ok:true,network:count++?other:f.envelope})}),/Conflicting/);
});
test('explicit edits stop managed updates and stale requests cannot undo detach',async t=>{
 const d=directory(t),f=fixture();let delayed=false,release;const query=async()=>{if(delayed)await new Promise(r=>release=r);return {ok:true,network:f.envelope};};
 const connection=new NetworkConnection({dataDir:d,query});await connection.join(encodeInvitation(f.invitation),expectations(f.invitation,f.envelope,f.payload));
 delayed=true;const running=connection.refresh();await new Promise(r=>setImmediate(r));connection.detach();release();await assert.rejects(running,/cancelled/);assert.equal(connection.status().joined,false);
 delayed=false;await connection.join(encodeInvitation(f.invitation),expectations(f.invitation,f.envelope,f.payload));
 const edited=profile(['127.0.0.1:49743']);applyProfile(d,edited);await connection.refresh();assert.equal(connection.status().joined,false);assert.deepEqual(readProfile(d),edited);
});
test('expired network publications do not erase previously accepted sources',async t=>{
 const d=directory(t),f=fixture(),query=async()=>({ok:true,network:f.envelope});
 const connection=new NetworkConnection({dataDir:d,query});await connection.join(encodeInvitation(f.invitation),expectations(f.invitation,f.envelope,f.payload));
 const later=new NetworkConnection({dataDir:d,query,now:()=>f.payload.expiresAt+1});assert.equal(later.status().joined,true);assert.equal(later.status().expired,true);
 await assert.rejects(later.refresh(),/expired/);assert.deepEqual(readProfile(d),f.payload.profile);
});
test('an unavailable network does not modify an existing manual profile',async t=>{
 const d=directory(t),f=fixture(),original=profile(['127.0.0.1:49743']);applyProfile(d,original);
 const connection=new NetworkConnection({dataDir:d,query:async()=>{throw new Error('offline');}});
 await assert.rejects(connection.inspect(encodeInvitation(f.invitation)),/offline/);assert.deepEqual(readProfile(d),original);
});

test('only the authority renews its unchanged publication; invite remains stable',t=>{
 const d=directory(t),owner=path.join(d,'authority'),mirror=path.join(d,'mirror'),now=Date.now();
 const first=publishNetwork({dataDir:owner,profile:profile(),name:'Renewed network',local:true,days:1,now});
 const invitation=decodeInvitation(first.code),envelope=readNetworkPublication(owner);
 mirrorNetwork(mirror,invitation,envelope);assert.equal(renewNetworkPublication(mirror,{now}),null);
 const next=renewNetworkPublication(owner,{now});assert.equal(next.revision,first.revision+1);assert.equal(next.code,first.code);
 assert.deepEqual(verifyNetwork(readNetworkPublication(owner),invitation,{now}).profile,profile());
 assert.equal(renewNetworkPublication(owner,{now}),null);
});
