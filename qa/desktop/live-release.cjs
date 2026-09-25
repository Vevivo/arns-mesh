// Exercise the built executable with live names. No content fixtures or resolver replacements.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const out=path.resolve(process.env.QA_OUTPUT),dataDir=path.join(out,'fresh-user');
fs.mkdirSync(out,{recursive:true});
if(fs.existsSync(dataDir))throw new Error('This experiment requires an empty user profile.');
const profile=JSON.parse(process.env.MESH_QA_PROFILE||'null');
if(profile&&profile.schema!=='arns-mesh-network-profile/v1')throw new Error('Invalid operator profile for the live test.');
const privateValues=profile?[...profile.directPeers,...profile.rpcSources,...profile.arweavePeers].flatMap(x=>[x,x.slice(0,x.lastIndexOf(':'))]).sort((a,b)=>b.length-a.length):[];
const sanitize=value=>{let s=typeof value==='string'?value:JSON.stringify(value);for(const v of privateValues)s=s.split(v).join('[operator-endpoint]');return s;};
const build=process.env.QA_BUILD_INFO?JSON.parse(fs.readFileSync(process.env.QA_BUILD_INFO,'utf8')):null;
const strict=process.env.QA_REGRESSION==='1';
const assert=require('node:assert/strict');
const report={scope:build?'Candidate Windows package, real desktop, live public ArNS names, fresh client with existing operator sources':'Published Windows ZIP live observation',build,startedAt:new Date().toISOString(),fixture:false,osPacketCapture:false,steps:[],pages:[],rendererErrors:[],consoleErrors:[],failedRequests:[]};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),sanitize(report));
const note=(id,value)=>{report.steps.push({id,at:new Date().toISOString(),...value});save();console.log(id,sanitize(value));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const native=(mode,value)=>new Promise((resolve,reject)=>cp.execFile('python',[path.join(__dirname,'native-dialog.py'),mode,value],{timeout:30000},(e,stdout,stderr)=>e?reject(new Error(sanitize(stdout+stderr+e.message))):resolve(stdout)));
let app,browser,context,ui;
async function screenshot(name,page){
  const visible=await ui.locator('#message').innerText()+' '+(page?await page.locator('body').innerText().catch(()=> ''):'');
  if(privateValues.some(v=>visible.includes(v))){note('screenshot-withheld',{name,reason:'Operator address visible'});return;}
  await native('capture',path.join(out,name+'.png'));
}
async function waitTerminal(timeout=95000){
  try{await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"]')?.classList.contains('done')||document.querySelector('#access-stages .error'),null,{timeout});return true;}catch{return false;}
}
function audit(){const file=path.join(dataDir,'network-audit.jsonl');return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];}
function auditSummary(rows){const counts={requests:0,responses:0,bytes:0,blocked:0,byPurpose:{},blockedDomains:[],errors:[]};for(const r of rows){if(r.type==='request'){counts.requests++;const key=r.purpose||r.path||'unknown';counts.byPurpose[key]=(counts.byPurpose[key]||0)+1;}if(r.type==='response'){counts.responses++;counts.bytes+=r.bytes||0;}if(r.type==='blocked'){counts.blocked++;if(r.host&&!privateValues.includes(r.host))counts.blockedDomains.push(r.host);}if(r.type==='request-error')counts.errors.push(r.error||r.reason||'request-error');}counts.blockedDomains=[...new Set(counts.blockedDomains)];return counts;}
(async()=>{
 try{
  const env={...process.env,ARNS_MESH_USER_DATA:dataDir};delete env.MESH_QA_PROFILE;
  const log=fs.openSync(path.join(out,'electron-private.log'),'a');
  app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1','--force-renderer-accessibility'],{env,stdio:['ignore',log,log]});
  for(let n=0;n<60;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:1000});break;}catch(e){if(n===59)throw e;await pause(500);}}
  context=browser.contexts()[0];
  for(let n=0;n<40;n++){ui=context.pages().find(p=>p.url()==='arnsui://app/index.html');if(ui)break;await pause(250);}
  if(!ui)throw new Error('Desktop toolbar did not appear.');
  ui.setDefaultTimeout(10000);await ui.locator('#address').waitFor();await pause(1000);
  function watch(p){p.on('pageerror',e=>report.rendererErrors.push({url:p.url(),error:sanitize(e.message)}));p.on('console',m=>{if(['error','warning'].includes(m.type()))report.consoleErrors.push({url:p.url(),type:m.type(),text:sanitize(m.text())});});p.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));}
  for(const p of context.pages())watch(p);
  context.on('page',watch);
  note('fresh-start',{settingsOpen:await ui.locator('#settings-panel').isVisible(),status:await ui.locator('#message').innerText(),version:await ui.locator('#build-info').innerText()});
  await screenshot('01-new-user');
  await ui.locator('#settings-panel [data-close]').click();
  await ui.locator('#address').fill('internetfireplace');await ui.locator('#open-address').click();await waitTerminal(10000);
  note('without-profile',{status:await ui.locator('#message').innerText()});await screenshot('02-profile-required');
  if(!profile){if(strict)throw new Error('Live regression requires an approved connection profile.');note('live-test-not-run',{reason:'No operator profile supplied. This is a first-launch test only.'});return;}
  const file=path.join(out,'operator-profile-private.json');fs.writeFileSync(file,JSON.stringify(profile));
  await ui.locator('#settings-button').click();await ui.locator('#import-profile').click();await native('open',file);await pause(1000);
  note('profile-import',{message:await ui.locator('#settings-result').innerText(),meshSources:profile.directPeers.length,rpcSources:profile.rpcSources.length,rawSources:profile.arweavePeers.length});
  await ui.locator('#check-connections').click();await ui.waitForFunction(()=>!document.getElementById('check-connections').disabled,null,{timeout:50000});
  note('connection-check',{message:await ui.locator('#settings-result').innerText(),rows:await ui.locator('#connection-list').innerText(),details:await ui.locator('.connection-status').evaluateAll(xs=>xs.map(x=>({text:x.textContent,detail:x.title})))});
  if(strict)assert.match(await ui.locator('.connection-status').first().innerText(),/responded/i,'Mesh protocol check must respond');
  await ui.locator('#settings-panel [data-close]').click();
  // Leave the external-window navigation probe last: an Electron/UI stall
  // there must not prevent collecting the other real-site results.
  const names=['internetfireplace','vevivo','apple','permahistory','kh-laboratory'];
  for(let i=0;i<names.length;i++){
    const name=names[i],existingPages=new Set(context.pages());await ui.locator('#new-tab').click();
    let page;for(let n=0;n<40;n++){page=context.pages().find(p=>!existingPages.has(p));if(page)break;await pause(100);}if(!page)throw new Error('New desktop tab did not appear.');
    const start=Date.now(),auditStart=audit().length;
    await ui.locator('#address').fill('ar://'+name);await ui.locator('#open-address').click();
    const terminal=await waitTerminal();const firstResultMs=Date.now()-start;
    const opened=await ui.locator('#access-stages [data-stage="open"].done').count()>0;
    if(opened)await pause(6000);
    const row={name,terminal,opened,firstResultMs,status:await ui.locator('#message').innerText(),stageDetail:await ui.locator('#stage-detail').innerText(),content:await ui.locator('#content-status').innerText(),nameRecord:await ui.locator('#name-status').innerText(),proof:await ui.locator('#proof').innerText(),stages:await ui.locator('#access-stages').innerText(),network:auditSummary(audit().slice(auditStart))};
    if(page){row.url=page.url();row.title=await page.title();row.document=await page.evaluate(()=>({readyState:document.readyState,text:document.body?.innerText.slice(0,2000),images:[...document.images].map(x=>({src:(x.getAttribute('src')||'').slice(0,100),loaded:x.complete&&x.naturalWidth>0})).slice(0,30),scripts:[...document.scripts].filter(x=>x.src).map(x=>x.getAttribute('src')).slice(0,30),styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>({href:x.getAttribute('href'),sheetPresent:Boolean(x.sheet),ruleCount:(()=>{try{return x.sheet?.cssRules.length??null;}catch{return 'inaccessible';}})()})).slice(0,30),media:[...document.querySelectorAll('video,audio')].map(x=>({src:x.getAttribute('src'),readyState:x.readyState,error:x.error?.code||null})),links:[...document.querySelectorAll('a[href]')].map(x=>({text:x.innerText.slice(0,80),href:x.getAttribute('href')})).slice(0,20)}));}
    await screenshot('page-'+(i+1)+'-'+name,page);
    try{if(opened&&name==='internetfireplace'){
      const play=page.getByRole('button',{name:/^play$/i});
      row.playControls=await play.count();
      if(row.playControls){await play.click({noWaitAfter:true,timeout:5000});await pause(2000);row.nativePlaybackAlert=await native('dismiss-alert','Playback was blocked');row.playAttempt=await page.evaluate(()=>({text:document.body.innerText.slice(0,500),media:[...document.querySelectorAll('video,audio')].map(x=>({readyState:x.readyState,networkState:x.networkState,paused:x.paused,currentTime:x.currentTime,error:x.error?.code||null,errorMessage:x.error?.message||null}))}));}
    }
    if(opened&&name==='kh-laboratory'){
      const link=page.getByRole('link',{name:'KH Laboratory File Directory',exact:false});
      if(await link.count()){await link.click({noWaitAfter:true,timeout:5000});await pause(500);row.externalLink={status:await ui.locator('#message').innerText(),pageUrl:page.url(),fatalDialogCheck:await native('check-errors','')};if(strict){assert.match(row.externalLink.status,/link blocked/);assert.match(row.externalLink.pageUrl,/^ar:\/\/kh-laboratory\//);await ui.locator('#settings-button').click();assert.equal(await ui.locator('#settings-panel').isVisible(),true);await ui.locator('#settings-panel [data-close]').click();}await screenshot('kh-link-blocked-without-crash',page);}
    }
    if(opened&&name==='permahistory'){
      const register=page.getByRole('button',{name:/register now/i});
      if(await register.count()){await register.click({noWaitAfter:true,timeout:5000});await pause(700);row.registrationView={title:await page.title(),text:(await page.locator('body').innerText()).slice(0,800)};}
    }}catch(e){row.interactionError=sanitize(e.message);row.afterInteraction={status:'UI interaction timed out; app responsiveness not confirmed',pageUrl:page.url()};}
    report.pages.push(row);save();console.log('LIVE_RESULT',sanitize(row));
    if(strict){
      assert.equal(terminal,true,name+': request must finish');assert.equal(row.interactionError,undefined,name+': interaction must not fail');
      if(name!=='apple')assert.equal(opened,true,name+': main document must open');
      if(['internetfireplace','permahistory'].includes(name)){assert.match(row.stageDetail,/[1-9][0-9]* policy blocks/);assert.match(row.status,/unavailable/);assert.ok(row.network.blocked>0,'CSP reports must reach diagnostics');}
      if(name==='apple'&&!opened)assert.match(row.status,/lease is expired/);
      await native('check-errors','');
    }
    if(strict&&name==='vevivo'&&opened){
      const beforeSave=audit().length;await ui.locator('#saved-button').click();await ui.locator('#save-current').click();
      await ui.waitForFunction(()=>/Main document only|Manifest files saved|Incomplete copy/.test(document.getElementById('saved-list').innerText),null,{timeout:90000});
      const savedText=await ui.locator('#saved-list').innerText();assert.doesNotMatch(savedText,/Incomplete copy/);
      const beforeOpen=audit().length;await ui.getByRole('button',{name:'Open saved version',exact:true}).click();await waitTerminal();await pause(1000);
      const offline={savedText,status:await ui.locator('#message').innerText(),content:await ui.locator('#content-status').innerText(),mode:await ui.locator('#mode-badge').innerText(),network:auditSummary(audit().slice(beforeOpen)),saveNetwork:auditSummary(audit().slice(beforeSave,beforeOpen))};
      assert.match(offline.mode,/Saved/);assert.match(offline.content,/verified/);assert.equal(offline.network.requests,0,'Saved cached document must reopen without Node network requests');
      await screenshot('saved-vevivo',page);note('saved-document-reopen',offline);
      await ui.locator('#menu-button').click();await ui.locator('#saved-toggle').uncheck();await ui.locator('#menu-button').click();await waitTerminal();
    }
    if(row.interactionError){
      // The previous visible state was checked for operator addresses above.
      // Capture the actual OS view without waiting on the stalled renderer.
      await native('capture',path.join(out,'interaction-timeout-'+name+'.png'));
    }
    if(!terminal&&await ui.locator('#reload').getAttribute('aria-label')==='Stop loading')await ui.locator('#reload').click();
  }
  note('network-total',auditSummary(audit()));
  report.regressionsPassed=strict;note('regression-result',{passed:strict,scope:'UI, connection probe, rejected external link, resource diagnostics and saved verified document; not full DNS-cut acceptance'});
 }catch(e){report.fatal=sanitize(e.stack);console.error(report.fatal);process.exitCode=1;}
 finally{
  if(browser)await browser.close().catch(()=>{});
  if(app&&app.exitCode===null)cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F']);
  const log=path.join(out,'electron-private.log');if(fs.existsSync(log))fs.writeFileSync(path.join(out,'electron-sanitized.log'),sanitize(fs.readFileSync(log,'utf8')));
  report.finishedAt=new Date().toISOString();save();
 }
})();
