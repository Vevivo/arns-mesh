#!/usr/bin/env bash
set -euo pipefail
install_root="${MESH_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/ArNS-Mesh-Supporter}"
[[ -x "$install_root/Start-Peer.sh" ]] || { echo 'Install the peer first.' >&2; exit 1; }
# Conservative path validation avoids systemd specifier, quote and newline injection.
[[ "$install_root" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Service install path must use letters, digits, slash, dot, underscore and hyphen only.' >&2; exit 1; }
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user";mkdir -p "$unit_dir"
unit_file="$unit_dir/arns-mesh-supporter.service"
[[ ! -e "$unit_file" ]] || { echo 'Service file already exists; review it instead of overwriting.' >&2; exit 1; }
cat > "$unit_file" <<UNIT
[Unit]
Description=ArNS Mesh supporter
After=network-online.target
[Service]
Type=simple
ExecStart=$install_root/Start-Peer.sh
Restart=on-failure
RestartSec=15
TimeoutStopSec=30
EnvironmentFile=-$install_root/peer.env
NoNewPrivileges=yes
UMask=0077
CPUQuota=25%
MemoryMax=512M
TasksMax=128
LimitNOFILE=2048
[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now arns-mesh-supporter.service
printf 'User service installed. Check: systemctl --user status arns-mesh-supporter\nA VPS may require an administrator to enable lingering for this user. See docs/en/supporter.md.\n'
