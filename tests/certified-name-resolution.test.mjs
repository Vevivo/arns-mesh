import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {verifyRawItem} from '../src/content-store.mjs';
import {resolveCertifiedNameContent} from '../src/certified-name-resolution.mjs';
import {createNameSecurityRuntime} from '../src/name-security-runtime.mjs';
import {initialCertificateState} from '../src/name-certificate-state.mjs';
import {createNameObservation,nameObservationSigningBytes,witnessKeyId,verifyNameCertificate} from '../src/name-certificates.mjs';
import {assertCertifiedResponse,certifiedSnapshotKey} from '../src/name-response-guard.mjs';
import {contentResponse} from '../apps/browser/response.mjs';

const clone=value=>JSON.parse(JSON.stringify(value)),program='11111111111111111111111111111111';
const dataSigner=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
async function content(text,encoding=null,type='text/html'){
 const plain=Buffer.from(text),payload=encoding==='gzip'?gzipSync(plain):encoding==='br'?brotliCompressSync(plain):plain;
 const data=createData(payload,dataSigner,{tags:[{name:'Content-Type',value:type},...(encoding?[{name:'Content-Encoding',value:encoding}]:[])]});
 await data.sign(dataSigner);return{id:data.id,raw:Buffer.from(data.getRaw()),payload,plain};
}
function fixture(target){
 let clock=Math.floor(Date.now()/60000)*60000+30000,quorum=true,revoked=false,calls=0;
 const start=clock-30000,keys=['a','b','c','d'].map(domain=>({domain,...crypto.generateKeyPairSync('ed25519')}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'resolver-test',chainId:'solana:11111111111111111111111111111111',registryProgramId:program,threshold:3,maxFaults:1,roundMs:60000,leaseMs:120000,maxFutureSkewMs:1000,validFrom:start-60000,validUntil:start+3600000,witnesses:keys.map(key=>({domain:key.domain,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}))};
 const cert=(txId=target,round=start/60000)=>({schema:'arns-mesh-name-certificate/v1',round,observations:keys.slice(0,3).map((key,i)=>{
  const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId,round,slot:100+i+(round-start/60000)*10,observedAt:round*60000+10,issuedAt:round*60000+20});
  return{keyId:witnessKeyId(policy.witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),key.privateKey).toString('base64url')};
 })});
 let offered=cert();const drivers=new Map();
 const runtime=createNameSecurityRuntime({env:{ARNS_NAME_WITNESS_POLICY:'/fixture/name-witness-policy.json',ARNS_MESH_DIRECT_ONLY:'1'},now:()=>clock,readPolicy:()=>({...policy,...(revoked?{revoked:true}:{})}),driverForName:(name,meta)=>{
  if(!drivers.has(name)){let state=initialCertificateState(meta.policy);drivers.set(name,{transaction(work){const result=work(clone(state));if(result.state)state=clone(result.state);return result.value;}});}return drivers.get(name);
 },collect:async()=>{calls++;return quorum?{certificate:offered}:null;}});
 const context=runtime.getProtectedNameContext();
 return{context,cert,policy,get clock(){return clock;},set clock(value){clock=value;},set offered(value){offered=value;},unavailable(){quorum=false;},revoke(){revoked=true;},get calls(){return calls;}};
}
const adapter=result=>({body:result.body,bodyDecoded:result.bodyDecoded,contentEncoding:result.contentEncoding,contentType:result.contentType,meta:{contentSignatureVerified:Boolean(result.dataItemSignatureVerified||result.l1SignatureVerified),accessSnapshot:result.accessSnapshot,recovery:result.recovery}});
function fetchContent(items,{mutate}={}){return async id=>{
 const item=items.find(row=>row.id===id);if(!item)throw Error('content_location_unavailable: fixture');
 const raw=mutate?mutate(Buffer.from(item.raw)):item.raw;
 return{direct:{...await verifyRawItem(raw,id),storedBytes:raw},storageKind:'ans104',contentSource:'fixture-original-signed-bytes'};
};}

test('real signed gzip/Brotli/plain HTML, JS and CSS survive certified live, supporter and retained opening',async()=>{
 for(const encoding of ['gzip','br',null])for(const type of ['text/html','application/javascript','text/css']){
  const text='verified '+type+' '+(encoding||'plain'),item=await content(text,encoding,type),f=fixture(item.id),args={name:'alpha',requestedPath:'',context:f.context,fetchById:fetchContent([item])};
  const live=await resolveCertifiedNameContent({...args,accessPolicy:'live'});
  assert.equal(live.body.toString(),text);assert.equal(live.recovery,null);assert.equal(live.verification.fullyTrustless,false);
  assert.deepEqual(live.shareBundle.items[0].storedBytes,item.raw);assert.equal(live.shareBundle.nameCertificate.observations.length,3);
  assertCertifiedResponse(f.context,adapter(live),{name:'alpha'});const response=contentResponse(adapter(live),new Request('ar://alpha/'));
  assert.equal(await response.text(),text);assert.equal(response.headers.get('content-encoding'),null);
  const before=f.calls;f.unavailable();f.clock+=240000;
  const retained=await resolveCertifiedNameContent({...args,accessPolicy:'auto'});
  assert.equal(retained.body.toString(),text);assert.equal(retained.shareBundle,null);assert.ok(retained.recovery);assert.equal(retained.accessSnapshot.observedAt,live.accessSnapshot.observedAt);assert.equal(f.calls,before+1);
  const saved=await resolveCertifiedNameContent({...args,accessPolicy:'saved',snapshotStore:{get:()=>live.accessSnapshot}});assert.equal(saved.body.toString(),text);
 }
});
test('a certified compressed manifest keeps the same binding on its page and subresources',async()=>{
 const html=await content('<h1>certified manifest</h1>','br'),css=await content('h1{color:red}','gzip','text/css');
 const manifest=await content(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{path:'index.html'},paths:{'index.html':{id:html.id},'site.css':{id:css.id}}}),'gzip','application/x.arweave-manifest+json');
 const f=fixture(manifest.id),args={name:'alpha',context:f.context,fetchById:fetchContent([manifest,html,css])};
 const page=await resolveCertifiedNameContent({...args,requestedPath:'',accessPolicy:'live'});assert.equal(page.dataId,html.id);
 const resource=await resolveCertifiedNameContent({...args,requestedPath:'site.css',fixedSnapshot:page.accessSnapshot});
 assert.equal(resource.dataId,css.id);assert.equal(resource.body.toString(),'h1{color:red}');assert.equal(resource.record.txId,manifest.id);assert.equal(resource.shareBundle,null);
});
test('one supporter, copied votes, forged binding and expired live proof never fetch content',async()=>{
 const item=await content('never displayed'),cases=['one','copied','wrong','expired'];
 for(const scenario of cases){const f=fixture(item.id),cert=f.cert();
  if(scenario==='one')cert.observations=cert.observations.slice(0,1);
  if(scenario==='copied')cert.observations=[cert.observations[0],cert.observations[0],cert.observations[0]];
  if(scenario==='wrong')cert.observations[0].recordJson=cert.observations[0].recordJson.replace(item.id,'Z'.repeat(43));
  if(scenario==='expired')f.clock+=240000;f.offered=cert;let fetches=0;
  await assert.rejects(resolveCertifiedNameContent({name:'alpha',requestedPath:'',context:f.context,accessPolicy:'auto',fetchById:async()=>{fetches++;throw Error('unexpected fetch');}}));assert.equal(fetches,0);
 }
});
test('invalid content signature is fatal and cannot silently trigger retained fallback',async()=>{
 const item=await content('<h1>not safe</h1>','gzip'),f=fixture(item.id);
 await assert.rejects(resolveCertifiedNameContent({name:'alpha',requestedPath:'',context:f.context,accessPolicy:'auto',fetchById:fetchContent([item],{mutate:raw=>{raw[raw.length-1]^=1;return raw;}})}),/signature_invalid/);assert.equal(f.calls,1);
});
test('expiry during download becomes dated history only in automatic mode',async()=>{
 const item=await content('slow content');
 for(const accessPolicy of ['auto','live']){const f=fixture(item.id),fetch=fetchContent([item]);
  const pending=resolveCertifiedNameContent({name:'alpha',requestedPath:'',context:f.context,accessPolicy,fetchById:async id=>{const value=await fetch(id);f.clock+=240000;return value;}});
  if(accessPolicy==='live')await assert.rejects(pending,/name_certificate_expired/);else{const result=await pending;assert.ok(result.recovery);assert.equal(result.shareBundle,null);}
 }
});
test('browser cache revalidates expiry, policy and the entire fixed snapshot',async()=>{
 const item=await content('cached bytes'),f=fixture(item.id),result=await resolveCertifiedNameContent({name:'alpha',requestedPath:'',context:f.context,accessPolicy:'live',fetchById:fetchContent([item])}),view=adapter(result);
 const original=certifiedSnapshotKey(result.accessSnapshot),changed=clone(result.accessSnapshot);changed.observedAt=new Date(f.clock).toISOString();assert.notEqual(certifiedSnapshotKey(changed),original);
 assert.throws(()=>assertCertifiedResponse(f.context,{...view,meta:{...view.meta,accessSnapshot:changed}},{name:'alpha'}),/metadata_mismatch/);
 f.clock+=240000;assert.throws(()=>assertCertifiedResponse(f.context,view,{name:'alpha'}),/name_certificate_expired/);
 assert.doesNotThrow(()=>assertCertifiedResponse(f.context,view,{name:'alpha',mode:'historical'}));f.revoke();assert.throws(()=>assertCertifiedResponse(f.context,view,{name:'alpha',mode:'historical'}),/revoked/);
});
test('automatic access after policy expiry uses only its own previously accepted history',async()=>{
 const item=await content('accepted before expiry'),f=fixture(item.id),args={name:'alpha',requestedPath:'',context:f.context,fetchById:fetchContent([item])};
 const live=await resolveCertifiedNameContent({...args,accessPolicy:'live'}),calls=f.calls;f.clock=f.policy.validUntil+1;
 const retained=await resolveCertifiedNameContent({...args,accessPolicy:'auto'});assert.equal(retained.body.toString(),'accepted before expiry');assert.equal(retained.accessSnapshot.observedAt,live.accessSnapshot.observedAt);assert.equal(retained.shareBundle,null);assert.equal(f.calls,calls);
 const fresh=fixture(item.id);fresh.clock=fresh.policy.validUntil+1;let fetched=0;
 await assert.rejects(resolveCertifiedNameContent({...args,context:fresh.context,accessPolicy:'auto',fetchById:async()=>{fetched++;throw Error('unexpected');}}),/name_policy_inactive/);assert.equal(fetched,0);
});
test('fixed subresource proof is accepted durably before any content is fetched',async()=>{
 const item=await content('must persist first'),f=fixture(item.id),certificate=f.cert(),snapshot=f.context.snapshotFrom({certificate,verification:verifyNameCertificate(certificate,f.policy,{name:'alpha',now:f.clock})});
 let fetched=0;f.context.store.accept=async()=>{throw Error('fixture_persistence_failure');};
 await assert.rejects(resolveCertifiedNameContent({name:'alpha',requestedPath:'',context:f.context,fixedSnapshot:snapshot,fetchById:async()=>{fetched++;throw Error('unexpected');}}),/fixture_persistence_failure/);assert.equal(fetched,0);
});
