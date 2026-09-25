import '../../src/network-lockdown.mjs';
import os from 'node:os';
import {CatalogWorker} from '../../src/catalog-worker.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MeshPeer} from '../peer/embedded-peer.mjs';
import {configureRuntime} from '../helper/runtime.mjs';
import {resolveArUrl,coreRoot} from '../helper/core-adapter.mjs';
import {startDirectPeerServer,parsePeerAddresses} from '../../src/direct-peer.mjs';
import {SitePinner} from '../../src/site-pinner.mjs';
import {validArName} from '../../src/swarm-common.mjs';
import {NetworkConnection} from '../helper/network-connection.mjs';
import {readNetworkPublication,renewNetworkPublication,mirrorNetwork} from '../helper/network-publication.mjs';
process.chdir(coreRoot);
const dataDir=path.resolve(process.env.ARNS_MESH_DATA||path.join(os.homedir(),'.local/share/arns-mesh-peer'));
const runtime=configureRuntime(coreRoot,dataDir,{applyDefaultPeers:false,role:'index'});
const renewNetwork=()=>{try{const result=renewNetworkPublication(dataDir);if(result)console.log(JSON.stringify({event:'network-list-renewed',revision:result.revision,expiresAt:result.expiresAt}));}catch(error){console.error(JSON.stringify({event:'network-renewal-error',error:error.message}));}};
renewNetwork();
const network=new NetworkConnection({dataDir});
if(network.status().joined)await network.refresh().catch(error=>console.error(JSON.stringify({event:'network-update-unavailable',error:error.message})));
if(process.env.ARNS_CATALOG_ENABLED==='1'&&!JSON.parse(fs.readFileSync(runtime.rpcFile)).length)throw new Error('Connection setup needed. Apply a numeric-IP network profile before starting the catalog.');
const peer=new MeshPeer({dataDir:path.join(dataDir,'peer'),bootstrapFile:process.env.HYPER_BOOTSTRAP,snapshotStore:runtime.snapshots});
const pinner=new SitePinner({file:path.join(dataDir,'saved-sites.json'),snapshots:runtime.snapshots,contentStore:peer.contentStore});
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
if(pinned.includes(name)){const old=pinner.rows[name],snapshot=runtime.snapshots.get(name);if(!old||old.rootDataId!==snapshot.txId||!['manifest-saved','document-saved'].includes(old.status))void pinner.start(name).catch(e=>console.error(JSON.stringify({event:'pin-failed',name,error:String(e.message)})));}console.log(JSON.stringify({event:'name-refreshed',name,dataId:r.meta.dataId,contentSignatureVerified:r.meta.contentSignatureVerified,accountInclusionProof:false}));}catch(e){console.error(JSON.stringify({event:'refresh-failed',name,error:String(e.message||e)}));}}}finally{refreshing=false;}}
try{await peer.start();}catch(e){console.error(JSON.stringify({event:'dht-unavailable',error:String(e.message)}));}
const listenArg=process.argv.indexOf('--listen'),listen=listenArg>=0?parsePeerAddresses(process.argv[listenArg+1])[0]:{host:'0.0.0.0',port:49740};
const direct=await startDirectPeerServer(peer,{...listen,networkAnnouncement:()=>readNetworkPublication(dataDir)});
let catalog=null;
if(process.env.ARNS_CATALOG_ENABLED==='1'){const seed=JSON.parse(fs.readFileSync(process.env.SOLANA_RPC_SEEDS))[0];catalog=new CatalogWorker({dataDir,peer,endpoint:'http://'+(seed.host.includes(':')?'['+seed.host+']':seed.host)+':'+seed.port});catalog.start();}
// A background update changes the live profile. Recreate the catalog after its
// current pass stops if its RPC endpoint changed; keep persisted queues.
let catalogEndpoint=catalog?.catalog.endpoint;
network.onChange=()=>{void (async()=>{
 const published=readNetworkPublication(dataDir);
 if(published&&network.state&&published.key===network.state.invitation.key&&!fs.existsSync(path.join(dataDir,'network-authority.private.json')))mirrorNetwork(dataDir,network.state.invitation,network.state.envelope);
 const seed=JSON.parse(fs.readFileSync(process.env.SOLANA_RPC_SEEDS))[0];
 const endpoint=seed?'http://'+(seed.host.includes(':')?'['+seed.host+']':seed.host)+':'+seed.port:null;
 if(catalog&&endpoint&&endpoint!==catalogEndpoint){catalog.stop();await catalog.running;catalogEndpoint=endpoint;catalog=new CatalogWorker({dataDir,peer,endpoint});if(!stopping)catalog.start();}
 })().catch(error=>console.error(JSON.stringify({event:'network-catalog-error',error:error.message})));};
network.onChange(); // Publish an accepted startup refresh on existing mirrors too.
network.start();
const networkRenewalTimer=setInterval(renewNetwork,6*3600000);networkRenewalTimer.unref?.();
runtime.discovery.start();
void refresh();const timer=setInterval(refresh,60000);
const statusTimer=setInterval(()=>console.log(JSON.stringify({event:'peer-status',...peer.status(),discovery:runtime.discovery.status(),catalog:catalog?.status()||null,network:network.status(),savedSites:pinner.status()})),60000);
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(statusTimer);clearInterval(networkRenewalTimer);network.stop();runtime.discovery.stop();catalog?.stop();await direct.close();await peer.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log(JSON.stringify({event:'peer-started',...peer.status()}));
