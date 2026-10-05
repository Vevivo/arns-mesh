import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {queryParents,discoverPreparedLocations,OnlineLocationPreparer,preparationProviders} from '../src/online-location-preparation.mjs';
import {requestLocationPreparation,awaitPreparedLocation} from '../src/preparation-inbox.mjs';
import {LocationIndex} from '../src/location-index.mjs';
const a='A'.repeat(43),b='B'.repeat(43),c='C'.repeat(43);
const temporary=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-preparation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
test('online metadata accepts only exact public IDs and bounded allowlisted responses',async()=>{
 const options={fetchImpl:async(url,opts)=>{assert.equal(url,preparationProviders[0]);assert.equal(opts.redirect,'error');assert.match(opts.body,/transactions/);return new Response(JSON.stringify({data:{transactions:{edges:[{node:{id:a,bundledIn:{id:b}}}]}}}));}};
 assert.equal((await queryParents(preparationProviders[0],[a],options)).get(a),b);
 await assert.rejects(queryParents('https://example.com/graphql',[a],options),/invalid_preparation/);
 await assert.rejects(queryParents(preparationProviders[0],[c],options),/unexpected_preparation_id/);
 await assert.rejects(queryParents(preparationProviders[0],[a],{fetchImpl:async()=>new Response(' '.repeat(512*1024+1))}),/response_too_large/);
 let bytes=0;await queryParents(preparationProviders[0],[a],{...options,onBytes:n=>bytes+=n});assert.ok(bytes>0);
});
test('nested discovery preserves ancestry, rejects cycles, and never invents a missing root',async()=>{
 const graph=new Map([[a,b],[b,c],[c,null]]);
 const query=async(_url,ids)=>new Map(ids.filter(id=>graph.has(id)).map(id=>[id,graph.get(id)]));
 const rows=await discoverPreparedLocations([a],{query});assert.equal(rows[a].rootTxId,c);assert.deepEqual(rows[a].path,[b]);
 graph.delete(c);assert.deepEqual(await discoverPreparedLocations([a],{query}),{});
 graph.set(c,a);await assert.rejects(discoverPreparedLocations([a],{query}),/cycle/);
});
test('fresh target and live demand become hot-loaded hints; quota and fallback survive restart',async t=>{
 const dir=temporary(t);fs.writeFileSync(path.join(dir,'target-catalog.json'),JSON.stringify({targets:{new:{dataId:a,observedAt:Date.now()}}}));
 let primaryFailed=false;
 const query=async(origin,ids,{onBytes})=>{onBytes(60);if(origin===preparationProviders[0]){primaryFailed=true;throw new Error('temporary_unavailable');}return new Map(ids.map(id=>[id,id===a?b:null]));};
 const w=new OnlineLocationPreparer({dataDir:dir,dailyBytes:1000,query});requestLocationPreparation(a,w.inbox);
 await w.pass();assert.equal(primaryFailed,true);assert.equal(w.status().completed,1);assert.equal(w.status().dayResponseBytes,180);
 const index=new LocationIndex(path.join(dir,'locations.json'),{preparedFile:w.file});assert.equal(index.get(a).rootTxId,b);assert.equal(index.get(a).preparation.provider,'arweave-graphql');assert.equal(fs.readdirSync(w.inbox).length,0);
 const resumed=new OnlineLocationPreparer({dataDir:dir,dailyBytes:100,query:()=>{throw new Error('quota must prevent request');}});await resumed.pass();assert.equal(resumed.status().budgetExhausted,true);assert.equal(resumed.status().dayResponseBytes,180);
});
test('the locked-down process waits for a file handoff without making a network request',async t=>{
 const dir=temporary(t),w=new OnlineLocationPreparer({dataDir:dir,query:async(_o,ids)=>new Map(ids.map(id=>[id,id===a?b:null]))});
 const prior=[process.env.ARNS_PREPARATION_INBOX,process.env.ARNS_PREPARED_LOCATIONS];
 process.env.ARNS_PREPARATION_INBOX=w.inbox;process.env.ARNS_PREPARED_LOCATIONS=w.file;
 t.after(()=>{for(const [i,k] of ['ARNS_PREPARATION_INBOX','ARNS_PREPARED_LOCATIONS'].entries())if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});
 const promise=awaitPreparedLocation(a,{locationsFile:path.join(dir,'locations.json'),waitMs:1500});
 await w.pass();assert.equal((await promise).rootTxId,b);
});
test('failed preparation backs off without erasing the last useful routing hint',async t=>{
 const dir=temporary(t);let now=Date.now(),fail=false,queries=0;
 const query=async(_o,ids)=>{queries++;if(fail)throw new Error('offline');return new Map(ids.map(id=>[id,id===a?b:null]));};
 const w=new OnlineLocationPreparer({dataDir:dir,query,now:()=>now});requestLocationPreparation(a,w.inbox);await w.pass();
 fail=true;now+=70000;requestLocationPreparation(a,w.inbox);await w.pass();const before=queries;await w.pass();assert.equal(queries,before);assert.equal(w.rows[a].rootTxId,b);
});
