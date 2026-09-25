// Renderer diagnostics describe missing functionality, not cryptographic proof.
// Content remains sandboxed, without a privileged preload or exposed IPC bridge.
export function emptyResources(){return {pending:0,verified:0,failed:0,blocked:0,scriptErrors:0,diagnostics:[]};}
export function recordPageIssue(tab,{kind,url='',message='',source}){
  const resources=tab.resources,key=[kind,url||message,source].join('|');
  tab.issueKeys??=new Set();
  if(tab.issueKeys.has(key))return false;
  if(tab.issueKeys.size>=64){resources.diagnosticsTruncated=true;return false;}
  tab.issueKeys.add(key);
  if(kind==='blocked')resources.blocked++;
  else if(kind==='script')resources.scriptErrors++;
  resources.diagnostics.push({kind,url:String(url).slice(0,2048),message:String(message).slice(0,500),source});
  return true;
}
export function consoleIssue(details,legacyLevel,legacyMessage){
  const message=typeof details?.message==='string'?details.message:String(legacyMessage||'');
  const level=details?.level??legacyLevel;
  if(/Content Security Policy/i.test(message)&&/blocked|refused/i.test(message)){
    const url=message.match(/['"]((?:https?|wss?):\/\/[^'"\s]+)['"]/)?.[1]||'';
    return {kind:'blocked',url,message,source:'renderer-policy-report'};
  }
  // Do not count failed network requests twice as JavaScript failures.
  if((level==='error'||level===3)&&/\b(?:Uncaught|ReferenceError|TypeError|SyntaxError|NotSupportedError)\b/.test(message))return {kind:'script',message,source:'renderer-console'};
  return null;
}
export function updatePageHealth(tab){
  if(!['loaded','partial'].includes(tab.phase))return;
  const r=tab.resources;
  if(r.failed||r.blocked||r.scriptErrors){
    tab.phase='partial';
    tab.message='Main document verified · Some page resources or features are unavailable. Open Page information.';
  }else{
    tab.phase='loaded';
    tab.message=tab.meta?.recovery?'Saved name observation · '+tab.meta.recovery.observedAt+' · Current mapping not checked.':'Page opened · Content signature verified · Name mapping relies on RPC observations.';
  }
}
