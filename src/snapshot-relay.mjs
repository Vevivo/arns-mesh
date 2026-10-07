import fs from 'node:fs';
import path from 'node:path';
import {verifyPeerEnvelope,peerAddress} from './peer-directory.mjs';
import {validateSnapshot} from './name-snapshots.mjs';
import {queryDirectPeer} from './direct-peer.mjs';

export const SNAPSHOT_PAGE_SIZE=256,SNAPSHOT_PAGE_BYTES=512*1024;
const keyOf=(env,row)=>env.witnessPeerId+'|'+row.name+'|'+(row.prepared===true?'1':'0');
const cursorOf=key=>Buffer.from(key).toString('base64url');
function decodeCursor(value){
 if(value===undefined||value===null)return '';
 if(typeof value!=='string'||value.length>512||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('invalid_snapshot_cursor');
 const key=Buffer.from(value,'base64url').toString();
 if(cursorOf(key)!==value||!/^[a-f0-9]{64}\|[a-z0-9_-]+\|[01]$/.test(key))throw new Error('invalid_snapshot_cursor');
 return key;
}
function witnesses(value,fallback=[]){
 if(value===undefined)return fallback.slice(0,16);
 if(!Array.isArray(value)||value.length>16||value.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)))throw new Error('invalid_snapshot_witnesses');
 return [...new Set(value)];
}
function checkedEnvelope(env){
 const raw=verifyPeerEnvelope(env),row=validateSnapshot(raw,raw.name);
 if(raw.prepared!==undefined&&typeof raw.prepared!=='boolean')throw new Error('invalid_snapshot_prepared');
 return {...row,...(raw.prepared===true?{prepared:true}:{})};
}

// Pagination carries original, independently verifiable envelopes. The serving
// address is never made a name authority by serving this unsigned container.
export function snapshotPage({request,relay,snapshotStore,pinner,witnessPeerId,sign}){
 const allowed=witnesses(request.witnessPeerIds,witnessPeerId?[witnessPeerId]:[]);
 const after=decodeCursor(request.cursor),limit=request.limit??SNAPSHOT_PAGE_SIZE;
 if(!Number.isSafeInteger(limit)||limit<1||limit>SNAPSHOT_PAGE_SIZE)throw new Error('invalid_snapshot_page_limit');
 const candidates=new Map();
 for(const {envelope,row} of relay?.entries()||[])if(allowed.includes(envelope.witnessPeerId)){
  const key=keyOf(envelope,row);if(key>after)candidates.set(key,()=>envelope);
 }
 if(allowed.includes(witnessPeerId)){
  for(const name of snapshotStore?.names()||[]){
   const row=snapshotStore.exportLocal(name);if(!row)continue;
   const key=keyOf({witnessPeerId},row);if(key>after)candidates.set(key,()=>sign(row));
  }
  for(const name of Object.keys(pinner?.rows||{})){
   let row;try{row=pinner.readySnapshot(name);}catch{continue;}
   if(!row||row.provenance?.kind!=='local-rpc')continue;
   const prepared={...validateSnapshot(row,name),prepared:true},key=keyOf({witnessPeerId},prepared);
   if(key>after)candidates.set(key,()=>sign(prepared));
  }
 }
 const keys=[...candidates.keys()].sort(),records=[];let bytes=256,last='';
 for(const key of keys){
  const env=candidates.get(key)(),size=Buffer.byteLength(JSON.stringify(env))+1;
  if(records.length>=limit||bytes+size>SNAPSHOT_PAGE_BYTES)break;
  records.push(env);bytes+=size;last=key;
 }
 const more=records.length<keys.length;
 return {ok:true,schema:'arns-mesh-snapshot-page/v1',records,nextCursor:more&&last?cursorOf(last):null,complete:!more};
}

// Preserve originals, current and prepared versions separately. A full relay
// rejects additional records explicitly; it never evicts an accepted binding
// merely because an unrelated name arrived.
export class SnapshotRelay{
 constructor({file,trusted,scope,maxRecords=40000,maxBytes=64*1024*1024,pageSize=SNAPSHOT_PAGE_SIZE,pagesPerPass=8,query=queryDirectPeer}){
  if(!Number.isSafeInteger(maxRecords)||maxRecords<2||maxRecords>200000||!Number.isSafeInteger(maxBytes)||maxBytes<4096||maxBytes>512*1024*1024)throw new Error('invalid_snapshot_relay_capacity');
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>SNAPSHOT_PAGE_SIZE||!Number.isSafeInteger(pagesPerPass)||pagesPerPass<1||pagesPerPass>64)throw new Error('invalid_snapshot_relay_page_budget');
  Object.assign(this,{file,trusted,scope,maxRecords,maxBytes,pageSize,pagesPerPass,query});
  this.rows=new Map();this.decoded=new Map();this.revision=0;this.bytes=0;this.cursor=0;this.peerCursor=0;this.activePeer=null;this.cursors={};this.networkId=null;this.lastError=null;this.lastSyncAt=null;this.lastCompleteAt=null;
  try{
   if(fs.statSync(file).size>maxBytes)throw new Error('snapshot_relay_disk_budget');
   const v=JSON.parse(fs.readFileSync(file));
   if(v.networkId===scope()?.id){
    this.networkId=v.networkId;
    const allowed=new Set(this.trusted());
    for(const env of (v.records||[]).slice(0,maxRecords))try{
     if(!allowed.has(env?.witnessPeerId))continue;
     this.#putVerified(env,checkedEnvelope(env),false);
    }catch(error){this.lastError=String(error.message).slice(0,160);}
    for(const [address,state] of Object.entries(v.cursors||{}).slice(0,32))if(typeof address==='string'&&address.length<=100&&state&&typeof state==='object')try{decodeCursor(state.cursor);this.cursors[address]={cursor:state.cursor??null,completeAt:typeof state.completeAt==='string'?state.completeAt:null};}catch{}
    this.lastSyncAt=v.lastSyncAt||null;this.lastCompleteAt=v.lastCompleteAt||null;this.activePeer=Object.keys(this.cursors).find(address=>this.cursors[address].cursor)||null;
   }
  }catch(error){if(error.code!=='ENOENT')this.lastError=String(error.message).slice(0,160);}
 }
 context(){
  const id=this.scope()?.id||null;
  if(id!==this.networkId){this.revision++;this.networkId=id;this.rows.clear();this.decoded.clear();this.bytes=0;this.cursors={};this.activePeer=null;this.lastSyncAt=null;this.lastCompleteAt=null;}
  return id;
 }
 put(env,persist=true){
  if(!this.context()||!this.trusted().includes(env?.witnessPeerId))throw new Error('untrusted_snapshot_relay');
  return this.#putVerified(env,checkedEnvelope(env),persist);
 }
 #putVerified(env,row,persist){
  const key=keyOf(env,row),old=this.rows.get(key),previous=this.decoded.get(key);
  if(old?.recordJson===env.recordJson&&old.signature===env.signature&&old.witnessPublicKeyPem===env.witnessPublicKeyPem)return previous;
  if(previous){
   if(row.slot<previous.slot)throw new Error('snapshot_rollback_rejected');
   if(row.slot===previous.slot&&(row.txId!==previous.txId||row.antId!==previous.antId))throw new Error('snapshot_conflict');
   if(row.slot===previous.slot&&Date.parse(row.observedAt)<Date.parse(previous.observedAt))return previous;
  }
  if(!old&&this.rows.size>=this.maxRecords)throw new Error('snapshot_relay_record_limit');
  const oldBytes=old?Buffer.byteLength(JSON.stringify(old))+1:0,newBytes=Buffer.byteLength(JSON.stringify(env))+1;
  if(this.bytes-oldBytes+newBytes>this.maxBytes-Math.min(32768,Math.floor(this.maxBytes/4)))throw new Error('snapshot_relay_disk_budget');
  this.rows.set(key,env);this.decoded.set(key,row);this.bytes+=newBytes-oldBytes;this.revision++;
  try{if(persist)this.save();}catch(error){this.revision--;this.bytes+=oldBytes-newBytes;if(old){this.rows.set(key,old);this.decoded.set(key,previous);}else{this.rows.delete(key);this.decoded.delete(key);}throw error;}
  return row;
 }
 save(){
  const json=JSON.stringify({schema:'arns-mesh-snapshot-relay/v2',networkId:this.networkId,records:[...this.rows.values()],cursors:this.cursors,lastSyncAt:this.lastSyncAt,lastCompleteAt:this.lastCompleteAt});
  if(Buffer.byteLength(json)>this.maxBytes)throw new Error('snapshot_relay_disk_budget');
  fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',json,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
 }
 entries(){
  if(!this.context())return [];
  const allowed=this.trusted();
  return [...this.rows].filter(([,env])=>allowed.includes(env.witnessPeerId)).map(([key,envelope])=>({envelope,row:this.decoded.get(key)}));
 }
 version(){
  const id=this.context(),allowed=[...new Set(this.trusted())].sort();
  return String(id)+'|'+this.revision+'|'+allowed.join(',');
 }
 reply(req){
  if(!this.context())return null;
  const trusted=this.trusted(),allowed=witnesses(req.witnessPeerIds,trusted),rows=[];
  // A lookup needs at most one binding per accepted publisher, not an array
  // containing every retained name in the network.
  for(const witness of allowed)if(trusted.includes(witness)){
   const key=witness+'|'+req.name+'|'+(req.prepared===true?'1':'0'),envelope=this.rows.get(key),row=this.decoded.get(key);
   if(envelope&&row)rows.push({envelope,row});
  }
  rows.sort((a,b)=>b.row.slot-a.row.slot);
  if(rows.length){const top=rows[0].row;if(rows.some(({row})=>row.slot===top.slot&&(row.txId!==top.txId||row.antId!==top.antId)))return null;}
  return rows[0]?.envelope||null;
 }
 async sync({names=[],peers=[],signal}={}){
  if(!this.context()||!this.trusted().length||!peers.length)return this.status();
  const trusted=this.trusted().slice(0,16),selected=peers.find(peer=>peerAddress(peer)===this.activePeer)||peers[this.peerCursor++%Math.min(peers.length,32)],address=peerAddress(selected);
  let changed=false;
  try{
   let state=this.cursors[address]||{cursor:null,completeAt:null};
   for(let pageNumber=0;pageNumber<this.pagesPerPass;pageNumber++){
    signal?.throwIfAborted();
    const requestedScope=this.context();
    const result=await this.query(selected,{op:'snapshots',witnessPeerIds:trusted,limit:this.pageSize,cursor:state.cursor},{signal});
    if(!result?.ok){
     // Compatibility with older supporters; a cold new peer uses pagination.
     if(['unknown_op','mesh_operation_not_allowed','snapshot_pages_unavailable'].includes(result?.error)){
      this.activePeer=null;changed=await this.syncLegacy({names,peer:selected,trusted,signal})||changed;break;
     }
     throw new Error(result?.error||'snapshot_page_unavailable');
    }
    if(result.schema!=='arns-mesh-snapshot-page/v1'||!Array.isArray(result.records)||result.records.length>this.pageSize||typeof result.complete!=='boolean'||Buffer.byteLength(JSON.stringify(result))>SNAPSHOT_PAGE_BYTES)throw new Error('invalid_snapshot_page');
    // Awaiting a peer can cross an accepted network update. Re-check scope
    // and publisher trust once for this synchronous batch before inserting it.
    if(this.context()!==requestedScope)throw new Error('snapshot_network_changed');
    const liveTrusted=new Set(this.trusted()),verified=[];
    const after=decodeCursor(state.cursor),next=decodeCursor(result.nextCursor);
    let previous=after;
    for(const env of result.records){
     if(!trusted.includes(env?.witnessPeerId)||!liveTrusted.has(env?.witnessPeerId))throw new Error('untrusted_snapshot_relay');
     const row=checkedEnvelope(env),key=keyOf(env,row);
     if(key<=previous)throw new Error('snapshot_page_order');
     previous=key;verified.push({env,row});
    }
    if(result.complete?(result.nextCursor!==null):(result.records.length===0||next!==previous||next<=after))throw new Error('invalid_snapshot_page_cursor');
    for(const {env,row} of verified){try{this.#putVerified(env,row,false);changed=true;}catch(error){if(!['snapshot_rollback_rejected','snapshot_conflict'].includes(error.message))throw error;this.lastError=String(error.message);}}
    this.lastSyncAt=new Date().toISOString();
    state={cursor:result.nextCursor,completeAt:result.complete?this.lastSyncAt:state.completeAt};
    this.cursors[address]=state;this.activePeer=result.complete?null:address;changed=true;
    while(Object.keys(this.cursors).length>32)delete this.cursors[Object.keys(this.cursors)[0]];
    if(result.complete){this.lastCompleteAt=this.lastSyncAt;break;}
   }
   if(!this.lastError?.startsWith('snapshot_conflict'))this.lastError=null;
  }catch(error){this.activePeer=null;this.lastError=String(error.message).slice(0,160);if(signal?.aborted)throw error;}
  finally{if(changed)this.save();}
  return this.status();
 }
 async syncLegacy({names,peer,trusted,signal}){
  let saved=false;
  for(let i=0;i<Math.min(8,names.length);i++){
   const name=names[this.cursor++%names.length];
   for(const prepared of [false,true]){
    signal?.throwIfAborted();
    const requestedScope=this.context();
    const env=await this.query(peer,{op:'snapshot',name,witnessPeerIds:trusted,...(prepared?{prepared:true}:{})},{signal});
    if(this.context()!==requestedScope)throw new Error('snapshot_network_changed');
    if(env?.ok){if(!this.context()||!this.trusted().includes(env.witnessPeerId))throw new Error('untrusted_snapshot_relay');const row=checkedEnvelope(env);if(row.name!==name||(row.prepared===true)!==prepared)throw new Error('snapshot_name_or_version_mismatch');this.#putVerified(env,row,false);saved=true;}
   }
  }
  return saved;
 }
 status(){
  const accepted=this.entries();
  return {networkId:this.networkId,records:this.rows.size,acceptedRecords:accepted.length,names:new Set(accepted.map(({row})=>row.name)).size,preparedRecords:accepted.filter(({row})=>row.prepared===true).length,limit:this.maxRecords,bytes:this.bytes,maxBytes:this.maxBytes,pageSize:this.pageSize,pagesPerPass:this.pagesPerPass,lastSyncAt:this.lastSyncAt,lastCompleteAt:this.lastCompleteAt,error:this.lastError};
 }
}
