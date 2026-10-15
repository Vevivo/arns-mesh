import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readNameSignerRpcConfiguration} from '../src/name-security-runtime.mjs';

function fixture(t){
 const parent=path.resolve(process.env.ARNS_TEST_TMP_ROOT||os.tmpdir());
 const directory=fs.mkdtempSync(path.join(parent,'mesh-signer-rpc-test-'));
 t.after(()=>{assert.equal(path.dirname(directory),parent);fs.rmSync(directory,{recursive:true,force:true});});
 const managed=path.join(directory,'solana-rpc-seeds.json'),dedicated=path.join(directory,'operator-rpc-seeds.json');
 const write=(file,rows)=>fs.writeFileSync(file,JSON.stringify(rows));
 write(managed,[{host:'192.0.2.10',port:8899}]);write(dedicated,[{host:'198.51.100.20',port:8899}]);
 return {managed,dedicated,write,env:{SOLANA_RPC_SEEDS:managed,ARNS_NAME_SIGNER_RPC_SEEDS:dedicated}};
}

test('dedicated witness RPC configuration wins and is captured separately from managed reader profile updates',t=>{
 const f=fixture(t),captured=readNameSignerRpcConfiguration(f.env);
 assert.equal(captured.seedFile,fs.realpathSync(f.dedicated));
 assert.deepEqual(captured.rpcSeeds,[{host:'198.51.100.20',port:8899}]);
 f.write(f.managed,[{host:'203.0.113.30',port:8899}]);
 assert.deepEqual(readNameSignerRpcConfiguration(f.env),captured,'reader profile changes cannot replace dedicated witness sources');
 f.write(f.dedicated,[{host:'198.51.100.21',port:8899}]);
 assert.deepEqual(captured.rpcSeeds,[{host:'198.51.100.20',port:8899}],'an initialized signer keeps its validated sources until restart');
 assert.deepEqual(readNameSignerRpcConfiguration(f.env).rpcSeeds,[{host:'198.51.100.21',port:8899}]);
});

test('legacy fallback remains explicit and a broken dedicated file never falls back to managed RPC',t=>{
 const f=fixture(t);
 assert.deepEqual(readNameSignerRpcConfiguration({SOLANA_RPC_SEEDS:f.managed}).rpcSeeds,[{host:'192.0.2.10',port:8899}]);
 fs.unlinkSync(f.dedicated);
 assert.throws(()=>readNameSignerRpcConfiguration(f.env),error=>error.code==='ENOENT');
 assert.throws(()=>readNameSignerRpcConfiguration({}),/name_signer_rpc_seeds_required/);
});

test('dedicated witness RPC file must be absolute and different from the managed profile file',t=>{
 const f=fixture(t);
 assert.throws(()=>readNameSignerRpcConfiguration({...f.env,ARNS_NAME_SIGNER_RPC_SEEDS:'relative.json'}),/absolute_path_required/);
 assert.throws(()=>readNameSignerRpcConfiguration({...f.env,ARNS_NAME_SIGNER_RPC_SEEDS:f.managed}),/must_be_separate/);
});

test('witness RPC configuration rejects domains, credentials, invalid ports, empty and oversized lists',t=>{
 const f=fixture(t);
 for(const rows of [[],Array.from({length:17},()=>({host:'192.0.2.10',port:8899})),[{host:'rpc.example.invalid',port:8899}],[{host:'192.0.2.10',port:0}],[{host:'192.0.2.10',port:'8899'}],[{host:'192.0.2.10',port:8899,authorization:'not-allowed'}]]){
  f.write(f.dedicated,rows);assert.throws(()=>readNameSignerRpcConfiguration(f.env),/name_signer_rpc_seeds?_invalid/);
 }
 fs.writeFileSync(f.dedicated,' '.repeat(16385));
 assert.throws(()=>readNameSignerRpcConfiguration(f.env),/name_security_configuration_size/);
 f.write(f.dedicated,[{host:'2001:db8::20',port:8899}]);
 assert.equal(readNameSignerRpcConfiguration(f.env).rpcSeeds[0].host,'2001:db8::20');
});
