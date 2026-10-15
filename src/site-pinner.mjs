import {verifyStoredContent} from './content-store.mjs';
import {decodeVerifiedPayload} from './content-decoding.mjs';
import fs from 'node:fs';
import {setImmediate as yieldToEventLoop} from 'node:timers/promises';
import crypto from 'node:crypto';
import {createSwarmMeshClient} from './swarm-client.mjs';
import {fetchMeshContent} from './content-fetcher.mjs';
import {validArName,validDataId} from './swarm-common.mjs';
import {manifestTargetIds} from './manifest-path.mjs';
import {validateSnapshot} from './name-snapshots.mjs';
import {discoverArweaveReferences} from './arweave-references.mjs';
import {getProtectedNameContext} from './name-security-runtime.mjs';

export class SitePinner{
 constructor({file,snapshots,contentStore,fetchContent=fetchMeshContent,createClient=createSwarmMeshClient,maxFiles=1024,pinNamespace='site',getNameContext=getProtectedNameContext}){
  if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>32768)throw new Error('invalid_site_file_limit');this.maxFiles=maxFiles;
  if(!/^[a-z][a-z0-9-]{0,31}$/.test(pinNamespace))throw new Error('invalid_pin_namespace');this.pinNamespace=pinNamespace;
  this.file=file;this.snapshots=snapshots;this.store=contentStore;this.fetchContent=fetchContent;this.createClient=createClient;this.getNameContext=getNameContext;this.jobs=new Map();this.jobPolicies=new Map();this.rows=Object.create(null);
  try{this.rows=Object.assign(Object.create(null),JSON.parse(fs.readFileSync(file)));}catch{}
  for(const row of Object.values(this.rows)){if(row.status==='saving')row.status='interrupted';if(row.update?.status==='saving')row.update.status='interrupted';}
 }
 isReady(row){
  const context=this.getNameContext();
  if(!row||!['document-saved','manifest-saved','linked-resources-saved'].includes(row.status)||row.saved!==row.total||row.failed)return false;
  // Older releases did not embed the dated binding in saved-site metadata.
  // A later observation of the same target cannot reconstruct the old date.
  const binding=context?row.snapshot:row.snapshot||this.snapshots.get(row.name);
  if(!binding||binding.txId!==row.rootDataId||binding.observedAt!==row.observedAt)return false;
  try{if(context){context.verifySnapshot(binding,{name:row.name,mode:'historical',requireKnown:false});context.assertCurrent();}else validateSnapshot(binding,row.name);}catch{return false;}
  const ids=this.store.pins?.[row.pinGroup||row.name]||[];
  return ids.length>=row.total&&ids.every(id=>this.store.has(id));
 }
 // Revisit old preparation metadata gradually under the caller's ordinary
 // transfer/time budget. Existing plain sites remain available during audit.
 needsDecodingAudit(row){return Boolean(row&&row.contentDecodingVersion!==1);}
 readySnapshot(name,{trustedPeers=[]}={}){if(!this.isReady(this.rows[name]))return null;return this.snapshotStore({trustedPeers}).get(name);}
 preparedStore({trustedPeers=[]}={}){return {get:name=>this.readySnapshot(name,{trustedPeers})};}
 status(){return {sites:Object.values(this.rows),storage:this.store.pinStats(),ready:Object.values(this.rows).filter(r=>this.isReady(r)).length};}
 save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.rows),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 // A pinned version must retain its own dated name binding. Later live
 // observations must not silently redirect a saved entry to unpinned bytes.
 snapshotStore({trustedPeers=[]}={}){
  return {get:name=>{
   const context=this.getNameContext(),row=this.rows[name];
   if(context){
    if(!row)return null;
    const saved=row.snapshot;
    if(!saved||saved.txId!==row.rootDataId||saved.observedAt!==row.observedAt)throw new Error('saved_binding_unavailable');
    const verified=context.verifySnapshot(saved,{name,mode:'historical',requireKnown:false});context.assertCurrent();return verified.snapshot;
   }
   if(!row)return this.snapshots.get(name);
   const saved=row.snapshot||this.snapshots.get(name);
   if(!saved||saved.txId!==row.rootDataId||saved.observedAt!==row.observedAt)throw new Error('saved_binding_unavailable');
   const snapshot=validateSnapshot(saved,name),provenance=saved.provenance;
   if(provenance?.kind!=='local-rpc'&&!(provenance?.kind==='trusted-peer'&&trustedPeers.includes(provenance.witnessPeerId)))throw new Error('saved_peer_trust_required');
   return {...snapshot,provenance:{...provenance}};
  },put:(...args)=>{if(this.getNameContext())throw new Error('name_certificate_required');return this.snapshots.put(...args);}};
 }
 remove(name){
  if(this.jobs.has(name))throw new Error('site_save_in_progress');
  const context=this.getNameContext();
  if(context&&(!['site','replica'].includes(this.pinNamespace)||typeof context.releaseSnapshot!=='function'))throw new Error('name_certificate_retention_unavailable');
  const old=this.rows[name];delete this.rows[name];try{this.save();}catch(e){this.rows[name]=old;throw e;}
  for(const group of new Set([...(this.pinNamespace==='site'?[name]:[]),old?.pinGroup,old?.update?.pinGroup].filter(Boolean)))this.store.unpin(group);
  if(context){context.releaseSnapshot({name,owner:this.pinNamespace});context.releaseSnapshot({name,owner:this.pinNamespace+'-update'});}
 }
 start(name,{accessPolicy='live',trustedPeers=[],signal,contentSources='all',snapshot:provided=null,managedBy=null}={}){
  if(!validArName(name))throw new Error('invalid_arns_name');
  const context=this.getNameContext(),policyId=context?.policyId||null;
  if(this.jobs.has(name)){if(this.jobPolicies.get(name)!==policyId)throw new Error('name_security_context_changed');if(context)throw new Error('site_save_in_progress');return this.jobs.get(name);}
  if(context){
   if(this.jobs.size>=2)throw new Error('site_save_busy');
   const job=(async()=>{const snapshot=await context.authorizeName(name,{snapshot:provided,mode:provided||accessPolicy==='saved'?'historical':'current',signal});context.assertCurrent();return this.run(name,snapshot,{signal,contentSources,managedBy});})().finally(()=>{this.jobs.delete(name);this.jobPolicies.delete(name);});
   this.jobPolicies.set(name,policyId);this.jobs.set(name,job);return job;
  }
  const snapshot=provided||(accessPolicy==='saved'?this.snapshotStore({trustedPeers}):this.snapshots).get(name);if(!snapshot)throw new Error('saved_name_unavailable');
  validateSnapshot(snapshot,name);if(snapshot.provenance?.kind!=='local-rpc'&&!(snapshot.provenance?.kind==='trusted-peer'&&trustedPeers.includes(snapshot.provenance.witnessPeerId)))throw new Error('saved_peer_trust_required');
  if(this.jobs.size>=2)throw new Error('site_save_busy');
  const job=this.run(name,snapshot,{signal,contentSources,managedBy}).finally(()=>{this.jobs.delete(name);this.jobPolicies.delete(name);});this.jobPolicies.set(name,null);this.jobs.set(name,job);return job;
 }
 async run(name,snapshot,{signal,contentSources,managedBy}={}){
  if(!validArName(name))throw new Error('invalid_arns_name');
  const context=this.getNameContext();
  if(context){snapshot=await context.authorizeName(name,{snapshot,mode:'historical',signal});context.assertCurrent();}
  const checkContext=()=>{const current=this.getNameContext();if((current?.policyId||null)!==(context?.policyId||null))throw new Error('name_security_context_changed');if(context){context.assertCurrent();context.verifySnapshot(snapshot,{name,mode:'historical',requireKnown:false});}};
  checkContext();
  if(context){
   if(!['site','replica'].includes(this.pinNamespace)||typeof context.retainSnapshot!=='function'||typeof context.releaseSnapshot!=='function')throw new Error('name_certificate_retention_unavailable');
   await context.retainSnapshot(snapshot,{owner:this.pinNamespace+'-update'});checkContext();
  }
  const old=this.rows[name];let previous=this.isReady(old)?{...old,update:undefined}:null,legacyCompressed=false;
  const pinGroup='site:'+crypto.createHash('sha256').update(this.pinNamespace==='site'?name:this.pinNamespace+'|'+name).digest('hex')+':'+snapshot.txId;
  const savedSnapshot=context?JSON.parse(JSON.stringify(snapshot)):{...validateSnapshot(snapshot,name),provenance:{...snapshot.provenance}};
  const row={name,rootDataId:snapshot.txId,observedAt:snapshot.observedAt,snapshot:savedSnapshot,pinGroup,...(managedBy==='catalog'?{managedBy:'catalog'}:{}),status:'saving',scope:'document',contentDecodingVersion:1,total:1,saved:0,failed:0,errors:[]};
  this.rows[name]=previous?{...previous,update:row}:row;try{this.save();}catch(error){if(old)this.rows[name]=old;else delete this.rows[name];throw error;}
  const stale=old?.update?.pinGroup||(!previous&&old?.pinGroup);if(stale&&stale!==pinGroup&&stale!==previous?.pinGroup)this.store.unpin(stale);
  const client=this.createClient();client.setName(name);
  const fetchOne=async id=>{
   try{
    signal?.throwIfAborted();checkContext();
    const item=await this.fetchContent(id,{client,contentStore:this.store,signal,contentSources});
    signal?.throwIfAborted();checkContext();
    if(item.cacheError)throw new Error('content_cache_failed: '+item.cacheError);if(!this.store.has(id))throw new Error('content_not_cached');
    await this.store.pin(id,pinGroup);checkContext();return item;
   }catch(error){
    // A failed cache verification can be hidden by an unavailable alternative.
    // During this bounded legacy audit, withdraw a same-target ready claim if
    // its retained signed bytes are actually corrupt, even before tags decode.
    if(previous?.rootDataId===snapshot.txId&&this.needsDecodingAudit(previous)&&(this.store.pins?.[previous.pinGroup||previous.name]||[]).includes(id)){
     let retained;try{retained=this.store.get(id);}catch{}
     if(retained)try{await verifyStoredContent(retained,id);}catch{previous=null;}
    }
    throw error;
   }
  };
  const ids=[],seen=new Set([snapshot.txId]);let next=0,limitReported=false;
  const expand=async item=>{
   // Tags are inspected only after fetchContent has verified the signed item.
   // A failed audit of compressed bytes cannot keep an older false-ready claim.
   if(previous?.rootDataId===snapshot.txId&&this.needsDecodingAudit(previous)&&item.direct.tags?.some(tag=>String(tag.name).toLowerCase()==='content-encoding'))legacyCompressed=true;
   const view=await decodeVerifiedPayload(item.direct,{signal});
   const type=item.direct.tags?.find(t=>t.name.toLowerCase()==='content-type')?.value||'';
   let children=[];
   if(type.toLowerCase().includes('application/x.arweave-manifest')){
    const manifest=JSON.parse(view.body.toString());
    if(manifest.manifest!=='arweave/paths'||!manifest.paths||typeof manifest.paths!=='object')throw new Error('invalid_manifest');
    children=manifestTargetIds(manifest);if(row.scope==='document')row.scope='manifest';
   }
   const references=discoverArweaveReferences({...item.direct,payload:view.body});
   if(references.ids.length){row.scope='linked-arweave';children.push(...references.ids);}
   if(references.truncated){row.failed++;row.errors.push({error:'static_arweave_reference_scan_limit'});}
   for(const id of children){
    if(!validDataId(id))throw new Error('invalid_reference_id');
    if(seen.has(id))continue;
    if(seen.size>=this.maxFiles+1){if(!limitReported){row.failed++;row.errors.push({error:'site_file_limit'});limitReported=true;}continue;}
    seen.add(id);ids.push(id);row.total++;
   }
  };
  try{
   const root=await fetchOne(snapshot.txId);row.saved=1;await expand(root);this.save();
   let checkpointAt=Date.now();
   const worker=async()=>{while(next<ids.length){
    // Cached misses settle immediately. Yield so HTTP replies and the caller's
    // preparation deadline can run even when every lookup resolves locally.
    await yieldToEventLoop();signal?.throwIfAborted();
    const id=ids[next++];try{const item=await fetchOne(id);row.saved++;await expand(item);}catch(e){row.failed++;row.errors.push({id,error:String(e.message).slice(0,200)});}
    // Initial and final commits stay synchronous and atomic. Intermediate
    // progress is recoverable, so avoid rewriting every site's metadata per file.
    if(Date.now()-checkpointAt>=1000){this.save();checkpointAt=Date.now();}
   }};
   await worker(); // One preparation transfer at a time; shared server work is bounded separately.
   row.status=row.failed?'partial':row.scope==='linked-arweave'?'linked-resources-saved':row.scope==='manifest'?'manifest-saved':'document-saved';
  }catch(e){row.status='partial';row.failed++;row.errors.push({error:String(e.message).slice(0,240)});}
  finally{
   try{
   row.updatedAt=new Date().toISOString();
   if(legacyCompressed&&!this.isReady(row))previous=null;
   if(this.isReady(row)){
    // Publish the new binding only after all files are pinned. Old groups stay
    // pinned until that atomic metadata commit succeeds, including on crashes.
    this.rows[name]=row;
    try{this.save();}catch(error){this.rows[name]=previous?{...previous,update:row}:row;throw error;}
    if(context){await context.retainSnapshot(row.snapshot,{owner:this.pinNamespace});checkContext();await context.releaseSnapshot({name,owner:this.pinNamespace+'-update'});checkContext();}
    const prefix='site:'+crypto.createHash('sha256').update(this.pinNamespace==='site'?name:this.pinNamespace+'|'+name).digest('hex')+':';
    for(const group of Object.keys(this.store.pins||{}))if(group!==pinGroup&&((this.pinNamespace==='site'&&group===name)||group.startsWith(prefix)))this.store.unpin(group);
   }else{this.rows[name]=previous?{...previous,update:row}:row;this.save();}
   }finally{await client.stop();}
  }
  return {...row};
 }
}
