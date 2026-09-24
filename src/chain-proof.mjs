import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getCompiledTransactionMessageDecoder } from '@solana/transaction-messages';
import { decodeTowerSyncInstruction } from './solana-consensus-evidence.mjs';

function stable(v){
  if(Array.isArray(v)) return '['+v.map(stable).join(',')+']';
  if(v&&typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex')}


const VOTE_PROGRAM='Vote111111111111111111111111111111111111111';

export function verifyEmbeddedTowerVotes(ce){
  const tv=ce?.towerVotes;
  const votes=tv?.verifiedVotes;
  if(!Array.isArray(votes)||!votes.length) throw new Error('chain_proof_v4_tower_votes_missing');
  if(tv.signedTowerSupermajority!==true) throw new Error('chain_proof_v4_tower_supermajority_missing');
  if(Number(tv.signatureFailures||0)!==0) throw new Error('chain_proof_v4_tower_signature_failures');

  const seen=new Set();
  const canonical=[];
  let signedStake=0n;
  let minRoot=null;

  for(const v of votes){
    if(seen.has(v.votePubkey)) throw new Error('chain_proof_v4_duplicate_vote_account:'+v.votePubkey);
    seen.add(v.votePubkey);
    const tp=v.transactionProof;
    if(!tp?.messageBase64||!Array.isArray(tp.signatures)||!tp.signatures.length){
      throw new Error('chain_proof_v4_vote_transaction_proof_missing:'+v.votePubkey);
    }
    const msgBytes=Buffer.from(tp.messageBase64,'base64');
    const signatures=tp.signatures;
    for(const sig of signatures){
      const ok=nacl.sign.detached.verify(
        msgBytes,
        Buffer.from(sig.signatureBase64url,'base64url'),
        Buffer.from(bs58.decode(sig.address))
      );
      if(!ok) throw new Error('chain_proof_v4_vote_signature_invalid:'+v.votePubkey+':'+sig.address);
    }
    if(!signatures.some(x=>x.address===v.authorizedVoter)){
      throw new Error('chain_proof_v4_authorized_voter_not_signer:'+v.votePubkey);
    }
    const primary=bs58.encode(Buffer.from(signatures[0].signatureBase64url,'base64url'));
    if(primary!==v.transactionSignature){
      throw new Error('chain_proof_v4_primary_signature_mismatch:'+v.votePubkey);
    }

    const message=getCompiledTransactionMessageDecoder().decode(msgBytes);
    const loaded=tp.loadedAddresses||{};
    const keys=[
      ...(message.staticAccounts||[]).map(String),
      ...(loaded.writable||[]).map(String),
      ...(loaded.readonly||[]).map(String)
    ];
    let matched=false;
    for(const ix of message.instructions||[]){
      if(keys[ix.programAddressIndex]!==VOTE_PROGRAM) continue;
      const data=Buffer.from(ix.data);
      if(data.length<4||![14,15].includes(data.readUInt32LE(0))) continue;
      const tower=decodeTowerSyncInstruction(data);
      const accounts=(ix.accountIndices||[]).map(i=>keys[i]);
      if(accounts[0]!==v.votePubkey||accounts[1]!==v.authorizedVoter) continue;
      if(tower.root!==Number(v.root)||tower.lastVoteSlot!==Number(v.lastVoteSlot)||
         tower.hash!==v.bankStateHash||tower.blockId!==v.blockId){
        continue;
      }
      matched=true;
      break;
    }
    if(!matched) throw new Error('chain_proof_v4_tower_instruction_mismatch:'+v.votePubkey);
    if(v.programExecutionSucceeded!==true) throw new Error('chain_proof_v4_vote_execution_not_success:'+v.votePubkey);

    const stake=BigInt(v.stake);
    if(stake<=0n) throw new Error('tower_stake_must_be_positive');
    const requiredSigners=(message.staticAccounts||[]).slice(0,message.header.numSignerAccounts).map(String);
    if(!requiredSigners.length || !requiredSigners.includes(v.authorizedVoter) ||
       requiredSigners.some(address=>!signatures.some(s=>s.address===address))) {
      throw new Error('tower_required_signatures_missing');
    }
    signedStake+=stake;
    minRoot=minRoot==null?Number(v.root):Math.min(minRoot,Number(v.root));
    canonical.push([
      v.votePubkey,v.authorizedVoter,String(v.stake),Number(v.root),Number(v.lastVoteSlot),
      v.bankStateHash,v.blockId,Number(v.blockSlot),v.transactionSignature
    ]);
  }

  canonical.sort((a,b)=>a[0].localeCompare(b[0]));
  const evidenceHash=sha256(Buffer.from(stable(canonical)));
  if(evidenceHash!==tv.evidenceHash) throw new Error('chain_proof_v4_tower_evidence_hash_mismatch');
  const threshold=BigInt(tv.threshold);
  const totalStake=BigInt(tv.totalStake);
  if(totalStake<=0n || threshold!==(2n*totalStake)/3n+1n) throw new Error('tower_threshold_invalid');
  if(signedStake>totalStake) throw new Error('tower_stake_exceeds_total');
  if(signedStake<threshold) throw new Error('chain_proof_v4_signed_stake_below_threshold');
  if(signedStake!==BigInt(tv.verifiedSignedStake)||signedStake!==BigInt(tv.signedStakeAtRoot)){
    throw new Error('chain_proof_v4_signed_stake_mismatch');
  }
  if(minRoot!==Number(tv.signedTowerSupermajorityRootSlot)){
    throw new Error('chain_proof_v4_signed_root_mismatch');
  }
  if(String(tv.totalStake)!==String(ce?.stake?.raw?.totalStake)){
    throw new Error('chain_proof_v4_total_stake_mismatch');
  }
  return {
    verifiedVoteAccounts:votes.length,
    verifiedSignedStake:signedStake.toString(),
    threshold:threshold.toString(),
    totalStake:totalStake.toString(),
    signedTowerSupermajorityRootSlot:minRoot,
    evidenceHash
  };
}


export function verifyPortableChainStateCheckpoint(head,expectedRecord,{maxAgeMs=15*60*1000,nowMs=Date.now()}={}){
  if(!head||typeof head!=='object') throw new Error('portable_chain_checkpoint_invalid');
  const payload={...head};
  delete payload.proofHash;
  delete payload.verifierPublicKeyPem;
  delete payload.verifierSignature;
  const hash=sha256(Buffer.from(stable(payload)));
  if(hash!==head.proofHash) throw new Error('portable_chain_proof_hash_invalid');
  const sigOk=crypto.verify(
    null,
    Buffer.from(head.proofHash),
    crypto.createPublicKey(head.verifierPublicKeyPem),
    Buffer.from(head.verifierSignature,'base64url')
  );
  if(!sigOk) throw new Error('portable_chain_proof_signature_invalid');

  const generatedMs=Date.parse(head.generatedAt);
  if(!Number.isFinite(generatedMs)) throw new Error('portable_chain_proof_generated_at_invalid');
  if(generatedMs>nowMs+30000) throw new Error('chain_proof_future_timestamp');
  const ageMs=Math.max(0,nowMs-generatedMs);
  if(maxAgeMs!=null&&ageMs>maxAgeMs) throw new Error('portable_chain_proof_stale:'+ageMs);

  if(expectedRecord){
    if(head.resolution?.txId!==expectedRecord.txId) throw new Error('portable_chain_proof_tx_mismatch');
    if(head.resolution?.antId!==expectedRecord.antId) throw new Error('portable_chain_proof_ant_mismatch');
  }

  const t=head.trustBoundary||{};
  if(!t.accountBytesComparedAcrossTwoSources||!t.accountBytesLocallyDecoded||
     !t.transactionSignaturesLocallyVerified||!t.transactionTargetsAndProgramsChecked||
     !t.arnsRegistryInstructionMatchesAccountState||!t.antSetRecordInstructionMatchesAccountState||
     !t.historicalBlockMembershipChecked||!t.recentBlockhashContinuityChecked||
     !t.dualSourceStakeMapAgreement||!t.stakeWeightedRootCheckpoint||
     !t.dualSourceRecentBlockHeaders||!t.exactAntSetRecordDecoded||
     !t.antSetRecordTargetMatchesCurrentState||!t.antSetRecordCallerSignatureVerified||
     !t.individualValidatorVoteSignaturesVerified||!t.signedTowerSupermajorityVerified||
     !t.towerVoteProofsEmbedded){
    throw new Error('portable_chain_proof_required_checks_missing');
  }

  if(head.schema!=='arns-mesh-chain-state-proof/4') throw new Error('portable_chain_proof_v4_required');
  const sc=head.stateCommitment||{};
  if(sc.model!=='agave-accounts-lattice-hash-bankhash'||
     sc.bankHashCommitsAccountsLatticeHash!==true||
     sc.nativePerAccountInclusionProofAvailable!==false){
    throw new Error('portable_chain_proof_state_commitment_invalid');
  }

  const ce=head.consensusEvidence;
  if(!ce?.stake?.stakeMapAgreement||!ce?.blocks?.dualSourceAgreement||
     !ce?.towerVotes?.individualValidatorVoteSignaturesVerified||
     !ce?.towerVotes?.signedTowerSupermajority||
     !ce?.antSetRecord?.exactSetRecordDecoded||
     !ce?.antSetRecord?.setRecordTargetMatchesCurrentState){
    throw new Error('portable_chain_proof_evidence_missing');
  }
  if(ce.antSetRecord.setRecord?.target!==head.resolution?.txId){
    throw new Error('portable_chain_proof_set_record_target_mismatch');
  }

  const embeddedTower=verifyEmbeddedTowerVotes(ce);
  return {
    ok:true,
    portable:true,
    headProofHash:head.proofHash,
    finalizedSlot:Number(head.recentFinalizedChain.finalizedSlot),
    consensus:head.network.consensus,
    txId:head.resolution.txId,
    antId:head.resolution.antId,
    generatedAt:head.generatedAt,
    arnsRawSha256:head.accounts?.arns?.rawSha256??null,
    antRawSha256:head.accounts?.ant?.rawSha256??null,
    proofSchema:head.schema,
    proofAgeMs:ageMs,
    stateCommitmentModel:sc.model,
    dualSourceAccountAgreement:true,
    dualSourceStakeMapAgreement:true,
    individualValidatorVoteSignaturesVerified:true,
    signedTowerSupermajorityVerified:false,
    signedTowerSupermajorityRootSlot:t.signedTowerSupermajorityRootSlot??null,
    signedTowerStakeFractionAtRoot:t.signedTowerStakeFractionAtRoot??null,
    embeddedTowerVoteProofsVerified:true,
    embeddedTowerVerifiedVoteAccounts:embeddedTower.verifiedVoteAccounts,
    embeddedTowerVerifiedSignedStake:embeddedTower.verifiedSignedStake,
    nativeAccountInclusionProof:false,
    alpenglowCertificateCryptographicallyVerified:Boolean(t.alpenglowCertificateCryptographicallyVerified),
    historyLinkVerified:false
  };
}

export function verifyChainStateProof(name,expectedRecord,{base='proofs',maxAgeMs=15*60*1000,nowMs=Date.now()}={}){
  const dir=path.resolve(base,String(name).toLowerCase());
  if(!fs.existsSync(dir)) throw new Error('chain_state_proof_missing:'+name);
  const files=fs.readdirSync(dir)
    .filter(f=>/^\d{4}-\d{2}-\d{2}T.*Z\.json$/.test(f))
    .map(f=>path.join(dir,f));
  if(!files.length) throw new Error('chain_state_proof_history_empty:'+name);
  const proofs=files.map(f=>JSON.parse(fs.readFileSync(f,'utf8')))
    .sort((a,b)=>Date.parse(a.generatedAt)-Date.parse(b.generatedAt));
  let prev=null;
  for(const p of proofs){
    const payload={...p};
    delete payload.proofHash;
    delete payload.verifierPublicKeyPem;
    delete payload.verifierSignature;
    const hash=sha256(Buffer.from(stable(payload)));
    if(hash!==p.proofHash) throw new Error('chain_proof_hash_invalid:'+p.generatedAt);
    const sigOk=crypto.verify(
      null,
      Buffer.from(p.proofHash),
      crypto.createPublicKey(p.verifierPublicKeyPem),
      Buffer.from(p.verifierSignature,'base64url')
    );
    if(!sigOk) throw new Error('chain_proof_signature_invalid:'+p.generatedAt);
    if((p.previousProofHash??null)!==(prev?.proofHash??null)) throw new Error('chain_proof_link_invalid:'+p.generatedAt);
    if(prev && Number(p.recentFinalizedChain?.finalizedSlot||0)<=Number(prev.recentFinalizedChain?.finalizedSlot||0)){
      throw new Error('chain_proof_slot_not_monotonic:'+p.generatedAt);
    }
    prev=p;
  }
  const head=prev;
  const generatedMs=Date.parse(head.generatedAt);
  if(!Number.isFinite(generatedMs)) throw new Error('chain_proof_generated_at_invalid');
  if(generatedMs>nowMs+30000) throw new Error('chain_proof_future_timestamp');
  const ageMs=Math.max(0,nowMs-generatedMs);
  if(maxAgeMs!=null&&ageMs>maxAgeMs) throw new Error('chain_proof_stale:'+ageMs);
  if(expectedRecord){
    if(head.resolution?.txId!==expectedRecord.txId) throw new Error('chain_proof_tx_mismatch');
    if(head.resolution?.antId!==expectedRecord.antId) throw new Error('chain_proof_ant_mismatch');
  }
  const t=head.trustBoundary||{};
  if(!t.accountBytesComparedAcrossTwoSources||!t.accountBytesLocallyDecoded||!t.transactionSignaturesLocallyVerified||
     !t.transactionTargetsAndProgramsChecked||!t.arnsRegistryInstructionMatchesAccountState||
     !t.antSetRecordInstructionMatchesAccountState||
     !t.historicalBlockMembershipChecked||!t.recentBlockhashContinuityChecked||
     !t.forwardStateChangesRequireRawValidatorTransactionAgreement||
     !t.forwardStateChangesRequireRawValidatorBlockMembership){
    throw new Error('chain_proof_required_checks_missing');
  }
  if(['arns-mesh-chain-state-proof/2','arns-mesh-chain-state-proof/3','arns-mesh-chain-state-proof/4'].includes(head.schema)){
    if(!t.dualSourceStakeMapAgreement||!t.stakeWeightedRootCheckpoint||!t.dualSourceRecentBlockHeaders||
       !t.exactAntSetRecordDecoded||!t.antSetRecordTargetMatchesCurrentState||
       !t.antSetRecordCallerSignatureVerified||!t.antSetRecordBlockMembershipVerified||
       !t.individualValidatorVoteSignaturesVerified||!t.signedTowerSupermajorityVerified){
      throw new Error('chain_proof_v2_required_checks_missing');
    }
    const ce=head.consensusEvidence;
    if(!ce?.stake?.stakeMapAgreement||!ce?.blocks?.dualSourceAgreement||
       !ce?.towerVotes?.individualValidatorVoteSignaturesVerified||!ce?.towerVotes?.signedTowerSupermajority||
       !ce?.antSetRecord?.exactSetRecordDecoded||!ce?.antSetRecord?.setRecordTargetMatchesCurrentState){
      throw new Error('chain_proof_v2_evidence_missing');
    }
    if(ce.antSetRecord.setRecord?.target!==head.resolution?.txId){
      throw new Error('chain_proof_v2_set_record_target_mismatch');
    }
  }
  if(head.schema==='arns-mesh-chain-state-proof/3'||head.schema==='arns-mesh-chain-state-proof/4'){
    const sc=head.stateCommitment||{};
    if(sc.model!=='agave-accounts-lattice-hash-bankhash'||
       sc.bankHashCommitsAccountsLatticeHash!==true||
       sc.nativePerAccountInclusionProofAvailable!==false){
      throw new Error('chain_proof_v3_state_commitment_invalid');
    }
  }
  let embeddedTower=null;
  if(head.schema==='arns-mesh-chain-state-proof/4'){
    if(t.towerVoteProofsEmbedded!==true) throw new Error('chain_proof_v4_embedded_tower_flag_missing');
    embeddedTower=verifyEmbeddedTowerVotes(head.consensusEvidence);
  }
  return {
    ok:true,
    proofs:proofs.length,
    headProofHash:head.proofHash,
    finalizedSlot:Number(head.recentFinalizedChain.finalizedSlot),
    consensus:head.network.consensus,
    txId:head.resolution.txId,
    antId:head.resolution.antId,
    generatedAt:head.generatedAt,
    arnsRawSha256:head.accounts?.arns?.rawSha256??null,
    antRawSha256:head.accounts?.ant?.rawSha256??null,
    dualSourceAccountAgreement:true,
    localTransactionSignatureVerification:true,
    historicalBlockMembershipObserved:true,
    blockhashContinuity:true,
    proofSchema:head.schema,
    proofAgeMs:ageMs,
    stateCommitmentModel:head.stateCommitment?.model??'legacy',
    dualSourceStakeMapAgreement:Boolean(t.dualSourceStakeMapAgreement),
    stakeWeightedRootCheckpoint:Boolean(t.stakeWeightedRootCheckpoint),
    conservativeSupermajorityRootSlot:t.conservativeSupermajorityRootSlot??null,
    dualSourceRecentBlockHeaders:Boolean(t.dualSourceRecentBlockHeaders),
    exactAntSetRecordDecoded:Boolean(t.exactAntSetRecordDecoded),
    antSetRecordCallerSignatureVerified:Boolean(t.antSetRecordCallerSignatureVerified),
    antSetRecordTargetMatchesCurrentState:Boolean(t.antSetRecordTargetMatchesCurrentState),
    individualValidatorVoteSignaturesVerified:Boolean(t.individualValidatorVoteSignaturesVerified),
    signedTowerSupermajorityVerified:false,
    stakeWeightsAuthenticated:false,
    checkpointProducerTrusted:false,
    signedTowerSupermajorityRootSlot:t.signedTowerSupermajorityRootSlot??null,
    signedTowerStakeFractionAtRoot:t.signedTowerStakeFractionAtRoot??null,
    embeddedTowerVoteProofsVerified:Boolean(embeddedTower),
    embeddedTowerVerifiedVoteAccounts:embeddedTower?.verifiedVoteAccounts??0,
    embeddedTowerVerifiedSignedStake:embeddedTower?.verifiedSignedStake??null,
    nativeAccountInclusionProof:Boolean(t.nativeAccountInclusionProof),
    alpenglowCertificateCryptographicallyVerified:Boolean(t.alpenglowCertificateCryptographicallyVerified)
  };
}
