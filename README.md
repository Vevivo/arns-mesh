# ArNS Mesh

**Open ArNS sites through reachable peers, even when ordinary domain and gateway access is disrupted.**

ArNS Mesh is an independent community project with a Windows browser and a separate Linux supporter service. Enter `ar://name`: Mesh finds the name's content, retrieves available files and verifies their identity and signatures before displaying the page. The runtime uses numeric-IP sources rather than redirecting the reader to a gateway domain.

The goal is to share the work of keeping sites reachable. Supporters contribute storage, name observations and content-location records on a VPS or Raspberry Pi. If raw Arweave and Solana RPC become unreachable, previously retained name records and actual content copies can provide a recovery path. **Working connectivity to a useful copy is still required. An index is not the file itself.**

[Türkçe](README.tr.md) · [Use the browser](docs/en/user.md) · [Run a supporter](docs/en/supporter.md) · [Network design](docs/en/shared-network.md)

## Choose your path

| I want to… | What I need | Start here |
|---|---|---|
| Open ArNS sites | Windows x64 browser and a working network connection configuration | [Download and first start](docs/en/user.md) |
| Help store and serve sites | Reachable Linux VPS or 64-bit Raspberry Pi, disk and bandwidth | [Supporter setup](docs/en/supporter.md) |
| Report a problem or suggest an improvement | Version, failed step and a clear description | [Feedback](CONTRIBUTING.md) |

A supporter does not need to write code. One person can browse and operate a supporter. Ordinary desktop users do not need a server, wallet, Node.js or their own index. Installing the browser does not automatically share their storage.

## Downloads and actual status

| Track | Available now | Download / source |
|---|---|---|
| **Published preview.8** | Desktop browsing, saved copies, reusable network invitations and signed source-list updates | [Windows x64 ZIP](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.0-preview.8/ArNS-Mesh-Browser-Windows-x64-0.5.0-preview.8.zip) · [Release and checksums](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.8) |
| **Test candidate preview.12** | Adds dated outage recovery, bounded site preparation, local topic search, connection monitoring and the compact Home/logo | [Windows candidate](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203/artifacts/11323968857) · [Source commit](https://github.com/Vevivo/arns-mesh/tree/cbd55a7dfd5b754a4d3ac06e4c67dc4c83a4011e) · [PR #9](https://github.com/Vevivo/arns-mesh/pull/9) |
| **Planned shared network** | Automatic supporter announcements, peer exchange, measured source selection and coordinated content replicas | [Design and acceptance conditions](docs/en/shared-network.md) — not implemented yet |

Status checked on **5 October 2026**. `main` still has the preview.8 runtime; preview.12 is an unmerged candidate. Actions downloads may require GitHub sign-in and expire; use the exact linked run while available. Neither ZIP above includes an operator invitation. A separately prepared **Connected ZIP** can join its included network automatically on a fresh installation; this packaging capability already exists, but these standard downloads are not Connected packages.

## Use Mesh today

1. Download a **Windows application ZIP**, not GitHub's **Source code (zip)**.
2. Extract the whole folder and open `Mesh-Browser.exe`.
3. With a Connected package, let the included network connect. With a standard package, obtain a complete `mesh1.` invitation from a trusted operator and use **Settings → Mesh connection code → Check code → Join this network**. [Ask for connection help](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml) if needed; availability is not guaranteed.
4. Enter an ArNS name in Mesh's address bar. The preview.12 Home search additionally searches a downloaded, limited catalogue by topic.
5. Use **Save current page** to retain supported files. Check whether the save is complete. Bookmarks only remember addresses.

The intended everyday experience is **download, open, browse without entering a code**. Codes currently provide network identity and initial addresses; they are not licenses, passwords or paid activation. [Full user guide](docs/en/user.md).

## How a name becomes a page

1. **Find sources.** Use the included/imported configuration and previously accepted addresses. Current source-list membership is operator-managed.
2. **Find the name's target.** When available, read Solana RPC observations over numeric IP and check the expected account structure. The candidate can use an accepted, dated local/provider observation after an availability failure.
3. **Find the files.** Use retained content, Mesh peers and raw Arweave sources as available. Location records help find data; they do not contain that data.
4. **Verify and display.** Check content identity and signatures, then open the page and supported assets. Historical name access is labelled; content verification alone does not prove the latest name mapping.

The client does not silently switch to a gateway domain. External APIs, ordinary domain-based services and non-Arweave CDN dependencies can remain unavailable. Supported immutable Arweave resource URLs in a page can be routed internally through Mesh/raw content. [Technical explanation](docs/en/architecture.md).

## Why run a supporter?

A useful supporter gives readers another reachable copy and shares indexing/storage work. It retains three different things: **dated name-to-content records**, **location hints**, and **verified content bytes**. With adequate preparation, another supporter can answer requests when the initial operator is unavailable.

A new empty server is not a backup. Relevant copies must exist on separate machines before an outage, and surviving peers need sufficient disk, memory and upload capacity. The current software has configured-peer replication and bounded preparation in the candidate; it does not yet automatically assign replicas or balance every request across newly discovered peers.

[Install on a VPS or Raspberry Pi](docs/en/supporter.md). The quick path joins an existing network. Creating a separate network and distributing new codes is an advanced operator task, not a requirement for each supporter.

## The shared network we are building

- Readers open the app; default connection settings are supplied with the download.
- A supporter installs the service; its reachable address is checked and automatically announced to existing peers.
- Peers share bounded address/content-availability records. Readers retain alternate routes without manual profile updates.
- Mesh chooses useful, responsive sources and switches when one fails. Only verified content is accepted; a newly discovered peer does not automatically become a trusted name authority.
- Content copies are prepared across independent supporters within their chosen resource budgets.

**These automatic enrollment, exchange, selection and replica-placement steps are design work, not current release features.** Initial reachable peers, name trust, list expiration, abuse limits and independent-host outage testing remain explicit parts of the work. [Read the design](docs/en/shared-network.md).

## What has been tested?

- **Preview.12 candidate:** 168 source tests passed on Linux and Windows; 10 real Windows UI checks passed from the extracted ZIP. These used controlled services and signed test documents. [Exact run](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203).
- **Published preview.8:** network joining, signed list updates, included-network startup and saved reopening were exercised in Windows. Directory replicas shared one host. [Evidence](docs/network-join.md).
- **Earlier preview.7:** four public main documents opened during a Windows DNS/gateway blocking experiment; supported media played. Existing Mesh and IP-based RPC remained available. [Evidence and limits](docs/arweave-resources.md).
- **Still pending:** independent-provider loss with real replicas, the owner's two-PC acceptance and Raspberry Pi hardware validation. Automatic public peer discovery has not been demonstrated.

Mesh is not an official AR.IO, Arweave or Solana distribution. There is no universal site-coverage, instant-update or unlimited-offline-access guarantee. Direct Mesh/RPC HTTP is not an anonymity or encrypted-transport service. [Status](docs/en/status.md) · [Privacy](docs/en/privacy.md).

## More information

[Supporter setup](docs/en/supporter.md) · [Connection terms and advanced network operations](docs/en/network-code.md) · [Candidate recovery](docs/resilient-access.md) · [Topic search](docs/topic-search.md) · [Monitor indicators](docs/connection-monitor.md) · [Source development](docs/en/developer.md) · [Security](SECURITY.md) · [Apache-2.0](LICENSE) · [Attribution](NOTICE.txt)
