// Real Electron renderer test with synthetic signed content and loopback peers.
// This is not a public-name, physical-PC or operating-system outage test.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const output=path.resolve(process.env.QA_OUTPUT),data=path.join(output,'user-data');fs.mkdirSync(output,{recursive:true});
const report={scope:'Windows Electron search UI; synthetic signed documents and loopback catalogue; no live chain or OS-level outage claim',checks:[],errors:[]};
let app,browser,server;const pause=ms=>new Promise(r=>setTimeout(r,ms));
const moduleAt=rel=>import(pathToFileURL(path.resolve(__dirname,'../..',rel)).href);
async function launch(){
 const log=fs.openSync(path.join(output,'electron.log'),'a');app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env:{...process.env,ARNS_MESH_USER_DATA:data},stdio:['ignore',log,log]});fs.closeSync(log);
 for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:1000});break;}catch(e){if(i===59)throw e;await pause(500);}}
 let ui,home;for(let i=0;i<40;i++){const pages=browser.contexts().flatMap(c=>c.pages());ui=pages.find(p=>p.url()==='arnsui://app/index.html');home=pages.find(p=>p.url().startsWith('arnsui://app/welcome.html'));if(ui&&home)break;await pause(250);}
 assert.ok(ui&&home,'toolbar and home loaded');for(const p of [ui,home]){p.setDefaultTimeout(12000);p.on('pageerror',e=>report.errors.push(e.message));}
 await home.locator('#mesh-query').waitFor();return {ui,home};
}
async function close(){if(browser){await browser.close();browser=null;}if(app&&app.exitCode===null){cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F']);await pause(500);}}
(async()=>{try{
 const {seed}=await moduleAt('qa/desktop/seed-saved-fixture.mjs');await seed(data);
 const [{SearchPublisher},{NameSnapshotStore},{VerifiedContentStore},{peerIdFromPublicKey,signRecord},{startDirectPeerServer},{applyProfile}]=await Promise.all(['src/search-catalog.mjs','src/name-snapshots.mjs','src/content-store.mjs','src/common.mjs','src/direct-peer.mjs','apps/helper/network-profile.mjs'].map(moduleAt));
 const keys=crypto.generateKeyPairSync('ed25519'),publicKeyPem=keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem=keys.privateKey.export({format:'pem',type:'pkcs8'}),witnessPeerId=peerIdFromPublicKey(publicKeyPem);
 const sign=record=>{const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId,witnessPublicKeyPem:publicKeyPem,recordJson,signature:signRecord(recordJson,privateKeyPem)};};
 const publisher=new SearchPublisher({file:path.join(output,'publisher.json'),snapshots:new NameSnapshotStore(path.join(data,'name-snapshots.json')),contentStore:new VerifiedContentStore(path.join(data,'content')),sign});await publisher.pass();assert.equal(publisher.record.entries.length,1);
 const peer={identity:{},requestsServed:0,_handleAsync(req){assert.equal(req.op,'catalog');assert.equal(Object.hasOwn(req,'query'),false);return publisher.reply();}};
 server=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0});
 applyProfile(data,{schema:'arns-mesh-network-profile/v1',directPeers:['127.0.0.1:'+server.address.port],rpcSources:['127.0.0.1:59003'],arweavePeers:[],trustedPeers:[witnessPeerId]});
 fs.writeFileSync(path.join(data,'preferences.json'),JSON.stringify({accessPolicy:'auto',trustedPeers:[],witnessQuorum:2}));
 let {ui,home}=await launch();
 await home.locator('.refresh-catalogue').click();await home.locator('.catalogue-status').filter({hasText:'1 indexed sites'}).waitFor();
 assert.ok(fs.existsSync(path.join(data,'search-cache.json')));report.checks.push('signed catalogue downloaded through real Home refresh');
 const before=peer.requestsServed;await home.locator('#mesh-query').fill('verified');await home.getByRole('button',{name:/Search Mesh/}).click();await home.locator('.search-result h3 a').waitFor();
 assert.match(home.url(),/welcome.html\?q=verified$/);assert.equal(await home.locator('.search-result h3 a').innerText(),'Signed QA page');assert.equal(await ui.locator('#address').inputValue(),'');assert.equal(peer.requestsServed,before);report.checks.push('GET form submits; topic query stays local; address bar remains empty');
 await home.screenshot({path:path.join(output,'01-search-results.png'),fullPage:true});
 const session=await home.context().newCDPSession(home);await session.send('Emulation.setDeviceMetricsOverride',{width:850,height:422,deviceScaleFactor:1,mobile:false});assert.equal(await home.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await home.screenshot({path:path.join(output,'02-compact-results.png'),fullPage:true});await session.send('Emulation.clearDeviceMetricsOverride');report.checks.push('850px layout has no horizontal overflow');
 await server.close();server=null;await close();
 fs.writeFileSync(path.join(data,'preferences.json'),JSON.stringify({accessPolicy:'saved',trustedPeers:[],witnessQuorum:2}));
 ({ui,home}=await launch());await home.locator('#mesh-query').fill('verified');await home.getByRole('button',{name:/Search Mesh/}).click();await home.locator('.search-result h3 a').waitFor();await home.screenshot({path:path.join(output,'03-offline-restart.png'),fullPage:true});report.checks.push('provider stopped; restarted Saved reader searches retained catalogue');
 await home.locator('.search-result h3 a').click();await home.locator('#script-status').filter({hasText:'Local JavaScript loaded'}).waitFor();assert.match(home.url(),/^ar:\/\/mesh-qa/);assert.match(await ui.locator('#address').inputValue(),/^ar:\/\/mesh-qa/);report.checks.push('result opens signed local page through existing ArNS renderer');
 await ui.locator('#home').click();await home.locator('#mesh-query').waitFor();await ui.locator('#address').fill('ar://mesh-qa/');await ui.locator('#open-address').click();await home.locator('#script-status').filter({hasText:'Local JavaScript loaded'}).waitFor();report.checks.push('upper address bar still opens a known ArNS name');
 assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}
 finally{await server?.close();await close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
