import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import crypto from 'node:crypto';
import {enrollNewNameSignerState,enrollNewNameCertificateState,ShardedNameSignerState,ShardedNameCertificateState} from '../src/sharded-name-state.mjs';
import {MemoryFs} from './helpers/memory-fs.mjs';
const BASE=path.resolve('ram-name-state-tests'),POLICY='a'.repeat(64),EPOCH='b'.repeat(32),NOW=1000000;
const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
const KEY=crypto.createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
const check=test;
function fixture({maxNames=50000,kind='signer'}={}){
 const io=new MemoryFs(BASE),root=path.join(BASE,'store');let time=NOW;
 const options={directory:root,policyId:POLICY,keyId:kind==='signer'?KEY:null,stateEpoch:EPOCH,now:()=>time,io};
 (kind==='signer'?enrollNewNameSignerState:enrollNewNameCertificateState)({...options,maxNames});
 const Ctor=kind==='signer'?ShardedNameSignerState:ShardedNameCertificateState;
 const store=new Ctor(options);io.events=[];
 return{io,root,options,store,Ctor,setTime:value=>{time=value;}};
}
function envelope(name,round,slot=1,extra={}){
 const recordJson=JSON.stringify({name,policyId:POLICY,round,slot,...extra});
 return{keyId:KEY,recordJson,signature:crypto.sign(null,Buffer.from(recordJson),privateKey).toString('base64url')};
}
function put(driver,name,round=1,slot=1,extra={}){
 const e=envelope(name,round,slot,extra);
 return driver.transaction(s=>({state:{...s,maxRound:round,names:{[name]:{round,slot,envelope:e}}},value:e}));
}
function stateFile(x){return [...x.io.entries.keys()].find(p=>p.endsWith(path.sep+'state.json'));}
function stateFiles(x){return [...x.io.entries.keys()].filter(p=>p.endsWith(path.sep+'state.json'));}
function writes(x){return x.io.events.filter(e=>['write','mkdir','rename','unlink','rmdir'].includes(e.op));}
check('name lookup and empty read create no artifacts',()=>{
 const x=fixture(),count=x.io.entries.size;for(let i=0;i<1000;i++){const d=x.store.forName('unregistered'+i);assert.equal(d.read().maxRound,-1);}
 assert.equal(x.io.entries.size,count);assert.equal(writes(x).length,0);
});
check('read-only first transaction creates no artifact',()=>{const x=fixture(),d=x.store.forName('vevivo'),count=x.io.entries.size;assert.equal(d.transaction(()=>({value:7})),7);assert.equal(x.io.entries.size,count);assert.equal(writes(x).length,0);});
check('first commit preserves real signature and all durability ordering',()=>{
 const x=fixture(),d=x.store.forName('vevivo'),original=put(d,'vevivo');assert.ok(crypto.verify(null,Buffer.from(original.recordJson),publicKey,Buffer.from(original.signature,'base64url')));
 assert.deepEqual(d.read().names.vevivo.envelope,original);
 const f=stateFile(x),dir=path.dirname(f),shard=path.dirname(dir),events=x.io.events;
 const reserve=events.findIndex(e=>e.op==='rename'&&e.path===path.join(x.root,'root.json'));
 const marker=events.findIndex(e=>e.op==='mkdir'&&e.path===dir);
 const markerSync=events.findIndex((e,i)=>i>marker&&e.op==='syncdir'&&e.path===shard);
 const stateRename=events.findIndex(e=>e.op==='rename'&&e.path===f);
 const stateSync=events.findIndex((e,i)=>i>stateRename&&e.op==='syncdir'&&e.path===dir);
 assert.ok(reserve>=0&&reserve<marker&&marker<markerSync&&markerSync<stateRename&&stateRename<stateSync);
 assert.equal(JSON.parse(x.io.readFileSync(path.join(x.root,'root.json'))).allocatedNames,1);
});
check('same-round exact cached envelope returned without writing',()=>{const x=fixture(),d=x.store.forName('vevivo'),original=put(d,'vevivo');x.io.events=[];const replay=d.transaction(s=>({value:s.names.vevivo.envelope}));assert.deepEqual(replay,original);assert.equal(writes(x).length,0);});
check('reopen preserves old signature bytes',()=>{const x=fixture(),original=put(x.store.forName('vevivo'),'vevivo');x.store.close();x.store=new x.Ctor(x.options);assert.deepEqual(x.store.forName('vevivo').read().names.vevivo.envelope,original);});
check('per-name transaction exposes no other names or global round',()=>{const x=fixture();put(x.store.forName('first'),'first',100,100);const d=x.store.forName('second');assert.deepEqual(d.read().names,{});put(d,'second',1,1);assert.deepEqual(Object.keys(d.read().names),['second']);assert.equal(stateFiles(x).length,2);});
check('cross-name state rejected before allocation',()=>{const x=fixture(),d=x.store.forName('vevivo');assert.throws(()=>put(d,'other'),/wrong_name/);assert.equal(stateFiles(x).length,0);assert.equal(writes(x).length,0);put(d,'vevivo');});
check('same-name rollback and same-round conflicting envelope rejected',()=>{const x=fixture(),d=x.store.forName('vevivo'),old=put(d,'vevivo',5,100);assert.throws(()=>put(d,'vevivo',4,100),/rollback/);assert.throws(()=>put(d,'vevivo',6,99),/rollback/);assert.throws(()=>put(d,'vevivo',5,100,{changed:true}),/round_conflict/);assert.deepEqual(d.read().names.vevivo.envelope,old);});
check('capacity bound does not disable existing-name refresh',()=>{const x=fixture({maxNames:1});const a=x.store.forName('first');put(a,'first');assert.throws(()=>put(x.store.forName('second'),'second'),/capacity_exceeded/);put(a,'first',2,2);assert.equal(a.read().maxRound,2);assert.equal(stateFiles(x).length,1);});
check('known directory missing state is never initialized as new',()=>{const x=fixture();put(x.store.forName('vevivo'),'vevivo');const f=stateFile(x);x.io.entries.delete(f);x.io.events=[];assert.throws(()=>x.store.forName('vevivo').read(),/missing_for_known_name/);assert.throws(()=>put(x.store.forName('vevivo'),'vevivo',2,2),/missing_for_known_name/);assert.equal(x.io.entries.has(f),false);assert.equal(writes(x).length,0);});
check('normal open cannot recreate missing root',()=>{const x=fixture();x.store.close();for(const p of [...x.io.entries.keys()])if(p===x.root||p.startsWith(x.root+path.sep))x.io.entries.delete(p);assert.throws(()=>new x.Ctor(x.options),/ENOENT/);assert.equal(x.io.entries.has(x.root),false);});
check('root identity and epoch mismatch rejected',()=>{const x=fixture();x.store.close();assert.throws(()=>new x.Ctor({...x.options,keyId:'c'.repeat(64)}),/metadata_invalid/);assert.throws(()=>new x.Ctor({...x.options,stateEpoch:'d'.repeat(32)}),/metadata_invalid/);assert.throws(()=>enrollNewNameSignerState(x.options),/already_exists/);});
check('exclusive root writer lock',()=>{const x=fixture();assert.throws(()=>new x.Ctor(x.options),/writer_already_open/);x.store.close();const reopened=new x.Ctor(x.options);reopened.close();});
check('failed file fsync preserves old row and poisons instance',()=>{const x=fixture(),d=x.store.forName('vevivo'),old=put(d,'vevivo'),f=stateFile(x);x.io.fault=e=>e.op==='syncfile'&&path.dirname(e.path)===path.dirname(f);assert.throws(()=>put(d,'vevivo',2,2),/EIO/);assert.deepEqual(JSON.parse(x.io.readFileSync(f)).names.vevivo.envelope,old);assert.throws(()=>d.read(),/requires_recovery/);});
check('failed directory barrier never returns visible-but-unacknowledged new signature',()=>{const x=fixture(),d=x.store.forName('vevivo');put(d,'vevivo');const f=stateFile(x);x.io.fault=e=>e.op==='syncdir'&&e.path===path.dirname(f);assert.throws(()=>put(d,'vevivo',2,2),/EIO/);assert.throws(()=>d.transaction(s=>({value:s.names.vevivo.envelope})),/requires_recovery/);});
check('interrupted first write retains refusal lock; even supervised lock recovery cannot recreate known state',()=>{
 const x=fixture(),d=x.store.forName('vevivo');
 x.io.fault=e=>e.op==='open-new'&&path.basename(path.dirname(e.path)).length===64;
 assert.throws(()=>put(d,'vevivo'),/EIO/);
 assert.equal(JSON.parse(x.io.readFileSync(path.join(x.root,'root.json'))).allocatedNames,1);
 assert.throws(()=>x.store.close(),/requires_recovery/);
 assert.equal(x.io.entries.has(x.store.lock),true);
 assert.throws(()=>new x.Ctor(x.options),/writer_already_open/);
 // Explicit IN-MEMORY supervised recovery fixture: the old process is gone
 // and an operator has inspected state. This is not a production unlock API.
 x.io.fault=null;
 x.io.unlinkSync(path.join(x.store.lock,'owner.json'));x.io.rmdirSync(x.store.lock);
 const reopened=new x.Ctor(x.options);
 assert.throws(()=>reopened.forName('vevivo').read(),/missing_for_known_name/);
});
check('poisoned clock checkpoint cannot release its writer lock on normal close',()=>{
 const x=fixture();x.setTime(NOW+100);
 x.io.fault=e=>e.op==='syncdir'&&e.path===x.root;
 assert.throws(()=>x.store.checkpointClock(),/EIO/);
 x.io.fault=null;x.io.events=[];
 assert.throws(()=>x.store.close(),/requires_recovery/);
 assert.equal(x.store.closed,false);assert.equal(writes(x).length,0);
 assert.equal(x.io.entries.has(path.join(x.store.lock,'owner.json')),true);
 assert.throws(()=>new x.Ctor(x.options),/writer_already_open/);
});
check('clock checkpoint writes metadata only and rejects backward clock',()=>{const x=fixture();put(x.store.forName('vevivo'),'vevivo');const before=x.io.readFileSync(stateFile(x));x.setTime(NOW+100);x.io.events=[];x.store.checkpointClock();assert.equal(x.io.events.filter(e=>e.op==='rename').length,1);assert.equal(x.io.events.find(e=>e.op==='rename').path,path.join(x.root,'root.json'));assert.equal(x.io.readFileSync(stateFile(x)),before);x.setTime(NOW);assert.throws(()=>x.store.forName('vevivo'),/clock_rollback/);});
check('clock cannot regress between checkpoint validation and commit',()=>{const x=fixture();x.setTime(NOW+150);x.store.checkpointClock();let reads=0;x.store.now=()=>++reads===1?NOW+200:NOW+100;x.io.events=[];assert.throws(()=>x.store.checkpointClock(),/clock_rollback/);assert.equal(writes(x).length,0);assert.equal(JSON.parse(x.io.readFileSync(path.join(x.root,'root.json'))).clockFloor,NOW+150);});
check('in-process metadata allocation rollback rejected',()=>{const x=fixture();put(x.store.forName('vevivo'),'vevivo');const p=path.join(x.root,'root.json'),m=JSON.parse(x.io.readFileSync(p));m.allocatedNames=0;x.io.entries.set(p,{type:'file',data:JSON.stringify(m)});assert.throws(()=>x.store.forName('vevivo'),/counter_rollback/);});
check('signer row larger than 32 KiB rejected before allocation',()=>{const x=fixture();assert.throws(()=>put(x.store.forName('vevivo'),'vevivo',1,1,{padding:'x'.repeat(32768)}),/size_invalid/);assert.equal(stateFiles(x).length,0);assert.equal(writes(x).length,0);});
check('uncommitted callback mutation and async callbacks rejected',()=>{const x=fixture(),d=x.store.forName('vevivo');assert.throws(()=>d.transaction(s=>{s.maxRound=1;return{value:'unsafe'};}),/uncommitted_mutation/);assert.throws(()=>d.transaction(async()=>({value:1})),/must_be_sync/);assert.equal(writes(x).length,0);});
check('empty first state commit cannot allocate name',()=>{const x=fixture(),d=x.store.forName('vevivo');assert.throws(()=>d.transaction(s=>({state:s,value:0})),/first_commit_empty/);assert.equal(writes(x).length,0);});
check('certificate driver preserves original certificates and larger bounded state',()=>{
 const x=fixture({kind:'certificates'}),d=x.store.forName('vevivo'),original=envelope('vevivo',1),certificate={schema:'test-certificate',observations:[original]};
 assert.equal(d.read().schema,'arns-mesh-certified-name-state/v1');
 const row={floor:{round:1},versions:[{certificate}],padding:'x'.repeat(100*1024)};
 d.transaction(s=>({state:{...s,names:{vevivo:row}},value:certificate}));
 assert.deepEqual(d.read().names.vevivo.versions[0].certificate,certificate);
 assert.ok(crypto.verify(null,Buffer.from(original.recordJson),publicKey,Buffer.from(original.signature,'base64url')));
});
check('certificate 512 KiB cap and signer identity stay separate',()=>{const x=fixture({kind:'certificates'}),d=x.store.forName('vevivo');assert.throws(()=>d.transaction(s=>({state:{...s,names:{vevivo:{padding:'x'.repeat(512*1024)}}},value:1})),/size_invalid/);assert.equal(writes(x).length,0);x.store.close();assert.throws(()=>new ShardedNameSignerState({...x.options,keyId:KEY}),/metadata_invalid/);});
check('50k catalogue update writes only one small name file and performs no enumeration',()=>{const x=fixture();const d=x.store.forName('vevivo');put(d,'vevivo');for(let i=1;i<50000;i++)x.io.entries.set(path.join(x.root,'existing-'+i),{type:'file',data:'historical-state'});const p=path.join(x.root,'root.json'),m=JSON.parse(x.io.readFileSync(p));m.allocatedNames=50000;x.io.entries.set(p,{type:'file',data:JSON.stringify(m)});x.io.events=[];put(d,'vevivo',2,2);const written=x.io.events.filter(e=>e.op==='write');assert.equal(written.length,1);assert.ok(written[0].bytes<32768);assert.equal(x.io.events.filter(e=>e.op==='rename'&&e.path===p).length,0);});
