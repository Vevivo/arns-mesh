# ArNS Mesh 0.5.0-preview.6

Fixes the main-process exception when a page tries an external link. The link remains blocked; the current ArNS page and browser controls remain available. CSP-blocked assets and script errors are now reported as a partial page rather than hidden behind a main-document success label. A connection check no longer starts discovery on older peers or mislabels their pending reply as an unavailable peer. Expired name leases receive a specific RPC/clock-qualified explanation.

Saved versions now retain their original dated name binding separately from later live observations. Old entries whose binding cannot be recovered keep their bytes and ask the user to save again, instead of silently selecting a new target. Existing gateway, CDN, DNS and external-network restrictions remain in place. No production peer upgrade is required.

The live Windows regression workflow uses a fresh client and existing operator sources, real public ArNS names, native profile import, a blocked external link and a verified saved-document reopen. It does not establish generic cold discovery, independent node failover or complete OS-level DNS/DoH/IPv6 acceptance. Some pages still depend on blocked external files and remain incomplete.

Download the Windows ZIP, extract it into a separate folder and run `Mesh-Browser.exe`. Close the previous version first and retain its folder and your user-data backup. The public package contains no private connection profile; existing profiles remain in the user-data directory. See [preview-6.md](../preview-6.md) for changes and saved-page limits, and the release attachments for measured validation of the exact ZIP.

Unsigned community preview; not an official AR.IO distribution or a final universal-access release.
