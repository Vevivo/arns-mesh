const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const out=path.resolve(process.env.QA_OUTPUT),exe=path.resolve(process.env.QA_EXE),group=process.env.QA_FIREWALL_GROUP;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={schema:'arns-mesh-windows-upstream-outage/v1',startedAt:new Date().toISOString(),version:JSON.parse(fs.readFileSync('package.json')).version,realPublicContent:true,freshReader:true,osFirewall:true,sameMachineReplica:true,pages:[],limitations:['Same-machine isolated supporter, not independent-provider failover','Pre-retained public sites; this is not all ArNS coverage']};
let app,browser,peer,privateStrings=[];
const clean=value=>privateStrings.reduce((s,v)=>s.split(v).join('[operator-endpoint]'),String(value));
const save=()=>fs.writeFileSync(path.join(out,'results.json'),clean(JSON.stringify(report,null,2)));
const run=(file,args,opts={})=>new Promise((resolve,reject)=>cp.execFile(file,args,{encoding:'utf8',windowsHide:true,timeout:90000,...opts},(e,stdout,stderr)=>e?reject(new Error(clean(stdout+' '+stderr+' '+e.message))):resolve(stdout)));
const endpoint=x=>{const at=x.lastIndexOf(':');return {host:x.slice(0,at).replace(/^\[|\]$/g,''),port:Number(x.slice(at+1))};};
(async()=>{try{
 peer=cp.fork(path.join(__dirname,'outage-peer.mjs'),['serve'],{env:process.env,stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
 const ready=path.join(out,'ready-private.json');for(let i=0;i<100&&!fs.existsSync(ready);i++)await delay(100);assert.ok(fs.existsSync(ready));
 const state=JSON.parse(fs.readFileSync(ready));
 privateStrings=[...state.profile.directPeers,...state.profile.rpcSources,...state.profile.arweavePeers].flatMap(x=>[x,endpoint(x).host]).filter(Boolean).sort((a,b)=>b.length-a.length);
 const ipText=n=>[24,16,8,0].map(shift=>Math.floor(n/2**shift)%256).join('.');
 const checks=[{label:'mesh',kind:'mesh',host:'127.0.0.1',port:state.port},{label:'dns',kind:'dns',host:'github.com'},...state.profile.rpcSources.slice(0,1).map(x=>({label:'rpc',kind:'tcp',...endpoint(x)})),...state.profile.arweavePeers.slice(0,2).map(x=>({label:'arweave',kind:'tcp',...endpoint(x)})),...state.profile.directPeers.slice(0,1).map(x=>({label:'original-peer',kind:'tcp',...endpoint(x)}))];
 const config=path.join(out,'probe-private.json');fs.writeFileSync(config,JSON.stringify({checks}));
 const policy=path.join(out,'policy-private.json');fs.writeFileSync(policy,JSON.stringify({programs:[exe,process.execPath],rules:[{protocol:'Any',addresses:[ipText(1)+'-'+ipText(2130706432),ipText(2130706434)+'-'+ipText(4294967294)]},{protocol:'Any',addresses:['::/1','8000::/1']},{protocol:'UDP',addresses:['Any']}]}));
 report.firewall=JSON.parse((await run('pwsh',['-NoProfile','-File',path.join(__dirname,'../disaster/firewall.ps1'),'-Mode','apply','-PolicyFile',policy,'-Group',group])).trim());
 for(const [label,program,nodeMode] of [['packaged-browser',exe,true],['supporter',process.execPath,false]]){
  const result=path.join(out,label+'-probe.json');
  await run(program,[path.join(__dirname,'../disaster/probe.cjs'),config,result],{env:{...process.env,...(nodeMode?{ELECTRON_RUN_AS_NODE:'1'}:{})}});
  const p=JSON.parse(fs.readFileSync(result));delete p.unguardedExecutable;
  assert.equal(p.checks.find(x=>x.label==='mesh').ok,true);
  assert.ok(p.checks.filter(x=>x.label!=='mesh').every(x=>!x.ok),'Upstream and DNS controls must fail');
  report[label+'Controls']=p;
 }
 save();
 const log=fs.openSync(path.join(out,'electron-private.log'),'a');
 app=cp.spawn(exe,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env:{...process.env,ARNS_MESH_USER_DATA:path.join(out,'fresh-user')},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 for(let i=0;i<80;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:800});break;}catch(e){if(i===79)throw e;await delay(300);}}
 const context=browser.contexts()[0];let ui;
 for(let i=0;i<50;i++){ui=context.pages().find(p=>p.url()==='arnsui://app/index.html');if(ui)break;await delay(200);}assert.ok(ui);
 await ui.locator('#address').waitFor();if(await ui.locator('#settings-panel').isVisible())await ui.getByRole('button',{name:'Close settings',exact:true}).click();
 for(const name of state.names){
  const before=new Set(context.pages());await ui.locator('#new-tab').click();let page;
  for(let i=0;i<40;i++){page=context.pages().find(p=>!before.has(p));if(page)break;await delay(100);}assert.ok(page);
  const at=Date.now();await ui.locator('#address').fill('ar://'+name);await ui.locator('#open-address').click();
  await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"]')?.classList.contains('done')||document.querySelector('#access-stages .error'),null,{timeout:95000});
  report.lastNavigation={name,stages:await ui.locator('#access-stages').innerText(),proof:await ui.locator('#proof').innerText()};save();
  assert.equal(await ui.locator('#access-stages [data-stage="open"]').evaluate(e=>e.classList.contains('done')),true,'Page must open: '+name);
  await delay(2500);
  const dom=await page.evaluate(()=>({url:location.href,title:document.title,textLength:document.body?.innerText?.length||0,images:[...document.images].map(x=>({complete:x.complete,width:x.naturalWidth,src:x.currentSrc}))}));
  assert.ok(dom.url.startsWith('ar://'+name));assert.ok(dom.textLength>0||dom.images.some(x=>x.width>0),'Rendered content must be visible');
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  report.pages.push({name,opened:true,elapsedMs:Date.now()-at,...dom,proof:await ui.locator('#proof').innerText()});save();
 }
 report.passed=true;
}catch(e){report.error=clean(e.stack);console.error(report.error);process.exitCode=1;}
finally{
 if(browser)await browser.close().catch(()=>{});
 if(app&&app.exitCode===null)cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
 if(peer&&peer.exitCode===null){peer.send('stop');await delay(800);if(peer.exitCode===null)peer.kill();}
 try{report.firewallCleanup=JSON.parse((await run('pwsh',['-NoProfile','-File',path.join(__dirname,'../disaster/firewall.ps1'),'-Mode','clear','-Group',group])).trim());}catch(e){report.cleanupError=clean(e.message);process.exitCode=1;}
 save();console.log(clean(JSON.stringify(report)));
}})();
