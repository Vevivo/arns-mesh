# ArNS Mesh 0.6.1

Mesh now opens Arweave files uploaded with gzip or Brotli compression, including HTML, JavaScript, CSS and site manifests. The 0.6.0 reader could verify those files but passed their compressed bytes to the viewer or manifest parser.

## Use it

Update the Windows desktop and supporter to **0.6.1**. Keep your existing Mesh connection settings and verified files. No network code change or content re-upload is needed.

An older supporter can still send original signed compressed files to the updated reader. Updating the supporter also enables compressed manifest preparation, linked-file discovery and search indexing. Existing preparation records are rechecked gradually within the supporter's normal budgets; incomplete compressed copies are no longer advertised as ready once detected.

[Windows guide](https://github.com/Vevivo/arns-mesh/blob/v0.6.1/docs/en/user.md) · [Supporter setup](https://github.com/Vevivo/arns-mesh/blob/v0.6.1/docs/en/supporter.md)

## Verification and limits

- Original compressed bytes and their signed tags are verified before decoding. Storage, content hashes and Mesh transfers retain that original representation.
- Viewing uses a separate decoded representation. Content length, byte ranges and HEAD refer to the bytes actually served; the viewer does not receive a second compression header.
- Each decoded file is limited to **32 MiB**. Decoding has a **five-second deadline**, one active worker and a bounded queue. Malformed, ambiguous or unsupported encodings fail with an English error.
- Source tests cover direct numeric-IP Arweave reads, prepared supporters, saved copies, gzip, Brotli, plain content, integrity failures and resource limits. The release gate also exercises the actual packaged Windows application.
- Real compressed ArNS content and the exact scope of acceptance are documented in the [validation report](https://github.com/Vevivo/arns-mesh/blob/v0.6.1/docs/validation/compressed-content-2026-10-12.md).

R84 lookup, direct-IP transport, name resolution and existing outage alternatives remain in place. This release concerns desktop/supporter compression compatibility; it does not add a separate web version or make external website APIs available offline.

The Windows build remains unsigned.
