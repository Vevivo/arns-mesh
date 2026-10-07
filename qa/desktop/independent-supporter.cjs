// Packaged Windows Electron acceptance: empty reader, absent original seed,
// real numeric-IP UDP rendezvous, real signed files, separate name publisher.
// This is a synthetic loopback topology, not an independent-provider outage.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const output=path.resolve(process.env.QA_OUTPUT),data=path.join(output,'fresh-reader');
fs.mkdirSync(output,{recursive:true});
const report={schema:'arns-mesh-windows-cold-supporter/v1',startedAt:new Date().toISOString(),freshReader:true,originalSeedNeverStarted:true,realSignedFiles:true,realPublicContent:false,osFirewall:false,sameMachineFixture:true,checks:[],errors:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));let app,browser,fixture,state;
const save=()=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
async function fixtureMessage(message,match,timeout=20000){
 return new Promise((resolve,reject)=>{
  const done=(error,value)=>{clearTimeout(timer);fixture.off('message',onMessage);fixture.off('exit',onExit);fixture.off('error',onError);error?reject(error):resolve(value);};
  const onMessage=m=>{if(m.fixtureError)done(new Error(m.fixtureError));else if(match(m))done(null,m);};
  const onExit=code=>done(new Error('Fixture exited before response: '+code));
  const onError=error=>done(error);
  const timer=setTimeout(()=>done(new Error('Fixture response timeout')),timeout);
  fixture.on('message',onMessage);fixture.once('exit',onExit);fixture.once('error',onError);if(message)fixture.send(message);
 });
}
async function launch({restored=false}={}){
 const log=fs.openSync(path.join(output,'electron.log'),'a');
 app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env:{...process.env,ARNS_MESH_USER_DATA:data},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 for(let i=0;i<80;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:800});break;}catch(e){if(i===79)throw e;await pause(300);}}
 let ui;for(let i=0;i<50;i++){ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()==='arnsui://app/index.html');if(ui)break;await pause(200);}
 assert.ok(ui,'Real Electron toolbar must load');ui.setDefaultTimeout(20000);ui.on('pageerror',e=>report.errors.push(e.message));
 // The toolbar exists before main.start() has finished newTab(). The latter
 // awaits Home's load, then sends focusAddress:true, which closes any panel.
 // On a joined restart, wait for that visible startup state before opening
 // Settings; otherwise its late focus event can close the panel mid-check.
 let home;for(let i=0;i<80;i++){home=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('arnsui://app/welcome.html'));if(home)break;await pause(200);}
 assert.ok(home,'Initial Home tab must load');
 await home.waitForLoadState('load',{timeout:30000});
 await home.locator('#mesh-query').waitFor({timeout:30000});
 if(restored)await ui.waitForFunction(()=>document.activeElement?.id==='address'&&document.querySelector('#settings-panel')?.classList.contains('hidden')&&document.querySelector('#tabs [aria-selected="true"]'),null,{timeout:30000});
 return ui;
}
async function closeApplication(){
 if(browser){await browser.close().catch(()=>{});browser=null;}
 if(app&&app.exitCode===null)cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
 for(let i=0;i<30&&app&&app.exitCode===null;i++)await pause(100);
 if(app)assert.notEqual(app.exitCode,null,'Owned Electron process must exit before restart');
 app=null;await pause(300);
}
(async()=>{try{
 assert.ok(!fs.existsSync(data),'Reader starts with no profile, learned peers, names or files');
 fixture=cp.fork(path.join(__dirname,'independent-supporter-peer.mjs'),[],{env:process.env,stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
 state=await fixtureMessage(null,m=>m.ready,45000);
 assert.equal(state.originalSeedNeverStarted,true);assert.equal(state.providerJoinedWithoutOriginal,true);
 assert.equal(state.privateAuthorityFileOnProvider,false);assert.equal(state.remoteFetch,false);assert.notEqual(state.publisherId,state.providerId);
 report.networkId=state.networkId;report.originalSeed=state.originalSeed;report.provider=state.provider;report.publisherId=state.publisherId;report.providerId=state.providerId;
 report.checks.push('Fresh supporter joined its durable signed invitation while the original seed never listened');
 let ui=await launch();await ui.locator('#address').waitFor();
 if(!await ui.locator('#settings-panel').isVisible())await ui.locator('#settings-button').click();
 await ui.locator('#network-code').fill(state.code);await ui.locator('#inspect-network').click();
 await ui.locator('#network-preview-name').filter({hasText:'QA independent supporter'}).waitFor();
 assert.match(await ui.locator('#network-preview-details').textContent(),/Durable network definition/);
 await ui.locator('#join-network').click();
 await ui.locator('#joined-network-name').filter({hasText:'QA independent supporter'}).waitFor();
 await ui.locator('#peer-discovery-status').filter({hasText:'1 learned peer addresses'}).waitFor({timeout:90000});
 const configured=JSON.parse(fs.readFileSync(path.join(data,'mesh-ip-peers.json'),'utf8'));
 assert.deepEqual(configured,[state.originalSeed],'Only the absent seed is configured; B must not be injected');
 const learned=JSON.parse(fs.readFileSync(path.join(data,'peer-directory.json'),'utf8'));
 assert.ok(JSON.stringify(learned).includes(state.provider),'B address was learned and persisted');
 assert.equal(JSON.stringify(learned).includes(state.publisherId),false,'The address record identifies B, not the name publisher');
 const first=(await fixtureMessage('status',m=>m.status)).status;assert.ok(first.identityChecks>0,'Learned B must pass an HTTP identity challenge');
 report.identityChecks=first.identityChecks;
 await ui.screenshot({path:path.join(output,'01-cold-join-discovered.png')});
 report.checks.push('Empty packaged reader checked and joined through Settings, then discovered B through local numeric-IP DHT and verified its HTTP identity');
 await ui.getByRole('button',{name:'Close settings',exact:true}).click();
 await ui.locator('#address').fill('ar://'+state.name+'/');await ui.locator('#open-address').click();
 await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"]')?.classList.contains('done')||document.querySelector('#access-stages .error'),null,{timeout:95000});
 report.navigation={stages:await ui.locator('#access-stages').innerText(),proof:await ui.locator('#proof').innerText()};save();
 assert.equal(await ui.locator('#access-stages [data-stage="open"]').evaluate(e=>e.classList.contains('done')),true,'The ArNS page must open through discovered B');
 let page;for(let i=0;i<60;i++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('ar://'+state.name+'/'));if(page)break;await pause(200);}
 assert.ok(page,'Rendered ArNS target must exist');page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.locator('#script-status').filter({hasText:'Local JavaScript loaded'}).waitFor();
 assert.equal(await page.locator('h1').innerText(),'A verified page, opened locally.');
 await page.waitForFunction(()=>[...document.images].length>0&&[...document.images].every(image=>image.complete&&image.naturalWidth>0));
 assert.equal(await page.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),true);
 const colour=await page.locator('h1').evaluate(node=>getComputedStyle(node).color);assert.equal(colour,'rgb(84, 39, 200)','Signed CSS must load');
 await page.screenshot({path:path.join(output,'02-cold-signed-page.png'),fullPage:true});
 const final=(await fixtureMessage('status',m=>m.status)).status;
 assert.ok(final.contentChunksServed>=5);assert.ok(final.contentBytesServed>0);assert.equal(final.remoteFetch,false);assert.equal(final.originalSeedNeverStarted,true);
 report.serving=final;report.target=state.manifest;
 report.checks.push('The real renderer opened the accepted original publisher binding and verified ANS-104 manifest, HTML, CSS, JavaScript and SVG served only by B');
 report.checks.push('Original seed absence checked again; B remote fetching disabled; discovered B was not promoted to name authority');
 // Retain only the joined profile/routes for the restart check. Removing our
 // disposable reader content forces fresh verified bytes from B, not a warm cache.
 await closeApplication();
 const contentPath=path.resolve(data,'content');
 assert.equal(path.dirname(contentPath),data);assert.equal(path.dirname(data),output);
 fs.rmSync(contentPath,{recursive:true,force:true});
 assert.ok(fs.existsSync(path.join(data,'peer-directory.json')));
 ui=await launch({restored:true});await ui.locator('#address').waitFor();
 if(!await ui.locator('#settings-panel').isVisible())await ui.locator('#settings-button').click();
 await ui.locator('#joined-network-name').filter({hasText:'QA independent supporter'}).waitFor();
 await ui.locator('#peer-discovery-status').filter({hasText:'1 learned peer addresses'}).waitFor({timeout:30000});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'mesh-ip-peers.json'),'utf8')),[state.originalSeed]);
 await ui.getByRole('button',{name:'Close settings',exact:true}).click();
 await ui.locator('#address').fill('ar://'+state.name+'/');await ui.locator('#open-address').click();
 await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"]')?.classList.contains('done')||document.querySelector('#access-stages .error'),null,{timeout:95000});
 assert.equal(await ui.locator('#access-stages [data-stage="open"]').evaluate(e=>e.classList.contains('done')),true,'Restarted reader must open through its retained supporter route');
 let reopened;for(let i=0;i<60;i++){reopened=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('ar://'+state.name+'/'));if(reopened)break;await pause(200);}
 assert.ok(reopened);reopened.setDefaultTimeout(15000);
 await reopened.locator('#script-status').filter({hasText:'Local JavaScript loaded'}).waitFor();
 await reopened.waitForFunction(()=>[...document.images].length>0&&[...document.images].every(image=>image.complete&&image.naturalWidth>0));
 assert.equal(await reopened.locator('h1').innerText(),'A verified page, opened locally.');
 await reopened.screenshot({path:path.join(output,'03-restart-retained-route.png'),fullPage:true});
 const restarted=(await fixtureMessage('status',m=>m.status)).status;
 assert.ok(restarted.contentBytesServed>final.contentBytesServed,'Restart must retrieve bytes from B again after disposable reader cache removal');
 report.restart={passed:true,retainedProfile:true,retainedLearnedRoute:true,noCodeReentry:true,readerContentCacheCleared:true,additionalBytesServed:restarted.contentBytesServed-final.contentBytesServed,serving:restarted};
 report.checks.push('Electron restarted without rejoining; persisted B route reopened the signed page and fetched fresh bytes after only its disposable content cache was cleared');

 assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}
 finally{
  await closeApplication().catch(error=>{report.cleanupError=error.message;process.exitCode=1;});
  if(fixture&&fixture.exitCode===null){fixture.send('stop');for(let i=0;i<30&&fixture.exitCode===null;i++)await pause(100);if(fixture.exitCode===null)fixture.kill();}
  save();console.log(JSON.stringify(report));
 }
})();
