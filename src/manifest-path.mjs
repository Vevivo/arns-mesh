// Path-manifest semantics, checked against AR.IO Node e3482b9048ad8157fcb3dbbf5e760c1b3053198d.
// This module selects IDs only; callers must verify both manifest and file bytes.
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{43}$/.test(id);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const trim=path=>path.replace(/\/+$/g,'');
function validate(manifest){
 if(!object(manifest)||manifest.manifest!=='arweave/paths'||!['0.1.0','0.2.0'].includes(manifest.version)||!object(manifest.paths))throw new Error('unsupported_manifest');
 return manifest.version==='0.2.0';
}
function selected(id,path,kind){
 if(!validId(id))throw new Error('invalid_manifest_target');
 return {id,path,kind};
}
export function resolveManifestPath(manifest,requestedPath=''){
 const v2=validate(manifest);
 if(typeof requestedPath!=='string')throw new Error('invalid_manifest_path');
 const wanted=trim(requestedPath);
 if(wanted===''){
  if(v2&&manifest.index?.id!==undefined)return selected(manifest.index.id,'','index');
  const indexPath=manifest.index?.path;
  if(typeof indexPath==='string'&&Object.hasOwn(manifest.paths,indexPath))return selected(manifest.paths[indexPath]?.id,indexPath,'index');
 }else{
  // Match the gateway's trailing-slash normalization. JSON member order breaks
  // ties when two manifest keys normalize to the same path.
  for(const [key,value] of Object.entries(manifest.paths))if(trim(key)===wanted)return selected(value?.id,key,'path');
 }
 if(v2&&manifest.fallback?.id!==undefined)return selected(manifest.fallback.id,wanted,'fallback');
 throw new Error('manifest_path_not_found:'+wanted);
}
export function manifestTargetIds(manifest){
 const v2=validate(manifest);
 const ids=[...Object.values(manifest.paths).map(entry=>entry?.id)];
 if(v2)for(const entry of [manifest.index,manifest.fallback])if(entry?.id!==undefined)ids.push(entry.id);
 if(ids.some(id=>!validId(id)))throw new Error('invalid_manifest_target');
 return [...new Set(ids)];
}
