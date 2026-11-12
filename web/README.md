# Sinu Game Vault — web (rebuild)

A rebuilt web client for the library: React 19, TypeScript and Vite, installable as a PWA. It reads and writes the same vault as the classic site at the repository root, the Windows app and the Android TV app.

The classic site is untouched and is still what GitHub Pages serves. This folder is not deployed yet.

## Run it

```bash
npm install
npm run dev
```

`npm test` runs the data-layer tests. `npm run build` type-checks and writes the site to `dist/`.

## How it is put together

- `src/lib/syncMerge.ts` — record-level merge. A typed port of the classic site's `core.js`; `tests/merge.test.ts` runs both over the same inputs and fails on any difference.
- `src/lib/vault.ts` — the vault shape (schema 15) and the rules that keep it valid. Unknown fields are always carried through.
- `src/lib/store.ts` — the vault in memory, saving, recovery points, undo. Uses the classic site's storage keys, so on the same origin both sites share one library.
- `src/lib/drive.ts` — Google Drive sync: download, merge, upload, serialised and debounced.
- `src/lib/catalog.ts` — RAWG, TMDB and OMDb clients.
- `src/lib/library.ts` — records to titles, and every action that moves a title between lists.
- `src/pages`, `src/ui` — screens and components. `src/styles/app.css` is the whole design system.

## What it covers

Home, Games, Movies, TV Shows, title details, catalog search and add, Petrol, Settings (theme, Drive sync, catalog keys, export, import, recovery points), a command palette (Ctrl+K) and Undo.

Not rebuilt yet: Plex, BiglyBT, Health, Finance, subscription plan editing, rental availability checks, release alerts, encrypted credential sync and the regional OTT feeds. Their data is preserved and they remain available in the classic site.

## Deploying

The build uses relative paths and hash routing, so `dist/` works at any path. Google sign-in only works on origins authorised for the OAuth client (currently `https://sinuksml.github.io`), so it cannot be tested on localhost without adding that origin in Google Cloud Console.
