import {namePolicyId,validateNameWitnessPolicy,verifyNameObservation,verifyNameCertificate} from './name-certificates.mjs';

const ENVELOPE_BYTES=9216,RECORD_BYTES=4096;
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const compare=(a,b)=>a<b?-1:a>b?1:0;
function preflight(envelope){
 return envelope&&typeof envelope==='object'&&!Array.isArray(envelope)&&Object.keys(envelope).length===3
  &&typeof envelope.keyId==='string'&&/^[a-f0-9]{64}$/.test(envelope.keyId)
  &&typeof envelope.signature==='string'&&/^[A-Za-z0-9_-]{86}$/.test(envelope.signature)
  &&typeof envelope.recordJson==='string'&&Buffer.byteLength(envelope.recordJson)<=RECORD_BYTES;
}
function merge(rows,vote){
 const existing=rows.get(vote.domain)||[];
 if(existing.some(row=>row.recordHash===vote.recordHash))return 'duplicate';
 // The first two different authenticated records establish equivocation.
 // Additional permutations cannot hide it or grow this domain's allocation.
 if(existing.length>=2)return 'equivocation-bounded';
 rows.set(vote.domain,[...existing,vote]);return 'added';
}
function certificate(round,rows){
 return {schema:'arns-mesh-name-certificate/v1',round,observations:[...rows].sort(([a],[b])=>compare(a,b)).flatMap(([,votes])=>votes.map(vote=>({...vote.envelope})))};
}
function cloneRows(rows){return new Map([...rows].map(([domain,votes])=>[domain,[...votes]]));}
const harmlessMiss=new Set(['name_certificate_quorum_unmet','name_certificate_quorum_rejected','name_certificate_expired','name_certificate_rollback']);
const contradiction=new Set(['name_certificate_quorum_rejected','name_certificate_conflict']);

// This collector accepts evidence, never a courier's claimed authority.
// All limits apply to retained state; each add call has a separate bounded batch.
// The transport must independently bound response size, courier count and time.
export class NameCertificateCollector{
 constructor({policy,name,purpose='current',mode='current',now=()=>Date.now(),maxRounds,maxCertificates=4,maxBatch=64}={}){
  this.policySource=typeof policy==='function'?policy:()=>policy;
  this.clock=typeof now==='function'?now:()=>now;this.name=name;this.purpose=purpose;this.mode=mode;
  if(typeof name!=='string'||!/^[a-z0-9_-]{1,255}$/.test(name)||!['current','prepared'].includes(purpose)||!['current','historical'].includes(mode))fail('name_certificate_collector_request_invalid');
  const normalized=validateNameWitnessPolicy(this.policySource(),{now:this.clock()});
  this.policyId=namePolicyId(normalized);this.domainCount=new Set(normalized.witnesses.map(w=>w.domain)).size;
  maxRounds??=4*this.domainCount;
  if(!integer(maxRounds,2*this.domainCount,256)||!integer(maxCertificates,1,8)||!integer(maxBatch,1,64))fail('name_certificate_collector_limits');
  this.maxRounds=maxRounds;this.roundsPerDomain=Math.min(8,Math.floor(maxRounds/this.domainCount));
  this.maxCertificates=maxCertificates;this.maxBatch=maxBatch;
  this.maxVotes=2*this.domainCount*this.roundsPerDomain+2*this.domainCount*maxCertificates;
  this.maxBytes=this.maxVotes*ENVELOPE_BYTES;
  this.partial=new Map();this.certified=new Map();
 }
 context(now){
  const policy=validateNameWitnessPolicy(this.policySource(),{now});
  if(namePolicyId(policy)!==this.policyId)fail('name_certificate_policy_changed');
  return policy;
 }
 rowsFor(round){
  const rows=cloneRows(this.certified.get(round)?.rows||new Map());
  for(const [domain,rounds] of this.partial)for(const vote of rounds.get(round)||[])merge(rows,vote);
  return rows;
 }
 add(envelopes,{mode=this.mode,now=this.clock()}={}){
  const policy=this.context(now);
  if(!['current','historical'].includes(mode))fail('name_certificate_collector_request_invalid');
  if(!Array.isArray(envelopes)||envelopes.length>this.maxBatch)fail('name_certificate_batch_limit');
  const result={received:envelopes.length,authenticated:0,added:0,duplicates:0,rejected:0,bounded:0,errors:[]},touched=new Set();
  const rejected=code=>{result.rejected++;if(result.errors.length<8)result.errors.push(code);};
  for(const envelope of envelopes){
   if(!preflight(envelope)){rejected('name_certificate_envelope_invalid');continue;}
   let round,checked;
   try{
    round=JSON.parse(envelope.recordJson)?.round;
    checked=verifyNameObservation(envelope,policy,{name:this.name,purpose:this.purpose,round,mode,now});
   }catch(error){rejected(String(error.code||error.message).slice(0,100));continue;}
   result.authenticated++;
   const vote={domain:checked.domain,recordHash:checked.recordHash,envelope:Object.freeze({keyId:envelope.keyId,recordJson:envelope.recordJson,signature:envelope.signature})};
   // First merge new evidence into a retained certificate for this round.
   // Thus later equivocation cannot be concealed by returning an older cached
   // quorum that no longer has enough non-equivocating domains.
   const known=this.certified.get(round);if(known)merge(known.rows,vote);
   let rounds=this.partial.get(vote.domain);if(!rounds){rounds=new Map();this.partial.set(vote.domain,rounds);}
   const holder=new Map([[vote.domain,rounds.get(round)||[]]]),outcome=merge(holder,vote);
   rounds.set(round,holder.get(vote.domain));touched.add(round);
   if(outcome==='added')result.added++;else if(outcome==='duplicate')result.duplicates++;else result.bounded++;
   // Admission is per authenticated domain. One bad domain's round flood can
   // only evict its own partial votes, never another operator's allocation.
   for(const stale of [...rounds.keys()].sort((a,b)=>b-a).slice(this.roundsPerDomain))rounds.delete(stale);
  }
  for(const round of touched){
   const rows=this.rowsFor(round);if(!rows.size)continue;
   try{
    const proof=certificate(round,rows);
    verifyNameCertificate(proof,policy,{name:this.name,purpose:this.purpose,mode,now});
    this.certified.set(round,{rows});
   }catch(error){
    // A partial or conflicting update does not erase prior evidence. best()
    // rechecks the retained union and fails closed if new equivocation removed
    // its quorum. A later honest vote may restore a sufficient quorum.
    if(!harmlessMiss.has(error.code))throw error;
   }
  }
  // Only authenticated full certificates can consume or evict this cache.
  for(const stale of [...this.certified.keys()].sort((a,b)=>b-a).slice(this.maxCertificates))this.certified.delete(stale);
  return {...result,...this.stats()};
 }
 addCertificate(value,options={}){
  if(!value||value.schema!=='arns-mesh-name-certificate/v1'||!Number.isSafeInteger(value.round)||value.round<0||!Array.isArray(value.observations))fail('name_certificate_invalid');
  // Routing wrappers do not authorize a round; each signed record is checked.
  return this.add(value.observations,options);
 }
 certificates({floor=null,mode=this.mode,now=this.clock(),limit=this.maxCertificates}={}){
  const policy=this.context(now);
  if(!['current','historical'].includes(mode)||!integer(limit,1,this.maxCertificates))fail('name_certificate_collector_request_invalid');
  const rounds=new Set(this.certified.keys());for(const values of this.partial.values())for(const round of values.keys())rounds.add(round);
  const results=[];
  for(const round of [...rounds].sort((a,b)=>b-a)){
   const rows=this.rowsFor(round);if(!rows.size)continue;
   try{
    const proof=certificate(round,rows),verification=verifyNameCertificate(proof,policy,{name:this.name,purpose:this.purpose,mode,now,floor});
    results.push({certificate:proof,verification});if(results.length>=limit)break;
   }catch(error){
    // A formerly certified latest round invalidated by authenticated evidence
    // must not silently turn into an older answer. A newer valid certificate
    // may supersede it, and pending rounds never suppress the last good one.
    if(this.certified.has(round)&&contradiction.has(error.code)&&!results.length)throw error;
    if(!harmlessMiss.has(error.code))throw error;
   }
  }
  return results;
 }
 best(options={}){
  const result=this.certificates({...options,limit:1})[0];
  return result||null;
 }
 stats(){
  const rounds=new Set();let votes=0,bytes=0;
  const count=rows=>{for(const group of rows.values())for(const vote of group){votes++;bytes+=Buffer.byteLength(JSON.stringify(vote.envelope));}};
  for(const [domain,values] of this.partial)for(const [round,group] of values){rounds.add(round);count(new Map([[domain,group]]));}
  for(const [round,row] of this.certified){rounds.add(round);count(row.rows);}
  return {partialDomains:this.partial.size,retainedRounds:rounds.size,retainedCertificates:this.certified.size,retainedVotes:votes,retainedBytes:bytes,maxRounds:this.maxRounds+this.maxCertificates,maxVotes:this.maxVotes,maxBytes:this.maxBytes};
 }
}

