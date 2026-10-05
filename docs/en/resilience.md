# Prepare a supporter to survive loss of the original

[Türkçe](../tr/dayaniklilik.md) · [Supporter installation](supporter.md)

The intended result is an already joined reader retrieving prepared content from supporter B when supporter A is unavailable. That requires preparation before the outage.

## What must exist on B?

| Requirement | Why it matters |
|---|---|
| Independent machine and reachable IP/port | A second process on A fails with A |
| Its own peer identity | Cloning A's private identity does not create an independent peer |
| A route already learned by readers | Discovery cannot contact an address the reader never learned |
| Accepted name records for the selected version | A file alone does not tell the reader what an ArNS name means |
| Actual verified files, including needed resources | A location index only points to data |
| Enough disk, memory and upload capacity | Stored copies must also be deliverable |

B joins the **same existing network invitation**, announces its address and mirrors the original signed network list. It can relay the original trusted publisher's signed name records. B's own identity does not automatically become a trusted name publisher.

## Prepare selected names

Use a fresh B installed with the [current guide](supporter.md). Automatic preparation is bounded. To explicitly retain a small set of names, the supported `peer-pins.json` file accepts up to **16** names.

On B only, stop its service. Create this file in B's data directory if it does not already exist. Example:

```json
["vevivo"]
```

Path: `~/.local/share/ArNS-Mesh-Supporter/data/peer-pins.json`. Replace the example with names you actually intend to support. If the file exists, review and edit its list rather than overwriting it. Do not copy another peer's entire data directory.

Start B again:

```bash
systemctl --user start arns-mesh-supporter
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
```

Allow preparation and subsequent status cycles to complete. Check the selected names individually:

- `savedSites.sites`: target ID, status, saved/total files, errors and `scope`.
- `retainedNames`: a count, not proof that your selected name is present.
- `snapshotRelay.records` and the requested snapshot: confirm an original trusted publisher record for the **same content version** is available.
- Content and name budgets: a waiting queue can mean preparation is unfinished.

A `document-saved` result covers its main document. `linked-resources-saved` and `manifest-saved` cover supported traversed files within limits. External APIs and dynamic resources are not automatically archived. Several names may share a target.

The relay is bounded (up to 512 records; small batches per pass). It is not a mirror of all names. If an accepted record for your selected version is missing, B is not ready for no-RPC recovery for that name. An operator can manage additional trusted publishers through the signed network list; do not disable signature checks or copy the authority private key to every supporter.

## Validate without interrupting the working network

Use a separate reader profile and an isolated test environment; do not shut down A or alter production firewalls merely to test B.

1. **Both available:** join the existing network, let the test reader learn B, record A/B identities and the selected name targets. Ensure B is on a different machine/network.
2. **Prove B serves bytes:** use a test source configuration targeting B and verify the selected documents/resources. Inspect B's content-serving counters; a counter alone does not establish complete site coverage.
3. **A unavailable to the test reader:** deny A only in the isolated test environment. The reader should use its learned B route without replacing the user's production profile.
4. **RPC and raw Arweave also unavailable:** restrict those paths for the isolated test reader and, if testing B's independence from upstream retrieval, its test-side supporter environment. Verify dated name records and pre-existing files from B. A warm reader cache must not be the sole source.
5. **Restart the test reader:** repeat to check retained routes and data. Record missing assets and expired/untrusted name observations as failures, not successes.

A cache-only API check demonstrates existing data; it does not prove full operating-system network isolation. Test all resources required for the use case, not just one HTML document.

## Bootstrap and long outages

Already joined readers can retain learned routes. A **fresh installation** still needs a reachable initial address and a valid signed network list. Before an outage, operators should provide invitations/source lists with surviving reachable entry points and manage the authority's renewal/backup lifecycle. Mirrors cannot renew the authority's signature.

If every known entry point is gone before B is learned, a new reachable entry point must be supplied. If all reachable copies lack a file or name binding, the network cannot recreate it from the index alone.

## Current boundary

Automatic address discovery, measured content-source selection and original-signature relay exist. **Automatic independent replica placement/repair, universal site coverage and independent-provider disaster acceptance remain unfinished.**

Run the procedure above for the names and hosts you operate before promising takeover. [Measured evidence](status.md) · [Protocol limits](shared-network.md).
