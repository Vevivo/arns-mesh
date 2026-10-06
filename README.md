# ArNS Mesh

**Open ArNS sites without domains or DNS.**

[Download Mesh 0.5.1 for Windows](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.1/ArNS-Mesh-Browser-Windows-x64-0.5.1.zip) · [User guide](docs/en/user.md) · [Run a supporter](docs/en/supporter.md) · [Türkçe](README.tr.md)

Enter `ar://name` in Mesh. It finds the content named by the record, verifies the files and opens the site. The access path uses numeric addresses instead of a gateway domain or DNS resolution.

## Start using Mesh

1. Download the Windows ZIP above and extract the whole folder.
2. Open `Mesh-Browser.exe`.
3. Enter your operator's complete `mesh1.` code under **Settings → Mesh connection code → Check code → Join this network**.
4. Enter `ar://vevivo` or the ArNS name you want to open in the address bar.

No wallet, payment, Node.js installation or personal server is required. The standard package does not include an operator's connection code. [Connection help](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml).

## Find sites by topic

Use the **middle search box** on Home for topics such as music, games or storage. Results include ArNS addresses, descriptions and topic labels. Click a result to open it. The upper address bar still opens a known name directly. [Search guide](docs/topic-search.md).

## Keep names and sites up to date

Supporters with automatic preparation enabled continuously check for new ArNS registrations and changes to existing names, retain the observed name records, and fetch and verify site files in the background. Healthy Solana RPC and Arweave access routes remain in use. Updates continue within the server's storage, bandwidth and processing limits. [How continuous preparation works](docs/en/continuous-preparation.md).

## If Solana RPC or Arweave access routes are interrupted

**Mesh provides an alternative access route through reachable supporters.** If a reader cannot reach Solana RPC, it can obtain an accepted name record from Mesh. If direct Arweave access fails, it can obtain the corresponding verified files from Mesh. The reader does not need to have visited the site before.

A supporter that still reaches live sources can continue preparing updates. If the reader and its reachable supporters all lose those routes, Mesh can serve the name records and files already retained, using the last acquired version. A name record identifies the content; complete site access also requires the corresponding files on a reachable source. R84 helps locate content, while supporters retain and serve the files themselves.

This scenario concerns interrupted **access routes to external services**. On 6 October 2026, an isolated reader/supporter test exercised this fallback with a selected sample of names. Its sample size is not the network's catalogue size or capacity. [Test scope, counts and results](docs/validation/upstream-outage-2026-10-06.md) · [Preparation status](docs/en/status.md).

## How Mesh works

- **While access routes are working:** supporters keep checking names and preparing verified content. R84 indexes help locate files on Arweave.
- **When a reader opens a site:** Mesh retrieves files from available sources and verifies their identities and signatures.
- **If upstream access routes fail:** reachable Mesh supporters continue serving retained names and files; any supporter with working upstream access can continue preparing updates.

Large indexes stay on supporter servers. The Windows reader keeps bounded local caches and settings. [Local storage](docs/en/user.md#storage-on-your-computer).

## Support the network

Run a supporter on a VPS or Raspberry Pi to serve name records, content locations and files. Independent supporters help preserve access when another server goes away.

**[VPS setup](docs/en/vps.md)** · **[Raspberry Pi setup](docs/en/raspberry-pi.md)** · [R84 index setup](docs/shared-index.md) · [Prepare another server for takeover](docs/en/resilience.md)

## Developers

The desktop and supporter share the **0.5.1** source tree. `main` contains the current implementation; use tag `v0.5.1` to reproduce the release.

[Development and checks](docs/en/developer.md) · [Architecture](docs/en/architecture.md) · [Release notes](docs/en/release-notes.md) · [Status](docs/en/status.md) · [Privacy](docs/en/privacy.md) · [License](LICENSE)

ArNS Mesh is an independent community project, not an official AR.IO, Arweave or Solana distribution.
