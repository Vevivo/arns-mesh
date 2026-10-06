# ArNS topic search validation — 6 October 2026

The candidate read live ANT metadata and produced a signed catalogue with 13,266 retained names/undernames. After default placeholder descriptions were excluded, 165 entries had useful descriptions, keywords or prepared document text at that observation. The catalogue's signed JSON was approximately 3.9 MB. These are observed counts, not coverage guarantees.

Queries such as music, game, storage and art returned names. ArDrive appeared through its owner-supplied Storage keyword and description. The interface and examples are English; query words are not translated. A name-only result does not imply that its site has been archived.

An actual supporter entrypoint was then started in a Linux network namespace with only loopback, empty upstream lists, upstream fetch disabled and a fresh identity. It used copies of public retained name records, metadata and three already signed content files. The original service's private identity was not copied. It served the larger version 2 catalogue with retained ArDrive topics and the original version 1 HTML catalogue with the verified vevivo entry. The test did not claim new chain observations while disconnected.

205 source tests passed with two concurrent test files on the working server. Unbounded concurrent execution on that busy host initially caused two existing wall-clock timeout tests to fail; the bounded run passed without relaxing their deadlines. Targeted search tests also passed after the final cached-name guard.

Windows keyword UI acceptance and the existing real-content OS firewall checks are required in the release workflow. Their final status belongs to the release's exact-commit build metadata.

[Machine-readable observations](topic-search-2026-10-06.json) · [Search behavior and limits](../topic-search.md)
