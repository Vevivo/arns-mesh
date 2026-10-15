# Name-security validation — 2026-10-16

This report covers **0.6.3**, reviewed in [PR #18](https://github.com/Vevivo/arns-mesh/pull/18). Earlier candidate runs used version 0.6.3-preview.2. The date is the operator's local date; machine timestamps in evidence files are UTC.

The feature is implemented and has run in the actual Windows application, on native Linux and over real HTTP. The final release artifact must still be matched to its own acceptance result. This report does not claim that a public independent witness committee has been recruited or activated.

## What the change guarantees

Verifying signed Arweave content proves which file was received. It does not, by itself, prove that an ArNS name points to that file. A protected Mesh profile now requires original matching witness signatures for the exact name, ANT, content ID, policy, chain and time round before accepting that binding.

Supported examples are **3 matching domains out of 4, assuming at most 1 faulty domain**, and **7 out of 10, assuming at most 3 faulty domains**. The policy checks Byzantine quorum intersection and availability. Several servers, keys or copied responses under the same administrator are not independent operators. Adding content supporters does not enroll more witnesses or change the threshold.

Witnesses make coherent finalized RPC observations and persist their first signed decision for each name and round. Readers verify original signatures and fixed time windows, reject conflicting or rolled-back current evidence, and retain acceptance floors before exposing a binding. A courier can relay a complete certificate without becoming a witness. No signature is recreated merely to refresh an old certificate's date.

This is a configured witness trust model. It is **not a native Solana account-inclusion or consensus proof**, and it cannot prove that no newer update exists while offline. Its assumptions include the configured fault limit, genuine operator independence, trustworthy observations, retained signing state and sufficiently accurate clocks. Existing installations keep their prior trust model until a protected policy is explicitly accepted.

## Completed execution

Runs below overlap; their test counts must not be added as a count of unique tests. Later source changes require their own checks rather than inheriting a previous green result.

| Environment and run | Observed result | Scope and limits |
| --- | --- | --- |
| Windows full source suite with official installed dependencies, after the final runtime fixes | 577 tests: 572 passed, 0 failed, 5 native Linux checks skipped; 69.4 seconds | Includes real loopback execution, supporter responsiveness regressions, legacy name-binding refusals and direct-courier completion. Supersedes the earlier 544-test/539-pass Windows snapshot; the two totals must not be added. |
| Linux VPS isolated acceptance | 40 passed, 0 failed | Native filesystem/enrollment, actual HTTP and selected content/compression integration. Test directories and processes were separate from the running production supporter. |
| GitHub Actions native Linux pilot | Passed; 127 portable checks and 39 native/HTTP checks, no failures or skips in those batches | [Run 38813543986](https://github.com/Vevivo/arns-mesh/actions/runs/38813543986), candidate commit `4d830e895a01de87a71c2744796c326b144d7422`. Includes ten actual HTTP endpoints, original-signature quorum and native signer-state checks. This proves execution under one CI administration, not independent operators. |
| GitHub Actions Linux and Windows source jobs | Passed on an earlier candidate head | Final release revision and complete release workflow result still need to be linked below. A prior green job does not certify later edits or a new ZIP. |
| Actual Windows executable, protected acceptance run 07 | Passed: 20 renderer cases, 7 grouped checks; 16 original signed files verified and unchanged | Real Electron renderer and localhost HTTP, controlled names and signed files, not a public compressed ArNS website. The extracted application's tested source had received fixes; this is not yet acceptance of a newly rebuilt final ZIP. |
| Actual saved-mode process restart in run 07 | gzip, Brotli and plain sites rendered; 0 application HTTP requests after all four couriers stopped | Instrumented HTTP/RPC and blocked Chromium-request coverage. This is not an independent full packet capture or a claim about unrelated system traffic. |
| Windows client to public Linux VPS, four-witness fixture | Passed: 4 raw-proof cases and 5 integrated checks | Three matching original domains accepted despite one wrong target; two honest votes or the single wrong vote refused; expired full proof refused as current and accepted as dated history. One courier endpoint, four controlled keys, synthetic observations. |
| Windows client to public Linux VPS, ten-witness fixture | Passed: 4 raw-proof cases and 5 integrated checks | All ten original signatures checked; seven matching domains won over three wrong targets. Six matching votes and three wrong votes could not meet quorum. Expired seven-signature proof remained historical only. One courier endpoint, ten controlled keys, synthetic observations. |
| Direct-only certificate collection regression | Transport and probe batches passed | Exhausted direct couriers no longer consume the whole request deadline. Pending honest requests, semantic failures, original cancellation reasons and DHT discovery remain intact. Actual HTTP reruns are recorded separately. |

The final source suite includes five additional supporter-responsiveness regressions and legacy name-recovery refusal cases. The legacy audit reproduced and fixed concrete mismatched-name/validation paths; it did not relabel a single publisher's observation as a quorum proof. Bounded status work, preparation yields and catalogue yields preserve the protected-name checks.

The earlier [15 October report](name-binding-security-2026-10-15.md) and [pilot checklist record](name-witness-pilot-checklist-2026-10-15.md) retain the original `EACCES` and skipped-test history. Those limitations were subsequently overcome for the completed runs above. The old failures are not silently counted as passes.

## Actual Windows behavior checked

The controlled prepared supporter copies included plain, gzip and Brotli HTML, JavaScript and CSS. The renderer displayed the HTML, executed JavaScript and applied CSS. Decoded GET, HEAD, Content-Length and byte-range responses matched the displayed representation. Original signed encoded copies remained unchanged; a tampered signed file was not cached as verified.

One wrong-target domain could not redirect the reader when three other domains agreed. A copied single signer, split target, forged signature and expired current certificate were refused before fetching site content. Corrupt gzip/Brotli data, unsupported encoding and excessive decoded output were refused before rendering.

A previously unopened name opened as dated history from one courier carrying all three original signatures and the prepared files. Repeated navigation reused verified content. After a real process restart with every test courier stopped, saved plain/gzip/Brotli sites rendered locally. Revoking the pinned policy refused an otherwise cached saved page in the actual application.

The renderer test exposed and led to fixes in Windows application startup and cached-policy error presentation. Those fixes must be present in the final artifact, not only in an extracted development directory.

## Cross-host checks and clock handling

Fresh four- and ten-witness Windows-to-VPS checks passed. Each included original-signature verification and the actual direct-IP diagnostic. Observed successful current-query times were 377 ms for the four-key fixture and 964 ms for the ten-key fixture; these single observations are not a performance benchmark. The ten-key insufficient-quorum and wrong-target requests completed in 684 ms and 352 ms respectively.

The first ten-witness attempt exposed a test-fixture clock tolerance of one second that did not cover the measured host offset of about 2.3 seconds. That attempt is not recorded as a pass. Fresh fixtures for both roster sizes used an explicit five-second tolerance and passed. This changes the test's declared time assumptions; it does not disable certificate time validation or make expired observations current. Operators must review and monitor their own clocks and policy windows.

The ten-key evidence was recorded at 2026-10-15 22:22 UTC. Its policy ID is `3831c5f6f6db98b44d7e0a9f949fa7266d29a101bfa404417b905c19485fa98e`; the local diagnostic and raw-proof reports are `cross-machine-10-results.json` and `cross-machine-10-raw-proof.json`. They contain test observations, not a production policy to install.

All these test identities are controlled by the same administrator. Multiple endpoints or machines do not demonstrate the independence required by a production roster. A public committee still requires separately controlled operators, keys and reviewed observation sources.

## Final release evidence to complete

| Item | Status at this report's writing |
| --- | --- |
| Final source commit and full source-suite result after the last fixes | Source suite passed, 572/577 with only 5 Linux-only skips on Windows; final commit identifier pending publication |
| Fresh four- and ten-witness cross-host result | Passed as described above; same-administrator fixtures, not real operator enrollment |
| Planned 14-host GitHub Actions matrix | Pending execution; separate cloud VMs still do not establish independent administration |
| Clean rebuilt Windows ZIP: version, byte size and SHA-256 | Pending final artifact |
| Acceptance from that exact extracted ZIP, including protected renderer and saved restart | Pending final package run |
| Final release workflow and published asset link | Pending; no nonexistent tag or asset is presented as downloadable |
| Public independent witness committee | Not recruited or activated; separate from software release readiness |

## Remaining boundaries

- A healthy source is needed to learn new name state. During an outage, the full certificate and necessary verified files must already exist on a reachable source. A fresh reader can use retained proof while its pinned policy is active; expired-policy history is limited to that reader's previously accepted certificate. Revocation still refuses access.
- Reader rollback floors and witness decisions require persistent metadata. Complete volume rollback, deletion of all trusted state or malicious administration are not solved by local tombstones. Native tests cover normal persistence and controlled failures, not every filesystem's power-loss behavior.
- Automatic policy/roster migration is intentionally unavailable. Changing membership, keys or validity requires an explicitly reviewed transition; deleting guard files is not a transition procedure.
- The compressed-content examples are controlled signed fixtures. A real deployed compressed ArNS site, physical Raspberry Pi acceptance and full packet-capture coverage are separate checks and are not implied here.

See the [trust model](../en/name-security.md) and [volunteer installation guide](../en/name-witness-pilot.md) for setup and exact operating assumptions.
