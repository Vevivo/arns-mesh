import crypto from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateProfile,trustedWitnesses} from '../apps/helper/network-profile.mjs';

const PREFIX=Buffer.from('302a300506032b6570032100','hex');
export const MAX_NETWORK_BYTES=24576;
export const MAX_NETWORK_AGE=30*24*3600000;
const fail=message=>{throw new Error(message);};
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Invalid network record.');}
function base64(value,bytes){if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))fail('Invalid network key or signature.');const b=Buffer.from(value,'base64url');if(b.length!==bytes||b.toString('base64url')!==value)fail('Invalid network key or signature.');return b;}
export function networkPublicKey(key){const k=crypto.createPublicKey(key);if(k.asymmetricKeyType!=='ed25519')fail('An Ed25519 network key is required.');return k.export({format:'der',type:'spki'}).subarray(-32).toString('base64url');}
function keyObject(key){return crypto.createPublicKey({key:Buffer.concat([PREFIX,base64(key,32)]),format:'der',type:'spki'});}
export const networkId=key=>crypto.createHash('sha256').update(base64(key,32)).digest('hex');
export const profileHash=profile=>crypto.createHash('sha256').update(JSON.stringify(validateProfile(profile))).digest('hex');

// Automatically learned destinations must not turn a public network invitation
// into requests to the reader's LAN, loopback or cloud metadata services.
export function publicNetworkHost(host){
 if(net.isIP(host)===4){const [a,b]=host.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}
 if(net.isIP(host)===6){
  const expanded=new URL('http://['+host+']/').hostname.slice(1,-1).toLowerCase();
  // Only global-unicast 2000::/3. Exclude IPv4 translation, local and multicast.
  const first=parseInt(expanded.split(':')[0],16);return first>=0x2000&&first<=0x3fff&&!expanded.startsWith('2001:db8:');
 }
 return false;
}
function address(value,local){
 if(typeof value!=='string'||value.length>128)fail('Use numeric IP:port addresses.');
 const split=value.lastIndexOf(':'),host=value.slice(0,split).replace(/^\[|\]$/g,''),port=value.slice(split+1);
 if(!net.isIP(host)||!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)fail('Use numeric IP:port addresses.');
 if(!local&&!publicNetworkHost(host))fail('Public networks cannot advertise private or local addresses.');
 return (net.isIP(host)===6?'['+host+']':host)+':'+Number(port);
}
export const MAX_INVITATION_BYTES=49152;
function validateContinuityPayload(value,{key,local,seeds,now=Date.now()}={}){
 fields(value,['schema','key','local','seeds','name','generation','issuedAt','profile','bootstrap']);
 if(value.schema!=='arns-mesh-network-continuity/v1'||value.key!==key||value.local!==local||typeof value.name!=='string'||!value.name.trim()||value.name.length>80||/[\x00-\x1f\x7f]/.test(value.name))fail('Invalid durable network definition.');
 if(!Number.isSafeInteger(value.generation)||value.generation<1||!Number.isSafeInteger(value.issuedAt)||value.issuedAt>now+300000)fail('Invalid durable network generation or time.');
 if(!Array.isArray(value.seeds)||JSON.stringify(value.seeds)!==JSON.stringify(seeds))fail('Durable network seeds differ from the invitation.');
 if(!Array.isArray(value.bootstrap)||!value.bootstrap.length||value.bootstrap.length>8)fail('A durable network needs 1 to 8 numeric-IP rendezvous nodes.');
 const bootstrap=[...new Set(value.bootstrap.map(v=>address(v,local)))],profile=validateProfile(value.profile);
 for(const values of [profile.directPeers,profile.rpcSources,profile.arweavePeers])for(const v of values)address(v,local);
 return {...value,profile,bootstrap};
}
export function verifyNetworkContinuity(definition,invitation,{now=Date.now()}={}){
 fields(definition,['key','recordJson','signature']);
 if(definition.key!==invitation.key||typeof definition.recordJson!=='string'||Buffer.byteLength(JSON.stringify(definition))>MAX_NETWORK_BYTES)fail('Invalid durable network authority or size.');
 if(!crypto.verify(null,Buffer.from(definition.recordJson),keyObject(invitation.key),base64(definition.signature,64)))fail('Invalid durable network signature.');
 let value;try{value=JSON.parse(definition.recordJson);}catch{fail('Invalid durable network definition.');}
 return validateContinuityPayload(value,{key:invitation.key,local:invitation.local,seeds:invitation.seeds,now});
}
export function signNetworkContinuity({name,profile,seeds,bootstrap,local=false,generation=1,now=Date.now()},privateKey){
 const key=networkPublicKey(privateKey),invite=validateInvitation({version:1,key,seeds,local});
 const payload=validateContinuityPayload({schema:'arns-mesh-network-continuity/v1',key,local,seeds:invite.seeds,name,generation,issuedAt:now,profile,bootstrap},{...invite,now});
 const recordJson=JSON.stringify(payload);
 return {key,recordJson,signature:crypto.sign(null,Buffer.from(recordJson),crypto.createPrivateKey(privateKey)).toString('base64url')};
}
export function validateInvitation(value){
 fields(value,['version','key','seeds','local','definition']);
 if(![1,2].includes(value.version)||typeof value.local!=='boolean'||value.version===1&&value.definition!==undefined)fail('Unsupported network invitation.');
 base64(value.key,32);
 if(!Array.isArray(value.seeds)||!value.seeds.length||value.seeds.length>8)fail('A network needs 1 to 8 starting peers.');
 const result={version:value.version,key:value.key,seeds:[...new Set(value.seeds.map(v=>address(v,value.local)))],local:value.local};
 if(value.version===2){verifyNetworkContinuity(value.definition,result);result.definition=value.definition;}
 return result;
}
export function encodeInvitation(value){const normalized=validateInvitation(value),body=Buffer.from(JSON.stringify(normalized)).toString('base64url');const check=crypto.createHash('sha256').update(body).digest('hex').slice(0,12);return 'mesh'+normalized.version+'.'+body+'.'+check;}
export function decodeInvitation(code){
 if(typeof code!=='string'||code.trim().length>MAX_INVITATION_BYTES||!code.trim().startsWith('mesh2.')&&code.trim().length>4096)fail('Invalid Mesh connection code.');
 const match=code.trim().match(/^mesh([12])\.([A-Za-z0-9_-]+)\.([a-f0-9]{12})$/);
 if(!match||crypto.createHash('sha256').update(match[2]).digest('hex').slice(0,12)!==match[3])fail('The Mesh connection code is incomplete or mistyped.');
 let data;try{data=JSON.parse(Buffer.from(match[2],'base64url').toString('utf8'));}catch{fail('Invalid Mesh connection code.');}
 if(data.version!==Number(match[1]))fail('Invalid Mesh connection code version.');
 return validateInvitation(data);
}
// A release may carry public durable definitions for existing mesh1 invitations.
// Only a same-authority signature can upgrade an old code. This never adds trust
// for the package author or for discovered content peers.
export function withNetworkContinuity(invitation,{file=fileURLToPath(new URL('../resources/network-continuity.json',import.meta.url))}={}){
 const invite=validateInvitation(invitation);if(invite.version===2)return invite;
 try{
  if(fs.statSync(file).size>256*1024)return invite;
  const bundle=JSON.parse(fs.readFileSync(file,'utf8'));
  if(bundle.schema!=='arns-mesh-bundled-continuity/v1'||!Array.isArray(bundle.invitations)||bundle.invitations.length>8)return invite;
  for(const candidate of bundle.invitations){try{const next=validateInvitation(candidate);if(next.version===2&&next.key===invite.key&&next.local===invite.local)return next;}catch{}}
 }catch{}
 return invite;
}
export function invitationScope(invitation){
 const invite=validateInvitation(invitation),continuity=invite.version===2?verifyNetworkContinuity(invite.definition,invite):null;
 return {id:networkId(invite.key),local:invite.local,...(continuity?{bootstrap:continuity.bootstrap}:{})};
}
function validatePayload(payload,{local=false,now=Date.now(),allowExpired=false}={}){
 fields(payload,['schema','name','revision','issuedAt','expiresAt','profile']);
 if(payload.schema!=='arns-mesh-network/v1'||typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>80||/[\x00-\x1f\x7f]/.test(payload.name))fail('Invalid network name or schema.');
 if(!Number.isSafeInteger(payload.revision)||payload.revision<1)fail('Invalid network revision.');
 if(!Number.isSafeInteger(payload.issuedAt)||!Number.isSafeInteger(payload.expiresAt)||payload.issuedAt>now+300000||payload.expiresAt<=payload.issuedAt||payload.expiresAt-payload.issuedAt>MAX_NETWORK_AGE)fail('Invalid network publication time.');
 if(!allowExpired&&payload.expiresAt<=now)fail('The network connection list has expired. Ask its operator to renew it.');
 const profile=validateProfile(payload.profile);
 if(!profile.directPeers.length)fail('A network must advertise at least one Mesh peer.');
 for(const values of [profile.directPeers,profile.rpcSources,profile.arweavePeers])for(const value of values)address(value,local);
 return {...payload,profile};
}
export function signNetwork(payload,privateKey,{local=false,now=Date.now()}={}){
 const normalized=validatePayload(payload,{local,now});
 const key=networkPublicKey(privateKey),recordJson=JSON.stringify(normalized);
 return {key,recordJson,signature:crypto.sign(null,Buffer.from(recordJson),crypto.createPrivateKey(privateKey)).toString('base64url')};
}
export function verifyNetwork(envelope,invitation,{now=Date.now(),allowExpired=false}={}){
 const invite=validateInvitation(invitation);fields(envelope,['key','recordJson','signature']);
 if(envelope.key!==invite.key)fail('The network signing key does not match the connection code.');
 if(typeof envelope.recordJson!=='string'||Buffer.byteLength(JSON.stringify(envelope))>MAX_NETWORK_BYTES)fail('Network response is too large.');
 if(!crypto.verify(null,Buffer.from(envelope.recordJson),keyObject(invite.key),base64(envelope.signature,64)))fail('Invalid network signature.');
 let payload;try{payload=JSON.parse(envelope.recordJson);}catch{fail('Invalid signed network record.');}
 if(payload.schema==='arns-mesh-network-continuity/v1'){
  if(invite.version!==2||envelope.recordJson!==invite.definition.recordJson||envelope.signature!==invite.definition.signature)fail('Durable network definition does not match the invitation.');
  const definition=verifyNetworkContinuity(envelope,invite,{now});
  return {...definition,revision:0,expiresAt:null};
 }
 return validatePayload(payload,{local:invite.local,now,allowExpired});
}
export const networkRecordHash=envelope=>crypto.createHash('sha256').update(envelope.recordJson).digest('hex');

// An optional, separately signed extension keeps the v1 connection list readable
// by preview.8. Its hash binds witnesses to one exact signed list and its expiry.
export function signNetworkRecovery(envelope,trustedPeers,privateKey){
 const recordJson=JSON.stringify({schema:'arns-mesh-network-recovery/v1',networkHash:networkRecordHash(envelope),trustedPeers:trustedWitnesses(trustedPeers)});
 if(networkPublicKey(privateKey)!==envelope.key)fail('Recovery authority mismatch.');
 return {recordJson,signature:crypto.sign(null,Buffer.from(recordJson),crypto.createPrivateKey(privateKey)).toString('base64url')};
}
export function verifyNetworkRecovery(recovery,envelope,invitation,options={}){
 if(!recovery)return [];
 verifyNetwork(envelope,invitation,options);fields(recovery,['recordJson','signature']);
 if(typeof recovery.recordJson!=='string'||Buffer.byteLength(recovery.recordJson)>2048)fail('Invalid network recovery extension.');
 if(!crypto.verify(null,Buffer.from(recovery.recordJson),keyObject(invitation.key),base64(recovery.signature,64)))fail('Invalid recovery authority signature.');
 const record=JSON.parse(recovery.recordJson);fields(record,['schema','networkHash','trustedPeers']);
 if(record.schema!=='arns-mesh-network-recovery/v1'||record.networkHash!==networkRecordHash(envelope))fail('Recovery extension does not match the signed list.');
 return trustedWitnesses(record.trustedPeers);
}
export const connectionRecordHash=(envelope,recovery)=>recovery?crypto.createHash('sha256').update(networkRecordHash(envelope)).update(recovery.recordJson).digest('hex'):networkRecordHash(envelope);
export const connectionProfile=(payload,trustedPeers=[])=>validateProfile({...payload.profile,...(trustedPeers.length?{trustedPeers}:{})});
