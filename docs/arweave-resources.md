# Direct Arweave resources — preview.7

Pages often spell immutable Arweave resources as `https://arweave.net/<id>`
or `/raw/<id>`. The browser now interprets supported URLs inside its isolated
content session and obtains their signed bytes through Mesh/raw Arweave. It
does not resolve or connect to the URL's gateway. The signed HTML/CSS/JS bytes
are unchanged. Manifest paths and standard sandbox subdomains are supported.
Other hosts, gateway APIs, external navigation and writes remain blocked.

Each downloaded object must match its full case-sensitive ID and content
signature. Byte ranges and HEAD are answered after verification of the complete
bounded object; this is not streaming verification of large files. The existing
32 MiB object limit remains. Saved mode accepts only verified local objects.

Supporter catalog jobs and Save page now also follow literal Arweave references
in verified HTML, CSS, JavaScript and JSON. A text scan reads at most 2 MiB and
retains at most 1,024 distinct IDs. Catalog queue cursors and response budgets
still apply. Save page follows manifests and these references up to 1,025 total
objects and retains their pins across restarts. A scan/file/storage limit or
missing object is reported as an incomplete copy. Dynamically constructed URLs
and non-Arweave CDN/services are outside this discovery scope; the interface
labels the result as detected Arweave files, not a complete functional site.

## Measured Windows behavior

The real Windows executable at source
`fb5b94fefaf8ce36c7ce0058c843d2c0abb327ae` passed
[run 36088804178](https://github.com/Vevivo/arns-mesh/actions/runs/36088804178).
All 131 source tests passed on Linux and Windows. The browser started with an
empty content store, imported its profile through the native dialog and used
the OS firewall policy in [disaster-network.md](disaster-network.md).
DNS, gateway HTTPS and DoH probes succeeded before the outage and failed after
it. IPv6 and UDP were blocked. The existing Mesh source and IP-based Solana RPC
remained available; this run is not a Mesh-server outage test.

All four real main documents opened: `vevivo`, `internetfireplace`,
`permahistory` and `kh-laboratory`. The new fallback found the three
`internetfireplace` resources through raw Arweave nodes, without new gateway
metadata or a manually supplied asset location. Their full IDs and signatures
were verified before the browser served these responses:

| Resource | Payload bytes | Local response | Playback observation |
|---|---:|---|---|
| Font | 149,688 | 200 | Font loaded; no resource error |
| Video | 4,742,387 | 206 | readyState 4, 36.146619 seconds, playing, no media error |
| Audio | 5,885,954 | 206 | readyState 4, 15.817651 seconds, playing, no media error |

The report records `embeddedArweaveResourcesPassed=true` and
`mediaPlaybackPassed=true`. A video request was cancelled during media range
loading; the subsequent verified ranges and actual playback passed. The page's
application-level response counter recorded 76,023,177 bytes including lookup
and content work. This is not a packet-capture measurement. The initial search
is materially slower and more expensive than reading a known stored location.

A separately labelled control served the already verified `vevivo` document
through the same interceptor: GET 200, the expected 28,390-byte SHA-256, a
matching 32-byte range with 206 and an empty HEAD response. It is separate from
the live embedded-media result above.

`permahistory` still has blocked third-party CDN dependencies and remains a
partial page. `disasterGoalFullyVerified=false` remains intentional: universal
first discovery, complete site assets and independent-host failover are not
established. Firewall settings were restored after the experiment.

Tested candidate ZIP: 199,709,784 bytes; SHA-256
`0742550fc0c5585aeafae99d7a7a4f801a8136e320c7c0a3848972a562c9a363`.
Evidence artifact: `arweave-resource-evidence`, ID `10844134071`, SHA-256
`db2c950947851ed5ae55420bd9bc2a959c151d9542c1ba0766b71fac501ed5eb`.
A later package built after documentation changes has a different ZIP hash;
use its release checksum to identify that artifact.

The earlier [transport-only run 36087692717](https://github.com/Vevivo/arns-mesh/actions/runs/36087692717)
at `c738fafea3789c2f3a87b7aa2c6518cbb5b2d8b0` correctly recorded missing media
locations and `embeddedArweaveResourcesPassed=false`. It predates the bounded
native discovery and is retained as the failure baseline, not rewritten.

## Location investigation

A separate Linux diagnostic found the page's native bundle from its existing
Mesh weave position. The missing media was not in that bundle. A clearly
separate public-gateway comparison established that the three assets existed;
it supplied no bytes or hints to the Windows experiment or production stores.
Using those externally reported heights as diagnostic inputs, raw native block
headers exposed the assets' bundle entries. That comparison is not autonomous
discovery. A later diagnostic, [run 36087953098](https://github.com/Vevivo/arns-mesh/actions/runs/36087953098), derived block 1,995,047 directly from the existing page weave position using 21 native block probes, then found all three media items within 63 nearby blocks. It used no public publication metadata for that search. Approximately 53 MB of response bodies located the objects; subsequent raw downloads verified all three full IDs/signatures. This remains anchored on the page's existing Mesh location, whose earlier external preparation provenance is retained.

The candidate now invokes this bounded nearby-block discovery only after ordinary resource lookup fails. It shares one scan per parent document, verifies the stored parent, keeps navigation cancellation and scans only the anchor block plus at most 64 predecessors/256 transactions per block. Outer bundle headers are considered; nested/general history coverage is not established. Scans reserve up to 96 MiB before starting, with a persistent 256 MiB/day reader allowance, one active scan/four queued and a three-minute deadline. Ordinary page fetch slots remain available during the scan. The resulting hints cannot authorize content: the retry must still verify complete signed bytes. Saved mode does not invoke discovery. The live Windows playback gate above passed with this fallback enabled; it does not expand the bounded search into universal coverage.

Existing prepared-index recovery from PR #4 remains valid. Universal cold
location coverage, complete site assets and independent-host Mesh failover
remain unfinished. Merging source does not update the production supporter.
