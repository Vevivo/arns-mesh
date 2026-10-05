# Resilient access — current supporter source

Mesh 0.5.0 includes automatic recovery, retained-site versions, supporter preparation and signed network recovery. [Measured outage result](validation/upstream-outage-2026-10-06.md).
The project owner operates the initial service. Ordinary desktop users read sites; they do not run a public peer. A supporter voluntarily runs another peer and stores useful copies. A developer can work on the code without hosting anything. The owner dashboard is local service administration, not a new public gateway.

## What survives which outage?

DNS and gateway routes remain blocked by the application. Mesh peers still need a reachable IP route.

| RPC | Raw Arweave | Name mapping | Content source |
|---|---|---|---|
| Available | Available | Live RPC observation | Verified local / Mesh / raw bytes |
| Available | Unavailable | Live RPC observation | Previously copied local / Mesh bytes |
| Unavailable | Available | Dated local or trusted-provider observation | Verified local / Mesh / raw bytes |
| Unavailable | Unavailable | Dated local or trusted-provider observation | Previously copied local / Mesh bytes |

Automatic access first checks the live name. Only source availability failures allow the historical name path; ownership, conflicting name observations and explicit strong-proof requirements are not downgraded. If the current target's content cannot be obtained, the last completely prepared version can be opened with its original binding and observation date. A new target and its availability are distinct facts.

A retained binding is **an RPC observation or an explicitly trusted operator's assertion**, not a native account inclusion proof. Files are independently checked against their IDs and signatures. Page information and the mode badge distinguish historical access. Child `ar://` resources use the displayed page's binding so a name update does not mix two versions within one page.

A machine that never received a name can obtain its dated mapping from a trusted reachable provider. A network authority can distribute the public witness IDs using a signed extension bound to its exact connection list. New readers verify it using the invitation's authority key. Mirrors can copy both signed records without receiving the private key. An expired list cannot be newly joined; previously accepted addresses and witness identities remain available during outages. An isolated, fresh machine still needs a connection code/profile and a reachable initial peer.

## Preparing useful copies

The provider catalog periodically discovers registry names and rechecks each name/mint binding before storing a dated snapshot. Existing catalog targets alone are not promoted to trusted snapshots. Registry refresh is attempted at roughly 15-minute intervals, with a five-minute failure backoff. If local validation times out after making progress, its next attempt can resume after one minute using bounded cached PDA derivations; account owner, name hash, expiry and binding checks still run. ANT targets are scanned incrementally, eight mints per pass, roughly once per minute plus work time. A full sweep can therefore take hours. Budgets, RPC limitations and timeouts extend this. **There is no promise to capture a change immediately or before an unexpected outage.**

Optional preparation follows verified manifests and detectable immutable Arweave references. A candidate version is staged separately. Only after all discovered files are pinned does it replace the published prepared binding. Failure, restart or failed metadata publication preserves the old complete version. Superseded staging pins are cleaned up. Failed automatically selected candidates can rotate out after five minutes when the site limit is reached; complete versions and explicitly saved sites are retained.

A document being saved is not evidence that every dynamic API, external CDN, computed URL, video or backend function was archived. Status reports document / manifest / detected references and missing files. Sites exceeding object, file-count, transfer or disk budgets remain incomplete. Index hints are not the files themselves. This candidate does not download a complete CDB64 corpus or all Arweave data.

## Queue recovery update — 5 October 2026

Name observations and content downloads use separate, persisted daily meters, including bytes received by failed requests. Each pass has a 60-second deadline and reserves up to 30 seconds for name validation, allowing a full registry check on a CPU-limited provider. Upgrading does not reset the existing content meter. Newly registered or rebound names get a rotating priority turn alongside normal registry scanning. A full registry sweep still takes time.

The content scheduler alternates a persistent priority lane and the existing asset queue. It reserves 64 of 256 priority slots for bounded live reader requests; catalog roots use the remaining slots. Repeated requests retain backoff. Verified content remains mandatory. Request admission uses the existing per-peer limits; it is not an unbounded remote download API.

Site preparation pins already verified local content while the download queue fills gaps. The raw scanner adds a bounded recent-block lane alongside catch-up, history and retries. It keeps earlier progress across restart; this does not produce a complete current index or guarantee any requested ID will be located.

The local dashboard exposes both daily meters, priority objects and quota pauses. Process liveness alone is not evidence that names or downloads are progressing. Check registry time, retained observations, last successful content transfer and prepared versions separately.

## Provider configuration

Use the existing [VPS/Pi installation guide](en/supporter.md). The Windows reader is separate. On the supporter these environment variables apply:

| Variable | Default | Purpose |
|---|---:|---|
| `ARNS_CATALOG_ENABLED` | off | Observe names and copy discovered content |
| `ARNS_PREPARE_ENABLED` | off | Stage and pin bounded complete site versions |
| `ARNS_PREPARE_MAX_SITES` | 32 | Maximum site entries admitted by automatic preparation; explicit pins are separate |
| `ARNS_CACHE_MIB` | 256 | Evictable verified content quota |
| `ARNS_SAVED_MIB` | 512 | Shared pinned-content quota, including staged updates |
| `ARNS_CATALOG_DAILY_MIB` | 64 | Content HTTP/Mesh response-body allowance per UTC day |
| `ARNS_NAMES_DAILY_MIB` | 64 | Independent registry/ANT HTTP response-body allowance per UTC day |
| `ARNS_INDEX_DAILY_MIB` | 64 | Separate raw-index discovery allowance |
| `ARNS_OPERATOR_PORT` | off | Local read-only dashboard, e.g. 49742 |
| `ARNS_UPSTREAM_FETCH` | 1 | Set 0 for a replica serving its existing data without background RPC/raw discovery or content warming |

`ARNS_UPSTREAM_FETCH=0` does not prevent signed connection-list refreshes to configured Mesh peers. It is not an OS firewall. Network-level outage acceptance must use firewall rules on isolated test nodes. Core tests can additionally use `contentSources: 'mesh-only'` (cache-only peer requests) or `'local-only'`.

The transfer scheduler permits two active heavy transfers and 32 pending transfers on a provider. Parsed location shards retain at most eight entries / 4 MiB encoded data. Raw discovery's chunk cache holds at most 4 MiB. These bounds reduce pressure; they are not a total RSS guarantee. Index shards, dependencies, status and logs add disk usage beyond content quotas.

To include recovery trust in a **reader** profile, append `--trust-peer PUBLIC_WITNESS_ID` to `scripts/profile.mjs`. Obtain the witness ID from your own peer's `peer-status` / operator status. Publish that profile through `scripts/network.mjs publish`. The CLI writes the old-format signed list plus the recovery extension. Share the reusable connection code; never share peer identity or network-authority private files.

Inspect locally:

```sh
node scripts/operator.mjs --data /path/to/peer-data
node scripts/operator.mjs --data /path/to/peer-data --json
```

With `ARNS_OPERATOR_PORT=49742`, the dashboard binds only `127.0.0.1`. Use an SSH local forward from your own machine, then open `http://127.0.0.1:49742`. It shows snapshot count, ready versions, incomplete updates, queue errors and actual memory/storage. Do not expose this port publicly. It has no remote management or write actions.

## Evidence and deferred acceptance

Source tests use real loopback RPC, raw Arweave and signed Mesh HTTP transports, fresh reader stores, and signed synthetic files. They close the simulated upstream listeners for each of the four combinations. Separate tests cover damaged updates, restart, publication failure, trust tampering/revocation, expired connection lists and dashboard isolation. They do not prove production-wide coverage or cross-host resilience.

The owner's two-PC test is deliberately deferred until both PCs are available:

1. Use Mesh 0.5.0 on both PCs with separate test profiles. Join the provider network and inspect its recovery witness identities.
2. Use a prepared site and a fresh reader store on the second PC. Exercise the four upstream combinations using isolated test firewall rules; record the source, snapshot date, content IDs and full network traffic.
3. For loss of the original VPS, another machine must run a **headless peer with copied snapshots and verified pinned bytes**, its own identity and an authority-approved public witness identity. Installing the desktop on both PCs alone does not create two serving peers. A replica currently needs its own accepted local observations to export snapshots; blind transitive trust in another peer's name assertion is not enabled.
4. Block the original provider and verify a genuinely independent surviving peer serves the prepared site. Include undernames, a changed target, a manifest, missing assets and invalid data.

One VPS is enough to start preparation. It cannot survive its own destruction without another reachable copy. A Raspberry Pi is optional future infrastructure, not a prerequisite for this first stage. Neither this code nor two desktop installs supply Internet connectivity where none exists.
