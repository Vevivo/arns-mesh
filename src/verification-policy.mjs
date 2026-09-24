// RPC observations do not constitute a cryptographic proof of current chain state.
export function assessArNSVerification({stateEvidence,authorizedUpdateProof,chainStateProof,transitionJournal}) {
  const observations=(stateEvidence?.observations||[]).filter(x=>x.ok);
  const checked=Boolean(observations.length && stateEvidence?.checks?.pdaDerivedLocally &&
    stateEvidence.checks.accountOwnersMatchExpectedPrograms && stateEvidence.checks.accountBytesDecodedLocally);
  const sources=new Set(observations.map(x=>x.endpoint)).size;
  return {
    level:checked?(sources>1?'rpc-cross-checked':'rpc-observed'):'unverified',
    nameStateChecked:checked,rpcSources:sources,rpcTrustRequired:true,
    fullyTrustless:false,accountInclusionProof:false,signedTowerSupermajorityVerified:false,
    signedAuthorizedTransition:false,
    transactionEd25519Signature:Boolean(authorizedUpdateProof?.transactionEd25519Signature),
    antInstructionDecodedLocally:Boolean(authorizedUpdateProof?.antInstructionDecodedLocally),
    targetMatchesExpected:Boolean(authorizedUpdateProof?.targetMatchesExpected),
    transactionInclusionCryptographicallyProven:false,
    transitionJournalVerified:Boolean(transitionJournal?.ok),
    individualValidatorVoteSignaturesVerified:Boolean(chainStateProof?.embeddedTowerVoteProofsVerified),
    embeddedTowerVerifiedVoteAccounts:chainStateProof?.embeddedTowerVerifiedVoteAccounts||0,
    stakeWeightsAuthenticated:false,chainStateProofVerified:false,
    reasons:[
      checked?`Name record read from ${sources} RPC sources; PDA, program owner and account format checked locally.`:'Current name record could not be verified.',
      'The name-to-content mapping still requires trust in the RPC response.',
      'Content signatures are checked separately. A native account inclusion proof is not available.',
      ...(authorizedUpdateProof?['ANT transaction signature checked; this alone does not prove current state or transaction inclusion.']:[]),
      ...(chainStateProof?.embeddedTowerVoteProofsVerified?['Vote signatures checked. Stake weights are not bound to consensus, so this is not a two-thirds consensus proof.']:[])
    ]
  };
}
