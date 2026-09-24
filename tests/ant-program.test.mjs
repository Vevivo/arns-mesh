import test from 'node:test';
import assert from 'node:assert/strict';
import {MAINNET_PROGRAM_IDS,MPL_CORE_PROGRAM_ID,getAntRecordPDA} from '@ar.io/sdk';
import {Key,PluginType,getAssetV1Encoder,getPluginHeaderV1Encoder,getPluginRegistryV1Encoder,getPluginEncoder} from '@ar.io/solana-contracts/mpl-core';
import {readAntProgram,observeAntProgram} from '../src/ant-program.mjs';
const mint='11111111111111111111111111111111';
function asset(program){
 const prefix=Buffer.from(getAssetV1Encoder().encode({key:Key.AssetV1,owner:mint,updateAuthority:{__kind:'None'},name:'fixture',uri:'',seq:null}));
 const plugin=Buffer.from(getPluginEncoder().encode({__kind:'Attributes',fields:[{attributeList:[{key:'ANT Program',value:program}]}]}));
 const header=Buffer.from(getPluginHeaderV1Encoder().encode({key:Key.PluginHeaderV1,pluginRegistryOffset:BigInt(prefix.length+9+plugin.length)}));
 const registry=Buffer.from(getPluginRegistryV1Encoder().encode({key:Key.PluginRegistryV1,registry:[{pluginType:PluginType.Attributes,authority:{__kind:'Owner'},offset:BigInt(prefix.length+9)}],externalRegistry:[]}));
 return {owner:MPL_CORE_PROGRAM_ID,data:[Buffer.concat([prefix,header,plugin,registry]).toString('base64'),'base64']};
}
test('asset-selected ANT program changes PDA derivation; missing plugins use the canonical program',async()=>{
 const account=asset(mint);assert.equal(readAntProgram(account),mint);
 assert.notEqual(String((await getAntRecordPDA(mint,'docs',readAntProgram(account)))[0]),String((await getAntRecordPDA(mint,'docs'))[0]));
 assert.equal(readAntProgram(null),MAINNET_PROGRAM_IDS.ant);
 assert.equal(readAntProgram({...account,owner:mint}),MAINNET_PROGRAM_IDS.ant);
 assert.equal(readAntProgram({owner:MPL_CORE_PROGRAM_ID,data:['AA==','base64']}),MAINNET_PROGRAM_IDS.ant);
 assert.throws(()=>readAntProgram(asset('invalid-program')));
});
test('asset RPC observation keeps the requested slot floor and rejects rollback',async()=>{
 let request;
 const rpc=async(endpoint,method,params)=>{request={endpoint,method,params};return {context:{slot:200},value:asset(mint)};};
 const result=await observeAntProgram(rpc,'http://127.0.0.1:8899',mint,{slot:100});
 assert.equal(result.programId,mint);assert.equal(result.slot,200);assert.equal(request.params[1].minContextSlot,100);
 await assert.rejects(observeAntProgram(rpc,request.endpoint,mint,{slot:201}),/invalid_ant_asset_observation/);
});
