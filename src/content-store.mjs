import fs from 'node:fs';
import path from 'node:path';
import {verifyDataItem,parseDataItem,deserializeTags,idFromSignature} from './ans104.mjs';
import {sha256} from './common.mjs';
import {EventEmitter} from 'node:events';
import {isL1Content,verifyL1Content,MAX_CONTENT_BYTES} from './l1-content.mjs';
export {MAX_CONTENT_BYTES} from './l1-content.mjs';

export const MAX_ITEM_BYTES=32*1024*1024;
export async function verifyRawItem(raw,dataId){
  if(!Buffer.isBuffer(raw)||raw.length>MAX_ITEM_BYTES)throw new Error('invalid_item_size');
  const parsed=parseDataItem(raw);
  if(Buffer.from(idFromSignature(parsed.rawSignature)).toString('base64url')!==dataId)throw new Error('data_item_id_mismatch');
  if(!(await verifyDataItem(raw)))throw new Error('data_item_signature_invalid');
  const payload=Buffer.from(parsed.rawData);
  return {payload,payloadSha256:sha256(payload),tags:deserializeTags(parsed.rawTags),rawItem:raw,storedBytes:raw,storageKind:'ans104',signatureType:parsed.signatureType};
}
export async function verifyStoredContent(raw,dataId){return isL1Content(raw)?verifyL1Content(raw,dataId):verifyRawItem(raw,dataId);}
export class VerifiedContentStore extends EventEmitter{
  constructor(directory,{maxBytes=256*1024*1024,maxPinnedBytes=512*1024*1024,maxFiles=Infinity}={}){super();this.directory=directory;this.maxBytes=maxBytes;this.maxPinnedBytes=maxPinnedBytes;this.maxFiles=maxFiles;fs.mkdirSync(directory,{recursive:true});this.pinsFile=path.join(directory,'pins.json');this.pins=Object.create(null);if(fs.existsSync(this.pinsFile)){const rows=JSON.parse(fs.readFileSync(this.pinsFile));if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.values(rows).some(ids=>!Array.isArray(ids)||ids.some(id=>!/^[A-Za-z0-9_-]{43}$/.test(id))))throw new Error('invalid_pins_file');this.pins=Object.assign(Object.create(null),rows);}this.prune();}
  file(id,kind='ans104'){if(!/^[A-Za-z0-9_-]{43}$/.test(id)||!['ans104','l1'].includes(kind))throw new Error('invalid_data_id');return path.join(this.directory,id+'.'+kind);}
  has(id){return ['ans104','l1'].some(kind=>fs.existsSync(this.file(id,kind)));}
  get(id){for(const kind of ['ans104','l1']){const f=this.file(id,kind);try{const size=fs.statSync(f).size;if(size>(kind==='l1'?MAX_CONTENT_BYTES:MAX_ITEM_BYTES))continue;return fs.readFileSync(f);}catch(error){if(error.code!=='ENOENT')throw error;}}return null;}
  async put(id,raw){const verified=await verifyStoredContent(raw,id);const f=this.file(id,verified.storageKind);fs.writeFileSync(f+'.tmp',raw,{mode:0o600});fs.renameSync(f+'.tmp',f);this.prune();this.emit('stored',id);}
  stats(){const files=fs.readdirSync(this.directory).filter(n=>/^[A-Za-z0-9_-]{43}\.(ans104|l1)$/.test(n)).map(n=>({file:path.join(this.directory,n),dataId:n.slice(0,43),storageKind:n.slice(44),...fs.statSync(path.join(this.directory,n))}));return {files,bytes:files.reduce((s,f)=>s+f.size,0)};}
  pinnedIds(){return new Set(Object.values(this.pins).flat());}
  savePins(){fs.writeFileSync(this.pinsFile+'.tmp',JSON.stringify(this.pins),{mode:0o600});fs.renameSync(this.pinsFile+'.tmp',this.pinsFile);}
  async pin(id,group){
    if(!/^[a-z0-9_-]{1,255}$/.test(group))throw new Error('invalid_pin_group');
    const raw=this.get(id);await verifyStoredContent(raw,id);
    const wanted=this.pinnedIds();wanted.add(id);const bytes=this.stats().files.filter(f=>wanted.has(f.dataId)).reduce((sum,f)=>sum+f.size,0);
    if(bytes>this.maxPinnedBytes)throw new Error('pin_budget_exceeded');
    const previous=this.pins[group];this.pins[group]=[...new Set([...(previous||[]),id])];
    try{this.savePins();}catch(e){if(previous)this.pins[group]=previous;else delete this.pins[group];throw e;}
  }
  unpin(group){const previous=this.pins[group];delete this.pins[group];try{this.savePins();}catch(e){if(previous)this.pins[group]=previous;throw e;}this.prune();}
  pinStats(){const pinned=this.pinnedIds(),s=this.stats();return {groups:Object.keys(this.pins),files:pinned.size,bytes:s.files.filter(f=>pinned.has(f.dataId)).reduce((n,f)=>n+f.size,0),maxBytes:this.maxPinnedBytes};}
  prune(){const s=this.stats(),pinned=this.pinnedIds(),automatic=s.files.filter(f=>!pinned.has(f.dataId));let count=automatic.length,bytes=automatic.reduce((n,f)=>n+f.size,0);for(const f of automatic.sort((a,b)=>a.mtimeMs-b.mtimeMs)){if(bytes<=this.maxBytes&&count<=this.maxFiles)break;fs.unlinkSync(f.file);bytes-=f.size;count--;}}
  chunk(id,offset){if(!Number.isSafeInteger(offset)||offset<0||offset%524288!==0)throw new Error('invalid_chunk_offset');const raw=this.get(id);if(!raw)throw new Error('content_not_cached');if(offset>=raw.length)throw new Error('invalid_chunk_offset');return {kind:'content-chunk',dataId:id,offset,total:raw.length,sha256:sha256(raw),data:raw.subarray(offset,offset+524288).toString('base64')};}
}
