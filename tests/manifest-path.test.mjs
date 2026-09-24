import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveManifestPath,manifestTargetIds} from '../src/manifest-path.mjs';
import {resolveSavedContent} from '../src/saved-access.mjs';
const a='A'.repeat(43),b='B'.repeat(43),c='C'.repeat(43);
const manifest=(extra={})=>({manifest:'arweave/paths',version:'0.2.0',paths:{'index.html':{id:a},'docs/':{id:b}},...extra});
test('v2 index.id opens even when not listed in paths and takes priority over index.path',()=>{
 for(const index of [{id:c},{id:c,path:'index.html'}])assert.deepEqual(resolveManifestPath(manifest({index}),''),{id:c,path:'',kind:'index'});
 assert.deepEqual(manifestTargetIds(manifest({index:{id:c},fallback:{id:b}})),[a,b,c]);
});
test('path indexes, trailing slashes, exact content and v2 fallback follow gateway semantics',()=>{
 const m=manifest({index:{path:'index.html'},fallback:{id:c}});
 assert.equal(resolveManifestPath(m,'').id,a);
 assert.equal(resolveManifestPath(m,'index.html/').id,a);
 assert.equal(resolveManifestPath(m,'docs').id,b);
 assert.equal(resolveManifestPath(m,'docs/').id,b);
 assert.deepEqual(resolveManifestPath(m,'missing'),{id:c,path:'missing',kind:'fallback'});
});
test('v1 does not apply v2-only index.id or fallback; invalid target cannot hide behind fallback',()=>{
 const m=manifest({version:'0.1.0',index:{id:c,path:'index.html'},fallback:{id:b}});
 assert.equal(resolveManifestPath(m,'').id,a);
 assert.throws(()=>resolveManifestPath(m,'missing'),/manifest_path_not_found/);
 assert.throws(()=>resolveManifestPath(manifest({version:'0.3.0'})),/unsupported_manifest/);
 assert.throws(()=>resolveManifestPath(manifest({paths:{'broken':{id:'https://example.com'}},fallback:{id:a}}),'broken'),/invalid_manifest_target/);
 assert.throws(()=>resolveManifestPath(manifest(),'toString'),/manifest_path_not_found/);
});
test('saved access fetches a v2 index.id through its existing verified-content boundary',async()=>{
 const m=manifest({index:{id:c}}),requested=[];
 const record={name:'fixture',txId:a,observedAt:new Date(0).toISOString(),provenance:{kind:'local-rpc'}};
 const result=await resolveSavedContent({name:'fixture',requestedPath:'',snapshotStore:{get(){return record;}},client:{},fetchById:async id=>{
  requested.push(id);return {storageKind:'ans104',direct:{peer:'fixture',payload:Buffer.from(id===a?JSON.stringify(m):'index-id-page'),tags:[{name:'Content-Type',value:id===a?'application/x.arweave-manifest+json':'text/html'}]}};
 }});
 assert.deepEqual(requested,[a,c]);assert.equal(result.body.toString(),'index-id-page');assert.equal(result.dataId,c);
 assert.equal(result.verification.currentStateVerified,false);
});
