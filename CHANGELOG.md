# Changelog

## v1.17.0 - 2026-07-17

- Added a desktop Home dashboard: rentals due soon, next queue pick, this week's game and movie releases, live download status, watchlist titles now streaming, and vault totals with one-tap navigation.
- Added TV OLED protection: the interface dims after 3 idle minutes and switches to a slow ambient poster slideshow after 6; any remote key wakes it.
- Added opt-in alerts for rentals due within 3 days, starred games releasing within a week, and watchlist movies that reached streaming, with browser notifications when permitted.
- Added a monthly spend chart to Rentals covering the last 12 months in both grid and list view.
- Added a desktop keyboard-shortcuts overlay on "?" documenting all existing shortcuts.
- Completed deep-link support so ?section and ?tab can open any page for bookmarks and iOS Shortcuts.
- Added proper iPhone 17 Pro PWA splash screens and fixed the stale desktop rail version badge.
- Ignored local-only files (APKs, screenshots, temp clones) in the public repository and removed the superseded BiglyBT gateway folder.

## v1.16.0 - 2026-07-17

- Redesigned only the Android TV experience as a cinematic command center.
- Added a featured-title hero, continuation summary and wider content shelves.
- Replaced the permanently wide TV sidebar with a compact rail that expands on focus.
- Renamed BiglyBT and System to Downloads and Settings in TV navigation.
- Reworked TV detail pages for a larger, artwork-led ten-foot presentation.
- Made TV shell updates activate automatically because the remote cannot select browser update toasts.
- Preserved the existing Shield remote controls, view-only behavior and desktop/mobile interfaces.

## v1.15.0 - 2026-07-16

- Made RAWG, TMDB and OMDb keys device-only and excluded them from cloud and portable backups.
- Made health-record cloud sync explicit opt-in while preserving local health data during cloud pulls.
- Removed personal lab values from the application source and made the Health dashboard data-driven.
- Added native sharing with a clipboard fallback and improved social/search metadata.
- Restored the safe service-worker update flow so new versions wait for user approval.
- Added version-aware smoke checks and an automated GitHub Actions quality workflow.

## v1.2.3 - 2026-07-13

- Disabled accidental pinch, double-touch, and gesture zoom on iPhone.
- Preserved normal vertical scrolling, horizontal navigation, taps, and form interactions.

## v1.2.2 - 2026-07-13

- Optimized the mobile layout for iPhone 17 Pro portrait and landscape viewports.
- Added safe-area support for the Dynamic Island, rounded display edges, and home indicator.
- Prevented top-bar controls, cards, forms, buttons, metadata, and long labels from overflowing their containers.
- Increased iOS form-control text to 16px to prevent Safari input zoom from disrupting the layout.

## v1.2.1 - 2026-07-13

- Moved the application version into a fixed top-bar badge so it remains visible on desktop, mobile, and Android TV.

## v1.2.0 - 2026-07-13

- Expanded Coming Soon to major films in every original language when they have a confirmed U.S. theatrical release.
- Added exact U.S. theatrical-date validation to avoid showing global, festival, or unrelated release dates.
- Retained protection against old-film re-releases and added original-language labels for non-English movies.

## v1.1.0 - 2026-07-13

- Introduced semantic application versioning with separate version, build date, release channel, and data-schema details.
- Added a compact version badge to the application header and version policy information in Settings.
- Added version metadata to exported diagnostics.

## 2026.07.12-r4

- Renamed the primary navigation to Games, Movies, TV Shows, Plex Library, and BiglyBT.
- Clarified Games tabs as Now Playing, Rental Queue, Upcoming Releases, Discover, and Completed.
- Reorganized Movies into My Watchlist, Coming Soon, New on Blu-ray, Discover, Malayalam OTT, and Watched.
- Combined current and upcoming Malayalam OTT releases on one page.
- Added synced Watching status, New Episodes, Upcoming, and unified Discover views for TV Shows.
- Added language, genre, year, and streaming-provider filters to TV discovery.
- Added Plex Home, Continue Watching, Movies, TV Shows, and Recently Added views.
- Added Active, Queued, Completed, Seeding, and All Torrents filters to the native BiglyBT dashboard.

## 2026.07.12-r3

- Fixed upcoming Hollywood results so old films with future re-releases are not shown as new premieres.
- Added exact US physical-release dates for the Blu-ray list and invalidated stale media caches.
- Sorted Malayalam and Tamil series by their latest episode date and used Indian provider availability.
- Serialized Google Drive uploads so older requests cannot finish after and overwrite newer edits.
- Added Unicode-safe title matching and removed Wikipedia story truncation.
- Added downloaded/total sizes and separate remove-versus-delete-files actions to BiglyBT.
- Improved recovery storage limits, runtime diagnostics, and service-worker update safety.

## 2026.07.12-r2

- Added a stable sticky application header and clearer primary navigation hierarchy.
- Added contextual section titles, descriptions, item counts, and recently viewed shortcuts.
- Added contextual Games dashboard statistics for Rentals, Playing, Queue, Upcoming, For You, and Played.
- Refined grids, lists, cards, full-page details, typography, spacing, contrast, and responsive behavior.
- Added Comfortable and Compact interface density settings.
- Added browser Back support and Previous/Next navigation for full-page details.
- Added stable loading skeletons and a list-optimized BiglyBT dashboard.
- Improved keyboard accessibility and selectable card focus behavior.

## 2026.07.12-r1

- Split the application shell, styles, and JavaScript into maintainable files.
- Removed shadowed duplicate film and series renderers.
- Added schema validation before cloud and imported data can replace the vault.
- Added eight rotating local recovery points and five daily Google Drive history copies.
- Added encrypted manual exports and secret-free diagnostics exports.
- Added clearer system status, version, and recovery controls in Settings.
- Added request timeout/retry support for RAWG and improved global refresh behavior.
- Added accessible status announcements, focus styling, reduced-motion support, and image failure handling.
- Added complete offline shell caching and an in-app update notification.
- Added a reusable syntax and structural smoke-check script.
