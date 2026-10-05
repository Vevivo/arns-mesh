import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

export function writeOperatorStatus(dataDir,value){
 const file=path.join(dataDir,'operator-status.json');
 fs.writeFileSync(file+'.tmp',JSON.stringify({schema:'arns-mesh-operator-status/v1',at:new Date().toISOString(),...value}),{mode:0o600});fs.renameSync(file+'.tmp',file);
}
// Operator information is never added to the public content protocol.
export async function startOperatorDashboard({dataDir,port=49742}={}){
 const root=fileURLToPath(new URL('../apps/operator/',import.meta.url));
 const routes={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
 const server=http.createServer((req,res)=>{
  if(req.method!=='GET'||req.headers.origin||req.headers.host!==`127.0.0.1:${server.address().port}`||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end();return;}
  const route=routes[req.url];
  try{
   const body=req.url==='/status'?fs.readFileSync(path.join(dataDir,'operator-status.json')):route?fs.readFileSync(path.join(root,route[0])):null;
   if(!body){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':req.url==='/status'?'application/json':route[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"});res.end(body);
  }catch{res.writeHead(503);res.end('Status is not available yet.');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {address:server.address(),close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
