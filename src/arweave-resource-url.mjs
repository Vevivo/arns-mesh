// Recognize an immutable Arweave identifier in a familiar gateway URL without
// resolving or contacting that host. Other websites and gateway APIs are not
// resources, even when they share the same hostname.
export const arweaveResourceOrigins=['https://arweave.net','https://*.arweave.net'];
export function parseArweaveResourceUrl(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(u.hostname!=='arweave.net'&&!/^[a-z2-7]{52}\.arweave\.net$/.test(u.hostname))return null;
  const parts=u.pathname.split('/').slice(1),rawRoute=parts[0]==='raw';
  if(rawRoute)parts.shift();
  const dataId=parts.shift();if(!/^[A-Za-z0-9_-]{43}$/.test(dataId||''))return null;
  const requestedPath=decodeURIComponent(parts.join('/'));
  if(requestedPath.includes('\\')||requestedPath.includes('\0')||requestedPath.split('/').some(p=>p==='.'||p==='..'))return null;
  if(rawRoute&&requestedPath)return null;
  return {dataId,requestedPath,raw:rawRoute,key:dataId+'|'+Number(rawRoute)+'|'+requestedPath};
 }catch{return null;}
}
