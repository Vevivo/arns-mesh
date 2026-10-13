import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
const source=fs.readFileSync(new URL('../src/content-store.mjs',import.meta.url),'utf8');
const classSource=source.slice(source.indexOf('export class VerifiedContentStore')).replace('export class ','class ')+'; VerifiedContentStore;';
const id=letter=>letter.repeat(43);
function fixture(){
 const files=new Map(),removed=[],reads={stat:0,dates:0};let order=[];
 const add=(name,size,mtimeMs)=>{if(!files.has(name))order.push(name);files.set(name,{size,mtimeMs});};
 const fakeFs={mkdirSync(){},existsSync(){return false;},readdirSync(){return order.filter(name=>files.has(name));},statSync(file){
  reads.stat++;const row=files.get(path.basename(file));if(!row)throw Object.assign(new Error('gone'),{code:'ENOENT'});
  const stat={size:row.size,mtimeMs:row.mtimeMs,mode:33152,ino:12,uid:1,gid:1,blocks:1,blksize:4096};
  for(const key of ['atime','mtime','ctime','birthtime'])Object.defineProperty(stat,key,{enumerable:true,get(){reads.dates++;return new Date(row.mtimeMs);}});
  return stat;
 },unlinkSync(file){removed.push(path.basename(file));files.delete(path.basename(file));}};
 const Store=vm.runInNewContext(classSource,{fs:fakeFs,path,EventEmitter});
 const store=new Store('/fixture',{maxBytes:Infinity,maxPinnedBytes:Infinity});
 function baseline(){
  const rows=order.filter(name=>files.has(name)&&/^[A-Za-z0-9_-]{43}\.(ans104|l1)$/.test(name)).map(name=>{const row=files.get(name);return {file:path.join('/fixture',name),dataId:name.slice(0,43),storageKind:name.slice(44),size:row.size,mtimeMs:row.mtimeMs};});
  return {files:rows,bytes:rows.reduce((sum,row)=>sum+row.size,0)};
 }
 return {store,files,removed,reads,add,baseline};
}
const plain=value=>({bytes:value.bytes,files:Array.from(value.files,({file,dataId,storageKind,size,mtimeMs})=>({file,dataId,storageKind,size,mtimeMs}))});
test('fresh content statistics preserve file order, kind, size and age without materializing Date fields',()=>{
 const f=fixture();f.add(id('B')+'.l1',7,20);f.add('pins.json',999,0);f.add(id('A')+'.ans104',3,10);f.add(id('A')+'.ans104.tmp',999,0);
 const got=f.store.stats();assert.deepEqual(plain(got),f.baseline());assert.equal(f.reads.stat,2);assert.equal(f.reads.dates,0);
 assert.deepEqual(Object.keys(got.files[0]).sort(),['dataId','file','mtimeMs','size','storageKind']);
});
test('every scan sees external size, age, addition and removal changes',()=>{
 const f=fixture();f.add(id('A')+'.ans104',3,10);f.store.stats();f.add(id('A')+'.ans104',13,30);f.add(id('B')+'.l1',7,20);assert.deepEqual(plain(f.store.stats()),f.baseline());
 f.files.delete(id('A')+'.ans104');assert.deepEqual(plain(f.store.stats()),f.baseline());assert.equal(f.reads.stat,4);
});
test('pruning retains identical age order, tie order, byte and file limits across both storage kinds',()=>{
 for(const limits of [{maxBytes:8,maxFiles:Infinity},{maxBytes:Infinity,maxFiles:2},{maxBytes:3,maxFiles:1}]){
  const f=fixture();f.add(id('P')+'.ans104',100,0);f.add(id('P')+'.l1',50,0);f.add(id('B')+'.l1',4,10);f.add(id('A')+'.ans104',4,10);f.add(id('C')+'.ans104',5,20);
  f.store.pins.saved=[id('P')];Object.assign(f.store,limits);
  const automatic=f.baseline().files.filter(row=>row.dataId!==id('P')).sort((a,b)=>a.mtimeMs-b.mtimeMs);
  let bytes=automatic.reduce((sum,row)=>sum+row.size,0),count=automatic.length;const expected=[];
  for(const row of automatic){if(bytes<=limits.maxBytes&&count<=limits.maxFiles)break;expected.push(path.basename(row.file));bytes-=row.size;count--;}
  f.store.prune();assert.deepEqual(f.removed,expected);assert.equal(f.files.has(id('P')+'.ans104'),true);assert.equal(f.files.has(id('P')+'.l1'),true);assert.equal(f.store.pinStats().bytes,150);assert.deepEqual(plain(f.store.stats()),f.baseline());
 }
});
