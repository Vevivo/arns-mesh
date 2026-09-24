# Supporters — VPS and Raspberry Pi

[Türkçe](../tr/destekci.md) · [Desktop users](user.md) · [Home](../../README.md)

A supporter runs the **headless Node.js peer**, not the desktop browser, on a Linux machine. It can serve cached verified bytes, share location hints, observe ArNS/ANT targets and discover locations from raw bundle headers. A reader connects to these peers using a profile. You can also use the desktop on a separate Windows computer.

An extra machine helps only when readers/other peers can reach it and it has useful content or records. An empty peer with no working upstream sources is not a replica. This preview uses explicitly configured numeric-IP peers: new nodes are **not automatically enrolled in a public global directory**. Operators exchange connection profiles. Direct mode has no built-in NAT traversal or relay; do not assume DHT code in the repository makes direct-mode discovery automatic.

## 1. Prepare the host

### Ubuntu VPS

Use a separate ordinary Linux account and project directory. Install Git, Node.js 24 LTS and npm before a disruption. Existing Node.js 22.12+ can run the core, but tests use Node.js 24. The installer does not replace system Node, nginx, certificates, existing peers or firewall rules. Do not run it over an existing production data directory.

Check prerequisites:

```sh
uname -m
node --version
npm --version
git --version
```

Choose an unused incoming **TCP** port; the installer defaults to **49741**. The low-level entrypoint's fallback port is 49740, so specify a port explicitly when running it manually.

### Raspberry Pi

Use a Pi capable of a 64-bit Linux OS. A Pi 4/5 with 4 GB RAM is a conservative starting choice, **not a measured minimum or a hardware-compatibility claim**. Install Raspberry Pi OS Lite **64-bit** with [Raspberry Pi Imager](https://www.raspberrypi.com/software/). Configure a user and SSH in Imager; use the [official setup](https://www.raspberrypi.com/documentation/computers/getting-started.html) and [SSH](https://www.raspberrypi.com/documentation/computers/remote-access.html) guides. Install the **Linux ARM64** build of Node.js 24 LTS from [Node.js downloads](https://nodejs.org/en/download), plus npm and Git. `uname -m` should report `aarch64` for this route.

Prefer an SSD for sustained catalog/index writes. Keep a backup of the peer data. This repository does not install a full Solana or Arweave node on the Pi. It still requires reachable configured RPC/content sources. The native dependency import check below must pass on your Pi; real Pi hardware validation is pending.

## 2. Get the source and a profile

```sh
git clone https://github.com/Vevivo/arns-mesh.git
cd arns-mesh
```

Private repositories require access granted by their owner. GitHub/npm domains are used for installation; they are not part of the running Mesh access path.

Obtain a connection profile from an existing supporter, or create one using actual numeric service addresses:

```sh
node scripts/profile.mjs --peer 192.0.2.10:49741 --rpc 198.51.100.20:8899 --arweave 203.0.113.30:1984 --output ../network-profile.private.json
node scripts/profile.mjs check ../network-profile.private.json
```

**All addresses above are nonworking documentation examples. Replace them.** Repeat `--peer`, `--rpc` or `--arweave` to add endpoints. RPC is not the Mesh port and not just any web server. It must expose the supported Solana JSON-RPC methods over HTTP on a literal IP. A normal HTTPS provider hostname or an API-key URL cannot be pasted into this profile. Running a Mesh peer does not provide Solana RPC.

At least one RPC and at least one Mesh peer or raw Arweave source are required by the profile validator. Raw sources are optional for a replication-only source set; without them, raw bundle scanning cannot produce new locations. No live default sources are bundled. A profile is validated structurally, not certified online or independent.

## 3. Install and start

```sh
bash scripts/install-peer.sh ../network-profile.private.json
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Default layout:

| Path below `~/.local/share/ArNS-Mesh-Supporter` | Purpose |
|---|---|
| `releases/<version>-<time>/app` | Versioned program and locked dependencies |
| `data` | Persistent profile, peer identity, catalog, index and content |
| `Start-Peer.sh` | Starts the selected release |
| `Start-Peer.sh.previous` | Previous launcher after an update |

For a different directory, set `MESH_INSTALL_ROOT` consistently for installation and service setup. For a different port, start with `MESH_LISTEN=0.0.0.0:49742` before the launcher. Never run two processes against the same data directory. Stop the foreground process with **Ctrl+C**.

The installer uses `npm ci --omit=dev --ignore-scripts`; it does not execute dependency install scripts. Verify native imports before enabling a service:

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node scripts/doctor.mjs ../network-profile.private.json
```

This doctor checks configuration and local dependencies only; it does not establish reachability or content coverage.

## 4. Check that other people can use it

First test from the same host:

```sh
node scripts/probe-peer.mjs 127.0.0.1:49741
```

Then run the same command from **another network**, with your server's actual public numeric IP and port. A local success does not prove Internet reachability.

For a VPS, allow only the selected incoming TCP port in the provider firewall and OS firewall according to your existing policy. For a Pi behind a router, forward that port to the Pi if you have a public IPv4 address, or deliberately configure reachable IPv6 and its firewall. Under carrier-grade NAT, port forwarding may be insufficient; this direct-mode installer has no automatic relay. Do not change unrelated rules or expose SSH/admin interfaces just to make the peer work.

The probe is a cache-only location request. A valid `location_not_found` response proves a responding Mesh endpoint, **not** a complete index or a served website. For a content check, import a profile containing your new peer into a clean desktop data profile, open an unprepared name, inspect the real result and watch server counters. Repeat with other peers removed from that **test profile** to attribute the result. Do not modify a working production profile for this check.

JSON `peer-status` events arrive about once a minute. Useful fields:

| Field | Interpretation |
|---|---|
| `requestsServed` | Endpoint requests, including misses; not successful page count |
| `contentBytesServed`, `contentChunksServed` | Content sent to clients |
| `cachedContent`, `indexLocations` | Local content/item-location counts; not global coverage |
| `catalog.completed`, `catalog.meshReplicated`, `catalog.lastSuccess` | Completed fetch/replication progress |
| `catalog.catalogError`, `catalog.lastError` | Name refresh versus content-work failures |
| `discovery.locationsAdded`, `discovery.lastError` | Raw discovery progress/errors |

## 5. Give users a profile

Create a reader profile with your reachable Mesh address and approved RPC/raw sources using the same profile command. Give the JSON to users; they use **Settings → Import connection profile**. Give it to other supporters to add your node to their configured peers. Do not share the entire `data` directory or identity files.

Profiles expose the service addresses they contain. Only include endpoints you intend recipients to use. Multiple independent peers are preferable; keep their relevant bytes and location records populated. This software does not currently perform automatic global replication, peer enrollment or guaranteed failover of every RPC operation.

## 6. Optional background service

Stop the foreground process first, then:

```sh
bash scripts/install-user-service.sh
systemctl --user status arns-mesh-supporter
journalctl --user -u arns-mesh-supporter -n 30 --no-pager
```

This creates a separate **user** service; it refuses to overwrite an existing unit. On a headless VPS, an administrator may need to run `sudo loginctl enable-linger YOUR_USER` so that this user's service can survive logout/start at boot. Replace `YOUR_USER` with the intended ordinary account. This is an explicit host-administration step, not performed by the installer.

Optional settings go in `~/.local/share/ArNS-Mesh-Supporter/peer.env`, one assignment per line:

```text
MESH_LISTEN=0.0.0.0:49741
ARNS_INDEX_DAILY_MIB=64
ARNS_CATALOG_DAILY_MIB=64
ARNS_INDEX_PARTITION=0/1
```

Restart only this service after changes: `systemctl --user restart arns-mesh-supporter`.

The service starts with `CPUQuota=25%`, `MemoryMax=512M` and a Node heap limit of 384 MiB. These are configured caps, not measured requirements; host cgroup support matters. Content storage defaults to 256 MiB automatic plus 512 MiB pinned. Index shards, dependencies and logs are additional disk usage. Use `du -sh ~/.local/share/ArNS-Mesh-Supporter/data` and systemd/journal tools to monitor actual growth.

The raw scan and catalog each default to 64 MiB/day of their accounted response traffic. These are **not a total bandwidth cap**: serving clients, retries/other tasks and protocol overhead can add traffic. Catalog name observation and content fetches currently share the catalog budget; exhaustion can delay both. Registry refresh is scheduled at about six-hour intervals with incremental ANT work, not an instant update guarantee. See [architecture](architecture.md).

For coordinated raw-index work, operators can choose complementary partitions such as `0/2` and `1/2` on **fresh separate scan states**. This distributes block-height work; it is not automatic scheduling or proof of full coverage. Do not change an existing partition in place; retain the old data and start a separate data directory.

## 7. Update, rollback, backup, remove

1. Stop this peer (Ctrl+C or `systemctl --user stop arns-mesh-supporter`).
2. Back up the complete `data` directory privately while stopped, including its identity. Also preserve the old launcher. Do not start clones of one identity as if they were independent peers.
3. Review/update the source checkout, then rerun `install-peer.sh` with your profile path. It creates a new release and preserves existing connection files and data.
4. Restart and check the counters/errors. If it fails, stop the process, restore `Start-Peer.sh.previous` as `Start-Peer.sh` and restart. If a release changed data schemas, use the matching private data backup too; launcher rollback alone is insufficient.

To change the profile intentionally, stop the peer and run `node scripts/profile.mjs apply PROFILE.json "$HOME/.local/share/ArNS-Mesh-Supporter/data"`, then restart.

To uninstall a user service:

```sh
systemctl --user disable --now arns-mesh-supporter
rm -- "$HOME/.config/systemd/user/arns-mesh-supporter.service"
systemctl --user daemon-reload
```

Adjust the path if `XDG_CONFIG_HOME` was customized. Remove program releases and launchers only after stopping. Preserve `data` unless you intentionally want to erase identity, index and content. Undo only firewall/port-forward/lingering changes you specifically introduced for this peer; other projects may use the same host/user settings.

## What remains unproven

Pi hardware performance, a complete hostile-network acceptance run and multi-independent-host outage recovery are pending. Earlier warm-peer successes are not evidence that a newly installed empty peer can independently discover every ArNS location. Published snapshots are incomplete and some deployed catalogs were prepared using external Turbo/Goldsky services. [Status](status.md) lists these separately.
