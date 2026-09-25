import {parseArweaveResourceUrl} from './arweave-resource-url.mjs';

// Discover literal immutable references in verified text, without evaluating
// scripts, rewriting signed bytes or fetching a URL. Dynamic references and
// non-Arweave CDN/service dependencies are outside this bounded scan's scope.
export function discoverArweaveReferences(item,{maxBytes=2*1024*1024,maxIds=1024}={}){
 const type=(item.tags?.find(t=>t.name.toLowerCase()==='content-type')?.value||'').split(';')[0].trim().toLowerCase();
 const supported=['text/html','application/xhtml+xml','text/css','text/javascript','application/javascript','application/json'].includes(type);
 if(!supported)return {ids:[],scanned:false,truncated:false};
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxIds)||maxIds<1)throw new Error('invalid_reference_budget');
 const payload=item.payload,ids=new Set();let truncated=payload.length>maxBytes;
 // JSON/JavaScript may escape slashes. This unescapes only that spelling; no
 // arbitrary escapes, expressions, redirects or host names are interpreted.
 const text=payload.subarray(0,maxBytes).toString('utf8').replace(/\\\//g,'/');
 for(const match of text.matchAll(/https:\/\/[^\s"'<>`\\)]+/g)){
  const parsed=parseArweaveResourceUrl(match[0]);if(!parsed||ids.has(parsed.dataId))continue;
  if(ids.size>=maxIds){truncated=true;break;}ids.add(parsed.dataId);
 }
 return {ids:[...ids],scanned:true,truncated};
}
