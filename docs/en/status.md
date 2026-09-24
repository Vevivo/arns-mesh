# Preview status and evidence boundaries

Version: **0.5.0-preview.2**. This repository packages the existing standalone reader/core with private endpoints removed, profile import and separate supporter installation. It does not replace an existing operator's production deployment automatically.

| Area | Evidence / status |
|---|---|
| Core regression | `npm test`: signature/identity checks, location hints, manifest paths, resource bounds, retry/cancel, catalog scheduling and replication, two loopback peer stores, shell-state tests. See CI for the exact commit and result. |
| Desktop shell | Electron API doubles test tabs, isolation options, privileged IPC and profile import. These are explicitly **not rendered-browser tests**. |
| Installer | Isolated-root smoke/update checks preserve identity/data/profile; no production service is changed by this test. See test report/CI. |
| Windows package | Automated build pins Electron and dependencies; packaging and executable version checks are not real page rendering or SmartScreen acceptance. |
| Earlier content experiment | A new Linux reader verified a real HTML document from an already populated peer, then explicit saved access used the retained copy. Private addresses/logs and prepared catalogs are excluded. This is a warm-peer observation, not universal or fresh-index coverage. |
| Windows end-to-end | Full install/render/update/remove acceptance with real content is pending. Prior extension screenshots are not acceptance for this desktop package. |
| Raspberry Pi | Installation instructions and intended ARM64 route; no real hardware acceptance yet. |
| DNS/gateway independence | IP-only controls and regression tests exist. Complete OS-level DNS/DoH/IPv6/WebRTC/sockets capture under controlled blocking is pending. |
| Independent-host failover | Pending. Two loopback peers on one machine are not independent infrastructure. |
| Unknown locations | General first-discovery coverage is incomplete. Old prepared catalogs can depend on prior Turbo/Goldsky preparation. |

## Reproduce local checks

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check:public
npm test
bash scripts/test-install.sh
```

The install smoke test runs only on POSIX/Bash and supplies a dependency-install test double. CI independently runs real `npm ci`. A fixture's name or signed item is a test input, not a production fallback. Do not preload user-supplied failing names to disguise gaps.

## Remaining acceptance work

Use freshly created reader data directories and record how peers were populated. Separate empty-client/warm-peer, unknown-location and saved-only results. Select names from the observed registry, include undernames, changed targets, old/new items, manifests and previously failing targets. Verify assets and navigation, not just main HTML. Test invalid signatures, wrong locations, stale records, interrupted downloads and cancellation. Capture traffic for all related processes while preventing DNS/gateway access; include IPv6, DoH and preexisting sockets. Measure total related-process CPU/RAM/network/disk on Windows and real Pi hardware. Test a genuinely independent peer outage with documented copies and bootstrap/RPC dependencies.

## Investigation log for this source handoff

| Observation | Cause / uncertainty | Alternatives | Chosen experiment / result | Next step |
|---|---|---|---|---|
| Old source packages contain deployment endpoints and private QA fixtures | Direct source/binary upload would disclose them | Publish original package; or sanitize a separate copy and supply operator profiles separately | Separate copy, empty defaults, targeted privacy scan and baseline core tests | Inspect every future commit and release asset |
| A clean distribution has no peers/RPC configured | Removing endpoints removes bootstrap | Embed operator-approved public endpoints; or import a small profile | Implement profile validator/import and two-role docs; automated checks are in the repository | Real Windows profile-import acceptance; operator supplies working profile |
| A started supporter may be useless to readers | Port/NAT/profile or empty data may be the problem; active status alone is insufficient | Test only local service; or probe from another network then verify actual content | Numeric-IP cache-only probe and explicit content/counter instructions | Independent-host reachability and content test |
| Missing locations remain possible | An ArNS target ID alone does not identify a bundled item's byte location | Prepared external index; or sparse published indexes plus peer/raw production | Existing bounded mechanisms retained; no per-name success list added | Measure general first-discovery coverage |

No public release should claim these pending acceptance gates have passed merely because CI is green.
