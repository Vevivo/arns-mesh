// File handoff to the explicitly enabled online preparation process.
// Reader processes never enable this path or fetch HTTPS metadata themselves.
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {LocationIndex} from './location-index.mjs';
const valid=id=>/^[A-Za-z0-9_-]{43}$/.test(id);
export function requestLocationPreparation(id,dir=process.env.ARNS_PREPARATION_INBOX){
 if(!dir||!valid(id))return false;
 fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,id);
 if(fs.existsSync(file))return true;
 if(fs.readdirSync(dir).length>=2048)return false;
 try{fs.writeFileSync(file,'',{flag:'wx',mode:0o600});return true;}catch(e){if(e.code==='EEXIST')return true;throw e;}
}
export async function awaitPreparedLocation(id,{locationsFile,signal,waitMs=12000}={}){
 const dir=process.env.ARNS_PREPARATION_INBOX;
 if(!requestLocationPreparation(id,dir))throw new Error('online_preparation_unavailable');
 const index=new LocationIndex(locationsFile),end=Date.now()+waitMs;
 do{
  signal?.throwIfAborted();
  const hint=index.get(id);if(hint)return hint;
  await delay(Math.min(150,Math.max(1,end-Date.now())),undefined,{signal});
 }while(Date.now()<end);
 throw new Error('online_preparation_pending');
}
