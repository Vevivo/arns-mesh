import crypto from 'node:crypto';

export function swarmTopic(kind,value){
  return crypto.createHash('sha256')
    .update('arns-mesh:'+String(kind).toLowerCase()+':'+String(value).toLowerCase())
    .digest();
}
export function validArName(name){
  return typeof name==='string' && name.length>0 && name.length<=255 && /^[a-z0-9_-]+$/i.test(name);
}
export function validDataId(id){
  return typeof id==='string' && /^[A-Za-z0-9_-]{43}$/.test(id);
}
export function contentTopic(dataId){
  if(!validDataId(dataId))throw new Error('invalid_data_id');
  return crypto.createHash('sha256').update('arns-mesh:content-v1:'+dataId).digest();
}
export const locationIndexTopic=()=>swarmTopic('index','ans104-v1');
