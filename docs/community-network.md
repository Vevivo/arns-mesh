# Join the public community network

Use **Mesh 0.6.0**. The public community definition is included in this release and is signed by the same authority as the existing Vevivo ArNS Mesh code. It contains public addresses and public verification keys, never a private signing key.

## Readers

Paste this reusable code into **Settings → Mesh connection code → Check code → Join this network**:

```text
mesh1.eyJ2ZXJzaW9uIjoxLCJrZXkiOiJsZW5XUDRrM0xNMWtFQTVZZ0JnczdBUUthUDByTU1icy1DWTB2YnRoZUhnIiwic2VlZHMiOlsiMTk0LjE2My4xNjkuMTM6NDk3NDAiXSwibG9jYWwiOmZhbHNlfQ.450ee05ccbc0
```

Existing joined installations keep their settings after upgrading. Version 0.6.0 verifies the bundled durable definition against the key in this code, so the original starting server is not needed to establish this network's identity. Older desktop versions need updating to use independent rendezvous.

## Supporters

Follow the [complete VPS/Pi setup](en/supporter.md). The setup selects the bundled community definition by default. Another developer does not need personal permission from the original operator, a new private key from them, or a new code for existing readers. Every supporter creates its own identity and announces its own reachable address.

## When the starting server is absent

The signed definition supplies the network identity, accepted name publishers, initial source settings and numeric-IP rendezvous bootstrap addresses. Supporters and readers meet under that network identity and verify advertised HTTP endpoints. A new supporter can therefore join after the original server becomes unreachable, and a fresh reader can discover it.

Rendezvous supplies addresses. It does not authorize a new peer to change names or create missing website data. Live name reads retain the existing RPC checks; copies of accepted historical name records retain the original publisher's signature. Preparation obtains files from healthy upstream sources or surviving Mesh copies and verifies them.

At least one usable discovery route and a source carrying the requested information must exist. Internet/IP connectivity is required. The initial three independent rendezvous addresses come from the pinned HyperDHT library; readers use their numeric addresses without DNS. Network discovery uses UDP and shares the network identity and endpoint information, not ArNS search words or page contents.

[Connection mechanism](en/network-code.md) · [Supporter checks](en/resilience.md) · [Türkçe kurulum](tr/destekci.md)
