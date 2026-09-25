# ArNS Mesh 0.5.0-preview.7 — candidate

Immutable Arweave resource URLs in pages are now served inside the browser through verified Mesh/raw content, with no gateway or DNS request. GET, HEAD and byte ranges retain full ID/signature verification and the 32 MiB object limit. Unsupported hosts/APIs and external navigation stay blocked.

Save page and supporter catalog replication now follow bounded literal Arweave references in signed HTML/CSS/JavaScript/JSON as well as manifest files. Saved resources retain their pins across restart and open locally in saved mode. Dynamic URLs and third-party services are not included; missing files remain visible as an incomplete copy.

129 source tests passed on Linux and Windows. The real Windows candidate passed DNS/gateway OS blocking, four main-document opens and a separate real-document resource transport control. This does **not** establish complete embedded assets: internetfireplace video/audio locations are still missing from available indexes, and permahistory still depends on external CDNs. See [direct-resource evidence and limits](../arweave-resources.md). A bounded fallback now searches nearby native Arweave blocks from a verified parent page when ordinary resource lookup fails. The separate Linux experiment found and signature-verified all three missing media items without new gateway metadata. The new Windows video/audio playback gate is pending. This candidate is not yet the published release.

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
