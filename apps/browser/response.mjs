// Byte ranges are sliced only after the complete bounded item is verified.
// This is not streaming verification of large files; the core's 32 MiB limit remains.
import {homeQuery} from './search-home.mjs';
import {arweaveResourceOrigins,parseArweaveResourceUrl} from '../../src/arweave-resource-url.mjs';
// These HTTPS origins are intercepted in each isolated content session. They
// never delegate to Chromium's network loader; unsupported URLs are rejected.
const resources=arweaveResourceOrigins.join(' ');
export const contentCsp=`default-src 'self' data: blob: ${resources}; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${resources}; style-src 'self' 'unsafe-inline' ${resources}; connect-src 'self' ${resources}; worker-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`;
export function contentResponse(result,request){
  if(result.meta?.contentSignatureVerified!==true)throw new Error('unverified_content_rejected');
  // Adapters deliver decoded view bytes; transport encoding must never be
  // forwarded to Chromium (which could decode this representation twice).
  if((result.contentEncoding||result.meta?.contentEncoding)&&result.bodyDecoded!==true)throw new Error('content_decoding_required');
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
  try{const u=new URL(raw);return homeQuery(raw)!==null||(u.protocol==='ar:'&&!u.username&&!u.password&&!u.port&&/^[a-z0-9_-]{1,255}$/i.test(u.hostname))||/^arnsui:\/\/app\/(?:welcome\.(?:html|css)|brand\.css|mesh\.svg|ario-full-black\.svg|fonts\/(?:besley|plus-jakarta-sans)\.woff2)$/.test(raw)||['data:','blob:'].includes(u.protocol)||(Boolean(resourceType)&&resourceType!=='mainFrame'&&resourceType!=='subFrame'&&Boolean(parseArweaveResourceUrl(raw)));}catch{return false;}
}
export function plainError(error){
  const value=String(error.message||error);
  if(/name_certificate_unavailable/.test(value))return 'Independent name confirmations are unavailable. A certified retained version may still be available in Automatic or Saved mode.';
  if(/name_policy_inactive|name_certificate_expired/.test(value))return 'The name confirmation has expired. Mesh cannot present it as current. A previously accepted retained version may still be available.';
  if(/name_policy_revoked|name_policy_migration_required|name_witness_policy_required|name_security_context_changed/.test(value))return 'The accepted name policy is unavailable, changed or revoked. Review the Mesh connection before opening this name.';
  if(/name_witness_policy_does_not_satisfy_required_chain_proof/.test(value))return 'This connection uses witness confirmations, which do not satisfy the separately required chain proof.';
  if(/name_certificate_|name_observation_/.test(value))return 'The name record could not be authenticated. Mesh did not open its content.';
  if(/content_decoded_size_limit/.test(value))return 'This file expands beyond the 32 MiB viewing limit.';
  if(/content_decode_timeout/.test(value))return 'This compressed file took too long to open. The decoding task was stopped.';
  if(/content_encoding_unsupported|content_encoding_ambiguous/.test(value))return 'This file uses an unsupported or ambiguous Content-Encoding. Mesh supports gzip and Brotli.';
  if(/content_encoding_corrupt/.test(value))return 'The signed file was verified, but its compressed data is damaged or does not match its Content-Encoding tag.';
  if(/content_decode_busy/.test(value))return 'Too many compressed files are opening. Please try again.';
  if(/content_decoding_required|content_decode_failed/.test(value))return 'This compressed file could not be safely opened.';
  if(/saved_binding_unavailable/.test(value))return 'This older saved entry has no matching saved name observation. Its files were kept. Save the site again in live mode to bind a new copy.';
  if(/saved_peer_trust_required/.test(value))return 'The peer whose name observation was saved is no longer trusted. Review your trusted peers before opening this saved version.';
  if(/saved_name_unavailable/.test(value))return 'No saved name record is available. Live resolution requires a reachable Solana RPC source.';
  if(/arns_lease_expired/.test(value))return 'The name lease is expired according to the RPC observation and this computer’s clock. No current mapping was accepted. Open Page information for details.';
  if(/current_name_state_unavailable|no_state_evidence|rpc_sources_conflict/.test(value))return 'A current name record could not be obtained, or the sources disagree. Saved records are available only by your explicit selection.';
  if(/content_location_unavailable/.test(value))return 'The name resolved, but its content location could not be found. No gateway fallback was used.';
  if(/manifest_path/.test(value))return 'This path is not present in the site manifest.';
  return value.slice(0,300);
}
