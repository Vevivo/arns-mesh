import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validArName} from './swarm-common.mjs';

const ROOT_SCHEMA='arns-mesh-sharded-name-state-root/v1';
const STATE_SCHEMA='arns-mesh-name-signer-state/v1';
const MAX_ROOT_BYTES=4096,SIGNER_BYTES=32*1024,CERTIFICATE_BYTES=512*1024;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const fail=message=>{throw new Error(message);};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function integer(x,min=0){return Number.isSafeInteger(x)&&x>=min;}
function checkedNow(now){const n=now();if(!integer(n))fail('name_signer_clock_invalid');return n;}
function hex(x,n){return typeof x==='string'&&x.length===n&&/^[0-9a-f]+$/.test(x);}
function scope(policyId,keyId,stateEpoch,kind){
 if(!['signer','certificates'].includes(kind)||!hex(policyId,64)||!hex(stateEpoch,32)||(kind==='signer'?!hex(keyId,64):(keyId!==null&&!hex(keyId,64))))fail('name_signer_root_scope_invalid');
}
function directory(io,p){const s=io.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())fail('name_signer_directory_invalid');}
function exists(io,p){try{io.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function syncDirectory(io,p){const fd=io.openSync(p,'r');try{io.fsyncSync(fd);}finally{io.closeSync(fd);}}
function boundedJson(value,maximum){
 let encoded;try{encoded=JSON.stringify(value);}catch{fail('name_signer_state_encoding_invalid');}
 if(typeof encoded!=='string'||Buffer.byteLength(encoded,'utf8')>maximum)fail('name_signer_state_size_invalid');
 return encoded;
}
function readJson(io,p,maximum){
 const s=io.lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size>maximum)fail('name_signer_state_file_invalid');
 const text=io.readFileSync(p,'utf8');
 if(Buffer.byteLength(text,'utf8')>maximum)fail('name_signer_state_size_invalid');
 let result;try{result=JSON.parse(text);}catch{fail('name_signer_state_corrupt');}
 if(!plain(result))fail('name_signer_state_corrupt');
 return result;
}
function atomicWrite(io,p,value,maximum){
 const encoded=boundedJson(value,maximum),parent=path.dirname(p);
 directory(io,parent);
 const temp=path.join(parent,'.state-'+crypto.randomBytes(12).toString('hex')+'.tmp');
 let fd,created=false;
 try{
  fd=io.openSync(temp,'wx',0o600);created=true;
  io.writeFileSync(fd,encoded,'utf8');io.fsyncSync(fd);io.closeSync(fd);fd=undefined;
  io.renameSync(temp,p);
  syncDirectory(io,parent);
 }finally{
  if(fd!==undefined)io.closeSync(fd);
  if(created&&exists(io,temp))io.unlinkSync(temp);
 }
}
function rootMetadata(value,expected){
 if(!plain(value)||value.schema!==ROOT_SCHEMA||value.kind!==expected.kind||value.policyId!==expected.policyId||value.keyId!==expected.keyId||value.stateEpoch!==expected.stateEpoch||!integer(value.createdAt)||!integer(value.clockFloor)||value.clockFloor<value.createdAt||!integer(value.maxNames,1)||value.maxNames>1000000||!integer(value.allocatedNames)||value.allocatedNames>value.maxNames)fail('name_signer_root_metadata_invalid');
 return value;
}
function initialState(policyId,keyId){return{schema:STATE_SCHEMA,policyId,keyId,maxRound:-1,names:{}};}
function validateState(state,{policyId,keyId,name}){
 if(!plain(state)||state.schema!==STATE_SCHEMA||state.policyId!==policyId||state.keyId!==keyId||!integer(state.maxRound,-1)||!plain(state.names))fail('name_signer_state_invalid');
 if(Object.keys(state).some(k=>!['schema','policyId','keyId','maxRound','names'].includes(k)))fail('name_signer_state_invalid');
 const names=Object.keys(state.names);
 if(names.length>1||names.some(n=>n!==name))fail('name_signer_state_wrong_name');
 if(!names.length){if(state.maxRound!==-1)fail('name_signer_state_round_invalid');return state;}
 const row=state.names[name];
 if(!plain(row)||!integer(row.round)||!integer(row.slot)||state.maxRound!==row.round||!plain(row.envelope)||row.envelope.keyId!==keyId||typeof row.envelope.recordJson!=='string'||typeof row.envelope.signature!=='string')fail('name_signer_state_row_invalid');
 let record;try{record=JSON.parse(row.envelope.recordJson);}catch{fail('name_signer_state_envelope_invalid');}
 if(!plain(record)||record.name!==name||record.policyId!==policyId||record.round!==row.round)fail('name_signer_state_envelope_invalid');
 return state;
}
function certificateState(state,{policyId,name}){
 if(!plain(state)||state.schema!=='arns-mesh-certified-name-state/v1'||state.policyId!==policyId||!plain(state.names)||Object.keys(state).some(k=>!['schema','policyId','names'].includes(k)))fail('name_certificate_state_invalid');
 const names=Object.keys(state.names);
 if(names.length>1||names.some(n=>n!==name)||names.some(n=>!plain(state.names[n])))fail('name_certificate_state_wrong_name');
 return state;
}
function advance(previous,next,name,kind){
 const before=Object.hasOwn(previous.names,name)?previous.names[name]:null;
 const after=Object.hasOwn(next.names,name)?next.names[name]:null;
 if(!before)return;
 if(!after)fail('name_signer_state_rollback');
 if(kind==='certificates')return; // CertificateStore validates its own floors and full certificates.
 if(after.round<before.round||after.slot<before.slot)fail('name_signer_state_rollback');
 if(after.round===before.round&&JSON.stringify(after)!==JSON.stringify(before))fail('name_signer_state_round_conflict');
}

/**
 * For signer roots, only the explicit NEW-KEY enrollment command may call this
 * helper. That command must generate a new signer key internally. This storage helper
 * cannot prove that a supplied keyId has never signed elsewhere.
 * Normal opening never invokes enrollment or recreates missing state.
 */
export function enrollNewShardedNameState({
 directory:stateDirectory,kind='signer',policyId,keyId=null,stateEpoch=crypto.randomBytes(16).toString('hex'),maxNames=50000,
 now=Date.now,io=fs
}={}){
 scope(policyId,keyId,stateEpoch,kind);
 if(!integer(maxNames,1)||maxNames>1000000)fail('name_signer_capacity_invalid');
 if(typeof stateDirectory!=='string'||!stateDirectory||typeof now!=='function')fail('name_signer_root_configuration_invalid');
 const root=path.resolve(stateDirectory),parent=path.dirname(root),timestamp=checkedNow(now);
 directory(io,parent);
 if(exists(io,root))fail('name_signer_root_already_exists');
 io.mkdirSync(root,{mode:0o700});
 // Root existence becomes durable before its identity metadata is committed.
 syncDirectory(io,parent);
 const metadata={schema:ROOT_SCHEMA,kind,policyId,keyId,stateEpoch,createdAt:timestamp,clockFloor:timestamp,maxNames,allocatedNames:0};
 atomicWrite(io,path.join(root,'root.json'),metadata,MAX_ROOT_BYTES);
 return{directory:root,...metadata};
}

/**
 * Linux/local-filesystem single writer. Directory fsync is required; an
 * unsupported filesystem is an error, not an implicit durability downgrade.
 * io is for deterministic internal tests only.
 */
export class ShardedNameState{
 constructor({directory:stateDirectory,kind='signer',policyId,keyId=null,stateEpoch,now=Date.now,io=fs,validateCertificateState=null}={}){
  scope(policyId,keyId,stateEpoch,kind);
  if(validateCertificateState!==null&&typeof validateCertificateState!=='function')fail('name_signer_root_configuration_invalid');
  if(typeof stateDirectory!=='string'||!stateDirectory||typeof now!=='function')fail('name_signer_root_configuration_invalid');
  this.root=path.resolve(stateDirectory);this.kind=kind;this.validateCertificateState=validateCertificateState;this.maximum=kind==='signer'?SIGNER_BYTES:CERTIFICATE_BYTES;this.policyId=policyId;this.keyId=keyId;this.stateEpoch=stateEpoch;this.now=now;this.io=io;this.closed=false;this.poisoned=false;this.busy=false;
  directory(io,this.root);
  const metadata=rootMetadata(readJson(io,path.join(this.root,'root.json'),MAX_ROOT_BYTES),this);
  if(checkedNow(now)<metadata.clockFloor)fail('name_signer_clock_rollback');
  this.clockFloor=metadata.clockFloor;this.allocatedNames=metadata.allocatedNames;
  this.lock=path.join(this.root,'.writer-lock');this.token=crypto.randomBytes(16).toString('hex');
  if(exists(io,this.lock))fail('name_signer_writer_already_open');
  io.mkdirSync(this.lock,{mode:0o700});
  syncDirectory(io,this.root);
  atomicWrite(io,path.join(this.lock,'owner.json'),{stateEpoch,token:this.token,pid:process.pid},MAX_ROOT_BYTES);
 }
 _active(){
  if(this.closed)fail('name_signer_state_closed');
  if(this.poisoned)fail('name_signer_state_requires_recovery');
  directory(this.io,this.root);
  const metadata=rootMetadata(readJson(this.io,path.join(this.root,'root.json'),MAX_ROOT_BYTES),this);
  if(metadata.clockFloor<this.clockFloor||metadata.allocatedNames<this.allocatedNames)fail('name_signer_root_counter_rollback');
  this.clockFloor=metadata.clockFloor;this.allocatedNames=metadata.allocatedNames;
  if(checkedNow(this.now)<metadata.clockFloor)fail('name_signer_clock_rollback');
  const owner=readJson(this.io,path.join(this.lock,'owner.json'),MAX_ROOT_BYTES);
  if(owner.token!==this.token||owner.stateEpoch!==this.stateEpoch)fail('name_signer_writer_lock_lost');
  return metadata;
 }
 _mutation(work){
  if(this.busy)fail('name_signer_state_reentrant_transaction');
  this.busy=true;
  try{return work();}catch(error){this.poisoned=true;throw error;}finally{this.busy=false;}
 }
 forName(name){
  this._active();
  if(typeof name!=='string'||!validArName(name)||name!==name.toLowerCase())fail('name_signer_state_name_invalid');
  const id=hash(this.kind+'\0'+this.policyId+'\0'+(this.keyId||'')+'\0'+name),shard=path.join(this.root,id.slice(0,2)),nameDirectory=path.join(shard,id),stateFile=path.join(nameDirectory,'state.json');
  const root=this,context={policyId:this.policyId,keyId:this.keyId,name};
  const validate=state=>{
   if(root.kind==='signer')return validateState(state,context);
   certificateState(state,context);
   if(root.validateCertificateState)root.validateCertificateState(state,name);
   return state;
  };
  const read=()=>{
   if(exists(root.io,shard))directory(root.io,shard);
   if(!exists(root.io,nameDirectory))return{exists:false,state:root.kind==='signer'?initialState(root.policyId,root.keyId):{schema:'arns-mesh-certified-name-state/v1',policyId:root.policyId,names:{}}};
   directory(root.io,nameDirectory);
   if(!exists(root.io,stateFile))fail('name_signer_state_missing_for_known_name');
   return{exists:true,state:validate(readJson(root.io,stateFile,root.maximum))};
  };
  return{
   read(){root._active();return read().state;},
   transaction(work){
    root._active();
    if(typeof work!=='function')fail('name_signer_state_callback_invalid');
    if(root.busy)fail('name_signer_state_reentrant_transaction');
    root.busy=true;
    try{
     const previousRead=read(),previous=previousRead.state,before=boundedJson(previous,root.maximum);
     const result=work(previous);
     if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});fail('name_signer_state_callback_must_be_sync');}
     if(!plain(result))fail('name_signer_state_callback_result_invalid');
     if(result.state===undefined){
      if(boundedJson(previous,root.maximum)!==before)fail('name_signer_state_uncommitted_mutation');
      return result.value;
     }
     const next=JSON.parse(boundedJson(result.state,root.maximum));
     validate(next);advance(JSON.parse(before),next,name,root.kind);
     if(!previousRead.exists&&!Object.hasOwn(next.names,name))fail('name_signer_first_commit_empty');
     const metadata=!previousRead.exists?root._active():null;
     if(metadata&&metadata.allocatedNames>=metadata.maxNames)fail('name_signer_name_capacity_exceeded');
     try{
      if(metadata){
       // Reserve capacity durably BEFORE allocating the permanent name marker.
       // A crash may waste a reservation, but cannot silently undercount one.
       const reserved={...metadata,allocatedNames:metadata.allocatedNames+1};
       atomicWrite(root.io,path.join(root.root,'root.json'),reserved,MAX_ROOT_BYTES);
       root.allocatedNames=reserved.allocatedNames;
       if(!exists(root.io,shard)){root.io.mkdirSync(shard,{mode:0o700});syncDirectory(root.io,root.root);}else directory(root.io,shard);
       root.io.mkdirSync(nameDirectory,{mode:0o700});
       // The durable name directory is the tombstone. Never recreate state for
       // an existing marker with missing state, even after an interrupted write.
       syncDirectory(root.io,shard);
      }
      atomicWrite(root.io,stateFile,next,root.maximum);
     }catch(error){root.poisoned=true;throw error;}
     return result.value;
    }finally{root.busy=false;}
   }
  };
 }
 checkpointClock(){
  const metadata=this._active(),clockFloor=checkedNow(this.now);
  if(clockFloor<metadata.clockFloor)fail('name_signer_clock_rollback');
  if(clockFloor===metadata.clockFloor)return metadata;
  return this._mutation(()=>{const next={...metadata,clockFloor};atomicWrite(this.io,path.join(this.root,'root.json'),next,MAX_ROOT_BYTES);this.clockFloor=clockFloor;return next;});
 }
 close(){
  if(this.closed)return;
  // An uncertain write/barrier failure needs supervised recovery. Normal
  // shutdown must not erase the refusal lock and make an automatic restart
  // appear safe after that failure.
  if(this.poisoned)fail('name_signer_state_requires_recovery');
  const owner=readJson(this.io,path.join(this.lock,'owner.json'),MAX_ROOT_BYTES);
  if(owner.token!==this.token||owner.stateEpoch!==this.stateEpoch)fail('name_signer_writer_lock_lost');
  this.io.unlinkSync(path.join(this.lock,'owner.json'));this.io.rmdirSync(this.lock);syncDirectory(this.io,this.root);this.closed=true;
 }
}

export class ShardedNameSignerState extends ShardedNameState{constructor(options){super({...options,kind:'signer'});}}
export class ShardedNameCertificateState extends ShardedNameState{constructor(options){super({...options,kind:'certificates'});}}
export function enrollNewNameSignerState(options){return enrollNewShardedNameState({...options,kind:'signer'});}
export function enrollNewNameCertificateState(options){return enrollNewShardedNameState({...options,kind:'certificates'});}
