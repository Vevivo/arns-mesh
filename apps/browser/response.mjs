// Byte ranges are sliced only after the complete bounded item is verified.
// This is not streaming verification of large files; the core's 32 MiB limit remains.
import {arweaveResourceOrigins,parseArweaveResourceUrl} from '../../src/arweave-resource-url.mjs';
// These HTTPS origins are intercepted in each isolated content session. They
// never delegate to Chromium's network loader; unsupported URLs are rejected.
const resources=arweaveResourceOrigins.join(' ');
export const contentCsp=`default-src 'self' data: blob: ${resources}; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${resources}; style-src 'self' 'unsafe-inline' ${resources}; connect-src 'self' ${resources}; worker-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`;
export function contentResponse(result,request){
  if(result.meta?.contentSignatureVerified!==true)throw new Error('unverified_content_rejected');
  const body=result.body,headers={'content-type':result.contentType,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':contentCsp,'accept-ranges':'bytes'};
  const range=request.headers.get('range');let start=0,end=body.length-1,status=200;
  if(range){
    const m=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!m||(!m[1]&&!m[2])||!body.length)return new Response(null,{status:416,headers:{...headers,'content-range':`bytes */${body.length}`}});
    if(!m[1])start=Math.max(0,body.length-Number(m[2]));else start=Number(m[1]);
    if(m[1]&&m[2])end=Math.min(end,Number(m[2]));
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=body.length)return new Response(null,{status:416,headers:{...headers,'content-range':`bytes */${body.length}`}});
    status=206;headers['content-range']=`bytes ${start}-${end}/${body.length}`;
  }
  headers['content-length']=String(Math.max(0,end-start+1));
  return new Response(request.method==='HEAD'?null:body.subarray(start,end+1),{status,headers});
}
export function isAllowedRendererUrl(raw,{resourceType}={}){
  try{const u=new URL(raw);return (u.protocol==='ar:'&&!u.username&&!u.password&&!u.port&&/^[a-z0-9_-]{1,255}$/i.test(u.hostname))||/^arnsui:\/\/app\/(?:welcome\.(?:html|css)|brand\.css|mesh\.svg|ario-full-black\.svg|fonts\/(?:besley|plus-jakarta-sans)\.woff2)$/.test(raw)||['data:','blob:'].includes(u.protocol)||(Boolean(resourceType)&&resourceType!=='mainFrame'&&resourceType!=='subFrame'&&Boolean(parseArweaveResourceUrl(raw)));}catch{return false;}
}
export function plainError(error){
  const value=String(error.message||error);
  if(/saved_binding_unavailable/.test(value))return 'This older saved entry has no matching saved name observation. Its files were kept. Save the site again in live mode to bind a new copy.';
  if(/saved_peer_trust_required/.test(value))return 'The peer whose name observation was saved is no longer trusted. Review your trusted peers before opening this saved version.';
  if(/saved_name_unavailable/.test(value))return 'No saved name record is available. Live resolution requires a reachable Solana RPC source.';
  if(/arns_lease_expired/.test(value))return 'The name lease is expired according to the RPC observation and this computer’s clock. No current mapping was accepted. Open Page information for details.';
  if(/current_name_state_unavailable|no_state_evidence|rpc_sources_conflict/.test(value))return 'A current name record could not be obtained, or the sources disagree. Saved records are available only by your explicit selection.';
  if(/content_location_unavailable/.test(value))return 'The name resolved, but its content location could not be found. No gateway fallback was used.';
  if(/manifest_path/.test(value))return 'This path is not present in the site manifest.';
  return value.slice(0,300);
}
