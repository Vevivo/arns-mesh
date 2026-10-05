import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Only the index entrypoint calls this. No shell, profile secrets or signing
// keys are passed as arguments. Only public IDs are sent to the two indexes.
export function startOnlinePreparation({dataDir,enabled=false}={}){
 let child=null,timer=null,stopped=false,lastError=null;
 const statusFile=path.join(dataDir,'location-preparation-status.json');
 const start=()=>{
  if(stopped||!enabled)return;
  child=spawn(process.execPath,['--max-old-space-size=128',fileURLToPath(new URL('../scripts/prepare-locations.mjs',import.meta.url))],{
   env:{...process.env,ARNS_MESH_DATA:dataDir,ARNS_ONLINE_PREPARATION:'1',NODE_OPTIONS:''},stdio:['ignore','ignore','inherit'],windowsHide:true
  });
  child.on('error',e=>{lastError=e.message;});
  child.on('exit',code=>{
   child=null;if(!stopped){lastError='preparation_process_exit_'+code;timer=setTimeout(start,30000);timer.unref?.();}
  });
 };
 start();
 return {
  status(){
   let detail={};try{if(fs.statSync(statusFile).size<=8192)detail=JSON.parse(fs.readFileSync(statusFile));}catch{}
   return {...detail,enabled,running:Boolean(child),processError:lastError};
  },
  stop(){stopped=true;clearTimeout(timer);child?.kill();}
 };
}
