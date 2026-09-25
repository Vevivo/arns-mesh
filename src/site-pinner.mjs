import fs from 'node:fs';
import {createSwarmMeshClient} from './swarm-client.mjs';
import {fetchMeshContent} from './content-fetcher.mjs';
import {validArName,validDataId} from './swarm-common.mjs';
import {manifestTargetIds} from './manifest-path.mjs';
import {validateSnapshot} from './name-snapshots.mjs';

export class SitePinner{
 constructor({file,snapshots,contentStore}){this.file=file;this.snapshots=snapshots;this.store=contentStore;this.jobs=new Map();this.rows=Object.create(null);try{this.rows=Object.assign(Object.create(null),JSON.parse(fs.readFileSync(file)));}catch{}for(const row of Object.values(this.rows))if(row.status==='saving')row.status='interrupted';}
 status(){return {sites:Object.values(this.rows),storage:this.store.pinStats()};}
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
 remove(name){if(this.jobs.has(name))throw new Error('site_save_in_progress');this.store.unpin(name);delete this.rows[name];this.save();}
 start(name,{accessPolicy='live',trustedPeers=[]}={}){
  if(!validArName(name))throw new Error('invalid_arns_name');
  if(this.jobs.has(name))return this.jobs.get(name);
  const snapshot=(accessPolicy==='saved'?this.snapshotStore({trustedPeers}):this.snapshots).get(name);if(!snapshot)throw new Error('saved_name_unavailable');
  if(this.jobs.size>=2)throw new Error('site_save_busy');
  const job=this.run(name,snapshot).finally(()=>this.jobs.delete(name));this.jobs.set(name,job);return job;
 }
 async run(name,snapshot){
  const row=this.rows[name]={name,rootDataId:snapshot.txId,observedAt:snapshot.observedAt,snapshot:{...validateSnapshot(snapshot,name),provenance:{...snapshot.provenance}},status:'saving',scope:'document',total:1,saved:0,failed:0,errors:[]};this.save();
  const client=createSwarmMeshClient();client.setName(name);
  const fetchOne=async id=>{const item=await fetchMeshContent(id,{client,contentStore:this.store});if(item.cacheError)throw new Error('content_cache_failed: '+item.cacheError);if(!this.store.has(id))throw new Error('content_not_cached');await this.store.pin(id,name);return item;};
  try{
   const root=await fetchOne(snapshot.txId);row.saved=1;
   const type=root.direct.tags?.find(t=>t.name.toLowerCase()==='content-type')?.value||'';
   if(type.toLowerCase().includes('application/x.arweave-manifest')){
    const manifest=JSON.parse(root.direct.payload.toString());
    if(manifest.manifest!=='arweave/paths'||!manifest.paths||typeof manifest.paths!=='object')throw new Error('invalid_manifest');
    const ids=manifestTargetIds(manifest).filter(id=>id!==snapshot.txId);
    if(ids.length>1024||ids.some(id=>!validDataId(id)))throw new Error('manifest_pin_limit_or_invalid_id');
    row.scope='manifest';row.total=ids.length+1;this.save();let next=0;
    const worker=async()=>{while(next<ids.length){const id=ids[next++];try{await fetchOne(id);row.saved++;}catch(e){row.failed++;row.errors.push({id,error:String(e.message).slice(0,200)});}this.save();}};
    await Promise.all([worker(),worker()]);
   }
   row.status=row.failed?'partial':row.scope==='manifest'?'manifest-saved':'document-saved';
  }catch(e){row.status='partial';row.failed++;row.errors.push({error:String(e.message).slice(0,240)});}
  finally{row.updatedAt=new Date().toISOString();this.save();await client.stop();}
  return {...row};
 }
}
