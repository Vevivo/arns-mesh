import crypto from 'node:crypto';
const h=(...xs)=>crypto.createHash('sha256').update(Buffer.concat(xs.map(x=>Buffer.isBuffer(x)?x:Buffer.from(x,'hex')))).digest();

export function verifyBinaryMerkleProof({leafHash,proof,rootHash}){
  let cur=Buffer.from(leafHash,'hex');
  for(const step of proof){
    const sib=Buffer.from(step.hash,'hex');
    cur=step.side==='left'?h(sib,cur):h(cur,sib);
  }
  return cur.toString('hex')===String(rootHash).toLowerCase();
}

export function verifyArNSAccountProofBundle(bundle,{currentStateHashEra='accounts-lattice-hash'}={}){
  if(!bundle||bundle.schema!=='arns-mesh-account-proof/v2') return {ok:false,error:'unsupported_schema'};
  if(currentStateHashEra==='accounts-lattice-hash' && bundle.proofType==='accounts-delta-merkle'){
    return {ok:false,error:'legacy_accounts_delta_proof_not_consensus_binding_on_accounts_lattice_hash_era'};
  }
  if(bundle.proofType==='native-account-inclusion'){
    return {ok:false,error:'native_account_inclusion_not_supported_by_current_solana_accounts_lattice_hash'};
  }
  if(bundle.proofType==='external-zk') return {ok:false,error:'external_zk_verifier_not_implemented'};
  return {ok:false,error:'unsupported_proof_type'};
}
