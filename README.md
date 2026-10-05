# ArNS Mesh

**Open ArNS websites through a network of supporters.**

[Windows download](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.13/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.13.zip) · [Start using Mesh](docs/en/user.md) · [Run a supporter](docs/en/supporter.md) · [Türkçe](README.tr.md)

## What is Mesh?

ArNS Mesh is an independent community project for reading ArNS websites. Type `ar://name` into the Windows browser. Mesh finds the name's content, retrieves available files and checks their identity and signatures before displaying them.

Its purpose is to keep useful copies and routes available when ordinary domain or gateway access is disrupted. The reader uses numeric-IP sources; it does not redirect the page to `name.ar.io` or another gateway domain. Internet connectivity to a useful source is still required.

## Choose how to participate

| I want to… | What I need | Guide |
|---|---|---|
| Try Mesh and browse sites | Windows x64, the application ZIP and an operator's connection code | [User guide](docs/en/user.md) |
| Contribute storage and bandwidth | A reachable Linux VPS or a 64-bit Raspberry Pi | [Supporter guide](docs/en/supporter.md) |
| Understand or develop the software | The matching source revision and an isolated development environment | [Developer guide](docs/en/developer.md) |

A browser installation is a **reader**. A supporter runs a separate service on a server or Pi. Installing two browsers does not create two content-serving supporters.

## How it works

1. **Find the name:** obtain its target from available RPC observations or an accepted, dated record.
2. **Find the content:** use Mesh supporters, stored location records and reachable raw Arweave sources.
3. **Verify and open:** check the retrieved content, then display the page and supported resources.

Supporters retain three different things: **name-to-content records, content locations, and actual files**. All three have a role. A large location index does not itself contain the websites.

### The R84 improvement

The supporter can read signed indexes introduced by AR.IO Release 84 from its own disk. This makes more content locations available without waiting for each website to be downloaded in the background. The existing preview.13 browser can use these replies.

The separate index updater uses HTTPS while preparing files; ordinary Mesh navigation reads the installed index through the supporter. Users do not download this large index. [How to add R84 indexes to a supporter](docs/shared-index.md).

## Download and first use

1. Download the **[Windows x64 application ZIP](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.13/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.13.zip)**.
2. Extract the entire ZIP and open `Mesh-Browser.exe`.
3. Obtain a complete `mesh1.` connection code from a trusted operator. Open **Settings → Mesh connection code → Check code → Join this network**.
4. Enter an ArNS address such as `ar://vevivo` in Mesh's address bar.

The standard public ZIP contains no connection code. Existing installations keep their connection settings. Codes are reusable network invitations; no wallet, payment or activation licence is needed. [Connection help](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml).

You do not need to operate a server or store the shared index to browse. The current browser does keep local settings, browsing state and a content cache; manually saving pages retains additional files. There is no zero-storage mode in this preview. [Storage details](docs/en/user.md#storage-on-your-computer).

## Keeping access alive when a supporter stops

Preview.13 learns reachable supporters after joining the network and can switch content sources. To help during an outage, another independent machine must already hold the relevant files and accepted name records, and readers must know a reachable route to it.

**Discovery is implemented; automatic placement and repair of independent replicas are not.** A new empty server does not become a complete backup merely by joining. Follow the [preparation and failover guide](docs/en/resilience.md) before describing a supporter as a backup.

## Current release and evidence

**Windows: v0.5.0-preview.13, a community prerelease.** This documentation does not declare a stable 1.0 release or replace the published application.

The server guide pins the source revision containing the deployed R84 integration. The source on `main` still has the older preview.8 runtime; use the pinned commands in the guide when installing a new supporter. [Release notes and checksum](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.13) · [Evidence and remaining work](docs/en/status.md).

Supported sites still depend on available name records and files. External APIs/CDNs can be unavailable, and verified historical content may not represent the latest name target.

## Documentation

- **Use:** [Windows](docs/en/user.md) · [Network monitor](docs/connection-monitor.md)
- **Support:** [Start here](docs/en/supporter.md) · [VPS](docs/en/vps.md) · [Raspberry Pi](docs/en/raspberry-pi.md) · [R84 indexes](docs/shared-index.md) · [Failover preparation](docs/en/resilience.md)
- **Develop:** [Source and checks](docs/en/developer.md) · [Architecture](docs/en/architecture.md) · [Peer discovery](docs/en/shared-network.md)
- **Project:** [Status](docs/en/status.md) · [Feedback](CONTRIBUTING.md) · [Privacy](docs/en/privacy.md) · [Security](SECURITY.md) · [Licence](LICENSE)

ArNS Mesh is not an official AR.IO, Arweave or Solana distribution.
