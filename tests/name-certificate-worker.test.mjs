import test from 'node:test';
import assert from 'node:assert/strict';
import {NameCertificateWorker} from '../src/name-certificate-worker.mjs';

test('background refresh bounds work and resumes through newly discovered names',async()=>{
 const visited=[],all=['alpha','beta','gamma'];let checks=0;
 const context={assertCurrent(){checks++;},service:{async refresh(name){visited.push(name);}}};
 const worker=new NameCertificateWorker({getContext:()=>context,names:()=>all,batch:2});
 await worker.pass();assert.deepEqual(visited,['alpha','beta']);all.push('delta');
 await worker.pass();assert.deepEqual(visited,['alpha','beta','gamma','delta']);assert.ok(checks>=8);
});
test('refresh without a protected policy does not touch the network',async()=>{
 const worker=new NameCertificateWorker({getContext:()=>null,names:()=>{throw Error('must not enumerate');}});await worker.pass();
});
test('overlapping refreshes share one bounded pass',async()=>{
 let calls=0,release;const wait=new Promise(resolve=>{release=resolve;});
 const worker=new NameCertificateWorker({getContext:()=>({assertCurrent(){},service:{async refresh(){calls++;await wait;}}}),names:()=>['alpha']});
 const a=worker.pass(),b=worker.pass();assert.equal(calls,1);release();await Promise.all([a,b]);assert.equal(calls,1);
});
test('deadline and stop cancel underlying work',async()=>{
 for(const stop of [false,true]){
  let aborted=false;
  const worker=new NameCertificateWorker({getContext:()=>({assertCurrent(){},service:{refresh(_name,{signal}){return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));}}}),names:()=>['alpha'],timeoutMs:stop?60000:5});
  const pending=worker.pass();if(stop)worker.stop();await assert.rejects(pending,/name_certificate_(refresh_timeout|worker_stopped)/);assert.equal(aborted,true);
 }
});
test('revoked policy halts a pass before another name can be refreshed',async()=>{
 let active=true,calls=0;
 const worker=new NameCertificateWorker({getContext:()=>({assertCurrent(){if(!active)throw Error('policy_revoked');},service:{async refresh(){calls++;active=false;}}}),names:()=>['alpha','beta']});
 await assert.rejects(worker.pass(),/policy_revoked/);assert.equal(calls,1);
});
