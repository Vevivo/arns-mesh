import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {SitePinner} from '../src/site-pinner.mjs';
import {createNameSecurityRuntime} from '../src/name-security-runtime.mjs';
import {createNameObservation,nameObservationSigningBytes,witnessKeyId} from '../src/name-certificates.mjs';

const copy=value=>JSON.parse(JSON.stringify(value)),target='A'.repeat(43),program='11111111111111111111111111111111';
function makePinner(getNameContext){
 const pins=Object.create(null),store={pins,has:()=>true,pinStats:()=>({groups:Object.keys(pins),files:Object.values(pins).flat().length})};
 const instance=new SitePinner({file:path.join(os.tmpdir(),crypto.randomUUID(),'sites.json'),snapshots:{get:()=>null},contentStore:store,getNameContext});
 return {instance,store};
}
function readyRow(name='alpha',snapshot={schema:'arns-mesh-name-snapshot/v1',name,txId:target,antId:program,observedAt:new Date().toISOString(),slot:1,ttlSeconds:60,provenance:{kind:'local-rpc'}}){
 return {name,rootDataId:target,observedAt:snapshot.observedAt,snapshot,pinGroup:name,status:'document-saved',saved:1,total:1,failed:0};
}
test('13,000 absent or partial rows do not read name policy; one display summary reads it once',()=>{
 let reads=0;const {instance}=makePinner(()=>{reads++;return null;});
 for(let i=0;i<13000;i++)instance.rows['row'+i]={name:'row'+i,status:'partial',saved:0,total:1,failed:1};
 for(const row of Object.values(instance.rows))assert.equal(instance.isReady(row),false);
 for(let i=0;i<13000;i++)assert.equal(instance.readySnapshot('missing'+i),null);
 assert.equal(reads,0);
 const summary=instance.status();assert.equal(summary.sites.length,13000);assert.equal(summary.ready,0);assert.equal(reads,1);
 instance.status();assert.equal(reads,2,'the next report must obtain a new context');
});
test('complete legacy rows share only one report-scoped policy read, with fresh public readiness checks',()=>{
 let reads=0;const {instance,store}=makePinner(()=>{reads++;return null;});
 for(let i=0;i<13000;i++){const name='site'+i;instance.rows[name]=readyRow(name);store.pins[name]=[target];}
 assert.equal(instance.status().ready,13000);assert.equal(reads,1);
 assert.equal(instance.status().ready,13000);assert.equal(reads,2);
 assert.equal(instance.isReady(instance.rows.site0),true);assert.equal(reads,3);
 assert.equal(instance.readySnapshot('site0').txId,target);assert.equal(reads,5,'readiness and saved lookup each check the current context');
 delete store.pins.site0;assert.equal(instance.status().ready,12999);assert.equal(reads,6,'a report cannot cache file readiness');
});
test('revocation after a successful display report refuses all public readiness and saved entrypoints',async()=>{
 const now=6000100,round=100,keys=Array.from({length:4},(_,i)=>({domain:'operator-'+i,...crypto.generateKeyPairSync('ed25519')}));
 let policy={schema:'arns-mesh-name-policy/v1',networkId:'readiness-performance-test',chainId:'solana:'+program,registryProgramId:program,threshold:3,maxFaults:1,roundMs:60000,leaseMs:0,maxFutureSkewMs:1000,validFrom:5940000,validUntil:9600000,witnesses:keys.map(key=>({domain:key.domain,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}))};
 const certificate={schema:'arns-mesh-name-certificate/v1',round,observations:keys.slice(0,3).map(key=>{
  const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId:target,round,slot:100,observedAt:now,issuedAt:now});
  return {keyId:witnessKeyId(key.publicKey.export({type:'spki',format:'pem'})),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),key.privateKey).toString('base64url')};
 })};
 const drivers=new Map(),runtime=createNameSecurityRuntime({env:{ARNS_NAME_WITNESS_POLICY:path.join(os.tmpdir(),crypto.randomUUID(),'name-witness-policy.json')},now:()=>now,readPolicy:()=>policy,driverForName:(name,{policyId})=>{
  if(!drivers.has(name)){let state={schema:'arns-mesh-certified-name-state/v1',policyId,names:{}};drivers.set(name,{transaction(fn){const result=fn(copy(state));if(result.state!==undefined)state=copy(result.state);return result.value;}});}return drivers.get(name);
 }});
 const context=runtime.getProtectedNameContext(),accepted=await context.store.accept(certificate,{name:'alpha'}),snapshot=context.snapshotFrom(accepted);
 const {instance,store}=makePinner(runtime.getProtectedNameContext);instance.rows.alpha=readyRow('alpha',snapshot);store.pins.alpha=[target];
 assert.equal(instance.status().ready,1);assert.equal(instance.isReady(instance.rows.alpha),true);
 policy={...policy,revoked:true};
 assert.equal(instance.isReady(instance.rows.alpha),false);assert.equal(instance.readySnapshot('alpha'),null);
 assert.throws(()=>instance.snapshotStore().get('alpha'),/name_policy_revoked/);
 assert.equal(instance.status().ready,0);runtime.close();
});
test('report context is private and cannot be supplied to bypass a changed policy',()=>{
 let revoked=false,reads=0;const {instance,store}=makePinner(()=>{reads++;if(revoked)throw new Error('name_policy_revoked');return null;});
 instance.rows.alpha=readyRow();store.pins.alpha=[target];assert.equal(instance.status().ready,1);
 revoked=true;
 assert.equal(instance.isReady(instance.rows.alpha,{context:null}),false);
 assert.equal(instance.status({context:null}).ready,0);
 assert.equal(reads,3);
});
