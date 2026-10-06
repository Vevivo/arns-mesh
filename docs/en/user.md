# Use Mesh on Windows

[Türkçe](../tr/kullanici.md) · [Home](../../README.md)

You only need the Windows application and a working connection invitation. You do not need a VPS, wallet, Node.js or the large server index.

## 1. Download

Use the **[0.5.1 Windows x64 application ZIP](https://github.com/Vevivo/arns-mesh/releases/download/v0.5.1/ArNS-Mesh-Browser-Windows-x64-0.5.1.zip)**. GitHub's **Source code** archives are for developers.

Extract the entire ZIP into a folder you want to keep. Open `Mesh-Browser.exe` inside it. Keep the other files beside the EXE; create a shortcut if you want a desktop icon.

This is an unsigned community build. If Windows blocks it, check the [release and checksum](https://github.com/Vevivo/arns-mesh/releases/tag/v0.5.1) and report the warning. Do not disable security tools to bypass it.

## 2. Connect once

Obtain the complete code beginning `mesh1.` from a trusted network operator.

**Settings → Mesh connection code → Check code → Join this network**

Review the network shown before joining. The code is a reusable invitation, not a password or paid licence. [Request connection help](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml) if you do not have one; availability depends on volunteer operators.

An existing configured installation reuses its settings. A separately supplied Connected package can include an invitation; the standard public ZIP above does not. A legacy connection file can be imported under **Settings → Already have a connection file?**.

## 3. Open an ArNS website

Type `ar://vevivo`, or another ArNS name you want to visit, into the **top address bar**. The example is not an availability guarantee.

For an undername, use its full registered spelling, such as `undername_name`. Use the middle Home search box for a topic such as music, games or storage. Click a result to open its ArNS address, or a topic label to search that topic. [Search guide](../topic-search.md).

Mesh resolves the name, finds the files, verifies them and opens the page. **Page information** explains missing resources and whether a dated name record was used. Domain-based external APIs and CDNs may remain unavailable.

## Storage on your computer

The large shared index and supporter archives belong on the **server**. You do not download them to browse, and the browser does not automatically serve your disk to other users.

However, 0.5.1 stores application settings, browsing state, name records and a bounded content cache in `%APPDATA%\ArNS-Mesh-Browser`. **Save current page** stores additional supported files. Avoid that action if you do not want intentional saved page copies; ordinary caching still happens.

There is currently no supported zero-persistent-storage mode. Moving archive work to supporters does not make the existing browser diskless.

## What happens during a disruption?

In **Automatic** mode, Mesh uses available live sources and can recover using accepted dated information. If RPC and raw Arweave are unavailable, the required name record and files must already be available locally or on a reachable supporter.

**Saved** mode is not an operating-system network-off switch: missing files may still be requested. A bookmark remembers an address; it does not save a site.

Later reachable supporters can be learned automatically after joining. That does not guarantee every site has another copy. [How supporter failover is prepared](resilience.md).

## When something does not open

| What you see | What to check |
|---|---|
| Connection setup on first launch | Enter a real operator invitation |
| Responding Mesh source, but no page | A response does not prove the requested files exist |
| Name resolved, location missing | The target is known but its storage location is not |
| Some images or features missing | Inspect Page information for missing files or external dependencies |
| Increasing request count | It counts HTTP requests, including unsuccessful ones |
| “In progress 0” | No measured HTTP request is running at that instant |
| A second PC does not increase Mesh count | Desktop installations are readers, not supporter servers |

**Why do two computers show different traffic?** The HTTP counters belong to each application session. Different browsing, time open, cached files and retries produce different totals even when both readers use the same supporter. The count includes measured Mesh, RPC and raw Arweave traffic, not only transfers from one server. Connection probes are excluded. Received bytes are not a measure of disk storage.

The current signed-item size limit is 32 MiB. [Monitor details](../connection-monitor.md).

## Update the application

Close Mesh. Extract the new application ZIP into a separate folder and run it. Existing AppData settings normally carry over. Keep a private backup if you need to preserve bookmarks or saved data. There is no automatic application updater.

Deleting the program folder does not delete AppData. Do not erase AppData while Mesh is running. [Privacy](privacy.md) · [Report a problem](../../CONTRIBUTING.md).

The search catalogue is prepared on supporters. This device retains at most two bounded catalogues (approximately 32 MiB maximum combined) so searches can continue during an outage. Search words are not sent to the provider.
