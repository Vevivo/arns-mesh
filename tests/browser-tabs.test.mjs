import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Tabs} from '../apps/browser/tabs.mjs';
import {BrowserState,normalizeAddress} from '../apps/browser/browser-state.mjs';
import {contentResponse,isAllowedRendererUrl} from '../apps/browser/response.mjs';

test('tab navigation, switching and close own separate cancellation epochs',()=>{
  const tabs=new Tabs(),a=tabs.create(),b=tabs.create();
  const first=tabs.begin(a.id,'ar://docs_example/path?q=1#section');
  const second=tabs.begin(b.id,'another');
  tabs.activate(a.id);assert.equal(first.signal.aborted,false);assert.equal(second.signal.aborted,false);
  tabs.stop(a.id);assert.equal(first.signal.aborted,true);assert.equal(second.signal.aborted,false);
  assert.equal(tabs.isCurrent(a,first.epoch),false);assert.equal(tabs.isCurrent(b,second.epoch),true);
  tabs.close(a.id);assert.equal(tabs.activeId,b.id);assert.equal(second.signal.aborted,false);
  tabs.close(b.id);assert.equal(second.signal.aborted,true);assert.equal(tabs.rows.size,0);
});
test('tab cap and invalid addresses do not allocate a tab or abort another load',()=>{
  const tabs=new Tabs({limit:2}),a=tabs.create(),state=tabs.begin(a.id,'example');
  assert.throws(()=>tabs.create('https://example.com'));assert.equal(tabs.rows.size,1);
  assert.throws(()=>tabs.begin(a.id,'ar://user:pass@example'));assert.equal(state.signal.aborted,false);
  tabs.create();assert.throws(()=>tabs.create(),/limit/);assert.equal(tabs.rows.size,2);
});
test('address retains undername path query and fragment without a search engine',()=>{
  assert.equal(normalizeAddress('docs_Example/a/b?q=hello%20world#part'),'ar://docs_example/a/b?q=hello%20world#part');
  assert.equal(normalizeAddress('example'),'ar://example/');
  for(const bad of ['https://example.com','ar://example:443/','ar://example.com','file:///tmp/a','javascript:alert(1)','a b','a'.repeat(4097)])assert.throws(()=>normalizeAddress(bad));
});
test('bookmarks and history persist independently of cached content',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-bookmarks-'));try{
    const file=path.join(dir,'state.json'),first=new BrowserState(file);
    assert.equal(first.toggle('example/path?q=1#part','A page'),true);first.visit('example/path?q=1#part','A page');
    const next=new BrowserState(file);assert.equal(next.has('ar://example/path?q=1#part'),true);assert.equal(next.snapshot().history.length,1);
    next.clearHistory();assert.equal(next.has('ar://example/path?q=1#part'),true);assert.equal(next.snapshot().history.length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('range/HEAD use only verified bytes and reject invalid ranges',async()=>{
  const result={body:Buffer.from('0123456789'),contentType:'text/plain',meta:{contentSignatureVerified:true}};
  for(const [range,wanted] of [['bytes=2-5','2345'],['bytes=-3','789'],['bytes=8-','89']]){
    const response=contentResponse(result,new Request('ar://example/',{headers:{range}}));assert.equal(response.status,206);assert.equal(await response.text(),wanted);
  }
  const head=contentResponse(result,new Request('ar://example/',{method:'HEAD'}));assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
  for(const range of ['bytes=99-','bytes=5-2','bytes=-0','bytes=0-1,3-4'])assert.equal(contentResponse(result,new Request('ar://example/',{headers:{range}})).status,416);
  assert.throws(()=>contentResponse({...result,meta:{}},new Request('ar://example/')),/unverified/);
});
test('renderer denies external domains, external IPs, file and privileged UI pages',()=>{
  for(const url of ['https://ar.io/a','http://192.0.2.10:49740/','ws://127.0.0.1/','file:///etc/passwd','arnsui://app/index.html','ar://user:pass@example/','ar://example:80/'])assert.equal(isAllowedRendererUrl(url),false,url);
  for(const url of ['ar://docs_example/a?q=1','arnsui://app/welcome.html','arnsui://app/welcome.css','data:image/png;base64,eA==','blob:ar://example/abc'])assert.equal(isAllowedRendererUrl(url),true,url);
});
