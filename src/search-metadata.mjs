// Descriptive RPC observations for search only. Never used for name resolution.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {getAntConfigPDA,MAINNET_PROGRAM_IDS} from '@ar.io/sdk';
import {ANT_CONFIG_DISCRIMINATOR,ANT_RECORD_METADATA_DISCRIMINATOR,getAntConfigDecoder,getAntRecordMetadataDecoder} from '@ar.io/solana-contracts/ant';
import {getProgramDerivedAddress,getAddressEncoder} from '@solana/kit';
import {rpcIp} from './ip-transport.mjs';
import {withByteBudget} from './byte-budget.mjs';
import {cleanSearchText,searchKeywords} from './search-text.mjs';
const hash=s=>crypto.createHash('sha256').update(s).digest();
const optional=x=>x?.__option==='Some'?x.value:undefined;
const LIMIT=16*1024*1024;
const filter=bytes=>({memcmp:{offset:0,bytes:Buffer.from(bytes).toString('base64'),encoding:'base64'}});
const derived=new Map();
async function pda(kind,mint,undernameHash,program){
 const key=[kind,mint,undernameHash,program].join('|');if(derived.has(key))return derived.get(key);
 const [value]=kind==='config'?await getAntConfigPDA(mint,program):await getProgramDerivedAddress({programAddress:program,seeds:['ant_record_meta',getAddressEncoder().encode(mint),Buffer.from(undernameHash,'hex')]});
 if(derived.size>=50000)derived.delete(derived.keys().next().value);derived.set(key,String(value));return String(value);
}
export async function decodeSearchMetadata(response,{program,kind,minSlot=0,signal}){
 if(!Number.isSafeInteger(response?.context?.slot)||response.context.slot<minSlot||!Array.isArray(response.value)||response.value.length>50000)throw new Error('invalid_search_metadata_scan');
 const decoder=kind==='config'?getAntConfigDecoder():getAntRecordMetadataDecoder(),disc=kind==='config'?ANT_CONFIG_DISCRIMINATOR:ANT_RECORD_METADATA_DISCRIMINATOR,rows={};
 for(const [i,row] of response.value.entries()){
  if(i%32===0){await new Promise(r=>setImmediate(r));signal?.throwIfAborted();}
  if(row.account?.owner!==program||row.account?.data?.[1]!=='base64')throw new Error('search_metadata_owner');
  const raw=Buffer.from(row.account.data[0],'base64');if(raw.length>4096||!raw.subarray(0,8).equals(Buffer.from(disc)))throw new Error('search_metadata_layout');
  const d=decoder.decode(raw),mint=String(d.mint),undernameHash=kind==='record'?Buffer.from(d.undernameHash).toString('hex'):'';
  if(row.pubkey!==await pda(kind,mint,undernameHash,program))throw new Error('search_metadata_binding');
  const key=kind==='config'?mint:mint+'|'+undernameHash;if(Object.hasOwn(rows,key))throw new Error('search_metadata_duplicate');
  // Preserve an explicitly empty record override instead of inheriting base tags.
  rows[key]=kind==='config'?{title:cleanSearchText(d.name,160),description:cleanSearchText(d.description,320),keywords:searchKeywords(d.keywords)}:
   Object.fromEntries([['title',optional(d.displayName)],['description',optional(d.recordDescription)],['keywords',optional(d.recordKeywords)]].filter(([,v])=>v!==undefined).map(([k,v])=>[k,k==='keywords'?searchKeywords(v):cleanSearchText(v,k==='title'?160:320)]));
 }
 return {slot:response.context.slot,observedAt:new Date().toISOString(),rows};
}
export class SearchMetadataWorker{
 constructor({file,endpoint,targets=()=>({}),rpc=rpcIp,intervalMs=15*60000,dailyBytes=512*1024*1024}){
  Object.assign(this,{file,endpoint,targets,rpc,intervalMs,dailyBytes});this.state={schema:'arns-mesh-search-metadata/v1',programs:{},day:'',bytes:0};this.running=null;this.stopped=true;this.lastError=null;
  try{if(fs.statSync(file).size<=LIMIT){const s=JSON.parse(fs.readFileSync(file));if(s.schema===this.state.schema)this.state=s;}}catch{}
 }
 save(){const body=JSON.stringify(this.state);if(Buffer.byteLength(body)>LIMIT)throw new Error('search_metadata_disk_limit');fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',body,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 get(name,snapshot){
  const target=this.targets()[name];if(!target||target.dataId!==snapshot.txId||target.mint!==snapshot.antId)return null;
  const program=target.antProgram||MAINNET_PROGRAM_IDS.ant,s=this.state.programs[program];if(!s)return null;
  const undername=name===target.baseName?'@':name.slice(0,-target.baseName.length-1),base=s.config.rows[target.mint],record=s.record.rows[target.mint+'|'+hash(undername).toString('hex')];
  if(!base&&!record)return null;
  // Parent metadata belongs to the root; do not label every unrelated undername
  // with a parent's subject. Record-specific fields override only the root.
  const fields={...(undername==='@'?base:{}),...record};
  if(/^ANT$/i.test(fields.title||''))fields.title='';
  if(/^A brief description of this ANT\.?$/i.test(fields.description||''))fields.description='';
  if(!fields.title&&!fields.description&&!fields.keywords?.length)return null;
  return {title:fields.title||'',description:fields.description||'',keywords:fields.keywords||[],metadataAt:s.observedAt};
 }
 pass(){if(this.running)return this.running;this.running=this._pass().finally(()=>this.running=null);return this.running;}
 async _pass(){
  const day=new Date().toISOString().slice(0,10);if(day!==this.state.day){this.state.day=day;this.state.bytes=0;}
  const left=this.dailyBytes-this.state.bytes;if(left<=0){this.lastError='search_metadata_daily_budget';return this.status();}
  this.controller=new AbortController();const timer=setTimeout(()=>this.controller.abort(new Error('search_metadata_timeout')),120000);
  try{
   const result=await withByteBudget(Math.min(left,32*1024*1024),this.controller,async()=>{
    const programs=[...new Set([MAINNET_PROGRAM_IDS.ant,...Object.values(this.targets()).map(x=>x.antProgram).filter(Boolean)])].slice(0,8);
    for(const program of programs){
     const old=this.state.programs[program],next={};
     for(const kind of ['config','record']){
      const disc=kind==='config'?ANT_CONFIG_DISCRIMINATOR:ANT_RECORD_METADATA_DISCRIMINATOR;
      const response=await this.rpc(this.endpoint(),'getProgramAccounts',[program,{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:old?.[kind]?.slot||0,filters:[filter(disc)]}],{signal:this.controller.signal,timeout:30000,maxBytes:LIMIT});
      next[kind]=await decodeSearchMetadata(response,{program,kind,minSlot:old?.[kind]?.slot||0,signal:this.controller.signal});
     }
     next.observedAt=new Date().toISOString();
     const previous=this.state.programs[program];this.state.programs[program]=next;
     try{this.save();}catch(error){if(previous)this.state.programs[program]=previous;else delete this.state.programs[program];throw error;}
    }
   });
   this.state.bytes+=result.bytes;this.lastError=null;
  }catch(error){this.state.bytes+=error.receivedBytes||0;this.lastError=String(error.message).slice(0,160);}
  finally{clearTimeout(timer);this.state.at=new Date().toISOString();this.save();}
  return this.status();
 }
 status(){return {programs:Object.keys(this.state.programs).length,updatedAt:this.state.at||null,dayBytes:this.state.bytes,dailyBytes:this.dailyBytes,lastError:this.lastError,running:Boolean(this.running)};}
 start(){if(!this.stopped)return;this.stopped=false;const run=async()=>{await this.pass().catch(e=>{this.lastError=e.message;});if(!this.stopped){this.timer=setTimeout(run,this.intervalMs);this.timer.unref?.();}};void run();}
 stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort(new Error('search_metadata_stopped'));}
}
