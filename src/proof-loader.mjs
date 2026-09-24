import fs from 'node:fs';
import {verifyArNSAccountProofBundle} from './account-proof-verifier.mjs';
export function loadVerifiedAccountProof(name,{dir=process.env.ARNS_ACCOUNT_PROOF_DIR||'proofs'}={}){
  const p=dir+'/'+name+'.json';if(!fs.existsSync(p))return null;
  const bundle=JSON.parse(fs.readFileSync(p,'utf8'));const result=verifyArNSAccountProofBundle(bundle);
  return {path:p,bundle,result};
}
