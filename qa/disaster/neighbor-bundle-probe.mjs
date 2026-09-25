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
 const readChunk=async boundary=>{
  // Post-2.5 transaction padding can leave the preceding logical boundary
  // outside stored bytes. Try bounded earlier probes; never infer bytes from it.
  let found;const errors=[];
  for(const distance of [0,1,131072,262144]){
  const offset=boundary-distance,candidates=[lastPeer,...seeds.filter(p=>p.host!==lastPeer.host||p.port!==lastPeer.port).slice(0,8)];let next=0;
  await Promise.all(Array.from({length:8},async()=>{while(next<candidates.length&&!found&&!signal.aborted){const p=candidates[next++];try{
   const j=await requestJson({...p,path:'/chunk/'+offset,timeout:2000,signal,onBytes});
   const body=Buffer.from(j.chunk,'base64url'),proof=Buffer.from(j.data_path,'base64url'),end=Number(j.absolute_end_offset);
   if(proof.length<64||(proof.length-64)%96||proof.length>8192||body.length!==Number(j.chunk_size)||body.length>262144||end>boundary||end<offset-262144)continue;
   if(!crypto.createHash('sha256').update(body).digest().equals(proof.subarray(-64,-32)))continue;
   const relativeEnd=integer(proof.subarray(-32)),base=end-relativeEnd;
   if(!Number.isSafeInteger(base)||base<0||base>=at)continue;
   found??={peer:p,base,end,relativeEnd};
  }catch(e){if(errors.length<8)errors.push(e.message);}}}));signal.throwIfAborted();if(found)break;
  }
  if(!found)throw new Error('neighbor_chunk_missing: '+errors.join(';'));lastPeer=found.peer;return found;
 };
 for(let i=0;i<64&&at>0&&wanted.size;i++){
  signal.throwIfAborted();const row={boundary:at};result.scanned.push(row);
  try{
   const c=await readChunk(at);row.weaveBase=c.base;row.bytesBack=anchor.carrierWeaveBase-c.base;
   if(row.bytesBack>4*1024*1024*1024)throw new Error('neighbor_distance_budget');
   at=c.base;
   const meta={start:c.base+1,size:row.boundary-c.base},options={signal,peerSeeds:seeds,chunkCache:new Map(),timeout:3000,onNetworkBytes:onBytes};
   const namespace='neighbor:'+c.base,read=(offset,size)=>rangeFromRoot(c.peer,namespace,offset,size,meta,options);
   const first=await read(0,32),count=integer(first,true);row.count=count;
   if(count<1||count>262144||32+count*64>meta.size)throw new Error('neighbor_not_binary_bundle');
   const header=await read(0,32+count*64);let total=header.length;
   for(let n=0;n<count;n++){const size=integer(header.subarray(32+n*64,64+n*64),true);if(size<1||!Number.isSafeInteger(total+size)||total+size>meta.size)throw new Error('neighbor_layout');total+=size;}
   row.padding=meta.size-total;meta.size=total;
   if(row.padding>262144)throw new Error('neighbor_boundary_gap');
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
