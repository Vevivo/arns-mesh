import '../src/network-lockdown.mjs';
import {parsePeerAddresses,queryDirectPeer} from '../src/direct-peer.mjs';
try {
  if(process.argv.length!==3)throw new Error('Usage: node scripts/probe-peer.mjs IP:PORT');
  const peers=parsePeerAddresses(process.argv[2]);
  if(peers.length!==1)throw new Error('Supply exactly one peer.');
  // Cache-only: never starts a content fetch or catalog scan on the peer.
  const reply=await queryDirectPeer(peers[0],{op:'location',dataId:'A'.repeat(43),cacheOnly:true});
  if(!(reply?.ok===true||reply?.ok===false&&reply.error==='location_not_found'))throw new Error('Unexpected Mesh response.');
  console.log('Mesh endpoint responded. This proves reachability only, not identity, freshness or content coverage.');
} catch(error) { console.error(String(error.message)); process.exitCode=1; }
