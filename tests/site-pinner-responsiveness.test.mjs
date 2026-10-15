import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {setImmediate as yieldToEventLoop} from 'node:timers/promises';

const source=await readFile(new URL('../src/site-pinner.mjs',import.meta.url),'utf8');
// Execute the production class. Fake persistence counts checkpoints without
// writing fixtures; existing integration tests cover signature verification.
function harness({children=64,missing=true,oldReady=false,tickMs=0}={}){
 const root='a'.repeat(43),oldRoot='z'.repeat(43),childIds=Array.from({length:children},(_,i)=>String(i).padStart(43,'b'));
 const writes=[],events=[],fetched=[];let clock=Date.now();
 const snapshots={get:()=>null};
 const store={pins:{},has:id=>id===root||id===oldRoot||(!missing&&childIds.includes(id)),async pin(id,group){store.pins[group]=[...new Set([...(store.pins[group]||[]),id])];},unpin(group){events.push('unpin:'+group);delete store.pins[group];}};
 const fs={readFileSync(){throw new Error('ENOENT');},writeFileSync(file,value){writes.push(JSON.parse(value));events.push('write');},renameSync(){}};
 const context={fs,crypto,verifyStoredContent:async()=>{throw new Error('unexpected verification');},decodeVerifiedPayload:async direct=>({body:direct.payload}),createSwarmMeshClient:()=>({setName(){},async stop(){}}),fetchMeshContent:null,validArName:()=>true,validDataId:id=>/^[A-Za-z0-9_-]{43}$/.test(id),manifestTargetIds:m=>Object.values(m.paths).map(x=>x.id),validateSnapshot:s=>s,discoverArweaveReferences:()=>({ids:[],truncated:false}),yieldToEventLoop,Date:class extends Date{static now(){return clock;}}};
 const C=vm.runInNewContext(source.slice(source.indexOf('const completedRow=')).replace('export class SitePinner','class SitePinner')+'\nSitePinner',context);
 const snapshot={name:'test',txId:root,observedAt:'2026-10-13T00:00:00.000Z',provenance:{kind:'local-rpc'}};
 const fetchContent=async id=>{fetched.push(id);clock+=tickMs;if(id===root)return {direct:{tags:[{name:'Content-Type',value:'application/x.arweave-manifest'}],payload:Buffer.from(JSON.stringify({manifest:'arweave/paths',paths:Object.fromEntries(childIds.map(id=>[id,{id}]))}))}};if(missing)throw new Error('content_not_saved');return {direct:{tags:[],payload:Buffer.from('plain')}};};
 // This isolated VM harness exercises the legacy preparation scheduler. It
 // strips module imports; protected-profile enforcement has integration tests.
 const pinner=new C({file:'memory-only',snapshots,contentStore:store,fetchContent,getNameContext:()=>null});
 if(oldReady){const oldSnapshot={...snapshot,txId:oldRoot};store.pins.test=[oldRoot];pinner.rows.test={name:'test',rootDataId:oldRoot,observedAt:oldSnapshot.observedAt,snapshot:oldSnapshot,pinGroup:'test',contentDecodingVersion:1,status:'document-saved',total:1,saved:1,failed:0};}
 return {pinner,snapshot,store,writes,events,fetched,root,childIds};
}

test('immediate local misses allow the preparation deadline to interrupt work',async()=>{
 const h=harness(),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new Error('site_preparation_timeout')),0);
 try{
  // Make the deadline due, including on Windows, without running it early.
  const until=performance.now()+25;while(performance.now()<until){}
  const row=await h.pinner.run('test',h.snapshot,{signal:controller.signal,contentSources:'local-only'});
  assert.equal(controller.signal.aborted,true);
  assert.ok(h.fetched.length<65,'must stop before draining every missing child');
  assert.equal(row.status,'partial');
  assert.ok(row.errors.some(error=>error.error==='site_preparation_timeout'));
  assert.ok(h.writes.length<=4,'missing children must not each rewrite the complete catalogue');
  assert.equal(h.writes.at(-1).test.status,'partial');
 }finally{clearTimeout(timer);}
});

test('successful preparation commits before releasing the previous ready version',async()=>{
 const h=harness({children:8,missing:false,oldReady:true});
 const row=await h.pinner.run('test',h.snapshot,{contentSources:'local-only'});
 assert.equal(row.status,'manifest-saved');assert.equal(row.saved,9);assert.equal(row.total,9);assert.equal(row.failed,0);
 assert.equal(h.writes.length,3);
 assert.equal(h.writes[0].test.rootDataId,'z'.repeat(43));assert.equal(h.writes[1].test.rootDataId,'z'.repeat(43));
 assert.equal(h.writes[2].test.rootDataId,h.root);assert.equal(h.events.at(-1),'unpin:test');
 assert.equal(h.pinner.isReady(h.pinner.rows.test),true);
});

test('partial preparation preserves the previous ready binding and pins',async()=>{
 const h=harness({oldReady:true});
 const row=await h.pinner.run('test',h.snapshot,{contentSources:'local-only'});
 assert.equal(row.status,'partial');assert.equal(row.failed,64);assert.equal(h.writes.length,3);
 assert.equal(h.pinner.rows.test.rootDataId,'z'.repeat(43));assert.ok(h.store.pins.test);
 assert.equal(h.pinner.isReady(h.pinner.rows.test),true);
 assert.equal(h.writes.at(-1).test.update.status,'partial');
});

test('long preparation persists progress at one-second intervals',async()=>{
 const h=harness({tickMs:100});
 await h.pinner.run('test',h.snapshot,{contentSources:'local-only'});
 assert.equal(h.writes.length,9);
 assert.equal(h.writes[2].test.failed,10);assert.equal(h.writes[7].test.failed,60);
 assert.equal(h.writes.at(-1).test.failed,64);
});
