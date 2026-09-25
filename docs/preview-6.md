# Preview 6: blocked resources and browser error handling

This update keeps gateway, CDN, external HTTP/IP navigation, DNS and automatic fallback restrictions in place. It does not add a gateway proxy or a domain lookup path.

Changes:
- Reject external or malformed navigation before normalizing its address. Keep the current tab and show a controlled message, including when Electron sends `did-start-navigation` before the cancellable navigation event.
- Report CSP blocks and page script errors in Page information. A verified main document with reported missing resources is shown as a partial page. Renderer reports are diagnostic observations, not proof of network traffic or content authenticity. Counts are deduplicated and bounded to 64 diagnostics per navigation.
- Check Mesh protocol reachability with an empty-name snapshot validation request. Both the old and new peer reject it before reading a snapshot or starting discovery. A response does not prove peer identity, content coverage or current name state.
- Explain an expired name lease separately from a missing RPC response, while stating reliance on RPC observations and the local clock.

## Saved pages

Saving verified content is supported. **Saved pages → Save current page** pins the main document, or the manifest and its listed files, within the separate 512 MiB saved-content quota. **Open saved version** uses the explicitly saved name observation; it is not a claim that the name still points to that content. Cached bytes are verified again when read. An index is a location map, not an archive of every indexed site.

Without a manifest, saving is limited to the main document. External CDN files, APIs, logins, media URLs on gateway domains, and dynamically discovered dependencies are not archived or replaced. Arbitrary captured CDN bytes cannot be presented as the original signed Arweave content. Fully independent sites need their necessary assets stored and referenced through the supported ArNS/manifest path. The 32 MiB per-item limit remains.

## Validation and limits

`npm test` includes regression tests for event order, malformed links, partial-page reporting, lease errors and a real local peer endpoint that must not start discovery during a connection check. Those tests use explicit fixtures and are not live-network acceptance.

`.github/workflows/live-release.yml` builds a Windows candidate and drives the packaged executable using the private, operator-approved connection-profile secret. It uses a fresh client, an existing peer/catalog, native profile import, live names, a rejected external link and a saved-document reopen. Published artifacts exclude the profile and private user directory. Full results and package hashes come from the run artifacts; a green collection-only historical run is not a product pass.

This update does not claim complete cold location discovery, complete site archiving, independently proved Solana inclusion/freshness, multiple independent peer resilience, Raspberry Pi hardware validation or OS-level DNS-cut acceptance. Known domain/CDN dependencies remain blocked and may leave third-party pages incomplete.

Reference for navigation event order and console diagnostics: https://www.electronjs.org/docs/latest/api/web-contents . The package uses the existing pinned Electron 44.4.3 runtime.
