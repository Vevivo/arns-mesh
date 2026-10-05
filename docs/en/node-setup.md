# Install Node without replacing system Node

[Supporter guide](supporter.md) · [VPS](vps.md) · [Raspberry Pi](raspberry-pi.md)

Skip this if a suitable Node.js and npm are already available. The example pins **24.19.0**, the project's CI baseline, not a claim that it is the newest security patch. Review [official Node releases](https://nodejs.org/en/download) when choosing a maintained Node 24 LTS build. The [24.19.0 archive](https://nodejs.org/en/download/archive/v24.19.0) contains Linux x64 and ARM64 binaries.

On a newly prepared Debian/Ubuntu/Pi OS host, install prerequisites if needed:

```bash
sudo apt-get update
sudo apt-get install --no-install-recommends git curl ca-certificates xz-utils
```

As the ordinary supporter account:

```bash
(
  set -eu
  MESH_NODE_VERSION=v24.19.0
  case "$(uname -m)" in
    x86_64) MESH_NODE_ARCH=x64 ;;
    aarch64) MESH_NODE_ARCH=arm64 ;;
    *) printf 'Unsupported architecture\n' >&2; exit 1 ;;
  esac
  MESH_NODE_ARCHIVE="node-$MESH_NODE_VERSION-linux-$MESH_NODE_ARCH.tar.xz"
  MESH_NODE_BASE="https://nodejs.org/download/release/$MESH_NODE_VERSION"
  MESH_NODE_TMP="$(mktemp -d)"
  cd "$MESH_NODE_TMP"
  curl --fail --location --proto '=https' "$MESH_NODE_BASE/$MESH_NODE_ARCHIVE" -o "$MESH_NODE_ARCHIVE"
  curl --fail --location --proto '=https' "$MESH_NODE_BASE/SHASUMS256.txt" -o SHASUMS256.txt
  awk -v name="$MESH_NODE_ARCHIVE" '$2 == name {print}' SHASUMS256.txt > selected.sha256
  test -s selected.sha256
  sha256sum --check selected.sha256
  mkdir -p "$HOME/.local/opt"
  test ! -e "$HOME/.local/opt/node-$MESH_NODE_VERSION-linux-$MESH_NODE_ARCH"
  tar -xJf "$MESH_NODE_ARCHIVE" -C "$HOME/.local/opt"
  printf 'Download files remain in %s\n' "$MESH_NODE_TMP"
)
```

A failed command stops this block. Checksums detect corruption against the official HTTPS source; this is not a separate signature-verification procedure. Keep the resulting runtime directory because the Mesh launcher records the Node executable's absolute path.

For **x64**, use:

```bash
export PATH="$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$PATH"
```

For **ARM64**, use this instead:

```bash
export PATH="$HOME/.local/opt/node-v24.19.0-linux-arm64/bin:$PATH"
```

Keep the matching PATH setting in your shell configuration if needed. Adapt the path if you chose a different version. Verify `node --version`, `npm --version` and `git --version`, then return to the [supporter guide](supporter.md). These steps do not replace `/usr/bin/node`.
