import crypto from 'node:crypto';

const POLICY='arns-mesh-name-policy/v1',OBSERVATION='arns-mesh-name-observation/v2',CERTIFICATE='arns-mesh-name-certificate/v1',FLOOR='arns-mesh-name-certificate-floor/v1';
const MAX_OBSERVATIONS=64,MAX_RECORD_BYTES=4096,MAX_TIME=8640000000000000;
export class NameCertificateError extends Error{
 constructor(code){super(code);this.name='NameCertificateError';this.code=code;}
}
const fail=code=>{throw new NameCertificateError(code);};
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const time=v=>integer(v,0,MAX_TIME);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const scope=v=>typeof v==='string'&&v.length>0&&v.length<=128;
const base58=v=>typeof v==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const nameOK=v=>typeof v==='string'&&/^[a-z0-9_-]{1,255}$/.test(v);
const idOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function witnessKeyId(publicKeyPem){
 try{
  if(typeof publicKeyPem!=='string'||Buffer.byteLength(publicKeyPem)>1024)fail('name_policy_key_invalid');
  const key=crypto.createPublicKey(publicKeyPem);
  if(key.asymmetricKeyType!=='ed25519')fail('name_policy_key_invalid');
  return hash(key.export({type:'spki',format:'der'}));
 }catch(error){if(error instanceof NameCertificateError)throw error;fail('name_policy_key_invalid');}
}
function normalizePolicy(policy){
 const keys=['schema','networkId','chainId','registryProgramId','threshold','maxFaults','roundMs','leaseMs','maxFutureSkewMs','validFrom','validUntil','witnesses','revoked'];
 if(!exact(policy,keys)||policy.schema!==POLICY||!scope(policy.networkId)||!scope(policy.chainId)||!base58(policy.registryProgramId))fail('name_policy_invalid');
 if(policy.revoked!==undefined&&typeof policy.revoked!=='boolean')fail('name_policy_invalid');
 if(policy.revoked===true)fail('name_policy_revoked');
 const skew=policy.maxFutureSkewMs??30000;
 if(!integer(policy.roundMs,1000,3600000)||!integer(policy.leaseMs,0,86400000)||!integer(skew,0,60000)||!time(policy.validFrom)||!time(policy.validUntil)||policy.validUntil<=policy.validFrom)fail('name_policy_time_invalid');
 if(!Array.isArray(policy.witnesses)||policy.witnesses.length<2||policy.witnesses.length>MAX_OBSERVATIONS)fail('name_policy_witnesses_invalid');
 const byKey=new Map(),domains=new Set();
 for(const witness of policy.witnesses){
  if(!exact(witness,['domain','publicKeyPem'])||typeof witness.domain!=='string'||!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(witness.domain))fail('name_policy_witnesses_invalid');
  const keyId=witnessKeyId(witness.publicKeyPem),previous=byKey.get(keyId);
  if(previous)fail(previous.domain===witness.domain?'name_policy_duplicate_key':'name_policy_key_domain_conflict');
  byKey.set(keyId,{domain:witness.domain,key:crypto.createPublicKey(witness.publicKeyPem)});domains.add(witness.domain);
 }
 const n=domains.size,q=policy.threshold,f=policy.maxFaults;
 // Quorum intersection contains more than f domains, and f unavailable
 // domains still leave enough participants. Domains are administrator claims.
 if(n>32||!integer(q,2,n)||!integer(f,0,n-1)||2*q<=n+f||q>n-f)fail('name_policy_quorum_unsafe');
 const normalized={schema:POLICY,networkId:policy.networkId,chainId:policy.chainId,registryProgramId:policy.registryProgramId,threshold:q,maxFaults:f,roundMs:policy.roundMs,leaseMs:policy.leaseMs,maxFutureSkewMs:skew,validFrom:policy.validFrom,validUntil:policy.validUntil,witnesses:[...byKey].map(([keyId,v])=>({domain:v.domain,keyId})).sort((a,b)=>compare(a.domain,b.domain)||compare(a.keyId,b.keyId))};
 return {policy:normalized,id:hash(JSON.stringify(normalized)),byKey,domains};
}
export function namePolicyId(policy){return normalizePolicy(policy).id;}
export function validateNameWitnessPolicy(policy,{now=Date.now(),allowInactive=false}={}){
 const context=normalizePolicy(policy);
 if(typeof allowInactive!=='boolean')fail('name_policy_invalid');
 if(!time(now))fail('name_certificate_clock_invalid');
 if(!allowInactive)activePolicy(context.policy,now);
 return {...context.policy,witnesses:context.policy.witnesses.map(({domain,keyId})=>({domain,publicKeyPem:context.byKey.get(keyId).key.export({type:'spki',format:'pem'})}))};
}
export const validateNamePolicy=validateNameWitnessPolicy;
export function nameObservationSigningBytes(recordJson){
 if(typeof recordJson!=='string'||Buffer.byteLength(recordJson)>MAX_RECORD_BYTES)fail('name_observation_json_invalid');
 return Buffer.from(OBSERVATION+'\n'+recordJson);
}
function activePolicy(p,now){
 if(!time(now))fail('name_certificate_clock_invalid');
 if(now<p.validFrom||now>=p.validUntil)fail('name_policy_inactive');
}
function roundTimes(p,round){
 if(!integer(round))fail('name_observation_round_invalid');
 const start=round*p.roundMs,end=start+p.roundMs,expiresAt=Math.min(end+p.leaseMs,p.validUntil);
 if(!time(start)||!time(end)||!time(expiresAt)||expiresAt<=start)fail('name_observation_round_invalid');
 return {start,end,expiresAt};
}
const observationKeys=['schema','policyId','networkId','chainId','registryProgramId','purpose','name','antId','antProgramId','txId','round','slot','observedAt','issuedAt','expiresAt'];
function checkObservation(record,context,{name,purpose,round,now,mode}){
 const p=context.policy;
 if(!exact(record,observationKeys)||record.schema!==OBSERVATION||record.policyId!==context.id||record.networkId!==p.networkId||record.chainId!==p.chainId||record.registryProgramId!==p.registryProgramId)fail('name_observation_scope_mismatch');
 if(!nameOK(record.name)||record.name!==name||record.purpose!==purpose||!['current','prepared'].includes(record.purpose)||record.round!==round)fail('name_observation_context_mismatch');
 if(!base58(record.antId)||!base58(record.antProgramId)||!idOK(record.txId)||!integer(record.slot))fail('name_observation_binding_invalid');
 const window=roundTimes(p,record.round);
 if(!time(record.observedAt)||!time(record.issuedAt)||record.observedAt<window.start||record.observedAt>=window.end||record.issuedAt<record.observedAt||record.issuedAt>=window.end||record.observedAt<p.validFrom||record.issuedAt>=p.validUntil||record.expiresAt!==window.expiresAt)fail('name_observation_time_invalid');
 if(record.issuedAt>now+p.maxFutureSkewMs)fail('name_observation_from_future');
 if(mode==='current'&&now>=record.expiresAt)fail('name_certificate_expired');
 return record;
}
// Issuers must persist sign-once state before releasing a signature. This
// helper only constructs the canonical bytes; it does not implement issuance.
export function createNameObservation(policy,fields){
 const context=normalizePolicy(policy),p=context.policy;
 if(!exact(fields,['name','purpose','antId','antProgramId','txId','round','slot','observedAt','issuedAt']))fail('name_observation_fields_invalid');
 activePolicy(p,fields.issuedAt);
 const round=fields.round??Math.floor(fields.observedAt/p.roundMs),expiresAt=roundTimes(p,round).expiresAt;
 const record={schema:OBSERVATION,policyId:context.id,networkId:p.networkId,chainId:p.chainId,registryProgramId:p.registryProgramId,purpose:fields.purpose,name:fields.name,antId:fields.antId,antProgramId:fields.antProgramId,txId:fields.txId,round,slot:fields.slot,observedAt:fields.observedAt,issuedAt:fields.issuedAt,expiresAt};
 checkObservation(record,context,{name:fields.name,purpose:fields.purpose,round,now:fields.issuedAt,mode:'current'});
 return JSON.stringify(record);
}
const bindingOf=r=>({name:r.name,antId:r.antId,antProgramId:r.antProgramId,txId:r.txId});
const bindingKey=b=>JSON.stringify([b.name,b.antId,b.antProgramId,b.txId]);
function checkFloor(floor,context,name,purpose){
 if(floor===null||floor===undefined)return null;
 if(!exact(floor,['schema','policyId','name','purpose','round','binding','domains'])||floor.schema!==FLOOR||floor.policyId!==context.id||floor.name!==name||floor.purpose!==purpose||!integer(floor.round)||!exact(floor.binding,['name','antId','antProgramId','txId'])||floor.binding.name!==name||!base58(floor.binding.antId)||!base58(floor.binding.antProgramId)||!idOK(floor.binding.txId)||!floor.domains||typeof floor.domains!=='object'||Array.isArray(floor.domains))fail('name_certificate_floor_invalid');
 const domainRows=Object.entries(floor.domains);if(domainRows.length>context.domains.size)fail('name_certificate_floor_invalid');
 for(const [domain,row] of domainRows)if(!context.domains.has(domain)||!exact(row,['round','slot','recordHash'])||!integer(row.round,0,floor.round)||!integer(row.slot)||typeof row.recordHash!=='string'||!/^[a-f0-9]{64}$/.test(row.recordHash))fail('name_certificate_floor_invalid');
 return floor;
}
export function verifyNameCertificate(certificate,policy,{name,purpose='current',mode='current',now=Date.now(),floor=null}={}){
 const context=normalizePolicy(policy),p=context.policy;activePolicy(p,now);
 if(!nameOK(name)||!['current','prepared'].includes(purpose)||!['current','historical'].includes(mode))fail('name_certificate_request_invalid');
 if(!exact(certificate,['schema','round','observations'])||certificate.schema!==CERTIFICATE||!integer(certificate.round)||!Array.isArray(certificate.observations)||certificate.observations.length<1||certificate.observations.length>MAX_OBSERVATIONS)fail('name_certificate_invalid');
 floor=checkFloor(floor,context,name,purpose);
 const olderThanAccepted=Boolean(floor&&certificate.round<floor.round);
 if(olderThanAccepted&&mode!=='historical')fail('name_certificate_rollback');
 const byDomain=new Map(),discarded=new Map();
 for(const envelope of certificate.observations){
  if(!exact(envelope,['keyId','recordJson','signature'])||typeof envelope.keyId!=='string'||typeof envelope.recordJson!=='string'||Buffer.byteLength(envelope.recordJson)>MAX_RECORD_BYTES||typeof envelope.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature))fail('name_certificate_envelope_invalid');
  const signer=context.byKey.get(envelope.keyId);if(!signer)fail('name_certificate_untrusted_key');
  const signature=Buffer.from(envelope.signature,'base64url');
  if(signature.length!==64||signature.toString('base64url')!==envelope.signature||!crypto.verify(null,nameObservationSigningBytes(envelope.recordJson),signer.key,signature))fail('name_certificate_signature_invalid');
  let record;try{record=JSON.parse(envelope.recordJson);}catch{fail('name_observation_json_invalid');}
  checkObservation(record,context,{name,purpose,round:certificate.round,now,mode});
  const recordHash=hash(envelope.recordJson),domain=signer.domain,previous=byDomain.get(domain);
  if(previous&&previous.recordHash!==recordHash){discarded.set(domain,'equivocation');continue;}
  if(!previous)byDomain.set(domain,{domain,keyId:envelope.keyId,record,recordHash});
  const old=floor?.domains?.[domain];
  if(old&&!olderThanAccepted&&(record.round<old.round||record.slot<old.slot))discarded.set(domain,'rollback');
  if(old&&record.round===old.round&&recordHash!==old.recordHash)discarded.set(domain,'equivocation');
 }
 const groups=new Map();
 for(const [domain,row] of byDomain){
  if(discarded.has(domain))continue;
  const binding=bindingOf(row.record),key=bindingKey(binding);
  if(!groups.has(key))groups.set(key,{binding,rows:[]});groups.get(key).rows.push(row);
 }
 const qualified=[...groups.values()].filter(group=>group.rows.length>=p.threshold);
 if(qualified.length>1)fail('name_certificate_conflict');
 if(!qualified.length)fail(discarded.size?'name_certificate_quorum_rejected':'name_certificate_quorum_unmet');
 const winner=qualified[0],rows=winner.rows.sort((a,b)=>compare(a.domain,b.domain));
 if(floor&&certificate.round===floor.round&&bindingKey(winner.binding)!==bindingKey(floor.binding))fail('name_certificate_conflict');
 const domains=Object.assign(Object.create(null),floor?.domains||{});
 for(const row of rows)domains[row.domain]={round:row.record.round,slot:row.record.slot,recordHash:row.recordHash};
 const nextFloor=olderThanAccepted?floor:{schema:FLOOR,policyId:context.id,name,purpose,round:certificate.round,binding:winner.binding,domains};
 return {schema:'arns-mesh-name-certificate-result/v1',policyId:context.id,binding:winner.binding,round:certificate.round,domains:rows.map(row=>row.domain),witnessKeyIds:rows.map(row=>row.keyId),threshold:p.threshold,maxFaults:p.maxFaults,observedAt:Math.min(...rows.map(row=>row.record.observedAt)),issuedAt:Math.max(...rows.map(row=>row.record.issuedAt)),expiresAt:rows[0].record.expiresAt,historical:mode==='historical',olderThanAccepted,currentWindow:now>=certificate.round*p.roundMs&&now<rows[0].record.expiresAt,currentStateVerified:false,trustModel:'configured-independent-witnesses',nextFloor,discardedDomains:[...discarded].map(([domain,reason])=>({domain,reason}))};
}

export function verifyNameObservation(envelope,policy,{name,purpose='current',round,mode='current',now=Date.now()}={}){
 const context=normalizePolicy(policy);activePolicy(context.policy,now);
 if(!nameOK(name)||!['current','prepared'].includes(purpose)||!['current','historical'].includes(mode)||!integer(round))fail('name_certificate_request_invalid');
 if(!exact(envelope,['keyId','recordJson','signature'])||typeof envelope.keyId!=='string'||typeof envelope.recordJson!=='string'||Buffer.byteLength(envelope.recordJson)>MAX_RECORD_BYTES||typeof envelope.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature))fail('name_certificate_envelope_invalid');
 const signer=context.byKey.get(envelope.keyId);if(!signer)fail('name_certificate_untrusted_key');
 const signature=Buffer.from(envelope.signature,'base64url');
 if(signature.length!==64||signature.toString('base64url')!==envelope.signature||!crypto.verify(null,nameObservationSigningBytes(envelope.recordJson),signer.key,signature))fail('name_certificate_signature_invalid');
 let record;try{record=JSON.parse(envelope.recordJson);}catch{fail('name_observation_json_invalid');}
 checkObservation(record,context,{name,purpose,round,now,mode});
 return {record,domain:signer.domain,keyId:envelope.keyId,recordHash:hash(envelope.recordJson)};
}

