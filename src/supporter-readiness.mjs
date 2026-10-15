import {decodeVerifiedPayload} from './content-decoding.mjs';
import {acceptedReplicaBindings} from './supporter-replication.mjs';
import {getProtectedNameContext} from './name-security-runtime.mjs';
import {namePolicyId} from './name-certificates.mjs';
import {NameCertificateCollector} from './name-certificate-collector.mjs';

export function supporterReadiness({snapshots,relay,pinners=[],contentStore,trustedPeerIds=[],ownPeerId,names,index=null,discovery=null,replication=null,getNameContext=getProtectedNameContext}){
 const context=getNameContext(),accepted=new Map();let conflicts=[];
 const localNames=[...new Set([...(snapshots?.names()||[]),...pinners.flatMap(pinner=>Object.keys(pinner.rows||{})),...(context?.store.names?.()||[])])];
 if(context){
  for(const name of names?.length?[...new Set(names)]:localNames){
   // Local readiness never promotes an unsigned row or one publisher's vote.
   const prepared=pinners.map(pinner=>pinner.readySnapshot(name,{trustedPeers:trustedPeerIds})).find(Boolean);
   const known=prepared?null:context.store.known(name);
   const row=prepared||(known?context.snapshotFrom(known):null);
   if(row){context.verifySnapshot(row,{name,mode:'historical',requireKnown:false});accepted.set(name,{...row,...(prepared?{prepared:true}:{})});}
  }
  context.assertCurrent();
 }else{
  const legacy=acceptedReplicaBindings(relay);conflicts=legacy.conflicts;
  for(const row of legacy.bindings)accepted.set(row.name,row);
  if(trustedPeerIds.includes(ownPeerId))for(const name of localNames){
   const prepared=pinners.map(pinner=>{try{return pinner.readySnapshot(name,{trustedPeers:trustedPeerIds});}catch{return null;}}).find(row=>row?.provenance?.kind==='local-rpc');
   const row=prepared||snapshots.exportLocal(name);if(row&&!accepted.has(name))accepted.set(name,row);
  }
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
  schema:'arns-mesh-supporter-readiness/v1',scope:names?.length?'requested-names':'known-names',mode:'retained-offline-content',ready:false,locallyPrepared,liveAccess:{status:'not-tested-by-this-local-report',...(context?{independentWitnessesRequired:true}:{independentRpcRequired:true})},
  names:{known:localNames.length,requested:requested.length,accepted:acceptedNames,missing:missingNames.length,missingSample:missingNames.slice(0,20)},
  files:{rootsStored:rootFiles,completePreparedSites:completeSites,incomplete:incompleteSites.length,missingRootSample:missingRoots.slice(0,20),incompleteSample:incompleteSites.slice(0,20),retainedPreparedVersions},
  trust:{acceptedPublishers:context?[]:trustedPeerIds,ownPublisherAccepted:!context&&trustedPeerIds.includes(ownPeerId),relayedOriginalSignatures:context?null:relay.status().acceptedRecords,conflicts:conflicts.length,newAddressesGrantNameAuthority:false,...(context?{namePolicyId:context.policyId,threshold:context.policy.threshold,trustModel:'configured-independent-witnesses'}:{})},
  index:{...index,available:Boolean(index?.enabled&&index.bands>0&&!index.lastError),replacesContentFiles:false},
  externalReachability:{status:'independent-reader-check-required',advertisedAddress:discovery?.address||null,acceptedByOtherPeers:discovery?.acceptedBy||0},
  replication:replication?.status?.()||replication,blockers,generalCoverage:false,
 };
}

// This check uses only the explicitly selected supporter. Cached-only content
// requests prevent that supporter from satisfying the check by fetching from A.
export async function probeSupporter({peer,invitation,trustedPeers,names,exclude=[],maxFiles=8192,maxBytes=256*1024*1024,signal,getNameContext=getProtectedNameContext,query,createClient}){
 const [{queryDirectPeer,parsePeerAddresses},{peerAddress,normalizePeerHost},{createSwarmMeshClient},{verifyNetwork,verifyNetworkRecovery,connectionProfile,withNetworkContinuity},{manifestTargetIds},{discoverArweaveReferences},{validArName},{withByteBudget},{trustedWitnesses}]=await Promise.all([
  import('./direct-peer.mjs'),import('./peer-directory.mjs'),import('./swarm-client.mjs'),import('./network-invitation.mjs'),import('./manifest-path.mjs'),import('./arweave-references.mjs'),import('./swarm-common.mjs'),import('./byte-budget.mjs'),import('../apps/helper/network-profile.mjs'),
 ]);
 if(!Array.isArray(names)||!names.length||names.length>32||names.some(name=>!validArName(name)))throw new Error('readiness_requires_1_to_32_valid_names');
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>32768||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1024*1024*1024)throw new Error('invalid_readiness_budget');
 query??=queryDirectPeer;createClient??=createSwarmMeshClient;
 const context=getNameContext(),initialPolicyId=context?.policyId||null;let namePolicy=context?.policy||null;
 const checkContext=()=>{const current=getNameContext();if((current?.policyId||null)!==initialPolicyId)throw new Error('name_security_context_changed');context?.assertCurrent();};
 const acceptPolicy=profile=>{const incoming=profile.nameWitnessPolicy||null;if(namePolicy&&(!incoming||namePolicyId(namePolicy)!==namePolicyId(incoming)))throw new Error('name_policy_migration_required');if(incoming)namePolicy=incoming;};
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
     const definition=verifyNetwork(invitation.definition,invitation);acceptPolicy(definition.profile);
     anchors=trustedWitnesses(definition.profile.trustedPeers||[]);anchorSource='durable-definition';
    }
    try{
     const network=await query(peer,{op:'network',recovery:true},{signal:bounded});
     if(!network?.ok||!network.network)throw new Error('signed_network_list_unavailable');
     // Match a fresh reader: expired remote publications cannot introduce or
     // reinstate publishers, even if their historical signature is valid.
     const payload=verifyNetwork(network.network,invitation);
     const currentProfile=connectionProfile(payload,verifyNetworkRecovery(network.recovery,network.network,invitation));acceptPolicy(currentProfile);
     trustedPeers=trustedWitnesses(currentProfile.trustedPeers||[]);
     result.network={signatureVerified:true,expired:false,trustSource:'live-network-list'};
    }catch(error){
     bounded.throwIfAborted();trustedPeers=anchors;
     result.network={signatureVerified:Boolean(anchorSource==='durable-definition'),remotePublicationRejected:true,trustSource:anchorSource,error:String(error.message).slice(0,240)};
    }
   }
   if(!namePolicy&&!trustedPeers.length)throw new Error('accepted_name_publishers_required');
   checkContext();if(namePolicy)result.nameBinding={policyId:namePolicyId(namePolicy),threshold:namePolicy.threshold,trustModel:'configured-independent-witnesses'};
   // An explicit inert directory prevents the ordinary client from merging
   // globally learned supporters into this single-supporter acceptance check.
   const isolatedDirectory={addresses:()=>[],rank:peers=>peers,success(){},failure(){}};
   client=createClient({directPeers:[peer],dhtEnabled:false,cacheOnly:true,directory:isolatedDirectory});
   for(const name of [...new Set(names)]){
    const checkedName={name,ready:false,files:0,bytes:0};
    try{
     let binding;
     if(namePolicy){
      // Ask only the selected supporter, with no DHT or fallback supporter.
      // It may relay a complete certificate; its own publisher key is no vote.
      const policyId=namePolicyId(namePolicy),reply=await query(peer,{op:'name-certificates',name,policyId,historical:true},{signal:bounded});
      checkContext();bounded.throwIfAborted();
      if(!reply?.ok||typeof reply.recordJson!=='string'||Buffer.byteLength(reply.recordJson)>512*1024)throw new Error('name_certificate_reply_invalid');
      const record=JSON.parse(reply.recordJson);
      if(record.schema!=='arns-mesh-name-certificate-reply/v1'||record.name!==name||record.policyId!==policyId||!Array.isArray(record.observations)||record.observations.length>64||!Array.isArray(record.certificates)||record.certificates.length>8)throw new Error('name_certificate_reply_invalid');
      const collector=new NameCertificateCollector({policy:namePolicy,name,mode:'historical'});
      collector.add(record.observations,{mode:'historical'});let votes=record.observations.length;
      for(const certificate of record.certificates){votes+=certificate.observations?.length||0;if(votes>128)throw new Error('name_certificate_reply_limit');collector.addCertificate(certificate,{mode:'historical'});}
      const accepted=collector.best({mode:'historical',floor:context?.store.floor(name)||null});
      if(!accepted)throw new Error('name_certificate_quorum_unmet');
      let snapshot=context?context.snapshotFrom(accepted):{...accepted.verification.binding,observedAt:new Date(accepted.verification.observedAt).toISOString()};
      if(context){snapshot=await context.authorizeName(name,{snapshot,mode:'historical',signal:bounded});checkContext();}
      binding={record:snapshot};checkedName.namePolicyId=policyId;checkedName.domains=accepted.verification.domains;checkedName.historical=true;checkedName.preparedBinding=false;
     }else{
      try{binding=await client.snapshot(name,{trustedPeers,prepared:true,signal:bounded});checkedName.preparedBinding=true;}catch(error){bounded.throwIfAborted();binding=await client.snapshot(name,{trustedPeers,signal:bounded});checkedName.preparedBinding=false;}
      checkedName.publisher=binding.providers[0].witnessPeerId;
     }
     checkContext();checkedName.target=binding.record.txId;checkedName.observedAt=binding.record.observedAt;
     const ids=[binding.record.txId],seen=new Set(ids);
     for(let at=0;at<ids.length;at++){
      checkContext();const item=await client.content(ids[at],{signal:bounded,cacheOnly:true});checkContext();checkedName.files++;checkedName.bytes+=(item.storedBytes||item.rawItem).length;
      const view=await decodeVerifiedPayload(item,{signal:bounded});
      const type=item.tags?.find(tag=>tag.name.toLowerCase()==='content-type')?.value||'';
      let children=[];
      if(type.toLowerCase().includes('application/x.arweave-manifest')){
       const manifest=JSON.parse(view.body.toString());if(manifest.manifest!=='arweave/paths'||!manifest.paths)throw new Error('invalid_manifest');
       children=manifestTargetIds(manifest);
      }
      const references=discoverArweaveReferences({...item,payload:view.body});if(references.truncated)throw new Error('static_arweave_reference_scan_limit');children.push(...references.ids);
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
