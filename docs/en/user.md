# Use ArNS Mesh

[Türkçe](../tr/kullanici.md) · [Home and downloads](../../README.md)

You need the Windows x64 application ZIP. You do not need a server, wallet, Node.js or an indexer. Supporters run the separate service that supplies useful data.

## 1. Download and open

Choose a package from the [download/status table](../../README.md#downloads-and-actual-status). Published preview.8 and test candidate preview.12 are different builds. GitHub Actions artifacts can expire and may require sign-in. Download the application ZIP, not **Source code (zip)**.

Extract **all** files into a permanent folder and start `Mesh-Browser.exe`. Keep the executable with the other files. To put it on the desktop, create a Windows shortcut to the executable; do not move just the EXE out of its folder. The preview is unsigned. Do not disable security tools or run it as administrator to bypass a warning; report the warning details if blocked.

If checking a supplied checksum in PowerShell, run `Get-FileHash -Algorithm SHA256 -LiteralPath 'path-to-downloaded.zip'` and compare the whole value with the checksum shipped for that exact package. A checksum is not a publisher signature.

## 2. Connect once

| Package | First connection |
|---|---|
| A separately prepared **Connected ZIP** | On a fresh install, Mesh validates and joins the network included by that operator |
| The standard GitHub release/candidate ZIP | Obtain a full `mesh1.` invitation from a trusted operator; paste into **Settings → Mesh connection code → Check code**, review, then **Join this network** |
| Existing configured installation | The app normally reuses its saved connection settings |

Joining replaces the source list; use **Export profile** first if you want to keep the old one. A legacy `mesh-connect.json` can still be imported under **Settings → Already have a connection file?**. Manual edits/imports stop managed source-list updates.

The code is reusable network information, not a password, license or payment. Standard downloads currently contain no invitation. [Request connection help](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml) if needed; this is volunteer coordination, not guaranteed service.

The agreed product direction is a default download that opens without code entry. Automatic new-supporter discovery is still [planned](shared-network.md); today's connected packaging does not implement it.

## 3. Open a site or search

Enter a name such as `ar://vevivo` in **Mesh's top address bar**. Use the actual registered spelling for undernames, for example `undername_name`. Paths, queries and fragments are supported. Ctrl+L focuses the address bar; right-click Paste and Ctrl+V work.

The preview.12 **Home** field is a separate topic search. Choose **Refresh catalogue** while sources are available, then search the bounded downloaded catalogue locally. A search result does not guarantee all files are available. This feature is absent from preview.8. [Search details](../topic-search.md).

The progress row follows **Resolve name → Find sources → Locate content → Download → Verify → Open page**. It reflects actual work, not a timer. Use **Page information** for missing files, content verification and the dated name observation. Third-party APIs and non-Arweave CDN files may remain unavailable.

## 4. Save what matters

The star bookmarks an address. **Save current page** retains supported verified files within limits. Wait for its result and inspect missing files; saving a main document is not proof that the entire dynamic site was archived.

Preview.12 **Automatic** access uses live sources where available and can fall back to an accepted historical version on availability failures. **Saved** access uses retained name information and suspends live name checks/monitor probes. Missing content can still be requested from Mesh/raw sources; Saved is not a system-wide network-off switch. A complete retained copy was tested across restart with zero new application HTTP requests. Preview.8 has its older Live/Saved behavior. [Candidate recovery scope](../resilient-access.md).

The candidate's **Network monitor** shows this device's Mesh/RPC/raw observations, traffic and verified main-document source. Its peer count is not a worldwide Mesh user count. “Not checked” is not “offline”; a reply does not establish that every site is available. [Indicator meanings](../connection-monitor.md).

## Common questions

| Situation | What to check |
|---|---|
| Settings opens on first launch | A standard package needs a real invitation/profile |
| A peer responds but a site fails | That peer may not have the required name record, location or bytes |
| RPC is unreachable | Current names may be unavailable; candidate recovery needs an accepted dated observation |
| Raw Arweave is unreachable too | The required content must already exist locally or on reachable Mesh peers |
| Signature or identity mismatch | Data was rejected; keep verification enabled |
| Some images/APIs are missing | Check Page information; external services, missing locations or file limits can explain it |
| A previously opened page disappeared | A temporary cache can be evicted; use an explicit saved copy and check completeness |

The current signed-object limit is 32 MiB. No version guarantees all names, instant latest updates or access without a reachable copy. Send the version and failed stage in feedback; redact private addresses, browsing history and paths from diagnostics.

## Update and backup

Close the app, keep a private backup of `%APPDATA%\ArNS-Mesh-Browser`, and extract the new ZIP into a different folder. Keep the matching old app/data backup for rollback. There is no automatic application updater. A desktop update does not update a supporter server.

Removing the extracted program folder preserves user data. Delete the AppData directory separately only if you intend to erase settings, history, bookmarks and saved content. No Chrome extension is installed. [Privacy](privacy.md) · [Feedback](../../CONTRIBUTING.md).
