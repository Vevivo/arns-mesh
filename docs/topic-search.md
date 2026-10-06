# Topic search — Mesh 0.5.1

The top address bar opens an ArNS name. The Home search box finds ArNS sites by name, topic, description or keyword. Click a result to open it, or click a topic label to search that topic.

Search covers retained ArNS names and undernames, owner-supplied ANT descriptions/keywords, optional record-specific metadata, and verified cached HTML titles, descriptions, keywords and text. A name can appear before its page has been prepared; the result says **ArNS listing · page availability checked when opened**. A listing is not a promise that all site files are available.

## Using search

Join your normal Mesh network, open Home, type a topic and choose **Search Mesh**. Use **Refresh catalogue** if needed. The reader refreshes on startup and about every 15 minutes outside Saved mode. No search account or API key is needed.

The interface and search examples are English. English topic variants such as game/games/gaming are matched together. Search terms otherwise match words or word prefixes, with every query term required. International names and accents remain searchable, but queries are not translated. This is bounded keyword search, not AI semantic search. Exact names rank first; keyword matches have more weight than incidental body text. Up to 30 results are shown.

Query words stay on the reader. The accepted catalogue remains searchable after a restart or provider outage. A fresh reader needs a reachable supporter to obtain a catalogue. Opening a result always uses the existing ArNS binding and content verification; search metadata cannot change a name target.

## Supporters

When the existing name catalog is enabled, a separate search worker reads ANT Config and AntRecordMetadata accounts through the configured numeric-IP Solana RPC about every 15 minutes. It checks the account owner, discriminator, mint, derived address, undername hash and nondecreasing slot. The metadata remains an RPC observation, not an account inclusion proof.

Only a current target-catalog name/mint/target matching the retained local name is listed. Root ANT metadata is applied to the root name; undernames use their own optional record metadata. Explicitly empty record keywords override parent keywords. Failed refreshes retain the previous observation. Removed/rebound names are excluded when the name catalog observes that change.

HTML indexing verifies the original manifest and entry document signatures and never executes scripts. It examines up to 32 cached entry candidates per pass, excludes scripts/styles/templates, and retains a bounded preview. It keeps the existing limit of 256 prepared HTML entries; additional names remain discoverable through name and ANT metadata. No search-triggered website downloads or extra desktop crawler are introduced.

## Bounds and compatibility

- Server metadata: 16 MiB disk cap, 16 MiB per RPC response, 32 MiB per pass and 512 MiB daily received-body budget. Failures consume quota.
- Version 2 catalogue: at most 20,000 entries and 8 MiB signed JSON, with a 16 MiB envelope/transport cap. The byte cap may reduce the number of entries.
- Reader: at most two accepted publisher envelopes, bounded to approximately 32 MiB plus small revision bookkeeping. Actual size depends on the network; this is not the multi-gigabyte R84 index.
- HTML previews: 1 MiB input, 160-character title, 320-character description, 1,200-character body text, up to 12 bounded keywords.
- Search uses the existing numeric-IP catalog operation with version 2. Publisher signatures, configured trust, rollback/conflict rejection and atomic acceptance remain enforced.
- Older readers receive the original version 1 HTML catalogue. Upgraded supporters mirror both versions without sharing private keys.

Search catalogue replication is separate from website file replication. Dates and availability are reports from the accepted publisher. Missing metadata, incomplete preparation, resource limits, source outages and update intervals all limit coverage.

## Checks

Tests cover account bindings, cleared keywords, changed targets, RPC failure, quota charging, 700 metadata-only results, English keyword matching without query translation, escaped labels, signed transport, offline restart and legacy compatibility. Windows package acceptance searches a topic found only in an ANT keyword, clicks its tag, restarts offline, and opens the result through the existing renderer.

[Turkish guide](tr/konu-aramasi.md) · [ANT metadata specification](https://github.com/ar-io/specs/blob/main/arns/arns-token-1.md)
