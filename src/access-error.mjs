// Product-facing errors deliberately omit peer addresses and raw diagnostics.
export function accessError(error){
 const message=String(error?.message||error);
 if(message.includes('content_decoded_size_limit'))return {code:'content_decoded_size_limit',status:413,message:'This file expands beyond the 32 MiB viewing limit.'};
 if(/content_encoding_unsupported|content_encoding_ambiguous/.test(message))return {code:'content_encoding_unsupported',status:422,message:'This file has an unsupported or ambiguous Content-Encoding. Mesh supports gzip and Brotli.'};
 if(message.includes('content_encoding_corrupt'))return {code:'content_encoding_corrupt',status:502,message:'The signed file was verified, but its compressed data is damaged or does not match its Content-Encoding tag.'};
 if(message.includes('content_decode_timeout'))return {code:'content_decode_timeout',status:504,message:'This compressed file took too long to open. The decoding task was stopped.'};
 if(/content_decode_busy|content_decode_failed|content_decoding_required/.test(message))return {code:'content_decode_failed',status:503,message:'This compressed file could not be safely opened. Please try again.'};
 if(message.includes('content_location_unavailable'))return {code:'content_location_unavailable',status:502,message:'The name resolved, but its content location could not be found. Mesh peers, published indexes and raw Arweave lookups did not provide verified content.'};
 if(message.includes('manifest_path_not_found'))return {code:'manifest_path_not_found',status:404,message:'This path is not present in the verified site manifest.'};
 if(message.includes('unsupported_target_protocol'))return {code:'unsupported_target_protocol',status:422,message:'The name record points to a target protocol that this companion does not support.'};
 if(message.includes('account_not_found'))return {code:'name_account_not_found',status:404,message:'The configured RPC source reported that the name or undername account was not found.'};
 if(message.includes('current_name_state_unavailable'))return {code:'name_state_unavailable',status:502,message:'The current name record could not be read and checked using the configured RPC sources.'};
 if(/aborted|cancelled|mode_changed|helper_stopped|client_disconnected|p2p_suspended/i.test(message))return {code:'request_cancelled',status:503,message:'The P2P request was cancelled or paused.'};
 if(/timeout|timed out/i.test(message))return {code:'request_timeout',status:504,message:'The P2P request timed out. You can retry in P2P mode.'};
 if(/signature|id_mismatch|hash_mismatch|content_transfer_hash/i.test(message))return {code:'content_verification_failed',status:502,message:'The received content failed its identity or integrity check.'};
 return {code:'p2p_request_failed',status:502,message:'The P2P request failed. Local diagnostics contain the failed access stage.'};
}
