import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyProfile,validateProfile,loadProfile,profileSchema,readProfile,mergeProfiles} from '../apps/helper/network-profile.mjs';
const good=()=>({schema:profileSchema,directPeers:['192.0.2.10:49741'],rpcSources:['198.51.100.20:8899'],arweavePeers:[]});
test('adding a profile preserves existing sources, deduplicates and keeps exports endpoint-only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-share-'));
 try{
  assert.deepEqual(readProfile(dir),{schema:profileSchema,directPeers:[],rpcSources:[],arweavePeers:[]});
  applyProfile(dir,good());
  fs.writeFileSync(path.join(dir,'identity.json'),'never-export-this');
  const incoming={...good(),directPeers:['[::1]:49741'],arweavePeers:['192.0.2.30:1984']};
  const merged=mergeProfiles(readProfile(dir),incoming);applyProfile(dir,merged);
  assert.deepEqual(readProfile(dir),merged);
  assert.deepEqual(merged.directPeers,['192.0.2.10:49741','[::1]:49741']);
  assert.deepEqual(merged.rpcSources,good().rpcSources);
  assert.equal(JSON.stringify(merged).includes('never-export-this'),false);
  assert.deepEqual(mergeProfiles(merged,incoming),merged);
  const full={...good(),directPeers:Array.from({length:16},(_,i)=>`192.0.2.${i+1}:49741`)};
  assert.throws(()=>mergeProfiles(full,incoming),/endpoint list/);
  assert.deepEqual(readProfile(dir),merged);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('profiles reject domains, URL credentials, secrets and invalid endpoint sets',()=>{
 for(const value of ['example.com:80','http://192.0.2.10:80','user:password@192.0.2.10:80','192.0.2.10:0','192.0.2.10:65536','192.0.2.10:1e3'])assert.throws(()=>validateProfile({...good(),rpcSources:[value]}));
 assert.throws(()=>validateProfile({...good(),privateKey:'not-a-real-key'}));
 assert.throws(()=>validateProfile({...good(),rpcSources:[]}));
 assert.throws(()=>validateProfile({...good(),directPeers:[]}));
 assert.throws(()=>validateProfile({...good(),directPeers:Array(17).fill('192.0.2.10:49741')}));
 const p=validateProfile({...good(),directPeers:['[::1]:49741','[::1]:49741']});assert.deepEqual(p.directPeers,['[::1]:49741']);
});
test('profile updates preserve identities and saved data and validate before writes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-profile-'));
 try{
  fs.writeFileSync(path.join(dir,'identity.json'),'private-test-marker');fs.writeFileSync(path.join(dir,'saved-sites.json'),'saved-test-marker');
  applyProfile(dir,good());const original=fs.readFileSync(path.join(dir,'solana-rpc-seeds.json'),'utf8');
  assert.throws(()=>applyProfile(dir,{...good(),rpcSources:['example.com:8899']}));assert.equal(fs.readFileSync(path.join(dir,'solana-rpc-seeds.json'),'utf8'),original);
  applyProfile(dir,{...good(),directPeers:['203.0.113.10:49741']});
  assert.equal(fs.readFileSync(path.join(dir,'identity.json'),'utf8'),'private-test-marker');assert.equal(fs.readFileSync(path.join(dir,'saved-sites.json'),'utf8'),'saved-test-marker');
  fs.mkdirSync(path.join(dir,'connections.lock'));assert.throws(()=>applyProfile(dir,good()),/in progress/);fs.rmdirSync(path.join(dir,'connections.lock'));
  assert.deepEqual(fs.readdirSync(dir).filter(n=>n.endsWith('.new')),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a failed staged profile leaves the old connection files intact',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-profile-'));
 try{
  applyProfile(dir,good());const before=fs.readFileSync(path.join(dir,'mesh-ip-peers.json'),'utf8');
  fs.mkdirSync(path.join(dir,'arweave-peers.json.new'));fs.writeFileSync(path.join(dir,'arweave-peers.json.new/block'),'x');
  assert.throws(()=>applyProfile(dir,{...good(),directPeers:['203.0.113.10:49741']}));
  assert.equal(fs.readFileSync(path.join(dir,'mesh-ip-peers.json'),'utf8'),before);assert.equal(fs.existsSync(path.join(dir,'connections.lock')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('profile files have a byte-size limit',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-profile-')),file=path.join(dir,'profile.json');
 try{fs.writeFileSync(file,' '.repeat(8193));assert.throws(()=>loadProfile(file),/8 KiB/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
