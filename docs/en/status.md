# Status and evidence

[Türkçe](../tr/durum.md) · [Home](../../README.md)

Checked 5 October 2026. Published release / `main` runtime: preview.8. Current development candidate: **preview.13**, [PR #9](https://github.com/Vevivo/arns-mesh/pull/9). Earlier preview.12 evidence remains separately identified below; [Preview.13 checks](https://github.com/Vevivo/arns-mesh/actions/runs/37268859233) passed, with [candidate ZIP](https://github.com/Vevivo/arns-mesh/actions/runs/37268859233/artifacts/11327184425) and [UI evidence](https://github.com/Vevivo/arns-mesh/actions/runs/37268859233/artifacts/11327890614).

## Available, candidate, planned

| Capability | Status |
|---|---|
| Desktop ArNS navigation and verified Mesh/raw bytes | Published; coverage is incomplete |
| Connection invitation and signed source-list updates | Published preview.8 |
| Included-network automatic startup | Implemented packaging option; standard public ZIPs do not include an invitation |
| Bounded retained-name recovery and atomic site preparation | Preview.12 candidate, introduced in preview.9 |
| Local topic search and desktop connection monitor | Preview.12 candidate; catalogue scope and observed endpoint counts are limited |
| New compact Home and custom Mesh window icon | Preview.12 candidate |
| Self-announcing supporters and automatic peer exchange | Preview.13 candidate; callback identity verification |
| Per-content source selection | Preview.13: valid transfers, latency and failure history; automatic replica placement/repair still pending |
| Desktop storage sharing | Not implemented; reader has no public serving listener |
| Full Arweave/CDB64 replica, universal name coverage | Not provided |
| Raspberry Pi hardware acceptance, independent-provider failover | Pending |

## Reproducible evidence

| Build | Evidence | Boundary |
|---|---|---|
| Preview.12 | [Run 37259769203](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203): 168 source tests on Linux/Windows, 10 Windows UI checks from extracted candidate ZIP | Signed synthetic documents and controlled loopback services; not independent infrastructure or a new OS-level outage test |
| Preview.8 | [Connection acceptance](../network-join.md): join, list update after first directory process loss, included-network startup, saved reopen/restart | Directory processes shared one host; live sources stayed available |
| Preview.7 | [Resource/outage evidence](../arweave-resources.md): four public main documents and supported media under Windows DNS/gateway restrictions | Existing Mesh and numeric-IP RPC remained reachable |
| Earlier replica experiment | [Detailed outage report](../disaster-network.md) | Same-machine replicas and available remote raw nodes are not independent-provider failover |

Candidate ZIP: [windows-preview artifact](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203/artifacts/11323968857). UI evidence: [windows-search-ui artifact](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203/artifacts/11323719745). These are time-limited Actions artifacts (14-day retention), not permanent release assets; GitHub sign-in may be required.

## Remaining work before the shared network claim

Use the [agreed design and acceptance conditions](shared-network.md). Test real independent hosts with actual prepared copies, new-peer discovery by an existing reader, original-provider loss and simultaneous RPC/raw outages. Exercise missing/stale/invalid data, announce flooding, capacity limits and expired authority lists. Record which peers held which versions before the outage; an empty server is not a backup.

The owner's two-PC test is deferred until those machines are available. Two browser installs alone are not two serving peers. Full egress packet capture and real Pi performance are pending. Application HTTP logs and “responding” indicators have narrower meanings.

Keep released, candidate, controlled-fixture and real-network evidence separate. A successful compile or green source CI does not establish disaster readiness or global coverage. [Architecture](architecture.md) · [Candidate recovery](../resilient-access.md).

## Preview.13 validation

**175 source tests passed on Linux and Windows; 12 checks passed in the extracted real Windows application.** Coverage includes a later supporter, seed loss, learning without profile changes, restart, forged/old advertisements, private callback target rejection, original name-signature relay and fast invalid content. Separate-process tests share one host. The installer/update smoke test checks preservation of profiles, identity and saved data; its npm installation is a test double.

Independent public hosts, home NAT and Pi acceptance of this new feature remain pending. [Implemented behavior and limits](shared-network.md).

The running Windows reader learned a later supporter without profile changes, then retrieved the original signed catalogue through that route after the seed stopped. The existing operator VPS was upgraded to preview.13; an isolated fresh reader on that same VPS verified its public-IP advertisement and fetched the real `vevivo` main document (28,390 bytes) through Mesh. This live check is not an independent-provider test.
