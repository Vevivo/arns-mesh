import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {publishNetwork,readNetworkPublication,readNetworkRecovery,mirrorNetwork,renewNetworkPublication} from '../apps/helper/network-publication.mjs';
import {NetworkConnection} from '../apps/helper/network-connection.mjs';
import {decodeInvitation,networkId,connectionRecordHash,verifyNetworkRecovery} from '../src/network-invitation.mjs';
import {readProfile} from '../apps/helper/network-profile.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {requestIpJson} from '../src/ip-transport.mjs';

test('signed recovery witnesses survive joins, mirrors, restarts and expiry without changing legacy lists',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-recovery-network-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),reader=path.join(dir,'reader'),mirror=path.join(dir,'mirror');
 const server=await startDirectPeerServer({identity:{},requestsServed:0},{host:'127.0.0.1',port:0,networkAnnouncement:()=>readNetworkPublication(source),networkRecovery:()=>readNetworkRecovery(source)});t.after(()=>server.close());
 const profile={schema:'arns-mesh-network-profile/v1',directPeers:['127.0.0.1:'+server.address.port],rpcSources:['127.0.0.1:8899'],arweavePeers:[],trustedPeers:['a'.repeat(64)]};
 const publication=publishNetwork({dataDir:source,profile,name:'Recovery test',local:true,days:1});
 const legacy=await requestIpJson({host:'127.0.0.1',port:server.address.port,path:'/mesh/v1/query',method:'POST',body:{op:'network'},purpose:'mesh-peer'});
 assert.equal(legacy.recovery,undefined);assert.equal(JSON.parse(legacy.network.recordJson).profile.trustedPeers,undefined);
 const connection=new NetworkConnection({dataDir:reader}),preview=await connection.inspect(publication.code);
 assert.deepEqual(preview.profile.trustedPeers,profile.trustedPeers);
 await connection.join(publication.code,{expectedId:networkId(preview.invitation.key),expectedRevision:preview.payload.revision,expectedHash:connectionRecordHash(preview.envelope,preview.recovery)});
 assert.deepEqual(readProfile(reader),profile);assert.equal(new NetworkConnection({dataDir:reader}).status().joined,true);
 mirrorNetwork(mirror,preview.invitation,preview.envelope,preview.recovery);assert.deepEqual(readNetworkRecovery(mirror),preview.recovery);
 const later=new NetworkConnection({dataDir:reader,now:()=>preview.payload.expiresAt+1});assert.equal(later.status().expired,true);await assert.rejects(later.refresh(),/expired/);assert.deepEqual(readProfile(reader).trustedPeers,profile.trustedPeers);
 const renewed=renewNetworkPublication(source);assert.equal(renewed.code,publication.code);await connection.refresh();assert.deepEqual(readProfile(reader).trustedPeers,profile.trustedPeers);
 const invitation=decodeInvitation(publication.code),envelope=readNetworkPublication(source),recovery=readNetworkRecovery(source);
 assert.throws(()=>verifyNetworkRecovery(preview.recovery,envelope,invitation),/does not match/);
 assert.throws(()=>verifyNetworkRecovery({...recovery,recordJson:recovery.recordJson.replace('a'.repeat(64),'b'.repeat(64))},envelope,invitation),/signature/);
 // Revoking witnesses needs a new authority revision and clears installed trust.
 const {trustedPeers,...plain}=profile;publishNetwork({dataDir:source,profile:plain,name:'Recovery test',local:true});await connection.refresh();assert.equal(readProfile(reader).trustedPeers,undefined);
});
