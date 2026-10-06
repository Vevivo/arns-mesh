# Mesh 0.5.1 status

[Türkçe](../tr/durum.md) · [Home](../../README.md)

**0.5.1** is the shared desktop/supporter source version. Download and setup instructions refer to this version.

## Continuous preparation

The deployed 0.5.1 supporter keeps checking new registrations and existing name targets while its source routes are reachable. Name synchronization runs independently of content downloads. It retains observed name records and prepares verified files within configured budgets.

A read-only operator-status observation at **2026-10-06 11:26 UTC** reported **13,274 retained names**, including undernames and retained observations, with name synchronization active. The registry refresh timestamp advanced between successive checks. This is a dated observation of one supporter, not a fixed catalogue size or a count of completely archived sites. Name coverage and file readiness are measured separately. [Preparation, timing and limits](continuous-preparation.md).

## Verified access when upstream routes are blocked

**ArNS content opens without domains/DNS. If the reader loses Solana RPC or raw Arweave access, Mesh can provide accepted name records and verified files through a reachable supporter.** A supporter with working upstream access can continue preparing updates. When those routes are unavailable to both reader and supporter, retained versions remain usable.

The Linux OS-isolation test on 6 October 2026 used a **selected sample of 35 names**. The counts below describe that test snapshot, not the continuously growing catalogue or the system's capacity:

| Check | Result |
|---|---|
| Routes to the configured RPC, raw Arweave, DNS and HTTPS destinations | Unreachable at the OS network layer |
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
