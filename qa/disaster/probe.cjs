// Run with the exact packaged EXE in Node mode, without application guards.
const fs=require('node:fs'),net=require('node:net'),dns=require('node:dns'),http=require('node:http');
const config=JSON.parse(fs.readFileSync(process.argv[2]));
const deadline=(promise,ms=4500)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);
async function attempt(fn){try{return {ok:true,value:await deadline(fn())};}catch(e){return {ok:false,error:e.code||e.message};}}
const tcp=(host,port)=>new Promise((resolve,reject)=>{const socket=net.connect({host,port});socket.setTimeout(3500,()=>socket.destroy(new Error('timeout')));socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',reject);});
const mesh=(host,port)=>new Promise((resolve,reject)=>{const body=JSON.stringify({op:'snapshot',name:''});const req=http.request({host,port,path:'/mesh/v1/query',method:'POST',agent:false,timeout:3500,headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let data='';res.on('data',chunk=>{data+=chunk;if(data.length>4096)req.destroy(new Error('too_large'));});res.on('end',()=>{try{const r=JSON.parse(data);if(r.error!=='invalid_arns_name')throw new Error('unexpected_mesh_reply');resolve(true);}catch(e){reject(e);}});});req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',reject);req.end(body);});
(async()=>{
 const r={unguardedExecutable:process.execPath,at:new Date().toISOString(),checks:[]};
 for(const check of config.checks){const {label,kind,host,port}=check;let result;
  if(kind==='dns'){const resolver=new dns.promises.Resolver({timeout:1200,tries:1});result=await attempt(()=>resolver.resolve4(host));if(!config.includeAddresses&&result.ok)result.value=true;}
  else result=await attempt(()=>kind==='mesh'?mesh(host,port):tcp(host,port));
  r.checks.push({label,kind,...result});
 }
 fs.writeFileSync(process.argv[3],JSON.stringify(r));process.exit(0);
})().catch(()=>process.exit(1));
