#!/usr/bin/env bash
set -euo pipefail
umask 077
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${MESH_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/ArNS-Mesh-Supporter}"
capacity=vps; code=''; advertise=''; dry_run=0
while [[ $# -gt 0 ]]; do
 case "$1" in
  --network) code="${2:?Connection code required}"; shift 2;;
  --advertise) advertise="${2:?Public numeric IP:port required}"; shift 2;;
  --capacity) capacity="${2:?vps or pi required}"; shift 2;;
  --dry-run) dry_run=1; shift;;
  *) echo 'Usage: bash scripts/setup-supporter.sh [--network CODE] --advertise PUBLIC_IP:49741 [--capacity vps|pi] [--dry-run]' >&2; exit 1;;
 esac
done
[[ -n "$advertise" ]] || { echo 'A publicly reachable numeric IP:port is required.' >&2; exit 1; }
if [[ -z "$code" ]]; then code="$(node "$source_root/scripts/community-network.mjs")"; fi
node "$source_root/scripts/network.mjs" check-code "$code"
node "$source_root/scripts/supporter-profile.mjs" --root "$install_root" --capacity "$capacity" --advertise "$advertise" --check-capacity --require-preparation
if [[ "$dry_run" == 1 ]]; then
 echo 'Plan: validate capacity; install locked supporter; preserve existing identity/settings; install isolated R84 updater; enable updater timer and supporter user service. No files, services or firewall were changed.'
 exit 0
fi
[[ "$(id -u)" != 0 ]] || { echo 'Run setup as an ordinary supporter account with sudo access, not as root.' >&2; exit 1; }
command -v sudo >/dev/null
systemctl --user show-environment >/dev/null || { echo 'A working systemd user session is required. Log in as the supporter account.' >&2; exit 1; }
if systemctl --user is-active --quiet arns-mesh-supporter; then
 echo 'Existing supporter is running. Stop this supporter and back up its data before an explicit upgrade.' >&2; exit 1
fi
# Root access is only used for a separate public-index updater, never for peer keys.
sudo -v
bash "$source_root/scripts/install-peer.sh" --network "$code" --capacity "$capacity" --advertise "$advertise"
sudo bash "$source_root/scripts/install-shared-index.sh" --source "$source_root" --node "$(command -v node)"
bash "$source_root/scripts/install-user-service.sh"
sudo loginctl enable-linger "$(id -un)"
echo 'Supporter installed and preparation started. Setup is not a takeover certificate.'
echo "Check preparation: node $source_root/scripts/operator.mjs --data $install_root/data --json"
echo 'Check the R84 updater: systemctl status arns-mesh-index-sync.service --no-pager'
echo 'Allow the advertised TCP port through your existing firewall/router and test from another network.'
set +e
node "$source_root/scripts/check-supporter.mjs" --data "$install_root/data" --json
readiness_result=$?
set -e
if [[ "$readiness_result" != 0 ]]; then echo 'Preparation/independent readiness is pending. Inspect the reported actions before claiming coverage.'; fi
echo 'Complete the independent-reader acceptance in docs/en/resilience.md before claiming coverage.'
