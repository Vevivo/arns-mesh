import {resolveSavedContent} from './saved-access.mjs';
import {isSourceUnavailable} from './resilient-access.mjs';
import {nameCertificateHash} from './name-certificate-state.mjs';

const unavailable=error=>['NAME_CERTIFICATE_UNAVAILABLE','name_policy_inactive'].includes(error?.code)||isSourceUnavailable(error)||String(error?.message).startsWith('content_location_unavailable');
const expired=error=>error?.code==='name_certificate_expired';
const hasCertificate=snapshot=>Boolean(snapshot?.provenance?.certificate);

// The content pipeline still verifies the original Arweave bytes before decoding.
// This boundary authorizes the name separately, including fixed subresources.
export async function resolveCertifiedNameContent({name,requestedPath,context,accessPolicy='auto',fixedSnapshot=null,snapshotStore=null,fetchById,onProgress=()=>{},signal,render=resolveSavedContent}={}){
 if(!context||!['auto','live','saved'].includes(accessPolicy))throw new Error('certified_name_options_invalid');
 const check=()=>{signal?.throwIfAborted();context.assertCurrent();};
 check();
 const open=async(snapshot,mode)=>{
  check();let checked=context.verifySnapshot(snapshot,{name,mode}),historical=mode==='historical';
  snapshot=checked.snapshot;const items=new Map(),locations=new Map();
  const fetch=async dataId=>{
   check();context.verifySnapshot(snapshot,{name,mode:'historical'});
   const item=await fetchById(dataId);check();context.verifySnapshot(snapshot,{name,mode:'historical'});
   const bytes=item.direct.storedBytes||item.direct.rawItem;
   if(bytes)items.set(dataId,{dataId,storedBytes:bytes,storageKind:item.storageKind});
   if(item.loc?.record)locations.set(dataId,item.loc.record);
   return item;
  };
  onProgress({phase:'resolving',stage:'name',status:'done',message:historical?'Opening certified retained version · '+snapshot.observedAt:'Name confirmed by independent configured witnesses · Locating content…',nameResolution:{nameResolved:true,name,rootDataId:snapshot.txId,observedAt:snapshot.observedAt,currentStateVerified:false,source:'quorum-witness'}});
  const result=await render({name,requestedPath,snapshot,fetchById:fetch,signal,onProgress:event=>{if(event.stage!=='name')onProgress(event);}});
  check();
  try{checked=context.verifySnapshot(snapshot,{name,mode});}
  catch(error){
   // An expired lease is never silently relabelled as live after a long fetch.
   if(!historical&&accessPolicy==='auto'&&expired(error)){checked=context.verifySnapshot(snapshot,{name,mode:'historical'});historical=true;}
   else throw error;
  }
  const verification=checked.verification;
  const record={name,txId:snapshot.txId,antId:snapshot.antId,antProgramId:snapshot.antProgramId,ttlSeconds:snapshot.ttlSeconds,witnessedAt:snapshot.observedAt,expiresAt:snapshot.expiresAt};
  const reasons=[`${verification.threshold} independent configured witness domains signed this binding.`,`Observed at: ${snapshot.observedAt}`,'Witness observations are not a Solana consensus or account inclusion proof.','Arweave file identity and signature are verified separately.'];
  if(historical)reasons.push('Retained version. The current name state is unavailable or was not requested.');
  const assurance={level:historical?'certified-retained-observation':'certified-witness-observation',nameStateChecked:!historical,currentStateVerified:false,rpcUsed:false,rpcSources:0,rpcTrustRequired:true,fullyTrustless:false,accountInclusionProof:false,trustModel:'configured-independent-witnesses',policyId:context.policyId,witnessDomains:verification.domains,observedAt:snapshot.observedAt,expiresAt:snapshot.expiresAt,reasons};
  const recovery=historical?{nameResolved:true,name,rootDataId:snapshot.txId,observedAt:snapshot.observedAt,source:'quorum-witness',currentStateVerified:false,rpcUsed:false,accountInclusionProof:false}:null;
  const shareBundle=historical?null:{schema:'arns-mesh-verified-share/v1',verifiedAt:new Date().toISOString(),name,record,nameCertificate:checked.certificate,accessSnapshot:snapshot,location:locations.get(snapshot.txId)||null,locations:[...locations.values()],items:[...items.values()],verification:assurance,content:{dataId:result.dataId,rootDataId:snapshot.txId,rootTxId:result.rootTxId,sha256:result.sha256,manifestUsed:result.manifestUsed,signatureVerified:Boolean(result.dataItemSignatureVerified||result.l1SignatureVerified)}};
  return {...result,record,accessSnapshot:snapshot,verification:assurance,recovery,shareBundle};
 };
 if(fixedSnapshot)return open(await context.authorizeName(name,{snapshot:fixedSnapshot,mode:'historical',signal}),'historical');
 if(accessPolicy==='saved'){
  const pinned=snapshotStore?.get(name);
  if(pinned){if(!hasCertificate(pinned))throw new Error('name_certificate_required');return open(await context.authorizeName(name,{snapshot:pinned,mode:'historical',signal}),'historical');}
  return open(await context.authorizeName(name,{mode:'historical',signal}),'historical');
 }
 let liveFailure;
 try{return await open(await context.authorizeName(name,{mode:'current',signal}),'current');}
 catch(error){check();if(accessPolicy!=='auto'||!unavailable(error))throw error;liveFailure=error;}
 // Retained alternatives must carry original quorum evidence. A legacy single
 // publisher snapshot is merely a name hint and cannot authorize a target.
 const candidates=[],pinned=snapshotStore?.get(name);
 if(hasCertificate(pinned))candidates.push(pinned);
 try{candidates.push(await context.authorizeName(name,{mode:'historical',signal}));}
 catch(error){check();if(!unavailable(error))throw error;}
 for(const certificate of context.store.export(name)){
  try{const accepted=context.store.known(name,{hash:nameCertificateHash(certificate)});
   if(accepted)candidates.push(context.snapshotFrom(accepted));
  }catch(error){if(!expired(error)&&!['name_certificate_rollback','name_certificate_not_known','name_certificate_quorum_rejected'].includes(error.code))throw error;}
 }
 const seen=new Set();
 for(const snapshot of candidates){const key=JSON.stringify([snapshot.txId,snapshot.observedAt]);if(seen.has(key))continue;seen.add(key);
  try{const result=await open(snapshot,'historical');result.recovery={...result.recovery,automatic:true,reason:'certified-source-unavailable'};return result;}
  catch(error){check();if(!unavailable(error))throw error;}
 }
 throw liveFailure;
}
