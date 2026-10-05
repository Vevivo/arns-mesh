# ArNS Mesh

**Open ArNS sites without domains or DNS.**

[Download Mesh 0.5.0 for Windows](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0/ArNS-Mesh-Browser-Windows-x64-0.5.0.zip) · [User guide](docs/en/user.md) · [Run a supporter](docs/en/supporter.md) · [Türkçe](README.tr.md)

Enter `ar://name` in Mesh. It finds the content named by the record, verifies the files and opens the site. The access path uses numeric addresses instead of a gateway domain or DNS resolution.

## Start using Mesh

1. Download the Windows ZIP above and extract the whole folder.
2. Open `Mesh-Browser.exe`.
3. Enter your operator's complete `mesh1.` code under **Settings → Mesh connection code → Check code → Join this network**.
4. Enter `ar://vevivo` or the ArNS name you want to open in the address bar.

No wallet, payment, Node.js installation or personal server is required. The standard package does not include an operator's connection code. [Connection help](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml).

## What if Solana RPC and Arweave are unavailable too?

**Content with retained name records and files remains accessible through Mesh.** The reader obtains the accepted name record and verified files from a reachable supporter. The reader does not need to have visited the site before.

On 6 October 2026, a reader and supporter were isolated together from external networks. RPC, Arweave and external DNS addresses were unreachable; an initially empty reader opened the main content for 29 of 35 names. All 22 records marked ready passed verification of their retained file sets. [Test procedure and results](docs/validation/upstream-outage-2026-10-06.md).

A file absent from every reachable supporter cannot be retrieved during the outage. A retained name record describes a previously observed version.

## How Mesh works

- **While sources are available:** supporters prepare name records and content. R84 indexes help locate files on Arweave.
- **When a reader opens a site:** Mesh retrieves files from available sources and verifies their identities and signatures.
- **During an upstream outage:** retained names and files continue to travel through Mesh.

Large indexes stay on supporter servers. The Windows reader keeps bounded local caches and settings. [Local storage](docs/en/user.md#data-on-your-computer).

## Support the network

Run a supporter on a VPS or Raspberry Pi to serve name records, content locations and files. Independent supporters help preserve access when another server goes away.

**[VPS setup](docs/en/vps.md)** · **[Raspberry Pi setup](docs/en/raspberry-pi.md)** · [R84 index setup](docs/shared-index.md) · [Prepare another server for takeover](docs/en/resilience.md)

## Developers

The desktop and supporter share the **0.5.0** source tree. `main` contains the current implementation; use tag `v0.5.0` to reproduce the release.

[Development and checks](docs/en/developer.md) · [Architecture](docs/en/architecture.md) · [Release notes](docs/en/release-notes.md) · [Status](docs/en/status.md) · [Privacy](docs/en/privacy.md) · [License](LICENSE)

ArNS Mesh is an independent community project, not an official AR.IO, Arweave or Solana distribution.
