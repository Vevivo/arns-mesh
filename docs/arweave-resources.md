# Direct Arweave resources — preview.7 candidate

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

The real candidate executable at source
`c738fafea3789c2f3a87b7aa2c6518cbb5b2d8b0` passed
[run 36087692717](https://github.com/Vevivo/arns-mesh/actions/runs/36087692717).
All 129 source tests passed on Linux and Windows. The test used a fresh browser,
actual public ArNS names, native profile import and the OS firewall policy
documented in [disaster-network.md](disaster-network.md). Solana RPC over IP
remained available; the existing Mesh source was available in this experiment.

All four main documents opened. A separate positive control fetched the real
verified `vevivo` document through the HTTPS resource interceptor: 200 for its
28,390-byte body, the expected SHA-256, 206 for the matching first 32 bytes, and
200 with an empty HEAD body. The gateway/DNS/DoH negative probes passed. This
control used the locally retained signed document and is explicitly separate
from embedded-asset availability.

`internetfireplace`'s font, video and audio still returned local 502 responses
because their locations were absent from the available Mesh/published indexes.
Video/audio did not play. `permahistory` still had blocked third-party CDN
dependencies. These are recorded failures, not successful resource rendering.
The report retains `embeddedArweaveResourcesPassed=false` and
`disasterGoalFullyVerified=false` independently of the passing transport test.

Evidence artifact: `arweave-resource-evidence`, ID `10844187474`, SHA-256
`6d1c5f6755015fc6333c2a40ec384413c31243a8cfbe9d6a7370dbcdabf5685e`.

## Location investigation

A separate Linux diagnostic found the page's native bundle from its existing
Mesh weave position. The missing media was not in that bundle. A clearly
separate public-gateway comparison established that the three assets existed;
it supplied no bytes or hints to the Windows experiment or production stores.
Using those externally reported heights as diagnostic inputs, raw native block
headers exposed the assets' bundle entries. That comparison is not autonomous
discovery. Experiments deriving nearby blocks directly from a page position
remain on `qa/resource-discovery` and are not part of the production resolver.

Existing prepared-index recovery from PR #4 remains valid. Universal cold
location coverage, complete site assets and independent-host Mesh failover
remain unfinished. Merging source does not update the production supporter.
