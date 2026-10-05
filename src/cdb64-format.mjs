// Bounded CDB64/MessagePack codec, shared by offline reader and online preparation.
const idPattern=/^[A-Za-z0-9_-]{43}$/;
const safe=n=>{const value=Number(n);if(!Number.isSafeInteger(value)||value<0)throw new Error('index_integer_out_of_range');return value;};
export function cdbHash(key){let hash=5381n;for(const byte of key)hash=BigInt.asUintN(64,hash*33n^BigInt(byte));return hash;}
export function decodeIndexValue(buffer){
 let pos=0;
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||pos+n>buffer.length)throw new Error('index_value_truncated');const b=buffer.subarray(pos,pos+n);pos+=n;return b;};
 const parse=(depth=0)=>{
  if(depth>4)throw new Error('index_value_depth');const code=take(1)[0];
  if(code<128)return code;
  if(code>=0xa0&&code<=0xbf)return take(code&31).toString('utf8');
  if(code>=0x90&&code<=0x9f){const n=code&15;if(n>10)throw new Error('index_path_too_long');return Array.from({length:n},()=>parse(depth+1));}
  if(code>=0x80&&code<=0x8f){const n=code&15;if(n>8)throw new Error('index_value_map');const out=Object.create(null);for(let i=0;i<n;i++){const key=parse(depth+1);if(!['r','p','i','d','s'].includes(key)||Object.hasOwn(out,key))throw new Error('index_value_key');out[key]=parse(depth+1);}return out;}
  if(code===0xc4){const n=take(1)[0];if(n!==32)throw new Error('index_id_size');return take(n);}
  if(code===0xcc)return take(1)[0];
  if(code===0xcd)return take(2).readUInt16BE();
  if(code===0xce)return take(4).readUInt32BE();
  if(code===0xcf)return safe(take(8).readBigUInt64BE());
  if(code===0xcb)return safe(take(8).readDoubleBE());
  throw new Error('unsupported_index_value_type:'+code);
 };
 const result=parse();if(pos!==buffer.length||!result||typeof result!=='object'||Array.isArray(result))throw new Error('invalid_index_value');
 const ids=result.p||(result.r?[result.r]:[]);
 if(!Array.isArray(ids)||!ids.length||ids.some(x=>!Buffer.isBuffer(x)||x.length!==32))throw new Error('invalid_index_path');
 const path=ids.map(x=>x.toString('base64url'));
 return {rootTxId:path[0],path:path.slice(1),...(result.i!==undefined?{rootOffset:safe(result.i)}:{}),...(result.d!==undefined?{dataOffset:safe(result.d)}:{}),...(result.s!==undefined?{itemSize:safe(result.s)}:{})};
}
export async function lookupCdb64(read,size,dataId,{maxProbes=128}={}){
 if(!idPattern.test(dataId)||!Number.isSafeInteger(size)||size<4096)throw new Error('invalid_index_lookup');
 const bounded=async(offset,length)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+length>size)throw new Error('index_pointer_out_of_bounds');const bytes=await read(offset,length);if(bytes.length!==length)throw new Error('index_read_truncated');return bytes;};
 const key=Buffer.from(dataId,'base64url'),hash=cdbHash(key);
 const header=await bounded(Number(hash&255n)*16,16);
 const table=safe(header.readBigUInt64LE(0)),slots=safe(header.readBigUInt64LE(8));
 if(!slots)return null;
 if(table<4096||table+slots*16>size)throw new Error('index_table_out_of_bounds');
 let slot=Number((hash>>8n)%BigInt(slots));
 for(let i=0;i<Math.min(slots,maxProbes);i++,slot=(slot+1)%slots){
  const row=await bounded(table+slot*16,16),position=safe(row.readBigUInt64LE(8));
  if(!position)return null;
  if(row.readBigUInt64LE(0)!==hash)continue;
  if(position<4096||position>=table)throw new Error('index_record_out_of_bounds');
  const record=await bounded(position,16),keyLength=safe(record.readBigUInt64LE()),valueLength=safe(record.readBigUInt64LE(8));
  if(keyLength!==32||valueLength<1||valueLength>1024||position+16+keyLength+valueLength>table)throw new Error('invalid_index_record');
  const content=await bounded(position+16,keyLength+valueLength);
  if(content.subarray(0,32).equals(key))return decodeIndexValue(content.subarray(32));
 }
 throw new Error('index_probe_limit');
}
