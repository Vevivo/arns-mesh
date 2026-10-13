# Peer responsiveness and search freshness — 13 October 2026

This investigation concerns Mesh 0.6.1 (`6acd95fc275cb120822cf83334be17202a08b0ec`). A running service is not evidence that its HTTP requests or background updates are timely.

## Observed symptoms

The inspected Windows reader was configured for the operator's original supporter under the existing network identity. Its retained peer directory contained that supporter; no replacement developer's server was being used.

In the inspected 13 October application log, all 23 Mesh request outcomes were timeouts. In the same log, 14 Solana RPC and 60 raw Arweave request outcomes were HTTP 200 responses. These counts describe the inspected log, not the entire network or a continuous availability measurement.

The supporter's service was active on 0.6.1. Service status reported 701.6 MiB in use against a 768 MiB limit, with a peak at that limit. Status records scheduled once a minute instead had gaps approaching 50 minutes. Those observations establish severe delays, but do not by themselves distinguish CPU throttling, memory reclaim, disk latency, or time spent in individual synchronous operations.

The supporter's recent status contained 13,359 retained name records and 3,838 prepared sites. The reader's retained search catalogue contained 13,298 entries and was generated on 12 October at 11:51:19 UTC. Name observations, searchable listings, and completely prepared sites are different sets; subtracting those totals does not measure missing sites. The search catalogue was below its 20,000-entry and 8 MiB limits.

## Confirmed scheduling and persistence defects

Preparation reads local content first. Missing local children can reject immediately, so an `await`-only loop can continue through microtasks without allowing HTTP callbacks or the preparation deadline timer to run. Each child also rewrote the entire saved-site metadata file synchronously, including failed children.

An in-memory test executing the production `SitePinner` class reproduced the defect: 64 missing children caused 67 complete metadata writes, and a due timer did not run before the loop completed. Signature and filesystem operations were fixtures in this test; it measures scheduling and write counts, not production disk performance.

The focused change yields to the event loop before each child and checks cancellation after yielding. Intermediate metadata checkpoints are limited to once per second. Initial, root, and final atomic commits remain in place. A previous ready version and its pins remain available until the new version has been committed successfully.

Four focused regression tests cover:

- A due preparation deadline interrupts immediately failing local work.
- A complete new version is committed before the old pins are released.
- An incomplete new version preserves the previous ready binding and pins.
- Longer preparation persists intermediate progress at one-second intervals.

## Search freshness defects

The desktop stored a new catalogue after an automatic download but only repainted an already open Home view for a forced manual refresh. A failed attempt also consumed the same 15-minute cooldown as a successful download. The retained catalogue can therefore look unchanged even when a later background download succeeds, and recovery after a temporary failure is unnecessarily slow.

The desktop change refreshes the search results and status while preserving text being entered, selection, focus and scroll. Successful updates keep the 15-minute cadence. Failed updates preserve the last accepted catalogue and retry after about one minute. Work already in progress is shared, and changing network scope cancels or resets the old work.

Eight focused scheduling and Home-update tests passed with controlled dependencies. Packaged Windows acceptance is a separate release gate. The new automatic-update check has passed; the full package is not accepted until every Windows acceptance step succeeds.

## Other load identified

The content store still scans the full content directory during insertion/pruning and pin accounting. An operation-count fixture with 18,539 existing items measured 37,081 stat calls for one put-and-pin operation. Status construction also repeats full store accounting. These are additional optimization candidates and are not eliminated by the scheduling fix.

## Validation boundaries

The focused tests passed in a real Node process with an in-memory filesystem fixture. They do not constitute a production load test, a Windows packaged application acceptance test, or proof that every cause of the observed outage has been eliminated.

After the operator authorized server intervention, journal inspection confirmed repeated service memory-limit kills (11 restarts). The service was limited to 768 MiB and half of one CPU on a four-CPU server. Configuration and source were backed up on the server. The preparation fix was deployed with a 640 MiB V8 heap, a 1280 MiB service limit and one CPU's quota; the network identity and content directories were preserved.

After deployment, twelve consecutive network-announcement probes succeeded in 11–850 ms. A 4.37 MB signed catalogue response completed in 6.26 seconds. The existing Windows reader's own request log also changed from timeouts to HTTP 200 replies from the same original supporter (including 649, 215 and 179 ms responses). These are bounded samples, not a guarantee of uninterrupted availability.

At 11:25 UTC, independent inspection found a fresh catalogue generated at 11:24:54, successful registry refresh, advancing name observations and no service restart since the deployment. The retained name count was 13,361 and the published catalogue contained 13,290 entries. Updated registry data can reduce the current searchable count; retention totals measure a different set.

## R84 publication compatibility

The index updater had rejected current signed publications since 7 October. The publisher added Parquet files larger than 128 MiB alongside the root-transaction CDB index. Mesh incorrectly applied its CDB-specific per-file limit to those unused entries, rejecting the entire publication before updating its supported index.

The fix retains full-document signature verification and metadata shape checks. The 128 MiB file limit is applied to the root CDB index and independently enforced by its partition-manifest validator. Unknown formats remain signed metadata and are never downloaded as CDB files. Three regression tests cover signed mixed-format acceptance and tampering, downloader/reader selection, and independent manifest bounds.

The current publication was cryptographically checked against the server's existing trusted publisher. Complete catch-up requires approximately 22.58 GB of index downloads. The repaired updater was started with a temporary 32 GiB allowance under its existing 50 GiB disk budget, preserving old bands until replacements validate. The temporary quota override was removed after the process started: that catch-up process keeps its 32 GiB ceiling and subsequent timer invocations return to the ordinary 4 GiB daily allowance. Daily accounting is preserved. CPU allocation for the updater was raised from one quarter of a CPU to one CPU after measurements showed extensive throttling. The current tip and several recent bands are installed; older generations remain usable while complete catch-up continues. Starting the updater is not evidence that all offered bands have finished.

## Reported-site check

The updated on-disk R84 index located both `indie-publisher-demo` and `arweave-l1-search` in the publication issued on 13 October. Separate numeric-IP queries to the original supporter returned their signed name/location records and original content; local verification accepted the HTML entry document and the second site's manifest. The HTML response took 11 ms and the manifest 10 ms in this sample. The manifest check alone does not establish that every dependent file renders. The Windows outage acceptance includes `indie-publisher-demo` as a complete single-document site.

## Name-scan load

A bounded 12.56-second CPU profile of the running supporter attributed 1.69 seconds to target stepping, 1.44 seconds to target persistence, 0.97 seconds to name persistence and 0.64 seconds to batch snapshot handling. The temporary loopback inspector was closed immediately after the measurement.

The follow-up change builds target lookup tables once per pass, journals only touched snapshot rows, and saves the target catalogue after eight mints or one second elapsed, plus a final checkpoint on return or cancellation. The time threshold is checked between completed RPC calls. Each mint's accepted name snapshots still save immediately and atomically before its scan cursor is made durable; conflicts and failed writes retain their previous rollback behavior. Work yields between mints. Six new tests cover write counts, reload durability, cancellation, invalid observations, elapsed checkpoints, snapshot conflicts and write failures.

Candidate commit `48333124fda9758512f24f918f7243f6e6739e8c` passed the complete Windows package gate, including Home refresh, supporter discovery, compression and real-content outage checks. The final release additionally requires the same gate after the name-scan change; see the release build.json for its exact acceptance run.
