// Diagnostic only: follow a known item's absolute weave position to its
// containing ANS-104 bundle. Every resulting position remains an untrusted hint.
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import {requestJson,rangeFromRoot,syncRecordCovers} from '../../src/arweave-direct.mjs';
import {parseDataItem,idFromSignature} from '../../src/ans104.mjs';
const integer=(bytes,reverse=false)=>{const b=Buffer.from(bytes);if(reverse)b.reverse();const n=BigInt('0x'+b.toString('hex'));if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('unsafe_bundle_integer');return Number(n);};
export async function probeAnchor(anchor,targetIds,{signal,onSource=()=>{}}){
 const seeds=JSON.parse(fs.readFileSync(process.env.ARWEAVE_PEERS)),pool=new Map(seeds.map(p=>[p.host+':'+p.port,p]));
 const lists=await Promise.allSettled(seeds.slice(0,5).map(p=>requestJson({...p,path:'/peers',timeout:2000,signal})));
 for(const r of lists)if(r.status==='fulfilled'&&Array.isArray(r.value))for(const item of r.value){const m=String(item).match(/^([0-9.]+):(\d+)$/);if(m&&net.isIP(m[1])===4&&Number(m[2])>0&&Number(m[2])<65536)pool.set(item,{host:m[1],port:Number(m[2])});if(pool.size>=512)break;}
 const peers=[...pool.values()];let index=0,found;
 await Promise.all(Array.from({length:12},async()=>{while(!found&&index<peers.length&&!signal.aborted){const peer=peers[index++];try{
  const offset=anchor.weaveOffset+1,record=await requestJson({...peer,path:`/data_sync_record/${offset-1}/${offset}/1`,timeout:1200,maxBytes:16384,signal});
  if(!syncRecordCovers(record,offset))continue;
  const chunk=await requestJson({...peer,path:'/chunk/'+offset,timeout:4000,signal});
  const body=Buffer.from(chunk.chunk,'base64url'),proof=Buffer.from(chunk.data_path,'base64url'),end=Number(chunk.absolute_end_offset);
  if(proof.length<64||(proof.length-64)%96||proof.length>8192||body.length!==Number(chunk.chunk_size)||body.length>262144||offset>end||offset<=end-body.length)continue;
  if(!crypto.createHash('sha256').update(body).digest().equals(proof.subarray(-64,-32)))continue;
  const relativeEnd=integer(proof.subarray(-32)),weaveBase=end-relativeEnd;
  if(!Number.isSafeInteger(weaveBase)||weaveBase<0||weaveBase>anchor.weaveOffset)continue;
  found??={peer,weaveBase,chunk:{end,size:body.length,relativeEnd,proofBytes:proof.length}};
 }catch{}}}));
 if(!found)throw new Error('anchor_chunk_not_found');
 onSource({peer:found.peer,seeds:peers});
 const result={anchor,chunk:found.chunk,carrierWeaveBase:found.weaveBase,levels:[],matches:[],positionVerified:false};
 const meta={start:found.weaveBase+1,size:Number.MAX_SAFE_INTEGER-found.weaveBase-1},options={signal,peerSeeds:seeds,chunkCache:new Map(),timeout:4000};
 let base=0,expectedSize=null,totalHeaders=0;
 for(let depth=0;depth<=8;depth++){
  const first=await rangeFromRoot(found.peer,'anchor-probe',base,32,meta,options),count=integer(first,true),headerSize=32+64*count;
  if(count<1||count>262144||(expectedSize!==null&&headerSize>expectedSize)||(totalHeaders+=headerSize)>32*1024*1024)throw new Error('anchor_header_budget');
  const header=await rangeFromRoot(found.peer,'anchor-probe',base,headerSize,meta,options),entries=[];let relative=headerSize;
  for(let i=0;i<count;i++){const p=32+i*64,size=integer(header.subarray(p,p+32),true),id=header.subarray(p+32,p+64).toString('base64url');if(size<1||!Number.isSafeInteger(relative+size))throw new Error('invalid_anchor_layout');entries.push({id,size,relative});relative+=size;}
  if(expectedSize!==null&&relative!==expectedSize)throw new Error('anchor_nested_size_mismatch');
  if(depth===0)meta.size=relative;
  const absolute=found.weaveBase+base,inside=entries.find(e=>anchor.weaveOffset>=absolute+e.relative&&anchor.weaveOffset<absolute+e.relative+e.size);
  const matches=entries.filter(e=>targetIds.includes(e.id)).map(e=>({dataId:e.id,weaveOffset:absolute+e.relative,itemSize:e.size,positionVerified:false}));result.matches.push(...matches);
  result.levels.push({depth,count,headerSize,totalSize:relative,weaveBase:absolute,containingItem:inside,matches});
  if(!inside){result.stop='anchor_not_inside_bundle';break;}
  if(inside.id===anchor.dataId){result.anchorPositionMatches=absolute+inside.relative===anchor.weaveOffset&&inside.size===anchor.itemSize;result.stop='anchor_found';break;}
  const prefix=await rangeFromRoot(found.peer,'anchor-probe',base+inside.relative,Math.min(8192,inside.size),meta,options),parsed=parseDataItem(prefix);
  if(idFromSignature(parsed.rawSignature).toString('base64url')!==inside.id||parsed.offsets.dataStart+32>inside.size)throw new Error('invalid_nested_anchor_item');
  base+=inside.relative+parsed.offsets.dataStart;expectedSize=inside.size-parsed.offsets.dataStart;
 }
 return result;
}
