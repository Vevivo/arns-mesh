import {parentPort,workerData} from 'node:worker_threads';
import {Readable,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip,createBrotliDecompress} from 'node:zlib';

// Small input/output chunks yield between native decoder calls. A parent
// timeout can terminate this worker without waiting for one synchronous call
// to consume the entire hostile stream. Neither compressed nor decoded bytes
// leave this worker until the complete stream has ended without an error.
try{
 const {body,encoding,maxOutputBytes}=workerData,chunkSize=64*1024;
 const decoder=(encoding==='gzip'?createGunzip:createBrotliDecompress)({
  chunkSize,writableHighWaterMark:chunkSize,readableHighWaterMark:chunkSize
 });
 const chunks=[];let length=0;
 const sink=new Writable({highWaterMark:chunkSize,write(chunk,_encoding,callback){
  if(chunk.length>maxOutputBytes-length){callback(new Error('content_decoded_size_limit'));return;}
  chunks.push(chunk);length+=chunk.length;callback();
 }});
 const source=Readable.from((function*(){for(let at=0;at<body.length;at+=chunkSize)yield body.subarray(at,at+chunkSize);})(),{objectMode:false,highWaterMark:chunkSize});
 await pipeline(source,decoder,sink);
 // In particular, Brotli must not silently ignore bytes after its end marker.
 if(decoder.bytesWritten!==body.length)throw new Error('content_encoding_corrupt');
 // A standalone backing store avoids transferring unrelated pooled bytes.
 const view=new Uint8Array(length);let at=0;
 for(const chunk of chunks){view.set(chunk,at);at+=chunk.length;}
 parentPort.postMessage({body:view},[view.buffer]);
}catch(error){
 parentPort.postMessage({error:error.message==='content_decoded_size_limit'?'content_decoded_size_limit':'content_encoding_corrupt'});
}
