import fs from 'node:fs';
import crypto from 'node:crypto';
import {createSwarmMeshClient} from './swarm-client.mjs';
import {fetchMeshContent} from './content-fetcher.mjs';
import {validArName,validDataId} from './swarm-common.mjs';
import {manifestTargetIds} from './manifest-path.mjs';
import {validateSnapshot} from './name-snapshots.mjs';
import {discoverArweaveReferences} from './arweave-references.mjs';

export class SitePinner{
 constructor({file,snapshots,contentStore,fetchContent=fetchMeshContent,createClient=createSwarmMeshClient}){
  this.file=file;this.snapshots=snapshots;this.store=contentStore;this.fetchContent=fetchContent;this.createClient=createClient;this.jobs=new Map();this.rows=Object.create(null);
  try{this.rows=Object.assign(Object.create(null),JSON.parse(fs.readFileSync(file)));}catch{}
  for(const row of Object.values(this.rows)){if(row.status==='saving')row.status='interrupted';if(row.update?.status==='saving')row.update.status='interrupted';}
 }
 isReady(row){return Boolean(row&&['document-saved','manifest-saved','linked-resources-saved'].includes(row.status)&&row.saved===row.total&&!row.failed);}
 readySnapshot(name,{trustedPeers=[]}={}){if(!this.isReady(this.rows[name]))return null;return this.snapshotStore({trustedPeers}).get(name);}
 preparedStore({trustedPeers=[]}={}){return {get:name=>this.readySnapshot(name,{trustedPeers})};}
 status(){return {sites:Object.values(this.rows),storage:this.store.pinStats(),ready:Object.values(this.rows).filter(r=>this.isReady(r)).length};}
 save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.rows),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 // A pinned version must retain its own dated name binding. Later live
 // observations must not silently redirect a saved entry to unpinned bytes.
 snapshotStore({trustedPeers=[]}={}){
  return {get:name=>{
   const row=this.rows[name];if(!row)return this.snapshots.get(name);
   const saved=row.snapshot||this.snapshots.get(name);
   if(!saved||saved.txId!==row.rootDataId||saved.observedAt!==row.observedAt)throw new Error('saved_binding_unavailable');
   const snapshot=validateSnapshot(saved,name),provenance=saved.provenance;
   if(provenance?.kind!=='local-rpc'&&!(provenance?.kind==='trusted-peer'&&trustedPeers.includes(provenance.witnessPeerId)))throw new Error('saved_peer_trust_required');
   return {...snapshot,provenance:{...provenance}};
  },put:(...args)=>this.snapshots.put(...args)};
 }
 remove(name){
  if(this.jobs.has(name))throw new Error('site_save_in_progress');
  const old=this.rows[name];delete this.rows[name];try{this.save();}catch(e){this.rows[name]=old;throw e;}
  for(const group of new Set([name,old?.pinGroup,old?.update?.pinGroup].filter(Boolean)))this.store.unpin(group);
 }
 start(name,{accessPolicy='live',trustedPeers=[],signal,contentSources='all',snapshot:provided=null,managedBy=null}={}){
  if(!validArName(name))throw new Error('invalid_arns_name');
  if(this.jobs.has(name))return this.jobs.get(name);
  const snapshot=provided||(accessPolicy==='saved'?this.snapshotStore({trustedPeers}):this.snapshots).get(name);if(!snapshot)throw new Error('saved_name_unavailable');
  validateSnapshot(snapshot,name);if(snapshot.provenance?.kind!=='local-rpc'&&!(snapshot.provenance?.kind==='trusted-peer'&&trustedPeers.includes(snapshot.provenance.witnessPeerId)))throw new Error('saved_peer_trust_required');
  if(this.jobs.size>=2)throw new Error('site_save_busy');
  const job=this.run(name,snapshot,{signal,contentSources,managedBy}).finally(()=>this.jobs.delete(name));this.jobs.set(name,job);return job;
 }
 async run(name,snapshot,{signal,contentSources,managedBy}={}){
  const old=this.rows[name],previous=this.isReady(old)?{...old,update:undefined}:null;
  const pinGroup='site:'+crypto.createHash('sha256').update(name).digest('hex')+':'+snapshot.txId;
  const row={name,rootDataId:snapshot.txId,observedAt:snapshot.observedAt,snapshot:{...validateSnapshot(snapshot,name),provenance:{...snapshot.provenance}},pinGroup,...(managedBy==='catalog'?{managedBy:'catalog'}:{}),status:'saving',scope:'document',total:1,saved:0,failed:0,errors:[]};
  this.rows[name]=previous?{...previous,update:row}:row;try{this.save();}catch(error){if(old)this.rows[name]=old;else delete this.rows[name];throw error;}
  const stale=old?.update?.pinGroup||(!previous&&old?.pinGroup);if(stale&&stale!==pinGroup&&stale!==previous?.pinGroup)this.store.unpin(stale);
  const client=this.createClient();client.setName(name);
  const fetchOne=async id=>{
   signal?.throwIfAborted();
   const item=await this.fetchContent(id,{client,contentStore:this.store,signal,contentSources});
   signal?.throwIfAborted();
   if(item.cacheError)throw new Error('content_cache_failed: '+item.cacheError);if(!this.store.has(id))throw new Error('content_not_cached');
   await this.store.pin(id,pinGroup);return item;
  };
  const ids=[],seen=new Set([snapshot.txId]);let next=0,limitReported=false;
  const expand=item=>{
   const type=item.direct.tags?.find(t=>t.name.toLowerCase()==='content-type')?.value||'';
   let children=[];
   if(type.toLowerCase().includes('application/x.arweave-manifest')){
    const manifest=JSON.parse(item.direct.payload.toString());
    if(manifest.manifest!=='arweave/paths'||!manifest.paths||typeof manifest.paths!=='object')throw new Error('invalid_manifest');
    children=manifestTargetIds(manifest);if(row.scope==='document')row.scope='manifest';
   }
   const references=discoverArweaveReferences(item.direct);
   if(references.ids.length){row.scope='linked-arweave';children.push(...references.ids);}
   if(references.truncated){row.failed++;row.errors.push({error:'static_arweave_reference_scan_limit'});}
   for(const id of children){
    if(!validDataId(id))throw new Error('invalid_reference_id');
    if(seen.has(id))continue;
    if(seen.size>=1025){if(!limitReported){row.failed++;row.errors.push({error:'site_file_limit'});limitReported=true;}continue;}
    seen.add(id);ids.push(id);row.total++;
   }
  };
  try{
   const root=await fetchOne(snapshot.txId);row.saved=1;expand(root);this.save();
   const worker=async()=>{while(next<ids.length){signal?.throwIfAborted();const id=ids[next++];try{const item=await fetchOne(id);row.saved++;expand(item);}catch(e){row.failed++;row.errors.push({id,error:String(e.message).slice(0,200)});}this.save();}};
   await worker(); // One preparation transfer at a time; shared server work is bounded separately.
   row.status=row.failed?'partial':row.scope==='linked-arweave'?'linked-resources-saved':row.scope==='manifest'?'manifest-saved':'document-saved';
  }catch(e){row.status='partial';row.failed++;row.errors.push({error:String(e.message).slice(0,240)});}
  finally{
   try{
   row.updatedAt=new Date().toISOString();
   if(this.isReady(row)){
    // Publish the new binding only after all files are pinned. Old groups stay
    // pinned until that atomic metadata commit succeeds, including on crashes.
    this.rows[name]=row;
    try{this.save();}catch(error){this.rows[name]=previous?{...previous,update:row}:row;throw error;}
    const prefix='site:'+crypto.createHash('sha256').update(name).digest('hex')+':';
    for(const group of Object.keys(this.store.pins||{}))if(group!==pinGroup&&(group===name||group.startsWith(prefix)))this.store.unpin(group);
   }else{this.rows[name]=previous?{...previous,update:row}:row;this.save();}
   }finally{await client.stop();}
  }
  return {...row};
 }
}
