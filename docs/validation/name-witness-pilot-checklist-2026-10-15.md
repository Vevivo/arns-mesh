# Name witness pilot acceptance — 2026-10-15

This is a supervised pilot checklist for the **0.6.3-preview.2 source candidate**, not a production readiness certificate. The local development work did not deploy a witness committee or change the running public supporter. Record the exact source revision or package hash used by every participant.

## Choose a role

| Role | What the participant supplies | What does not establish this role |
| --- | --- | --- |
| Reader | Verifies the configured name certificate and signed content; retains small acceptance metadata | Installing an older reader does not enable the new policy |
| Content supporter / certificate courier | Serves verified files and original complete certificates it has obtained | A reachable server, R84 index or copied certificate is not an independent witness vote |
| Name witness | Controls its own enrolled key, durable signing state and reviewed RPC observation sources | Running the normal supporter installer does not generate or enroll a witness |

One operator may perform both supporter and witness roles. Count independent administrations, not IP addresses, processes, copied signatures or keys controlled by the same administrator. Separately named RPC files also do not prove independent RPC providers.

## Committee and connection acceptance

Supported pilot examples are:

| Independent domains | Matching signatures required | Maximum faulty domains assumed | Unavailable domains tolerated while collecting a new certificate |
| --- | --- | --- | --- |
| 4 | 3 | 1 | 1 |
| 10 | 7 | 3 | 3 |

The validator checks `2q > n + f` and `q <= n - f`. A ten-domain policy requiring six signatures while claiming three faulty domains is rejected. Availability also depends on the remaining operators answering within request deadlines and observing a matching binding in the same round.

- [ ] Each operator generates its own new key using [witness enrollment](../en/name-witness-setup.md), and keeps the private key private. Never use the repository's simulated test keys as a committee.
- [ ] Independently authenticate the operator public keys, domain assignments, network ID, Solana genesis, registry program, validity period, round length and freshness window. Distribute the reviewed policy ID through an authenticated channel.
- [ ] Every participant confirms the same `namePolicyId`. Calculating a hash from an unauthenticated download does not authenticate its contents.
- [ ] Reader/supporter numeric endpoints are distributed in the reviewed profile or authority-signed connection publication. An endpoint is a courier address; the original witness signatures authorize the name binding.
- [ ] Plan the pilot's end and policy expiry before starting. Automatic policy/key migration is not implemented. Changing or deleting pinned policy files is not an upgrade procedure.

The four- and ten-domain rules are covered by `tests/name-witness-pilot-policy.test.mjs` with real Ed25519 signatures and **simulated** operators. That test does not establish operational independence.

## Install into the intended data directory

- [ ] Use the candidate source package on the witness/supporter and upgraded reader. Record dependency installation and the exact version. A source package does not establish that the packaged Windows application has passed GUI acceptance.
- [ ] Keep the existing content/index data directory separate from the new witness-key directory. Confirm the running service's actual `ARNS_MESH_DATA` before applying anything.
- [ ] Stop the pilot peer for explicit configuration changes. Apply the reviewed protected profile to that actual data directory. Confirm both `name-witness-policy.json` and the matching `name-security-required.json` marker.
- [ ] Existing installations need explicit activation: `install-peer.sh` preserves existing connection files. Reinstalling with a new code/profile does not replace those files.
- [ ] The public `setup-supporter.sh` defaults to the community connection. Do not assume that this is the pilot's protected network; use the independently authenticated pilot connection explicitly.
- [ ] If using a managed network, its authority must publish the protected profile. After manual profile application, explicitly join/accept the corresponding signed publication again. A manual profile change intentionally pauses automatic managed updates when its hash differs from saved membership. Confirm updates are enabled afterward.
- [ ] A content-only protected profile may omit local RPC sources. The normal supporter capacity profile enables the registry catalog, which requires RPC at startup. Retain RPC for that catalog, or explicitly set `ARNS_CATALOG_ENABLED=0` for this pilot role. A signing witness still needs observation sources.

Check and apply a reviewed profile using the existing CLI; replace paths with the installation's actual paths:

```sh
node scripts/profile.mjs check /path/to/reviewed/protected-network-profile.json
node scripts/profile.mjs apply /path/to/reviewed/protected-network-profile.json /existing/arns-mesh-peer-data
```

For a managed pilot, the explicit join step is:

```sh
node scripts/network.mjs inspect AUTHENTICATED_PILOT_CONNECTION_CODE
node scripts/network.mjs join AUTHENTICATED_PILOT_CONNECTION_CODE --data /existing/arns-mesh-peer-data
```

Inspect the returned profile and policy identity before joining. A CLI/profile file, JSON runtime environment file and shell script are different formats; do not execute JSON as shell commands.

## Witness-specific startup checks

- [ ] Use Linux and a local durable filesystem supporting file and directory `fsync`. Run as the eventual service user. Native witness enrollment deliberately refuses Windows.
- [ ] Enroll the new key only after the same protected policy is accepted in the peer's existing data directory. Enrollment must match the policy ID, key and state epoch and must not modify existing content.
- [ ] Configure `ARNS_NAME_SIGNER_KEY`, `ARNS_NAME_SIGNER_STATE` and `ARNS_NAME_SIGNER_EPOCH` from enrollment.
- [ ] For this pilot, also configure an absolute `ARNS_NAME_SIGNER_RPC_SEEDS` path to a separately maintained JSON array of numeric `host`/`port` objects. It must differ from the managed `solana-rpc-seeds.json` file. Do not put credentials or domain URLs in this file.
- [ ] Review who operates those RPC sources. Joining or refreshing the reader's shared network profile must not substitute the witness's separately reviewed sources. Runtime validates and captures the dedicated list when the signer starts; restart cleanly after deliberately changing that file. Legacy fallback to shared `SOLANA_RPC_SEEDS` exists for compatibility and does not satisfy this pilot's separate-configuration check.
- [ ] Request and independently verify an actual fresh signed observation from each enrolled witness. Check its key ID, policy ID, name, ANT, target, slot, round and expiry. `systemctl active`, `peer-started` or successful content serving alone does not prove the signer works.
- [ ] Confirm a repeated same-round request returns the exact original signed bytes. A graceful stop/restart must preserve them and release/reacquire the writer lock safely.
- [ ] On an isolated test identity, inject an uncertain write failure or terminate the process abnormally. Verify that normal restart does not silently reset signing state. Never remove a live pilot's refusal lock as a routine restart step. Supervised recovery must establish exclusive ownership and state integrity; uncertain signing history requires a new key and reviewed policy transition.

## Execute on a host that permits the tests

Install the locked source dependencies before running these commands. They contain synthetic keys and controlled fixtures, not production configuration:

```sh
node --test tests/name-witness-pilot-policy.test.mjs tests/name-policy-profile.test.mjs tests/name-signer-rpc-configuration.test.mjs tests/name-security-runtime.test.mjs
node --test tests/sharded-name-state.test.mjs tests/sharded-name-state-native.test.mjs tests/name-witness-cli.test.mjs tests/name-witness-cli-native.test.mjs
node --test tests/name-certificate-http.test.mjs tests/name-certificate-transport.test.mjs
```

Do not report skipped native tests or blocked socket requests as passes. The Windows development environment blocked real loopback connections with `EACCES`; successful mock transport tests are different evidence. Linux native state/enrollment, real HTTP/DHT, multi-machine and packaged Windows acceptance remain required.

The final selected local pilot/security batch recorded **157 passed and 5 native Linux checks skipped**, after the earlier 145-pass batch. It includes the 11 profile-generation CLI tests and the nine witness-probe tests. The probe refuses a skew-tolerated future certificate as a current readiness pass until its round actually starts. These batches overlap; their counts must not be added as unique tests.

A separate content-decoding/coherent-observer/controlled-transport/background-worker batch passed **40/40**. Another selected resolver/supporter/browser/compression integration run passed **23 of 25**: the two actual-loopback compression cases failed, one with explicit `connect EACCES` at the RPC boundary and the other with no reachable/discovered raw fixture peer. They remain unresolved network-environment acceptance failures, not passes. The original signed-content resolver, supporter guards and Electron-double shell cases passed in that run; Electron doubles are not packaged Windows rendering acceptance.

The follow-up local executable was **Node 24.16.0**. Source syntax checked 217 JavaScript modules and three Python files; the targeted public-source check passed over 367 files. Syntax and targeted checks do not replace execution. This is not a full-suite result or a successful real-network pilot. The skips and blocked socket acceptance remain open gates; adding a GitHub workflow does not mean that workflow has run.

## Multi-machine acceptance matrix

Use a dedicated controlled ArNS name and test website. Record each certificate's original round, target and expiry, plus the content IDs. Preserve the required verified files on at least two independently reachable supporters. Perform outages only on the pilot machines.

| Scenario | Required result |
| --- | --- |
| Fresh reader, active policy, honest quorum available | Correct name-to-ANT-to-target certificate verified before any site bytes are displayed; signed files verified independently |
| One witness supplies a valid-looking wrong target; other witnesses do not agree | No new certificate for that target; no rendering under that name |
| Modified name, ANT, target, policy, round or signed bytes | Signature/scope verification refuses the candidate |
| Only one independent observation, repeated across many couriers | Repeated copies cannot meet the threshold |
| Only two available witnesses under 3-of-4, or six under 7-of-10 | After older certificate leases expire, **current-only** access cannot claim a fresh quorum; Automatic mode may show explicitly dated retained history |
| Any three of four, or seven of ten, agree in one round | A new certificate can be accepted without the unavailable operators, subject to the configured observation and request deadlines |
| Previously accepted higher round followed by an older certificate | Current access refuses rollback; explicit historical access retains its original date and does not lower the stored floor |
| One courier remains, carrying a complete original certificate | It can serve that certificate; one reachable courier is not the same as one witness signature |
| Observation/RPC paths unavailable; active policy; fresh reader | Original complete certificates plus available verified files may open as dated history; missing files or missing quorum evidence are not fabricated |
| Primary content supporter offline | A separately reachable supporter that has both the original proof and necessary files serves the tested site |
| New or changed name while upstream observation paths work | Witnesses observe/certify the new binding in a suitable later round; prepared content follows the certified target |
| Policy file missing, revoked or replaced | Protected operation refuses instead of falling back to a single publisher or ordinary RPC pointer |
| Policy expired | Previously accepted local evidence may remain dated local history; a fresh reader cannot bootstrap trust from a new expired-policy response |
| Invalid Arweave signature, including compressed content | No rendering; name quorum never replaces signed-content verification |

When testing unavailable witnesses, wait until earlier current certificates have expired and use current-only access. Otherwise an already-issued valid full certificate can legitimately satisfy a request even when its original signers are offline. Offline observation cannot establish that no newer name update exists.

## Record results before inviting a wider audience

Record operator identities, source/package hashes, authenticated policy ID, actual endpoints, RPC administration, names/targets tested, original certificate dates, operating systems, observed latency and each failure result. Do not publish private keys or private recovery state.

Run the packaged Windows reader against the pilot network and verify normal opening, cached and retained versions, fixed page subresources, signer outage, missing content and clear historical/error presentation. Include a real compressed ArNS site when a suitable published sample is available. Controlled gzip/Brotli fixtures do not substitute for that live check.

Call the result a **pilot** until these outcomes are observed on the actual machines. See [the implementation validation record](name-binding-security-2026-10-15.md) for checks already executed and [the trust model](../en/name-security.md) for the boundaries that remain even after a successful pilot.
