import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {saveDiscoveredLocations,lookupDiscoveredLocation} from '../src/discovery-store.mjs';
import {RawLedgerDiscovery} from '../src/raw-ledger-discovery.mjs';

const digest = value => crypto.createHash('sha256').update(String(value)).digest();
const idFor = value => digest(value).toString('base64url');
const prefix = id => digest(id).toString('hex').slice(0,2);
const ids=[];
const childPrefixes=new Set();
for(let i=0;ids.length<9;i++){
  const id=idFor('split-'+i),hex=digest(id).toString('hex');
  if(hex.startsWith('aa')&&!childPrefixes.has(hex.slice(0,4))){ids.push(id);childPrefixes.add(hex.slice(0,4));}
}
const hint=(n,padding=0)=>({rootTxId:idFor('root-'+n),path:[],rootOffset:n*100,itemSize:100,note:'x'.repeat(padding)});
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-resilience-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};

test('a full legacy shard splits without losing records; a fresh process reads all hints',t=>{
  const dir=temp(t),file=path.join(dir,'locations.json');fs.mkdirSync(file+'.d');
  const rows=Object.fromEntries(ids.slice(0,2).map((id,i)=>[id,hint(i,800000)]));
  fs.writeFileSync(path.join(file+'.d','aa.json'),JSON.stringify(rows));
  assert.equal(lookupDiscoveredLocation(file,ids[0]).rootTxId,hint(0).rootTxId);
  assert.deepEqual(saveDiscoveredLocations(file,[[ids[2],hint(2,800000)]]),{added:1,full:[]});
  assert.equal(JSON.parse(fs.readFileSync(path.join(file+'.d','aa.json'))).schema,'arns-mesh-index-branch/v1');
  assert.deepEqual(saveDiscoveredLocations(file,[[ids[0],hint(99)],[ids[3],hint(3)]]),{added:1,full:[]});
  for(const [i,id] of ids.slice(0,4).entries())assert.equal(lookupDiscoveredLocation(file,id).rootTxId,hint(i===0?99:i).rootTxId);
  for(const name of fs.readdirSync(file+'.d'))assert.ok(fs.statSync(path.join(file+'.d',name)).size<=2*1024*1024);
  const moduleUrl=new URL('../src/discovery-store.mjs',import.meta.url).href;
  const child=execFileSync(process.execPath,['--input-type=module','-e',`import {lookupDiscoveredLocation as get} from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify(JSON.parse(process.argv[2]).map(id=>get(process.argv[1],id)?.rootTxId)))`,file,JSON.stringify(ids.slice(0,4))],{encoding:'utf8'});
  assert.deepEqual(JSON.parse(child),[99,1,2,3].map(n=>hint(n).rootTxId));
});

test('failed split publication leaves legacy records readable and never publishes orphan hints',t=>{
  const dir=temp(t),file=path.join(dir,'locations.json');
  saveDiscoveredLocations(file,ids.slice(0,2).map((id,i)=>[id,hint(i,800000)]));
  const parent=path.join(file+'.d','aa.json'),rename=fs.renameSync;
  fs.renameSync=(from,to)=>{if(to===parent)throw new Error('injected_publish_failure');return rename(from,to);};
  try{assert.throws(()=>saveDiscoveredLocations(file,[[ids[2],hint(2,800000)]]),/injected_publish_failure/);}
  finally{fs.renameSync=rename;}
  assert.equal(lookupDiscoveredLocation(file,ids[0]).rootTxId,hint(0).rootTxId);
  assert.equal(lookupDiscoveredLocation(file,ids[2]),null);
  saveDiscoveredLocations(file,[[ids[3],hint(3,800000)]]);
  assert.equal(lookupDiscoveredLocation(file,ids[2]),null);
  assert.equal(lookupDiscoveredLocation(file,ids[3]).rootTxId,hint(3).rootTxId);
  // Reusing an orphan child must overwrite its uncommitted prior contents.
  assert.equal(saveDiscoveredLocations(file,[[ids[2],hint(222)]]).added,1);
  assert.equal(lookupDiscoveredLocation(file,ids[2]).rootTxId,hint(222).rootTxId);
});

test('damaged shards and failed writes cannot silently discard the readable index',t=>{
  const dir=temp(t),file=path.join(dir,'locations.json');fs.mkdirSync(file+'.d');
  const target=path.join(file+'.d',prefix(ids[0])+'.json');fs.writeFileSync(target,'{"broken":');
  assert.throws(()=>saveDiscoveredLocations(file,[[ids[0],hint(0)]]));
  assert.equal(fs.readFileSync(target,'utf8'),'{"broken":');
  fs.unlinkSync(target);saveDiscoveredLocations(file,[[ids[0],hint(0)]]);
  const write=fs.writeFileSync;
  fs.writeFileSync=(f,...args)=>{if(f===target+'.tmp')throw new Error('ENOSPC');return write(f,...args);};
  try{assert.throws(()=>saveDiscoveredLocations(file,[[ids[1],hint(1)]]),/ENOSPC/);}
  finally{fs.writeFileSync=write;}
  assert.equal(lookupDiscoveredLocation(file,ids[0]).rootTxId,hint(0).rootTxId);
  assert.equal(lookupDiscoveredLocation(file,ids[1]),null);
});

test('oversize individual entries fail before changing any shard',t=>{
  const file=path.join(temp(t),'locations.json');
  assert.throws(()=>saveDiscoveredLocations(file,[[ids[0],hint(0)],[ids[1],hint(1,2*1024*1024)]]),/index_entry_too_large/);
  assert.equal(lookupDiscoveredLocation(file,ids[0]),null);
});

function scannerFixture(t,{maxTransactions=1,txsPerBlock=6}={}){
  const dir=temp(t),config={locationsFile:path.join(dir,'locations.json'),peersFile:path.join(dir,'peers.json'),stateFile:path.join(dir,'state.json'),maxTransactions};
  let height=102;const attempts=[];
  const instantiate=()=>{
    const scanner=new RawLedgerDiscovery(config);
    scanner.json=async route=>{
      if(route==='/info')return {network:'arweave.N.1',height};
      const h=Number(route.split('/').at(-1));return {height:h,txs:Array.from({length:txsPerBlock},(_,i)=>idFor(h+':'+i))};
    };
    scanner.inspectTransaction=async(txId,h,work)=>{attempts.push({txId,height:h});work.visits=(work.visits||0)+1;if(txId===idFor('retry'))throw new Error('unavailable_bundle');return true;};
    return scanner;
  };
  return {config,attempts,instantiate,advance:()=>{height+=3;}};
}

test('history, live blocks and retries all advance with one work unit per restart',async t=>{
  const f=scannerFixture(t);let scanner=f.instantiate();
  scanner.state.retries.push({txId:idFor('retry'),height:50,error:'unavailable_bundle',work:{}});scanner.save();
  for(let i=0;i<12;i++){scanner=f.instantiate();await scanner.pass();f.advance();}
  assert.deepEqual(scanner.status().laneAttempts,{retry:4,history:4,live:4});
  assert.equal(scanner.state.activeBlocks.history.position,4);
  assert.equal(scanner.state.activeBlocks.live.position,4);
  assert.equal(scanner.state.retries[0].work.visits,4);
  assert.ok(scanner.status().queuedBlocks>0);
  assert.equal(scanner.status().allHistoryCovered,false);
});

test('continuous new blocks cannot starve old blocks',async t=>{
  const f=scannerFixture(t,{txsPerBlock:1});let scanner=f.instantiate();
  for(let i=0;i<10;i++){await scanner.pass();f.advance();scanner=f.instantiate();}
  assert.ok(f.attempts.some(x=>x.height<99),'history reaches older blocks while tail remains busy');
  assert.ok(f.attempts.some(x=>x.height>100),'new blocks are also scanned');
  assert.ok(scanner.state.queue.length>0);
});

test('legacy active transaction, nested work and byte quota survive scheduler migration',async t=>{
  const f=scannerFixture(t);const scanner=f.instantiate();
  const work={bundle:true,cursor:{frames:[{base:0,next:8,path:[]}]}};
  const legacy={...scanner.state,historyCursor:99,tip:100,quotaBytes:12345,activeBlock:{height:100,txIds:[idFor('a'),idFor('b')],position:1,work}};
  delete legacy.activeBlocks;delete legacy.schedulerVersion;delete legacy.nextLane;
  fs.writeFileSync(f.config.stateFile,JSON.stringify(legacy));
  const restored=f.instantiate();assert.equal(restored.state.activeBlocks.history.position,1);
  assert.deepEqual(restored.state.activeBlocks.history.work,work);assert.equal(restored.state.quotaBytes,12345);
  assert.equal(restored.state.historyCursor,99);assert.equal(restored.state.activeBlock,undefined);
});

test('a failing live block does not prevent history from advancing on the next pass',async t=>{
  const f=scannerFixture(t,{txsPerBlock:1});const scanner=f.instantiate();
  await scanner.pass();f.advance();const original=scanner.json;
  scanner.json=route=>route==='/block/height/101'?Promise.reject(new Error('live_block_unavailable')):original(route);
  await scanner.pass();assert.match(scanner.status().lastError,/live_block_unavailable/);
  await scanner.pass();assert.ok(f.attempts.some(x=>x.height===99));
  assert.equal(scanner.state.queue[0],101);
});

test('an unresponsive transaction cannot hold a block head; its retry survives restart',async t=>{
  const dir=temp(t),slow=idFor('stalled-http'),healthy=idFor('healthy-http');
  const seen=[];let recovered=false;
  const server=http.createServer((req,res)=>{
    seen.push(req.url);
    if(req.url==='/tx/'+slow&&!recovered)return; // Leave the real socket pending.
    const value=req.url==='/info'?{network:'arweave.N.1',height:12}:
      req.url==='/block/height/10'?{height:10,txs:[slow,healthy]}:
      req.url.startsWith('/tx/')?{id:req.url.slice(4),tags:[]}:
      {height:Number(req.url.split('/').at(-1)),txs:[]};
    res.end(JSON.stringify(value));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const peer={host:'127.0.0.1',port:server.address().port};
  const config={locationsFile:path.join(dir,'locations'),peersFile:path.join(dir,'peers'),stateFile:path.join(dir,'state'),maxTransactions:3,transactionTimeoutMs:100};
  fs.writeFileSync(config.peersFile,JSON.stringify([peer]));
  const instantiate=()=>{const s=new RawLedgerDiscovery(config);s.peers=[peer];s.peersAt=Date.now();return s;};
  const scanner=instantiate();await scanner.pass();
  assert.ok(seen.includes('/tx/'+healthy),'later transaction was reached despite the hanging first request');
  assert.equal(scanner.state.activeBlocks.history,null);
  assert.equal(scanner.state.retries.length,1);
  assert.equal(scanner.state.retries[0].txId,slow);
  assert.match(scanner.state.retries[0].error,/index_transaction_deadline/);
  assert.equal(scanner.state.blocksCompleted,0,'a block with a pending transaction is not complete');
  const resumed=instantiate();assert.equal(resumed.state.retries[0].txId,slow);
  recovered=true;await resumed.pass();assert.equal(resumed.state.retries.length,0);
});
