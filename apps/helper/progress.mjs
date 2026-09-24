export const STAGES=[['name','Name record'],['peers','Peer discovery'],['location','Content location'],['download','Download'],['verify','Signature check']];
export class NavigationProgress{
 constructor(){this.reset();}
 reset(){this.startedAt=Date.now();this.updatedAt=this.startedAt;this.active=null;this.message='';this.detail=null;this.stages=STAGES.map(([id,label])=>({id,label,status:'pending'}));}
 event(event){
  if(!event.stage)return;
  const row=this.stages.find(x=>x.id===event.stage);if(!row)return;
  this.updatedAt=Date.now();this.active=row.id;this.message=event.message||this.message;this.detail={received:event.received,total:event.total,source:event.source,dataId:event.dataId,scanned:event.scanned,indexed:event.indexed};
  row.status=event.status||'active';row.startedAt??=this.updatedAt;if(row.status==='done')row.finishedAt=this.updatedAt;
 }
 finish(){for(const row of this.stages)if(row.status==='pending')row.status='skipped';else if(row.status==='active'){row.status='done';row.finishedAt=Date.now();}this.updatedAt=Date.now();}
 fail(stage){const now=Date.now();if(this.stages.some(row=>row.id===stage))this.active=stage;for(const row of this.stages){if(row.id===this.active||row.status==='active'){row.status=row.id===this.active?'error':'interrupted';row.finishedAt=now;}}this.updatedAt=now;}
 stop(){for(const row of this.stages)if(row.status==='active'){row.status='interrupted';row.finishedAt=Date.now();}this.active=null;this.message='Loading stopped.';this.detail=null;this.updatedAt=Date.now();}
 snapshot(){return {startedAt:this.startedAt,updatedAt:this.updatedAt,active:this.active,message:this.message,detail:this.detail,stages:this.stages.map(x=>({...x})),completed:this.stages.filter(x=>x.status==='done').length,total:this.stages.length};}
}
