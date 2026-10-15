import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {SitePinner} from '../src/site-pinner.mjs';
import {createNameSecurityRuntime} from '../src/name-security-runtime.mjs';
import {createNameObservation,nameObservationSigningBytes,witnessKeyId} from '../src/name-certificates.mjs';

const clone=value=>JSON.parse(JSON.stringify(value)),target='A'.repeat(43),program='11111111111111111111111111111111';
function fixture({size=64,getNameContext=()=>null}={}){
 let visits=0;const pins=Object.create(null),stats={files:[],bytes:0};
 const store={pins,has:()=>{visits++;return true;},pinStats:({contentStats}={})=>({groups:Object.keys(pins),files:Object.values(pins).flat().length,bytes:(contentStats||stats).bytes})};
 const pinner=new SitePinner({file:path.join(os.tmpdir(),crypto.randomUUID(),'sites.json'),snapshots:{get:()=>null},contentStore:store,getNameContext});
 const observedAt=new Date().toISOString();
 for(let i=0;i<size;i++){
  const name='site'+i,snapshot={schema:'arns-mesh-name-snapshot/v1',name,txId:target,antId:program,slot:1,ttlSeconds:60,observedAt,provenance:{kind:'local-rpc'}};
  pinner.rows[name]={name,rootDataId:target,observedAt,snapshot,pinGroup:name,status:'document-saved',saved:1,total:1,failed:0};pins[name]=[target];
 }
 return {pinner,store,stats,visits:()=>visits};
}

test('async display summary equals the synchronous production summary under a steady policy',async()=>{
 const f=fixture({size:70});f.pinner.rows.site4.status='partial';delete f.store.pins.site5;
 const stats={files:[],bytes:1234};
 assert.deepEqual(await f.pinner.statusAsync({contentStats:stats}),f.pinner.status({contentStats:stats}));
 assert.equal((await f.pinner.statusAsync()).ready,68);
});

test('real HTTP responses progress before a 13,000-row async report completes',async t=>{
 const f=fixture({size:13000});let finished=false,servedWhileRunning=false;
 const server=http.createServer((req,res)=>{servedWhileRunning=!finished;res.end('alive');});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const response=new Promise((resolve,reject)=>{
  const req=http.get({host:'127.0.0.1',port:server.address().port,path:'/'},res=>{let body='';res.setEncoding('utf8');res.on('data',part=>{body+=part;});res.on('end',()=>resolve(body));});
  req.setTimeout(3000,()=>req.destroy(new Error('http_probe_timeout')));req.on('error',reject);
 });
 const reporting=f.pinner.statusAsync().then(value=>{finished=true;return value;});
 assert.equal(await response,'alive');assert.equal(servedWhileRunning,true,'an actual HTTP handler must run during the catalogue report');
 assert.equal((await reporting).ready,13000);
});

test('caller cancellation interrupts an async report after at most one 16-row batch',async()=>{
 const f=fixture({size:13000}),controller=new AbortController(),reason=new Error('operator_report_cancelled');
 setImmediate(()=>controller.abort(reason));
 await assert.rejects(f.pinner.statusAsync({signal:controller.signal}),error=>error===reason);
 assert.ok(f.visits()>0&&f.visits()<=16);
 const before=f.visits();await assert.rejects(f.pinner.statusAsync({signal:controller.signal}),error=>error===reason);assert.equal(f.visits(),before);
});

test('policy activation during a yielded legacy report discards the earlier ready count',async()=>{
 let active=false;const f=fixture({getNameContext:()=>active?{policyId:'protected-policy',assertCurrent(){},verifySnapshot(){throw new Error('name_certificate_required');}}:null});
 setImmediate(()=>{active=true;});
 assert.equal((await f.pinner.statusAsync()).ready,0);assert.ok(f.visits()<=16);
 assert.equal(f.pinner.isReady(f.pinner.rows.site0),false);
 assert.throws(()=>f.pinner.snapshotStore().get('site0'),/name_certificate_required/);
});

test('policy source failure on the final recheck refuses a partial ready result',async()=>{
 let reads=0;const f=fixture({size:1,getNameContext:()=>{if(++reads===2)throw new Error('name_policy_revoked');return null;}});
 assert.equal((await f.pinner.statusAsync()).ready,0);assert.equal(f.visits(),1);assert.equal(reads,2);
});

test('a different accepted policy after a yield cannot inherit the earlier ready count',async()=>{
 const context={policyId:'original-policy',assertCurrent(){},verifySnapshot(){}};let current=context;
 const f=fixture({getNameContext:()=>current});
 setImmediate(()=>{current={...context,policyId:'replacement-policy'};});
 assert.equal((await f.pinner.statusAsync()).ready,0);assert.equal(f.visits(),16);
});

test('real signed historical certificate becomes unready when policy is revoked during the yield',async()=>{
 const now=6000100,round=100,keys=Array.from({length:4},(_,i)=>({domain:'operator-'+i,...crypto.generateKeyPairSync('ed25519')}));
 let policy={schema:'arns-mesh-name-policy/v1',networkId:'async-status-test',chainId:'solana:'+program,registryProgramId:program,threshold:3,maxFaults:1,roundMs:60000,leaseMs:0,maxFutureSkewMs:1000,validFrom:5940000,validUntil:9600000,witnesses:keys.map(key=>({domain:key.domain,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}))};
 const certificate={schema:'arns-mesh-name-certificate/v1',round,observations:keys.slice(0,3).map(key=>{
  const recordJson=createNameObservation(policy,{name:'alpha',purpose:'current',antId:program,antProgramId:program,txId:target,round,slot:100,observedAt:now,issuedAt:now});
  return {keyId:witnessKeyId(key.publicKey.export({type:'spki',format:'pem'})),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),key.privateKey).toString('base64url')};
 })};
 const drivers=new Map(),runtime=createNameSecurityRuntime({env:{ARNS_NAME_WITNESS_POLICY:path.join(os.tmpdir(),crypto.randomUUID(),'name-witness-policy.json')},now:()=>now,readPolicy:()=>policy,driverForName:(name,{policyId})=>{
  if(!drivers.has(name)){let state={schema:'arns-mesh-certified-name-state/v1',policyId,names:{}};drivers.set(name,{transaction(fn){const result=fn(clone(state));if(result.state!==undefined)state=clone(result.state);return result.value;}});}return drivers.get(name);
 }});
 const context=runtime.getProtectedNameContext(),accepted=await context.store.accept(certificate,{name:'alpha'}),snapshot=context.snapshotFrom(accepted),f=fixture({size:0,getNameContext:runtime.getProtectedNameContext});
 f.pinner.rows.alpha={name:'alpha',rootDataId:target,observedAt:snapshot.observedAt,snapshot,pinGroup:'alpha',status:'document-saved',saved:1,total:1,failed:0};f.store.pins.alpha=[target];
 for(let i=0;i<63;i++)f.pinner.rows['partial'+i]={name:'partial'+i,status:'partial',saved:0,total:1,failed:1};
 assert.equal(f.pinner.status().ready,1);
 setImmediate(()=>{policy={...policy,revoked:true};});
 assert.equal((await f.pinner.statusAsync()).ready,0);
 assert.equal(f.pinner.readySnapshot('alpha'),null);assert.throws(()=>f.pinner.snapshotStore().get('alpha'),/name_policy_revoked/);runtime.close();
});
