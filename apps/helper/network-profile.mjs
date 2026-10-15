import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {validateNameWitnessPolicy,namePolicyId} from '../../src/name-certificates.mjs';
export const profileSchema='arns-mesh-network-profile/v1';
const format=p=>(net.isIP(p.host)===6?'['+p.host+']':p.host)+':'+p.port;
function list(values,max){
 if(!Array.isArray(values)||values.length>max)throw new Error('Invalid endpoint list.');
 return [...new Set(values.map(value=>{
  if(typeof value!=='string'||value.length>128)throw new Error('Expected numeric IP:port.');
  const at=value.lastIndexOf(':'),host=value.slice(0,at).replace(/^\[|\]$/g,''),port=Number(value.slice(at+1));
  if(!net.isIP(host)||!/^\d+$/.test(value.slice(at+1))||port<1||port>65535)throw new Error('Use numeric IP:port only. Domains, credentials and URL paths are not accepted.');
  return format({host,port});
 }))];
}
const optionalNamePolicy=(value,{allowInactive=false,now}={})=>value===undefined||value===null?null:validateNameWitnessPolicy(value,{allowInactive,now});
export function readNameWitnessPolicy(directory){
 const readOptional=name=>{
  try{return JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));}
  catch(error){if(error.code==='ENOENT')return undefined;throw error;}
 };
 const marker=readOptional('name-security-required.json');
 if(marker!==undefined&&(!marker||typeof marker!=='object'||Array.isArray(marker)||Object.keys(marker).some(k=>!['schema','policyId'].includes(k))||marker.schema!=='arns-mesh-name-security-required/v1'||typeof marker.policyId!=='string'||!/^[a-f0-9]{64}$/.test(marker.policyId)))throw new Error('invalid_name_security_marker');
 const policy=optionalNamePolicy(readOptional('name-witness-policy.json'),{allowInactive:true});
 // This marker can refuse a downgrade; it cannot authorize a policy.
 if(marker){
  if(!policy)throw new Error('name_witness_policy_required');
  if(namePolicyId(policy)!==marker.policyId)throw new Error('name_policy_migration_required');
 }
 if(!policy){
  // Retained membership is another refusal-only guard for installations that
  // predate the marker. NetworkConnection verifies its signatures separately.
  const membership=readOptional('network-membership.json');
  if(membership?.schema==='arns-mesh-membership/v1'){
   let record;
   try{record=JSON.parse(membership.envelope?.recordJson);}
   catch{throw new Error('invalid_accepted_name_policy_state');}
   if(record?.profile?.nameWitnessPolicy!==undefined&&record.profile.nameWitnessPolicy!==null)throw new Error('name_witness_policy_required');
  }
 }
 return policy;
}
export function assertNameWitnessPolicyUpdate(directory,value,{now}={}){
 const previous=readNameWitnessPolicy(directory),next=optionalNamePolicy(value?.nameWitnessPolicy,{now});
 if(previous&&!next)throw new Error('name_witness_policy_required');
 if(previous&&namePolicyId(previous)!==namePolicyId(next))throw new Error('name_policy_migration_required');
 return next;
}
const objects=values=>values.map(value=>{const at=value.lastIndexOf(':');return {host:value.slice(0,at).replace(/^\[|\]$/g,''),port:Number(value.slice(at+1))};});
export function trustedWitnesses(values=[]){if(!Array.isArray(values)||values.length>16||values.some(x=>typeof x!=='string'||!/^([a-f0-9]{64})$/.test(x)))throw new Error('Invalid saved-name witness identities.');return [...new Set(values)];}
export function readProfile(directory){
 const read=(name)=>{try{return JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}};
 const witnesses=trustedWitnesses(read('trusted-peers.json')),nameWitnessPolicy=readNameWitnessPolicy(directory);
 return {schema:profileSchema,directPeers:read('mesh-ip-peers.json'),rpcSources:read('solana-rpc-seeds.json').map(format),arweavePeers:read('arweave-peers.json').map(format),...(witnesses.length?{trustedPeers:witnesses}:{}),...(nameWitnessPolicy?{nameWitnessPolicy}:{})};
}
export function mergeProfiles(current,incoming){
 const next=validateProfile(incoming),previousPolicy=optionalNamePolicy(current.nameWitnessPolicy),nextPolicy=next.nameWitnessPolicy||null;
 if(previousPolicy&&!nextPolicy)throw new Error('A protected profile cannot omit its name witness policy.');
 if(previousPolicy&&nextPolicy&&namePolicyId(previousPolicy)!==namePolicyId(nextPolicy))throw new Error('Different name witness policies cannot be merged.');
 const nameWitnessPolicy=nextPolicy||previousPolicy;
 return validateProfile({schema:profileSchema,
  directPeers:[...new Set([...list(current.directPeers||[],16),...next.directPeers])],
  rpcSources:[...new Set([...list(current.rpcSources||[],8),...next.rpcSources])],
  arweavePeers:[...new Set([...list(current.arweavePeers||[],16),...next.arweavePeers])],
  ...((current.trustedPeers?.length||next.trustedPeers?.length)?{trustedPeers:trustedWitnesses([...(current.trustedPeers||[]),...(next.trustedPeers||[])])}:{}),
  ...(nameWitnessPolicy?{nameWitnessPolicy}:{}),
 });
}
export function validateProfile(value,{allowInactiveNamePolicy=false,now}={}){
 if(!value||value.schema!==profileSchema)throw new Error('Unsupported connection profile.');
 if(Object.keys(value).some(k=>!['schema','directPeers','rpcSources','arweavePeers','trustedPeers','nameWitnessPolicy'].includes(k)))throw new Error('Unexpected profile fields.');
 const p={schema:profileSchema,directPeers:list(value.directPeers,16),rpcSources:list(value.rpcSources,8),arweavePeers:list(value.arweavePeers||[],16)};
 if(value.trustedPeers?.length)p.trustedPeers=trustedWitnesses(value.trustedPeers);else if(value.trustedPeers!==undefined)trustedWitnesses(value.trustedPeers);
 const nameWitnessPolicy=optionalNamePolicy(value.nameWitnessPolicy,{allowInactive:allowInactiveNamePolicy,now});if(nameWitnessPolicy)p.nameWitnessPolicy=nameWitnessPolicy;
 if(!p.rpcSources.length&&(!nameWitnessPolicy||!p.directPeers.length))throw new Error('At least one numeric-IP Solana RPC is required for live names without certificate Mesh peers.');
 if(!p.directPeers.length&&!p.arweavePeers.length)throw new Error('At least one Mesh peer or raw Arweave peer is required.');
 return p;
}
export function loadProfile(file){
 if(fs.statSync(file).size>8192)throw new Error('Connection profile exceeds 8 KiB.');
 return validateProfile(JSON.parse(fs.readFileSync(file,'utf8')));
}
export function applyProfile(directory,value,{networkState,now}={}){
 const p=validateProfile(value,{now});fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const lock=path.join(directory,'connections.lock');
 try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw new Error('Another connection update is in progress.');throw e;}
 const entries=[['mesh-ip-peers.json',p.directPeers],['solana-rpc-seeds.json',objects(p.rpcSources)],['arweave-peers.json',objects(p.arweavePeers)],['arweave-peer-seeds.json',objects(p.arweavePeers)],['hyper-bootstrap.json',[]]];
 entries.push(['trusted-peers.json',p.trustedPeers||[]]);
 entries.push(['name-witness-policy.json',p.nameWitnessPolicy||null]);
 // Publish the refusal marker first so an interrupted activation fails closed.
 if(p.nameWitnessPolicy)entries.unshift(['name-security-required.json',{schema:'arns-mesh-name-security-required/v1',policyId:namePolicyId(p.nameWitnessPolicy)}]);
 if(networkState!==undefined)entries.push(['network-membership.json',networkState]);
 let previous=[],written=0;const staged=[];
 try{
  // Check under the same lock as the profile transaction, before any staging.
  assertNameWitnessPolicyUpdate(directory,p,{now});
  previous=entries.map(([name])=>{try{return fs.readFileSync(path.join(directory,name));}catch(e){if(e.code==='ENOENT')return null;throw e;}});
  for(const [name,value] of entries){const temp=path.join(directory,name+'.new'),fd=fs.openSync(temp,'wx',0o600);staged.push(temp);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
  for(const [name] of entries){fs.renameSync(path.join(directory,name+'.new'),path.join(directory,name));written++;}
 }catch(e){
  for(let i=0;i<written;i++){const file=path.join(directory,entries[i][0]);if(previous[i]===null)fs.rmSync(file,{force:true});else fs.writeFileSync(file,previous[i],{mode:0o600});}throw e;
 }finally{for(const file of staged)fs.rmSync(file,{force:true});fs.rmdirSync(lock);}
 return p;
}
