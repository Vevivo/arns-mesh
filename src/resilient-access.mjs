// Availability fallback never relaxes signature, ownership, conflict or proof
// checks. A retained version is always labelled as historical observation.
export function isSourceUnavailable(error){
 return ['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE'].includes(error?.code)
  ||[408,429,502,503,504].includes(error?.statusCode)
  ||[-32005,-32004].includes(error?.rpcCode)
  ||/^(request_deadline_exceeded|truncated_response|name_source_timeout)$/.test(error?.message||'');
}
export async function resolveWithRecovery({live,saved,prepared,signal,onProgress=()=>{}}){
 let failure,latestTargetId=null;
 const recover=async(run,reason)=>{
  signal?.throwIfAborted();
  onProgress({phase:'resolving',stage:'name',status:'active',message:'A source is unavailable · Looking for a retained version…'});
  const result=await run();signal?.throwIfAborted();
  result.recovery={...result.recovery,automatic:true,reason,latestTargetId};
  result.verification={...result.verification,currentStateVerified:false};
  return result;
 };
 try{return await live();}
 catch(error){signal?.throwIfAborted();failure=error;latestTargetId=error.diagnostics?.nameResolution?.rootDataId||null;}
 if(failure.code==='NAME_SOURCE_UNAVAILABLE'){
  try{return await recover(saved,'rpc-unavailable');}
  catch(error){signal?.throwIfAborted();if(!String(error.message).startsWith('content_location_unavailable')&&!['saved_name_unavailable','snapshot_not_found','direct_peer_unavailable','no_direct_peers','No P2P peer response'].some(s=>String(error.message).includes(s)))throw error;}
 }else if(!String(failure.message).startsWith('content_location_unavailable'))throw failure;
 try{return await recover(()=>prepared({latestTargetId}),latestTargetId?'current-content-unavailable':'rpc-and-content-unavailable');}
 catch(error){signal?.throwIfAborted();failure.recoveryError=String(error.message).slice(0,300);throw failure;}
}
