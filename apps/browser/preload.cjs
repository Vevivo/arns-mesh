const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('arnsMesh',{
 newTab:url=>ipcRenderer.invoke('new-tab',url),selectTab:id=>ipcRenderer.invoke('select-tab',id),closeTab:id=>ipcRenderer.invoke('close-tab',id),saveDocument:()=>ipcRenderer.invoke('save-document'),
 setAccessPolicy:value=>ipcRenderer.invoke('set-access-policy',value),pinSite:()=>ipcRenderer.invoke('pin-site'),unpinSite:name=>ipcRenderer.invoke('unpin-site',name),
 navigate:url=>ipcRenderer.invoke('navigate',url),back:()=>ipcRenderer.invoke('back'),forward:()=>ipcRenderer.invoke('forward'),stop:()=>ipcRenderer.invoke('stop'),reload:()=>ipcRenderer.invoke('reload'),home:()=>ipcRenderer.invoke('home'),
 openSaved:name=>ipcRenderer.invoke('open-saved',name),toggleBookmark:()=>ipcRenderer.invoke('toggle-bookmark'),removeBookmark:url=>ipcRenderer.invoke('remove-bookmark',url),getBrowserData:()=>ipcRenderer.invoke('get-browser-data'),clearHistory:()=>ipcRenderer.invoke('clear-history'),zoom:delta=>ipcRenderer.invoke('zoom',delta),
 importProfile:()=>ipcRenderer.invoke('import-profile'),getSettings:()=>ipcRenderer.invoke('get-settings'),saveSettings:data=>ipcRenderer.invoke('save-settings',data),panel:open=>ipcRenderer.invoke('panel',open),
 diagnostics:()=>ipcRenderer.invoke('diagnostics'),ready:()=>ipcRenderer.invoke('ready'),onState:fn=>ipcRenderer.on('state',(_e,state)=>fn(state))
});
