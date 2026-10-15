import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {CatalogWorker} from '../src/catalog-worker.mjs';

function readyFixture(){
 const names=Array.from({length:13000},(_,i)=>'ready-'+i),txId='A'.repeat(43),rows=Object.fromEntries(names.map(name=>[name,{rootDataId:txId}]));
 let checked=0,started=0,onRecord=()=>{};
 const worker={
  getNameContext:()=>null,snapshotStore:{names:()=>names,get:name=>{checked++;onRecord(checked);return {name,txId};}},
  peer:{contentStore:{has:()=>true}},
  pinner:{rows,isReady:()=>true,needsDecodingAudit:()=>false,start:async()=>{started++;throw new Error('ready_site_reprepared');}},
  maxPreparedSites:20000,state:{prepareCursor:0}
 };
 return {worker,total:names.length,checked:()=>checked,started:()=>started,onRecord:fn=>{onRecord=fn;},run:signal=>CatalogWorker.prototype.prepareOne.call(worker,signal)};
}
test('ready-site scan handles cancellation without starting preparation',{timeout:15000},async t=>{
 const f=readyFixture(),controller=new AbortController();let abortJob;
 t.after(()=>{if(abortJob)clearImmediate(abortJob);});
 f.onRecord(checked=>{if(checked===33)abortJob=setImmediate(()=>controller.abort(new Error('cancel_ready_scan')));});
 await assert.rejects(f.run(controller.signal),/cancel_ready_scan/);
 assert.ok(f.checked()>32&&f.checked()<f.total,'cancelled after inspecting names, before exhausting the catalogue');
 assert.equal(f.started(),0);
 assert.equal(f.worker.state.prepareCursor,f.checked());
});
test('ready-site scan serves HTTP and timer work before finishing a large catalogue',{timeout:15000},async t=>{
 const f=readyFixture();let requestBeforeEnd=false,timerBeforeEnd=false,request,timer,probe;
 const server=http.createServer((_req,res)=>{requestBeforeEnd=f.checked()>32&&f.checked()<f.total;res.end('ok');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const get=()=>new Promise((resolve,reject)=>{
  request=http.get({host:'127.0.0.1',port:server.address().port},res=>{
   let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve(body));res.on('error',reject);
  });request.on('error',reject);
 });
 t.after(async()=>{clearTimeout(timer);request?.destroy();await new Promise(resolve=>server.close(resolve));});
 await get();requestBeforeEnd=false;
 f.onRecord(checked=>{if(checked===33){
  probe=get();timer=setTimeout(()=>{timerBeforeEnd=f.checked()>32&&f.checked()<f.total;},0);
 }});
 await f.run();
 assert.equal(await probe,'ok');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requestBeforeEnd,true,'a peer request is served while ready candidates are skipped');
 assert.equal(timerBeforeEnd,true,'preparation deadlines can run during the ready-candidate scan');
 assert.equal(f.checked(),f.total);assert.equal(f.started(),0);assert.equal(f.worker.state.prepareCursor,0);
});
