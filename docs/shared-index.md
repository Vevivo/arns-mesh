# Add the signed R84 content index to a supporter

[Türkçe](tr/paylasilan-indeks.md) · [Supporter setup](en/supporter.md) · [How failover works](en/resilience.md)

This is an **optional server-side setup** for a new Linux supporter. It uses the Mesh integration of AR.IO Release 84 indexes. It does not install a full AR.IO gateway, change the Windows ZIP or download the index to readers.

## What it adds

The index maps content IDs to their Arweave bundle and position. The supporter answers Mesh location requests from disk, then the reader can obtain and verify actual files from available sources.

Name resolution remains separate. During a full upstream outage, a useful supporter needs accepted name records **and actual content copies**. An index alone supplies neither.

The current Mesh updater uses **HTTPS**, separately from the locked-down peer. It needs DNS/HTTPS while configuring the publisher and refreshing files. The peer's installed-index lookup does not. Signatures, file sizes, hashes and CDB pointers are checked before a whole band is installed. The old band remains available if an update fails; stale publications are reported as stale.

Mesh does not automatically pay x402 requests or bypass publisher limits. [Official index-sharing documentation](https://docs.ar.io/build/run-a-gateway/manage/index-sharing) · [Release 84](https://github.com/ar-io/ar-io-node/releases/tag/r84).

## Before you start

- Complete the [supporter setup](en/supporter.md) at source commit `37d51c79614c389b515b43d4a3bd92f9bd5083d2`. Dependencies must be installed in that source checkout.
- Use Linux with systemd, a supported Node.js binary and administrator access for the separate updater account.
- Leave at least **50 GiB free on an SSD** for indexes and refresh headroom, separately from site storage. The documented publication was about 21 GB; future offers can differ.
- Run these instructions on a **new deployment**. The guards refuse existing tool/data/service paths. An existing deployment needs its own reviewed update procedure.
- The updater must not be able to read the supporter's private keys. Keep the supporter's private installation under its own account with restrictive permissions.

## 1. Prepare a separate updater

From the pinned source checkout, using the same Node version already selected for the supporter:

```bash
(
  set -eu
  test "$(git rev-parse HEAD)" = 37d51c79614c389b515b43d4a3bd92f9bd5083d2
  test -d node_modules
  test ! -e /opt/arns-mesh-index-tools
  test ! -e /var/lib/arns-mesh-shared-index
  MESH_INDEX_NODE="$(readlink -f "$(command -v node)")"
  sudo useradd --system --home-dir /var/lib/arns-mesh-shared-index --shell /usr/sbin/nologin mesh-index-sync
  sudo install -d -o root -g root -m 0755 /opt/arns-mesh-index-tools/app
  sudo install -o root -g root -m 0755 "$MESH_INDEX_NODE" /opt/arns-mesh-index-tools/node
  sudo cp -a src scripts node_modules package.json package-lock.json LICENSE NOTICE.txt WAYFINDER-LICENSE /opt/arns-mesh-index-tools/app/
  sudo chown -R root:root /opt/arns-mesh-index-tools
  sudo chmod -R a+rX /opt/arns-mesh-index-tools
  sudo install -d -o mesh-index-sync -g mesh-index-sync -m 0755 /var/lib/arns-mesh-shared-index
  sudo -u mesh-index-sync /opt/arns-mesh-index-tools/node --version
)
```

This copies source, dependencies and the Node executable, not the supporter's live data or identity. The selected Linux Node binary must run on this same host. Keep these tool files aligned with a reviewed runtime when updating later.

## 2. Pin the publisher's observed key

```bash
sudo -u mesh-index-sync /opt/arns-mesh-index-tools/node   /opt/arns-mesh-index-tools/app/scripts/configure-shared-index.mjs   --dir /var/lib/arns-mesh-shared-index
```

The default publisher is Turbo's registered gateway. This command observes its key through Solana RPC, stores `trust.json` and prints the registered origin. Confirm that the origin matches the service example below, `https://turbo-gateway.com`. If it differs, review the registry result and use that observed HTTPS origin.

No wallet, funds or private signing key is required. The initial key binding is an RPC registry observation, not a native account-inclusion proof. A later key change requires review; do not delete trust state to silence a mismatch.

## 3. Install the bounded updater and timer

These examples create **new system service files** and refuse existing paths. They do not alter the supporter service.

```bash
(
  set -eu
  test ! -e /etc/systemd/system/arns-mesh-index-sync.service
  test ! -e /etc/systemd/system/arns-mesh-index-sync.timer
  sudo tee /etc/systemd/system/arns-mesh-index-sync.service >/dev/null <<'UNIT'
[Unit]
Description=ArNS Mesh signed index preparation
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
User=mesh-index-sync
Group=mesh-index-sync
WorkingDirectory=/opt/arns-mesh-index-tools/app
Environment=ARNS_SHARED_INDEX_DIR=/var/lib/arns-mesh-shared-index
Environment=ARNS_INDEX_PUBLISHER_URL=https://turbo-gateway.com
Environment=ARNS_INDEX_DOWNLOAD_GIB=4
Environment=ARNS_INDEX_DISK_GIB=50
EnvironmentFile=-/var/lib/arns-mesh-shared-index/bootstrap.env
ExecStart=/opt/arns-mesh-index-tools/node --max-old-space-size=160 scripts/sync-shared-index.mjs
ExecStartPost=/usr/bin/rm -f /var/lib/arns-mesh-shared-index/bootstrap.env
TimeoutStartSec=infinity
CPUQuota=25%
MemoryMax=384M
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/arns-mesh-shared-index
UMask=0022
UNIT
  sudo tee /etc/systemd/system/arns-mesh-index-sync.timer >/dev/null <<'UNIT'
[Unit]
Description=Refresh ArNS Mesh shared index
[Timer]
OnBootSec=2min
OnUnitInactiveSec=15min
Unit=arns-mesh-index-sync.service
[Install]
WantedBy=timers.target
UNIT
)
```

The default allowance is **4 GiB per UTC day**. For the first full download only, the following explicitly permits **24 GiB per UTC day** until a complete run succeeds. Skip it if you want to stay at 4 GiB/day:

```bash
printf 'ARNS_INDEX_DOWNLOAD_GIB=24\n' | sudo -u mesh-index-sync tee /var/lib/arns-mesh-shared-index/bootstrap.env >/dev/null
```

The successful run removes only this override; later runs use 4 GiB/day. A failed run keeps it, so review prolonged bootstrap use. These are accounted download limits, not a host-wide bandwidth cap.

Enable the timer and start the first run without waiting in the terminal:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now arns-mesh-index-sync.timer
sudo systemctl start --no-block arns-mesh-index-sync.service
```

The timer waits 15 minutes after a run ends. A long `activating (start)` state is normal for this oneshot download job while its process is working. Do not start a second manual updater over the same directory.

## 4. Let this new supporter read the index

Add this line once to the supporter's existing `peer.env`, preserving its other settings:

```text
ARNS_SHARED_INDEX_DIR=/var/lib/arns-mesh-shared-index
```

As the supporter account, check read access to `installed.json` after the first band installs, then restart **this supporter only**:

```bash
test -r /var/lib/arns-mesh-shared-index/installed.json
systemctl --user restart arns-mesh-supporter
```

Later complete bands load on subsequent lookups without restarting the peer. Read access to public index files does not require giving the updater access to peer identity files.

## 5. Check progress and actual use

```bash
systemctl status arns-mesh-index-sync.service --no-pager
journalctl -u arns-mesh-index-sync.service -n 30 --no-pager
cat /var/lib/arns-mesh-shared-index/sync-status.json
cat /var/lib/arns-mesh-shared-index/installed.json
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
```

Run the last command from the pinned source checkout as the supporter account. In its report, inspect `sharedIndex.enabled`, `bands`, `records`, `lookups`, `hits`, `stale` and `lastError`. A complete band is usable while other bands are still arriving. Entry counts are not website counts or page-load success rates.

| Condition | Meaning and action |
|---|---|
| `index_http_402` | Publisher payment/access policy blocked a file; no payment is made automatically. Inspect provider policy before retrying. |
| `index_http_429` | Publisher rate limit; allow time before the next attempt. |
| `index_http_504` | Upstream timeout; bounded retries may resume later. |
| `index_daily_download_budget` | This updater's UTC-day budget is used; it is separate from content/name budgets. |
| Signature, hash or pointer error | The band is not installed. Investigate; do not turn off validation. |
| Installed index, but missing site | Check the name binding and actual files, not only location records. |

Do not delete installed bands during a failed refresh. Downloaded partitions can be reused. Do not assume retrying a 402 will necessarily succeed or that HTTP download has a guaranteed completion time.

[Initial rollout evidence](validation/index-sharing-2026-10-05.md) · [Later read-only verification](validation/read-only-status-2026-10-06.md) · [Failover preparation](en/resilience.md).
