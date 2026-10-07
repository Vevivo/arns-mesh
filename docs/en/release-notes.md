# ArNS Mesh 0.6.0

A new supporter can join the same network and be discovered after the original starting server is unavailable. The release preserves existing ArNS access, English topic search, R84 location lookup and content signature checks.

## What changes

- Public, authority-signed durable network definitions support joining without contacting the original server or obtaining its private key. Existing community codes are matched to the bundled definition using the same signing identity.
- Independent numeric-IP rendezvous locates later supporters. Readers verify the announced endpoint before using it; discovering an address does not grant it permission to redefine names.
- Supporters copy original accepted name records in bounded pages, with capacity for 40,000 envelopes and 64 MiB. A separate preparation worker retains their verified files and prepared versions.
- One supporter setup includes capacity selection, continuous name/content preparation, R84 installation, a persistent service and readiness checks.

## Use it

Update the desktop and supporters to **0.6.0**. Existing community connection settings carry over; another user's separate Mesh network remains a separate trust choice. The public community definition is also available to fresh installations when the original starting server cannot respond.

[Windows guide](https://github.com/Vevivo/arns-mesh/blob/v0.6.0/docs/en/user.md) · [Supporter setup](https://github.com/Vevivo/arns-mesh/blob/v0.6.0/docs/en/supporter.md) · [Community connection](https://github.com/Vevivo/arns-mesh/blob/v0.6.0/docs/community-network.md)

## Verification

The release workflow runs Linux and Windows source tests, builds the Windows application, checks topic search and opens real public content under OS firewall isolation. New continuity, rendezvous, bulk replication and supporter checks cover the original server being absent.

## Scope

A usable network route and a source holding the requested information remain necessary. A new server can prepare from healthy upstream sources or surviving Mesh copies. It cannot reconstruct a never-retained file while every source carrying it is unreachable. Prepared site files do not make external APIs available. Readiness reports describe their checked names and file sets rather than universal coverage.

The Windows build is unsigned. Physical Raspberry Pi and complete ArDrive application compatibility are not certified.
