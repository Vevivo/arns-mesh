import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {parseArweaveResourceUrl} from '../src/arweave-resource-url.mjs';
import {resolveArweaveResource} from '../apps/helper/resource-adapter.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {MeshPeer} from '../apps/peer/embedded-peer.mjs';
import {peerIdFromPublicKey} from '../src/common.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {createSwarmMeshClient} from '../src/swarm-client.mjs';
import {contentResponse,isAllowedRendererUrl} from '../apps/browser/response.mjs';

test('gateway spelling only supplies a case-sensitive immutable ID; APIs and unrelated URLs stay blocked',()=>{
 const id='aB'.repeat(21)+'C';
 const credentialed=new URL('https://arweave.net/'+id);credentialed.username='fixture';credentialed.password='test-only';
 assert.equal(parseArweaveResourceUrl('https://arweave.net/'+id+'?cache=1#part').dataId,id);
 assert.equal(parseArweaveResourceUrl('https://arweave.net/raw/'+id).raw,true);
 assert.equal(parseArweaveResourceUrl('https://'+'a'.repeat(52)+'.arweave.net/'+id+'/font.woff2').requestedPath,'font.woff2');
 for(const url of ['https://arweave.net/graphql','https://arweave.net/tx/'+id,'https://arweave.net/'+id+'/..%2fsecret','https://arweave.net/raw/'+id+'/child','https://arweave.net/'+id+'/%5cfile','https://evil.arweave.net/'+id,'https://arweave.net.evil.example/'+id,'https://arweave.net@evil.example/'+id,credentialed.href,'https://arweave.net:8080/'+id,'http://arweave.net/'+id,'https://127.0.0.1/'+id]){
  assert.equal(parseArweaveResourceUrl(url),null,url);assert.equal(isAllowedRendererUrl(url,{resourceType:'script'}),false,url);
 }
 assert.equal(isAllowedRendererUrl('https://arweave.net/'+id,{resourceType:'media'}),true);
 assert.equal(isAllowedRendererUrl('https://arweave.net/'+id,{resourceType:'mainFrame'}),false);
 assert.equal(isAllowedRendererUrl('https://arweave.net/'+id,{resourceType:'subFrame'}),false);
});

test('immutable resource and manifest URLs use verified Mesh bytes; saved access and ranges never require gateway/RPC',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-arweave-resource-')),empty=path.join(dir,'empty.json');fs.writeFileSync(empty,'[]');
 const env={ARWEAVE_PEERS:empty,ARWEAVE_PEER_SEEDS:empty,HYPER_PEER_CACHE:path.join(dir,'learned.json'),ARNS_HISTORICAL_INDEX:'0',ARNS_PREPARED_LOCATIONS:'',HYPER_BOOTSTRAP:empty,ARNS_MESH_HEAD_START_MS:'2500'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;fs.rmSync(dir,{recursive:true,force:true});});
 const source=new MeshPeer({dataDir:path.join(dir,'source'),allowRemoteFetch:false,locationsFile:path.join(dir,'source-locations.json')});
 const keys=crypto.generateKeyPairSync('ed25519');source.identity={publicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem:keys.privateKey.export({format:'pem',type:'pkcs8'})};source.witnessPeerId=peerIdFromPublicKey(source.identity.publicKeyPem);
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const make=async(data,type)=>{const item=createData(data,signer,{tags:[{name:'Content-Type',value:type}]});await item.sign(signer);await source.contentStore.put(item.id,item.getRaw());return item;};
 const css=await make('body { color: purple; }','text/css');
 const root=await make(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{id:css.id},paths:{'style.css':{id:css.id}}}),'application/x.arweave-manifest+json');
 const server=await startDirectPeerServer(source,{host:'127.0.0.1',port:0});
 const client=createSwarmMeshClient({directPeers:[{host:'127.0.0.1',port:server.address.port}],dhtEnabled:false,cacheOnly:true});
 const store=new VerifiedContentStore(path.join(dir,'reader'));
 try{
  const url='https://arweave.net/'+root.id+'/style.css';
  const result=await resolveArweaveResource(url,{client,contentStore:store,signal:AbortSignal.timeout(3000)});
  assert.equal(result.meta.gatewayUsed,false);assert.equal(result.meta.contentSignatureVerified,true);assert.equal(result.meta.dataId,css.id);assert.equal(result.contentType,'text/css');assert.equal(result.body.toString(),css.rawData.toString());
  const range=contentResponse(result,new Request(url,{headers:{range:'bytes=0-3'}}));assert.equal(range.status,206);assert.equal(await range.text(),'body');
  const requests=source.requestsServed;
  const saved=await resolveArweaveResource(url,{contentStore:store,localOnly:true,client:{content(){throw new Error('saved access made a network request');}}});assert.equal(saved.body.toString(),css.rawData.toString());assert.equal(source.requestsServed,requests);
  const raw=await resolveArweaveResource('https://arweave.net/raw/'+root.id,{contentStore:store,localOnly:true});assert.equal(JSON.parse(raw.body).manifest,'arweave/paths');
  await assert.rejects(resolveArweaveResource('https://arweave.net/'+css.id+'/absent',{contentStore:store,localOnly:true}),/path_requires_manifest/);
  await assert.rejects(resolveArweaveResource('https://arweave.net/'+'Z'.repeat(43),{contentStore:store,localOnly:true}),/not_saved/);
  const corrupt=Buffer.from(css.getRaw());corrupt[corrupt.length-1]^=1;fs.writeFileSync(store.file(css.id),corrupt);
  await assert.rejects(resolveArweaveResource(url,{contentStore:store,localOnly:true}),/signature_invalid/);
  assert.equal(source.requestsServed,requests,'bad saved bytes must not cause hidden network recovery');
 }finally{await client.stop();await server.close();}
});
