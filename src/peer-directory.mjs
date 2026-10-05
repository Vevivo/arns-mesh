import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {peerIdFromPublicKey,verifyRecord} from './common.mjs';
import {publicNetworkHost} from './network-invitation.mjs';

export const PEER_TTL=24*3600000,MAX_LEARNED_PEERS=32;
const directories=new Map();
export function bindPeerDirectory(file,directory){directories.set(path.resolve(file),directory);return ()=>{if(directories.get(path.resolve(file))===directory)directories.delete(path.resolve(file));};}
export function peerDirectory(file=process.env.ARNS_IP_PEERS){return file?directories.get(path.resolve(file)):null;}
export function normalizePeerHost(host){if(host?.startsWith('::ffff:')&&net.isIP(host.slice(7))===4)return host.slice(7);return net.isIP(host)===6?new URL('http://['+host+']/').hostname.slice(1,-1):host;}
export const peerAddress=p=>(net.isIP(p.host)===6?'['+p.host+']':p.host)+':'+p.port;
export function discoveryAddress(value,{local=false}={}){
 if(typeof value!=='string'||value.length>100)throw new Error('invalid_discovery_address');
 const split=value.lastIndexOf(':'),raw=value.slice(0,split).replace(/^\[|\]$/g,''),host=normalizePeerHost(raw),port=Number(value.slice(split+1));
 if(!net.isIP(raw)||!/^\d+$/.test(value.slice(split+1))||!Number.isInteger(port)||port<1||port>65535)throw new Error('invalid_discovery_address');
 // A local invitation is an explicit test/LAN trust choice. Automatic local
 // discovery currently stays on loopback; it never scans private networks.
 if(!(publicNetworkHost(host)||(local&&(host==='::1'||host.startsWith('127.')))))throw new Error('private_discovery_address');
 return {host,port};
}
export function verifyPeerEnvelope(envelope){
 if(!envelope?.ok||typeof envelope.recordJson!=='string'||Buffer.byteLength(envelope.recordJson)>2048||typeof envelope.witnessPublicKeyPem!=='string'||envelope.witnessPublicKeyPem.length>160||typeof envelope.signature!=='string'||envelope.signature.length!==86)throw new Error('invalid_peer_envelope');
 if(crypto.createPublicKey(envelope.witnessPublicKeyPem).asymmetricKeyType!=='ed25519'||peerIdFromPublicKey(envelope.witnessPublicKeyPem)!==envelope.witnessPeerId||!verifyRecord(envelope.recordJson,envelope.signature,envelope.witnessPublicKeyPem))throw new Error('invalid_peer_signature');
 return JSON.parse(envelope.recordJson);
}
export function verifyAdvertisement(envelope,scope,now=Date.now()){
 const r=verifyPeerEnvelope(envelope);
 if(!scope||r.schema!=='arns-mesh-peer/v1'||r.networkId!==scope.id||r.peerId!==envelope.witnessPeerId||!Number.isSafeInteger(r.sequence)||r.sequence<1)throw new Error('wrong_peer_network_or_identity');
 if(Object.keys(r).some(k=>!['schema','networkId','peerId','address','sequence','issuedAt','expiresAt','capabilities'].includes(k)))throw new Error('invalid_peer_fields');
 if(!Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||r.issuedAt>now+30000||r.expiresAt<=now||r.expiresAt<=r.issuedAt||r.expiresAt-r.issuedAt>PEER_TTL)throw new Error('expired_peer_advertisement');
 if(!Array.isArray(r.capabilities)||r.capabilities.length>6||r.capabilities.some(x=>!['content','location','snapshot-relay','catalog','peers'].includes(x))||!r.capabilities.includes('content'))throw new Error('invalid_peer_capabilities');
 if(peerAddress(discoveryAddress(r.address,scope))!==r.address)throw new Error('noncanonical_peer_address');
 return r;
}
export class PeerDirectory{
 constructor({file,scope,now=()=>Date.now()}){this.file=file;this.scope=scope;this.now=now;this.rows=new Map();this.marks=new Map();this.health=new Map();this.affinity=new Map();this.networkId=null;this.sequence=0;this.load();}
 context(){const scope=this.scope();if(scope?.id!==this.networkId){this.rows.clear();this.marks.clear();this.health.clear();this.affinity.clear();this.sequence=0;this.networkId=scope?.id||null;}return scope;}
 load(){try{if(fs.statSync(this.file).size>256*1024)return;const v=JSON.parse(fs.readFileSync(this.file));const scope=this.scope();if(v.schema!=='arns-mesh-peer-directory/v1'||!scope||v.networkId!==scope.id)return;this.networkId=scope.id;this.sequence=Number.isSafeInteger(v.sequence)?v.sequence:0;for(const [id,m] of (v.marks||[]).slice(-128))if(/^[a-f0-9]{64}$/.test(id)&&Number.isSafeInteger(m.sequence)&&typeof m.hash==='string')this.marks.set(id,m);for(const env of (v.records||[]).slice(0,MAX_LEARNED_PEERS)){try{const r=verifyAdvertisement(env,scope,this.now());this.rows.set(r.peerId,{env,record:r});}catch{}}}catch{}}
 save(){if(!this.networkId)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({schema:'arns-mesh-peer-directory/v1',networkId:this.networkId,sequence:this.sequence,records:[...this.rows.values()].map(x=>x.env),marks:[...this.marks]}),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 nextSequence(){this.context();this.sequence++;this.save();return this.sequence;}
 records(){this.context();for(const [id,row] of this.rows)if(row.record.expiresAt<=this.now())this.rows.delete(id);return [...this.rows.values()];}
 check(env){const record=verifyAdvertisement(env,this.context(),this.now()),hash=crypto.createHash('sha256').update(env.recordJson).digest('hex'),old=this.marks.get(record.peerId);if(old&&(record.sequence<old.sequence||record.sequence===old.sequence&&hash!==old.hash))throw new Error('peer_advertisement_rollback_or_conflict');return {record,hash};}
 accept(env){const {record,hash}=this.check(env),address=discoveryAddress(record.address,this.context());this.records();const sameHost=this.records().filter(x=>discoveryAddress(x.record.address,this.context()).host===address.host&&x.record.peerId!==record.peerId);if(sameHost.length>=4)throw new Error('peer_host_limit');
  if(!this.rows.has(record.peerId)&&this.rows.size>=MAX_LEARNED_PEERS)throw new Error('peer_directory_full');
  if([...this.rows.values()].some(x=>x.record.address===record.address&&x.record.peerId!==record.peerId))throw new Error('peer_address_identity_conflict');
  this.rows.set(record.peerId,{env,record});this.marks.delete(record.peerId);this.marks.set(record.peerId,{sequence:record.sequence,hash});while(this.marks.size>128)this.marks.delete(this.marks.keys().next().value);this.save();return record;
 }
 exports(limit=16,offset=0){const rows=this.records();return rows.length?Array.from({length:Math.min(limit,rows.length)},(_,i)=>rows[(offset+i)%rows.length].env):[];}
 addresses(){const scope=this.context();return this.records().map(x=>discoveryAddress(x.record.address,scope));}
 rank(peers,dataId){const affinity=this.affinity.get(dataId),now=this.now();const score=p=>{const key=peerAddress(p),h=this.health.get(key)||{};return (h.retryAt>now?100000:0)+(affinity?.has(key)?-10000:0)+(h.rtt??1000)+(h.failures||0)*1000;};return [...new Map(peers.map(p=>[peerAddress(p),p])).values()].sort((a,b)=>score(a)-score(b));}
 success(address,ms,dataId){const h=this.health.get(address)||{};this.health.set(address,{rtt:h.rtt===undefined?ms:h.rtt*0.75+ms*0.25,failures:0,retryAt:0});if(dataId){const a=this.affinity.get(dataId)||new Set();a.add(address);this.affinity.delete(dataId);this.affinity.set(dataId,a);while(this.affinity.size>256)this.affinity.delete(this.affinity.keys().next().value);}this.trimHealth();}
 failure(address){const h=this.health.get(address)||{},failures=Math.min(6,(h.failures||0)+1);this.health.set(address,{...h,failures,retryAt:this.now()+Math.min(60000,1000*2**failures)});for(const a of this.affinity.values())a.delete(address);this.trimHealth();}
 trimHealth(){while(this.health.size>64)this.health.delete(this.health.keys().next().value);}
 status(){return {learned:this.records().length,networkId:this.networkId,limit:MAX_LEARNED_PEERS};}
}
