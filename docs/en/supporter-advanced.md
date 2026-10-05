# Supporter operations

[Setup](supporter.md) · [VPS](vps.md) · [Raspberry Pi](raspberry-pi.md)

Use the same **0.5.0** release as the desktop. Complete the supporter setup before using these commands.

```bash
systemctl --user status arns-mesh-supporter --no-pager
journalctl --user -u arns-mesh-supporter -n 50 --no-pager
node scripts/operator.mjs --data "$HOME/.local/share/ArNS-Mesh-Supporter/data" --json
```

The last command runs from the source checkout. Inspect retained names, prepared site records, missing files, traffic budgets and discovery announcements.

Configuration is in `~/.local/share/ArNS-Mesh-Supporter/peer.env`. Preserve existing settings when editing it. Restart only this supporter after changes:

```bash
systemctl --user restart arns-mesh-supporter
```

Keep the supporter's identity private and persistent. Each independent supporter must have its own identity. Back up the data privately before an upgrade and retain the matching application version for rollback.

[Selected names and takeover testing](resilience.md) · [R84 index operations](../shared-index.md) · [Network codes](network-code.md).
