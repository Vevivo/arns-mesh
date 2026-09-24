import crypto from 'node:crypto';
import {DataItem,SIG_CONFIG,deserializeTags as decodeTags} from '@dha-team/arbundles/node';

// Use the multi-signature ANS-104 implementation already used by the ArIO SDK.
// Enforce byte boundaries before handing peer-controlled data to its verifier.
export const idFromSignature=signature=>crypto.createHash('sha256').update(signature).digest();
export const deserializeTags=bytes=>bytes.length?decodeTags(bytes):[];
export function parseDataItem(binary){
 const b=Buffer.from(binary.buffer??binary,binary.byteOffset??0,binary.length);
 const need=n=>{if(b.length<n)throw new Error('data_item_header_truncated');};
 need(2);const signatureType=b.readUInt16LE(0),config=SIG_CONFIG[signatureType];
 if(!config)throw new Error('unsupported_signature_type:'+signatureType);
 const signatureLength=config.sigLength,ownerLength=config.pubLength;
 const sigStart=2,ownerStart=2+signatureLength,targetStart=ownerStart+ownerLength;
 need(targetStart+1);if(b[targetStart]>1)throw new Error('invalid_target_presence');
 const anchorStart=targetStart+1+(b[targetStart]?32:0);
 need(anchorStart+1);if(b[anchorStart]>1)throw new Error('invalid_anchor_presence');
 const tagsStart=anchorStart+1+(b[anchorStart]?32:0);need(tagsStart+16);
 const count=b.readBigUInt64LE(tagsStart),length=b.readBigUInt64LE(tagsStart+8);
 if(count>128n||length>4096n)throw new Error('data_item_tag_limit');
 const dataStart=tagsStart+16+Number(length);need(dataStart);
 const rawTags=b.subarray(tagsStart+16,dataStart),tags=deserializeTags(rawTags);
 if(tags.length!==Number(count))throw new Error('data_item_tag_count_mismatch');
 return {signatureType,signatureLength,ownerLength,tagCount:Number(count),tags,
  offsets:{sigStart,ownerStart,targetStart,anchorStart,tagsStart,dataStart,totalLength:b.length},
  rawSignature:b.subarray(sigStart,ownerStart),rawOwner:b.subarray(ownerStart,targetStart),
  rawTags,rawData:b.subarray(dataStart)};
}
export async function verifyDataItem(binary){parseDataItem(binary);return await DataItem.verify(binary);}
