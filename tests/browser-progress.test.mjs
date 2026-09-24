import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {NavigationProgress} from '../apps/browser/progress.mjs';
import {attachContextMenu} from '../apps/browser/context-menu.mjs';

test('verified bytes do not claim a rendered page, including cache hits',()=>{
 const p=new NavigationProgress();p.event({stage:'name',status:'done'});
 p.event({stage:'download',received:12,total:100});
 p.event({stage:'verify',status:'done'});p.finish();
 let s=p.snapshot();assert.equal(s.active,'open');
 assert.equal(s.stages.find(x=>x.id==='open').status,'active');
 assert.equal(s.stages.find(x=>x.id==='location').status,'skipped');
 p.opened();s=p.snapshot();assert.equal(s.active,null);
 assert.equal(s.stages.find(x=>x.id==='open').status,'done');
 p.reset();p.finish();assert.equal(p.snapshot().stages.find(x=>x.id==='name').status,'skipped');
});
test('render failure and stop cannot be turned into a successful opening',()=>{
 for(const action of ['fail','stop']){
  const p=new NavigationProgress();p.finish();p[action]('open');p.opened();
  assert.equal(p.snapshot().stages.find(x=>x.id==='open').status,action==='fail'?'error':'interrupted');
 }
});
test('native edit menu operates only on the requesting contents without exposing clipboard APIs',()=>{
 const wc=new EventEmitter();let pasted=0,template,popup;
 wc.isDestroyed=()=>false;wc.paste=()=>pasted++;
 const Menu={buildFromTemplate(rows){template=rows;return {popup(options){popup=options;}};}};
 const window={},frame={};attachContextMenu(wc,Menu,()=>window);
 wc.emit('context-menu',{}, {isEditable:true,editFlags:{canPaste:true},frame});
 assert.equal(popup.window,window);assert.equal(popup.frame,frame);
 assert.equal(template.find(x=>x.label==='Cut').enabled,false);
 const paste=template.find(x=>x.label==='Paste');assert.equal(paste.enabled,true);paste.click();assert.equal(pasted,1);
 wc.isDestroyed=()=>true;paste.click();assert.equal(pasted,1);
 template=null;wc.emit('context-menu',{}, {isEditable:false,selectionText:''});assert.equal(template,null);
 wc.emit('context-menu',{}, {selectionText:'Selected text',editFlags:{canCopy:true}});assert.deepEqual(template.map(x=>x.label),['Copy']);
});
