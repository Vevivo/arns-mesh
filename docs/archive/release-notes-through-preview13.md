> Historical evidence. For the current release, see the [Mesh home page](../../README.md).

# Shared-index supporter update — 5 October 2026

Adds verified AR.IO r84 CDB64 band preparation and disk-only lookup through the existing Mesh protocol. Current preview.13 readers can use a configured updated supporter without a new Windows ZIP. The online updater is separate from the DNS/gateway-blocked browsing process. Index coverage and website storage remain distinct. See [setup, quotas and limits](../shared-index.md).

# Supporter queue recovery — 5 October 2026

Server source update after the published preview.13 Windows ZIP. Separates name-sync and content quotas, persists bounded live-reader demand, gives current roots their own scheduling lane and scans recent native blocks without waiting for historical catch-up. Newly registered/rebound names receive priority while existing names continue refreshing. Preparation pins cached verified files. Local monitoring now distinguishes quota pauses.

These changes address stalled work, not universal discovery. Static indexes and this node's partial raw index can still miss a recent data item. No gateway fallback or name-proof downgrade is introduced. See [configuration and limits](../resilient-access.md) and [measured recovery evidence](catalog-recovery-2026-10-05.md).

# ArNS Mesh 0.5.0-preview.13 — published Windows prerelease

Supporters sign and announce reachable numeric-IP endpoints. Peers verify identity by callback and exchange bounded advertisements. Joined desktops automatically learn/persist alternatives, prefer measured valid-content routes and switch after source failure. Discovery does not grant name authority: mirrors retain original trusted publishers' signed name observations.

Saved mode pauses discovery. Participating desktops and peers must upgrade. Initial contact, reachable ports and prepared content are still required. Automatic independent replica placement/repair, a NAT relay and universal coverage are not added. [Behavior and test boundaries](../en/shared-network.md).

# ArNS Mesh 0.5.0-preview.12 — candidate

Home pairs a new, symmetric Mesh node mark with a compact, neutral ArNS Mesh wordmark above the centered search field. The running desktop window uses the same mark instead of the default Electron icon. The promotional hero, introductory paragraphs and long usage guide remain removed. Catalogue details stay available on demand, and search results keep their dated availability labels.

Adds a desktop connection strip and monitor: separately dated Mesh/RPC/raw observations, bounded panel-only protocol checks, verified main-document origin, session traffic and Saved-mode probe suspension. Endpoint counts are local observations, not global Mesh users. [Indicator semantics and test scope](../connection-monitor.md).

The candidate also adds a Home topic search with signed, bounded provider catalogues, local keyword queries and dated availability labels. Supporter peers can mirror the original signed catalogue; readers retain it across restart and outages. The address bar keeps direct ArNS navigation. See [search scope, trust and budgets](../topic-search.md).

Automatic access now treats RPC and raw Arweave availability independently. It can use dated local or explicitly trusted provider observations when live name sources are unavailable, and a previously prepared version when the newest target cannot be fetched. Historical access remains labelled and content signatures are checked. Verification failures and explicit proof requirements are not treated as permission to downgrade name trust.

Providers can retain rechecked catalog name observations, prepare bounded site copies, and keep the previous complete version while an update is incomplete. Transfers, parsed location shards, raw chunks and proof caches have tighter resource limits. Optional local-only monitoring shows preparation, queue errors and actual resources. Signed recovery witness extensions preserve the legacy connection-list format.

See [configuration and precise limits](../resilient-access.md). Source tests cover the four upstream combinations with local HTTP fixtures, atomic version replacement, signed recovery trust, restart and expired lists. This candidate has not completed the owner's two-PC test, a new Windows OS-level outage acceptance or independent-provider failover. Desktop serving and a full replicated Arweave/CDB64 index are not added. Keep the published preview.8 package available while testing.

# ArNS Mesh 0.5.0-preview.8

Readers can now join an operator's network using a reusable connection code. The settings screen checks the signed list, shows its identity and sources, and asks the reader to join. An operator can also build a Connected ZIP with one invitation included for automatic joining on a fresh start. Existing configured sources are preserved.

Live mode refreshes signed addresses on startup and about every 15 minutes, retains the last accepted sources on outages, and rejects invalid signatures, rollback and conflicting equal revisions. Saved mode does not check for network-list updates. Legacy profile import/export remains under **Already have a connection file?**; manual source changes stop managed updates.

Operators can publish a network, share its code, mirror the public signed list without sharing the private key, and install a supporter with `--network`. The authority peer renews its publication before expiry. Neither a mirrored list nor a connection code is a website archive. See [reader/operator instructions](../en/network-code.md) and [Türkçe](../tr/ag-kodu.md).

144 source tests passed on Linux and Windows. The real Windows UI passed code joining, signed updates after directory-process loss, opening `vevivo`, zero new application-audit requests during Saved opening/restart, and included-network automatic joining. Directory peers shared one host and live content sources remained available. [Exact evidence and artifact scope](network-join.md).

This change does not add paid access, single-use redemption, device licensing, automatic desktop serving, universal discovery or independent-host failover. Live names still use numeric-IP RPC observations. Existing DNS/gateway restrictions remain. Upgrading the desktop does not upgrade a production server.

The public ZIP has no operator code or endpoints included. A newly installed reader needs a real code or profile. A Connected ZIP must be deliberately prepared and distributed by its operator. Historical preview.7 outage/media results below are not a new OS-level outage test of preview.8.

# ArNS Mesh 0.5.0-preview.7

Immutable Arweave resource URLs in pages are now served inside the browser through verified Mesh/raw content, with no gateway or DNS request. GET, HEAD and byte ranges retain full ID/signature verification and the 32 MiB object limit. Unsupported hosts/APIs and external navigation stay blocked.

When ordinary resource lookup fails, a bounded fallback starts from the verified parent page's known weave position and searches nearby native Arweave blocks. It shares work between page resources, keeps cancellation and reserves at most 96 MiB per scan within a persistent 256 MiB daily reader allowance. It uses no new gateway metadata; existing anchor preparation provenance remains explicit.

Save page and supporter catalog replication now follow bounded literal Arweave references in signed HTML/CSS/JavaScript/JSON as well as manifest files. Saved resources retain their pins across restart and open locally in saved mode. Dynamic URLs and third-party services are not included; missing files remain visible as an incomplete copy.

131 source tests passed on Linux and Windows. In the real Windows outage test, four main documents opened while OS rules blocked DNS, gateway HTTPS and DoH. Internet Fireplace's font, video and audio were found and signature-verified through the raw Arweave path; video reached 36.1 seconds and audio 15.8 seconds with no media errors. The existing Mesh source and IP-based RPC remained available. See [exact build, evidence and limits](arweave-resources.md).

General first-discovery coverage and independent-host Mesh failover remain unfinished. Non-Arweave CDN dependencies stay blocked; a page using them can remain incomplete. This release does not automatically update the production supporter.

# Supporter routing replication — source update

Catalog jobs and bounded supporter lookups now retain peer-provided Arweave
location hints alongside verified content. Existing locations win, external
preparation provenance survives, and later downloads still verify item identity
and signature. Optional hint failures do not invalidate available content.
Reader navigation and saved opening do not gain extra network requests.

See the [Windows network outage evidence](disaster-network.md). This supporter
source change is separate from the already published preview.6 Windows ZIP;
an existing production service does not update itself.

# ArNS Mesh 0.5.0-preview.6

Fixes the main-process exception when a page tries an external link. The link remains blocked; the current ArNS page and browser controls remain available. CSP-blocked assets and script errors are now reported as a partial page rather than hidden behind a main-document success label. A connection check no longer starts discovery on older peers or mislabels their pending reply as an unavailable peer. Expired name leases receive a specific RPC/clock-qualified explanation.

Saved versions now retain their original dated name binding separately from later live observations. Old entries whose binding cannot be recovered keep their bytes and ask the user to save again, instead of silently selecting a new target. Existing gateway, CDN, DNS and external-network restrictions remain in place. No production peer upgrade is required.

The live Windows regression workflow uses a fresh client and existing operator sources, real public ArNS names, native profile import, a blocked external link and a verified saved-document reopen. It does not establish generic cold discovery, independent node failover or complete OS-level DNS/DoH/IPv6 acceptance. Some pages still depend on blocked external files and remain incomplete.

Download the Windows ZIP, extract it into a separate folder and run `Mesh-Browser.exe`. Close the previous version first and retain its folder and your user-data backup. The public package contains no private connection profile; existing profiles remain in the user-data directory. See [preview-6.md](preview-6.md) for changes and saved-page limits, and the release attachments for measured validation of the exact ZIP.

Unsigned community preview; not an official AR.IO distribution or a final universal-access release.
