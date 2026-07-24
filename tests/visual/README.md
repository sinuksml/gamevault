# GameVault Visual Regression Tests

These Playwright tests protect the desktop and iPhone web interfaces from
accidental layout changes. They use deterministic local data and block external
API requests, so screenshots do not depend on account data, network speed, or
third-party services.

## Covered Views

- Desktop 1920 x 1080: Games / Rentals, movie detail, series detail
- Desktop 2560 x 1440: light-mode Movies / Watchlist
- iPhone 17 Pro 402 x 874: Games / Rentals, Movies / Watchlist, movie detail
- Dark and light themes
- Horizontal-overflow checks at every viewport

The committed reference images are in `tests/visual/__screenshots__`.

## First-Time Setup

```powershell
npm.cmd ci
npx.cmd playwright install chromium
```

On macOS or Linux, use `npm` and `npx` without the `.cmd` suffix.

## Run Tests

```powershell
npm.cmd run test:all
```

To inspect a failed comparison:

```powershell
npm.cmd run test:report
```

To use Playwright's interactive UI:

```powershell
npm.cmd run test:visual:ui
```

## Accept an Intentional UI Change

Review the changed screens first, then regenerate references:

```powershell
npm.cmd run test:visual:update
npm.cmd run test:visual
```

Commit the changed PNG files with the related UI code. Never update snapshots
only to make a failing build green.

## Continuous Integration

`.github/workflows/visual.yml` runs on pull requests and manual dispatch. It uses
Windows Chromium so Segoe UI rendering matches the committed Windows baselines.
When a comparison fails, the workflow uploads the Playwright HTML report,
traces, actual screenshots, and image diffs for 14 days.

## Test Data Policy

Fixtures contain invented sample data and generated SVG artwork. Do not put
Google tokens, API keys, financial records, Plex credentials, or personal
library exports in the visual-test fixtures or screenshots.
