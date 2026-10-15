#!/usr/bin/env node
import '../src/network-lockdown.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parsePeerAddresses} from '../src/direct-peer.mjs';
import {namePolicyId,validateNameWitnessPolicy,verifyNameCertificate} from '../src/name-certificates.mjs';
import {NameCertificateCollector} from '../src/name-certificate-collector.mjs';
import {collectNameCertificates} from '../src/name-certificate-transport.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const usage='Usage: node scripts/check-name-witnesses.mjs --policy FILE --policy-id AUTHENTICATED_HASH --name NAME --peer IP:PORT [--peer IP:PORT] [--mode current|historical] [--timeout-ms 12000]';
export async function checkNameWitnesses({policy,policyId,name,peers,mode='current',timeoutMs=12000,signal,now=Date.now,directQuery}={}){
 const checked=validateNameWitnessPolicy(policy,{now:now()});
 if(namePolicyId(checked)!==policyId)fail('name_witness_probe_policy_pin_mismatch');
 if(typeof name!=='string'||!/^[a-z0-9_-]{1,255}$/.test(name)||!['current','historical'].includes(mode)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Array.isArray(peers)||peers.length<1||peers.length>16)fail('name_witness_probe_options_invalid');
 const collector=new NameCertificateCollector({policy:checked,name,mode,now});
 const collected=await collectNameCertificates({policy:checked,name,mode,collector,peers,timeoutMs,signal,now,dhtEnabled:false,...(directQuery?{directQuery}:{})});
 const common={schema:'arns-mesh-name-witness-check/v1',name,policyId,mode,requiredDomains:checked.threshold,configuredDomains:new Set(checked.witnesses.map(w=>w.domain)).size,maxFaults:checked.maxFaults,courierEndpoints:peers.length,currentStateVerified:false,operatorIndependence:'requires-external-verification',contentChecked:false,readerStateWritten:false};
 if(!collected)return {...common,ready:false,status:'quorum-unavailable',authenticatedDomains:collector.stats().partialDomains};
 // A successful courier request is insufficient. Verify the original quorum
 // again; this diagnostic never treats a routing envelope as name authority.
 const verification=verifyNameCertificate(collected.certificate,checked,{name,mode,now:now()});
 if(mode==='current'&&!verification.currentWindow)return {...common,ready:false,status:'outside-current-window',authenticatedDomains:verification.domains.length,currentWindow:false};
 return {...common,ready:true,status:mode==='historical'?'certified-historical-observation':'certified-witness-observation',authenticatedDomains:verification.domains.length,witnessDomains:verification.domains,txId:verification.binding.txId,antId:verification.binding.antId,round:verification.round,observedAt:new Date(verification.observedAt).toISOString(),expiresAt:new Date(verification.expiresAt).toISOString(),historical:mode==='historical',currentWindow:verification.currentWindow};
}
export async function runNameWitnessCheck(args,{io=fs,now=Date.now,directQuery}={}){
 const options={peers:[]};
 for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];
  if(!['--policy','--policy-id','--name','--peer','--mode','--timeout-ms'].includes(key)||typeof value!=='string'||!value||value.startsWith('--'))fail('name_witness_probe_usage');
  if(key==='--peer')options.peers.push(value);else{if(Object.hasOwn(options,key))fail('name_witness_probe_usage');options[key]=value;}
 }
 if(!options['--policy']||!options['--name']||!/^[a-f0-9]{64}$/.test(options['--policy-id']||'')||!options.peers.length||options.peers.length>16)fail('name_witness_probe_usage');
 if(options['--timeout-ms']&&!/^[1-9][0-9]*$/.test(options['--timeout-ms']))fail('name_witness_probe_usage');
 const file=path.resolve(options['--policy']),stat=io.statSync(file);if(!stat.isFile()||stat.size>65536)fail('name_witness_probe_policy_size');
 const text=io.readFileSync(file,'utf8');if(Buffer.byteLength(text)>65536)fail('name_witness_probe_policy_size');
 const policy=JSON.parse(text),peers=parsePeerAddresses(options.peers);
 if(peers.length<1||peers.length>16)fail('name_witness_probe_usage');
 return checkNameWitnesses({policy,policyId:options['--policy-id'],name:options['--name'],peers,mode:options['--mode']||'current',timeoutMs:Number(options['--timeout-ms']||12000),now,directQuery});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runNameWitnessCheck(process.argv.slice(2)).then(result=>{console.log(JSON.stringify(result,null,2));process.exitCode=result.ready?0:2;},error=>{const code=typeof error.code==='string'&&/^(name_|certified_)[a-z0-9_]+$/.test(error.code)?error.code:'name_witness_probe_failed';console.error(code==='name_witness_probe_usage'?usage:code);process.exitCode=2;});
}
