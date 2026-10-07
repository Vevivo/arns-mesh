# Run an independent Mesh supporter

[Türkçe](../tr/destekci.md) · [Home](../../README.md) · [VPS](vps.md) · [Raspberry Pi](raspberry-pi.md)

A supporter keeps ArNS name observations and verified files on its own server, follows updates while sources are reachable, and serves readers when another supporter is unavailable. **Join the same Mesh network; you do not create a separate code for its readers.**

Use Mesh **0.6.0** on both supporters and readers for independent discovery. A 0.5.1 reader can use previously learned routes, but does not gain the new discovery mechanism without upgrading.

## Before you start

Use a new Linux server or 64-bit Raspberry Pi with an SSD, a normal user account, systemd, sudo, Git and [Node.js 24 LTS with npm](node-setup.md). Choose a public numeric IP and an unused TCP port; examples use **49741**. Incoming TCP access and outgoing UDP for discovery must work. CGNAT needs a reachable public route; the installer does not change routers or firewalls.

The default setup joins the **existing community Mesh network** from its bundled, authority-signed public definition. You do not need to ask the first operator for a code or private key. Readers keep using the same supported community code. For a different network, add `--network YOUR_CODE` with its self-contained invitation. See [the community network](../community-network.md) and [network codes](network-code.md).

| Installation profile | Site storage | Automatic cache | R84 index and refresh allowance | Fresh-install free space |
|---|---:|---:|---:|---:|
| `vps` (default) | 64 GiB | 16 GiB | 50 GiB | **134 GiB** including 4 GiB headroom |
| `pi` (SSD) | 16 GiB | 4 GiB | 50 GiB | **74 GiB** including 4 GiB headroom |

These are explicit storage allowances, not promises to hold every site. Both profiles track and queue up to 20,000 site records, collect names continuously, mirror accepted name records and prepare verified content. The Pi profile has less room for complete copies. Its real-hardware acceptance is still pending.

The peer's memory limit is 1 GiB for VPS or 768 MiB for Pi; the separate index updater has a 384 MiB limit. Leave room for the OS and other applications. Check the provider's transfer allowance: incoming budgets are separate, and outgoing service traffic is additional.

## Install

Run as the ordinary supporter account. Replace the sample IP with **your own reachable IP**, keeping the port aligned with your firewall/router.

```bash
git clone https://github.com/Vevivo/arns-mesh.git arns-mesh-supporter
cd arns-mesh-supporter
git checkout --detach v0.6.0
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
bash scripts/setup-supporter.sh --advertise YOUR_PUBLIC_IP:49741 --capacity vps
```

For a Pi, use `--capacity pi`. Add `--dry-run` to check the plan and disk allowance without installing or starting services.

The setup performs the whole supporter path:

1. Checks the invitation, available storage and preparation settings before installation.
2. Installs locked source dependencies and the supporter under `~/.local/share/ArNS-Mesh-Supporter`, with its own identity.
3. Enables continuous names, broad target scans, accepted-record replication and automatic file preparation.
4. Installs the signed **R84 location-index updater** under a separate account, enables its refresh timer and starts the first download.
5. Starts the supporter user service and enables startup after logout/reboot.

Stop if a command fails. If an upstream is unavailable during first index configuration, existing data is kept; rerun once that source returns. A partially completed setup is not a ready replacement. [R84 details and errors](../shared-index.md).

Existing identities, connection files and explicit settings are preserved. The setup refuses to silently replace an unrelated service, use a disabled preparation profile, change an existing advertised address, or update a running supporter. Review existing small budgets before migrating an older installation.

## Let readers find this server

The advertised IP is your server's address; the **network code identifies the shared network**. They are different things. Mesh advertises and discovers supporter addresses within that network, including through its signed numeric-IP rendezvous configuration when the first server is unavailable. An address announcement never grants authority to change an ArNS name.

Readers on 0.6.0 keep the same supported network code. The original operator does not have to distribute a second developer's separate code or approve each server. The discovery routes themselves still need to be reachable; no network can discover an address with no available communication path.

Check the TCP endpoint from another network:

```bash
node scripts/probe-peer.mjs YOUR_PUBLIC_IP:49741
```

A successful probe proves reachability only. Preparation and independent serving must also pass the next checks.

## Check preparation, then prove independent serving

```bash
MESH_ROOT="$HOME/.local/share/ArNS-Mesh-Supporter"
node scripts/check-supporter.mjs --data "$MESH_ROOT/data" --json
node scripts/operator.mjs --data "$MESH_ROOT/data" --json
systemctl --user status arns-mesh-supporter --no-pager
systemctl status arns-mesh-index-sync.service --no-pager
```

The first download and content preparation run in the background. The local readiness command returns exit code 2 because it cannot prove reachability from another machine. Its `locallyPrepared` field describes local preparation; the separate reader command below provides the pass/fail serving result. Expect a pending state at first. Check accepted name records, verified complete file sets, remaining queue, storage/download budgets, index freshness and advertised reachability. Counts of names or index entries are not counts of fully retained websites.

**Finish with the [independent supporter check](resilience.md).** It uses a separate reader and excludes the original server, so the working network remains available. Do not describe a supporter as ready merely because its service is running.

## Operations and updates

Settings: `~/.local/share/ArNS-Mesh-Supporter/peer.env`. Foreground and service starts read the same settings. Logs: `journalctl --user -u arns-mesh-supporter -n 30 --no-pager`.

For an update, stop this supporter, back up its data privately, select the reviewed release and rerun setup. Keep the previous application/data for rollback. Managed services can be installed again without duplicating units; unrelated units are preserved. Never clone a live peer's private identity onto a second server.

[Status](status.md) · [Discovery protocol](shared-network.md) · [Configuration reference](supporter-advanced.md)
