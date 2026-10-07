#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
const GiB=1024**3;
export const PROFILES={
 vps:{cache:16384,saved:65536,names:16384,content:8192,replication:8192,cpu:50,memory:1024},
 pi:{cache:4096,saved:16384,names:4096,content:2048,replication:2048,cpu:50,memory:768}
};
export function settingsFor(profile='vps',advertise){
 const p=PROFILES[profile];if(!p)throw new Error('capacity_profile_must_be_vps_or_pi');
 if(advertise&&!/^(?:\[[0-9a-fA-F:]+\]|[0-9.]+):[0-9]+$/.test(advertise))throw new Error('advertise_requires_numeric_ip_and_port');
 if(advertise){const i=advertise.lastIndexOf(':'),host=advertise.slice(0,i).replace(/^\[|\]$/g,''),port=Number(advertise.slice(i+1));if(!net.isIP(host)||port<1||port>65535)throw new Error('invalid_advertise_address');}
 return {
  MESH_CAPACITY_PROFILE:profile,MESH_LISTEN:advertise?.startsWith('[')?'[::]:49741':'0.0.0.0:49741',...(advertise?{MESH_ADVERTISE:advertise}:{}),
  MESH_NODE_HEAP_MIB:384,MESH_SERVICE_CPU_PERCENT:p.cpu,MESH_SERVICE_MEMORY_MIB:p.memory,
  ARNS_CATALOG_ENABLED:1,ARNS_CATALOG_BULK_SCAN:1,ARNS_CATALOG_MINTS_PER_PASS:32,
  ARNS_CATALOG_INTERVAL_MS:5000,ARNS_REGISTRY_INTERVAL_MS:60000,ARNS_TARGET_SCAN_INTERVAL_MS:300000,
  ARNS_ONLINE_PREPARATION:1,ARNS_PREPARATION_DAILY_MIB:64,
  ARNS_PREPARE_ENABLED:1,ARNS_PREPARE_MAX_SITES:20000,ARNS_PREPARE_MAX_FILES:8192,
  ARNS_CACHE_MIB:p.cache,ARNS_SAVED_MIB:p.saved,ARNS_NAMES_DAILY_MIB:p.names,
  ARNS_CATALOG_DAILY_MIB:p.content,ARNS_CATALOG_PASS_MIB:32,ARNS_INDEX_DAILY_MIB:64,
  ARNS_RELAY_MAX_RECORDS:40000,ARNS_RELAY_MIB:64,
  ARNS_REPLICATION_ENABLED:1,ARNS_REPLICATION_MAX_SITES:20000,
  ARNS_REPLICATION_DAILY_MIB:p.replication,ARNS_REPLICATION_PASS_MIB:32,
  ARNS_SHARED_INDEX_DIR:'/var/lib/arns-mesh-shared-index'
 };
}
export function parseEnvironment(text){
 const out={};for(const line of text.split(/\r?\n/)){if(!line.trim()||line.trim().startsWith('#'))continue;const m=/^([A-Z][A-Z0-9_]*)=([^\r\n]*)$/.exec(line);if(!m)throw new Error('peer_env_requires_plain_KEY_VALUE_lines');out[m[1]]=m[2];}return out;
}
export function capacityReport(settings,freeBytes,indexFreeBytes=freeBytes,sameFilesystem=true){
 const cache=Number(settings.ARNS_CACHE_MIB),saved=Number(settings.ARNS_SAVED_MIB);
 if(![cache,saved].every(n=>Number.isFinite(n)&&n>=0))throw new Error('invalid_storage_budget');
 const contentBytes=(cache+saved)*1024**2+4*GiB,indexBytes=50*GiB;
 const requiredBytes=contentBytes+(sameFilesystem?indexBytes:0);
 return {profile:settings.MESH_CAPACITY_PROFILE,freeGiB:Math.floor(freeBytes/GiB),requiredGiB:requiredBytes/GiB,indexFreeGiB:Math.floor(indexFreeBytes/GiB),indexRequiredGiB:50,
  enough:freeBytes>=requiredBytes&&(sameFilesystem||indexFreeBytes>=indexBytes),
  action:'Reserve content/cache allowances plus 4 GiB headroom and a separate 50 GiB R84 allowance. Reduce budgets explicitly or use a larger SSD; changing a limit does not prepare content.'};
}
function existingParent(dir){let p=path.resolve(dir);while(!fs.existsSync(p)){const q=path.dirname(p);if(q===p)throw new Error('storage_parent_missing');p=q;}return p;}
export function configureProfile({root,profile='vps',advertise,write=false,check=false,requirePreparation=false}){
 const file=path.join(root,'peer.env'),old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',prior=parseEnvironment(old),defaults=settingsFor(profile,advertise);
 if(prior.MESH_CAPACITY_PROFILE&&prior.MESH_CAPACITY_PROFILE!==profile)throw new Error('existing_capacity_profile_preserved: review peer.env before changing profiles');
 if(advertise&&prior.MESH_ADVERTISE&&prior.MESH_ADVERTISE!==advertise)throw new Error('existing_advertise_address_preserved: review peer.env before changing its address');
 const settings={...defaults,...prior},added=Object.keys(defaults).filter(k=>!(k in prior));
 for(const [key,value] of Object.entries(settings)){
  if(/^ARNS_.*_MIB$/.test(key)&&(!/^\d+$/.test(String(value))||Number(value)<1||Number(value)>131072))throw new Error('invalid_budget_'+key);
 }
 for(const [key,min,max] of [['MESH_NODE_HEAP_MIB',128,16384],['MESH_SERVICE_CPU_PERCENT',1,800],['MESH_SERVICE_MEMORY_MIB',512,65536]]){
  const value=Number(settings[key]);if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error('invalid_resource_limit_'+key);
 }

 if(requirePreparation){
  if(settings.ARNS_SHARED_INDEX_DIR!=='/var/lib/arns-mesh-shared-index')throw new Error('existing_index_path_needs_review: standard setup uses /var/lib/arns-mesh-shared-index');
  const required=['ARNS_CATALOG_ENABLED','ARNS_CATALOG_BULK_SCAN','ARNS_ONLINE_PREPARATION','ARNS_PREPARE_ENABLED','ARNS_REPLICATION_ENABLED'];
  const disabled=required.filter(k=>String(settings[k])!=='1');
  if(Number(settings.ARNS_PREPARE_MAX_SITES)<20000||Number(settings.ARNS_REPLICATION_MAX_SITES)<20000)disabled.push('20,000-site preparation/replication queue');
  if(disabled.length)throw new Error('existing_settings_need_review: enable '+disabled.join(', ')+' in peer.env; existing values were preserved');
 }
 const storageParent=existingParent(root),indexParent=existingParent(settings.ARNS_SHARED_INDEX_DIR),a=fs.statfsSync(storageParent),b=fs.statfsSync(indexParent);
 // Checks are conservative: existing full stores may need an explicit budget review.
 const capacity=capacityReport(settings,Number(a.bavail)*Number(a.bsize),Number(b.bavail)*Number(b.bsize),fs.statSync(storageParent).dev===fs.statSync(indexParent).dev);
 if(check&&!capacity.enough){const error=new Error('supporter_disk_capacity_insufficient');error.report=capacity;throw error;}
 if(write&&added.length){fs.mkdirSync(root,{recursive:true,mode:0o700});const next=old+(old&&!old.endsWith('\n')?'\n':'')+added.map(k=>k+'='+defaults[k]).join('\n')+'\n';const tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,next,{mode:0o600});fs.renameSync(tmp,file);}
 return {profile:settings.MESH_CAPACITY_PROFILE,preserved:Object.keys(prior),added,capacity};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 try{const root=arg('--root');if(!root)throw new Error('Usage: node scripts/supporter-profile.mjs --root PATH [--capacity vps|pi] [--advertise IP:PORT] [--write] [--check-capacity]');
 console.log(JSON.stringify(configureProfile({root,profile:arg('--capacity','vps'),advertise:arg('--advertise'),write:args.includes('--write'),check:args.includes('--check-capacity'),requirePreparation:args.includes('--require-preparation')}),null,2));
 }catch(e){console.error(JSON.stringify({ok:false,error:e.message,...(e.report?{capacity:e.report}:{})}));process.exitCode=1;}
}
