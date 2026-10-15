import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {MAINNET_PROGRAM_IDS,MPL_CORE_PROGRAM_ID,getArnsRecordPDA,getAntRecordPDA} from '@ar.io/sdk';
import {PurchaseType,getArnsRecordEncoder} from '@ar.io/solana-contracts/arns';
import {getAntRecordEncoder} from '@ar.io/solana-contracts/ant';
import {Key,PluginType,getAssetV1Encoder,getPluginHeaderV1Encoder,getPluginRegistryV1Encoder,getPluginEncoder} from '@ar.io/solana-contracts/mpl-core';
import {buildCertifiedArNSObservation} from '../src/certified-name-observer.mjs';
const ID_A='11111111111111111111111111111111',ID_B=String(MAINNET_PROGRAM_IDS.core),PROGRAM=String(MAINNET_PROGRAM_IDS.ant),ALT=String(MAINNET_PROGRAM_IDS.gar);
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',NOW=Date.parse('2026-10-15T12:00:00Z'),TARGET='A'.repeat(43);
const version={major:1,minor:0,patch:0},none={__option:'None'},some=value=>({__option:'Some',value});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const wire=(raw,owner)=>({owner,executable:false,lamports:1000000,rentEpoch:0,data:[Buffer.from(raw).toString('base64'),'base64']});
function registry(mint,extras={}){
 return wire(getArnsRecordEncoder().encode({nameHash:crypto.createHash('sha256').update('vevivo').digest(),owner:ID_A,ant:mint,purchaseType:PurchaseType.Permabuy,startTimestamp:1n,endTimestamp:none,undernameLimit:100,purchasePrice:1n,bump:1,name:'vevivo',version,...extras}),String(MAINNET_PROGRAM_IDS.arns));
}
function asset(programId=null,{attributes=null}={}){
 const base=Buffer.from(getAssetV1Encoder().encode({key:Key.AssetV1,owner:ID_A,updateAuthority:{__kind:'None'},name:'ANT',uri:'',seq:none}));
 if(!programId&&!attributes)return wire(base,String(MPL_CORE_PROGRAM_ID));
 const list=attributes??[{key:'ANT Program',value:programId}];
 const p=Buffer.from(getPluginEncoder().encode({__kind:'Attributes',fields:[{attributeList:list}]}));
 const offset=base.length+9,at=offset+p.length;
 const header=Buffer.from(getPluginHeaderV1Encoder().encode({key:Key.PluginHeaderV1,pluginRegistryOffset:BigInt(at)}));
 const tail=Buffer.from(getPluginRegistryV1Encoder().encode({key:Key.PluginRegistryV1,registry:[{pluginType:PluginType.Attributes,authority:{__kind:'Owner'},offset:BigInt(offset)}],externalRegistry:[]}));
 return wire(Buffer.concat([base,header,p,tail]),String(MPL_CORE_PROGRAM_ID));
}
function record(mint,programId=PROGRAM,extras={}){
 return wire(getAntRecordEncoder().encode({mint,undername:'@',target:TARGET,targetProtocol:0,ttlSeconds:900,priority:some(0),owner:none,lastReconciledOwner:ID_A,bump:1,version,...extras}),programId);
}
const options={chainId:'solana:'+GENESIS,genesisHash:GENESIS,rpcSeeds:[{host:'127.0.0.1',port:8899}],now:()=>NOW,timeoutMs:10000};
async function stub({mint=ID_A,programId=PROGRAM,batch,discoveryAsset,genesis=GENESIS,afterCall,baseSlot=100}={}){
 const calls=[];let attempt=0,currentMint=mint,currentProgram=programId;
 const[registryPda]=await getArnsRecordPDA('vevivo');
 const rpc=async(endpoint,method,params,{signal})=>{
  signal?.throwIfAborted();calls.push({endpoint,method,params});
  if(afterCall)await afterCall(method,calls.length,signal);
  if(method==='getGenesisHash')return genesis;
  if(method==='getAccountInfo'){
   const stage=params[0]===String(registryPda)?'registry':'asset';
   const floor=params[1].minContextSlot;
   if(stage==='registry')return {context:{slot:Math.max(baseSlot+attempt*3,floor)},value:registry(currentMint)};
   assert.equal(params[0],currentMint);
   return {context:{slot:Math.max(baseSlot+attempt*3+1,floor)},value:discoveryAsset??asset(currentProgram===PROGRAM?null:currentProgram)};
  }
  assert.equal(method,'getMultipleAccounts');const[expectedPda]=await getAntRecordPDA(currentMint,'@',currentProgram);
  assert.deepEqual(params[0],[String(registryPda),currentMint,String(expectedPda)]);
  assert.equal(params[1].commitment,'finalized');assert.equal(params[1].encoding,'base64');
  const reply={context:{slot:Math.max(baseSlot+attempt*3+2,params[1].minContextSlot)},value:[registry(currentMint),asset(currentProgram===PROGRAM?null:currentProgram),record(currentMint,currentProgram)]};
  const action=await batch?.({attempt,reply,mint:currentMint,programId:currentProgram,params});
  attempt++;if(action?.mint)currentMint=action.mint;if(action?.programId)currentProgram=action.programId;
  return reply;
 };
 return {rpc,calls};
}
async function rejected(setup,pattern,extra={}){
 const s=await stub(setup);
 await assert.rejects(()=>buildCertifiedArNSObservation('vevivo',{...options,...extra,rpc:s.rpc}),e=>{assert.match(e.message+' '+JSON.stringify(e.observations),pattern);return true;});
 return s;
}
const check=test;
await check('stable plain name and token genesis; hashes from coherent batch',async()=>{
 const s=await stub();const r=await buildCertifiedArNSObservation('vevivo',{...options,rpc:s.rpc,minContextSlot:99});
 assert.equal(r.antId,ID_A);assert.equal(r.antProgramId,PROGRAM);assert.equal(r.txId,TARGET);assert.equal(r.slot,102);
 assert.equal(r.provenance.coherentAccountRead,true);assert.equal(r.provenance.accountInclusionProof,false);
 assert.equal(r.accountHashes.registry,hash(Buffer.from(registry(ID_A).data[0],'base64')));
 assert.equal(s.calls.length,4);
});
await check('registry reassignment retries before reading missing old accounts',async()=>{
 const s=await stub({batch:({attempt,reply})=>{if(attempt===0){reply.value=[registry(ID_B),null,null];return{mint:ID_B};}}});
 const r=await buildCertifiedArNSObservation('vevivo',{...options,rpc:s.rpc});assert.equal(r.antId,ID_B);assert.equal(r.slot,105);assert.equal(s.calls.length,7);
});
await check('asset program switch rederives record and supports BYO TTL',async()=>{
 const s=await stub({batch:({attempt,reply,mint,programId})=>{if(attempt===0){reply.value[1]=asset(ALT);reply.value[2]=null;return{programId:ALT};}reply.value[2]=record(mint,programId,{ttlSeconds:1});}});
 const r=await buildCertifiedArNSObservation('vevivo',{...options,rpc:s.rpc});assert.equal(r.antProgramId,ALT);assert.equal(r.ttlSeconds,1);assert.equal(s.calls.length,7);
});
await check('three moving bindings bounded',async()=>{const s=await rejected({batch:({reply,mint})=>{const next=mint===ID_A?ID_B:ID_A;reply.value=[registry(next),null,null];return{mint:next};}},/certified_name_binding_changed_repeatedly/);assert.equal(s.calls.length,10);});
await check('batch rollback rejected',()=>rejected({batch:({reply})=>{reply.context.slot=99;}},/certified_observation_slot_invalid/));
await check('wrong vector rejected',()=>rejected({batch:({reply})=>{reply.value.pop();}},/certified_coherent_accounts_invalid/));
await check('asset missing is not canonical fallback',()=>rejected({discoveryAsset:null,batch:({reply})=>{reply.value[1]=null;}},/certified_account_missing:asset/));
await check('wrong program owner rejected',()=>rejected({batch:({reply})=>{reply.value[2].owner=ALT;}},/certified_account_owner_or_executable_invalid/));
await check('record mint mismatch rejected',()=>rejected({batch:({reply})=>{reply.value[2]=record(ID_B);}},/certified_ant_record_binding_mismatch/));
await check('canonical TTL bound enforced',()=>rejected({batch:({reply})=>{reply.value[2]=record(ID_A,PROGRAM,{ttlSeconds:1});}},/certified_record_ttl_invalid/));
await check('invalid discriminator rejected',()=>rejected({batch:({reply})=>{const b=Buffer.from(reply.value[2].data[0],'base64');b[0]^=255;reply.value[2].data[0]=b.toString('base64');}},/certified_account_discriminator_invalid/));
await check('duplicate program traits rejected',()=>rejected({discoveryAsset:asset(null,{attributes:[{key:'ANT Program',value:PROGRAM},{key:'ANT Program',value:ALT}]})},/certified_asset_program_ambiguous/));
await check('malformed plugin layout rejected',()=>{const a=asset(ALT),b=Buffer.from(a.data[0],'base64');b[b.length-1]=255;a.data[0]=b.subarray(0,b.length-3).toString('base64');return rejected({discoveryAsset:a},/certified_name_observation_unavailable/);});
await check('wrong genesis rejected before account calls',async()=>{const s=await rejected({genesis:'X'.repeat(32)},/certified_genesis_mismatch/);assert.equal(s.calls.length,1);});
await check('lease missing expiry rejected',()=>rejected({batch:({reply})=>{reply.value[0]=registry(ID_A,{purchaseType:PurchaseType.Lease,endTimestamp:none});}},/certified_lease_end_missing/));
await check('expired lease rejected',()=>rejected({batch:({reply})=>{reply.value[0]=registry(ID_A,{purchaseType:PurchaseType.Lease,endTimestamp:some(BigInt(Math.floor(NOW/1000)-1))});}},/certified_lease_expired/));
await check('abort stops before following request',async()=>{
 const ac=new AbortController(),s=await stub({afterCall:method=>{if(method==='getAccountInfo')ac.abort(new Error('cancel-test'));}});
 await assert.rejects(()=>buildCertifiedArNSObservation('vevivo',{...options,rpc:s.rpc,signal:ac.signal}),/cancel-test/);assert.equal(s.calls.length,2);
});
await check('overall timeout is enforced without a network socket',async()=>{
 let calls=0;
 const rpc=async(endpoint,method,params,{signal})=>{calls++;return new Promise((resolve,reject)=>{const keepAlive=setTimeout(()=>reject(new Error('timeout-not-enforced')),1000);signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(signal.reason);},{once:true});});};
 await assert.rejects(()=>buildCertifiedArNSObservation('vevivo',{...options,rpc,timeoutMs:10}),e=>e.name==='TimeoutError');assert.equal(calls,1);
});
await check('policy chain domain must match pinned genesis',async()=>{const s=await stub();await assert.rejects(()=>buildCertifiedArNSObservation('vevivo',{...options,chainId:'solana-mainnet-beta',rpc:s.rpc}),/certified_chain_id_invalid/);assert.equal(s.calls.length,0);});
