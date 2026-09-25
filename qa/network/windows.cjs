// Real Windows UI acceptance. Local signed network announcements are controlled
// fixtures. Optional ArNS content uses the existing approved live source set.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {pathToFileURL}=require('node:url');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const out=path.resolve(process.env.QA_OUTPUT),repo=path.resolve(__dirname,'../..');fs.mkdirSync(out,{recursive:true});
const sourceProfile=JSON.parse(process.env.MESH_QA_PROFILE||'null');
const privateValues=sourceProfile?[...sourceProfile.directPeers,...sourceProfile.rpcSources,...sourceProfile.arweavePeers].flatMap(s=>[s,s.slice(0,s.lastIndexOf(':'))]).sort((a,b)=>b.length-a.length):[];
const sanitize=value=>{let text=typeof value==='string'?value:JSON.stringify(value);for(const value of privateValues)text=text.split(value).join('[operator-endpoint]');return text;};
const report={startedAt:new Date().toISOString(),scope:'Real Windows executable/UI, controlled signed network directory, optional existing live ArNS sources',osPacketCapture:false,independentHosts:false,licenseEnforcement:false,steps:[],rendererErrors:[]};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),sanitize(report));
const note=(id,data)=>{report.steps.push({id,...data});save();console.log(id,sanitize(data));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser,app,ui,dataDir;const peers=[];
async function startPeer(dir){
 const env={...process.env};delete env.MESH_QA_PROFILE;
 const child=cp.fork(path.join(__dirname,'peer.mjs'),[dir],{env,stdio:['ignore','ignore','pipe','ipc']});let seq=0;const pending=new Map();
 child.stderr.on('data',chunk=>fs.appendFileSync(path.join(out,'peer-private.log'),chunk));
 child.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.result);}});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Peer startup timeout'));},20000);child.on('message',m=>{if(m.ready){clearTimeout(timer);resolve(m);}});child.on('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Peer exited: '+code));});});
 const result={...ready,dir,child,call(action,extra={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(new Error('Peer command timeout')),20000);pending.set(id,{resolve,reject,timer});child.send({id,action,...extra});});},async close(){if(child.exitCode!==null||child.signalCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill();});}};peers.push(result);return result;
}
async function launch(directory){
 dataDir=directory;const env={...process.env,ARNS_MESH_USER_DATA:dataDir};delete env.MESH_QA_PROFILE;
 const log=fs.openSync(path.join(out,'electron-private.log'),'a');
 app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env,stdio:['ignore',log,log]});
 for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:1000});break;}catch(e){if(i===59)throw e;await pause(500);}}
 const context=browser.contexts()[0];for(let i=0;i<40;i++){ui=context.pages().find(p=>p.url()==='arnsui://app/index.html');if(ui)break;await pause(250);}if(!ui)throw new Error('Toolbar unavailable.');
 ui.on('pageerror',error=>report.rendererErrors.push(sanitize(error.message)));ui.setDefaultTimeout(15000);await ui.locator('#address').waitFor();await pause(1000);
}
async function close(){if(browser){await browser.close().catch(()=>{});browser=null;}if(app&&app.exitCode===null){cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F']);await pause(750);}app=null;}
async function settings(){if(!await ui.locator('#settings-panel').isVisible())await ui.locator('#settings-button').click();}
async function screenshot(name){await ui.screenshot({path:path.join(out,name+'.png'),mask:[ui.locator('#connection-list'),ui.locator('#network-preview-details'),ui.locator('#rpc'),ui.locator('#direct-peers')],maskColor:'#ede8e0'});}
function audit(){const file=path.join(dataDir,'network-audit.jsonl');return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];}
(async()=>{
 let originalDefaults,defaultsFile;
 try{
  const a=await startPeer(path.join(out,'peer-a-private')),b=await startPeer(path.join(out,'peer-b-private'));
  const profile={schema:'arns-mesh-network-profile/v1',directPeers:[...(sourceProfile?.directPeers||[]),a.address,b.address],rpcSources:sourceProfile?.rpcSources||['127.0.0.1:58999'],arweavePeers:sourceProfile?.arweavePeers||[]};
  const publication=await a.call('publish',{profile,seeds:[a.address,b.address],name:'Mesh acceptance network'});
  assert.equal((await b.call('mirror',{file:path.join(a.dir,'network-announcement.json')})).hasAuthorityKey,false);
  const reader=path.join(out,'reader-private');await launch(reader);await settings();
  assert.equal(await ui.locator('#network-code').isVisible(),true);await screenshot('01-code-entry');
  await ui.locator('#network-code').fill('mesh1.invalid');await ui.locator('#inspect-network').click();await ui.waitForFunction(()=>document.getElementById('settings-result').classList.contains('error'));assert.match(await ui.locator('#settings-result').innerText(),/mistyped|Invalid/);note('mistyped-code-rejected',{passed:true});
  await ui.locator('#network-code').fill(publication.code);await ui.locator('#inspect-network').click();await ui.locator('#network-preview').waitFor({state:'visible',timeout:30000});
  assert.equal(await ui.locator('#network-preview-name').innerText(),'Mesh acceptance network');assert.equal(fs.existsSync(path.join(reader,'network-membership.json')),false);await screenshot('02-network-review');
  await ui.locator('#join-network').click();await ui.waitForFunction(()=>document.getElementById('settings-result').textContent.startsWith('Joined '),null,{timeout:45000});
  assert.equal(await ui.locator('#joined-network-name').innerText(),'Mesh acceptance network');await screenshot('03-network-joined');note('code-join',{passed:true,manualProfileImport:false});
  await close();await a.close();
  const {publishNetwork}=await import(pathToFileURL(path.join(repo,'apps/helper/network-publication.mjs')).href);
  const revised={...profile,directPeers:profile.directPeers.filter(p=>p!==a.address)};
  const update=publishNetwork({dataDir:a.dir,profile:revised,name:'Mesh acceptance network',seeds:[a.address,b.address],local:true});
  await b.call('mirror',{file:path.join(a.dir,'network-announcement.json')});
  await launch(reader);await settings();await ui.waitForFunction(revision=>document.getElementById('joined-network-status').textContent.includes('revision '+revision),update.revision,{timeout:30000});
  const loaded=JSON.parse(fs.readFileSync(path.join(reader,'mesh-ip-peers.json')));assert.deepEqual(loaded,revised.directPeers);await screenshot('04-restarted-with-survivor');note('restart-and-original-peer-loss',{passed:true,separateProcesses:true,sameHost:true,revision:update.revision});
  if(sourceProfile){
   await ui.locator('#settings-panel [data-close]').click();await ui.locator('#address').fill('vevivo');await ui.locator('#open-address').click();
   await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"].done')||document.querySelector('#access-stages .error'),null,{timeout:100000});
   assert.equal(await ui.locator('#access-stages [data-stage="open"].done').count(),1);assert.match(await ui.locator('#content-status').innerText(),/verified/i);
   note('live-arns-after-code-join',{name:'vevivo',opened:true,existingOperatorSourcesRetained:true});
   await ui.locator('#saved-button').click();await ui.locator('#save-current').click();
   await ui.waitForFunction(()=>document.querySelector('#saved-list button')&& !document.getElementById('saved-list').textContent.includes('Saving'),null,{timeout:100000});
   const before=audit().length;await ui.getByRole('button',{name:'Open saved version',exact:true}).click();
   await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"].done'),null,{timeout:30000});await pause(1500);
   assert.equal(audit().slice(before).filter(r=>r.type==='request').length,0);note('saved-mode-no-network-updates',{passed:true});
   await close();const beforeRestart=audit().length;await launch(reader);await pause(2000);assert.match(await ui.locator('#mode-badge').innerText(),/Saved/);assert.equal(audit().slice(beforeRestart).filter(r=>r.type==='request').length,0);note('saved-restart-no-network',{passed:true});
  }else note('live-arns-not-run',{reason:'No approved live profile supplied; connection protocol and UI acceptance only.'});
  await close();
  // The second distribution mode supplies the invitation in its package.
  // Only that configuration is changed; the public ZIP is left unchanged.
  defaultsFile=path.join(path.dirname(process.env.QA_EXE),'resources/app/resources/networks.json');originalDefaults=fs.readFileSync(defaultsFile);
  fs.writeFileSync(defaultsFile,JSON.stringify([{name:'Mesh acceptance network',code:publication.code}]));
  await launch(path.join(out,'bundled-reader-private'));
  await ui.waitForFunction(()=>document.getElementById('mode-badge').textContent==='P2P · Live',null,{timeout:45000});
  assert.equal(fs.existsSync(path.join(dataDir,'network-membership.json')),true);await settings();assert.equal(await ui.locator('#joined-network-name').innerText(),'Mesh acceptance network');await screenshot('05-included-network-auto-connect');note('included-invitation-auto-connect',{passed:true,manualCodeEntry:false,distributionConfigFixture:true});
  assert.deepEqual(report.rendererErrors,[]);report.passed=true;
 }catch(error){report.fatal=sanitize(error.stack);console.error(report.fatal);process.exitCode=1;}
 finally{
  await close();if(defaultsFile&&originalDefaults)fs.writeFileSync(defaultsFile,originalDefaults);
  for(const peer of peers)await peer.close().catch(()=>{});
  const log=path.join(out,'electron-private.log');if(fs.existsSync(log))fs.writeFileSync(path.join(out,'electron-sanitized.log'),sanitize(fs.readFileSync(log,'utf8')));
  report.finishedAt=new Date().toISOString();save();
 }
})();
