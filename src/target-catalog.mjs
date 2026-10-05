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
// PDA derivation is deterministic, not a name observation. Keep only derived
// addresses; owner, raw name hash, lease and binding are rechecked every time.
const registryPdas=new Map();
async function registryPda(name){
 if(registryPdas.has(name))return registryPdas.get(name);
 const [pda]=await getArnsRecordPDA(name),value=String(pda);
 if(registryPdas.size>=50000)registryPdas.delete(registryPdas.keys().next().value);
 registryPdas.set(name,value);return value;
}
export async function decodeRegistry(response,{signal}={}){
 if(!Number.isSafeInteger(response?.context?.slot)||!Array.isArray(response.value)||response.value.length>50000)throw new Error('invalid_registry_response');
 const records=[],quarantine=[];
 for(const [index,row] of response.value.entries()){if(index%32===0){await new Promise(resolve=>setImmediate(resolve));signal?.throwIfAborted();}try{
  if(row.account.owner!==MAINNET_PROGRAM_IDS.arns)throw new Error('owner_mismatch');
  const raw=Buffer.from(row.account.data[0],'base64');if(!raw.subarray(0,8).equals(ARNS_DISC))throw new Error('discriminator_mismatch');
  const rec=deserializeArnsRecord(raw);
  if(!/^[a-z0-9-]{1,255}$/.test(rec.name))throw new Error('invalid_name');
  const pda=await registryPda(rec.name);
  if(String(pda)!==row.pubkey)throw new Error('pda_mismatch');
  if(!sha(rec.name).equals(raw.subarray(8,40)))throw new Error('name_hash_mismatch');
  if(!/^[a-z0-9-]{1,255}$/.test(rec.name))throw new Error('invalid_name');
  if(rec.type==='lease'&&Number(rec.endTimestamp)*1000<=Date.now())continue;
  records.push({name:rec.name,mint:String(rec.processId)});
 }catch(e){quarantine.push({address:row.pubkey,error:e.message});}}
 return {records:records.sort((a,b)=>a.name.localeCompare(b.name)),quarantine,slot:response.context.slot};
}
export class TargetCatalog {
 constructor({file,endpoint,rpc=rpcIp,maxTargets=20000,maxBytes=16*1024*1024,snapshotStore=null,registryIntervalMs=15*60000}={}){
  this.snapshotStore=snapshotStore;this.registryIntervalMs=registryIntervalMs;
  this.file=file;this.endpoint=endpoint;this.rpc=rpc;this.maxTargets=maxTargets;this.maxBytes=maxBytes;
  this.state={schema:'mesh-target-catalog/v1',registry:[],targets:{},cursor:0,registryAt:0,slot:0,quarantine:[],errors:[]};
  try{if(fs.statSync(file).size<=maxBytes){const saved=JSON.parse(fs.readFileSync(file));if(saved.schema===this.state.schema)this.state=saved;}}catch{}
  this.queueMissingSnapshots();
 }
 queueMissingSnapshots(){
  if(!this.snapshotStore)return;
  const current=new Map(this.state.registry.map(r=>[r.name,r.mint]));
  const pending=new Set((this.state.pendingNames||[]).filter(name=>current.has(name)));
  for(const [name,row] of Object.entries(this.state.targets)){
   if(current.get(row.baseName)!==row.mint)continue;
   const saved=this.snapshotStore.get(name);
   if(!saved||(saved.slot<row.slot&&(saved.txId!==row.dataId||saved.antId!==row.mint)))pending.add(row.baseName);
  }
  // Discovery rows are only work hints. Re-observe the registry and ANT through
  // step() before creating a retained binding; never promote old rows to proof.
  this.state.pendingNames=[...pending].slice(0,50000);
 }
 save(){const body=JSON.stringify(this.state);if(Buffer.byteLength(body)>this.maxBytes)throw new Error('catalog_disk_budget');fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',body,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 async refresh({signal}={}){
  const response=await this.rpc(this.endpoint,'getProgramAccounts',[MAINNET_PROGRAM_IDS.arns,{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:this.state.slot,filters:[filter(ARNS_DISC)]}],{signal,timeout:20000});
  const decoded=await decodeRegistry(response,{signal});if(decoded.slot<this.state.slot)throw new Error('catalog_slot_rollback');
  const previous=new Map(this.state.registry.map(r=>[r.name,r.mint])),currentNames=new Set(decoded.records.map(r=>r.name));
  const changed=decoded.records.filter(r=>previous.get(r.name)!==r.mint).map(r=>r.name);
  this.state.pendingNames=[...new Set([...changed,...(this.state.pendingNames||[])])].filter(name=>currentNames.has(name)).slice(0,50000);
  this.state.registry=decoded.records;this.state.quarantine=decoded.quarantine;this.state.slot=decoded.slot;this.state.registryAt=Date.now();
  const current=new Map(decoded.records.map(r=>[r.name,r.mint]));
  // Removed/rebound names cannot remain current-looking entries in the catalog.
  for(const [name,row] of Object.entries(this.state.targets))if(current.get(row.baseName)!==row.mint)delete this.state.targets[name];
  this.queueMissingSnapshots();
  this.state.cursor%=Math.max(1,decoded.records.length);this.save();return decoded;
 }
 async step({signal,mints=1}={}){
  if(Date.now()-this.state.registryAt>this.registryIntervalMs&&Date.now()-(this.state.registryAttemptAt||0)>(this.state.registryRetryMs||5*60000)){
   this.state.registryAttemptAt=Date.now();const validatedBefore=registryPdas.size;
   try{await this.refresh({signal});this.state.registryError=null;this.state.registryRetryMs=5*60000;}
   catch(error){this.state.registryError=String(error.message).slice(0,240);this.state.registryRetryMs=error.message==='catalog_refresh_timeout'&&registryPdas.size>validatedBefore?60000:5*60000;if(!this.state.registry.length||signal?.aborted){this.save();throw error;}}
  }
  for(let i=0;i<Math.min(mints,this.state.registry.length);i++){
   const prioritized=(this.state.scanTurn||0)%2===0&&this.state.pendingNames?.length;
   const record=prioritized?this.state.registry.find(r=>r.name===this.state.pendingNames[0]):this.state.registry[this.state.cursor];
   this.state.scanTurn=(this.state.scanTurn||0)+1;
   if(!record){this.state.pendingNames.shift();continue;}
   try{
    let bindingSlot=this.state.slot;
    // A historical name snapshot needs its own current registry observation;
    // a cached discovery list alone cannot establish the name/mint binding.
    if(this.snapshotStore){
     const [pda]=await getArnsRecordPDA(record.name);
     const response=await this.rpc(this.endpoint,'getAccountInfo',[String(pda),{encoding:'base64',commitment:'finalized',minContextSlot:this.state.slot}],{signal});
     if(!response?.value)throw new Error('catalog_name_unavailable');
     const checked=await decodeRegistry({context:response.context,value:[{pubkey:String(pda),account:response.value}]},{signal});
     if(checked.slot<this.state.slot||checked.records[0]?.name!==record.name||checked.records[0]?.mint!==record.mint)throw new Error('catalog_name_binding_changed');
     bindingSlot=checked.slot;
    }
    const antProgram=await observeAntProgram(this.rpc,this.endpoint,record.mint,{slot:bindingSlot,signal});
    const result=await this.rpc(this.endpoint,'getProgramAccounts',[antProgram.programId,{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:antProgram.slot,filters:[filter(ANT_RECORD_DISCRIMINATOR),{memcmp:{offset:8,bytes:record.mint,encoding:'base58'}}]}],{signal,timeout:15000});
    const previousSlot=Math.max(this.state.slot,antProgram.slot,...Object.values(this.state.targets).filter(t=>t.mint===record.mint).map(t=>t.slot));
    if(!Number.isSafeInteger(result?.context?.slot)||result.context.slot<previousSlot||!Array.isArray(result.value)||result.value.length>10000)throw new Error('invalid_ant_scan');
    const targets={};
    for(const row of result.value){
     signal?.throwIfAborted();
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
    if(this.snapshotStore)this.snapshotStore.putMany(Object.entries(targets).map(([name,row])=>({schema:'arns-mesh-name-snapshot/v1',name,txId:row.dataId,antId:row.mint,slot:Math.min(bindingSlot,row.slot),observedAt:new Date(row.observedAt).toISOString(),ttlSeconds:row.ttlSeconds})),{kind:'local-rpc'});
   }catch(e){this.state.errors.push({name:record.name,error:String(e.message).slice(0,240),at:Date.now()});this.state.errors=this.state.errors.slice(-32);if(signal?.aborted)throw e;}
   finally{if(prioritized)this.state.pendingNames.shift();else this.state.cursor=(this.state.cursor+1)%this.state.registry.length;this.save();}
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
  this.state=next;this.queueMissingSnapshots();this.save();return this.status();
 }
 status(){return {registeredNames:this.state.registry.length,observedTargets:Object.keys(this.state.targets).length,cursor:this.state.cursor,pendingNames:this.state.pendingNames?.length||0,registrySlot:this.state.slot,registryAt:this.state.registryAt,registryError:this.state.registryError||null,registryIntervalMs:this.registryIntervalMs,retainedNames:this.snapshotStore?.names().length||0,targetScanAt:this.state.targetScanAt||null,targetScanSlot:this.state.targetScanSlot||null,quarantined:this.state.quarantine.length,recentErrors:this.state.errors,complete:false,trust:'RPC observation; no account inclusion proof'};}
}
