// A consumer owns its cancellation, not the shared request. The last departing
// consumer cancels the request and removes it before another navigation joins.
export function shareQuery(jobs,key,run,{signal}={}){
 signal?.throwIfAborted();
 let job=jobs.get(key);
 if(!job){
  job={controller:new AbortController(),consumers:new Set(),settled:false};
  jobs.set(key,job);
  job.promise=Promise.resolve().then(()=>{job.controller.signal.throwIfAborted();return run(job.controller.signal);}).finally(()=>{
   job.settled=true;if(jobs.get(key)===job)jobs.delete(key);
  });
 }
 return new Promise((resolve,reject)=>{
  const consumer={};job.consumers.add(consumer);let finished=false;
  const cleanup=()=>{
   signal?.removeEventListener('abort',cancel);job.consumers.delete(consumer);
   if(!job.settled&&!job.consumers.size){
    if(jobs.get(key)===job)jobs.delete(key);
    job.controller.abort(signal?.reason||new Error('query_no_consumers'));
   }
  };
  const cancel=()=>{if(finished)return;finished=true;cleanup();reject(signal.reason||new Error('query_cancelled'));};
  signal?.addEventListener('abort',cancel,{once:true});
  job.promise.then(value=>{if(finished)return;finished=true;cleanup();resolve(value);},error=>{if(finished)return;finished=true;cleanup();reject(error);});
  if(signal?.aborted)cancel();
 });
}

// Each task must return only after its candidate passes the caller's checks.
export async function firstVerified(tasks,{signal,concurrency=tasks.length}={}){
 signal?.throwIfAborted();const controller=new AbortController();
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 let rejectAbort;const stopped=new Promise((_,reject)=>{rejectAbort=()=>reject(combined.reason||new Error('content_cancelled'));combined.addEventListener('abort',rejectAbort,{once:true});});
 let next=0;
 const worker=async()=>{
  const errors=[];
  while(next<tasks.length){combined.throwIfAborted();const task=tasks[next++];try{return await task(combined);}catch(error){errors.push(error);}}
  throw new AggregateError(errors,'candidates_exhausted');
 };
 try{return await Promise.race([Promise.any(Array.from({length:Math.min(tasks.length,Math.max(1,concurrency))},worker)),stopped]);}
 finally{combined.removeEventListener('abort',rejectAbort);controller.abort(new Error('content_race_finished'));}
}
