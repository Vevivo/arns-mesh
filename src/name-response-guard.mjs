import crypto from 'node:crypto';

export function certifiedSnapshotKey(snapshot){
 return snapshot?crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'):'';
}
// Called on cache hits and again immediately before serving bytes. Cache age
// cannot extend a certificate lease or bypass a changed/revoked policy.
export function assertCertifiedResponse(context,result,{name,mode}={}){
 if(!context)return result;
 context.assertCurrent();
 context.verifySnapshot(result?.meta?.accessSnapshot,{name,mode:mode||(result?.meta?.recovery?'historical':'current')});
 context.assertCurrent();return result;
}
export function expiredNameLease(error){return error?.code==='name_certificate_expired';}
