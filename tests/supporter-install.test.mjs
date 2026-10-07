import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {settingsFor,parseEnvironment,capacityReport,configureProfile} from '../scripts/supporter-profile.mjs';
import {communityInvitation} from '../scripts/community-network.mjs';
test('supporter profiles budget content, complete preparation and R84 refresh separately',()=>{
 const vps=settingsFor('vps','203.0.113.9:49741'),pi=settingsFor('pi','[2001:db8::1]:49741');
 for(const profile of [vps,pi]){
  assert.equal(profile.ARNS_PREPARE_MAX_SITES,20000);assert.equal(profile.ARNS_REPLICATION_MAX_SITES,20000);
  assert.equal(profile.ARNS_CATALOG_BULK_SCAN,1);assert.equal(profile.ARNS_REPLICATION_ENABLED,1);
  assert.equal(profile.ARNS_RELAY_MAX_RECORDS,40000);
 }
 assert.equal(pi.MESH_LISTEN,'[::]:49741');
 assert.equal(capacityReport(vps,134*1024**3).enough,true);
 assert.equal(capacityReport(vps,133*1024**3).enough,false);
 assert.equal(capacityReport(pi,74*1024**3).enough,true);
 assert.equal(capacityReport(pi,73*1024**3).enough,false);
 assert.equal(capacityReport(vps,84*1024**3,49*1024**3,false).enough,false);
 assert.equal(capacityReport(vps,84*1024**3,50*1024**3,false).enough,true);
 assert.throws(()=>settingsFor('unknown'));assert.throws(()=>settingsFor('vps','example.com:49741'));
 assert.throws(()=>settingsFor('vps','127.0.0.1:70000'));assert.throws(()=>settingsFor('vps','127.0.0.1:0'));
});
test('supporter settings preserve operator values and do not evaluate shell text',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-profile-'));
 try{
  fs.writeFileSync(path.join(root,'peer.env'),'# kept\nARNS_SAVED_MIB=1234\nMESH_CUSTOM=$(touch should-not-exist)\n');
  configureProfile({root,profile:'pi',advertise:'203.0.113.9:49741',write:true});
  const first=fs.readFileSync(path.join(root,'peer.env'),'utf8');
  assert.equal(parseEnvironment(first).ARNS_SAVED_MIB,'1234');
  assert.equal(parseEnvironment(first).MESH_CUSTOM,'$(touch should-not-exist)');
  configureProfile({root,profile:'pi',advertise:'203.0.113.9:49741',write:true});
  assert.equal(fs.readFileSync(path.join(root,'peer.env'),'utf8'),first);
  assert.throws(()=>configureProfile({root,profile:'vps',write:true}),/existing_capacity_profile_preserved/);
  assert.throws(()=>configureProfile({root,profile:'pi',advertise:'203.0.113.10:49741',write:true}),/existing_advertise_address_preserved/);
  fs.appendFileSync(path.join(root,'peer.env'),'ARNS_PREPARE_MAX_SITES=32\n');
  assert.throws(()=>configureProfile({root,profile:'pi',requirePreparation:true}),/existing_settings_need_review/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('community default fails closed when bundle is absent, ambiguous or unsigned',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-community-')),file=path.join(root,'network.json');
 try{
  assert.throws(()=>communityInvitation(file),/community_network_unavailable/);
  fs.writeFileSync(file,JSON.stringify({schema:'arns-mesh-bundled-continuity/v1',invitations:[]}));
  assert.throws(()=>communityInvitation(file),/one_signed_community_network_required/);
  fs.writeFileSync(file,JSON.stringify({schema:'arns-mesh-bundled-continuity/v1',invitations:[{version:2,key:'invalid'}]}));
  assert.throws(()=>communityInvitation(file));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
