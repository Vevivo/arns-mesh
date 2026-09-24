const $=id=>document.getElementById(id),api=window.arnsMesh;
const panelIds=['panel','settings-panel','saved-panel','library-panel','menu-panel'];
let activePanel=null,lastState={},pendingUrl=null,libraryKind='history',savedKey='',previousFocus=null,uiError='';
const busy=s=>s.loading||['resolving','content','loading','rendering'].includes(s.phase);
const errorText=error=>String(error.message||error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
const report=error=>{uiError=errorText(error);$('message').textContent=uiError;};
const run=fn=>Promise.resolve().then(fn).catch(report);
function closePanel(){const wasOpen=activePanel;activePanel=null;for(const id of panelIds)$(id).classList.add('hidden');$('backdrop').classList.add('hidden');$('menu-button').setAttribute('aria-expanded','false');run(()=>api.panel(false));if(wasOpen)previousFocus?.focus();}
function openPanel(id){if(!activePanel)previousFocus=document.activeElement;activePanel=id;for(const name of panelIds)$(name).classList.toggle('hidden',name!==id);$('backdrop').classList.remove('hidden');$('menu-button').setAttribute('aria-expanded',String(id==='menu-panel'));run(()=>api.panel(true));$(id).querySelector('button,input,select,summary')?.focus();}
function togglePanel(id){activePanel===id?closePanel():openPanel(id);}
function submitAddress(){const value=$('address').value.trim();if(!value||pendingUrl===value)return;uiError='';pendingUrl=value;closePanel();run(()=>api.navigate(value)).finally(()=>{if(pendingUrl===value)pendingUrl=null;});$('address').blur();}
$('nav').addEventListener('submit',event=>{event.preventDefault();submitAddress();});
$('address').addEventListener('keydown',event=>{if(event.key==='Escape'){$('address').value=lastState.url||'';$('address').blur();}});
for(const button of document.querySelectorAll('[data-close]'))button.onclick=closePanel;
$('backdrop').onclick=closePanel;
$('back').onclick=()=>run(()=>api.back());$('forward').onclick=()=>run(()=>api.forward());
$('reload').onclick=()=>run(()=>busy(lastState)?api.stop():api.reload());
$('home').onclick=()=>{uiError='';closePanel();run(()=>api.home());};
$('bookmark').onclick=()=>run(()=>api.toggleBookmark());
$('details').onclick=()=>togglePanel('panel');$('menu-details').onclick=()=>openPanel('panel');
$('saved-button').onclick=()=>togglePanel('saved-panel');$('menu-saved').onclick=()=>openPanel('saved-panel');
$('menu-button').onclick=()=>togglePanel('menu-panel');
$('saved-toggle').onchange=()=>run(()=>api.setAccessPolicy($('saved-toggle').checked?'saved':'live'));
for(const id of ['pin-site','save-current'])$(id).onclick=()=>{openPanel('saved-panel');run(()=>api.pinSite());};
for(const [id,delta] of [['zoom-out',-1],['zoom-reset',0],['zoom-in',1]])$(id).onclick=()=>run(()=>api.zoom(delta));
function settingsResult(text,error=false){$('settings-result').textContent=text;$('settings-result').classList.toggle('error',error);}
function renderConnections(profile,results=[]){
 const rows=[...(profile.directPeers||[]).map(address=>({kind:'Mesh peer',address})),...(profile.rpcSources||[]).map(address=>({kind:'Solana RPC',address})),...(profile.arweavePeers||[]).map(address=>({kind:'Raw Arweave',address}))];
 $('connection-list').replaceChildren();$('connection-summary').textContent=rows.length?`${rows.length} configured sources · Check them before opening a page.`:'No connections yet. Import a profile to get started.';
 for(const row of rows){const found=results.find(r=>r.kind===row.kind&&r.address===row.address);const item=document.createElement('div');item.className='connection-row';const source=document.createElement('div'),label=document.createElement('strong'),address=document.createElement('small'),status=document.createElement('span');label.textContent=row.kind;address.textContent=row.address;source.append(label,address);status.className='connection-status '+(found?.status||'');status.textContent=found?found.status==='responded'?`Responded · ${found.elapsedMs} ms`:'Unavailable':'Not checked';if(found)status.title=found.checkedAt+(found.error?' · '+found.error:'');item.append(source,status);$('connection-list').append(item);}
 $('export-profile').disabled=!(profile.rpcSources?.length&&(profile.directPeers?.length||profile.arweavePeers?.length));$('check-connections').disabled=!rows.length;
}
let settingsProfile={directPeers:[],rpcSources:[],arweavePeers:[]};
async function showSettings(){try{uiError='';const s=await api.getSettings();$('build-info').textContent='Version '+s.version+' · '+s.executable;$('rpc').value=s.rpcSources;$('quorum').value=String(s.witnessQuorum);$('trusted-peers').value=s.trustedPeers||'';$('direct-peers').value=s.directPeers||'';$('own-peer-id').textContent=s.peerId||'Reader';settingsProfile=s.connectionProfile;renderConnections(settingsProfile);settingsResult('');openPanel('settings-panel');}catch(e){report(e);}}
$('settings-button').onclick=showSettings;
$('save-settings').onclick=async()=>{try{const result=await api.saveSettings({rpcSources:$('rpc').value,witnessQuorum:Number($('quorum').value),trustedPeers:$('trusted-peers').value,directPeers:$('direct-peers').value});await showSettings();settingsResult(`Saved ${result.rpcSources} RPC sources. Reload the page to retry. Other tabs stay stopped until reloaded.`);}catch(e){settingsResult(errorText(e),true);}};
$('export').onclick=async()=>{try{$('export-result').textContent=await api.diagnostics()?'Saved.':'';}catch(e){report(e);}};
async function renderLibrary(){const data=await api.getBrowserData(),rows=data[libraryKind]||[];const history=libraryKind==='history';$('library-title').textContent=history?'History':'Bookmarks';$('library-hint').textContent=history?'Your last 200 successfully opened ArNS addresses. Stored on this device.':'Bookmarks remember an address. Use Saved pages to keep the content for offline access.';$('clear-history').classList.toggle('hidden',!history||!rows.length);$('library-list').replaceChildren();if(!rows.length)empty($('library-list'),history?'No browsing history yet.':'No bookmarks yet. Use the star in the address bar.');for(const row of rows){const box=document.createElement('div');box.className='library-row';const link=document.createElement('button');link.className='library-link';const title=document.createElement('strong');title.textContent=row.title;const url=document.createElement('small');url.textContent=row.url;link.append(title,url);link.onclick=()=>{closePanel();run(()=>api.navigate(row.url));};box.append(link);if(history){const time=document.createElement('time');time.textContent=new Date(row.at).toLocaleDateString('en-US',{month:'short',day:'numeric'});box.append(time);}else{const remove=document.createElement('button');remove.className='icon';remove.textContent='×';remove.setAttribute('aria-label','Remove bookmark '+row.title);remove.onclick=()=>run(async()=>{await api.removeBookmark(row.url);await renderLibrary();});box.append(remove);}$('library-list').append(box);}}
function showLibrary(kind){libraryKind=kind;run(async()=>{await renderLibrary();openPanel('library-panel');});}
$('history-button').onclick=()=>showLibrary('history');$('bookmarks-button').onclick=()=>showLibrary('bookmarks');
$('clear-history').onclick=()=>run(async()=>{await api.clearHistory();await renderLibrary();});
function empty(parent,text){const p=document.createElement('p');p.className='empty';p.textContent=text;parent.append(p);}
api.onState(s=>{
 const switched=s.tabs?.find(t=>t.active)?.id!==lastState.tabs?.find(t=>t.active)?.id;
 if(switched)uiError='';lastState=s;renderTabs(s);renderJourney(s);if(switched)$('address').value=s.url||'';
 if(s.command==='close-panel')closePanel();if(s.command==='history')showLibrary('history');if(s.command==='bookmarks')showLibrary('bookmarks');if(s.command==='settings')run(showSettings);
 if(s.focusAddress){closePanel();$('address').focus();$('address').select();}
 if(document.activeElement!==$('address'))$('address').value=s.url||'';
 $('back').disabled=!s.canGoBack;$('forward').disabled=!s.canGoForward;
 const loading=busy(s);$('reload').setAttribute('aria-label',loading?'Stop loading':'Reload');$('reload').title=loading?'Stop loading (Esc)':'Reload (Ctrl+R)';$('reload-icon').setAttribute('href',loading?'#i-close':'#i-reload');
 $('bookmark').disabled=!s.canBookmark;$('bookmark').classList.toggle('active',Boolean(s.bookmarked));$('bookmark').setAttribute('aria-label',s.bookmarked?'Remove bookmark':'Bookmark this page');$('bookmark').title=(s.bookmarked?'Remove bookmark':'Bookmark this page')+' (Ctrl+D)';
 $('zoom-reset').textContent=(s.zoom||100)+'%';$('build-version').textContent=s.version||'';
 $('saved-toggle').checked=s.accessPolicy==='saved';
 const setupNeeded=s.accessPolicy!=='saved'&&!s.connectionConfigured;
 $('message').textContent=uiError||(setupNeeded&&s.phase!=='error'?'Connection setup needed. Import a supporter’s profile.':s.message||'Enter an ArNS address.');$('indicator').className='indicator'+(loading?' busy':s.phase==='error'||setupNeeded||uiError?' error':s.phase==='loaded'?' loaded':'');
 $('mode-badge').textContent=s.accessPolicy==='saved'?'P2P · Saved · No RPC':setupNeeded?'Set up connections':'P2P · Live';
 renderSaved(s);renderDetails(s);renderElapsed();
 if(s.libraryChanged&&activePanel==='library-panel')run(renderLibrary);
});
let journeyKey='';
function renderJourney(s){
 const stages=s.progress?.stages||[],key=JSON.stringify(stages.map(({id,status})=>({id,status})));
 if(key===journeyKey)return;journeyKey=key;$('access-stages').replaceChildren();
 const states={pending:'Waiting',active:'In progress',done:'Complete',skipped:'Not needed for this request',error:'Failed',interrupted:'Stopped'};
 stages.forEach((stage,i)=>{
  const row=document.createElement('li');row.className=stage.status;row.dataset.stage=stage.id;
  row.title=stage.label+' · '+states[stage.status];row.setAttribute('aria-label',row.title);
  if(stage.status==='active')row.setAttribute('aria-current','step');
  const marker=document.createElement('span');marker.className='stage-marker';marker.setAttribute('aria-hidden','true');
  if(stage.status==='done'){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS('http://www.w3.org/2000/svg','path');
   svg.setAttribute('viewBox','0 0 16 16');line.setAttribute('d','M3 8l3 3 7-7');svg.append(line);marker.append(svg);
  }else marker.textContent=stage.status==='error'?'!':stage.status==='interrupted'?'–':String(i+1);
  const label=document.createElement('span');label.textContent=stage.label;row.append(marker,label);$('access-stages').append(row);
 });
}
function renderDetails(s){const m=s.meta||{},v=m.verification||{},p=s.peer||{},nr=m.nameResolution||{};
 $('transport').textContent='IP · Mesh + raw Arweave';
 $('content-status').textContent=m.contentSignatureVerified?'Signature verified':s.phase==='error'?'Unavailable':'Waiting';
 $('name-status').textContent=m.recovery?'Saved record · '+new Date(m.recovery.observedAt).toLocaleString('en-US'):v.nameStateChecked?`${v.rpcSources} RPC · observed ${m.nameObservedAt?new Date(m.nameObservedAt).toLocaleString('en-US'):'at unknown time'} · no inclusion proof`:nr.nameResolved?'Name resolved · waiting for content':'Not received';
 $('peer').textContent='Reader · no serving or indexing';
 const network=s.network||{},discovery=s.discovery||{};
 $('network-log').textContent=[`Measured: ${network.requests||0} HTTP requests · ${network.receivedBytes||0} bytes · ${network.blocked||0} blocked`,...(discovery.enabled===false?['Reader · Background indexing is off','Automatic content cache: 256 MiB · Saved sites: up to 512 MiB',`Page cache: ${Math.round((s.resourceBudget?.pageCacheBytes||0)/1048576)} / 16 MiB · Downloads: ${s.resourceBudget?.transfers?.active||0} / 2`]:[`Index: ${discovery.transactionsChecked||0} transactions · ${discovery.locationsAdded||0} new locations · ${discovery.retryCount||0} retries`,`Crawler: ${discovery.phase||'idle'}`]),...(network.events||[]).map(e=>`${e.at} ${e.type} ${e.remoteAddress||e.host||'-'}${e.port?':'+e.port:''} ${e.path||e.reason||''}${e.status?' HTTP '+e.status:''}`)].join('\n');
 $('checks').replaceChildren();for(const text of [m.contentSignatureVerified?'✓ Content signature verified':'— Content verification pending','○ No native account inclusion proof','○ Availability depends on reachable content and name sources',...(s.peerStartError?['Peer error: '+s.peerStartError]:[])]){const el=document.createElement('span');el.textContent=text;$('checks').append(el);}
 $('proof').textContent=m.error?[nr.nameResolved?`Name resolved: ${nr.name} → ${nr.rootDataId}`:'Name resolution incomplete',m.error].join('\n\n'):[`Address       ${s.url||'-'}`,`Data ID       ${m.dataId||'-'}`,`Arweave TX    ${m.rootTxId||'-'}`,`SHA-256       ${m.sha256||'-'}`,`Name trust    ${v.level||'-'}`,`RPC sources   ${v.rpcSources||0}`,`Vote sigs     ${v.embeddedTowerVerifiedVoteAccounts||0} · stake link not verified`,...(v.reasons||[]),...(m.peerShareError?['Sharing incomplete: '+m.peerShareError]:[])].join('\n');
 const progress=s.progress||{},detail=progress.detail||{},resources=s.resources||{};$('stages').replaceChildren();for(const stage of progress.stages||[]){const el=document.createElement('li');el.className=stage.status;el.textContent=(stage.status==='done'?'✓ ':stage.status==='error'?'! ':'')+stage.label;$('stages').append(el);}
 let description=progress.message||s.message||'Enter an ArNS name.';
 if(detail.total)description=`${detail.source||'Source'} · ${Math.round((detail.received||0)/1024)} / ${Math.round(detail.total/1024)} KiB`;
 if(s.phase==='loaded')description=`Main document verified · Files: ${resources.verified||0} verified, ${resources.pending||0} pending, ${resources.failed||0} unavailable`;
 $('stage-detail').textContent=description;const bar=$('byte-progress');bar.classList.toggle('hidden',!(busy(s)&&detail.total&&progress.active==='download'));if(detail.total){bar.max=detail.total;bar.value=Math.min(detail.total,detail.received||0);}
}
function renderElapsed(){const p=lastState.progress||{};$('elapsed').textContent=busy(lastState)&&p.startedAt?`${Math.max(0,Math.floor((Date.now()-p.startedAt)/1000))}s`:'';}
setInterval(renderElapsed,1000);
function renderSaved(s){const state=s.savedSites||{},storage=state.storage||{},sites=state.sites||[];let name='';try{name=new URL(s.url).hostname;}catch{}const current=sites.find(row=>row.name===name);for(const id of ['pin-site','save-current'])$(id).disabled=!s.canBookmark||current?.status==='saving';
 $('save-status').textContent=current?`${current.name}: ${current.saved}/${current.total} files saved${current.failed?' · '+current.failed+' unavailable':''}`:'Saved versions may be out of date.';
 $('storage-usage').textContent=`${storage.files||0} files · ${((storage.bytes||0)/1048576).toFixed(1)} / ${Math.round((storage.maxBytes||0)/1048576)} MiB`;
 const key=JSON.stringify(sites);if(key===savedKey)return;savedKey=key;$('saved-list').replaceChildren();if(!sites.length)empty($('saved-list'),'No saved pages yet. Open a site in P2P mode, then save it here.');
 for(const row of sites){const box=document.createElement('div');box.className='saved-site';const label=document.createElement('p');label.textContent=`${row.name} · ${row.saved}/${row.total} files · ${row.status==='saving'?'Saving':row.status==='manifest-saved'?'Manifest files saved':row.status==='document-saved'?'Main document only':'Incomplete copy'}`;const date=document.createElement('small');date.textContent='Name observed: '+new Date(row.observedAt).toLocaleString('en-US');box.append(label,date);const open=document.createElement('button');open.className='secondary';open.textContent='Open saved version';open.disabled=row.status==='saving';open.onclick=()=>run(async()=>{closePanel();await api.openSaved(row.name);});const remove=document.createElement('button');remove.className='secondary';remove.textContent='Remove saved copy';remove.disabled=row.status==='saving';remove.onclick=()=>run(()=>api.unpinSite(row.name));box.append(open,remove);if(row.errors?.length){const error=document.createElement('p');error.className='hint';error.textContent=row.errors.slice(0,3).map(x=>x.error).join(' · ');box.append(error);}$('saved-list').append(box);}
}
run(()=>api.ready());


let tabKey='';
function renderTabs(s){
 const key=JSON.stringify(s.tabs||[]);if(key===tabKey)return;tabKey=key;
 $('tabs').replaceChildren();
 for(const tab of s.tabs||[]){
  const row=document.createElement('div');row.className='tab'+(tab.active?' selected':'');
  const select=document.createElement('button');select.className='tab-select';select.setAttribute('role','tab');select.setAttribute('aria-selected',String(tab.active));select.title=tab.url||'New tab';select.textContent=(tab.loading?'◌ ':tab.error?'! ':'')+tab.title;select.onclick=()=>run(()=>api.selectTab(tab.id));
  const close=document.createElement('button');close.className='tab-close';close.textContent='×';close.title='Close tab';close.setAttribute('aria-label','Close '+tab.title);close.onclick=()=>run(()=>api.closeTab(tab.id));
  row.append(select,close);$('tabs').append(row);
 }
 $('new-tab').disabled=(s.tabs?.length||0)>=s.tabLimit;
}
$('new-tab').onclick=()=>{uiError='';closePanel();run(()=>api.newTab());};
$('download-document').onclick=()=>{closePanel();run(()=>api.saveDocument());};

$('import-profile').onclick=async()=>{settingsResult('');try{const mode=$('import-mode').value;const result=await api.importProfile(mode);if(!result.canceled){await showSettings();settingsResult((mode==='merge'?'Connections added.':'Connections replaced.')+' Check connections, then reload an ArNS page.');}}catch(e){settingsResult(errorText(e),true);}};
$('export-profile').onclick=async()=>{settingsResult('');try{const result=await api.exportProfile();if(result.exported)settingsResult('Profile exported. It contains service addresses only. Share it with people allowed to use those sources.');}catch(e){settingsResult(errorText(e),true);}};
$('check-connections').onclick=async()=>{const expected=settingsProfile;$('check-connections').disabled=true;settingsResult('Checking configured sources…');try{const results=await api.checkConnections();if(settingsProfile!==expected)return;renderConnections(settingsProfile,results);settingsResult(`${results.filter(r=>r.status==='responded').length} of ${results.length} sources responded. This checks reachability, not site availability.`,!results.some(r=>r.status==='responded'));}catch(e){settingsResult(errorText(e),true);}finally{$('check-connections').disabled=false;}};
