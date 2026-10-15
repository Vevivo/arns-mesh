# Certified ArNS name bindings

Status: integrated development candidate, version 0.6.3-preview.2. This is not a production deployment or a claim that the published Mesh network already has independent witnesses. Installations without an accepted witness policy retain the existing release's trust model. Volunteers can follow the [pilot installation and acceptance guide](name-witness-pilot.md).

## What changes for a reader

With a protected connection profile, Mesh accepts a name-to-content-ID binding only after verifying a full certificate under that profile's pinned witness policy. The normal resolver, fixed page subresources, retained versions, preparation, replication, supporter ingest, readiness probes and browser response cache enforce the same policy. A selected supporter is a courier for original signatures, not an authority that can choose a name's target alone.

An initial committee can have four independently operated domains and require three matching observations, tolerating one faulty domain. A ten-domain committee can require seven matching observations and tolerate three faulty domains. Extra content supporters do not automatically change the witness roster or threshold. Extra servers, keys or copied responses belonging to one operator do not add independent votes. The policy checks Byzantine intersection and availability: `2q > n + f` and `q <= n - f`.

This is a configured witness trust model, not a Solana consensus/inclusion proof. It depends on actual operator independence, at most the configured number of faulty domains, coherent chain observations, durable signing state and a sufficiently accurate reader clock. A short-lived certificate establishes dated agreement; it cannot establish that no newer name update exists.

## How incorrect or old answers are handled

Original Ed25519 observations bind the exact policy, network, Solana genesis, registry program, name, purpose, ANT account/program, content ID, finalized observation slot and shared time round. Signatures cover a protocol-specific prefix and exact original record bytes.

An issuer reads the registry, derived ANT record and asset coherently through a finalized RPC request, validates program owners and strict account layouts, checks the pinned genesis, and confirms the registry binding did not move during observation. RPC remains an observation trust source; this is not cryptographic verification of Solana consensus.

An issuer durably commits its first decision for a name and round before releasing a signature. It returns the exact same original signature for repeated requests in that round. It does not re-sign retained history to make it look fresh. A changed target waits for a later round. Signing state cannot be silently recreated for a previously used key.

A reader requires a matching quorum in one round, authenticates each domain, excludes equivocation, checks fixed signed expiry and persists per-domain slot/round floors before exposing the accepted binding. One witness claiming an enormous slot cannot raise other operators' floors. Policy removal, replacement, revocation, conflicts and strict-proof requirements do not trigger a single-publisher fallback.

A still-valid certificate can be served again within its original bounded freshness window. It is not a guarantee of instantaneous global freshness. Expired certificates are never presented as live.

## During an outage

Mesh can open an original full-quorum certificate and the corresponding verified files as an explicitly dated retained version. A fresh reader can obtain that certificate and files from a reachable supporter while the policy is active. The reader need not have visited the site before.

Historical acceptance never lowers the newest accepted floor. Prepared versions keep their own original proof, including after more than eight newer observations. Retention is bounded per name and preserves original signatures and dates.

After a policy expires, only an exact certificate previously accepted by that reader can be opened as local history. A remote claim of previous acceptance is insufficient. Revocation still refuses access under that policy. Policy expiry/migration therefore needs an operational rollout; automatic cross-policy migration is intentionally not implemented.

No outage mechanism creates missing bytes. The required original signed files must be available in the reader cache or a reachable Mesh/content source. Names created after all trustworthy observation paths became unavailable cannot be discovered or certified from nothing.

## Content, transport and resources

Name evidence and file identity are separate. Existing R84 Index Sharing and direct-IP Arweave/Mesh retrieval still locate files. A content location or search result is a hint, not a name authorization.

Original signed Arweave bytes remain verified and stored in their encoded representation. gzip/Brotli decoding occurs after verification, under the existing 32 MiB output and decoder deadline limits. Manifests and resources keep the same certified root binding. A failed content signature is fatal.

The certificate operation is available on both existing IP and swarm routes. It has bounded replies, courier count, concurrency, connections and time. Inbound requests do not fan out to collect other witnesses. Background refresh is a bounded sweep; it does not claim complete instantaneous registry coverage. Demand resolution obtains a fresh quorum.

Reader acceptance state is small per-name metadata, separate from content and indexes, with bounded versions and an in-memory LRU. Cross-restart rollback detection requires retaining that metadata. Windows uses atomic replacement and file fsync; power-loss durability of directory metadata is not claimed. Production signing requires the stricter Linux directory-fsync backend.

## Activation

1. Deploy the updated application/supporter code in a staging environment and run the native Linux and actual HTTP acceptance tests.
2. Recruit independent operators, each controlling its own new signing key and RPC observation configuration. Four keys generated on one host are test fixtures, not an independent committee.
3. Independently review their public keys, operator domains, network identity, Solana genesis, registry program and freshness windows. Create the agreed policy with the [policy helper](name-witness-pilot.md), and distribute its authenticated hash. Freeze that roster for the pilot; automatic policy migration is not implemented.
4. Each signer follows [Witness enrollment](name-witness-setup.md). Keep its existing Mesh content/index data. Apply a protected network profile containing the same pinned policy to the supporter's actual data directory.
5. Publish the protected profile through the existing authority-signed Mesh connection mechanism and upgrade readers. Older applications do not acquire these guarantees.
6. Verify wrong-target, old-certificate, missing-witness, outage and recovery cases against the actual operators before calling this production-ready.

No test policy is enabled or bundled as a production committee. The existing running supporter and published release were not changed by this local candidate.

## Validation

See the dated [initial validation record](../validation/name-binding-security-2026-10-15.md) and the [pilot checklist](../validation/name-witness-pilot-checklist-2026-10-15.md). Protocol tests use real Ed25519 signatures; content tests use original signed ANS-104 examples. Simulated operator identities, injected RPC/transport boundaries and Electron doubles are identified as such. They do not replace a live independent-operator or packaged Windows acceptance test.
