// Optional index-node catalog. Its rows are RPC observations, never name proofs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {MAINNET_PROGRAM_IDS,deserializeArnsRecord,deserializeAntRecord,getArnsRecordPDA,getAntRecordPDA} from '@ar.io/sdk';
import {ANT_RECORD_DISCRIMINATOR} from '@ar.io/solana-contracts/ant';
import {rpcIp} from './ip-transport.mjs';
import {observeAntProgram} from './ant-program.mjs';
const ARNS_DISC=Buffer.from([53,158,42,125,7,132,104,188]);
const validId=id=>/^[A-Za-z0-9_-]{43}$/.test(id);
const filter=bytes=>({memcmp:{offset:0,bytes:Buffer.from(bytes).toString('base64'),encoding:'base64'}});
const sha=name=>crypto.createHash('sha256').update(name).digest();
export async function decodeRegistry(response){
 if(!Number.isSafeInteger(response?.context?.slot)||!Array.isArray(response.value)||response.value.length>50000)throw new Error('invalid_registry_response');
 const records=[],quarantine=[];
 for(const row of response.value){try{
  if(row.account.owner!==MAINNET_PROGRAM_IDS.arns)throw new Error('owner_mismatch');
  const raw=Buffer.from(row.account.data[0],'base64');if(!raw.subarray(0,8).equals(ARNS_DISC))throw new Error('discriminator_mismatch');
  const rec=deserializeArnsRecord(raw),[pda]=await getArnsRecordPDA(rec.name);
  if(String(pda)!==row.pubkey)throw new Error('pda_mismatch');
  if(!sha(rec.name).equals(raw.subarray(8,40)))throw new Error('name_hash_mismatch');
  if(!/^[a-z0-9-]{1,255}$/.test(rec.name))throw new Error('invalid_name');
  if(rec.type==='lease'&&Number(rec.endTimestamp)*1000<=Date.now())continue;
  records.push({name:rec.name,mint:String(rec.processId)});
 }catch(e){quarantine.push({address:row.pubkey,error:e.message});}}
 return {records:records.sort((a,b)=>a.name.localeCompare(b.name)),quarantine,slot:response.context.slot};
}
export class TargetCatalog {
 constructor({file,endpoint,rpc=rpcIp,maxTargets=20000,maxBytes=16*1024*1024}={}){
  this.file=file;this.endpoint=endpoint;this.rpc=rpc;this.maxTargets=maxTargets;this.maxBytes=maxBytes;
  this.state={schema:'mesh-target-catalog/v1',registry:[],targets:{},cursor:0,registryAt:0,slot:0,quarantine:[],errors:[]};
  try{if(fs.statSync(file).size<=maxBytes){const saved=JSON.parse(fs.readFileSync(file));if(saved.schema===this.state.schema)this.state=saved;}}catch{}
 }
 save(){const body=JSON.stringify(this.state);if(Buffer.byteLength(body)>this.maxBytes)throw new Error('catalog_disk_budget');fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',body,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 async refresh({signal}={}){
  const response=await this.rpc(this.endpoint,'getProgramAccounts',[MAINNET_PROGRAM_IDS.arns,{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:this.state.slot,filters:[filter(ARNS_DISC)]}],{signal,timeout:20000});
  const decoded=await decodeRegistry(response);if(decoded.slot<this.state.slot)throw new Error('catalog_slot_rollback');
  this.state.registry=decoded.records;this.state.quarantine=decoded.quarantine;this.state.slot=decoded.slot;this.state.registryAt=Date.now();
  const current=new Map(decoded.records.map(r=>[r.name,r.mint]));
  // Removed/rebound names cannot remain current-looking entries in the catalog.
  for(const [name,row] of Object.entries(this.state.targets))if(current.get(row.baseName)!==row.mint)delete this.state.targets[name];
  this.state.cursor%=Math.max(1,decoded.records.length);this.save();return decoded;
 }
 async step({signal,mints=1}={}){
  if(Date.now()-this.state.registryAt>6*3600000)await this.refresh({signal});
  for(let i=0;i<Math.min(mints,this.state.registry.length);i++){
   const record=this.state.registry[this.state.cursor];
   try{
    const antProgram=await observeAntProgram(this.rpc,this.endpoint,record.mint,{slot:this.state.slot,signal});
    const result=await this.rpc(this.endpoint,'getProgramAccounts',[antProgram.programId,{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:antProgram.slot,filters:[filter(ANT_RECORD_DISCRIMINATOR),{memcmp:{offset:8,bytes:record.mint,encoding:'base58'}}]}],{signal,timeout:15000});
    const previousSlot=Math.max(this.state.slot,antProgram.slot,...Object.values(this.state.targets).filter(t=>t.mint===record.mint).map(t=>t.slot));
    if(!Number.isSafeInteger(result?.context?.slot)||result.context.slot<previousSlot||!Array.isArray(result.value)||result.value.length>10000)throw new Error('invalid_ant_scan');
    const targets={};
    for(const row of result.value){
     if(row.account.owner!==antProgram.programId)throw new Error('ant_owner_mismatch');
     const raw=Buffer.from(row.account.data[0],'base64');if(!raw.subarray(0,8).equals(Buffer.from(ANT_RECORD_DISCRIMINATOR)))throw new Error('ant_discriminator_mismatch');
     const ant=deserializeAntRecord(raw),[pda]=await getAntRecordPDA(record.mint,ant.undername,antProgram.programId);
     if(String(pda)!==row.pubkey||String(ant.mint)!==record.mint)throw new Error('ant_binding_mismatch');
     if(ant.targetProtocol!==0||!validId(ant.transactionId))continue;
     if(ant.undername!=='@'&&!/^[a-z0-9-]{1,63}$/.test(ant.undername))continue;
     const name=ant.undername==='@'?record.name:ant.undername+'_'+record.name;
     targets[name]={baseName:record.name,mint:record.mint,antProgram:antProgram.programId,dataId:ant.transactionId,slot:result.context.slot,observedAt:Date.now(),ttlSeconds:ant.ttlSeconds,trust:'rpc-observation-not-inclusion-proof'};
    }
    const retained=Object.fromEntries(Object.entries(this.state.targets).filter(([,r])=>r.baseName!==record.name));
    if(Object.keys(retained).length+Object.keys(targets).length>this.maxTargets)throw new Error('catalog_target_limit');
    this.state.targets={...retained,...targets};
   }catch(e){if(signal?.aborted)throw e;this.state.errors.push({name:record.name,error:String(e.message).slice(0,240),at:Date.now()});this.state.errors=this.state.errors.slice(-32);}
   this.state.cursor=(this.state.cursor+1)%this.state.registry.length;this.save();
  }
  return this.status();
 }
 async refreshTargets({signal}={}){
  // Same program-wide record scan used by the SDK's getANTStates. Restricted
  // to volunteer nodes; normal clients still read only the requested name.
  if(Date.now()-this.state.registryAt>6*3600000)await this.refresh({signal});
  const slot=Math.max(this.state.slot,this.state.targetScanSlot||0,...Object.values(this.state.targets).map(t=>t.slot));
  const response=await this.rpc(this.endpoint,'getProgramAccounts',[MAINNET_PROGRAM_IDS.ant,{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:slot,filters:[filter(ANT_RECORD_DISCRIMINATOR)]}],{signal,timeout:25000,maxBytes:8*1024*1024});
  if(!Number.isSafeInteger(response?.context?.slot)||response.context.slot<slot||!Array.isArray(response.value)||response.value.length>50000)throw new Error('invalid_ant_catalog_scan');
  const namesByMint=new Map(),targets={};let unregistered=0;
  for(const r of this.state.registry){if(!namesByMint.has(r.mint))namesByMint.set(r.mint,[]);namesByMint.get(r.mint).push(r.name);}
  for(const row of response.value){
   signal?.throwIfAborted();
   if(row.account.owner!==MAINNET_PROGRAM_IDS.ant)throw new Error('ant_owner_mismatch');
   const raw=Buffer.from(row.account.data[0],'base64');if(!raw.subarray(0,8).equals(Buffer.from(ANT_RECORD_DISCRIMINATOR)))throw new Error('ant_discriminator_mismatch');
   const ant=deserializeAntRecord(raw),mint=String(ant.mint),[pda]=await getAntRecordPDA(mint,ant.undername);
   if(String(pda)!==row.pubkey)throw new Error('ant_binding_mismatch');
   const bases=namesByMint.get(mint);if(!bases){unregistered++;continue;}
   if(ant.targetProtocol!==0||!validId(ant.transactionId))continue;
   if(ant.undername!=='@'&&!/^[a-z0-9-]{1,63}$/.test(ant.undername))continue;
   for(const baseName of bases){
    const name=ant.undername==='@'?baseName:ant.undername+'_'+baseName;
    if(Object.hasOwn(targets,name))throw new Error('duplicate_ant_catalog_record');
    targets[name]={baseName,mint,dataId:ant.transactionId,slot:response.context.slot,observedAt:Date.now(),ttlSeconds:ant.ttlSeconds,trust:'rpc-observation-not-inclusion-proof'};
   }
  }
  if(Object.keys(targets).length>this.maxTargets)throw new Error('catalog_target_limit');
  // Publish only a completely decoded observation. An invalid/partial scan
  // leaves the previous table intact and the per-ANT path can continue.
  const next={...this.state,targets,targetScanAt:Date.now(),targetScanSlot:response.context.slot,targetScanAccounts:response.value.length,unregisteredAntRecords:unregistered};
  if(Buffer.byteLength(JSON.stringify(next))>this.maxBytes)throw new Error('catalog_disk_budget');
  this.state=next;this.save();return this.status();
 }
 status(){return {registeredNames:this.state.registry.length,observedTargets:Object.keys(this.state.targets).length,cursor:this.state.cursor,registrySlot:this.state.slot,targetScanAt:this.state.targetScanAt||null,targetScanSlot:this.state.targetScanSlot||null,quarantined:this.state.quarantine.length,recentErrors:this.state.errors,complete:false,trust:'RPC observation; no account inclusion proof'};}
}
