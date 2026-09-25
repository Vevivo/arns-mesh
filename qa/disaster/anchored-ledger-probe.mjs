// Experimental, bounded native-ledger search around a known verified page.
// No public gateway metadata, hard-coded asset IDs or block heights are inputs.
import {requestJson,inspectBundleOnPeer,fetchDataItemDirect} from '../../src/arweave-direct.mjs';
import fs from 'node:fs';
export async function probeAnchoredLedger(anchor,targetIds,{signal,onStep=()=>{}}){
 const peers=JSON.parse(fs.readFileSync(process.env.ARWEAVE_PEERS)),wanted=new Set(targetIds);
 const result={scope:'Native block binary search from an existing page weave position, then up to 64 preceding blocks; no external publication metadata',anchorOffset:anchor.weaveOffset,probes:0,blocks:[],matches:[],verified:[],networkBytes:0};
 const account=n=>{result.networkBytes+=n;if(result.networkBytes>96*1024*1024)throw new Error('anchor_ledger_byte_budget');};
 let preferred=0;
 const get=async(route,extra={})=>{let error;for(let i=0;i<peers.length;i++){const index=(preferred+i)%peers.length,peer=peers[index];try{const value=await requestJson({...peer,path:route,signal,timeout:5000,onBytes:account,...extra});preferred=index;return {peer,value};}catch(e){error=e;signal.throwIfAborted();if(/budget/.test(e.message))throw e;}}throw error;};
 const {value:info}=await get('/info');if(info.network!=='arweave.N.1'||!Number.isSafeInteger(info.height))throw new Error('anchor_ledger_network');
 let lo=0,hi=info.height;
 while(lo<hi){
  const height=Math.floor((lo+hi)/2),{value:block}=await get('/block/height/'+height,{maxBytes:16*1024*1024});result.probes++;
  const end=Number(block.weave_size);if(block.height!==height||!Number.isSafeInteger(end)||end<0)throw new Error('anchor_block_metadata');
  if(end>=anchor.weaveOffset+anchor.itemSize)hi=height;else lo=height+1;
 }
 result.anchorHeight=lo;onStep(result);
 for(let height=lo;height>=Math.max(0,lo-64)&&wanted.size;height--){
  signal.throwIfAborted();const row={height};result.blocks.push(row);
  try{
   const {peer,value:block}=await get('/block/height/'+height,{summarizeBlock:true,maxBytes:16*1024*1024});
   if(block.height!==height||!Array.isArray(block.txs))throw new Error('anchor_block_list');
   row.transactions=block.txs.length;row.checked=0;row.bundles=0;row.skipped=Math.max(0,block.txs.length-256);
   let next=0;const candidates=[];
   await Promise.all(Array.from({length:8},async()=>{while(next<Math.min(256,block.txs.length)&&!signal.aborted){const txId=block.txs[next++];try{
    const {value:tx}=await get('/tx/'+txId),tags=Object.fromEntries((tx.tags||[]).map(t=>[Buffer.from(t.name,'base64url').toString(),Buffer.from(t.value,'base64url').toString()]));
    row.checked++;if(tags['Bundle-Format']==='binary'&&tags['Bundle-Version']==='2.0.0')candidates.push(txId);
   }catch(e){row.metadataErrors=(row.metadataErrors||0)+1;if(/budget/.test(e.message))throw e;}}}));
   for(const txId of candidates){
    signal.throwIfAborted();try{
     const inspected=await inspectBundleOnPeer(peer,txId,{signal,peerSeeds:peers,onNetworkBytes:account});row.bundles++;
     for(const entry of inspected.parsed.entries)if(wanted.has(entry.id)){
      result.matches.push({dataId:entry.id,weaveOffset:inspected.meta.start-1+entry.relativeOffset,itemSize:entry.size,rootTxId:txId,blockHeight:height,positionVerified:false});wanted.delete(entry.id);
     }
    }catch(e){row.bundleErrors=(row.bundleErrors||0)+1;if(/budget/.test(e.message))throw e;}
   }
  }catch(e){row.error=e.message;if(/budget/.test(e.message))break;}
  onStep(result);
 }
 for(const hint of result.matches){try{const item=await fetchDataItemDirect({dataId:hint.dataId,location:{weaveOffset:hint.weaveOffset,itemSize:hint.itemSize},signal});result.verified.push({dataId:hint.dataId,bytes:item.payload.length,sha256:item.payloadSha256,contentSignatureVerified:true});}catch(e){result.verified.push({dataId:hint.dataId,error:e.message});}}
 return result;
}
