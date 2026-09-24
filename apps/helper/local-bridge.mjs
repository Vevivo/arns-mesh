import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {WorkBudget} from '../../src/resource-budget.mjs';
import {accessError} from '../../src/access-error.mjs';
import {parseInput} from '../../src/swarm-access.mjs';
const listen=(server,host)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,host,()=>resolve(server.address().port));});
export async function startLocalBridge({dataDir,resolve,share=async()=>{},diagnostics=()=>({}),onShutdown=()=>{}}){
 // Fail before opening a listener if the state directory is unavailable.
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const token=crypto.randomBytes(32).toString('hex'),file=path.join(dataDir,'bridge.json'),sites=new Map(),usedHosts=new Set();
 const siteServers=new Set(),controllers=new Set(),budget=new WorkBudget({active:2,pending:128});let closed=false,suspended=false;
 const csp="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'; frame-ancestors 'none'; object-src 'none'; frame-src 'self'; base-uri 'self'; form-action 'self'";
 async function open(raw){
   if(closed||suspended)throw new Error('p2p_suspended');
   if(typeof raw!=='string'||raw.length>4096)throw new Error('invalid_ar_address');
   const {name}=parseInput(raw);const requested=new URL(raw);
   if(!sites.has(name)){
     if(sites.size>=32)throw new Error('Up to 32 ArNS sites can be open at once.');
     const opening=(async()=>{
       const hash=crypto.createHash('sha256').update(name).digest();
       // Separate loopback IPs isolate cookies as well as document origins.
       let host=`127.${32+hash[0]%192}.${hash[1]}.${1+hash[2]%254}`;
       while(usedHosts.has(host)){const r=crypto.randomBytes(3);host=`127.${32+r[0]%192}.${r[1]}.${1+r[2]%254}`;}
       usedHosts.add(host);
       const server=http.createServer(async(req,res)=>{
         if(closed||suspended){res.writeHead(503);res.end('P2P is paused. Select P2P in Wayfinder to continue.');return;}
         if(req.headers.host!==`${host}:${server.address().port}`||!['GET','HEAD'].includes(req.method)){res.writeHead(403);res.end();return;}
         const controller=new AbortController();controllers.add(controller);
         const timeout=setTimeout(()=>controller.abort(new Error('transfer_timeout')),90000);
         res.once('close',()=>{if(!res.writableFinished)controller.abort(new Error('client_disconnected'));});
         try{
           const u=new URL(req.url,'http://'+req.headers.host);
           const arUrl='ar://'+name+u.pathname+u.search;parseInput(arUrl);
           const result=await budget.run(()=>resolve(arUrl,{signal:controller.signal}),{signal:controller.signal});
           controller.signal.throwIfAborted();await share(result);controller.signal.throwIfAborted();
           res.writeHead(200,{'Content-Type':result.contentType,'Content-Length':result.body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':csp,'Permissions-Policy':'camera=(), microphone=(), geolocation=()','X-ArNS-Mesh-Name':name,'X-ArNS-Mesh-Content-Verified':String(result.meta?.contentSignatureVerified===true),'X-ArNS-Mesh-Name-Trust':result.meta?.recovery?'saved-observation':'rpc-observation'});
           res.end(req.method==='HEAD'?undefined:result.body);
         }catch(error){
           const failure=accessError(error);
           try{fs.writeFileSync(path.join(dataDir,'last-content-error.json'),JSON.stringify({at:new Date().toISOString(),code:failure.code,detail:String(error.message||error).slice(0,2000),diagnostics:JSON.stringify(error.diagnostics||null).slice(0,96000)}),{mode:0o600});}catch{}
           if(!res.destroyed){res.writeHead(controller.signal.aborted?503:failure.status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'"});res.end('Wayfinder Mesh: '+failure.message+'\nCode: '+failure.code+'\nGateway fallback is disabled.');}
         }finally{clearTimeout(timeout);controllers.delete(controller);}
       });
       server.requestTimeout=120000;server.headersTimeout=10000;server.maxConnections=32;
       const port=await listen(server,host);siteServers.add(server);return {host,port};
     })();
     sites.set(name,opening);opening.catch(()=>sites.delete(name));
   }
   const site=await sites.get(name);return `http://${site.host}:${site.port}${requested.pathname}${requested.search}${requested.hash}`;
 }
 const status=()=>({ok:true,state:suspended?'paused':'local-helper-ready',contentReachability:'not-tested',resources:budget.status(),...diagnostics()});
 const control=http.createServer((req,res)=>{
   if(req.method!=='POST'||!['/open','/status','/suspend','/resume','/shutdown'].includes(req.url)||req.headers.origin||req.headers.host!==`127.0.0.1:${control.address().port}`||req.headers.authorization!==`Bearer ${token}`){res.writeHead(403);res.end();return;}
   if(req.url!=='/open'){if(req.url==='/suspend'){suspended=true;for(const c of controllers)c.abort(new Error('mode_changed'));}if(req.url==='/resume')suspended=false;if(req.url==='/shutdown')setTimeout(onShutdown,25);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(status()));return;}
   let body='';req.on('data',chunk=>{body+=chunk;if(body.length>8192)req.destroy();});
   req.on('end',async()=>{try{const {url}=JSON.parse(body);const localUrl=await open(url);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,url:localUrl}));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:String(e.message||e)}));}});
 });
 control.headersTimeout=5000;control.requestTimeout=10000;
 const port=await listen(control,'127.0.0.1');
 function heartbeat(){fs.writeFileSync(file+'.tmp',JSON.stringify({port,token,updatedAt:Date.now()}),{mode:0o600});fs.renameSync(file+'.tmp',file);}
 try{heartbeat();}catch(error){control.closeAllConnections();control.close();throw error;}
 const timer=setInterval(()=>{try{heartbeat();}catch{closed=true;clearInterval(timer);for(const c of controllers)c.abort(new Error('bridge_state_write_failed'));control.closeAllConnections();control.close();for(const s of siteServers){s.closeAllConnections();s.close();}onShutdown();}},5000);
 return {open,status,close(){closed=true;for(const c of controllers)c.abort(new Error('helper_stopped'));clearInterval(timer);control.closeAllConnections();control.close();for(const s of siteServers){s.closeAllConnections();s.close();}try{fs.unlinkSync(file);}catch{}}};
}
