import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const coreRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// One process working directory: never change/restore it around concurrent requests.
export async function resolveArUrl(raw,{quorum=2,onProgress=()=>{},contentStore=null,snapshotStore=null,accessPolicy='live',trustedPeers=[],signal}={}){
  const {resolveAndFetchSwarm}=await import('../../src/swarm-access.mjs');
  const r=await resolveAndFetchSwarm(raw,{quorum,onProgress,contentStore,snapshotStore,accessPolicy,trustedPeers,signal});
  return {body:r.body,contentType:r.contentType||'application/octet-stream',peerPayload:r.shareBundle,
    meta:{input:raw,name:r.name,dataId:r.dataId,rootTxId:r.rootTxId,
      nameObservedAt:r.record?.witnessedAt||r.recovery?.observedAt||null,
      nameTargetId:r.record?.txId||r.recovery?.rootDataId||null,
      verification:r.verification,snapshotSaveError:r.snapshotSaveError||null,recovery:r.recovery||null,provider:r.provider?`${r.provider.host}:${r.provider.port}`:null,
      contentSignatureVerified:r.dataItemSignatureVerified||r.l1SignatureVerified,
      dataItemSignatureVerified:r.dataItemSignatureVerified,l1SignatureVerified:r.l1SignatureVerified,
      l1DataRootVerified:r.l1DataRootVerified,sha256:r.sha256,networkPolicy:r.networkPolicy,networkAudit:r.networkAudit,
      storageKind:r.storageKind,witnessQuorum:r.witness?{required:r.witness.quorum,matching:r.witness.providers?.length||0}:null}}
}
