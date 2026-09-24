# ArNS Mesh

**An experimental desktop browser for ArNS content, with optional community peers.**

The goal is to retain access when ordinary domain names, DNS or gateway services are unavailable, while IP connectivity and reachable copies of the required data still exist. Open an ArNS name in the desktop browser; a Mesh peer or raw Arweave node supplies content which the client verifies.

This is an independent community project. It is not an official AR.IO, Arweave or Solana release.

**Status: 0.5.0-preview.4.** Windows packaging and core tests are available. Real Windows page rendering, Raspberry Pi hardware and a complete DNS/gateway-blocked multi-node acceptance test are still pending. Do not describe this preview as universally available or fully trustless.

[Türkçe başlangıç](README.tr.md) · [Current status](docs/en/status.md) · [Trust and dependencies](docs/en/architecture.md)

## Choose your role

| I want to… | Start here | What I need |
|---|---|---|
| Open ArNS sites | [Desktop user guide](docs/en/user.md) | Windows x64 desktop package and a numeric-IP connection profile from a supporter |
| Help serve content and build/share location records | [VPS / Raspberry Pi supporter guide](docs/en/supporter.md) | Linux, Node.js, persistent storage and suitable IP connectivity |
| Improve the project | [Developer guide](docs/en/developer.md) | Node.js 24 LTS, npm and Git |

**Readers do not need to run a server or indexer.** A supporter can also use the desktop app on their own computer. The two roles have separate data and processes.

## Desktop: the short route

1. Download the Windows ZIP attached to an explicitly labelled preview in [Releases](https://github.com/Vevivo/arns-mesh/releases). If there is no desktop asset yet, a public binary has not been published; “Source code (zip)” is not the Windows app.
2. Extract the whole ZIP and open `Mesh-Browser.exe`.
3. Open **Settings → Import connection profile** and select the JSON file supplied by your supporter.
4. Enter `ar://name` or a bare ArNS name. Use `+` for tabs and the star for bookmarks.

The public source and public build have **no embedded private operator addresses**. They will ask for a connection profile until configured. A profile contains service IP addresses and ports, not a wallet, login or secret key. Obtain the app, profile and any saved content before a disruption; GitHub is not required by the running client.

## What a supporter contributes

A supporter can cache verified content, answer Mesh content/location requests, track observed ArNS/ANT targets and perform bounded raw bundle indexing. These jobs may improve availability and repeat access. They do not guarantee every content location or eliminate Solana RPC trust. A new empty supporter is not a complete backup.

Use [the supporter guide](docs/en/supporter.md) for installation, systemd, resource limits, NAT, updates, rollback and removal. No existing service or firewall is changed by the basic installer.

## Boundaries that matter

- Live name mappings currently require a reachable numeric-IP Solana RPC and trust in its response. Content signatures are checked separately.
- Saved records are dated observations. They are not proof of the newest mapping.
- Some earlier deployment catalogs used Turbo/Goldsky preparation. Those private catalogs are not included here; independent discovery of all unknown locations remains incomplete.
- A single VPS or a single Pi is still a single point of failure. Independent peers need copies of the relevant names, locations and actual bytes.
- Third-party APIs/CDNs may remain unavailable. The browser does not fabricate those responses or silently use a gateway.
- Direct IP transport is not an anonymity service. See [privacy](docs/en/privacy.md).

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Priority work includes independently produced location records, name-update scheduling separate from content quotas, RPC failover, multi-peer replication and real hardware/network acceptance. Never add individual names to make a test appear successful.

[License](LICENSE) · [Attribution](NOTICE.txt) · [Security reporting](SECURITY.md)

**Connection setup and profile requests:** [Read this first](docs/en/connections.md). The in-app list contains your configured sources; a public supporter directory and access approval are not implemented.
