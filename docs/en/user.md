# Desktop users — no server required

[Türkçe](../tr/kullanici.md) · [Home](../../README.md)

You only need the Windows x64 desktop ZIP and a connection profile from a supporter. You do **not** need Chrome, an extension, a VPS, Raspberry Pi, Node.js, a wallet, or an indexer. The ZIP includes the browser engine and Mesh reader. This preview is unsigned; it is not a Microsoft Store application.

## First start

1. Open [Releases](https://github.com/Vevivo/arns-mesh/releases). Choose a version explicitly marked **Preview** and download `ArNS-Mesh-Browser-Windows-x64-<version>.zip` and `SHA256SUMS.txt`. If no desktop asset is present, the binary is not published yet. GitHub's automatic **Source code** downloads are for developers.
2. Optionally check the downloaded ZIP in PowerShell with `Get-FileHash -Algorithm SHA256 -LiteralPath 'path-to-downloaded.zip'` and compare the entire value with the checksum. A matching checksum checks the download; it is not a publisher signature.
3. Extract **all files** into a new folder. Open `Mesh-Browser.exe` as your ordinary user. Do not run as administrator or disable antivirus protections. If Windows blocks the unsigned build, retain the warning details for the maintainer.
4. Ask your supporter for their connection-profile JSON. Open **Settings → Import connection profile**, choose that file, and wait for the confirmation. No terminal commands are needed.
5. Enter a bare name or `ar://name` in the app's own address bar. Paths, queries and fragments can follow the name. ArNS undernames use their actual registered spelling, such as `undername_name`.

The public package has no operator addresses preloaded. A profile gives the reader initial Mesh peer addresses, numeric-IP Solana RPC sources and optional raw Arweave nodes. It contains no password or wallet key. Use profiles from operators you trust: RPC responses influence live name mappings. A syntactically valid profile does not prove its endpoints are online.

Connection setup now opens automatically on a fresh profile. Imports add sources by default; you can explicitly replace them. Use **Check connections** and **Export profile** in the same panel. [Where to get a profile and what the connection list proves](connections.md).

## Everyday use

The top address bar is the only name-entry field. Right-click it and choose **Paste**, or use Ctrl+V. The same native editing menu works in page text fields. Ctrl+L focuses the address bar. The **Settings** slider icon beside the address bar is the single connection-settings entry.

The row below the address bar reports **Resolve name → Find sources → Locate content → Download → Verify → Open page**. It follows actual request events, not a timed animation. Work can overlap; cached content may skip unused stages. Hover over a step for its state. A failed or stopped stage is not a completed one. **Open page** completes when the main page finishes loading; individual missing dependencies remain visible in Page information.


- Use `+` for another tab, the star for a bookmark, and back/forward/reload/stop for navigation.
- **Page information** separates content verification, name observation, transport and errors. Its network log is an application log, not a complete operating-system packet capture.
- **Save current page** retains a main document or the files enumerated by its manifest. Wait for the save result. A bookmarked address is not a saved website, and a partial save is not a complete offline copy.
- **Saved** access uses retained observations/copies. It is not a claim that the mapping is currently the newest one. **Live** access still needs reachable RPC and content sources.
- External domain-based APIs, embedded videos, fonts and CDNs can be unavailable. The browser does not emulate them or silently fall back to a gateway.

## When something fails

| Message or symptom | What it means / what to do |
|---|---|
| Connection setup needed | Import a working profile. The example profile in the repository is deliberately nonworking. |
| RPC/name observation error | Check the profile's RPC availability with your supporter. A peer being online does not make an RPC online. |
| `content_location_unavailable` | Name resolution succeeded, but the content could not be located and verified through the available sources. Report the failed stage and sanitized diagnostics. Do not assume the name does not exist. |
| Signature/data mismatch | The returned data was rejected. Do not disable verification. |
| Large file unavailable | This preview has a 32 MiB signed-item limit. Streaming large files is not complete. |
| Previously opened page stops working | Its temporary cache may have been evicted, the target changed, or a source disappeared. A bookmark does not preserve content. |

Do not post raw diagnostics publicly: they can contain browsing names, IPs and paths. See [privacy](privacy.md).

## Update, backup and remove

Close the app before an update. Extract the next preview into a **different folder**, keep the old folder for rollback, then start the new executable. There is no automatic update download. Settings and saved data normally live under `%APPDATA%\ArNS-Mesh-Browser`; back up this directory while the app is closed. Do not publish the backup. Schema compatibility with arbitrary older releases is not guaranteed: retain both the matching old executable and its data backup.

To remove the portable app, close it and delete its extracted program folder. This preserves local user data. Delete `%APPDATA%\ArNS-Mesh-Browser` separately only if you intend to erase your profile, bookmarks, history and saved content. No browser extension or native-host registration is installed by this package.

## Prepare before a disruption

Download the program, receive a profile with several reachable independent peers/RPC sources, and save the sites you need beforehand. GitHub and npm are installation sources, not required runtime services. If every reachable source lacks a file, or no usable live name source remains, the app cannot produce the missing information. See [tested scope](status.md).
