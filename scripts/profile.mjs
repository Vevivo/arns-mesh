import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {profileSchema,validateProfile,loadProfile,applyProfile} from '../apps/helper/network-profile.mjs';
import {namePolicyId,validateNameWitnessPolicy} from '../src/name-certificates.mjs';
const MAX_POLICY_BYTES=65536,MAX_PROFILE_BYTES=8192;
function pinnedNamePolicy(file,pin){
 if(typeof pin!=='string'||!/^[a-f0-9]{64}$/.test(pin))throw new Error('name_policy_pin_invalid');
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_POLICY_BYTES)throw new Error('name_policy_input_invalid');
 const fd=fs.openSync(file,'r');let encoded;
 try{
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.size>MAX_POLICY_BYTES)throw new Error('name_policy_input_invalid');
  // Bound the actual read as well as stat: a growing input must not allocate
  // an unbounded buffer while constructing a public connection profile.
  const bytes=Buffer.alloc(MAX_POLICY_BYTES+1);let length=0,read;
  while(length<bytes.length&&(read=fs.readSync(fd,bytes,length,bytes.length-length,null))>0)length+=read;
  if(length>MAX_POLICY_BYTES)throw new Error('name_policy_input_invalid');
  encoded=bytes.subarray(0,length).toString('utf8');
 }finally{fs.closeSync(fd);}
 let value;try{value=JSON.parse(encoded);}catch{throw new Error('name_policy_json_invalid');}
 const policy=validateNameWitnessPolicy(value);
 if(namePolicyId(policy)!==pin)throw new Error('name_policy_pin_mismatch');
 return policy;
}
export function run(args){
 if(args[0]==='apply'){
  if(args.length!==3)throw new Error('Usage: node scripts/profile.mjs apply PROFILE.json DATA_DIRECTORY');
  applyProfile(path.resolve(args[2]),loadProfile(path.resolve(args[1])));console.log('Connection profile applied. Restart the peer to use it.');return;
 }
 if(args[0]==='check'){
  if(args.length!==2)throw new Error('Usage: node scripts/profile.mjs check PROFILE.json');
  const p=loadProfile(args[1]);console.log(JSON.stringify({valid:true,meshPeers:p.directPeers.length,rpcSources:p.rpcSources.length,rawArweavePeers:p.arweavePeers.length}));return;
 }
 const p={schema:profileSchema,directPeers:[],rpcSources:[],arweavePeers:[]};let output,policyFile,policyPin;
 for(let i=0;i<args.length;i+=2){
  const key=args[i],value=args[i+1];if(!value)throw new Error('Missing option value');
  if(key==='--peer')p.directPeers.push(value);
  else if(key==='--rpc')p.rpcSources.push(value);
  else if(key==='--arweave')p.arweavePeers.push(value);
  else if(key==='--trust-peer')(p.trustedPeers??=[]).push(value);
  else if(key==='--output'){if(output!==undefined)throw new Error('Duplicate option: '+key);output=value;}
  else if(key==='--name-policy'){if(policyFile!==undefined)throw new Error('Duplicate option: '+key);policyFile=value;}
  else if(key==='--name-policy-id'){if(policyPin!==undefined)throw new Error('Duplicate option: '+key);policyPin=value;}
  else throw new Error('Unknown option: '+key);
 }
 if(!output)throw new Error('Usage: node scripts/profile.mjs --peer IP:PORT [--rpc IP:PORT] [--arweave IP:PORT] [--trust-peer PUBLIC_WITNESS_ID] [--name-policy FILE --name-policy-id AUTHENTICATED_POLICY_ID] --output network-profile.private.json');
 if((policyFile===undefined)!==(policyPin===undefined))throw new Error('Both --name-policy and --name-policy-id are required together.');
 if(policyFile!==undefined)p.nameWitnessPolicy=pinnedNamePolicy(policyFile,policyPin);
 const encoded=JSON.stringify(validateProfile(p),null,2)+'\n';
 if(Buffer.byteLength(encoded)>MAX_PROFILE_BYTES)throw new Error('Connection profile exceeds 8 KiB.');
 fs.writeFileSync(output,encoded,{mode:0o600,flag:'wx'});console.log('Created '+output+'. Share only the service addresses you intend recipients to use.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{run(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
