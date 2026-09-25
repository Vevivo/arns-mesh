# Developer notes

Connection-code protocol, operator tools and included-network packaging: [network guide](network-code.md). The signed-list tests cover tampering, rollback, cancellation and separate-process seed loss; the Windows workflow drives the real packaged UI. Desktop content serving and paid access are not implemented.

[Supporter deployment](supporter.md) is the server installation guide. This page concerns source development and packaging.

## Reproduce

Use Node.js 24 LTS (CI pins 24.19.0), npm and Git. Clone the repository into a new development directory and enter it, or extract the [preview.7 source ZIP](https://github.com/Vevivo/arns-mesh/archive/refs/tags/v0.5.0-preview.7.zip). The source ZIP is not the runnable desktop ZIP. Use `main` for contributions and the `v0.5.0-preview.7` tag for the released source baseline. Do not update dependencies implicitly: use the committed lockfile.

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check:public
npm test
node scripts/doctor.mjs examples/network-profile.example.json
bash scripts/test-install.sh
```

The last command is POSIX-only and tests install/update preservation with an npm test double. CI separately installs dependencies for real on Linux and Windows. The example profile passes structural validation but contains nonworking addresses.

## Layout

| Directory | Responsibility |
|---|---|
| `apps/browser` | Electron shell, tabs, `ar:` handler, English UI and trusted IPC |
| `apps/helper` | Shared core adapter, connection profile/runtime and bounded response cache; no separate desktop helper install |
| `apps/peer` | Headless supporter and signed Mesh responses |
| `src` | Name observations, content verification, manifest traversal, indices, budgets and transport |
| `resources` | Public index descriptions and empty deployment defaults |
| `tests` | Unit/integration fixtures; shell doubles are explicitly labelled |
| `scripts` | Profile generation, installer, reachability probe, privacy check and Windows build |

Some legacy bridge code remains because verified L1 response regression tests use it. It is not a Chrome extension deliverable or required runtime browser. Historical location metadata includes public upstream identifiers; it is not a private operator catalog or a complete index.

## Run a development desktop

The repository's runtime lockfile excludes Electron itself. Obtain the pinned official Electron 44.4.3 runtime for your OS. Use that executable to open this repository directory; `npm start` requires an `electron` executable already on PATH. Avoid installing a different Electron version into the project just to make that command work. Use `ARNS_MESH_USER_DATA` to select an isolated test data directory and import a profile. Never reuse a production data directory for unreviewed changes.

## Package Windows

On a clean build machine with locked dependencies installed:

```sh
python scripts/download-electron.py --out ../electron-runtime
python scripts/package-windows.py --runtime ../electron-runtime --out dist
```

The downloader verifies the official Electron 44.4.3 Windows x64 archive against SHA-256 `790a355b684d5c7cc8dc3cdd8c4cca7c4b2d054685427c7554a956879a82e70b`. Dependencies and runtime licenses are retained. Never package an operator's live `data` directory, copy their configured application wholesale, or commit the resulting binary ZIP to Git history.

CI checks source on Linux/Windows, then builds a Windows artifact and prepares a **draft prerelease** if that version has no existing release. It does not replace an existing release or change repository visibility. GUI/content acceptance is a separate gate. Workflow files require appropriate GitHub App workflow permissions; a denied upload must be resolved through normal app settings.

## Changes worth contributing

- Decouple name freshness scheduling from content-download budgets.
- Build independently sourced missing locations with explicit provenance and cost accounting.
- Improve catalog RPC failover, peer enrollment and replication without hiding trust/bootstrap dependencies.
- Verify complete browser egress restrictions, real Windows installation and ARM64/Pi hardware.
- Stream and verify large items without uncontrolled memory use.

For any network experiment record observed error, demonstrated cause versus hypothesis, alternatives, chosen experiment, measured result and next action. Preserve evidence privately if it contains operational details; publish a redacted reproducible account. Label simulated fixtures, code-only claims and real-network results separately.
