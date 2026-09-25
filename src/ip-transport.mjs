import http from 'node:http';
import {accountBudgetBytes} from './byte-budget.mjs';
import net from 'node:net';
import {recordNetwork} from './network-audit.mjs';
import {validateIpRequest,approvedRpcTransport} from './network-lockdown.mjs';
import {blockSummaryReader} from './block-summary.mjs';
const rpcMethods=new Set(['getAccountInfo','getBlock','getBlockCommitment','getVersion','getAgGenesisCert','getSignaturesForAddress','getProgramAccounts']);
export function requestIpJson({host,port,path='/',method='GET',body=null,timeout=8000,maxBytes=4*1024*1024,signal,onBytes=()=>{},purpose='raw-arweave',summarizeBlock=false}){
 validateIpRequest({host,port,pathname:path,method});
 if(summarizeBlock&&(method!=='GET'||!/^\/block\/height\/\d+$/.test(path)))throw new Error('invalid_block_summary_request');
 if(method==='POST'){
  const mesh=purpose==='mesh-peer'&&path==='/mesh/v1/query'&&['snapshot','location','content','network'].includes(body?.op);
  if(!mesh&&(purpose!=='solana-rpc'||!rpcMethods.has(body?.method)))throw new Error('rpc_method_not_allowed');
 }
 if(signal?.aborted)return Promise.reject(signal.reason||new Error('cancelled'));
 return new Promise((resolve,reject)=>{
  const started=Date.now(),id=recordNetwork({type:'request',purpose,host,port:Number(port),method,path,rpcMethod:body?.method||undefined});
  let bytes=0,finished=false,remoteAddress=null;
  const done=(error,result,status)=>{if(finished)return;finished=true;clearTimeout(deadline);recordNetwork({type:error?'request-error':'response',requestId:id,purpose,host,port:Number(port),path,remoteAddress,status,bytes,elapsedMs:Date.now()-started,error:error?.message});if(error)reject(error);else resolve(result);};
  const encoded=body===null?null:Buffer.from(JSON.stringify(body));
  const req=approvedRpcTransport(()=>http.request({host,port,path,method,signal,agent:false,lookup(){throw new Error('dns_forbidden');},headers:{accept:'application/json','content-type':'application/json','user-agent':'arns-mesh/0.3',...(encoded?{'content-length':encoded.length}:{})}},res=>{
   const chunks=[],summary=summarizeBlock?blockSummaryReader():null;
   res.on('data',chunk=>{if(finished)return;bytes+=chunk.length;try{accountBudgetBytes(chunk.length);onBytes(chunk.length,bytes);}catch(error){done(error,null,res.statusCode);req.destroy(error);return;}if(bytes>maxBytes){const error=new Error('response_too_large');done(error,null,res.statusCode);req.destroy(error);return;}chunks.push(chunk);
    if(summary&&res.statusCode===200){try{const value=summary(chunk);if(value){done(null,value,res.statusCode);res.destroy();req.destroy();}}catch(error){req.destroy(error);}}
   });
   res.on('error',e=>done(e));res.on('aborted',()=>done(new Error('truncated_response')));
   res.on('end',()=>{try{if(res.statusCode<200||res.statusCode>=300)throw new Error('HTTP '+res.statusCode+' '+path);done(null,JSON.parse(Buffer.concat(chunks).toString('utf8')),res.statusCode);}catch(e){done(e,null,res.statusCode);}});
  }));
  req.on('socket',socket=>socket.on('connect',()=>{remoteAddress=socket.remoteAddress;if(!net.isIP(remoteAddress||''))req.destroy(new Error('non_ip_connection'));}));
  const deadline=setTimeout(()=>req.destroy(new Error('request_deadline_exceeded')),timeout);
  req.on('error',e=>done(e));req.end(encoded);
 });
}
export async function rpcIp(endpoint,method,params=[],{timeout=8000,signal,maxBytes=4*1024*1024}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024)throw new Error('invalid_rpc_response_budget');
 const u=new URL(endpoint);if(u.protocol!=='http:'||u.username||u.password||u.pathname!=='/'||u.search)throw new Error('invalid_rpc_endpoint');
 const j=await requestIpJson({host:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port||80),method:'POST',body:{jsonrpc:'2.0',id:1,method,params},purpose:'solana-rpc',timeout,signal,maxBytes});
 if(j.error)throw new Error(method+':'+JSON.stringify(j.error));return j.result;
}
