# Preview status and evidence boundaries

**Published preview.8** adds signed connection invitations, cached/managed source lists and optional included-network packages. [Usage and boundaries](network-code.md). [Windows acceptance workflow](../../.github/workflows/network-join.yml) uses controlled directory peers on one machine; this is not independent-host failover or paid licensing. Earlier outage measurements below belong to preview.7.

Desktop source **0.5.0-preview.7** adds direct immutable Arweave resources, bounded nearby-block discovery and static-reference replication/pinning. The real Windows DNS/gateway outage test played the previously missing video/audio and loaded the font. See [measured resource behavior and its limits](../arweave-resources.md).

Published packages and draft status are listed on the [releases page](https://github.com/Vevivo/arns-mesh/releases). The earlier **0.5.0-preview.6** remains a separate measured artifact. See the [25 September outage experiment and supporter routing update](../disaster-network.md). This repository packages the existing standalone reader/core with private endpoints removed, profile import and separate supporter installation. It does not replace an existing operator's production deployment automatically.

| Area | Evidence / status |
|---|---|
| Core regression | `npm test`: signature/identity checks, location hints, manifest paths, resource bounds, retry/cancel, catalog scheduling and replication, two loopback peer stores, shell-state tests. See CI for the exact commit and result. |
| Desktop shell | Electron API doubles test tabs, isolation options, privileged IPC and profile import. These are explicitly **not rendered-browser tests**. |
| Installer | Isolated-root smoke/update checks preserve identity/data/profile; no production service is changed by this test. See test report/CI. |
| Windows package | Automated build pins Electron and dependencies; packaging and executable version checks are not real page rendering or SmartScreen acceptance. |
| Earlier content experiment | A new Linux reader verified a real HTML document from an already populated peer, then explicit saved access used the retained copy. Private addresses/logs and prepared catalogs are excluded. This is a warm-peer observation, not universal or fresh-index coverage. |
| Windows desktop GUI | `qa/desktop/user-journey.cjs` drives the packaged executable and native dialogs, captures the Windows desktop, and checks signed saved-page HTML/CSS/JS/image/navigation. It does not substitute production resolver or dialog APIs. Its generated `mesh-qa` name is a synthetic saved observation, not a public ArNS registration; fixtures are excluded from the release. See the [workflow](../../.github/workflows/desktop-user-journey.yml) and release acceptance record for the exact successful run. |
| Windows end-to-end | Four real main documents opened in the published app during the outage experiment. Some pages have blocked external assets. Full install/update/remove and SmartScreen acceptance remain pending. |
| Raspberry Pi | Installation instructions and intended ARM64 route; no real hardware acceptance yet. |
| DNS/gateway independence | Windows Firewall allowlist, IPv6/UDP and system DNS blocking were exercised with the published app and fresh data directories. Unguarded executable probes checked DNS, gateway HTTPS and DoH before/after. Full packet capture remains pending. |
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
| A clean distribution has no peers/RPC configured | Removing endpoints removes bootstrap | Embed operator-approved public endpoints; or import a small profile | Implement profile validator/import and two-role docs; automated checks are in the repository | Repeat native GUI acceptance for each release; operator supplies working profile |
| A started supporter may be useless to readers | Port/NAT/profile or empty data may be the problem; active status alone is insufficient | Test only local service; or probe from another network then verify actual content | Numeric-IP cache-only probe and explicit content/counter instructions | Independent-host reachability and content test |
| Missing locations remain possible | An ArNS target ID alone does not identify a bundled item's byte location | Prepared external index; or sparse published indexes plus peer/raw production | Existing bounded mechanisms retained; no per-name success list added | Measure general first-discovery coverage |

No public release should claim these pending acceptance gates have passed merely because CI is green.
