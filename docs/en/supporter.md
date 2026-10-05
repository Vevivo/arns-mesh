# Run a Mesh supporter

[Türkçe](../tr/destekci.md) · [Home](../../README.md) · [VPS preparation](vps.md) · [Raspberry Pi preparation](raspberry-pi.md)

A supporter contributes **name records, content locations and verified files** from a server. This guide joins an existing network. Readers keep using their Windows applications; you do not install the Windows browser on the server.

Use a new directory and an ordinary Linux account. These instructions are for a new supporter, not an instruction to replace an existing working deployment.

## Before you start

1. Prepare a [Linux VPS](vps.md) or [64-bit Raspberry Pi](raspberry-pi.md).
2. Install Git, npm and Node.js 24 LTS. The source accepts 22.12+; CI uses 24.19.0. [Isolated Node installation](node-setup.md).
3. Obtain the existing network's complete `mesh1.` invitation from an operator.
4. Choose a publicly reachable numeric IP and unused TCP port. This guide uses **49741**.

No domain, nginx, TLS certificate, wallet or full Arweave/Solana node is required for this direct-IP service. Initial downloads and R84 preparation do use external services.

## 1. Get the matching supporter source

The published desktop is preview.13. Its later server-side R84 integration is included in the source revision below. Do not install the older `main` runtime by omitting the checkout step.

```bash
git clone https://github.com/Vevivo/arns-mesh.git arns-mesh-supporter
cd arns-mesh-supporter
git checkout --detach 37d51c79614c389b515b43d4a3bd92f9bd5083d2
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
read -r -p 'Paste the complete mesh1 connection code: ' MESH_CODE
bash scripts/install-peer.sh --network "$MESH_CODE"
unset MESH_CODE
```

Stop if any command fails. The installer validates the invitation, installs locked dependencies into a versioned directory and creates a new peer identity. Existing connection files are preserved. It does not install a background service or open a firewall.

Default installation: `~/.local/share/ArNS-Mesh-Supporter`. These examples assume no custom `MESH_INSTALL_ROOT` or `XDG_DATA_HOME`.

## 2. Set a bounded contribution

Before the first start, create `peer.env`. This example refuses to overwrite an existing file:

```bash
MESH_ROOT="$HOME/.local/share/ArNS-Mesh-Supporter"
(
  set -o noclobber
  cat > "$MESH_ROOT/peer.env" <<'MESH_ENV'
MESH_LISTEN=0.0.0.0:49741
ARNS_PREPARE_ENABLED=1
ARNS_PREPARE_MAX_SITES=32
ARNS_CACHE_MIB=256
ARNS_SAVED_MIB=1024
ARNS_NAMES_DAILY_MIB=64
ARNS_CATALOG_DAILY_MIB=256
ARNS_INDEX_DAILY_MIB=64
MESH_ENV
)
```

| Setting | Meaning |
|---|---|
| `ARNS_PREPARE_MAX_SITES` | Maximum automatically managed site records; 32 here, hard cap 256 |
| `ARNS_CACHE_MIB` | Automatic content cache allowance |
| `ARNS_SAVED_MIB` | Pinned/saved content allowance |
| `ARNS_NAMES_DAILY_MIB` | Separate daily budget for name preparation |
| `ARNS_CATALOG_DAILY_MIB` | Daily accounted response bytes for content preparation |
| `ARNS_INDEX_DAILY_MIB` | Daily raw Arweave discovery budget; **not** the R84 updater budget |

These are examples, not a promise of capacity or a total traffic cap. Dependencies, indexes, logs and outgoing content traffic are additional. A full content budget can pause new preparation while names continue. Increasing a limit does not create missing files or independent replicas.

For useful long-term coverage, choose which names you intend to retain and check their files. [Prepare selected names and failover](resilience.md).

## 3. Start the background service

From the source checkout, as the same ordinary user:

```bash
bash scripts/install-user-service.sh
systemctl --user status arns-mesh-supporter --no-pager
journalctl --user -u arns-mesh-supporter -n 30 --no-pager
```

The installer enables and starts the **user service**, which reads `peer.env`. It refuses to replace an existing unit. Do not also run `Start-Peer.sh` in another terminal.

To start after boot and remain available after logout, an administrator can enable lingering for this account:

```bash
sudo loginctl enable-linger "$(id -un)"
```

The supplied service limits CPU to 25% and memory to 512 MiB where cgroups enforce them; the launcher uses a 384 MiB Node heap. These are limits, not measured minimum hardware requirements.

## 4. Confirm external reachability and discovery

From the source checkout on the supporter:

```bash
node scripts/probe-peer.mjs 127.0.0.1:49741
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Then use the probe from **another network**, replacing `YOUR_PUBLIC_IP` with your real numeric address:

```bash
node scripts/probe-peer.mjs YOUR_PUBLIC_IP:49741
```

“Mesh endpoint responded” proves reachability only. Check the operator report for an announced endpoint and a peer accepting the announcement. Allow about a minute plus processing time for discovery.

If a router exposes a different port, set `MESH_ADVERTISE=YOUR_PUBLIC_IP:PUBLIC_PORT` in `peer.env` using actual values. Restart only this new supporter after a configuration change. The setting does not open ports. IPv6 endpoints use `[ADDRESS]:PORT`.

Already joined preview.13 readers learn reachable supporters without a new code. The public invitation still controls initial contact and trusted publishers. A newly learned peer gains no authority to redefine names.

## 5. Add the R84 index if you want broader location coverage

Follow the [shared-index installation](../shared-index.md). This is a separate optional process and a separate disk/download budget, entirely on the server. The basic installer does **not** install the large index or its refresh timer.

A supporter can contribute retained content without the full shared index. A location index by itself is not a content replica.

## 6. Know when it is actually useful

After at least one status cycle, inspect:

```bash
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
du -sh "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Check the names you intend to support, `savedSites.sites`, missing files, name observation dates and `snapshotRelay.records`. A “ready” document may cover only its main file; inspect `scope`. Several names can point to the same file.

Use a separate reader to retrieve a prepared name from your supporter. Then follow the [independent failover procedure](resilience.md). “Service running,” a high index count and “port open” are not proof that another server can replace the original.

## Operations

Logs: `journalctl --user -u arns-mesh-supporter -n 30 --no-pager`. Stop: `systemctl --user stop arns-mesh-supporter`. Start: `systemctl --user start arns-mesh-supporter`.

For an update, stop this supporter, privately back up its data and launcher, review the chosen revision, rerun the installer and restart. Preserve the matching old application and data for rollback. Keep identities and signing keys private; never clone one identity onto several active peers.

[Peer discovery details](shared-network.md) · [Status and limits](status.md) · [Legacy preview.8 operations](supporter-advanced.md)
