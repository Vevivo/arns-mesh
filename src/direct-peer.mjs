import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import {requestIpJson} from './ip-transport.mjs';

export function parsePeerAddresses(lines){
 const entries=Array.isArray(lines)?lines:String(lines).split(/\s+/).filter(Boolean);
 if(entries.length>16)throw new Error('too_many_direct_peers');
 return [...new Set(entries)].map(value=>{const i=value.lastIndexOf(':'),host=value.slice(0,i).replace(/^\[|\]$/g,''),port=Number(value.slice(i+1));if(!net.isIP(host)||!Number.isInteger(port)||port<1||port>65535)throw new Error('invalid_peer_ip_port');return {host,port};});
}
export function loadDirectPeers(file=process.env.ARNS_IP_PEERS){if(!file)return [];try{return parsePeerAddresses(JSON.parse(fs.readFileSync(file)));}catch{return [];}}
export async function queryDirectPeer(peer,request,{signal}={}){
 const lookup=request.op==='location'||request.op==='content';
 const pendingError=request.op==='location'?'location_lookup_pending':'content_lookup_pending';
 const deadline=Date.now()+(lookup?30000:10000);
 const bounded=signal?AbortSignal.any([signal,AbortSignal.timeout(lookup?30000:10000)]):AbortSignal.timeout(lookup?30000:10000);
 for(let attempt=0;attempt<(lookup?4:1);attempt++){
  bounded.throwIfAborted();
  const response=await requestIpJson({...peer,path:'/mesh/v1/query',method:'POST',body:request,purpose:'mesh-peer',maxBytes:1024*1024,timeout:Math.max(1,Math.min(10000,deadline-Date.now())),signal:bounded});
  if(!lookup||response?.ok||response?.error!==pendingError||attempt===3)return response;
  // A cold peer is still fetching and verifying the item. Ask the same peer
  // again, without converting its pending state into a permanent miss.
  await new Promise((resolve,reject)=>{
   const done=()=>{bounded.removeEventListener('abort',cancel);resolve();};
   const timer=setTimeout(done,150);
   const cancel=()=>{clearTimeout(timer);bounded.removeEventListener('abort',cancel);reject(bounded.reason);};
   bounded.addEventListener('abort',cancel,{once:true});if(bounded.aborted)cancel();
  });
 }
}

// This endpoint exchanges signed Mesh envelopes and raw signed items. It never
// proxies URLs, resolves domain names, or serves a web page on a site's behalf.
export async function startDirectPeerServer(peer,{host='0.0.0.0',port=49740,networkAnnouncement=()=>null}={}){
 if(!net.isIP(host)||!Number.isInteger(port)||port<0||port>65535)throw new Error('invalid_peer_listener');
 if(!peer.identity)throw new Error('peer_identity_unavailable');
 let active=0;
 const server=http.createServer((req,res)=>{
  const expected=String(req.headers.host||'').replace(/^\[|\]/g,'');
  if(req.method!=='POST'||req.url!=='/mesh/v1/query'||req.headers.origin||!net.isIP(expected.slice(0,expected.lastIndexOf(':')))||active>=8){res.writeHead(403);res.end();return;}
  active++;let released=false;res.on('close',()=>{if(!released){released=true;active--;}});
  let body='',bytes=0;req.on('error',()=>{});
  req.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192){req.destroy();return;}body+=chunk;});
  req.on('end',async()=>{try{
   const request=JSON.parse(body);
   if(!['snapshot','content','location','network'].includes(request.op))throw new Error('mesh_operation_not_allowed');
   const network=request.op==='network'?networkAnnouncement():null;
   const reply=request.op==='network'?(network?{ok:true,network}:{ok:false,error:'network_not_published'}):await peer._handleAsync(request);
   peer.requestsServed++;
   if(request.op==='content'&&reply.ok){const item=JSON.parse(reply.recordJson);peer.contentChunksServed++;peer.contentBytesServed+=Buffer.from(item.data,'base64').length;}
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(reply));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:String(error.message).slice(0,240)}));}});
 });
 server.headersTimeout=5000;server.requestTimeout=15000;server.maxConnections=32;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 peer.directAddress=server.address();
 return {address:server.address(),async close(){peer.directAddress=null;server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
