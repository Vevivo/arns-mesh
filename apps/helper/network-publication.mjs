import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {signNetwork,verifyNetwork,networkPublicKey,encodeInvitation,decodeInvitation,validateInvitation,MAX_NETWORK_BYTES,MAX_NETWORK_AGE} from '../../src/network-invitation.mjs';
import {validateProfile} from './network-profile.mjs';

function readJson(file,max=MAX_NETWORK_BYTES){if(fs.statSync(file).size>max)throw new Error('Network file is too large.');return JSON.parse(fs.readFileSync(file,'utf8'));}
function writeJson(file,value){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});try{fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}}
export function readNetworkPublication(dataDir){
 try{
  const record=readJson(path.join(dataDir,'network-announcement.json'),MAX_NETWORK_BYTES+4096);
  verifyNetwork(record.envelope,record.invitation,{allowExpired:true});
  return record.envelope;
 }catch(error){if(error.code==='ENOENT')return null;throw new Error('Invalid local network publication: '+error.message);}
}
export function publishNetwork({dataDir,profile,name,seeds=profile.directPeers.slice(0,8),local=false,days=14,now=Date.now()}){
 const p=validateProfile(profile);if(!Number.isInteger(days)||days<1||days>MAX_NETWORK_AGE/86400000)throw new Error('Choose 1 to 30 days for a connection-list publication.');
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const lock=path.join(dataDir,'network-publication.lock');fs.mkdirSync(lock);
 try{
  const keyFile=path.join(dataDir,'network-authority.private.json');let identity;
  try{identity=readJson(keyFile,4096);}catch(error){if(error.code!=='ENOENT')throw error;identity={schema:'arns-mesh-network-authority/v1',privateKey:crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'}),revision:0};}
  if(identity.schema!=='arns-mesh-network-authority/v1'||!Number.isSafeInteger(identity.revision)||identity.revision<0)throw new Error('Invalid network authority state.');
  const invitation=validateInvitation({version:1,key:networkPublicKey(identity.privateKey),seeds,local});
  const payload={schema:'arns-mesh-network/v1',name,revision:identity.revision+1,issuedAt:now,expiresAt:now+days*86400000,profile:p};
  const envelope=signNetwork(payload,identity.privateKey,{local,now});
  // Persist the sequence first; a crash may skip a revision, never reuse one.
  identity.revision=payload.revision;writeJson(keyFile,identity);
  writeJson(path.join(dataDir,'network-announcement.json'),{invitation,envelope});
  return {name:payload.name,revision:payload.revision,expiresAt:payload.expiresAt,code:encodeInvitation(invitation)};
 }finally{fs.rmdirSync(lock);}
}
export function mirrorNetwork(dataDir,invitation,envelope){
 verifyNetwork(envelope,invitation);fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const file=path.join(dataDir,'network-announcement.json');
 try{const old=readJson(file,MAX_NETWORK_BYTES+4096);const previous=verifyNetwork(old.envelope,invitation,{allowExpired:true});const next=verifyNetwork(envelope,invitation);if(next.revision<previous.revision||next.revision===previous.revision&&old.envelope.recordJson!==envelope.recordJson)throw new Error('Older or conflicting network publication rejected.');}catch(error){if(error.code!=='ENOENT')throw error;}
 writeJson(file,{invitation,envelope});
}
export function bundledNetworks(coreRoot){
 let rows;try{rows=readJson(path.join(coreRoot,'resources','networks.json'),32768);}catch(error){if(error.code==='ENOENT')return [];throw error;}
 if(!Array.isArray(rows)||rows.length>8)throw new Error('Invalid bundled network list.');
 return rows.map(row=>{if(!row||Object.keys(row).some(k=>!['name','code'].includes(k))||typeof row.name!=='string'||!row.name.trim()||row.name.length>80||typeof row.code!=='string')throw new Error('Invalid bundled network.');decodeInvitation(row.code);return {name:row.name,code:row.code};});
}

// Only the authority host renews its own unchanged list. Mirrors never receive
// a private key and cannot change or renew a publication by themselves.
export function renewNetworkPublication(dataDir,{now=Date.now()}={}){
 const keyFile=path.join(dataDir,'network-authority.private.json');
 if(!fs.existsSync(keyFile))return null;
 const record=readJson(path.join(dataDir,'network-announcement.json'),MAX_NETWORK_BYTES+4096);
 const payload=verifyNetwork(record.envelope,record.invitation,{allowExpired:true,now});
 if(payload.expiresAt-now>3*86400000)return null;
 const identity=readJson(keyFile,4096);
 if(networkPublicKey(identity.privateKey)!==record.invitation.key)throw new Error('A mirror cannot renew another network authority’s list.');
 return publishNetwork({dataDir,profile:payload.profile,name:payload.name,seeds:record.invitation.seeds,local:record.invitation.local,days:14,now});
}
