#!/usr/bin/env bash
set -euo pipefail
install_root="${MESH_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/ArNS-Mesh-Supporter}"
[[ -x "$install_root/Start-Peer.sh" ]] || { echo 'Install the peer first.' >&2; exit 1; }
[[ "$install_root" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Service install path must use letters, digits, slash, dot, underscore and hyphen only.' >&2; exit 1; }
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"; mkdir -p "$unit_dir"
unit_file="$unit_dir/arns-mesh-supporter.service"
if [[ -e "$unit_file" ]] && ! grep -qx '# Managed by ArNS Mesh supporter setup' "$unit_file"; then
 echo 'Existing unmanaged service file preserved. Review it before migration.' >&2; exit 1
fi
cpu=50; memory=1024
if [[ -f "$install_root/peer.env" ]]; then
 while IFS='=' read -r key value; do
  case "$key" in MESH_SERVICE_CPU_PERCENT) cpu="$value";; MESH_SERVICE_MEMORY_MIB) memory="$value";; esac
 done < "$install_root/peer.env"
fi
[[ "$cpu" =~ ^[0-9]+$ && "$cpu" -ge 1 && "$cpu" -le 800 ]] || { echo 'Invalid CPU limit.' >&2; exit 1; }
[[ "$memory" =~ ^[0-9]+$ && "$memory" -ge 512 && "$memory" -le 65536 ]] || { echo 'Invalid memory limit.' >&2; exit 1; }
cat > "$unit_file.new" <<UNIT
# Managed by ArNS Mesh supporter setup
[Unit]
Description=ArNS Mesh supporter
After=network-online.target
[Service]
Type=simple
ExecStart=$install_root/Start-Peer.sh
Restart=on-failure
RestartSec=15
TimeoutStopSec=30
NoNewPrivileges=yes
UMask=0077
CPUQuota=$cpu%
MemoryMax=${memory}M
TasksMax=128
LimitNOFILE=2048
[Install]
WantedBy=default.target
UNIT
if [[ -f "$unit_file" ]] && cmp -s "$unit_file" "$unit_file.new"; then rm "$unit_file.new"; else mv "$unit_file.new" "$unit_file"; fi
systemctl --user daemon-reload
systemctl --user enable --now arns-mesh-supporter.service
printf 'User service enabled. Check: systemctl --user status arns-mesh-supporter\nUse setup-supporter.sh for boot lingering, R84 preparation and readiness guidance.\n'
