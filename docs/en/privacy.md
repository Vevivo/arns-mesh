# Privacy and publishing

Mesh 0.6.0 deliberately publishes **one authority-signed community network definition** in resources/network-continuity.json. It contains public service addresses, numeric-IP rendezvous bootstrap addresses, the network authority's public key and accepted publisher identities. These are connection information intended for sharing, not passwords. The definition lets an upgraded or fresh reader using the supported community code find a later supporter without the original operator.

Private signing keys, SSH credentials, wallet secrets, administrative server access, personal profiles, browsing data, prepared runtime catalogs, private logs and backups remain outside the source and release. Other default endpoint files remain empty. This signed public definition is not permission to copy an operator's working data directory.

## What participants can observe

- **Network discovery:** HyperDHT rendezvous uses numeric-IP UDP. Network participation and networking metadata can be observed; connected peers exchange the network ID and signed supporter advertisements. This exchange contains no ArNS names, page URLs, search words or site files. The reader performs no DNS lookup for its rendezvous bootstrap.
- **Name and content access:** direct Mesh/RPC HTTP does not provide anonymity or transport confidentiality. A serving peer or RPC operator can observe requests and the reader's connecting address. Content signatures verify data; they do not hide requests or independently prove the latest name state.
- **Local search:** topic search runs against locally retained signed catalogs. Query words are not sent to catalog publishers.
- **Public supporting:** a supporter publishes its numeric IP/port and persistent public peer identity, and serves verified content and accepted signed records. Learning that identity does not make it a trusted name publisher.
- **Preparation:** a separate, bounded supporter process may use HTTPS/DNS to obtain location hints from configured upstream services. Those services can observe its requests. This does not add HTTPS gateway access to the reader.

The reader stores bounded application caches, settings and selected data on its device. It does not run the supporter's continuous indexing or bulk replication. The supporter stores indexes, mirrored name records and prepared files on its own server. See [architecture](architecture.md) and [supporter setup](supporter.md) for roles and limits.

## Source, packages and diagnostics

Keep private profiles and backups outside the checkout. Never upload a whole running application's data directory. A shareable invitation/profile may reveal approved public endpoints, but must never include private authority/peer keys, SSH access or wallet seeds.

The check:public script checks known runtime filenames, credential patterns and operational identifiers. It allows public numeric addresses in the dedicated continuity resource only after validating its signed public invitations; other source examples use documentation addresses. This targeted guard is **not a guarantee that every possible secret will be detected**. Review staged changes and release contents. Ignore rules do not remove files already tracked in Git history.

Diagnostics may include names, targets, IPs, local paths and timing. Share a manually redacted excerpt with a reproducible error, not complete logs or profiles by default. Commits expose configured author metadata; use an appropriate GitHub noreply address if needed. If a credential is exposed, revoke or rotate it and follow [GitHub's sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
