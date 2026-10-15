import path from 'node:path';
function error(code){const e=new Error(code);e.code=code;return e;}
export class MemoryFs{
 constructor(base){this.entries=new Map();this.handles=new Map();this.next=1;this.events=[];this.fault=null;const p=path.resolve(base),r=path.parse(p).root;this.entries.set(r,{type:'dir'});let current=r;for(const part of p.slice(r.length).split(path.sep).filter(Boolean)){current=path.join(current,part);this.entries.set(current,{type:'dir'});}}
 norm(p){return path.resolve(String(p));}
 event(op,p,extra={}){const e={op,path:p,...extra};this.events.push(e);if(this.fault&&this.fault(e)){this.fault=null;throw error('EIO');}}
 lstatSync(p){p=this.norm(p);const e=this.entries.get(p);if(!e)throw error('ENOENT');return{size:e.type==='file'?Buffer.byteLength(e.data):0,isFile:()=>e.type==='file',isDirectory:()=>e.type==='dir',isSymbolicLink:()=>e.type==='symlink'};}
 mkdirSync(p){p=this.norm(p);if(this.entries.has(p))throw error('EEXIST');if(this.entries.get(path.dirname(p))?.type!=='dir')throw error('ENOENT');this.event('mkdir',p);this.entries.set(p,{type:'dir'});}
 openSync(p,flags){p=this.norm(p);if(flags==='wx'){if(this.entries.has(p))throw error('EEXIST');if(this.entries.get(path.dirname(p))?.type!=='dir')throw error('ENOENT');this.event('open-new',p);this.entries.set(p,{type:'file',data:''});}else if(!this.entries.has(p))throw error('ENOENT');const fd=this.next++;this.handles.set(fd,p);return fd;}
 writeFileSync(fd,data){const p=typeof fd==='number'?this.handles.get(fd):this.norm(fd);if(!p||this.entries.get(p)?.type!=='file')throw error('EBADF');this.event('write',p,{bytes:Buffer.byteLength(data)});this.entries.set(p,{type:'file',data:String(data)});}
 fsyncSync(fd){const p=this.handles.get(fd);if(!p)throw error('EBADF');this.event(this.entries.get(p)?.type==='dir'?'syncdir':'syncfile',p);}
 closeSync(fd){if(!this.handles.delete(fd))throw error('EBADF');}
 renameSync(from,to){from=this.norm(from);to=this.norm(to);if(!this.entries.has(from))throw error('ENOENT');this.event('rename',to,{from});this.entries.set(to,this.entries.get(from));this.entries.delete(from);}
 readFileSync(p){p=this.norm(p);const e=this.entries.get(p);if(e?.type!=='file')throw error(e?'EISDIR':'ENOENT');this.events.push({op:'read',path:p});return e.data;}
 unlinkSync(p){p=this.norm(p);if(!this.entries.has(p))throw error('ENOENT');this.event('unlink',p);this.entries.delete(p);}
 rmdirSync(p){p=this.norm(p);if(!this.entries.has(p))throw error('ENOENT');if([...this.entries.keys()].some(x=>x!==p&&x.startsWith(p+path.sep)))throw error('ENOTEMPTY');this.event('rmdir',p);this.entries.delete(p);}
 readdirSync(){throw new Error('Unexpected catalogue scan');}
}
