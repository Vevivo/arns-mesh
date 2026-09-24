// Unit-test payload only; never packaged in the runnable browser.
export const coreRoot=process.env.BROWSER_TEST_CORE_ROOT;
export async function resolveArUrl(raw,{signal}={}){signal?.throwIfAborted();return {body:Buffer.from('unit-test bytes'),contentType:'text/plain',meta:{input:raw,contentSignatureVerified:true}};}
