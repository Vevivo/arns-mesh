import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('shell lifecycle and privileged IPC with Electron doubles (not a browser acceptance test)',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-shell-'));
 process.env.ARNS_MESH_USER_DATA=dir;process.env.BROWSER_TEST_CORE_ROOT=fileURLToPath(new URL('..',import.meta.url));
 const electron=new URL('./fixtures/browser-electron.mjs',import.meta.url).href;
 const adapter=new URL('./fixtures/browser-adapter.mjs',import.meta.url).href;
 const hook=registerHooks({resolve(specifier,context,next){if(specifier==='electron')return {url:electron,shortCircuit:true};if(specifier==='../helper/core-adapter.mjs'&&context.parentURL.endsWith('/browser/main.mjs'))return {url:adapter,shortCircuit:true};return next(specifier,context);}});
 const fake=await import(electron);
 try{
   await import('../apps/browser/main.mjs');
   for(let i=0;i<100&&fake.views.length<2&&!fake.errors.length;i++)await new Promise(r=>setTimeout(r,10));
   await new Promise(r=>setTimeout(r,10));assert.deepEqual(fake.errors,[]);assert.equal(fake.views.length,2);
   const toolbar=fake.views[0],content=fake.views[1];
   const event={sender:toolbar.webContents,senderFrame:toolbar.webContents.mainFrame};
   const call=(name,...args)=>fake.handlers.get(name)(event,...args);
   assert.throws(()=>fake.handlers.get('navigate')({sender:content.webContents,senderFrame:content.webContents.mainFrame},'unit-one'),/untrusted/);
   assert.throws(()=>fake.handlers.get('navigate')({...event,senderFrame:{url:'arnsui://app/index.html'}},'unit-one'),/untrusted/);
   await call('navigate','unit-one/path?q=1');assert.equal(content.webContents.response.status,502);
   assert.deepEqual(await call('import-profile'),{canceled:true});
   const profileFile=path.join(dir,'profile.json');fs.writeFileSync(profileFile,JSON.stringify({schema:'arns-mesh-network-profile/v1',directPeers:['127.0.0.1:49741'],rpcSources:['127.0.0.1:8899'],arweavePeers:[]}));
   fake.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[profileFile]});
   assert.deepEqual(await call('import-profile'),{imported:true,meshPeers:1,rpcSources:1});
   assert.equal(call('get-settings').rpcSources,'127.0.0.1:8899');
   const exportFile=path.join(dir,'exported.json');
   fake.dialog.showSaveDialog=async()=>({canceled:false,filePath:exportFile});
   assert.deepEqual(await call('export-profile'),{exported:true});
   assert.deepEqual(JSON.parse(fs.readFileSync(exportFile)),call('get-settings').connectionProfile);
   assert.throws(()=>fake.handlers.get('export-profile')({sender:content.webContents,senderFrame:content.webContents.mainFrame}),/untrusted/);
   await call('navigate','unit-one/path?q=1');assert.equal(content.webContents.response.status,200);
   await call('reload');await content.webContents.pendingReload;
   assert.equal(fake.messages.at(-1).data.phase,'loaded');assert.equal(fake.messages.at(-1).data.progress.stages.find(x=>x.id==='open').status,'done');
   // Electron emits did-start-navigation before will-navigate. A rejected
   // link must never throw in main or replace the current address.
   for(const url of ['https://files_example.ar.io/','ar://bad:80/','file:///tmp/test']){
     assert.doesNotThrow(()=>content.webContents.emit('did-start-navigation',{},url,false,true));
     let canceled=false;content.webContents.emit('will-navigate',{preventDefault(){canceled=true;}},url);
     assert.equal(canceled,true);assert.equal(fake.messages.at(-1).data.url,'ar://unit-one/path?q=1');
     assert.match(fake.messages.at(-1).data.message,/link blocked/);
   }
   const csp={level:'error',message:'Loading the script \'https://cdn.example/script.js\' violates the following Content Security Policy directive: "script-src self". The action has been blocked.'};
   content.webContents.emit('console-message',csp);content.webContents.emit('console-message',csp);
   assert.equal(fake.messages.at(-1).data.phase,'partial');assert.equal(fake.messages.at(-1).data.resources.blocked,1);
   assert.equal(fake.messages.at(-1).data.meta.contentSignatureVerified,true);
   await call('reload');await content.webContents.pendingReload;
   assert.equal(fake.messages.at(-1).data.phase,'loaded');assert.equal(fake.messages.at(-1).data.resources.blocked,0);
   await call('toggle-bookmark');assert.equal(call('get-browser-data').bookmarks.length,1);
   const id=await call('new-tab','unit-two');assert.equal(fake.views.length,3);assert.notEqual(fake.views[1].webContents.session,fake.views[2].webContents.session);
   let blocked;fake.views[2].webContents.session.webRequest.filter({url:'https://example.com/',resourceType:'script'},r=>blocked=r.cancel);assert.equal(blocked,true);
   const https=fake.views[2].webContents.session.protocol.rows.get('https');assert.equal(typeof https,'function');
   assert.equal((await https(new Request('https://arweave.net/graphql'))).status,403);
   assert.equal((await https(new Request('https://arweave.net/'+'A'.repeat(43),{method:'POST',body:'not forwarded'}))).status,405);
   await call('close-tab',id);assert.equal(fake.views[2].webContents.isDestroyed(),true);
   await call('ready');const state=fake.messages.at(-1).data;assert.equal(state.tabs.length,1);assert.equal(state.url,'ar://unit-one/path?q=1');assert.equal(state.bookmarked,true);
   assert.equal(content.options.webPreferences.sandbox,true);assert.equal(content.options.webPreferences.nodeIntegration,false);assert.equal(content.options.webPreferences.preload,undefined);
   assert.equal(state.peer.serving,false);assert.equal(state.discovery.enabled,false);assert.equal(state.network.requests,0);
 }finally{fake.app.quit();hook.deregister();fs.rmSync(dir,{recursive:true,force:true});}
});
