// Real Electron renderer test with synthetic signed content and loopback peers.
// This is not a public-name, physical-PC or operating-system outage test.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const output=path.resolve(process.env.QA_OUTPUT),data=path.join(output,'user-data');fs.mkdirSync(output,{recursive:true});
const report={scope:'Windows Electron search UI; synthetic signed documents and loopback catalogue; no live chain or OS-level outage claim',checks:[],errors:[]};
let app,browser,peerApp,peerRequests=0;const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function launch(){
 const log=fs.openSync(path.join(output,'electron.log'),'a');app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env:{...process.env,ARNS_MESH_USER_DATA:data},stdio:['ignore',log,log]});fs.closeSync(log);
 for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:1000});break;}catch(e){if(i===59)throw e;await pause(500);}}
 let ui,home;for(let i=0;i<40;i++){const pages=browser.contexts().flatMap(c=>c.pages());ui=pages.find(p=>p.url()==='arnsui://app/index.html');home=pages.find(p=>p.url().startsWith('arnsui://app/welcome.html'));if(ui&&home)break;await pause(250);}
 assert.ok(ui&&home,'toolbar and home loaded');for(const p of [ui,home]){p.setDefaultTimeout(12000);p.on('pageerror',e=>report.errors.push(e.message));}
 await home.locator('#mesh-query').waitFor();return {ui,home};
}
async function close(){if(browser){await browser.close();browser=null;}if(app&&app.exitCode===null){cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F']);await pause(500);}}
async function closeProvider(){if(!peerApp||peerApp.exitCode!==null)return;const child=peerApp;peerApp=null;await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.send('stop');});}
(async()=>{try{
 peerApp=cp.fork(path.join(__dirname,'search-peer.mjs'),[],{env:process.env,stdio:['ignore','inherit','inherit','ipc']});
 peerApp.on('message',message=>{if(message.request)peerRequests++;});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture peer startup timeout')),15000);peerApp.once('error',reject);peerApp.on('message',m=>{if(m.ready){clearTimeout(timer);resolve();}});});
 let {ui,home}=await launch();
 await home.locator('.refresh-catalogue').click();await home.locator('.catalogue-status').filter({hasText:'1 indexed site'}).waitFor();
 await home.locator('.refresh-catalogue').filter({hasText:'Refresh catalogue'}).waitFor();await pause(100);
 assert.ok(fs.existsSync(path.join(data,'search-cache.json')));report.checks.push('signed catalogue downloaded through real Home refresh');
 const before=peerRequests;await home.locator('#mesh-query').fill('verified');await home.getByRole('button',{name:/Search Mesh/}).click();await home.locator('.search-result h3 a').waitFor();
 assert.match(home.url(),/welcome.html\?q=verified$/);assert.equal(await home.locator('.search-result h3 a').innerText(),'Signed QA page');assert.equal(await ui.locator('#address').inputValue(),'');assert.equal(peerRequests,before);report.checks.push('GET form submits; topic query stays local; address bar remains empty');
 await home.screenshot({path:path.join(output,'01-search-results.png'),fullPage:true});
 const session=await home.context().newCDPSession(home);await session.send('Emulation.setDeviceMetricsOverride',{width:850,height:422,deviceScaleFactor:1,mobile:false});assert.equal(await home.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await home.screenshot({path:path.join(output,'02-compact-results.png'),fullPage:true});await session.send('Emulation.clearDeviceMetricsOverride');report.checks.push('850px layout has no horizontal overflow');
 await closeProvider();await close();
 fs.writeFileSync(path.join(data,'preferences.json'),JSON.stringify({accessPolicy:'saved',trustedPeers:[],witnessQuorum:2}));
 ({ui,home}=await launch());await home.locator('#mesh-query').fill('verified');await home.getByRole('button',{name:/Search Mesh/}).click();await home.locator('.search-result h3 a').waitFor();await home.screenshot({path:path.join(output,'03-offline-restart.png'),fullPage:true});report.checks.push('provider stopped; restarted Saved reader searches retained catalogue');
 await home.locator('.search-result h3 a').click();await home.locator('#script-status').filter({hasText:'Local JavaScript loaded'}).waitFor();assert.match(home.url(),/^ar:\/\/mesh-qa/);await ui.waitForFunction(()=>document.getElementById('address').value.startsWith('ar://mesh-qa'));assert.match(await ui.locator('#address').inputValue(),/^ar:\/\/mesh-qa/);report.checks.push('result opens signed local page through existing ArNS renderer');
 await ui.locator('#home').click();await home.locator('#mesh-query').waitFor();await ui.locator('#address').fill('ar://mesh-qa/');await ui.locator('#open-address').click();await home.locator('#script-status').filter({hasText:'Local JavaScript loaded'}).waitFor();report.checks.push('upper address bar still opens a known ArNS name');
 await ui.locator('#address').fill('unsent-draft');await pause(1200);assert.equal(await ui.locator('#address').inputValue(),'unsent-draft');report.checks.push('ordinary status updates preserve an unsent address draft');
 assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}
 finally{await closeProvider();await close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
