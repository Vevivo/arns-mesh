// Diagnostic comparison, not discovery: heights came from the separately
// labelled public reference. No results are imported into browser routing.
import '../../src/network-lockdown.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {validateProfile} from '../../apps/helper/network-profile.mjs';
import {requestJson,inspectBundleOnPeer} from '../../src/arweave-direct.mjs';
const dir=process.env.QA_OUTPUT,profile=validateProfile(JSON.parse(process.env.MESH_QA_PROFILE));delete process.env.MESH_QA_PROFILE;
const privateValues=[...profile.directPeers,...profile.rpcSources,...profile.arweavePeers].flatMap(x=>[x,x.slice(0,x.lastIndexOf(':'))]).sort((a,b)=>b.length-a.length);
const clean=value=>privateValues.reduce((s,v)=>s.split(v).join('[operator-endpoint]'),JSON.stringify(value));
const reference=JSON.parse(fs.readFileSync(path.join(dir,'public-reference.json'))),items=reference.publication?.body?.data?.transactions?.edges?.map(e=>e.node)||[];
const peers=profile.arweavePeers.map(s=>{const i=s.lastIndexOf(':');return {host:s.slice(0,i),port:Number(s.slice(i+1))};});
const report={scope:'Raw-node publication comparison using externally supplied diagnostic block heights; not autonomous location discovery',rows:[]};
const signal=AbortSignal.timeout(240000),ids=new Set(items.map(r=>r.id));
const get=async(route,extra={})=>{let error;for(const p of peers){try{return {peer:p,value:await requestJson({...p,path:route,signal,timeout:7000,...extra})};}catch(e){error=e;}}throw error;};
for(const height of [...new Set(items.map(x=>x.block?.height).filter(Number.isSafeInteger))].slice(0,8)){
 const row={height};report.rows.push(row);
 try{
  const {peer,value:block}=await get('/block/height/'+height,{maxBytes:16*1024*1024});
  row.timestamp=block.timestamp;row.weaveSize=block.weave_size;row.blockSize=block.block_size;row.transactions=block.txs.length;row.directMatches=block.txs.filter(id=>ids.has(id));row.bundles=[];
  // These blocks have bounded diagnostic work. Scanning all chain history is
  // deliberately not represented by this comparison.
  for(const txId of block.txs.slice(0,128)){
   signal.throwIfAborted();
   try{
    const {value:tx}=await get('/tx/'+txId),tags=Object.fromEntries((tx.tags||[]).map(t=>[Buffer.from(t.name,'base64url').toString(),Buffer.from(t.value,'base64url').toString()]));
    if(tags['Bundle-Format']!=='binary')continue;
    const inspected=await inspectBundleOnPeer(peer,txId,{signal,peerSeeds:peers});
    const matches=inspected.parsed.entries.filter(e=>ids.has(e.id)).map(e=>({dataId:e.id,weaveOffset:inspected.meta.start-1+e.relativeOffset,itemSize:e.size}));
    row.bundles.push({txId,count:inspected.parsed.count,bytes:inspected.meta.size,matches});
   }catch(e){(row.errors??=[]).push(String(e.message).slice(0,160));}
  }
 }catch(e){row.error=e.message;}
 fs.writeFileSync(path.join(dir,'raw-publication.json'),clean(report));console.log(clean(row));
}
