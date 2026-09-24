// Bounds work, not total process RSS: Chromium, page scripts and verification
// have their own allocations. A cancelled running task keeps its slot until it
// actually exits, so cancellation cannot create extra concurrent downloads.
export class WorkBudget {
 constructor({active=2,pending=128}={}){this.limit=active;this.pendingLimit=pending;this.active=0;this.queue=[];}
 status(){return {active:this.active,queued:this.queue.length,maxActive:this.limit,maxQueued:this.pendingLimit};}
 run(work,{signal}={}){
  signal?.throwIfAborted();
  if(this.active>=this.limit&&this.queue.length>=this.pendingLimit)return Promise.reject(new Error('resource_queue_full'));
  return new Promise((resolve,reject)=>{
   const entry={work,resolve,reject,signal,started:false};
   entry.cancel=()=>{if(entry.started)return;const i=this.queue.indexOf(entry);if(i>=0)this.queue.splice(i,1);signal?.removeEventListener('abort',entry.cancel);reject(signal.reason||new Error('query_cancelled'));};
   signal?.addEventListener('abort',entry.cancel,{once:true});
   this.queue.push(entry);if(signal?.aborted)entry.cancel();this.drain();
  });
 }
 drain(){while(this.active<this.limit&&this.queue.length){
  const entry=this.queue.shift();entry.started=true;entry.signal?.removeEventListener('abort',entry.cancel);this.active++;
  Promise.resolve().then(()=>{entry.signal?.throwIfAborted();return entry.work(entry.signal);}).then(entry.resolve,entry.reject).finally(()=>{this.active--;this.drain();});
 }}
}

// Map-compatible raw chunk cache, with a byte bound as well as an entry bound.
export class ChunkCache extends Map {
 constructor(maxBytes=8*1024*1024){super();this.maxBytes=maxBytes;this.bytes=0;}
 set(key,value){this.delete(key);const size=value.body?.byteLength||0;if(size>this.maxBytes)return this;super.set(key,value);this.bytes+=size;while(this.bytes>this.maxBytes||this.size>128)this.delete(this.keys().next().value);return this;}
 delete(key){const value=this.get(key);if(!super.delete(key))return false;this.bytes-=value?.body?.byteLength||0;return true;}
 clear(){super.clear();this.bytes=0;}
}

let transfers=null;
export function configureTransferBudget(role){transfers=['client','desktop'].includes(role)?new WorkBudget({active:2,pending:128}):null;}
export function transferBudgetStatus(){return transfers?.status()||{mode:'index-node'};}
export function withTransferBudget(work,signal){return transfers?transfers.run(work,{signal}):work(signal);}
