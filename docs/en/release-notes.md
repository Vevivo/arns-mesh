# ArNS Mesh 0.5.0

Open ArNS sites through Mesh using numeric addresses, without gateway domains or DNS.

Built on preview.13, with continuous name tracking, automatic preparation for recent uploads, and verified fallback to retained content. [Live preparation and rollout evidence](https://github.com/Vevivo/arns-mesh/blob/v0.5.0/docs/validation/continuous-preparation-2026-10-06.md).

This release brings the tested desktop, current supporter and R84 index integration into one source tree and one version. It includes automatic recovery from unavailable RPC/content sources, trusted retained-name relay, supporter discovery, verified content delivery, topic search and the connection monitor.

## New names and updates

Supporters refresh names independently of file downloads. Recent content absent from an R84 export can be prepared using bounded public metadata queries in a separate online process; original content IDs and signatures remain mandatory. First-time readers wait for bounded supporter preparation. Existing complete site versions survive incomplete updates.

The large datasets stay on the supporter. VPS and Raspberry Pi instructions explain capacity and setup in English and Turkish.

## Upstream outage result

A fresh reader and a supporter were placed together in an OS-isolated network with loopback only. Real configured Solana RPC and Arweave endpoints were unreachable. The original publisher's signed name records were preserved; no private publisher identity was copied.

- Main content opened for 29 of 35 tested real names.
- All 22 prepared file sets passed.
- Six names lacked content required to open; other partially prepared names did not have complete resource sets.
- The 29 successful names represented nine distinct main objects, not 29 independent websites.

[Detailed results](https://github.com/Vevivo/arns-mesh/blob/v0.5.0/docs/validation/upstream-outage-2026-10-06.md). The release workflow also checks the packaged Windows interface and runs real-public-site acceptance with DNS, RPC and Arweave blocked for both reader and test supporter before publishing.

## Windows firewall recovery

Treat native socket connection denials (`EACCES`/`EPERM` with `syscall=connect`) as source unavailability, so Automatic mode can use trusted retained names and verified Mesh content. File permission failures, application policy rejections and signature/ownership errors do not receive this fallback.

## Downloads and use

Download the Windows x64 ZIP, extract it and launch `Mesh-Browser.exe`. Join with your operator's `mesh1.` code, then open `ar://name`. The standard ZIP contains no operator endpoints, invitation or private data.

[Windows guide](https://github.com/Vevivo/arns-mesh/blob/v0.5.0/docs/en/user.md) · [VPS/Pi supporter setup](https://github.com/Vevivo/arns-mesh/blob/v0.5.0/docs/en/supporter.md) · [Turkish guide](https://github.com/Vevivo/arns-mesh/blob/v0.5.0/docs/tr/kullanici.md).

## Operating boundaries

Upstream-free access requires retained name records, verified content and a reachable Mesh supporter. It does not recover files that no surviving peer holds or prove that a retained name is the newest chain state. Automatic independent replica placement remains future work. Raspberry Pi instructions target 64-bit Linux; physical Pi acceptance has not been run.

Some web applications need external APIs or browser capabilities beyond retained static files. ArDrive reached its application shell in the earlier live audit; full application compatibility is not certified.

The release is an unsigned community build. Checksums and build metadata accompany the ZIP.
