# Sinu Game Vault for Windows 2.0.4

## 2.0.4 game library navigation and discovery

- Replaces generic game, movie, and TV tabs with recognizable icon-led navigation.
- Shows each title's library category directly on grid cards and list rows.
- Orders upcoming releases by nearest release date, with released and removed titles kept below upcoming games.
- Orders Discover by newest release date while retaining the curated quality threshold.
- Loads full Wikipedia plot or story sections inside every game detail page.
- Automatically refreshes queue availability from The Game Hub and Gamer Planet and exposes a manual vendor refresh action.

## 2.0.3 subscription library fix

- Displays NVIDIA GeForce NOW and Xbox Game Pass subscriptions alongside their included games.
- Adds provider artwork, renewal status, remaining days, subscription cost, and stable active/included/past grouping.

## Highlights

- Redesigned responsive Windows shell for 16:9 laptops and desktop monitors.
- Native list and poster-grid libraries with contextual quick actions and full detail pages.
- Light, dark, and OLED black display modes with stronger keyboard focus treatment.
- Persistent Google Drive synchronization using Windows Credential Manager.
- Versioned vault schema, atomic saves, automatic and manual recovery snapshots, and restore browsing.
- Recent activity and recently viewed tracking.
- Disk-backed catalog cache with stale-data fallback when an external service is unavailable.
- Privacy-safe diagnostics export and global error logging.
- Improved BiglyBT operational summary with active count, transfer speed, remaining data, stable incremental refresh, controls, and history.
- Native Plex, Games, Movies, TV Shows, Health, vendor, rental, subscription, plot, ratings, and episode workflows retained.

## 2.0.1 hotfix

- Registered the BiglyBT summary-card resources that caused the initial 2.0.0 window to fail during XAML loading.
- Expanded diagnostic entries to include nested exception details.

## 2.0.2 visual QA release

- Corrected header, toolbar, tab, grid, and detail-page alignment.
- Added explicit dropdown, popup-menu, list, and table colors for Dark, Light, and OLED modes.
- Added theme-aware artwork scrims and removed conflicting fixed dark surfaces.
- Improved readability of dashboard and Health cards in Light mode.

## Keyboard shortcuts

- `Ctrl+K`: focus global search.
- `Ctrl+R`: refresh the current area.
- `Ctrl+,`: open Settings.
- `Alt+Left`: close details or return to the previous area.
- `Esc`: close the current details page.

## Distribution note

This personal build is not code-signed. Windows SmartScreen may show an unknown-publisher warning. A trusted signed auto-updater requires a code-signing certificate and hosted release artifacts, so update checking currently opens the GitHub Releases page.
