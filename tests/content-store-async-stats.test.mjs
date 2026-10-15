import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {VerifiedContentStore} from '../src/content-store.mjs';

const id=value=>String(value).padStart(43,'A');
function fixture(t){
  const temporaryRoot=path.resolve(os.tmpdir());
  const directory=fs.mkdtempSync(path.join(temporaryRoot,'arns-mesh-async-stats-'));
  t.after(()=>{
    assert.equal(path.dirname(path.resolve(directory)),temporaryRoot);
    assert(path.basename(directory).startsWith('arns-mesh-async-stats-'));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const store=new VerifiedContentStore(directory,{maxBytes:Infinity,maxPinnedBytes:Infinity});
  // These files test metadata reporting only, not content verification.
  const add=(value,kind,bytes,seconds=1700000000)=>{
    const file=store.file(id(value),kind);
    fs.writeFileSync(file,Buffer.alloc(bytes,42));fs.utimesSync(file,seconds,seconds);
    return file;
  };
  return {store,directory,add};
}

test('async metadata scan matches fresh sync statistics and preserves the five-field rows and order',async t=>{
  const f=fixture(t);
  for(let i=0;i<40;i++)f.add(i,i%2?'l1':'ans104',i,1700000000+i);
  fs.writeFileSync(path.join(f.directory,'pins.json'),'{}');
  fs.writeFileSync(path.join(f.directory,id('ignored')+'.ans104.tmp'),'not a content entry');
  fs.writeFileSync(path.join(f.directory,'invalid.ans104'),'not a content entry');
  const expected=f.store.stats(),actual=await f.store.statsAsync();
  assert.deepEqual(actual,expected);assert.equal(actual.files.length,40);
  for(const row of actual.files)assert.deepEqual(Object.keys(row).sort(),['dataId','file','mtimeMs','size','storageKind']);
  assert.equal(actual.bytes,780);
  assert.deepEqual(await f.store.statsAsync(),expected);
});

test('every async scan reflects external addition, replacement, age and removal without changing stored files',async t=>{
  const f=fixture(t),first=f.add('first','ans104',3);
  assert.equal((await f.store.statsAsync()).bytes,3);
  const second=f.add('second','l1',7,1700000010);
  fs.writeFileSync(first,Buffer.alloc(13,73));fs.utimesSync(first,1700000020,1700000020);
  assert.deepEqual(await f.store.statsAsync(),f.store.stats());
  assert.equal((await f.store.statsAsync()).bytes,20);
  fs.unlinkSync(second);
  assert.deepEqual(await f.store.statsAsync(),f.store.stats());
  assert.deepEqual(fs.readFileSync(first),Buffer.alloc(13,73));
  assert.equal((await f.store.statsAsync()).bytes,13);
});

test('a file removed after listing is absent from the async result instead of aborting the display scan',async t=>{
  const f=fixture(t),removed=f.add('removed','ans104',9);f.add('retained','l1',5);
  const stat=fs.promises.stat.bind(fs.promises);let raced=false;
  t.mock.method(fs.promises,'stat',async(file,...options)=>{
    if(file===removed&&!raced){raced=true;fs.unlinkSync(removed);}
    return stat(file,...options);
  });
  const actual=await f.store.statsAsync();
  assert.equal(raced,true);assert.deepEqual(actual,f.store.stats());assert.equal(actual.bytes,5);
});

test('non-ENOENT failures and a missing store directory propagate instead of producing partial totals',async t=>{
  const f=fixture(t);f.add('broken','ans104',9);f.add('intact','l1',5);
  const reason=Object.assign(new Error('metadata permission denied'),{code:'EACCES'});
  const mocked=t.mock.method(fs.promises,'stat',async()=>{throw reason;});
  await assert.rejects(f.store.statsAsync(),error=>error===reason);mocked.mock.restore();
  const missing=new VerifiedContentStore(path.join(f.directory,'removed-store'));
  fs.rmdirSync(missing.directory);
  await assert.rejects(missing.statsAsync(),{code:'ENOENT'});
});

test('cancellation before and during a real metadata scan retains the original reason and never returns partial totals',async t=>{
  const f=fixture(t);for(let i=0;i<40;i++)f.add(i,'ans104',i+1);
  const before=new AbortController(),beforeReason=new Error('already cancelled');before.abort(beforeReason);
  await assert.rejects(f.store.statsAsync({signal:before.signal}),error=>error===beforeReason);
  const during=new AbortController(),reason=new Error('operator closed the report');
  const stat=fs.promises.stat.bind(fs.promises);let calls=0;
  t.mock.method(fs.promises,'stat',async(file,...options)=>{
    const result=await stat(file,...options);
    if(++calls===1)during.abort(reason);
    return result;
  });
  await assert.rejects(f.store.statsAsync({signal:during.signal}),error=>error===reason);
  assert(calls<40);assert.equal(f.store.stats().files.length,40);
});

test('an actual HTTP response completes while a large real metadata scan is still in progress',{timeout:15000},async t=>{
  const f=fixture(t);for(let i=0;i<1024;i++)f.add(i,i%2?'ans104':'l1',1);
  let scanCompleted=false,completedAtRequest=null;
  const server=http.createServer((request,response)=>{
    completedAtRequest=scanCompleted;
    response.writeHead(200,{'Content-Type':'text/plain'});response.end('responsive');
  });
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const scan=f.store.statsAsync().finally(()=>{scanCompleted=true;});
  const reply=new Promise((resolve,reject)=>{
    const request=http.get({host:'127.0.0.1',port:server.address().port,path:'/',agent:false},response=>{
      let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;});
      response.on('end',()=>resolve({status:response.statusCode,body,scanCompleted}));response.on('error',reject);
    });
    request.on('error',reject);request.setTimeout(5000,()=>request.destroy(new Error('HTTP progress deadline')));
  });
  const [result,stats]=await Promise.all([reply,scan]);
  assert.deepEqual(result,{status:200,body:'responsive',scanCompleted:false});
  assert.equal(completedAtRequest,false);assert.equal(stats.files.length,1024);assert.equal(stats.bytes,1024);
});
