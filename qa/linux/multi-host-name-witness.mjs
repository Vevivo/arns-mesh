// Separate GitHub-hosted Linux jobs, one repository administrator. Public
// artifacts transport the votes; this is not a Mesh HTTP or independence test.
// Synthetic chain observations are intentional. Private keys never leave the
// creating runner's temporary directory and are never included in artifacts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {NameCertificateSigner} from '../../src/name-certificate-state.mjs';
import {enrollNewNameSignerState,ShardedNameSignerState} from '../../src/sharded-name-state.mjs';
import {namePolicyId,witnessKeyId,nameObservationSigningBytes,verifyNameObservation,verifyNameCertificate} from '../../src/name-certificates.mjs';

const command=process.argv[2],count=Number(process.env.WITNESS_COUNT),index=Number(process.env.WITNESS_INDEX);
assert(['keygen','wait-roster','sign','aggregate'].includes(command),'Unknown command');
assert.equal(process.platform,'linux','Actual Linux filesystem required');assert([4,10].includes(count),'Expected 4 or 10 runners');
const runId=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT,sourceSha=process.env.GITHUB_SHA;
assert(/^\d+$/.test(runId)&&/^\d+$/.test(attempt)&&/^[a-f0-9]{40}$/.test(sourceSha),'GitHub run identity required');
const f=count===4?1:3,q=count-f,ROUND=60000,TARGET='A'.repeat(43),OLD='C'.repeat(43),WRONG='B'.repeat(43),PROGRAM='1'.repeat(32),GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const scope='Separate GitHub-hosted Linux runner VMs, same repository administrator; synthetic observations; public-artifact exchange, not Mesh networking or independent production operators';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const requiredPath=name=>{assert(process.env[name],name+' required');return path.resolve(process.env[name]);};
const read=file=>{const st=fs.lstatSync(file);assert(st.isFile()&&!st.isSymbolicLink()&&st.size<=262144,'Invalid bounded public file');return JSON.parse(fs.readFileSync(file,'utf8'));};
function publicWrite(directory,name,value){fs.mkdirSync(directory,{recursive:true});const encoded=JSON.stringify(value,null,2);assert(Buffer.byteLength(encoded)<=262144&&!encoded.includes('PRIVATE KEY'),'Public artifact guard');fs.writeFileSync(path.join(directory,name),encoded+'\n',{flag:'wx',mode:0o600});}
function ownRunner(){
 assert(Number.isInteger(index)&&index>=0&&index<count,'Invalid runner index');
 const temp=fs.realpathSync(requiredPath('RUNNER_TEMP')),work=process.env.WITNESS_WORK?requiredPath('WITNESS_WORK'):path.join(temp,'arns-name-witness-'+count+'-'+index);
 assert(path.dirname(work)===temp&&path.basename(work)==='arns-name-witness-'+count+'-'+index,'Private state must be in this runner temporary directory');return work;
}
function roster(){
 const directory=requiredPath('WITNESS_ROSTER'),files=fs.readdirSync(directory).filter(file=>file.startsWith('public-'+count+'-')&&file.endsWith('.json'));
 assert.equal(files.length,count,'Incomplete public roster');const rows=files.map(file=>read(path.join(directory,file))).sort((a,b)=>a.index-b.index);
 for(const [i,row]of rows.entries()){
  assert.equal(row.schema,'arns-mesh-ci-public-witness/v1');assert.equal(row.count,count);assert.equal(row.index,i);assert.equal(row.runId,runId);assert.equal(row.attempt,attempt);assert.equal(row.sourceSha,sourceSha);
  assert.equal(row.keyId,witnessKeyId(row.publicKeyPem));assert(Number.isSafeInteger(row.createdAt)&&Math.abs(Date.now()-row.createdAt)<3600000,'Public key time outside this run');assert(/^[a-f0-9]{64}$/.test(row.machineId),'Invalid runner fingerprint');
 }
 assert.equal(new Set(rows.map(row=>row.keyId)).size,count,'Repeated witness key');assert.equal(new Set(rows.map(row=>row.machineId)).size,count,'Repeated runner boot identity');
 const latest=Math.max(...rows.map(row=>row.createdAt)),earliest=Math.min(...rows.map(row=>row.createdAt)),round=Math.floor(latest/ROUND)+2;
 const policy={schema:'arns-mesh-name-policy/v1',networkId:'gha-'+runId+'-'+attempt+'-'+count,chainId:'solana:'+GENESIS,registryProgramId:PROGRAM,threshold:q,maxFaults:f,roundMs:ROUND,leaseMs:600000,maxFutureSkewMs:5000,validFrom:earliest-3600000,validUntil:latest+3600000,witnesses:rows.map(row=>({domain:'ci-vm-'+count+'-'+row.index,publicKeyPem:row.publicKeyPem}))};
 return{rows,round,policy,policyId:namePolicyId(policy)};
}
async function keygen(){
 const work=ownRunner();assert(!fs.existsSync(work),'Refusing to reuse private runner state');fs.mkdirSync(work,{mode:0o700});
 const keys=crypto.generateKeyPairSync('ed25519'),privateKeyPem=keys.privateKey.export({type:'pkcs8',format:'pem'}),publicKeyPem=keys.publicKey.export({type:'spki',format:'pem'});
 const fd=fs.openSync(path.join(work,'private-key.pem'),'wx',0o600);try{fs.writeFileSync(fd,privateKeyPem);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const dir=fs.openSync(work,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 const publicKey={schema:'arns-mesh-ci-public-witness/v1',runId,attempt,sourceSha,count,index,createdAt:Date.now(),publicKeyPem,keyId:witnessKeyId(publicKeyPem),host:os.hostname(),machineId:hash(os.hostname()+'\0'+fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8'))};
 publicWrite(requiredPath('WITNESS_PUBLIC'),'public-'+count+'-'+index+'.json',publicKey);console.log(JSON.stringify({event:'public-key-ready',count,index,keyId:publicKey.keyId}));
}
async function waitRoster(){
 const repository=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
 assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)&&token,'Read-only Actions token required');
 const prefix='name-witness-public-'+attempt+'-'+count+'-',needed=new Set(Array.from({length:count},(_,i)=>prefix+i)),deadline=Date.now()+360000;
 while(Date.now()<deadline){
  const found=new Set();
  for(let page=1;page<=5;page++){
   const response=await fetch('https://api.github.com/repos/'+repository+'/actions/runs/'+runId+'/artifacts?per_page=100&page='+page,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
   assert(response.ok,'Actions artifact listing failed with HTTP '+response.status);const body=await response.json();assert(Array.isArray(body.artifacts),'Invalid artifact listing');
   for(const artifact of body.artifacts)if(needed.has(artifact.name)&&!artifact.expired&&artifact.size_in_bytes<=16384)found.add(artifact.name);
   if(body.artifacts.length<100)break;
  }
  if(found.size===count){console.log(JSON.stringify({event:'public-roster-uploaded',count}));return;}
  await delay(10000);
 }
 throw new Error('Public roster did not arrive within six minutes');
}
async function sign(){
 const work=ownRunner(),{rows,round,policy,policyId}=roster(),privateKeyPem=fs.readFileSync(path.join(work,'private-key.pem'),'utf8');
 const ownPublic=crypto.createPublicKey(privateKeyPem).export({type:'spki',format:'pem'});assert.equal(ownPublic,rows[index].publicKeyPem);
 let oldClock=(round-20)*ROUND+2000;const now=()=>oldClock??Date.now(),stateEpoch=crypto.randomBytes(16).toString('hex'),options={directory:path.join(work,'signer-state'),policyId,keyId:rows[index].keyId,stateEpoch,now,maxNames:8};
 enrollNewNameSignerState(options);let root=new ShardedNameSignerState(options),observations=0;
 const observe=async name=>{observations++;const at=now();return{schema:'arns-mesh-coherent-name-observation/v1',name,chainId:policy.chainId,genesisHash:GENESIS,registryProgramId:PROGRAM,antId:PROGRAM,antProgramId:PROGRAM,txId:name==='wrong'||name==='alpha'&&index<f?WRONG:name==='alpha'&&oldClock!==null?OLD:TARGET,slot:Math.floor(at/ROUND)*100+index,observedAt:new Date(at).toISOString(),leaseEndsAt:null,provenance:{coherentAccountRead:true,strictAssetValidation:true,finalizedCommitmentRequested:true,genesisChecked:true}};};
 try{
  const signer=new NameCertificateSigner({policy,privateKeyPem,driverForName:name=>root.forName(name),now,observe}),historical=await signer.issue('alpha');
  const start=round*ROUND+2000;assert(Date.now()<start+40000,'Common signing window already missed');if(Date.now()<start)await delay(start-Date.now());
  oldClock=null;assert.equal(Math.floor(Date.now()/ROUND),round,'Common signing round missed');
  const votes={};for(const name of ['alpha','insufficient','wrong','equivocation'])votes[name]=await signer.issue(name);
  const before=observations;assert.deepEqual(await signer.issue('alpha'),votes.alpha);assert.equal(observations,before,'Same-round repeat must reuse durable original bytes');
  root.close();root=new ShardedNameSignerState(options);
  const reopened=new NameCertificateSigner({policy,privateKeyPem,driverForName:name=>root.forName(name),now,observe:async()=>{throw new Error('Persisted original vote missing after reopen');}});
  for(const name of Object.keys(votes))assert.deepEqual(await reopened.issue(name),votes[name]);
  let conflicting=null;if(index<f){const original=JSON.parse(votes.equivocation.recordJson),recordJson=JSON.stringify({...original,txId:WRONG});conflicting={keyId:rows[index].keyId,recordJson,signature:crypto.sign(null,nameObservationSigningBytes(recordJson),privateKeyPem).toString('base64url')};}
  root.close();root=null;
  publicWrite(requiredPath('WITNESS_PROOFS'),'proof-'+count+'-'+index+'.json',{schema:'arns-mesh-ci-witness-proof/v1',scope,runId,attempt,sourceSha,count,index,policyId,round,publicWitness:rows[index],durableReopenVerified:true,votes,historical,conflicting});
  console.log(JSON.stringify({event:'original-votes-persisted-and-reopened',count,index,policyId,round}));
 }finally{root?.close();}
}
function aggregate(){
 const {rows,round,policy,policyId}=roster(),directory=requiredPath('WITNESS_PROOFS'),files=fs.readdirSync(directory).filter(file=>file.startsWith('proof-'+count+'-')&&file.endsWith('.json'));
 assert.equal(files.length,count);const proofs=files.map(file=>read(path.join(directory,file))).sort((a,b)=>a.index-b.index),now=Date.now(),cases=[];
 for(const [i,proof]of proofs.entries()){
  assert.equal(proof.schema,'arns-mesh-ci-witness-proof/v1');assert.equal(proof.runId,runId);assert.equal(proof.attempt,attempt);assert.equal(proof.sourceSha,sourceSha);assert.equal(proof.count,count);assert.equal(proof.index,i);assert.equal(proof.round,round);assert.equal(proof.policyId,policyId);assert.deepEqual(proof.publicWitness,rows[i]);assert.equal(proof.durableReopenVerified,true);
  for(const [name,vote]of Object.entries(proof.votes)){const checked=verifyNameObservation(vote,policy,{name,round,now});assert.equal(checked.domain,'ci-vm-'+count+'-'+i);}
 }
 const certificate=(observations,r=round)=>({schema:'arns-mesh-name-certificate/v1',round:r,observations});
 const check=(value,name='alpha',options={})=>verifyNameCertificate(value,policy,{name,mode:'current',now,...options});
 const current=check(certificate(proofs.map(proof=>proof.votes.alpha)));assert.equal(current.binding.txId,TARGET);assert.equal(current.domains.length,q);assert.equal(current.currentWindow,true);cases.push({case:'q correct votes survive f conflicting votes',acceptedDomains:q,wrongDomains:f});
 const rejects=(label,work)=>{let error='';try{work();}catch(e){error=e.message;}assert(error,label+' unexpectedly accepted');cases.push({case:label,rejected:error});};
 rejects('q minus one authentic correct votes',()=>check(certificate(proofs.slice(0,q-1).map(proof=>proof.votes.insufficient)),'insufficient'));
 rejects('f authentic wrong-target votes',()=>check(certificate(proofs.slice(0,f).map(proof=>proof.votes.wrong)),'wrong'));
 rejects('repeating one original signature cannot form quorum',()=>check(certificate(Array.from({length:q},()=>proofs[f].votes.alpha))));
 const forged=structuredClone(proofs.slice(f).map(proof=>proof.votes.alpha));forged[0].recordJson=JSON.stringify({...JSON.parse(forged[0].recordJson),txId:WRONG});rejects('altered binding without a new original signature',()=>check(certificate(forged)));
 const equivocation=check(certificate(proofs.flatMap(proof=>[proof.votes.equivocation,...(proof.conflicting?[proof.conflicting]:[])])),'equivocation');assert.equal(equivocation.binding.txId,TARGET);assert.equal(equivocation.domains.length,q);assert.equal(equivocation.discardedDomains.filter(row=>row.reason==='equivocation').length,f);cases.push({case:'f equivocating keys excluded',acceptedDomains:q,discardedDomains:f});
 const old=certificate(proofs.map(proof=>proof.historical),round-20);rejects('expired previous mapping cannot be current',()=>check(old));
 const historical=check(old,'alpha',{mode:'historical',floor:current.nextFloor});assert.equal(historical.binding.txId,OLD);assert.equal(historical.currentWindow,false);assert.deepEqual(historical.nextFloor,current.nextFloor);cases.push({case:'dated previous full quorum remains history without lowering current floor',domains:historical.domains.length,originalObservedAt:historical.observedAt,originalExpiresAt:historical.expiresAt});
 const result={schema:'arns-mesh-ci-multihost-result/v1',passed:true,scope,runId,attempt,sourceSha,count,threshold:q,maxFaults:f,policyId,policy,actualVerificationTime:now,round,distinctRunnerBoots:new Set(rows.map(row=>row.machineId)).size,runnerHosts:rows.map(row=>({index:row.index,host:row.host,machineId:row.machineId})),cases};
 publicWrite(requiredPath('WITNESS_RESULTS'),'result-'+count+'.json',result);console.log(JSON.stringify({passed:true,count,threshold:q,distinctRunnerBoots:count,cases:cases.length,policyId}));
}
await ({keygen,'wait-roster':waitRoster,sign,aggregate}[command])();
