# Privacy and publishing

This source distribution excludes operator endpoints, server access details, peer identities/private keys, live profiles, prepared private catalogs, browsing data, private audit logs, screenshots and conversation artifacts. Public default connection lists are empty. Example IPv4 addresses use documentation ranges and do not identify working services.

`npm run check:public` checks known runtime filenames, credential patterns, operational identifiers and non-example IPv4 addresses. It is a targeted guard, **not a guarantee that arbitrary secrets cannot be committed**. Review staged changes and release contents. Ignore rules do not remove files already tracked in Git history. If a credential is exposed, revoke/rotate it and follow [GitHub's sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Source is not runtime data

Keep private profiles and backups outside the checkout. Do not upload a whole working application's `data` directory. An operator should deliberately decide which service endpoints to share; a reader profile necessarily reveals those addresses to its recipient. It must never include SSH credentials, wallet seeds or private signing keys.

The public build does not contain the author's working profile. Ordinary users import a supporter-provided profile once. Running a public-facing peer exposes its IP/port and serves verified cached content to requesters. Current direct HTTP transport does not provide anonymity or confidentiality; peers/RPC operators can observe requests. Do not assume encrypted P2P because a dependency supports another transport.

## Diagnostics and GitHub

Diagnostics may include names, targets, IPs, local paths and timing. Share only a manually redacted excerpt with a reproducible error. Never paste full logs or profiles into a public issue by default. Git commits also expose configured author metadata; set an appropriate GitHub noreply email if you do not want your personal email attached to commits.

A private repository controls visibility; it is not a substitute for removing secrets before upload. Keeping deployment data out of the first commit makes a future public review safer. It does not eliminate all operational/privacy risk.
