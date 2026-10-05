# Read-only supporter inspection — 6 October 2026

The final status sample was recorded at **2026-10-05T21:25:35.840Z**, which is **6 October 2026, 00:25 in Europe/Istanbul**. This is a historical observation, not a live dashboard.

The operator requested inspection without service changes. The check read service/status information and made bounded public Mesh queries. No runtime code, configuration, budgets, firewall rules, installed indexes or server service state were changed by the inspection. Normal request counters and the service's own background work continued.

## Status reported by the reference supporter

| Field | Value |
|---|---:|
| Main supporter | Active/running |
| Installed shared-index bands | 3 of 5 offered |
| Usable shared-index entries | 70,909,101 |
| Installed shared-index bytes | 9,649,222,282 |
| Retained name observations | 13,220 |
| Cached content objects | 1,322 |
| Prepared site records | 32 |
| Ready within recorded scope | 22 |
| Incomplete prepared records | 10 |
| Queued content jobs | 32,981 |
| Learned additional supporters | 0 |

The 22 ready records comprised five document-only and 17 linked-resource records in the earlier detailed sample. These are not 22 distinct fully archived applications; multiple names shared targets.

The installed bands contained 379,125, 14,667,924 and 55,862,052 entries. Two larger bands remained incomplete. Index-refresh logs included `index_http_402` and `index_http_504`; the updater had resumed but completion was not established.

Content preparation reported its 448 MiB daily accounted response budget exhausted. Name preparation had a separate 192 MiB budget and was not exhausted; the retained record count rose from 13,151 to 13,220 during the inspection. Raw discovery also reported its own daily budget reached. These are task budgets, not disk capacity or total machine traffic limits.

## Direct Windows-to-supporter check

The checks ran from a Windows computer outside the supporter host. Requests targeted the supporter's numeric-IP Mesh endpoint, with no gateway-domain page request. Location and content requests used `cacheOnly: true`; no new upstream content fetch was requested by those checks.

The reader verified the response envelope against its existing trusted peer ID/public key, then checked each original ANS-104 content ID and signature.

| Name | Verified payload | Result |
|---|---:|---|
| `iainball` | 3,761 bytes, manifest | Retained name, signed location and verified content obtained |
| `toon_boughtviatoonnode` | 34,268 bytes, HTML | Retained name, signed location and verified content obtained |
| `ardrive-logo-2026` | 30,202 bytes, PNG | Retained name, signed location and verified content obtained |

The third name's retained observation was now present. The content IDs and sizes matched the examples in the [original rollout](index-sharing-2026-10-05.md).

## Limits of this evidence

The check verified three existing **root objects**. It did not render complete sites, traverse every asset, disable RPC/raw access at OS level, stop the original provider, test a second independent supporter, or exercise Raspberry Pi hardware. Valid historical name signatures do not prove the latest registry mapping.

Endpoints, access credentials, private paths and raw operational logs are intentionally omitted.
