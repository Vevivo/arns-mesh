import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {MAINNET_PROGRAM_IDS,getAntConfigPDA} from '@ar.io/sdk';
import {getProgramDerivedAddress,getAddressEncoder} from '@solana/kit';
import {getAntConfigEncoder,getAntRecordMetadataEncoder} from '@ar.io/solana-contracts/ant';
import {decodeSearchMetadata,SearchMetadataWorker} from '../src/search-metadata.mjs';
import {TopicSearchPublisher,SearchCatalog,extractSearchText,verifySearchEnvelope,TOPIC_LIMITS} from '../src/search-catalog.mjs';
import {peerIdFromPublicKey,signRecord} from '../src/common.mjs';
import {startDirectPeerServer,queryDirectPeer} from '../src/direct-peer.mjs';
import {accountBudgetBytes} from '../src/byte-budget.mjs';
const mint='11111111111111111111111111111111',program=MAINNET_PROGRAM_IDS.ant,now=()=>new Date().toISOString();
const temp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-topic-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const digest=name=>crypto.createHash('sha256').update(name).digest();
async function account(kind,extra={}){
 const undernameHash=digest('@'),d={mint,bump:255,version:{major:1,minor:0,patch:0},...(kind==='config'?{name:'Sound Garden',ticker:'ANT',logo:'A'.repeat(43),description:'Independent concerts',keywords:['music'],lastKnownOwner:mint}:{undernameHash,displayName:null,recordLogo:null,recordDescription:null,recordKeywords:['jazz']}),...extra};
 const raw=(kind==='config'?getAntConfigEncoder():getAntRecordMetadataEncoder()).encode(d);
 const [pubkey]=kind==='config'?await getAntConfigPDA(mint,program):await getProgramDerivedAddress({programAddress:program,seeds:['ant_record_meta',getAddressEncoder().encode(mint),d.undernameHash]});
 return {pubkey:String(pubkey),account:{owner:program,data:[Buffer.from(raw).toString('base64'),'base64']}};
}
const response=rows=>({context:{slot:100},value:rows});
test('ANT topics require account owner, discriminator, PDA, mint/hash binding and nondecreasing slot',async()=>{
 for(const kind of ['config','record']){
  const row=await account(kind),read=()=>decodeSearchMetadata(response([row]),{program,kind,minSlot:99});
  const good=await read();assert.equal(Object.keys(good.rows).length,1);
  row.account.owner=mint;await assert.rejects(read(),/owner/);row.account.owner=program;
  row.pubkey=mint;await assert.rejects(read(),/binding/);row.pubkey=(await account(kind)).pubkey;
  row.account.data[0]=Buffer.alloc(40).toString('base64');await assert.rejects(read(),/layout/);
  await assert.rejects(decodeSearchMetadata(response([]),{program,kind,minSlot:101}),/scan/);
 }
});
test('metadata refresh replaces removed keywords, survives RPC loss, and never crosses new name/mint bindings',async t=>{
 const file=path.join(temp(t),'metadata.json'),target={baseName:'garden',mint,antProgram:program,dataId:'A'.repeat(43)},targets={garden:target,docs_garden:target};
 let config=await account('config'),record=await account('record'),fail=false;
 const rpc=async(_ep,_method,params)=>{accountBudgetBytes(20);if(fail)throw new Error('RPC offline');const kind=params[1].filters[0].memcmp.bytes===Buffer.from([253,120,91,64,41,244,234,229]).toString('base64')?'config':'record';return response([kind==='config'?config:record]);};
 const w=new SearchMetadataWorker({file,endpoint:()=>'',targets:()=>targets,rpc}),snapshot={txId:target.dataId,antId:mint};
 await w.pass();assert.equal(w.lastError,null);assert.equal(w.state.bytes,40);
 assert.deepEqual(w.get('garden',snapshot).keywords,['jazz']);assert.equal(w.get('garden',snapshot).description,'Independent concerts');
 assert.equal(w.get('docs_garden',snapshot),null,'root topics are not invented for undernames');
 assert.equal(w.get('garden',{...snapshot,txId:'B'.repeat(43)}),null);
 assert.equal(w.get('garden',{...snapshot,antId:'different'}),null);
 fail=true;await w.pass();assert.match(w.lastError,/offline/);assert.equal(w.state.bytes,60);assert.deepEqual(w.get('garden',snapshot).keywords,['jazz']);
 const resumed=new SearchMetadataWorker({file,endpoint:()=>'',targets:()=>targets,rpc});assert.deepEqual(resumed.get('garden',snapshot).keywords,['jazz']);
 fail=false;record=await account('record',{recordKeywords:[]});await resumed.pass();assert.deepEqual(resumed.get('garden',snapshot).keywords,[],'explicitly empty override clears tags');
 resumed.dailyBytes=resumed.state.bytes;await resumed.pass();assert.match(resumed.lastError,/daily_budget/);
});
test('topic catalogue finds metadata-only names beyond legacy 256 entries and retains signed results offline',async t=>{
 const d=temp(t),keys=crypto.generateKeyPairSync('ed25519'),pub=keys.publicKey.export({format:'pem',type:'spki'}),priv=keys.privateKey.export({format:'pem',type:'pkcs8'}),id=peerIdFromPublicKey(pub);
 const sign=r=>{const recordJson=JSON.stringify(r);return {ok:true,witnessPeerId:id,witnessPublicKeyPem:pub,recordJson,signature:signRecord(recordJson,priv)};};
 let names=Array.from({length:700},(_,i)=>'garden-'+i),updated=false,current=true;
 const snapshots={names:()=>names,exportLocal:()=>({txId:'A'.repeat(43),antId:mint,observedAt:now()})};
 const metadata={get:()=>({title:'Sound garden',description:updated?'Science lecture':'Independent concerts',keywords:updated?['astronomy']:['jazz','concerts','music'],metadataAt:now()})};
 const publisher=new TopicSearchPublisher({file:path.join(d,'published.json'),snapshots,documents:{record:{entries:[]}},metadata,current:()=>current,sign});
 publisher.pass();const e=publisher.reply();assert.equal(verifySearchEnvelope(e,[id]).entries.length,700);assert.ok(Buffer.byteLength(e.recordJson)<=TOPIC_LIMITS.recordBytes);
 const cache=new SearchCatalog(path.join(d,'cache.json'));cache.accept(e,[id]);assert.equal(cache.search('jazz concerts',[id]).total,700);assert.equal(cache.search('music',[id]).total,700);assert.equal(cache.search('müzik',[id]).total,0,'queries are not translated');assert.equal(cache.search('jazz',[id]).hits[0].availability,'metadata');
 assert.equal(new SearchCatalog(cache.file).search('concerts',[id]).total,700);assert.equal(cache.search('jazz',[]).total,0);
 updated=true;publisher.pass();cache.accept(publisher.reply(),[id]);assert.equal(cache.search('jazz',[id]).total,0);assert.equal(cache.search('astronomy',[id]).total,700);
 current=false;publisher.pass();cache.accept(publisher.reply(),[id]);assert.equal(cache.search('astronomy',[id]).total,0);
});
test('HTML keywords are parsed as data without executing page scripts',()=>{
 const r=extractSearchText('<title>Gallery</title><meta name="keywords" content="fotoğraf, sanat; İstanbul"><script>music</script>');
 assert.deepEqual(r.keywords,['fotoğraf','sanat','İstanbul']);assert.equal(r.text,'');
});

test('bounded fields remain canonical when truncation falls on a space',()=>{
 const r=extractSearchText('<title>'+('x '.repeat(120))+'</title><meta name="keywords" content="'+('a '.repeat(40))+'">');
 assert.equal(r.title,r.title.trim());assert.equal(r.keywords[0],r.keywords[0].trim());
});

test('large version 2 catalogue crosses numeric-IP transport while old requests receive version 1',async t=>{
 const dir=temp(t),keys=crypto.generateKeyPairSync('ed25519'),pub=keys.publicKey.export({format:'pem',type:'spki'}),priv=keys.privateKey.export({format:'pem',type:'pkcs8'}),id=peerIdFromPublicKey(pub);
 const sign=r=>{const recordJson=JSON.stringify(r);return {ok:true,witnessPeerId:id,witnessPublicKeyPem:pub,recordJson,signature:signRecord(recordJson,priv)};};
 const entries=Array.from({length:3000},(_,i)=>({name:'large-'+i,targetId:'A'.repeat(43),documentId:null,title:'Music archive',description:'x'.repeat(300),text:'',keywords:['music'],observedAt:now(),indexedAt:now(),availability:'metadata'}));
 const topic=sign({schema:'arns-mesh-search/v2',revision:1,generatedAt:now(),entries}),legacy=sign({schema:'arns-mesh-search/v1',revision:1,generatedAt:now(),entries:[]});
 assert.ok(Buffer.byteLength(JSON.stringify(topic))>1024*1024);
 const server=await startDirectPeerServer({identity:{},requestsServed:0,_handleAsync:req=>req.version===2?topic:legacy},{host:'127.0.0.1',port:0});
 try{
  const peer={host:'127.0.0.1',port:server.address.port},cache=new SearchCatalog(path.join(dir,'reader.json'));
  await cache.sync({peers:[peer],trustedPeers:[id]});assert.equal(cache.error,null);assert.equal(cache.search('music',[id]).total,3000);
  assert.equal(verifySearchEnvelope(await queryDirectPeer(peer,{op:'catalog',witnessPeerId:id}),[id]).schema,'arns-mesh-search/v1');
  assert.equal(cache.mirror([id],id,1),null,'v2 is never returned to a legacy reader');
 }finally{await server.close();}
});
