// Actual extracted Windows package, not Electron-as-Node or a mocked renderer.
// Synthetic signed corpus, loopback supporter; no live public ArNS claim.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.join(process.env.QA_TOOLS,'package.json'))('playwright');
const output=path.resolve(process.env.QA_OUTPUT),data=path.join(output,'reader');
fs.mkdirSync(output,{recursive:true});
const report={schema:'arns-mesh-windows-compressed-content/v1',startedAt:new Date().toISOString(),realSignedFiles:true,realPublicContent:false,sameMachineFixture:true,checks:[],cases:[],errors:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let app,browser,fixture,state;
const save=()=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
function fixtureMessage(message,match,timeout=30000){
 return new Promise((resolve,reject)=>{
  const done=(error,value)=>{clearTimeout(timer);fixture.off('message',onMessage);fixture.off('exit',onExit);fixture.off('error',onError);error?reject(error):resolve(value);};
  const onMessage=m=>{if(m.fixtureError)done(new Error(m.fixtureError));else if(match(m))done(null,m);};
  const onExit=code=>done(new Error('Fixture exited before response: '+code));
  const onError=error=>done(error);
  const timer=setTimeout(()=>done(new Error('Fixture response timeout')),timeout);
  fixture.on('message',onMessage);fixture.once('exit',onExit);fixture.once('error',onError);if(message)fixture.send(message);
 });
}
async function launch(){
 const log=fs.openSync(path.join(output,'electron.log'),'a');
 app=cp.spawn(process.env.QA_EXE,['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],{env:{...process.env,ARNS_MESH_USER_DATA:data,ARNS_MESH_DIRECT_ONLY:'1'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 for(let i=0;i<80;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:800});break;}catch(error){if(i===79)throw error;await pause(300);}}
 let ui,home;
 for(let i=0;i<80;i++){const pages=browser.contexts().flatMap(context=>context.pages());ui=pages.find(page=>page.url()==='arnsui://app/index.html');home=pages.find(page=>page.url().startsWith('arnsui://app/welcome.html'));if(ui&&home)break;await pause(200);}
 assert.ok(ui&&home,'Toolbar and Home must load in the real package');
 ui.setDefaultTimeout(20000);ui.on('pageerror',error=>report.errors.push(error.message));
 await home.waitForLoadState('load',{timeout:30000});await home.locator('#mesh-query').waitFor();
 await ui.waitForFunction(()=>document.activeElement?.id==='address'&&document.querySelector('#tabs [aria-selected="true"]'),null,{timeout:30000});
 if(await ui.locator('#settings-panel').isVisible())await ui.getByRole('button',{name:'Close settings',exact:true}).click();
 return ui;
}
async function closeApplication(){
 if(browser){await browser.close().catch(()=>{});browser=null;}
 if(app&&app.exitCode===null)cp.spawnSync('taskkill',['/pid',String(app.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
 for(let i=0;i<30&&app&&app.exitCode===null;i++)await pause(100);
 if(app)assert.notEqual(app.exitCode,null,'Owned Electron must stop before restart');app=null;await pause(300);
}
async function stopFixture(){
 if(!fixture||fixture.exitCode!==null)return;
 const child=fixture;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(new Error('Fixture failed to stop'));},7000);
  child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Fixture exit '+code));});
  child.send('stop');
 });
}
async function navigate(ui,name,entryPath=''){
 await ui.locator('#address').fill('ar://'+name+'/'+entryPath.replace(/^\/+/,''));await ui.locator('#open-address').click();
 let page;
 for(let i=0;i<80;i++){page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith('ar://'+name+'/'));if(page)break;await pause(200);}
 assert.ok(page,'ArNS renderer must exist: '+name);page.setDefaultTimeout(30000);return page;
}
async function checkRendered(page,site,phase){
 await page.locator('#proof').filter({hasText:site.label+' HTML decoded once'}).waitFor({timeout:90000});
 await page.locator('#script-status').filter({hasText:'Verified '+site.label+' JavaScript ran'}).waitFor();
 assert.equal(await page.locator('#proof').evaluate(node=>getComputedStyle(node).color),'rgb(84, 39, 200)','Decoded stylesheet applied');
 const headers=await page.evaluate(async()=>{
  const get=await fetch('app.js'),text=await get.text();
  const head=await fetch('app.js',{method:'HEAD'}),headBytes=(await head.arrayBuffer()).byteLength;
  const range=await fetch('app.js',{headers:{Range:'bytes=0-12'}}),rangeText=await range.text();
  const invalid=await fetch('app.js',{headers:{Range:'bytes=999999-1000000'}});
  return {get:{status:get.status,length:get.headers.get('content-length'),encoding:get.headers.get('content-encoding'),type:get.headers.get('content-type'),text},head:{status:head.status,length:head.headers.get('content-length'),bytes:headBytes},range:{status:range.status,length:range.headers.get('content-length'),contentRange:range.headers.get('content-range'),text:rangeText},invalid:{status:invalid.status,contentRange:invalid.headers.get('content-range')}};
 });
 assert.equal(headers.get.status,200);assert.equal(headers.get.text,site.script);
 assert.equal(Number(headers.get.length),Buffer.byteLength(site.script));assert.equal(headers.get.encoding,null,'Already decoded custom-protocol body must not be decoded twice');
 assert.match(headers.get.type,/javascript/);assert.equal(headers.head.status,200);assert.equal(headers.head.length,headers.get.length);assert.equal(headers.head.bytes,0);
 assert.equal(headers.range.status,206);assert.equal(headers.range.text,site.script.slice(0,13));assert.equal(headers.range.length,'13');assert.equal(headers.range.contentRange,'bytes 0-12/'+Buffer.byteLength(site.script));
 assert.equal(headers.invalid.status,416);assert.equal(headers.invalid.contentRange,'bytes */'+Buffer.byteLength(site.script));
 await page.screenshot({path:path.join(output,phase+'-'+site.label+'.png'),fullPage:true});
 report.cases.push({phase,encoding:site.label,html:true,javascript:true,css:true,headers});save();
}
async function checkPublic(page,site,phase){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('heading',{level:1}).filter({hasText:site.expectedHeading}).waitFor({timeout:95000});
 // Hash what the actual custom-protocol renderer receives, independently of
 // the supporter cache. These expected hashes come from verified signed bytes.
 const files=await page.evaluate(async checks=>{
  const rows=[];
  for(const check of checks){
   const response=await fetch(check.path),bytes=await response.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
   rows.push({path:check.path,status:response.status,type:response.headers.get('content-type'),encoding:response.headers.get('content-encoding'),length:response.headers.get('content-length'),decodedBytes:bytes.byteLength,sha256:hash});
  }
  return rows;
 },site.checks);
 for(let index=0;index<site.checks.length;index++){
  const expected=site.checks[index],actual=files[index];
  assert.equal(actual.status,200,expected.path);assert.equal(actual.sha256,expected.decodedSha256,expected.path);
  assert.equal(actual.encoding,null);assert.equal(Number(actual.length),actual.decodedBytes);
 }
 const styles=await page.evaluate(()=>({stylesheets:document.styleSheets.length,headingFontSize:getComputedStyle(document.querySelector('h1')).fontSize}));
 assert.ok(styles.stylesheets>0);assert.ok(Number.parseFloat(styles.headingFontSize)>20,'Public documentation stylesheet must be applied');
 await page.screenshot({path:path.join(output,phase+'-public-docs.png'),fullPage:true});
 report.publicSite={...(report.publicSite||{}),name:site.name,manifest:site.manifest,entryPath:site.entryPath,scope:'Retained original name binding and bounded authentic public documentation entry assets; not a full-site or external-service test',realPublicContent:true,phases:[...(report.publicSite?.phases||[]),{phase,heading:site.expectedHeading,files,styles,pageErrors:errors}]};save();
}
async function savePage(ui,site){
 await ui.locator('#saved-button').click();await ui.locator('#save-current').click();
 const row=ui.locator('.saved-site').filter({hasText:site.name+' ·'});
 await row.filter({hasText:'4/4 files · Manifest files saved'}).waitFor({timeout:60000});
 const saved=JSON.parse(fs.readFileSync(path.join(data,'saved-sites.json'),'utf8'))[site.name];
 assert.equal(saved.status,'manifest-saved');assert.equal(saved.saved,4);assert.equal(saved.failed,0);
 await ui.getByRole('button',{name:'Close saved pages',exact:true}).click();
}
(async()=>{try{
 assert.ok(!fs.existsSync(data),'Compression acceptance needs a fresh reader');
 fixture=cp.fork(path.join(__dirname,'compressed-content-peer.mjs'),[],{env:process.env,stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
 state=await fixtureMessage(null,message=>message.ready,60000);
 report.realPublicContent=Boolean(state.publicSite);
 assert.equal(state.remoteFetch,false);assert.equal(state.prepared.length,3);
 report.preparation=state.prepared;report.checks.push('Supporter prepared three complete signed file sets, including compressed manifests, before the reader started');
 let ui=await launch();
 for(const site of state.sites){
  const page=await navigate(ui,site.name);await checkRendered(page,site,'01-supporter');await savePage(ui,site);
 }
 const served=(await fixtureMessage('status',message=>message.status)).status;
 assert.ok(served.contentBytesServed>0);assert.ok(served.preparedSnapshotsServed>=3,'Each retained page binding came from the prepared supporter path');
 report.serving=served;report.checks.push('Fresh packaged reader recovered prepared gzip, Brotli and plain sites from supporter; HTML, JavaScript and CSS rendered with decoded lengths, HEAD and ranges');
 assert.ok(state.publicSite,'Verified public compression corpus must be seeded before Windows acceptance');
 const publicPage=await navigate(ui,state.publicSite.name,state.publicSite.entryPath);
 await checkPublic(publicPage,state.publicSite,'01-supporter');
 report.checks.push('Authentic public documentation entry opened from original signed compressed files; renderer HTML, JavaScript and CSS hashes matched the decoded verified corpus');

 for(const failure of state.failures){
  const page=await navigate(ui,failure.name);
  await page.getByRole('heading',{name:'This page could not be reached',exact:true}).waitFor({timeout:95000});
  const text=await page.locator('body').innerText();
  assert.equal(await page.locator('#unsafe').count(),0,'Unverified or undecodable bytes must never render');
  assert.equal(text.includes('UNSAFE COMPRESSION CONTENT'),false);
  if(failure.label!=='signature'){
   assert.match(text,/compress|encod|limit|large|size/i,'Compression failure should explain its cause');
   assert.doesNotMatch(text,/content_(?:decod|encod)\w*/,'Display a readable message, not only an internal decoder code');
  }
  await page.screenshot({path:path.join(output,'02-error-'+failure.label+'.png'),fullPage:true});
  report.cases.push({phase:'failure',case:failure.label,rejected:true,message:text});save();
 }
 report.checks.push('Signed malformed gzip and Brotli, unsupported encoding, excessive expansion and tampered signed bytes failed closed in the actual renderer');
 report.readerOriginals=(await fixtureMessage('verify-reader',message=>message.readerOriginals)).readerOriginals;
 assert.equal(report.readerOriginals.compressedRawPreserved,true);assert.equal(report.readerOriginals.tamperedItemAbsent,true);
 report.checks.push('Reverified reader cache still contains the exact original signed compressed bytes; the tampered item was never cached');
 // Select Saved through the product UI, stop all fixture services, then restart.
 await ui.locator('#menu-button').click();await ui.locator('#saved-toggle').setChecked(true);await ui.locator('#menu-button').click();
 await closeApplication();await stopFixture();
 assert.equal(JSON.parse(fs.readFileSync(path.join(data,'preferences.json'),'utf8')).accessPolicy,'saved');
 ui=await launch();
 for(const site of state.sites){
  await ui.locator('#saved-button').click();
  await ui.locator('.saved-site').filter({hasText:site.name+' ·'}).getByRole('button',{name:'Open saved version',exact:true}).click();
  let page;for(let i=0;i<80;i++){page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith('ar://'+site.name+'/'));if(page)break;await pause(200);}
  assert.ok(page);await checkRendered(page,site,'03-saved-restart');
 }
 await ui.locator('#monitor-button').click();await ui.locator('#rpc-state').filter({hasText:'Paused'}).waitFor();
 assert.equal(await ui.locator('#monitor-requests').innerText(),'0','Saved restart must not issue HTTP requests');
 assert.equal(await ui.locator('#page-source').innerText(),'From this device');
 await ui.screenshot({path:path.join(output,'04-saved-zero-network.png')});
 report.checks.push('Saved file sets reopened after a real process restart with the only supporter stopped; compressed HTML, CSS and JS and ranges still worked with zero HTTP requests');
 await ui.getByRole('button',{name:'Close connection monitor',exact:true}).click();
 // This public case is a retained entry cache, not a claim that its entire
 // multi-page manifest was saved. Complete site-saving is covered above.
 const publicSaved=await navigate(ui,state.publicSite.name,state.publicSite.entryPath);
 await checkPublic(publicSaved,state.publicSite,'03-saved-restart');
 report.checks.push('The same bounded public documentation entry reopened from its retained name and content after the supporter stopped');

 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}
finally{
 await closeApplication().catch(error=>{report.cleanupError=error.message;process.exitCode=1;});
 await stopFixture().catch(error=>{report.fixtureCleanupError=error.message;process.exitCode=1;});
 save();console.log(JSON.stringify(report));
}
})();
