// Online metadata preparation is deliberately outside the IP-only peer process.
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {OnlineLocationPreparer} from '../src/online-location-preparation.mjs';
const dataDir=process.env.ARNS_MESH_DATA;
if(!dataDir||!path.isAbsolute(dataDir)||process.env.ARNS_ONLINE_PREPARATION!=='1')throw new Error('online_preparation_not_enabled');
const mib=Number(process.env.ARNS_PREPARATION_DAILY_MIB||64);
if(!Number.isSafeInteger(mib)||mib<1||mib>1024)throw new Error('invalid_preparation_daily_mib');
const worker=new OnlineLocationPreparer({dataDir,dailyBytes:mib*1024*1024});
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>controller.abort());
do{
 try{await worker.pass();}catch(error){console.error(JSON.stringify({event:'online-preparation-error',error:String(error.message).slice(0,240)}));}
 if(process.argv.includes('--once'))break;
 await delay(3000,undefined,{signal:controller.signal}).catch(()=>{});
}while(!controller.signal.aborted);
