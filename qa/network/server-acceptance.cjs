// External Windows acceptance for the already-published preview.8 executable.
// Addresses come only from the existing approved QA profile; reports redact them.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const profile=JSON.parse(process.env.MESH_QA_PROFILE);
const values=[...profile.directPeers,...profile.rpcSources,...(profile.arweavePeers||[])].flatMap(v=>[v,v.slice(0,v.lastIndexOf(':'))]).sort((a,b)=>b.length-a.length);
const sanitize=v=>{let s=typeof v==='string'?v:JSON.stringify(v);for(const x of values)s=s.split(x).join('[operator-endpoint]');return s;};
const out=path.resolve(process.env.QA_OUTPUT),repo=process.cwd(),reader=path.join(out,'reader-private');
fs.mkdirSync(out,{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'Published Windows ZIP joining the upgraded production server from an external GitHub runner',version:'0.5.0-preview.8',osFirewallCut:false,independentMeshFailover:false,steps:[],rendererErrors:[]};
const save=()=>fs.writeFileSync(path.join(out,'server-results.json'),sanitize(report));
const note=(step,details={})=>{report.steps.push({step,...details});save();console.log(step,sanitize(details));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const mod=p=>import(pathToFileURL(path.join(repo,p)).href);
let browser,app,ui;
async function close(){if(browser){await browser.close().catch(()=>{});browser=null;}if(app&&app.exitCode===null){cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F']);await pause(500);}app=null;}
function audit(){const f=path.join(reader,'network-audit.jsonl');return fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];}
(async()=>{
 try{
  const seed=profile.directPeers[0];assert.ok(seed,'Approved Mesh seed required');
  const response=await fetch('http://'+seed+'/mesh/v1/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'network'}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.ok,true);
  const {encodeInvitation,verifyNetwork}=await mod('src/network-invitation.mjs');
  const invitation={version:1,key:process.env.EXPECTED_NETWORK_KEY,seeds:[seed],local:false};
  const publication=verifyNetwork(result.network,invitation);assert.equal(publication.name,'Vevivo ArNS Mesh');
  const code=encodeInvitation(invitation);values.unshift(code);
  note('external-signed-publication',{verified:true,revision:publication.revision,name:publication.name});
  const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
  const env={...process.env,ARNS_MESH_USER_DATA:reader};delete env.MESH_QA_PROFILE;delete env.EXPECTED_NETWORK_KEY;
  const log=fs.openSync(path.join(out,'electron-private.log'),'a');
  app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env,stdio:['ignore',log,log]});
  for(let i=0;i<60;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:1000});break;}catch(e){if(i===59)throw e;await pause(500);}}
  for(let i=0;i<40;i++){ui=browser.contexts()[0].pages().find(p=>p.url()==='arnsui://app/index.html');if(ui)break;await pause(250);}
  assert.ok(ui,'Toolbar unavailable');ui.setDefaultTimeout(15000);ui.on('pageerror',e=>report.rendererErrors.push(sanitize(e.message)));await ui.locator('#address').waitFor();
  await ui.locator('#settings-button').click();await ui.locator('#network-code').fill(code);await ui.locator('#inspect-network').click();await ui.locator('#network-preview').waitFor({state:'visible',timeout:30000});
  assert.equal(await ui.locator('#network-preview-name').innerText(),'Vevivo ArNS Mesh');assert.equal(fs.existsSync(path.join(reader,'network-membership.json')),false);
  await ui.locator('#join-network').click();await ui.waitForFunction(()=>document.getElementById('settings-result').textContent.startsWith('Joined '),null,{timeout:45000});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reader,'mesh-ip-peers.json'))),publication.profile.directPeers);
  note('published-executable-code-join',{passed:true,manualSourceEditing:false});
  await ui.locator('#settings-panel [data-close]').click();await ui.locator('#address').fill('vevivo');await ui.locator('#open-address').click();
  await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"].done')||document.querySelector('#access-stages .error'),null,{timeout:100000});
  assert.equal(await ui.locator('#access-stages [data-stage="open"].done').count(),1);assert.match(await ui.locator('#content-status').innerText(),/verified/i);
  note('live-arns-open',{name:'vevivo',signatureVerified:true});
  const {parsePeerAddresses}=await mod('src/direct-peer.mjs');
  const {createSwarmMeshClient}=await mod('src/swarm-client.mjs');
  const {fetchMeshContent}=await mod('src/content-fetcher.mjs');
  const client=createSwarmMeshClient({directPeers:parsePeerAddresses([seed]),dhtEnabled:false,cacheOnly:true});
  try{const content=await fetchMeshContent('HCM6ASXONmBrl53IhZQOpKLAGhu4_Xq7awX3IGIjIjk',{client,signal:AbortSignal.timeout(20000)});assert.equal(content.direct.transport,'p2p-content');assert.ok(content.direct.payload.length>0);note('production-peer-content',{verified:true,transport:'p2p-content',bytes:content.direct.payload.length});}finally{await client.stop();}
  await ui.locator('#saved-button').click();await ui.locator('#save-current').click();
  await ui.waitForFunction(()=>document.querySelector('#saved-list button')&&!document.getElementById('saved-list').textContent.includes('Saving'),null,{timeout:60000});
  const before=audit().length;await ui.getByRole('button',{name:'Open saved version',exact:true}).click();
  await ui.waitForFunction(()=>document.querySelector('#access-stages [data-stage="open"].done'),null,{timeout:30000});await pause(1500);
  assert.equal(audit().slice(before).filter(r=>r.type==='request').length,0);note('saved-reopen',{newApplicationRequests:0});
  assert.deepEqual(report.rendererErrors,[]);report.passed=true;
 }catch(error){report.fatal=sanitize(error.stack);console.error(report.fatal);process.exitCode=1;}
 finally{await close();report.finishedAt=new Date().toISOString();save();}
})();
