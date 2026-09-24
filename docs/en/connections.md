# Connections and supporter discovery

## What the current desktop supports

On first start without connections, **Connect to Mesh** opens automatically. Import a connection profile. The default **Add to my existing connections** combines profiles without erasing previous sources; **Replace my connections** is an explicit choice. The limits remain 16 Mesh peers, 8 RPC sources and 16 raw Arweave nodes.

**Your connections** shows configured service addresses. **Check connections** sends bounded requests to those numeric IPs. Mesh checks are cache-only and do not start indexing or download content. A response confirms only that the endpoint responded with the expected protocol at that moment. It does not authenticate an operator, prove name freshness or guarantee a particular site is available.

**Export profile** creates an endpoint-only JSON. It does not include identity keys, browsing history or saved pages. Export only addresses you are allowed to share. It does not turn the desktop reader into a server or grant permission to use someone else's RPC.

## Where to get the first profile

Ask the operator who invited you. If you do not have one, [request a connection profile from the repository maintainer or a volunteer supporter](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). This is a public coordination channel, not an automated service or guaranteed response. Do not attach private diagnostics.

There is currently no bundled, verified public supporter directory. Until an operator offers a working profile, the public preview cannot resolve live names. The example JSON uses documentation addresses and is not a working network. A supporter needs to offer both usable content access and a permitted numeric-IP Solana RPC source; a Mesh peer does not automatically provide Solana RPC.

## Proposed next step — not implemented

An in-app **Supporters** directory could show an operator's identity, recent response time, supported services and whether access is open or approval is required. Private access would require an authenticated request/approval protocol enforced by the peer, not just a button in the desktop. Reader keys should be separate from wallets.

Initial discovery still needs at least one known reachable IP. To avoid a mandatory central website, signed, expiring announcements would be replicated across multiple independent seed peers. Cached announcements would remain usable with their observation time shown. A single VPS or a single Raspberry Pi would remain a single point of failure.

Before that directory is enabled, its first operators must explicitly offer public service and publish their addresses. Authentication, admission limits, denial/revocation, stale announcements, spoofed identities and seed loss need tests. Current response checks are not substitutes for those features.
