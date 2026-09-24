import fs from 'node:fs';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
let serial=0,file=null,events=[];
const totals={requests:0,completed:0,receivedBytes:0,blocked:0,dnsBlocked:0};
export function configureNetworkAudit(directory){fs.mkdirSync(directory,{recursive:true});file=path.join(directory,'network-audit.jsonl');}
export function withNetworkAudit(label,fn){return scope.run({label:String(label).slice(0,180)},fn);}
export function recordNetwork(event){
 const row={id:++serial,at:new Date().toISOString(),scope:scope.getStore()?.label||'peer-background',...event};
 if(row.type==='request')totals.requests++;
 if(row.type==='response')totals.completed++;
 if(row.type==='response'||row.type==='request-error')totals.receivedBytes+=row.bytes||0;
 if(row.type==='blocked'){totals.blocked++;if(row.reason==='dns_forbidden')totals.dnsBlocked++;}
 events.push(row);if(events.length>1000)events.shift();
 if(file)try{if(fs.existsSync(file)&&fs.statSync(file).size>4*1024*1024){fs.rmSync(file+'.previous',{force:true});fs.renameSync(file,file+'.previous');}fs.appendFileSync(file,JSON.stringify(row)+'\n',{mode:0o600});}catch{}
 return row.id;
}
export function networkAuditSnapshot(){return {schema:'arns-mesh-network-audit/v1',source:'application-instrumentation',independentPacketCapture:false,scope:'Node HTTP/RPC requests and blocked Chromium requests; native UDP peer traffic is not a complete packet trace',policy:'literal-IP HTTP; approved raw Arweave routes or read-only Solana RPC; no redirects',...totals,lastEventAt:events.at(-1)?.at||null,events:events.slice(-160)};}
