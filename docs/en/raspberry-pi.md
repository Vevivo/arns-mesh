# Prepare a Raspberry Pi

[Türkçe](../tr/raspberry-pi.md) · [Supporter installation](supporter.md)

A Pi runs the Linux supporter, not the Windows browser. Hardware acceptance on a real Pi is still pending; these are installation instructions, not a tested capacity claim.

## Prepare the device

1. Use a board that supports a 64-bit OS, such as a Pi 4 or Pi 5, a suitable power supply and stable networking.
2. Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to install **Raspberry Pi OS Lite (64-bit)**. Configure your own user and SSH access. Flashing replaces the selected device's contents; select the correct storage.
3. Follow the [official first-start guide](https://www.raspberrypi.com/documentation/computers/getting-started.html).
4. Use persistent storage; an SSD is preferable for sustained index and content writes. The standard setup includes R84: reserve its 50 GiB allowance separately from OS/content. The Pi profile needs 74 GiB free in total for a new installation.
5. Install Git, npm and a supported **Linux ARM64 Node.js 24 LTS** build. [Node setup](node-setup.md).

```bash
uname -m
node --version
npm --version
git --version
```

For these instructions `uname -m` should report `aarch64`. Do not use the x64 archive.

## Make it reachable from outside home

The direct-IP supporter needs an incoming route. With a public IPv4 address, forward your chosen TCP port (49741 in the guide) from the router to the Pi and allow it in relevant firewalls. Keep the Pi's LAN address stable.

If your ISP uses **CGNAT**, ordinary port forwarding may not work. Obtain a reachable public address from the ISP or use a VPS. Mesh's direct mode does not currently provide automatic NAT traversal, a relay or CGNAT bypass. A running Pi that cannot be reached from outside cannot serve those readers.

A changing public IP requires a working announcement and a reachable route for peers to learn the new address. Do not treat automatic discovery as an ISP/address-management service.

**Continue with [supporter installation](supporter.md)** using the default community network and `--capacity pi`. The setup includes [R84 indexes](../shared-index.md); afterward verify [independent access](resilience.md).
