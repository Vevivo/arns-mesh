const fs = require('node:fs');
const assert = require('node:assert/strict');
const candidate = process.env.QA_VARIANT === 'candidate';
const path = require('node:path');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.join(process.env.QA_TOOLS, 'package.json'))('playwright');
const root = path.resolve(process.env.QA_OUTPUT);
fs.mkdirSync(root, {recursive:true});
const report = {scope:(candidate?'Candidate':'Original')+' Windows portable ZIP; real Electron renderers and native file picker; no successful live-network claim',startedAt:new Date().toISOString(),steps:[],errors:[]};
const out = path.join(root,'results.json');
const record = (id,data) => {report.steps.push({id,at:new Date().toISOString(),...data});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(id,JSON.stringify(data));};
const pause = ms => new Promise(r=>setTimeout(r,ms));
const native = (mode,value) => new Promise((resolve,reject)=>cp.execFile('python',[path.join(__dirname,'native-dialog.py'),mode,value],{timeout:30000},(e,stdout,stderr)=>e?reject(new Error(stdout+stderr+e.message)):resolve(stdout)));
let app,browser,ui,context,recorder;
async function screenshot(name){await pause(300);await native('capture',path.join(root,name+'.png'));}
async function settings(){
  if(await ui.locator('#settings-panel').isVisible())return;
  await ui.locator('#menu-button').click();await ui.locator('#settings-button').click();
  await ui.locator('#import-profile').waitFor();
}
async function importFile(file){
  await settings();await ui.locator('#import-profile').click();
  await screenshot('native-file-picker');
  await native(file?'open':'cancel',file||'none');await pause(700);
}
async function launch(){
  const log=fs.openSync(path.join(root,'electron.log'),'a');
  app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env:{...process.env,ARNS_MESH_USER_DATA:path.join(root,'user-data')},stdio:['ignore',log,log]});
  app.once('exit',(code,signal)=>console.log('Application exit',code,signal));
  for(let n=0;n<60;n++){
    try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:1000});break;}catch(e){if(n===59)throw e;await pause(500);}
  }
  context=browser.contexts()[0];
  for(let n=0;n<40;n++){
    ui=context.pages().find(p=>p.url()==='arnsui://app/index.html');
    if(ui)break;await pause(250);
  }
  if(!ui)throw new Error('Browser toolbar did not appear.');
  ui.on('pageerror',e=>{report.errors.push(e.message);console.log('RENDERER ERROR',e.message);});
  ui.setDefaultTimeout(10000);await ui.locator('#address').waitFor();await pause(1000);
}
async function close(){
  if(browser){await browser.close();browser=null;}
  if(app&&app.exitCode===null){cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F']);await pause(1000);}
}
(async()=>{
 try{
  await launch();
  recorder=cp.spawn('python',[path.join(__dirname,'native-dialog.py'),'record',path.join(root,'desktop-recording.mp4')],{stdio:'inherit'});
  await screenshot('01-first-launch');
  const welcome=context.pages().find(p=>p.url()==='arnsui://app/welcome.html');
  record('first-launch',{pages:context.pages().map(p=>p.url()),status:await ui.locator('#message').innerText(),homeText:welcome?await welcome.locator('body').innerText():null});
  if(candidate){assert.equal(await ui.locator('#settings-panel').isVisible(),true);await ui.locator('#settings-panel [data-close]').click();}
  if(welcome){
    await welcome.locator('#start-address').fill('internetfireplace');await welcome.locator('[type=submit]').click();await pause(1800);
    record('home-address-without-profile',{url:welcome.url(),status:await ui.locator('#message').innerText(),text:await welcome.locator('body').innerText()});
    await screenshot('02-no-profile-page');
  }
  await settings();await screenshot('03-connection-settings');
  record('settings-empty',{version:await ui.locator('#build-info').innerText(),rpc:await ui.locator('#rpc').inputValue(),peers:await ui.locator('#direct-peers').inputValue(),importVisible:await ui.locator('#import-profile').isVisible()});
  await importFile(null);record('cancel-import',{status:await ui.locator('#message').innerText()});
  const invalid=path.join(root,'invalid-profile.json');fs.writeFileSync(invalid,'{"oops":true}');
  await importFile(invalid);await screenshot('04-invalid-profile');
  record('invalid-profile',{status:await ui.locator('#message').innerText(),settingsMessage:await ui.locator('#settings-result').innerText()});
  await pause(1800);record('invalid-profile-after-timer',{status:await ui.locator('#message').innerText(),settingsMessage:await ui.locator('#settings-result').innerText()});
  if(candidate)assert.match(await ui.locator('#settings-result').innerText(),/Unsupported connection profile/);
  const a=path.join(root,'profile-a.json'),b=path.join(root,'profile-b.json');
  for(const [file,port] of [[a,59001],[b,59002]])fs.writeFileSync(file,JSON.stringify({schema:'arns-mesh-network-profile/v1',directPeers:['127.0.0.1:'+port],rpcSources:['127.0.0.1:59003'],arweavePeers:[]}));
  await importFile(a);record('valid-format-unreachable-profile',{message:await ui.locator('#settings-result').innerText(),peers:await ui.locator('#direct-peers').inputValue()});await screenshot('05-profile-imported');
  await importFile(b);record('second-profile',{peers:await ui.locator('#direct-peers').inputValue(),rpc:await ui.locator('#rpc').inputValue()});
  if(candidate){
    assert.equal(await ui.locator('#direct-peers').inputValue(),'127.0.0.1:59001\n127.0.0.1:59002');
    await screenshot('05b-two-profiles-added');
    await ui.locator('#check-connections').click();await ui.locator('#check-connections').waitFor({state:'visible'});
    await ui.waitForFunction(()=>!document.getElementById('check-connections').disabled);
    assert.equal(await ui.locator('.connection-status.unavailable').count(),3);
    record('connection-check',{message:await ui.locator('#settings-result').innerText(),rows:await ui.locator('#connection-list').innerText()});await screenshot('05c-connection-check');
    const exported=path.join(root,'shared-profile.json');await ui.locator('#export-profile').click();await native('save',exported);await pause(700);
    const shared=JSON.parse(fs.readFileSync(exported));assert.deepEqual(shared.directPeers,['127.0.0.1:59001','127.0.0.1:59002']);
    assert.deepEqual(Object.keys(shared).sort(),['arweavePeers','directPeers','rpcSources','schema']);record('export-profile',{keys:Object.keys(shared),peers:shared.directPeers});
    await ui.locator('#import-mode').selectOption('replace');await importFile(a);
    assert.equal(await ui.locator('#direct-peers').inputValue(),'127.0.0.1:59001');record('explicit-replace',{peers:await ui.locator('#direct-peers').inputValue()});
    await ui.locator('#import-mode').selectOption('merge');await importFile(b);
  }
  await ui.locator('#settings-panel [data-close]').click();
  await ui.locator('#address').fill('internetfireplace');await ui.locator('#open-address').click();await pause(4000);
  record('unreachable-rpc',{status:await ui.locator('#message').innerText()});await screenshot('06-unreachable-rpc');
  await ui.locator('#bookmark').click();
  await ui.locator('#new-tab').click();record('new-tab',{count:await ui.locator('[role=tab]').count()});
  await ui.locator('#address').fill('https://example.com');await ui.locator('#open-address').click();await pause(100);
  record('invalid-address',{status:await ui.locator('#message').innerText()});await pause(1500);
  record('invalid-address-after-timer',{status:await ui.locator('#message').innerText()});if(candidate)assert.notEqual(await ui.locator('#message').innerText(),'Enter an ArNS address.');
  await ui.locator('#menu-button').click();await ui.locator('#bookmarks-button').click();
  record('bookmarks',{text:await ui.locator('#library-list').innerText()});await screenshot('07-bookmarks');
  await close();await launch();await settings();
  record('restart-preservation',{peers:await ui.locator('#direct-peers').inputValue(),rpc:await ui.locator('#rpc').inputValue(),tabs:await ui.locator('[role=tab]').count()});await screenshot('08-restart-settings');if(candidate)assert.equal(await ui.locator('#direct-peers').inputValue(),'127.0.0.1:59001\n127.0.0.1:59002');assert.deepEqual(report.errors,[]);
 }catch(e){report.fatal=e.stack;console.error(e.stack);try{await screenshot('fatal-state');}catch{}process.exitCode=1;}
 finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(out,JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'desktop-recording.stop'),'stop');if(recorder)await Promise.race([new Promise(r=>recorder.once('exit',r)),pause(10000)]);await close();}
})();
