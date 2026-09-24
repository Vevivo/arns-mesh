import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {RawLedgerDiscovery} from '../src/raw-ledger-discovery.mjs';
import {indexPartition} from '../src/index-partition.mjs';

test('three resumed index nodes divide old and new blocks without holes or overlap',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-partitions-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let tip=15;const visits=[[],[],[]];
 const instantiate=slot=>{
  const scanner=new RawLedgerDiscovery({locationsFile:path.join(dir,`${slot}.locations`),peersFile:path.join(dir,'peers'),stateFile:path.join(dir,`${slot}.state`),partition:`${slot}/3`,maxTransactions:2});
  scanner.json=async route=>route==='/info'?{network:'arweave.N.1',height:tip+2}:{height:Number(route.split('/').at(-1)),txs:[crypto.createHash('sha256').update(route).digest('base64url')]};
  scanner.inspectTransaction=async(_id,height)=>{visits[slot].push(height);return true;};
  return scanner;
 };
 for(let round=0;round<16;round++){
  for(let slot=0;slot<3;slot++)await instantiate(slot).pass();
  if(round<6)tip+=3;
 }
 const all=visits.flat();assert.equal(new Set(all).size,all.length);
 assert.deepEqual([...all].sort((a,b)=>a-b),Array.from({length:tip+1},(_,i)=>i));
 for(let slot=0;slot<3;slot++)assert.ok(visits[slot].every(height=>height%3===slot));
 const resumed=instantiate(0);assert.equal(resumed.status().partition,'0/3');
 assert.equal(resumed.status().allHistoryCovered,false);
 assert.throws(()=>new RawLedgerDiscovery({locationsFile:path.join(dir,'0.locations'),stateFile:path.join(dir,'0.state'),partition:'0/2'}),/separate_scan_state/);
});

test('bounded live queue eventually covers an offline gap with partitioned scheduling',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-partition-gap-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const scanner=new RawLedgerDiscovery({stateFile:path.join(dir,'state'),locationsFile:path.join(dir,'loc'),partition:'1/2',maxTransactions:0});
 scanner.state.tip=3;scanner.state.historyCursor=-1;
 scanner.json=async()=>({network:'arweave.N.1',height:1404});
 const heights=[];
 for(let i=0;i<12;i++){await scanner.pass();heights.push(...scanner.state.queue);scanner.state.queue=[];}
 assert.deepEqual(heights,Array.from({length:699},(_,i)=>5+i*2));
 for(const invalid of ['-1/2','2/2','0/0','0/65','0.1/2'])assert.throws(()=>indexPartition(invalid));
});
