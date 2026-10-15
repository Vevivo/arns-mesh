import {decodeVerifiedPayload} from './content-decoding.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setImmediate as yieldToEventLoop} from 'node:timers/promises';
import {peerIdFromPublicKey,verifyRecord,sha256} from './common.mjs';
import {validArName,validDataId} from './swarm-common.mjs';
import {verifyStoredContent} from './content-store.mjs';
import {resolveManifestPath} from './manifest-path.mjs';
import {queryDirectPeer} from './direct-peer.mjs';
import {cleanSearchText,searchKeywords} from './search-text.mjs';

export const SEARCH_LIMITS=Object.freeze({entries:256,recordBytes:384*1024,envelopeBytes:800*1024,documentBytes:1024*1024,text:1200,sources:2});
const schema='arns-mesh-search/v1',topicSchema='arns-mesh-search/v2';
export const TOPIC_LIMITS=Object.freeze({entries:20000,recordBytes:8*1024*1024,envelopeBytes:16*1024*1024});
const limits=r=>r?.schema===topicSchema?TOPIC_LIMITS:SEARCH_LIMITS;
const clean=cleanSearchText;
const topicGroups=[['game','games','gaming'],['art','arts'],['photo','photos','photography'],['education','learning'],['developer','developers'],['video','videos']];
const relatedTerms=term=>topicGroups.find(group=>group.includes(term))||[term];
const fold=s=>s.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/ı/g,'i');
const atomic=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value),{mode:0o600});fs.renameSync(file+'.tmp',file);};
const atomicEncoded=(file,body)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',body,{mode:0o600});fs.renameSync(file+'.tmp',file);};
async function atomicEncodedAsync(file,body,signal){
 signal?.throwIfAborted();
 const temporary=file+'.tmp';let wrote=false;
 try{
  await fs.promises.mkdir(path.dirname(file),{recursive:true});signal?.throwIfAborted();
  wrote=true;await fs.promises.writeFile(temporary,body,{mode:0o600,signal});signal?.throwIfAborted();
  // Rename is the commit point. Once it starts, finish exposing the matching
  // record even if cancellation arrives while the atomic rename is pending.
  await fs.promises.rename(temporary,file);wrote=false;
 }catch(error){
  if(wrote)await fs.promises.unlink(temporary).catch(()=>{});
  signal?.throwIfAborted();throw error;
 }
}
function scanBudget(signal){
 let count=0,started=performance.now();
 return async()=>{
  signal?.throwIfAborted();
  if(++count%16!==0&&performance.now()-started<8)return;
  await yieldToEventLoop();signal?.throwIfAborted();started=performance.now();
 };
}
function read(file,max){try{if(fs.statSync(file).size<=max)return JSON.parse(fs.readFileSync(file));}catch{}return null;}
function entities(s){return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,n)=>{if(n[0]!=='#')return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n.toLowerCase()];const cp=n[1].toLowerCase()==='x'?parseInt(n.slice(2),16):Number(n.slice(1));return cp>0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):' ';});}
// A bounded, non-executing text preview, not a DOM renderer or a full crawler.
export function extractSearchText(html){
 if(typeof html!=='string'||Buffer.byteLength(html)>SEARCH_LIMITS.documentBytes)throw new Error('search_document_limit');
 let at=0,inHead=false,inTitle=false,titleText='',bodyText='',description='',keywords=[];
 const append=text=>{if(inTitle)titleText=(titleText+text).slice(0,2048);else if(!inHead&&bodyText.length<SEARCH_LIMITS.text*8)bodyText=(bodyText+text).slice(0,SEARCH_LIMITS.text*8);};
 while(at<html.length){
  const start=html.indexOf('<',at);if(start<0){append(html.slice(at));break;}append(html.slice(at,start));
  if(html.startsWith('<!--',start)){const end=html.indexOf('-->',start+4);at=end<0?html.length:end+3;continue;}
  // Scan once, respecting quotes. Repeated unterminated tags must not cause
  // a regex to rescan the remainder of an attacker-controlled document.
  let end=start+1,quote='';for(;end<html.length;end++){const c=html[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
  if(end===html.length)break;at=end+1;
  const token=html.slice(start,end+1),m=/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)/i.exec(token);if(!m)continue;
  const closing=Boolean(m[1]),tag=m[2].toLowerCase();
  if(!closing&&['script','style','template','noscript','svg'].includes(tag)){
   const close=new RegExp('</'+tag+'\\s*>','ig');close.lastIndex=at;const found=close.exec(html);at=found?close.lastIndex:html.length;append(' ');continue;
  }
  if(tag==='head'){inHead=!closing;continue;}
  if(tag==='title'){inTitle=!closing;continue;}
  if(tag==='meta'&&!closing&&token.length<=4096){
   const attrs=Object.create(null);for(const a of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=a[2]??a[3]??a[4];
   if(!description&&/^(description|og:description)$/i.test(attrs.name||attrs.property||''))description=clean(entities(attrs.content||''),320);
   if(/^keywords$/i.test(attrs.name||''))keywords=searchKeywords([...keywords,...entities(attrs.content||'').split(/[,;]+/)]);
  }
  append(' ');
 }
 const title=clean(entities(titleText),160),text=clean(entities(bodyText),SEARCH_LIMITS.text);
 return {title,description,text,keywords};
}
function* validateRecordSteps(r){
 if(![schema,topicSchema].includes(r?.schema)||!Number.isSafeInteger(r.revision)||r.revision<1||!Number.isFinite(Date.parse(r.generatedAt))||Date.parse(r.generatedAt)>Date.now()+30000||!Array.isArray(r.entries)||r.entries.length>limits(r).entries)throw new Error('invalid_search_catalog');
 const names=new Set();for(const x of r.entries){
  if(!validArName(x?.name)||names.has(x.name)||!validDataId(x.targetId)||(r.schema===topicSchema&&x.availability==='metadata'?x.documentId!==null:!validDataId(x.documentId))||!(r.schema===topicSchema?['metadata','document','prepared']:['document','prepared']).includes(x.availability))throw new Error('invalid_search_entry');names.add(x.name);
  for(const [key,max] of [['title',160],['description',320],['text',SEARCH_LIMITS.text]])if(typeof x[key]!=='string'||clean(x[key],max)!==x[key])throw new Error('invalid_search_text');
  if(x.keywords!==undefined&&(!Array.isArray(x.keywords)||x.keywords.length>12||x.keywords.some(w=>typeof w!=='string'||!w||clean(w,48)!==w)||new Set(x.keywords).size!==x.keywords.length))throw new Error('invalid_search_keywords');
  if(x.metadataAt!==undefined&&(!Number.isFinite(Date.parse(x.metadataAt))||Date.parse(x.metadataAt)>Date.now()+30000))throw new Error('invalid_search_date');
  for(const key of ['observedAt','indexedAt'])if(!Number.isFinite(Date.parse(x[key]))||Date.parse(x[key])>Date.now()+30000)throw new Error('invalid_search_date');
  yield;
 }
 return r;
}
function validateRecord(r){const steps=validateRecordSteps(r);for(;;){const next=steps.next();if(next.done)return next.value;}}
export function verifySearchEnvelope(e,trustedPeers){
 if(!e?.ok||typeof e.recordJson!=='string'||Buffer.byteLength(e.recordJson)>TOPIC_LIMITS.recordBytes||Buffer.byteLength(JSON.stringify(e))>TOPIC_LIMITS.envelopeBytes||typeof e.witnessPublicKeyPem!=='string'||e.witnessPublicKeyPem.length>256||typeof e.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(e.signature))throw new Error('invalid_search_envelope');
 if(!trustedPeers.includes(e.witnessPeerId)||peerIdFromPublicKey(e.witnessPublicKeyPem)!==e.witnessPeerId)throw new Error('untrusted_search_publisher');
 let record;try{record=JSON.parse(e.recordJson);}catch{throw new Error('invalid_search_envelope');}
 if(Buffer.byteLength(e.recordJson)>limits(record).recordBytes||Buffer.byteLength(JSON.stringify(e))>limits(record).envelopeBytes)throw new Error('invalid_search_envelope');
 if(crypto.createPublicKey(e.witnessPublicKeyPem).asymmetricKeyType!=='ed25519'||!verifyRecord(e.recordJson,e.signature,e.witnessPublicKeyPem))throw new Error('invalid_search_signature');
 return validateRecord(record);
}

export class SearchPublisher{
 constructor({file,snapshots,contentStore,pinner,sign}){
  Object.assign(this,{file,snapshots,contentStore,pinner,sign});this.cursor=0;this.running=null;this.lastError=null;
  this.record={schema,revision:1,generatedAt:new Date().toISOString(),entries:[]};
  try{const saved=read(file,SEARCH_LIMITS.recordBytes);if(saved)this.record=validateRecord(saved);}catch{}
 }
 async pass({signal}={}){signal?.throwIfAborted();if(this.running)return this.running;this.running=this._pass({signal}).finally(()=>this.running=null);return this.running;}
 async _pass({signal}={}){
  signal?.throwIfAborted();const checkpoint=scanBudget(signal),names=[];
  for(const name of this.snapshots.names()){
   const snapshot=this.snapshots.exportLocal(name);if(snapshot&&this.contentStore.has(snapshot.txId))names.push(name);
   await checkpoint();
  }
  names.sort((a,b)=>Number(Boolean(this.pinner?.rows[b]))-Number(Boolean(this.pinner?.rows[a]))||a.localeCompare(b));
  const rows=new Map(this.record.entries.map(r=>[r.name,r]));
  // Never attach old keywords to a newly observed target. Also remove evicted
  // documents; retained client catalogues still label availability as dated.
  for(const [name,row] of rows){const s=this.snapshots.exportLocal(name);if(!s||s.txId!==row.targetId||!this.contentStore.has(row.targetId)||!this.contentStore.has(row.documentId))rows.delete(name);await checkpoint();}
  const verified=async id=>{signal?.throwIfAborted();const raw=this.contentStore.get(id,{maxBytes:2*SEARCH_LIMITS.documentBytes});if(!raw)throw new Error('search_content_missing');if(raw.length>2*SEARCH_LIMITS.documentBytes)throw new Error('search_document_limit');const r=await verifyStoredContent(raw,id);signal?.throwIfAborted();if(r.payload.length>SEARCH_LIMITS.documentBytes)throw new Error('search_document_limit');const view=await decodeVerifiedPayload(r,{maxOutputBytes:SEARCH_LIMITS.documentBytes,signal});return {...r,decodedBody:view.body};};
  for(let count=0;count<Math.min(32,names.length);count++){
   signal?.throwIfAborted();
   const name=names[this.cursor++%names.length],snapshot=this.snapshots.exportLocal(name);if(!snapshot)continue;
   try{
    let id=snapshot.txId,document=await verified(id);
    const type=r=>r.tags.find(t=>t.name.toLowerCase()==='content-type')?.value.toLowerCase()||'';
    if(type(document).includes('application/x.arweave-manifest')){id=resolveManifestPath(JSON.parse(document.decodedBody.toString()),'').id;document=await verified(id);}
    if(!type(document).includes('text/html')){rows.delete(name);continue;}
    const fields=extractSearchText(document.decodedBody.toString('utf8'));
    if(!fields.title&&!fields.description&&!fields.text){rows.delete(name);continue;}
    const ready=this.pinner?.rows[name];
    rows.set(name,{name,targetId:snapshot.txId,documentId:id,...fields,observedAt:snapshot.observedAt,indexedAt:new Date().toISOString(),availability:ready?.rootDataId===snapshot.txId&&this.pinner.isReady(ready)?'prepared':'document'});
   }catch(error){signal?.throwIfAborted();rows.delete(name);this.lastError=String(error.message).slice(0,160);}
   await yieldToEventLoop();signal?.throwIfAborted();
  }
  const next={schema,revision:Math.max(Date.now(),this.record.revision+1),generatedAt:new Date().toISOString(),entries:[]};
  for(const row of [...rows.values()].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.name.localeCompare(b.name))){if(next.entries.length>=SEARCH_LIMITS.entries)break;next.entries.push(row);if(Buffer.byteLength(JSON.stringify(next))>SEARCH_LIMITS.recordBytes){next.entries.pop();break;}}
  await atomicEncodedAsync(this.file,JSON.stringify(next),signal);this.record=next;this.envelope=null;return this.status();
 }
 reply(){return this.envelope??=this.sign(this.record);}
 status(){return {entries:this.record.entries.length,limit:SEARCH_LIMITS.entries,generatedAt:this.record.generatedAt,scope:'verified cached HTML entry documents',lastError:this.lastError};}
}

export class SearchCatalog{
 constructor(file){this.file=file;this.sources=Object.create(null);this.watermarks=Object.create(null);this.running=null;this.error=null;
  const s=read(file,2*TOPIC_LIMITS.envelopeBytes+32768);if(s?.schema==='arns-mesh-search-cache/v1'){this.sources=Object.assign(Object.create(null),s.sources);this.watermarks=Object.assign(Object.create(null),s.watermarks);}
 }
 accept(envelope,trustedPeers){
  const record=verifySearchEnvelope(envelope,trustedPeers),id=envelope.witnessPeerId,hash=sha256(envelope.recordJson),old=this.watermarks[id];
  if(old&&(record.revision<old.revision||record.revision===old.revision&&hash!==old.hash))throw new Error('search_catalog_rollback_or_conflict');
  if(!old&&Object.keys(this.watermarks).length>=64)throw new Error('search_publisher_history_limit');
  const sources=Object.assign(Object.create(null),this.sources),watermarks={...this.watermarks,[id]:{revision:record.revision,hash}};
  for(const key of Object.keys(sources))if(!trustedPeers.includes(key))delete sources[key];
  sources[id]=envelope;for(const key of Object.keys(sources).filter(k=>k!==id).slice(SEARCH_LIMITS.sources-1))delete sources[key];
  atomic(this.file,{schema:'arns-mesh-search-cache/v1',sources,watermarks});this.sources=sources;this.watermarks=watermarks;
 }
 records(trustedPeers){const out=[];for(const e of Object.values(this.sources)){try{out.push({record:verifySearchEnvelope(e,trustedPeers),envelope:e});}catch{}}return out;}
 mirror(trustedPeers,witnessPeerId,version=2){return this.records(trustedPeers).find(x=>(version===2||x.record.schema===schema)&&(!witnessPeerId||x.envelope.witnessPeerId===witnessPeerId))?.envelope||null;}
 async sync({peers,trustedPeers,signal,query=queryDirectPeer,version=2}){
  if(this.running)return this.running;
  this.running=(async()=>{let accepted=0,lastError=null;
   const sources=[...new Set(trustedPeers)].slice(0,SEARCH_LIMITS.sources);
   for(const peer of peers.slice(0,2))for(const witnessPeerId of sources){try{signal?.throwIfAborted();const e=await query(peer,{op:'catalog',witnessPeerId,version},{signal});signal?.throwIfAborted();if(e?.witnessPeerId!==witnessPeerId)throw new Error('search_publisher_mismatch');this.accept(e,trustedPeers);accepted++;}catch(e){lastError=String(e.message).slice(0,160);}}
   this.error=accepted?null:lastError||'No trusted search publisher is configured.';return {accepted,error:this.error};
  })().finally(()=>this.running=null);return this.running;
 }
 search(query,trustedPeers){
  const q=clean(query,160),terms=[...new Set(fold(q).match(/[\p{L}\p{N}]+/gu)||[])].slice(0,12),records=this.records(trustedPeers),rows=new Map();
  for(const {record,envelope} of records)for(const entry of record.entries){const old=rows.get(entry.name);if(!old||Date.parse(entry.observedAt)>Date.parse(old.observedAt)||entry.observedAt===old.observedAt&&Date.parse(entry.indexedAt)>Date.parse(old.indexedAt))rows.set(entry.name,{...entry,publisher:envelope.witnessPeerId});}
  const hits=[];if(terms.length)for(const row of rows.values()){
   const fields=[row.name,row.title===row.name?'':row.title,(row.keywords||[]).join(' '),row.description,row.text].map(s=>fold(s).match(/[\p{L}\p{N}]+/gu)||[]),matches=(words,term)=>relatedTerms(term).some(t=>words.some(word=>word.startsWith(t)));if(!terms.every(t=>fields.some(f=>matches(f,t))))continue;
   const score=terms.reduce((s,t)=>s+fields.reduce((n,f,i)=>n+(matches(f,t)?[10,7,14,4,1][i]:0),0),fold(row.name)===fold(q)?50:0);
   let excerpt=row.description||row.text||(row.keywords||[]).join(' · ');const offset=fold(excerpt).indexOf(terms[0]);if(offset>100)excerpt='…'+excerpt.slice(Math.max(0,offset-60));
   hits.push({...row,score,excerpt:excerpt.slice(0,240)});
  }
  hits.sort((a,b)=>b.score-a.score||Date.parse(b.observedAt)-Date.parse(a.observedAt)||a.name.localeCompare(b.name));
  return {query:q,hits:hits.slice(0,30),total:hits.length,entries:rows.size,sources:records.length,generatedAt:records.map(x=>x.record.generatedAt).sort().at(-1)||null,error:this.error,syncing:Boolean(this.running)};
 }
}

// A versioned catalogue keeps old readers on their original small HTML catalogue.
export class TopicSearchPublisher{
 constructor({file,snapshots,documents,metadata,current=()=>true,sign}){
  Object.assign(this,{file,snapshots,documents,metadata,current,sign});this.lastError=null;this.running=null;
  this.record={schema:topicSchema,revision:1,generatedAt:new Date().toISOString(),entries:[]};
  try{const saved=read(file,TOPIC_LIMITS.recordBytes);if(saved)this.record=validateRecord(saved);}catch{}
 }
 *_build(){
  const docs=new Map(this.documents.record.entries.map(x=>[x.name,x])),entries=[];
  for(const name of this.snapshots.names().sort()){
   const snapshot=this.snapshots.exportLocal(name);if(!snapshot||!this.current(name,snapshot)){yield;continue;}
   const d=docs.get(name),document=d?.targetId===snapshot.txId?d:null,m=this.metadata?.get(name,snapshot);
   const row={name,targetId:snapshot.txId,documentId:document?.documentId||null,
    title:clean(document?.title||m?.title||name,160),description:clean(m?.description||document?.description||'',320),text:clean(document?.text||'',SEARCH_LIMITS.text),
    keywords:searchKeywords([...(m?.keywords||[]),...(document?.keywords||[])]),
    observedAt:snapshot.observedAt,indexedAt:document?.indexedAt||m?.metadataAt||snapshot.observedAt,
    availability:document?.availability||'metadata',...(m?{metadataAt:m.metadataAt}:{})};
   entries.push(row);
   yield;
  }
  // Prefer prepared entry pages and root names when the explicit size cap is hit.
  entries.sort((a,b)=>Number(b.availability!=='metadata')-Number(a.availability!=='metadata')||Number(a.name.includes('_'))-Number(b.name.includes('_'))||a.name.localeCompare(b.name));
  const next={schema:topicSchema,revision:Math.max(Date.now(),this.record.revision+1),generatedAt:new Date().toISOString(),entries:[]};
  const empty=JSON.stringify(next),encodedRows=[];let bytes=Buffer.byteLength(empty);
  for(const row of entries){const encoded=JSON.stringify(row),size=Buffer.byteLength(encoded)+1;if(next.entries.length>=TOPIC_LIMITS.entries||bytes+size>TOPIC_LIMITS.recordBytes)break;next.entries.push(row);encodedRows.push(encoded);bytes+=size;yield;}
  yield* validateRecordSteps(next);
  // Reuse each bounded row encoding instead of serializing the whole catalogue
  // again after its size check. This is byte-identical to JSON.stringify(next).
  return {record:next,body:empty.slice(0,-2)+encodedRows.join(',')+']}'};
 }
 pass(){
  // Keep the existing synchronous API; never let it race an async publisher's
  // temporary file or replace the record halfway through a background pass.
  if(this.running)throw new Error('search_catalog_busy');
  const steps=this._build();for(;;){const next=steps.next();if(next.done){atomicEncoded(this.file,next.value.body);this.record=next.value.record;this.envelope=null;return this.status();}}
 }
 async passAsync({signal}={}){
  signal?.throwIfAborted();if(this.running)return this.running;
  this.running=(async()=>{
   const steps=this._build(),checkpoint=scanBudget(signal);
   try{
    for(;;){
     signal?.throwIfAborted();const next=steps.next();
     if(next.done){await atomicEncodedAsync(this.file,next.value.body,signal);this.record=next.value.record;this.envelope=null;return this.status();}
     await checkpoint();
    }
   }finally{steps.return();}
  })().finally(()=>this.running=null);
  return this.running;
 }
 reply(){return this.envelope??=this.sign(this.record);}
 status(){return {entries:this.record.entries.length,withTopics:this.record.entries.filter(x=>x.keywords?.length||x.description).length,limit:TOPIC_LIMITS.entries,generatedAt:this.record.generatedAt,lastError:this.lastError};}
}
