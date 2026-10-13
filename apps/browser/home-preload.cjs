// Home actions are commands, not navigations. This isolated preload is inert
// on ArNS documents and never exposes ipcRenderer or a bridge to page scripts.
function isHome(){
 try{const raw=location.href,u=new URL(raw);return u.protocol==='arnsui:'&&u.hostname==='app'&&!u.port&&!u.username&&!u.password&&u.pathname==='/welcome.html'&&!u.hash&&raw.length<=2200&&[...u.searchParams.keys()].every(k=>k==='q')&&u.searchParams.getAll('q').length<=1&&(u.searchParams.get('q')||'').length<=160;}catch{return false;}
}
if(window.top===window&&isHome()){
 const {ipcRenderer}=require('electron');
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!isHome())return;
  const link=event.target?.closest?.('a[href]');
  const action=link?.href==='arnsui://app/search-refresh'?'refresh':link?.href==='arnsui://app/connect'?'connect':null;
  if(!action)return;
  event.preventDefault();
  ipcRenderer.send('mesh-home-action',action);
 },true);
}
