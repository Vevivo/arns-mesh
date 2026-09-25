# Preview.8 connection-code acceptance — 25 September 2026

Source under Windows acceptance: `8eb51685e4aef02b2eba1e42bedbdba8dbc370ce`.

- [Windows executable and UI run](https://github.com/Vevivo/arns-mesh/actions/runs/36108198567)
- [Linux and Windows source checks](https://github.com/Vevivo/arns-mesh/actions/runs/36108202015)
- [Implementation and documentation PR](https://github.com/Vevivo/arns-mesh/pull/7)

The Windows run built the real portable executable with pinned Electron 44.4.3 and drove its rendered toolbar using Playwright over local CDP. The `network-join-windows-evidence` artifact contains results, redacted screenshots and a sanitized Electron log. The package artifact contains the candidate ZIP and checksums. These workflow artifacts expire; this record preserves the measured result and its scope.

| Check | Measured result |
|---|---|
| Invalid connection code | Rejected in the actual settings UI |
| Review before joining | Signed network displayed; no membership file before the reader joins |
| Code joining | Accepted through UI without importing a JSON profile |
| Publisher process loss | First directory process stopped; restarted reader learned signed revision 2 through the remaining directory peer |
| Real ArNS page | `vevivo` opened with verified content after joining; existing approved operator Mesh/RPC/raw sources remained available |
| Saved access | No new application-audit request while reopening the retained page |
| Saved startup | No new application-audit request across close and restart in Saved mode |
| Included network | Fresh data directory joined automatically with the invitation in the extracted package configuration |
| Renderer errors | None recorded |
| Source tests | 144 passed on Linux and Windows |

The two directory peers were **separate processes on the same Windows machine**. They carried controlled, signed network metadata; the real ArNS step used the existing live sources. This demonstrates onboarding, authenticated endpoint updates and cached discovery after a process failure. It does not establish physical-host/provider independence, full content-source loss, universal content discovery or new OS firewall outage acceptance.

The Connected journey changed only the invitation configuration in the extracted executable directory; the uploaded public ZIP was left unconfigured. The optional `--network-code-file` packaging path is separate. This is not a paid access, one-time redemption or device-license test.

`tests/network-processes.test.mjs` separately copies a signed ANS-104 content fixture between two real peer processes, terminates the original, restarts membership and retrieves verified bytes from the survivor. This is protocol evidence using generated content, not a public ArNS or independent-host experiment. Its POSIX extension tests real code-based installer joining and update preservation; dependency installation alone is doubled, with actual lockfile installation tested separately in CI.

Later changes on the same PR update documentation and the POSIX installer test; the Windows-measured application source must be compared before attributing this run to another ZIP. Each new ZIP has its own checksum. Historical preview.7 DNS/gateway firewall and media results remain documented in [Arweave resources](arweave-resources.md).

Remaining acceptance: independent hosts with useful replicas, physical Pi hardware, full egress capture, general cold discovery, and a production operator rollout with real public invitations. No production service was altered by this workflow.
