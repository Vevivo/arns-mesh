import fs from 'node:fs';
import net from 'node:net';

function readList(file){
  try{
    const v=JSON.parse(fs.readFileSync(file,'utf8'));
    return Array.isArray(v)?v:[];
  }catch{return [];}
}
function normalize(v){
  if(typeof v==='string'){const i=v.lastIndexOf(':');return i>0&&net.isIP(v.slice(0,i))&&Number(v.slice(i+1))>0?v:null;}
  if(v&&net.isIP(v.host)&&Number(v.port)>0) return String(v.host)+':'+Number(v.port);
  return null;
}
export function loadHyperBootstrap({
  bootstrapFile=process.env.HYPER_BOOTSTRAP||'hyper-bootstrap.json',
  cacheFile=process.env.HYPER_PEER_CACHE||'hyper-peer-cache.json',
  max=64
}={}){
  const all=[...readList(bootstrapFile),...readList(cacheFile)].map(normalize).filter(Boolean);
  return [...new Set(all)].slice(0,max);
}
export async function learnHyperNodes(dht,topic,{
  cacheFile=process.env.HYPER_PEER_CACHE||'hyper-peer-cache.json',
  max=32,
  timeoutMs=5000
}={}){
  const learned=new Map();
  const stream=dht.lookup(topic);
  const timer=setTimeout(()=>{try{stream.destroy();}catch{}},timeoutMs);
  try{
    for await(const r of stream){
      if(r?.from?.host&&r?.from?.port){
        const key=String(r.from.host)+':'+Number(r.from.port);
        learned.set(key,{host:String(r.from.host),port:Number(r.from.port),learnedAt:new Date().toISOString()});
      }
      if(learned.size>=max){try{stream.destroy();}catch{};break;}
    }
  }catch{}
  clearTimeout(timer);
  const existing=readList(cacheFile).map(x=>typeof x==='string'?{host:x.split(':')[0],port:Number(x.split(':').pop())}:x).filter(x=>x?.host&&x?.port);
  const merged=new Map();
  for(const x of existing) merged.set(String(x.host)+':'+Number(x.port),x);
  for(const [k,x] of learned) merged.set(k,x);
  const out=[...merged.values()].slice(-128);
  try{fs.writeFileSync(cacheFile,JSON.stringify(out,null,2)+'\n');}catch{}
  return [...learned.values()];
}
