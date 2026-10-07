# Independent supporter continuity — 6 October 2026

Version: **0.6.0**. [Machine-readable evidence](independent-supporters-2026-10-06.json).

## What was exercised

| Case | Observed result |
|---|---|
| Original seed absent before a new supporter joins | Durable same-key definition accepted; no original-server key copied |
| Fresh reader with no learned address | Finds the later supporter over numeric-IP HyperDHT rendezvous; endpoint signature challenge passes |
| Real public rendezvous, 14:05 UTC | Three independent numeric bootstrap endpoints; one new supporter discovered; 86 payload bytes fetched and ANS-104 signature verified |
| Bulk accepted name relay | 2,402 signed bindings, more than 1 MiB; pagination resumes after restart |
| Retained manifest and files | Manifest, HTML and CSS copied and verified; B serves after A stops, then C copies B and serves after B stops |
| Incomplete content | Missing CSS fails readiness; partial byte budget never reports a complete site |
| Name integrity | Forgery, untrusted publishers, rollback and conflicting records rejected |
| Expired original publication | Joined supporter starts without A using its accepted state and durable identity |
| Expired remote trust replay | Cannot restore retired name publishers; a current signed revocation overrides older durable fallback |

The full Linux source suite passed **219 tests** before final review fixes. Separate regressions cover the expired-publication restart and readiness trust fixes. The release workflow runs the entire final source on Linux and Windows.

## Packaged Windows gate

Publication requires the actual ZIP application to pass existing English search/monitor and real-site upstream-route outage acceptance. It also requires an empty Electron reader to join and discover B while original seed A is absent, render signed fixture content and reopen after restart. The workflow artifacts preserve the results. The published release's **build.json → acceptanceRun** identifies the exact successful source commit and packaged acceptance; do not treat an uncompleted candidate run as a pass.

## What these results mean

The original operator is no longer required to hand out new codes or stay online so a later supporter can establish the public network's identity and advertise itself. The public signed definition and independent discovery routes provide that continuity. Discovery gives addresses; it does not grant arbitrary new peers authority over names.

Each supporting server still prepares content. Working upstream routes are used; when those routes are unavailable, retained accepted records and real verified files must survive somewhere reachable. A local preparation count is not an external reachability certificate. Run the [independent requested-name check](../en/resilience.md) from another machine.

## Limits

The server tests use isolated processes on **one physical host**, including the public Internet rendezvous case. Windows acceptance uses a disposable Windows runner with local fixture peers. These tests are not proof that a second independent hosting provider has already installed a production replica. Physical Raspberry Pi testing and complete ArDrive application compatibility are not certified. File counts describe test fixtures, not total network coverage.

Internet/IP connectivity, a usable discovery route and a source carrying the requested information are necessary. R84 location records do not replace website files. A previously unretained file cannot be reconstructed while every source carrying it is unavailable.
