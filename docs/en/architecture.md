# Access, dependencies and trust

The standalone desktop registers `ar:` inside its own Electron browser. It does not depend on Chrome extensions or disguise a gateway URL. Electron includes Chromium; it is still a software dependency whose updates and security maintenance matter. Removing a separately installed Chrome application does not remove the bundled engine.

## Two runtime roles

The **reader** resolves only requested names/content, uses bounded caches, has no public listener and does not continuously scan the ledger. The **supporter** exposes `/mesh/v1/query` on a selected numeric-IP TCP endpoint, observes target changes and performs bounded indexing/replication. A supporter is neither a full Solana validator/RPC nor a full Arweave node.

| Stage | Current mechanism | What it does not establish |
|---|---|---|
| Bootstrap | Operator-supplied literal IP:port profile, multiple configured peers | Automatic public peer enrollment or NAT traversal |
| Name → target | Solana RPC observation with owner/PDA/name and account decoding checks | Trustless account inclusion, independence of RPC operators, instantaneous latest state |
| Target → location | Local/peer hints, sparse historical published indexes, bounded raw-ledger discovery on supporters; reader-demand discovery near a known parent location | Complete or current location coverage |
| Location → bytes | Mesh chunks or raw Arweave transactions/chunks via approved IP routes | Availability if no reachable copy exists |
| Bytes → content | Protocol-specific identity/signature/integrity checks before use | Freshness of the name mapping |
| Render | Per-tab isolated sessions; untrusted pages have no privileged preload/Node access | That an external API/CDN can function offline |

The Node access path rejects DNS/domain requests, HTTPS/SNI, arbitrary URL fetches and gateway routes. The desktop separately restricts page requests and background networking. Supported immutable `https://arweave.net/<id>` and `/raw/<id>` page URLs are intercepted locally and routed through the Mesh/raw path; they do not authorize an outgoing gateway HTTPS connection. Windows OS allowlisting and DNS/gateway/DoH negative controls, including IPv6/UDP restrictions, were exercised in the [outage experiment](../disaster-network.md). This is not complete egress acceptance across every Chromium/WebRTC path or pre-existing socket; full packet capture remains pending. Application logs alone do not certify that no other process traffic occurred.

Direct Mesh/RPC HTTP is not encrypted. Content checks detect invalid data; they do not hide requests or prevent an active intermediary from disrupting service or manipulating an unproven RPC observation. Content authenticity, name freshness and transport confidentiality are separate properties.

## Who produces missing location records?

1. Historical index publishers produced the shipped public index metadata/snapshots. The client can query required portions from raw sources. Immutable snapshots can miss old or new entries; their publication height is not a coverage boundary.
2. Supporters read raw block/transaction metadata and ANS-104 bundle headers, including nested paths, and save candidate locations. This costs bandwidth, CPU and disk and proceeds under quotas; it is not instant global indexing. Retry/history/live lanes and optional operator-assigned block partitions distribute work.
3. Peers answer specific location/content requests and can copy verified content from configured peers. A returned hint is untrusted until the requested bytes verify. Merely discovering a peer does not produce an index.
4. Earlier operator deployments used Turbo/Goldsky to prepare some location catalogs while those services were reachable. Loading a prepared snapshot later is different from independently discovering a previously unknown location. No private prepared snapshot or runtime API collector is included in this distribution.

Preview.7 also lets a reader search for a missing linked item near the already-known parent page location: the anchor and up to 64 earlier blocks, up to 256 transaction IDs per block, outer bundle headers only. A scan has a three-minute deadline and a 96 MiB response budget; the reader reserves at most 256 MiB/day for this work. It still verifies the full requested item before use. This is demand-driven recovery, not universal first-root discovery or continuous ledger scanning. See [resource behavior and measured media results](../arweave-resources.md).

The target catalog observes names and ANT records automatically rather than embedding a list of successful site names. It refreshes the registry on an approximately six-hour schedule and processes a bounded number of ANT records per pass (default 16). Target changes reset relevant queued work. Refresh/content work currently shares a daily catalog budget (64 MiB default); quota exhaustion, RPC limitations and backlogs can delay both. The server currently selects the first configured RPC for the catalog. More RPC addresses do **not** imply this worker automatically fails over among all of them.

## Outage cases

- **Empty reader, warm peer:** can work if name observations and verified bytes are available. This is not proof of first discovery.
- **Empty reader, unknown location:** must obtain a location from a useful peer/index/raw discovery route. General success remains incomplete.
- **Saved local content:** explicit saved mode uses the selected copy’s dated retained name observation and verified local bytes. Saving follows manifests and bounded static Arweave references in HTML/CSS/JS/JSON; dynamic dependencies can remain absent. A missing saved file fails locally instead of triggering network recovery. It does not assert latest chain state.
- **One peer lost:** another independent peer needs the relevant bytes/hints. One-host multi-process tests do not prove resilience against a provider outage.
- **No live RPC:** fresh name observation may fail. A Raspberry Pi Mesh supporter does not solve the Solana RPC availability/trust issue by itself.

## Resource bounds

Readers have 256 MiB automatic content, a separate 512 MiB saved-content budget, a 16 MiB response cache, two content transfers and a 32 MiB signed-item limit. This is not a total RAM/disk cap: Chromium, page scripts, dependencies, logs and metadata consume additional resources. Large verified streaming is not complete. Supporter scan quotas limit accounted work, not total serving traffic or index growth.

GitHub/npm and the official Electron download are build/distribution dependencies. Preinstalled runtime operation does not require these sites. Receiving a profile before an outage is still necessary; a private operator's endpoints are deliberately not embedded in the public package.
