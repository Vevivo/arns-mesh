# Help Mesh with a VPS or Raspberry Pi

[Türkçe](../tr/destekci.md) · [Home](../../README.md) · [Network design](shared-network.md)

A supporter stores useful data and answers other devices' requests. You do not need to develop software. Run the Linux service on your server/Pi; use the Windows browser separately if you also want to browse.

**This guide installs the tested preview.12 source candidate.** It includes bounded site preparation and dated recovery observations. It is not a published release or the planned automatic-enrollment network. For the published preview.8/profile route and detailed administration, see [advanced operations](supporter-advanced.md).

## 1. What you need

| VPS | Raspberry Pi |
|---|---|
| Linux host and an ordinary user account | A board capable of 64-bit Linux, such as Pi 4/5 |
| Persistent disk and available RAM/upload capacity | Raspberry Pi OS Lite 64-bit, reliable power/network and persistent storage |
| Reachable public IP and unused TCP port | An Internet-reachable route to the Pi; home NAT may require port forwarding |

Use [Node.js 24 LTS](https://nodejs.org/en/download), npm and Git. CI for this candidate used Node 24.19.0; this is a tested baseline, not a claim that it is the newest patch. The core accepts Node 22.12+. Check:

```sh
node --version
npm --version
git --version
uname -m
```

If needed, follow [Node installation](supporter-advanced.md#if-nodejs-is-not-installed-ubuntu--64-bit-pi-os) and the [official Pi setup](https://www.raspberrypi.com/documentation/computers/getting-started.html). Select Linux ARM64 Node for an `aarch64` Pi, Linux x64 for an `x86_64` VPS. Real Pi hardware/performance acceptance is pending; there is no measured minimum hardware specification. OS, packages, logs and indexes need space in addition to chosen content quotas.

No domain, nginx or TLS certificate is required for this direct-IP listener. It does not install a full Arweave or Solana node. Direct mode does not currently provide automatic NAT traversal or a relay: behind CGNAT, a running Pi may still be unreachable from the Internet.

## 2. Get the candidate and join an existing network

Obtain a complete `mesh1.` **connection invitation** from an operator you trust. It tells your new peer where to get initial sources; it is not your new peer's address or a license. If you do not have one, [request connection help](https://github.com/Vevivo/arns-mesh/issues/new?template=connection-profile.yml). No live addresses or working invitation are bundled in this repository.

Run in a new directory as the ordinary account that will own this service:

```sh
git clone https://github.com/Vevivo/arns-mesh.git arns-mesh-supporter
cd arns-mesh-supporter
git checkout cbd55a7dfd5b754a4d3ac06e4c67dc4c83a4011e
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
bash scripts/install-peer.sh --network 'PASTE_COMPLETE_MESH1_CODE_HERE'
```

Replace the quoted placeholder with the **whole real invitation**. The checkout pins the source tested in [this run](https://github.com/Vevivo/arns-mesh/actions/runs/37259769203). Install before an outage: GitHub/npm are download dependencies. Do not run over another project's data directory. The installer creates its own versioned files, preserves existing Mesh data/settings on update and does not open firewall ports or change other services.

Default location: `~/.local/share/ArNS-Mesh-Supporter`. Start in the foreground:

```sh
"$HOME/.local/share/ArNS-Mesh-Supporter/Start-Peer.sh"
```

Keep that terminal open. Periodic status is emitted; press Ctrl+C to stop. This starts a peer, not a complete archive. The initial invitation must lead to working sources for a fresh peer to acquire useful data.

## 3. Confirm that others can reach your peer

In a second terminal, from the source checkout:

```sh
node scripts/probe-peer.mjs 127.0.0.1:49741
```

Expected result: `Mesh endpoint responded`. This checks the endpoint only, not available sites. Then run the same probe **from another network**, replacing `127.0.0.1:49741` with your real public `IP:port`.

Your **peer address** is that reachable IP and port. `0.0.0.0` is only a listen setting; `127.0.0.1` means the reader's own machine. A private Pi address is only useful inside networks that can reach it. Allow only the selected TCP port (default **49741**) in your existing provider/host/router policy. See [reachability details](supporter-advanced.md#4-check-that-other-people-can-use-it).

**Current enrollment step:** give this intended-public peer address to the existing network operator. The operator checks it, adds it to the signed source list and republishes. Joined readers learn that list automatically outside Saved mode; they do not need a new code for an ordinary list update. Installing with `--network` learns upstreams but does not advertise your new address. Automatic self-announcement is [planned](shared-network.md), not a current button.

You do not need to create your own network or issue a new invitation to every reader.

## 4. Keep useful site copies and run in the background

After the foreground check, stop it with Ctrl+C. In the installed root, create or edit **your own** `peer.env`; preserve existing settings. For this candidate, a small starting example is:

```sh
(
  set -o noclobber
  cat > "$HOME/.local/share/ArNS-Mesh-Supporter/peer.env" <<'MESH_ENV'
MESH_LISTEN=0.0.0.0:49741
ARNS_PREPARE_ENABLED=1
ARNS_PREPARE_MAX_SITES=16
ARNS_CACHE_MIB=256
ARNS_SAVED_MIB=1024
ARNS_INDEX_DAILY_MIB=64
ARNS_CATALOG_DAILY_MIB=64
MESH_ENV
)
```

The command creates `~/.local/share/ArNS-Mesh-Supporter/peer.env` and refuses to overwrite an existing file. If it already exists, edit that file in your text editor instead. The background service reads it; running the foreground launcher alone does not read this file. These are sample content/work allowances, not total disk, bandwidth or RAM limits. Choose them to fit your resources. The installer already enables catalog work. Preparation copies and pins bounded supported site files while upstreams are available; an incomplete new version does not replace the older complete version. [Exact candidate settings](../resilient-access.md).

Install the separate user service:

```sh
bash scripts/install-user-service.sh
systemctl --user status arns-mesh-supporter --no-pager
journalctl --user -u arns-mesh-supporter -n 30 --no-pager
```

Run this from the same checkout/account. It refuses to overwrite an existing service; for an existing installation, edit `peer.env` and restart only `arns-mesh-supporter`. For startup after logout/reboot, an administrator can run `sudo loginctl enable-linger YOUR_USER`, replacing `YOUR_USER` with the intended account. These instructions assume the default install paths; use the same custom paths if you changed them.

The service caps CPU at 25% and memory at 512 MiB where cgroups enforce them; the launcher sets a 384 MiB Node heap. These are limits, not measured capacity guarantees. Serving downloads can exceed the index/catalog daily allowances. Monitor upload usage as well as disk and memory.

Inspect after the peer has emitted its first status record:

```sh
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data"
du -sh "$HOME/.local/share/ArNS-Mesh-Supporter/data"
```

Look for retained name observations, ready versions, missing files and errors. A site being listed does not mean all files are present. A replica needs its own accepted observations; copying another peer's name assertion does not automatically make it trusted.

## 5. Prove that your contribution helps

From a separate reader, use a test profile containing your peer, open a prepared site and inspect the served content/source. Check `contentBytesServed`, `catalog.meshReplicated`, `catalog.locationsReplicated` and preparation status on the server. A responding port or a rising request counter is insufficient.

For no-RPC recovery, the operator must explicitly configure the peer's public recovery-witness identity in the candidate's trusted sources. An address alone does not grant name trust. See [recovery configuration](../resilient-access.md#provider-configuration). Never send your private identity or authority key.

Before claiming redundancy, test isolated readers/peers with the original source unavailable and then with RPC/raw Arweave unavailable. Surviving independent hosts need the dated name mapping, corresponding verified files and sufficient upload capacity. Do not disrupt other services for this test. Physical independent-host and Pi acceptance are still pending.

## Addresses, codes and backups in one place

| Item | Purpose |
|---|---|
| Connection invitation (`mesh1.…`) | Join an existing network and learn its signed initial sources |
| Your public peer address (`IP:port`) | Let other devices reach your service |
| Signed network-list mirror | Offer another copy of connection information; it does not copy websites |
| Content/name data | Actually serve prepared versions during upstream outages |

Optional: [mirror the network list](network-code.md#add-a-supporter-and-a-mirror). Existing readers can try accepted list addresses, but a new reader must know a reachable starting peer. Mirrors cannot renew an expired authority record. [Limits](network-code.md#updates-expiration-and-outages).

For updates, stop the peer, privately back up `data` and the launcher, choose a reviewed source revision, rerun the installer and restart. Existing configuration is preserved. Keep the matching old program/data for rollback. Do not clone a private identity onto several machines and call them independent peers. [Update, backup, rollback and removal](supporter-advanced.md#7-update-rollback-backup-remove).
