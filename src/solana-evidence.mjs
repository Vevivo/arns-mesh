import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import { MAINNET_PROGRAM_IDS,getArnsRecordPDA,getAntRecordPDA,deserializeArnsRecord,deserializeAntRecord } from '@ar.io/sdk';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
import {rpcIp as rpc} from './ip-transport.mjs';
import {observeAntProgram} from './ant-program.mjs';
function acct(r,address,owner){
 if(!r?.value)throw new Error('account_not_found:'+address);
 if(!Number.isSafeInteger(r.context?.slot)||r.context.slot<0)throw new Error('invalid_account_slot');
 if(r.value.owner!==owner)throw new Error('owner_mismatch:'+address);
 const raw=Buffer.from(r.value.data[0],'base64');
 const stateCanonical=JSON.stringify({
  address,lamports:String(r.value.lamports),owner:r.value.owner,
  executable:Boolean(r.value.executable),rentEpoch:String(r.value.rentEpoch),
  dataBase64:raw.toString('base64')
 });
 return{address,slot:Number(r.context.slot),owner:r.value.owner,raw,rawSha256:sha(raw),
  stateSha256:sha(Buffer.from(stateCanonical)),lamports:String(r.value.lamports),
  executable:Boolean(r.value.executable),rentEpoch:String(r.value.rentEpoch)};
}
export async function buildArNSStateEvidence(name,{seedFile=process.env.SOLANA_RPC_SEEDS||'solana-rpc-seeds.json',signal}={}){
 const parts=String(name).toLowerCase().split('_');
 const undername=parts.length>1?parts.shift():'@';const baseName=parts.join('_');
 const seeds=[...new Map(JSON.parse(fs.readFileSync(seedFile,'utf8')).filter(x=>net.isIP(x.host)).map(x=>[x.host+':'+x.port,x])).values()];const observations=[];
 for(const seed of seeds){signal?.throwIfAborted();const endpoint='http://'+(seed.host.includes(':')?'['+seed.host+']':seed.host)+':'+seed.port;const call=(method,params)=>rpc(endpoint,method,params,{signal});try{
  const [arnsPda]=await getArnsRecordPDA(baseName);
  const ar=acct(await call('getAccountInfo',[String(arnsPda),{encoding:'base64',commitment:'finalized'}]),String(arnsPda),MAINNET_PROGRAM_IDS.arns);
  const arns=deserializeArnsRecord(ar.raw);
  if(arns.name!==baseName)throw new Error('decoded_name_mismatch');
  if(arns.type==='lease'&&Number(arns.endTimestamp)*1000<Date.now())throw new Error('arns_lease_expired');
  const antProgram=await observeAntProgram(rpc,endpoint,arns.processId,{slot:ar.slot,signal});
  const [antPda]=await getAntRecordPDA(arns.processId,undername,antProgram.programId);
  const an=acct(await call('getAccountInfo',[String(antPda),{encoding:'base64',commitment:'finalized',minContextSlot:antProgram.slot}]),String(antPda),antProgram.programId);
  if(an.slot<antProgram.slot)throw new Error('ant_account_slot_rollback');
  const ant=deserializeAntRecord(an.raw);
  if(ant.targetProtocol!==0||! /^[A-Za-z0-9_-]{43}$/.test(ant.transactionId))throw new Error('unsupported_target_protocol');
  if(ant.undername!==undername||String(ant.mint)!==String(arns.processId))throw new Error('decoded_ant_binding_mismatch');
  const slot=Math.min(ar.slot,an.slot);
  let commitment=null,block=null;if(process.env.MESH_DEEP_PROOFS==='1'){try{commitment=await call('getBlockCommitment',[slot])}catch{};try{block=await call('getBlock',[slot,{commitment:'finalized',transactionDetails:'none',rewards:false}])}catch{};}
  const deepStake=commitment?.commitment?.slice(31).reduce((a,b)=>a+Number(b||0),0)||0,totalStake=Number(commitment?.totalStake||0);
  observations.push({ok:true,endpoint,name,pdaVerified:true,ownersVerified:true,decodedLocally:true,
   arns:{address:ar.address,slot:ar.slot,owner:ar.owner,rawSha256:ar.rawSha256,stateSha256:ar.stateSha256,processId:arns.processId,type:arns.type,undernameLimit:arns.undernameLimit},
   ant:{address:an.address,slot:an.slot,owner:an.owner,programId:antProgram.programId,assetObservedSlot:antProgram.slot,rawSha256:an.rawSha256,stateSha256:an.stateSha256,txId:ant.transactionId,ttlSeconds:ant.ttlSeconds},
   slot,finalizedBlock:block?{blockhash:block.blockhash,previousBlockhash:block.previousBlockhash,parentSlot:block.parentSlot}:null,
   stakeCommitment:commitment?{totalStake,deepStake,deepRatio:totalStake?deepStake/totalStake:null}:null});
 }catch(e){observations.push({ok:false,endpoint,error:String(e.message||e)})}}
 const good=observations.filter(x=>x.ok);if(!good.length)throw new Error('no_state_evidence:'+JSON.stringify(observations));const first=good[0];
 if(good.some(x=>x.arns.rawSha256!==first.arns.rawSha256||x.ant.rawSha256!==first.ant.rawSha256||x.ant.programId!==first.ant.programId))throw new Error('rpc_sources_conflict');
 if(good.length<Number(process.env.SOLANA_RPC_QUORUM||1))throw new Error('state_source_quorum_not_reached');
 const evidence={schema:'arns-mesh-solana-evidence/v1',generatedAt:new Date().toISOString(),name,txId:first.ant.txId,antId:first.arns.processId,programIds:{arns:MAINNET_PROGRAM_IDS.arns,ant:first.ant.programId},checks:{pdaDerivedLocally:true,accountOwnersMatchExpectedPrograms:true,accountBytesDecodedLocally:true,rawAccountHashesCaptured:true,finalizedCommitmentRequested:true,blockCommitmentCaptured:Boolean(first.stakeCommitment),accountInclusionMerkleProof:false},trustLevel:'finalized-rpc-evidence-not-inclusion-proof',observations};
 evidence.evidenceSha256=sha(Buffer.from(JSON.stringify(evidence)));return evidence;
}
if(process.argv[1]?.endsWith('solana-evidence.mjs'))console.log(JSON.stringify(await buildArNSStateEvidence(process.argv[2]||'vevivo'),null,2));
