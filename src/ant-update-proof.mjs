import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bs58 from 'bs58';
import { getAntRecordPDA } from '@ar.io/sdk';
import { getSetRecordInstructionDataDecoder, getSetRecordDiscriminatorBytes } from '@ar.io/solana-contracts/ant';

const ANT_PROGRAM='2MWexMHfMhGJwMHv9Qm9YAVCqjUFUJwDJAysW4oCUGk5';

function shortvec(buf,off){
  let n=0,shift=0,i=off;
  while(true){
    const b=buf[i++];
    n|=(b&0x7f)<<shift;
    if(!(b&0x80)) break;
    shift+=7;
    if(shift>28) throw Error('shortvec too large');
  }
  return [n,i];
}

function parseTx(raw){
  let o=0,n;
  [n,o]=shortvec(raw,o);
  const sigs=[];
  for(let i=0;i<n;i++){sigs.push(raw.subarray(o,o+64));o+=64}
  const msg=raw.subarray(o);
  let m=0,version='legacy';
  if(msg[m]&0x80){version=msg[m]&0x7f;m++}
  const header={
    numRequiredSignatures:msg[m++],
    numReadonlySignedAccounts:msg[m++],
    numReadonlyUnsignedAccounts:msg[m++]
  };
  let keyCount;[keyCount,m]=shortvec(msg,m);
  const keys=[];
  for(let i=0;i<keyCount;i++){keys.push(bs58.encode(msg.subarray(m,m+32)));m+=32}
  const recentBlockhash=bs58.encode(msg.subarray(m,m+32));m+=32;
  let ixCount;[ixCount,m]=shortvec(msg,m);
  const instructions=[];
  for(let i=0;i<ixCount;i++){
    const programIdIndex=msg[m++];
    let ac;[ac,m]=shortvec(msg,m);
    const accounts=[...msg.subarray(m,m+ac)];m+=ac;
    let dl;[dl,m]=shortvec(msg,m);
    const data=msg.subarray(m,m+dl);m+=dl;
    instructions.push({programIdIndex,programId:keys[programIdIndex],accounts,data});
  }
  return {version,header,keys,recentBlockhash,instructions,signatures:sigs,messageBytes:msg};
}

function verifyEd25519(pubkeyBase58,message,signature){
  const raw=bs58.decode(pubkeyBase58);
  const spki=Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(raw)]);
  return crypto.verify(null,message,crypto.createPublicKey({key:spki,format:'der',type:'spki'}),signature);
}

function decodeMatchingSetRecord(parsed,{antId,recordPda,undername,expectedTxId}){
  for(const ix of parsed.instructions){
    if(ix.programId!==ANT_PROGRAM) continue;
    if(!ix.data.subarray(0,8).equals(Buffer.from(getSetRecordDiscriminatorBytes())))continue;
    const data=getSetRecordInstructionDataDecoder().decode(ix.data);
    const accounts=ix.accounts.map(i=>parsed.keys[i]);
    if(accounts[0]!==antId||accounts[3]!==recordPda) continue;
    const decoded={
      undername:String(data.undername),
      target:String(data.target),
      targetProtocol:Number(data.targetProtocol),
      ttlSeconds:Number(data.ttlSeconds),
      priority:data.priority?.__option==='Some'?Number(data.priority.value):null,
      recordOwner:data.recordOwner?.__option==='Some'?String(data.recordOwner.value):null,
      accounts
    };
    if(decoded.undername!==undername) continue;
    if(expectedTxId&&decoded.target!==expectedTxId) continue;
    return decoded;
  }
  return null;
}

export function verifySavedAntUpdateProof(bundle,{name,antId,undername='@',expectedTxId}={}){
  if(bundle?.schema!=='arns-mesh-ant-update-proof/v1') throw Error('unsupported_ant_proof_schema');
  const p=bundle.proof;
  if(!p?.rawTransactionBase64) throw Error('raw_transaction_missing');
  const raw=Buffer.from(p.rawTransactionBase64,'base64');
  const parsed=parseTx(raw);
  if(!parsed.signatures.length) throw Error('transaction_signature_missing');
  if(parsed.signatures.length!==parsed.header.numRequiredSignatures||!parsed.signatures.every((sig,i)=>verifyEd25519(parsed.keys[i],parsed.messageBytes,sig)))throw Error('required_transaction_signature_invalid');
  const signer=parsed.keys[0];
  if(!verifyEd25519(signer,parsed.messageBytes,parsed.signatures[0])) throw Error('offline_ed25519_invalid');
  const sig=bs58.encode(parsed.signatures[0]);
  if(sig!==p.signature) throw Error('offline_signature_id_mismatch');
  if(name&&bundle.name!==name) throw Error('offline_name_mismatch');
  if(antId&&p.antId!==antId) throw Error('offline_ant_mismatch');
  const decoded=decodeMatchingSetRecord(parsed,{antId:p.antId,recordPda:p.recordPda,undername,expectedTxId});
  if(!decoded) throw Error('offline_setrecord_instruction_missing_or_mismatch');
  return {ok:true,signature:sig,signer,slot:Number(p.slot),antId:p.antId,recordPda:p.recordPda,undername:decoded.undername,target:decoded.target,targetProtocol:decoded.targetProtocol,ttlSeconds:decoded.ttlSeconds,transactionEd25519Signature:true,antInstructionDecodedLocally:true,targetMatchesExpected:expectedTxId?decoded.target===expectedTxId:null,transactionInclusionCryptographicallyProven:false};
}

