import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Hyperswarm from 'hyperswarm';
import DHT from 'hyperdht';
import { signRecord, peerIdFromPublicKey } from '../../src/common.mjs';
import { swarmTopic, validArName, validDataId, contentTopic, locationIndexTopic } from '../../src/swarm-common.mjs';
import {LocationIndex} from '../../src/location-index.mjs';
import { verifyPortableChainProof } from '../../src/portable-proof.mjs';
import { verifySavedAntUpdateProof } from '../../src/ant-update-proof.mjs';
import { verifyJournal } from '../../src/transition-journal.mjs';
import { loadHyperBootstrap } from '../../src/hyper-bootstrap.mjs';
import {VerifiedContentStore} from '../../src/content-store.mjs';
import {getHistoricalIndex} from '../../src/cdb64-index.mjs';
import {fetchMeshContent} from '../../src/content-fetcher.mjs';
import {createSwarmMeshClient} from '../../src/swarm-client.mjs';
import {loadDirectPeers} from '../../src/direct-peer.mjs';

function ensureDir(dir){fs.mkdirSync(dir,{recursive:true});}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function atomicJson(file,value,mode=0o600){
  const tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode});
  fs.renameSync(tmp,file);
}
function createIdentity(file){
  if(fs.existsSync(file)) return readJson(file,null);
  const pair=crypto.generateKeyPairSync('ed25519');
  const identity={
    publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}),
    privateKeyPem:pair.privateKey.export({type:'pkcs8',format:'pem'})
  };
  atomicJson(file,identity,0o600);
  return identity;
}

export class MeshPeer {
  constructor({dataDir,bootstrapFile,locationsFile=process.env.ARNS_LOCATIONS,snapshotStore=null,allowRemoteFetch=true,maxTopics=Infinity}){
    this.allowRemoteFetch=allowRemoteFetch;this.maxTopics=maxTopics;
    this.dataDir=dataDir;this.snapshotStore=snapshotStore;
    this.bootstrapFile=bootstrapFile;
    this.locationIndex=new LocationIndex(locationsFile);
    this.cacheFile=path.join(dataDir,'verified-peer-cache.json');
    this.identityFile=path.join(dataDir,'identity.json');
    this.seedFile=path.join(dataDir,'swarm-seed.bin');
    this.cache={schema:'arns-mesh-desktop-cache/v1',records:{},locations:{},proofs:{}};
    this.discoveries=new Map();
    this.connections=0;
    this.requestsServed=0;
    this.contentChunksServed=0;
    this.contentBytesServed=0;
    this.lastRequests=[];
    this.startedAt=null;
    this.swarm=null;
    this.dht=null;
    this.identity=null;
    this.witnessPeerId=null;
    this.contentStore=new VerifiedContentStore(path.join(dataDir,'content'),{maxFiles:allowRemoteFetch?Infinity:2048});
    this.contentStore.on('stored',id=>this._announceTopic('content:'+id,contentTopic(id)).catch(()=>{}));
    this.historyLookups=new Map();this.historyStarts=[];
  }
  _warmLocation(dataId){
    if(!this.allowRemoteFetch)return;
    if(!validDataId(dataId)||this.contentStore.has(dataId)||this.historyLookups.has(dataId))return;
    const resolver=getHistoricalIndex();
    const now=Date.now();this.historyStarts=this.historyStarts.filter(t=>now-t<60000);
    if(this.historyStarts.length>=12||this.historyLookups.size>=2)return;
    this.historyStarts.push(now);
    const known=this.locationIndex.get(dataId),directPeers=loadDirectPeers();if(!known&&!resolver&&!directPeers.length)return;
    // One bounded replication hop. A downstream cache-only request cannot
    // start or await another warm lookup, preventing cycles between empty peers.
    const cachedPeers=createSwarmMeshClient({directPeers,dhtEnabled:false,cacheOnly:true,excludeWitnesses:[this.witnessPeerId]});
    const job=fetchMeshContent(dataId,{client:cachedPeers,meshHeadStartMs:2500,contentStore:this.contentStore,locationsFile:this.locationIndex.file,signal:AbortSignal.timeout(45000)}).then(async()=>{
      await this._announceTopic('content:'+dataId,contentTopic(dataId));
    }).catch(()=>null).finally(()=>{this.historyLookups.delete(dataId);});
    this.historyLookups.set(dataId,job);
  }
  _envelope(record){
    const recordJson=JSON.stringify(record);
    return {
      ok:true,
      witnessPeerId:this.witnessPeerId,
      witnessPublicKeyPem:this.identity.publicKeyPem,
      recordJson,
      signature:signRecord(recordJson,this.identity.privateKeyPem)
    };
  }
  _handle(req){
    if(req.op==='hello') return {ok:true,noisePublicKey:this.swarm.keyPair.publicKey.toString('hex'),witnessPeerId:this.witnessPeerId,kind:'mesh-peer'};
    if(req.op==='content'){
      const id=String(req.dataId||'');
      // A valid request for uncached content is a lookup miss, not malformed
      // input. Keep validation errors distinct and never serve unverified bytes.
      try{return this._envelope(this.contentStore.chunk(id,req.offset));}
      catch(error){if(error.message!=='content_not_cached')throw error;}
      if(req.cacheOnly!==true)this._warmLocation(id);
      return {ok:false,error:'content_not_cached'};
    }
    if(req.op==='snapshot'){const name=String(req.name||'').toLowerCase();if(!validArName(name))return {ok:false,error:'invalid_arns_name'};const row=this.snapshotStore?.exportLocal(name);return row?this._envelope(row):{ok:false,error:'snapshot_not_found'};}
    if(req.op==='resolve'){
      const name=String(req.name||'').toLowerCase();
      if(!validArName(name)) return {ok:false,error:'invalid_arns_name'};
      const rec=this.cache.records[name];
      if(rec && Date.parse(rec.expiresAt)>Date.now())return this._envelope(rec);
      return {ok:false,error:rec?'name_observation_expired':'name_not_found'};
    }
    if(req.op==='location'){
      const dataId=String(req.dataId||'');
      if(!validDataId(dataId)) return {ok:false,error:'invalid_data_id'};
      const loc=this.cache.locations[dataId]||this.locationIndex.get(dataId);
      if(!loc&&req.cacheOnly!==true)this._warmLocation(dataId);
      return loc?this._envelope({...loc,dataId}):{ok:false,error:'location_not_found'};
    }
    if(req.op==='ant-proof'||req.op==='chain-proof'||req.op==='proof'){
      const name=String(req.name||'').toLowerCase();
      if(!validArName(name)) return {ok:false,error:'invalid_arns_name'};
      const p=this.cache.proofs[name];
      if(!p) return {ok:false,error:'proof_not_found'};
      if(req.op==='ant-proof') return p.antUpdateProof?this._envelope({kind:'ant-proof',name,bundle:p.antUpdateProof}):{ok:false,error:'ant_proof_not_found'};
      if(req.op==='chain-proof') return p.chainProof?this._envelope({kind:'chain-proof',name,checkpoint:p.chainProof}):{ok:false,error:'chain_proof_not_found'};
      return this._envelope({
        kind:'proof-bundle',
        name,
        chainProof:p.chainProof||null,
        antUpdateProof:p.antUpdateProof||null,
        transitionJournal:p.transitionJournal||null
      });
    }
    return {ok:false,error:'unknown_op'};
  }
  async _handleAsync(req){
    const reply=this._handle(req);
    if(!['location','content'].includes(req.op)||reply.ok||req.cacheOnly===true)return reply;
    const job=this.historyLookups.get(String(req.dataId||''));
    if(!job)return reply;
    // A cold lookup can outlive the first request. Wait for the requested
    // result: a location hint or fully verified content, never one for the other.
    const requested=Number(req.waitMs);
    const waitMs=Number.isFinite(requested)?Math.max(0,Math.min(8000,requested)):3200;
    const until=Date.now()+waitMs;let finished=false;
    job.then(()=>{finished=true;},()=>{finished=true;});
    do{
      if(req.op==='location'){
        const loc=this.cache.locations[req.dataId]||this.locationIndex.get(req.dataId);
        if(loc)return this._envelope({...loc,dataId:req.dataId});
      }else{
        try{return this._envelope(this.contentStore.chunk(req.dataId,req.offset));}
        catch(error){if(error.message!=='content_not_cached')throw error;}
      }
      if(finished||Date.now()>=until)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }while(true);
    return {ok:false,error:finished?(req.op==='location'?'location_not_found':'content_not_cached'):(req.op==='location'?'location_lookup_pending':'content_lookup_pending')};
  }
  async _announce(name){
    return this._announceTopic('name:'+name,swarmTopic('name',name));
  }
  async _announceTopic(key,topic){
    if(this.discoveries.has(key)||!this.swarm)return;
    const d=this.swarm.join(topic,{server:true,client:false});
    this.discoveries.set(key,d);
    while(this.discoveries.size>this.maxTopics){const oldest=this.discoveries.keys().next().value;const old=this.discoveries.get(oldest);this.discoveries.delete(oldest);void old.destroy().catch(()=>{});}
    await d.flushed();
  }
  _trimCache(){
    if(this.allowRemoteFetch)return;
    for(const [key,limit] of [['records',256],['proofs',256],['locations',2048]]){
      const rows=this.cache[key]||{};this.cache[key]=Object.fromEntries(Object.entries(rows).slice(-limit));
    }
    // Proofs can be much larger than name/offset rows. Bound their encoded size.
    const names=Object.keys(this.cache.proofs);while(Buffer.byteLength(JSON.stringify(this.cache))>4*1024*1024&&names.length)delete this.cache.proofs[names.shift()];
  }
  async start(){
    if(this.swarm) return this.status();
    ensureDir(this.dataDir);
    if(this.allowRemoteFetch||!fs.existsSync(this.cacheFile)||fs.statSync(this.cacheFile).size<=4*1024*1024)this.cache=readJson(this.cacheFile,this.cache);
    this._trimCache();
    this.identity=createIdentity(this.identityFile);
    this.witnessPeerId=peerIdFromPublicKey(this.identity.publicKeyPem);
    if(process.env.ARNS_MESH_DIRECT_ONLY==='1'){this.startedAt=new Date().toISOString();return this.status();}
    if(!fs.existsSync(this.seedFile)) fs.writeFileSync(this.seedFile,crypto.randomBytes(32),{mode:0o600});
    const seed=fs.readFileSync(this.seedFile);
    if(seed.length!==32) throw new Error('peer_seed_invalid');
    const bootstrap=loadHyperBootstrap({bootstrapFile:this.bootstrapFile});
    this.dht=new DHT({bootstrap});
    this.swarm=new Hyperswarm({dht:this.dht,seed});
    this.swarm.on('connection',(socket,info)=>{
      this.connections++;
      socket.on('error',()=>{});
      socket.setTimeout(10000,()=>socket.destroy());
      let buf='',handled=false;
      socket.setEncoding('utf8');
      socket.on('data',async chunk=>{
        if(handled)return;
        buf+=chunk;
        if(buf.length>65536){socket.destroy();return;}
        const i=buf.indexOf('\n');
        if(i<0)return;
        handled=true;
        const line=buf.slice(0,i);
        try{
          const req=JSON.parse(line);
          const reply=await this._handleAsync(req);
          this.requestsServed++;
          if(req.op==='content'&&reply.ok){const r=JSON.parse(reply.recordJson);this.contentChunksServed++;this.contentBytesServed+=Buffer.from(r.data,'base64').length;}
          this.lastRequests.push({at:new Date().toISOString(),op:req.op,ok:Boolean(reply.ok),dataId:validDataId(req.dataId)?req.dataId:undefined,error:reply.error,peerKey:info?.publicKey?.toString('hex')||null});
          if(this.lastRequests.length>8)this.lastRequests.shift();
          socket.write(JSON.stringify(reply)+'\n');
        }catch(e){
          socket.write(JSON.stringify({ok:false,error:String(e.message||e)})+'\n');
        }
        socket.end();
      });
    });
    for(const name of [...new Set([...Object.keys(this.cache.records),...(this.snapshotStore?.names()||[])])].slice(-(this.allowRemoteFetch?Infinity:16)))this._announce(name).catch(()=>{});
    if(this.allowRemoteFetch)this._announceTopic('index',locationIndexTopic()).catch(()=>{});
    for(const item of this.contentStore.stats().files.slice(-this.maxTopics)){const id=item.dataId;this._announceTopic('content:'+id,contentTopic(id)).catch(()=>{});}
    this.startedAt=new Date().toISOString();
    return this.status();
  }
  async ingest(bundle){
    if(!bundle||bundle.schema!=='arns-mesh-verified-share/v1') throw new Error('peer_share_schema_invalid');
    const name=String(bundle.name||'').toLowerCase();
    if(!validArName(name)||bundle.record?.name!==name) throw new Error('peer_name_invalid');
    if(bundle.record?.txId!==bundle.content?.rootDataId) throw new Error('peer_record_content_mismatch');
    if(!validDataId(bundle.content?.dataId))throw new Error('peer_invalid_content_id');
    const state=bundle.stateEvidence;
    const good=state?.observations?.filter(x=>x.ok)||[];
    const age=Date.now()-Date.parse(state?.generatedAt);
    if(!Number.isFinite(age)||age< -30000||age>300000||!good.length||state.name!==name||state.txId!==bundle.record.txId||state.antId!==bundle.record.antId)
      throw new Error('peer_requires_recent_state_observation');
    if(!state.checks?.pdaDerivedLocally||!state.checks?.accountOwnersMatchExpectedPrograms||!state.checks?.accountBytesDecodedLocally)
      throw new Error('peer_state_checks_missing');
    if(good.some(x=>x.ant?.txId!==bundle.record.txId||x.arns?.processId!==bundle.record.antId))throw new Error('peer_state_binding_mismatch');
    if(!bundle.content?.signatureVerified)throw new Error('peer_content_signature_missing');
    const undername=name.includes('_')?name.split('_')[0]:'@';
    if(bundle.antUpdateProof)verifySavedAntUpdateProof(bundle.antUpdateProof,{name,undername,antId:bundle.record.antId,expectedTxId:bundle.record.txId});
    if(bundle.chainProof){
      const checked=verifyPortableChainProof(bundle.chainProof,bundle.record);
      if(checked.arnsRawSha256!==good[0].arns.rawSha256||checked.antRawSha256!==good[0].ant.rawSha256)throw new Error('peer_checkpoint_state_mismatch');
    }
    if(bundle.transitionJournal)verifyJournal(bundle.transitionJournal,{expectedName:name,expectedAntId:bundle.record.antId,expectedHeadTarget:bundle.record.txId});
    for(const item of bundle.items||[]){await this.contentStore.put(item.dataId,item.storedBytes||item.rawItem);this._announceTopic('content:'+item.dataId,contentTopic(item.dataId)).catch(()=>{});}
    this.cache.records[name]=bundle.record;
    for(const loc of bundle.locations||[]){if(validDataId(loc.dataId))this.cache.locations[loc.dataId]=loc;}
    if(bundle.location)this.cache.locations[bundle.record.txId]=bundle.location;
    this.cache.proofs[name]={
      verifiedAt:bundle.verifiedAt,
      verification:bundle.verification,
      content:bundle.content,
      antUpdateProof:bundle.antUpdateProof,
      chainProof:bundle.chainProof,
      transitionJournal:bundle.transitionJournal
    };
    this._trimCache();atomicJson(this.cacheFile,this.cache,0o600);
    if(this.swarm)this._announce(name).catch(()=>{});
    return this.status();
  }
  status(){
    return {
      online:Boolean(this.swarm||this.directAddress),
      directAddress:this.directAddress||null,
      reachable:this.requestsServed>0,
      freshNames:Object.values(this.cache.records||{}).filter(r=>Date.parse(r.expiresAt)>Date.now()).length,
      kind:'mesh-peer',
      role:this.allowRemoteFetch?'index':'client',
      remoteFetchEnabled:this.allowRemoteFetch,
      storageLimits:{automaticBytes:this.contentStore.maxBytes,savedBytes:this.contentStore.maxPinnedBytes},
      announcedTopics:this.discoveries.size,
      witnessPeerId:this.witnessPeerId,
      noisePublicKey:this.swarm?.keyPair?.publicKey?.toString('hex')||null,
      sharedNames:Object.keys(this.cache.records||{}),
      cachedLocations:Object.keys(this.cache.locations||{}).length,
      indexLocations:this.locationIndex.size,
      cachedContent:this.contentStore.stats().files.length,
      connections:this.connections,
      requestsServed:this.requestsServed,
      contentChunksServed:this.contentChunksServed,
      contentBytesServed:this.contentBytesServed,
      lastRequests:this.lastRequests,
      startedAt:this.startedAt
    };
  }
  async stop(){
    for(const d of this.discoveries.values()){try{await d.destroy();}catch{}}
    this.discoveries.clear();
    try{await this.swarm?.destroy();}catch{}
    try{await this.dht?.destroy();}catch{}
    this.swarm=null;this.dht=null;
  }
}
