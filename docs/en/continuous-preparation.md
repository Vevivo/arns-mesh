# Keeping new ArNS sites available

[User guide](user.md) · [Supporter setup](supporter.md) · [Türkçe](../tr/surekli-hazirlik.md)

While public sources are healthy, a supporter keeps learning names and downloading verified site files. A reader enters an ArNS name and the supporter also gives that immediate request priority.

Name checks run independently of downloads. New and rebound names are prioritized after registry refresh. Existing targets are revisited; larger servers can enable a five-minute program-wide change scan. Observations still pass account-owner, address, name/mint binding and rollback checks before becoming retained name records.

R84 supplies broad location coverage. A recent upload may arrive before the publisher's next index export. The supporter's separate online preparation process then asks Turbo's or Arweave's public GraphQL index for bundle ancestry. These are untrusted location hints: Mesh retrieves the original bytes and checks their ID and signature before storing or serving them. This preparation uses HTTPS/DNS on the server; the reader's access path remains numeric-IP Mesh/raw transport.

## Alternative access when a route is interrupted

The live routes stay enabled while they work. A failure to reach a service does not mean the underlying network has shut down.

| Available route | How access continues |
|---|---|
| The reader cannot reach Solana RPC | Mesh can supply an accepted retained name record from a reachable supporter. A supporter that can still reach RPC can continue observing name updates. |
| The reader cannot reach raw Arweave endpoints | A reachable Mesh supporter can supply verified copies of the requested files it holds. |
| Neither the reader nor its reachable supporters can reach RPC or raw Arweave | Mesh serves the accepted name records and verified files retained before those routes became unavailable. |

A name record identifies a content target; it is separate from the files needed to display that content. R84 supplies location information, not a complete local copy of every indexed file. Preparation builds those verified copies over time.

A failed metadata service does not remove prepared data. Updates can continue through supporters that still have working source access. If no reachable source has a new record or file, Mesh cannot obtain that missing information until a route to it becomes available. During that gap, a retained record represents the version last observed by its publisher, not proof of the latest chain state.

[The isolated access test](../validation/upstream-outage-2026-10-06.md) used selected examples to test this fallback. Its sample counts do not limit the continuously updated catalogue.

## Capacity

The installer enables automatic preparation, with finite budgets. Increase these deliberately on a server with sufficient free disk and bandwidth. For example, a VPS with at least 120 GiB available for Mesh can use:

```ini
ARNS_ONLINE_PREPARATION=1
ARNS_PREPARE_ENABLED=1
ARNS_PREPARE_MAX_SITES=20000
ARNS_PREPARE_MAX_FILES=8192
ARNS_CATALOG_BULK_SCAN=1
ARNS_CATALOG_MINTS_PER_PASS=32
ARNS_CACHE_MIB=16384
ARNS_SAVED_MIB=65536
ARNS_NAMES_DAILY_MIB=16384
ARNS_CATALOG_DAILY_MIB=8192
ARNS_PREPARATION_DAILY_MIB=64
```

These settings reserve limits, not an instant complete archive. Allow additional space for R84, application files and logs. Small Raspberry Pi supporters should start with the smaller [supporter example](supporter.md).

The normal registry interval is 60 seconds; optional broad target scans default to five minutes. Processing time, RPC freshness, source availability, retry backoff, queue size and budgets affect actual delay. This is not a promise that every new upload becomes available within one minute.

Check the operator report's `catalog.nameSync`, `catalog.catalog.registryAt`, `onlinePreparation`, preparation errors and `savedSites`. A healthy process alone does not establish content coverage. Keep old complete site versions until replacements finish; do not discard them merely because a newer name target was observed.

[Live preparation evidence](../validation/continuous-preparation-2026-10-06.md) · [Prepare an independent supporter](resilience.md)
