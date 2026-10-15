import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export const NOW=Date.parse('2026-10-15T12:00:00Z');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
export const keys=Array.from({length:4},(_,i)=>{const{privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const publicKeyPem=publicKey.export({type:'spki',format:'pem'}).toString();return{privateKey,publicKeyPem,keyId:hash(publicKeyPem),domain:'operator-'+i};});
export function policy(){return{schema:'arns-mesh-name-policy/v1',networkId:'mesh-test',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:'11111111111111111111111111111111',threshold:3,maxFaults:1,roundMs:60000,leaseMs:0,maxFutureSkewMs:1000,validFrom:NOW-600000,validUntil:NOW+600000,witnesses:keys.map(({publicKeyPem,domain})=>({publicKeyPem,domain}))};}
export function namePolicyId(p){if(p.revoked)throw new Error('name_policy_revoked');return hash(JSON.stringify(p));}
export function validateNameWitnessPolicy(p,{now=NOW,allowInactive=false}={}){if(p.revoked)throw new Error('name_policy_revoked');if(!allowInactive&&(now<p.validFrom||now>=p.validUntil))throw new Error('name_policy_inactive');return p;}
export function vote(p,{name='vevivo',index=0,round=Math.floor(NOW/60000),purpose='current',extra={}}={}){
 const recordJson=JSON.stringify({name,policyId:namePolicyId(p),purpose,round,txId:'A'.repeat(43),observedAt:NOW,...extra});
 return{keyId:keys[index].keyId,recordJson,signature:crypto.sign(null,Buffer.from(recordJson),keys[index].privateKey).toString('base64url')};
}
export function verifyNameObservation(v,p,{name,purpose='current',round,now=NOW,mode='current'}={}){
 validateNameWitnessPolicy(p,{now});const record=JSON.parse(v.recordJson);
 assert.equal(record.name,name,'vote name scope');assert.equal(record.policyId,namePolicyId(p),'vote policy scope');assert.equal(record.purpose,purpose,'vote purpose scope');assert.equal(record.round,round,'vote round scope');
 if(mode==='current')assert.equal(round,Math.floor(now/p.roundMs),'vote fresh round');
 const key=keys.find(k=>k.keyId===v.keyId&&p.witnesses.some(w=>w.domain===k.domain&&w.publicKeyPem===k.publicKeyPem));assert.ok(key,'known witness');
 assert.ok(crypto.verify(null,Buffer.from(v.recordJson),key.publicKeyPem,Buffer.from(v.signature,'base64url')),'valid Ed25519 signature');
 return{record,domain:key.domain,keyId:key.keyId,recordHash:hash(v.recordJson)};
}
export function certificate(p,{name='vevivo',round=Math.floor(NOW/60000),count=3}={}){return{schema:'arns-mesh-name-certificate/v1',round,observations:Array.from({length:count},(_,index)=>vote(p,{name,index,round}))};}
export function verifyNameCertificate(c,p,{name,purpose='current',mode='current',now=NOW}={}){
 assert.equal(c.schema,'arns-mesh-name-certificate/v1');
 const verified=c.observations.map(v=>verifyNameObservation(v,p,{name,purpose,round:c.round,mode,now}));
 assert.ok(new Set(verified.map(v=>v.domain)).size>=p.threshold,'actual independent quorum');
 return{round:c.round,name,txId:'A'.repeat(43),policyId:namePolicyId(p)};
}
export class Store{
 constructor(p,{certificates=[],now=()=>NOW,persistFailure=false}={}){this.policy=p;this.certificates=certificates;this.now=now;this.persistFailure=persistFailure;this.acceptCalls=0;this.exportCalls=0;}
 export(name){this.exportCalls++;return this.certificates;}
 floor(name){return{round:this.certificates[0]?.round??-1};}
 async accept(c,{name,mode}){this.acceptCalls++;const verification=verifyNameCertificate(c,this.policy,{name,mode,now:this.now()});if(this.persistFailure)throw new Error('disk-write-failed');this.certificates=[c];return{certificate:c,hash:hash(JSON.stringify(c)),verification};}
}
