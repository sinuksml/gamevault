# Changelog

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
