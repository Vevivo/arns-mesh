# Support ArNS Mesh

You can help without writing code.

## Store and serve data

Run the separate supporter service on a reachable VPS or Raspberry Pi: [English setup](docs/en/supporter.md) · [Türkçe kurulum](docs/tr/destekci.md). Useful contributions include verified file copies, dated name observations, location records and signed network-list mirrors. Measure actual content availability; an empty or unreachable peer does not provide redundancy.

Initial joining uses an operator-managed signed list. Preview.13 supports automatic announcements and peer exchange after joining; automatic independent replica placement and repair remain unfinished. See [implemented behavior](docs/en/shared-network.md) and [failover preparation](docs/en/resilience.md). Opening an issue or installing a browser does not create a serving replica.

## Give feedback

Use [Issues](https://github.com/Vevivo/arns-mesh/issues) with the application version, operating system, failed step, expected result and what happened. A public ArNS name is helpful only if you choose to disclose it. Redact private addresses, browsing history, credentials and local paths. State whether sources were live, simulated or intentionally stopped. Do not claim independence from a same-machine replica test.

## Work on source

See [developer instructions](docs/en/developer.md) or [Türkçe](docs/tr/gelistirici.md). Preserve the distinction between readers and voluntary supporters. The desktop must not become a background serving/indexing peer without explicit opt-in.

Before code pull requests run `npm run check:public` and `npm test`; add meaningful tests for security/lifecycle changes. Explain the problem, behavior, measured validation and remaining limits. Documentation-only changes should check commands, links and release/candidate boundaries; they do not need synthetic feature tests.

Do not commit live profiles, private keys, runtime identities, user caches or unredacted diagnostics. Do not embed successful per-name responses to hide discovery gaps. Preserve upstream licenses and attribution. Report security issues through [SECURITY.md](SECURITY.md).
