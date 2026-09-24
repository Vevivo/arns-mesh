import fs from 'node:fs';
import path from 'node:path';

export function normalizeAddress(raw) {
  const value=String(raw||'').trim();
  if(!value||value.length>4096||/[\s\u0000-\u001f]/u.test(value))throw new Error('Enter an ArNS name or an ar:// address.');
  const url=new URL(value.includes('://')?value:'ar://'+value);
  if(url.protocol!=='ar:'||!/^[a-z0-9_-]{1,255}$/i.test(url.hostname)||url.username||url.password||url.port)throw new Error('Enter an ArNS name or an ar:// address.');
  url.hostname=url.hostname.toLowerCase();if(!url.pathname)url.pathname='/';
  return url.href;
}
const cleanRow=row=>{
  try{return {url:normalizeAddress(row.url),title:String(row.title||row.url).slice(0,300),at:Number(row.at)||Date.now()};}catch{return null;}
};
export class BrowserState {
  constructor(file){
    this.file=file;this.history=[];this.bookmarks=[];
    try{const data=JSON.parse(fs.readFileSync(file));for(const key of ['history','bookmarks']){
      const seen=new Set();this[key]=(Array.isArray(data[key])?data[key]:[]).map(cleanRow).filter(row=>row&&!seen.has(row.url)&&seen.add(row.url)).slice(0,key==='history'?200:500);
    }}catch{}
  }
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.snapshot(),null,2),{mode:0o600});fs.renameSync(temp,this.file);}
  snapshot(){return {history:this.history.map(row=>({...row})),bookmarks:this.bookmarks.map(row=>({...row}))};}
  visit(url,title){const row=cleanRow({url,title,at:Date.now()});if(!row)return;this.history=[row,...this.history.filter(item=>item.url!==row.url)].slice(0,200);this.save();}
  has(url){return this.bookmarks.some(row=>row.url===url);}
  toggle(url,title){url=normalizeAddress(url);if(this.has(url))this.bookmarks=this.bookmarks.filter(row=>row.url!==url);else{if(this.bookmarks.length>=500)throw new Error('Bookmark limit reached. Remove a bookmark first.');this.bookmarks.unshift(cleanRow({url,title,at:Date.now()}));}this.save();return this.has(url);}
  remove(url){this.bookmarks=this.bookmarks.filter(row=>row.url!==url);this.save();}
  clearHistory(){this.history=[];this.save();}
}
