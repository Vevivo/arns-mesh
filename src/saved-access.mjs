import {resolveSavedName} from './name-snapshots.mjs';
import {resolveManifestPath} from './manifest-path.mjs';
import {networkAuditSnapshot} from './network-audit.mjs';

export async function resolveSavedContent({name,requestedPath,snapshotStore,client,trustedPeers=[],fetchById,onProgress=()=>{},signal}){
 onProgress({phase:'resolving',stage:'name',status:'active',message:'Looking for a saved name record · No RPC…'});
 const snapshot=await resolveSavedName(name,{store:snapshotStore,client,trustedPeers,signal});
 const nameResolution={nameResolved:true,name,rootDataId:snapshot.txId,observedAt:snapshot.observedAt,source:snapshot.provenance.kind,currentStateVerified:false,rpcUsed:false,accountInclusionProof:false};
 onProgress({phase:'content',stage:'name',status:'done',nameResolution,message:'Opening saved version · '+snapshot.observedAt});
 try{
  let dataId=snapshot.txId,current=await fetchById(dataId),manifestUsed=false,manifestPath=null;
  const type=x=>x.direct.tags?.find(t=>t.name.toLowerCase()==='content-type')?.value||'application/octet-stream';
  if(type(current).toLowerCase().includes('application/x.arweave-manifest')){
   const manifest=JSON.parse(current.direct.payload.toString('utf8'));
   const entry=resolveManifestPath(manifest,requestedPath);
   manifestPath=entry.path;
   dataId=entry.id;current=await fetchById(dataId);manifestUsed=true;
  }
  return {name,requestedPath,record:{name,txId:snapshot.txId,antId:snapshot.antId},dataId,rootTxId:current.direct.rootTxId,provider:current.direct.peer,contentType:type(current),body:current.direct.payload,sha256:current.direct.payloadSha256,storageKind:current.storageKind,manifestUsed,manifestPath,dataItemSignatureVerified:current.storageKind==='ans104',l1SignatureVerified:Boolean(current.direct.l1SignatureVerified),l1DataRootVerified:Boolean(current.direct.l1DataRootVerified),shareBundle:null,
   recovery:{...nameResolution,witnessPeerId:snapshot.provenance.witnessPeerId||null},
   verification:{level:'saved-observation',nameStateChecked:false,currentStateVerified:false,rpcSources:0,rpcUsed:false,rpcTrustRequired:true,fullyTrustless:false,accountInclusionProof:false,reasons:['Observed at: '+snapshot.observedAt,'Current name state was not checked. This mapping was accepted in the past.',snapshot.provenance.kind==='local-rpc'?'Based on a previous local RPC observation.':'Trusts the name observation of your selected peer operator.','The file identity and signature are checked separately.']},networkPolicy:'literal-ip-raw-only',networkAudit:networkAuditSnapshot()};
 }catch(error){error.diagnostics={...error.diagnostics,nameResolution};throw error;}
}
