import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {homeQuery} from '../apps/browser/search-home.mjs';
const preload=await readFile(new URL('../apps/browser/home-preload.cjs',import.meta.url),'utf8');
const main=await readFile(new URL('../apps/browser/main.mjs',import.meta.url),'utf8');
const start=main.indexOf("  wc.on('ipc-message'"),end=main.indexOf('  const target=',start);
assert.ok(start>=0&&end>start,'test executes the production Home IPC listener');
const hook=main.slice(start,end);
function renderer(url,{subframe=false}={}){
 const sent=[],listeners={},window={},location={href:url};window.top=subframe?{}:window;let event=null,requires=0;
 const context={URL,window,location,document:{addEventListener:(name,fn,capture)=>{listeners[name]=fn;assert.equal(capture,true);}},require:name=>{requires++;assert.equal(name,'electron');return {ipcRenderer:{send:(...args)=>{assert.equal(event?.prevented,true,'cancel navigation before sending IPC');sent.push(args);}}};}};
 vm.runInNewContext(preload,context);
 return {sent,listeners,window,location,get requires(){return requires;},click(href,options={}){event={target:{closest:()=>({href})},button:0,prevented:false,preventDefault(){this.prevented=true;},...options};listeners.click?.(event);return event;}};
}
test('Home command clicks cancel navigation before narrow IPC; ordinary links remain ordinary',()=>{
 const r=renderer('arnsui://app/welcome.html?q=concert');
 assert.ok(r.listeners.click);
 assert.equal(r.click('arnsui://app/search-refresh').prevented,true);
 assert.equal(r.click('arnsui://app/connect').prevented,true);
 assert.deepEqual(r.sent,[['mesh-home-action','refresh'],['mesh-home-action','connect']]);
 assert.equal(r.click('ar://mesh-qa').prevented,false);
 assert.equal(r.click('arnsui://app/welcome.html?q=art').prevented,false);
 assert.equal(r.click('arnsui://app/search-refresh',{ctrlKey:true}).prevented,false);
 assert.equal(r.click('arnsui://app/search-refresh',{defaultPrevented:true}).prevented,false);
 assert.equal(r.sent.length,2);
 assert.deepEqual(Object.keys(r.window),['top'],'no page bridge is exposed');
 r.location.href='ar://mesh-qa';
 assert.equal(r.click('arnsui://app/search-refresh').prevented,false);
 assert.equal(r.sent.length,2,'a stale Home listener cannot act from another page');
});
test('the preload is inert on ArNS pages, malformed Home URLs and subframes',()=>{
 const urls=['ar://mesh-qa','https://app/welcome.html','arnsui://other/welcome.html','arnsui://app/welcome.html?q=a&q=b','arnsui://app/welcome.html#hash','arnsui://app/welcome.html?bad=1','arnsui://app/welcome.html?q='+'x'.repeat(161)];
 for(const url of urls){const r=renderer(url);assert.equal(r.listeners.click,undefined,url);assert.equal(r.requires,0,url);}
 const sub=renderer('arnsui://app/welcome.html',{subframe:true});assert.equal(sub.listeners.click,undefined);assert.equal(sub.requires,0);
});
test('main accepts only known Home tabs and their current main frame',()=>{
 const actions=[],tab={id:1},rows=new Map([[1,tab]]),frame={url:'arnsui://app/welcome.html'};let listener;
 const wc={mainFrame:frame,getURL:()=>frame.url,on:(name,fn)=>{assert.equal(name,'ipc-message');listener=fn;}};
 vm.runInNewContext(hook,{wc,tab,tabs:{rows},homeQuery,send:value=>actions.push(value.command),syncSearch:async options=>{assert.equal(options.force,true);actions.push('refresh');},report:()=>assert.fail('unexpected IPC error')});
 const event={sender:wc,senderFrame:frame};
 listener(event,'mesh-home-action','refresh');listener(event,'mesh-home-action','connect');assert.deepEqual(actions,['refresh','settings']);
 listener(event,'other','refresh');listener(event,'mesh-home-action','navigate');
 listener({...event,sender:{}},'mesh-home-action','refresh');
 listener({...event,senderFrame:{url:frame.url}},'mesh-home-action','refresh');
 rows.delete(1);listener(event,'mesh-home-action','refresh');
 rows.set(1,{id:1});listener(event,'mesh-home-action','refresh');rows.set(1,tab);
 frame.url='ar://mesh-qa';listener(event,'mesh-home-action','refresh');frame.url='arnsui://app/welcome.html';
 wc.getURL=()=> 'ar://mesh-qa';listener(event,'mesh-home-action','refresh');
 assert.deepEqual(actions,['refresh','settings'],'wrong sender/frame, stale tab and ArNS documents cannot invoke commands');
});
