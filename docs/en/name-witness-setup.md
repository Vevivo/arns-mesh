# Name witness setup

A name witness checks the current ArNS registry and ANT record through its configured Solana RPC sources, then signs that observation. Content verification remains separate. Readers require the threshold of matching signatures specified in their authenticated policy before treating a mapping as current.

This code does not establish an independent operator network by itself. A four-operator policy with a threshold of three assumes four independently administered operators and tolerates at most one faulty operator. Four keys on one administrator's servers do not meet that assumption. Shared RPC providers can also create correlated failures or incorrect observations. The coherent RPC response is not a Solana account inclusion proof.

## Prerequisites

Use a Linux supporter server, a local filesystem that supports file and directory `fsync`, and the project's supported Node version. Store signer data in a private directory outside the source checkout, on durable storage. The directory must not already exist when generating the key. Its parent must exist and be writable by the service user.

Agree on and independently authenticate the policy before enrollment: network, Solana genesis hash, registry program, operator public keys and domains, threshold, validity period and freshness window. Obtain its policy ID through that trusted review process. Merely downloading a policy and calculating its hash does not authenticate the policy.

## Generate one new operator key

Run as the eventual service user, replacing the example path:

```sh
node scripts/name-witness.mjs keygen --data-dir /var/lib/arns-mesh-witness/operator-a
```

The command creates a new Ed25519 private key with mode `0600` in a directory with mode `0700`. Output includes the public key's ID and the path to `public-key.pem`. Share only that public key for policy review. The private key is never printed, and importing an old key is not an option.

## Enroll once against the reviewed policy

Once the policy includes this public key and the operator has independently confirmed its ID:

First include that same policy as `nameWitnessPolicy` in the reviewed network profile. Preserve the supporter's existing numeric IP addresses, RPC sources, trusted peers and other profile settings. Apply the profile to its **existing** data directory:

```sh
node scripts/profile.mjs check /path/to/reviewed/protected-network-profile.json
node scripts/profile.mjs apply /path/to/reviewed/protected-network-profile.json /existing/arns-mesh-peer-data
```

Keep the service's existing `ARNS_MESH_DATA` value. The new private key directory is separate; it must not replace the directory containing the existing index and saved content. Enrollment reads the policy already accepted in that peer directory and refuses a mismatch.

```sh
node scripts/name-witness.mjs enroll \
  --data-dir /var/lib/arns-mesh-witness/operator-a \
  --peer-data-dir /existing/arns-mesh-peer-data \
  --policy /path/to/reviewed/name-witness-policy.json \
  --policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID \
  --rpc-seeds /path/to/operator/witness-rpc-seeds.private.json \
  --max-names 50000
```

The policy must be active, unrevoked, structurally safe, and contain the generated public key. The command durably consumes a one-time enrollment record, creates the signer state, and writes `runtime-env.json`. It does not start or restart the supporter.

For the volunteer pilot, provide the separate operator-reviewed numeric-IP RPC file with --rpc-seeds. It must contain 1–16 host/port objects and must not be the shared profile's managed RPC file. Configure the service with the four environment variables listed in that JSON file:

| Variable | Purpose |
| --- | --- |
| `ARNS_NAME_SIGNER_KEY` | Private key file; do not publish |
| `ARNS_NAME_SIGNER_STATE` | Durable directory retaining original signed decisions |
| `ARNS_NAME_SIGNER_EPOCH` | Expected identity of that state directory |
| `ARNS_NAME_SIGNER_RPC_SEEDS` | This operator's separate reviewed numeric-IP RPC file |

Retain the existing Mesh network settings. The dedicated signer RPC configuration is captured at startup; restart cleanly to change its file contents. Different configuration files do not by themselves establish independent providers. Enrollment without --rpc-seeds preserves the older shared-RPC behavior; the volunteer pilot explicitly uses the dedicated setting. No witness request triggers recursive collection from other peers; certificate collection is a separate background/reader operation.

At startup, Mesh reads the policy from the existing peer data directory. The CLI does not emit an `ARNS_NAME_WITNESS_POLICY` override because startup deliberately selects the policy accepted by that installation. The policy ID there must continue to match the enrolled signer state. The CLI's own policy copy is an enrollment record, not a replacement network data directory.

Use the generated values as literal service configuration; `runtime-env.json` is JSON, not a shell script. Keep the epoch and identity in trusted deployment configuration as well as the data directory. Start the supporter only after the full operator policy and reachability checks have been completed. A single enrolled witness cannot satisfy a three-signature policy.

## Persistence, interruption and recovery

Each name has its own small state file. Updating one name does not rewrite a catalogue of 50,000 names. The configured capacity counts first allocations; an interrupted allocation may consume capacity without a completed record, which is a safe failure. Reads and failed lookups do not allocate name state.

Within one signing round, the witness returns the original signed observation. It does not rewrite its date or sign another target for the same name and round. A previous observation is not proof that no newer on-chain update exists. During an outage, previously accepted certificates retain their original dates and are presented as historical evidence.

Do not remove `enrollment-consumed.json`, reset `signer-state`, copy one private key to multiple writable signer instances, or restore an old snapshot and continue signing under that key. Missing known-name state, an unexpected epoch, clock rollback or a stale writer lock fails closed. A lock left by a crash needs supervised recovery after confirming there is no active writer and reviewing state integrity.

An interrupted enrollment is deliberately not retried with the old key. Generate a new key in a new directory and update the authenticated policy through the operator review process. Lost signing history also requires that recovery process; an empty directory must never be silently treated as the original history. Policy/key migration is explicit, not automatic.

Local markers cannot detect a malicious administrator, deletion of an entire name directory, or rollback of the complete storage volume and its external configuration together. Keep independently anchored recovery records and do not reuse a key when its signing history is uncertain. Native filesystem tests cover normal close/reopen, writer exclusion, missing files and symlink rejection; they do not certify power-loss behavior on every filesystem.
