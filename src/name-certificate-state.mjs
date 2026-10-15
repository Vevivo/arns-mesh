import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {shareQuery} from './query-work.mjs';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,verifyNameCertificate,verifyNameObservation,witnessKeyId,validateNameWitnessPolicy} from './name-certificates.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const own=(rows,name)=>Object.hasOwn(rows,name)?rows[name]:null;
const setOwn=(rows,name,value)=>Object.defineProperty(rows,name,{value,writable:true,enumerable:true,configurable:true});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const sameBinding=(a,b)=>a?.name===b?.name&&a?.antId===b?.antId&&a?.antProgramId===b?.antProgramId&&a?.txId===b?.txId;

export function nameCertificateHash(certificate){
 const observations=[...new Map(certificate.observations.map(envelope=>[JSON.stringify(envelope),envelope])).values()];
 observations.sort((a,b)=>(a.keyId<b.keyId?-1:a.keyId>b.keyId?1:0)||(a.recordJson<b.recordJson?-1:a.recordJson>b.recordJson?1:0));
 return hash(JSON.stringify({schema:certificate.schema,round:certificate.round,observations}));
}
export const initialCertificateState=policy=>({schema:'arns-mesh-certified-name-state/v1',policyId:namePolicyId(policy),names:{}});
export const initialSignerState=(policy,publicKeyPem)=>({schema:'arns-mesh-name-signer-state/v1',policyId:namePolicyId(policy),keyId:witnessKeyId(publicKeyPem),maxRound:-1,names:{}});

// Bounded atomic state for reader metadata and small installations. Large
// supporter catalogues use a provisioned per-name transaction driver.
export class FileNameState{
 constructor(file,{initial=null,maxBytes=16*1024*1024,strictDirectorySync=process.platform!=='win32'}={}){
  if(typeof file!=='string'||!file||!integer(maxBytes,1024,64*1024*1024))fail('name_state_options_invalid');
  this.file=file;this.initial=fs.existsSync(file)?null:initial;this.maxBytes=maxBytes;this.strictDirectorySync=strictDirectorySync;this.poisoned=false;
  if(strictDirectorySync&&fs.existsSync(file)){
   const fd=fs.openSync(file,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}this.syncDirectory();
  }
 }
 read(){
  try{if(fs.statSync(this.file).size>this.maxBytes)fail('name_state_size_limit');return JSON.parse(fs.readFileSync(this.file,'utf8'));}
  catch(error){if(error.code==='ENOENT'&&this.initial!==null)return copy(this.initial);throw error;}
 }
 syncDirectory(){
  let fd;try{fd=fs.openSync(path.dirname(this.file),'r');fs.fsyncSync(fd);}
  catch(error){if(this.strictDirectorySync||!['EISDIR','EPERM','EACCES','EINVAL','ENOTSUP'].includes(error.code))throw error;}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 transaction(work){
  if(this.poisoned)fail('name_state_reopen_required');
  fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
  const lock=this.file+'.lock';let lockFd;
  try{lockFd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('name_state_locked');throw error;}
  let temp,commitStarted=false;
  try{
   const result=work(this.read());
   if(!result||typeof result.then==='function'||!Object.hasOwn(result,'value'))fail('name_state_transaction_invalid');
   if(result.state!==undefined){
    const bytes=Buffer.from(JSON.stringify(result.state));if(bytes.length>this.maxBytes)fail('name_state_size_limit');
    temp=this.file+'.new-'+process.pid+'-'+crypto.randomBytes(8).toString('hex');
    const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    commitStarted=true;fs.renameSync(temp,this.file);temp=null;this.syncDirectory();this.initial=null;
   }
   return result.value;
  }catch(cause){
   if(commitStarted)this.poisoned=true;
   throw Object.assign(new Error('name_state_transaction_failed: '+String(cause.message),{cause}),{code:cause.code||'NAME_STATE_PERSISTENCE_FAILED'});
  }finally{
   if(temp)try{fs.unlinkSync(temp);}catch{}
   fs.closeSync(lockFd);fs.unlinkSync(lock);
  }
 }
}
function certificateState(state,policyId){
 if(!state||state.schema!=='arns-mesh-certified-name-state/v1'||state.policyId!==policyId||!state.names||typeof state.names!=='object'||Array.isArray(state.names))fail('name_certificate_state_invalid_or_migration_required');
 return state;
}
function canonicalCertificate(certificate,verification){
 const selected=verification.witnessKeyIds.slice(0,verification.threshold);
 return {schema:certificate.schema,round:certificate.round,observations:selected.map(keyId=>copy(certificate.observations.find(value=>value.keyId===keyId)))};
}
const retentionOwners=new Set(['site','site-update','replica','replica-update']);
function retainedHashes(entry){
 const retained=entry.retained===undefined?{}:entry.retained;
 if(!retained||typeof retained!=='object'||Array.isArray(retained)||Object.keys(retained).length>retentionOwners.size)fail('name_certificate_retention_invalid');
 for(const [owner,value] of Object.entries(retained))if(!retentionOwners.has(owner)||typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||!entry.versions.some(version=>version.hash===value))fail('name_certificate_retention_invalid');
 return new Set(Object.values(retained));
}
function pruneVersions(entry,maxVersions){
 const retained=retainedHashes(entry);let remaining=maxVersions;
 entry.versions.sort((a,b)=>b.round-a.round);
 entry.versions=entry.versions.filter(version=>retained.has(version.hash)||remaining-->0);
}
export class CertifiedNameStore{
 constructor({policy,driver,maxNames=5000,maxVersions=8,now=Date.now}={}){
  if(!integer(maxNames,1,50000)||!integer(maxVersions,1,8)||typeof now!=='function'||!driver?.transaction)fail('name_certificate_store_options_invalid');
  this.policySource=typeof policy==='function'?policy:()=>policy;this.policy=this.policySource();this.policyId=namePolicyId(this.policy);
  this.driver=driver;this.maxNames=maxNames;this.maxVersions=maxVersions;this.now=now;
 }
 context(){
  const policy=this.policySource();if(namePolicyId(policy)!==this.policyId)fail('name_certificate_policy_changed');return policy;
 }
 checkedVersion(version,name,floor,mode='historical'){
  const policy=this.context(),now=this.now();
  if(!version||version.hash!==nameCertificateHash(version.certificate))fail('name_certificate_cached_hash_mismatch');
  if(!integer(version.acceptedAt,policy.validFrom,policy.validUntil-1)||version.acceptedAt>now)fail('name_certificate_cached_time_invalid');
  const policyExpired=now>=policy.validUntil;
  const result=verifyNameCertificate(version.certificate,policy,{name,purpose:'current',mode,now:policyExpired?version.acceptedAt:now,floor});
  if(version.round!==result.round||!sameBinding(version.binding,result.binding))fail('name_certificate_cached_metadata_mismatch');
  return{certificate:copy(version.certificate),hash:version.hash,verification:{...result,historical:mode==='historical',currentWindow:!policyExpired&&now>=result.round*policy.roundMs&&now<result.expiresAt,policyExpired,previouslyAcceptedAt:version.acceptedAt}};
 }
 floor(name){this.context();return this.driver.transaction(state=>({value:copy(own(certificateState(state,this.policyId).names,name)?.floor||null)}));}
 async accept(incoming,{name,mode='current'}={}){
  const policy=this.context();
  return this.driver.transaction(saved=>{
   const state=certificateState(saved,this.policyId),previous=own(state.names,name),now=this.now();
   let verification=verifyNameCertificate(incoming,policy,{name,purpose:'current',mode,now,floor:previous?.floor||null});
   let certificate=canonicalCertificate(incoming,verification);
   verification=verifyNameCertificate(certificate,policy,{name,purpose:'current',mode,now,floor:previous?.floor||null});
   if(!previous&&Object.keys(state.names).length>=this.maxNames)fail('name_certificate_state_capacity');
   const next=copy(state),entry=own(next.names,name)||{floor:null,versions:[]};
   let version=entry.versions.find(value=>value.round===verification.round&&sameBinding(value.binding,verification.binding)),replacedHash=null;
   if(version){
    // Equivalent signer subsets occupy one version. Retain its original proof
    // unless newly authenticated per-domain evidence makes that proof unusable.
    try{
     const known=this.checkedVersion(version,name,verification.nextFloor,mode);
     certificate=known.certificate;verification={...known.verification,nextFloor:verification.nextFloor};
    }catch(error){
     if(!['name_certificate_quorum_unmet','name_certificate_quorum_rejected'].includes(error.code))throw error;
     replacedHash=version.hash;entry.versions=entry.versions.filter(value=>value!==version);version=null;
    }
   }
   if(!version){
    version={hash:nameCertificateHash(certificate),certificate:copy(certificate),acceptedAt:now,binding:copy(verification.binding),round:verification.round};
    entry.versions.push(version);
   }
   if(replacedHash)for(const owner of Object.keys(entry.retained||{}))if(entry.retained[owner]===replacedHash)entry.retained[owner]=version.hash;
   pruneVersions(entry,this.maxVersions);
   entry.floor=copy(verification.nextFloor);setOwn(next.names,name,entry);
   return{state:next,value:{certificate:copy(version.certificate),hash:version.hash,verification}};
  });
 }
 known(name,{txId=null,hash:expectedHash=null}={}){
  this.context();
  return this.driver.transaction(state=>{
   const entry=own(certificateState(state,this.policyId).names,name);if(!entry)return{value:null};
   const version=entry.versions.find(value=>(!txId||value.binding?.txId===txId)&&(!expectedHash||value.hash===expectedHash));
   if(!version)return{value:null};
   const result=this.checkedVersion(version,name,entry.floor);
   if(txId&&result.verification.binding.txId!==txId)fail('name_certificate_cached_metadata_mismatch');
   return{value:result};
  });
 }
 retain(name,{hash:expectedHash,owner}={}){
  this.context();if(!retentionOwners.has(owner)||typeof expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedHash))fail('name_certificate_retention_invalid');
  return this.driver.transaction(saved=>{
   const state=certificateState(saved,this.policyId),entry=own(state.names,name);
   if(!entry)fail('name_certificate_not_previously_accepted');retainedHashes(entry);
   const version=entry.versions.find(value=>value.hash===expectedHash);if(!version)fail('name_certificate_not_previously_accepted');
   const result=this.checkedVersion(version,name,entry.floor);
   const next=copy(state),changed=own(next.names,name);changed.retained={...(changed.retained||{}),[owner]:expectedHash};pruneVersions(changed,this.maxVersions);
   return {state:next,value:result};
  });
 }
 release(name,{owner}={}){
  this.context();if(!retentionOwners.has(owner))fail('name_certificate_retention_invalid');
  return this.driver.transaction(saved=>{
   const state=certificateState(saved,this.policyId),entry=own(state.names,name);if(!entry)return {value:false};retainedHashes(entry);
   if(!Object.hasOwn(entry.retained||{},owner))return {value:false};
   const next=copy(state),changed=own(next.names,name);delete changed.retained[owner];pruneVersions(changed,this.maxVersions);return {state:next,value:true};
  });
 }
 advertised(name){
  this.context();
  return this.driver.transaction(state=>{
   const entry=own(certificateState(state,this.policyId).names,name);if(!entry)return {value:[]};retainedHashes(entry);
   const selected=[],seen=new Set();
   const add=version=>{if(version&&!seen.has(version.hash)&&selected.length<8){seen.add(version.hash);selected.push(version.certificate);}};
   // Complete prepared versions have priority over in-progress updates.
   for(const owner of ['site','replica','site-update','replica-update'])add(entry.versions.find(version=>version.hash===entry.retained?.[owner]));
   for(const version of [...entry.versions].sort((a,b)=>b.round-a.round))add(version);
   return {value:copy(selected)};
  });
 }
 export(name){
  this.context();
  return this.driver.transaction(state=>({value:copy(own(certificateState(state,this.policyId).names,name)?.versions.map(value=>value.certificate)||[])}));
 }
}
export class NameCertificateSigner{
 constructor({policy,privateKeyPem,driver=null,driverForName=null,observe,now=Date.now,maxNames=50000}={}){
  if(!integer(maxNames,1,50000)||typeof now!=='function'||typeof observe!=='function'||(!driver===!driverForName))fail('name_signer_options_invalid');
  this.policySource=typeof policy==='function'?policy:()=>policy;this.policy=this.policySource();this.policyId=namePolicyId(this.policy);
  this.privateKey=crypto.createPrivateKey(privateKeyPem);this.publicKey=crypto.createPublicKey(this.privateKey).export({type:'spki',format:'pem'});this.keyId=witnessKeyId(this.publicKey);
  if(!/^solana:[1-9A-HJ-NP-Za-km-z]{16,64}$/.test(this.policy.chainId))fail('name_signer_chain_id_invalid');
  const enrolled=this.policy.witnesses.find(value=>witnessKeyId(value.publicKeyPem)===this.keyId);
  if(!enrolled)fail('name_signer_not_in_policy');
  if(this.policy.witnesses.filter(value=>value.domain===enrolled.domain).length!==1)fail('name_signer_domain_key_rotation_requires_shared_state');
  this.driver=driver;this.driverForName=driverForName;this.observe=observe;this.now=now;this.maxNames=maxNames;this.pending=new Map();
  this.active();
  if(driver){this.driverSafety(driver);driver.transaction(state=>{this.check(state);return{value:null};});}
 }
 driverSafety(driver){
  if(driver instanceof FileNameState&&(driver.initial!==null||!driver.strictDirectorySync))fail('name_signer_requires_initialized_durable_state');
 }
 active(){
  const policy=this.policySource();validateNameWitnessPolicy(policy,{now:this.now()});
  if(namePolicyId(policy)!==this.policyId)fail('name_signer_policy_changed_requires_restart');
 }
 check(state){
  if(!state||state.schema!=='arns-mesh-name-signer-state/v1'||state.policyId!==this.policyId||state.keyId!==this.keyId||!integer(state.maxRound,-1)||!state.names||typeof state.names!=='object'||Array.isArray(state.names))fail('name_signer_state_missing_invalid_or_migration_required');
  for(const [name,row] of Object.entries(state.names))if(!/^[a-z0-9_-]{1,255}$/.test(name)||!row||!integer(row.round,0,state.maxRound)||!integer(row.slot)||row.envelope?.keyId!==this.keyId)fail('name_signer_cached_state_invalid');
  return state;
 }
 row(state,name){
  const row=own(state.names,name);if(!row)return null;
  const result=verifyNameObservation(row.envelope,this.policy,{name,purpose:'current',round:row.round,mode:'historical',now:this.now()});
  if(result.record.slot!==row.slot)fail('name_signer_cached_state_invalid');return row;
 }
 async issue(name,{signal}={}){
  this.active();if(typeof name!=='string'||!/^[a-z0-9_-]{1,255}$/.test(name))fail('name_signer_name_invalid');
  const value=await shareQuery(this.pending,this.policyId+'|'+name,workSignal=>this.issueOne(name,{signal:workSignal}),{signal});
  this.active();signal?.throwIfAborted();return value;
 }
 async issueOne(name,{signal}){
  signal?.throwIfAborted();this.active();
  const driver=this.driverForName?this.driverForName(name):this.driver;this.driverSafety(driver);
  const round=Math.floor(this.now()/this.policy.roundMs);
  const previous=driver.transaction(state=>{this.check(state);if(round<state.maxRound)fail('name_signer_clock_rollback');return{value:copy(this.row(state,name))};});
  if(previous?.round===round)return copy(previous.envelope);
  const observed=await this.observe(name,{minContextSlot:previous?.slot||0,signal});signal?.throwIfAborted();this.active();
  const issuedAt=this.now(),observedAt=Date.parse(observed?.observedAt);
  if(observed?.schema!=='arns-mesh-coherent-name-observation/v1'||observed.name!==name||observed.chainId!==this.policy.chainId||observed.genesisHash!==this.policy.chainId.slice(7)||observed.registryProgramId!==this.policy.registryProgramId||!observed.provenance?.coherentAccountRead||!observed.provenance.strictAssetValidation||!observed.provenance.finalizedCommitmentRequested||!observed.provenance.genesisChecked)fail('name_signer_requires_fresh_coherent_observation');
  if(Math.floor(issuedAt/this.policy.roundMs)!==round||Math.floor(observedAt/this.policy.roundMs)!==round)fail('name_signer_round_changed');
  const recordJson=createNameObservation(this.policy,{name,purpose:'current',antId:observed.antId,antProgramId:observed.antProgramId,txId:observed.txId,round,slot:observed.slot,observedAt,issuedAt});
  if(observed.leaseEndsAt!==null&&observed.leaseEndsAt!==undefined&&observed.leaseEndsAt*1000<JSON.parse(recordJson).expiresAt)fail('name_signer_lease_ends_before_certificate');
  const envelope={keyId:this.keyId,recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),this.privateKey).toString('base64url')};
  return driver.transaction(state=>{
   this.active();this.check(state);const old=this.row(state,name);
   if(round!==Math.floor(this.now()/this.policy.roundMs)||round<state.maxRound)fail('name_signer_clock_rollback_or_round_changed');
   if(old?.round===round)return{value:copy(old.envelope)};
   if(old&&(old.round>round||observed.slot<old.slot))fail('name_signer_observation_rollback');
   if(!old&&Object.keys(state.names).length>=this.maxNames)fail('name_signer_state_capacity');
   const next=copy(state);next.maxRound=Math.max(state.maxRound,round);setOwn(next.names,name,{round,slot:observed.slot,envelope});
   return{state:next,value:copy(envelope)};
  });
 }
}

