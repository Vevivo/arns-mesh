import fs from 'node:fs';
import net from 'node:net';

import {rpcIp as rpc} from './ip-transport.mjs';

export async function detectConsensusEra({seedFile=process.env.SOLANA_RPC_SEEDS||'solana-rpc-seeds.json'}={}){
  const seeds=JSON.parse(fs.readFileSync(seedFile,'utf8')).filter(x=>net.isIP(x.host));
  const observations=[];
  for(const s of seeds){
    const endpoint='http://'+s.host+':'+s.port;
    try{
      const version=await rpc(endpoint,'getVersion');
      let cert=null,certSupported=true;
      try{cert=await rpc(endpoint,'getAgGenesisCert')}catch(e){certSupported=false;}
      const era=cert?'alpenglow':'towerbft';
      observations.push({ok:true,endpoint,era,version,certSupported,genesisCert:cert});
    }catch(e){observations.push({ok:false,endpoint,error:String(e.message||e)})}
  }
  const good=observations.filter(x=>x.ok);
  if(!good.length) throw new Error('consensus_era_unavailable:'+JSON.stringify(observations));
  const alpenglow=good.find(x=>x.era==='alpenglow');
  return {era:alpenglow?'alpenglow':'towerbft',source:alpenglow||good[0],observations};
}
if(process.argv[1]?.endsWith('consensus-era.mjs')) console.log(JSON.stringify(await detectConsensusEra(),null,2));
