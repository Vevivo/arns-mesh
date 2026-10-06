# Mesh 0.5.1 status

[Türkçe](../tr/durum.md) · [Home](../../README.md)

**0.5.1** is the shared desktop/supporter source version. Download and setup instructions refer to this version.

## Verified access

**ArNS content opens without domains/DNS. When Solana RPC and Arweave are also unavailable, retained name records and files remain usable through Mesh.**

Linux OS-isolation result, 6 October 2026:

| Check | Result |
|---|---|
| External RPC, Arweave, DNS and HTTPS destinations | Unreachable at the OS network layer |
| Initially empty reader | Obtained accepted name records from Mesh |
| 35 real names | 29 main contents opened |
| 22 records marked prepared | All retained file sets verified |
| Successful main contents | Nine distinct files; some names share targets |
| Six names missing required content | Did not open; not counted as successes |

[Full evidence](../validation/upstream-outage-2026-10-06.md). The Windows release workflow also tests the packaged application with real content and OS firewall isolation, and publishes only after acceptance passes.

## Surviving a supporter outage

Readers can discover and use another reachable supporter. That independent machine must already hold the required files and accepted name records. [Preparation guide](resilience.md).

The isolation test uses processes on one physical machine. It is not acceptance of independent providers taking over for each other. Automatic independent replica placement/repair is not implemented.

## Coverage

Not every ArNS name is archived. External APIs/CDNs may remain unavailable despite retained site files. R84 indexes describe content locations; the files must be retained separately. The Raspberry Pi guide targets 64-bit systems; physical Pi acceptance has not been run.

[Use Mesh](user.md) · [Supporter setup](supporter.md) · [Development](developer.md).

## Continuous freshness

[How preparation works and what is tested](continuous-preparation.md).
