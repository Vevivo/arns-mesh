import {getProtectedNameContext} from './name-security-runtime.mjs';

// All phases of one asynchronous display report must describe the same policy.
export function captureOperatorReportContext(getContext=getProtectedNameContext){
 const initial=getContext(),policyId=initial?.policyId||null;
 return ()=>{
  const current=getContext();
  if(Boolean(initial)!==Boolean(current)||(current?.policyId||null)!==policyId)throw new Error('name_security_context_changed');
  initial?.assertCurrent();current?.assertCurrent();
 };
}

// A report shares metadata only for its own lifetime and store identity. The
// underlying scan yields to HTTP; budgets and authorization never use this map.
export async function collectOperatorStatus({peer,pinner,replicationPinner,peerDiscovery,signal}){
 signal?.throwIfAborted();
 const scans=new Map(),statsFor=store=>{
  if(!scans.has(store))scans.set(store,store.statsAsync({signal}));
  return scans.get(store);
 };
 const peerStatus=peer.status({contentStats:await statsFor(peer.contentStore)});
 const savedStatus=await pinner.statusAsync({contentStats:await statsFor(pinner.store),signal});
 const replicatedStatus=await replicationPinner.statusAsync({contentStats:await statsFor(replicationPinner.store),signal});
 signal?.throwIfAborted();
 return {peerStatus,savedStatus,replicatedStatus,discoveryStatus:peerDiscovery.status()};
}
