#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {namePolicyId,validateNameWitnessPolicy,witnessKeyId} from '../src/name-certificates.mjs';

const ROSTER='arns-mesh-name-witness-roster/v1',MAX_FILE_BYTES=64*1024;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
const base58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const genesisToken=value=>typeof value==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
function publicAddress(value){
 if(!genesisToken(value))return false;
 let number=0n;for(const char of value)number=number*58n+BigInt(base58.indexOf(char));
 let length=0;for(let remaining=number;remaining>0n;remaining>>=8n)length++;
 let zeros=0;while(value[zeros]==='1')zeros++;
 return zeros+length===32;
}
function integer(value,min,max,code){if(!Number.isSafeInteger(value)||value<min||value>max)fail(code);return value;}
function decimal(value,min,max){
 if(typeof value!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(value))fail('name_witness_policy_integer_required');
 return integer(Number(value),min,max,'name_witness_policy_integer_invalid');
}
function utc(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))fail('name_witness_policy_utc_time_required');
 const stamp=Date.parse(value),canonical=value.length===20?value.slice(0,-1)+'.000Z':value;
 if(!Number.isSafeInteger(stamp)||stamp<0||new Date(stamp).toISOString()!==canonical)fail('name_witness_policy_time_invalid');
 return stamp;
}
function checkedNow(now){return integer(now(),0,8640000000000000,'name_witness_policy_clock_invalid');}
function rosterWitnesses(roster){
 if(!exact(roster,['schema','witnesses'])||roster.schema!==ROSTER||!Array.isArray(roster.witnesses)||roster.witnesses.length<2||roster.witnesses.length>32)fail('name_witness_policy_roster_invalid');
 const domains=new Set(),keys=new Set();
 return roster.witnesses.map(witness=>{
  if(!exact(witness,['domain','publicKeyPem'])||typeof witness.domain!=='string'||!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(witness.domain))fail('name_witness_policy_roster_invalid');
  // The pilot uses one key per independently administered domain. This does
  // not prove actual independence; operators must review that out of band.
  if(domains.has(witness.domain))fail('name_witness_policy_duplicate_domain');
  const pem=witness.publicKeyPem;
  if(typeof pem!=='string'||Buffer.byteLength(pem)>1024||!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(pem))fail('name_witness_policy_public_key_required');
  let key;try{key=crypto.createPublicKey(pem);}catch{fail('name_witness_policy_public_key_invalid');}
  if(key.asymmetricKeyType!=='ed25519')fail('name_witness_policy_public_key_invalid');
  const publicKeyPem=key.export({type:'spki',format:'pem'}),keyId=witnessKeyId(publicKeyPem);
  if(keys.has(keyId))fail('name_witness_policy_duplicate_key');
  domains.add(witness.domain);keys.add(keyId);
  return {domain:witness.domain,publicKeyPem};
 });
}
function chainScope(policy){
 if(typeof policy.networkId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(policy.networkId))fail('name_witness_policy_network_invalid');
 if(typeof policy.chainId!=='string'||!policy.chainId.startsWith('solana:')||!genesisToken(policy.chainId.slice(7)))fail('name_witness_policy_genesis_invalid');
 if(!publicAddress(policy.registryProgramId))fail('name_witness_policy_program_invalid');
}

/** Construct a review candidate only. Never installs a policy or enrolls keys. */
export function createReviewedNamePolicy({roster,networkId,genesisHash,registryProgramId,maxFaults,threshold,validFrom,validUntil,roundMs,leaseMs,maxFutureSkewMs},{now=Date.now}={}){
 const witnesses=rosterWitnesses(roster),n=witnesses.length;
 integer(maxFaults,0,n-1,'name_witness_policy_fault_budget_invalid');
 const minimum=Math.max(2,Math.floor((n+maxFaults)/2)+1),q=threshold===undefined?minimum:threshold;
 if(!Number.isSafeInteger(q)||q<minimum||q>n-maxFaults)fail('name_witness_policy_quorum_unsafe');
 const candidate={schema:'arns-mesh-name-policy/v1',networkId,chainId:'solana:'+genesisHash,registryProgramId,threshold:q,maxFaults,validFrom,validUntil,roundMs,leaseMs,maxFutureSkewMs,witnesses};
 chainScope(candidate);
 const clock=checkedNow(now),policy=validateNameWitnessPolicy(candidate,{now:clock,allowInactive:true});
 if(policy.validUntil<=clock)fail('name_policy_inactive');
 return policy;
}

/** Active check is deliberately stricter than an offline structural review. */
export function checkReviewedNamePolicy(value,{policyId=null,now=Date.now}={}){
 if(!plain(value))fail('name_witness_policy_invalid');
 rosterWitnesses({schema:ROSTER,witnesses:value.witnesses});chainScope(value);
 const policy=validateNameWitnessPolicy(value,{now:checkedNow(now)}),actual=namePolicyId(policy);
 if(policyId!==null&&(typeof policyId!=='string'||!/^[a-f0-9]{64}$/.test(policyId)||policyId!==actual))fail('name_witness_policy_pin_mismatch');
 return policy;
}
function summary(policy,now){
 const n=policy.witnesses.length;
 return {policyId:namePolicyId(policy),networkId:policy.networkId,chainId:policy.chainId,registryProgramId:policy.registryProgramId,
  witnessDomains:n,threshold:policy.threshold,maxFaults:policy.maxFaults,minimumQuorumIntersection:2*policy.threshold-n,availableWithMaxFaults:n-policy.maxFaults,
  active:now>=policy.validFrom&&now<policy.validUntil,validFrom:new Date(policy.validFrom).toISOString(),validUntil:new Date(policy.validUntil).toISOString(),
  roundMs:policy.roundMs,leaseMs:policy.leaseMs,maxFutureSkewMs:policy.maxFutureSkewMs,
  witnesses:policy.witnesses.map(w=>({domain:w.domain,keyId:witnessKeyId(w.publicKeyPem)})),
  assurance:'Operator identities and administrative independence require external review; this digest does not authenticate them.'};
}
function readJson(io,file){
 const stat=io.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE_BYTES)fail('name_witness_policy_input_invalid');
 const text=io.readFileSync(file,'utf8');if(Buffer.byteLength(text)>MAX_FILE_BYTES)fail('name_witness_policy_input_invalid');
 try{return JSON.parse(text);}catch{fail('name_witness_policy_json_invalid');}
}
function safeParent(io,file){
 let dir=path.dirname(file);
 for(;;){const stat=io.lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())fail('name_witness_policy_output_directory_invalid');const parent=path.dirname(dir);if(parent===dir)return;dir=parent;}
}
function parse(argv){
 const requiredCreate=['--roster','--network-id','--genesis-hash','--registry-program-id','--max-faults','--valid-from','--valid-until','--round-ms','--lease-ms','--max-future-skew-ms','--output'];
 if(!Array.isArray(argv)||!['create','check'].includes(argv[0]))fail('name_witness_policy_usage');
 const command=argv[0],required=command==='create'?requiredCreate:['--policy'],allowed=command==='create'?[...required,'--threshold']:['--policy','--policy-id'],options={command};
 for(let i=1;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];if(!allowed.includes(key)||Object.hasOwn(options,key)||typeof value!=='string'||!value||value.startsWith('--'))fail('name_witness_policy_usage');options[key]=value;}
 if(required.some(key=>!Object.hasOwn(options,key)))fail('name_witness_policy_usage');
 return options;
}
export function runNameWitnessPolicyCommand(argv,{io=fs,now=Date.now}={}){
 const options=parse(argv),clock=checkedNow(now);
 if(options.command==='check'){
  const policy=checkReviewedNamePolicy(readJson(io,path.resolve(options['--policy'])),{policyId:options['--policy-id']??null,now:()=>clock});
  return {command:'check',valid:true,...summary(policy,clock)};
 }
 const policy=createReviewedNamePolicy({roster:readJson(io,path.resolve(options['--roster'])),networkId:options['--network-id'],genesisHash:options['--genesis-hash'],registryProgramId:options['--registry-program-id'],
  maxFaults:decimal(options['--max-faults'],0,31),threshold:options['--threshold']===undefined?undefined:decimal(options['--threshold'],2,32),
  validFrom:utc(options['--valid-from']),validUntil:utc(options['--valid-until']),roundMs:decimal(options['--round-ms'],1000,3600000),leaseMs:decimal(options['--lease-ms'],0,86400000),maxFutureSkewMs:decimal(options['--max-future-skew-ms'],0,60000)},
  {now:()=>clock});
 const output=path.resolve(options['--output']);safeParent(io,output);
 const encoded=JSON.stringify(policy,null,2)+'\n';if(Buffer.byteLength(encoded)>MAX_FILE_BYTES)fail('name_witness_policy_output_too_large');
 // Exclusive creation is intentional: updating a pinned policy is a separate
 // reviewed migration, never an overwrite or automatic roster adjustment.
 let fd;try{fd=io.openSync(output,'wx',0o644);}catch(error){if(error.code==='EEXIST')fail('name_witness_policy_output_exists');throw error;}
 try{io.writeFileSync(fd,encoded,'utf8');io.fsyncSync(fd);}finally{io.closeSync(fd);}
 return {command:'create',output,...summary(policy,clock)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(runNameWitnessPolicyCommand(process.argv.slice(2)),null,2));}
 catch(error){console.error(typeof error.code==='string'&&/^name_[a-z0-9_]+$/.test(error.code)?error.code:'name_witness_policy_command_failed');process.exitCode=1;}
}
