import Arweave from 'arweave';
import {generateTransactionChunks} from 'arweave/node/lib/merkle.js';
import {sha256} from './common.mjs';

// A transfer envelope, not a new Arweave format. Peers retain the original
// transaction header and payload so every reader can verify both locally.
const MAGIC=Buffer.from([0x57,0x46,0x4d,0x4c,0x31,0,1,0]);
const PREFIX_BYTES=MAGIC.length+4;
export const MAX_L1_PAYLOAD_BYTES=32*1024*1024;
export const MAX_L1_HEADER_BYTES=64*1024;
export const MAX_CONTENT_BYTES=MAX_L1_PAYLOAD_BYTES+MAX_L1_HEADER_BYTES+PREFIX_BYTES;
const arweave=Arweave.init({});
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{43}$/.test(id);
const fields=['format','id','last_tx','owner','tags','target','quantity','data_size','data_root','reward','signature'];

function checkedHeader(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid_l1_header');
 const h=Object.fromEntries(fields.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,raw[k]]));
 if(![1,2].includes(h.format)||!validId(h.id))throw new Error('invalid_l1_transaction');
 for(const key of ['owner','signature'])if(typeof h[key]!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(h[key]))throw new Error('invalid_l1_'+key);
 if(typeof h.last_tx!=='string'||!/^[A-Za-z0-9_-]{0,128}$/.test(h.last_tx))throw new Error('invalid_l1_anchor');
 if(h.target!==''&&!validId(h.target))throw new Error('invalid_l1_target');
 for(const key of ['quantity','reward'])if(typeof h[key]!=='string'||!/^(0|[1-9][0-9]{0,79})$/.test(h[key]))throw new Error('invalid_l1_'+key);
 if(!Array.isArray(h.tags)||h.tags.length>4096||h.tags.some(t=>!t||typeof t.name!=='string'||typeof t.value!=='string'||!/^[A-Za-z0-9_-]*$/.test(t.name)||!/^[A-Za-z0-9_-]*$/.test(t.value)))throw new Error('invalid_l1_tags');
 if(h.format===2){
  if(typeof h.data_size!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(h.data_size))throw new Error('invalid_l1_data_size');
  if(h.data_root!==''&&!validId(h.data_root))throw new Error('invalid_l1_data_root');
 }
 return h;
}

export function isL1Content(raw){return Buffer.isBuffer(raw)&&raw.length>=MAGIC.length&&raw.subarray(0,MAGIC.length).equals(MAGIC);}
export function encodeL1Content(rawTransaction,payload){
 if(!Buffer.isBuffer(payload)||payload.length>MAX_L1_PAYLOAD_BYTES)throw new Error('invalid_l1_payload_size');
 const header=Buffer.from(JSON.stringify(checkedHeader(rawTransaction)));
 if(header.length>MAX_L1_HEADER_BYTES)throw new Error('l1_header_too_large');
 const prefix=Buffer.alloc(PREFIX_BYTES);MAGIC.copy(prefix);prefix.writeUInt32BE(header.length,MAGIC.length);
 return Buffer.concat([prefix,header,payload]);
}

export async function verifyL1Content(raw,dataId){
 if(!validId(dataId)||!isL1Content(raw)||raw.length<PREFIX_BYTES||raw.length>MAX_CONTENT_BYTES)throw new Error('invalid_l1_envelope');
 const length=raw.readUInt32BE(MAGIC.length);
 if(length<2||length>MAX_L1_HEADER_BYTES||PREFIX_BYTES+length>raw.length)throw new Error('invalid_l1_header_length');
 const header=checkedHeader(JSON.parse(raw.subarray(PREFIX_BYTES,PREFIX_BYTES+length).toString('utf8')));
 if(header.id!==dataId)throw new Error('l1_tx_id_mismatch');
 const payload=raw.subarray(PREFIX_BYTES+length);
 if(payload.length>MAX_L1_PAYLOAD_BYTES)throw new Error('invalid_l1_payload_size');
 if(header.format===2){
  if(Number(header.data_size)!==payload.length)throw new Error('l1_payload_size_mismatch');
  const root=payload.length?arweave.utils.bufferTob64Url((await generateTransactionChunks(payload)).data_root):'';
  if(root!==header.data_root)throw new Error('l1_data_root_mismatch');
 }
 // V1 signs the payload itself; V2 signs the declared size and Merkle root.
 // Neither signature is evidence of chain inclusion or current ArNS state.
 const tx=arweave.transactions.fromRaw({...header,data:payload.toString('base64url')});
 if(!(await arweave.transactions.verify(tx)))throw new Error('l1_signature_invalid');
 return {payload,payloadSize:payload.length,payloadSha256:sha256(payload),rootTxId:dataId,
  tags:header.tags.map(t=>({name:Buffer.from(t.name,'base64url').toString('utf8'),value:Buffer.from(t.value,'base64url').toString('utf8')})),
  rawTransaction:header,storedBytes:raw,storageKind:'l1',l1SignatureVerified:true,l1DataRootVerified:header.format===2};
}
