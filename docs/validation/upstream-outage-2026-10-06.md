# RPC and Arweave access-route isolation — 6 October 2026

This test checks whether the production access engine can open real ArNS content when **both reader and supporter cannot reach external networks**, while their Mesh connection remains reachable. The test blocks routes to RPC and raw Arweave endpoints; it does not shut down or claim a shutdown of either underlying network.

## Scope of the sample

The 35 names below are a selected test sample captured from existing supporter data. They are not the supporter's full name catalogue, a cap on supported names, or a current count of prepared sites. Some selected names share the same content target, so the report also counts distinct files. The measured results, including missing content, are preserved below.

The live supporter continues checking new registrations and changed targets, retaining name records and preparing verified site files independently of this isolated test. [Continuous preparation](../en/continuous-preparation.md) · [Dated supporter status](../en/status.md). A retained name identifies content; file readiness is tracked separately.

## Method

- Captured 57 original signed name envelopes for 35 names from the working supporter, without asking it to download additional content.
- Verified and copied 18 existing public signed objects (7,319,851 bytes) into a separate test directory on the server.
- Created a new test supporter identity. Preserved the original publisher signatures on name records; did not copy the production peer or authority private keys.
- Started the test inside an OS network namespace containing only loopback, with no external interface or route.
- Used unguarded Node subprocesses for connectivity controls, independently of the application's network restrictions.
- Started a reader with no stored name observations or content and used its normal Automatic access engine.
- Retrieved and cryptographically verified each prepared record's pinned resources as well as its main content.

The working service was not stopped, restarted or isolated.

[Machine-readable results](upstream-outage-2026-10-06.json) from the 0.5.0 source run.

## Results

| Result | Count |
|---|---:|
| Selected names tested | 35 |
| Main content opened | 29 |
| Complete prepared file sets verified | 22 |
| Distinct opened main objects | 9 |
| Names that could not open | 6 |

All externally directed controls returned `ENETUNREACH`: the actual configured Solana RPC endpoint, two actual configured raw Arweave endpoints, and DNS/HTTPS destinations. The loopback Mesh endpoint remained reachable.

Examples that opened include `vevivo`, `bilolbabagate`, `bionica`, `toon_boughtviatoonnode` and `ardrive-logo-2026`. The six failures were `bitnet-barter`, `bitnet-barter-machine`, `bitnetbarter`, `bitnetbartermachine`, `blackcatneedsleep` and `iainball`. They were not counted as working sites.

Five other names opened their main content but did not have complete prepared resource sets. Two additional samples had only root-content coverage. The 22 successful prepared records comprise five document-only records and seventeen records with their detected linked resources; this is not a claim that all dynamic APIs or every possible runtime-generated resource was archived.

## What this establishes

A reader does not need live Solana RPC or raw Arweave access to use an accepted retained name binding and verified content delivered by Mesh. The reader need not have visited the name beforehand. The provider also had no upstream route during the test.

The claim requires a reachable Mesh source holding the records and files. It is not a claim that every ArNS name is archived, that historical bindings prove current chain state, or that a second independent physical provider was tested.

## Reproduction and Windows acceptance

The source harness is [qa/upstream-outage.mjs](../../qa/upstream-outage.mjs), with separate capture and isolated-test modes. It refuses a test network containing interfaces other than loopback.

The Windows release workflow uses [the desktop outage test](../../qa/desktop/upstream-outage.cjs) and [a cache-only test supporter](../../qa/desktop/outage-peer.mjs). It starts from a fresh reader, applies OS firewall blocks to both executables, checks actual connectivity with the packaged EXE, opens real public sites, and captures screenshots. The `windows-upstream-outage` workflow artifact contains its results; the workflow requires a successful test before publishing.

The Linux measurement above covers the access engine and retained file verification. Windows rendering results belong to their separately recorded workflow run.
