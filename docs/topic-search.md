# Topic search — preview.9 candidate

The Home page has a topic search field. The top address bar still opens a known ArNS name or `ar://name` directly. Search returns up to 30 matching names, titles and excerpts from the catalogue already downloaded to this device. All query words must occur in the indexed name/text; accents and Turkish dotted/dotless I are normalized. This is keyword matching, not translation or semantic/AI search.

Results include the name-observation time, page-indexing time and a dated availability report. **Entry page indexed** does not mean all assets exist. **Site copy reported by peer** describes the provider's preparation scope at indexing time, not a current reachability guarantee. **Saved on this device** is shown only when this reader has a matching ready saved version. Opening any result follows the existing name-resolution and content-verification path. Search metadata never overrides an ArNS binding or becomes a content proof.

## Reader

1. Use a candidate build containing topic search; the published preview.8 ZIP does not contain this feature.
2. Join the operator's network normally. Its signed recovery extension supplies trusted witness identities; a legacy profile without `trustedPeers` needs the operator's updated connection information. No extra search account or API key is required.
3. On Home, choose **Refresh catalogue** if needed. Automatic checks run at startup and roughly every 15 minutes outside Saved mode. Type a topic and choose **Search Mesh**. Query words stay on the device.
4. If the provider is unavailable, the last accepted catalogue remains searchable, including after application restart. Saved mode disables catalogue refresh, but not local search.
5. No result means no match in the downloaded subset. Try another word or enter the known name in the upper address bar. A result does not download or pin the website by itself.

A fresh reader with no accepted catalogue cannot invent an offline search index. Opening a result still requires its name observation and real bytes locally or on a reachable source. This feature does not turn reader desktops into public peers.

## Provider and supporter

The headless peer builds `search-published.json` from locally observed names and **signature-verified cached HTML entry documents**. If a name targets a path manifest, the manifest and selected entry document are both verified. No page scripts run. Scripts, styles, templates and markup are omitted from a bounded text preview; CSS visibility and JavaScript-generated text are not evaluated. A missing or corrupt document is not indexed. After an observed target change, the old entry is removed until the new document is available.

Existing content discovery/preparation supplies the files; the search publisher introduces no separate web crawler or raw-content download. Up to 32 names are examined per minute, with a round-robin cursor. Large registries, incomplete discovery and quotas can delay coverage. It does not instantly detect every new name or update. Each catalogue has at most 256 HTML entries and 384 KiB of signed JSON; the byte cap can reduce the entry count. Extraction accepts entry payloads up to 1 MiB, stores a 160-character title, 320-character description and 1,200-character static text preview. It does not download a full CDB64 index.

Existing numeric-IP Mesh endpoints accept `{ "op": "catalog", "witnessPeerId": "<trusted-public-witness-id>" }`. The result is an Ed25519-signed `arns-mesh-search/v1` record containing a revision, generation time and entries. No query words are transmitted. The client checks the signature, configured publisher identity, dimensions and dates, and rejects lower revisions and conflicting equal revisions. A whole catalogue is accepted atomically; failed updates preserve the earlier copy. The client retains at most two publisher catalogues and 64 publisher revision high-water marks (including revoked publishers, to prevent rollback on re-addition). It filters revoked publishers out of results immediately.

A supporter configured with the source peer address and its trusted witness identity downloads and serves the **original signed envelope** via the same operation. It does not rewrite or re-sign the originating provider's metadata. Readers need the supporter's reachable address plus the original publisher identity in their trusted list. The private signing key is never shared. Each sync tries at most two peer addresses and two trusted publisher identities (four bounded requests), with a 45-second overall timeout. An envelope is limited to 800 KiB; the existing transport also caps responses at 1 MiB. Failed/unavailable responses may consume transport bytes too. With more configured publishers, only the first two are synchronized in this preview.

`ARNS_UPSTREAM_FETCH=0` disables automatic mirror downloads. A disconnected supporter can still serve catalogues it has already retained, and publish from verified local bytes. Copies of a search catalogue are **not** copies of website files or proof of the latest name state. There is still only one independent service provider until other operators actually run peers and retain data.

## Verification and remaining acceptance

Automated tests cover signed HTML/manifest extraction, Turkish queries, changed targets, corrupt and evicted bytes, untrusted signatures, rollback/conflicting revisions, bounded storage/requests, escaped result markup and the toolbar/content privilege boundary. A real loopback HTTP experiment transfers a catalogue through an intermediate peer with its original signature, closes both peers, restarts the reader and successfully searches the retained copy. These are local process tests, not independent-machine disaster acceptance.

Linux/Windows source CI and a Windows candidate ZIP are separate from production release and native UI acceptance. The owner's two-PC test remains deferred. No general Web/ArNS coverage, instant update guarantee, semantic search, independent name-state proof or new OS-level outage result is claimed.
