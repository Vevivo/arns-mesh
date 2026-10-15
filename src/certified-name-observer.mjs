import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import {MAINNET_PROGRAM_IDS,MPL_CORE_PROGRAM_ID,getArnsRecordPDA,getAntRecordPDA} from '@ar.io/sdk';
import {PurchaseType,getArnsRecordDecoder} from '@ar.io/solana-contracts/arns';
import {getAntRecordDecoder} from '@ar.io/solana-contracts/ant';
import {PluginType,getAssetV1Decoder,getPluginHeaderV1Decoder,getPluginRegistryV1Decoder,getPluginDecoder} from '@ar.io/solana-contracts/mpl-core';
import {address} from '@solana/kit';
import {rpcIp} from './ip-transport.mjs';
import {validArName,validDataId} from './swarm-common.mjs';
const MAX_ACCOUNT_BYTES=256*1024;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const disc=name=>crypto.createHash('sha256').update('account:'+name).digest().subarray(0,8);
const fail=message=>{throw new Error(message);};
function slot(value,floor=0){if(!Number.isSafeInteger(value)||value<floor)fail('certified_observation_slot_invalid');return value;}
function time(now){const value=now();if(!Number.isSafeInteger(value)||value<0)fail('certified_observation_time_invalid');return value;}
function bytes(value,owner,label){
 if(!value||Array.isArray(value)||typeof value!=='object')fail('certified_account_missing:'+label);
 if(value.owner!==owner||value.executable!==false)fail('certified_account_owner_or_executable_invalid:'+label);
 if(!Array.isArray(value.data)||value.data.length!==2||value.data[1]!=='base64'||typeof value.data[0]!=='string')fail('certified_account_encoding_invalid:'+label);
 const encoded=value.data[0];
 if(encoded.length>Math.ceil(MAX_ACCOUNT_BYTES/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))fail('certified_account_data_invalid:'+label);
 const raw=Buffer.from(encoded,'base64');
 if(!raw.length||raw.length>MAX_ACCOUNT_BYTES||raw.toString('base64')!==encoded)fail('certified_account_data_invalid:'+label);
 return raw;
}
function discriminator(raw,name){if(raw.length<8||!raw.subarray(0,8).equals(disc(name)))fail('certified_account_discriminator_invalid:'+name);}
function registry(raw,baseName,nowMs){
 discriminator(raw,'ArnsRecord');const d=getArnsRecordDecoder().decode(raw);
 if(d.name!==baseName)fail('certified_registry_name_mismatch');
 const antId=String(address(String(d.ant))),start=Number(d.startTimestamp);
 if(!Number.isSafeInteger(start)||start<0||start>Math.floor(nowMs/1000))fail('certified_registration_start_invalid');
 let leaseEndsAt=null;
 if(d.purchaseType===PurchaseType.Lease){
  if(d.endTimestamp?.__option!=='Some')fail('certified_lease_end_missing');
  const end=Number(d.endTimestamp.value);
  if(!Number.isSafeInteger(end)||end<=Math.floor(nowMs/1000))fail('certified_lease_expired');
  leaseEndsAt=end;
 }else if(d.purchaseType!==PurchaseType.Permabuy)fail('certified_registration_type_invalid');
 return{antId,leaseEndsAt};
}
// MPL Key: AssetV1=1, PluginHeaderV1=3, PluginRegistryV1=4.
// Unlike SDK best-effort discovery, certificate issuance rejects malformed assets.
function program(raw){
 if(raw[0]!==1)fail('certified_asset_not_asset_v1');
 const[asset,end]=getAssetV1Decoder().read(raw,0);address(String(asset.owner));
 if(end===raw.length)return String(MAINNET_PROGRAM_IDS.ant);
 if(!Number.isSafeInteger(end)||end<1||end+9>raw.length||raw[end]!==3)fail('certified_asset_plugin_header_invalid');
 const[header,afterHeader]=getPluginHeaderV1Decoder().read(raw,end),at=Number(header.pluginRegistryOffset);
 if(!Number.isSafeInteger(at)||at<afterHeader||at>=raw.length||raw[at]!==4)fail('certified_asset_plugin_registry_invalid');
 const[r]=getPluginRegistryV1Decoder().read(raw,at);
 if(!Array.isArray(r.registry)||r.registry.length>128)fail('certified_asset_plugin_registry_invalid');
 const entries=r.registry.filter(x=>x.pluginType===PluginType.Attributes);
 if(entries.length>1)fail('certified_asset_attributes_ambiguous');
 if(!entries.length)return String(MAINNET_PROGRAM_IDS.ant);
 const offset=Number(entries[0].offset);
 if(!Number.isSafeInteger(offset)||offset<afterHeader||offset>=at)fail('certified_asset_attributes_offset_invalid');
 const[p,after]=getPluginDecoder().read(raw,offset);
 if(p.__kind!=='Attributes'||after>at)fail('certified_asset_attributes_invalid');
 const attrs=p.fields?.[0]?.attributeList;
 if(!Array.isArray(attrs))fail('certified_asset_attributes_invalid');
 const found=attrs.filter(x=>x.key==='ANT Program');
 if(found.length>1)fail('certified_asset_program_ambiguous');
 if(!found.length)return String(MAINNET_PROGRAM_IDS.ant);
 if(typeof found[0].value!=='string')fail('certified_asset_program_invalid');
 return String(address(found[0].value));
}
function record(raw,antId,undername,antProgramId){
 discriminator(raw,'AntRecord');const d=getAntRecordDecoder().decode(raw);
 if(String(d.mint)!==antId||d.undername!==undername)fail('certified_ant_record_binding_mismatch');
 if(d.targetProtocol!==0||!validDataId(d.target))fail('certified_target_protocol_unsupported');
 if(!Number.isSafeInteger(d.ttlSeconds)||d.ttlSeconds<0||d.ttlSeconds>0xffffffff)fail('certified_record_ttl_invalid');
 // Canonical ario-ant enforces these limits. BYO-ANT retains its u32 metadata.
 if(antProgramId===String(MAINNET_PROGRAM_IDS.ant)&&(d.ttlSeconds<60||d.ttlSeconds>86400))fail('certified_record_ttl_invalid');
 return{txId:d.target,ttlSeconds:d.ttlSeconds};
}
function endpoints(input){
 if(!Array.isArray(input)||!input.length||input.length>16)fail('certified_rpc_seeds_invalid');
 const result=new Set();
 for(const s of input){
  if(!net.isIP(s?.host||'')||!Number.isInteger(s.port)||s.port<1||s.port>65535)fail('certified_rpc_seed_invalid');
  result.add('http://'+(s.host.includes(':')?'['+s.host+']':s.host)+':'+s.port);
 }
 return[...result];
}
async function atEndpoint(name,o,endpoint){
 const{chainId,genesisHash,registryProgramId,minContextSlot,signal,rpc,now,baseName,undername}=o;
 const call=(method,params)=>{signal?.throwIfAborted();return rpc(endpoint,method,params,{signal});};
 if(await call('getGenesisHash',[])!==genesisHash)fail('certified_genesis_mismatch');
 const[registryPda]=await getArnsRecordPDA(baseName,address(registryProgramId));let floor=minContextSlot;
 for(let attempt=0;attempt<3;attempt++){
  signal?.throwIfAborted();
  const a=await call('getAccountInfo',[String(registryPda),{encoding:'base64',commitment:'finalized',minContextSlot:floor}]);
  const arSlot=slot(a?.context?.slot,floor),discovered=registry(bytes(a.value,registryProgramId,'registry'),baseName,time(now)),antId=discovered.antId;
  const b=await call('getAccountInfo',[antId,{encoding:'base64',commitment:'finalized',minContextSlot:arSlot}]);
  const assetSlot=slot(b?.context?.slot,arSlot),antProgramId=program(bytes(b.value,String(MPL_CORE_PROGRAM_ID),'asset'));
  const[recordPda]=await getAntRecordPDA(address(antId),undername,address(antProgramId));
  const c=await call('getMultipleAccounts',[[String(registryPda),antId,String(recordPda)],{encoding:'base64',commitment:'finalized',minContextSlot:assetSlot}]);
  const contextSlot=slot(c?.context?.slot,assetSlot);
  if(!Array.isArray(c.value)||c.value.length!==3)fail('certified_coherent_accounts_invalid');
  const nowMs=time(now),arRaw=bytes(c.value[0],registryProgramId,'registry'),ar=registry(arRaw,baseName,nowMs);
  if(ar.antId!==antId){floor=contextSlot;continue;}
  const assetRaw=bytes(c.value[1],String(MPL_CORE_PROGRAM_ID),'asset'),finalProgram=program(assetRaw);
  if(finalProgram!==antProgramId){floor=contextSlot;continue;}
  const antRaw=bytes(c.value[2],antProgramId,'record'),ant=record(antRaw,antId,undername,antProgramId);
  signal?.throwIfAborted();
  const accountHashes={registry:sha(arRaw),asset:sha(assetRaw),record:sha(antRaw)};
  const binding={chainId,genesisHash,name,registryProgramId,registryPda:String(registryPda),antId,antProgramId,recordPda:String(recordPda),accountHashes};
  return{schema:'arns-mesh-coherent-name-observation/v1',...binding,...ant,slot:contextSlot,observedAt:new Date(nowMs).toISOString(),leaseEndsAt:ar.leaseEndsAt,coherentStateHash:sha(JSON.stringify(binding)),
   provenance:{kind:'coherent-finalized-rpc',endpoint,coherentAccountRead:true,strictAssetValidation:true,finalizedCommitmentRequested:true,genesisChecked:true,rpcTrustRequired:true,accountInclusionProof:false}};
 }
 fail('certified_name_binding_changed_repeatedly');
}
export async function buildCertifiedArNSObservation(name,{
 chainId,genesisHash,registryProgramId=String(MAINNET_PROGRAM_IDS.arns),
 seedFile=process.env.SOLANA_RPC_SEEDS||'solana-rpc-seeds.json',rpcSeeds,minContextSlot=0,timeoutMs=15000,signal,rpc=rpcIp,now=Date.now
}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail('certified_observation_timeout_invalid');
 signal=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
 signal.throwIfAborted();
 if(typeof name!=='string'||!validArName(name)||name!==name.toLowerCase())fail('certified_name_invalid');
 if(chainId!=='solana:'+genesisHash)fail('certified_chain_id_invalid');
 // Genesis is an RPC chain-identification token, not an account public key.
 if(typeof genesisHash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{16,64}$/.test(genesisHash))fail('certified_genesis_invalid');
 address(registryProgramId);slot(minContextSlot);time(now);
 const parts=name.split('_'),undername=parts.length>1?parts.shift():'@',baseName=parts.join('_');
 if(!baseName||!undername)fail('certified_name_invalid');
 const good=[],failures=[];
 for(const endpoint of endpoints(rpcSeeds??JSON.parse(fs.readFileSync(seedFile,'utf8')))){
  signal?.throwIfAborted();
  try{good.push(await atEndpoint(name,{chainId,genesisHash,registryProgramId,minContextSlot,signal,rpc,now,baseName,undername},endpoint));}
  catch(error){signal?.throwIfAborted();failures.push({endpoint,error:String(error.message||error).slice(0,240)});}
 }
 if(!good.length){const e=new Error('certified_name_observation_unavailable');e.observations=failures;throw e;}
 const first=good[0];
 if(good.some(x=>x.coherentStateHash!==first.coherentStateHash))fail('certified_rpc_sources_conflict');
 const oldest=good.reduce((a,b)=>Date.parse(a.observedAt)<=Date.parse(b.observedAt)?a:b);
 return{...first,slot:Math.min(...good.map(x=>x.slot)),observedAt:oldest.observedAt,
  provenance:{...first.provenance,endpoints:good.map(x=>x.provenance.endpoint),rpcSources:good.length,contexts:good.map(x=>({endpoint:x.provenance.endpoint,slot:x.slot,observedAt:x.observedAt}))},sourceFailures:failures};
}
