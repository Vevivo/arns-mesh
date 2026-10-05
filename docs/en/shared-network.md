# Shared supporter network — agreed design, not implemented

[Türkçe](../tr/paylasilan-ag.md) · [Home](../../README.md) · [Install the current supporter](supporter.md)

The product direction is simple: readers download and browse; volunteers install a supporter; usable peers and content copies are shared automatically. The initial project owner should not be the only source or the only directory that must stay online. This page specifies work to build, not commands or buttons already present.

## The intended experience

| Reader | Supporter |
|---|---|
| Download a browser with initial network settings included | Install the headless service on a VPS or reachable Pi |
| Open an ArNS name without entering a connection code | Choose storage and traffic budgets |
| Let Mesh learn alternatives and select a useful responsive source | Have the service announce its reachable address and available data |
| Continue through another source when one fails | Help retain files, name observations and location records |

No payment, license or wallet is required. Desktop serving is a separate future opt-in feature; browsing alone does not authorize background sharing.

## How a late supporter becomes reachable

1. The new service contacts a reachable initial peer from its configuration. No first contact is possible if every known route is dead.
2. It proves control of a persistent peer identity and announces its address, protocol capabilities and bounded availability information. A signature identifies the announcer; it does not establish name correctness, honest capacity or independence.
3. Existing peers validate syntax, destination policy, reachability, signature and freshness, then share a bounded record with other peers. Rate limits, expiry, replay protection and restrictions on private/local destinations are required.
4. Browsers periodically learn and retain alternative addresses. They need neither a new download nor a code whenever a supporter joins.
5. For a requested content ID, the reader tries sources likely to have the bytes. Selection uses observed valid responses and delivery performance, with bounded concurrency/timeouts and failure backoff. A quick invalid reply must never win.

New peers may supply independently verifiable content. Accepting an ArNS name-to-content assertion or search catalogue requires a separate trust policy; automatic discovery must not grant that authority. How membership and trusted publishers evolve beyond the present single-authority list is still an implementation decision.

## Share the storage work before the outage

Each participating supporter needs its own identity and chosen quotas. Preserve dated name bindings and the exact content version they describe. Actual HTML, manifest entries and supported assets must be copied and verified; index hints alone cannot serve a missing file.

The initial target is at least two usable copies of selected sites on independent hosts. That is a placement goal, not a durability guarantee. Count verified copies rather than self-reported disk size, and distinguish machines under one provider/operator from independent failure domains. The automatic placement/repair scheduler is not built yet.

Do not copy every site to every machine or promise a full Arweave/CDB64 mirror. Distribute selected content within budgets; check copies periodically and replace lost replicas. Retain the previous complete version while a name update is still being prepared. A fresh update that was never observed or copied cannot be recovered from nowhere.

## When RPC and raw Arweave are both unavailable

A reader needs an accepted dated name binding, its content bytes and a reachable route to those bytes. These may be local or on surviving supporters. It must show the observation date and historical status rather than claim latest chain state. The current candidate implements bounded historical access; automatic independent replica placement is separate work.

If the initial provider stops, other peers must already hold both useful data and the information needed to find one another. A freshly installed reader still needs one usable bootstrap route. Internet connectivity is assumed; this design does not create connectivity for isolated devices.

## What must change from today's implementation?

| Today | Required work |
|---|---|
| Standard ZIP has no invitation; Connected packaging is available | A deliberately prepared default connected distribution with several independent starting peers |
| Operator signs a source list; peers can mirror it | Automatic bounded supporter announcement and peer exchange |
| Configured sources and limited retries | Measured per-content source selection, failure switching and load-aware scheduling |
| Bounded caches and candidate site preparation | Automatic placement, availability checks and repair across independent supporters |
| Recovery trusts configured publisher identities | Separate admission, content verification and name/publisher trust rules |
| List defaults to 14 days; only authority renews it | Recovery/bootstrap policy for prolonged authority loss, fresh installs, key rotation and compromised records |
| Explicit IP listeners; no direct-mode relay/NAT traversal | Honest reachability detection and a bounded connectivity solution for eligible home supporters |

Mirrors cannot extend an authority signature's expiry. Keeping an old address does not by itself authorize a new expired-list join. These dependencies must be addressed and tested, not hidden behind an automatic-join label.

## Acceptance before announcing this as available

- A reader already in use discovers a later supporter without a new code or manual profile edit.
- The initial operator is stopped; independent survivors still distribute useful addresses and serve previously replicated sites.
- RPC and raw Arweave are separately blocked, then both are blocked; an empty reader with a valid starting configuration obtains the correct retained version from surviving supporters.
- Invalid bytes, conflicting/stale name assertions, forged announcements, rollback and address flooding are rejected or bounded.
- Storage/upload limits hold under measured load; actual replication completeness and lost copies are visible.
- Windows reader and real Pi/VPS connectivity are tested from different networks, including the relevant NAT restrictions.

None of these complete shared-network acceptance conditions has passed yet. Current candidate/release evidence is recorded separately in [status](status.md).
