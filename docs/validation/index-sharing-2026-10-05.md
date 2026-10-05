# Signed index integration — 5 October 2026

This records the reference supporter's R84-compatible local-index rollout. It is not universal ArNS coverage or independent-host disaster acceptance.

## What is running

The Mesh peer reads signed CDB64 bands from disk and answers the existing location protocol. A separate, restricted online updater prepares them from Turbo's HTTPS publication. Its registry-observed publisher key is pinned; signatures, SHA-256, file sizes and CDB pointers are checked before an entire band becomes visible. The runtime's DNS/gateway restrictions were not relaxed.

At 19:12 UTC two bands were fully installed: **15,047,049 index entries in 2,050,978,917 bytes**. Three larger bands were still downloading. The five offered bands total 157,662,267 entries / 21,459,533,704 bytes. These are publisher index records, not distinct sites, a full Arweave index or downloaded website files.

A systemd timer resumes/checks the update every 15 minutes and after boot. Initial preparation permits 24 GiB/day, then a successful full sync removes that override and subsequent updates use 4 GiB/day. The disk ceiling is 50 GiB. The updater and peer have separate users/processes and resource caps. Installed bands remain available if the next refresh fails or the publisher becomes unavailable.

## Real content test

`qa/shared-index-live.mjs` sorted the actual catalog by SHA-256 of each name, skipped already cached content and known locations, and selected the first three IDs found in the newly installed tip band. No operator-selected name list, injected location or preparatory pin was used.

| Automatically selected name | Verified payload | Signed Mesh location response | Raw fetch + verification | Peer copy matched |
|---|---|---:|---:|---|
| `iainball` | Manifest, 3,761 bytes | 313 ms | 4,773 ms | Yes |
| `toon_boughtviatoonnode` | HTML, 34,268 bytes | 34 ms | 4,346 ms | Yes |
| `ardrive-logo-2026` | PNG, 30,202 bytes | 43 ms | 4,345 ms | Yes |

The reader connected to the supporter's public numeric-IP endpoint, obtained its signed location, fetched and verified the real signed data item from raw storage, then requested the same ID from Mesh and compared verified payload hashes. Client and server were on the same VPS. These timings include no Windows page rendering and are not WAN benchmarks; the manifest's full asset graph was not accepted by this test.

## Offline check and finding

The companion `qa/shared-index-offline.mjs` runs a temporary peer and empty reader in a network namespace with loopback only. It reads the installed index and retained name observations and uses the signed bytes acquired by the preceding test. It cannot reach RPC, raw Arweave, the publisher or any external network; the live service's network is unaffected.

The first run passed two of three name-to-content cases. The third target had verified content and an index entry, but no retained name observation. That was an actual preparation gap, not an index failure. The catalog now queues missing retained bindings for fresh registry/ANT validation and prioritizes names with bytes already available, while alternating with the regular cursor. It never manufactures name authority from old discovery rows.

## Automated checks and limits

189 source tests passed on Linux, including publication signature/rollback/expiry, float64 offsets above 4 GiB, corrupt pointers, failed atomic replacement, upstream-disabled Mesh replies and retained-name preparation fairness. The earlier integration commit `2729a89` passed the full Linux/Windows source and Windows package/UI workflow: [run 37360376717](https://github.com/Vevivo/arns-mesh/actions/runs/37360376717).

The published Windows preview.13 ZIP is unchanged and can consume these existing-protocol replies. The current supporter source is on `feat/resilient-access`; this does not automatically upgrade other operators' services.

Still required for a real outage: reachable surviving peers, retained dated name mappings and actual copies of requested bytes. Publisher coverage/freshness, storage quotas, missing assets and external APIs remain limits. New Windows OS-level outage acceptance, independent provider loss and Raspberry Pi hardware acceptance are separate outstanding tests.
