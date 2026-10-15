#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {namePolicyId,validateNameWitnessPolicy,witnessKeyId} from '../src/name-certificates.mjs';
import {enrollNewNameSignerState} from '../src/sharded-name-state.mjs';

const SOURCE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const IDENTITY='arns-mesh-name-witness-identity/v1';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function exists(io,file){try{io.lstatSync(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function directory(io,dir){const stat=io.lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())fail('name_witness_directory_invalid');return stat;}
function ancestors(io,dir){
 const paths=[];let current=path.resolve(dir);
 for(;;){paths.push(current);const parent=path.dirname(current);if(parent===current)break;current=parent;}
 for(const value of paths.reverse())directory(io,value);
}
function fsyncDirectory(io,dir){const fd=io.openSync(dir,'r');try{io.fsyncSync(fd);}finally{io.closeSync(fd);}}
function writeExclusive(io,file,data,mode=0o600){
 const fd=io.openSync(file,'wx',mode);
 try{io.writeFileSync(fd,data,'utf8');io.fsyncSync(fd);}finally{io.closeSync(fd);}
 fsyncDirectory(io,path.dirname(file));
}
function read(io,file,max=16384,{privateFile=false}={}){
 const stat=io.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)fail('name_witness_file_invalid');
 if(privateFile&&Number.isInteger(stat.mode)&&(stat.mode&0o077)!==0)fail('name_witness_private_permissions_invalid');
 const data=io.readFileSync(file,'utf8');if(Buffer.byteLength(data)>max)fail('name_witness_file_invalid');return data;
}
function readJson(io,file,max){try{return JSON.parse(read(io,file,max));}catch(error){if(error.code?.startsWith('name_'))throw error;fail('name_witness_json_invalid');}}
function json(value){return JSON.stringify(value,null,2)+'\n';}
function timestamp(now){const value=now();if(!Number.isSafeInteger(value)||value<0)fail('name_witness_clock_invalid');return value;}
function parse(argv){
 if(!Array.isArray(argv)||!['keygen','enroll'].includes(argv[0]))fail('name_witness_usage');
 const command=argv[0],allowed=command==='keygen'?['--data-dir']:['--data-dir','--peer-data-dir','--policy','--policy-id','--max-names','--rpc-seeds'];
 const options={command};
 for(let i=1;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!allowed.includes(key)||Object.hasOwn(options,key)||typeof value!=='string'||!value||value.startsWith('--'))fail('name_witness_usage');
  options[key]=value;
 }
 if(!options['--data-dir']||!path.isAbsolute(options['--data-dir']))fail('name_witness_absolute_data_directory_required');
 if(command==='enroll'&&(!options['--policy']||!options['--policy-id']||!/^[a-f0-9]{64}$/.test(options['--policy-id'])))fail('name_witness_pinned_policy_required');
 if(command==='enroll'&&(!options['--peer-data-dir']||!path.isAbsolute(options['--peer-data-dir'])))fail('name_witness_existing_peer_directory_required');
 return options;
}
function outsideSource(dir,sourceRoot){
 const relative=path.relative(path.resolve(sourceRoot),dir);
 if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('name_witness_data_directory_inside_source');
}
function readUnusedIdentity(io,dir){
 const identity=readJson(io,path.join(dir,'identity.json'));
 if(!plain(identity)||Object.keys(identity).some(key=>!['schema','keyId','publicKeyPem','createdAt','nonce','purpose'].includes(key))||identity.schema!==IDENTITY||identity.purpose!=='new-unused-witness-key'||!/^[a-f0-9]{32}$/.test(identity.nonce)||!Number.isSafeInteger(identity.createdAt)||identity.createdAt<0)fail('name_witness_identity_invalid');
 const privateKeyPem=read(io,path.join(dir,'private-key.pem'),4096,{privateFile:true});
 let key,publicKeyPem;try{key=crypto.createPrivateKey(privateKeyPem);publicKeyPem=crypto.createPublicKey(key).export({type:'spki',format:'pem'});}catch{fail('name_witness_key_invalid');}
 if(key.asymmetricKeyType!=='ed25519'||identity.publicKeyPem!==publicKeyPem||identity.keyId!==witnessKeyId(publicKeyPem)||read(io,path.join(dir,'public-key.pem'),1024)!==publicKeyPem)fail('name_witness_identity_key_mismatch');
 if(['enrollment-consumed.json','signer-state','runtime-env.json','name-witness-policy.json','name-security-required.json'].some(file=>exists(io,path.join(dir,file))))fail('name_witness_already_enrolled_or_interrupted');
 return identity;
}

/** Internal I/O injection is only for deterministic tests. The actual command
 * requires Linux directory fsync and never imports an existing signing key. */
export function runNameWitnessCommand(argv,{io=fs,platform=process.platform,now=Date.now,sourceRoot=SOURCE_ROOT}={}){
 const options=parse(argv),dir=path.resolve(options['--data-dir']);
 if(platform!=='linux')fail('name_witness_linux_required');
 outsideSource(dir,sourceRoot);
 if(options.command==='keygen'){
  ancestors(io,path.dirname(dir));
  if(exists(io,dir))fail('name_witness_data_directory_already_exists');
  const createdAt=timestamp(now),{privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
  const publicKeyPem=publicKey.export({type:'spki',format:'pem'}),keyId=witnessKeyId(publicKeyPem);
  io.mkdirSync(dir,{mode:0o700});fsyncDirectory(io,path.dirname(dir));
  writeExclusive(io,path.join(dir,'private-key.pem'),privateKey.export({type:'pkcs8',format:'pem'}));
  writeExclusive(io,path.join(dir,'public-key.pem'),publicKeyPem,0o644);
  const identity={schema:IDENTITY,purpose:'new-unused-witness-key',keyId,publicKeyPem,createdAt,nonce:crypto.randomBytes(16).toString('hex')};
  // Written last: an incomplete key generation is never accepted for enrollment.
  writeExclusive(io,path.join(dir,'identity.json'),json(identity));
  return {command:'keygen',keyId,publicKeyFile:path.join(dir,'public-key.pem'),next:'Have the independently reviewed policy include this public key, then enroll once with its authenticated policy ID.'};
 }
 ancestors(io,dir);
 const stat=directory(io,dir);if(Number.isInteger(stat.mode)&&(stat.mode&0o077)!==0)fail('name_witness_private_permissions_invalid');
 const identity=readUnusedIdentity(io,dir),currentTime=timestamp(now);
 if(currentTime<identity.createdAt)fail('name_witness_clock_rollback');
 const supplied=readJson(io,path.resolve(options['--policy']),256*1024);
 const policy=validateNameWitnessPolicy(supplied,{now:currentTime}),policyId=namePolicyId(policy);
 if(policyId!==options['--policy-id'])fail('name_witness_policy_pin_mismatch');
 const peerDataDirectory=path.resolve(options['--peer-data-dir']);
 if(peerDataDirectory===dir)fail('name_witness_peer_directory_must_be_separate');
 ancestors(io,peerDataDirectory);outsideSource(peerDataDirectory,sourceRoot);
 // configureRuntime reads the accepted policy from the EXISTING peer data
 // directory. Check it here, without changing that directory or its contents.
 const peerPolicy=validateNameWitnessPolicy(readJson(io,path.join(peerDataDirectory,'name-witness-policy.json'),256*1024),{now:currentTime});
 const marker=readJson(io,path.join(peerDataDirectory,'name-security-required.json'),4096);
 if(namePolicyId(peerPolicy)!==policyId||!plain(marker)||marker.schema!=='arns-mesh-name-security-required/v1'||marker.policyId!==policyId)fail('name_witness_peer_policy_mismatch');
 if(!/^solana:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(policy.chainId))fail('name_witness_policy_chain_invalid');
 const own=policy.witnesses.filter(witness=>witnessKeyId(witness.publicKeyPem)===identity.keyId);
 if(own.length!==1)fail('name_witness_key_not_in_policy');
 if(policy.witnesses.filter(witness=>witness.domain===own[0].domain).length!==1)fail('name_witness_domain_key_rotation_requires_shared_state');
 let rpcSeedsFile=null;
 if(options['--rpc-seeds']){
  rpcSeedsFile=path.resolve(options['--rpc-seeds']);
  if(rpcSeedsFile===path.join(peerDataDirectory,'solana-rpc-seeds.json'))fail('name_witness_dedicated_rpc_file_required');
  const seeds=readJson(io,rpcSeedsFile,16384);
  if(!Array.isArray(seeds)||seeds.length<1||seeds.length>16||seeds.some(seed=>!plain(seed)||Object.keys(seed).some(key=>!['host','port'].includes(key))||!net.isIP(seed.host||'')||!Number.isSafeInteger(seed.port)||seed.port<1||seed.port>65535))fail('name_witness_rpc_seeds_invalid');
 }
 const maxNames=options['--max-names']===undefined?50000:Number(options['--max-names']);
 if(!Number.isSafeInteger(maxNames)||maxNames<1||maxNames>1000000||options['--max-names']!==undefined&&!/^[1-9][0-9]*$/.test(options['--max-names']))fail('name_witness_capacity_invalid');
 const stateEpoch=crypto.randomBytes(16).toString('hex'),stateDirectory=path.join(dir,'signer-state');
 // This irreversible local marker is committed BEFORE creating signer state.
 // A partial enrollment requires a NEW key and a newly reviewed policy, never
 // deleting this marker or reconstructing empty state for the old private key.
 writeExclusive(io,path.join(dir,'enrollment-consumed.json'),json({schema:'arns-mesh-name-witness-enrollment/v1',keyId:identity.keyId,policyId,stateEpoch,consumedAt:currentTime}));
 enrollNewNameSignerState({directory:stateDirectory,policyId,keyId:identity.keyId,stateEpoch,maxNames,now,io});
 const policyFile=path.join(dir,'name-witness-policy.json');
 writeExclusive(io,policyFile,json(policy));
 // A cold start must not downgrade to legacy resolution if the policy is lost.
 writeExclusive(io,path.join(dir,'name-security-required.json'),json({schema:'arns-mesh-name-security-required/v1',policyId}));
 const runtime={ARNS_NAME_SIGNER_KEY:path.join(dir,'private-key.pem'),ARNS_NAME_SIGNER_STATE:stateDirectory,ARNS_NAME_SIGNER_EPOCH:stateEpoch};
 if(rpcSeedsFile)runtime.ARNS_NAME_SIGNER_RPC_SEEDS=rpcSeedsFile;
 const configurationFile=path.join(dir,'runtime-env.json');writeExclusive(io,configurationFile,json(runtime));
 return {command:'enroll',keyId:identity.keyId,domain:own[0].domain,policyId,stateEpoch,configurationFile,peerDataDirectory,maxNames};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(json(runNameWitnessCommand(process.argv.slice(2))).trimEnd());}
 catch(error){const code=typeof error.code==='string'&&/^name_[a-z0-9_]+$/.test(error.code)?error.code:'name_witness_command_failed';console.error(code);process.exitCode=1;}
}
