import '../../src/network-lockdown.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {app,BaseWindow,WebContentsView,protocol,session,ipcMain,dialog} from 'electron';
import {resolveArUrl,coreRoot} from '../helper/core-adapter.mjs';
import {configureRuntime,saveRpcSources,saveDirectPeers,parseTrustedPeers} from '../helper/runtime.mjs';
import {VerifiedContentStore} from '../../src/content-store.mjs';
import {loadProfile,applyProfile,readProfile,validateProfile,mergeProfiles} from '../helper/network-profile.mjs';
import {checkConnections} from '../helper/connection-check.mjs';
import {ResponseCache} from '../helper/response-cache.mjs';
import {SitePinner} from '../../src/site-pinner.mjs';
import {WorkBudget,transferBudgetStatus} from '../../src/resource-budget.mjs';
import {shareQuery} from '../../src/query-work.mjs';
import {networkAuditSnapshot,recordNetwork} from '../../src/network-audit.mjs';
import {BrowserState,normalizeAddress} from './browser-state.mjs';
import {Tabs} from './tabs.mjs';
import {contentResponse,isAllowedRendererUrl,plainError} from './response.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),WELCOME='arnsui://app/welcome.html';
const tabs=new Tabs(),cache=new ResponseCache(),requests=new WorkBudget({active:2,pending:128}),inflight=new Map();
let win,toolbar,runtime,store,pinner,library,settingsFile,timer,panelOpen=false,shuttingDown=false;
let accessPolicy='live',trustedPeers=[],witnessQuorum=2;
let connectionCheck=null;
process.chdir(coreRoot);
process.env.ARNS_MESH_DIRECT_ONLY='1';
process.env.ARNS_MESH_HEAD_START_MS='2500';
protocol.registerSchemesAsPrivileged([
  {scheme:'ar',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}},
  {scheme:'arnsui',privileges:{standard:true,secure:true}},
]);
app.setName('ArNS Mesh Browser');
app.setPath('userData',process.env.ARNS_MESH_USER_DATA||path.join(app.getPath('appData'),'ArNS-Mesh-Browser'));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('dns-prefetch-disable');
app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND');
app.commandLine.appendSwitch('disable-features','DnsOverHttps,MediaRouter');

function send(extra={}){
  if(!toolbar||toolbar.webContents.isDestroyed())return;
  const tab=tabs.active,wc=tab?.view?.webContents,audit=networkAuditSnapshot();
  toolbar.webContents.send('state',{
    version:app.getVersion(),url:tab?.url||'',title:tab?.title||'',tabs:tabs.snapshot(),tabLimit:tabs.limit,
    loading:wc?.isLoading()||false,canGoBack:wc?.navigationHistory.canGoBack()||false,canGoForward:wc?.navigationHistory.canGoForward()||false,
    canBookmark:Boolean(tab?.url),bookmarked:library?.has(tab?.url)||false,zoom:Math.round((wc?.getZoomFactor()||1)*100),
    phase:tab?.phase||'ready',message:tab?.message||'Enter an ArNS address.',meta:tab?.meta||null,progress:tab?.progress.snapshot(),resources:tab?.resources,
    mode:'p2p',accessPolicy,connectionConfigured:runtime?connectionConfigured():false,peer:{role:'reader',online:false,serving:false,indexing:false},savedSites:pinner?.status(),
    discovery:runtime?.discovery.status(),network:{...audit,events:audit.events.slice(-8)},
    resourceBudget:{role:'client',pageCacheBytes:cache.bytes,pageCacheLimit:cache.maxBytes,pageRequests:requests.status(),transfers:transferBudgetStatus()},...extra,
  });
}
function connectionConfigured(){const p=readProfile(runtime.dataDir);return Boolean(p.rpcSources.length&&(p.directPeers.length||p.arweavePeers.length));}
function uiHandler(request){
  const u=new URL(request.url),name=u.pathname.slice(1);
  if(u.hostname!=='app'||!['index.html','styles.css','app.js','welcome.html','welcome.css','welcome.js','mesh.svg'].includes(name))return new Response('Not found',{status:404});
  const type=name.endsWith('.svg')?'image/svg+xml':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html';
  return new Response(fs.readFileSync(path.join(here,'ui',name)),{headers:{'content-type':type+'; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
}
function filterSession(ses,{ui=false}={}){
  ses.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);
  ses.setDevicePermissionHandler(()=>false);
  ses.on('will-download',event=>event.preventDefault());
  ses.webRequest.onBeforeRequest((details,cb)=>{
    const allowed=ui?details.url.startsWith('arnsui://app/'):isAllowedRendererUrl(details.url);
    if(!allowed){recordNetwork({type:'blocked',reason:'browser_external_request',host:(()=>{try{return new URL(details.url).hostname;}catch{return '';}})(),resourceType:details.resourceType});}
    cb({cancel:!allowed});
  });
}
async function resolveForTab(tab,raw,{signal,onProgress=()=>{}}={}){
  return requests.run(()=>resolveArUrl(raw,{quorum:witnessQuorum,contentStore:store,snapshotStore:runtime.snapshots,accessPolicy,trustedPeers,signal,onProgress}),{signal});
}
async function arHandler(tab,request){
  if(!['GET','HEAD'].includes(request.method))return new Response('ArNS content is read-only.',{status:405,headers:{allow:'GET, HEAD'}});
  const raw=normalizeAddress(request.url).split('#')[0],epoch=tab.epoch,signal=AbortSignal.any([tab.controller.signal,request.signal,AbortSignal.timeout(90000)]);
  const top=raw===tab.url.split('#')[0],key=accessPolicy+'|'+raw;
  tab.resources.pending++;send();
  try{
    signal.throwIfAborted();
    if(accessPolicy==='live'&&!JSON.parse(fs.readFileSync(runtime.rpcFile)).length)throw new Error('Connection setup needed. Open Settings and import a connection profile from a supporter.');
    let result=cache.get(key);
    if(!result||Date.now()-result.at>3000){
      result=await shareQuery(inflight,tab.id+'|'+epoch+'|'+key,shared=>resolveForTab(tab,raw,{signal:shared,onProgress:event=>{
        if(top&&tabs.isCurrent(tab,epoch)){tab.progress.event(event);if(event.nameResolution)tab.meta={...tab.meta,nameResolution:event.nameResolution};if(event.message)tab.message=event.message;send();}
      }}),{signal});
      signal.throwIfAborted();if(tabs.isCurrent(tab,epoch))cache.set(key,result);
    }
    // Fail closed even if an adapter accidentally returns unverified bytes.
    const response=contentResponse(result,request);
    if(tabs.isCurrent(tab,epoch)){
      tab.resources.verified++;
      if(top){tab.meta=result.meta;tab.phase='loaded';tab.progress.finish();tab.message=result.meta.recovery?'Saved name observation · '+result.meta.recovery.observedAt+' · Current mapping not checked.':'Content signature verified · Name mapping relies on RPC observations.';}
    }
    return response;
  }catch(error){
    if(tabs.isCurrent(tab,epoch)&&!tab.controller.signal.aborted){
      tab.resources.failed++;tab.resources.lastError={url:raw,error:String(error.message||error).slice(0,300)};
      if(top){tab.phase='error';tab.message=plainError(error);tab.meta={...tab.meta,error:String(error.message||error),diagnostics:error.diagnostics};tab.progress.fail();}
    }
    const message=plainError(error).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return new Response(request.method==='HEAD'?null:`<!doctype html><html lang="en"><meta charset="utf-8"><title>Unable to open page</title><h1>This page could not be reached</h1><p>${message}</p><p>No gateway fallback. Open Page information for details.</p></html>`,{status:502,headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'",'cache-control':'no-store'}});
  }finally{if(tabs.isCurrent(tab,epoch))tab.resources.pending=Math.max(0,tab.resources.pending-1);send();}
}
function layout(){
  if(!win||!toolbar)return;const [width,height]=win.getContentSize(),bar=126;
  for(const tab of tabs.rows.values())if(tab.view){tab.view.setVisible(tab.id===tabs.activeId&&!panelOpen);tab.view.setBounds({x:0,y:bar,width,height:Math.max(0,height-bar)});}
  toolbar.setBounds({x:0,y:0,width,height:panelOpen?height:bar});
}
function report(error,tab=tabs.active){if(tab){tab.message=plainError(error);send();}}
async function navigate(raw,tab=tabs.active){
  const {epoch}=tabs.begin(tab.id,raw),target=tab.url||WELCOME;send();
  try{await tab.view.webContents.loadURL(target);}catch(error){if(tabs.isCurrent(tab,epoch)&&!String(error.message).includes('ERR_ABORTED'))report(error,tab);}
}
function selectTab(id){tabs.activate(id);panelOpen=false;layout();win.setTitle((tabs.active.title||'New tab')+' — ArNS Mesh Browser');send({command:'close-panel'});}
async function newTab(raw=''){
  const tab=tabs.create(raw),ses=session.fromPartition('mesh-tab-'+tab.id,{cache:false});
  try{
    filterSession(ses);ses.protocol.handle('ar',request=>arHandler(tab,request));
    ses.protocol.handle('arnsui',request=>request.url===WELCOME||/^(?:arnsui:\/\/app\/)(?:welcome\.(?:css|js)|mesh\.svg)$/.test(request.url)?uiHandler(request):new Response('Not found',{status:404}));
    tab.view=new WebContentsView({webPreferences:{session:ses,nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,spellcheck:false}});
    tab.view.setBackgroundColor('#11131a');win.contentView.addChildView(tab.view,0);guardTab(tab);layout();
    await navigate(raw,tab);send({focusAddress:!raw});return tab.id;
  }catch(error){if(tabs.rows.has(tab.id))tabs.close(tab.id);tab.view?.webContents.close();throw error;}
}
async function closeTab(id){
  const tab=tabs.close(id),ses=tab.view.webContents.session;win.contentView.removeChildView(tab.view);tab.view.webContents.close();
  ses.protocol.unhandle('ar');ses.protocol.unhandle('arnsui');void ses.clearStorageData().catch(()=>{});
  if(!tabs.rows.size)await newTab();else{layout();send();}
}
function stop(tab=tabs.active){tabs.stop(tab.id);tab.view.webContents.stop();send();}
function reload(){cache.clear();return navigate(tabs.active.url);}
function historyMove(direction){const h=tabs.active.view.webContents.navigationHistory;if(direction<0&&h.canGoBack())h.goBack();if(direction>0&&h.canGoForward())h.goForward();}
function toggleBookmark(){const tab=tabs.active;if(!tab.url)throw new Error('Open an ArNS page first.');const added=library.toggle(tab.url,tab.title||tab.url);send({libraryChanged:true});return added;}
function zoom(delta){if(![-1,0,1].includes(delta))throw new Error('invalid_zoom');const wc=tabs.active.view.webContents;wc.setZoomFactor(delta===0?1:Math.max(.5,Math.min(3,wc.getZoomFactor()+delta*.1)));send();}
function shortcuts(wc){wc.on('before-input-event',(event,input)=>{
  if(input.type!=='keyDown')return;const key=input.key.toLowerCase(),mod=input.control||input.meta;let action;
  if(mod&&key==='t')action=()=>newTab();else if(mod&&key==='w')action=()=>closeTab(tabs.activeId);
  else if(mod&&key==='tab'){action=()=>{const ids=[...tabs.rows.keys()],i=ids.indexOf(tabs.activeId);selectTab(ids[(i+(input.shift?-1:1)+ids.length)%ids.length]);};}
  else if(mod&&key==='l'||key==='f6')action=()=>send({focusAddress:true});
  else if(mod&&key==='r'||key==='f5')action=reload;
  else if(mod&&key==='d')action=toggleBookmark;
  else if(mod&&key==='s')action=saveDocument;
  else if(mod&&key==='h')action=()=>send({command:'history'});
  else if(mod&&input.shift&&key==='b')action=()=>send({command:'bookmarks'});
  else if(mod&&['+','=','-','0'].includes(key))action=()=>zoom(key==='0'?0:key==='-'?-1:1);
  else if(input.alt&&key==='arrowleft')action=()=>historyMove(-1);
  else if(input.alt&&key==='arrowright')action=()=>historyMove(1);
  else if(input.alt&&key==='home')action=()=>navigate('');
  else if(key==='escape')action=()=>panelOpen?send({command:'close-panel'}):stop();
  if(action){event.preventDefault();Promise.resolve().then(action).catch(error=>report(error));}
});}
function guardTab(tab){
  const wc=tab.view.webContents;shortcuts(wc);wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  wc.setWindowOpenHandler(({url})=>{if(url.startsWith('ar://'))void newTab(url).catch(error=>report(error,tab));else report(new Error('External link blocked. This browser opens ar:// addresses.'),tab);return {action:'deny'};});
  wc.on('will-navigate',(event,url)=>{event.preventDefault();if(url==='arnsui://app/connect'&&wc.getURL()===WELCOME){send({command:'settings'});return;}if(url===WELCOME)void navigate('',tab);else if(url.startsWith('ar://'))void navigate(url,tab);else report(new Error('External navigation blocked.'),tab);});
  wc.on('will-redirect',(event,url)=>{if(!url.startsWith('ar://'))event.preventDefault();});
  wc.on('will-frame-navigate',(event,details)=>{const url=details?.url||event.url;if(url==='arnsui://app/connect'&&wc.getURL()===WELCOME){event.preventDefault();send({command:'settings'});return;}if(url&&!url.startsWith('ar://')&&url!==WELCOME)event.preventDefault();});
  wc.on('did-start-navigation',(_event,url,inPlace,main)=>{if(!main||inPlace)return;const canonical=url===WELCOME?'':normalizeAddress(url);if(canonical!==tab.url)tabs.begin(tab.id,canonical);send();});
  wc.on('did-navigate-in-page',(_event,url,main)=>{if(main&&url.startsWith('ar://')){tab.url=normalizeAddress(url);send();}});
  wc.on('page-title-updated',(_event,title)=>{tab.title=String(title).slice(0,300);if(tab.id===tabs.activeId)win?.setTitle(tab.title+' — ArNS Mesh Browser');send();});
  wc.on('did-finish-load',()=>{tab.title=wc.getTitle();if(tab.url&&tab.phase==='loaded')library.visit(tab.url,tab.title);send({libraryChanged:true});});
  wc.on('did-stop-loading',()=>send());
  wc.on('did-fail-load',(_event,code,description,_url,main)=>{if(main&&code!==-3){tab.phase='error';report(new Error(description),tab);}});
  wc.on('render-process-gone',(_event,details)=>{if(!tabs.rows.has(tab.id))return;tabs.stop(tab.id);tab.phase='error';report(new Error('Tab stopped: '+details.reason+'. Reload to retry.'),tab);});
  wc.on('will-attach-webview',event=>event.preventDefault());
}
function handle(channel,fn){ipcMain.handle(channel,(event,...args)=>{
  if(event.sender!==toolbar?.webContents||event.senderFrame!==toolbar.webContents.mainFrame||event.senderFrame.url!=='arnsui://app/index.html')throw new Error('untrusted_ipc_sender');
  return fn(...args);
});}
function savePrefs(){fs.writeFileSync(settingsFile+'.tmp',JSON.stringify({accessPolicy,trustedPeers,witnessQuorum}),{mode:0o600});fs.renameSync(settingsFile+'.tmp',settingsFile);}
handle('navigate',raw=>navigate(raw));handle('new-tab',raw=>newTab(raw||''));handle('select-tab',selectTab);handle('close-tab',closeTab);
handle('back',()=>historyMove(-1));handle('forward',()=>historyMove(1));handle('reload',reload);handle('stop',()=>stop());handle('home',()=>navigate(''));
handle('toggle-bookmark',toggleBookmark);handle('get-browser-data',()=>library.snapshot());handle('remove-bookmark',url=>{library.remove(url);send({libraryChanged:true});});handle('clear-history',()=>library.clearHistory());handle('zoom',zoom);
handle('panel',open=>{panelOpen=Boolean(open);layout();});handle('ready',()=>send());
handle('get-settings',()=>({version:app.getVersion(),executable:app.getPath('exe'),connectionProfile:readProfile(runtime.dataDir),rpcSources:readProfile(runtime.dataDir).rpcSources.join('\n'),witnessQuorum,accessPolicy,trustedPeers:trustedPeers.join('\n'),directPeers:JSON.parse(fs.readFileSync(process.env.ARNS_IP_PEERS)).join('\n'),bootstrapSources:'',peerId:'Reader only · no public listener or indexing'}));
handle('import-profile',async(mode='merge')=>{
  if(!['merge','replace'].includes(mode))throw new Error('Unknown import mode.');
  const choice=await dialog.showOpenDialog(win,{title:'Import connection profile',properties:['openFile'],filters:[{name:'Connection profile',extensions:['json']}]});
  if(choice.canceled||choice.filePaths.length!==1)return {canceled:true};
  const incoming=loadProfile(choice.filePaths[0]);
  const profile=mode==='merge'?mergeProfiles(readProfile(runtime.dataDir),incoming):incoming;
  connectionCheck?.abort();
  for(const tab of tabs.rows.values())stop(tab);
  applyProfile(runtime.dataDir,profile);cache.clear();send();
  return {imported:true,meshPeers:profile.directPeers.length,rpcSources:profile.rpcSources.length};
});
handle('export-profile',async()=>{
  const profile=validateProfile(readProfile(runtime.dataDir));
  const choice=await dialog.showSaveDialog(win,{title:'Export connection profile',defaultPath:'mesh-connection-profile.json',filters:[{name:'Connection profile',extensions:['json']}]});
  if(choice.canceled||!choice.filePath)return {canceled:true};
  fs.writeFileSync(choice.filePath,JSON.stringify(profile,null,2)+'\n',{mode:0o600});
  return {exported:true};
});
handle('check-connections',async()=>{
  connectionCheck?.abort();const controller=new AbortController();connectionCheck=controller;
  try{return await checkConnections(readProfile(runtime.dataDir),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});}
  finally{if(connectionCheck===controller)connectionCheck=null;}
});
handle('save-settings',data=>{
  if(!data||typeof data!=='object')throw new Error('invalid_settings');
  const nextTrusted=parseTrustedPeers(data.trustedPeers||''),rpcTemp=runtime.rpcFile+'.candidate',peerTemp=process.env.ARNS_IP_PEERS+'.candidate';
  try{
    const n=saveRpcSources(rpcTemp,data.rpcSources);saveDirectPeers(peerTemp,data.directPeers||'');
    connectionCheck?.abort();for(const tab of tabs.rows.values())stop(tab);
    fs.renameSync(rpcTemp,runtime.rpcFile);fs.renameSync(peerTemp,process.env.ARNS_IP_PEERS);trustedPeers=nextTrusted;witnessQuorum=data.witnessQuorum===1?1:2;savePrefs();cache.clear();return {rpcSources:n};
  }finally{fs.rmSync(rpcTemp,{force:true});fs.rmSync(peerTemp,{force:true});}
});
async function setAccessPolicy(value){
  if(!['live','saved'].includes(value))throw new Error('invalid_access_policy');
  for(const tab of tabs.rows.values())stop(tab);accessPolicy=value;savePrefs();cache.clear();send();
  if(tabs.active.url)await navigate(tabs.active.url);
}
handle('set-access-policy',setAccessPolicy);
handle('open-saved',async raw=>{for(const tab of tabs.rows.values())stop(tab);accessPolicy='saved';savePrefs();cache.clear();return navigate(raw);});
handle('pin-site',()=>{if(!tabs.active.url)throw new Error('Open a site first.');const name=new URL(tabs.active.url).hostname;void pinner.start(name).then(()=>send()).catch(error=>report(error));send();return true;});
handle('unpin-site',name=>{pinner.remove(name);send();});
async function saveDocument(){
  const tab=tabs.active;if(!tab.url)throw new Error('Open an ArNS page first.');const url=tab.url;
  const filename=path.basename(new URL(url).pathname)||new URL(url).hostname+'.html';
  const choice=await dialog.showSaveDialog(win,{defaultPath:filename.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,200)});
  if(choice.canceled)return false;
  const result=await resolveForTab(tab,url,{signal:AbortSignal.any([tab.controller.signal,AbortSignal.timeout(90000)])});
  if(!result.meta?.contentSignatureVerified)throw new Error('unverified_content_rejected');
  fs.writeFileSync(choice.filePath,result.body);tab.message='Verified document saved. Linked files are separate.';send();return true;
}
handle('save-document',saveDocument);
handle('diagnostics',async()=>{
  const choice=await dialog.showSaveDialog(win,{defaultPath:'ArNS-Mesh-Browser-diagnostics.json'});if(choice.canceled)return false;
  fs.writeFileSync(choice.filePath,JSON.stringify({at:new Date().toISOString(),version:app.getVersion(),platform:process.platform,role:'reader',tabs:tabs.snapshot(),accessPolicy,meta:tabs.active.meta,network:networkAuditSnapshot(),discovery:runtime.discovery.status(),historicalIndex:runtime.historical.status(),savedSites:pinner.status(),limitations:['RPC observations are not independent account inclusion proofs.','Some peer catalogs may use Turbo/Goldsky preparation; no private catalog is bundled.','One configured peer is not a resilient network.']},null,2));return true;
});
async function start(){
  runtime=configureRuntime(coreRoot,app.getPath('userData'),{role:'client'});store=new VerifiedContentStore(path.join(runtime.dataDir,'content'));
  library=new BrowserState(path.join(runtime.dataDir,'browser-state.json'));settingsFile=path.join(runtime.dataDir,'preferences.json');
  try{const saved=JSON.parse(fs.readFileSync(settingsFile));accessPolicy=saved.accessPolicy==='saved'?'saved':'live';trustedPeers=parseTrustedPeers((saved.trustedPeers||[]).join('\n'));witnessQuorum=saved.witnessQuorum===1?1:2;}catch{}
  pinner=new SitePinner({file:path.join(runtime.dataDir,'saved-sites.json'),snapshots:runtime.snapshots,contentStore:store});
  const uiSession=session.fromPartition('mesh-ui',{cache:false});filterSession(uiSession,{ui:true});uiSession.protocol.handle('arnsui',uiHandler);
  win=new BaseWindow({width:1280,height:900,minWidth:850,minHeight:600,title:'ArNS Mesh Browser',backgroundColor:'#171521'});
  toolbar=new WebContentsView({webPreferences:{session:uiSession,preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
  toolbar.webContents.setWindowOpenHandler(()=>({action:'deny'}));toolbar.webContents.on('will-navigate',e=>e.preventDefault());
  win.contentView.addChildView(toolbar);shortcuts(toolbar.webContents);win.on('resize',layout);
  win.on('closed',()=>{shuttingDown=true;for(const tab of [...tabs.rows.values()]){tabs.close(tab.id);tab.view?.webContents.close();}toolbar.webContents.close();app.quit();});
  await toolbar.webContents.loadURL('arnsui://app/index.html');await newTab(process.argv.find(x=>x.startsWith('ar://'))||'');
  timer=setInterval(()=>send(),1000);send();if(accessPolicy==='live'&&!connectionConfigured())send({command:'settings'});
}
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',(_event,argv)=>{win?.show();win?.focus();const url=argv.find(x=>x.startsWith('ar://'));if(url&&win)void newTab(url).catch(error=>report(error));});
  app.whenReady().then(start).catch(error=>{console.error(error);dialog.showErrorBox('ArNS Mesh Browser could not start',String(error.message||error));app.quit();});
}
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{clearInterval(timer);connectionCheck?.abort();runtime?.discovery.stop();for(const tab of tabs.rows.values())tab.controller.abort(new Error('app_stopped'));cache.clear();});
