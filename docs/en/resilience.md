# Check independent access through a supporter

[Türkçe](../tr/dayaniklilik.md) · [Complete supporter installation](supporter.md)

The goal is for readers to keep using the same network when its first server is unavailable. **Mesh 0.6.0 separates discovery, live preparation and retained-content readiness**, so a running service is not confused with a complete content replica.

## When the first server is already unavailable

A new developer can run the [standard setup](supporter.md) without contacting the original operator. The bundled community definition is signed by the same network authority as the existing public code. Other networks use a self-contained signed invitation. The developer supplies their own reachable numeric IP; Mesh discovers and advertises that supporter through the signed network's numeric-IP rendezvous paths.

Readers need 0.6.0 for this independent discovery. Existing 0.5.1 installations only have their older seed/learned-route behavior until upgraded. The original code and the new durable invitation identify the same community network; there is no separate developer network for users to join.

While independent RPC and content sources remain reachable, the new supporter observes current names and prepares verified files. Loss of the first server does not turn those healthy paths off. If all upstream paths are also unavailable, the new supporter must obtain accepted name records and files from another surviving Mesh copy. It cannot reconstruct information that no reachable source holds.

Discovery is about finding an address, not granting that address permission to redefine an ArNS name. Original signatures are preserved when records are relayed. A newly discovered supporter does not become a trusted name publisher.

## What the standard installation prepares

Both capacity profiles enable continuous name updates, broad target scanning, signed-record replication and automatic file preparation. R84 installation is included. The supporter uses its own identity and its own storage; the original server's private data directory is never cloned.

| Layer | Required result |
|---|---|
| Discovery | A reader can find the supporter without contacting the original server |
| Names | A live independently checked binding, or an accepted retained observation for the requested content version |
| Content | Actual verified files are served by the supporter, not merely location hints |
| Retained-site coverage | The root and supported manifest/static resources have all been retained within limits |
| Capacity | Disk and daily budgets leave preparation able to progress |
| Independence | A separate reader succeeds with the original server excluded |

Names update independently of content-download budgets. Replication has its own daily allowance: **8 GiB for VPS, 2 GiB for Pi**, in addition to the ordinary content-preparation and R84 updater budgets. A full disk or exhausted allowance is reported as unfinished preparation; increasing a number alone does not create copies.

## 1. Inspect local preparation

```bash
MESH_ROOT="$HOME/.local/share/ArNS-Mesh-Supporter"
node scripts/check-supporter.mjs --data "$MESH_ROOT/data" --json
```

The local report exposes accepted names, stored roots, complete prepared file sets, replication, index state, trust and advertised reachability. It always requests a separate reader check; running that check does not write an external certification into the local report. Exit code **2** means preparation or validation is incomplete; it is not a certificate that installation failed.

To prioritize selected names, stop this supporter, edit its existing `data/peer-pins.json` without overwriting other entries, and start it again. The file accepts up to 16 explicit names:

```json
["vevivo"]
```

Automatic preparation continues beyond these priority names. Do not copy another supporter's private identity.

## 2. Check retained content from another machine

Use the same reviewed source release and dependencies on a separate checking machine. Substitute the real numeric endpoints. The community code can be read from the signed bundled definition; use your explicit invitation for a different network.

```bash
MESH_CODE="$(node scripts/community-network.mjs)"
node scripts/check-supporter.mjs \
  --peer SECOND_SUPPORTER_IP:49741 \
  --code "$MESH_CODE" \
  --name vevivo \
  --exclude ORIGINAL_SUPPORTER_IP:49740 \
  --json
unset MESH_CODE
```

Repeat `--name` for up to 32 names you actually intend to serve. This check contacts **only the selected supporter**, asks for retained bytes only, validates accepted signed name records and verifies the root plus supported manifest/static file graph. It does not use RPC, raw Arweave, DHT or a warm reader disk cache. It does not ask the supporter to fetch missing files from the original server.

Exit **0** means the stated names passed from that checking machine. Exit **2** includes missing bindings, files, signature/network failures or limits. Keep the result with its time, target IDs and names. A pass covers those resources, not every ArNS site or an application's external APIs.

## 3. Check discovery and normal browsing separately

The explicit-endpoint check proves serving, not automatic discovery. Use a fresh **0.6.0 reader profile** in an isolated environment:

1. Exclude the original server from that environment; leave the working production server running.
2. Join using the same supported community code, with no manually entered B endpoint.
3. Confirm the reader learns B and opens the selected names through it.
4. Restart the test reader and repeat.
5. If claiming retained access during an RPC/Arweave-path outage too, block those paths in the isolated reader/supporter test environment and repeat with prepared files. Record every missing resource.

API cache-only testing is useful evidence, but is not an operating-system firewall test. Two processes on one host test protocol behavior; a separate machine/provider is still needed to establish real host-failure independence.

## Keep coverage current

Leave collection and index refresh running while sources are healthy. Inspect the age of retained observations, preparation errors, budget waits and storage headroom. When a target changes, keep the last complete version until the new supported file set is verified.

R84 records are content locations, not retained website counts. A document may cover one main file; a manifest/static-resource set covers the supported discovered files. Dynamic external APIs are separate dependencies.

If every discovery route and every known address is unavailable, another reachable entry point is needed. If no reachable copy has a required file or accepted name binding, retained access for that content is pending. These are explicit readiness states, not reasons to stop preparing and sharing what is available.

[Status and evidence](status.md) · [Network discovery](shared-network.md)
