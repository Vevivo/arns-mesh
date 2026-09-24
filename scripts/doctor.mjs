import fs from 'node:fs';
import {loadProfile} from '../apps/helper/network-profile.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const checks={node:process.version,architecture:process.arch,platform:process.platform,profile:'not-supplied',dependencyImport:false};
try{
 if(process.argv[2]){const p=loadProfile(process.argv[2]);checks.profile={valid:true,mesh:p.directPeers.length,rpc:p.rpcSources.length,raw:p.arweavePeers.length};}
 await import('../apps/peer/embedded-peer.mjs');checks.dependencyImport=true;
 checks.packageVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
 console.log(JSON.stringify(checks,null,2));
 console.log('Local configuration/dependency check only. Reachability, fresh names, NAT and content coverage are not tested.');
}catch(e){console.error(e.message);process.exitCode=1;}
