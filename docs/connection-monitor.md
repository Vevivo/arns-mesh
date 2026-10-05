# Desktop connection monitor — Mesh 0.5.0

This page describes Mesh 0.5.0.
The strip below the address bar shows Mesh, Solana RPC and raw Arweave separately. Click **Network monitor** to see the source cards, current page origin, session traffic and recent observations. Existing DNS, gateway and renderer restrictions still apply.

- **Responding** means a recent HTTP reply or successful protocol check was observed from this device. It does not prove that a particular site is available. Expand the details to distinguish HTTP replies from validated protocol checks.
- **Requesting** means a request is in progress. **Request failed** means the latest request or check failed; it does not prove a global outage.
- **Not checked**, **No sources** and **Out of date** are distinct from a failed request. Observations expire after 90 seconds.
- Mesh counts are **recently responding endpoints / known endpoints**. They are not worldwide users, independent operators, persistent socket connections or a guarantee of redundancy. Sources learned during this session may be included; the list is bounded.
- In Automatic access, opening the monitor checks only configured numeric-IP sources, at most two concurrently. Checks repeat every 60 seconds while the panel is open; **Check now** refreshes them. Closing the panel cancels its ongoing check. Normal traffic continues to update the strip without adding probes.
- Saved mode disables these probes and live RPC checks. It can still request missing content from Mesh/raw Arweave. Saved mode is not a system-wide network disconnection.

**Current page** names the source used to obtain the verified main document: local stored bytes, Mesh peer, or raw Arweave. Linked resources can take other routes. The name observation is labelled separately; a retained name is not fresh chain state. This screen cannot see whether a remote peer itself consulted an upstream service.

**Session traffic** counts instrumented app HTTP requests and received bytes, excluding connection probes. Received bytes include JSON envelopes, metadata and partial/failed responses; this is not payload throughput. Cancelled competing requests are not counted as source failures. These observations are not an independent packet capture. The desktop remains a reader; it does not serve its saved files to other users.

## Acceptance scope

Source tests cover state expiry, cancellation, bounds, configuration replacement and preservation of the content-origin route. The Windows workflow extracts the actual release ZIP, runs its Electron executable and exercises controlled loopback Mesh/RPC/raw fixtures, independent upstream stops, Saved restart, zero HTTP requests for the complete saved page, direct navigation and topic search. Its screenshots are real app captures with synthetic test content, not public-network or OS-firewall outage evidence. Physical two-PC and independent-host failover tests remain pending.
