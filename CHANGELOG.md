# Changelog

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
