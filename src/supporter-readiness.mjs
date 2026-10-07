import {acceptedReplicaBindings} from './supporter-replication.mjs';

export function supporterReadiness({snapshots,relay,pinners=[],contentStore,trustedPeerIds=[],ownPeerId,names,index=null,discovery=null,replication=null}){
 const {bindings,conflicts}=acceptedReplicaBindings(relay),accepted=new Map(bindings.map(row=>[row.name,row]));
 const localNames=snapshots?.names()||[];
 if(trustedPeerIds.includes(ownPeerId))for(const name of localNames){
  const prepared=pinners.map(pinner=>{try{return pinner.readySnapshot(name,{trustedPeers:trustedPeerIds});}catch{return null;}}).find(row=>row?.provenance?.kind==='local-rpc');
  const row=prepared||snapshots.exportLocal(name);if(row&&!accepted.has(name))accepted.set(name,row);
 }
 const requested=names?.length?[...new Set(names)]:[...new Set([...localNames,...accepted.keys()])];
 let acceptedNames=0,rootFiles=0,completeSites=0,retainedPreparedVersions=0;const missingNames=[],missingRoots=[],incompleteSites=[];
 for(const name of requested){
  const row=accepted.get(name);
  if(!row){missingNames.push(name);continue;}acceptedNames++;
  if(contentStore.has(row.txId))rootFiles++;else missingRoots.push(name);
  if(row.prepared===true)retainedPreparedVersions++;
  if(pinners.some(pinner=>{const saved=pinner.rows[name];return saved?.rootDataId===row.txId&&saved.snapshot?.antId===row.antId&&pinner.isReady(saved);}))completeSites++;else incompleteSites.push(name);
 }
 const locallyPrepared=requested.length>0&&acceptedNames===requested.length&&completeSites===requested.length;
 const blockers=[];
 if(!requested.length)blockers.push('no_names_available');
 if(missingNames.length)blockers.push('accepted_name_bindings_missing');
 if(missingRoots.length)blockers.push('verified_root_files_missing');
 if(incompleteSites.length)blockers.push('complete_file_sets_missing');
 blockers.push('independent_reader_check_required');
 return {
  schema:'arns-mesh-supporter-readiness/v1',scope:names?.length?'requested-names':'known-names',mode:'retained-offline-content',ready:false,locallyPrepared,liveAccess:{status:'not-tested-by-this-local-report',independentRpcRequired:true},
  names:{known:localNames.length,requested:requested.length,accepted:acceptedNames,missing:missingNames.length,missingSample:missingNames.slice(0,20)},
  files:{rootsStored:rootFiles,completePreparedSites:completeSites,incomplete:incompleteSites.length,missingRootSample:missingRoots.slice(0,20),incompleteSample:incompleteSites.slice(0,20),retainedPreparedVersions},
  trust:{acceptedPublishers:trustedPeerIds,ownPublisherAccepted:trustedPeerIds.includes(ownPeerId),relayedOriginalSignatures:relay.status().acceptedRecords,conflicts:conflicts.length,newAddressesGrantNameAuthority:false},
  index:{...index,available:Boolean(index?.enabled&&index.bands>0&&!index.lastError),replacesContentFiles:false},
  externalReachability:{status:'independent-reader-check-required',advertisedAddress:discovery?.address||null,acceptedByOtherPeers:discovery?.acceptedBy||0},
  replication:replication?.status?.()||replication,blockers,generalCoverage:false,
 };
}

// This check uses only the explicitly selected supporter. Cached-only content
// requests prevent that supporter from satisfying the check by fetching from A.
export async function probeSupporter({peer,invitation,trustedPeers,names,exclude=[],maxFiles=8192,maxBytes=256*1024*1024,signal}){
 const [{queryDirectPeer,parsePeerAddresses},{peerAddress,normalizePeerHost},{createSwarmMeshClient},{verifyNetwork,verifyNetworkRecovery,connectionProfile,withNetworkContinuity},{manifestTargetIds},{discoverArweaveReferences},{validArName},{withByteBudget},{trustedWitnesses}]=await Promise.all([
  import('./direct-peer.mjs'),import('./peer-directory.mjs'),import('./swarm-client.mjs'),import('./network-invitation.mjs'),import('./manifest-path.mjs'),import('./arweave-references.mjs'),import('./swarm-common.mjs'),import('./byte-budget.mjs'),import('../apps/helper/network-profile.mjs'),
 ]);
 if(!Array.isArray(names)||!names.length||names.length>32||names.some(name=>!validArName(name)))throw new Error('readiness_requires_1_to_32_valid_names');
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>32768||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1024*1024*1024)throw new Error('invalid_readiness_budget');
 const canonical=p=>peerAddress({...p,host:normalizePeerHost(p.host)});
 const address=canonical(parsePeerAddresses([peerAddress(peer)])[0]);
 if(!Array.isArray(exclude)||exclude.length>32)throw new Error('invalid_readiness_exclusions');
 exclude=exclude.map(value=>canonical(parsePeerAddresses([value])[0]));
 if(exclude.includes(address))throw new Error('readiness_peer_is_excluded');
 const controller=new AbortController(),bounded=signal?AbortSignal.any([signal,controller.signal,AbortSignal.timeout(300000)]):AbortSignal.any([controller.signal,AbortSignal.timeout(300000)]);
 const result={schema:'arns-mesh-supporter-check/v1',scope:'requested-names',peer:address,excluded:exclude,ready:false,generalCoverage:false,externalReachability:{status:'unverified',vantage:'this-checking-machine'},names:[],cacheOnly:true,rpcUsed:false,arweaveUsed:false,discoveryUsed:false};
 let client;
 try{
  const checked=await withByteBudget(maxBytes,controller,async()=>{
   // Caller-pinned identities and a signed embedded durable definition are
   // anchors already possessed by this checker. A remote expired list is not.
   trustedPeers=trustedWitnesses(trustedPeers||[]);
   if(invitation){
    invitation=withNetworkContinuity(invitation);
    let anchors=trustedPeers,anchorSource=anchors.length?'caller-pinned':null;
    if(invitation.version===2){
     const definition=verifyNetwork(invitation.definition,invitation);
     anchors=trustedWitnesses(definition.profile.trustedPeers||[]);anchorSource='durable-definition';
    }
    try{
     const network=await queryDirectPeer(peer,{op:'network',recovery:true},{signal:bounded});
     if(!network?.ok||!network.network)throw new Error('signed_network_list_unavailable');
     // Match a fresh reader: expired remote publications cannot introduce or
     // reinstate publishers, even if their historical signature is valid.
     const payload=verifyNetwork(network.network,invitation);
     const current=connectionProfile(payload,verifyNetworkRecovery(network.recovery,network.network,invitation)).trustedPeers||[];
     trustedPeers=trustedWitnesses(current);
     result.network={signatureVerified:true,expired:false,trustSource:'live-network-list'};
    }catch(error){
     bounded.throwIfAborted();trustedPeers=anchors;
     result.network={signatureVerified:Boolean(anchorSource==='durable-definition'),remotePublicationRejected:true,trustSource:anchorSource,error:String(error.message).slice(0,240)};
    }
   }
   if(!trustedPeers.length)throw new Error('accepted_name_publishers_required');
   client=createSwarmMeshClient({directPeers:[peer],dhtEnabled:false,cacheOnly:true,directory:null});
   for(const name of [...new Set(names)]){
    const checkedName={name,ready:false,files:0,bytes:0};
    try{
     let binding;try{binding=await client.snapshot(name,{trustedPeers,prepared:true,signal:bounded});checkedName.preparedBinding=true;}catch(error){bounded.throwIfAborted();binding=await client.snapshot(name,{trustedPeers,signal:bounded});checkedName.preparedBinding=false;}
     checkedName.publisher=binding.providers[0].witnessPeerId;checkedName.target=binding.record.txId;checkedName.observedAt=binding.record.observedAt;
     const ids=[binding.record.txId],seen=new Set(ids);
     for(let at=0;at<ids.length;at++){
      const item=await client.content(ids[at],{signal:bounded,cacheOnly:true});checkedName.files++;checkedName.bytes+=(item.storedBytes||item.rawItem).length;
      const type=item.tags?.find(tag=>tag.name.toLowerCase()==='content-type')?.value||'';
      let children=[];
      if(type.toLowerCase().includes('application/x.arweave-manifest')){
       const manifest=JSON.parse(item.payload.toString());if(manifest.manifest!=='arweave/paths'||!manifest.paths)throw new Error('invalid_manifest');
       children=manifestTargetIds(manifest);
      }
      const references=discoverArweaveReferences(item);if(references.truncated)throw new Error('static_arweave_reference_scan_limit');children.push(...references.ids);
      for(const id of children)if(!seen.has(id)){if(seen.size>=maxFiles)throw new Error('readiness_file_limit');seen.add(id);ids.push(id);}
     }
     checkedName.ready=true;
    }catch(error){checkedName.error=String(error.message).slice(0,240);}
    result.names.push(checkedName);bounded.throwIfAborted();
   }
  });
  result.responseBytes=checked.bytes;result.ready=result.names.length>0&&result.names.every(row=>row.ready);
  result.externalReachability.status=result.ready?'passed-from-checking-machine':'incomplete';
 }catch(error){result.error=String(error.message).slice(0,240);result.responseBytes=error.receivedBytes||0;}
 finally{await client?.stop();}
 return result;
}
