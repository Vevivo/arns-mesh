import fs from 'node:fs';
import crypto from 'node:crypto';
import { verifySavedAntUpdateProof } from './ant-update-proof.mjs';
import { peerIdFromPublicKey } from './common.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function bodyOf(e){
  return {
    schema:e.schema,seq:e.seq,name:e.name,antId:e.antId,undername:e.undername,
    target:e.target,slot:e.slot,blockTime:e.blockTime,
    solanaSignature:e.solanaSignature,previousEntryHash:e.previousEntryHash,
    antUpdateProof:e.antUpdateProof
  };
}
function canonicalBody(e){return JSON.stringify(bodyOf(e));}
export function entryHash(e){return sha(Buffer.from(canonicalBody(e)))}

export function createJournalEntry({seq,name,antId,undername='@',target,slot,blockTime,solanaSignature,previousEntryHash=null,antUpdateProof,identity}){
  const entry={schema:'arns-mesh-transition-journal/v1',seq,name,antId,undername,target,slot,blockTime,solanaSignature,previousEntryHash,antUpdateProof};
  const hash=entryHash(entry);
  const signature=crypto.sign(null,Buffer.from(hash,'hex'),crypto.createPrivateKey(identity.privateKeyPem)).toString('base64url');
  return {...entry,entryHash:hash,attestation:{peerId:peerIdFromPublicKey(identity.publicKeyPem),publicKeyPem:identity.publicKeyPem,signature}};
}
export function verifyJournal(journal,{expectedName,expectedAntId,expectedHeadTarget}={}){
  if(!journal||journal.schema!=='arns-mesh-transition-journal-file/v1'||!Array.isArray(journal.entries)||journal.entries.length<1) throw new Error('invalid_journal');
  let prev=null,lastSlot=-1;
  const verified=[];
  for(let i=0;i<journal.entries.length;i++){
    const e=journal.entries[i];
    if(e.schema!=='arns-mesh-transition-journal/v1'||e.seq!==i) throw new Error('journal_sequence_invalid');
    if(expectedName&&e.name!==expectedName) throw new Error('journal_name_mismatch');
    if(expectedAntId&&e.antId!==expectedAntId) throw new Error('journal_ant_mismatch');
    if(e.previousEntryHash!==prev) throw new Error('journal_hash_chain_broken');
    if(Number(e.slot)<=lastSlot) throw new Error('journal_slot_not_monotonic');
    const hash=entryHash(e); if(hash!==e.entryHash) throw new Error('journal_entry_hash_invalid');
    if(peerIdFromPublicKey(e.attestation.publicKeyPem)!==e.attestation.peerId) throw new Error('journal_attestor_id_invalid');
    const sigOk=crypto.verify(null,Buffer.from(hash,'hex'),crypto.createPublicKey(e.attestation.publicKeyPem),Buffer.from(e.attestation.signature,'base64url'));
    if(!sigOk) throw new Error('journal_attestation_signature_invalid');
    const p=verifySavedAntUpdateProof(e.antUpdateProof,{name:e.name,antId:e.antId,expectedTxId:e.target});
    if(!p?.transactionEd25519Signature||!p?.antInstructionDecodedLocally||!p?.targetMatchesExpected) throw new Error('journal_transition_proof_invalid');
    if(p.signature!==e.solanaSignature||Number(p.slot)!==Number(e.slot)) throw new Error('journal_transition_metadata_mismatch');
    verified.push({seq:e.seq,slot:e.slot,target:e.target,entryHash:hash,solanaSignature:e.solanaSignature});
    prev=hash; lastSlot=Number(e.slot);
  }
  const head=journal.entries.at(-1);
  if(expectedHeadTarget&&head.target!==expectedHeadTarget) throw new Error('journal_head_target_mismatch');
  return {ok:true,entries:verified.length,head:{seq:head.seq,slot:head.slot,target:head.target,entryHash:head.entryHash},verified};
}
export function loadAndVerifyJournal(name,opts={}){
  const file=(opts.dir||process.env.ARNS_JOURNAL_DIR||'journals')+'/'+name+'.json';
  if(!fs.existsSync(file)) return null;
  const journal=JSON.parse(fs.readFileSync(file,'utf8'));
  return {file,journal,result:verifyJournal(journal,opts)};
}
