import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {getArnsRecordEncoder} from '@ar.io/solana-contracts/arns';
import {MAINNET_PROGRAM_IDS,getAntRecordPDA,getArnsRecordPDA} from '@ar.io/sdk';
import {TargetCatalog,decodeRegistry} from '../src/target-catalog.mjs';

const mint='11111111111111111111111111111111',version={major:1,minor:0,patch:0},count=64;
let fixturePromise;
async function accounts(){
 if(!fixturePromise)fixturePromise=(async()=>{
  const registry=[],ants=[];
  for(let i=0;i<count;i++){
   const name='time-budget-'+i,[registryPda]=await getArnsRecordPDA(name),undername='budget-'+i,[antPda]=await getAntRecordPDA(mint,undername);
   const raw=getArnsRecordEncoder().encode({name,nameHash:crypto.createHash('sha256').update(name).digest(),owner:mint,ant:mint,purchaseType:1,startTimestamp:1,endTimestamp:null,undernameLimit:100,purchasePrice:0,bump:255,version});
   registry.push({pubkey:String(registryPda),account:{owner:MAINNET_PROGRAM_IDS.arns,data:[Buffer.from(raw).toString('base64'),'base64']}});
   const account=letter=>({owner:MAINNET_PROGRAM_IDS.ant,data:[Buffer.from(getAntRecordEncoder().encode({mint,undername,target:letter.repeat(43),targetProtocol:0,ttlSeconds:60,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version})).toString('base64'),'base64']});
   ants.push({pubkey:String(antPda),before:account('A'),after:account('B')});
  }
  return {registry,ants};
 })();return fixturePromise;
}
async function setup(mode){
 const rows=await accounts();let measuring=false,processed=0,costMs=9,onRecord=()=>{},mutation=null;
 const measured=values=>values.map((row,index)=>{
  const account=mutation?mutation(row.account,index):row.account;let first=true;
  return {pubkey:row.pubkey,get account(){
   if(first){first=false;processed++;onRecord(index);const until=performance.now()+costMs;while(performance.now()<until){}}
   return account;
  }};
 });
 const response=()=>({context:{slot:measuring?200:100},value:mode==='registry'?(measuring?measured(rows.registry):rows.registry):rows.ants.map(row=>({pubkey:row.pubkey,account:measuring?row.after:row.before}))});
 const commits=[],catalog=mode==='registry'?null:new TargetCatalog({file:path.join(os.tmpdir(),crypto.randomUUID(),'catalog.json'),rpc:async(_endpoint,method)=>{
  if(method==='getAccountInfo')return {context:{slot:99},value:null};
  const value=response();if(measuring)value.value=measured(value.value);return value;
 }});
 if(catalog){catalog.state.registry=[{name:'example',mint}];catalog.state.registryAt=Date.now();catalog.state.slot=99;catalog.save=()=>commits.push(structuredClone(catalog.state));}
 const run=signal=>mode==='registry'?decodeRegistry(response(),{signal}):mode==='bulk'?catalog.refreshTargets({signal}):catalog.step({signal,mints:1});
 // Warm only deterministic PDA derivations. Actual decoders and binding checks
 // still run on every response. All account bytes use real SDK encoders.
 await run();measuring=true;commits.length=0;
 return {catalog,run,commits,processed:()=>processed,onRecord:fn=>{onRecord=fn;},setCost:ms=>{costMs=ms;},mutate:fn=>{mutation=fn;}};
}

for(const mode of ['registry','bulk','mint']){
 test(mode+' elapsed CPU budget lets cancellation run before 32 real records are decoded',{timeout:15000},async()=>{
  const f=await setup(mode),before=f.catalog?structuredClone(f.catalog.state.targets):null,controller=new AbortController(),reason=new Error('cancel_slow_record_decode');
  f.onRecord(index=>{if(index===0)setImmediate(()=>controller.abort(reason));});
  await assert.rejects(f.run(controller.signal),error=>error===reason);
  assert.ok(f.processed()>0&&f.processed()<32,'the 8 ms checkpoint must interrupt before the old 32-record batch');
  if(f.catalog){assert.deepEqual(f.catalog.state.targets,before);for(const state of f.commits)assert.deepEqual(state.targets,before,'no partial replacement was checkpointed');}
 });

 test(mode+' cancellation in the final decoded row cannot publish a completed replacement',async()=>{
  const f=await setup(mode),before=f.catalog?structuredClone(f.catalog.state.targets):null,controller=new AbortController(),reason=new Error('cancel_final_decode');
  f.setCost(0);f.onRecord(index=>{if(index===count-1)controller.abort(reason);});
  await assert.rejects(f.run(controller.signal),error=>error===reason);assert.equal(f.processed(),count);
  if(f.catalog){assert.deepEqual(f.catalog.state.targets,before);for(const state of f.commits)assert.deepEqual(state.targets,before);}
 });

 test(mode+' bounded PDA work lets real HTTP progress before replacement publication',{timeout:15000},async t=>{
  const f=await setup(mode);let probe,request,servedAt=null,published=false;
  const server=http.createServer((_req,res)=>{servedAt={processed:f.processed(),published};res.end('alive');});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>{request?.destroy();server.closeAllConnections();server.close(resolve);}));
  f.onRecord(index=>{if(index===0)probe=new Promise((resolve,reject)=>{
   request=http.get({host:'127.0.0.1',port:server.address().port,path:'/'},res=>{let body='';res.setEncoding('utf8');res.on('data',part=>{body+=part;});res.on('end',()=>resolve(body));res.on('error',reject);});
   request.setTimeout(3000,()=>request.destroy(new Error('http_progress_timeout')));request.on('error',reject);
  });});
  const result=await f.run();published=true;
  assert.equal(await probe,'alive');assert.equal(servedAt.published,false);assert.ok(servedAt.processed<count);
  assert.equal(f.processed(),count);
  if(f.catalog){assert.equal(Object.keys(f.catalog.state.targets).length,count);assert.equal(f.catalog.state.targets['budget-0_example'].dataId,'B'.repeat(43));assert.deepEqual(f.commits.at(-1).targets,f.catalog.state.targets);}
  else assert.equal(result.records.length,count);
 });
}

test('time-budgeted registry decoding still quarantines invalid owners, raw name hashes and discriminators',async()=>{
 const f=await setup('registry');f.setCost(0);
 f.mutate((account,index)=>{
  if(index===0)return {...account,owner:mint};
  if(index===1||index===2){const raw=Buffer.from(account.data[0],'base64');raw[index===1?8:0]^=1;return {...account,data:[raw.toString('base64'),'base64']};}
  return account;
 });
 const result=await f.run();assert.equal(result.records.length,count-3);
 assert.deepEqual(result.quarantine.map(row=>row.error),['owner_mismatch','name_hash_mismatch','discriminator_mismatch']);
});

for(const mode of ['bulk','mint'])test(mode+' time-budgeted ANT scan preserves the prior table on invalid RPC account metadata',async()=>{
 const f=await setup(mode),before=structuredClone(f.catalog.state.targets);f.setCost(0);
 f.mutate((account,index)=>index===3?{...account,owner:mint}:account);
 if(mode==='bulk')await assert.rejects(f.run(),/ant_owner_mismatch/);
 else {await f.run();assert.match(f.catalog.state.errors.at(-1).error,/ant_owner_mismatch/);}
 assert.deepEqual(f.catalog.state.targets,before);for(const state of f.commits)assert.deepEqual(state.targets,before);
});

test('already cancelled empty registry scan rejects instead of returning a fresh-looking empty result',async()=>{
 const controller=new AbortController(),reason=new Error('cancelled_before_decode');controller.abort(reason);
 await assert.rejects(decodeRegistry({context:{slot:100},value:[]},{signal:controller.signal}),error=>error===reason);
});
