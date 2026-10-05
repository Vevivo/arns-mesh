# Shared content indexes

The supporter can keep AR.IO Release 84 signed CDB64 bands on disk and answer existing Mesh `location` requests from them. The Windows preview.13 client already understands these replies: a connected reader does not need to import a second code or download the full index.

This locates **content IDs**, not ArNS names. Name-to-ID resolution remains a separate RPC/retained-observation step. An index is neither a website backup nor proof that its publisher indexed every item. Newest items can lag the publisher's rebuild. A location remains an untrusted routing hint: Mesh verifies the requested content's ID and signature before displaying it.

## Two separate processes

- **Online preparation:** `sync-shared-index.mjs` uses the configured publisher's HTTPS endpoint to download signed index files. This process depends on working DNS/HTTPS while refreshing. It is not part of a reader navigation and never supplies website bytes through a gateway.
- **Mesh service:** `ARNS_SHARED_INDEX_DIR` enables a disk-only reader. Its existing DNS, TLS and gateway-route restrictions stay in force. Index lookups work from installed files even after the publisher and RPC stop responding. Actual website bytes still require reachable raw Arweave storage or previously retained Mesh copies; saved name observations are needed when RPC fails.

Publication signatures use RFC 8785 canonical JSON and the publisher's registered observer key. The updater rejects rollback/equivocation, verifies SHA-256 and sizes, validates CDB64 records/tables and publishes a band atomically. Interrupted downloads resume. A failed or expired update preserves the last installed bands. Expired installed publications are reported as stale, not silently presented as current. A publisher key change requires operator review.

## VPS or 64-bit Raspberry Pi

Use the current `feat/resilient-access` supporter source and Node.js 24. Install its dependencies with `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` before these commands. A Pi should use an SSD with at least 50 GiB free for the index; this is separate from website storage. No Docker or complete gateway is required.

From that source checkout:

```bash
export ARNS_SHARED_INDEX_DIR="$HOME/.local/share/ArNS-Mesh-Indexes"
node scripts/configure-shared-index.mjs --dir "$ARNS_SHARED_INDEX_DIR"
export ARNS_INDEX_PUBLISHER_URL="https://turbo-gateway.com"
ARNS_INDEX_DOWNLOAD_GIB=24 node scripts/sync-shared-index.mjs
```

The setup command reads the publisher's observer key from the Solana registry through a public RPC and pins the observation locally. No wallet, funds or private key is needed. Retry the last command if an interrupted first download has already used more than the normal daily allowance.

Set the **same absolute `ARNS_SHARED_INDEX_DIR`** in the supporter process environment (`peer.env` or its systemd service), then restart that supporter once. It must be allowed to read the index directory. Never give the updater access to Mesh signing keys. Newly installed bands load within about two seconds of the next lookup; no restart is needed for index refreshes.

Run the sync command periodically as a **separate** timer/cron job. Do not import or spawn it from the browser or locked-down peer. The default daily download ceiling is 4 GiB and the index disk ceiling is 50 GiB; use `ARNS_INDEX_DOWNLOAD_GIB` and `ARNS_INDEX_DISK_GIB` to change them. The bootstrap example explicitly permits up to 24 GiB that UTC day. This budget is additional to the existing website/name/raw-discovery budgets. HTTP 402/429 pauses the updater; it does not pay or bypass the publisher's limits. Temporary server failures have bounded retries. This implementation currently uses HTTP preparation, not BitTorrent.

## Check that it is being used

`sync-status.json` reports installation progress, errors and download bytes. `installed.json` lists only fully validated bands. The supporter's loopback operator dashboard and `/status` show installed bands, indexed entries, local lookup/hit counts, publication date and errors. These counts describe index entries, not online users, complete websites or successful page loads.

A reader asks the supporter for an ID. The supporter returns a signed location from its local index, including offsets when available; this does not wait for the background catalog to download that website. The reader can then fetch and verify the item directly from reachable raw peers. The supporter also uses the local index for its bounded content preparation and on-demand cache filling.

## Recovery and verification scope

Keep the prior supporter release and service configuration for rollback. Index files are immutable by digest and stored outside the release directory; updating application code does not discard them. Do not delete old installed bands while a replacement is incomplete.

The source tests cover invalid signatures/hashes/pointers, rollback, float64 offsets above 4 GiB, interrupted installation, disk-only lookup and an actual Mesh protocol reply with upstream access disabled. Live evidence is recorded separately; a passing source test is not a claim that every public ArNS site opens or that all files are replicated across independent hosts.
