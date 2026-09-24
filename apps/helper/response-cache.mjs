// A rendered-response cache must never retain the full signed sharing bundle.
export class ResponseCache extends Map {
 constructor({maxBytes=16*1024*1024,maxEntries=64}={}){super();this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.bytes=0;}
 set(key,response){
  this.delete(key);if(response.body.length>this.maxBytes)return this;
  const {body,contentType,meta}=response;
  const stored={body,contentType,meta,at:Date.now()};
  const size=body.length+Buffer.byteLength(JSON.stringify(meta||{}));
  if(size>this.maxBytes)return this;
  super.set(key,{...stored,cacheSize:size});this.bytes+=size;
  while(this.bytes>this.maxBytes||this.size>this.maxEntries)this.delete(this.keys().next().value);
  return this;
 }
 delete(key){const row=this.get(key);if(!super.delete(key))return false;this.bytes-=row.cacheSize;return true;}
 clear(){super.clear();this.bytes=0;}
}
