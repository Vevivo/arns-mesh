import '../../src/network-lockdown.mjs';
import os from 'node:os';
import {startOnlinePreparation} from '../../src/preparation-process.mjs';
import {SearchPublisher,SearchCatalog,TopicSearchPublisher} from '../../src/search-catalog.mjs';
import {readProfile} from '../helper/network-profile.mjs';
import {SearchMetadataWorker} from '../../src/search-metadata.mjs';
import {CatalogWorker} from '../../src/catalog-worker.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MeshPeer} from '../peer/embedded-peer.mjs';
import {configureRuntime} from '../helper/runtime.mjs';
import {resolveArUrl,coreRoot} from '../helper/core-adapter.mjs';
import {startDirectPeerServer,parsePeerAddresses,loadConfiguredPeers,loadDirectPeers} from '../../src/direct-peer.mjs';
import {PeerDiscovery} from '../../src/peer-discovery.mjs';
import {SnapshotRelay,snapshotPage} from '../../src/snapshot-relay.mjs';
import {SupporterReplication} from '../../src/supporter-replication.mjs';
import {supporterReadiness} from '../../src/supporter-readiness.mjs';
import {peerAddress} from '../../src/peer-directory.mjs';
import {SitePinner} from '../../src/site-pinner.mjs';
import {writeOperatorStatus,startOperatorDashboard} from '../../src/operator-status.mjs';
import {locationCacheStatus} from '../../src/discovery-store.mjs';
import {transferBudgetStatus} from '../../src/resource-budget.mjs';
import {validArName} from '../../src/swarm-common.mjs';
import {NetworkConnection} from '../helper/network-connection.mjs';
import {readNetworkPublication,readNetworkRecovery,renewNetworkPublication,mirrorAcceptedMembership,peerNetworkScope} from '../helper/network-publication.mjs';
process.chdir(coreRoot);
const dataDir=path.resolve(process.env.ARNS_MESH_DATA||path.join(os.homedir(),'.local/share/arns-mesh-peer'));
const runtime=configureRuntime(coreRoot,dataDir,{applyDefaultPeers:false,role:'index'});
const renewNetwork=()=>{try{const result=renewNetworkPublication(dataDir);if(result)console.log(JSON.stringify({event:'network-list-renewed',revision:result.revision,expiresAt:result.expiresAt}));}catch(error){console.error(JSON.stringify({event:'network-renewal-error',error:error.message}));}};
renewNetwork();
const network=new NetworkConnection({dataDir});
if(network.status().joined)await network.refresh().catch(error=>console.error(JSON.stringify({event:'network-update-unavailable',error:error.message})));
if(process.env.ARNS_UPSTREAM_FETCH!=='0'&&process.env.ARNS_CATALOG_ENABLED==='1'&&!JSON.parse(fs.readFileSync(runtime.rpcFile)).length)throw new Error('Connection setup needed. Apply a numeric-IP network profile before starting the catalog.');
const mibSetting=(key,fallback,max=131072)=>{const n=Number(process.env[key]??fallback);if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error('invalid_'+key);return n*1024*1024;};
const upstream=process.env.ARNS_UPSTREAM_FETCH!=='0';
const onlinePreparation=startOnlinePreparation({dataDir,enabled:upstream&&process.env.ARNS_ONLINE_PREPARATION==='1'});
const peer=new MeshPeer({dataDir:path.join(dataDir,'peer'),bootstrapFile:process.env.HYPER_BOOTSTRAP,snapshotStore:runtime.snapshots,allowRemoteFetch:upstream,storageLimits:{maxBytes:mibSetting('ARNS_CACHE_MIB',256),maxPinnedBytes:mibSetting('ARNS_SAVED_MIB',512)}});
const pinner=new SitePinner({file:path.join(dataDir,'saved-sites.json'),snapshots:runtime.snapshots,contentStore:peer.contentStore,maxFiles:Number(process.env.ARNS_PREPARE_MAX_FILES||1024)});
peer.pinner=pinner;
const replicationPinner=new SitePinner({file:path.join(dataDir,'replicated-sites.json'),snapshots:runtime.snapshots,contentStore:peer.contentStore,maxFiles:Number(process.env.ARNS_PREPARE_MAX_FILES||8192),pinNamespace:'replica'});
const pinsFile=path.join(dataDir,'peer-pins.json');
const configuredPins=fs.existsSync(pinsFile)?JSON.parse(fs.readFileSync(pinsFile)):[];
if(!Array.isArray(configuredPins)||configuredPins.length>16||configuredPins.some(name=>typeof name!=='string'||!validArName(name)))throw new Error('Invalid peer-pins.json; expected up to 16 ArNS names.');
const pinned=[...new Set([...configuredPins,...process.argv.flatMap((arg,i)=>arg==='--pin'?[String(process.argv[i+1]||'').toLowerCase()]:[])])];
const names=[...new Set([...pinned,...process.argv.flatMap((arg,i)=>arg==='--name'?[String(process.argv[i+1]||'').toLowerCase()]:[])])];
const accessPolicy=process.argv.includes('--saved')?'saved':'live';
const trustedPeers=String(process.env.ARNS_TRUSTED_PEERS||'').split(',').filter(Boolean);
// A managed network's current signed trust list overrides historical env pins.
const acceptedPublishers=()=>[...new Set([...(network.state?[]:trustedPeers),...(readProfile(dataDir).trustedPeers||[])])];
if(names.some(name=>!validArName(name)))throw new Error('Invalid --name argument');
let refreshing=false,stopping=false;
async function refresh(){if(refreshing||stopping)return;refreshing=true;try{for(const name of names){try{const r=await resolveArUrl('ar://'+name,{contentStore:peer.contentStore,snapshotStore:runtime.snapshots,accessPolicy,trustedPeers:acceptedPublishers()});if(r.peerPayload)await peer.ingest(r.peerPayload);
if(pinned.includes(name)){const old=pinner.rows[name],snapshot=runtime.snapshots.get(name);if(!old||old.rootDataId!==snapshot.txId||!pinner.isReady(old))void pinner.start(name,{signal:AbortSignal.timeout(120000)}).catch(e=>console.error(JSON.stringify({event:'pin-failed',name,error:String(e.message)})));}console.log(JSON.stringify({event:'name-refreshed',name,dataId:r.meta.dataId,contentSignatureVerified:r.meta.contentSignatureVerified,accountInclusionProof:false}));}catch(e){console.error(JSON.stringify({event:'refresh-failed',name,error:String(e.message||e)}));}}}finally{refreshing=false;}}
try{await peer.start();}catch(e){console.error(JSON.stringify({event:'dht-unavailable',error:String(e.message)}));}
const listenArg=process.argv.indexOf('--listen'),listen=listenArg>=0?parsePeerAddresses(process.argv[listenArg+1])[0]:{host:'0.0.0.0',port:49740};
let catalog=null,retainedSearchTargets=null;
const targetFile=path.join(dataDir,'target-catalog.json');
try{if(fs.statSync(targetFile).size<=16*1024*1024)retainedSearchTargets=JSON.parse(fs.readFileSync(targetFile)).targets||null;}catch{}
const searchTargets=()=>catalog?.catalog.state.targets||retainedSearchTargets||{};
const searchMetadata=new SearchMetadataWorker({file:path.join(dataDir,'search-metadata.json'),endpoint:()=>catalog?.catalog.endpoint,targets:searchTargets});
const search=new SearchPublisher({file:path.join(dataDir,'search-published.json'),snapshots:runtime.snapshots,contentStore:peer.contentStore,pinner,sign:record=>peer._envelope(record)});
const topicSearch=new TopicSearchPublisher({file:path.join(dataDir,'search-topics-published.json'),snapshots:runtime.snapshots,documents:search,metadata:searchMetadata,current:(name,snapshot)=>!catalog&&!retainedSearchTargets||searchTargets()[name]?.dataId===snapshot.txId&&searchTargets()[name]?.mint===snapshot.antId,sign:record=>peer._envelope(record)});
const legacySearchMirrors=new SearchCatalog(path.join(dataDir,'search-legacy-cache.json'));
const searchMirrors=new SearchCatalog(path.join(dataDir,'search-cache.json'));
const searchTrust=()=>acceptedPublishers().filter(id=>id!==peer.witnessPeerId);
peer.searchReply=req=>{
 if(req.witnessPeerId&&req.witnessPeerId!==peer.witnessPeerId)return (req.version===2?searchMirrors:legacySearchMirrors).mirror(searchTrust(),req.witnessPeerId,req.version===2?2:1)||{ok:false,error:'search_catalog_unavailable'};
 return req.version===2?topicSearch.reply():search.reply();
};
const searchPass=()=>search.pass().then(()=>topicSearch.pass()).catch(error=>{search.lastError=String(error.message).slice(0,160);});
void searchPass();const searchTimer=setInterval(()=>void searchPass(),60000);
const mirrorSearch=()=>Promise.allSettled([searchMirrors.sync({peers:loadDirectPeers(),trustedPeers:searchTrust(),signal:AbortSignal.timeout(45000)}),legacySearchMirrors.sync({peers:loadDirectPeers(),trustedPeers:searchTrust(),signal:AbortSignal.timeout(45000),version:1})]);
if(upstream)void mirrorSearch();const searchMirrorTimer=setInterval(()=>{if(upstream)void mirrorSearch();},15*60000);
const peerDiscovery=new PeerDiscovery({dataDir,scope:()=>peerNetworkScope(dataDir,network),peers:()=>loadConfiguredPeers(),identity:peer,listenPort:listen.port,advertise:process.env.MESH_ADVERTISE||'auto'});
const snapshotRelay=new SnapshotRelay({file:path.join(dataDir,'snapshot-relay.json'),trusted:searchTrust,scope:()=>peerNetworkScope(dataDir,network),maxRecords:Number(process.env.ARNS_RELAY_MAX_RECORDS||40000),maxBytes:mibSetting('ARNS_RELAY_MIB',64,256)});peer.snapshotRelay=snapshotRelay;
peer.snapshotPageReply=req=>snapshotPage({request:req,relay:snapshotRelay,snapshotStore:runtime.snapshots,pinner,witnessPeerId:peer.witnessPeerId,sign:row=>peer._envelope(row)});
const replication=new SupporterReplication({file:path.join(dataDir,'supporter-replication.json'),relay:snapshotRelay,pinner:replicationPinner,enabled:process.env.ARNS_REPLICATION_ENABLED!=='0',maxSites:Number(process.env.ARNS_REPLICATION_MAX_SITES||process.env.ARNS_PREPARE_MAX_SITES||20000),dailyBytes:mibSetting('ARNS_REPLICATION_DAILY_MIB',8192,65536),maxPassBytes:mibSetting('ARNS_REPLICATION_PASS_MIB',32,128),contentSources:()=>upstream?'all':'mesh-only'});
replication.start();
const direct=await startDirectPeerServer(peer,{...listen,networkAnnouncement:()=>readNetworkPublication(dataDir),networkRecovery:()=>readNetworkRecovery(dataDir),discovery:peerDiscovery});
peerDiscovery.listenPort=direct.address.port;
// A new member mirrors the exact authority-signed list, never its signing key.
mirrorAcceptedMembership(dataDir,network);
peerDiscovery.start();
let relayRunning=false;const relayController=new AbortController();
const mirrorSnapshots=async()=>{if(relayRunning)return;relayRunning=true;try{await snapshotRelay.sync({names:[...new Set([...pinned,...runtime.snapshots.names()])],peers:loadDirectPeers().filter(p=>peerAddress(p)!==peerDiscovery.selfAddress()),signal:AbortSignal.any([relayController.signal,AbortSignal.timeout(15000)])});}catch(error){snapshotRelay.lastError=String(error.message).slice(0,160);}finally{relayRunning=false;}};
void mirrorSnapshots();const relayTimer=setInterval(()=>void mirrorSnapshots(),60000);
const makeCatalog=endpoint=>new CatalogWorker({dataDir,peer,endpoint,snapshotStore:runtime.snapshots,pinner:process.env.ARNS_PREPARE_ENABLED==='1'?pinner:null,maxPreparedSites:Number(process.env.ARNS_PREPARE_MAX_SITES||32),independentNames:true,intervalMs:Number(process.env.ARNS_CATALOG_INTERVAL_MS||5000),maxPassBytes:mibSetting('ARNS_CATALOG_PASS_MIB',32,128),registryIntervalMs:Number(process.env.ARNS_REGISTRY_INTERVAL_MS||60000),bulkScan:process.env.ARNS_CATALOG_BULK_SCAN==='1',bulkIntervalMs:Number(process.env.ARNS_TARGET_SCAN_INTERVAL_MS||300000),jobsPerPass:8,mintsPerPass:Number(process.env.ARNS_CATALOG_MINTS_PER_PASS||8)});
if(upstream&&process.env.ARNS_CATALOG_ENABLED==='1'){const seed=JSON.parse(fs.readFileSync(process.env.SOLANA_RPC_SEEDS))[0];catalog=makeCatalog('http://'+(seed.host.includes(':')?'['+seed.host+']':seed.host)+':'+seed.port);retainedSearchTargets=null;catalog.start();searchMetadata.start();}
peer.onContentDemand=id=>catalog?.enqueueDemand(id);
// A background update changes the live profile. Recreate the catalog after its
// current pass stops if its RPC endpoint changed; keep persisted queues.
let catalogEndpoint=catalog?.catalog.endpoint;
network.onChange=()=>{void (async()=>{
 const published=readNetworkPublication(dataDir);
 if(network.state&&(!published||published.key===network.state.invitation.key))mirrorAcceptedMembership(dataDir,network);
 const seed=JSON.parse(fs.readFileSync(process.env.SOLANA_RPC_SEEDS))[0];
 const endpoint=seed?'http://'+(seed.host.includes(':')?'['+seed.host+']':seed.host)+':'+seed.port:null;
 if(catalog&&endpoint&&endpoint!==catalogEndpoint){catalog.stop();await Promise.allSettled([catalog.running,catalog.namesRunning]);catalogEndpoint=endpoint;catalog=makeCatalog(endpoint);if(!stopping)catalog.start();}
 })().catch(error=>console.error(JSON.stringify({event:'network-catalog-error',error:error.message})));};
network.onChange(); // Publish an accepted startup refresh on existing mirrors too.
network.start();
const networkRenewalTimer=setInterval(renewNetwork,6*3600000);networkRenewalTimer.unref?.();
if(upstream)runtime.discovery.start();
if(upstream)void refresh();const timer=setInterval(()=>{if(upstream)void refresh();},60000);
const version=JSON.parse(fs.readFileSync(path.join(coreRoot,'package.json'))).version;
const publishStatus=()=>{
 const peerStatus=peer.status(),discoveryStatus=peerDiscovery.status(),savedStatus=pinner.status(),replicatedStatus=replicationPinner.status();
 const replicationStatus=replication.status({completeSites:replicatedStatus.ready});
 // Keep the dashboard's site summaries, not every nested binding and failed
 // file detail. Those remain in the private persistent preparation records.
 const summarizeSites=status=>{
  const summarize=row=>({name:row.name,rootDataId:row.rootDataId,observedAt:row.observedAt,updatedAt:row.updatedAt,scope:row.scope,status:row.status,total:row.total,saved:row.saved,failed:row.failed,
   ...(row.errors?.length?{errorCount:row.errors.length,errors:row.errors.slice(0,1)}:{}),
   ...(row.update?{update:{status:row.update.status,rootDataId:row.update.rootDataId,saved:row.update.saved,total:row.update.total,failed:row.update.failed,updatedAt:row.update.updatedAt}}:{})});
  const {groups,...storage}=status.storage;
  return {...status,sites:status.sites.map(summarize),storage:{...storage,groupsCount:groups.length}};
 };
 const readiness=supporterReadiness({snapshots:runtime.snapshots,relay:snapshotRelay,pinners:[pinner,replicationPinner],contentStore:peer.contentStore,trustedPeerIds:acceptedPublishers(),ownPeerId:peer.witnessPeerId,index:peerStatus.sharedIndex,discovery:discoveryStatus,replication:replicationStatus});
 const value={version,...peerStatus,onlinePreparation:onlinePreparation.status(),operatorRole:'service-provider',memory:process.memoryUsage(),transferBudget:transferBudgetStatus(),locationCache:locationCacheStatus(),retainedNames:runtime.snapshots.names().length,discovery:runtime.discovery.status(),peerDiscovery:discoveryStatus,snapshotRelay:snapshotRelay.status(),catalog:catalog?.status()||null,search:{...topicSearch.status(),documents:search.status(),metadata:searchMetadata.status()},network:network.status(),savedSites:summarizeSites(savedStatus),replicatedSites:summarizeSites(replicatedStatus),replication:replicationStatus,readiness};
 writeOperatorStatus(dataDir,value);
 console.log(JSON.stringify({event:'peer-status',version,online:value.online,memory:value.memory,retainedNames:value.retainedNames,savedReady:savedStatus.ready,replicatedReady:replicatedStatus.ready,replication:replicationStatus,readiness:{locallyPrepared:readiness.locallyPrepared,names:readiness.names,files:readiness.files},snapshotRelay:value.snapshotRelay}));
};
publishStatus();const statusTimer=setInterval(publishStatus,60000);
const dashboard=process.env.ARNS_OPERATOR_PORT?await startOperatorDashboard({dataDir,port:Number(process.env.ARNS_OPERATOR_PORT)}):null;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(searchTimer);clearInterval(searchMirrorTimer);clearInterval(statusTimer);clearInterval(networkRenewalTimer);clearInterval(relayTimer);relayController.abort();replication.stop();await peerDiscovery.close();network.stop();runtime.discovery.stop();catalog?.stop();searchMetadata.stop();onlinePreparation.stop();await direct.close();await dashboard?.close();await peer.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log(JSON.stringify({event:'peer-started',...peer.status()}));
