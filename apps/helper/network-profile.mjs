import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
export const profileSchema='arns-mesh-network-profile/v1';
const format=p=>(net.isIP(p.host)===6?'['+p.host+']':p.host)+':'+p.port;
function list(values,max){
 if(!Array.isArray(values)||values.length>max)throw new Error('Invalid endpoint list.');
 return [...new Set(values.map(value=>{
  if(typeof value!=='string'||value.length>128)throw new Error('Expected numeric IP:port.');
  const at=value.lastIndexOf(':'),host=value.slice(0,at).replace(/^\[|\]$/g,''),port=Number(value.slice(at+1));
  if(!net.isIP(host)||!/^\d+$/.test(value.slice(at+1))||port<1||port>65535)throw new Error('Use numeric IP:port only. Domains, credentials and URL paths are not accepted.');
  return format({host,port});
 }))];
}
const objects=values=>values.map(value=>{const at=value.lastIndexOf(':');return {host:value.slice(0,at).replace(/^\[|\]$/g,''),port:Number(value.slice(at+1))};});
export function readProfile(directory){
 const read=(name)=>{try{return JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}};
 return {schema:profileSchema,directPeers:read('mesh-ip-peers.json'),rpcSources:read('solana-rpc-seeds.json').map(format),arweavePeers:read('arweave-peers.json').map(format)};
}
export function mergeProfiles(current,incoming){
 const next=validateProfile(incoming);
 return validateProfile({schema:profileSchema,
  directPeers:[...new Set([...list(current.directPeers||[],16),...next.directPeers])],
  rpcSources:[...new Set([...list(current.rpcSources||[],8),...next.rpcSources])],
  arweavePeers:[...new Set([...list(current.arweavePeers||[],16),...next.arweavePeers])],
 });
}
export function validateProfile(value){
 if(!value||value.schema!==profileSchema)throw new Error('Unsupported connection profile.');
 if(Object.keys(value).some(k=>!['schema','directPeers','rpcSources','arweavePeers'].includes(k)))throw new Error('Unexpected profile fields. Profiles contain endpoint addresses only.');
 const p={schema:profileSchema,directPeers:list(value.directPeers,16),rpcSources:list(value.rpcSources,8),arweavePeers:list(value.arweavePeers||[],16)};
 if(!p.rpcSources.length)throw new Error('At least one numeric-IP Solana RPC is required for live names.');
 if(!p.directPeers.length&&!p.arweavePeers.length)throw new Error('At least one Mesh peer or raw Arweave peer is required.');
 return p;
}
export function loadProfile(file){
 if(fs.statSync(file).size>8192)throw new Error('Connection profile exceeds 8 KiB.');
 return validateProfile(JSON.parse(fs.readFileSync(file,'utf8')));
}
export function applyProfile(directory,value,{networkState}={}){
 const p=validateProfile(value);fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const lock=path.join(directory,'connections.lock');
 try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw new Error('Another connection update is in progress.');throw e;}
 const entries=[['mesh-ip-peers.json',p.directPeers],['solana-rpc-seeds.json',objects(p.rpcSources)],['arweave-peers.json',objects(p.arweavePeers)],['arweave-peer-seeds.json',objects(p.arweavePeers)],['hyper-bootstrap.json',[]]];
 if(networkState!==undefined)entries.push(['network-membership.json',networkState]);
 let previous=[],written=0;const staged=[];
 try{
  previous=entries.map(([name])=>{try{return fs.readFileSync(path.join(directory,name));}catch(e){if(e.code==='ENOENT')return null;throw e;}});
  for(const [name,value] of entries){const temp=path.join(directory,name+'.new'),fd=fs.openSync(temp,'wx',0o600);staged.push(temp);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
  for(const [name] of entries){fs.renameSync(path.join(directory,name+'.new'),path.join(directory,name));written++;}
 }catch(e){
  for(let i=0;i<written;i++){const file=path.join(directory,entries[i][0]);if(previous[i]===null)fs.rmSync(file,{force:true});else fs.writeFileSync(file,previous[i],{mode:0o600});}throw e;
 }finally{for(const file of staged)fs.rmSync(file,{force:true});fs.rmdirSync(lock);}
 return p;
}
