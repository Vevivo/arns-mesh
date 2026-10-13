import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {SearchRefresh} from '../apps/browser/search-refresh.mjs';
import {searchHomeUpdateScript} from '../apps/browser/search-home.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('automatic catalogue refresh publishes results, coalesces force, and waits fifteen minutes after success',async()=>{
 let clock=0,calls=0,paints=0,pending=deferred();
 const job=new SearchRefresh({now:()=>clock,sync:()=>{calls++;return pending.promise;},onChange:()=>{paints++;}});
 const first=job.request();const forced=job.request({force:true});await tick();assert.equal(calls,1);
 pending.resolve({accepted:1});await Promise.all([first,forced]);assert.equal(paints,2);
 clock=899999;assert.equal((await job.request()).skipped,true);assert.equal(calls,1);
 clock=900000;pending=deferred();const next=job.request();await tick();assert.equal(calls,2);
 pending.resolve({accepted:1});await next;assert.equal(paints,4,'same-count updated entries also repaint');
 pending=deferred();const manual=job.request({force:true});await tick();assert.equal(calls,3);
 pending.resolve({accepted:1});await manual;job.stop();
});
test('resolved failures retain the catalogue, publish error, and retry at one minute',async()=>{
 let clock=0,calls=0,error=null;const catalogue={entries:['retained']},paints=[];
 const job=new SearchRefresh({now:()=>clock,sync:async()=>{calls++;error=calls===1?'offline':null;return {accepted:calls===1?0:1,error};},onChange:()=>{paints.push({entries:[...catalogue.entries],error});}});
 await job.request();assert.equal(paints.at(-1).error,'offline');assert.deepEqual(catalogue.entries,['retained']);
 clock=59999;assert.equal((await job.request()).skipped,true);
 clock=60000;await job.request();assert.equal(calls,2);assert.equal(paints.at(-1).error,null);assert.equal(job.nextAt,960000);job.stop();
});
test('rejected sync is handled during an asynchronous repaint and remains retryable',async()=>{
 let error;const painting=deferred();
 const job=new SearchRefresh({sync:()=>Promise.reject(new Error('unavailable')),onChange:()=>painting.promise,onError:e=>{error=e;}});
 const work=job.request();await tick();painting.resolve();await work;assert.equal(error,'unavailable');job.stop();
});
test('profile reset aborts the old observation and coalesces a fresh observation after it settles',async()=>{
 let clock=0,calls=0,firstSignal;const pending=deferred(),painted=[];
 const job=new SearchRefresh({now:()=>clock,sync:signal=>{calls++;if(calls===1){firstSignal=signal;return pending.promise;}return Promise.resolve({accepted:1});},onChange:()=>painted.push(calls)});
 const old=job.request();await tick();job.reset();assert.equal(firstSignal.aborted,true);
 const a=job.request(),b=job.request({force:true});pending.resolve({accepted:0,error:'aborted'});
 await Promise.all([old,a,b]);assert.equal(calls,2);assert.equal(job.nextAt,900000);assert.deepEqual(painted,[1,2,2]);job.stop();
});
test('saved mode and shutdown prevent pending or future fetches',async()=>{
 let enabled=false,calls=0;const job=new SearchRefresh({enabled:()=>enabled,sync:async()=>{calls++;return {accepted:1};}});
 await job.request({force:true});assert.equal(calls,0);
 enabled=true;const pending=job.request();enabled=false;job.reset();await pending;assert.equal(calls,0);
 enabled=true;await job.request();assert.equal(calls,1);job.stop();await job.request({force:true});assert.equal(calls,1);
});

test('Home updates replace results only and preserve draft, focus, selection, scroll and expanded details',()=>{
 const url='arnsui://app/welcome.html?q=music',draft={value:'unsent astronomy',selectionStart:3,selectionEnd:7},details={open:true},newDetails={open:false};
 const old={contains:()=>false,querySelector:()=>details,replaceWith:next=>{document.results=next;}},next={querySelector:()=>newDetails},scroll=[];
 const document={activeElement:draft,results:old,querySelector(){return this.results;}};
 const context={location:{href:url},document,scrollX:0,scrollY:240,scrollTo:(x,y)=>scroll.push([x,y]),DOMParser:class{parseFromString(){return {querySelector:()=>next};}}};
 assert.equal(vm.runInNewContext(searchHomeUpdateScript(url,'<section class="search-results">new</section>'),context),true);
 assert.equal(document.results,next);assert.equal(document.activeElement,draft);assert.equal(draft.value,'unsent astronomy');
 assert.equal(draft.selectionStart,3);assert.equal(draft.selectionEnd,7);assert.equal(newDetails.open,true);assert.deepEqual(scroll,[[0,240]]);
 context.location.href='ar://example';document.results=old;
 assert.equal(vm.runInNewContext(searchHomeUpdateScript(url,'<section>new</section>'),context),false);assert.equal(document.results,old);
 assert.throws(()=>searchHomeUpdateScript('ar://example',''),/invalid_search_home/);
});
test('results refresh restores a focused refresh link without stealing search input focus',()=>{
 const url='arnsui://app/welcome.html',focus=[];
 const active={tagName:'A',getAttribute:()=> 'arnsui://app/search-refresh'};
 const target={getAttribute:()=> 'arnsui://app/search-refresh',focus:options=>focus.push(options.preventScroll)};
 const next={querySelector:()=>null,querySelectorAll:()=>[target]};
 const context={location:{href:url},document:{activeElement:active,querySelector:()=>({contains:()=>true,querySelector:()=>null,replaceWith(){}})},scrollX:0,scrollY:0,scrollTo(){},DOMParser:class{parseFromString(){return {querySelector:()=>next};}}};
 assert.equal(vm.runInNewContext(searchHomeUpdateScript(url,'<section>updated</section>'),context),true);assert.deepEqual(focus,[true]);
});

test('deadline failures are visible and retryable; a saved-mode transition suppresses a late result',async()=>{
 let enabled=true,error=null,paints=0;const timeoutJob=new SearchRefresh({timeoutMs:5,onError:e=>{error=e;},onChange:()=>{paints++;},sync:signal=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})});
 const keepAlive=setTimeout(()=>{},1000);
 try{const result=await timeoutJob.request();assert.equal(result.accepted,0);assert.equal(error,'search_refresh_timeout');assert.equal(paints,2);}
 finally{clearTimeout(keepAlive);timeoutJob.stop();}
 const pending=deferred(),job=new SearchRefresh({enabled:()=>enabled,onChange:()=>{paints++;},sync:()=>pending.promise});
 const work=job.request();await tick();const before=paints;enabled=false;job.reset();pending.resolve({accepted:1});await work;
 assert.equal(paints,before);assert.equal((await job.request({force:true})).skipped,true);job.stop();
});
