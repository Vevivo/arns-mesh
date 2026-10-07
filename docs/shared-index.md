# R84 index preparation on a supporter

[Türkçe](tr/paylasilan-indeks.md) · [Complete supporter setup](en/supporter.md)

The normal **0.6.0 supporter setup includes this step**. R84 location lookup is part of the standard VPS/Pi supporter path, alongside name collection and verified-file preparation. It runs on the server, not on readers' computers. It is not a full AR.IO gateway.

The index maps content IDs to their Arweave bundle and position. It improves locating files; the files still have to be fetched, verified and retained. It does not replace the name binding or create a missing copy during an outage.

## Standard setup

Follow [supporter installation](en/supporter.md). `setup-supporter.sh` calls `install-shared-index.sh` after its capacity checks. It creates:

- A separate `mesh-index-sync` system account with no interactive login.
- Root-owned, versioned source and a Node executable under `/opt/arns-mesh-index-tools`. Only code/dependencies are copied; supporter data and private keys are excluded.
- Public index data at `/var/lib/arns-mesh-shared-index`.
- A restricted oneshot service and a timer that refreshes 15 minutes after each completed run.
- An initial **24 GiB per UTC day** download allowance, removed after the first successful run. Later runs use **4 GiB per UTC day**.
- A **50 GiB disk budget**, including simultaneous old/new generations during refresh.

The updater uses HTTPS and DNS to observe the publisher's registry binding and retrieve signed publications. The peer's installed-index lookup uses disk. Healthy upstreams remain enabled; refreshing does not turn them off.

The initial publisher is Turbo's registered gateway. The registered HTTPS origin and observed signing key are pinned in `trust.json`. This is an RPC registry observation, not a native inclusion proof. Existing trust is preserved; key changes require review.

Signatures, hashes, sizes and CDB pointers must validate before a band is installed. Old bands stay available during a failed update. A 50 GiB allowance is based on the previously observed approximately 21 GB publication plus refresh room; a future larger offer may require more space.

## Install or repair the updater separately

Use the checked-out release matching `package.json`.

```bash
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
sudo bash scripts/install-shared-index.sh --source "$PWD" --node "$(command -v node)"
```

This command changes only the separate updater. Normal setup also configures `ARNS_SHARED_INDEX_DIR` on the supporter. Existing managed paths can be reused; unrelated existing paths/services are refused. Wait for an active updater to finish before updating its runtime.

Do not copy a supporter's identity into the index account. Do not delete pinned trust or disable verification to make an update pass.

## Check progress

```bash
systemctl status arns-mesh-index-sync.service --no-pager
journalctl -u arns-mesh-index-sync.service -n 30 --no-pager
cat /var/lib/arns-mesh-shared-index/sync-status.json
cat /var/lib/arns-mesh-shared-index/installed.json
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
```

A long `activating (start)` state can mean the first download is working. A complete band is usable while later bands arrive. The peer reads completed new bands on later lookups without needing a restart.

| State | Meaning and action |
|---|---|
| `index_daily_download_budget` | Wait for the next UTC-day allowance or review the budget. It is separate from site downloads. |
| `offered_index_exceeds_disk_budget` / `index_disk_budget` | Increase the separate SSD allowance after checking available space; incomplete new bands are not installed. |
| `index_disk_headroom` | Free working space is too low; stop adding data and review storage. |
| `index_http_402` | The publisher requires a different access/payment policy. Mesh never pays automatically. |
| `index_http_429` | Publisher rate limit; wait before retrying. |
| `index_http_504` | Upstream timeout; bounded retries may resume later. |
| Signature/hash/pointer error | The band is rejected; investigate the source or corruption. |
| Installed index but missing site | Inspect accepted name records and actual verified files. An index count is not a site count. |

The initial higher allowance remains after a failed run; inspect repeated failures. The budgets are accounted downloads, not host-wide traffic caps. Preserve old installed bands on failure.

[Official index sharing](https://docs.ar.io/build/run-a-gateway/manage/index-sharing) · [AR.IO Release 84](https://github.com/ar-io/ar-io-node/releases/tag/r84) · [Independent serving check](en/resilience.md)
