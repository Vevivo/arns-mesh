import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {NameCertificateService} from '../src/name-certificate-service.mjs';
import {CertifiedNameStore,initialCertificateState} from '../src/name-certificate-state.mjs';
import {createNameObservation,nameObservationSigningBytes,witnessKeyId,namePolicyId,verifyNameCertificate} from '../src/name-certificates.mjs';

const BASE=1800000000000,ROUND_MS=60000,PROGRAM='11111111111111111111111111111111';
const copy=value=>JSON.parse(JSON.stringify(value));
class MemoryDriver{
 constructor(initial){this.state=copy(initial);}
 transaction(work){const result=work(copy(this.state));if(result.state!==undefined)this.state=copy(result.state);return result.value;}
}
function fixture({count=4,threshold=3,maxFaults=1,padRecords=false}={}){
 const keys=Array.from({length:count},()=>crypto.generateKeyPairSync('ed25519'));
 const witnesses=keys.map((key,index)=>({domain:'simulated-'+index,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'advertisement-tests',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:PROGRAM,threshold,maxFaults,roundMs:ROUND_MS,leaseMs:120000,maxFutureSkewMs:1000,validFrom:BASE-3600000,validUntil:BASE+3600000,witnesses};
 let clock=BASE+30000;
 const round=Math.floor(BASE/ROUND_MS);
 function vote(index,atRound=round,{padded=padRecords}={}){
  let recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:PROGRAM,antProgramId:PROGRAM,txId:'A'.repeat(43),round:atRound,slot:100+atRound-round,observedAt:atRound*ROUND_MS+1000,issuedAt:atRound*ROUND_MS+1010});
  if(padded){recordJson=recordJson.replace('"alpha"','"\\u0061lpha"');recordJson+='\t'.repeat(4096-Buffer.byteLength(recordJson));}
  return {keyId:witnessKeyId(witnesses[index].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[index].privateKey).toString('base64url')};
 }
 const certificate=(atRound,options)=>({schema:'arns-mesh-name-certificate/v1',round:atRound,observations:Array.from({length:threshold},(_,i)=>vote(i,atRound,options))});
 const driver=new MemoryDriver(initialCertificateState(policy)),store=new CertifiedNameStore({policy,driver,maxNames:1,maxVersions:8,now:()=>clock});
 return {policy,round,vote,certificate,store,now:()=>clock,setRound:value=>{clock=value*ROUND_MS+30000;},request:{op:'name-certificates',name:'alpha',policyId:namePolicyId(policy),historical:true}};
}

test('retained prepared proofs and newest versions remain advertised when actual store exceeds eight versions',async()=>{
 const f=fixture(),owners=['site','replica','site-update','replica-update'];
 for(let i=0;i<14;i++){
  f.setRound(f.round+i);
  const accepted=await f.store.accept(f.certificate(f.round+i),{name:'alpha',mode:'current'});
  if(i<owners.length)f.store.retain('alpha',{hash:accepted.hash,owner:owners[i]});
 }
 assert.equal(f.store.export('alpha').length,12,'four retained versions coexist with eight newest versions');
 const service=new NameCertificateService({policy:f.policy,store:f.store,now:f.now});
 const reply=await service.reply(f.request);
 assert.equal(reply.certificates.length,8);
 assert.deepEqual(reply.certificates.map(c=>c.round),[0,1,2,3,13,12,11,10].map(i=>f.round+i));
 for(const certificate of reply.certificates){
  const verified=verifyNameCertificate(certificate,f.policy,{name:'alpha',mode:'historical',now:f.now()});
  assert.equal(verified.domains.length,3);
 }
 assert.deepEqual(reply.observations,[]);
 assert.equal(f.store.export('alpha').length,12,'wire selection never deletes retained local evidence');
 assert(Buffer.byteLength(JSON.stringify(reply))<=512*1024);
});

test('current advertisement reserves one issuer vote without splitting any full 32-domain certificate',async()=>{
 const f=fixture({count:32,threshold:32,maxFaults:0});
 f.setRound(f.round+3);
 const originals=[0,1,2,3].map(i=>f.certificate(f.round+i));
 const service=new NameCertificateService({policy:f.policy,store:{export:()=>originals},signer:{issue:async()=>f.vote(0,f.round+3)},now:f.now});
 const historical=await service.reply(f.request);
 assert.equal(historical.certificates.length,4);
 assert.equal(historical.certificates.reduce((sum,c)=>sum+c.observations.length,0),128);
 const current=await service.reply({...f.request,historical:false});
 assert.equal(current.observations.length,1);
 assert.equal(current.certificates.length,3);
 assert.equal(current.certificates.reduce((sum,c)=>sum+c.observations.length,current.observations.length),97);
 for(const certificate of current.certificates){
  assert.equal(certificate.observations.length,32);
  verifyNameCertificate(certificate,f.policy,{name:'alpha',mode:'historical',now:f.now()});
 }
 assert.deepEqual(current.certificates,originals.slice(0,3),'selection preserves complete original signed certificates');
});

test('legacy export-only stores with more than eight valid versions return a bounded complete subset',async()=>{
 const f=fixture();f.setRound(f.round+11);
 const originals=Array.from({length:12},(_,i)=>f.certificate(f.round+11-i));
 const service=new NameCertificateService({policy:f.policy,store:{export:()=>originals},now:f.now});
 const reply=await service.reply(f.request);
 assert.deepEqual(reply.certificates,originals.slice(0,8));
 assert.equal(reply.certificates.reduce((sum,c)=>sum+c.observations.length,0),24);
});

test('advertisement selection cannot hide an invalid locally retained certificate',async()=>{
 const f=fixture(),bad=f.certificate(f.round);
 bad.observations[0].signature=(bad.observations[0].signature[0]==='A'?'B':'A')+bad.observations[0].signature.slice(1);
 const service=new NameCertificateService({policy:f.policy,store:{export:()=>[],advertised:()=>[bad]},now:f.now});
 await assert.rejects(service.reply(f.request),/name_observation|signature|quorum/);
});

test('outer transport budget includes repeated JSON escaping and skips oversized optional history whole',async()=>{
 const f=fixture({count:32,threshold:32,maxFaults:0,padRecords:true});f.setRound(f.round+2);
 const originals=[f.certificate(f.round),f.certificate(f.round+1),f.certificate(f.round+2,{padded:false})];
 const route=crypto.generateKeyPairSync('ed25519');
 const outer=value=>{
  const recordJson=JSON.stringify(value);
  return {ok:true,witnessPeerId:'a'.repeat(64),witnessPublicKeyPem:route.publicKey.export({type:'spki',format:'pem'}),recordJson,signature:crypto.sign(null,Buffer.from(recordJson),route.privateKey).toString('base64url')};
 };
 const unbounded={schema:'arns-mesh-name-certificate-reply/v1',name:'alpha',policyId:namePolicyId(f.policy),observations:[],certificates:originals.slice(0,2)};
 assert(Buffer.byteLength(JSON.stringify(unbounded))<512*1024,'an inner-only limit would accept this reply');
 assert(Buffer.byteLength(JSON.stringify(outer(unbounded)))>512*1024,'the actual second serialization exceeds the transport limit');
 for(const certificate of originals)verifyNameCertificate(certificate,f.policy,{name:'alpha',mode:'historical',now:f.now()});
 const service=new NameCertificateService({policy:f.policy,store:{export:()=>originals},signer:{issue:async()=>f.vote(0,f.round+2)},now:f.now});
 for(const historical of [true,false]){
  const reply=await service.reply({...f.request,historical});
  assert.deepEqual(reply.certificates,[originals[0],originals[2]],'skip the oversized older candidate while retaining a complete newer proof');
  assert.equal(reply.observations.length,historical?0:1);
  const envelope=outer(reply),bytes=Buffer.byteLength(JSON.stringify(envelope));
  assert(bytes>256*1024&&bytes+1<=512*1024,'both HTTP body and DHT newline frame fit: '+bytes);
  assert(crypto.verify(null,Buffer.from(envelope.recordJson),route.publicKey,Buffer.from(envelope.signature,'base64url')));
  for(const certificate of JSON.parse(envelope.recordJson).certificates)assert.equal(certificate.observations.length,32);
 }
});

