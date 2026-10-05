# Continuous preparation — 6 October 2026

This follows the [live desktop audit](live-desktop-2026-10-06.md), which found a missing location for `cubetwist`. It tests automatic server preparation; it is not evidence that every page resource or application feature renders.

## Live public content, initially empty store

The test used a separate directory and process on the server. No content, R84 index or location hint was preloaded. The active production process was not modified.

The IP-only fetcher handed the unknown ID to a separately enabled online preparation process. That process queried current public bundle metadata, published a bounded untrusted hint, and the fetcher obtained and verified the original signed bytes from raw Arweave.

- Name target: `kRITIGM3-RgivRLAUVHhrAE10_HA4ekqgiUL-78Z0bE`.
- Verified manifest: 194,907 bytes, 3,263 paths.
- Manifest v0.2 fallback document: `EPNbHZaUjYLiPK5PFhBUYaR4pRLDRVRVjS6MrlMOTdw`.
- Main content: 7,026 bytes.
- Time to manifest and main content: 11,238 ms.
- A subsequent local-only read succeeded with no upstream request.

[Machine-readable result](continuous-preparation-2026-10-06.json).

## Regression coverage

Tests exercise metadata origin and response limits, nested bundles, incomplete ancestry, cycles, failure backoff, persistent daily budgets, delayed file handoff followed by signature verification, and continued name refresh while a content request is blocked. Existing version-update tests require the previous complete site to survive failed updates and restarts.

The corrected full suite passed 198 tests on Linux; the installer update check also passed. GitHub independently passed the Linux and Windows source suites for revision 836e6c4f. The large-scan deadline/address-cache follow-up passed 24 focused catalog tests before publication.

## Remaining distinctions

This live test does not create a paid ArNS registration, publish new mainnet content, or certify all 3,263 files of this manifest. New registration/target changes are exercised with validated account fixtures. The current R84 publisher and GraphQL services can lag publication. Outage access requires the relevant binding and content to have reached a surviving supporter.

## Live rollout and Windows reader

The supporter was upgraded in place from the preview.13 baseline at 23:33 UTC on 5 October (6 October in Türkiye), retaining its identity, network, R84 files, 13,274 name snapshots and existing verified content. The old release and a private data snapshot are retained for rollback.

The user's existing preview.13 Windows application was then reloaded at `ar://cubetwist/`. The cube image rendered. Page information reported one verified resource, zero unavailable resources, zero policy blocks and zero script errors; the main document SHA-256 matched the isolated preparation test. This was an online opening through Mesh and raw Arweave, not an outage GUI run.

Continuous preparation is now enabled on the live server. Configured limits are 16 GiB automatic content, 64 GiB saved content, 20,000 prepared site records and 8,192 assets per site. Daily limits are 8 GiB background content, 16 GiB name responses and 64 MiB online location metadata. R84 keeps its separate updater and storage budget. These are capacity limits, not achieved coverage.

## Broad current-target scan

A separate server test using real current RPC observations completed in 36,552 ms, receiving 9,858,205 bytes. It discovered 2,899 registered names and 13,272 targets with no bulk-scan or catalog error. The earlier 8 MiB response limit and 30-second combined deadline were insufficient for the live dataset; the response cap is now 16 MiB and the independent name pass has a 120-second bound. Deterministic ANT address derivations are cached; every subsequent account observation still checks owner, binding and slot.
