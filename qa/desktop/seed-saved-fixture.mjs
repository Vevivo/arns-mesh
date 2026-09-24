// Isolated GUI routing fixture, not a public ArNS record or live-network proof.
// This file and its generated state are not included in release packages.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createData,EthereumSigner} from '@dha-team/arbundles/node';
import {VerifiedContentStore} from '../../src/content-store.mjs';
import {NameSnapshotStore} from '../../src/name-snapshots.mjs';
export async function seed(dir){
 const store=new VerifiedContentStore(path.join(dir,'content'));
 const signer=new EthereumSigner(crypto.randomBytes(32).toString('hex'));
 const item=async(data,type)=>{const d=createData(data,signer,{tags:[{name:'Content-Type',value:type}]});await d.sign(signer);await store.put(d.id,d.getRaw());return d.id;};
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Signed QA page</title><link rel="stylesheet" href="style.css"><main><p>CONTROLLED TEST CONTENT · NOT A PUBLIC ArNS SITE</p><h1>A verified page, opened locally.</h1><img src="image.svg" alt="QA image"><p id="script-status">Script pending</p><label>Test editing <input id="page-input"></label><p><a id="next-page" href="next.html?test=1#section">Open the next page</a></p></main><script src="app.js"></script></html>';
 const paths={};
 for(const [name,data,type] of [
  ['index.html',html,'text/html'],
  ['style.css','body{background:#f6f4ef;color:#23232d;font:18px system-ui;margin:56px}h1{color:#5427c8;font-size:38px}img{width:64px}input{padding:12px;border:1px solid #5427c8;border-radius:8px}a{color:#5427c8}','text/css'],
  ['app.js',"document.getElementById('script-status').textContent='Local JavaScript loaded';",'text/javascript'],
  ['image.svg','<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="29" fill="#5427c8"/><path d="m16 32 10 10 23-24" fill="none" stroke="white" stroke-width="4"/></svg>','image/svg+xml'],
  ['next.html','<!doctype html><title>Second QA page</title><link rel="stylesheet" href="style.css"><h1 id="section">Second signed page</h1><p>CONTROLLED TEST CONTENT</p><a href="/">Return home</a>','text/html']
 ])paths[name]={id:await item(data,type)};
 const root=await item(JSON.stringify({manifest:'arweave/paths',version:'0.2.0',index:{path:'index.html'},paths}),'application/x.arweave-manifest+json');
 new NameSnapshotStore(path.join(dir,'name-snapshots.json')).put({schema:'arns-mesh-name-snapshot/v1',name:'mesh-qa',txId:root,antId:'B'.repeat(43),slot:1,ttlSeconds:60,observedAt:new Date().toISOString()},{kind:'local-rpc'});
 fs.writeFileSync(path.join(dir,'preferences.json'),JSON.stringify({accessPolicy:'saved',trustedPeers:[],witnessQuorum:2}));
 return {name:'mesh-qa',manifest:root,items:Object.keys(paths).length+1,scope:'Synthetic saved-name observation and real signed ANS-104 files; no live chain claim'};
}
