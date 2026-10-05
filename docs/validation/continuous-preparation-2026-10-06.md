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

The first remote full-suite run found an older Node on the child-process PATH and an overstrict expectation that an initially unknown item would perform zero raw-L1 probes. The PATH and the fixture expectation were corrected; neither result is counted as a successful full-suite run.

## Remaining distinctions

This live test does not create a paid ArNS registration, publish new mainnet content, or certify all 3,263 files of this manifest. New registration/target changes are exercised with validated account fixtures. The current R84 publisher and GraphQL services can lag publication. Outage access requires the relevant binding and content to have reached a surviving supporter.
