import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {SearchCatalog,SearchPublisher,SEARCH_LIMITS,extractSearchText,verifySearchEnvelope} from '../src/search-catalog.mjs';
import {NameSnapshotStore} from '../src/name-snapshots.mjs';
import {VerifiedContentStore} from '../src/content-store.mjs';
import {peerIdFromPublicKey,signRecord} from '../src/common.mjs';
import {startDirectPeerServer} from '../src/direct-peer.mjs';
import {homeQuery,renderSearchHome,HOME} from '../apps/browser/search-home.mjs';
import {isAllowedRendererUrl} from '../apps/browser/response.mjs';
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mesh-search-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
function identity(){const keys=crypto.generateKeyPairSync('ed25519'),publicKeyPem=keys.publicKey.export({format:'pem',type:'spki'}),privateKeyPem=keys.privateKey.export({format:'pem',type:'pkcs8'}),id=peerIdFromPublicKey(publicKeyPem);return {id,sign(record){const recordJson=JSON.stringify(record);return {ok:true,witnessPeerId:id,witnessPublicKeyPem:publicKeyPem,recordJson,signature:signRecord(recordJson,privateKeyPem)};}};}
const now=()=>new Date().toISOString();
const entry=(extra={})=>({name:'music',targetId:'A'.repeat(43),documentId:'B'.repeat(43),title:'Müzik dünyası',description:'İstanbul müzik haberleri',text:'Bağımsız sanat ve müzik.',observedAt:now(),indexedAt:now(),availability:'document',...extra});
const record=(entries=[entry()],revision=1)=>({schema:'arns-mesh-search/v1',revision,generatedAt:now(),entries});

test('bounded HTML extraction excludes script/style/template and searches Turkish topic words locally',t=>{
 const html='<head><title>Müzik &amp; Sanat</title><meta content="İstanbul haberleri" name="description"><style>secretStyle</style></head><body><script>secretScript</script><template>secretTemplate</template><h1>Bağımsız MÜZİK</h1><p>konser &#x1F3B5;</p></body>';
 const text=extractSearchText(html);assert.equal(text.title,'Müzik & Sanat');assert.equal(text.description,'İstanbul haberleri');assert.equal(text.text,'Bağımsız MÜZİK konser 🎵');
 assert.equal(extractSearchText('<script '.repeat(20000)).text,'');
 assert.equal(extractSearchText('<script>if (x < y) run()</script><p>Kept text</p>').text,'Kept text');
 assert.equal(extractSearchText('<meta name="description" content="x > y"><p>Body</p>').description,'x > y');
 assert.throws(()=>extractSearchText('a'.repeat(SEARCH_LIMITS.documentBytes+1)),/limit/);
 const author=identity(),cache=new SearchCatalog(path.join(temp(t),'search.json'));cache.accept(author.sign(record([entry(text)])),[author.id]);
 assert.equal(cache.search('muzik istanbul',[author.id]).total,1);assert.equal(cache.search('bagimsiz',[author.id]).total,1);assert.equal(cache.search('secretScript',[author.id]).total,0);assert.equal(cache.search('music nonexistent',[author.id]).total,0);
 assert.equal(cache.search('müzik',[]).total,0,'revocation applies to offline queries too');
});

test('signatures, rollback, equal-revision conflicts and oversized data fail closed without losing accepted catalogue',t=>{
 const author=identity(),other=identity(),cache=new SearchCatalog(path.join(temp(t),'search.json')),trusted=[author.id],good=author.sign(record());cache.accept(good,trusted);
 assert.throws(()=>cache.accept(other.sign(record()),trusted),/untrusted/);
 assert.throws(()=>cache.accept({...good,recordJson:good.recordJson.replace('music','forged')},trusted),/signature/);
 assert.throws(()=>cache.accept(author.sign(record([entry({title:'conflict'})])),trusted),/conflict/);
 cache.accept(author.sign(record([entry()],3)),trusted);assert.throws(()=>cache.accept(good,trusted),/rollback/);
 assert.throws(()=>cache.accept(author.sign(record(Array.from({length:257},(_,i)=>entry({name:'site-'+i})),4)),trusted),/invalid_search_catalog/);
 assert.throws(()=>verifySearchEnvelope({...good,recordJson:' '.repeat(SEARCH_LIMITS.recordBytes+1)},trusted),/envelope/);
 const restarted=new SearchCatalog(cache.file);assert.equal(restarted.search('muzik',trusted).total,1);assert.throws(()=>restarted.accept(good,trusted),/rollback/);
});

test('new signed target replaces old topic text atomically and storage source count stays bounded',t=>{
 const cache=new SearchCatalog(path.join(temp(t),'search.json')),authors=[identity(),identity(),identity()],trusted=authors.map(x=>x.id);
 cache.accept(authors[0].sign(record()),trusted);cache.accept(authors[0].sign(record([entry({targetId:'C'.repeat(43),title:'Space',description:'Planets',text:'Astronomy starts here'})],2)),trusted);
 assert.equal(cache.search('istanbul',trusted).total,0);assert.equal(cache.search('art',trusted).total,0,'art must not match starts');assert.equal(cache.search('planets',trusted).hits[0].targetId,'C'.repeat(43));
 for(const author of authors.slice(1))cache.accept(author.sign(record()),trusted);
 assert.equal(Object.keys(cache.sources).length,2);assert.equal(cache.records(trusted).length,2);
});

test('publisher verifies manifest and document, drops changed/corrupt/evicted content, and never executes HTML',async t=>{
 const dir=temp(t),author=identity(),snapshots=new NameSnapshotStore(path.join(dir,'names.json')),contentStore=new VerifiedContentStore(path.join(dir,'content')),signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=async(body,type)=>{const x=createData(body,signer,{tags:[{name:'Content-Type',value:type}]});await x.sign(signer);await contentStore.put(x.id,x.getRaw());return x;};
 const html=await item('<title>Science</title><p>Space telescope</p><script>throw new Error("never run")</script>','text/html');
 assert.equal(contentStore.get(html.id,{maxBytes:1}),null,'index scans can reject a large file before reading its bytes');
 const manifest=await item(JSON.stringify({manifest:'arweave/paths',version:'0.1.0',index:{path:'index.html'},paths:{'index.html':{id:html.id},'missing.css':{id:'C'.repeat(43)}}}),'application/x.arweave-manifest+json');
 const observe=(id,slot)=>snapshots.put({schema:'arns-mesh-name-snapshot/v1',name:'science',txId:id,antId:'B'.repeat(43),slot,observedAt:now(),ttlSeconds:60},{kind:'local-rpc'});
 observe(manifest.id,1);const localNames=snapshots.names.bind(snapshots);snapshots.names=()=>[...localNames(),'remote-only'];const publisher=new SearchPublisher({file:path.join(dir,'published.json'),snapshots,contentStore,sign:author.sign});await publisher.pass();
 let r=verifySearchEnvelope(publisher.reply(),[author.id]);assert.equal(r.entries[0].documentId,html.id);assert.equal(r.entries[0].availability,'document');assert.equal(r.entries[0].text,'Space telescope');
 observe('D'.repeat(43),2);await publisher.pass();assert.equal(publisher.record.entries.length,0,'old keywords are not assigned to a new binding');
 observe(manifest.id,3);await publisher.pass();assert.equal(publisher.record.entries.length,1);
 fs.writeFileSync(contentStore.file(html.id),Buffer.from('corrupt'));await publisher.pass();assert.equal(publisher.record.entries.length,0);
 await contentStore.put(html.id,html.getRaw());await publisher.pass();assert.equal(publisher.record.entries.length,1);
 fs.unlinkSync(contentStore.file(html.id));await publisher.pass();assert.equal(publisher.record.entries.length,0);
});

test('signed catalogue replicates over IP through a mirror; restart searches after both peers close without RPC/raw/DNS',async t=>{
 const dir=temp(t),author=identity(),envelope=author.sign(record()),trusted=[author.id];
 const peer={identity:{},requestsServed:0,_handleAsync(req){assert.equal(req.op,'catalog');assert.equal(req.witnessPeerId,author.id);assert.equal(Object.hasOwn(req,'query'),false);return envelope;}};
 const a=await startDirectPeerServer(peer,{host:'127.0.0.1',port:0}),mirror=new SearchCatalog(path.join(dir,'mirror.json'));
 await mirror.sync({peers:[{host:'127.0.0.1',port:a.address.port}],trustedPeers:trusted});assert.equal(mirror.search('muzik',trusted).total,1);await a.close();
 const b=await startDirectPeerServer({identity:{},requestsServed:0,_handleAsync(req){return mirror.mirror(trusted,req.witnessPeerId);}},{host:'127.0.0.1',port:0});
 const client=new SearchCatalog(path.join(dir,'reader.json'));
 await client.sync({peers:[{host:'127.0.0.1',port:b.address.port}],trustedPeers:trusted});assert.equal(client.mirror(trusted).signature,envelope.signature);await b.close();
 const offline=new SearchCatalog(client.file);assert.equal(offline.search('muzik',trusted).total,1);
 await offline.sync({peers:[{host:'127.0.0.1',port:b.address.port}],trustedPeers:trusted});assert.ok(offline.error);assert.equal(offline.search('muzik',trusted).total,1);
});

test('sync caps peer and publisher requests and retains cache on failed responses',async t=>{
 const cache=new SearchCatalog(path.join(temp(t),'reader.json')),a=identity();cache.accept(a.sign(record()),[a.id]);let calls=0;
 await cache.sync({peers:Array(10).fill({host:'127.0.0.1',port:1}),trustedPeers:[a.id,'b','c'],query:async()=>{calls++;throw new Error('offline');}});assert.equal(calls,4);assert.equal(cache.search('music',[a.id]).total,1);
});

test('search homepage escapes untrusted metadata and only accepts a bounded internal query URL',()=>{
 assert.equal(homeQuery(HOME+'?q=m%C3%BCzik'),'müzik');assert.equal(isAllowedRendererUrl(HOME+'?q=muzik'),true);
 for(const u of [HOME+'?q=x&q=y',HOME+'?refresh=1',HOME+'?q='+ 'x'.repeat(161),'arnsui://user@app/welcome.html','arnsui://app:80/welcome.html',HOME+'#x'])assert.equal(homeQuery(u),null);
 const html=renderSearchHome('<!-- MESH_SEARCH --><!-- MESH_RESULTS -->',{query:'"><img src=x>',hits:[{...entry(),title:'<script>alert(1)</script>',excerpt:'<img onerror="evil">'}],total:1,entries:1,sources:1,generatedAt:now()});
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.match(html,/&lt;script&gt;/);assert.match(html,/href="ar:\/\/music"/);assert.match(html,/other files may be missing/);assert.match(html,/search words stay on this device/);
});
