# Shared supporter network — preview.13

[Türkçe](../tr/paylasilan-ag.md) · [Home](../../README.md) · [VPS / Pi setup](supporter.md)

Preview.13 implements supporter announcements, address exchange and automatic routing to learned peers. The Windows preview.13 package is published as a prerelease; use the pinned current source in the supporter guide for server installation. It does not yet coordinate where independent replicas are placed or repair lost copies.

## What happens when a supporter joins?

1. Install with the existing network's `mesh1.` invitation. The service contacts a known reachable peer; it does not create another network or issue a code to every reader.
2. The service signs an advertisement containing its persistent identity, network ID, numeric IP/port, capabilities and expiry. By default it uses the IP observed by another peer and its listening port. No domain or external IP-discovery service is used.
3. The receiving peer checks the signature, network, expiry, sequence and allowed address. It connects back and asks that endpoint to sign a fresh random challenge. A direct announcement must also match the sender's IP.
4. Peers exchange bounded, individually signed advertisements. A browser already joined to the same network learns, independently probes and retains those addresses without a new code or profile import. Discovery runs on startup and roughly every minute plus processing time. Saved mode pauses it.
5. Requests prefer routes that recently supplied valid content, using observed latency and failures. One source starts first; a second can start after 150 ms. At most two requests run at once. Failures reduce preference, and content identity/signatures are verified before a result is accepted. This is bounded source selection, not a measurement of every peer or its global load.

Both the participating supporters and desktop need preview.13 or later code implementing this protocol. Older peers can still serve their previous operations but cannot exchange these announcements. Old desktop binaries do not upgrade themselves.

## Addresses are not name authority

A learned peer can serve independently verifiable bytes without permission to change an ArNS name. The signed operator source list still controls trusted name/catalogue publishers. Discovery neither modifies that list nor adds publisher trust.

Supporters also retain and relay original trusted publishers' signed name observations, including prepared-version observations, without resigning them. The reader checks the original signature and its own trusted publisher list. A newly discovered mirror therefore need not become a new name authority. Up to four known names are visited per minute/pass, two upstream routes per record, with at most 512 records and 1 MiB of relay storage. This is bounded, partial preparation; inspect `snapshotRelay` before assuming a particular name is retained.

Useful outage access still needs **the dated name binding and the actual corresponding files**. Address exchange, a catalogue or a signed list alone does not copy a website. Existing bounded content preparation remains separate. Automatic replica placement, repair and guarantees of two independent copies are future work.

## Configuration and reachability

- Default `MESH_ADVERTISE=auto`: announce the observed public IP with the listener's port.
- Set `MESH_ADVERTISE=YOUR_PUBLIC_IP:PORT` when the externally reachable port differs. IPv6 uses `[ADDRESS]:PORT`. This does not configure the router or firewall.
- Set `MESH_ADVERTISE=off` to stop announcing; the peer can still learn routes and respond to configured readers.
- A public invitation accepts public numeric addresses. Explicit local test invitations additionally allow loopback; discovery never scans private LANs or cloud metadata addresses.
- A Pi behind NAT needs a working inbound route. There is no automatic NAT traversal, relay or CGNAT bypass. Codespaces domain port forwarding is not a public numeric-IP supporter endpoint.

Use the [supporter guide](supporter.md). `operator.mjs` and `operator-status.json` show learned addresses, the advertised endpoint, recent accepted announcements and retained relay records. These are local observations, not an online-user census or verified storage capacity. Desktop Settings shows learned routes; the connection monitor reports observed endpoints.

## Bounds and failure cases

| Mechanism | Bound / meaning |
|---|---|
| Learned directory | 32 peers per network; 4 identities per IP; one identity per endpoint |
| Advertisements | 24-hour lifetime; renewal after roughly 12 hours; at most 16 in a reply |
| Exchange pass | Two destinations, at most four new records checked, 15-second deadline |
| Reachability challenges | At most two active and eight new probes per minute |
| Content routes | At most two concurrent requests; observed failures receive 2–60 second preference penalties |
| Persistence | Valid signed addresses survive restart; network changes clear the previous network's directory |

These quotas limit work; they do not prove honest operators or prevent a well-resourced Sybil attack. Expired routes are removed. If all initially known routes are dead before alternatives were learned, the client still needs a new reachable starting address. Internet/IP connectivity is required.

Network-list authority and expiry rules remain unchanged: mirrors cannot renew a signature. Existing joined clients may keep accepted state and use historical recovery, but a fresh install cannot join using an expired authority list. A Connected ZIP can include an invitation; standard public ZIPs still require initial setup.

## Evidence and remaining acceptance

The source tests start an already joined reader, introduce a later supporter, verify automatic learning without modifying its configured profile, stop the seed and retrieve real signed test bytes from the survivor. A separate-process test uses distinct data directories and network transfers. Restart persistence, invalid/expired/forged/rollback advertisements, private-target rejection, endpoint identity checks, original name-signature relay and fast invalid content are covered.

These are controlled same-host tests. They do not prove independent-provider resilience, home NAT reachability, Pi performance or global fastest-peer selection. Test those with prepared replicas on separate networks before advertising disaster readiness. See [current checks and artifacts](status.md).
