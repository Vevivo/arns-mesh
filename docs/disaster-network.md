# DNS/gateway outage work — 25 September 2026

Goal: a reader enters an ArNS name and obtains its signed Arweave content
through numeric-IP peers while DNS and gateways are unavailable. Solana RPC
over a configured IP remains in scope as an available name source for this
experiment. General name-state independence is a separate unfinished task.

## What changed in the supporter

Content replication previously retained signed bytes but could lose the routing
hint when another Mesh peer supplied them. If that source disappeared and a
replica later evicted its content, the replica could lack the byte position
needed to retrieve the same item from raw Arweave storage.

Catalog jobs and bounded on-demand supporter lookups now retain normalized
location hints for verified stored content. Existing locations take priority.
The optional lookup takes at most two seconds, uses the caller's cancellation
and catalog byte budget, and cannot fail an otherwise successful content fetch.
A missing hint can be filled for already cached content. Reader navigation and
saved-page opening do not acquire extra background requests from this change.

A peer signature identifies the source of a hint; it does not prove the byte
position. Every content fetch still checks the requested data ID and signature.
Existing external preparation provenance is retained. This is routing knowledge
replication, not creation of previously unknown locations or proof that an
external preparation service never contributed to an old index.

## Windows experiment

The workflow downloads the exact published `0.5.0-preview.6` Windows ZIP and
checks SHA-256 `a2b1d30f314ca6a638e5c7d7ceab3bc4592f1de823cd0bd849a6d385df97652e`.
The temporary peer processes use the source revision of the workflow run.
No fixture site or connection profile is embedded in the public package.

The controller creates Windows Firewall block rules for the application and
temporary peer executable, permitting only the selected numeric IPv4 service
endpoints and loopback. It blocks their other IPv4 destinations/ports, IPv6 and
UDP, and blocks system DNS ports and the DNS cache service's outbound access.
An unguarded Node probe running inside the same Electron executable verifies
DNS, a gateway's resolved HTTPS address and a DoH provider's resolved HTTPS
address before and after the cut. This is OS blocking plus application request
logs and screenshots; it is not a complete packet capture.

Each phase starts a new empty browser data directory. Four real names are
entered through the desktop address bar: `vevivo`, `internetfireplace`,
`permahistory`, `kh-laboratory`. These are QA inputs, not production routing
exceptions. Main-document success is recorded separately from page completeness.
Blocked external media/CDN dependencies can leave a page partial.

The baseline [run 36082497056](https://github.com/Vevivo/arns-mesh/actions/runs/36082497056)
opened all four main documents with DNS/gateway blocking, again after the
original Mesh source was blocked, and again after replica A was stopped.
Replica B served the last phase. The replicas had separate stores and identities
on the same Windows VM; this does not establish independent-host failover.

In a cold phase with only five configured raw Arweave peers and RPC reachable,
`vevivo` opened with zero Mesh responses. `internetfireplace` resolved to its
target but its root manifest location was absent from the available published
indexes. The baseline stopped this diagnostic phase at that failure. The newer
harness records all four names and additionally tests an index-only replica.

The updated [run 36083856211](https://github.com/Vevivo/arns-mesh/actions/runs/36083856211)
at source `13331769c3eba4c552dcbae88249ed60fe7a802a` passed on Windows.
All 125 source tests also passed on Linux and Windows. The raw-only diagnostic
and the index-replica phase produced the following main-document results:

| Name | Cold, raw peers only | Original source blocked, index replica + raw peers |
|---|---|---|
| vevivo | Opened, 6.002 s | Opened, 3.019 s |
| internetfireplace | Location unavailable | Opened, 2.657 s |
| permahistory | Location unavailable | Opened, 2.265 s |
| kh-laboratory | Location unavailable | Opened, 2.174 s |

The index-only peer retained five routing records before the original source
was cut. It contained **zero content files**, served **zero content bytes**, and
made **zero outbound requests**. Each fresh browser obtained raw Arweave responses
and verified the requested content; the cut original source returned zero
responses. DNS timed out and gateway/DoH/original-source TCP probes returned
`EACCES`. The original-source and two successive content-replica phases also
opened all four main documents. Firewall restoration succeeded.

The retained evidence artifact is `windows-disaster-evidence`, ID `10842378567`,
SHA-256 `28f2d74011adb9d3968b322e795ef963e1200909e564d7a4b0360e2fced462c0`.
It contains sanitized results and actual desktop screenshots. The index peer
and content replicas remained on the Windows VM; raw storage endpoints were
remote. These findings demonstrate useful prepared-routing recovery, not
complete cold discovery or a deployed network of independent index operators.

## Reproduction and boundaries

The repository's `qa/disaster-network` branch runs the disposable Windows job.
An existing private `MESH_QA_PROFILE` Actions secret supplies approved numeric-IP
connections. Raw operator addresses and temporary user data are excluded from
artifacts. Rules and prior firewall profile settings are restored on exit.

The optional separate Linux runner experiment is disabled unless the repository
variable `MESH_TEST_REMOTE_REPLICAS` equals `1`. The initial hosted Linux runners
could prepare the public documents but their inbound endpoints were unreachable
from Windows. Do not treat distinct identity keys or process names as physical
independence. Actual independent reachable infrastructure remains required.

`testPassed` in the report is the exercised workflow result.
`independentHostFailover`, `rawPeerFallbackPassed`, `indexReplicaRawPassed` and
`disasterGoalFullyVerified` describe separate, stricter outcomes. A green job
does not mean every ArNS name and every asset can be located after a disaster.

Local regression checks include signed manifest graph replication, restart and
source loss, index-only access to raw storage, corrupted-signature rejection,
bounded cancellation, invalid routing hints, preservation of an existing hint,
catalog response budgets and optional persistence failures.
