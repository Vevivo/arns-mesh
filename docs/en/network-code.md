# Join and operate a Mesh network with a connection code

[Home](../../README.md) · [VPS / Pi setup](supporter.md) · [Türkçe](../tr/ag-kodu.md)

Use **Mesh 0.6.0** for the desktop and supporter. Updating the desktop does not update a server installation.

## Which item do I need?

| Item | Meaning |
|---|---|
| Peer address (`IP:port`) | The reachable endpoint of one supporter |
| Network invitation (`mesh1.…` or `mesh2.…`) | Network identity and starting configuration; durable definitions allow independent joining |
| Connection profile (`mesh-connect.json`) | Legacy/manual source settings; not website files |

**Supporting the existing network?** Start with the [short VPS/Pi setup](supporter.md). Join with the existing invitation. 0.6.0 automatically announces a reachable content endpoint; no separate network or per-reader code is needed. [Implemented flow and limits](shared-network.md).

The sections below document today's connection mechanism and advanced operator actions. Codes remain an optional advanced/recovery mechanism in the intended product; normal users should eventually receive a prepared connected download. Current standard ZIPs provide the public community definition; select it with the public community code or use another trusted network's code.


## For readers

1. Download the Windows desktop ZIP, extract all files and start `Mesh-Browser.exe`.
2. Copy the [public community code](../community-network.md), or obtain a complete `mesh1.` / `mesh2.` code for another network you trust. Paste it into **Settings → Mesh connection code → Check code**.
3. Review the network name and sources, then choose **Join this network**. This replaces the current source list. Export your old profile first if you want to keep a backup.
4. Enter an ArNS name in Mesh's address bar. No server installation or manual IP editing is needed.

An operator's **Connected** package may include one invitation and join on a fresh first start, with signature validation. Existing configured sources are preserved. The standard public GitHub ZIP includes the signed community continuity definition and still lets the reader choose a network with a code or legacy profile.

Legacy files still work at **Settings → Already have a connection file? → Import connection profile**. Manual imports or connection edits stop automatic network-list updates. **Stop automatic updates** keeps the last source addresses and detaches network management. Joining again is a new trust decision.

## What the code means

A reusable code contains the network's public signing key, up to eight numeric IP starting addresses, and whether local addresses are allowed. A durable code additionally carries the signed source definition and numeric-IP rendezvous bootstrap addresses. It is longer than a PIN; copy and paste it. It contains no private key, content, wallet or payment information. It is **not a single-use license, password or access-control mechanism**. Recipients can see and share its addresses.

**Check code** checks live starting peers and verifies a signed durable definition when available. A local-network invitation explicitly permits private addresses and is marked in review. A public invitation cannot learn private/local destinations. Signatures authenticate continuity with the key in the code; they do not establish that the operator is honest or has every file. Obtain the complete code through a trusted channel.

## Publish your network

Complete the [supporter installation and external reachability checks](supporter.md) first. Prepare `mesh-connect.json` containing the Mesh, numeric-IP RPC and optional raw Arweave addresses **readers may use**. This may differ from the peer's own upstream profile. Include your reachable Mesh address, not `0.0.0.0` or a reader's loopback address.

From the updated source checkout, select the **same data directory** used by your running peer:

```sh
node scripts/network.mjs publish --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --profile ../mesh-connect.json --name "My Mesh Network"
```

Give readers the returned `code`, the Windows download link and the steps above. The first publication creates an Ed25519 authority key. The updated peer serves the signed announcement from its data directory without requiring a domain or another listener.

The first eight profile Mesh addresses become starting peers by default. Use repeated `--seed REAL_IP:PORT` options to choose only peers that actually serve **this network's announcement**. Other content peers can remain in the signed profile. With a durable definition, 0.6.0 can join and discover later supporters when these initial HTTP peers are unreachable. Legacy invitations without continuity still require a starting peer.

## Add a supporter and a mirror

For a fresh installation, the installer accepts a code instead of JSON:

```sh
bash scripts/setup-supporter.sh --advertise YOUR_PUBLIC_IP:49741 --capacity vps
```

Replace the address with your own reachable public IP and port. Add `--network COMPLETE_CODE` only when selecting another network. In 0.6.0 the peer follows the network's sources and automatically announces its reachable content endpoint to upgraded peers/readers. This does not edit the authority-signed list or grant name trust. For older readers, the operator can still check/add the endpoint and republish. [Details](shared-network.md).

Updates preserve existing configuration. To deliberately join an existing installation, stop its peer, back up its data, run `node scripts/network.mjs join 'REAL_CODE' --data DATA_DIRECTORY`, then restart. The CLI invocation is explicit trust and does not show a second confirmation screen.

To make the newly joined peer also serve the signed list:

```sh
node scripts/network.mjs mirror 'REAL_CODE' --data "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Only the public signed record is copied. Keep the authority private key on the authority host. A joined mirror also republishes accepted list updates. For legacy-only invitations, include its address in the starting peers for first-time readers; returning readers also try addresses in their last accepted list. Durable invitations and the bundled community definition additionally use independent rendezvous.

Copying a list does **not** copy website content. Catalog/content replication remains a separate process: verify that useful bytes and records are present elsewhere. Desktop installations still do not automatically serve content.

## Independent joining and updates

Mesh 0.6.0 supports a durable, authority-signed network definition. A `mesh2.` code carries that definition; the public community release also carries a same-key signed definition for the existing community `mesh1.` code. A fresh supporter or reader can accept this definition even while the original starting server is unreachable.

The definition supplies numeric-IP rendezvous bootstrap addresses. Readers and supporters discover announcements for this network, verify each endpoint with a signed challenge and retain valid routes. A supporter may join after the original server is already absent. Learned addresses never become trusted name publishers merely through discovery.

The durable definition does not expire with the original operator's server. It preserves the original trust anchors and source settings; it does not let mirrors change them. New live signed source-list revisions are still checked for valid signatures, expiry, rollback and equal-revision conflicts. Already accepted newer source settings are not replaced by an older durable base. A release carrying an updated definition must still verify under the same authority key.

The legacy live list has a 14-day default lifetime and authority renewal. A legacy invitation without a verified durable definition still needs a reachable, unexpired list for a first join. Upgrading the community application supplies its durable definition; old binaries do not gain that behavior automatically.

The reader checks list updates on startup and about every 15 minutes. Discovery operates separately. **Saved** mode pauses both. If all discovery routes are blocked, an unknown new endpoint cannot be found. Useful site access also needs reachable files and an accepted name binding; the definition itself is not a site archive.

Operators of another network can create its durable definition on their authority host after reviewing numeric-IP bootstrap routes:

```sh
node scripts/network.mjs continuity --data PEER_DATA --bootstrap NUMERIC_IP:PORT
```

Repeat `--bootstrap` for additional independent rendezvous nodes. This signs public configuration with the existing local authority; never copy that private key to other supporters. [Public community connection](../community-network.md).

## Prepare an included-network download

Follow the [developer packaging instructions](developer.md). Save the complete code as one line in a file outside the repository, then:

```sh
python scripts/package-windows.py --runtime ELECTRON_DIRECTORY --out dist --network-code-file ../network-code.txt --network-name "My Mesh Network"
```

The output filename ends in `-Connected.zip`. Only that output package auto-selects the supplied invitation. The standard source still includes the public signed community continuity definition. It exposes the advertised addresses to recipients and creates no server by itself.

## Authority backup

Keep `network-authority.private.json` in a private backup. Never include it in a reader package, mirror or public repository. Losing the key prevents updates under that identity; restoring an old revision counter can create rejected/conflicting revisions. A compromised key requires a new invitation through a separately trusted channel; automatic key rotation is not implemented.

Connection codes are reusable and require no payment or activation license. They are not access-control credentials.
