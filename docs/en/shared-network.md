# Shared supporter network — 0.6.0

[Türkçe](../tr/paylasilan-ag.md) · [Home](../../README.md) · [VPS / Pi setup](supporter.md)

**A new supporter can join the community network after the original server is unavailable. Readers on 0.6.0 keep the same supported network code and discover that supporter automatically.** The installer includes the authority-signed public network definition. A developer does not need the original operator's permission, private key or a separate code for every reader.

Discovery and content preparation are both part of the supporter setup. Independent access needs a reachable discovery route, a reachable supporter, and the records and files required by the requested site. Preparation continues in the background; its actual progress is reported.

## From installation to independent service

1. **Join the same network.** The durable definition pins its identity, approved source profile, accepted saved-name publishers and numeric-IP rendezvous nodes. A self-contained mesh2 code carries this signed definition. The bundled community definition also supports the existing community mesh1 code by checking the same authority signature. A fresh join does not require the original server.
2. **Announce the new server.** Full setup requires the supporter's externally reachable numeric IP/port. It signs its own address announcement and advertises through direct peer exchange and a separate HyperDHT topic derived from the network ID.
3. **Find and check the server.** A fresh reader can discover the supporter even if all original HTTP seeds are unavailable. It checks the announcement and asks the advertised HTTP endpoint to sign a fresh random challenge before saving the route. Discovery does not grant name authority.
4. **Collect records and files.** While source routes work, the supporter follows name changes and prepares verified content. It also downloads accepted signed name observations from other supporters in pages, preserves their original signatures and automatically copies corresponding files within budgets. R84 supplies location hints; it is not a copy of every website.
5. **Check independent serving.** Examine preparation, then run the [independent supporter check](resilience.md) from another reader, excluding the original server. A running service or a large name count does not by itself establish that a site's complete files are retained.

A supporter installed after the first server disappeared can obtain current names and files from remaining configured upstream routes and other supporters. If all upstream routes are also unavailable, it needs previously retained records and verified copies from a reachable supporter. A code or index cannot reconstruct files that no reachable source holds.

Use **0.6.0 on readers and supporters** for this lifecycle. Older installations gain the new discovery mechanism only after upgrading.

## What discovery shares

Network rendezvous uses numeric-IP UDP. It exchanges the network identifier and signed supporter advertisements, not ArNS names, page URLs, search words or site files. The reader performs no DNS lookup for its rendezvous bootstrap. Discovery nodes help find addresses; they are not name authorities or content gateways.

Normal Mesh requests then use the checked numeric-IP HTTP endpoint. Routes are ranked using valid responses, latency and failures. A second content source may start after 150 ms, with at most two concurrent content requests. Every content item still passes identity and signature verification. Saved mode pauses automatic address discovery.

The supporter needs an externally reachable **TCP** endpoint. UDP rendezvous does not expose a private HTTP port. A Pi behind NAT needs port forwarding or another reachable public route; setup does not configure routers, firewalls or a CGNAT bypass.

## Original signatures and automatic copies

The relay preserves **the original accepted publisher's signature**, retaining current and prepared-version observations separately. Discovering a supporter does not authorize its own signature to change an ArNS target. Live resolution continues to use configured RPC checks; dated outage observations use accepted publisher identities.

The relay requests pages of up to 256 records and 512 KiB, with eight pages per pass by default. Its default storage is **40,000 records within 64 MiB**. Progress persists across restarts. At capacity, it reports the limit instead of silently evicting unrelated accepted records. These are record limits, not counts of fully retained websites.

The replication worker automatically prepares accepted bindings, preferring the accepted prepared version. Separate pins and replicated-sites.json preserve that usable copy while normal preparation follows newer RPC targets. Default replication limits are 20,000 site records, 8 GiB of accounted response data per day and 32 MiB per pass; installed profiles may override them. Partial jobs retry within quotas. Inspect snapshotRelay, replication, replicatedSites and readiness in operator status.

Each supporter prepares its own copies. There is no coordinator guaranteeing two copies on separate hosting providers or allocating replicas globally. The [readiness check](resilience.md) verifies selected names and their available static file sets.

## Configuration and bounds

Full setup uses --advertise YOUR_PUBLIC_IP:PORT. Advanced MESH_ADVERTISE=auto requires another peer to observe the public address; it is unsuitable for a new supporter that must announce without the original server. MESH_ADVERTISE=off disables its own announcement.

| Mechanism | Bound / behavior |
|---|---|
| Learned directory | 32 peers per network; four identities per IP; one identity per endpoint |
| Advertisements | 24-hour lifetime; refreshed after roughly 12 hours |
| HTTP exchange | Two destinations, four new record checks and a 15-second deadline per pass |
| HTTP identity checks | At most two active and eight new probes per minute |
| Network rendezvous | Up to eight signed numeric-IP bootstrap addresses; 12 tracked peers, two outgoing and four incoming connections; 8 KiB messages |
| Relay pages | Up to 256 records / 512 KiB; eight pages per pass by default |
| Persistence | Valid addresses and accepted records survive restart; changing networks clears the previous directory |

Public invitations reject private/local HTTP advertisements. Explicit local test invitations additionally permit loopback discovery; private LANs are not scanned. These limits bound work, not the honesty or independence of operators.

## Authority continuity and remaining routes

The durable definition remains usable without periodic renewal by the original operator. Short-lived source-list updates retain signature, expiry and rollback checks. Expired remote lists are not accepted as fresh updates; existing installations retain previously accepted settings. Mirrors neither receive nor renew the authority's private key.

This applies to durable invitations and legacy codes with a matching bundled signed definition. An unrelated legacy-only code still needs a reachable, unexpired list for a fresh join. If every HTTP route and configured rendezvous path is unreachable, a new reader needs another reachable route. Internet/IP connectivity remains necessary.

## Evidence

Controlled tests cover a supporter created after the original seed was absent, an entirely fresh same-code reader, numeric-IP UDP discovery, HTTP identity checks and unchanged name trust. Relay/replication tests cover pagination, original signatures, separate retained/current copies and cache-only serving checks.

A live public HyperDHT test on 6 October 2026 also found a newly started supporter without its original seed and retrieved verified signed test bytes. Both endpoints ran on one physical server. This verifies protocol behavior through public rendezvous infrastructure, not resilience against losing an independent hosting provider. Physical Pi, home NAT and separate-provider acceptance remain separate checks. See [current validation](status.md).
