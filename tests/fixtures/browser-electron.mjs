// Explicit Electron API test double. No browser renderer or real content proof.
import {EventEmitter} from 'node:events';
export const views=[],handlers=new Map(),sessions=new Map(),messages=[],errors=[];
const paths=new Map();
export const app=Object.assign(new EventEmitter(),{setName(){},setPath:(k,v)=>paths.set(k,v),getPath:k=>paths.get(k)||process.env.ARNS_MESH_USER_DATA,getVersion:()=> 'test',commandLine:{appendSwitch(){}},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit(){this.emit('will-quit');}});
export const protocol={registerSchemesAsPrivileged(){}};
export const ipcMain={handle:(name,fn)=>handlers.set(name,fn)};
export const dialog={showErrorBox:(_title,text)=>errors.push(text),showSaveDialog:async()=>({canceled:true}),showOpenDialog:async()=>({canceled:true,filePaths:[]})};
export const session={fromPartition(name){if(!sessions.has(name))sessions.set(name,{protocol:{rows:new Map(),handle(k,fn){this.rows.set(k,fn);},unhandle(k){this.rows.delete(k);}},webRequest:{onBeforeRequest(fn){this.filter=fn;}},setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},on(){},clearStorageData:async()=>{}});return sessions.get(name);}};
export class BaseWindow extends EventEmitter{
 constructor(){super();this.contentView={children:[],addChildView(v,index){if(index===undefined)this.children.push(v);else this.children.splice(index,0,v);},removeChildView(v){this.children=this.children.filter(x=>x!==v);}};}
 getContentSize(){return [1280,900];}setTitle(){}show(){}focus(){}
}
class Contents extends EventEmitter{
 constructor(ses){super();this.session=ses;this.mainFrame={url:''};this.navigationHistory={canGoBack:()=>false,canGoForward:()=>false};this.destroyed=false;this.loading=false;this.zoom=1;}
 async loadURL(url){this.mainFrame.url=url;this.loading=true;this.emit('did-start-navigation',{},url,false,true);const fn=this.session.protocol.rows.get(new URL(url).protocol.slice(0,-1));if(!fn)throw new Error('Missing protocol: '+url);this.response=await fn(new Request(url));this.loading=false;this.emit('did-finish-load');this.emit('did-stop-loading');}
 getURL(){return this.mainFrame.url;}getTitle(){return this.mainFrame.url;}isLoading(){return this.loading;}isDestroyed(){return this.destroyed;}getZoomFactor(){return this.zoom;}setZoomFactor(x){this.zoom=x;}setWindowOpenHandler(fn){this.openHandler=fn;}setWebRTCIPHandlingPolicy(){}stop(){this.loading=false;}send(name,data){messages.push({name,data});}close(){this.destroyed=true;}
}
export class WebContentsView{
 constructor(options){this.options=options;this.webContents=new Contents(options.webPreferences.session);views.push(this);}setBackgroundColor(){}setBounds(bounds){this.bounds=bounds;}setVisible(visible){this.visible=visible;}
}

export const Menu={setApplicationMenu(){},buildFromTemplate(){return {popup(){}};}};
