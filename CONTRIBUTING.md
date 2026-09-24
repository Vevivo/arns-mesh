# Contributing

Start with the [developer guide](docs/en/developer.md) or [Türkçe rehber](docs/tr/gelistirici.md). There are two product audiences: desktop readers and voluntary VPS/Pi supporters. Preserve that separation; readers should not become background indexers without an explicit product decision.

Before a pull request, run `npm run check:public` and `npm test`. Explain the problem, resulting behavior, measured validation and remaining limits. Add meaningful tests for security or lifecycle changes. Preserve licenses and upstream attribution.

Do not commit live profiles, deployment addresses, private keys, runtime identities, user caches, screenshots or raw diagnostics. Do not embed individual names or prepared per-name responses to hide discovery failures. Label fixtures and mocked Electron tests honestly. Keep external-index preparation separate from independent runtime discovery claims.

Report security issues through the process in [SECURITY.md](SECURITY.md), not a public issue containing secrets.
