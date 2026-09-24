import crypto from 'node:crypto';
import { verifyEmbeddedTowerVotes } from './chain-proof.mjs';

function stable(v){
  if(Array.isArray(v)) return '['+v.map(stable).join(',')+']';
  if(v&&typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');

export function verifyPortableChainProof(head,expectedRecord,{maxAgeMs=15*60*1000,nowMs=Date.now()}={}){
  if(!head||head.schema!=='arns-mesh-chain-state-proof/4') throw new Error('portable_proof_schema_invalid');

  const payload={...head};
  delete payload.proofHash;
  delete payload.verifierPublicKeyPem;
  delete payload.verifierSignature;
  if(sha256(Buffer.from(stable(payload)))!==head.proofHash) throw new Error('portable_proof_hash_invalid');
  if(!crypto.verify(null,Buffer.from(head.proofHash),crypto.createPublicKey(head.verifierPublicKeyPem),Buffer.from(head.verifierSignature,'base64url'))){
    throw new Error('portable_proof_signature_invalid');
  }

  const generatedMs=Date.parse(head.generatedAt);
  if(generatedMs>nowMs+30000) throw new Error('portable_proof_future_timestamp');
  const ageMs=Math.max(0,nowMs-generatedMs);
  if(!Number.isFinite(ageMs)||(maxAgeMs!=null&&ageMs>maxAgeMs)) throw new Error('portable_proof_stale');
  if(expectedRecord?.name && head.name!==expectedRecord.name) throw new Error('portable_proof_name_mismatch');
  for(const key of ['txId','antId']){
    const decoded=key==='txId'?head.accounts?.ant?.decoded?.transactionId:head.accounts?.arns?.decoded?.processId;
    if(decoded!==head.resolution?.[key]) throw new Error('portable_proof_decoded_state_mismatch');
  }
  if(head.transitionEvidence?.ant?.antSetRecord?.target!==head.resolution?.txId) throw new Error('portable_proof_transition_target_mismatch');
  if(expectedRecord?.txId&&head.resolution?.txId!==expectedRecord.txId) throw new Error('portable_proof_tx_mismatch');
  if(expectedRecord?.antId&&head.resolution?.antId!==expectedRecord.antId) throw new Error('portable_proof_ant_mismatch');

  const t=head.trustBoundary||{}, ce=head.consensusEvidence||{}, sc=head.stateCommitment||{};
  const required=[
    'accountBytesComparedAcrossTwoSources','accountBytesLocallyDecoded','transactionSignaturesLocallyVerified',
    'transactionTargetsAndProgramsChecked','arnsRegistryInstructionMatchesAccountState','antSetRecordInstructionMatchesAccountState',
    'historicalBlockMembershipChecked','recentBlockhashContinuityChecked','dualSourceStakeMapAgreement',
    'stakeWeightedRootCheckpoint','dualSourceRecentBlockHeaders','exactAntSetRecordDecoded',
    'antSetRecordTargetMatchesCurrentState','antSetRecordCallerSignatureVerified','antSetRecordBlockMembershipVerified',
    'individualValidatorVoteSignaturesVerified','signedTowerSupermajorityVerified','towerVoteProofsEmbedded'
  ];
  for(const k of required) if(t[k]!==true) throw new Error('portable_proof_required_check_missing:'+k);

  if(sc.model!=='agave-accounts-lattice-hash-bankhash'||sc.bankHashCommitsAccountsLatticeHash!==true||sc.nativePerAccountInclusionProofAvailable!==false){
    throw new Error('portable_proof_state_commitment_invalid');
  }
  if(head.network?.consensus!=='tower-bft') throw new Error('portable_proof_consensus_unsupported:'+head.network?.consensus);
  if(!ce.stake?.stakeMapAgreement||!ce.blocks?.dualSourceAgreement||!ce.antSetRecord?.exactSetRecordDecoded||!ce.antSetRecord?.setRecordTargetMatchesCurrentState){
    throw new Error('portable_proof_consensus_evidence_incomplete');
  }
  if(ce.antSetRecord.setRecord?.target!==head.resolution.txId) throw new Error('portable_proof_setrecord_target_mismatch');

  const tower=verifyEmbeddedTowerVotes(ce);
  return {
    ok:true,portable:true,proofHash:head.proofHash,generatedAt:head.generatedAt,proofAgeMs:ageMs,
    finalizedSlot:Number(head.recentFinalizedChain.finalizedSlot),consensus:head.network.consensus,
    txId:head.resolution.txId,antId:head.resolution.antId,
    arnsRawSha256:head.accounts?.arns?.rawSha256??null,antRawSha256:head.accounts?.ant?.rawSha256??null,
    dualSourceAccountAgreement:false,
    localTransactionSignatureVerification:false,
    historicalBlockMembershipObserved:false,
    blockhashContinuity:false,
    proofSchema:head.schema,
    dualSourceStakeMapAgreement:false,
    stakeWeightedRootCheckpoint:false,
    dualSourceRecentBlockHeaders:false,
    exactAntSetRecordDecoded:false,
    antSetRecordCallerSignatureVerified:false,
    antSetRecordTargetMatchesCurrentState:false,
    individualValidatorVoteSignaturesVerified:true,
    signedTowerSupermajorityVerified:false,
    reportedStakeQuorumConsistent:true,
    stakeWeightsAuthenticated:false,
    checkpointProducerTrusted:false,
    trustLevel:"signed-evidence-with-unproven-stake",
    signedTowerSupermajorityRootSlot:tower.signedTowerSupermajorityRootSlot,
    signedTowerStakeFractionAtRoot:t.signedTowerStakeFractionAtRoot??null,
    embeddedTowerVoteProofsVerified:true,
    embeddedTowerVerifiedVoteAccounts:tower.verifiedVoteAccounts,
    embeddedTowerVerifiedSignedStake:tower.verifiedSignedStake,
    stateCommitmentModel:sc.model,
    nativeAccountInclusionProof:false,
    alpenglowCertificateCryptographicallyVerified:false
  };
}
