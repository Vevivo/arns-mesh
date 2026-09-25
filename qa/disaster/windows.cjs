const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const out=path.resolve(process.env.QA_OUTPUT),exe=path.resolve(process.env.QA_EXE),group=process.env.QA_FIREWALL_GROUP;
const profile=JSON.parse(process.env.MESH_QA_PROFILE);delete process.env.MESH_QA_PROFILE;
const addresses=[...profile.directPeers,...profile.rpcSources,...profile.arweavePeers];
const privateValues=addresses.flatMap(x=>[x,x.slice(0,x.lastIndexOf(':'))]).filter(Boolean).sort((a,b)=>b.length-a.length);
const clean=value=>privateValues.reduce((s,v)=>s.split(v).join('[operator-endpoint]'),typeof value==='string'?value:JSON.stringify(value));
const report={schema:'arns-mesh-disaster-test/v1',startedAt:new Date().toISOString(),publishedVersion:'0.5.0-preview.6',zipSha256:'a2b1d30f314ca6a638e5c7d7ceab3bc4592f1de823cd0bd849a6d385df97652e',realPublicContent:true,osFirewall:true,osPacketCapture:false,controlPlane:'GitHub orchestration downloads precede outage; browser has no GitHub connection',rpcRetained:true,phases:[],checks:[],limitations:[]};
fs.mkdirSync(out,{recursive:true});
const save=()=>fs.writeFileSync(path.join(out,'results.json'),clean(report));
const note=(id,data)=>{report.checks.push({id,at:new Date().toISOString(),...data});save();console.log(id,clean(data));};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const exec=(file,args,options={})=>new Promise((resolve,reject)=>cp.execFile(file,args,{timeout:90000,windowsHide:true,...options},(e,stdout,stderr)=>e?reject(new Error(clean(stdout+' '+stderr+' '+e.message))):resolve(stdout)));
const parse=endpoint=>{const i=endpoint.lastIndexOf(':'),host=endpoint.slice(0,i).replace(/^\[|\]$/g,'');assert.equal(net.isIP(host),4,'This test policy requires IPv4 service endpoints; it blocks all IPv6');return {host,port:Number(endpoint.slice(i+1))};};
const ipNum=s=>s.split('.').reduce((n,x)=>n*256+Number(x),0);
const ipText=n=>[24,16,8,0].map(shift=>Math.floor(n/2**shift)%256).join('.');
function complement(points,max,format=String,start=0){const result=[];let at=start;for(const p of [...new Set(points)].sort((a,b)=>a-b)){if(p>at)result.push(at===p-1?format(at):format(at)+'-'+format(p-1));at=p+1;}if(at<=max)result.push(at===max?format(at):format(at)+'-'+format(max));return result;}
let probeSerial=0;
async function probe(checks,includeAddresses=false){
 const stem=path.join(out,'probe-private-'+(++probeSerial)),config=stem+'.json',result=stem+'-result.json';
 fs.writeFileSync(config,JSON.stringify({checks,includeAddresses}));
 await exec(exe,[path.join(__dirname,'probe.cjs'),config,result],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:checks.length*6000+15000});
 return JSON.parse(fs.readFileSync(result));
}
async function firewall(allowed){
 const endpoints=allowed.map(parse),hosts=[...new Set(['127.0.0.1',...endpoints.map(p=>p.host)])];
 const rules=[{protocol:'Any',addresses:complement(hosts.map(ipNum),2**32-1,ipText)},{protocol:'Any',addresses:['::/0']},{protocol:'UDP',addresses:['Any']}];
 for(const host of hosts.filter(h=>h!=='127.0.0.1'))rules.push({protocol:'TCP',addresses:[host],ports:complement(endpoints.filter(p=>p.host===host).map(p=>p.port),65535,String,1)});
 const file=path.join(out,'firewall-policy-private.json');fs.writeFileSync(file,JSON.stringify({programs:[exe,...localPeerPrograms],rules}));
 const result=await exec('pwsh',['-NoProfile','-File',path.join(__dirname,'firewall.ps1'),'-Mode','apply','-PolicyFile',file,'-Group',group]);
 return JSON.parse(result.trim());
}
const native=(mode,value='')=>exec('python',[path.join(__dirname,'../desktop/native-dialog.py'),mode,value],{timeout:30000});
const localPeerPrograms=[],localPeers=[];
let app,browser;
async function stopBrowser(){
 if(browser)await browser.close().catch(()=>{});browser=null;
 if(app&&app.exitCode===null)cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F'],{stdio:'ignore'});app=null;
}
function audit(directory){const f=path.join(directory,'network-audit.jsonl');return fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];}
async function runPhase(id,connections,allowed,blockedEndpoints,extra={}){
 const dataDir=path.join(out,id+'-fresh-user');assert.equal(fs.existsSync(dataDir),false,'A new empty client must be used for every failure phase');
 const phase={id,...extra,startedAt:new Date().toISOString(),freshClient:true,configuredPeers:connections.length,contentOnClientBeforeStart:0,pages:[]};report.phases.push(phase);save();
 phase.firewall=await firewall(allowed);
 const checks=[...externalChecks,...allowed.map((x,i)=>({label:'allowed-'+i,kind:connections.includes(x)?'mesh':'tcp',...parse(x)})),...blockedEndpoints.map((x,i)=>({label:'cut-source-'+i,kind:'tcp',...parse(x)}))];
 phase.probes=await probe(checks);
 for(const c of phase.probes.checks){if(c.label.startsWith('allowed-'))assert.equal(c.ok,true,c.label+' must remain reachable');else assert.equal(c.ok,false,c.label+' must be blocked by the OS');}
 phase.firewallVerified=true;save();
 try{
  const log=fs.openSync(path.join(out,id+'-electron-private.txt'),'a');
  app=cp.spawn(exe,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1','--force-renderer-accessibility'],{env:{...process.env,ARNS_MESH_USER_DATA:dataDir},stdio:['ignore',log,log]});fs.closeSync(log);
  for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:800});break;}catch(e){if(i===59)throw e;await delay(300);}}
  const context=browser.contexts()[0];let ui;
  for(let i=0;i<40;i++){ui=context.pages().find(p=>p.url()==='arnsui://app/index.html');if(ui)break;await delay(250);}
  assert.ok(ui,'Real desktop toolbar must appear');await ui.locator('#address').waitFor();await delay(600);
  const f=path.join(out,id+'-profile-private.json');fs.writeFileSync(f,JSON.stringify({...profile,directPeers:connections,arweavePeers:[]}));
  if(!await ui.locator('#settings-panel').isVisible())await ui.locator('#settings-button').click();
  await ui.locator('#import-mode').selectOption('replace');await ui.locator('#import-profile').click();await native('open',f);await delay(500);
  assert.match(await ui.locator('#settings-result').innerText(),/Connections replaced/);
  await ui.locator('#settings-panel [data-close]').click();
  for(const name of ['vevivo','internetfireplace','permahistory','kh-laboratory']){
   const before=audit(dataDir).length,existing=new Set(context.pages());await ui.locator('#new-tab').click();let page;
   for(let i=0;i<40;i++){page=context.pages().find(p=>!existing.has(p));if(page)break;await delay(100);}
   assert.ok(page);const start=Date.now();await ui.locator('#address').fill('ar://'+name);await ui.locator('#open-address').click();
   let terminal=true;try{await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"]')?.classList.contains('done')||document.querySelector('#access-stages .error'),null,{timeout:95000});}catch{terminal=false;}
   const elapsedMs=Date.now()-start;await delay(1500);
   const events=audit(dataDir).slice(before),responses=events.filter(x=>x.type==='response');
   const row={name,terminal,opened:await ui.locator('#access-stages [data-stage="open"].done').count()>0,elapsedMs,status:await ui.locator('#message').innerText(),content:await ui.locator('#content-status').innerText(),mode:await ui.locator('#mode-badge').innerText(),url:page.url(),document:await page.evaluate(()=>({title:document.title,text:document.body?.innerText.slice(0,1200),images:[...document.images].map(x=>({source:x.getAttribute('src')?.slice(0,100),loaded:x.complete&&x.naturalWidth>0}))})),network:{requests:events.filter(x=>x.type==='request').length,responses:responses.length,bytes:responses.reduce((s,x)=>s+(x.bytes||0),0),purposes:[...new Set(responses.map(x=>x.purpose))],meshResponses:responses.filter(x=>x.purpose==='mesh-peer').length,cutSourceResponses:responses.filter(x=>blockedEndpoints.includes(x.host+':'+x.port)).length},proof:await ui.locator('#proof').innerText()};
   phase.pages.push(row);save();console.log('DISASTER_PAGE',clean({phase:id,name,opened:row.opened,elapsedMs,network:row.network,status:row.status}));
   const visible=row.status+' '+row.document.text;
   if(!privateValues.some(v=>visible.includes(v)))await native('capture',path.join(out,id+'-'+name+'.png'));
   assert.equal(row.opened,true,id+': '+name+' must open');assert.match(row.content,/verified/i);assert.match(row.mode,/Live/);assert.ok(row.network.meshResponses>0,'A fresh client must receive data from Mesh');assert.equal(row.network.cutSourceResponses,0);
   assert.equal(row.network.purposes.includes('raw-arweave'),false,'No raw server is configured in this replica-only experiment');
   await native('check-errors');
  }
  phase.passed=true;
 }catch(e){phase.error=clean(e.message);phase.passed=false;throw e;}
 finally{phase.finishedAt=new Date().toISOString();save();await stopBrowser();}
 return dataDir;
}
let externalChecks=[];
async function localFallback(seedDir){
 const binaryDir=path.join(out,'isolated-peer-binary');fs.mkdirSync(binaryDir,{recursive:true});const node=path.join(binaryDir,'node.exe');fs.copyFileSync(process.execPath,node);localPeerPrograms.push(node);
 const results=[];
 for(const [i,id] of ['a','b'].entries()){
  const dir=path.join(out,'local-replica-'+id);fs.mkdirSync(path.join(dir,'peer'),{recursive:true});
  fs.cpSync(path.join(seedDir,'content'),path.join(dir,'peer','content'),{recursive:true});fs.copyFileSync(path.join(seedDir,'name-snapshots.json'),path.join(dir,'name-snapshots.json'));
  fs.writeFileSync(path.join(dir,'seed-report.json'),JSON.stringify({fixture:false,preparedFrom:'Windows phase dns-cut',samePhysicalHost:true}));
  const port=49742+i,log=fs.openSync(path.join(out,'local-'+id+'-private.txt'),'a');
  const proc=cp.spawn(node,[path.join(__dirname,'replica.mjs'),'serve'],{env:{...process.env,QA_REPLICA_DIR:dir,QA_REPLICA_PORT:String(port),QA_REPLICA_ID:id,QA_PUBLIC_IP:'127.0.0.1'},stdio:['ignore',log,log]});fs.closeSync(log);localPeers.push(proc);
  for(let n=0;n<80;n++){if(fs.existsSync(path.join(dir,'ready.json')))break;await delay(250);}
  assert.ok(fs.existsSync(path.join(dir,'ready.json')),'Fallback peer must start');results.push({endpoint:'127.0.0.1:'+port,id});
 }
 return results;
}
(async()=>{
 try{
  assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.ok(profile.directPeers.length);
  const baseline=await probe([{label:'gateway-dns',kind:'dns',host:'arweave.net'},{label:'doh-dns',kind:'dns',host:'cloudflare-dns.com'}],true);
  for(const check of baseline.checks)assert.equal(check.ok,true,'DNS positive control must work before the cut');
  const gatewayIp=baseline.checks[0].value[0],dohIp=baseline.checks[1].value[0];
  externalChecks=[{label:'DNS',kind:'dns',host:'arweave.net'},{label:'gateway-HTTPS',kind:'tcp',host:gatewayIp,port:443},{label:'DoH-HTTPS',kind:'tcp',host:dohIp,port:443}];
  const positive=await probe(externalChecks);for(const c of positive.checks)assert.equal(c.ok,true,c.label+' must pass before firewall');note('positive-controls',positive);
  let replicas=['a','b'].map(id=>{const row=JSON.parse(fs.readFileSync(path.join(out,'rendezvous',id,'ready.json')));assert.equal(net.isIP(row.host),4);return {endpoint:row.host+':'+row.port,id};});
  const remoteProbe=await probe(replicas.map(r=>({label:'independent-'+r.id,kind:'mesh',...parse(r.endpoint)})));note('independent-peer-reachability',remoteProbe);
  const seedDir=await runPhase('dns-cut',profile.directPeers,[...profile.directPeers,...profile.rpcSources],[],{scope:'Published app, DNS and gateway access blocked at Windows firewall'});
  const independent=remoteProbe.checks.every(c=>c.ok);
  if(!independent){
   report.limitations.push('The separate Linux runner endpoints were unreachable inbound. Subsequent peer failover uses independent processes on the Windows VM, not independent physical machines.');
   replicas=await localFallback(seedDir);
  }
  report.independentHostFailover=independent;
  const [a,b]=replicas.map(r=>r.endpoint);
  await runPhase('origin-cut',[...profile.directPeers,a],[a,...profile.rpcSources],profile.directPeers,{scope:'Original Mesh source blocked; separate replica A supplies real signed bytes',independentPhysicalHost:independent});
  if(!independent){cp.spawnSync('taskkill',['/pid',String(localPeers[0].pid),'/T','/F'],{stdio:'ignore'});}
  await runPhase('replica-a-cut',[...profile.directPeers,a,b],[b,...profile.rpcSources],[...profile.directPeers,a],{scope:'Original Mesh source and replica A unavailable; replica B supplies bytes',independentPhysicalHost:independent});
  report.testPassed=true;
 }catch(e){report.fatal=clean(e.stack);report.testPassed=false;console.error(report.fatal);process.exitCode=1;}
 finally{
  await stopBrowser();for(const proc of localPeers)if(proc.exitCode===null)cp.spawnSync('taskkill',['/pid',String(proc.pid),'/T','/F'],{stdio:'ignore'});
  for(const id of ['a','b']){const file=path.join(out,'local-replica-'+id,'serving-report.json');if(fs.existsSync(file))(report.localReplicaEvidence??=[]).push(JSON.parse(fs.readFileSync(file)));}
  try{report.restoration=JSON.parse((await exec('pwsh',['-NoProfile','-File',path.join(__dirname,'firewall.ps1'),'-Mode','clear','-Group',group])).trim());}catch(e){report.restoration={error:clean(e.message)};process.exitCode=1;}
  report.finishedAt=new Date().toISOString();save();
 }
})();
