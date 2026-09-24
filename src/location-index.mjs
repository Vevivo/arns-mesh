import fs from 'node:fs';
import {lookupDiscoveredLocation} from './discovery-store.mjs';
import {validDataId} from './swarm-common.mjs';

// Locations are untrusted routing hints. Only the fetched item's ID and signature
// can authorize its bytes; neither an index entry nor peer count does that.
export function normalizeLocation(dataId,value){
  if(!validDataId(dataId)||!value)throw new Error('invalid_location_hint');
  const provenance={};
  if(value.preparation){
    const p=value.preparation;
    if(p.kind!=='external-index-preparation'||!['turbo-graphql','arweave-graphql','goldsky-graphql','turbo-offsets'].includes(p.provider)||!Number.isFinite(Date.parse(p.at)))throw new Error('invalid_location_provenance');
    provenance.preparation={kind:p.kind,provider:p.provider,at:p.at};
  }
  if(value.weaveOffset!==undefined){
    const {weaveOffset,itemSize}=value;
    if(value.rootTxId!==undefined||value.rootOffset!==undefined||value.path?.length)throw new Error('ambiguous_location_hint');
    if(!Number.isSafeInteger(weaveOffset)||weaveOffset<0||!Number.isSafeInteger(itemSize)||itemSize<1||itemSize>32*1024*1024||!Number.isSafeInteger(weaveOffset+itemSize))throw new Error('invalid_location_range');
    return {dataId,weaveOffset,itemSize,...provenance}; // Zero-based absolute weave byte offset.
  }
  if(!validDataId(value.rootTxId))throw new Error('invalid_location_hint');
  const hint={dataId,rootTxId:value.rootTxId,path:[]};
  if(value.path!==undefined){
    if(!Array.isArray(value.path)||value.path.length>8||value.path.some(x=>!validDataId(x)))throw new Error('invalid_location_path');
    hint.path=[...value.path];
  }
  const offset=value.rootOffset??value.relativeItemOffset,size=value.itemSize??value.size;
  if(offset!==undefined||size!==undefined){
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(size)||size<1||size>32*1024*1024||!Number.isSafeInteger(offset+size))throw new Error('invalid_location_range');
    hint.rootOffset=offset;hint.itemSize=size;
  }
  return {...hint,...provenance};
}

// Optional immutable preparation snapshot. Loading this file never calls its
// provider; the P2P runtime still has to fetch and verify every requested item.
const preparedSnapshots=new Map();
function preparedSnapshot(file){
 if(!file)return null;
 try{
  const s=fs.statSync(file),stamp=s.mtimeMs+':'+s.ctimeMs+':'+s.size;
  if(s.size>16*1024*1024)throw new Error('prepared_index_too_large');
  if(preparedSnapshots.get(file)?.stamp===stamp)return preparedSnapshots.get(file).value;
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  const providers={'https://turbo-gateway.com/graphql':'turbo-graphql','https://arweave.net/graphql':'arweave-graphql','https://arweave-search.goldsky.com/graphql':'goldsky-graphql','https://turbo.ardrive.io':'turbo-offsets'};
  const provider=providers[value.origin?.provider];
  if(value.schema!=='wayfinder-prepared-locations/v1'||value.origin?.kind!=='external-index-preparation'||!provider||!Number.isFinite(Date.parse(value.preparedAt))||!value.rows||Array.isArray(value.rows)||typeof value.rows!=='object'||Object.keys(value.rows).length>50000)throw new Error('invalid_prepared_index');
  const normalized={rows:value.rows,preparation:{kind:'external-index-preparation',provider,at:value.preparedAt}};
  preparedSnapshots.set(file,{stamp,value:normalized});if(preparedSnapshots.size>4)preparedSnapshots.delete(preparedSnapshots.keys().next().value);
  return normalized;
 }catch{return null;} // Invalid or missing snapshot never becomes a positive lookup.
}

export class LocationIndex{
  constructor(file,{preparedFile=process.env.ARNS_PREPARED_LOCATIONS}={}){this.file=file;this.preparedFile=preparedFile;this.stamp=null;this.rows={};}
  refresh(){
    if(!this.file)return;
    try{
      const stat=fs.statSync(this.file),stamp=stat.mtimeMs+':'+stat.size;
      if(stamp===this.stamp)return;
      if(stat.size>64*1024*1024)throw new Error('location_index_too_large');
      const rows=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(!rows||Array.isArray(rows)||typeof rows!=='object')throw new Error('invalid_location_index');
      this.rows=rows;this.stamp=stamp;
    }catch{/* Keep the last readable snapshot during atomic index replacement. */}
  }
  get(dataId){
    this.refresh();const local=this.rows[dataId]||lookupDiscoveredLocation(this.file,dataId);
    try{if(local)return normalizeLocation(dataId,local);}catch{}
    const prepared=preparedSnapshot(this.preparedFile);
    try{return prepared?.rows[dataId]?normalizeLocation(dataId,{...prepared.rows[dataId],preparation:prepared.rows[dataId].preparation??prepared.preparation}):null;}catch{return null;}
  }
  get size(){this.refresh();return new Set([...Object.keys(this.rows),...Object.keys(preparedSnapshot(this.preparedFile)?.rows||{})]).size;}
}
