// Development-only fallback resolver. It never writes to installed packages.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';

const source=process.env.ARNS_MESH_TEST_DEPENDENCIES;
if(!source)throw new Error('Set ARNS_MESH_TEST_DEPENDENCIES to the installed node_modules directory');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const installed=fs.realpathSync(path.resolve(source));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
for(const[name,wanted]of Object.entries(manifest.dependencies||{})){
 if(name==='json-canonicalize')continue;
 const actual=JSON.parse(fs.readFileSync(path.join(installed,name,'package.json'),'utf8'));
 if(actual.version!==wanted)throw new Error('Installed test dependency version mismatch: '+name);
}
const parentURL=pathToFileURL(path.join(path.dirname(installed),'__mesh_read_only_test_parent__.mjs')).href;
function bare(specifier){return typeof specifier==='string'&&!specifier.startsWith('.')&&!specifier.startsWith('/')&&!specifier.startsWith('#')&&!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier);}
registerHooks({resolve(specifier,context,nextResolve){
 try{return nextResolve(specifier,context);}catch(error){
  if(error.code!=='ERR_MODULE_NOT_FOUND'&&error.code!=='MODULE_NOT_FOUND')throw error;
  if(!bare(specifier))throw error;
  // Delegate Node's real export/condition logic; do not fabricate package APIs.
  return nextResolve(specifier,{...context,parentURL});
 }
}});
