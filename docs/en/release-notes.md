# ArNS Mesh 0.6.3

This update adds optional independently witnessed ArNS name bindings while preserving direct-IP access, R84 content discovery and verification of original signed files. It also yields during large status and catalogue work to reduce request pauses. See the [dated execution record](../validation/name-security-2026-10-16.md) for tested behavior and final release checks.

## Update

Use the **0.6.3** Windows package and supporter source together. Keep your existing Mesh connection code, settings and verified content. Updating the desktop does not update a separately installed supporter. Check the package version and checksum on the [release page](https://github.com/Vevivo/arns-mesh/releases/latest).

[Windows guide](user.md) · [Supporter setup](supporter.md) · [Witness enrollment](name-witness-pilot.md)

## Name-security changes

- A protected profile requires original matching signatures under its pinned policy: for example, 3 of 4 independently controlled operators or 7 of 10. Copies relayed through more servers do not become extra votes.
- Current certificates retain their original fixed time windows. Expired retained proofs remain explicitly dated, and stored reader floors prevent a current lookup from moving backwards.
- Signers use coherent finalized RPC observations and durable per-name signing decisions. Policy loss, revocation, conflicts and failed persistence do not cause a single-publisher fallback.
- The actual Windows reader was exercised with plain/gzip/Brotli HTML, JavaScript and CSS, saved restart and refusal cases. Final artifact acceptance is identified separately in the validation record.
- Direct-only lookups finish when all available couriers have replied; they still wait for pending honest replies and preserve DHT discovery where enabled.
- Legacy retained-name recovery also refuses a mismatched requested name, conflicting evidence and failed protected acceptance; validation failures do not become recoverable storage warnings.

The feature is opt-in. The existing community network keeps its trusted-publisher name model until independent operators enroll and a protected profile is explicitly accepted. This is a configured witness trust model, not a Solana consensus proof or an offline guarantee of the globally latest name state.

## Earlier supporter and content fixes retained

- Preparing a large site with missing local files yields between files, honors cancellation, and batches progress writes. Requests and background name checks can continue while preparation runs.
- Bulk and per-name scans yield while decoding large replies. Catalogue checkpoints and compact file statistics reduce repeated work and memory pressure without changing verification or retention rules.
- Home reflects automatically downloaded search catalogues without erasing an unfinished query. A failed download keeps the last accepted catalogue and retries after about a minute; successful background updates keep the fifteen-minute cadence.
- Large Parquet entries in a publisher's signed R84 document no longer block the root-transaction CDB index. Mesh still verifies the whole publication, downloads only its supported index format, and enforces CDB file, disk and bandwidth limits.
- Original signed file verification, gzip/Brotli decoding limits, direct-IP access, name resolution and independent supporter discovery remain in place.

The search count reflects the current accepted catalogue; updated or removed listings can change it in either direction. A catalogue listing is not a promise that every site file is already retained.

[Investigation, live checks and limits](../validation/peer-responsiveness-2026-10-13.md) · [Compression behavior](../validation/compressed-content-2026-10-12.md)

The release gate runs Linux and Windows source tests and tests the packaged Windows application for search, supporter discovery, compressed content, saved copies and upstream outages. The exact acceptance run is recorded in the release's build.json. The Windows build remains unsigned.
