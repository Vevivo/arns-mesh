# Develop ArNS Mesh

[Türkçe](../tr/gelistirici.md) · [Home](../../README.md)

The desktop, supporter, R84 integration and tests share the **0.6.3** source tree. [Validation records](../validation/name-security-2026-10-16.md) identify executed checks and release evidence.

## Get the source

Use the published release tag. During pre-release review, if `v0.6.3` is not yet published, use the reviewed candidate commit instead; the candidate review commands below do not require that tag.

```bash
git clone --branch v0.6.3 https://github.com/Vevivo/arns-mesh.git
cd arns-mesh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check:public
npm test
```

To review the name-security candidate before publication, start with an ordinary clone without `--branch`, then fetch `pull/18/head` and inspect the resulting commit:

```bash
git fetch origin pull/18/head
git switch --detach FETCH_HEAD
git rev-parse HEAD
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm test
```

Record the exact commit with test results. The source accepts Node.js 22.12+; CI uses Node 24. [Node installation](node-setup.md).

## Source map

| Area | Location |
|---|---|
| Windows browser | `apps/browser/` |
| Supporter and local operator UI | `apps/peer/`, `apps/operator/` |
| Name resolution and outage recovery | `src/swarm-access.mjs`, `src/resilient-access.mjs` |
| Original signed name relay | `src/snapshot-relay.mjs` |
| Protected name policy, witness proofs and durable acceptance | `src/name-certificates.mjs`, `src/name-security-runtime.mjs`, `src/sharded-name-state.mjs` |
| Verified content | `src/content-fetcher.mjs`, `src/content-store.mjs` |
| R84 indexes | `src/shared-index.mjs`, `scripts/sync-shared-index.mjs` |
| Tests | `tests/`, `qa/` |

## Outage acceptance

The [outage report](../validation/upstream-outage-2026-10-06.md) documents real public names and files tested in an isolated Linux network. `qa/upstream-outage.mjs` reproduces the access-engine test. Capture reads existing public signed records and verified content into a separate test directory; it never copies the live provider's private identity.

The Windows workflow extracts the built ZIP, prepares real public content on a test supporter, blocks external network access for both the reader and supporter, and opens sites in a fresh reader. Results and screenshots are in the `windows-upstream-outage` artifact. Private profiles and content archives are not uploaded.

Keep acceptance environments separate from production. Do not interrupt the live supporter or change an end user's firewall for these tests.

## Build Windows

```bash
python scripts/download-electron.py --out /tmp/mesh-electron
python scripts/package-windows.py --runtime /tmp/mesh-electron --out dist
```

The real executable UI is tested on Windows CI. A Node version check alone does not establish that the window and sites work. The main release workflow publishes only after source, packaged UI and upstream-outage checks pass.

[Security](../../SECURITY.md) · [Contributing](../../CONTRIBUTING.md) · [Architecture](architecture.md).
