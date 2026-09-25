// Separate diagnostic process outside the outage experiment. These responses
// are never imported into browser storage, routing hints or the outage result.
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const directory=process.env.QA_OUTPUT,probe=JSON.parse(fs.readFileSync(path.join(directory,'asset-discovery.json')));
 const urls=[...new Set(probe.rows.flatMap(r=>r.urls||[]))].filter(u=>/^https:\/\/arweave\.net\/raw\/[A-Za-z0-9_-]{43}$/.test(u)).slice(0,16);
 const report={scope:'Public gateway comparison outside the outage; not a Mesh result or routing input',at:new Date().toISOString(),resources:[]};
 for(const url of urls){try{
  const r=await fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(30000)});
  report.resources.push({url,status:r.status,contentType:r.headers.get('content-type'),contentLength:r.headers.get('content-length'),redirect:r.headers.get('location'),routingHeaders:Object.fromEntries([...r.headers].filter(([k])=>/offset|bundle|height|data-root|data-size/.test(k)))});
 }catch(e){report.resources.push({url,error:e.message});}}
 // Publication metadata is a diagnostic comparison only. In particular,
 // a public cache hit does not establish inclusion in the raw Arweave weave.
 try{
  const ids=urls.map(u=>u.split('/').at(-1));
  const r=await fetch('https://arweave.net/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'query($ids:[ID!]) { transactions(ids:$ids) { edges { node { id data { size type } bundledIn { id } block { height timestamp } } } } }',variables:{ids}}),signal:AbortSignal.timeout(30000)});
  report.publication={status:r.status,body:await r.json()};
 }catch(e){report.publication={error:e.message};}
 fs.writeFileSync(path.join(directory,'public-reference.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
