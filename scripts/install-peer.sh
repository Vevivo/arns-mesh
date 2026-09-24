#!/usr/bin/env bash
set -euo pipefail
umask 077
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${MESH_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/ArNS-Mesh-Supporter}"
profile="${1:-}"
if [[ -z "$profile" || ! -f "$profile" ]]; then echo 'Usage: bash scripts/install-peer.sh /path/to/network-profile.private.json' >&2; exit 1; fi
node_bin="$(command -v node || true)"; npm_bin="$(command -v npm || true)"
if [[ -z "$node_bin" || -z "$npm_bin" ]]; then echo 'Install Node.js 24 LTS and npm from nodejs.org first. No system packages have been changed.' >&2; exit 1; fi
"$node_bin" -e 'const [m,n]=process.versions.node.split(".").map(Number);if(m<22||(m===22&&n<12))process.exit(1)' || { echo 'Node.js 22.12+ required; Node.js 24 LTS recommended.' >&2; exit 1; }
"$node_bin" "$source_root/scripts/profile.mjs" check "$profile"
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
  "$node_bin" "$stage_root/app/scripts/profile.mjs" apply "$profile" "$install_root/data"
else
  echo 'Existing connection configuration preserved. To change it, stop the peer and apply the new profile explicitly.'
fi
release_root="$install_root/releases/$version-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mv "$stage_root" "$release_root"
printf '#!/usr/bin/env bash\nset -euo pipefail\nexport ARNS_MESH_DATA=%q\nexport ARNS_MESH_DIRECT_ONLY=1\nexport ARNS_INDEX_DAILY_MIB="${ARNS_INDEX_DAILY_MIB:-64}"\nexport ARNS_CATALOG_ENABLED=1\nexport ARNS_CATALOG_DAILY_MIB="${ARNS_CATALOG_DAILY_MIB:-64}"\nexec %q --max-old-space-size=384 %q --listen "${MESH_LISTEN:-0.0.0.0:49741}"\n' "$install_root/data" "$node_bin" "$release_root/app/apps/peer/main.mjs" > "$install_root/Start-Peer.sh.new"
chmod 700 "$install_root/Start-Peer.sh.new"
if [[ -f "$install_root/Start-Peer.sh" ]]; then cp "$install_root/Start-Peer.sh" "$install_root/Start-Peer.sh.previous"; fi
mv "$install_root/Start-Peer.sh.new" "$install_root/Start-Peer.sh"
printf 'Installed. Start with: %s\nData and identity: %s\nStop: Ctrl+C. Incoming TCP port: 49741 unless MESH_LISTEN is set.\nNo service, firewall or other application was changed.\n' "$install_root/Start-Peer.sh" "$install_root/data"
