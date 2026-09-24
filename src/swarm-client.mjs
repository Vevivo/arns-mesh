import fs from 'node:fs';
import Hyperswarm from 'hyperswarm';
import DHT from 'hyperdht';
import { verifyRecord, peerIdFromPublicKey } from './common.mjs';
import { swarmTopic, contentTopic, locationIndexTopic } from './swarm-common.mjs';
import {normalizeLocation} from './location-index.mjs';
import { loadHyperBootstrap, learnHyperNodes } from './hyper-bootstrap.mjs';
import {MAX_CONTENT_BYTES,verifyStoredContent} from './content-store.mjs';
import {sha256} from './common.mjs';
import {loadDirectPeers,queryDirectPeer} from './direct-peer.mjs';
import {validateSnapshot} from './name-snapshots.mjs';
import {accountBudgetBytes} from './byte-budget.mjs';

function verifyEnvelope(env){
  if(!env?.ok) throw new Error(env?.error||'peer_query_failed');
  if(peerIdFromPublicKey(env.witnessPublicKeyPem)!==env.witnessPeerId) throw new Error('witness_peer_id_mismatch');
  if(!verifyRecord(env.recordJson,env.signature,env.witnessPublicKeyPem)) throw new Error('witness_signature_invalid');
  return JSON.parse(env.recordJson);
}
function groupResponse(groups,observations,env,noisePublicKey,semanticKey){
  const rec=verifyEnvelope(env);
  const key=semanticKey(rec,env);
  if(!groups.has(key)) groups.set(key,{record:rec,providers:[]});
  const g=groups.get(key);
  if(!g.providers.some(p=>p.witnessPeerId===env.witnessPeerId)){
    g.providers.push({noisePublicKey,witnessPeerId:env.witnessPeerId});
    observations.push({noisePublicKey,witnessPeerId:env.witnessPeerId,ok:true,key});
  }
  return g;
}
async function makeSwarm(bootstrapFile){
  const bootstrap=loadHyperBootstrap({bootstrapFile});
  const dht=new DHT({bootstrap});
  const swarm=new Hyperswarm({dht});
  return {swarm,dht};
}
async function runQuery({mode,topic,topics=[],peerKeys,request,semanticKey,quorum,timeoutMs,bootstrapFile,collect=false,signal,excludeWitnesses=[]}){
  signal?.throwIfAborted();
  const {swarm,dht}=await makeSwarm(bootstrapFile);
  const groups=new Map(),observations=[];
  let settled=false,resolveDone,rejectDone,firstHitTimer;
  const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
  const finish=()=>{if(!settled){settled=true;if(collect&&groups.size)resolveDone([...groups.values()].slice(0,8).map(g=>({...g,transport:'hyperswarm/hyperdht',hintOnly:true})));else{const error=new Error(collect?'mesh_location_not_found':'swarm_quorum_timeout');error.observations=observations.slice(-16);rejectDone(error);}}};
  const timer=setTimeout(finish,timeoutMs);
  const cancel=()=>{if(!settled){settled=true;rejectDone(signal.reason||new Error('query_cancelled'));}};
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
  swarm.on('connection',(socket,info)=>{
    let buf='',handled=false;
    const noisePublicKey=info.publicKey?.toString('hex')||'unknown';
    socket.setEncoding('utf8');
    socket.setTimeout(10000,()=>socket.destroy());
    socket.on('data',chunk=>{
      if(handled||settled)return;
      try{accountBudgetBytes(Buffer.byteLength(chunk));}catch(error){socket.destroy(error);return;}
      buf+=chunk;
      if(buf.length>2*1024*1024){socket.destroy();return;}
      const i=buf.indexOf('\n');
      if(i<0) return;
      handled=true;const line=buf.slice(0,i);
      try{
        const env=JSON.parse(line);if(excludeWitnesses.includes(env.witnessPeerId))throw new Error('excluded_content_peer');
        const g=groupResponse(groups,observations,env,noisePublicKey,semanticKey);
        if(collect&&!firstHitTimer)firstHitTimer=setTimeout(finish,200);
        if(collect&&groups.size>=8){clearTimeout(timer);finish();}
        if(!settled&&!collect&&g.providers.length>=quorum){
          settled=true;clearTimeout(timer);
          resolveDone({...g,quorum,observations,transport:'hyperswarm/hyperdht'});
        }
      }catch(e){observations.push({noisePublicKey,ok:false,error:String(e.message||e)});}
    });
    socket.on('error',e=>observations.push({noisePublicKey,ok:false,error:String(e.message||e)}));
    socket.write(JSON.stringify(request)+'\n');
  });
  const discoveries=[];
  try{
    if(mode==='topic')for(const t of (topics.length?topics:[topic]))discoveries.push(swarm.join(t,{server:false,client:true}));
    for(const hex of (peerKeys||[])) swarm.joinPeer(Buffer.from(hex,'hex'));
    const result=await done;
    if(topic)await learnHyperNodes(dht,topic,{max:4,timeoutMs:500});
    return result;
  } finally {
    signal?.removeEventListener('abort',cancel);
    clearTimeout(timer);
    clearTimeout(firstHitTimer);
    for(const discovery of discoveries){try{await discovery.destroy();}catch{}}
    try{for(const hex of peerKeys||[]) swarm.leavePeer(Buffer.from(hex,'hex'));}catch{}
    try{await swarm.destroy();}catch{}
    try{await dht.destroy();}catch{}
  }
}
async function runIpQuery(options,peers){
 const {request,semanticKey,quorum,collect,signal,excludeWitnesses=[]}=options,groups=new Map(),observations=[];
 return new Promise((resolve,reject)=>{
  let pending=peers.length,done=false,timer;
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);const matches=[...groups.values()];if(collect&&matches.length)resolve(matches.map(g=>({...g,transport:'direct-ip',hintOnly:true})));else{const winner=matches.find(g=>g.providers.length>=quorum);if(winner)resolve({...winner,quorum,transport:'direct-ip'});else{const error=new Error('direct_peer_unavailable');error.observations=observations.slice(-16);reject(error);}}};
  const cancel=()=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(signal.reason||new Error('query_cancelled'));};
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){cancel();return;}
  for(const peer of peers)queryDirectPeer(peer,request,{signal}).then(env=>{if(done)return;if(excludeWitnesses.includes(env.witnessPeerId))throw new Error('excluded_content_peer');const group=groupResponse(groups,observations,env,null,semanticKey);if(!collect&&group.providers.length>=quorum)finish();else if(collect&&!timer)timer=setTimeout(finish,150);}).catch(error=>{observations.push({address:peer.host+':'+peer.port,ok:false,error:String(error.message).slice(0,240)});}).finally(()=>{if(--pending===0)finish();});
 });
}
async function query(options){
 const peers=options.directPeers??loadDirectPeers();
 if(options.dhtEnabled===false){if(!peers.length)throw new Error('no_direct_peers');return runIpQuery(options,peers);}
 if(!peers.length)return runQuery(options);
 const controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
 try{return await Promise.any([runIpQuery({...options,signal},peers),runQuery({...options,signal})]);}
 finally{controller.abort(new Error('peer_query_finished'));}
}
export function createSwarmMeshClient({
  bootstrapFile=process.env.HYPER_BOOTSTRAP||'hyper-bootstrap.json',
  witnessPeerFile=process.env.HYPER_WITNESS_PEERS||'hyper-witness-peers.json',
  quorum=Number(process.env.MESH_QUORUM||2),
  proofQuorum=Number(process.env.PROOF_TRANSPORT_QUORUM||1),
  timeoutMs=Number(process.env.HYPER_QUERY_TIMEOUT||15000),
  excludeWitnesses=[],directPeers,dhtEnabled=process.env.ARNS_MESH_DIRECT_ONLY!=='1',cacheOnly=false
}={}){
  // Index workers must not count their own signed answer as a replica source.
  // Direct-only operation also supports networks where UDP is unavailable.
  const ask=options=>query({...options,directPeers,dhtEnabled,excludeWitnesses:[...new Set([...excludeWitnesses,...(options.excludeWitnesses||[])])]});
  let knownPeers=[];
  try {
    knownPeers=JSON.parse(fs.readFileSync(witnessPeerFile,'utf8')).map(x=>x.noisePublicKey).filter(Boolean);
  } catch {}
  let lastName=null;
  return {
    setName(name){lastName=String(name).toLowerCase();},
    async resolve(name,{signal}={}){
      const n=String(name).toLowerCase();
      lastName=n;
      const r=await ask({
        mode:'topic',topic:swarmTopic('name',n),peerKeys:knownPeers,request:{op:'resolve',name:n},
        quorum,timeoutMs:Math.min(timeoutMs,4500),bootstrapFile,signal,
        semanticKey:x=>[x.name,x.txId,x.antId].join('|')
      });
      if(r.record.name!==n)throw new Error('peer_name_mismatch');
      knownPeers=[...new Set([...knownPeers,...r.providers.map(x=>x.noisePublicKey).filter(Boolean)])];
      lastName=n;
      return r;
    },
    async snapshot(name,{trustedPeers=[],signal}={}){
      const n=String(name).toLowerCase();
      const candidates=await ask({mode:'topic',topics:[swarmTopic('name',n),locationIndexTopic()],peerKeys:knownPeers,request:{op:'snapshot',name:n},quorum:1,timeoutMs:Math.min(timeoutMs,8000),bootstrapFile,collect:true,signal,
        semanticKey:(record,env)=>{if(!trustedPeers.includes(env.witnessPeerId))throw new Error('untrusted_snapshot_peer');const r=validateSnapshot(record,n);return [r.name,r.txId,r.antId,r.slot].join('|');}});
      candidates.sort((a,b)=>b.record.slot-a.record.slot);
      const winner=candidates[0];if(candidates.some(x=>x.record.slot===winner.record.slot&&(x.record.txId!==winner.record.txId||x.record.antId!==winner.record.antId)))throw new Error('snapshot_conflict');
      knownPeers=[...new Set([...knownPeers,...winner.providers.map(p=>p.noisePublicKey).filter(Boolean)])];return winner;
    },
    async locateCandidates(dataId,{signal}={}){
      return ask({
        mode:'topic',topics:[locationIndexTopic(),contentTopic(dataId),...(lastName?[swarmTopic('name',lastName)]:[])],peerKeys:knownPeers,request:{op:'location',dataId,waitMs:8000,...(cacheOnly?{cacheOnly:true}:{})},
        quorum:1,timeoutMs:Math.min(timeoutMs,12000),bootstrapFile,collect:true,signal,
        semanticKey:r=>{if(r.dataId!==dataId)throw new Error('location_id_mismatch');return JSON.stringify(normalizeLocation(dataId,r));}
      });
    },
    async locate(dataId){return (await this.locateCandidates(dataId))[0];},
    async content(dataId,{onProgress=()=>{},signal}={}){
      const excluded=[];let failure;
      for(let attempt=0;attempt<4;attempt++){
      const providers=new Set();
      try{
      const parts=[];let offset=0,total=null,hash=null;
      do{
        signal?.throwIfAborted();
        const r=await ask({mode:'topic',topics:[contentTopic(dataId),...(lastName?[swarmTopic('name',lastName)]:[])],peerKeys:knownPeers,request:{op:'content',dataId,offset,...(cacheOnly?{cacheOnly:true}:{})},quorum:1,timeoutMs:5000,bootstrapFile,signal,excludeWitnesses:excluded,semanticKey:x=>[x.dataId,x.offset,x.total,x.sha256].join('|')});
        for(const p of r.providers)providers.add(p.witnessPeerId);
        knownPeers=[...new Set([...knownPeers,...r.providers.map(p=>p.noisePublicKey).filter(Boolean)])];
        const c=r.record;
        if(c.dataId!==dataId||c.offset!==offset||!Number.isSafeInteger(c.total)||c.total<1||c.total>MAX_CONTENT_BYTES)throw new Error('invalid_content_chunk');
        if(total!==null&&(total!==c.total||hash!==c.sha256))throw new Error('content_chunk_conflict');
        total=c.total;hash=c.sha256;const bytes=Buffer.from(c.data||'','base64');
        if(bytes.length!==Math.min(524288,total-offset))throw new Error('content_chunk_size');
        parts.push(bytes);offset+=bytes.length;onProgress({stage:'download',status:offset===total?'done':'active',received:offset,total,source:'Mesh peer'});
      }while(offset<total);
      const raw=Buffer.concat(parts,total);if(sha256(raw)!==hash)throw new Error('content_transfer_hash');
      onProgress({stage:'verify',status:'active',dataId});const verified=await verifyStoredContent(raw,dataId);onProgress({stage:'verify',status:'done',dataId});
      return {...verified,peer:{host:'mesh-peer',port:0},rootTxId:verified.rootTxId||null,transport:'p2p-content'};
      }catch(error){failure=error;signal?.throwIfAborted();if(!providers.size)throw error;excluded.push(...providers);}
      }
      throw failure;
    },
    async antProof(name){
      const n=String(name||lastName||'').toLowerCase();
      if(!n) throw new Error('no_resolved_name_context');
      return ask({
        mode:'topic',topic:swarmTopic('name',n),peerKeys:knownPeers,request:{op:'ant-proof',name:n},
        quorum:proofQuorum,timeoutMs:Math.min(timeoutMs,3500),bootstrapFile,
        semanticKey:r=>[r.kind,r.name,r.bundle?.proof?.signature,r.bundle?.proof?.target].join('|')
      });
    },
    async chainProof(name){
      const n=String(name||lastName||'').toLowerCase();
      if(!n) throw new Error('no_resolved_name_context');
      return ask({
        mode:'topic',topic:swarmTopic('name',n),peerKeys:knownPeers,request:{op:'chain-proof',name:n},
        quorum:proofQuorum,timeoutMs:Math.min(timeoutMs,3500),bootstrapFile,
        semanticKey:r=>[r.kind,r.name,r.checkpoint?.proofHash].join('|')
      });
    },
    async proofBundles(name){
      const n=String(name||lastName||'').toLowerCase();
      if(!n) throw new Error('no_resolved_name_context');
      const r=await ask({
        mode:'topic',topic:swarmTopic('name',n),peerKeys:knownPeers,request:{op:'proof',name:n},
        quorum:proofQuorum,timeoutMs:Math.min(timeoutMs,3500),bootstrapFile,
        semanticKey:x=>[x.kind,x.name,x.chainProof?.proofHash,x.antUpdateProof?.proof?.signature,x.transitionJournal?.entries?.at(-1)?.entryHash].join('|')
      });
      return [{
        p2pPeerId:r.providers[0]?.noisePublicKey??null,
        noisePublicKey:r.providers[0]?.noisePublicKey??null,
        witnessPeerId:r.providers[0]?.witnessPeerId??null,
        chainProof:r.record.chainProof,
        antUpdateProof:r.record.antUpdateProof??null,
        transitionJournal:r.record.transitionJournal??null
      }];
    },
    async stop(){}
  };
}
