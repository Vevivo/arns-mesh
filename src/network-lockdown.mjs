// Imported before networking libraries in the helper and index entrypoints.
// The local bridge and extension enforce the Chrome page network policy.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import {AsyncLocalStorage} from 'node:async_hooks';
import {syncBuiltinESMExports} from 'node:module';
import {recordNetwork} from './network-audit.mjs';
let installed=false;const tcpContext=new AsyncLocalStorage();const rpcContext=new AsyncLocalStorage();
export const approvedRpcTransport=fn=>rpcContext.run(true,fn);
const rawRoutes=/^\/(?:info|peers|height|block\/height\/\d+(?:\/(?:timestamp|txs))?|tx\/[A-Za-z0-9_-]{43}(?:\/(?:offset|status))?|chunk\/\d+|data_sync_record\/\d+\/\d+\/\d+)$/;
export function rejectNetwork(reason,details={}){recordNetwork({type:'blocked',reason,...details});throw new Error(reason);}
export function validateIpRequest({host,port,method='GET',pathname='/',headers={}}){
 host=String(host||'').replace(/^\[|\]$/g,'');
 if(!net.isIP(host))rejectNetwork('domain_forbidden',{host});
 if(!Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535)rejectNetwork('invalid_network_port',{host});
 if(Object.keys(headers).some(k=>k.toLowerCase()==='host'&&String(headers[k])!==`${net.isIP(host)===6?'['+host+']':host}:${port}`))rejectNetwork('host_header_override_forbidden',{host});
 const local=host==='::1'||host.startsWith('127.');
 if(local&&['GET','HEAD','POST'].includes(method))return;
 if(method==='POST'&&pathname==='/mesh/v1/query')return;
 if(method==='GET'&&rawRoutes.test(pathname))return;
 if(method==='POST'&&pathname==='/')return; // Body is restricted by rpcIp below.
 rejectNetwork('gateway_route_forbidden',{host,method,path:pathname});
}
function checkArgs(args,secure){
 if(secure)rejectNetwork('tls_forbidden_in_mesh');
 let opts={};
 if(typeof args[0]==='string'||args[0] instanceof URL){const u=new URL(args[0]);if(u.protocol!=='http:')rejectNetwork('protocol_forbidden');opts={hostname:u.hostname,port:u.port||80,path:u.pathname+u.search};if(args[1]&&typeof args[1]==='object')opts={...opts,...args[1]};}
 else opts=args[0]||{};
 if(opts.socketPath||opts.agent&&opts.agent!==http.globalAgent)rejectNetwork('custom_transport_forbidden');
 const host=String(opts.hostname||opts.host||'').replace(/^\[|\]$/g,'');
 validateIpRequest({host,port:opts.port||80,method:opts.method||'GET',pathname:opts.path||'/',headers:opts.headers||{}});
 if(opts.method==='POST'&&!host.startsWith('127.')&&host!=='::1'&&!rpcContext.getStore())rejectNetwork('approved_rpc_transport_required');
}
export function installNetworkLockdown(){
 if(installed)return;installed=true;
 // Node's global agent may inherit an environment proxy. Mesh requests must
 // connect directly to the literal IP we validate, regardless of that setting.
 http.globalAgent=new http.Agent({keepAlive:true,proxyEnv:{}});
 for(const mod of [http,https])for(const key of ['request','get']){const original=mod[key];mod[key]=function(...args){checkArgs(args,mod===https);return tcpContext.run(true,()=>Reflect.apply(original,this,args));};}
 const originalConnect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){
  const list=Array.isArray(args[0])?args[0]:args;
  const options=list[0];const host=typeof options==='object'?options.host:(typeof list[1]==='string'?list[1]:null);
  if(host&&!net.isIP(String(host).replace(/^\[|\]$/g,'')))rejectNetwork('domain_socket_forbidden',{host:String(host)});
  if(host&&!String(host).startsWith('127.')&&host!=='::1'&&!tcpContext.getStore())rejectNetwork('unapproved_tcp_transport');
  return Reflect.apply(originalConnect,this,args);
 };
 tls.connect=()=>rejectNetwork('tls_forbidden_in_mesh');
 for(const key of Object.keys(dns))if(key==='lookup'||key==='lookupService'||key.startsWith('resolve')){if(typeof dns[key]==='function')dns[key]=()=>rejectNetwork('dns_forbidden');}
 for(const key of Object.keys(dns.promises))if(key==='lookup'||key==='lookupService'||key.startsWith('resolve')){if(typeof dns.promises[key]==='function')dns.promises[key]=async()=>rejectNetwork('dns_forbidden');}
 // Core RPCs use the bounded IP-only HTTP transport, so native fetch cannot
 // introduce redirects, domain lookup, proxy agents or unrecorded HTTP calls.
 globalThis.fetch=async()=>rejectNetwork('unrestricted_fetch_forbidden');
 dns.lookup=(host,options,callback)=>{const family=net.isIP(host);if(!family)return rejectNetwork('dns_forbidden',{host});const cb=typeof options==='function'?options:callback;queueMicrotask(()=>options?.all?cb(null,[{address:host,family}]):cb(null,host,family));};
 dns.promises.lookup=async(host,options)=>{const family=net.isIP(host);if(!family)return rejectNetwork('dns_forbidden',{host});return options?.all?[{address:host,family}]:{address:host,family};};
 syncBuiltinESMExports();
}
installNetworkLockdown();
