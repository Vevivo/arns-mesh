import bs58 from 'bs58';
const U64_MAX=(1n<<64n)-1n;

// Offline instruction decoding only. No embedded RPC provider.
function readShortU16(buf,state){
  let value=0,shift=0;
  for(let i=0;i<3;i++){
    if(state.p>=buf.length) throw new Error('short_u16_truncated');
    const b=buf[state.p++];
    value|=(b&0x7f)<<shift;
    if((b&0x80)===0) return value;
    shift+=7;
  }
  throw new Error('short_u16_invalid');
}
function readLebU64(buf,state){
  let value=0n,shift=0n;
  for(let i=0;i<10;i++){
    if(state.p>=buf.length) throw new Error('leb128_truncated');
    const b=BigInt(buf[state.p++]);
    value|=(b&0x7fn)<<shift;
    if((b&0x80n)===0n) return value;
    shift+=7n;
  }
  throw new Error('leb128_invalid');
}
export function decodeTowerSyncInstruction(data){
  const buf=Buffer.from(data);
  if(buf.length<4+8+1+32+1+32) throw new Error('tower_sync_too_short');
  const variant=buf.readUInt32LE(0);
  if(variant!==14&&variant!==15) throw new Error('not_tower_sync');
  const st={p:4};
  const rootRaw=buf.readBigUInt64LE(st.p);st.p+=8;
  const root=rootRaw===U64_MAX?null:Number(rootRaw);
  const count=readShortU16(buf,st);
  let slot=root??0;
  const lockouts=[];
  for(let i=0;i<count;i++){
    const offset=readLebU64(buf,st);
    if(st.p>=buf.length) throw new Error('tower_confirmation_truncated');
    const confirmationCount=buf[st.p++];
    slot+=Number(offset);
    lockouts.push({slot,confirmationCount,offset:offset.toString()});
  }
  if(st.p+32>buf.length) throw new Error('tower_hash_truncated');
  const hash=bs58.encode(buf.subarray(st.p,st.p+32));st.p+=32;
  if(st.p>=buf.length) throw new Error('tower_timestamp_tag_truncated');
  const timestampTag=buf[st.p++];
  let timestamp=null;
  if(timestampTag===1){
    if(st.p+8>buf.length) throw new Error('tower_timestamp_truncated');
    timestamp=Number(buf.readBigInt64LE(st.p));st.p+=8;
  }else if(timestampTag!==0) throw new Error('tower_timestamp_tag_invalid');
  if(st.p+32>buf.length) throw new Error('tower_block_id_truncated');
  const blockId=bs58.encode(buf.subarray(st.p,st.p+32));st.p+=32;
  let switchProofHash=null;
  if(variant===15){
    if(st.p+32>buf.length) throw new Error('tower_switch_hash_truncated');
    switchProofHash=bs58.encode(buf.subarray(st.p,st.p+32));st.p+=32;
  }
  if(st.p!==buf.length) throw new Error('tower_sync_trailing_bytes:'+String(buf.length-st.p));
  return {variant,root,lockouts,lastVoteSlot:lockouts.at(-1)?.slot??null,hash,timestamp,blockId,switchProofHash};
}
