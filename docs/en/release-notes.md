# ArNS Mesh 0.5.0-preview.8

Readers can now join an operator's network using a reusable connection code. The settings screen checks the signed list, shows its identity and sources, and asks the reader to join. An operator can also build a Connected ZIP with one invitation included for automatic joining on a fresh start. Existing configured sources are preserved.

Live mode refreshes signed addresses on startup and about every 15 minutes, retains the last accepted sources on outages, and rejects invalid signatures, rollback and conflicting equal revisions. Saved mode does not check for network-list updates. Legacy profile import/export remains under **Already have a connection file?**; manual source changes stop managed updates.

Operators can publish a network, share its code, mirror the public signed list without sharing the private key, and install a supporter with `--network`. The authority peer renews its publication before expiry. Neither a mirrored list nor a connection code is a website archive. See [reader/operator instructions](network-code.md) and [Türkçe](../tr/ag-kodu.md).

144 source tests passed on Linux and Windows. The real Windows UI passed code joining, signed updates after directory-process loss, opening `vevivo`, zero new application-audit requests during Saved opening/restart, and included-network automatic joining. Directory peers shared one host and live content sources remained available. [Exact evidence and artifact scope](../network-join.md).

This change does not add paid access, single-use redemption, device licensing, automatic desktop serving, universal discovery or independent-host failover. Live names still use numeric-IP RPC observations. Existing DNS/gateway restrictions remain. Upgrading the desktop does not upgrade a production server.

The public ZIP has no operator code or endpoints included. A newly installed reader needs a real code or profile. A Connected ZIP must be deliberately prepared and distributed by its operator. Historical preview.7 outage/media results below are not a new OS-level outage test of preview.8.

# ArNS Mesh 0.5.0-preview.7

Immutable Arweave resource URLs in pages are now served inside the browser through verified Mesh/raw content, with no gateway or DNS request. GET, HEAD and byte ranges retain full ID/signature verification and the 32 MiB object limit. Unsupported hosts/APIs and external navigation stay blocked.

When ordinary resource lookup fails, a bounded fallback starts from the verified parent page's known weave position and searches nearby native Arweave blocks. It shares work between page resources, keeps cancellation and reserves at most 96 MiB per scan within a persistent 256 MiB daily reader allowance. It uses no new gateway metadata; existing anchor preparation provenance remains explicit.

Save page and supporter catalog replication now follow bounded literal Arweave references in signed HTML/CSS/JavaScript/JSON as well as manifest files. Saved resources retain their pins across restart and open locally in saved mode. Dynamic URLs and third-party services are not included; missing files remain visible as an incomplete copy.

131 source tests passed on Linux and Windows. In the real Windows outage test, four main documents opened while OS rules blocked DNS, gateway HTTPS and DoH. Internet Fireplace's font, video and audio were found and signature-verified through the raw Arweave path; video reached 36.1 seconds and audio 15.8 seconds with no media errors. The existing Mesh source and IP-based RPC remained available. See [exact build, evidence and limits](../arweave-resources.md).

General first-discovery coverage and independent-host Mesh failover remain unfinished. Non-Arweave CDN dependencies stay blocked; a page using them can remain incomplete. This release does not automatically update the production supporter.

# Supporter routing replication — source update

Catalog jobs and bounded supporter lookups now retain peer-provided Arweave
location hints alongside verified content. Existing locations win, external
preparation provenance survives, and later downloads still verify item identity
and signature. Optional hint failures do not invalidate available content.
Reader navigation and saved opening do not gain extra network requests.

See the [Windows network outage evidence](../disaster-network.md). This supporter
source change is separate from the already published preview.6 Windows ZIP;
an existing production service does not update itself.

# ArNS Mesh 0.5.0-preview.6

Fixes the main-process exception when a page tries an external link. The link remains blocked; the current ArNS page and browser controls remain available. CSP-blocked assets and script errors are now reported as a partial page rather than hidden behind a main-document success label. A connection check no longer starts discovery on older peers or mislabels their pending reply as an unavailable peer. Expired name leases receive a specific RPC/clock-qualified explanation.

Saved versions now retain their original dated name binding separately from later live observations. Old entries whose binding cannot be recovered keep their bytes and ask the user to save again, instead of silently selecting a new target. Existing gateway, CDN, DNS and external-network restrictions remain in place. No production peer upgrade is required.

The live Windows regression workflow uses a fresh client and existing operator sources, real public ArNS names, native profile import, a blocked external link and a verified saved-document reopen. It does not establish generic cold discovery, independent node failover or complete OS-level DNS/DoH/IPv6 acceptance. Some pages still depend on blocked external files and remain incomplete.

Download the Windows ZIP, extract it into a separate folder and run `Mesh-Browser.exe`. Close the previous version first and retain its folder and your user-data backup. The public package contains no private connection profile; existing profiles remain in the user-data directory. See [preview-6.md](../preview-6.md) for changes and saved-page limits, and the release attachments for measured validation of the exact ZIP.

Unsigned community preview; not an official AR.IO distribution or a final universal-access release.
