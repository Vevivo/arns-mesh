# ArNS Mesh 0.6.2

This update fixes supporter stalls during site preparation, restores compatibility with current R84 publications, and keeps the desktop's open search page up to date.

## Update

Use **0.6.2 on the Windows desktop and supporter**. Keep your existing Mesh connection code, settings and verified content. Updating the desktop does not update a separately installed supporter.

[Windows guide](https://github.com/Vevivo/arns-mesh/blob/v0.6.2/docs/en/user.md) · [Supporter setup](https://github.com/Vevivo/arns-mesh/blob/v0.6.2/docs/en/supporter.md)

## Changes

- Preparing a large site with missing local files yields between files, honors cancellation, and batches progress writes. Requests and background name checks can continue while preparation runs.
- Bulk and per-name scans yield while decoding large replies and when skipping already-prepared sites. Each operator status report shares one fresh file-statistics scan instead of repeating it. Catalogue checkpoints and compact file statistics reduce repeated work and memory pressure without changing verification or retention rules.
- Home reflects automatically downloaded search catalogues without erasing an unfinished query. A failed download keeps the last accepted catalogue and retries after about a minute; successful background updates keep the fifteen-minute cadence.
- Large Parquet entries in a publisher's signed R84 document no longer block the root-transaction CDB index. Mesh still verifies the whole publication, downloads only its supported index format, and enforces CDB file, disk and bandwidth limits.
- Original signed file verification, gzip/Brotli decoding limits, direct-IP access, name resolution and independent supporter discovery remain in place.

The search count reflects the current accepted catalogue; updated or removed listings can change it in either direction. A catalogue listing is not a promise that every site file is already retained.

[Investigation, live checks and limits](https://github.com/Vevivo/arns-mesh/blob/v0.6.2/docs/validation/peer-responsiveness-2026-10-13.md) · [Compression behavior](https://github.com/Vevivo/arns-mesh/blob/v0.6.2/docs/validation/compressed-content-2026-10-12.md)

The release gate runs Linux and Windows source tests and tests the packaged Windows application for search, supporter discovery, compressed content, saved copies and upstream outages. The exact acceptance run is recorded in the release's build.json. The Windows build remains unsigned.
