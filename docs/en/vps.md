# Prepare a VPS

[Türkçe](../tr/vps.md) · [Supporter installation](supporter.md)

Use a Linux VPS with a public numeric address, persistent disk and an ordinary account with SSH access. Debian/Ubuntu with systemd is the path used by these instructions. A new VM on an independent provider gives better failure separation than another process on the original host.

## Capacity

There is no measured universal hardware minimum. Plan separately for:

- The OS and a supported Node.js runtime.
- The supporter's content budget, name records, logs and network traffic.
- The included R84 index: reserve at least **50 GiB free on an SSD** for the documented initial index and refresh headroom, in addition to content storage. Publisher sizes can change.
- Available memory for the service and updater. Default service caps are not sizing recommendations.

Check space, memory and transfer allowances before choosing a plan. Do not put a second service into an existing busy host without assessing its other workloads.

## Prepare the new host

Connect using the provider's SSH instructions and use an ordinary account. For Debian/Ubuntu, an administrator can install the small prerequisites:

```bash
sudo apt-get update
sudo apt-get install --no-install-recommends git curl ca-certificates xz-utils
```

Install a maintained Node.js 24 LTS build with npm, or follow the [versioned, user-local Node setup](node-setup.md). Check:

```bash
uname -m
node --version
npm --version
git --version
```

The Node archive must match the host: `x86_64` uses Linux x64, `aarch64` uses Linux ARM64.

## Make the peer reachable

Choose the unused TCP port **49741** for the new supporter. Allow it through both the provider's firewall and the host's existing firewall policy. Preserve SSH access. No blanket firewall disable, domain registration or web proxy is needed.

Check from a different network after the service is installed. A successful local probe alone does not establish outside access.

**Continue with [supporter installation](supporter.md).** The standard setup includes [R84 indexes](../shared-index.md), signed-record replication and file preparation. Then complete [independent serving checks](resilience.md).
