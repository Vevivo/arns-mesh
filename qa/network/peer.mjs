// Isolated acceptance peer. IPC commands are test control, never network APIs.
import fs from 'node:fs';
import path from 'node:path';
import {MeshPeer} from '../../apps/peer/embedded-peer.mjs';
import {startDirectPeerServer} from '../../src/direct-peer.mjs';
import {publishNetwork,readNetworkPublication,mirrorNetwork} from '../../apps/helper/network-publication.mjs';
import {fetchMeshContent} from '../../src/content-fetcher.mjs';
import {createSwarmMeshClient} from '../../src/swarm-client.mjs';

const dataDir=path.resolve(process.argv[2]);fs.mkdirSync(dataDir,{recursive:true});
const locationsFile=path.join(dataDir,'locations.json');fs.writeFileSync(locationsFile,'{}');
process.env.ARNS_MESH_DIRECT_ONLY='1';
const peer=new MeshPeer({dataDir:path.join(dataDir,'peer'),locationsFile,allowRemoteFetch:false});await peer.start();
const server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0,networkAnnouncement:()=>readNetworkPublication(dataDir)});
process.send?.({ready:true,address:'127.0.0.1:'+server.address.port,pid:process.pid});
process.on('message',async message=>{
 try{
  let result;
  if(message.action==='publish')result=publishNetwork({dataDir,profile:message.profile,name:message.name||'Acceptance Mesh',seeds:message.seeds,local:true});
  else if(message.action==='mirror'){
   const record=JSON.parse(fs.readFileSync(message.file));mirrorNetwork(dataDir,record.invitation,record.envelope);result={mirrored:true,hasAuthorityKey:fs.existsSync(path.join(dataDir,'network-authority.private.json'))};
  }else if(message.action==='put'){await peer.contentStore.put(message.dataId,Buffer.from(message.bytes,'base64'));result={stored:peer.contentStore.has(message.dataId)};}
  else if(message.action==='copy'){
   const client=createSwarmMeshClient({directPeers:message.peers.map(value=>{const split=value.lastIndexOf(':');return {host:value.slice(0,split),port:Number(value.slice(split+1))};}),dhtEnabled:false,cacheOnly:true});
   try{const value=await fetchMeshContent(message.dataId,{client,contentStore:peer.contentStore,signal:AbortSignal.timeout(15000)});result={stored:peer.contentStore.has(message.dataId),signatureVerified:Boolean(value.direct.signatureVerified),source:value.direct.transport};}finally{await client.stop();}
  }else if(message.action==='status')result=peer.status();
  else throw new Error('Unknown test command.');
  process.send?.({id:message.id,result});
 }catch(error){process.send?.({id:message.id,error:String(error.message)});}
});
async function stop(){await server.close();await peer.stop();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('disconnect',stop);
