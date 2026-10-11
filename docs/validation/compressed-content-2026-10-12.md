# Compressed Arweave content — 12 October 2026

## Confirmed baseline

The audited baseline is Mesh 0.6.0, commit `a2fcb689ec595526b2271d02e58a451b23dfed87`, also the public main branch at the start of this investigation.

Controlled ANS-104 items were signed with HTML, JavaScript and CSS Content-Type tags and gzip or br Content-Encoding tags. All signatures passed. The 0.6.0 desktop response returned the compressed payload with the original MIME type and no Content-Encoding header. All six compressed cases differed from the readable source; all three plain cases matched. Compressed manifests also reached JSON parsing without decoding.

This confirms an actual compatibility gap. It does not imply that all ArNS sites were affected: ordinary uncompressed content already worked.

## Implementation

Signed tags determine the encoding. Mesh first verifies the original ANS-104 or L1 content, including the compressed payload and signed metadata. The decoder produces a separate view for manifest parsing, linked-file discovery, search extraction, readiness checks and desktop responses. Original content hashes, verified-store files, sharing bundles and supporter wire payloads remain unchanged.

Only no encoding, identity, gzip and br are accepted. Conflicting duplicate tags or stacked/unknown encodings are rejected. No HTTP header or filename can override the signed tag.

Each decoded file is capped at 32 MiB. One isolated decoder worker runs at a time per process, with at most 16 queued requests and 64 MiB of queued encoded input. A five-second deadline includes queue time. Abort/deadline termination stops the worker before its slot is reused. Search extraction retains its smaller existing limit.

Response bodies are already decoded; Content-Encoding is not forwarded. Content-Length, HEAD and byte ranges describe the decoded representation. The desktop rejects an encoded result missing the explicit decoded marker. Verification failure prevents both decoding through the normal content path and rendering.

Existing supporter files need no conversion. Old preparation metadata is rechecked gradually under normal preparation budgets. Plain sites remain available; a failed same-target compressed audit withdraws the earlier incomplete readiness claim while keeping original files.

## Repeatable checks

- `tests/content-decoding.test.mjs`: signed gzip/br/plain HTML, JavaScript and CSS; response/cache/HEAD/range consistency; corrupt streams; unknown/duplicate encoding tags; expansion cap; deadline/abort handling; invalid signatures rejected.
- `tests/compression-integration.test.mjs`: compressed L1 files/manifests over a numeric-IP raw-node fixture, supporter preparation and transfer, saved restart, search extraction and legacy preparation repair.
- `qa/desktop/compressed-content.cjs`: the actual Windows ZIP, prepared supporter, gzip/br/plain pages with script/style assertions, saved reopening after the supporter stops, and failure cases.
- Existing release checks retain search, independent supporter discovery and real-content OS firewall acceptance.

The release is published only after the exact commit passes source tests on Linux and Windows and packaged Windows acceptance. Its `build.json` links the acceptance run. See that run for machine reports and screenshots.

## Real content evidence

The public `docs` ArNS name's retained record observed at **2026-10-11 23:14:27 UTC** pointed to manifest `x8iDex_AEWK1391dFWOIChmlEM_ufH-tsJD7Y3dwhWQ`. The original publisher's signed record was retained for the test. A gateway's cached name header pointed to a different manifest, so it was not treated as the latest accepted name record.

Original ANS-104 items were obtained using bounded ranges of public bundles for this test corpus. Mesh independently verified their IDs/signatures, then exercised its manifest/resource adapter and desktop response. These QA downloads do not add a gateway fallback to the application.

| Real file | Immutable data ID | Signed gzip bytes | Decoded bytes |
|---|---|---:|---:|
| HTML | `fpdeWsrSj3OC0QSeq31nIYObtTfZ8PS2LjzKYS4iP38` | 26,976 | 186,681 |
| JavaScript | `tBAj_aNi40ppAmUx9cTvMYk3LZbaHw5OqG93z8szD-4` | 7,494 | 28,049 |
| CSS | `z2k1-5YIjLx4dASwe2SXEgk8XUNjjTAnPLZAdQJ0DRI` | 19,271 | 109,640 |

For each file, 0.6.0 exposed gzip bytes as the original MIME type. The fixed path returned the decoded bytes, whose hash also matched the signed File-SHA256 tag. Original stored bytes were unchanged; decoded lengths and ranges matched. [Machine-readable evidence](compressed-content-2026-10-12.json).

The bounded Windows corpus contains 39 original signed items: the real manifest, homepage redirect, the Introduction entry at `ar://docs/learn`, and selected scripts, styles, fonts and images. The renderer check opens that entry, checks its heading and styling, compares decoded HTML/JavaScript/CSS hashes, and reopens the retained entry after the supporter stops. This covers the entry and selected static assets; it does not claim that all 1,594 manifest files or dynamic site functions were archived. Complete prepared/saved behavior is separately tested with controlled fully retained sites. Brotli is covered by controlled signed fixtures; no live Brotli ArNS site is claimed.

## Remaining scope

The decoded size/time limits are intentional. Multiple stacked encodings and encodings other than gzip/br/identity are not supported. A site's external APIs, missing assets and general JavaScript compatibility remain separate from compression. No physical Raspberry Pi acceptance is claimed. The X post supplied as background could not be retrieved; the implementation was checked against the public deployment documentation and actual signed files.

Upstream reference: [ar-io-deploy compression documentation](https://github.com/ar-io/ar-io-deploy#compression).
