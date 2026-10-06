# ArNS Mesh 0.5.1

Find ArNS sites by topic from the Home search box. Open known ArNS addresses in the upper address bar as before.

This update adds owner-supplied ANT descriptions and keywords, optional undername metadata, clickable topic labels and common Turkish/English topic matches. The larger signed catalogue includes retained names even when their page has not yet been prepared; availability is clearly labelled. Search terms stay on the reader, and accepted catalogues remain searchable during outages.

The 0.5.0 / preview.13 access path, R84 integration, continuous name/content preparation and signature verification are preserved. Older readers continue receiving the original small HTML catalogue.

## Use it

Download and extract the Windows ZIP, launch `Mesh-Browser.exe` and join your existing Mesh network. On Home, refresh the catalogue and search for a topic such as music, games or storage. Click a result to open its ArNS site.

[Windows guide](https://github.com/Vevivo/arns-mesh/blob/v0.5.1/docs/en/user.md) · [Türkçe](https://github.com/Vevivo/arns-mesh/blob/v0.5.1/docs/tr/konu-aramasi.md) · [Supporter setup](https://github.com/Vevivo/arns-mesh/blob/v0.5.1/docs/en/supporter.md)

## Verification

The release workflow runs Linux and Windows source tests, packages the actual Windows application, checks keyword-only search and offline restart in Electron, and opens real public content with external DNS, RPC and Arweave blocked before publishing. Live metadata/search observations are recorded in the repository's topic-search validation report.

## Boundaries

Search listings do not guarantee that a site is fully retained or that external APIs work. Outage access requires retained names, verified files and a reachable Mesh source. Some owners have no useful topic metadata; this is bounded keyword discovery, not a complete web search engine. Large indexes stay on supporters; the reader keeps a bounded catalogue cache.

The Windows package is an unsigned community build. Physical Raspberry Pi and full ArDrive application compatibility are not certified. Independent replica placement/repair remains future work.
