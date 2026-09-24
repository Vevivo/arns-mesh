import {fetchMeshContent} from './content-fetcher.mjs';
import {resolveManifestPath} from './manifest-path.mjs';
import {resolveSavedContent} from './saved-access.mjs';
import fs from 'node:fs';
import { createSwarmMeshClient } from './swarm-client.mjs';
import { buildArNSStateEvidence } from './solana-evidence.mjs';
import { assessArNSVerification } from './verification-policy.mjs';
import { loadVerifiedAccountProof } from './proof-loader.mjs';
import { verifyPortableChainProof } from './portable-proof.mjs';
import { verifySavedAntUpdateProof } from './ant-update-proof.mjs';
import { detectConsensusEra } from './consensus-era.mjs';
import { loadAndVerifyJournal, verifyJournal } from './transition-journal.mjs';
import {withNetworkAudit,networkAuditSnapshot} from './network-audit.mjs';
import {shareQuery} from './query-work.mjs';

export function parseInput(raw){
  const value=String(raw||'').trim();
  const u=new URL(value.includes('://')?value:'ar://'+value);
  if(u.protocol!=='ar:'||u.username||u.password||u.port||!/^([a-z0-9_-]{1,255})$/i.test(u.hostname))throw new Error('invalid_ar_address');
  let requestedPath;try{requestedPath=decodeURIComponent(u.pathname.replace(/^\//,''));}catch{throw new Error('invalid_path_encoding');}
  if(requestedPath.split('/').some(x=>x==='..'||x==='.')||requestedPath.includes('\\')||requestedPath.includes('\0'))throw new Error('invalid_ar_path');
  return {name:u.hostname.toLowerCase(),requestedPath};
}
function tagValue(tags,name){
  return (tags||[]).find(t=>String(t.name).toLowerCase()===name.toLowerCase())?.value;
}
function readJsonIfExists(file){
  try{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;}catch{return null;}
}

const stateCache=new Map(),statePending=new Map();
function memoState(name,quorum,run,signal){
 signal?.throwIfAborted();
 const seedFile=process.env.SOLANA_RPC_SEEDS||'solana-rpc-seeds.json';
 const key=name+'|'+quorum+'|'+seedFile+'|'+fs.statSync(seedFile).mtimeMs;
 const cached=stateCache.get(key);if(cached&&cached.until>Date.now())return cached.value;
 return shareQuery(statePending,key,async workSignal=>{
  const result=await run(workSignal);workSignal.throwIfAborted();
  const ttl=result.stateEvidence?.observations?.find(x=>x.ok)?.ant?.ttlSeconds||0;
  stateCache.set(key,{value:result,until:Date.now()+Math.min(10000,Math.max(0,ttl*1000))});
  if(stateCache.size>128)stateCache.delete(stateCache.keys().next().value);return result;
 },{signal});
}
async function resolveAndFetchSwarmInner(raw,{quorum=Number(process.env.MESH_QUORUM||2),onProgress=()=>{},contentStore=null,snapshotStore=null,accessPolicy='live',trustedPeers=[],signal}={}){
  signal?.throwIfAborted();
  const {name,requestedPath}=parseInput(raw);
  const progress=event=>onProgress({phase:'content',...event});
  if(!name) throw new Error('ArNS name required');
  const client=createSwarmMeshClient({quorum});client.setName(name);
  let resolvedState=null;

  const fetchById=dataId=>fetchMeshContent(dataId,{client,contentStore,onProgress:progress,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
  if(accessPolicy==='saved'){try{return await resolveSavedContent({name,requestedPath,snapshotStore,client,trustedPeers,fetchById,onProgress,signal});}finally{await client.stop();}}
  const deepProofs=process.env.MESH_DEEP_PROOFS==='1'||['CHAIN_PROOF_REQUIRED','ANT_UPDATE_PROOF_REQUIRED','TRANSITION_JOURNAL_REQUIRED'].some(k=>process.env[k]==='1');

  try{
    let witness=null,witnessError=null,live=null,liveError=null,stateEvidence=null,stateEvidenceError=null,authorizedUpdateProof=null,authorizedUpdateProofError=null,consensusEra=null,remoteProofBundles=null,transitionJournal=null,transitionJournalError=null,acceptedAnt=null,acceptedChain=null,acceptedJournal=null;
    onProgress({phase:'resolving',stage:'name',status:'active',message:'Reading name record from a Solana RPC IP…'});
    const snapshot=await memoState(name,quorum,async workSignal=>{
      const [w,e]=await Promise.allSettled([deepProofs?client.resolve(name,{signal:workSignal}):Promise.resolve(null),buildArNSStateEvidence(name,{signal:workSignal}).then(r=>{onProgress({phase:'resolving',stage:'name',status:'done',message:'Name account read; locating content…'});return r;})]);
      if(e.status==='rejected')throw new Error('current_name_state_unavailable: '+e.reason);
      return {witness:w.status==='fulfilled'?w.value:null,witnessError:w.status==='rejected'?String(w.reason):null,stateEvidence:e.value};
    },signal);
    ({witness,witnessError,stateEvidence}=snapshot);
    if(!stateEvidence)throw new Error('current_name_state_unavailable: '+stateEvidenceError);
    let snapshotSaveError=null;try{snapshotStore?.observe(stateEvidence);}catch(e){snapshotSaveError=String(e.message);}
    resolvedState={nameResolved:true,name,rootDataId:stateEvidence.txId,rpcSources:stateEvidence.observations.filter(x=>x.ok).length,rpcTrustRequired:true,accountInclusionProof:false};
    onProgress({phase:'resolving',stage:'name',status:'done',message:'Name record received through RPC; locating content…',nameResolution:resolvedState});
    progress({stage:'peers',status:'active',message:'Checking Mesh peers and available evidence…'});
    const observed=stateEvidence.observations.find(x=>x.ok);
    live={record:{name,txId:stateEvidence.txId,processId:stateEvidence.antId,ttlSeconds:observed.ant.ttlSeconds,type:observed.arns.type,undernameLimit:observed.arns.undernameLimit},endpoints:stateEvidence.observations.filter(x=>x.ok).map(x=>x.endpoint),quorum:{matching:stateEvidence.observations.filter(x=>x.ok).length,required:Number(process.env.SOLANA_RPC_QUORUM||1)}};
    try{consensusEra=deepProofs?await detectConsensusEra():{era:'not-requested'};}catch(e){consensusEra={era:'unknown',error:String(e.message||e)};}
    let accountProof=null;
    try{accountProof=loadVerifiedAccountProof(name);}catch{}

    const getRemoteProofBundles=async()=>{
      if(!deepProofs)return [];
      if(remoteProofBundles!==null) return remoteProofBundles;
      try{remoteProofBundles=await client.proofBundles(name);}catch{remoteProofBundles=[];}
      return remoteProofBundles;
    };

    let record,validation;
    if(live){
      record={
        name:live.record.name,
        txId:live.record.txId,
        antId:live.record.processId,
        ttlSeconds:live.record.ttlSeconds,
        type:live.record.type,
        undernameLimit:live.record.undernameLimit
      };
      if(witness){
        if(witness.record.txId!==record.txId||witness.record.antId!==record.antId){
          witnessError='stale_peer_mapping_ignored';witness=null;
        }

      }
      if(stateEvidence){
        if(stateEvidence.txId!==record.txId||stateEvidence.antId!==record.antId) throw new Error('Locally decoded Solana state evidence conflicts with ArNS resolution');
        validation={mode:'direct-solana-state-evidence',quorum:live.quorum,endpoints:live.endpoints,evidenceSha256:stateEvidence.evidenceSha256,checks:stateEvidence.checks,slot:stateEvidence.observations.find(x=>x.ok)?.slot,stakeCommitment:stateEvidence.observations.find(x=>x.ok)?.stakeCommitment};
      }else validation={mode:'direct-solana-ip',quorum:live.quorum,endpoints:live.endpoints,stateEvidenceError};
    }else{
      if(!witness) throw new Error('No validated ArNS resolution path: '+JSON.stringify({liveError,witnessError}));
      record=witness.record;
      validation={mode:'p2p-signed-witness-fallback',liveError,stateEvidenceError};
    }

    try{
      const proofPath=process.env.ANT_UPDATE_PROOF_FILE||('proofs/'+name+'.ant-update.json');
      if(process.env.PROOF_SOURCE!=='p2p'&&fs.existsSync(proofPath)){
        const bundle=JSON.parse(fs.readFileSync(proofPath,'utf8'));
        authorizedUpdateProof=verifySavedAntUpdateProof(bundle,{
          name,undername:name.includes('_')?name.split('_')[0]:'@',
          antId:record.antId,
          expectedTxId:record.txId
        });
        acceptedAnt=bundle;
      }else{
        authorizedUpdateProofError='proof_bundle_missing';
      }
    }catch(e){
      authorizedUpdateProofError=String(e.message||e);
    }
    if(!authorizedUpdateProof){
      for(const remote of await getRemoteProofBundles()){
        if(!remote.antUpdateProof) continue;
        try{
          authorizedUpdateProof=verifySavedAntUpdateProof(remote.antUpdateProof,{
            name,undername:name.includes('_')?name.split('_')[0]:'@',antId:record.antId,expectedTxId:record.txId
          });
          authorizedUpdateProof={...authorizedUpdateProof,proofTransport:'p2p',proofPeerId:remote.p2pPeerId};
          authorizedUpdateProofError=null;acceptedAnt=remote.antUpdateProof;
          break;
        }catch(e){authorizedUpdateProofError=String(e.message||e);}
      }
    }
    if((process.env.ANT_UPDATE_PROOF_REQUIRED==='1')&&!authorizedUpdateProof){
      throw new Error('Authorized ANT update proof failed: '+authorizedUpdateProofError);
    }

    if(process.env.PROOF_SOURCE!=='p2p'){try{transitionJournal=loadAndVerifyJournal(name,{expectedName:name,expectedAntId:record.antId,expectedHeadTarget:record.txId});}catch(e){transitionJournalError=String(e.message||e);}}
    if(!transitionJournal?.result?.ok){
      for(const remote of await getRemoteProofBundles()){
        if(!remote.transitionJournal) continue;
        try{
          const result=verifyJournal(remote.transitionJournal,{expectedName:name,expectedAntId:record.antId,expectedHeadTarget:record.txId});
          transitionJournal={file:null,journal:remote.transitionJournal,result:{...result,transport:'p2p',proofPeerId:remote.p2pPeerId}};
          transitionJournalError=null;
          break;
        }catch(e){transitionJournalError=String(e.message||e);}
      }
    }
    if((process.env.TRANSITION_JOURNAL_REQUIRED==='1')&&!transitionJournal?.result?.ok){
      throw new Error('Transition journal verification failed: '+transitionJournalError);
    }

    let chainStateProof=null;
    try{
      if(process.env.PROOF_SOURCE==='p2p') throw new Error('forced_p2p_proof_source');
      if(consensusEra?.era==='alpenglow'){
        throw new Error('alpenglow_active_towerbft_proof_refused_until_bls_certificate_verifier_is_active');
      }
      if(consensusEra?.era!=='towerbft'){
        throw new Error('unknown_consensus_era_towerbft_proof_refused');
      }
      const localBundle=readJsonIfExists((process.env.CHAIN_PROOF_BASE||'proofs')+'/'+name+'/head.json');
      const candidate=verifyPortableChainProof(localBundle,record);
      const goodState=stateEvidence?.observations?.find(x=>x.ok);
      if(goodState){
        if(candidate.arnsRawSha256 && candidate.arnsRawSha256!==goodState.arns?.rawSha256){
          throw new Error('chain_checkpoint_arns_bytes_do_not_match_current_state');
        }
        if(candidate.antRawSha256 && candidate.antRawSha256!==goodState.ant?.rawSha256){
          throw new Error('chain_checkpoint_ant_bytes_do_not_match_current_state');
        }
      }
      chainStateProof=candidate;acceptedChain=localBundle;
    }catch(e){
      const localChainError=String(e.message||e);
      chainStateProof=null;
      if(consensusEra?.era==='towerbft'){
        for(const remote of await getRemoteProofBundles()){
          try{
            const portable=verifyPortableChainProof(remote.chainProof,record);
            const candidate={...portable,proofTransport:'p2p',proofPeerId:remote.p2pPeerId,localChainError};
            const goodState=stateEvidence?.observations?.find(x=>x.ok);
            if(goodState){
              if(candidate.arnsRawSha256&&candidate.arnsRawSha256!==goodState.arns?.rawSha256) throw new Error('portable_chain_arns_state_mismatch');
              if(candidate.antRawSha256&&candidate.antRawSha256!==goodState.ant?.rawSha256) throw new Error('portable_chain_ant_state_mismatch');
            }
            chainStateProof=candidate;acceptedChain=remote.chainProof;
            break;
          }catch{}
        }
      }
      if(!chainStateProof&&process.env.CHAIN_PROOF_REQUIRED==='1') throw e;
    }

    record.witnessedAt=stateEvidence.generatedAt;
    record.expiresAt=new Date(Date.now()+Math.min(Number(record.ttlSeconds||60),300)*1000).toISOString();
    let current=await fetchById(record.txId);
    const items=[];if(current.direct.storedBytes||current.direct.rawItem)items.push({dataId:record.txId,storedBytes:current.direct.storedBytes||current.direct.rawItem,storageKind:current.storageKind});
    const rootLocation=current.loc?.record||null;
    if(record.contentHashSha256 && current.direct.payloadSha256!==record.contentHashSha256){
      throw new Error('root_payload_hash_mismatch');
    }
    let dataId=record.txId;
    let contentType=tagValue(current.direct.tags,'Content-Type')||record.contentType||'application/octet-stream';
    let manifestUsed=false,manifestPath=null;

    if(contentType.toLowerCase().includes('application/x.arweave-manifest')){
      const manifest=JSON.parse(current.direct.payload.toString('utf8'));
      const entry=resolveManifestPath(manifest,requestedPath);
      manifestPath=entry.path;
      dataId=entry.id;
      current=await fetchById(dataId);
      if(current.direct.storedBytes||current.direct.rawItem)items.push({dataId,storedBytes:current.direct.storedBytes||current.direct.rawItem,storageKind:current.storageKind});
      contentType=tagValue(current.direct.tags,'Content-Type')||'application/octet-stream';
      manifestUsed=true;
    }

    const verification=assessArNSVerification({stateEvidence,witness,live,authorizedUpdateProof,chainStateProof,transitionJournal:transitionJournal?.result});
    const remoteShare=(remoteProofBundles||[])[0]||null;
    const shareBundle={
      schema:'arns-mesh-verified-share/v1',
      verifiedAt:new Date().toISOString(),
      name,
      record,
      location:rootLocation,
      locations:[rootLocation,current.loc?.record].filter(Boolean),
      stateEvidence,
      items,
      antUpdateProof:acceptedAnt,
      chainProof:acceptedChain,
      transitionJournal:transitionJournal?.result?.ok?transitionJournal.journal:null,
      verification:{
        level:verification.level,
        nameStateChecked:verification.nameStateChecked,
        rpcTrustRequired:true,
        fullyTrustless:Boolean(verification.fullyTrustless),
        signedAuthorizedTransition:Boolean(verification.signedAuthorizedTransition),
        signedTowerSupermajorityVerified:Boolean(verification.signedTowerSupermajorityVerified),
        transitionJournalVerified:Boolean(verification.transitionJournalVerified),
        accountInclusionProof:Boolean(verification.accountInclusionProof)
      },
      content:{
        dataId,
        manifestUsed,
        rootDataId:record.txId,
        rootTxId:current.direct.rootTxId,
        sha256:current.direct.payloadSha256,
        signatureVerified:current.storageKind==='ans104'||Boolean(current.direct.l1SignatureVerified)
      }
    };
    return {
      name,requestedPath,record,verification,consensusEra,snapshotSaveError,
      arnsValidation:validation,
      chainStateProof,
      transitionJournal:transitionJournal?.result||null,transitionJournalError,
      authorizedUpdateProof,authorizedUpdateProofError,
      witness,
      p2pPeers:[],
      location:current.loc,
      storageKind:current.storageKind,
      dataId,
      rootTxId:current.direct.rootTxId,
      provider:current.direct.peer,
      dataItemSignatureVerified:current.storageKind==='ans104',
      l1SignatureVerified:Boolean(current.direct.l1SignatureVerified),
      l1DataRootVerified:Boolean(current.direct.l1DataRootVerified),
      manifestUsed,manifestPath,
      contentType,
      body:current.direct.payload,
      shareBundle,
      sha256:current.direct.payloadSha256,
      networkPolicy:'literal-ip-raw-only',
      networkAudit:networkAuditSnapshot()
    };
  } catch(error){
    error.diagnostics={...error.diagnostics,nameResolution:resolvedState};
    throw error;
  } finally {
    await client.stop();
  }
}

export function resolveAndFetchSwarm(raw,options={}){return withNetworkAudit(String(raw),()=>resolveAndFetchSwarmInner(raw,options));}
