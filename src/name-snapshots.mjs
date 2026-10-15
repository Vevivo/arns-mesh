import fs from 'node:fs';
import path from 'node:path';
import {validArName,validDataId} from './swarm-common.mjs';

export function validateSnapshot(value,expectedName){
 if(value?.schema!=='arns-mesh-name-snapshot/v1'||!validArName(value.name)||value.name!==expectedName||!validDataId(value.txId)||typeof value.antId!=='string'||!(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).test(value.antId))throw new Error('invalid_name_snapshot');
 const at=Date.parse(value.observedAt);
 if(!Number.isFinite(at)||at>Date.now()+30000)throw new Error('invalid_snapshot_time');
 if(!Number.isSafeInteger(value.slot)||value.slot<0)throw new Error('invalid_snapshot_slot');
 return {schema:value.schema,name:value.name,txId:value.txId,antId:value.antId,observedAt:value.observedAt,slot:value.slot,ttlSeconds:Number(value.ttlSeconds)||60};
}

// Only failures at the local persistence boundary may leave a live RPC read
// usable without saving it. Validation and rollback errors must stay fatal.
function persistSnapshots(store){
 try{store.save();}catch(cause){throw Object.assign(new Error('snapshot_persistence_failed: '+String(cause?.message||cause),{cause}),{code:'SNAPSHOT_PERSISTENCE_FAILED'});}
}

// These are explicitly dated observations, not proofs of current chain state.
export class NameSnapshotStore{
 constructor(file){this.file=file;this.rows=Object.create(null);try{const saved=JSON.parse(fs.readFileSync(file));if(saved.schema==='arns-mesh-name-snapshots/v1')this.rows=Object.assign(Object.create(null),saved.rows||{});}catch{}}
 get(name){const row=this.rows[name];if(!row)return null;try{return {...validateSnapshot(row,name),provenance:row.provenance};}catch{return null;}}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({schema:'arns-mesh-name-snapshots/v1',rows:this.rows}),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 put(value,provenance,{persist=true}={}){
  const row=validateSnapshot(value,value.name),previous=this.get(row.name);
  // A remote observation cannot replace a locally accepted RPC binding.
  if(provenance?.kind!=='local-rpc'&&previous?.provenance?.kind==='local-rpc')return previous;
  // A publisher's claimed slot is not a local RPC watermark. It must not
  // prevent recovery to a directly decoded RPC observation at a lower slot.
  const comparable=previous&&!(provenance?.kind==='local-rpc'&&previous.provenance?.kind!=='local-rpc');
  if(comparable&&row.slot<previous.slot)throw new Error('snapshot_rollback_rejected');
  if(comparable&&row.slot===previous.slot&&(row.txId!==previous.txId||row.antId!==previous.antId))throw new Error('snapshot_conflict');
  if(!previous&&Object.keys(this.rows).length>=50000)throw Object.assign(new Error('snapshot_catalog_limit'),{code:'SNAPSHOT_PERSISTENCE_FAILED'});
  const before=this.rows[row.name];this.rows[row.name]={...row,provenance};try{if(persist)persistSnapshots(this);}catch(e){if(before)this.rows[row.name]=before;else delete this.rows[row.name];throw e;}return this.get(row.name);
 }
 putMany(values,provenance){
  // Only changed names need rollback entries. Copying the entire catalogue for
  // each small observation batch otherwise grows with every retained name.
  const before=new Map();
  try{
   for(const value of values){if(!before.has(value.name))before.set(value.name,this.rows[value.name]);this.put(value,provenance,{persist:false});}
   persistSnapshots(this);
  }catch(error){for(const [name,row] of before){if(row===undefined)delete this.rows[name];else this.rows[name]=row;}throw error;}
 }
 observe(evidence){
  const good=evidence?.observations?.filter(x=>x.ok)||[],checks=evidence?.checks;
  if(!good.length||!checks?.pdaDerivedLocally||!checks.accountOwnersMatchExpectedPrograms||!checks.accountBytesDecodedLocally||good.some(x=>x.ant?.txId!==evidence.txId||x.arns?.processId!==evidence.antId))throw new Error('snapshot_requires_local_observation');
  const x=good[0];return this.put({schema:'arns-mesh-name-snapshot/v1',name:evidence.name,txId:evidence.txId,antId:evidence.antId,observedAt:evidence.generatedAt,slot:x.slot,ttlSeconds:x.ant.ttlSeconds},{kind:'local-rpc'});
 }
 exportLocal(name){const row=this.get(name);return row?.provenance?.kind==='local-rpc'?validateSnapshot(row,name):null;}
 names(){return Object.keys(this.rows).filter(name=>this.get(name));}
}

export async function resolveSavedName(name,{store,client,trustedPeers=[],signal}){
 signal?.throwIfAborted();
 const local=store?.get(name);
 if(local&&(local.provenance?.kind==='local-rpc'||trustedPeers.includes(local.provenance?.witnessPeerId)))return local;
 if(!trustedPeers.length)throw new Error('saved_name_unavailable');
 const remote=await client.snapshot(name,{trustedPeers,signal});
 signal?.throwIfAborted();
 const peer=remote.providers?.find(p=>trustedPeers.includes(p.witnessPeerId));
 if(!peer)throw new Error('untrusted_snapshot_peer');
 const value=validateSnapshot(remote.record,name);
 return store.put(value,{kind:'trusted-peer',witnessPeerId:peer.witnessPeerId});
}

// Retained versions must not overwrite the newest accepted name observation.
export async function resolvePreparedName(name,{store,client,trustedPeers=[],signal}){
 signal?.throwIfAborted();
 const local=store?.get(name);
 if(local&&(local.provenance?.kind==='local-rpc'||trustedPeers.includes(local.provenance?.witnessPeerId)))return local;
 if(!trustedPeers.length)throw new Error('saved_name_unavailable');
 const remote=await client.snapshot(name,{trustedPeers,signal,prepared:true});
 signal?.throwIfAborted();
 const peer=remote.providers?.find(p=>trustedPeers.includes(p.witnessPeerId));
 if(!peer)throw new Error('untrusted_snapshot_peer');
 return {...validateSnapshot(remote.record,name),provenance:{kind:'trusted-peer',witnessPeerId:peer.witnessPeerId}};
}
