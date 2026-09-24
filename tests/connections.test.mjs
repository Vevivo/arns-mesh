import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readConnections,saveConnections} from '../apps/helper/connections.mjs';
test('connection changes accept multiple IP peers and reject domains without damaging saved settings',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-connections-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const first={directPeers:['127.0.0.2:1234','[::1]:1235'],rpcSources:['127.0.0.1:8899']};
 saveConnections(dir,first);assert.deepEqual(readConnections(dir,dir),first);
 for(const change of [{...first,directPeers:['gateway.example:80']},{...first,rpcSources:['127.0.0.1:80/path']},{...first,rpcSources:[]}]){
  assert.throws(()=>saveConnections(dir,change));assert.deepEqual(readConnections(dir,dir),first);
 }
 fs.mkdirSync(path.join(dir,'connections.lock'));assert.throws(()=>saveConnections(dir,first),/in progress/);fs.rmdirSync(path.join(dir,'connections.lock'));
 const rename=fs.renameSync;fs.renameSync=(a,b)=>{if(b.endsWith('solana-rpc-seeds.json'))throw new Error('injected_write_failure');return rename(a,b);};
 try{assert.throws(()=>saveConnections(dir,{...first,directPeers:[]}),/injected_write_failure/);}finally{fs.renameSync=rename;}
 assert.deepEqual(readConnections(dir,dir),first);assert.equal(fs.existsSync(path.join(dir,'connections.lock')),false);
});
