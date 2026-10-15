import {EventEmitter} from 'node:events';
import net from 'node:net';
export {validArName,validDataId,swarmTopic,contentTopic,locationIndexTopic} from '../../src/swarm-common.mjs';
let protectedContext=null,serverHandler=null;
export const effects=[];
export function setProtectedContext(value){protectedContext=value;}
export function getProtectedNameContext(){return protectedContext;}
export function resetEffects(){effects.length=0;serverHandler=null;}
export const getSharedIndex=()=>null,sharedLocation=x=>x,getHistoricalIndex=()=>null,loadDirectPeers=()=>[],peerDirectory=()=>null;
export const signRecord=()=>{throw new Error('unexpected outer-signature stub');},peerIdFromPublicKey=()=>{throw new Error('unexpected peer identity construction');};
export class LocationIndex{constructor(){throw new Error('unexpected peer constructor');}}
export class VerifiedContentStore{constructor(){throw new Error('unexpected content-store constructor');}}
export const verifyPortableChainProof=()=>{throw new Error('unexpected legacy chain proof');};
export const verifySavedAntUpdateProof=()=>{throw new Error('unexpected legacy ANT proof');};
export const verifyJournal=()=>{throw new Error('unexpected legacy journal');};
export const loadHyperBootstrap=()=>{throw new Error('unexpected swarm startup');};
export const fetchMeshContent=()=>{throw new Error('unexpected content network');};
export const createSwarmMeshClient=()=>{throw new Error('unexpected peer collection');};
export const requestIpJson=()=>{throw new Error('unexpected network request');};
export const accountBudgetBytes=()=>{};
export const recordNetwork=()=>{throw new Error('aborted request attempted network audit');};
export const validateIpRequest=({host})=>{if(!net.isIP(host))throw new Error('invalid_ip');};
export const approvedRpcTransport=fn=>fn();
export const blockSummaryReader=()=>{throw new Error('unexpected summary');};
const adapters={
 writeFileSync(file,body){effects.push({type:'cache-write',file,body});},
 renameSync(from,to){effects.push({type:'cache-rename',from,to});},
 createServer(handler){
  serverHandler=handler;
  return{once(){},listen(port,host,ready){ready();},address(){return{address:'127.0.0.1',port:49740};},closeAllConnections(){},close(done){done();}};
 },
 request(){throw new Error('unexpected actual HTTP request');}
};
export default adapters;
export function dispatchDirect(request){
 if(!serverHandler)throw new Error('test server not initialized');
 return new Promise((resolve,reject)=>{
  const req=new EventEmitter(),res=new EventEmitter();let status;
  Object.assign(req,{headers:{host:'127.0.0.1:49740'},method:'POST',url:'/mesh/v1/query',socket:{remoteAddress:'127.0.0.1'},destroy(){reject(new Error('request destroyed'));}});
  res.writeHead=code=>{status=code;};
  res.end=body=>{res.emit('close');try{resolve({status,body:body?JSON.parse(body):null});}catch(error){reject(error);}};
  serverHandler(req,res);req.emit('data',Buffer.from(JSON.stringify(request)));req.emit('end');
 });
}
