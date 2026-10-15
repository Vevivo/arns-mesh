# Name-binding security validation — 2026-10-15

Candidate: **0.6.3-preview.1**. Base: [main at 2520b305c85983f4b7c2f76306715e2396a049a5](https://github.com/Vevivo/arns-mesh/tree/2520b305c85983f4b7c2f76306715e2396a049a5).

## Outcome

The 0.6.2 main-source name recovery path relies on the selected publisher's observation. Offline content verification alone does not authenticate the name-to-ID mapping or its global freshness. The new opt-in protected profile uses independently configured original witness observations and durable reader floors. It has been integrated into the reader, preparation, replication, supporter and cache paths. Publication clarification: the public Windows release observed during the pilot follow-up is 0.6.1; the 0.6.2 source version is not a published v0.6.2 tag.

This candidate was implemented and tested locally. It has not been deployed to the running supporter or published to GitHub. No real independent witness committee was provisioned. The current production network does not gain the new guarantees from these local files.

## Executed checks

| Run | Result | Scope |
| --- | --- | --- |
| Name security batch | 188 passed; 4 skipped | Real Ed25519 core/collector/state/runtime, controlled IP/DHT adapters, profile filesystem, supporter boundaries, coherent RPC decoder fixtures, portable sharded-state and enrollment tests. Four native Linux tests skipped on Windows. |
| Selected existing regressions | 72 passed | Browser shell with Electron doubles, tabs, progress, page health, search refresh, catalog checkpoint/fairness, content cache budgets, manifest semantics, compression and existing security policy. Includes five background-worker tests also present in the first batch; counts must not be added as unique tests. |
| Final integration after fixes | 46 passed; 1 skipped | Eight real signed-content resolver/cache cases, twelve runtime cases, five bounded advertisement cases and updated enrollment cases. Native Linux enrollment skipped on Windows. This overlaps earlier suites. |
| R84 Index Sharing file | 7 passed; 1 failed due to environment | Original publication signatures/JCS, exact R84 offsets, tamper/rollback detection and bounded CDB installation passed. The actual peer socket case hit Windows connect EACCES. This is not a fully passing transport run. |
| Actual certificate HTTP acceptance | 0 passed; 1 failed; 6 skipped | First real loopback request hit connect EACCES. Remaining cases stopped, servers closed. No successful actual HTTP acceptance is claimed. |
| Public-source check | Passed | Targeted private-artifact/credential/default-endpoint checks. Not a guarantee against every possible secret. |
| Source syntax | Passed for affected application/modules | Syntax checks are not runtime acceptance. |

The initial broad regression attempt encountered virtual temporary-directory rename EPERM and blocked socket tests and was stopped. Filesystem regressions were subsequently run inside the authorized workspace temporary directory, with the 72-pass result above. No production filesystem semantics were weakened to make them pass.

Node 24 was used. The follow-up executable check reports 24.16.0; the earlier 24.19.0 label was not independently verified and is not relied on as test provenance. Existing installed dependency versions matched the manifest. A development-only resolver reads those packages without changing the installed application. The missing json-canonicalize 2.0.0 dependency was source-built from authenticated upstream release files; see [dependency provenance](local-test-dependencies.md). This source build must be declared in any development package and is not described as the published npm bundle.

## Name and content evidence

The new tests demonstrate refusal of single-witness and copied votes, modified signed records, wrong target/name/ANT, expired live certificates, conflicting or rolled-back evidence, lost policy, revocation, partial signer configuration and failed acceptance persistence.

Actual signed ANS-104 fixtures cover gzip, Brotli and uncompressed HTML, JavaScript and CSS. A compressed manifest and its subresources open under the same certified root. Original encoded signed bytes remain unchanged. A corrupted content signature blocks rendering. A lease expiring during download becomes explicitly dated history only in Automatic mode. Browser cache hits recheck policy and freshness. These are controlled fixtures, not a visit to a real deployed compressed ArNS website.

Retained prepared proofs survive more than eight newer rounds and policy expiry only when previously accepted by that reader. Export replies select complete retained/new certificates within observation, certificate and actual escaped-envelope limits. A large legitimate signed-record example established why inner JSON size alone was insufficient; the final implementation accounts for the outer envelope too.

Sharded signer tests simulate durable-write ordering, failures, locks, missing-state tombstones and a 50,000-name catalog. They do not establish native power-loss behavior. Native Linux filesystem/enrollment tests are supplied and remain required.

## Running service observation

A read-only service check at **2026-10-15 18:52 UTC** reported the existing Mesh 0.6.2 service active and enabled, with a recent successful signed-content refresh for vevivo. Its own status reported 13,391 retained names and 4,493 complete prepared sites. Those counters are observed coverage, not all ArNS registrations or all files.

No service restart, deployment, network cutoff or supporter reconfiguration was performed during this candidate work.

## Remaining release gates

- Native Linux signing-state and enrollment checks, including operational crash/recovery procedures.
- Real HTTP/DHT and multi-machine outage/recovery checks in an environment allowing connections.
- Independent operators with separately controlled keys, matching pinned policy and genuine operational independence. Test keys/processes do not satisfy this.
- Actual packaged Windows rendering, cache, settings and protected-network acceptance. Packaging or Electron doubles do not establish this.
- A real compressed ArNS site check if a suitable published sample is available.
- Explicit policy rotation/recovery planning; cross-policy migration is intentionally refused rather than inferred.

Small local acceptance metadata is required for cross-restart rollback floors. Deleting/resetting all of it also removes that reader's historical floor. A complete volume rollback or malicious administrator restoring signer keys/state lies outside these local tombstone guarantees.

See [the implemented trust model and activation procedure](../en/name-security.md).
