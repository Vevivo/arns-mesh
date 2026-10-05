import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {signDataItem} from '@ardrive/turbo-upload';
import {NetworkConnection} from '../apps/helper/network-connection.mjs';
import {networkId,networkRecordHash,connectionRecordHash} from '../src/network-invitation.mjs';
import {PeerDiscovery} from '../src/peer-discovery.mjs';
import {loadConfiguredPeers} from '../src/direct-peer.mjs';
import {readProfile} from '../apps/helper/network-profile.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';

async function spawnPeer(dataDir){
 const child=fork(fileURLToPath(new URL('../qa/network/peer.mjs',import.meta.url)),[dataDir],{stdio:['ignore','ignore','pipe','ipc']});let seq=0;const pending=new Map();let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 child.on('message',message=>{if(message.id&&pending.has(message.id)){const {resolve,reject,timer}=pending.get(message.id);pending.delete(message.id);clearTimeout(timer);message.error?reject(new Error(message.error)):resolve(message.result);}});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Peer startup timeout '+stderr));},15000);child.on('message',message=>{if(message.ready){clearTimeout(timer);resolve(message);}});child.on('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Peer exited '+code+' '+stderr));});});
 return {...ready,child,call(action,extra={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Peer command timeout'));},20000);pending.set(id,{resolve,reject,timer});child.send({id,action,...extra});});},async close(){if(child.exitCode!==null||child.signalCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}};
}
test('two separate peer processes replicate verified bytes; restart discovers the survivor after seed loss',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-process-network-'));
 const a=await spawnPeer(path.join(root,'a')),b=await spawnPeer(path.join(root,'b'));
 t.after(async()=>{await a.close();await b.close();fs.rmSync(root,{recursive:true,force:true});});
 assert.notEqual(a.pid,b.pid);
 const profile={schema:'arns-mesh-network-profile/v1',directPeers:[a.address,b.address],rpcSources:['127.0.0.1:8899'],arweavePeers:[]};
 const invitation=await a.call('publish',{profile,seeds:[a.address]});
 if(process.platform!=='win32'){
  // Real announcement/CLI joining through the POSIX installer. Dependency
  // installation alone is a double; CI separately uses the locked real tree.
  const bin=path.join(root,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'npm'),'#!/bin/sh\nexit 0\n',{mode:0o700});
  const installRoot=path.join(root,'installed'),env={...process.env,PATH:bin+path.delimiter+process.env.PATH,MESH_INSTALL_ROOT:installRoot};
  const installer=fileURLToPath(new URL('../scripts/install-peer.sh',import.meta.url));
  await promisify(execFile)('bash',[installer,'--network',invitation.code],{env,timeout:30000,maxBuffer:1024*1024});
  assert.deepEqual(readProfile(path.join(installRoot,'data')),profile);
  assert.equal(new NetworkConnection({dataDir:path.join(installRoot,'data')}).status().joined,true);
  fs.writeFileSync(path.join(installRoot,'data','identity.json'),'identity-marker');
  await promisify(execFile)('bash',[installer,'--network',invitation.code],{env,timeout:30000,maxBuffer:1024*1024});
  assert.equal(fs.readFileSync(path.join(installRoot,'data','identity.json'),'utf8'),'identity-marker');
  assert.deepEqual(readProfile(path.join(installRoot,'data')),profile);
 }

 const mirror=await b.call('mirror',{file:path.join(root,'a','network-announcement.json')});assert.equal(mirror.hasAuthorityKey,false);
 const readerDir=path.join(root,'reader'),reader=new NetworkConnection({dataDir:readerDir});const preview=await reader.inspect(invitation.code);
 await reader.join(invitation.code,{expectedId:networkId(preview.invitation.key),expectedRevision:preview.payload.revision,expectedHash:networkRecordHash(preview.envelope)});
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'});
 const item=signDataItem(key,{data:Buffer.from('verified content survives the original peer process'),tags:[{name:'Content-Type',value:'text/plain'}]});
 assert.equal((await a.call('put',{dataId:item.idB64Url,bytes:item.binary.toString('base64')})).stored,true);
 assert.equal((await b.call('copy',{dataId:item.idB64Url,peers:[a.address]})).stored,true);
 await a.close();
 const restarted=new NetworkConnection({dataDir:readerDir});await restarted.refresh();assert.equal(restarted.status().joined,true);
 const configured=readProfile(readerDir);assert.ok(configured.directPeers.includes(b.address));
 const client=createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:Number(b.address.split(':').at(-1))}],dhtEnabled:false,cacheOnly:true});
 try{const result=await fetchMeshContent(item.idB64Url,{client,signal:AbortSignal.timeout(10000)});assert.equal(result.direct.payload.toString(),'verified content survives the original peer process');assert.equal(result.direct.transport,'p2p-content');}finally{await client.stop();}
 // Same-host processes demonstrate protocol behavior, not independent hosting.
});

test('late supporter self-enrolls across separate processes; existing reader learns it without a profile edit and survives seed loss',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-late-process-')),a=await spawnPeer(path.join(root,'a'));let b,discovery;
 t.after(async()=>{discovery?.close();await a.close();await b?.close();fs.rmSync(root,{recursive:true,force:true});});
 const invitation=await a.call('publish',{profile:{schema:'arns-mesh-network-profile/v1',directPeers:[a.address],rpcSources:['127.0.0.1:8899'],arweavePeers:[]},seeds:[a.address]});
 const readerDir=path.join(root,'reader'),network=new NetworkConnection({dataDir:readerDir}),p=await network.inspect(invitation.code);
 await network.join(invitation.code,{expectedId:networkId(p.invitation.key),expectedRevision:p.payload.revision,expectedHash:connectionRecordHash(p.envelope,p.recovery)});
 discovery=new PeerDiscovery({dataDir:readerDir,scope:()=>({id:networkId(network.state.invitation.key),local:true}),peers:()=>loadConfiguredPeers(path.join(readerDir,'mesh-ip-peers.json'))});
 await discovery.sync();const unchanged=JSON.stringify(readProfile(readerDir));
 b=await spawnPeer(path.join(root,'b'));assert.notEqual(a.pid,b.pid);
 assert.equal((await b.call('enroll',{code:invitation.code})).acceptedBy,1);
 await discovery.sync();assert.ok(discovery.directory.addresses().some(x=>x.port===Number(b.address.split(':').at(-1))));assert.equal(JSON.stringify(readProfile(readerDir)),unchanged);
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:4096}).privateKey.export({format:'jwk'}),item=signDataItem(key,{data:Buffer.from('automatically learned supporter survives'),tags:[]});
 await a.call('put',{dataId:item.idB64Url,bytes:item.binary.toString('base64')});await b.call('copy',{dataId:item.idB64Url,peers:[a.address]});
 await a.close();await network.refresh();assert.equal(network.status().joined,true);
 const client=createSwarmMeshClient({directPeers:loadConfiguredPeers(path.join(readerDir,'mesh-ip-peers.json')),directory:discovery.directory,dhtEnabled:false});
 const result=await client.content(item.idB64Url,{signal:AbortSignal.timeout(8000)});assert.equal(result.payload.toString(),'automatically learned supporter survives');assert.equal(JSON.stringify(readProfile(readerDir)),unchanged);
});
