#!/usr/bin/env bash
set -euo pipefail
source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
mkdir -p "$test_root/bin"
# Installer/data-layout test only. Real locked dependency installation is a
# separate CI step. No service/firewall/runtime is started by this test.
printf '#!/usr/bin/env bash\nexit 0\n' > "$test_root/bin/npm"
chmod 700 "$test_root/bin/npm"
export PATH="$test_root/bin:$PATH"
export MESH_INSTALL_ROOT="$test_root/install"
node "$source_root/scripts/profile.mjs" --peer 127.0.0.1:49741 --rpc 127.0.0.1:8899 --output "$test_root/profile.json"
bash "$source_root/scripts/install-peer.sh" "$test_root/profile.json"
bash -n "$MESH_INSTALL_ROOT/Start-Peer.sh"
# The default installation enables substantial preparation and signed-record replication.
grep -qx 'ARNS_PREPARE_MAX_SITES=20000' "$MESH_INSTALL_ROOT/peer.env"
grep -qx 'ARNS_CATALOG_BULK_SCAN=1' "$MESH_INSTALL_ROOT/peer.env"
grep -qx 'ARNS_REPLICATION_ENABLED=1' "$MESH_INSTALL_ROOT/peer.env"
printf '# retained operator setting\nMESH_CUSTOM=literal-value\n' >> "$MESH_INSTALL_ROOT/peer.env"
cp "$MESH_INSTALL_ROOT/peer.env" "$test_root/first-env"
printf 'identity-test-marker'  > "$MESH_INSTALL_ROOT/data/identity.json"
printf 'saved-test-marker' > "$MESH_INSTALL_ROOT/data/saved-sites.json"
cp "$MESH_INSTALL_ROOT/Start-Peer.sh" "$test_root/first-launcher"
cp "$MESH_INSTALL_ROOT/data/mesh-ip-peers.json" "$test_root/first-peers"
node "$source_root/scripts/profile.mjs" --peer 127.0.0.1:49742 --rpc 127.0.0.1:8899 --output "$test_root/replacement.json"
bash "$source_root/scripts/install-peer.sh" "$test_root/replacement.json"
cmp "$test_root/first-env" "$MESH_INSTALL_ROOT/peer.env"
cmp "$test_root/first-launcher" "$MESH_INSTALL_ROOT/Start-Peer.sh.previous"
cmp "$test_root/first-peers" "$MESH_INSTALL_ROOT/data/mesh-ip-peers.json"
[[ "$(cat "$MESH_INSTALL_ROOT/data/identity.json")" == 'identity-test-marker' ]]
[[ "$(cat "$MESH_INSTALL_ROOT/data/saved-sites.json")" == 'saved-test-marker' ]]
[[ ! -d "$MESH_INSTALL_ROOT/.install-lock" ]]
bash -n "$MESH_INSTALL_ROOT/Start-Peer.sh"
# Mock only service-control commands; write real user-unit fixtures and verify idempotence.
export XDG_CONFIG_HOME="$test_root/config"
printf '#!/usr/bin/env bash\nexit 0\n' > "$test_root/bin/systemctl"
chmod 700 "$test_root/bin/systemctl"
bash "$source_root/scripts/install-user-service.sh"
unit="$XDG_CONFIG_HOME/systemd/user/arns-mesh-supporter.service"
cp "$unit" "$test_root/first-unit"
bash "$source_root/scripts/install-user-service.sh"
cmp "$unit" "$test_root/first-unit"
grep -qx 'MemoryMax=1024M' "$unit"
grep -qx 'CPUQuota=50%' "$unit"
printf '# unrelated unit\n' > "$unit"
if bash "$source_root/scripts/install-user-service.sh"; then echo 'Unmanaged unit was overwritten' >&2; exit 1; fi
grep -qx '# unrelated unit' "$unit"
bash "$source_root/scripts/install-shared-index.sh" --dry-run
printf 'Installer smoke/update passed; existing profile, identity and saved data preserved. Dependency install was a test double.\n'
