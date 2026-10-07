#!/usr/bin/env bash
set -euo pipefail
umask 077
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${MESH_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/ArNS-Mesh-Supporter}"
profile=""; network_code=""; capacity=vps; advertise=""
while [[ $# -gt 0 ]]; do
 case "$1" in
  --network) network_code="${2:?Connection code required}"; shift 2;;
  --capacity) capacity="${2:?vps or pi required}"; shift 2;;
  --advertise) advertise="${2:?Numeric public IP:port required}"; shift 2;;
  --*) echo "Unknown option: $1" >&2; exit 1;;
  *) [[ -z "$profile" ]] || { echo 'Only one profile is accepted.' >&2; exit 1; }; profile="$1"; shift;;
 esac
done
if [[ -n "$network_code" && -n "$profile" ]] || [[ -z "$network_code" && ( -z "$profile" || ! -f "$profile" ) ]]; then
 echo 'Usage: bash scripts/install-peer.sh PROFILE.json OR --network CODE [--capacity vps|pi] [--advertise IP:PORT]' >&2; exit 1
fi
node_bin="$(command -v node || true)"; npm_bin="$(command -v npm || true)"
if [[ -z "$node_bin" || -z "$npm_bin" ]]; then echo 'Install Node.js 24 LTS and npm from nodejs.org first. No system packages have been changed.' >&2; exit 1; fi
"$node_bin" -e 'const [m,n]=process.versions.node.split(".").map(Number);if(m<22||(m===22&&n<12))process.exit(1)' || { echo 'Node.js 22.12+ required; Node.js 24 LTS recommended.' >&2; exit 1; }
if [[ -n "$network_code" ]]; then "$node_bin" "$source_root/scripts/network.mjs" check-code "$network_code"; else "$node_bin" "$source_root/scripts/profile.mjs" check "$profile"; fi
profile_args=(--root "$install_root" --capacity "$capacity")
if [[ -n "$advertise" ]]; then profile_args+=(--advertise "$advertise"); fi
"$node_bin" "$source_root/scripts/supporter-profile.mjs" "${profile_args[@]}"
version="$("$node_bin" -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).version' "$source_root/package.json")"
mkdir -p "$install_root/releases" "$install_root/data"
install_lock="$install_root/.install-lock"
mkdir "$install_lock" || { echo 'Another install is running or an interrupted install lock needs review.' >&2; exit 1; }
stage_root="$(mktemp -d "$install_root/releases/.staging-XXXXXX")"
trap 'rm -rf -- "$stage_root"; rmdir "$install_lock"' EXIT
mkdir "$stage_root/app"
for name in apps src resources scripts package.json package-lock.json LICENSE NOTICE.txt WAYFINDER-LICENSE solana-rpc-seeds.json arweave-peers.json arweave-peer-seeds.json hyper-bootstrap.json; do cp -R "$source_root/$name" "$stage_root/app/"; done
( cd "$stage_root/app"; "$npm_bin" ci --omit=dev --ignore-scripts --no-audit --no-fund )
if [[ ! -f "$install_root/data/solana-rpc-seeds.json" && ! -f "$install_root/data/mesh-ip-peers.json" ]]; then
 if [[ -n "$network_code" ]]; then "$node_bin" "$stage_root/app/scripts/network.mjs" join "$network_code" --data "$install_root/data"; else "$node_bin" "$stage_root/app/scripts/profile.mjs" apply "$profile" "$install_root/data"; fi
else
 echo 'Existing connection configuration preserved. To change it, stop the peer and apply the new profile explicitly.'
fi
release_root="$install_root/releases/$version-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mv "$stage_root" "$release_root"
# Foreground and systemd launches share settings. Plain values are never evaluated as shell code.
printf '#!/usr/bin/env bash\nset -euo pipefail\nexport ARNS_MESH_DATA=%q\nexport ARNS_MESH_DIRECT_ONLY=1\npeer_env=%q\nnode_bin=%q\npeer_main=%q\n' "$install_root/data" "$install_root/peer.env" "$node_bin" "$release_root/app/apps/peer/main.mjs" > "$install_root/Start-Peer.sh.new"
cat >> "$install_root/Start-Peer.sh.new" <<'LAUNCH'
if [[ -f "$peer_env" ]]; then
 while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" =~ ^[A-Z][A-Z0-9_]*= ]] || { echo 'Invalid peer.env line; expected plain KEY=VALUE.' >&2; exit 1; }
  key="${line%%=*}"; value="${line#*=}"
  [[ "$key" == ARNS_* || "$key" == MESH_* ]] || { echo "Unsupported setting: $key" >&2; exit 1; }
  export "$key=$value"
 done < "$peer_env"
fi
heap="${MESH_NODE_HEAP_MIB:-384}"
[[ "$heap" =~ ^[0-9]+$ && "$heap" -ge 128 && "$heap" -le 16384 ]] || { echo 'Invalid Node heap budget.' >&2; exit 1; }
exec "$node_bin" --max-old-space-size="$heap" "$peer_main" --listen "${MESH_LISTEN:-0.0.0.0:49741}"
LAUNCH
"$node_bin" "$source_root/scripts/supporter-profile.mjs" "${profile_args[@]}" --write
chmod 700 "$install_root/Start-Peer.sh.new"
if [[ -f "$install_root/Start-Peer.sh" ]]; then cp "$install_root/Start-Peer.sh" "$install_root/Start-Peer.sh.previous"; fi
mv "$install_root/Start-Peer.sh.new" "$install_root/Start-Peer.sh"
printf 'Installed. Start with: %s\nData and identity: %s\nNo service or firewall changed. Complete setup-supporter.sh for R84, service and readiness checks.\n' "$install_root/Start-Peer.sh" "$install_root/data"
