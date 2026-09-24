import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {fetchMeshContent} from '../src/content-fetcher.mjs';
test('reader peer success prevents unnecessary location lookups; peer failure releases alternatives immediately',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-reader-priority-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'locations.json');fs.writeFileSync(file,'{}');const id='a'.repeat(43);let located=0;
 const direct={storageKind:'ans104',payload:Buffer.from('provider already verified')};
 const client={content:async()=>direct,locateCandidates:async()=>{located++;throw new Error('unexpected index request');}};
 const first=await fetchMeshContent(id,{client,locationsFile:file,meshHeadStartMs:3000});
 assert.equal(first.direct,direct);assert.equal(located,0);
 const controller=new AbortController();let releasedAt;
 client.content=async()=>{throw new Error('peer unavailable');};
 client.locateCandidates=async()=>{releasedAt=Date.now();controller.abort(new Error('stop test before raw network'));throw new Error('no location');};
 const started=Date.now();await assert.rejects(fetchMeshContent(id,{client,locationsFile:file,meshHeadStartMs:3000,signal:controller.signal}));
 assert.ok(releasedAt-started<500,'failure must not wait through the head start');
});
