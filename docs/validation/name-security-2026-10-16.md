# Name-security validation — 2026-10-16

This report covers **0.6.3**, reviewed in [PR #18](https://github.com/Vevivo/arns-mesh/pull/18). Earlier candidate runs used version 0.6.3-preview.2. The date is the operator's local date; machine timestamps in evidence files are UTC.

The initial fully packaged product-source head tested was [`6943be25c006a7926b5d0d4955dd19403874e26e`](https://github.com/Vevivo/arns-mesh/commit/6943be25c006a7926b5d0d4955dd19403874e26e). GitHub's pull-request jobs actually checked out merge commit [`b7c36a12fe02573ab675ee92fd39f9a389fcf6af`](https://github.com/Vevivo/arns-mesh/commit/b7c36a12fe02573ab675ee92fd39f9a389fcf6af); their results are attributed to that checkout, not mislabeled as a direct head checkout. The later readiness-report follow-up is recorded separately below and is included in the final release rebuild.

The feature has passed the complete Linux and Windows source suites, isolated VPS checks, separate cloud-VM signature tests and actual Windows application checks from the clean rebuilt **0.6.3 ZIP**. Publication and the release pipeline's own final rebuild are tracked separately. This report does not claim that a public independent witness committee has been recruited or activated.

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
| Linux VPS final isolated acceptance, 14 test files with official dependencies | 96 passed, 0 failed, 0 skipped; 106.105 seconds | Native filesystem/enrollment, actual HTTP, legacy name-binding refusal, supporter responsiveness and selected content/compression integration. Test directories and processes were separate from the running production supporter. Supersedes the earlier selected 40-pass VPS run. |
| GitHub Actions native Linux pilot | Passed; 127 portable checks and 39 native/HTTP checks, no failures or skips in those batches | [Run 38813543986](https://github.com/Vevivo/arns-mesh/actions/runs/38813543986), candidate commit `4d830e895a01de87a71c2744796c326b144d7422`. Includes ten actual HTTP endpoints, original-signature quorum and native signer-state checks. This proves execution under one CI administration, not independent operators. |
| GitHub Actions complete Linux and Windows source jobs | Linux: 577 passed, 0 failed, 0 skipped. Windows: 572 passed, 0 failed, 5 Linux-only skips | [Run 38817643517](https://github.com/Vevivo/arns-mesh/actions/runs/38817643517), actual checkout `b7c36a12fe02573ab675ee92fd39f9a389fcf6af` for product head `6943be25c006a7926b5d0d4955dd19403874e26e`. Source-job success does not establish acceptance of a new ZIP or success of every other workflow job. |
| GitHub-hosted four- and ten-witness VM matrix | All 16 jobs succeeded: 14 witness VMs and 2 aggregators; each aggregator passed 8 cases | [Run 38817643462](https://github.com/Vevivo/arns-mesh/actions/runs/38817643462). Reports record 4 and 10 distinct runner boots. Public-artifact transfer between jobs, synthetic observations and one repository administrator; this is not Mesh network transport or independent production administration. [Four-VM result](name-security-2026-10-16-multihost-4.json) · [Ten-VM result](name-security-2026-10-16-multihost-10.json). |
| Clean rebuilt 0.6.3 ZIP, extracted and launched for protected Windows acceptance | Passed: 20 renderer cases, 7 grouped checks, 0 errors; 16 original signed files verified and unchanged | Actual Electron executable and renderer with real localhost HTTP. Uses controlled names and signed files, not a public compressed ArNS website. The package's 138 application-source files matched the frozen source; official dependencies were used. Supersedes the earlier run 07 against a patched extracted candidate. |
| Actual saved-mode process restart from the clean 0.6.3 package | gzip, Brotli and plain sites rendered; 0 application HTTP requests after all four couriers stopped | Instrumented HTTP/RPC and blocked Chromium-request coverage. This is not an independent full packet capture or a claim about unrelated system traffic. |
| Windows client to public Linux VPS, four-witness fixture | Passed: 4 raw-proof cases and 5 integrated checks | Three matching original domains accepted despite one wrong target; two honest votes or the single wrong vote refused; expired full proof refused as current and accepted as dated history. One courier endpoint, four controlled keys, synthetic observations. |
| Windows client to public Linux VPS, ten-witness fixture | Passed: 4 raw-proof cases and 5 integrated checks | All ten original signatures checked; seven matching domains won over three wrong targets. Six matching votes and three wrong votes could not meet quorum. Expired seven-signature proof remained historical only. One courier endpoint, ten controlled keys, synthetic observations. |
| Direct-only certificate collection regression | Transport and probe batches passed | Exhausted direct couriers no longer consume the whole request deadline. Pending honest requests, semantic failures, original cancellation reasons and DHT discovery remain intact. Actual HTTP reruns are recorded separately. |

The final source suite includes five additional supporter-responsiveness regressions and legacy name-recovery refusal cases. The legacy audit reproduced and fixed concrete mismatched-name/validation paths; it did not relabel a single publisher's observation as a quorum proof. Bounded status work, preparation yields and catalogue yields preserve the protected-name checks.

The earlier [15 October report](name-binding-security-2026-10-15.md) and [pilot checklist record](name-witness-pilot-checklist-2026-10-15.md) retain the original `EACCES` and skipped-test history. Those limitations were subsequently overcome for the completed runs above. The old failures are not silently counted as passes.

## Actual Windows behavior checked

The controlled prepared supporter copies included plain, gzip and Brotli HTML, JavaScript and CSS. The renderer displayed the HTML, executed JavaScript and applied CSS. Decoded GET, HEAD, Content-Length and byte-range responses matched the displayed representation. Original signed encoded copies remained unchanged; a tampered signed file was not cached as verified.

One wrong-target domain could not redirect the reader when three other domains agreed. A copied single signer, split target, forged signature and expired current certificate were refused before fetching site content. Corrupt gzip/Brotli data, unsupported encoding and excessive decoded output were refused before rendering.

A previously unopened name opened as dated history from one courier carrying all three original signatures and the prepared files. Repeated navigation reused verified content. After a real process restart with every test courier stopped, saved plain/gzip/Brotli sites rendered locally. Revoking the pinned policy refused an otherwise cached saved page in the actual application.

The renderer test exposed and led to fixes in Windows application startup and cached-policy error presentation. They were then verified in a clean package, rather than only in a patched development directory. That final local acceptance ran from **2026-10-15 22:37:36 to 22:38:33 UTC**, reported version **0.6.3**, and finished with no errors.

The local ZIP contains the documentation snapshot available when it was built. This later evidence update does not rewrite that tested archive or claim to be inside it. The release pipeline rebuilds the package from the final source and documentation and runs its own acceptance before publication. Archive checksums belong in the external release sidecars; embedding the archive's own SHA-256 inside it would change the archive.

## Cross-host checks and clock handling

Fresh four- and ten-witness Windows-to-VPS checks passed. Each included original-signature verification and the actual direct-IP diagnostic. Observed successful current-query times were 377 ms for the four-key fixture and 964 ms for the ten-key fixture; these single observations are not a performance benchmark. The ten-key insufficient-quorum and wrong-target requests completed in 684 ms and 352 ms respectively.

The first ten-witness attempt exposed a test-fixture clock tolerance of one second that did not cover the measured host offset of about 2.3 seconds. That attempt is not recorded as a pass. Fresh fixtures for both roster sizes used an explicit five-second tolerance and passed. This changes the test's declared time assumptions; it does not disable certificate time validation or make expired observations current. Operators must review and monitor their own clocks and policy windows.

The ten-key evidence was recorded at 2026-10-15 22:22 UTC. Its policy ID is `3831c5f6f6db98b44d7e0a9f949fa7266d29a101bfa404417b905c19485fa98e`; the local diagnostic and raw-proof reports are `cross-machine-10-results.json` and `cross-machine-10-raw-proof.json`. They contain test observations, not a production policy to install.

All these test identities are controlled by the same administrator. Multiple endpoints or machines do not demonstrate the independence required by a production roster. A public committee still requires separately controlled operators, keys and reviewed observation sources.

## Separate cloud-VM signing checks

The GitHub matrix used separate hosted Linux runner VMs for four-key and ten-key rosters: fourteen distinct runner boots across the two groups. Each generated its own test key and original observations. The aggregators consumed the public artifacts and verified their signatures under the declared test policy. Both result files retain the original eight case summaries, policy, actual checkout SHA and runner-boot provenance. They contain public test keys only and must not be installed as a production policy.

For both roster sizes, the expected quorum survived the configured number of conflicting votes. One vote below quorum, the faulty votes alone, repeated copies of a single signature and altered signed bindings were refused. Equivocating keys were excluded while the honest quorum remained usable. Expired proof could not become current; the full old proof remained dated history without lowering the stored current floor.

These fixtures declared 60-second rounds, a ten-minute lease for workflow scheduling/artifact transfer and a five-second future-skew allowance. Those are explicit test-policy parameters, not a silent change to an operator's policy or a claim of instantaneous freshness. Actual Mesh HTTP transport is covered by the separate HTTP and Windows-to-VPS runs above; this cloud matrix validates signing and aggregation across separate runner machines through artifact exchange.

## Final release evidence to complete

| Item | Status at this report's writing |
| --- | --- |
| Product-source revision and full source suites | Published head `6943be25c006a7926b5d0d4955dd19403874e26e`; Linux 577/577 and Windows 572/577 with 5 Linux-only skips, tested at the PR merge checkout stated above |
| Fresh four- and ten-witness cross-host result | Passed as described above; same-administrator fixtures, not real operator enrollment |
| 14-host GitHub Actions matrix | Completed: all 16 jobs passed; separate cloud VMs still do not establish independent administration |
| Clean rebuilt Windows ZIP | 0.6.3 built from the frozen product source and official dependencies; size and SHA-256 recorded in external `build.json` / `SHA256SUMS.txt` sidecars, not inside the ZIP |
| Acceptance from that exact extracted ZIP, including protected renderer and saved restart | Passed: 20 renderer cases, 7 grouped checks, 16 unchanged original signed files, 0 HTTP requests during saved restart |
| Release workflow | [Run 38817643517](https://github.com/Vevivo/arns-mesh/actions/runs/38817643517) passed every source and packaged-Windows stage, including real public sites with upstream routes blocked. The main-branch release job rebuilds and rechecks the final archive before publishing; its run, source commit, suites and archive SHA-256 are recorded in the release's external `build.json`. |
| Public independent witness committee | Not recruited or activated; separate from software release readiness |

## Live responsiveness follow-up

After deploying the initial tested source to the original supporter, 27 of 30 actual desktop connection checks replied within their four-second deadline. This result was retained as a failure to achieve consistent responsiveness. It exposed synchronous policy-file reads repeated for every missing, partial or complete preparation entry during status reporting.

Missing and partial rows now return false before reading policy files. One synchronous display report uses one newly read policy context through a private helper. Public readiness, saved lookup and content authorization still perform their own fresh checks; protected rows still verify the original certificate and current policy. No global or timed authorization cache was added.

A controlled 13,000-partial-row reproduction fell from 39,000 file reads and 2,961 ms to 3 reads and 4.99 ms. These are local measurements, not a server latency guarantee. Four new regressions cover large summaries, fresh subsequent reports, immediate revocation and refusal of caller-injected contexts. The complete follow-up Windows source run passed **576 of 581 tests**, with 0 failures and only 5 native Linux checks skipped, in 65.442 seconds. Final main-branch Linux and packaged-Windows checks run on the release revision before publication.

## Remaining boundaries

- A healthy source is needed to learn new name state. During an outage, the full certificate and necessary verified files must already exist on a reachable source. A fresh reader can use retained proof while its pinned policy is active; expired-policy history is limited to that reader's previously accepted certificate. Revocation still refuses access.
- Reader rollback floors and witness decisions require persistent metadata. Complete volume rollback, deletion of all trusted state or malicious administration are not solved by local tombstones. Native tests cover normal persistence and controlled failures, not every filesystem's power-loss behavior.
- Automatic policy/roster migration is intentionally unavailable. Changing membership, keys or validity requires an explicitly reviewed transition; deleting guard files is not a transition procedure.
- The compressed-content examples are controlled signed fixtures. A real deployed compressed ArNS site, physical Raspberry Pi acceptance and full packet-capture coverage are separate checks and are not implied here.

See the [trust model](../en/name-security.md) and [volunteer installation guide](../en/name-witness-pilot.md) for setup and exact operating assumptions.
