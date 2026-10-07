import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {encodeInvitation,decodeInvitation,networkPublicKey,signNetworkContinuity,verifyNetwork,withNetworkContinuity,invitationScope,networkId,connectionRecordHash} from '../src/network-invitation.mjs';
import {NetworkConnection,findNetwork} from '../apps/helper/network-connection.mjs';
import {publishNetwork,publishNetworkContinuity,readNetworkPublication,readNetworkRecovery,renewNetworkPublication} from '../apps/helper/network-publication.mjs';
import {readProfile} from '../apps/helper/network-profile.mjs';

function fixture(){
 const privateKey=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'}),key=networkPublicKey(privateKey),seeds=['127.0.0.1:1'],local=true;
 const profile={schema:'arns-mesh-network-profile/v1',directPeers:seeds,rpcSources:['127.0.0.1:8899'],arweavePeers:[],trustedPeers:['a'.repeat(64)]};
 const definition=signNetworkContinuity({name:'Surviving Mesh',profile,seeds,local,bootstrap:['127.0.0.1:49737']},privateKey);
 return {privateKey,profile,legacy:{version:1,key,seeds,local},invitation:{version:2,key,seeds,local,definition}};
}
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-continuity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
async function join(connection,code){const p=await connection.inspect(code);return connection.join(code,{expectedId:networkId(p.invitation.key),expectedRevision:p.payload.revision,expectedHash:connectionRecordHash(p.envelope,p.recovery)});}
test('durable invitation authenticates every bootstrap/profile flag and survives original operator absence',async t=>{
 const f=fixture(),code=encodeInvitation(f.invitation);assert.deepEqual(decodeInvitation(code),f.invitation);
 assert.throws(()=>encodeInvitation({...f.invitation,seeds:['127.0.0.1:2']}),/seeds/);
 assert.throws(()=>encodeInvitation({...f.invitation,local:false,seeds:['192.0.2.1:49740']}),/definition/);
 const forged={...f.invitation,definition:{...f.invitation.definition,recordJson:f.invitation.definition.recordJson.replace('49737','49738')}};
 assert.throws(()=>encodeInvitation(forged),/signature/);
 assert.throws(()=>signNetworkContinuity({...JSON.parse(f.invitation.definition.recordJson),bootstrap:['example.com:49737']},f.privateKey),/numeric/);
 const scope=invitationScope(f.invitation);assert.deepEqual(scope.bootstrap,['127.0.0.1:49737']);
 const root=temp(t),query=async()=>{throw new Error('Original operator is offline');},connection=new NetworkConnection({dataDir:root,query});
 await join(connection,code);
 assert.equal(connection.status().joined,true);assert.equal(connection.status().continuity,true);assert.equal(connection.status().expired,false);assert.equal(connection.status().expiresAt,null);
 assert.deepEqual(readProfile(root),f.profile);assert.equal(fs.existsSync(path.join(root,'network-authority.private.json')),false);
 const later=new NetworkConnection({dataDir:root,query,now:()=>Date.now()+90*86400000});await later.refresh();assert.equal(later.status().joined,true);
 assert.equal(verifyNetwork(f.invitation.definition,f.invitation,{now:Date.now()+365*86400000}).expiresAt,null);
});
test('an old code upgrades only from its own authority-signed bundled definition',async t=>{
 const root=temp(t),f=fixture(),file=path.join(root,'public.json');
 const bundle={schema:'arns-mesh-bundled-continuity/v1',invitations:[fixture().invitation,f.invitation]};fs.writeFileSync(file,JSON.stringify(bundle));
 assert.deepEqual(withNetworkContinuity(f.legacy,{file}),f.invitation);
 const connection=new NetworkConnection({dataDir:path.join(root,'reader'),continuityFile:file,query:async()=>{throw new Error('offline');}});
 await join(connection,encodeInvitation(f.legacy));assert.equal(connection.state.invitation.version,2);assert.deepEqual(readProfile(connection.dataDir).trustedPeers,['a'.repeat(64)]);
 bundle.invitations[1].definition.signature='A'.repeat(86);fs.writeFileSync(file,JSON.stringify(bundle));
 assert.deepEqual(withNetworkContinuity(f.legacy,{file}),f.legacy);
});
test('durable issuance preserves legacy live publication and never renews a mirror',async t=>{
 const root=temp(t),f=fixture(),first=publishNetwork({dataDir:root,profile:f.profile,name:'Legacy compatible',local:true});
 const live=readNetworkPublication(root),durable=publishNetworkContinuity({dataDir:root,bootstrap:['127.0.0.1:49737']});
 assert.deepEqual(readNetworkPublication(root),live);assert.equal(decodeInvitation(durable.code).version,2);
 assert.equal(verifyNetwork(live,decodeInvitation(first.code)).revision,first.revision);
 const renewed=renewNetworkPublication(root,{now:Date.now()+13*86400000});assert.equal(renewed.code,durable.code);
});
test('a durable fallback cannot roll back an accepted live profile or accept an expired live list',async t=>{
 const root=temp(t),f=fixture(),owner=path.join(root,'owner'),reader=path.join(root,'reader');
 publishNetwork({dataDir:owner,profile:f.profile,name:'Live version',local:true,days:1});
 const durable=publishNetworkContinuity({dataDir:owner,bootstrap:['127.0.0.1:49737']}),live=readNetworkPublication(owner);
 const recovery=readNetworkRecovery(owner);
 const connection=new NetworkConnection({dataDir:reader,query:async()=>({ok:true,network:live,recovery})});await join(connection,durable.code);assert.equal(connection.state.payload.revision,1);
 const later=new NetworkConnection({dataDir:reader,now:()=>Date.now()+2*86400000,query:async()=>({ok:true,network:live,recovery})});
 await assert.rejects(later.refresh(),/expired/);assert.equal(later.state.payload.revision,1);assert.deepEqual(readProfile(reader),f.profile);
 const invite=decodeInvitation(durable.code),found=await findNetwork(invite,{now:Date.now()+2*86400000,query:async()=>({ok:true,network:live,recovery})});
 assert.equal(found.continuity,true);assert.equal(found.payload.revision,0);assert.equal(found.envelope.recordJson,invite.definition.recordJson);
});
