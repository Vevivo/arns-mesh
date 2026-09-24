import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const ignored=new Set(['.git','node_modules','dist','.cache','.local','.test-state']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>ignored.has(d.name)?[]:d.isDirectory()?walk(path.join(dir,d.name)):[path.relative(root,path.join(dir,d.name)).replaceAll('\\','/')]);}
let files=walk(root);try{const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);files=[...new Set([...files,...tracked])];}catch{}
const issues=[];
for(const name of files){
 const file=path.join(root,name);
 if(!fs.existsSync(file))continue;
 if(fs.lstatSync(file).isSymbolicLink()){issues.push([name,'symlink']);continue;}
 if(/(?:^|\/)(?:identity\.json|swarm-seed\.bin|bridge\.json|browser-data\.json|name-snapshots\.json|saved-sites\.json|peer-pins\.json|ledger-discovery\.json|verified-peer-cache\.json|\.env(?:\..*)?)$/.test(name)||/\.(?:private\.json|pem|key|log|tap|exe|zip|dll)$/.test(name))issues.push([name,'runtime/private artifact']);
 const bytes=fs.readFileSync(file);if(bytes.length>1200000){issues.push([name,'oversized source file']);continue;}
 const s=bytes.toString('utf8');
 const patterns=[[/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,'private key'],[/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16})\b/,'credential pattern'],[/https?:\/\/[^\s/"'<>]+:[^\s/@"'<>]+@/,'URL credentials'],[/\b(?:host_[a-f0-9]{16}|sentinelx_context_[A-Za-z0-9_]+|libfile_[a-f0-9]+)\b/,'private operational identifier'],[/\/workspace\/(?:scratch|[^/]+)\//,'workspace path']];
 for(const [pattern,reason] of patterns)if(pattern.test(s))issues.push([name,reason]);
 if(name!=='scripts/check-public.mjs')for(const ip of s.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)||[]){if(!/^(?:127\.|0\.0\.0\.0$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip))issues.push([name,'non-example IP address']);}
}
for(const name of ['solana-rpc-seeds.json','arweave-peers.json','arweave-peer-seeds.json','hyper-bootstrap.json'])if(JSON.parse(fs.readFileSync(path.join(root,name))).length)issues.push([name,'public default endpoints must be empty']);
if(JSON.parse(fs.readFileSync(path.join(root,'resources/mesh-defaults.json'))).directPeers.length)issues.push(['resources/mesh-defaults.json','public default endpoints must be empty']);
if(issues.length){console.error(JSON.stringify({ok:false,issues:[...new Map(issues.map(x=>[JSON.stringify(x),x])).values()]},null,2));process.exitCode=1;}
else console.log(JSON.stringify({ok:true,files:files.length,scope:'working tree plus tracked paths; targeted patterns, not a guarantee against all secrets'}));
