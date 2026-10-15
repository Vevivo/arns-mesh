// A bounded background courier refresh. Demand resolution still obtains a fresh
// quorum; this sweep does not claim complete or instantaneous registry coverage.
export class NameCertificateWorker{
 constructor({getContext,names,batch=2,intervalMs=5000,timeoutMs=15000,onError=()=>{}}){
  if(typeof getContext!=='function'||typeof names!=='function'||!Number.isSafeInteger(batch)||batch<1||batch>16||!Number.isSafeInteger(intervalMs)||intervalMs<1000||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Error('name_certificate_worker_options_invalid');
  Object.assign(this,{getContext,names,batch,intervalMs,timeoutMs,onError});this.cursor=0;this.stopped=true;this.running=null;this.controller=null;
 }
 async pass(){
  if(this.running)return this.running;
  this.running=(async()=>{
   const context=this.getContext();if(!context)return;
   context.assertCurrent();const names=[...new Set(this.names())].filter(name=>typeof name==='string'&&/^[a-z0-9_-]{1,255}$/.test(name));
   if(!names.length)return;const controller=this.controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(new Error('name_certificate_refresh_timeout')),this.timeoutMs);
   try{for(let i=0;i<Math.min(this.batch,names.length);i++){
    controller.signal.throwIfAborted();context.assertCurrent();
    const name=names[this.cursor%names.length];this.cursor=(this.cursor+1)%names.length;
    try{await context.service.refresh(name,{signal:controller.signal});context.assertCurrent();}
    catch(error){controller.signal.throwIfAborted();this.onError(error,name);}
   }}finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
  })().finally(()=>{this.running=null;});return this.running;
 }
 start(){if(!this.stopped)return;this.stopped=false;
  const loop=async()=>{if(this.stopped)return;try{await this.pass();}catch(error){this.onError(error,null);}if(!this.stopped){this.timer=setTimeout(loop,this.intervalMs);this.timer.unref?.();}};void loop();
 }
 stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort(new Error('name_certificate_worker_stopped'));}
}
