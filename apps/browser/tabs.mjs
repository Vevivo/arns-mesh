import {randomUUID} from 'node:crypto';
import {normalizeAddress} from './browser-state.mjs';
import {NavigationProgress} from './progress.mjs';
import {emptyResources} from './page-health.mjs';

// Each tab owns its cancellation epoch. Switching tabs never cancels a page.
export class Tabs {
  constructor({limit=12}={}) { this.limit=limit; this.rows=new Map(); this.activeId=null; }
  get active() { return this.rows.get(this.activeId); }
  create(raw='') {
    if(this.rows.size>=this.limit)throw new Error(`Close a tab first. The limit is ${this.limit}.`);
    const url=raw?normalizeAddress(raw):'';
    const tab={id:randomUUID(),url,title:'',epoch:0,controller:new AbortController(),progress:new NavigationProgress(),phase:'ready',message:'Enter an ArNS address.',meta:null,resources:emptyResources(),issueKeys:new Set(),view:null};
    this.rows.set(tab.id,tab); this.activeId=tab.id; return tab;
  }
  get(id) {const tab=this.rows.get(id);if(!tab)throw new Error('Tab is no longer open.');return tab;}
  activate(id) {this.activeId=this.get(id).id;return this.active;}
  begin(id,raw='') {
    const url=raw?normalizeAddress(raw):'',tab=this.get(id);
    tab.controller.abort(new Error('navigation_changed'));tab.controller=new AbortController();tab.epoch++;
    Object.assign(tab,{url,title:'',meta:null,phase:url?'resolving':'ready',message:url?'Resolving name and locating content…':'Enter an ArNS address.',resources:emptyResources(),issueKeys:new Set()});
    tab.progress.reset();return {tab,epoch:tab.epoch,signal:tab.controller.signal};
  }
  stop(id,reason='Loading stopped.') {
    const tab=this.get(id);tab.controller.abort(new Error('navigation_stopped'));tab.controller=new AbortController();tab.epoch++;
    tab.phase='stopped';tab.message=reason;tab.resources.pending=0;tab.progress.stop();
  }
  close(id) {
    const tab=this.get(id),ids=[...this.rows.keys()],index=ids.indexOf(id);
    tab.controller.abort(new Error('tab_closed'));tab.epoch++;this.rows.delete(id);
    if(this.activeId===id)this.activeId=ids[index+1]||ids[index-1]||null;
    return tab;
  }
  isCurrent(tab,epoch) {return this.rows.get(tab.id)===tab&&tab.epoch===epoch;}
  snapshot(){return [...this.rows.values()].map(t=>({id:t.id,url:t.url,title:t.title||t.url||'New tab',active:t.id===this.activeId,loading:t.view?.webContents.isLoading()||t.phase==='resolving',error:t.phase==='error'}));}
}
