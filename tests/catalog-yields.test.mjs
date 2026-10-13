import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {MAINNET_PROGRAM_IDS,getAntRecordPDA} from '@ar.io/sdk';
import {TargetCatalog} from '../src/target-catalog.mjs';

const mint='11111111111111111111111111111111',version={major:1,minor:0,patch:0};
let fixtures;
async function records(){
 if(!fixtures)fixtures=(async()=>{
  const values=[];
  for(let i=0;i<256;i++){
   const undername='item-'+i,[pda]=await getAntRecordPDA(mint,undername);
   const account=target=>({owner:MAINNET_PROGRAM_IDS.ant,data:[Buffer.from(getAntRecordEncoder().encode({mint,undername,target:target.repeat(43),targetProtocol:0,ttlSeconds:60,priority:null,owner:null,lastReconciledOwner:mint,bump:255,version})).toString('base64'),'base64']});
   values.push({pubkey:String(pda),before:account('A'),after:account('B')});
  }
  return values;
 })();
 return fixtures;
}
async function setup(t,mode){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-yield-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const fixture=await records();let measuring=false,processed=0,onRecord=()=>{};
 const catalog=new TargetCatalog({file:path.join(dir,'targets.json'),rpc:async(_ep,method)=>{
  if(method==='getAccountInfo')return {context:{slot:measuring?200:100},value:null};
  return {context:{slot:measuring?200:100},value:fixture.map((row,index)=>{
   if(!measuring)return {pubkey:row.pubkey,account:row.before};
   let first=true;
   return {pubkey:row.pubkey,get account(){
    if(first){first=false;processed++;onRecord(index);}
    return row.after;
   }};
  })};
 }});
 catalog.state.registry=[{name:'example',mint}];catalog.state.registryAt=Date.now();catalog.state.slot=99;
 const run=signal=>mode==='bulk'?catalog.refreshTargets({signal}):catalog.step({signal,mints:1});
 // Warm the real deterministic PDA cache. Cached promises must not starve I/O.
 await run();measuring=true;
 return {catalog,run,count:fixture.length,processed:()=>processed,onRecord:fn=>{onRecord=fn;}};
}
for(const mode of ['bulk','mint']){
 test(mode+' cached ANT decoding observes cancellation before publishing a partial replacement',{timeout:15000},async t=>{
  const f=await setup(t,mode),before=structuredClone(f.catalog.state.targets),controller=new AbortController();
  let abortJob;
  t.after(()=>{if(abortJob)clearImmediate(abortJob);});
  f.onRecord(index=>{if(index===32)abortJob=setImmediate(()=>controller.abort(new Error('cancel_during_decode')));});
  await assert.rejects(f.run(controller.signal),/cancel_during_decode/);
  assert.ok(f.processed()>32&&f.processed()<f.count,'abort occurs after real records were decoded but before the entire reply');
  assert.deepEqual(f.catalog.state.targets,before);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.catalog.file)).targets,before);
 });
 test(mode+' cached ANT decoding serves local HTTP and timers before publishing the complete replacement',{timeout:15000},async t=>{
  const f=await setup(t,mode);
  const oldId='A'.repeat(43),newId='B'.repeat(43),first='item-0_example';
  let requestBeforePublish=false,timerBeforePublish=false,timer,request,probe;
  const server=http.createServer((_req,res)=>{
   requestBeforePublish=f.catalog.state.targets[first].dataId===oldId&&f.processed()<f.count;
   res.end('ok');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const get=()=>new Promise((resolve,reject)=>{
   request=http.get({host:'127.0.0.1',port:server.address().port},res=>{
    let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve(body));res.on('error',reject);
   });
   request.on('error',reject);
  });
  t.after(async()=>{clearTimeout(timer);request?.destroy();await new Promise(resolve=>server.close(resolve));});
  await get();requestBeforePublish=false; // Established socket avoids connect-time variation.
  f.onRecord(index=>{if(index===32){
   probe=get();
   timer=setTimeout(()=>{timerBeforePublish=f.catalog.state.targets[first].dataId===oldId&&f.processed()<f.count;},0);
  }});
  await f.run();
  assert.equal(await probe,'ok');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requestBeforePublish,true,'HTTP responds while the verified replacement is still being decoded');
  assert.equal(timerBeforePublish,true,'timer/deadline work runs while decoding');
  assert.equal(f.processed(),f.count);
  assert.equal(Object.keys(f.catalog.state.targets).length,f.count);
  assert.equal(f.catalog.state.targets[first].dataId,newId);
  assert.equal(JSON.parse(fs.readFileSync(f.catalog.file)).targets[first].dataId,newId);
 });
}
