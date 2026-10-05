# Release status and evidence

[Türkçe](../tr/durum.md) · [Home](../../README.md)

Documentation reviewed on **6 October 2026**. This is a community preview, not a declaration of a complete stable release.

## Which version?

- **Windows:** [v0.5.0-preview.13](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.13), source `94ce5d293e3c97a78d1034b83ccbf1e21a2ee86b`. The existing ZIP is unchanged.
- **Updated supporter:** the [installation guide](supporter.md) pins `37d51c79614c389b515b43d4a3bd92f9bd5083d2`, including R84 integration and preparation fixes.
- **Default branch:** `main` still has the earlier preview.8 runtime. These docs do not merge the feature branch or deploy code.

## Demonstrated

| Evidence | Result | Scope |
|---|---|---|
| Published preview.13 CI | 175 source tests on Linux/Windows and 12 packaged Windows UI checks | Controlled discovery, restart, invalid data and original catalogue relay; see [release evidence](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.0-preview.13) |
| R84 integration | 189 Linux source tests; three real content samples fetched and verified | [5 October rollout](../validation/index-sharing-2026-10-05.md); earlier integration also ran Linux/Windows/package CI |
| Read-only live inspection | 70,909,101 usable index entries, three of five bands, 13,220 retained name records and 1,322 stored content objects | Point-in-time server report at 2026-10-05 21:25 UTC; [record](../validation/read-only-status-2026-10-06.md) |
| Windows-to-supporter cached-object check | All three named samples returned signed name records and verified original content | Direct numeric-IP requests with `cacheOnly=true`; not a whole-site or OS-isolated outage test |

These counts are not global coverage, unique website counts, or a promise of current name freshness. The reference service had 22 ready records out of 32 prepared site records; readiness is scoped and names can share files.

## Remaining release work

- Real independent-provider loss with prepared replicas and surviving name authority/entry points.
- Automatic placement and repair of independent replicas.
- Full acceptance on real Raspberry Pi hardware and public/home NAT configurations.
- Wider verification of complete site resources, external dependencies and newly registered names.
- Operator handling of index publisher 402/429/504 responses, quotas and finite storage.

At the live inspection, content preparation had exhausted its daily budget, the R84 import was incomplete, and the reference supporter reported no learned additional supporters. Those are operational findings, not claims that a redundant multi-provider deployment exists.

## What “final” would need to mean

Define the supported sites, environments and failure cases, then meet their [acceptance procedure](resilience.md). Keep evidence of actual copies on separate hosts and reader recovery after losing the original source. A documentation refresh, a high index count or a passing source test cannot establish that alone.

[User guide](user.md) · [Supporter guide](supporter.md) · [Developer guide](developer.md).
