import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {profileSchema,validateProfile,loadProfile,applyProfile} from '../apps/helper/network-profile.mjs';
export function run(args){
 if(args[0]==='apply'){
  if(args.length!==3)throw new Error('Usage: node scripts/profile.mjs apply PROFILE.json DATA_DIRECTORY');
  applyProfile(path.resolve(args[2]),loadProfile(path.resolve(args[1])));console.log('Connection profile applied. Restart the peer to use it.');return;
 }
 if(args[0]==='check'){
  if(args.length!==2)throw new Error('Usage: node scripts/profile.mjs check PROFILE.json');
  const p=loadProfile(args[1]);console.log(JSON.stringify({valid:true,meshPeers:p.directPeers.length,rpcSources:p.rpcSources.length,rawArweavePeers:p.arweavePeers.length}));return;
 }
 const p={schema:profileSchema,directPeers:[],rpcSources:[],arweavePeers:[]};let output;
 for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!value)throw new Error('Missing option value');if(key==='--peer')p.directPeers.push(value);else if(key==='--rpc')p.rpcSources.push(value);else if(key==='--arweave')p.arweavePeers.push(value);else if(key==='--output')output=value;else throw new Error('Unknown option: '+key);}
 if(!output)throw new Error('Usage: node scripts/profile.mjs --peer IP:PORT --rpc IP:PORT [--arweave IP:PORT] --output network-profile.private.json');
 fs.writeFileSync(output,JSON.stringify(validateProfile(p),null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Created '+output+'. Share only the service addresses you intend recipients to use.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{run(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
