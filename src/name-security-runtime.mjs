import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {readNameWitnessPolicy} from '../apps/helper/network-profile.mjs';
import {namePolicyId,validateNameWitnessPolicy,verifyNameCertificate,witnessKeyId} from './name-certificates.mjs';
import {CertifiedNameStore,FileNameState,NameCertificateSigner,initialCertificateState,nameCertificateHash} from './name-certificate-state.mjs';
import {NameCertificateCollector} from './name-certificate-collector.mjs';
import {collectNameCertificates} from './name-certificate-transport.mjs';
import {NameCertificateService} from './name-certificate-service.mjs';
import {ShardedNameSignerState} from './sharded-name-state.mjs';
import {loadDirectPeers} from './direct-peer.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const fail=code=>{throw Object.assign(new Error(code),{code});};
const checkedName=name=>{if(typeof name!=='string'||!/^[a-z0-9_-]{1,255}$/.test(name))fail('name_certificate_name_invalid');return name;};
const checkedMode=mode=>{if(!['current','historical'].includes(mode))fail('name_certificate_mode_invalid');return mode;};
const checkedTx=tx=>{if(tx!==null&&(typeof tx!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(tx)))fail('name_certificate_target_invalid');return tx;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const signerSettings=env=>[env.ARNS_NAME_SIGNER_KEY||'',env.ARNS_NAME_SIGNER_STATE||'',env.ARNS_NAME_SIGNER_EPOCH||'',env.ARNS_NAME_SIGNER_RPC_SEEDS||''];
const unavailable=()=>{const error=new Error('name_certificate_unavailable');error.code='NAME_CERTIFICATE_UNAVAILABLE';throw error;};
function boundedJson(file,max){
 const stat=fs.statSync(file);if(!stat.isFile()||stat.size>max)fail('name_security_configuration_size');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
// Dedicated witness observations must not silently follow later reader-profile
// RPC updates. The validated list is captured when the signer starts; changing
// its file requires a clean restart. The fallback preserves existing setups.
export function readNameSignerRpcConfiguration(env=process.env){
 const dedicated=env.ARNS_NAME_SIGNER_RPC_SEEDS||null;
 if(dedicated&&(typeof dedicated!=='string'||!path.isAbsolute(dedicated)))fail('name_signer_rpc_seeds_absolute_path_required');
 const selected=dedicated||env.SOLANA_RPC_SEEDS;
 if(typeof selected!=='string'||!selected)fail('name_signer_rpc_seeds_required');
 const seedFile=fs.realpathSync(path.resolve(selected));
 if(dedicated&&env.SOLANA_RPC_SEEDS){
  const managed=path.resolve(env.SOLANA_RPC_SEEDS);
  let actual=managed;try{actual=fs.realpathSync(managed);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(seedFile===actual)fail('name_signer_rpc_seeds_must_be_separate');
 }
 const values=boundedJson(seedFile,16384);
 if(!Array.isArray(values)||!values.length||values.length>16)fail('name_signer_rpc_seeds_invalid');
 const rpcSeeds=values.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['host','port'].includes(key))||typeof value.host!=='string'||!net.isIP(value.host)||!Number.isInteger(value.port)||value.port<1||value.port>65535)fail('name_signer_rpc_seed_invalid');
  return {host:value.host,port:value.port};
 });
 return {seedFile,rpcSeeds};
}
function configuredPeerKeys(env){
 if(!env.HYPER_WITNESS_PEERS)return [];
 const rows=boundedJson(env.HYPER_WITNESS_PEERS,16384);
 if(!Array.isArray(rows)||rows.length>64)fail('name_certificate_peer_keys_invalid');
 return rows.map(row=>row?.noisePublicKey).filter(key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key));
}
function selectedRecords(certificate,verification){
 return verification.witnessKeyIds.map(keyId=>{
  const envelope=certificate.observations.find(value=>value.keyId===keyId);
  if(!envelope)fail('name_certificate_snapshot_invalid');
  return JSON.parse(envelope.recordJson);
 });
}
function snapshotMetadata(certificate,verification){
 const records=selectedRecords(certificate,verification),binding=verification.binding;
 return {
  schema:'arns-mesh-name-snapshot/v1',name:binding.name,txId:binding.txId,antId:binding.antId,antProgramId:binding.antProgramId,
  observedAt:new Date(verification.observedAt).toISOString(),expiresAt:new Date(verification.expiresAt).toISOString(),
  slot:Math.min(...records.map(record=>record.slot)),ttlSeconds:Math.floor((verification.expiresAt-verification.observedAt)/1000),
  provenance:{
   kind:'quorum-witness',policyId:verification.policyId,round:verification.round,threshold:verification.threshold,maxFaults:verification.maxFaults,
   domains:[...verification.domains],certificateHash:nameCertificateHash(certificate),certificate:copy(certificate),
   historical:verification.historical,currentWindow:verification.currentWindow,currentStateVerified:false,trustModel:verification.trustModel,
   ...(verification.policyExpired?{policyExpired:true}:{}),
  },
 };
}

// Test hooks replace only configuration, storage or collection boundaries. They
// never replace signature verification or the production sign-once issuer.
export function createNameSecurityRuntime({
 env=process.env,now=Date.now,readPolicy=readNameWitnessPolicy,driverForName=null,collect=collectNameCertificates,
}={}){
 if(typeof now!=='function'||typeof readPolicy!=='function'||(driverForName!==null&&typeof driverForName!=='function')||typeof collect!=='function')fail('name_security_runtime_options_invalid');
 let pinnedPath=null,context=null,closed=false;
 const policyPath=()=>{
  const file=env.ARNS_NAME_WITNESS_POLICY||(env.ARNS_MESH_DATA?path.join(env.ARNS_MESH_DATA,'name-witness-policy.json'):null);
  if(file===null)return null;
  if(typeof file!=='string'||!file||path.basename(file)!=='name-witness-policy.json')fail('name_witness_policy_path_invalid');
  return path.resolve(file);
 };
 function readPinned(){
  if(closed)fail('name_security_runtime_closed');
  const file=policyPath();
  if(pinnedPath&&file!==pinnedPath)fail('name_witness_policy_required');
  if(!file)return null;
  const policy=readPolicy(path.dirname(file));
  if(!policy){if(pinnedPath)fail('name_witness_policy_required');return null;}
  const normalized=validateNameWitnessPolicy(policy,{now:now(),allowInactive:true});
  if(context&&namePolicyId(normalized)!==context.policyId)fail('name_policy_migration_required');
  pinnedPath=file;return normalized;
 }
 function makeContext(policy){
  const policyId=namePolicyId(policy),directory=path.dirname(pinnedPath),instances=new Map(),initialSignerSettings=signerSettings(env);
  let servicePromise=null,signerRoot=null;
  const assertCurrent=()=>{
   const current=readPinned();if(!current||namePolicyId(current)!==policyId)fail('name_policy_migration_required');
   if(!same(signerSettings(env),initialSignerSettings))fail('name_signer_configuration_changed_requires_restart');
   return current;
  };
  const active=()=>validateNameWitnessPolicy(assertCurrent(),{now:now()});
  function storeFor(name){
   checkedName(name);assertCurrent();
   if(instances.has(name)){const value=instances.get(name);instances.delete(name);instances.set(name,value);return value;}
   const digest=crypto.createHash('sha256').update(policyId+'\0'+name).digest('hex');
   const file=path.join(directory,'certified-names',policyId,digest.slice(0,2),digest+'.json');
   const driver=driverForName?driverForName(name,{file,policy:copy(policy),policyId}):new FileNameState(file,{initial:initialCertificateState(policy),maxBytes:512*1024});
   const store=new CertifiedNameStore({policy:assertCurrent,driver,maxNames:1,maxVersions:8,now});
   instances.set(name,store);if(instances.size>256)instances.delete(instances.keys().next().value);
   return store;
  }
  const store={
   known(name,options={}){return storeFor(name).known(name,options);},
   export(name){return storeFor(name).export(name);},
   advertised(name){return storeFor(name).advertised(name);},
   floor(name){return storeFor(name).floor(name);},
   async accept(certificate,{name,mode='current'}={}){
    checkedName(name);checkedMode(mode);active();
    const verification=verifyNameCertificate(certificate,policy,{name,mode,now:now(),floor:store.floor(name)});
    if(mode==='current'&&!verification.currentWindow)fail('name_certificate_not_current');
    const accepted=await storeFor(name).accept(certificate,{name,mode});
    assertCurrent();return accepted;
   },
   retain(name,options){
    const target=storeFor(name);if(typeof target.retain!=='function')fail('name_certificate_retention_unavailable');
    return target.retain(name,options);
   },
   release(name,options){
    const target=storeFor(name);if(typeof target.release!=='function')fail('name_certificate_retention_unavailable');
    return target.release(name,options);
   },
  };
  function checkCertificate(certificate,{name,mode='current',requireKnown=false}){
   checkedName(name);checkedMode(mode);assertCurrent();
   if(!certificate||certificate.schema!=='arns-mesh-name-certificate/v1'||Object.keys(certificate).some(key=>!['schema','round','observations'].includes(key))||!Array.isArray(certificate.observations)||!certificate.observations.length||certificate.observations.length>64)fail('name_certificate_snapshot_invalid');
   for(const envelope of certificate.observations){
    if(!envelope||Object.keys(envelope).some(key=>!['keyId','recordJson','signature'].includes(key))||typeof envelope.keyId!=='string'||envelope.keyId.length!==64||typeof envelope.signature!=='string'||envelope.signature.length!==86||typeof envelope.recordJson!=='string'||Buffer.byteLength(envelope.recordJson)>4096)fail('name_certificate_snapshot_invalid');
   }
   const hash=nameCertificateHash(certificate),expired=now()>=policy.validUntil;
   if(mode==='current')active();
   let known=null;
   if(requireKnown||expired){
    known=store.known(name,{hash});
    if(!known)fail('name_certificate_known_required');
   }
   if(expired){
    if(mode!=='historical'||!known)fail('name_policy_inactive');
    return {...known,hash};
   }
   active();
   const verification=verifyNameCertificate(certificate,policy,{name,mode,now:now(),floor:store.floor(name)});
   if(mode==='current'&&!verification.currentWindow)fail('name_certificate_not_current');
   return {certificate:copy(certificate),verification,hash};
  }
  function snapshotFrom(accepted){
   const name=accepted?.verification?.binding?.name;
   const mode=accepted?.verification?.historical?'historical':'current';
   const checked=checkCertificate(accepted?.certificate,{name,mode});
   return snapshotMetadata(checked.certificate,checked.verification);
  }
  function verifySnapshot(snapshot,{name=snapshot?.name,mode='current',requireKnown=false}={}){
   if(snapshot?.schema!=='arns-mesh-name-snapshot/v1'||snapshot.name!==name||snapshot.provenance?.kind!=='quorum-witness')fail('name_certificate_snapshot_invalid');
   const checked=checkCertificate(snapshot.provenance.certificate,{name,mode,requireKnown});
   const expected=snapshotMetadata(checked.certificate,checked.verification);
   for(const key of ['name','txId','antId','antProgramId','observedAt','expiresAt','slot','ttlSeconds'])if(snapshot[key]!==expected[key])fail('name_certificate_snapshot_metadata_mismatch');
   for(const key of ['policyId','round','threshold','maxFaults','certificateHash','domains','currentStateVerified','trustModel'])if(!same(snapshot.provenance[key],expected.provenance[key]))fail('name_certificate_snapshot_provenance_mismatch');
   // Historical/current presentation flags are recomputed from the verified
   // proof and clock; they can never renew its immutable observed/expiry dates.
   return {snapshot:expected,certificate:checked.certificate,verification:checked.verification,hash:checked.hash};
  }
  async function collectFor(name,{mode='current',signal,floor=store.floor(name),txId=null}={}){
   checkedName(name);checkedMode(mode);checkedTx(txId);signal?.throwIfAborted();active();
   const collector=new NameCertificateCollector({policy:assertCurrent,name,mode,now,maxCertificates:8});
   if(txId!==null){
    const certificates=collector.certificates.bind(collector);
    collector.best=options=>certificates({...options,limit:collector.maxCertificates}).find(value=>value.verification.binding.txId===txId)||null;
   }
   const timeoutMs=Number(env.ARNS_NAME_CERTIFICATE_TIMEOUT||12000);
   const value=await collect({name,policy:assertCurrent(),collector,mode,signal,floor,
    peers:loadDirectPeers(env.ARNS_IP_PEERS),bootstrapFile:env.HYPER_BOOTSTRAP,peerKeys:configuredPeerKeys(env),
    dhtEnabled:env.ARNS_MESH_DIRECT_ONLY!=='1',timeoutMs,now,
   });
   signal?.throwIfAborted();active();
   if(value===null)return null;
   // The collector is not the authority for its own returned verification.
   const verification=verifyNameCertificate(value?.certificate,policy,{name,mode,now:now(),floor});
   if(mode==='current'&&!verification.currentWindow)fail('name_certificate_not_current');
   if(txId!==null&&verification.binding.txId!==txId)fail('name_certificate_target_mismatch');
   return {certificate:copy(value.certificate),verification};
  }
  async function authorizeName(name,{mode='current',signal,txId=null,snapshot=null}={}){
   checkedName(name);checkedMode(mode);checkedTx(txId);signal?.throwIfAborted();assertCurrent();
   if(mode==='historical'){
    if(snapshot){
     const checked=verifySnapshot(snapshot,{name,mode});
     if(txId!==null&&checked.verification.binding.txId!==txId)fail('name_certificate_target_mismatch');
     const known=store.known(name,{hash:checked.hash});
     const accepted=known||await store.accept(checked.certificate,{name,mode});
     signal?.throwIfAborted();return snapshotFrom({...accepted,verification:{...accepted.verification,historical:true}});
    }
    const known=store.known(name,txId?{txId}:{});
    if(known){signal?.throwIfAborted();return snapshotFrom(known);}
   }
   const collected=await collectFor(name,{mode,signal,txId});
   if(!collected)unavailable();
   const accepted=await store.accept(collected.certificate,{name,mode});
   signal?.throwIfAborted();return snapshotFrom(accepted);
  }
  async function getService(){
   assertCurrent();active();
   if(servicePromise)return servicePromise;
   servicePromise=(async()=>{
    let signer=null;
    const [keyFile,stateDirectory,stateEpoch,signerRpcSeeds]=initialSignerSettings;
    if(keyFile||stateDirectory||stateEpoch||signerRpcSeeds){
     if(!keyFile||!stateDirectory||!/^[a-f0-9]{32}$/.test(stateEpoch))fail('name_signer_configuration_incomplete');
     const rpcConfiguration=readNameSignerRpcConfiguration(env);
     const stat=fs.statSync(keyFile);if(!stat.isFile()||stat.size>4096)fail('name_signer_key_invalid');
     const privateKeyPem=fs.readFileSync(keyFile,'utf8'),publicKeyPem=crypto.createPublicKey(privateKeyPem).export({type:'spki',format:'pem'});
     signerRoot=new ShardedNameSignerState({directory:stateDirectory,policyId,keyId:witnessKeyId(publicKeyPem),stateEpoch,now});
     try{
      const {buildCertifiedArNSObservation}=await import('./certified-name-observer.mjs');
      assertCurrent();active();
      const issuer=new NameCertificateSigner({policy:assertCurrent,privateKeyPem,driverForName:name=>signerRoot.forName(name),now,
       observe:(name,options)=>buildCertifiedArNSObservation(name,{...options,chainId:policy.chainId,genesisHash:policy.chainId.slice(7),registryProgramId:policy.registryProgramId,seedFile:rpcConfiguration.seedFile,rpcSeeds:rpcConfiguration.rpcSeeds,now}),
      });
      signer={async issue(name,options){assertCurrent();active();signerRoot.checkpointClock();return issuer.issue(name,options);}};
     }catch(error){try{signerRoot.close();}catch{}signerRoot=null;throw error;}
    }
    return new NameCertificateService({policy,signer,store,now,collect:({name,...options})=>collectFor(name,options)});
   })();
   return servicePromise;
  }
  const service={
   async ready(){assertCurrent();await getService();assertCurrent();active();return {ready:true,policyId};},
   async reply(request,options){assertCurrent();const result=await (await getService()).reply(request,options);assertCurrent();active();return result;},
   async refresh(name,options){assertCurrent();const result=await (await getService()).refresh(name,options);assertCurrent();active();return result;},
  };
  return {
   policy:copy(policy),policyId,directory,store,assertCurrent,verifySnapshot,snapshotFrom,authorizeName,service,
   retainSnapshot(snapshot,{owner}={}){
    const checked=verifySnapshot(snapshot,{name:snapshot?.name,mode:'historical',requireKnown:true});
    return store.retain(snapshot.name,{hash:checked.hash,owner});
   },
   releaseSnapshot({name,owner}={}){return store.release(checkedName(name),{owner});},
   close(){if(signerRoot){signerRoot.close();signerRoot=null;}},
  };
 }
 const getContext=()=>{
   const policy=readPinned();if(!policy)return null;
   if(!context)context=makeContext(policy);
   context.assertCurrent();return context;
 };
 return {
  getContext,getProtectedNameContext:getContext,
  close(){if(context)context.close();closed=true;},
 };
}

const defaultRuntime=createNameSecurityRuntime();
export function getProtectedNameContext(){return defaultRuntime.getContext();}
export function closeNameSecurityRuntime(){defaultRuntime.close();}

