// Bounded native-ledger search near a known page location. Block/bundle
// metadata is untrusted routing only; later content downloads verify full IDs
// and signatures. No gateway metadata or content-specific positions are used.
import {requestJson,inspectBundleOnPeer} from './arweave-direct.mjs';
import {normalizeLocation} from './location-index.mjs';
import fs from 'node:fs';
export async function discoverNearbyLocations(anchor,targetIds,{signal:callerSignal,seedsFile=process.env.ARWEAVE_PEERS,maxBytes=96*1024*1024,timeoutMs=180000,onStep=()=>{},onFound=()=>{}}={}){
 anchor=normalizeLocation(anchor.dataId,anchor);
 if(anchor.weaveOffset===undefined||!Array.isArray(targetIds)||targetIds.length>32||targetIds.some(id=>!/^[A-Za-z0-9_-]{43}$/.test(id))||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>96*1024*1024||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000)throw new Error('invalid_nearby_discovery_request');
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs),...(callerSignal?[callerSignal]:[])]);
 signal.throwIfAborted();
 const peers=JSON.parse(fs.readFileSync(seedsFile)),wanted=new Set(targetIds);
 const result={scope:'Native block binary search from an existing page weave position, then up to 64 preceding blocks; no external publication metadata',anchorOffset:anchor.weaveOffset,probes:0,blocks:[],matches:[],networkBytes:0};
 const account=n=>{result.networkBytes+=n;if(result.networkBytes>maxBytes){const error=new Error('nearby_discovery_byte_budget');controller.abort(error);throw error;}};
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
     for(const entry of inspected.parsed.entries)if(wanted.has(entry.id)&&entry.size<=32*1024*1024){
      const hint=normalizeLocation(entry.id,{weaveOffset:inspected.meta.start-1+entry.relativeOffset,itemSize:entry.size,...(anchor.preparation?{preparation:anchor.preparation}:{})});
      await onFound(hint);result.matches.push(hint);wanted.delete(entry.id);
     }
    }catch(e){row.bundleErrors=(row.bundleErrors||0)+1;if(/budget/.test(e.message))throw e;}
   }
  }catch(e){row.error=e.message;if(/budget/.test(e.message))break;}
  onStep(result);
 }
 signal.throwIfAborted();return result;
}
