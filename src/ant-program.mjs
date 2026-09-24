// Read-only compatibility with @ar.io/sdk 4.3.1 SolanaANTReadable.fromAsset.
// Layout: @ar.io/solana-contracts 1.3.0, Metaplex Core AssetV1 plugins.
import {MPL_CORE_PROGRAM_ID,MAINNET_PROGRAM_IDS} from '@ar.io/sdk';
import {PluginType,getAssetV1Decoder,getPluginHeaderV1Decoder,getPluginRegistryV1Decoder,getPluginDecoder} from '@ar.io/solana-contracts/mpl-core';
import {address} from '@solana/kit';

export function readAntProgram(account){
 if(!account||account.owner!==MPL_CORE_PROGRAM_ID)return MAINNET_PROGRAM_IDS.ant;
 let value=null;
 try{
  const raw=Buffer.from(account.data[0],'base64');
  const [,end]=getAssetV1Decoder().read(raw,0);if(end>=raw.length)return MAINNET_PROGRAM_IDS.ant;
  const [header]=getPluginHeaderV1Decoder().read(raw,end),at=Number(header.pluginRegistryOffset);
  if(!Number.isSafeInteger(at)||at<end||at>=raw.length)return MAINNET_PROGRAM_IDS.ant;
  const [registry]=getPluginRegistryV1Decoder().read(raw,at);
  for(const entry of registry.registry){
   if(entry.pluginType!==PluginType.Attributes)continue;
   const [plugin]=getPluginDecoder().read(raw,Number(entry.offset));
   if(plugin.__kind==='Attributes')value=plugin.fields[0].attributeList.find(x=>x.key==='ANT Program')?.value??null;
   break;
  }
 }catch{return MAINNET_PROGRAM_IDS.ant;}
 // An explicit malformed program must fail, not silently change its meaning.
 return value===null?MAINNET_PROGRAM_IDS.ant:address(value);
}
export async function observeAntProgram(rpc,endpoint,mint,{slot,signal}={}){
 const response=await rpc(endpoint,'getAccountInfo',[String(mint),{encoding:'base64',commitment:'finalized',minContextSlot:slot}],{signal});
 if(!Number.isSafeInteger(response?.context?.slot)||response.context.slot<slot||Array.isArray(response.value)||response.value!==null&&typeof response.value!=='object')throw new Error('invalid_ant_asset_observation');
 return {programId:readAntProgram(response.value),slot:response.context.slot,assetExists:response.value!==null};
}
