# Connections and supporter discovery

For preview.8, use a [connection code and managed network list](network-code.md) for easier setup. This page documents the still-supported JSON format used by operators and older clients.

## What the current desktop supports

On first start without connections, **Connect to Mesh** opens automatically. Import a connection profile. The default **Add to my existing connections** combines profiles without erasing previous sources; **Replace my connections** is an explicit choice. The limits remain 16 Mesh peers, 8 RPC sources and 16 raw Arweave nodes.

**Your connections** shows configured service addresses. **Check connections** sends bounded requests to those numeric IPs. Mesh checks are cache-only and do not start indexing or download content. A response confirms only that the endpoint responded with the expected protocol at that moment. It does not authenticate an operator, prove name freshness or guarantee a particular site is available.

**Export profile** creates an endpoint-only JSON. It does not include identity keys, browsing history or saved pages. Export only addresses you are allowed to share. It does not turn the desktop reader into a server or grant permission to use someone else's RPC.

## Where to get the first profile

Ask the operator who invited you. If you do not have one, [request a connection profile from the repository maintainer or a volunteer supporter](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). This is a public coordination channel, not an automated service or guaranteed response. Do not attach private diagnostics.

There is currently no bundled, verified public supporter directory. Until an operator offers a working profile, the public preview cannot resolve live names. The example JSON uses documentation addresses and is not a working network. A supporter needs to offer both usable content access and a permitted numeric-IP Solana RPC source; a Mesh peer does not automatically provide Solana RPC.

## What goes in the file

The filename is flexible; these guides use `mesh-connect.json` for the file a reader receives. The JSON below shows the actual format, but **all addresses are nonworking documentation examples**:

```json
{
  "schema": "arns-mesh-network-profile/v1",
  "directPeers": ["192.0.2.20:49741"],
  "rpcSources": ["198.51.100.20:8899"],
  "arweavePeers": ["203.0.113.30:1984"]
}
```

| Field | Service and where the operator gets its address |
|---|---|
| `directPeers` | Mesh supporter HTTP service. For your own VPS, take its public numeric IP from the provider network panel and the port from the peer listener configuration (installer default: TCP 49741). For another operator, ask them for the address and access conditions. |
| `rpcSources` | Compatible Solana JSON-RPC over numeric-IP HTTP, used for live ArNS/ANT observations. Obtain a permitted endpoint from its operator or run/manage that service separately. Installing this Mesh peer does not create an RPC. |
| `arweavePeers` | Optional true raw Arweave HTTP services for metadata/chunks and location discovery. Obtain numeric IP and port from a node operator; 1984 here is only an example. Mesh and raw-node APIs are different. |

The profile needs at least one RPC and at least one Mesh **or** raw Arweave source. A replication-only source set can omit raw nodes, but the raw discovery demonstrated in preview.7 requires working raw sources. Limits: 16 Mesh, 8 RPC, 16 raw addresses and an 8 KiB profile file. IPv4 `IP:port` and bracketed IPv6 `[address]:port` are accepted; domain names, URLs, paths, passwords and API-key parameters are not. Syntax acceptance does not demonstrate an end-to-end IPv6 deployment.

Do not replace a provider's hostname with an arbitrary IP and assume its TLS/API-key service will work. Ask for an endpoint compatible with this transport. Do not put the Mesh port in all three fields: the three roles require their respective services. When publishing a reader profile, use externally reachable destinations, not `0.0.0.0` or `127.0.0.1`; a LAN address is appropriate only for users able to reach that LAN.

A profile carries addresses, not a server identity certificate, access token or saved website. Recipients still need actual network access and permission/capacity at the listed services. It does not bypass firewalls or implement access approval.

## The operator's two profiles

| File in these guides | Whose connections does it configure? | Mesh addresses to include |
|---|---|---|
| `mesh-upstream.json` | The new supporter server | Existing useful source peers from which it can acquire records/content |
| `mesh-connect.json` | Readers, or other supporters that want to use the new server | The new supporter's reachable public endpoint, optionally other independent sources |

Both use the **same schema**; their filenames do not change program behavior. Copying the upstream profile unchanged does not add the new peer. Pointing an empty node only to itself supplies no data. Use the [supporter guide](supporter.md#5-give-users-a-profile) to generate and test the reader file. Users import it via the desktop; supporters apply their upstream file during installation or explicitly with `scripts/profile.mjs apply` while the peer is stopped.

Keep a copy of profiles you rely on before a disruption. If an IP, port or service permission changes, the operator must provide an updated file and readers must import it. **Add** preserves existing endpoints; use **Replace** deliberately when removing old ones. A list of several addresses is only useful redundancy when they are independent, reachable and hold useful data; not every background RPC operation currently fails over.

## Proposed next step — not implemented

An in-app **Supporters** directory could show an operator's identity, recent response time, supported services and whether access is open or approval is required. Private access would require an authenticated request/approval protocol enforced by the peer, not just a button in the desktop. Reader keys should be separate from wallets.

Initial discovery still needs at least one known reachable IP. To avoid a mandatory central website, signed, expiring announcements would be replicated across multiple independent seed peers. Cached announcements would remain usable with their observation time shown. A single VPS or a single Raspberry Pi would remain a single point of failure.

Before that directory is enabled, its first operators must explicitly offer public service and publish their addresses. Authentication, admission limits, denial/revocation, stale announcements, spoofed identities and seed loss need tests. Current response checks are not substitutes for those features.
