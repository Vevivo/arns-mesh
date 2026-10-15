# Join the name-witness pilot

[Türkçe](../tr/isim-tanigi-pilot.md) · [Run a normal supporter](supporter.md) · [Detailed witness enrollment](name-witness-setup.md)

**Mesh does not need four volunteers just to keep working.** A normal supporter stores and serves verified site files. The optional name-witness pilot adds a separate protection: one supporter cannot choose a name's content ID alone.

This guide covers the optional witness feature in **0.6.3**. Native Linux, real HTTP and actual Windows application checks have run; the [dated validation record](../validation/name-security-2026-10-16.md) identifies the tested revisions and outstanding release checks. A live committee of independent operators has not yet been recruited or activated on the existing production network. Use the matching release source, or the exact reviewed candidate commit when testing before publication.

## Choose how to help

| Role | What you provide | Independent name vote? |
| --- | --- | --- |
| Content supporter | Available site files, preparation, replication and an additional reachable route | No. Adding a supporter does not change the witness policy. |
| Name witness | A separately controlled signing key, persistent signing state and checked current chain observations | Yes, once its public key and operator are included in the authenticated pilot policy. |
| Both | Content service and an enrolled name witness on your server | One operator's vote, regardless of its server count. |

To help availability today, follow the [normal supporter installation](supporter.md), using the source/release version actually reviewed for that installation. Its storage, R84 setup and preparation workflow remain unchanged. You do not need to become a witness or wait for a committee.

For the protected pilot, the starting plan is **four independent operators, three matching votes, at most one faulty operator**. Ten volunteers are welcome: they can all serve content. If all ten will be independent witnesses, agree on that roster **before activation**; a ten-operator policy can require **seven matching votes and tolerate at most three faulty operators**. The threshold is an explicit policy choice, not a counter of online peers.

Several servers, keys or relayed copies belonging to one administrator count as **one** independence domain. A domain here means an independently controlled operator, not a DNS hostname. Automated tests with four keys do not establish four independent real operators. Shared RPC sources can also correlate failures or incorrect observations.

A current protected lookup needs the configured quorum's still-valid evidence. During an outage, **one reachable supporter can deliver an existing full certificate and its verified files**: the original three signatures remain verifiable without contacting those three operators again. Expired evidence is dated history, not a fresh name observation. A new reader can accept that history only while the pinned policy is active; after policy expiry, only its exact previously accepted history remains eligible. See [the trust model](name-security.md).

## 1. Prepare a separate pilot installation

Use Linux with Node 24, durable local storage supporting file and directory fsync, and an accurate clock. Use a separate VM or installation account and **new pilot directories**. A separate VM is simplest when the production supporter is already running. Do not run the normal installer over that production installation to create a pilot: its managed service names and index updater are shared operational resources.

From the reviewed candidate checkout:

~~~sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
umask 077
PILOT_ROOT="$HOME/.local/share/ArNS-Mesh-Name-Pilot"
PILOT_DATA="$PILOT_ROOT/peer-data"
WITNESS_DATA="$PILOT_ROOT/witness"
mkdir -p "$PILOT_DATA"
node scripts/name-witness.mjs keygen --data-dir "$WITNESS_DATA"
~~~

The witness directory must be new; key generation creates it. Do not copy a production identity or another operator's private key. Keep production content and indexes in their existing directories.

Give the roster maintainer:

- The generated **public-key.pem** and its printed key ID.
- Your chosen operator label and who controls its key, server and RPC sources.
- Your **real reachable numeric IP and unused TCP port**, plus whether DHT discovery is reachable.
- Native test results and the candidate commit you ran.

Never provide private-key.pem, signer-state, enrollment files or private deployment configuration. No operator addresses are supplied by this guide: replace every IP/port placeholder with a real agreed endpoint. Four addresses on one person's machines do not create four operators.

## 2. Review and authenticate one shared policy

The roster maintainer collects public keys only. The reviewed roster file has this shape; replace the example labels and PEM placeholders with the real public keys:

~~~json
{
  "schema": "arns-mesh-name-witness-roster/v1",
  "witnesses": [
    {"domain": "operator-a", "publicKeyPem": "CONTENTS OF A PUBLIC KEY PEM"},
    {"domain": "operator-b", "publicKeyPem": "CONTENTS OF B PUBLIC KEY PEM"},
    {"domain": "operator-c", "publicKeyPem": "CONTENTS OF C PUBLIC KEY PEM"},
    {"domain": "operator-d", "publicKeyPem": "CONTENTS OF D PUBLIC KEY PEM"}
  ]
}
~~~

Agree on the pilot network ID, actual Solana genesis hash, registry program ID, operator roster, threshold, round length, fixed lease and policy start/end times. A chain name such as “mainnet” alone is insufficient. Independently confirm these details with the participating operators.

The maintainer creates the policy:

~~~sh
node scripts/name-witness-policy.mjs create \
  --roster reviewed-roster.json \
  --network-id AGREED_PILOT_NETWORK_ID \
  --genesis-hash VERIFIED_SOLANA_GENESIS_HASH \
  --registry-program-id VERIFIED_REGISTRY_PROGRAM_ID \
  --max-faults 1 --threshold 3 \
  --round-ms 60000 --lease-ms 0 --max-future-skew-ms 5000 \
  --valid-from AGREED_START_ISO_UTC \
  --valid-until AGREED_END_ISO_UTC \
  --output name-witness-policy.json
~~~

The time values must be real UTC dates agreed for this pilot, not the placeholder text. A 60-second round with no extra lease makes evidence expire at the round boundary. The five-second future-skew limit is explicit: cross-host testing measured about 2.3 seconds of clock difference and rejected a one-second fixture tolerance. Keep clocks synchronized and review this allowance with the operators. It does not extend an expired certificate or prove instantaneous freshness; review collection latency as well as clock accuracy before choosing the window.

Every operator obtains the **policy ID through an authenticated channel** and checks the actual file:

~~~sh
node scripts/name-witness-policy.mjs check \
  --policy name-witness-policy.json \
  --policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID
~~~

Checking a downloaded file's hash alone does not identify who approved it. Compare the policy ID and roster through the operators' established identities. The check requires an active, unrevoked policy; wait until its agreed start time before applying and enrolling.

**Freeze the roster for this pilot.** Adding/removing a witness, changing a threshold, renewing expiry or rotating a key changes the policy ID. Existing protected installations intentionally refuse such replacement; automatic policy migration is not implemented. Do not remove guard/state files to bypass that refusal. A later roster needs an explicitly reviewed migration implementation or a separate pilot with a new identity and new keys.

## 3. Apply the protected profile, then enroll

The maintainer supplies a reviewed pilot network profile containing this exact policy as nameWitnessPolicy, the agreed numeric peer addresses, and usable RPC/content routes. The profile must preserve the intended connection settings. Applying a policy does not invent endpoints or provision other witnesses.

The coordinator creates the profile with the actual routes and the authenticated policy ID. This witness-only example uses the dedicated operator RPC files below, so it needs no shared RPC/content routes:

~~~sh
node scripts/profile.mjs \
  --peer OPERATOR_A_REAL_IP:49751 \
  --peer OPERATOR_B_REAL_IP:49751 \
  --peer OPERATOR_C_REAL_IP:49751 \
  --peer OPERATOR_D_REAL_IP:49751 \
  --name-policy name-witness-policy.json \
  --name-policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID \
  --output protected-pilot-profile.json
node scripts/profile.mjs check protected-pilot-profile.json
~~~

Replace every placeholder with a real numeric address. For content supporters/readers, also supply their reviewed routes with --rpc IP:PORT, --arweave IP:PORT and any needed --trust-peer PUBLIC_PEER_ID options; each can repeat. This creates a new profile with the exact checked policy and refuses an existing output file. It does not start a service, create a connection code or authenticate the coordinator. Operators still verify the same policy ID before applying it.

Each witness must also maintain its **own RPC seed file**, separately from the shared profile. Save an operator-reviewed JSON array at "$PILOT_ROOT/witness-rpc-seeds.private.json", for example `[{"host":"YOUR_VERIFIED_NUMERIC_RPC_IP","port":8899}]`, replacing the placeholder and port with actual values. Use numeric IPs, not hostnames or URLs; do not put credentials in this public-address format. Confirm the chain/genesis and the source you trust. Four operators automatically inheriting one shared RPC list do not establish independent observation sources.

Use the **actual peer data directory that the pilot process will run with**, not the separate private-key directory:

~~~sh
node scripts/profile.mjs check protected-pilot-profile.json
node scripts/profile.mjs apply protected-pilot-profile.json "$PILOT_DATA"

node scripts/name-witness.mjs enroll \
  --data-dir "$WITNESS_DATA" \
  --peer-data-dir "$PILOT_DATA" \
  --policy name-witness-policy.json \
  --policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID \
  --rpc-seeds "$PILOT_ROOT/witness-rpc-seeds.private.json" \
  --max-names 50000
~~~

Enrollment is one-time and writes runtime-env.json. Set these four literal values in the pilot process/service environment:

| Variable | Source |
| --- | --- |
| ARNS_NAME_SIGNER_KEY | Private key file path from runtime-env.json |
| ARNS_NAME_SIGNER_STATE | Durable state directory from runtime-env.json |
| ARNS_NAME_SIGNER_EPOCH | Exact generated epoch from runtime-env.json |
| ARNS_NAME_SIGNER_RPC_SEEDS | This operator's separate reviewed numeric-IP RPC seed file |

runtime-env.json is JSON; do not execute it as a shell script. ARNS_NAME_SIGNER_RPC_SEEDS prevents changes to the shared profile's normal RPC routes from silently choosing this witness's observation sources. Do not point the pilot at the production peer-data directory. Missing or uncertain signing history is a recovery issue, not permission to start the same key with empty state. [Enrollment and recovery details](name-witness-setup.md).

### Witness-only supervised start

Once all operators have the same policy, use the following foreground recipe for a **name witness without site preparation**. First export the four values above, then:

~~~sh
export ARNS_MESH_DATA="$PILOT_DATA"
export MESH_ADVERTISE="YOUR_REAL_PUBLIC_IP:49751"
export ARNS_UPSTREAM_FETCH=0
export ARNS_CATALOG_ENABLED=0
export ARNS_ONLINE_PREPARATION=0
export ARNS_PREPARE_ENABLED=0
export ARNS_REPLICATION_ENABLED=0
node apps/peer/main.mjs --listen 0.0.0.0:49751 --name AGREED_TEST_ARNS_NAME
~~~

These settings disable the normal upstream content fetcher, catalogue, preparation workers and content replication. They do not turn off the enrolled witness's explicit RPC observer, which uses ARNS_NAME_SIGNER_RPC_SEEDS. Use --name, not --pin: this recipe does not prepare or promise website files. Identity, signing history and certificate metadata still require durable storage. Use a real name and unused port, with the required TCP/discovery routes reachable.

Native Linux state/enrollment and real HTTP checks have passed in controlled environments. Those results do not configure your server or establish operator independence. Verify this installation's own signed responses, reachability, clock and restart behavior before creating a separate pilot service with the same environment and paths.

### Content supporter, or both roles

The [full supporter setup](supporter.md) handles storage capacity, R84 indexes, automatic preparation and replication. The witness-only flags above deliberately omit those duties. To test protected site delivery, also provision a **separate pilot content supporter** using the reviewed candidate and the same protected policy, with its own content budgets and normal preparation settings. A content-only pilot supporter does not need a witness private key; it can collect and relay original certificates. If one operator performs both roles, enroll its single witness key as above and use its full content configuration instead of the witness-only flags. Do not apply a new policy to the running production installation during this pilot.

## 4. Run the acceptance checks

On the Linux pilot host, run the native filesystem/enrollment tests and actual HTTP tests:

~~~sh
node --test \
  tests/sharded-name-state-native.test.mjs \
  tests/name-witness-cli-native.test.mjs \
  tests/name-certificate-http.test.mjs
~~~

These tests use simulated operator keys for controlled failures. They validate implementation behavior; they do not prove independent administration or live DHT reachability. A skipped native test or blocked socket is pending validation, not a pass.

From another machine, check each real peer endpoint:

~~~sh
node scripts/probe-peer.mjs YOUR_REAL_PUBLIC_IP:49751
~~~

A responding endpoint proves reachability only. The maintainer must also distribute an authenticated **protected pilot connection code/profile with the same policy** to a separate candidate reader. An ordinary community code does not enable this pilot.

First check actual current name evidence across the real operators:

~~~sh
node scripts/check-name-witnesses.mjs \
  --policy name-witness-policy.json \
  --policy-id AUTHENTICATED_64_CHARACTER_POLICY_ID \
  --name AGREED_TEST_ARNS_NAME \
  --peer OPERATOR_A_REAL_IP:49751 \
  --peer OPERATOR_B_REAL_IP:49751 \
  --peer OPERATOR_C_REAL_IP:49751 \
  --peer OPERATOR_D_REAL_IP:49751 \
  --mode current --timeout-ms 12000
~~~

This diagnostic verifies original quorum signatures over direct numeric-IP requests. It does not verify site files, DHT discovery, real-world operator independence or instantaneous global freshness. A process merely running is not a passing quorum check. Repeat with `--mode historical` when checking retained evidence, keeping its original dates visible.

Then check retained certificate and site-file availability with the protected pilot code **against the prepared pilot content supporter**, not a witness-only process:

~~~sh
node scripts/check-supporter.mjs \
  --peer PILOT_CONTENT_SUPPORTER_REAL_IP:49751 \
  --code "$PROTECTED_PILOT_CODE" \
  --name AGREED_TEST_ARNS_NAME \
  --json
~~~

Confirm the result reports the agreed name policy and threshold. This tests retained certificate/file availability through the selected supporter; it does not prove a fresh quorum or discovery. Keep the report with the exact commit, policy ID, names, target IDs, time and resource coverage.

The operators then complete this matrix in the **isolated pilot**:

| Scenario | Required result |
| --- | --- |
| Three genuine operators agree in one round | A fresh candidate reader accepts the binding and verifies the site files. |
| One witness is unavailable | The other three can produce a fresh certificate. |
| Fewer than three votes, or one vote copied through several servers | No new current binding is accepted. Previously certified history may remain available as dated history. |
| Wrong target, signature, policy, network or same-round conflict | The reader refuses the invalid evidence; there is no one-signer fallback. |
| Certificates pass their fixed expiry | They are not labeled current; old dates are never refreshed. |
| Reader and supporters lose RPC/Arweave access routes | A reachable supporter with the original full certificate and complete verified files serves the dated retained site. |
| Original server is excluded, direct addresses change, or a peer restarts | Independently test the intended discovery routes and preserved signing/reader state. Explicit-IP success alone does not prove DHT discovery. |
| New name or target update while live routes work | A later agreed observation is accepted and its new verified files become available. |
| Actual packaged Windows candidate | Opening, retained mode, cache reuse and policy refusal behave like the controlled tests. |

Record missing resources and failures. Restore isolated test routes afterwards. Do not shut down the working production network to run this matrix.

## When to call the pilot ready

Publish the reviewed roster and policy ID, real operator confirmations, candidate commit, native/network/Windows test results and the exact supported test-site coverage. Public keys and operator endpoints may be published with their owners' agreement; private signing material stays private.

The protocol is a **configured independent-witness trust model**, not a native Solana consensus proof or a guarantee that no newer update exists. A software release can make this opt-in feature available before a public committee exists. Activating that committee is a separate, reviewed rollout with real operator enrollment. The current [validation record](../validation/name-security-2026-10-16.md) states what has actually run and what remains pending.

