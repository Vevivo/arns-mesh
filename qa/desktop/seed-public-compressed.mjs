// QA only: acquire immutable public signed items before the offline desktop test.
// Public HTTP is fixture preparation, never a product transport or verification shortcut.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {verifyRawItem} from '../../src/content-store.mjs';
import {decodeVerifiedPayload} from '../../src/content-decoding.mjs';
import {verifyPeerEnvelope} from '../../src/peer-directory.mjs';
const captured = {
  "name": "docs",
  "manifest": "x8iDex_AEWK1391dFWOIChmlEM_ufH-tsJD7Y3dwhWQ",
  "entryPath": "/learn",
  "expectedHeading": "Introduction",
  "nameEnvelope": {
    "ok": true,
    "witnessPeerId": "1330e51e4fc65597312fb9252cf457bf6e0efedf1075bd5d3e977f6dff239d7a",
    "witnessPublicKeyPem": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAsw+EGjJfza1dne29pUatr+FnqmyXRBSs1mIT/hiBNGw=\n-----END PUBLIC KEY-----\n",
    "recordJson": "{\"schema\":\"arns-mesh-name-snapshot/v1\",\"name\":\"docs\",\"txId\":\"x8iDex_AEWK1391dFWOIChmlEM_ufH-tsJD7Y3dwhWQ\",\"antId\":\"G9hyniF3TgBtdDyQ7g5jivwwMostyZKXBWVQnNnJ8HGS\",\"observedAt\":\"2026-10-11T23:14:27.411Z\",\"slot\":455828421,\"ttlSeconds\":3600}",
    "signature": "HP4-jOLNMkhXQUKwCTlY0IoI5PbUPwo21uqBVZVTl-KK0GAYE9zZhdOV_SxsQ4fBseWiyVH_g7A5G79OuWHCBQ"
  },
  "sourceEvidence": {
    "capturedAt": "2026-10-11T23:14:27.411Z",
    "site": "https://docs.ar.io/learn",
    "deployCompression": "https://github.com/ar-io/ar-io-deploy#compression",
    "scope": "Original signed manifest and bounded Introduction page asset set; not a complete copy of all 1594 site files."
  },
  "locations": [
    {
      "id": "x8iDex_AEWK1391dFWOIChmlEM_ufH-tsJD7Y3dwhWQ",
      "root": "rD2T5o2jxWgqBUkSSdNHIrZAW3lB3p729HGzOkRRUR8",
      "itemOffset": 4463626,
      "itemSize": 153515,
      "path": null
    },
    {
      "id": "fpdeWsrSj3OC0QSeq31nIYObtTfZ8PS2LjzKYS4iP38",
      "root": "N-ZbhwSySDfhJ6qNdOX8SXDPidzqrgLIXr9elVfaM1s",
      "itemOffset": 9133717,
      "itemSize": 28166,
      "path": null
    },
    {
      "id": "z2k1-5YIjLx4dASwe2SXEgk8XUNjjTAnPLZAdQJ0DRI",
      "root": "zlbZmoEbKqKM5UizN-etZqCIlRaFtHSvHutpSWXQtZE",
      "itemOffset": 4834922,
      "itemSize": 20460,
      "path": "/_next/static/chunks/0i1mvfxznl_oz.css"
    },
    {
      "id": "GEtRtixsbRQw6XgNKxD605BYl7D71FTwuXMdMDN5haw",
      "root": "zlbZmoEbKqKM5UizN-etZqCIlRaFtHSvHutpSWXQtZE",
      "itemOffset": 5957667,
      "itemSize": 22671,
      "path": "/learn/index.html"
    },
    {
      "id": "zsQu2IPVoBgT23urDb25WQlhcFgRYW4xS8Iue7BdnlY",
      "root": "gF13rpgkBI1ljQhuy377NZHmtKK0u7jG1vxbcsOpiOM",
      "itemOffset": 242398,
      "itemSize": 12427,
      "path": "/_next/static/chunks/2qu14y6a4g5sg.js"
    },
    {
      "id": "XPac-RBUw84FNCeiHxc_w1Pbw9hR9McGkNzExrKafkc",
      "root": "gF13rpgkBI1ljQhuy377NZHmtKK0u7jG1vxbcsOpiOM",
      "itemOffset": 254825,
      "itemSize": 11859,
      "path": "/_next/static/chunks/3_ftk6vq-pffp.js"
    },
    {
      "id": "d5Dgl8ed_8lC9x2JzeAemdYyzf-wyz4zzJqNoTklKAU",
      "root": "gF13rpgkBI1ljQhuy377NZHmtKK0u7jG1vxbcsOpiOM",
      "itemOffset": 300639,
      "itemSize": 11825,
      "path": "/_next/static/chunks/156urxz1fcsew.js"
    },
    {
      "id": "LmRHg6CdIoUkVjZvVhguFIUkZl1qy_AebZj5iqUbFtQ",
      "root": "gF13rpgkBI1ljQhuy377NZHmtKK0u7jG1vxbcsOpiOM",
      "itemOffset": 312464,
      "itemSize": 11693,
      "path": "/_next/static/chunks/0zslk_n1-l3no.js"
    },
    {
      "id": "XPt9_wkWBTOV9zwYJjBCGTq9s4FZ6sfsf265gcFecp0",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 215153,
      "itemSize": 2528,
      "path": "/_next/static/chunks/35gwqyz9dgh6z.js"
    },
    {
      "id": "PwL_OVS_KcO-knlhtrngffE0L3Lf6YBkEDvSWiocAVY",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 254597,
      "itemSize": 1500,
      "path": "/brand/ario-black.svg"
    },
    {
      "id": "TmOhsQfTmPtyqgf2uzgusZU2UpLEOVDSSZi2uNUvw-8",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 606935,
      "itemSize": 2885,
      "path": "/_next/static/media/0b1dc8ddaa74ba49-s.0e__wj8580tc5.woff2"
    },
    {
      "id": "baIN-DJ50FRl4w0k_ON9V35797Gl8QTJY70o2zVU2Ok",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 969786,
      "itemSize": 7041,
      "path": "/_next/static/chunks/2o1tz1c0zfq1j.js"
    },
    {
      "id": "b--fsKcKlyiD8QMb6zyMm3DZ8y1UWcTGbue5SFu-2ng",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1105501,
      "itemSize": 5389,
      "path": "/_next/static/chunks/turbopack-2ctzojclx1pgj.js"
    },
    {
      "id": "lFaMLaeXKydvNL-TflzUnypjfwEtzsBNn4hW--js4jA",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1244913,
      "itemSize": 8516,
      "path": "/_next/static/chunks/0pkja4itk79e9.js"
    },
    {
      "id": "tBAj_aNi40ppAmUx9cTvMYk3LZbaHw5OqG93z8szD-4",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1339350,
      "itemSize": 8690,
      "path": "/_next/static/chunks/1kqk4nyuljo1m.js"
    },
    {
      "id": "hlxRnudgZ-0w8a32faH1qS0i7OolPdLSv-pjcj4GxxY",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1423483,
      "itemSize": 10494,
      "path": "/_next/static/chunks/200m5zr91k55o.js"
    },
    {
      "id": "sNfXg2ilh0cxUE6FymOhJb2705g4UPHhP9qSpBHxv1o",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1441886,
      "itemSize": 11680,
      "path": "/_next/static/chunks/22cyom2i4xqdj.js"
    },
    {
      "id": "CAw7XYfexgMJqk4YPcHN_K1gvpUDa0cYxhAhCqX8uFY",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1554126,
      "itemSize": 8957,
      "path": "/_next/static/chunks/2pzjrw7t7jz3-.js"
    },
    {
      "id": "8oQrnXeCE0hYDSZkMkgC5xjuyroVMy02ksqCF2AZuuI",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1592765,
      "itemSize": 10490,
      "path": "/_next/static/chunks/2w85hdimysj-k.js"
    },
    {
      "id": "NZmUECOCOk7EGFxQmCt8Vcc55YMZx4iS4AcuTzTDGQQ",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1725065,
      "itemSize": 11088,
      "path": "/_next/static/chunks/3bv2hsfxwk1gg.js"
    },
    {
      "id": "sKzymewI6U_NWZPF1OfWS4wnD890qJoaXHHt-z089Ok",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 1935436,
      "itemSize": 9461,
      "path": "/_next/static/media/e629b5bc06499d58-s.10u7vx61f1ie7.woff2"
    },
    {
      "id": "ms03gVAI03pD11wbh9_3Y6o5SLN5ccw6d6mKSzYzd30",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 2172252,
      "itemSize": 12662,
      "path": "/_next/static/chunks/0lb7gbrzud2bi.js"
    },
    {
      "id": "LgVyzEUWtp-wWbGcC8hC2tTNszfy9RuTxzIeQb8cso0",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 2250186,
      "itemSize": 14624,
      "path": "/_next/static/chunks/1x3vbr942yyfm.js"
    },
    {
      "id": "5kMRBB7MuXdOPWSYUvBX64JtP0Xap2y4Mizd3juTdXk",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 2307434,
      "itemSize": 12268,
      "path": "/_next/static/chunks/2enddb8_5yf4w.js"
    },
    {
      "id": "x3TulZ9s4Snx2NGrCk0wB31xyxS5pqBYF0vKP27h3t8",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 2345239,
      "itemSize": 15190,
      "path": "/_next/static/chunks/3b_j3rz7pn-ug.js"
    },
    {
      "id": "uaP1haI6mOl298zspZtVOyOjiNWLYWtHfUPzlgPCjGM",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 3507342,
      "itemSize": 16626,
      "path": "/_next/static/chunks/12xhylgaiak56.js"
    },
    {
      "id": "8Rk7-MpCbUkF_FqS8D0e3KsVAfOBFUennJ_hEFY5_YQ",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 3621048,
      "itemSize": 16207,
      "path": "/_next/static/chunks/2il5n-k--6hpz.js"
    },
    {
      "id": "TM7YzMVKzrc2Fr_gxM1UWeK4WAvEfj8MksffPh4npKM",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 3669609,
      "itemSize": 16829,
      "path": "/_next/static/chunks/456c-vrdiogp_.js"
    },
    {
      "id": "_dxVuJgg5WKfRfdh-yMhG_PLRLocCTCJjG9M5iXyzEw",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 5124375,
      "itemSize": 17669,
      "path": "/_next/static/chunks/0i0g6wlstd_w6.js"
    },
    {
      "id": "Xe8JmaNZ3cZBCJoksfiWI1tWgaydWHjl35gv4_s7eF4",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 5301884,
      "itemSize": 17039,
      "path": "/_next/static/chunks/3izf6ttmjxev-.js"
    },
    {
      "id": "oRUe0KqpsdzOnaYcHiFUJ4ej4aQSzp7grtyPIxIkSk8",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 6933020,
      "itemSize": 20983,
      "path": "/_next/static/chunks/12vjqdx1_fxj1.js"
    },
    {
      "id": "v1TGVzWGqec-eFmU4t9b9lWp9owvWqz1zwFUrrbuBS8",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 9104610,
      "itemSize": 22857,
      "path": "/_next/static/media/1a099d89ee94ee96-s.35a5cae5tspm2.woff2"
    },
    {
      "id": "RBKIQBoTwtVcNAjWDwSXnp3hduxsJ0HS0spMdSNd3wo",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 9198125,
      "itemSize": 23470,
      "path": "/brand/favicon.png"
    },
    {
      "id": "6hErjtzSKXTNfRBXdGY355kl2aEmX_1QnL7NgDPCdFQ",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 11425855,
      "itemSize": 25894,
      "path": "/_next/static/chunks/2hxk7t0-0hnod.js"
    },
    {
      "id": "3n7cf1kkZjcq3C_vks4FAgOR72biRyKHfAQwyTL-oAk",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 14318337,
      "itemSize": 28441,
      "path": "/_next/static/media/fba5a26ea33df6a3-s.p.18rizl4rsrl42.woff2"
    },
    {
      "id": "s8b0jSOUtqm7M5v1UlNHMaCPMhaKCZLO71O0YpkCPuc",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 17011456,
      "itemSize": 40716,
      "path": "/_next/static/chunks/0cz1d0mv5g_q7.js"
    },
    {
      "id": "J-mpjuOzqdMQatLXXza_84pcnHSio_TlJDgQIZ9qOcE",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 17300655,
      "itemSize": 36394,
      "path": "/_next/static/chunks/1cv_f3cq2_iv7.js"
    },
    {
      "id": "Q8XztUxSv1TB-istCproLpRQ5WN8IDSUJv2j5vjr8ak",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 17542427,
      "itemSize": 74224,
      "path": "/_next/static/chunks/409e286gdf5ye.js"
    },
    {
      "id": "nEKtuRvwixzh1GKlwSWFcB1I8pJnjkqYqyUOgCZm9P0",
      "root": "Py-NVq7jEMBNbsrfAYdpPTONgiqt3Ivde3oU5JW1WLU",
      "itemOffset": 17616651,
      "itemSize": 39759,
      "path": "/_next/static/chunks/3xokny7q6jexa.js"
    }
  ]
};
const output=process.env.QA_OUTPUT;
if(!output)throw new Error('QA_OUTPUT is required');
const directory=path.resolve(output,'public-content');
fs.mkdirSync(directory,{recursive:true});
assert.ok(captured.locations.length<=64);
assert.ok(captured.locations.reduce((sum,item)=>sum+item.itemSize,0)<=16*1024*1024);
const binding=verifyPeerEnvelope(captured.nameEnvelope);
assert.equal(binding.name,captured.name);assert.equal(binding.txId,captured.manifest);
const requestRange=(item,hostname)=>new Promise((resolve,reject)=>{
 const end=item.itemOffset+item.itemSize-1;
 const req=https.get({hostname,path:'/raw/'+item.root,headers:{range:'bytes='+item.itemOffset+'-'+end,'accept-encoding':'identity'},timeout:20000},res=>{
  const fail=message=>{res.destroy();reject(new Error(message));};
  if(res.statusCode!==206)return fail('Public fixture range unavailable: '+res.statusCode);
  if(res.headers['content-encoding'])return fail('Public fixture bundle transport unexpectedly encoded');
  const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers['content-range']||'');
  if(!match||Number(match[1])!==item.itemOffset||Number(match[2])!==end||Number(match[3])<=end)return fail('Public fixture range mismatch');
  const chunks=[];let size=0;
  res.on('data',chunk=>{size+=chunk.length;if(size>item.itemSize){fail('Public fixture size limit');return;}chunks.push(chunk);});
  res.once('end',()=>size===item.itemSize?resolve(Buffer.concat(chunks,size)):reject(new Error('Public fixture incomplete')));
  res.once('error',reject);
 });
 req.once('timeout',()=>req.destroy(new Error('Public fixture request timed out')));
 req.once('error',reject);
});
const sha=body=>crypto.createHash('sha256').update(body).digest('hex'),items=[],checks=[];
for(const item of captured.locations){
 assert.match(item.id,/^[A-Za-z0-9_-]{43}$/);assert.match(item.root,/^[A-Za-z0-9_-]{43}$/);
 assert.ok(Number.isSafeInteger(item.itemOffset)&&item.itemOffset>=0&&Number.isSafeInteger(item.itemSize)&&item.itemSize>0&&item.itemSize<=2*1024*1024);
 let raw,verified,error;
 for(const hostname of ['turbo-gateway.com','arweave.net','turbo-gateway.com']){
  try{raw=await requestRange(item,hostname);verified=await verifyRawItem(raw,item.id);break;}catch(cause){error=cause;}
 }
 if(!verified)throw new Error('Could not verify public item '+item.id+': '+error?.message);
 const file=path.join(directory,item.id+'.ans104');fs.writeFileSync(file,raw);
 const view=await decodeVerifiedPayload(verified);
 const type=verified.tags.find(tag=>tag.name.toLowerCase()==='content-type')?.value;
 const expected=verified.tags.find(tag=>tag.name==='File-SHA256')?.value;
 if(expected)assert.equal(sha(view.body),expected,'Decoded bytes must match the signed original file hash');
 items.push({id:item.id,file,path:item.path,type,encoding:view.contentEncoding,storedBytes:raw.length,decodedBytes:view.body.length,signatureVerified:true,decodedSha256:sha(view.body)});
 if(['GEtRtixsbRQw6XgNKxD605BYl7D71FTwuXMdMDN5haw','tBAj_aNi40ppAmUx9cTvMYk3LZbaHw5OqG93z8szD-4','z2k1-5YIjLx4dASwe2SXEgk8XUNjjTAnPLZAdQJ0DRI'].includes(item.id)){
  checks.push({path:item.path,id:item.id,decodedSha256:sha(view.body),type,decodedBytes:view.body.length});
 }
}
assert.equal(checks.length,3);
const {locations,...metadata}=captured;
const report={...metadata,items,checks,allSignaturesVerified:true,downloadedAt:new Date().toISOString()};
fs.writeFileSync(path.join(path.resolve(output),'public-content.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({realPublicName:report.name,items:items.length,storedBytes:items.reduce((sum,item)=>sum+item.storedBytes,0),allSignaturesVerified:true,entryPath:report.entryPath,checks}));
