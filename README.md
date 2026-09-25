# ArNS Mesh

**A desktop browser for opening ArNS names through verified peer and raw Arweave content, without redirecting to a gateway domain.**

The aim is continued access when ordinary domains, DNS or gateways are unavailable **but IP connectivity and reachable data sources still exist**. Enter `ar://name`; the app finds the target, retrieves the content and checks its identity and signature before displaying it. It cannot recover data that no reachable source holds.

**Current public release: [0.5.0-preview.7](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.7)** · [Windows download](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.7/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.7.zip) · [Türkçe](README.tr.md)

This is an experimental, independent community project, not an official AR.IO, Arweave or Solana release. Live name resolution still depends on numeric-IP Solana RPC observations. Universal first discovery and independent-host failover remain unfinished.

## Start here

| Your goal | What you need | Guide |
|---|---|---|
| Browse ArNS sites | Windows x64 app + working connection-profile JSON | [Desktop setup](#install-and-use-the-windows-app) |
| Help readers access data | Reachable Linux VPS or Raspberry Pi + storage + upstream sources | [Supporter setup](#run-a-supporter-on-a-vps-or-raspberry-pi) |
| Develop or build Mesh | Source + Node.js/npm/Git; Electron for desktop development | [Developer guide](docs/en/developer.md) |

Readers do **not** need their own server, indexer, Node.js installation, Chrome extension or wallet. Installing the desktop does **not** automatically make it a public serving peer. The Linux supporter is a separate program.

## What makes this approach useful?

- **No gateway-domain redirect:** the running client uses configured numeric-IP sources. Failed retrieval does not silently fall back to an ordinary gateway.
- **Verification on the reader's device:** content IDs, signatures and integrity are checked locally. This is separate from trusting the RPC observation of the name's current target.
- **Content and location sharing:** supporters can retain verified bytes and records describing where Arweave items can be fetched. Useful copies on independent machines can reduce dependence on one operator.
- **Arweave assets in existing pages:** supported immutable `https://arweave.net/<id>` and `/raw/<id>` resource URLs are handled inside the browser through Mesh/raw Arweave. That spelling in the original page does not mean a gateway connection is made. Arbitrary HTTPS sites and gateway APIs are not supported by this handler.
- **Explicit saved copies:** saving follows manifests and detected static Arweave references. Saved mode reads retained, verified local files; incomplete copies remain labelled as incomplete.

Mesh explores an additional access route during disruptions. It does not replace Arweave storage, implement a full Solana validator, or guarantee that every existing website remains fully functional.

## How a name becomes a page

1. **Find initial sources:** a connection profile supplies numeric IP addresses and ports. There is no automatic public supporter directory in this preview.
2. **Resolve the name:** read ArNS/ANT account observations through an IP-based Solana RPC; check expected account ownership, address derivation and data format locally. This is not an independent account-inclusion proof.
3. **Locate content:** use local/peer location records and available index/raw discovery routes. A location record says where to look; it is not the file itself or proof of valid bytes.
4. **Fetch and verify:** obtain Mesh content or raw Arweave data and check the requested full ID, signature and integrity.
5. **Open the page and supported assets:** render in an isolated session. On a related asset location miss, preview.7 can search a bounded range of native blocks near the known page location, then verify the downloaded asset.
6. **Optionally save:** retain the dated name mapping and detected files. Later saved access does not claim to show the newest live version.

[Architecture and trust](docs/en/architecture.md) · [Resource discovery and limits](docs/arweave-resources.md)

## What preview.7 has actually demonstrated

In real Windows tests with DNS, gateway HTTPS and DoH blocked by OS rules, four public main documents opened: `vevivo`, `internetfireplace`, `permahistory` and `kh-laboratory`. Internet Fireplace's missing font, video and audio were found through raw Arweave and signature-verified; video and audio played. **The existing Mesh source and IP-based RPC were available in this media test.**

![Actual Windows outage test: Internet Fireplace inside ArNS Mesh](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.7/resource-dns-cut-internetfireplace.png)

Actual test capture, not a live feed. 131 source tests passed on Linux and Windows. [Live run](https://github.com/Vevivo/arns-mesh/actions/runs/36088804178) · [Successful repeat](https://github.com/Vevivo/arns-mesh/actions/runs/36089374969) · [Build and exact artifact scope](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.7)

Earlier tests blocked the original Mesh source and used local replicas plus remote raw nodes. The replicas were on one Windows machine; they do **not** establish independent-provider resilience. External CDN features in `permahistory` remained unavailable. [Outage evidence](docs/disaster-network.md)

## Install and use the Windows app

### You need two files

| File | Source | Purpose |
|---|---|---|
| `ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.7.zip` | [GitHub release](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.7) | Ready-to-run desktop and bundled browser engine |
| A connection-profile JSON, for example `mesh-connect.json` | A supporter operating usable sources | Initial Mesh, RPC and optional raw Arweave service addresses |

**The public ZIP has no preconfigured operator endpoints.** The example JSON in the repository contains nonworking documentation addresses. A new user needs a working profile before opening live names. If you already configured Mesh on this computer, a normal update retains the separately stored profile.

1. Download the **Windows ZIP**, not GitHub's **Source code (zip)**. Only Windows x64 has a published desktop package in this release.
2. Extract the **whole** ZIP into a folder; open `Mesh-Browser.exe`. No separate Node.js or Chrome installation is needed. This community preview is unsigned; [the user guide](docs/en/user.md) explains checksum verification and Windows warnings.
3. Get `mesh-connect.json` from your supporter. If you do not know one, [request a profile](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). This is volunteer coordination, not an instant service or availability guarantee.
4. Choose **Settings → Import connection profile**. **Connect to Mesh** opens automatically on a fresh installation. Imports add sources by default; replacement is an explicit choice.
5. Use **Check connections**, then enter a bare name or `ar://name` in **Mesh's own address bar**. Enter and the arrow button open it. An endpoint responding does not guarantee every page is available.
6. Watch **Resolve name → Find sources → Locate content → Download → Verify → Open page**. Open **Page information** for missing files and verification details. Initial discovery can be slower than repeat access.

Use `+` for tabs and the star for bookmarks. **A bookmark does not save the page.** Choose **Save current page** and wait for the result; open that copy in **Saved** mode later. Dynamic URLs, third-party APIs and non-Arweave CDNs are outside complete-save guarantees.

To update, close the old app, retain its folder and a user-data backup, then extract the new ZIP into a different folder. Settings normally live in `%APPDATA%\ArNS-Mesh-Browser`. [Full user guide and troubleshooting](docs/en/user.md)

## The connection-profile file

This small JSON is a **list of starting addresses**, not a website archive, wallet, login or access token.

| Field | What the operator supplies |
|---|---|
| `directPeers` | Reachable Mesh supporter IP:port addresses |
| `rpcSources` | Permitted numeric-IP Solana RPC services for live name observations |
| `arweavePeers` | Optional raw Arweave node IP:port addresses for direct retrieval/discovery |

At least one RPC and at least one Mesh **or** raw Arweave source are required. For the raw discovery path demonstrated in preview.7, working raw Arweave sources must be configured. Mesh, RPC and raw Arweave are **different services**; putting your Mesh port into all three fields does not create them.

Profiles accept literal IP:port entries, not domains, HTTPS URLs, credentials or URL paths. Include only endpoints intended for recipients to use. The format has no private-access approval mechanism. **Export profile** exports addresses only; it does not start a server or export saved pages. [Profile format and sharing](docs/en/connections.md)

## Why run a supporter?

A supporter gives readers another place to find useful records and verified content. It can observe name/target changes, perform bounded raw indexing, copy content and location records from configured peers, and answer requests. Its connection to the desktop is straightforward: **users import a profile containing its reachable Mesh address, then the desktop requests data from it.**

The operator maintains reachability, storage and upstream sources, monitors errors/quotas, backs up peer identity/data and distributes an accurate profile. A developer can contribute code without operating a server; an operator can support the network without changing code. This repository has no automatic reward/payment mechanism.

A running empty peer is not a complete backup. Useful records and bytes must actually accumulate, and temporary cached data can be evicted. Moving a single VPS to a single Pi still leaves one point of failure. Availability benefits require useful copies on independently reachable machines.

## Run a supporter on a VPS or Raspberry Pi

Both use the **headless Node.js peer**, not the Windows ZIP. No domain, nginx or TLS certificate is required by this direct-IP setup. It does not install a full Solana or Arweave node.

| Platform | Preparation |
|---|---|
| Ubuntu VPS | Separate ordinary user/project directory, Node.js 24 LTS + npm + Git, persistent disk, unused reachable TCP port |
| Raspberry Pi | 64-bit Linux such as Raspberry Pi OS Lite, ARM64 Node.js + npm + Git, persistent storage, stable power/network, reachable IP route |

**Real Pi hardware acceptance is pending.** Behind a home router, port forwarding/public addressing may be needed. CGNAT can prevent inbound access; direct mode has no automatic NAT traversal/relay. A LAN address is not necessarily reachable by Internet users.

The [step-by-step VPS/Pi guide](docs/en/supporter.md) covers OS/runtime preparation, networking, background service, quotas, backup and updates. After preparing the host and placing a working **upstream** profile beside the new checkout:

```sh
git clone --branch v0.5.0-preview.7 --depth 1 https://github.com/Vevivo/arns-mesh.git arns-mesh
cd arns-mesh
node scripts/profile.mjs check ../mesh-upstream.json
bash scripts/install-peer.sh ../mesh-upstream.json
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Run as the intended ordinary user in a fresh project directory. These default paths assume no `MESH_INSTALL_ROOT`/`XDG_DATA_HOME` override. The upstream profile points to services **your peer can use**; an empty peer pointing only at itself does not acquire content. Installation downloads dependencies, so prepare before a disruption. The basic installer does not open ports or change existing services.

The default listener is **TCP 49741**. Permit that selected port in your provider/OS firewall or router as appropriate. In a second terminal run `node scripts/probe-peer.mjs 127.0.0.1:49741`, then repeat from another network using the public IP. A response is only the first check; [verify actual content and counters](docs/en/supporter.md#4-check-that-other-people-can-use-it) before describing it as useful redundancy.

### Create the file users will import

After external access works, create a **reader profile** containing **your new public Mesh address** and permitted RPC/raw sources. These are nonworking documentation addresses; replace all of them:

```sh
node scripts/profile.mjs --peer 192.0.2.20:49741 --rpc 198.51.100.20:8899 --arweave 203.0.113.30:1984 --output ../mesh-connect.json
node scripts/profile.mjs check ../mesh-connect.json
```

Repeat options for additional sources. Give users `mesh-connect.json`, the Windows download link and **Settings → Import connection profile** instructions. Do not send the whole server data directory or peer identity. The upstream file you received may list only other people's peers; sharing it unchanged would not add yours. [Operator-to-user handoff](docs/en/supporter.md#5-give-users-a-profile)

## Limits and next work

| Area | Current boundary |
|---|---|
| Live names | IP-based Solana RPC trust; no independent account-inclusion proof or guaranteed instant freshness |
| Unknown content | General discovery is incomplete; some earlier catalogs used external Turbo/Goldsky preparation, whose provenance remains relevant |
| Related-asset discovery | Known parent location required; anchor plus up to 64 preceding blocks/256 transactions per block, outer bundle headers, 3 minutes, 96 MiB reserved per scan and 256 MiB/day reader allowance |
| Large files | 32 MiB signed-object limit; verified large-file streaming is unfinished |
| Saved sites | Manifests and bounded detected static Arweave references, not every dynamic URL or external service |
| Resilience | No automatic global peer directory/replication; independent-host failure acceptance and full packet capture remain pending |
| Privacy | Direct IP is not an anonymity service; Mesh/RPC HTTP is unencrypted |

Prepare the app and several usable sources before a disruption and save important pages. No design can retrieve a missing file from an unreachable network. [Status](docs/en/status.md) · [Privacy](docs/en/privacy.md)

## Developers and contributors

[Download preview.7 source](https://github.com/Vevivo/arns-mesh/archive/refs/tags/v0.5.0-preview.7.zip) or clone the repository. Source archives are not ready-to-run desktop packages. Use the lockfile, isolated data and the [developer guide](docs/en/developer.md) for tests, Electron and packaging. This release is a standalone desktop; it does not install a Wayfinder Chrome extension or add a P2P toggle to another browser.

Useful contributions include general location coverage, independent replication, name-update/RPC reliability, resource budgets, large-file verification and Windows/Pi outage evidence. Label measured results, fixtures and unfinished features separately.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Apache-2.0](LICENSE) · [Attribution](NOTICE.txt)
