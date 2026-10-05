import '../../src/network-lockdown.mjs';
import os from 'node:os';
import {SearchPublisher,SearchCatalog} from '../../src/search-catalog.mjs';
import {readProfile} from '../helper/network-profile.mjs';
import {CatalogWorker} from '../../src/catalog-worker.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MeshPeer} from '../peer/embedded-peer.mjs';
import {configureRuntime} from '../helper/runtime.mjs';
import {resolveArUrl,coreRoot} from '../helper/core-adapter.mjs';
import {startDirectPeerServer,parsePeerAddresses,loadConfiguredPeers,loadDirectPeers} from '../../src/direct-peer.mjs';
import {PeerDiscovery} from '../../src/peer-discovery.mjs';
import {SnapshotRelay} from '../../src/snapshot-relay.mjs';
import {peerAddress} from '../../src/peer-directory.mjs';
import {SitePinner} from '../../src/site-pinner.mjs';
import {writeOperatorStatus,startOperatorDashboard} from '../../src/operator-status.mjs';
import {locationCacheStatus} from '../../src/discovery-store.mjs';
import {transferBudgetStatus} from '../../src/resource-budget.mjs';
import {validArName} from '../../src/swarm-common.mjs';
import {NetworkConnection} from '../helper/network-connection.mjs';
import {readNetworkPublication,readNetworkRecovery,renewNetworkPublication,mirrorNetwork,peerNetworkScope} from '../helper/network-publication.mjs';
process.chdir(coreRoot);
const dataDir=path.resolve(process.env.ARNS_MESH_DATA||path.join(os.homedir(),'.local/share/arns-mesh-peer'));
const runtime=configureRuntime(coreRoot,dataDir,{applyDefaultPeers:false,role:'index'});
const renewNetwork=()=>{try{const result=renewNetworkPublication(dataDir);if(result)console.log(JSON.stringify({event:'network-list-renewed',revision:result.revision,expiresAt:result.expiresAt}));}catch(error){console.error(JSON.stringify({event:'network-renewal-error',error:error.message}));}};
renewNetwork();
const network=new NetworkConnection({dataDir});
if(network.status().joined)await network.refresh().catch(error=>console.error(JSON.stringify({event:'network-update-unavailable',error:error.message})));
if(process.env.ARNS_UPSTREAM_FETCH!=='0'&&process.env.ARNS_CATALOG_ENABLED==='1'&&!JSON.parse(fs.readFileSync(runtime.rpcFile)).length)throw new Error('Connection setup needed. Apply a numeric-IP network profile before starting the catalog.');
const mibSetting=(key,fallback,max=8192)=>{const n=Number(process.env[key]??fallback);if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error('invalid_'+key);return n*1024*1024;};
const upstream=process.env.ARNS_UPSTREAM_FETCH!=='0';
const peer=new MeshPeer({dataDir:path.join(dataDir,'peer'),bootstrapFile:process.env.HYPER_BOOTSTRAP,snapshotStore:runtime.snapshots,allowRemoteFetch:upstream,storageLimits:{maxBytes:mibSetting('ARNS_CACHE_MIB',256),maxPinnedBytes:mibSetting('ARNS_SAVED_MIB',512)}});
const pinner=new SitePinner({file:path.join(dataDir,'saved-sites.json'),snapshots:runtime.snapshots,contentStore:peer.contentStore});
peer.pinner=pinner;
const pinsFile=path.join(dataDir,'peer-pins.json');
const configuredPins=fs.existsSync(pinsFile)?JSON.parse(fs.readFileSync(pinsFile)):[];
if(!Array.isArray(configuredPins)||configuredPins.length>16||configuredPins.some(name=>typeof name!=='string'||!validArName(name)))throw new Error('Invalid peer-pins.json; expected up to 16 ArNS names.');
const pinned=[...new Set([...configuredPins,...process.argv.flatMap((arg,i)=>arg==='--pin'?[String(process.argv[i+1]||'').toLowerCase()]:[])])];
const names=[...new Set([...pinned,...process.argv.flatMap((arg,i)=>arg==='--name'?[String(process.argv[i+1]||'').toLowerCase()]:[])])];
const accessPolicy=process.argv.includes('--saved')?'saved':'live';
const trustedPeers=String(process.env.ARNS_TRUSTED_PEERS||'').split(',').filter(Boolean);
if(names.some(name=>!validArName(name)))throw new Error('Invalid --name argument');
let refreshing=false,stopping=false;
async function refresh(){if(refreshing||stopping)return;refreshing=true;try{for(const name of names){try{const r=await resolveArUrl('ar://'+name,{contentStore:peer.contentStore,snapshotStore:runtime.snapshots,accessPolicy,trustedPeers});if(r.peerPayload)await peer.ingest(r.peerPayload);
if(pinned.includes(name)){const old=pinner.rows[name],snapshot=runtime.snapshots.get(name);if(!old||old.rootDataId!==snapshot.txId||!pinner.isReady(old))void pinner.start(name,{signal:AbortSignal.timeout(120000)}).catch(e=>console.error(JSON.stringify({event:'pin-failed',name,error:String(e.message)})));}console.log(JSON.stringify({event:'name-refreshed',name,dataId:r.meta.dataId,contentSignatureVerified:r.meta.contentSignatureVerified,accountInclusionProof:false}));}catch(e){console.error(JSON.stringify({event:'refresh-failed',name,error:String(e.message||e)}));}}}finally{refreshing=false;}}
try{await peer.start();}catch(e){console.error(JSON.stringify({event:'dht-unavailable',error:String(e.message)}));}
const listenArg=process.argv.indexOf('--listen'),listen=listenArg>=0?parsePeerAddresses(process.argv[listenArg+1])[0]:{host:'0.0.0.0',port:49740};
const search=new SearchPublisher({file:path.join(dataDir,'search-published.json'),snapshots:runtime.snapshots,contentStore:peer.contentStore,pinner,sign:record=>peer._envelope(record)});
const searchMirrors=new SearchCatalog(path.join(dataDir,'search-cache.json'));
const searchTrust=()=>[...new Set([...trustedPeers,...(readProfile(dataDir).trustedPeers||[])])].filter(id=>id!==peer.witnessPeerId);
peer.searchReply=req=>{
 if(req.witnessPeerId&&req.witnessPeerId!==peer.witnessPeerId)return searchMirrors.mirror(searchTrust(),req.witnessPeerId)||{ok:false,error:'search_catalog_unavailable'};
 return search.reply();
};
const searchPass=()=>search.pass().catch(error=>{search.lastError=String(error.message).slice(0,160);});
void searchPass();const searchTimer=setInterval(()=>void searchPass(),60000);
const mirrorSearch=()=>searchMirrors.sync({peers:loadDirectPeers(),trustedPeers:searchTrust(),signal:AbortSignal.timeout(45000)}).catch(()=>{});
if(upstream)void mirrorSearch();const searchMirrorTimer=setInterval(()=>{if(upstream)void mirrorSearch();},15*60000);
const peerDiscovery=new PeerDiscovery({dataDir,scope:()=>peerNetworkScope(dataDir,network),peers:()=>loadConfiguredPeers(),identity:peer,listenPort:listen.port,advertise:process.env.MESH_ADVERTISE||'auto'});
const snapshotRelay=new SnapshotRelay({file:path.join(dataDir,'snapshot-relay.json'),trusted:searchTrust,scope:()=>peerNetworkScope(dataDir,network)});peer.snapshotRelay=snapshotRelay;
const direct=await startDirectPeerServer(peer,{...listen,networkAnnouncement:()=>readNetworkPublication(dataDir),networkRecovery:()=>readNetworkRecovery(dataDir),discovery:peerDiscovery});
peerDiscovery.listenPort=direct.address.port;
// A new member mirrors the exact authority-signed list, never its signing key.
if(network.state&&!fs.existsSync(path.join(dataDir,'network-authority.private.json')))mirrorNetwork(dataDir,network.state.invitation,network.state.envelope,network.state.recovery);
peerDiscovery.start();
let relayRunning=false;const relayController=new AbortController();
const mirrorSnapshots=async()=>{if(relayRunning||!upstream)return;relayRunning=true;try{await snapshotRelay.sync({names:[...new Set([...pinned,...runtime.snapshots.names()])],peers:loadDirectPeers().filter(p=>peerAddress(p)!==peerDiscovery.selfAddress()),signal:AbortSignal.any([relayController.signal,AbortSignal.timeout(15000)])});}catch(error){snapshotRelay.lastError=String(error.message).slice(0,160);}finally{relayRunning=false;}};
void mirrorSnapshots();const relayTimer=setInterval(()=>void mirrorSnapshots(),60000);
let catalog=null;
const makeCatalog=endpoint=>new CatalogWorker({dataDir,peer,endpoint,snapshotStore:runtime.snapshots,pinner:process.env.ARNS_PREPARE_ENABLED==='1'?pinner:null,maxPreparedSites:Number(process.env.ARNS_PREPARE_MAX_SITES||32),jobsPerPass:8,mintsPerPass:Number(process.env.ARNS_CATALOG_MINTS_PER_PASS||8)});
if(upstream&&process.env.ARNS_CATALOG_ENABLED==='1'){const seed=JSON.parse(fs.readFileSync(process.env.SOLANA_RPC_SEEDS))[0];catalog=makeCatalog('http://'+(seed.host.includes(':')?'['+seed.host+']':seed.host)+':'+seed.port);catalog.start();}
peer.onContentDemand=id=>catalog?.enqueueDemand(id);
// A background update changes the live profile. Recreate the catalog after its
// current pass stops if its RPC endpoint changed; keep persisted queues.
let catalogEndpoint=catalog?.catalog.endpoint;
network.onChange=()=>{void (async()=>{
 const published=readNetworkPublication(dataDir);
 if(network.state&&(!published||published.key===network.state.invitation.key)&&!fs.existsSync(path.join(dataDir,'network-authority.private.json')))mirrorNetwork(dataDir,network.state.invitation,network.state.envelope,network.state.recovery);
 const seed=JSON.parse(fs.readFileSync(process.env.SOLANA_RPC_SEEDS))[0];
 const endpoint=seed?'http://'+(seed.host.includes(':')?'['+seed.host+']':seed.host)+':'+seed.port:null;
 if(catalog&&endpoint&&endpoint!==catalogEndpoint){catalog.stop();await catalog.running;catalogEndpoint=endpoint;catalog=makeCatalog(endpoint);if(!stopping)catalog.start();}
 })().catch(error=>console.error(JSON.stringify({event:'network-catalog-error',error:error.message})));};
network.onChange(); // Publish an accepted startup refresh on existing mirrors too.
network.start();
const networkRenewalTimer=setInterval(renewNetwork,6*3600000);networkRenewalTimer.unref?.();
if(upstream)runtime.discovery.start();
if(upstream)void refresh();const timer=setInterval(()=>{if(upstream)void refresh();},60000);
const version=JSON.parse(fs.readFileSync(path.join(coreRoot,'package.json'))).version;
const publishStatus=()=>{
 const value={version,...peer.status(),operatorRole:'service-provider',memory:process.memoryUsage(),transferBudget:transferBudgetStatus(),locationCache:locationCacheStatus(),retainedNames:runtime.snapshots.names().length,discovery:runtime.discovery.status(),peerDiscovery:peerDiscovery.status(),snapshotRelay:snapshotRelay.status(),catalog:catalog?.status()||null,search:search.status(),network:network.status(),savedSites:pinner.status()};
 writeOperatorStatus(dataDir,value);console.log(JSON.stringify({event:'peer-status',...value}));
};
publishStatus();const statusTimer=setInterval(publishStatus,60000);
const dashboard=process.env.ARNS_OPERATOR_PORT?await startOperatorDashboard({dataDir,port:Number(process.env.ARNS_OPERATOR_PORT)}):null;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(searchTimer);clearInterval(searchMirrorTimer);clearInterval(statusTimer);clearInterval(networkRenewalTimer);clearInterval(relayTimer);relayController.abort();peerDiscovery.close();network.stop();runtime.discovery.stop();catalog?.stop();await direct.close();await dashboard?.close();await peer.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log(JSON.stringify({event:'peer-started',...peer.status()}));
