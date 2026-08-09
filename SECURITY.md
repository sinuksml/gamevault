# Security model

GameVault is a personal application, but it handles OAuth tokens, Plex and
BiglyBT credentials, health information, and a complete entertainment history.

## Storage

- Web API credentials stay on the current device. The trusted-device export is
  encrypted with the user's passphrase before it can be placed in Drive.
- Windows OAuth tokens are stored in Windows Credential Manager.
- Android TV credentials are encrypted with Android Keystore and are excluded
  from Android backup.
- `game-vault-backup.json` is user data, not a credential store. Unknown fields
  are preserved according to `shared/game-vault.schema.json`.

## Network exceptions

Android TV permits cleartext traffic because Plex and BiglyBT can be hosted on
private home-network addresses that do not provide TLS. Do not expose those
ports directly to the public internet. Prefer an authenticated HTTPS gateway.

The BiglyBT Worker may use an HTTP upstream only for the existing private relay
deployment. The public Worker endpoint must remain HTTPS and authenticated.

## Reporting

Do not attach vault files, OAuth tokens, Plex tokens, BiglyBT passwords, Worker
secrets, or diagnostic exports to a public issue. Revoke a credential immediately
if it is accidentally published.
