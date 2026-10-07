# Access, dependencies and trust

The standalone desktop registers `ar:` inside its own Electron browser. It does not depend on Chrome extensions or disguise a gateway URL. Electron includes Chromium; it is still a software dependency whose updates and security maintenance matter. Removing a separately installed Chrome application does not remove the bundled engine.

The desktop and supporter share Mesh 0.6.0. See the [outage test](../validation/upstream-outage-2026-10-06.md) and [shared-network behavior](shared-network.md).

## Two runtime roles

The **reader** resolves requested names/content, uses bounded caches and has no public content-serving HTTP listener. It uses numeric-IP UDP for network rendezvous, but does not continuously scan the ledger or bulk-replicate the supporter archive. The **supporter** exposes /mesh/v1/query on a numeric-IP TCP endpoint, follows target changes, retains accepted original name signatures and automatically prepares verified file copies under budgets. A supporter is neither a full Solana validator/RPC nor a full Arweave node.

| Stage | Current mechanism | What it does not establish |
|---|---|---|
| Bootstrap | Signed durable network definition, numeric-IP HTTP seeds and network-ID HyperDHT rendezvous; bundled same-authority recovery for the community code | Reachability when every discovery route is unavailable; a public TCP route through CGNAT |
| Name → target | Solana RPC observation with owner/PDA/name and decoding checks; availability-only fallback to dated local/trusted-provider observations | Trustless account inclusion, independence of RPC operators, instantaneous latest state |
| Target → location | Local/peer hints, sparse historical published indexes, bounded raw-ledger discovery on supporters; reader-demand discovery near a known parent location | Complete or current location coverage |
| Retained copies | Paginated original signed names and automatic verified file replication; separate prepared/current versions | Independent hosting diversity, global coverage or readiness before preparation finishes |
| Location → bytes | Mesh chunks or raw Arweave transactions/chunks via approved IP routes | Availability if no reachable copy exists |
| Bytes → content | Protocol-specific identity/signature/integrity checks before use | Freshness of the name mapping |
| Render | Per-tab isolated sessions; untrusted pages have no privileged preload/Node access | That an external API/CDN can function offline |

The Node access path rejects DNS/domain requests, HTTPS/SNI, arbitrary URL fetches and gateway routes. The desktop separately restricts page requests and background networking. Supported immutable `https://arweave.net/<id>` and `/raw/<id>` page URLs are intercepted locally and routed through the Mesh/raw path; they do not authorize an outgoing gateway HTTPS connection. Windows OS allowlisting and DNS/gateway/DoH negative controls, including IPv6/UDP restrictions, were exercised in the [outage experiment](../archive/disaster-network.md). This is not complete egress acceptance across every Chromium/WebRTC path or pre-existing socket; full packet capture remains pending. Application logs alone do not certify that no other process traffic occurred.

Direct Mesh/RPC HTTP is not encrypted. Content checks detect invalid data; they do not hide requests or prevent an active intermediary from disrupting service or manipulating an unproven RPC observation. Content authenticity, name freshness and transport confidentiality are separate properties.

## Who produces missing location records?

1. Historical index publishers produced the shipped public index metadata/snapshots. The client can query required portions from raw sources. Immutable snapshots can miss old or new entries; their publication height is not a coverage boundary.
2. Supporters read raw block/transaction metadata and ANS-104 bundle headers, including nested paths, and save candidate locations. This costs bandwidth, CPU and disk and proceeds under quotas; it is not instant global indexing. Retry/history/live lanes and optional operator-assigned block partitions distribute work.
3. Peers answer specific location/content requests and can copy verified content from configured peers. A returned hint is untrusted until the requested bytes verify. Merely discovering a peer does not produce an index.
4. Supporters with online preparation enabled query Turbo or Arweave GraphQL for recent bundle ancestry when retained/R84 hints are insufficient. This separate server process uses HTTPS/DNS and bounded budgets. Returned locations remain untrusted until the original bytes pass verification; a location record alone cannot supply missing files. The reader's access path remains numeric-IP Mesh/raw transport. [Continuous preparation](continuous-preparation.md).

Mesh also lets a reader search for a missing linked item near the already-known parent page location: the anchor and up to 64 earlier blocks, up to 256 transaction IDs per block, outer bundle headers only. A scan has a three-minute deadline and a 96 MiB response budget; the reader reserves at most 256 MiB/day for this work. It still verifies the full requested item before use. This is demand-driven recovery, not universal first-root discovery or continuous ledger scanning. See [resource behavior and measured media results](../archive/arweave-resources.md).

The 0.6.0 supporter enables an independent name-sync loop when the catalog is enabled: its default scheduling interval is five seconds, with registry refresh around every 60 seconds and optional broad target scans every five minutes. Name records are retained separately from the content-download queue, so a slow file does not stop name checks. Processing time, budgets, RPC errors and queues affect actual freshness; these intervals are not completion guarantees. The catalog selects the first configured RPC; more addresses do not imply automatic RPC failover for every worker. [Preparation and timing](continuous-preparation.md).


## Access-route interruption cases

- **Empty reader, warm peer:** can work if name observations and verified bytes are available. This is not proof of first discovery.
- **Empty reader, unknown location:** must obtain a location from a useful peer/index/raw discovery route. General success remains incomplete.
- **Saved content:** retained versions use their own dated name bindings and verified bytes. In Mesh, missing content can still be requested from Mesh/raw sources; Saved suspends live name checks and monitor probes, not all networking. A complete retained fixture opened after restart with zero application HTTP requests. Dynamic dependencies can remain absent; a dated binding is not latest chain state.
- **Original server lost before a new supporter is installed:** a new supporter can join from the signed durable definition, announce through rendezvous and serve fresh same-code readers. It obtains current names/files from remaining upstream routes and supporters. Setup needs its public TCP address, not the network authority private key.
- **One prepared peer lost:** readers can discover reachable alternatives with the accepted name bindings and verified files. Discovery does not supply missing bytes. Same-host tests do not establish resilience against losing an independent provider.
- **Reader loses its RPC route:** Mesh can use an accepted dated binding from local storage or an explicitly trusted reachable provider. A provider with working RPC access can continue observing and retaining updates. A newly discovered peer is not automatically a trusted name witness.
- **Reader loses raw Arweave routes:** reachable Mesh supporters holding the corresponding verified bytes provide an alternative content route.
- **Reader and reachable supporters lose all upstream routes:** accepted retained bindings and verified copies remain usable through Mesh. New information cannot arrive from a source for which no route remains; retained bindings do not prove current chain state. This describes access-path isolation, not shutdown of the Arweave or Solana networks. Independent-host outage acceptance is still pending.

## Resource bounds

Readers have 256 MiB automatic content, a separate 512 MiB saved-content budget, a 16 MiB response cache, two content transfers and a 32 MiB signed-item limit. This is not a total RAM/disk cap: Chromium, page scripts, dependencies, logs and metadata consume additional resources. Large verified streaming is not complete. Supporter scan quotas limit accounted work, not total serving traffic or index growth.

GitHub/npm and the official Electron download are build/distribution dependencies. Preinstalled operation does not require these sites. The 0.6.0 distribution deliberately includes the signed public community definition, with public endpoints and trust anchors; it contains no private authority or peer key. Existing community codes can use that same-authority definition. Other networks can supply a self-contained durable invitation.

## Independent discovery and authority continuity

The durable definition binds the network identity, source profile, accepted saved-name publishers and numeric-IP rendezvous nodes under the original authority signature. A mesh2 invitation carries it directly. The supported community's older mesh1 code is matched to the bundled definition by its authority key. New readers and supporters can establish the approved base configuration after the original HTTP seeds disappear.

A separate HyperDHT topic is derived from the network ID. This UDP exchange carries the ID and signed supporter advertisements, not ArNS names, URLs, search words or content. A learned route must pass signature, network, expiry, sequence, allowed-address and live HTTP identity-challenge checks. The directory does not add its signer to trusted name publishers. Full setup requires an explicit reachable TCP address; UDP rendezvous does not expose private HTTP ports or bypass CGNAT.

Short-lived source lists retain their signature, expiry and rollback checks. Expired remote lists are not fresh updates. Existing installations retain accepted settings; the durable definition allows a new base join without periodic authority renewal. A legacy-only network with no matching durable definition still needs a reachable, unexpired list for a new installation. See [network codes](network-code.md) and [discovery bounds](shared-network.md).

## Original-record relay and file preparation

Supporters exchange original trusted publishers' signed observations in pages of up to 256 records and 512 KiB, with eight pages per pass by default. The default relay stores up to 40,000 records within 64 MiB, separates current/prepared versions, persists pagination progress and reports capacity errors. The serving supporter does not re-sign them as its own authority.

The replication worker prepares accepted targets automatically, preferring the retained prepared version. Its separate pin namespace and metadata preserve that copy alongside normal current-target preparation. Learning a new RPC target does not remove the previous complete accepted file set. Default replication limits are 20,000 site records, 8 GiB of accounted response data per day and 32 MiB per pass; setup profiles may override them. Partial jobs retry within quotas. R84 helps locate files; every downloaded item still needs verification.

A local readiness report distinguishes accepted name bindings, verified roots, complete prepared static file sets, outstanding work and unverified external reachability. It does not certify the whole network. The [independent supporter check](resilience.md) selects a supporter and names, excludes the original server and requests cached-only content, so an empty replacement cannot pass by fetching from the original during the test. Separate-provider and physical-Pi acceptance remain distinct from same-host and public-DHT protocol tests.
