# Shared vault contract

`game-vault.schema.json` is the canonical, lossless contract for the single
`game-vault-backup.json` file used by web, Windows, and Android TV.

Rules:

- Clients must preserve unknown root and record fields when reading and writing.
- A populated cloud vault must never be replaced by an empty local vault.
- Deletions must be represented by `deletions` and/or `_sync.tombstones` until
  every client has observed them.
- A client must compare the remote revision it last observed before uploading.
- Conflicting local data must be written to a recovery copy before another
  device's newer data is adopted.
- Catalog caches are non-authoritative and must not advance the user-data
  revision by themselves.

The fixture in `fixtures/vault-v15.json` intentionally contains a future field.
Every client must round-trip it unchanged.
