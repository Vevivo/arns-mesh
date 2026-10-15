# Connections and supporter discovery

Use a [connection code and managed network list](network-code.md) for easier setup. This page documents the still-supported JSON format used by operators and older clients.

## What the current desktop supports

On first start without connections, **Connect to Mesh** opens automatically. Import a connection profile. The default **Add to my existing connections** combines profiles without erasing previous sources; **Replace my connections** is an explicit choice. The limits remain 16 Mesh peers, 8 RPC sources and 16 raw Arweave nodes.

**Your connections** shows configured service addresses. **Check connections** sends bounded requests to those numeric IPs. Mesh checks are cache-only and do not start indexing or download content. A response confirms only that the endpoint responded with the expected protocol at that moment. It does not authenticate an operator, prove name freshness or guarantee a particular site is available.

**Export profile** creates connection JSON, including the accepted name-witness policy when configured. It does not include private identity keys, browsing history or saved pages. Export only addresses you are allowed to share. It does not turn the desktop reader into a server or grant permission to use someone else's RPC.

## Where to get the first profile

Use the [published community connection](../community-network.md), or obtain a profile from the operator who invited you. For another network, you can [request a connection profile from the repository maintainer or a volunteer supporter](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). This is a public coordination channel, not an automated service or guaranteed response. Do not attach private diagnostics.

The community code supplies the current network's signed connection definition. The example JSON below instead uses documentation addresses and is not a working network. A Mesh peer does not automatically provide Solana RPC. Protected profiles may obtain certified name observations through Mesh; ordinary profiles still require a permitted numeric-IP RPC source for live name observations.

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

An ordinary profile needs at least one RPC and at least one Mesh **or** raw Arweave source. A protected profile with an accepted name-witness policy and Mesh peers may omit reader RPC addresses; enrolled signers still need their reviewed observation sources. A replication-only source set can omit raw nodes, but raw content discovery requires working raw sources. Limits: 16 Mesh, 8 RPC, 16 raw addresses and an 8 KiB profile file. IPv4 `IP:port` and bracketed IPv6 `[address]:port` are accepted; domain names, URLs, paths, passwords and API-key parameters are not. Syntax acceptance does not demonstrate an end-to-end IPv6 deployment.

Do not replace a provider's hostname with an arbitrary IP and assume its TLS/API-key service will work. Ask for an endpoint compatible with this transport. Do not put the Mesh port in all three fields: the three roles require their respective services. When publishing a reader profile, use externally reachable destinations, not `0.0.0.0` or `127.0.0.1`; a LAN address is appropriate only for users able to reach that LAN.

A profile carries connection settings and, when configured, a pinned witness policy. It is not an access token or saved website. Authenticate the policy through the network's agreed process; downloading a file alone does not authenticate its operator. Recipients still need network access and permission/capacity at the listed services. It does not bypass firewalls or implement access approval.

## The operator's two profiles

| File in these guides | Whose connections does it configure? | Mesh addresses to include |
|---|---|---|
| `mesh-upstream.json` | The new supporter server | Existing useful source peers from which it can acquire records/content |
| `mesh-connect.json` | Readers, or other supporters that want to use the new server | The new supporter's reachable public endpoint, optionally other independent sources |

Both use the **same schema**; their filenames do not change program behavior. Copying the upstream profile unchanged does not add the new peer. Pointing an empty node only to itself supplies no data. Use the [supporter guide](supporter-advanced.md#5-give-users-a-profile) to generate and test the reader file. Users import it via the desktop; supporters apply their upstream file during installation or explicitly with `scripts/profile.mjs apply` while the peer is stopped.

Keep a copy of profiles you rely on before a disruption. Standalone JSON profiles need an explicit update when their routes change; [managed connection codes](network-code.md) can learn authenticated updates and discover other supporters. **Add** preserves existing endpoints; use **Replace** deliberately when removing old ones. Protected policy replacement is separately restricted. Several addresses provide useful redundancy only when they are independently reachable and hold useful data.

## Operator directory — not implemented

An in-app **Supporters** directory could show an operator's identity, recent response time, supported services and whether access is open or approval is required. Private access would require an authenticated request/approval protocol enforced by the peer, not just a button in the desktop. Reader keys should be separate from wallets.

Managed connection codes and signed supporter discovery already provide routes to other peers; see [network codes](network-code.md). That discovery mechanism is separate from the proposed operator directory and access-approval interface. A responding peer does not, on its own, establish operator independence or site readiness.

Before that directory is enabled, its first operators must explicitly offer public service and publish their addresses. Authentication, admission limits, denial/revocation, stale announcements, spoofed identities and seed loss need tests. Current response checks are not substitutes for those features.
