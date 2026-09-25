import {parseArweaveResourceUrl} from '../../src/arweave-resource-url.mjs';
import {createSwarmMeshClient} from '../../src/swarm-client.mjs';
import {fetchMeshContent} from '../../src/content-fetcher.mjs';
import {verifyStoredContent} from '../../src/content-store.mjs';
import {resolveManifestPath} from '../../src/manifest-path.mjs';

// This adapter has no HTTP URL fetch operation. The URL supplies only an item
// ID/path; the ordinary signed-content path selects Mesh/raw Arweave sources.
export async function resolveArweaveResource(raw,{contentStore,localOnly=false,signal,client:providedClient,onMissing,requestWork=work=>work()}={}){
 const parsed=parseArweaveResourceUrl(raw);if(!parsed)throw new Error('unsupported_arweave_resource_url');
 const client=localOnly?null:(providedClient??createSwarmMeshClient());
 const fetchOne=async dataId=>{
  signal?.throwIfAborted();
  if(localOnly){const bytes=contentStore?.get(dataId);if(!bytes)throw new Error('arweave_resource_not_saved');return verifyStoredContent(bytes,dataId);}
  const fetch=()=>requestWork(()=>fetchMeshContent(dataId,{client,contentStore,signal}));
  let result;
  try{result=await fetch();}
  catch(error){
   signal?.throwIfAborted();
   if(!onMissing||!String(error.message).startsWith('content_location_unavailable'))throw error;
   await onMissing({dataId,client,signal});signal?.throwIfAborted();result=await fetch();
  }
  return result.direct;
 };
 const contentType=item=>item.tags?.find(t=>t.name.toLowerCase()==='content-type')?.value||'application/octet-stream';
 try{
  let dataId=parsed.dataId,item=await fetchOne(dataId),type=contentType(item);
  if(!parsed.raw&&type.toLowerCase().includes('application/x.arweave-manifest')){
   const entry=resolveManifestPath(JSON.parse(item.payload.toString('utf8')),parsed.requestedPath);
   dataId=entry.id;item=await fetchOne(dataId);type=contentType(item);
  }else if(parsed.requestedPath)throw new Error('arweave_resource_path_requires_manifest');
  return {body:item.payload,contentType:type,meta:{dataId,rootDataId:parsed.dataId,sha256:item.payloadSha256,contentSignatureVerified:true,source:'arweave-resource-peer-transport',gatewayUsed:false,localOnly}};
 }finally{if(client&&!providedClient)await client.stop();}
}
