// Schedule catalogue observations separately from page navigation. A failed
// observation keeps its cached catalogue and retries sooner than a success.
export class SearchRefresh {
 constructor({sync,enabled=()=>true,onChange=()=>{},onError=()=>{},now=Date.now,refreshMs=15*60000,retryMs=60000,timeoutMs=45000}) {
  Object.assign(this,{sync,enabled,onChange,onError,now,refreshMs,retryMs,timeoutMs});
  this.nextAt=0;this.generation=0;this.running=null;this.controller=null;this.closed=false;
 }
 async notify(){try{await this.onChange();}catch{/* A closed renderer must not stop catalogue updates. */}}
 request({force=false}={}) {
  if(this.closed||!this.enabled())return Promise.resolve({skipped:true});
  if(this.running){
   const generation=this.activeGeneration,work=this.running;
   return work.then(result=>generation!==this.generation?this.request({force}):result);
  }
  if(!force&&this.now()<this.nextAt)return Promise.resolve({skipped:true});
  const generation=this.activeGeneration=this.generation,controller=this.controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(new Error('search_refresh_timeout')),this.timeoutMs);timeout.unref?.();
  this.running=Promise.resolve().then(async()=>{
   if(generation!==this.generation||this.closed||!this.enabled())return {skipped:true};
   let result;
   try{
    const observation=Promise.resolve(this.sync(controller.signal)).then(result=>({result}),error=>({error}));
    await this.notify();const outcome=await observation;if(outcome.error)throw outcome.error;result=outcome.result;
   }
   catch(error){result={accepted:0,error:String(error.message||error)};if(generation===this.generation&&!this.closed&&this.enabled())this.onError(result.error);}
   if(generation===this.generation&&!this.closed&&this.enabled()){
    this.nextAt=this.now()+(result?.accepted>0?this.refreshMs:this.retryMs);
    await this.notify();
   }
   return result;
  }).finally(()=>{clearTimeout(timeout);this.running=null;if(this.controller===controller)this.controller=null;});
  return this.running;
 }
 reset(){this.generation++;this.nextAt=0;this.controller?.abort(new Error('search_profile_changed'));}
 stop(){this.closed=true;this.reset();}
}
