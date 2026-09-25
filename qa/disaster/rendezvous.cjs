// Test orchestration only. GitHub is not used by the tested browser/peers.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(process.env.QA_OUTPUT,'rendezvous');fs.mkdirSync(root,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 for(const id of ['a','b']){
  const dir=path.join(root,id);let obtained=false;
  for(let n=0;n<45;n++){
   const r=cp.spawnSync('gh',['run','download',process.env.GITHUB_RUN_ID,'--repo',process.env.GITHUB_REPOSITORY,'--name','disaster-replica-'+id,'--dir',dir],{encoding:'utf8',timeout:15000});
   if(r.status===0){obtained=true;break;}
   await delay(5000);
  }
  if(!obtained)throw new Error('Separate replica '+id+' did not publish its readiness artifact.');
 }
 console.log('Two separate runner peer addresses obtained before blackout.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
