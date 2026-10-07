#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {parsePeerAddresses} from '../src/direct-peer.mjs';
import {peerAddress} from '../src/peer-directory.mjs';
import {decodeInvitation,withNetworkContinuity} from '../src/network-invitation.mjs';
import {probeSupporter} from '../src/supporter-readiness.mjs';

const args=process.argv.slice(2),values={name:[],exclude:[]};let json=false;
try{
 for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--json'){json=true;continue;}
  if(!['--data','--peer','--code','--trusted','--name','--exclude'].includes(key)||!args[i+1])throw new Error('Usage: check-supporter.mjs --data DIRECTORY [--json] | --peer IP:PORT --code MESH_CODE --name NAME [--name NAME] [--exclude IP:PORT] [--json]');
  const value=args[++i];if(['--name','--exclude'].includes(key))values[key.slice(2)].push(value);else values[key.slice(2)]=value;
 }
 let result;
 if(values.data&&!values.peer){
  const file=path.join(path.resolve(values.data),'operator-status.json');if(fs.statSync(file).size>32*1024*1024)throw new Error('operator_status_too_large');
  const status=JSON.parse(fs.readFileSync(file));if(!status.readiness)throw new Error('readiness_status_not_available_yet');
  result={...status.readiness,statusAt:status.at};
  if(!Number.isFinite(Date.parse(status.at))||Date.now()-Date.parse(status.at)>180000){result.ready=false;result.blockers=[...(result.blockers||[]),'operator_status_stale'];}
 }else{
  if(!values.peer||(!values.code&&!values.trusted))throw new Error('Use --data DIRECTORY for preparation status, or --peer IP:PORT --code MESH_CODE --name NAME for an independent reader check.');
  result=await probeSupporter({peer:parsePeerAddresses([values.peer])[0],invitation:values.code?withNetworkContinuity(decodeInvitation(values.code)):undefined,trustedPeers:values.trusted?.split(','),names:values.name,exclude:values.exclude.map(value=>peerAddress(parsePeerAddresses([value])[0]))});
 }
 if(json)console.log(JSON.stringify(result,null,2));
 else{
  console.log(result.ready?'PASS: the requested names and their verified file sets are available through this supporter.':'NOT READY: preparation or independent reader verification is incomplete.');
  if(result.names?.accepted!==undefined)console.log('Accepted names: '+result.names.accepted+'/'+result.names.requested+'. Complete prepared sites: '+result.files.completePreparedSites+'.');
  if(Array.isArray(result.names))for(const row of result.names)console.log(row.name+': '+(row.ready?'PASS ('+row.files+' verified files)':row.error||'incomplete'));
  if(result.blockers?.length)console.log('Pending: '+result.blockers.join(', '));
  if(result.error)console.log('Reason: '+result.error);
  console.log('This result covers the stated names and checking machine; it is not a claim that every ArNS site is replicated.');
 }
 process.exitCode=result.ready?0:2;
}catch(error){console.error(String(error.message));process.exitCode=2;}
