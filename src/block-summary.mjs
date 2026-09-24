import {StringDecoder} from 'node:string_decoder';

// Native block JSON places the transaction list before some large mining proofs.
// Stop after a complete top-level value, never after a regex match inside a string.
// The result is discovery metadata only; it makes no consensus/inclusion claim.
export function blockSummaryReader(){
 const decoder=new StringDecoder('utf8');let text='',position=0,depth=0,string=false,escape=false;
 return chunk=>{
  text+=decoder.write(chunk);
  for(;position<text.length;position++){
   const c=text[position];
   if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}
   if(c==='"'){string=true;continue;}
   if(c==='{'||c==='[')depth++;
   else if(c==='}'||c===']')depth--;
   if((c===','&&depth===1)||(c==='}'&&depth===0)){
    const prefix=text.slice(0,position)+'}';
    if(!prefix.includes('"txs"'))continue;
    const value=JSON.parse(prefix);
    if(!Object.hasOwn(value,'height')||!Object.hasOwn(value,'txs'))continue;
    if(!Number.isSafeInteger(value.height)||value.height<0||!Array.isArray(value.txs)||value.txs.length>100000||value.txs.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(id)))throw new Error('invalid_block_summary');
    if(value.timestamp!==undefined&&(!Number.isSafeInteger(value.timestamp)||value.timestamp<0))throw new Error('invalid_block_timestamp');
    return {height:value.height,txs:value.txs,...(value.timestamp===undefined?{}:{timestamp:value.timestamp})};
   }
  }
  return null;
 };
}
