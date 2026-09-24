import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

function addresses(values,{min=0,max=16}={}){
 if(!Array.isArray(values)||values.length<min||values.length>max)throw new Error(`Enter ${min} to ${max} IP:port addresses.`);
 const result=[];
 for(const value of values){
  if(typeof value!=='string'||value.length>128)throw new Error('Invalid IP:port address.');
  const at=value.lastIndexOf(':'),host=value.slice(0,at).replace(/^\[|\]$/g,''),port=Number(value.slice(at+1));
  if(at<0||!net.isIP(host)||!Number.isInteger(port)||port<1||port>65535)throw new Error('Use a numeric IP address and port. Domains and URL paths are not accepted.');
  if(!result.some(x=>x.host===host&&x.port===port))result.push({host,port});
 }
 return result;
}
const format=p=>(net.isIP(p.host)===6?'['+p.host+']':p.host)+':'+p.port;
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
export function readConnections(dataDir,coreRoot){
 const peers=read(path.join(dataDir,'mesh-ip-peers.json'),[]);
 const rpc=read(path.join(dataDir,'solana-rpc-seeds.json'),read(path.join(coreRoot,'solana-rpc-seeds.json'),[]));
 return {directPeers:addresses(peers).map(format),rpcSources:addresses(rpc.map(format),{min:1,max:8}).map(format)};
}
export function saveConnections(dataDir,configuration){
 const peers=addresses(configuration?.directPeers).map(format),rpc=addresses(configuration?.rpcSources,{min:1,max:8});
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const lock=path.join(dataDir,'connections.lock');
 try{fs.mkdirSync(lock);}catch(error){if(error.code==='EEXIST')throw new Error('Another connection update is in progress.');throw error;}
 const files=[['mesh-ip-peers.json',peers],['solana-rpc-seeds.json',rpc]].map(([name,value])=>({file:path.join(dataDir,name),value}));
 let backups=[],published=0;
 try{
  backups=files.map(x=>{try{return fs.readFileSync(x.file);}catch(error){if(error.code==='ENOENT')return null;throw error;}});
  for(const x of files)fs.writeFileSync(x.file+'.new',JSON.stringify(x.value),{mode:0o600});
  for(const x of files){fs.renameSync(x.file+'.new',x.file);published++;}
 }catch(error){
  for(let i=0;i<published;i++){if(backups[i]===null)fs.rmSync(files[i].file,{force:true});else fs.writeFileSync(files[i].file,backups[i],{mode:0o600});}
  throw error;
 }finally{for(const x of files)fs.rmSync(x.file+'.new',{force:true});fs.rmdirSync(lock);}
 return {directPeers:peers,rpcSources:rpc.map(format)};
}
