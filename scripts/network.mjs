import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeInvitation,networkId,networkRecordHash} from '../src/network-invitation.mjs';
import {loadProfile} from '../apps/helper/network-profile.mjs';
import {publishNetwork,mirrorNetwork} from '../apps/helper/network-publication.mjs';
import {NetworkConnection,findNetwork} from '../apps/helper/network-connection.mjs';

const usage=`Usage:
 node scripts/network.mjs publish --data PEER_DATA --profile READER_PROFILE.json --name "Network name" [--seed IP:PORT] [--days 14] [--local]
 node scripts/network.mjs check-code CONNECTION_CODE
 node scripts/network.mjs inspect CONNECTION_CODE
 node scripts/network.mjs join CONNECTION_CODE --data DATA_DIRECTORY
 node scripts/network.mjs refresh --data DATA_DIRECTORY
 node scripts/network.mjs mirror CONNECTION_CODE --data PEER_DATA
Connection codes are reusable invitations, not passwords or paid access licenses.`;
function options(args,allowed){const out={};for(let i=0;i<args.length;i++){const key=args[i];if(!allowed.includes(key))throw new Error(usage);if(key==='--local'){if(out[key])throw new Error('Duplicate option.');out[key]=true;continue;}const value=args[++i];if(!value||value.startsWith('--'))throw new Error(usage);if(key==='--seed')(out[key]??=[]).push(value);else{if(out[key]!==undefined)throw new Error('Duplicate option.');out[key]=value;}}return out;}
const need=(o,key)=>{if(!o[key])throw new Error(usage);return o[key];};
export async function run(args){
 const [command,...rest]=args;
 if(command==='publish'){
  const o=options(rest,['--data','--profile','--name','--seed','--days','--local']);
  return publishNetwork({dataDir:path.resolve(need(o,'--data')),profile:loadProfile(need(o,'--profile')),name:need(o,'--name'),seeds:o['--seed'],days:o['--days']===undefined?14:Number(o['--days']),local:o['--local']===true});
 }
 if(command==='check-code'){if(rest.length!==1)throw new Error(usage);const invite=decodeInvitation(rest[0]);return {valid:true,networkId:networkId(invite.key),startingPeers:invite.seeds.length,local:invite.local};}
 if(command==='inspect'){if(rest.length!==1)throw new Error(usage);const invite=decodeInvitation(rest[0]),r=await findNetwork(invite);return {name:r.payload.name,networkId:networkId(invite.key),revision:r.payload.revision,expiresAt:r.payload.expiresAt,profile:r.payload.profile,local:invite.local};}
 if(['join','mirror'].includes(command)){
  const code=rest[0],o=options(rest.slice(1),['--data']),dataDir=path.resolve(need(o,'--data'));
  if(command==='mirror'){const invitation=decodeInvitation(code),found=await findNetwork(invitation);mirrorNetwork(dataDir,invitation,found.envelope);return {mirrored:true,name:found.payload.name,revision:found.payload.revision};}
  const connection=new NetworkConnection({dataDir});
  const preview=await connection.inspect(code);
  await connection.join(code,{expectedId:networkId(preview.invitation.key),expectedRevision:preview.payload.revision,expectedHash:networkRecordHash(preview.envelope)});
  return {...connection.status(),message:'Connections saved. Start or restart the peer to use them.'};
 }
 if(command==='refresh'){const o=options(rest,['--data']);const connection=new NetworkConnection({dataDir:path.resolve(need(o,'--data'))});if(!connection.status().joined)throw new Error('No joined network.');await connection.refresh();return connection.status();}
 throw new Error(usage);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2)),error=>{console.error(error.message);process.exitCode=1;});
