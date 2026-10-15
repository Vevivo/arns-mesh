// Actual packaged Windows Electron acceptance. No Electron doubles.
// Controlled loopback couriers and real Ed25519/ANS-104 signatures are fixtures,
// not independently administered production operators or a public-chain site.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {setTimeout as pause} from 'node:timers/promises';

const executable=path.resolve(process.env.QA_EXE||''),output=path.resolve(process.env.QA_OUTPUT||'');
assert(process.env.QA_EXE&&process.env.QA_OUTPUT,'Set QA_EXE and a fresh QA_OUTPUT');
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const expectedVersion=process.env.QA_EXPECTED_VERSION||JSON.parse(fs.readFileSync(path.join(sourceRoot,'package.json'),'utf8')).version;
assert(typeof expectedVersion==='string'&&expectedVersion.length>0,'Expected application version missing');
if(process.env.QA_READER_DIR)assert(path.isAbsolute(process.env.QA_READER_DIR),'QA_READER_DIR must be absolute');
const appRoot=path.join(path.dirname(executable),'resources','app');
const requireApp=createRequire(path.join(appRoot,'package.json'));
const packaged=file=>import(pathToFileURL(path.join(appRoot,file)));
const report={schema:'arns-mesh-packaged-protected-acceptance/v1',startedAt:new Date().toISOString(),executable,scope:'Actual Windows packaged Electron, real renderer and localhost HTTP; synthetic signed names/content; no live public website or real operator independence claim',checks:[],cases:[],errors:[]};
assert(fs.existsSync(executable),'Packaged executable missing');
assert(!fs.existsSync(output),'Acceptance output must be fresh');
fs.mkdirSync(output,{recursive:true});
const reader=process.env.QA_READER_DIR?path.resolve(process.env.QA_READER_DIR):path.join(output,'reader'),provider=path.join(output,'supporter');
assert(!fs.existsSync(reader),'Acceptance reader directory must be fresh; existing user data is forbidden');
assert(reader!==provider,'Acceptance reader and supporter directories must differ');
report.readerDirectory=reader;report.expectedVersion=expectedVersion;
fs.mkdirSync(provider);
const save=()=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const servers=[],connections=new Set(),targets=new Map(),corpus=new Map(),requests=[];
let app=null,ui=null,page=null,debugPort,providerRuntime,fixtureOpen=true;
const cdpSessions=new Set();

class Cdp {
 constructor(socket){this.socket=socket;this.next=0;this.pending=new Map();this.events=[];
  socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);}else{this.events.push(message);if(this.events.length>128)this.events.shift();}});
  socket.addEventListener('close',()=>{for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('CDP connection closed'));}this.pending.clear();});
 }
 static async connect(url){const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});const client=new Cdp(socket);cdpSessions.add(client);return client;}
 call(method,params={},timeout=120000){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},timeout);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
 async screenshot(file){const {data}=await this.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,file),Buffer.from(data,'base64'));}
 close(){this.socket.close();cdpSessions.delete(this);}
}
async function until(work,label,timeout=90000){const started=Date.now(),deadline=started+timeout;let last,announced=started;while(Date.now()<deadline){try{const value=await work();if(value)return value;}catch(error){last=error;}if(Date.now()-announced>=15000){console.log(JSON.stringify({waiting:label,elapsedMs:Date.now()-started,lastError:last?.message}));announced=Date.now();}await pause(100);}throw new Error(label+(last?': '+last.message:''));}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function cdpTargets(){return new Promise((resolve,reject)=>{const request=http.get({host:'127.0.0.1',port:debugPort,path:'/json/list',timeout:2000},response=>{const chunks=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024){request.destroy(new Error('CDP target list too large'));return;}chunks.push(chunk);});response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch(error){reject(error);}});response.on('error',reject);});request.on('error',reject);request.on('timeout',()=>request.destroy(new Error('CDP discovery timeout')));});}
async function launch(){
 debugPort=await freePort();const log=fs.openSync(path.join(output,'electron.log'),'a');
 const env={...process.env,ARNS_MESH_USER_DATA:reader,ARNS_MESH_DIRECT_ONLY:'1'};
 delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 app=cp.spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+debugPort,'--enable-logging','--log-file='+path.join(output,'chromium.log')],{env,stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 report.launches??=[];report.launches.push({pid:app.pid,debugPort,startedAt:new Date().toISOString()});save();console.log(JSON.stringify({launched:app.pid,debugPort,output}));
 app.on('error',error=>report.errors.push('launch: '+error.message));
 const startupTimeout=Number(process.env.QA_STARTUP_TIMEOUT||300000);assert(Number.isSafeInteger(startupTimeout)&&startupTimeout>=1000&&startupTimeout<=600000,'Invalid QA_STARTUP_TIMEOUT');
 const toolbarTarget=await until(async()=>{if(app.exitCode!==null)throw new Error('Electron exited: '+app.exitCode);return (await cdpTargets()).find(t=>t.url==='arnsui://app/index.html');},'Actual toolbar did not launch',startupTimeout);
 ui=await Cdp.connect(toolbarTarget.webSocketDebuggerUrl);await ui.call('Runtime.enable');await ui.call('Page.enable');
 await until(()=>ui.evaluate('Boolean(globalThis.arnsMesh&&document.querySelector("#address"))'),'Toolbar preload');
 await ui.evaluate('globalThis.__acceptanceState=null;arnsMesh.onState(s=>globalThis.__acceptanceState=s);arnsMesh.ready()');
 const settings=await ui.evaluate('arnsMesh.getSettings()');assert.equal(settings.version,expectedVersion);assert.equal(path.resolve(settings.executable),executable);
 report.version=settings.version;report.settingsPolicyId=settings.connectionProfile.nameWitnessPolicy?namePolicyId(settings.connectionProfile.nameWitnessPolicy):null;
 await until(async()=>{const home=(await cdpTargets()).find(t=>t.url.startsWith('arnsui://app/welcome.html'));if(!home)return false;page=await Cdp.connect(home.webSocketDebuggerUrl);await page.call('Runtime.enable');await page.call('Page.enable');return true;},'Actual content webContents');
}
async function stopApp(){
 for(const client of [...cdpSessions])client.close();ui=null;page=null;
 if(app&&app.exitCode===null){
  const killed=cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F'],{encoding:'utf8',windowsHide:true});
  if(killed.status!==0&&app.exitCode===null)throw new Error('Could not stop owned acceptance process '+app.pid+': '+killed.stdout+killed.stderr);
  await until(()=>app.exitCode!==null,'Owned acceptance process stop',10000);
 }
 app=null;await pause(300);
}
async function stopFixture(){fixtureOpen=false;for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}servers.length=0;}
async function navigate(name){
 await ui.evaluate('arnsMesh.navigate('+JSON.stringify('ar://'+name+'/')+')');
 await until(()=>page.evaluate('location.href.startsWith('+JSON.stringify('ar://'+name+'/')+')&&document.readyState==="complete"'),'Page navigation '+name);
}
async function state(){await ui.evaluate('arnsMesh.ready()');return until(()=>ui.evaluate('globalThis.__acceptanceState'),'Toolbar state');}
async function mode(value){await ui.evaluate('arnsMesh.setAccessPolicy('+JSON.stringify(value)+')');}
async function rendered(site,phase){
 const dom=await until(async()=>{const d=await page.evaluate('({title:document.title,proof:document.querySelector("#proof")?.textContent,script:document.querySelector("#script-status")?.textContent,color:document.querySelector("#proof")?getComputedStyle(document.querySelector("#proof")).color:null})');return d.proof===site.label+' HTML decoded once'&&d.script==='Verified '+site.label+' JavaScript ran'?d:false;},'HTML and JavaScript render '+site.name);
 assert.equal(dom.color,'rgb(84, 39, 200)');
 const headers=await page.evaluate('(async()=>{const r=await fetch("app.js"),text=await r.text(),h=await fetch("app.js",{method:"HEAD"}),headBytes=(await h.arrayBuffer()).byteLength,q=await fetch("app.js",{headers:{Range:"bytes=0-12"}});return {status:r.status,type:r.headers.get("content-type"),encoding:r.headers.get("content-encoding"),length:r.headers.get("content-length"),text,head:{status:h.status,length:h.headers.get("content-length"),bytes:headBytes},range:{status:q.status,length:q.headers.get("content-length"),contentRange:q.headers.get("content-range"),text:await q.text()}}})()');
 assert.equal(headers.status,200);assert.equal(headers.text,site.script);assert.equal(headers.encoding,null);assert.equal(Number(headers.length),Buffer.byteLength(site.script));
 assert.equal(headers.head.status,200);assert.equal(headers.head.bytes,0);assert.equal(headers.head.length,headers.length);
 assert.equal(headers.range.status,206);assert.equal(headers.range.length,'13');assert.equal(headers.range.text,site.script.slice(0,13));assert.equal(headers.range.contentRange,'bytes 0-12/'+Buffer.byteLength(site.script));
 await page.screenshot(phase+'-'+site.name+'.png');
 const status=await state();assert.equal(status.meta.contentSignatureVerified,true);assert.equal(status.meta.accessSnapshot.provenance.kind,'quorum-witness');assert.equal(status.meta.accessSnapshot.txId,site.root);assert.equal(status.meta.verification.currentStateVerified,false);assert.equal(status.meta.verification.witnessDomains.length,3);
 const row={phase,name:site.name,encoding:site.encoding||'identity',dom,headers,nameTargetId:status.meta.nameTargetId,observedAt:status.meta.accessSnapshot.observedAt,recovery:status.meta.recovery,certificateDomains:status.meta.verification.witnessDomains};
 report.cases.push(row);save();return row;
}
async function saveSite(site){
 await ui.evaluate('arnsMesh.pinSite()');
 await until(()=>{try{const row=JSON.parse(fs.readFileSync(path.join(reader,'saved-sites.json'),'utf8'))[site.name];return row?.status==='manifest-saved'&&row.saved===4&&row.failed===0;}catch{return false;}},'Save complete certified site '+site.name,60000);
}
async function failure(name,caseName,{contentMustNotFetch=false,expected=/name|witness|certificate|trusted|available|reach/i}={}){
 const before=requests.filter(r=>r.op==='content'&&targets.get(name)?.ids?.includes(r.dataId)).length;
 await navigate(name);
 const dom=await until(async()=>{const value=await page.evaluate('({title:document.title,body:document.body.innerText,unsafe:!!document.querySelector("#unsafe")})');return value.title==='Unable to open page'?value:false;},'Refusal page '+name);
 assert.equal(dom.unsafe,false);assert(!dom.body.includes('UNSAFE FIXTURE'));assert.match(dom.body,expected);
 if(contentMustNotFetch)assert.equal(requests.filter(r=>r.op==='content'&&targets.get(name)?.ids?.includes(r.dataId)).length,before,'Rejected name must not request any content');
 await page.screenshot('refused-'+caseName+'.png');
 const status=await state();assert.equal(status.phase,'error');
 report.cases.push({phase:'refusal',name,case:caseName,dom,internalError:status.meta?.error,contentNotFetched:contentMustNotFetch});save();
}
let createNameObservation,nameObservationSigningBytes,witnessKeyId,namePolicyId,verifyStoredContent,store,policy,keys,routeKeys;
const sites=[],negative=[];
const signatures=new Map(),oldCertificates=new Map();
function envelope(record,keyIndex=0){const recordJson=JSON.stringify(record),key=routeKeys[keyIndex],publicKeyPem=key.publicKey.export({type:'spki',format:'pem'});return{ok:true,witnessPeerId:hash(publicKeyPem),witnessPublicKeyPem:publicKeyPem,recordJson,signature:crypto.sign(null,Buffer.from(recordJson),key.privateKey).toString('base64url')};}
function vote(name,index,{old=false,wrong=false}={}){
 const binding=targets.get(name),round=Math.floor(Date.now()/policy.roundMs)-(old?5:0),target=wrong?'Z'.repeat(43):binding.root;
 const cacheKey=[name,index,round,target].join('|');if(signatures.has(cacheKey))return signatures.get(cacheKey);
 const time=round*policy.roundMs+100,recordJson=createNameObservation(policy,{name,purpose:'current',antId:'1'.repeat(32),antProgramId:'1'.repeat(32),txId:target,round,slot:1000+round,observedAt:time,issuedAt:time});
 const signed={keyId:witnessKeyId(policy.witnesses[index].publicKeyPem),recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),keys[index].privateKey).toString('base64url')};signatures.set(cacheKey,signed);return signed;
}
function certificate(name,{old=false}={}){if(old&&oldCertificates.has(name))return oldCertificates.get(name);const observations=[0,1,2].map(i=>vote(name,i,{old}));const value={schema:'arns-mesh-name-certificate/v1',round:JSON.parse(observations[0].recordJson).round,observations};if(old)oldCertificates.set(name,value);return value;}
function certificateReply(name,index,historical){
 const target=targets.get(name),reply={schema:'arns-mesh-name-certificate-reply/v1',name,policyId:namePolicyId(policy),observations:[],certificates:[]};
 if(!target)return reply;
 if(target.scenario==='one'){reply.observations=[vote(name,0),vote(name,0),vote(name,0)];return reply;}
 if(target.scenario==='wrong'){if(index<3)reply.observations=[vote(name,index,{wrong:index===0})];return reply;}
 if(target.scenario==='forged'){const original=vote(name,index);reply.observations=[{...original,recordJson:original.recordJson.replace(target.root,'Z'.repeat(43))}];return reply;}
 if(target.scenario==='expired'||target.scenario==='retained'){
  if(!oldCertificates.has(name))oldCertificates.set(name,certificate(name,{old:true}));
  // One courier alone can relay all original signatures, including to a fresh reader.
  if(index===0)reply.certificates=[oldCertificates.get(name)];return reply;
 }
 if(target.scenario==='unavailable')return reply;
 reply.observations=[vote(name,index,{wrong:target.scenario==='one-bad'&&index===0})];return reply;
}
async function fixture(){
 const cert=await packaged('src/name-certificates.mjs');({createNameObservation,nameObservationSigningBytes,witnessKeyId,namePolicyId}=cert);
 const content=await packaged('src/content-store.mjs');verifyStoredContent=content.verifyStoredContent;store=new content.VerifiedContentStore(path.join(provider,'content'));
 const {createData,EthereumSigner}=await import(pathToFileURL(requireApp.resolve('@dha-team/arbundles/node')));
 const dataSigner=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 keys=Array.from({length:4},()=>crypto.generateKeyPairSync('ed25519'));routeKeys=Array.from({length:4},()=>crypto.generateKeyPairSync('ed25519'));
 const now=Date.now();policy={schema:'arns-mesh-name-policy/v1',networkId:'packaged-windows-controlled-'+Date.now(),chainId:'solana:11111111111111111111111111111111',registryProgramId:'1'.repeat(32),threshold:3,maxFaults:1,roundMs:60000,leaseMs:120000,maxFutureSkewMs:1000,validFrom:now-86400000,validUntil:now+86400000,witnesses:keys.map((key,i)=>({domain:'simulated-'+i,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}))};
 async function item(text,type,encoding,{encoded=false,tamper=false}={}){
  const plain=Buffer.from(text),bytes=encoded?plain:encoding==='gzip'?gzipSync(plain):encoding==='br'?brotliCompressSync(plain):plain;
  const data=createData(bytes,dataSigner,{tags:[{name:'Content-Type',value:type},...(encoding?[{name:'Content-Encoding',value:encoding}]:[])]});await data.sign(dataSigner);
  const raw=Buffer.from(data.getRaw());await store.put(data.id,raw);const sent=Buffer.from(raw);if(tamper)sent[sent.length-1]^=1;
  corpus.set(data.id,{id:data.id,raw,sent,type,encoding,originalSha256:hash(raw),tamper});return data.id;
 }
 for(const encoding of [null,'gzip','br']){
  const label=encoding||'plain',name='protected-'+label,script="document.getElementById('script-status').textContent='Verified "+label+" JavaScript ran';";
  const css='body{background:#f6f4ef;color:#23232d;font:18px system-ui;margin:40px}h1{color:rgb(84,39,200)}';
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Protected '+label+'</title><link rel="stylesheet" href="style.css"><main><p>CONTROLLED SIGNED NAME CERTIFICATE TEST</p><h1 id="proof">'+label+' HTML decoded once</h1><p id="script-status">Script pending</p><p>Real packaged Windows renderer. Three original witness signatures.</p></main><script src="app.js"></script></html>';
  const paths={};for(const [file,text,type] of [['index.html',html,'text/html'],['style.css',css,'text/css'],['app.js',script,'text/javascript']])paths[file]={id:await item(text,type,encoding)};
  const root=await item(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{path:'index.html'},paths}),'application/x.arweave-manifest+json',encoding);
  const site={name,label,encoding,script,html,css,root,ids:[root,...Object.values(paths).map(row=>row.id)],paths};sites.push(site);targets.set(name,site);
 }
 // Unique signed roots make no-content-fetch assertions independent of warm sites.
 for(const scenario of ['one','wrong','expired','forged']){
  const root=await item('<h1 id="unsafe">UNSAFE FIXTURE '+scenario+'</h1>','text/html','gzip');
  targets.set('protected-'+scenario,{root,ids:[root],scenario});negative.push({name:'protected-'+scenario,case:scenario,contentMustNotFetch:true});
 }
 const bad=[
  ['signature',Buffer.from('<h1 id="unsafe">UNSAFE FIXTURE signature</h1>'),'gzip',{tamper:true}],
  ['malformed-gzip',Buffer.from('not gzip'),'gzip',{encoded:true}],
  ['malformed-br',Buffer.from([255,255,255,255,255]),'br',{encoded:true}],
  ['unsupported',Buffer.from('<h1 id="unsafe">UNSAFE FIXTURE unsupported</h1>'),'zstd',{encoded:true}],
  ['expanded-limit',gzipSync(Buffer.alloc(32*1024*1024+1,65)),'gzip',{encoded:true}],
 ];
 for(const [scenario,text,encoding,options] of bad){const root=await item(text,'text/html',encoding,options);targets.set('protected-'+scenario,{root,ids:[root],scenario});negative.push({name:'protected-'+scenario,case:scenario,expected:/compress|encod|limit|large|size|signat|verified|reach|available/i});}
 targets.set('protected-resilient',{...sites[1],scenario:'one-bad'});
 targets.set('protected-retained',{...sites[2],name:'protected-retained',scenario:'retained'});
 for(let index=0;index<4;index++){
  const server=http.createServer((request,response)=>{
   let body='',size=0;request.on('data',chunk=>{size+=chunk.length;if(size>8192){request.destroy();return;}body+=chunk;});
   request.on('error',()=>{});
   request.on('end',()=>{
    try{
     assert.equal(request.method,'POST');assert.equal(request.url,'/mesh/v1/query');
     const req=JSON.parse(body);requests.push({at:Date.now(),index,op:req.op,name:req.name,dataId:req.dataId,historical:req.historical});
     let answer;
     if(req.op==='name-certificates')answer=envelope(certificateReply(req.name,index,req.historical),index);
     else if(req.op==='content'){
      const row=corpus.get(req.dataId);if(!row)answer={ok:false,error:'content_not_cached'};
      else {const offset=req.offset??0;answer=envelope(row.tamper?{dataId:req.dataId,offset,total:row.sent.length,sha256:hash(row.sent),data:row.sent.subarray(offset,offset+524288).toString('base64')}:store.chunk(req.dataId,offset),index);}
     }else answer={ok:false,error:'controlled_fixture_unavailable'};
     response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(answer));
    }catch(error){response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({ok:false,error:error.message}));}
   });
  });
  server.on('connection',socket=>{connections.add(socket);socket.once('close',()=>connections.delete(socket));});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});servers.push(server);
 }
 const directPeers=servers.map(s=>'127.0.0.1:'+s.address().port);
 const {applyProfile}=await packaged('apps/helper/network-profile.mjs');
 const profile={schema:'arns-mesh-network-profile/v1',directPeers,rpcSources:[],arweavePeers:[],nameWitnessPolicy:policy};
 applyProfile(reader,profile);applyProfile(provider,profile);
 fs.writeFileSync(path.join(reader,'preferences.json'),JSON.stringify({accessPolicy:'auto',trustedPeers:[],witnessQuorum:2}));
 const {createNameSecurityRuntime}=await packaged('src/name-security-runtime.mjs');
 providerRuntime=createNameSecurityRuntime({env:{ARNS_NAME_WITNESS_POLICY:path.join(provider,'name-witness-policy.json'),ARNS_IP_PEERS:path.join(provider,'mesh-ip-peers.json'),ARNS_MESH_DIRECT_ONLY:'1'},collect:async({name})=>({certificate:targets.get(name)?.scenario==='retained'?certificate(name,{old:true}):certificate(name)})});
 const context=providerRuntime.getProtectedNameContext();
 const {SitePinner}=await packaged('src/site-pinner.mjs'),{NameSnapshotStore}=await packaged('src/name-snapshots.mjs');
 const pinner=new SitePinner({file:path.join(provider,'saved-sites.json'),snapshots:new NameSnapshotStore(path.join(provider,'name-snapshots.json')),contentStore:store,getNameContext:()=>context});
 report.prepared=[];
 for(const site of [...sites,targets.get('protected-retained')]){
  const mode=site.scenario==='retained'?'historical':'current',snapshot=await context.authorizeName(site.name,{mode});
  const prepared=await pinner.start(site.name,{snapshot,contentSources:'local-only'});assert.equal(prepared.status,'manifest-saved');assert.equal(prepared.saved,4);assert(pinner.isReady(prepared));
  report.prepared.push({name:site.name,files:prepared.saved,root:site.root,observedAt:prepared.observedAt,certificateHash:prepared.snapshot.provenance.certificateHash});
 }
 assert(!fs.existsSync(path.join(reader,'content')),'Reader starts without cached content');
 assert(!fs.existsSync(path.join(reader,'certified-names')),'Reader starts without accepted name certificates');
 report.fixture={simulatedOperators:4,threshold:3,maxFaults:1,publicArns:false,rpcRequests:0,arweaveRequests:0,directPeers,policyId:namePolicyId(policy),originalSignedBytes:[...corpus.values()].reduce((n,r)=>n+r.raw.length,0)};
 fs.writeFileSync(path.join(output,'corpus.json'),JSON.stringify({sites,negative,publicPolicy:policy,records:[...corpus.values()].map(r=>({id:r.id,type:r.type,encoding:r.encoding,rawSha256:r.originalSha256,tamper:r.tamper}))},null,2));save();
}

try{
 console.log(JSON.stringify({stage:'preparing controlled original signed fixtures',output}));
 await fixture();await launch();assert.equal(report.settingsPolicyId,namePolicyId(policy));
 await mode('live');
 for(const site of sites){console.log(JSON.stringify({stage:'current renderer',name:site.name}));await navigate(site.name);await rendered(site,'01-current');await saveSite(site);}
 report.checks.push('Actual EXE renders protected gzip/Brotli/plain HTML, executes JavaScript and applies CSS from prepared original signed files; decoded GET/HEAD/Range semantics verified.');
 // A bad fast domain does not veto three authentic agreeing domains.
 await navigate('protected-resilient');const resilient=await rendered({...sites[1],name:'protected-resilient'},'02-one-bad');
 assert(!resilient.certificateDomains.includes('simulated-0'));report.checks.push('One signed wrong-target domain cannot redirect the reader; the three agreeing original domains win.');
 for(const row of negative)await failure(row.name,row.case,row);
 report.checks.push('One copied signer, split/wrong target, forged signature and expired current certificate fail before any content request; corrupt/unsupported/expanding content fails before rendering.');
 await navigate(sites[0].name);await rendered(sites[0],'03-cache-first');
 const before=requests.length;await navigate(sites[0].name);await rendered(sites[0],'03-cache-repeat');
 const contentBefore=requests.slice(0,before).filter(r=>r.op==='content').length,contentAfter=requests.filter(r=>r.op==='content').length;assert.equal(contentAfter,contentBefore,'Verified content is reused from cache');
 report.checks.push('Repeated actual renderer navigation reuses verified content without fetching its original bytes again.');
 await ui.evaluate('arnsMesh.home()');await mode('auto');await navigate('protected-retained');
 const history=await rendered({...sites[2],name:'protected-retained'},'04-fresh-reader-retained');
 assert(history.recovery);assert.equal(history.observedAt,report.prepared.find(r=>r.name==='protected-retained').observedAt);
 assert(requests.some(r=>r.name==='protected-retained'&&r.historical===true));
 report.checks.push('A previously unopened name opens as dated retained history from one courier carrying all three original signatures; no live certificate is fabricated.');
 const verified=[];
 for(const site of sites)for(const id of site.ids){const raw=fs.readFileSync(path.join(reader,'content',id+'.ans104'));await verifyStoredContent(raw,id);assert.equal(hash(raw),corpus.get(id).originalSha256);verified.push(id);}
 assert(!fs.existsSync(path.join(reader,'content',targets.get('protected-signature').root+'.ans104')));report.originals={verified:verified.length,exactEncodedSignedBytesPreserved:true,tamperedNotCached:true};
 await ui.evaluate('arnsMesh.home()');await mode('saved');await stopApp();await stopFixture();
 await launch();
 for(const site of sites){await navigate(site.name);const saved=await rendered(site,'05-saved-restart');assert(saved.recovery);}
 const offline=await state();assert.equal(offline.network.requests,0,'Saved restart must perform zero HTTP requests');report.savedRestart={network:offline.network,contentSource:offline.meta.contentSource};
 await ui.screenshot('05-saved-toolbar.png');report.checks.push('After real process restart and all four HTTP couriers stop, saved certified gzip/Brotli/plain sites render from disk with zero HTTP requests.');
 // Revocation must defeat even the warm saved response cache.
 fs.writeFileSync(path.join(reader,'name-witness-policy.json'),JSON.stringify({...policy,revoked:true}));
 await failure(sites.at(-1).name,'revoked-policy-cache',{expected:/policy|revoked|trusted|reach/i});
 report.checks.push('Revoked pinned policy blocks an otherwise cached saved page in the actual app.');
 report.passed=true;
}catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}
finally{
 await stopApp().catch(error=>{report.cleanupError=error.stack;process.exitCode=1;});
 if(fixtureOpen)await stopFixture().catch(error=>{report.fixtureCleanupError=error.stack;process.exitCode=1;});
 providerRuntime?.close();report.completedAt=new Date().toISOString();report.httpRequests=requests.length;report.contentRequests=requests.filter(r=>r.op==='content').length;
 fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(requests,null,2));save();
 console.log(JSON.stringify({passed:report.passed||false,cases:report.cases.length,checks:report.checks.length,error:report.error,cleanupError:report.cleanupError,output}));
}

