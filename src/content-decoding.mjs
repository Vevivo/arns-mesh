import {Worker} from 'node:worker_threads';

export const MAX_DECODED_BYTES=32*1024*1024;
export const DECODE_TIMEOUT_MS=5000;
const MAX_ENCODED_BYTES=32*1024*1024,MAX_WAITING=16,MAX_WAITING_BYTES=64*1024*1024;
let active=false,waitingBytes=0;
const waiting=[];

// Only signed tags from a verified item are accepted; HTTP transport headers,
// filename extensions and byte sniffing never decide whether to decompress.
export function signedContentEncoding(tags=[]){
 const values=tags.filter(tag=>String(tag.name).toLowerCase()==='content-encoding').map(tag=>String(tag.value).trim().toLowerCase());
 if(!values.length)return null;
 if(values.length!==1)throw new Error('content_encoding_ambiguous');
 if(!['identity','gzip','br'].includes(values[0]))throw new Error('content_encoding_unsupported');
 return values[0];
}
function drain(){
 if(active)return;
 const next=waiting.shift();if(!next)return;
 waitingBytes-=next.bytes;active=true;next();
}
function decompress(body,encoding,{signal,maxOutputBytes,timeoutMs}){
 return new Promise((resolve,reject)=>{
  let worker,timer,done=false,started=false;
  const finish=async(error,value)=>{
   if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
   const queued=waiting.indexOf(start);if(queued!==-1){waiting.splice(queued,1);waitingBytes-=start.bytes;}
   // Do not start another decoder until native work in this one has stopped.
   if(worker){try{await worker.terminate();}catch{}}
   if(started){active=false;drain();}
   if(error)reject(error);else resolve(value);
  };
  const abort=()=>void finish(signal.reason||new Error('content_decode_aborted'));
  const start=()=>{
   if(done){active=false;drain();return;}started=true;
   try{
    signal?.throwIfAborted();
    const input=new Uint8Array(body.length);input.set(body);
    worker=new Worker(new URL('./content-decoding-worker.mjs',import.meta.url),{
     workerData:{body:input,encoding,maxOutputBytes},transferList:[input.buffer],
     // Do not inherit --input-type/--test/debugging flags in Node or Electron.
     execArgv:[],resourceLimits:{maxOldGenerationSizeMb:32,maxYoungGenerationSizeMb:8,stackSizeMb:2}
    });
    worker.once('message',message=>{
     if(message.error){void finish(new Error(message.error));return;}
     if(!(message.body instanceof Uint8Array)||message.body.byteLength>maxOutputBytes){void finish(new Error('content_decoded_size_limit'));return;}
     void finish(null,Buffer.from(message.body.buffer,message.body.byteOffset,message.body.byteLength));
    });
    worker.once('error',()=>void finish(new Error('content_decode_failed')));
    worker.once('exit',()=>{if(!done)void finish(new Error('content_decode_failed'));});
   }catch(error){void finish(error);}
  };
  if(signal?.aborted){reject(signal.reason||new Error('content_decode_aborted'));return;}
  start.bytes=body.length;
  if(active&&(waiting.length>=MAX_WAITING||waitingBytes+body.length>MAX_WAITING_BYTES)){reject(new Error('content_decode_busy'));return;}
  // Queueing counts towards the same deadline, so requests cannot wait forever.
  timer=setTimeout(()=>void finish(new Error('content_decode_timeout')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  waitingBytes+=body.length;waiting.push(start);drain();
 });
}

// Call only after verifyStoredContent / fetchMeshContent / client.content.
// Returns a separate display representation. Never replace item.payload,
// storedBytes, rawItem, signed tags or payloadSha256 with decoded data.
export async function decodeVerifiedPayload(item,{signal,maxOutputBytes=MAX_DECODED_BYTES,timeoutMs=DECODE_TIMEOUT_MS}={}){
 signal?.throwIfAborted();
 if(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>MAX_DECODED_BYTES)throw new Error('invalid_decoded_size_limit');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>DECODE_TIMEOUT_MS)throw new Error('invalid_decode_timeout');
 if(!Buffer.isBuffer(item?.payload)||item.payload.length>MAX_ENCODED_BYTES)throw new Error('invalid_encoded_content_size');
 const contentEncoding=signedContentEncoding(item.tags);
 let body=item.payload;
 if(contentEncoding==='gzip'||contentEncoding==='br')body=await decompress(body,contentEncoding,{signal,maxOutputBytes,timeoutMs});
 else if(body.length>maxOutputBytes)throw new Error('content_decoded_size_limit');
 signal?.throwIfAborted();
 return {body,contentEncoding,bodyDecoded:true,encodedBytes:item.payload.length,decodedBytes:body.length};
}
