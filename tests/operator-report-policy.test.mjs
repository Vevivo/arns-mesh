import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {setImmediate as yieldToEventLoop} from 'node:timers/promises';
import {captureOperatorReportContext,collectOperatorStatus} from '../src/operator-status-report.mjs';
import {createNameSecurityRuntime} from '../src/name-security-runtime.mjs';

function policyFixture({absent=false}={}){
 const now=1800000030000,program='11111111111111111111111111111111';
 const keys=Array.from({length:4},()=>crypto.generateKeyPairSync('ed25519'));
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'operator-report-test',chainId:'solana:'+program,registryProgramId:program,threshold:3,maxFaults:1,roundMs:60000,leaseMs:0,maxFutureSkewMs:1000,validFrom:now-60000,validUntil:now+3600000,witnesses:keys.map((key,i)=>({domain:'operator-'+i,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}))};
 let current=absent?null:policy;
 const runtime=createNameSecurityRuntime({env:{ARNS_NAME_WITNESS_POLICY:path.resolve('memory-only-operator-report',crypto.randomUUID(),'name-witness-policy.json')},now:()=>now,readPolicy:()=>current});
 return {runtime,policy,setPolicy:value=>{current=value;}};
}
const mutations={
 activation:{absent:true,apply:f=>f.setPolicy(f.policy),error:/name_security_context_changed/},
 removal:{apply:f=>f.setPolicy(null),error:/name_witness_policy_required/},
 replacement:{apply:f=>f.setPolicy({...f.policy,networkId:'different-policy'}),error:/name_policy_migration_required/},
 revocation:{apply:f=>f.setPolicy({...f.policy,revoked:true}),error:/name_policy_revoked/},
};

for(const [name,mutation] of Object.entries(mutations))test('report guard detects real runtime policy '+name+' between collection phases',async()=>{
 const f=policyFixture(mutation),check=captureOperatorReportContext(f.runtime.getProtectedNameContext);
 try{check();await yieldToEventLoop();mutation.apply(f);assert.throws(check,mutation.error);}finally{f.runtime.close();}
});

test('same policy ID cannot bypass either the captured or current context assertion',()=>{
 const oldFailure=new Error('captured_context_revoked'),newFailure=new Error('current_context_revoked');
 let oldActive=true,currentActive=true;
 const original={policyId:'same-policy',assertCurrent(){if(!oldActive)throw oldFailure;}};
 let selected=original;
 const check=captureOperatorReportContext(()=>selected);
 selected={policyId:'same-policy',assertCurrent(){if(!currentActive)throw newFailure;}};
 assert.doesNotThrow(check);
 oldActive=false;assert.throws(check,error=>error===oldFailure);
 oldActive=true;currentActive=false;assert.throws(check,error=>error===newFailure);
});

// Run the production publisher body, not a rewritten copy of its guard order.
// Only peer/storage/status boundaries are memory fixtures; the context guard,
// report collector and policy runtime are their actual imported modules.
const main=fs.readFileSync(new URL('../apps/peer/main.mjs',import.meta.url),'utf8');
const begin=main.indexOf('const statusController=new AbortController();'),end=main.indexOf('publishStatus();const statusTimer=',begin);
assert.ok(begin>=0&&end>begin,'locate the production async operator publisher');
const publisherSource=main.slice(begin,end)+'\n({publishStatus});';
function publisher(f,{phase=null,mutate=()=>{}}={}){
 const writes=[],errors=[],logs=[],visited=[];
 const at=async name=>{visited.push(name);await yieldToEventLoop();if(phase===name)mutate();};
 const contentStore={async statsAsync(){await at('file-scan');return {files:[],bytes:0};}};
 const peer={contentStore,witnessPeerId:'peer',status:()=>({online:true,sharedIndex:{}})};
 const siteStatus=()=>({sites:[{name:'alpha',status:'document-saved',saved:1,total:1,failed:0}],storage:{groups:[]},ready:1});
 const pinner={store:contentStore,async statusAsync(){await at('saved-sites');return siteStatus();}};
 const replicationPinner={store:contentStore,async statusAsync(){await at('replicated-sites');return siteStatus();}};
 const status=()=>({}),discovery={status},runtime={snapshots:{names:()=>['alpha']},discovery};
 const bindings={AbortController,stopping:false,peer,pinner,replicationPinner,peerDiscovery:discovery,runtime,
  captureOperatorReportContext:()=>captureOperatorReportContext(f.runtime.getProtectedNameContext),collectOperatorStatus,
  replication:{status:({completeSites})=>({completeSites})},snapshotRelay:{status},acceptedPublishers:()=>[],
  supporterReadinessAsync:async()=>{await at('readiness');return {locallyPrepared:true,names:{known:1},files:{completePreparedSites:1}};},
  version:'test',onlinePreparation:{status(){visited.push('formatting');if(phase==='formatting')mutate();return {};}},
  process:{memoryUsage:()=>({rss:1})},transferBudgetStatus:status,locationCacheStatus:status,catalog:null,
  topicSearch:{status},search:{status},searchMetadata:{status},network:{status},dataDir:'memory-only',
  writeOperatorStatus:(directory,value)=>writes.push({directory,value}),
  console:{log:value=>logs.push(JSON.parse(value)),error:value=>errors.push(JSON.parse(value))},
 };
 return {...vm.runInNewContext(publisherSource,bindings),writes,errors,logs,visited};
}

test('unchanged real policy lets the production combined report publish once',async()=>{
 const f=policyFixture(),p=publisher(f);
 try{
  await p.publishStatus();assert.equal(p.errors.length,0);assert.equal(p.writes.length,1);
  assert.equal(p.writes[0].value.savedSites.ready,1);assert.equal(p.writes[0].value.readiness.locallyPrepared,true);
  assert.deepEqual(p.visited,['file-scan','saved-sites','replicated-sites','readiness','formatting']);
 }finally{f.runtime.close();}
});

for(const [name,mutation] of Object.entries(mutations))for(const phase of ['saved-sites','readiness','formatting']){
 test('production combined report refuses '+name+' during '+phase+' before publication',async()=>{
  const f=policyFixture(mutation),p=publisher(f,{phase,mutate:()=>mutation.apply(f)});
  try{
   await p.publishStatus();assert.ok(p.visited.includes(phase),'the requested collection/formatting phase actually ran');
   assert.equal(p.writes.length,0,'mixed-policy readiness must never reach the report file');assert.equal(p.logs.length,0);
   assert.equal(p.errors.length,1);assert.equal(p.errors[0].event,'operator-status-failed');assert.match(p.errors[0].error,mutation.error);
  }finally{f.runtime.close();}
 });
}
