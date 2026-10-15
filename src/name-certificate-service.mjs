import {namePolicyId,validateNameWitnessPolicy,verifyNameCertificate,verifyNameObservation} from './name-certificates.mjs';
import {validArName} from './swarm-common.mjs';

const MAX_CERTIFICATES=8,MAX_OBSERVATIONS=128,MAX_REPLY_BYTES=512*1024,SIGNER_TIMEOUT_MS=7000;
const fail=message=>{throw new Error(message);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function checkedTime(now){const value=now();if(!Number.isSafeInteger(value)||value<0)fail('name_certificate_service_time_invalid');return value;}
function checkedName(name){if(typeof name!=='string'||!validArName(name)||name!==name.toLowerCase())fail('name_certificate_service_name_invalid');return name;}
function estimatedEnvelopeBytes(value){
 // MeshPeer._envelope serializes this reply into recordJson, then the transport
 // serializes that outer envelope again. Include its escaping and a generous
 // allowance for Ed25519 identity, signature, field names and DHT newline.
 return Buffer.byteLength(JSON.stringify({recordJson:JSON.stringify(value)}),'utf8')+8192;
}
function assertBounded(value,certificates,observations,{wire=false}={}){
 if(certificates.length>MAX_CERTIFICATES||observations.length>MAX_OBSERVATIONS)fail('name_certificate_reply_limit_exceeded');
 let count=observations.length;
 for(const certificate of certificates){
  if(!plain(certificate)||!Array.isArray(certificate.observations))fail('name_certificate_reply_certificate_invalid');
  count+=certificate.observations.length;
  if(count>MAX_OBSERVATIONS)fail('name_certificate_reply_limit_exceeded');
 }
 let serialized;
 try{serialized=JSON.stringify(value);}catch{fail('name_certificate_reply_encoding_invalid');}
 if(typeof serialized!=='string'||Buffer.byteLength(serialized,'utf8')>MAX_REPLY_BYTES)fail('name_certificate_reply_limit_exceeded');
 if(wire&&estimatedEnvelopeBytes(value)>MAX_REPLY_BYTES)fail('name_certificate_reply_limit_exceeded');
}
function snapshot(value){
 let serialized;
 try{serialized=JSON.stringify(value);}catch{fail('name_certificate_reply_encoding_invalid');}
 if(typeof serialized!=='string'||Buffer.byteLength(serialized,'utf8')>MAX_REPLY_BYTES)fail('name_certificate_reply_limit_exceeded');
 return JSON.parse(serialized);
}
async function boundedIssue(signer,name,signal){
 signal?.throwIfAborted();
 const controller=new AbortController();
 const aborted=()=>controller.abort(signal.reason);
 if(signal)signal.addEventListener('abort',aborted,{once:true});
 const timer=setTimeout(()=>controller.abort(new DOMException('Name certificate signer deadline exceeded','TimeoutError')),SIGNER_TIMEOUT_MS);
 let removeAbort;
 const abortPromise=new Promise((resolve,reject)=>{
  const onAbort=()=>reject(controller.signal.reason);
  removeAbort=()=>controller.signal.removeEventListener('abort',onAbort);
  controller.signal.addEventListener('abort',onAbort,{once:true});
 });
 try{
  return await Promise.race([Promise.resolve().then(()=>{controller.signal.throwIfAborted();return signer.issue(name,{signal:controller.signal});}),abortPromise]);
 }finally{
  clearTimeout(timer);removeAbort();
  if(signal)signal.removeEventListener('abort',aborted);
 }
}

export class NameCertificateService{
 constructor({policy,signer=null,store,collect=null,now=Date.now}={}){
  if(typeof now!=='function'||!store||typeof store.export!=='function'||(signer!==null&&typeof signer?.issue!=='function')||(collect!==null&&typeof collect!=='function'))fail('name_certificate_service_configuration_invalid');
  this.policy=policy;this.signer=signer;this.store=store;this.collect=collect;this.now=now;
  this.policyId=namePolicyId(policy);
  validateNameWitnessPolicy(policy,{now:checkedTime(now)});
 }
 _active(){
  const now=checkedTime(this.now);
  validateNameWitnessPolicy(this.policy,{now});
  if(namePolicyId(this.policy)!==this.policyId)fail('name_certificate_service_policy_changed');
  return now;
 }
 _certificates(name,{reserveObservation=false}={}){
  // Retention can legitimately keep more versions than fit in one reply.
  // The store orders complete prepared proofs first, then the newest versions.
  const candidates=typeof this.store.advertised==='function'?this.store.advertised(name):this.store.export(name);
  if(!Array.isArray(candidates)||candidates.length>64)fail('name_certificate_reply_certificates_invalid');
  const certificates=[],seen=new Set(),now=this._active();
  let observationCount=reserveObservation?1:0;
  for(const value of candidates){
   const certificate=snapshot(value);
   assertBounded({certificates:[certificate]},[certificate],[]);
   verifyNameCertificate(certificate,this.policy,{name,purpose:'current',mode:'historical',now});
   const encoded=JSON.stringify(certificate);
   if(seen.has(encoded))continue;seen.add(encoded);
   if(certificates.length>=MAX_CERTIFICATES||observationCount+certificate.observations.length>MAX_OBSERVATIONS)continue;
   const prospective={schema:'arns-mesh-name-certificate-reply/v1',name,policyId:this.policyId,observations:[],certificates:[...certificates,certificate]};
   // Reserve the issuer's full bounded envelope after both JSON encodings.
   // Optional history that does not fit is skipped whole; quorum is never cut.
   if(estimatedEnvelopeBytes(prospective)+(reserveObservation?32768:0)>MAX_REPLY_BYTES)continue;
   certificates.push(certificate);observationCount+=certificate.observations.length;
  }
  return certificates;
 }
 _reply(name,observations,certificates){
  this._active();
  const result={schema:'arns-mesh-name-certificate-reply/v1',name,policyId:this.policyId,observations,certificates};
  assertBounded(result,certificates,observations,{wire:true});
  return result;
 }
 async reply(req,{signal}={}){
  signal?.throwIfAborted();this._active();
  if(!plain(req)||req.op!=='name-certificates'||typeof req.historical!=='boolean'||Object.keys(req).some(key=>!['op','name','policyId','historical'].includes(key)))fail('name_certificate_request_invalid');
  const name=checkedName(req.name);
  if(req.policyId!==this.policyId)fail('name_certificate_request_policy_mismatch');
  const certificates=this._certificates(name,{reserveObservation:!req.historical&&!!this.signer});
  if(req.historical||!this.signer)return this._reply(name,[],certificates);
  let issued;
  try{issued=await boundedIssue(this.signer,name,signal);}
  catch(error){
   signal?.throwIfAborted();this._active();
   if(!certificates.length)throw error;
   return this._reply(name,[],certificates);
  }
  signal?.throwIfAborted();const now=this._active();
  const observation=snapshot(issued);
  if(!plain(observation)||typeof observation.recordJson!=='string')fail('name_certificate_reply_observation_invalid');
  let record;try{record=JSON.parse(observation.recordJson);}catch{fail('name_certificate_reply_observation_invalid');}
  if(!plain(record))fail('name_certificate_reply_observation_invalid');
  verifyNameObservation(observation,this.policy,{name,purpose:'current',round:record.round,now,mode:'current'});
  return this._reply(name,[observation],certificates);
 }
 async refresh(name,{signal}={}){
  signal?.throwIfAborted();this._active();checkedName(name);
  if(!this.collect||typeof this.store.accept!=='function'||typeof this.store.floor!=='function')fail('name_certificate_refresh_unavailable');
  const collected=await this.collect({name,mode:'current',floor:this.store.floor(name),signal});
  signal?.throwIfAborted();this._active();
  if(collected===null)return null;
  if(!plain(collected)||!plain(collected.certificate))fail('name_certificate_refresh_result_invalid');
  const certificate=snapshot(collected.certificate);
  assertBounded({certificates:[certificate]},[certificate],[]);
  // The store verifies actual quorum and rollback floors, then persists.
  // Never advertise the collector's result or its untrusted verification field.
  const accepted=await this.store.accept(certificate,{name,mode:'current'});
  signal?.throwIfAborted();this._active();
  return accepted;
 }
}
