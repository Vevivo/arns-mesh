import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source=new URL('../src/arweave-direct.mjs',import.meta.url);
const root=fileURLToPath(new URL('..',import.meta.url));

test('importing the retrieval module accepts Electron switches, absent argv and Windows paths without running its CLI',()=>{
 for(const arg of ['--remote-debugging-address=127.0.0.1',undefined,'C:\\Program Files\\Mesh\\Mesh-Browser.exe']){
  const code=`process.argv[1]=${JSON.stringify(arg)??'undefined'};await import(${JSON.stringify(source.href)});console.log('MODULE_IMPORTED');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/MODULE_IMPORTED/);assert.doesNotMatch(result.stderr,/Invalid URL|record\.json/);
 }
});

test('executing the retrieval module directly still enters its CLI',()=>{
 const missing=path.join(root,'.test-state','missing-entrypoint-record-'+process.pid+'.json');
 const result=spawnSync(process.execPath,[fileURLToPath(source),missing],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
 assert.ifError(result.error);assert.equal(result.status,1);assert.match(result.stderr,/ENOENT/);assert.match(result.stderr,/missing-entrypoint-record/);assert.doesNotMatch(result.stderr,/Invalid URL/);
});
