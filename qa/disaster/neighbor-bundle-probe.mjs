// Bounded experimental discovery from a known page's weave position. Inputs
// come only from its verified HTML and the pre-existing Mesh location record.
import crypto from 'node:crypto';
import {requestJson,rangeFromRoot,fetchDataItemDirect} from '../../src/arweave-direct.mjs';
import {walkBundleHeaders} from '../../src/bundle-walker.mjs';
const integer=(b,reverse=false)=>{const bytes=Buffer.from(b);if(reverse)bytes.reverse();const n=Number(BigInt('0x'+bytes.toString('hex')));if(!Number.isSafeInteger(n))throw new Error('neighbor_integer');return n;};
export async function probeNeighbors(anchor,targetIds,{peer,seeds,signal,onStep=()=>{}}){
 const result={scope:'Bounded backward carrier scan from page anchor, without public gateway metadata',scanned:[],matches:[],verified:[]},wanted=new Set(targetIds);
 let at=anchor.carrierWeaveBase,networkBytes=0,lastPeer=peer;
 const onBytes=n=>{networkBytes+=n;if(networkBytes>32*1024*1024)throw new Error('neighbor_network_budget');};
 const readChunk=async offset=>{
  const candidates=[lastPeer,...seeds.filter(p=>p.host!==lastPeer.host||p.port!==lastPeer.port)];let next=0,found;
  await Promise.all(Array.from({length:8},async()=>{while(next<candidates.length&&!found&&!signal.aborted){const p=candidates[next++];try{
   const j=await requestJson({...p,path:'/chunk/'+offset,timeout:2000,signal,onBytes});
   const body=Buffer.from(j.chunk,'base64url'),proof=Buffer.from(j.data_path,'base64url'),end=Number(j.absolute_end_offset);
   if(proof.length<64||(proof.length-64)%96||proof.length>8192||body.length!==Number(j.chunk_size)||body.length>262144||offset>end||offset<=end-body.length)continue;
   if(!crypto.createHash('sha256').update(body).digest().equals(proof.subarray(-64,-32)))continue;
   const relativeEnd=integer(proof.subarray(-32)),base=end-relativeEnd;
   if(!Number.isSafeInteger(base)||base<0||base>=at)continue;
   found??={peer:p,base,end,relativeEnd};
  }catch{}}}));signal.throwIfAborted();if(!found)throw new Error('neighbor_chunk_missing');lastPeer=found.peer;return found;
 };
 for(let i=0;i<64&&at>0&&wanted.size;i++){
  signal.throwIfAborted();const row={boundary:at};result.scanned.push(row);
  try{
   const c=await readChunk(at);row.weaveBase=c.base;row.bytesBack=anchor.carrierWeaveBase-c.base;
   if(row.bytesBack>4*1024*1024*1024)throw new Error('neighbor_distance_budget');
   at=c.base;
   const meta={start:c.base+1,size:c.relativeEnd},options={signal,peerSeeds:seeds,chunkCache:new Map(),timeout:3000,onNetworkBytes:onBytes};
   const namespace='neighbor:'+c.base,read=(offset,size)=>rangeFromRoot(c.peer,namespace,offset,size,meta,options);
   const first=await read(0,32),count=integer(first,true);row.count=count;
   if(count<1||count>262144||32+count*64>meta.size)throw new Error('neighbor_not_binary_bundle');
   // The final chunk's proof supplies the complete carrier length here.
   if(c.end!==row.boundary)throw new Error('neighbor_boundary_gap');
   const walk=await walkBundleHeaders({rootTxId:anchor.anchor.dataId,rootSize:meta.size,read,maxItems:64,signal,onEntries:entries=>{
    for(const [dataId,loc] of entries)if(wanted.has(dataId)){
     const hint={dataId,weaveOffset:c.base+loc.rootOffset,itemSize:loc.itemSize};
     result.matches.push(hint);wanted.delete(dataId);
    }
   }});row.complete=walk.complete;row.checked=walk.checked;row.bundles=walk.bundles;
  }catch(e){row.error=e.message;if(!row.weaveBase||/budget/.test(e.message)){result.stop=e.message;break;}}
  result.networkBytes=networkBytes;onStep(result);
 }
 for(const hint of result.matches){try{const item=await fetchDataItemDirect({dataId:hint.dataId,location:hint,signal});result.verified.push({dataId:hint.dataId,bytes:item.payload.length,sha256:item.payloadSha256,contentSignatureVerified:true});}catch(e){result.verified.push({dataId:hint.dataId,error:e.message});}}
 result.networkBytes=networkBytes;return result;
}
