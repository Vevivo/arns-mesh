# Peer responsiveness and search freshness — 13 October 2026

This investigation concerns Mesh 0.6.1 (`6acd95fc275cb120822cf83334be17202a08b0ec`). A running service is not evidence that its HTTP requests or background updates are timely.

## Observed symptoms

The inspected Windows reader was configured for the operator's original supporter, `194.163.169.13:49740`, under the existing network identity. Its retained peer directory contained that supporter; no replacement developer's server was being used.

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

The proposed desktop change refreshes the search results and status while preserving text being entered, selection, focus and scroll. Successful updates keep the 15-minute cadence. Failed updates preserve the last accepted catalogue and retry after one minute. Work already in progress is shared, and changing network scope cancels or resets the old work.

Eight focused scheduling and Home-update tests passed with controlled dependencies. Packaged Windows acceptance is a separate check; its result must be recorded from CI before claiming it passed.

## Other load identified

The content store still scans the full content directory during insertion/pruning and pin accounting. An operation-count fixture with 18,539 existing items measured 37,081 stat calls for one put-and-pin operation. Status construction also repeats full store accounting. These are additional optimization candidates and are not eliminated by the scheduling fix.

## Validation boundaries

The focused tests passed in a real Node process with an in-memory filesystem fixture. They do not constitute a production load test, a Windows packaged application acceptance test, or proof that every cause of the observed outage has been eliminated.

Production command execution and service restart were blocked by this session's approval policy. Reading the service status was permitted. No restart, configuration change, or production code deployment was performed during this investigation. Retest HTTP latency, name observation timestamps, catalogue publication, preparation progress, and resource use on the operator's server after deployment before marking the incident resolved.
