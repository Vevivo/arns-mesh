import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {parsePeerAddresses} from '../../src/direct-peer.mjs';
import {NameSnapshotStore} from '../../src/name-snapshots.mjs';
import {configureNetworkAudit} from '../../src/network-audit.mjs';
import {configureRawDiscovery} from '../../src/raw-ledger-discovery.mjs';
import {configureHistoricalIndex} from '../../src/cdb64-index.mjs';
import {configureLocationCache} from '../../src/discovery-store.mjs';
import {configureTransferBudget} from '../../src/resource-budget.mjs';
export function configureRuntime(coreRoot,dataDir,{applyDefaultPeers=true,role='client'}={}){
  if(role==='desktop')role='client'; // Preserve callers using the former role name.
  if(!['client','index'].includes(role))throw new Error('invalid_runtime_role');
  fs.mkdirSync(dataDir,{recursive:true});
  const copies=[['solana-rpc-seeds.json','SOLANA_RPC_SEEDS'],['hyper-bootstrap.json','HYPER_BOOTSTRAP'],['arweave-peers.json','ARWEAVE_PEERS'],['arweave-peer-seeds.json','ARWEAVE_PEER_SEEDS']];
  for(const [name,env] of copies){const dest=path.join(dataDir,name);if(!fs.existsSync(dest))fs.copyFileSync(path.join(coreRoot,name),dest);process.env[env]=dest;}
  const directFile=path.join(dataDir,'mesh-ip-peers.json');if(!fs.existsSync(directFile))fs.writeFileSync(directFile,'[]');process.env.ARNS_IP_PEERS=directFile;
  // Apply this installation's bootstrap once. Subsequent removals are kept.
  const defaultsMarker=path.join(dataDir,'mesh-defaults-applied.json');
  const defaultsFile=path.join(coreRoot,'resources','mesh-defaults.json');
  if(applyDefaultPeers&&!fs.existsSync(defaultsMarker)&&fs.existsSync(defaultsFile)){
    const defaults=JSON.parse(fs.readFileSync(defaultsFile));
    const configured=JSON.parse(fs.readFileSync(directFile));
    if(defaults.schema==='arns-mesh-defaults/v1'&&Array.isArray(defaults.directPeers)&&!configured.length)saveDirectPeers(directFile,defaults.directPeers.join('\n'));
    fs.writeFileSync(defaultsMarker,JSON.stringify({schema:defaults.schema}),{mode:0o600});
  }
  process.env.HYPER_PEER_CACHE=path.join(dataDir,'hyper-peer-cache.json');
  // Keep the existing cache filename for upgrades; the role is now client.
  // An index node retains its separate location shards.
  const locationsFile=path.join(dataDir,role==='client'?'desktop-locations.json':'locations.json');
  if(!fs.existsSync(locationsFile))fs.writeFileSync(locationsFile,'{}');
  process.env.ARNS_LOCATIONS=locationsFile;
  configureLocationCache(locationsFile,role==='client'?{maxEntries:2048,maxBytes:1024*1024}:null);
  configureTransferBudget(role);
  configureNetworkAudit(dataDir);
  const discovery=configureRawDiscovery({dataDir,locationsFile,peersFile:process.env.ARWEAVE_PEERS,enabled:role==='index'});
  const historical=configureHistoricalIndex({locationsFile,peersFile:process.env.ARWEAVE_PEERS,retainBundleEntries:role==='index'});
  const snapshots=new NameSnapshotStore(path.join(dataDir,'name-snapshots.json'));
  return {dataDir,role,rpcFile:process.env.SOLANA_RPC_SEEDS,discovery,historical,snapshots};
}
export function saveRpcSources(file,lines){
  const entries=String(lines).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!entries.length||entries.length>8)throw new Error('Enter between 1 and 8 IP:port addresses.');
  const seeds=entries.map(x=>{const i=x.lastIndexOf(':');const host=x.slice(0,i);const port=Number(x.slice(i+1));if(!net.isIP(host)||!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid IP:port: '+x);return {host,port};});
  const unique=[...new Map(seeds.map(x=>[x.host+':'+x.port,x])).values()];
  const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(unique,null,2));fs.renameSync(tmp,file);return unique.length;
}
export function parseTrustedPeers(lines){const peers=[...new Set(String(lines).split(/\s+/).filter(Boolean))];if(peers.length>8||peers.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw new Error('Enter up to 8 peer IDs, each containing 64 hexadecimal characters.');return peers;}
export function saveBootstrapSources(file,lines){
 const entries=[...new Set(String(lines).split(/\s+/).filter(Boolean))];
 if(entries.length>64||entries.some(value=>{const i=value.lastIndexOf(':');const port=Number(value.slice(i+1));return !net.isIP(value.slice(0,i))||!Number.isInteger(port)||port<1||port>65535;}))throw new Error('Bootstrap addresses must use IP:port format.');
 fs.writeFileSync(file+'.tmp',JSON.stringify(entries,null,2));fs.renameSync(file+'.tmp',file);
}

export function saveDirectPeers(file,lines){const entries=parsePeerAddresses(lines).map(p=>(net.isIP(p.host)===6?'['+p.host+']':p.host)+':'+p.port);fs.writeFileSync(file+'.tmp',JSON.stringify(entries));fs.renameSync(file+'.tmp',file);return entries.length;}
