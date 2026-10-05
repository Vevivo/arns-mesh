# Live desktop and continuous preparation audit — 6 October 2026

## Product requirement

While sources are available, continuously learn new ArNS names and changed targets and prepare their verified content on supporters. The reader should only need an ArNS name. When RPC or Arweave becomes unavailable, serve the latest successfully retained, complete version through reachable Mesh supporters. Keep healthy upstream sources enabled.

The release is not ready to claim general name coverage. Passing a prepared-content outage test proves recovery for its corpus, not continuous preparation of every name.

## Live desktop observations

Tested the user's existing Windows preview.13 application with its existing profile and normal network, through the actual address bar. This was not an empty-cache test and no upstream was deliberately blocked on this machine.

| Name | Observed result |
| --- | --- |
| `vevivo` | Page rendered; content signature verified. This navigation used cached content and a live RPC observation. |
| `bilolbabagate` | Page and artwork rendered; all access stages completed and content signature verified. |
| `cubetwist` | Failed twice. The name resolved to `kRITIGM3-RgivRLAUVHhrAE10_HA4ekqgiUL-78Z0bE`, but its content location was unavailable. |
| `ardrive` | Main content verified, but remained at the logo screen. The application reported 15 verified resources, one unavailable resource and one script error. This is a partial load, not a successful application acceptance. |

For cubetwist, a separate read-only metadata query to Turbo GraphQL found a manifest of 194,907 bytes, at block 2,015,157, with bundle parent `qNqsv2QORER5NH_MByRDLqG2KRDXkf20VwexInXMN9Y`. The installed shared-index lookup returned no hint. This metadata query did not alter the desktop transport or import unverified content into production.

A subsequent isolated, read-only direct retrieval used that parent as an untrusted routing hint and verified the actual signed data item through raw Arweave peers. It succeeded in approximately nine seconds: 861,125 response bytes, 194,907 payload bytes, SHA-256 `724424ab41ec429d8e02f8cad4054b7b43d8e84f3afe637469a533efa836396c`. The manifest contained 3,263 paths. This establishes a location-freshness gap for this example, not loss of the manifest; it does not prove that every referenced file is available or fix the live application's failed navigation. No item or special-case hint was injected into production.

## Server observation

At 2026-10-05 22:54 UTC (6 October locally):

- Supporter active; restart count remained zero.
- 13,274 retained name observations; name synchronization was still running.
- 70,909,101 installed shared-index location records, in three of five offered bands. The HTTP updater was downloading the remaining bands.
- 1,357 cached content objects. These are not complete website counts.
- Background content quota exhausted: 448 MiB per UTC day. Name synchronization had a separate 192 MiB allowance and was not exhausted.
- Automatic preparation limited to 32 site records; 33,015 content jobs queued.
- Automatic content cache 256 MiB; pinned-content allowance 2 GiB.

These settings describe a bounded supporter. They do not constitute a continuously retained archive of every known site. A name observation, a location hint, a cached object and a complete prepared page are separate coverage measures.

R84 speeds local content-location lookup. Its publisher periodically rebuilds bands; the newest items may not yet be present, and coverage depends on the publisher's indexed bundles. It does not copy every site's content or replace the name feed. See the [official index-sharing documentation](https://docs.ar.io/build/run-a-gateway/manage/index-sharing).

## Independent Windows outage acceptance

The 0.5.0 candidate at `893a4c1df24b75d116c14cc965ea52995261764c` passed [CI run 37384406047](https://github.com/Vevivo/arns-mesh/actions/runs/37384406047).

A freshly extracted Windows executable and a fresh reader profile opened `vevivo`, `bilolbabagate`, `bionica` and `ardrive-logo-2026` with DNS and non-loopback network access blocked for both the executable and a separate cache-only supporter. Real upstream probes failed; loopback Mesh remained available. Original publisher signatures were preserved.

The supporter served 15 requests, eight content chunks and 1,011,072 content bytes, with remote fetching disabled. All four pages rendered. This proves the tested retained-content recovery path; it is not independent-machine failover or general ArNS coverage.

[Sanitized Windows result](windows-upstream-outage-2026-10-06.json). Screenshots are in the run's `windows-upstream-outage` artifact (30-day retention). Embedded image bytes are omitted from the committed result.

## Release work still required for the stated target

1. Close the freshness gap between new name targets and periodically published location indexes, with independently verified content before serving.
2. Make server preparation and retention budgets match the intended coverage; expose progress, backlog and freshness instead of treating an installed index as a complete archive.
3. Retain the last complete version until its replacement and required resources have verified; continue retrying incomplete versions.
4. Diagnose partial real application loads such as ArDrive, including dynamic/external dependencies.
5. Test a newly observed name and a changed target through preparation, then open both from an empty reader with upstreams unavailable.
6. Test independent-supporter takeover before promising that losing the current server is transparent.

Production code, firewall and service configuration were not changed during this audit. Final publication remains pending these readiness gaps.

## Follow-up: continuous preparation deployed

The missing-location case for `cubetwist` was fixed by automatic server preparation. After the supporter upgrade, the same Windows application rendered its image with all access stages complete, one verified resource and no unavailable resources or script errors. See [the follow-up evidence](continuous-preparation-2026-10-06.md). The earlier ArDrive application-shell finding remains a separate compatibility observation; no successful full ArDrive application test is claimed here.
