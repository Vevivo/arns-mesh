import '../../src/network-lockdown.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {applyProfile,validateProfile} from '../../apps/helper/network-profile.mjs';
import {configureRuntime} from '../../apps/helper/runtime.mjs';
import {resolveArUrl,coreRoot} from '../../apps/helper/core-adapter.mjs';
import {createSwarmMeshClient} from '../../src/swarm-client.mjs';
import {VerifiedContentStore} from '../../src/content-store.mjs';
import {parseArweaveResourceUrl} from '../../src/arweave-resource-url.mjs';
import {fetchMeshContent} from '../../src/content-fetcher.mjs';
import {networkAuditSnapshot} from '../../src/network-audit.mjs';
import {probeAnchor} from './bundle-anchor-probe.mjs';
import {probeNeighbors} from './neighbor-bundle-probe.mjs';
const dir=path.resolve(process.env.QA_OUTPUT),name=process.argv[2];fs.mkdirSync(dir,{recursive:true});
const profile=validateProfile(JSON.parse(process.env.MESH_QA_PROFILE));delete process.env.MESH_QA_PROFILE;
const privateValues=[...profile.directPeers,...profile.rpcSources,...profile.arweavePeers].flatMap(x=>[x,x.slice(0,x.lastIndexOf(':'))]).sort((a,b)=>b.length-a.length);
const clean=value=>privateValues.reduce((s,v)=>s.split(v).join('[operator-endpoint]'),JSON.stringify(value));
const data=path.join(dir,'private-data');applyProfile(data,profile);process.env.ARNS_MESH_DIRECT_ONLY='1';process.env.ARNS_MESH_HEAD_START_MS='2500';
const runtime=configureRuntime(coreRoot,data,{role:'client'}),store=new VerifiedContentStore(path.join(data,'content'));
const client=createSwarmMeshClient({dhtEnabled:false,cacheOnly:true});
const report={name,fixture:false,scope:'Fresh Linux diagnostic; literal-IP runtime policy, not a Windows OS firewall result',at:new Date().toISOString(),rows:[]};
const save=()=>fs.writeFileSync(path.join(dir,'asset-discovery.json'),clean(report));
try{
 const page=await resolveArUrl('ar://'+name,{contentStore:store,snapshotStore:runtime.snapshots,signal:AbortSignal.timeout(60000)});
 report.page={...page.meta};
 const urls=[...new Set(page.body.toString('utf8').match(/https:\/\/arweave\.net\/[^\s"'<>`\\)]+/g)||[])].filter(parseArweaveResourceUrl).slice(0,16);
 const roots=[page.meta.nameTargetId,page.meta.dataId];
 for(const dataId of [...new Set([...roots,...urls.map(u=>parseArweaveResourceUrl(u).dataId)])].filter(Boolean)){
  const row={dataId,root:roots.includes(dataId),urls:urls.filter(u=>parseArweaveResourceUrl(u).dataId===dataId)};report.rows.push(row);
  try{row.locations=(await client.locateCandidates(dataId,{signal:AbortSignal.timeout(6000)})).map(r=>r.record);}catch(e){row.locationError=e.message;}
  if(!row.root&&!process.env.QA_ANCHOR_ONLY){try{const result=await fetchMeshContent(dataId,{client,contentStore:store,signal:AbortSignal.timeout(30000)});row.content={verified:true,bytes:result.direct.payload.length,tags:result.direct.tags,location:result.loc};}catch(e){row.contentError=e.message;row.diagnostics=e.diagnostics;}}
  save();console.log(clean(row));
 }
 const anchor=report.rows.find(r=>r.dataId===page.meta.dataId)?.locations?.find(r=>Number.isSafeInteger(r.weaveOffset));
 if(anchor){let source;try{report.anchor=await probeAnchor(anchor,urls.map(u=>parseArweaveResourceUrl(u).dataId),{signal:AbortSignal.timeout(180000),onSource:s=>{source=s;}});}catch(e){report.anchorError=e.message;}save();console.log(clean({anchor:report.anchor,anchorError:report.anchorError}));
  if(source&&report.anchor){try{report.neighbors=await probeNeighbors(report.anchor,urls.map(u=>parseArweaveResourceUrl(u).dataId),{...source,signal:AbortSignal.timeout(180000),onStep:result=>{report.neighbors=result;save();}});}catch(e){report.neighborError=e.message;}save();console.log(clean({neighbors:report.neighbors,neighborError:report.neighborError}));}
 }
}catch(e){report.error=e.message;process.exitCode=1;}
finally{report.network=networkAuditSnapshot();save();await client.stop();}
