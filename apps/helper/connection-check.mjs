import {requestIpJson,rpcIp} from '../../src/ip-transport.mjs';
import {parsePeerAddresses} from '../../src/direct-peer.mjs';

// Reachability only: no content is fetched, and a reply is not an identity or
// name-freshness proof. Only already configured literal-IP endpoints are probed.
export async function checkConnections(profile,{signal,onResult=()=>{}}={}){
 const rows=[...profile.directPeers.map(address=>({kind:'Mesh peer',address})),
  ...profile.rpcSources.map(address=>({kind:'Solana RPC',address})),
  ...profile.arweavePeers.map(address=>({kind:'Raw Arweave',address}))];
 if(rows.length>40)throw new Error('Too many configured connections.');
 let cursor=0;
 const results=new Array(rows.length);
 async function worker(){
  while(cursor<rows.length){
   const index=cursor++,row=rows[index],started=Date.now();
   let result;
   try{
    signal?.throwIfAborted();
    const bounded=signal?AbortSignal.any([signal,AbortSignal.timeout(4000)]):AbortSignal.timeout(4000);
    const peer=parsePeerAddresses(row.address)[0];
    if(row.kind==='Solana RPC'){
     const answer=await rpcIp('http://'+row.address,'getVersion',[],{signal:bounded,timeout:4000,maxBytes:16384});
     if(typeof answer?.['solana-core']!=='string')throw new Error('Unexpected Solana RPC reply.');
    }else if(row.kind==='Mesh peer'){
     const answer=await requestIpJson({...peer,path:'/mesh/v1/query',method:'POST',body:{op:'location',dataId:'A'.repeat(43),cacheOnly:true},purpose:'mesh-peer',timeout:4000,maxBytes:32768,signal:bounded});
     if(!(answer?.ok===true||answer?.ok===false&&answer.error==='location_not_found'))throw new Error('Unexpected Mesh reply.');
    }else{
     const answer=await requestIpJson({...peer,path:'/info',timeout:4000,maxBytes:32768,signal:bounded});
     if(typeof answer?.network!=='string')throw new Error('Unexpected raw node reply.');
    }
    result={...row,status:'responded',elapsedMs:Date.now()-started,checkedAt:new Date().toISOString()};
   }catch(error){result={...row,status:'unavailable',elapsedMs:Date.now()-started,checkedAt:new Date().toISOString(),error:String(error.message||error).slice(0,180)};}
   results[index]=result;onResult(result);
  }
 }
 await Promise.all([worker(),worker()]);return results;
}
