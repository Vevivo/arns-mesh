// Controlled two-machine acceptance fixture, never a production witness.
// Every key and observation here has one controller and synthetic chain data.
// It stores only test name metadata, not Arweave content or real name indexes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NameCertificateSigner,CertifiedNameStore,FileNameState,initialCertificateState} from '../../src/name-certificate-state.mjs';
import {enrollNewNameSignerState,ShardedNameSignerState} from '../../src/sharded-name-state.mjs';
import {NameCertificateService} from '../../src/name-certificate-service.mjs';
import {namePolicyId,witnessKeyId,verifyNameCertificate} from '../../src/name-certificates.mjs';

const args=new Map();
for(let i=2;i<process.argv.length;i+=2){assert(process.argv[i]?.startsWith('--')&&process.argv[i+1],'Expected --option value');assert(!args.has(process.argv[i]),'Duplicate option');args.set(process.argv[i],process.argv[i+1]);}
for(const key of args.keys())assert(['--data-dir','--host','--port','--count','--ttl'].includes(key),'Unknown option '+key);
assert.equal(process.platform,'linux','This fixture requires actual Linux directory fsync');
assert(args.has('--data-dir'),'Pass a fresh staging --data-dir');
const directory=path.resolve(args.get('--data-dir')),host=args.get('--host')||'127.0.0.1',port=Number(args.get('--port')||49846),count=Number(args.get('--count')||4),ttl=Number(args.get('--ttl')||180);
assert(net.isIP(host),'Host must be numeric');assert(Number.isInteger(port)&&port>1024&&port<65536,'Invalid port');assert([4,10].includes(count),'Count must be 4 or 10');assert(Number.isInteger(ttl)&&ttl>=30&&ttl<=300,'TTL must be 30..300 seconds');
assert(!fs.existsSync(directory),'Refusing to reuse any existing data directory');
assert(fs.statSync(path.dirname(directory)).isDirectory(),'Parent directory must already exist');
fs.mkdirSync(directory,{mode:0o700});
const ROUND=60000,GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',PROGRAM='1'.repeat(32),TARGET='A'.repeat(43),WRONG='B'.repeat(43);
const startedAt=Date.now(),maxFaults=count===4?1:3,threshold=count-maxFaults;
// First create a past, expired certificate. Then advance to the real clock;
// no signer state is rewound or reset after it has issued a current vote.
let historicalClock=Math.floor(startedAt/ROUND)*ROUND-4*ROUND+1000;
const now=()=>historicalClock??Date.now();
const keys=Array.from({length:count},()=>crypto.generateKeyPairSync('ed25519'));
const policy={schema:'arns-mesh-name-policy/v1',networkId:'same-controller-linux-qa-'+crypto.randomBytes(8).toString('hex'),chainId:'solana:'+GENESIS,registryProgramId:PROGRAM,threshold,maxFaults,roundMs:ROUND,leaseMs:120000,maxFutureSkewMs:1000,validFrom:historicalClock-ROUND,validUntil:startedAt+3600000,witnesses:keys.map((key,i)=>({domain:'same-controller-test-'+i,publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}))};
const policyId=namePolicyId(policy),roots=[],services=[],signers=[];
let server,timer,stopping=false,active=0;
const report={schema:'arns-mesh-cross-machine-fixture/v1',scope:'Synthetic observations and one controller; real Linux durable signing state and HTTP, not independent operators or public-chain evidence',pid:process.pid,host,port,count,threshold,maxFaults,startedAt:new Date(startedAt).toISOString(),deadline:new Date(startedAt+ttl*1000).toISOString(),policyId,policy,targets:{correct:TARGET,wrong:WRONG},names:{alpha:'quorum of correct votes plus at most f conflicting votes',insufficient:'fewer than threshold original votes',wrong:'at most f wrong-target original votes',historical:'expired original full-quorum certificate'},requests:[],errors:[]};
const save=()=>{const encoded=JSON.stringify(report,null,2);assert(Buffer.byteLength(encoded)<=16384,'Public report exceeds bound');fs.writeFileSync(path.join(directory,'public.json'),encoded,{mode:0o600});};
async function stop(reason){
 if(stopping)return;stopping=true;clearTimeout(timer);
 if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 for(const root of roots){try{root.close();}catch(error){report.errors.push(error.message);process.exitCode=1;}}
 report.stoppedAt=new Date().toISOString();report.stopReason=reason;save();
 console.log(JSON.stringify({event:'fixture-stopped',reason,requests:report.requests.length,errors:report.errors}));
}
try{
 const store=new CertifiedNameStore({policy,driver:new FileNameState(path.join(directory,'certificates.json'),{initial:initialCertificateState(policy),strictDirectorySync:true}),now});
 for(let i=0;i<count;i++){
  const privateKeyPem=keys[i].privateKey.export({type:'pkcs8',format:'pem'}),keyId=witnessKeyId(policy.witnesses[i].publicKeyPem),stateEpoch=crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(directory,'test-key-'+i+'.pem'),privateKeyPem,{mode:0o600,flag:'wx'});
  const options={directory:path.join(directory,'signer-'+i),policyId,keyId,stateEpoch,now,maxNames:8};
  enrollNewNameSignerState(options);const root=new ShardedNameSignerState(options);roots.push(root);
  const signer=new NameCertificateSigner({policy,privateKeyPem,driverForName:name=>root.forName(name),now,observe:async(name,{signal})=>{
   signal?.throwIfAborted();assert(['alpha','insufficient','wrong','historical'].includes(name),'Unknown synthetic name');
   const observed=now();return {schema:'arns-mesh-coherent-name-observation/v1',name,chainId:policy.chainId,genesisHash:GENESIS,registryProgramId:PROGRAM,antId:PROGRAM,antProgramId:PROGRAM,txId:name==='wrong'||name==='alpha'&&i<maxFaults?WRONG:TARGET,slot:Math.floor(observed/ROUND)*100+i,observedAt:new Date(observed).toISOString(),leaseEndsAt:null,provenance:{coherentAccountRead:true,strictAssetValidation:true,finalizedCommitmentRequested:true,genesisChecked:true}};
  }});signers.push(signer);services.push(new NameCertificateService({policy,signer,store,now}));
 }
 const observations=await Promise.all(signers.slice(0,threshold).map(signer=>signer.issue('historical'))),certificate={schema:'arns-mesh-name-certificate/v1',round:Math.floor(now()/ROUND),observations};
 const old=await store.accept(certificate,{name:'historical',mode:'current'});report.historical={observedAt:old.verification.observedAt,expiresAt:old.verification.expiresAt};
 historicalClock=null;assert(Date.now()>old.verification.expiresAt);
 const historicalService=new NameCertificateService({policy,store,now});
 server=http.createServer((request,response)=>{
  if(request.method!=='POST'||request.url!=='/mesh/v1/query'||request.headers.origin||active>=4){response.writeHead(403);response.end();return;}
  active++;const controller=new AbortController();let released=false;
  response.once('close',()=>{if(!released){released=true;active--;}if(!response.writableEnded)controller.abort(new Error('Fixture client disconnected'));});
  let body='',size=0;request.on('error',()=>{});request.on('data',chunk=>{size+=chunk.length;if(size>8192)request.destroy();else body+=chunk;});
  request.on('end',async()=>{
   try{
    const req=JSON.parse(body);assert(['alpha','insufficient','wrong','historical'].includes(req.name),'Unknown synthetic name');
    let reply;
    if(req.name==='historical')reply=await historicalService.reply(req,{signal:controller.signal});
    else{
     const selected=req.name==='insufficient'?services.slice(0,threshold-1):req.name==='wrong'?services.slice(0,maxFaults):services;
     const replies=await Promise.all(selected.map(service=>service.reply(req,{signal:controller.signal})));
     reply={schema:'arns-mesh-name-certificate-reply/v1',name:req.name,policyId,observations:replies.flatMap(value=>value.observations),certificates:[]};
     if(req.name==='alpha'&&!req.historical){
      const round=JSON.parse(reply.observations[0].recordJson).round;
      const checked=verifyNameCertificate({schema:'arns-mesh-name-certificate/v1',round,observations:reply.observations},policy,{name:'alpha',now:Date.now()});assert.equal(checked.binding.txId,TARGET);
     }
    }
    const encoded=JSON.stringify({ok:true,recordJson:JSON.stringify(reply)});assert(Buffer.byteLength(encoded)<512*1024);
    if(report.requests.length<32)report.requests.push({name:req.name,historical:req.historical,remoteAddress:request.socket.remoteAddress,at:new Date().toISOString()});save();
    response.writeHead(200,{'content-type':'application/json','cache-control':'no-store','content-length':Buffer.byteLength(encoded)});response.end(encoded);
   }catch(error){if(!response.destroyed&&!response.writableEnded){response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({ok:false,error:error.message}));}}
  });
 });
 server.headersTimeout=5000;server.requestTimeout=15000;server.maxConnections=16;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host,port,exclusive:true},resolve);});
 save();console.log(JSON.stringify({event:'fixture-ready',reportFile:path.join(directory,'public.json'),host,port,count,threshold,policyId,pid:process.pid,ttl}));
 timer=setTimeout(()=>void stop('ttl'),ttl*1000);process.once('SIGTERM',()=>void stop('SIGTERM'));process.once('SIGINT',()=>void stop('SIGINT'));
}catch(error){report.errors.push(error.message);process.exitCode=1;await stop('startup-error');}
