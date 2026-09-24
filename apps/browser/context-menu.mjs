// Native editing commands stay in Electron; page scripts never get clipboard access.
export function attachContextMenu(contents,Menu,getWindow){
 contents.on('context-menu',(_event,params)=>{
  const flags=params.editFlags||{},items=[];
  const action=(label,method,enabled)=>({label,enabled:Boolean(enabled),click:()=>{if(!contents.isDestroyed())contents[method]();}});
  if(params.isEditable){
   items.push(action('Undo','undo',flags.canUndo),action('Redo','redo',flags.canRedo),{type:'separator'},
    action('Cut','cut',flags.canCut),action('Copy','copy',flags.canCopy),action('Paste','paste',flags.canPaste),
    {type:'separator'},action('Select all','selectAll',flags.canSelectAll));
  }else if(params.selectionText){items.push(action('Copy','copy',flags.canCopy));}
  if(items.length)Menu.buildFromTemplate(items).popup({window:getWindow(),frame:params.frame});
 });
}
