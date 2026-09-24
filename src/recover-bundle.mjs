import fs from 'node:fs';
import {discoverArweavePeers,txOffset,rangeFromRoot,fetchDataItemDirect} from './arweave-direct.mjs';
import {walkBundleHeaders} from './bundle-walker.mjs';
import {saveDiscoveredLocations} from './discovery-store.mjs';
import {validDataId} from './swarm-common.mjs';

// A publisher's root bundle ID is a routing hint. Recover using raw IP peers;
// the target item's signature and ID must still verify before caching it.
export async function recoverFromBundle({dataId,rootTxId,locationsFile,contentStore,
 peersFile=process.env.ARWEAVE_PEERS||'arweave-peers.json',signal,onProgress=()=>{}}){
 if(!validDataId(dataId)||!validDataId(rootTxId)||!locationsFile)throw new Error('invalid_bundle_recovery_input');
 signal=signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000);
 const peers=await discoverArweavePeers(JSON.parse(fs.readFileSync(peersFile)),{maxPeers:12,expand:true,signal});
 let location=null,lastError,indexed=0,bytes=0;
 const found=new Error('requested_item_located'),chunks=new Map();
 const onNetworkBytes=n=>{bytes+=n;if(bytes>32*1024*1024)throw new Error('bundle_recovery_scan_budget_reached');};
 for(const peer of peers){
  signal.throwIfAborted();
  try{
   const meta=await txOffset(peer,rootTxId,{signal,onNetworkBytes});
   const scan=await walkBundleHeaders({rootTxId,rootSize:meta.size,signal,maxItems:4096,
    read:(offset,size)=>rangeFromRoot(peer,rootTxId,offset,size,meta,{signal,chunkCache:chunks,peerSeeds:peers,onNetworkBytes,timeout:3000}),
    onEntries:entries=>{
     indexed+=saveDiscoveredLocations(locationsFile,entries).added;
     onProgress({stage:'location',status:'active',message:'Scanning the supplied bundle through raw Arweave…',indexed});
     const entry=entries.find(([id])=>id===dataId);if(entry){location=entry[1];throw found;}
    }});
   throw new Error(scan.complete?'target_not_found_in_scanned_bundle':'bundle_recovery_item_limit_reached');
  }catch(error){if(error===found)break;lastError=error;if(bytes>32*1024*1024)break;}
 }
 signal.throwIfAborted();if(!location)throw lastError||new Error('no_raw_arweave_peers');
 const direct=await fetchDataItemDirect({dataId,location,seedsFile:peersFile,signal,onProgress});
 if(contentStore)await contentStore.put(dataId,direct.rawItem);
 return {dataId,rootTxId,location,indexed,bytes:direct.payload.length,signatureVerified:true};
}
