import {parseDataItem,deserializeTags,idFromSignature} from './ans104.mjs';

const uint256=b=>{if(b.length!==32)throw new Error('bundle_integer_truncated');const n=Number(BigInt('0x'+Buffer.from(b).reverse().toString('hex')));if(!Number.isSafeInteger(n))throw new Error('bundle_integer_overflow');return n;};

// Walk headers only, including containers larger than the client's payload limit.
// cursor is JSON-serializable and advances only after the corresponding read and
// index write succeed. These records are hints, NOT verified content or inclusion.
export async function walkBundleHeaders({rootTxId,rootSize,read,cursor={},onEntries=()=>{},maxItems=32,signal}){
 if(!Number.isSafeInteger(rootSize)||rootSize<32||!/^[A-Za-z0-9_-]{43}$/.test(rootTxId))throw new Error('invalid_bundle_root');
 if(cursor.rootTxId&&cursor.rootTxId!==rootTxId)throw new Error('bundle_cursor_root_mismatch');
 if(cursor.rootSize!==undefined&&cursor.rootSize!==rootSize)throw new Error('bundle_cursor_size_mismatch');
 cursor.rootTxId=rootTxId;cursor.rootSize=rootSize;
 cursor.frames??=[{base:0,size:rootSize,next:0,path:[],indexed:false}];
 let checked=0,bundles=0;
 const loaded=new Map();
 while(cursor.frames.length){
  signal?.throwIfAborted();
  const frame=cursor.frames.at(-1);
  if(cursor.frames.length>9||frame.path.length>8||!Number.isSafeInteger(frame.base)||frame.base<0||!Number.isSafeInteger(frame.size)||frame.size<32||frame.base+frame.size>rootSize||!Number.isInteger(frame.next)||frame.next<0)throw new Error('invalid_bundle_cursor');
  let entries=loaded.get(frame.base);
  if(!entries){
   const count=uint256(await read(frame.base,32)),headerSize=32+count*64;
   if(count>262144||headerSize>frame.size)throw new Error('invalid_nested_bundle_count');
   const header=await read(frame.base,headerSize);if(header.length!==headerSize)throw new Error('bundle_header_truncated');
   entries=[];let offset=headerSize;
   for(let i=0;i<count;i++){
    const size=uint256(header.subarray(32+i*64,64+i*64));
    if(size<1||!Number.isSafeInteger(offset+size)||offset+size>frame.size)throw new Error('invalid_nested_bundle_layout');
    entries.push({id:header.subarray(64+i*64,96+i*64).toString('base64url'),size,offset:frame.base+offset});offset+=size;
   }
   if(offset!==frame.size||frame.next>entries.length)throw new Error('invalid_nested_bundle_layout');
   frame.total=entries.length;loaded.set(frame.base,entries);
  }
  if(!frame.indexed){
   await onEntries(entries.filter(x=>x.size<=32*1024*1024).map(x=>[x.id,{rootTxId,rootOffset:x.offset,itemSize:x.size,path:[...frame.path]}]));
   frame.indexed=true;bundles++;
  }
  if(frame.next===entries.length){cursor.frames.pop();loaded.delete(frame.base);continue;}
  if(checked>=maxItems)return {complete:false,checked,bundles,cursor};
  const entry=entries[frame.next];
  const prefix=await read(entry.offset,Math.min(8192,entry.size));
  const item=parseDataItem(prefix),o=item.offsets;
  if(prefix.length<o.tagsStart+16||item.rawSignature.length!==item.signatureLength||![0,1].includes(prefix[o.targetStart])||![0,1].includes(prefix[o.anchorStart]))throw new Error('invalid_item_header');
  const tagBytes=prefix.readBigUInt64LE(o.tagsStart+8),tagCount=prefix.readBigUInt64LE(o.tagsStart);
  if(tagBytes>4096n||tagCount>128n||!Number.isSafeInteger(o.dataStart)||o.dataStart>entry.size||o.dataStart>prefix.length||o.dataStart!==o.tagsStart+16+Number(tagBytes))throw new Error('invalid_item_tags');
  if(Buffer.from(idFromSignature(item.rawSignature)).toString('base64url')!==entry.id)throw new Error('item_header_id_mismatch');
  const tags=deserializeTags(item.rawTags);if(tags.length!==Number(tagCount))throw new Error('item_tag_count_mismatch');
  const has=(name,value)=>tags.some(t=>t.name===name&&t.value===value);
  if(has('Bundle-Format','binary')&&has('Bundle-Version','2.0.0')){
   if(frame.path.length>=8)throw new Error('bundle_nesting_limit');
   if(entry.size-o.dataStart<32)throw new Error('nested_bundle_truncated');
   cursor.frames.push({base:entry.offset+o.dataStart,size:entry.size-o.dataStart,next:0,path:[...frame.path,entry.id],indexed:false});
  }
  frame.next++;checked++;
 }
 return {complete:true,checked,bundles,cursor};
}
