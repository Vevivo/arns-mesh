import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';

export function peerIdFromPublicKey(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
}
export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
export function signRecord(recordJson, privateKeyPem) {
  return crypto.sign(null, Buffer.from(recordJson), crypto.createPrivateKey(privateKeyPem)).toString('base64url');
}
export function verifyRecord(recordJson, signature, publicKeyPem) {
  return crypto.verify(null, Buffer.from(recordJson), crypto.createPublicKey(publicKeyPem), Buffer.from(signature,'base64url'));
}
export function assertLiteralIp(host) {
  if (!net.isIP(host)) throw new Error('DNS names are forbidden in mesh transport: '+host);
}
export function getBuffer({host,port,path,timeout=5000}) {
  assertLiteralIp(host);
  return new Promise((resolve,reject)=>{
    const req=http.get({
      host, port, path,
      lookup(){ throw new Error('DNS_LOOKUP_FORBIDDEN'); },
      headers:{accept:'*/*','user-agent':'arns-mesh/0.3'}
    },res=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>{
        const body=Buffer.concat(chunks);
        if(res.statusCode<200||res.statusCode>=300) return reject(new Error('HTTP '+res.statusCode+' '+path));
        resolve({body,headers:res.headers,status:res.statusCode});
      });
    });
    req.setTimeout(timeout,()=>req.destroy(new Error('timeout')));
    req.on('error',reject);
  });
}
