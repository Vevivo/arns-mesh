import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';

// Development only. Never run npm install/update over these links.
// This script does not execute package lifecycle scripts or access the network.
if(Number(process.versions.node.split('.')[0])<24)throw new Error('Use Node 24+ for this development-only source-build helper');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.argv[2]&&fs.realpathSync(path.resolve(process.argv[2]));
if(!source||!fs.statSync(source).isDirectory())throw new Error('Pass the installed app node_modules directory');
const modules=path.join(root,'node_modules'),vendor=path.join(root,'scripts','dev-vendor','json-canonicalize-2.0.0');
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const hooksOnly=process.argv[3]==='--hooks-only';
if(process.argv[3]&&!hooksOnly)throw new Error('Unknown setup option');
function inside(p){
 const relative=path.relative(root,path.resolve(p));
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Destination escaped development workspace');
}
function realDirectory(p){
 inside(p);
 if(fs.existsSync(p)){
  if(fs.lstatSync(p).isSymbolicLink()||!fs.statSync(p).isDirectory()||fs.realpathSync(p).toLowerCase()!==path.resolve(p).toLowerCase())throw new Error('Destination must be an ordinary workspace directory: '+p);
 }else fs.mkdirSync(p,{recursive:true});
}
realDirectory(modules);
const versions={};
for(const[name,wanted]of Object.entries(packageJson.dependencies||{})){
 if(name==='json-canonicalize')continue;
 const installed=JSON.parse(fs.readFileSync(path.join(source,name,'package.json'),'utf8'));
 if(installed.version!==wanted)throw new Error('Installed dependency version mismatch: '+name+' '+installed.version+' != '+wanted);
 versions[name]=installed.version;
}
let linked=0,reused=0;
function linkPackage(name){
 const from=path.join(source,name),to=path.join(modules,name);
 if(!fs.existsSync(path.join(from,'package.json')))return;
 realDirectory(path.dirname(to));inside(to);
 try{
  const stat=fs.lstatSync(to);
  if(!stat.isSymbolicLink()||fs.realpathSync(to).toLowerCase()!==fs.realpathSync(from).toLowerCase())throw new Error('Refusing to replace existing dependency: '+name);
  reused++;
 }catch(error){
  if(error.code!=='ENOENT')throw error;
  fs.symlinkSync(from,to,process.platform==='win32'?'junction':'dir');linked++;
 }
}
for(const entry of hooksOnly?[]:fs.readdirSync(source,{withFileTypes:true})){
 if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
 if(entry.name.startsWith('@')){
  realDirectory(path.join(modules,entry.name));
  for(const child of fs.readdirSync(path.join(source,entry.name),{withFileTypes:true}))if(child.isDirectory())linkPackage(entry.name+'/'+child.name);
 }else linkPackage(entry.name);
}
// Build the exact upstream v2.0.0 algorithm locally, because that one dependency
// is absent from the installed application. Original sources stay untouched.
const provenance=JSON.parse(fs.readFileSync(path.join(vendor,'provenance.json'),'utf8'));
assert.equal(provenance.version,packageJson.dependencies['json-canonicalize']);
const upstream=path.join(vendor,'upstream'),out=path.join(modules,'json-canonicalize');
realDirectory(out);
for(const[name,expected]of Object.entries(provenance.files)){
 const sourceText=fs.readFileSync(path.join(upstream,name),'utf8').replace(/\r\n/g,'\n');
 assert.equal(crypto.createHash('sha256').update(sourceText).digest('hex'),expected,'Upstream source digest: '+name);
 if(name==='LICENSE.md'){fs.writeFileSync(path.join(out,name),sourceText);continue;}
 // TypeScript would erase this interface-only import. Node's syntax stripper
 // requires that erasure explicitly; runtime _serialize is retained verbatim.
 const prepared=sourceText.replace('{ ISerializeOptions, _serialize }','{ _serialize }');
 const js=stripTypeScriptTypes(prepared,{mode:'strip'}).replace(/from (['"])\.\/([^'"]+)\1/g,(all,quote,relative)=>'from '+quote+'./'+relative+'.js'+quote);
 fs.writeFileSync(path.join(out,name.replace(/\.ts$/,'.js')),js);
}
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({name:'json-canonicalize',version:'2.0.0',type:'module',exports:'./index.js',license:'MIT',_meshDevSourceRebuild:provenance.upstream},null,2)+'\n');
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
const {canonicalize,canonicalizeEx}=await import(pathToFileURL(path.join(out,'index.js')).href);
assert.equal(canonicalize({z:1,a:{d:2,b:3}}),'{"a":{"b":3,"d":2},"z":1}');
assert.equal(canonicalize({a:undefined,z:[undefined,1]}),'{"z":[null,1]}');
assert.equal(canonicalizeEx({z:1,a:2},{exclude:['z']}),'{"a":2}');
const circular={};circular.self=circular;assert.throws(()=>canonicalize(circular),/Circular reference/);
versions['json-canonicalize']='2.0.0 (official-source build; development only)';
console.log(JSON.stringify({mode:hooksOnly?'read-only-resolution-hook':'package-links',linked,reused,versions,source,workspace:root},null,2));
