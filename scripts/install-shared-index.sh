#!/usr/bin/env bash
set -euo pipefail
umask 022
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
dry_run=0; node_bin=''
while [[ $# -gt 0 ]]; do
 case "$1" in --node) node_bin="${2:?Absolute Node binary required}"; shift 2;; --source) source_root="${2:?Source checkout required}"; shift 2;; --dry-run) dry_run=1; shift;; *) echo 'Usage: bash scripts/install-shared-index.sh [--source CHECKOUT] [--node NODE_BINARY] [--dry-run]' >&2; exit 1;; esac
done
source_root="$(cd -- "$source_root" && pwd)"
[[ -f "$source_root/scripts/configure-shared-index.mjs" && -f "$source_root/package-lock.json" ]] || { echo 'Reviewed Mesh source required.' >&2; exit 1; }
node_bin="${node_bin:-$(command -v node || true)}"
[[ -n "$node_bin" && -d "$source_root/node_modules" ]] || { echo 'Install Node.js and locked source dependencies before installing the updater.' >&2; exit 1; }
if [[ "$dry_run" == 1 ]]; then
 echo 'R84 plan: separate mesh-index-sync system user; root-owned versioned code/runtime; /var/lib/arns-mesh-shared-index public data; restricted oneshot service and 15-minute refresh timer; 50 GiB disk, first-run 24 GiB/day, later 4 GiB/day.'
 exit 0
fi
[[ "$(id -u)" == 0 ]] || { echo 'Run this separate index installer with sudo.' >&2; exit 1; }
tools_root=/opt/arns-mesh-index-tools
index_dir=/var/lib/arns-mesh-shared-index
unit=/etc/systemd/system/arns-mesh-index-sync.service
timer=/etc/systemd/system/arns-mesh-index-sync.timer
for existing in "$tools_root" "$index_dir"; do
 [[ ! -e "$existing" || -f "$existing/.managed-by-arns-mesh-setup" ]] || { echo "Existing unmanaged path preserved: $existing. Follow the reviewed update procedure." >&2; exit 1; }
done
for existing in "$unit" "$timer"; do
 [[ ! -e "$existing" ]] || grep -qx '# Managed by ArNS Mesh supporter setup' "$existing" || { echo "Existing unmanaged service preserved: $existing" >&2; exit 1; }
done
systemctl is-active --quiet arns-mesh-index-sync.service && { echo 'Index updater is active. Wait for its run to finish before updating its code.' >&2; exit 1; }
if ! id mesh-index-sync >/dev/null 2>&1; then
 useradd --system --home-dir "$index_dir" --shell /usr/sbin/nologin mesh-index-sync
elif [[ ! -f "$tools_root/.managed-by-arns-mesh-setup" ]]; then
 echo 'Existing mesh-index-sync account needs review; no account or path was changed.' >&2; exit 1
fi
install -d -o root -g root -m 0755 "$tools_root" "$tools_root/releases"
install -d -o mesh-index-sync -g mesh-index-sync -m 0755 "$index_dir"
touch "$tools_root/.managed-by-arns-mesh-setup" "$index_dir/.managed-by-arns-mesh-setup"
stage="$(mktemp -d "$tools_root/releases/runtime-XXXXXXXX")"
trap 'if [[ -n "${stage:-}" ]]; then rm -rf -- "$stage"; fi' EXIT
install -d -o root -g root -m 0755 "$stage/app"
install -o root -g root -m 0755 "$(readlink -f "$node_bin")" "$stage/node"
for entry in src scripts node_modules package.json package-lock.json LICENSE NOTICE.txt WAYFINDER-LICENSE; do cp -RL "$source_root/$entry" "$stage/app/"; done
chown -R root:root "$stage"
chmod -R a+rX "$stage"
# Public key binding is observed only during initial setup; existing trust is never silently replaced.
if [[ ! -f "$index_dir/trust.json" ]]; then
 runuser -u mesh-index-sync -- "$stage/node" "$stage/app/scripts/configure-shared-index.mjs" --dir "$index_dir"
fi
origin="$("$stage/node" --input-type=module -e 'import fs from "node:fs";const x=JSON.parse(fs.readFileSync(process.argv[1]));const u=new URL(x.origin);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("invalid_pinned_origin");console.log(u.origin)' "$index_dir/trust.json")"
# The path below is root-controlled and contains no user-supplied systemd syntax.
cat > "$unit.new" <<UNIT
# Managed by ArNS Mesh supporter setup
[Unit]
Description=ArNS Mesh signed index preparation
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
User=mesh-index-sync
Group=mesh-index-sync
WorkingDirectory=$stage/app
Environment=ARNS_SHARED_INDEX_DIR=$index_dir
Environment=ARNS_INDEX_PUBLISHER_URL=$origin
Environment=ARNS_INDEX_DOWNLOAD_GIB=4
Environment=ARNS_INDEX_DISK_GIB=50
EnvironmentFile=-$index_dir/bootstrap.env
ExecStart=$stage/node --max-old-space-size=160 scripts/sync-shared-index.mjs
ExecStartPost=/usr/bin/rm -f $index_dir/bootstrap.env
TimeoutStartSec=infinity
CPUQuota=25%
MemoryMax=384M
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=$index_dir
UMask=0022
UNIT
cat > "$timer.new" <<'UNIT'
# Managed by ArNS Mesh supporter setup
[Unit]
Description=Refresh ArNS Mesh shared index
[Timer]
OnBootSec=2min
OnUnitInactiveSec=15min
Unit=arns-mesh-index-sync.service
[Install]
WantedBy=timers.target
UNIT
if [[ ! -f "$index_dir/installed.json" && ! -f "$index_dir/bootstrap.env" ]]; then
 printf 'ARNS_INDEX_DOWNLOAD_GIB=24\n' > "$index_dir/bootstrap.env"
 chown mesh-index-sync:mesh-index-sync "$index_dir/bootstrap.env"
fi
mv "$unit.new" "$unit"
mv "$timer.new" "$timer"
stage='' # Committed runtime remains available, including for rollback.
systemctl daemon-reload
systemctl enable --now arns-mesh-index-sync.timer
systemctl start --no-block arns-mesh-index-sync.service
echo 'R84 updater enabled under its separate account. First download is asynchronous; check sync-status.json and service logs.'
