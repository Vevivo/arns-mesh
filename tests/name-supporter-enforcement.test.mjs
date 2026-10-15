import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SitePinner} from '../src/site-pinner.mjs';
import {SupporterReplication} from '../src/supporter-replication.mjs';
import {supporterReadiness,probeSupporter} from '../src/supporter-readiness.mjs';
import {createNameObservation,nameObservationSigningBytes,namePolicyId,verifyNameCertificate,witnessKeyId} from '../src/name-certificates.mjs';

const target='A'.repeat(43),other='B'.repeat(43),program='11111111111111111111111111111111';
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const now=Date.now(),start=Math.floor(now/60000)*60000,round=start/60000;
 const keys=['a','b','c','d'].map(domain=>({domain,...crypto.generateKeyPairSync('ed25519')}));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'pinner-test',chainId:'solana:11111111111111111111111111111111',registryProgramId:program,threshold:3,maxFaults:1,roundMs:60000,leaseMs:120000,maxFutureSkewMs:1000,validFrom:start-60000,validUntil:start+3600000,witnesses:keys.map(k=>({domain:k.domain,publicKeyPem:k.publicKey.export({type:'spki',format:'pem'})}))};
 const observations=keys.slice(0,3).map((key,i)=>{
  const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId:target,round,slot:100+i,observedAt:start,issuedAt:start});
  return {keyId:witnessKeyId(policy.witnesses[i].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),key.privateKey).toString('base64url')};
 });
 const certificate={schema:'arns-mesh-name-certificate/v1',round,observations},policyId=namePolicyId(policy);
 const snapshot={schema:'arns-mesh-name-snapshot/v1',name:'alpha',txId:target,antId:program,slot:100,observedAt:new Date(start).toISOString(),ttlSeconds:60,provenance:{kind:'quorum-witness',policyId,certificate}};
 let active=true;
 const context={policy,policyId,assertCurrent(){if(!active)throw new Error('name_security_context_changed');},
  verifySnapshot(value,{name,mode='historical'}={}){
   this.assertCurrent();
   if(value?.provenance?.kind!=='quorum-witness'||value.provenance.policyId!==policyId)throw new Error('name_certificate_required');
   const verification=verifyNameCertificate(value.provenance.certificate,policy,{name,mode,now});
   if(value.name!==verification.binding.name||value.txId!==verification.binding.txId||value.antId!==verification.binding.antId||value.observedAt!==new Date(verification.observedAt).toISOString())throw new Error('name_certificate_snapshot_mismatch');
   return {certificate:value.provenance.certificate,verification,snapshot:clone(value)};
  },
  async authorizeName(name,{snapshot:provided=null,mode='historical'}={}){return this.verifySnapshot(provided||snapshot,{name,mode}).snapshot;},
  snapshotFrom(accepted){return {...clone(snapshot),txId:accepted.verification.binding.txId,observedAt:new Date(accepted.verification.observedAt).toISOString(),provenance:{kind:'quorum-witness',policyId,certificate:clone(accepted.certificate)}};},
  retainSnapshot(value){return this.verifySnapshot(value,{name:value.name,mode:'historical'});},releaseSnapshot(){this.assertCurrent();},
  store:{floor:()=>null,names:()=>[],known:()=>null}
 };
 return {now,policy,policyId,certificate,snapshot,context,revoke:()=>{active=false;}};
}
function directory(t){
 const root=path.resolve(process.env.ARNS_TEST_TMP_ROOT||os.tmpdir()),dir=fs.mkdtempSync(path.join(root,'arns-name-enforcement-test-'));
 t.after(()=>{assert.equal(path.dirname(dir),root);assert.ok(path.basename(dir).startsWith('arns-name-enforcement-test-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;
}
function pinner(t,f,{getNameContext=()=>f.context,fetchContent}={}){
 const dir=directory(t),calls={fetch:0,legacy:0,pin:0},pins=Object.create(null);
 const store={pins,has:()=>true,pinStats:()=>({}),async pin(id,group){calls.pin++;pins[group]||=[];if(!pins[group].includes(id))pins[group].push(id);},unpin:group=>{delete pins[group];}};
 const item={direct:{payload:Buffer.from('verified fixture bytes'),tags:[]}};
 const instance=new SitePinner({file:path.join(dir,'sites.json'),snapshots:{get(){calls.legacy++;throw new Error('legacy_snapshot_used');}},contentStore:store,getNameContext,createClient:()=>({setName(){},async stop(){}}),fetchContent:async(...args)=>{calls.fetch++;return fetchContent?fetchContent(...args):item;}});
 return {instance,calls,store,dir,item};
}
const readyRow=snapshot=>({name:snapshot.name,rootDataId:snapshot.txId,observedAt:snapshot.observedAt,snapshot,pinGroup:'fixture',status:'document-saved',total:1,saved:1,failed:0});
test('protected pinner refuses one publisher snapshot before fetching or changing saved metadata',async t=>{
 const f=fixture(),p=pinner(t,f),legacy={...f.snapshot,provenance:{kind:'local-rpc'}};
 await assert.rejects(p.instance.start('alpha',{snapshot:legacy}),/name_certificate_required/);
 assert.equal(p.calls.fetch,0);assert.equal(p.calls.pin,0);assert.deepEqual(Object.keys(p.instance.rows),[]);assert.equal(p.calls.legacy,0);
});
test('public run entrypoint rejects a certificate bound to another root before fetching',async t=>{
 const f=fixture(),p=pinner(t,f),wrong={...clone(f.snapshot),txId:other};
 await assert.rejects(p.instance.run('alpha',wrong),/name_certificate_snapshot_mismatch/);
 assert.equal(p.calls.fetch,0);assert.equal(p.calls.pin,0);
});
test('a signed but insufficient quorum cannot be pinned through start or run',async t=>{
 const f=fixture(),p=pinner(t,f),partial=clone(f.snapshot);partial.provenance.certificate.observations=partial.provenance.certificate.observations.slice(0,1);
 await assert.rejects(p.instance.start('alpha',{snapshot:partial}),/name_certificate_quorum_unmet/);
 await assert.rejects(p.instance.run('alpha',partial),/name_certificate_quorum_unmet/);
 assert.equal(p.calls.fetch,0);
});
test('protected readiness and saved lookup never borrow a legacy binding',t=>{
 const f=fixture(),p=pinner(t,f),legacy={...f.snapshot,provenance:{kind:'local-rpc'}};
 p.instance.rows.alpha=readyRow(legacy);p.store.pins.fixture=[target];
 assert.equal(p.instance.isReady(p.instance.rows.alpha),false);
 assert.equal(p.instance.readySnapshot('alpha'),null);
 assert.equal(p.instance.snapshotStore().get('absent'),null);
 assert.throws(()=>p.instance.snapshotStore().get('alpha'),/name_certificate_required/);
 assert.throws(()=>p.instance.snapshotStore().put(legacy),/name_certificate_required/);assert.equal(p.calls.legacy,0);
});
test('successful preparation preserves the full original certificate in retained metadata',async t=>{
 const f=fixture(),p=pinner(t,f),result=await p.instance.start('alpha',{snapshot:f.snapshot});
 assert.equal(p.calls.fetch,1);assert.equal(p.instance.isReady(result),true);
 assert.deepEqual(result.snapshot.provenance.certificate,f.certificate);
 assert.deepEqual(p.instance.readySnapshot('alpha').provenance.certificate,f.certificate);
 assert.equal(p.calls.legacy,0);
});
test('a policy change while authorizing the name prevents any content fetch',async t=>{
 const f=fixture(),p=pinner(t,f),original=f.context.authorizeName.bind(f.context);
 f.context.authorizeName=async(...args)=>{const value=await original(...args);f.revoke();return value;};
 await assert.rejects(p.instance.start('alpha',{snapshot:f.snapshot}),/name_security_context_changed/);
 assert.equal(p.calls.fetch,0);assert.equal(p.calls.pin,0);
});
test('a policy change during download cannot publish a ready prepared version',async t=>{
 const f=fixture(),p=pinner(t,f,{fetchContent:async()=>{f.revoke();return {direct:{payload:Buffer.from('data'),tags:[]}};}});
 const result=await p.instance.start('alpha',{snapshot:f.snapshot});
 assert.equal(p.calls.fetch,1);assert.equal(p.calls.pin,0);assert.equal(result.status,'partial');assert.equal(p.instance.isReady(result),false);
});
test('replication uses relay names only as hints and never pins a rejected single-publisher mapping',async t=>{
 const f=fixture(),dir=directory(t);let pins=0;
 f.context.authorizeName=async()=>{throw new Error('name_certificate_quorum_unmet');};
 const replication=new SupporterReplication({file:path.join(dir,'replication.json'),getNameContext:()=>f.context,relay:{entries:()=>[{envelope:{witnessPeerId:'a'.repeat(64)},row:{...f.snapshot,txId:other}}],trusted:()=>[]},pinner:{rows:{},isReady:()=>false,start:async()=>{pins++;}},passTimeoutMs:1000});
 const result=await replication.pass();
 assert.equal(pins,0);assert.match(result.error,/name_certificate_quorum_unmet/);assert.equal(result.acceptedNames,null);assert.equal(result.candidateNames,1);
});
test('replication passes the certified target rather than a relay claimed target to pinner',async t=>{
 const f=fixture(),dir=directory(t);let received;
 const fakePinner={rows:{},isReady:row=>row?.status==='document-saved',start:async(name,options)=>{received=options.snapshot;return {name,status:'document-saved'};}};
 const replication=new SupporterReplication({file:path.join(dir,'replication.json'),getNameContext:()=>f.context,relay:{entries:()=>[{envelope:{witnessPeerId:'a'.repeat(64)},row:{...f.snapshot,txId:other}}],trusted:()=>[]},pinner:fakePinner,passTimeoutMs:1000});
 const result=await replication.pass();assert.equal(result.error,null);assert.equal(received.txId,target);assert.deepEqual(received.provenance.certificate,f.certificate);
});
test('protected local supporter report does not count legacy names or touch their root files',()=>{
 const f=fixture();let has=0,legacyEntries=0;
 const report=supporterReadiness({getNameContext:()=>f.context,snapshots:{names:()=>['alpha'],exportLocal:()=>{throw new Error('legacy_authority_used');}},relay:{entries:()=>{legacyEntries++;return[];},status:()=>({acceptedRecords:1})},pinners:[],contentStore:{has:()=>{has++;return true;}},trustedPeerIds:['a'],ownPeerId:'a'});
 assert.equal(report.names.accepted,0);assert.equal(report.locallyPrepared,false);assert.equal(has,0);assert.equal(legacyEntries,0);assert.equal(report.trust.threshold,3);
});
test('replication rechecks authority but does not repin an unchanged certified prepared site',async t=>{
 const f=fixture(),dir=directory(t);let pins=0,authorized=0;const original=f.context.authorizeName.bind(f.context);
 f.context.authorizeName=async(...args)=>{authorized++;return original(...args);};
 const old=readyRow(f.snapshot),fakePinner={rows:{alpha:old},isReady:()=>true,needsDecodingAudit:()=>false,start:async()=>{pins++;throw new Error('unnecessary_pin');}};
 const replication=new SupporterReplication({file:path.join(dir,'replication.json'),getNameContext:()=>f.context,relay:{entries:()=>[],trusted:()=>[]},pinner:fakePinner,passTimeoutMs:1000});
 const result=await replication.pass();assert.equal(result.error,null);assert.equal(authorized,1);assert.equal(pins,0);assert.equal(result.completed,0);
});
function probeDependencies(f,certificate=f.certificate){
 const calls={snapshot:0,content:0,query:[]};
 const query=async(peer,req)=>{calls.query.push(req.op);return {ok:true,recordJson:JSON.stringify({schema:'arns-mesh-name-certificate-reply/v1',name:'alpha',policyId:f.policyId,observations:[],certificates:[certificate]})};};
 const createClient=options=>{assert.equal(options.directPeers.length,1);assert.equal(options.dhtEnabled,false);assert.deepEqual(options.directory.addresses(),[]);assert.deepEqual(options.directory.rank(options.directPeers),options.directPeers);return {async snapshot(){calls.snapshot++;throw new Error('legacy_snapshot_used');},async content(id){calls.content++;assert.equal(id,target);return {payload:Buffer.from('content'),tags:[],storedBytes:Buffer.from('signed fixture')};},async stop(){}};};
 return {calls,query,createClient};
}
test('selected-supporter probe rejects insufficient quorum without retrying legacy snapshot or fetching files',async()=>{
 const f=fixture(),partial={...f.certificate,observations:f.certificate.observations.slice(0,1)},d=probeDependencies(f,partial);
 const result=await probeSupporter({peer:{host:'192.0.2.11',port:49740},names:['alpha'],getNameContext:()=>f.context,...d});
 assert.equal(result.ready,false);assert.match(result.names[0].error,/name_certificate_quorum_unmet/);assert.equal(d.calls.content,0);assert.equal(d.calls.snapshot,0);assert.deepEqual(d.calls.query,['name-certificates']);
});
test('selected-supporter probe accepts full signed quorum and fetches only the certified content root',async()=>{
 const f=fixture(),d=probeDependencies(f);
 const result=await probeSupporter({peer:{host:'192.0.2.11',port:49740},names:['alpha'],getNameContext:()=>f.context,...d});
 assert.equal(result.ready,true);assert.equal(result.names[0].target,target);assert.equal(result.names[0].historical,true);
 assert.equal(d.calls.content,1);assert.equal(d.calls.snapshot,0);assert.deepEqual(result.names[0].domains,['a','b','c']);
 assert.equal(result.discoveryUsed,false);assert.equal(result.rpcUsed,false);
});
