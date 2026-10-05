// Application observations, never a global Mesh census or packet capture.
const kinds={'mesh-peer':'mesh','solana-rpc':'rpc','raw-arweave':'arweave'};
const names={'Mesh peer':'mesh','Solana RPC':'rpc','Raw Arweave':'arweave'};
const key=(kind,address)=>kind+'|'+address;
const ipAddress=e=>(e.host.includes(':')?'['+e.host+']':e.host)+':'+e.port;
const cancelled=e=>/abort|cancel|app_stopped|query_superseded/i.test(e.error||'');
export class ConnectionMonitor {
 constructor(){this.rows=new Map();this.active=new Map();this.events=[];this.bytes=0;this.requests=0;this.failures=0;this.profileKey='';this.checking=false;}
 configure(profile){
  const entries=[['mesh',profile.directPeers||[]],['rpc',profile.rpcSources||[]],['arweave',profile.arweavePeers||[]]];
  const fingerprint=JSON.stringify(entries);if(fingerprint===this.profileKey)return;
  this.profileKey=fingerprint;this.rows.clear();
  for(const [kind,addresses] of entries)for(const address of addresses)this.rows.set(key(kind,address),{kind,address,configured:true});
 }
 check(result){const kind=names[result.kind],row=this.rows.get(key(kind,result.address));if(!row)return;
  row.check={status:result.status,at:Date.parse(result.checkedAt),elapsedMs:result.elapsedMs};
 }
 observe(e){
  const kind=kinds[e.purpose];if(!kind||!e.host||e.scope==='connection-check')return;
  const address=ipAddress(e),id=key(kind,address);let row=this.rows.get(id);
  if(!row){if(this.rows.size>=128){const oldest=[...this.rows].find(([,r])=>!r.configured);if(oldest)this.rows.delete(oldest[0]);else return;}row={kind,address,configured:false};this.rows.set(id,row);}
  const at=Date.parse(e.at);if(!Number.isFinite(at))return;
  if(e.type==='request'){this.requests++;this.active.set(e.id,{kind,at});if(this.active.size>128)this.active.delete(this.active.keys().next().value);return;}
  if(!['response','request-error'].includes(e.type))return;
  this.active.delete(e.requestId);this.bytes+=Math.max(0,e.bytes||0);
  const stopped=cancelled(e);if(stopped)return;
  row.last={status:e.type==='response'?'reply':'failed',at,bytes:e.bytes||0};
  if(e.type==='request-error')this.failures++;
  this.events.push({kind,status:row.last.status,at,bytes:e.bytes||0});if(this.events.length>12)this.events.shift();
 }
 snapshot({now=Date.now(),saved=false}={}){
  // Defensive expiry only; normal completion/cancellation removes requests.
  for(const [id,row] of this.active)if(now-row.at>360000)this.active.delete(id);
  const groups={};
  for(const kind of ['mesh','rpc','arweave']){
   const rows=[...this.rows.values()].filter(r=>r.kind===kind);
   let replied=0,failed=0,stale=0,lastAt=null;const entries=[];
   for(const r of rows){
    const check=r.check,last=r.last;
    const latest=check&&(!last||check.at>=last.at)?{...check,status:check.status==='responded'?'checked':'failed'}:last;
    let status=latest?.status||'unknown';
    if(latest){lastAt=Math.max(lastAt||0,latest.at);if(now-latest.at>90000){status='stale';stale++;}else if(status==='checked'||status==='reply')replied++;else failed++;}
    entries.push({address:r.address,configured:r.configured,status,at:latest?.at||null,elapsedMs:status==='checked'?check.elapsedMs:null});
   }
   const active=[...this.active.values()].filter(r=>r.kind===kind).length;
   const status=saved&&kind==='rpc'?'paused':active?'requesting':replied?'responding':failed?'unavailable':stale?'stale':rows.length?'unknown':'unconfigured';
   groups[kind]={status,replied,failed,total:rows.length,configured:rows.filter(r=>r.configured).length,active,lastAt,entries};
  }
  return {groups,checking:this.checking,requests:this.requests,bytes:this.bytes,failures:this.failures,active:this.active.size,events:this.events.slice().reverse(),saved};
 }
}
