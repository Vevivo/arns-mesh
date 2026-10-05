#!/usr/bin/env node
// Online preparation only. No wallet or signing key is required.
import fs from 'node:fs';
import path from 'node:path';
import {SolanaARIOReadable} from '@ar.io/sdk/solana';
import {createSolanaRpc} from '@solana/kit';
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const dir=arg('--dir',process.env.ARNS_SHARED_INDEX_DIR);
if(!dir)throw new Error('Usage: node scripts/configure-shared-index.mjs --dir DIRECTORY [--publisher WALLET] [--rpc HTTPS_URL]');
const publisher=arg('--publisher','34LYvMptiDvBP5sqfh1oAd6Q4qFsy4PWaZ1HTFmML7h5'),rpc=arg('--rpc','https://api.mainnet-beta.solana.com');
const timeout=setTimeout(()=>{console.error('registry_lookup_timeout');process.exit(1);},30000);timeout.unref();
const row=await new SolanaARIOReadable({rpc:createSolanaRpc(rpc)}).getGateway({address:publisher});
if(!row?.observerAddress||!row.settings?.fqdn||row.settings.protocol!=='https')throw new Error('registered_https_publisher_required');
const origin=`https://${row.settings.fqdn}${row.settings.port===443?'':':'+row.settings.port}`;
const file=path.join(dir,'trust.json');
if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file));if(old.publisher!==publisher||old.observerAddress!==row.observerAddress)throw new Error('publisher_key_changed: review the registry observation before replacing trust.json');}
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({publisher,observerAddress:row.observerAddress,origin,registrySource:rpc,registryObservedAt:new Date().toISOString(),trust:'RPC registry observation; not a native account inclusion proof'}),{mode:0o644});fs.renameSync(file+'.tmp',file);
console.log(JSON.stringify({configured:true,dir:path.resolve(dir),publisher,observerAddress:row.observerAddress,origin}));
