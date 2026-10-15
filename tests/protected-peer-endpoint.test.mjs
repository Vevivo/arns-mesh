import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {namePolicyId,witnessKeyId,createNameObservation,nameObservationSigningBytes,verifyNameCertificate,verifyNameObservation,validateNameWitnessPolicy} from '../src/name-certificates.mjs';
import {CertifiedNameStore,initialCertificateState} from '../src/name-certificate-state.mjs';
import {NameCertificateService} from '../src/name-certificate-service.mjs';
import {setProtectedContext,resetEffects,effects,dispatchDirect} from './helpers/protected-peer-fixture.mjs';

// Execute actual endpoint methods with network/filesystem adapters only.
// Certificate parsing, signatures, quorum, floors and store logic are real.
const adapterUrl=new URL('./helpers/protected-peer-fixture.mjs',import.meta.url).href;
const certificateUrl=new URL('../src/name-certificates.mjs',import.meta.url).href;
async function loadAdapted(file,{embedded=false}={}){
 const text=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 const source=text.replace(/from (['"])([^'"]+)\1/g,(all,q,specifier)=>{
  if(['node:crypto','node:path','node:net'].includes(specifier))return all;
  if(embedded&&specifier.endsWith('/name-certificates.mjs'))return'from '+JSON.stringify(certificateUrl);
  return'from '+JSON.stringify(adapterUrl);
 });
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const {MeshPeer}=await loadAdapted('../apps/peer/embedded-peer.mjs',{embedded:true});
const {startDirectPeerServer}=await loadAdapted('../src/direct-peer.mjs');
const {requestIpJson}=await loadAdapted('../src/ip-transport.mjs');
const NOW=Math.floor(Date.now()/60000)*60000+1000,ADDRESS='11111111111111111111111111111111',TX='A'.repeat(43);
const keys=Array.from({length:4},()=>{const{privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const publicKeyPem=publicKey.export({type:'spki',format:'pem'}).toString();return{privateKey,publicKeyPem,keyId:witnessKeyId(publicKeyPem)};});
function makePolicy(){return{schema:'arns-mesh-name-policy/v1',networkId:'test-network',chainId:'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',registryProgramId:ADDRESS,threshold:3,maxFaults:1,roundMs:60000,leaseMs:0,maxFutureSkewMs:30000,validFrom:NOW-600000,validUntil:NOW+600000,witnesses:keys.map((key,i)=>({domain:'operator-'+i,publicKeyPem:key.publicKeyPem}))};}
function makeCertificate(policy,{name='vevivo',txId=TX,count=4,observedAt=NOW}={}){
 const round=Math.floor(observedAt/policy.roundMs);
 return{schema:'arns-mesh-name-certificate/v1',round,observations:keys.slice(0,count).map(key=>{
  const recordJson=createNameObservation(policy,{name,purpose:'current',antId:ADDRESS,antProgramId:ADDRESS,txId,round,slot:100,observedAt,issuedAt:observedAt});
  return{keyId:key.keyId,recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),key.privateKey).toString('base64url')};
 })};
}
class MemoryDriver{
 constructor(policy){this.state=initialCertificateState(policy);this.fail=false;}
 transaction(work){const result=work(structuredClone(this.state));if(result.state){if(this.fail)throw new Error('persistence failed');this.state=structuredClone(result.state);effects.push({type:'persist-certificate'});}return result.value;}
}
function fixture(t,{signer=null,collect=null}={}){
 resetEffects();let time=NOW;t.mock.method(Date,'now',()=>time);
 const policy=makePolicy(),driver=new MemoryDriver(policy),store=new CertifiedNameStore({policy,driver,now:()=>time});
 const context={policy,policyId:namePolicyId(policy),store,assertCurrent(){validateNameWitnessPolicy(policy,{now:time});},verifySnapshot(snapshot,{name,mode}){
  const verification=verifyNameCertificate(snapshot.provenance.certificate,policy,{name,mode,now:time});
  for(const field of ['name','antId','txId'])assert.equal(snapshot[field],verification.binding[field],'snapshot binding');
  effects.push({type:'verify-snapshot'});return{certificate:snapshot.provenance.certificate,verification,snapshot};
 }};
 context.service=new NameCertificateService({policy,signer,store,collect,now:()=>time});
 setProtectedContext(context);t.after(()=>setProtectedContext(null));
 const peer=Object.create(MeshPeer.prototype);
 Object.assign(peer,{cache:{records:{},locations:{},proofs:{}},cacheFile:'memory-only-cache.json',allowRemoteFetch:false,swarm:null,requestsServed:0,contentChunksServed:0,contentBytesServed:0,identity:{test:true},locationIndex:{get(){return null;}},contentStore:{async put(){effects.push({type:'put-content'});},chunk(dataId){return{dataId,data:'AA=='};}},_envelope(record){return{ok:true,recordJson:JSON.stringify(record),testOuterEnvelope:true};},async _announceTopic(){effects.push({type:'announce'});},status(){return{names:Object.keys(this.cache.records)};}});
 return{policy,driver,store,context,peer,setTime:value=>{time=value;},request:{op:'name-certificates',name:'vevivo',policyId:context.policyId,historical:false}};
}
function bundle(certificate){return{schema:'arns-mesh-verified-share/v1',name:'vevivo',record:{name:'vevivo',antId:ADDRESS,txId:TX,observedAt:'2099-01-01T00:00:00.000Z',expiresAt:'2099-01-02T00:00:00.000Z'},content:{rootDataId:TX,dataId:TX,signatureVerified:true},nameCertificate:certificate,items:[{dataId:TX,rawItem:Buffer.from('fixture for unchanged content verifier')}]};}

test('protected peer wraps original current witness vote and never collects inbound',async t=>{
 const x=fixture(t);let collected=0;const certificate=makeCertificate(x.policy),original=certificate.observations[0];
 x.context.service=new NameCertificateService({policy:x.policy,store:x.store,signer:{issue:async()=>original},collect:async()=>{collected++;throw new Error('unexpected collection');},now:()=>NOW});
 const response=await x.peer._handleAsync({...x.request,requestId:'outer-routing-field'});
 assert.equal(response.testOuterEnvelope,true);const record=JSON.parse(response.recordJson);
 assert.deepEqual(record.observations,[original]);assert.equal(collected,0);
 verifyNameObservation(original,x.policy,{name:'vevivo',round:certificate.round,now:NOW});
});

test('protected peer history returns original full certificate without re-signing',async t=>{
 const x=fixture(t),certificate=makeCertificate(x.policy);await x.store.accept(certificate,{name:'vevivo'});
 const original=x.store.export('vevivo');x.setTime(NOW+60000);
 x.context.service.signer={issue:async()=>{throw new Error('history must not sign');}};
 const response=await x.peer._handleAsync({...x.request,historical:true});
 const record=JSON.parse(response.recordJson);assert.deepEqual(record.certificates,original);assert.deepEqual(record.observations,[]);
 verifyNameCertificate(record.certificates[0],x.policy,{name:'vevivo',mode:'historical',now:NOW+60000});
});

test('protected peer refuses all legacy name-publication paths',t=>{
 const x=fixture(t);x.peer.cache.records.vevivo={expiresAt:'2099-01-01'};
 for(const op of ['resolve','snapshot','snapshots','ant-proof','chain-proof','proof'])assert.deepEqual(x.peer._handle({op,name:'vevivo'}),{ok:false,error:'name_certificate_required'});
});

test('protected content and location paths still serve existing data',t=>{
 const x=fixture(t);const content=x.peer._handle({op:'content',dataId:TX,offset:0});assert.equal(content.ok,true);
 x.peer.cache.locations[TX]={bundleId:'B'.repeat(43),dataId:TX};
 const location=x.peer._handle({op:'location',dataId:TX});assert.equal(location.ok,true);assert.equal(JSON.parse(location.recordJson).dataId,TX);
});

test('ingest requires full quorum before publication or content writes',async t=>{
 const x=fixture(t),missing=bundle(null);await assert.rejects(()=>x.peer.ingest(missing),/name_certificate_required/);
 await assert.rejects(()=>x.peer.ingest(bundle(makeCertificate(x.policy,{count:1}))),/quorum_unmet/);
 assert.deepEqual(x.peer.cache.records,{});assert.equal(effects.length,0);
});

test('ingest rejects wrong name, root ID, ANT binding and expired certificate',async t=>{
 const x=fixture(t);await assert.rejects(()=>x.peer.ingest(bundle(makeCertificate(x.policy,{name:'elsewhere'}))),/context_mismatch/);
 const wrongRoot=bundle(makeCertificate(x.policy));wrongRoot.content.rootDataId='B'.repeat(43);await assert.rejects(()=>x.peer.ingest(wrongRoot),/record_content_mismatch/);
 const wrongAnt=bundle(makeCertificate(x.policy));wrongAnt.record.antId='2'.repeat(32);await assert.rejects(()=>x.peer.ingest(wrongAnt),/certificate_binding_mismatch/);
 x.setTime(NOW+60000);await assert.rejects(()=>x.peer.ingest(bundle(makeCertificate(x.policy))),/certificate_expired/);
 assert.equal(effects.length,0);
});

test('ingest persists canonical certificate before content and ignores forged freshness',async t=>{
 const x=fixture(t),certificate=makeCertificate(x.policy),verification=verifyNameCertificate(certificate,x.policy,{name:'vevivo',now:NOW});
 await x.peer.ingest(bundle(certificate));
 assert.equal(effects[0].type,'persist-certificate');assert.ok(effects.findIndex(e=>e.type==='put-content')>0);
 const record=x.peer.cache.records.vevivo;
 assert.equal(record.observedAt,new Date(verification.observedAt).toISOString());assert.equal(record.expiresAt,new Date(verification.expiresAt).toISOString());
 const saved=x.peer.cache.proofs.vevivo.nameCertificate;assert.equal(saved.observations.length,3);
 for(const envelope of saved.observations)assert.ok(certificate.observations.some(v=>v.recordJson===envelope.recordJson&&v.signature===envelope.signature));
 assert.equal(x.store.export('vevivo').length,1);
});

test('ingest accepts certificate carried by access snapshot and checks its scope',async t=>{
 const x=fixture(t),certificate=makeCertificate(x.policy),input=bundle(certificate);delete input.nameCertificate;
 input.accessSnapshot={name:'vevivo',antId:ADDRESS,txId:TX,provenance:{certificate}};
 await x.peer.ingest(input);assert.ok(effects.some(e=>e.type==='verify-snapshot'));
});

test('failed certificate persistence prevents content and record publication',async t=>{
 const x=fixture(t);x.driver.fail=true;
 await assert.rejects(()=>x.peer.ingest(bundle(makeCertificate(x.policy))),/persistence failed/);
 assert.deepEqual(x.peer.cache.records,{});assert.deepEqual(x.store.export('vevivo'),[]);assert.equal(effects.length,0);
});

test('legacy ingest stays available when protection is unconfigured',async t=>{
 const x=fixture(t);setProtectedContext(null);const input=bundle(null);delete input.nameCertificate;
 input.stateEvidence={name:'vevivo',txId:TX,antId:ADDRESS,generatedAt:new Date(NOW).toISOString(),checks:{pdaDerivedLocally:true,accountOwnersMatchExpectedPrograms:true,accountBytesDecodedLocally:true},observations:[{ok:true,ant:{txId:TX},arns:{processId:ADDRESS}}]};
 await x.peer.ingest(input);assert.equal(x.peer.cache.records.vevivo,input.record);assert.equal(effects.some(e=>e.type==='persist-certificate'),false);
});

test('protected announcement uses the shared index topic',async t=>{
 const x=fixture(t);let announced;x.peer._announceTopic=async(key,topic)=>{announced={key,topic};};
 await x.peer._announce('vevivo');assert.equal(announced.key,'index');assert.equal(announced.topic.length,32);
});

test('direct server routes certificate requests to actual protected handler',async t=>{
 const x=fixture(t),certificate=makeCertificate(x.policy);await x.store.accept(certificate,{name:'vevivo'});
 const server=await startDirectPeerServer(x.peer,{host:'127.0.0.1',port:49740});
 const response=await dispatchDirect({...x.request,historical:true});assert.equal(response.status,200);assert.equal(JSON.parse(response.body.recordJson).certificates.length,1);
 const rejected=await dispatchDirect({op:'unapproved'});assert.equal(rejected.status,400);assert.match(rejected.body.error,/operation_not_allowed/);
 await server.close();
});

test('IP transport permits coherent RPC and certificate methods but no new arbitrary methods',async()=>{
 const controller=new AbortController();controller.abort(new Error('abort-before-network'));
 for(const method of ['getGenesisHash','getMultipleAccounts'])await assert.rejects(()=>requestIpJson({host:'127.0.0.1',port:8899,method:'POST',purpose:'solana-rpc',body:{method},signal:controller.signal}),/abort-before-network/);
 await assert.rejects(()=>requestIpJson({host:'127.0.0.1',port:49740,path:'/mesh/v1/query',method:'POST',purpose:'mesh-peer',body:{op:'name-certificates'},signal:controller.signal}),/abort-before-network/);
 assert.throws(()=>requestIpJson({host:'127.0.0.1',port:8899,method:'POST',purpose:'solana-rpc',body:{method:'sendTransaction'},signal:controller.signal}),/rpc_method_not_allowed/);
});
