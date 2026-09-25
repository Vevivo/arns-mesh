# Join and operate a Mesh network with a connection code

[Home](../../README.md) · [VPS / Pi setup](supporter.md) · [Türkçe](../tr/ag-kodu.md)

Requires **preview.8 or newer** on the desktop and peers publishing network lists. Older peers may continue serving content. Installing a desktop update does not upgrade a production supporter.

## For readers

1. Download the Windows desktop ZIP, extract all files and start `Mesh-Browser.exe`.
2. Obtain a complete `mesh1.` connection code from an operator you trust. Paste it into **Settings → Mesh connection code → Check code**.
3. Review the network name and sources, then choose **Join this network**. This replaces the current source list. Export your old profile first if you want to keep a backup.
4. Enter an ArNS name in Mesh's address bar. No server installation or manual IP editing is needed.

An operator's **Connected** package may include one invitation and join on a fresh first start, with signature validation. Existing configured sources are preserved. The standard public GitHub ZIP contains no operator invitation; it needs a code or a legacy profile.

Legacy files still work at **Settings → Already have a connection file? → Import connection profile**. Manual imports or connection edits stop automatic network-list updates. **Stop automatic updates** keeps the last source addresses and detaches network management. Joining again is a new trust decision.

## What the code means

The reusable code contains the network's public signing key, up to eight numeric IP starting addresses, and whether local addresses are allowed. It is longer than a PIN; copy and paste it. It contains no private key, content, wallet or payment information. It is **not a single-use license, password or access-control mechanism**. Recipients can see and share its addresses.

**Check code** contacts its starting peers to retrieve the signed source list. A local-network invitation explicitly permits private addresses and is marked in review. A public invitation cannot learn private/local destinations. Signatures authenticate continuity with the key in the code; they do not establish that the operator is honest or has every file. Obtain the complete code through a trusted channel.

## Publish your network

Complete the [supporter installation and external reachability checks](supporter.md) first. Prepare `mesh-connect.json` containing the Mesh, numeric-IP RPC and optional raw Arweave addresses **readers may use**. This may differ from the peer's own upstream profile. Include your reachable Mesh address, not `0.0.0.0` or a reader's loopback address.

From the updated source checkout, select the **same data directory** used by your running peer:

```sh
node scripts/network.mjs publish --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --profile ../mesh-connect.json --name "My Mesh Network"
```

Give readers the returned `code`, the Windows download link and the steps above. The first publication creates an Ed25519 authority key. The updated peer serves the signed announcement from its data directory without requiring a domain or another listener.

The first eight profile Mesh addresses become starting peers by default. Use repeated `--seed REAL_IP:PORT` options to choose only peers that actually serve **this network's announcement**. Other content peers can remain in the signed profile. A code cannot establish a connection if all its starting peers are unreachable.

## Add a supporter and a mirror

For a fresh installation, the installer accepts a code instead of JSON:

```sh
bash scripts/install-peer.sh --network 'COMPLETE_MESH1_CODE_FROM_OPERATOR'
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Replace the quoted placeholder. The peer follows that network's sources, but is **not automatically added to its published list**. The authority checks the new peer, adds its reachable address to the reader profile and republishes using the same authority data directory.

Updates preserve existing configuration. To deliberately join an existing installation, stop its peer, back up its data, run `node scripts/network.mjs join 'REAL_CODE' --data DATA_DIRECTORY`, then restart. The CLI invocation is explicit trust and does not show a second confirmation screen.

To make the newly joined peer also serve the signed list:

```sh
node scripts/network.mjs mirror 'REAL_CODE' --data "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Only the public signed record is copied. Keep the authority private key on the authority host. A joined mirror also republishes accepted list updates. Include its address in the invitation's starting peers for first-time readers; returning readers also try Mesh addresses in their last accepted list.

Copying a list does **not** copy website content. Catalog/content replication remains a separate process: verify that useful bytes and records are present elsewhere. Desktop installations still do not automatically serve content.

## Updates, expiration and outages

Run `publish` again with the same data directory when the reader profile changes. The signing key is retained and the revision increases. An unchanged key and starting-address set produce the same invitation. Changing starting addresses requires a new code for first-time users; an existing member can learn new addresses while an old source remains reachable.

Live desktops check on startup and about every 15 minutes. They reject invalid signatures, expired announcements, revision rollback and conflicting equal revisions. An unavailable update retains the last accepted source files. Saved mode makes no connection-list requests and opens retained files locally.

Default announcement lifetime is 14 days. The running authority peer checks at startup and every six hours, renewing when three days or less remain. Mirrors cannot renew without the key. Expiration blocks new joins/new list acceptance; it does not delete cached sources or saved content. **This is not a subscription expiry policy.**

Two useful replicas on independent machines can improve availability. Multiple servers under one operator remain dependent on that operator. DNS/gateway independence still requires working IP routes and reachable name/content sources. General discovery, automatic global membership and independent-host outage acceptance are not provided by this change.

## Prepare an included-network download

Follow the [developer packaging instructions](developer.md). Save the complete code as one line in a file outside the repository, then:

```sh
python scripts/package-windows.py --runtime ELECTRON_DIRECTORY --out dist --network-code-file ../network-code.txt --network-name "My Mesh Network"
```

The output filename ends in `-Connected.zip`. Only that output package receives the invitation; public source defaults remain empty. It exposes the advertised addresses to recipients and creates no server by itself.

## Authority backup and paid services

Keep `network-authority.private.json` in a private backup. Never include it in a reader package, mirror or public repository. Losing the key prevents updates under that identity; restoring an old revision counter can create rejected/conflicting revisions. A compromised key requires a new invitation through a separately trusted channel; automatic key rotation is not implemented.

You can operate a managed service and provide capacity/support. This release implements no billing, one-time redemption, device license or server-side subscription enforcement. Selling a reusable code does not make it uncopyable. Paid access requires a separate authorization design and an outage policy; a mandatory central license check on every launch would undermine disaster access.
