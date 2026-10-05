> Historical evidence. For the current release, see the [Mesh home page](../../README.md).

# Provider queue recovery — 5 October 2026

## Scope

Supporter source: `8a32cdde0e8a87e19c1dfa2ca35e4d482a3ebbb8` on `feat/resilient-access`. This is a server update after the published preview.13 Windows ZIP. The ZIP/tag are unchanged; readers already using preview.13 do not need a replacement package for these provider changes. PR #9 remains separate from `main`.

## Failure found

At diagnosis, the process was running but catalog preparation had stopped at 01:46 UTC after consuming its shared 256 MiB daily quota. That also stopped registry/name refresh. The ordinary content queue contained 32,768 jobs. Raw catch-up was more than 7,400 blocks behind the observed tip. Process health and accessible old pages did not establish current discovery coverage.

## Changes

- Independent persistent daily quotas for name observations and content; failed response bytes count.
- A persistent priority lane for roots and bounded reader demand, alternating with asset work. Sixty-four slots remain reserved for accepted reader requests. Repeated demand keeps existing backoff.
- Newly registered/rebound names get priority turns while existing names continue refreshing.
- A recent-block lane when raw catch-up is over 64 blocks behind. Historical work/retries retain their cursors.
- Site preparation pins verified cached content while the download queue obtains missing files.
- A bounded 30-second name phase within a 60-second pass. Deterministic PDA derivations are reused; owner, raw name hash, lease and binding checks run on every response. Interrupted validation that made progress can retry after one minute.
- The local operator dashboard reports both daily meters, priority work and quota pauses.

Production background response-body allowances total 1,280 MiB/day: names 192, content 448, raw indexing 640. Existing daily usage was retained. This is not a cap on all application/foreground traffic. Cache 256 MiB, saved content 2,048 MiB, service memory 512 MiB and CPU quota 50% remain unchanged. A storage upgrade was not needed.

## Verification

`node --test --test-concurrency=1 tests/*.test.mjs`: **183 passed, zero failed**, Node 24.19.0 on Linux, final source. Tests include saturated queues, demand persistence, preserved retry backoff, cancellation, quota independence, raw partitions, verification rejection and simulated RPC/raw outages. These are not new Windows OS-firewall or independent-host tests.

Observed production progress during the rollout, without manually adding user-selected names:

| Observation | Before | 16:15:48 UTC |
|---|---:|---:|
| Retained dated name observations | 186 | 291 |
| Cached verified content objects | 1,184 | 1,209 |
| Complete prepared site versions | 7 | 10 |

The full registry refreshed at approximately 16:13 UTC and its error cleared. The recent-block lane reached height 2,015,185 while historical catch-up remained separate.

A fresh temporary reader fetched the latest automatically completed catalog object, ID `aYO2B406_rXsEH9LtxnfPkag_SYAXcn8q6WTYMaNJGc`, through the provider's public numeric-IP Mesh endpoint. It received 19,967 payload bytes and verified/stored the result using strict `mesh-only` content mode and cache-only peer requests. This was an object fetch from an empty store, not a full browser-page or name-resolution test. Reader and provider shared the same VPS; it does not establish independent-provider failover.

## Remaining limits

The index is still partial. A current name can resolve while the content's bundle location remains unknown; processing a request cannot guarantee that location will be found. This update does not import a complete/current third-party index, store every website, provide missing connectivity or recover content that no reachable peer retained. RPC observations are not native account inclusion proofs. No DNS/gateway fallback was introduced.

The production code and service configuration have versioned rollback copies. Prepared data, provider identity and network authority remain in their existing data directory.
