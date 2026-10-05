import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),at=args.indexOf('--data');
if(at<0||!args[at+1])throw new Error('Usage: node scripts/operator.mjs --data PEER_DATA [--json]');
const status=JSON.parse(fs.readFileSync(path.join(path.resolve(args[at+1]),'operator-status.json')));
if(args.includes('--json'))console.log(JSON.stringify(status,null,2));
else{const c=status.catalog||{},p=status.savedSites||{},d=status.peerDiscovery||{};console.log(`ArNS Mesh provider · ${status.version}\nUpdated: ${status.at}\nLearned peer addresses: ${d.learned||0} (not online users)\nAnnounced endpoint: ${d.address||'none'}\nPeers accepting announcement in last 24h: ${d.acceptedBy||0}\nPeer discovery error: ${d.error||'none'}\nRelayed name records: ${status.snapshotRelay?.records||0}\nRetained name observations: ${status.retainedNames}\nPrepared versions: ${p.ready||0}\nQueued content: ${c.queued||0}\nCatalog error: ${c.catalogError||'none'}\nPreparation error: ${c.preparation?.error||'none'}`);console.table((p.sites||[]).map(r=>({name:r.name,files:`${r.saved}/${r.total}`,state:r.status,update:r.update?.status||'',observed:r.observedAt})));}
