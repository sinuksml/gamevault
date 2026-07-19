# Changelog

## v1.26.0 - 2026-07-19

- Income is now calculated only from bank statements: credits on credit cards and the Niyo Global forex card (bill payments, top-ups) are classified as own-money transfers, never income — including previously imported records.
- Bank-side debits that pay a credit-card bill (CRED, BillDesk, BBPS, card payment) are also excluded from spending, so card purchases are never counted twice.
- Added a "Top 10 merchants" panel ranked by how often each merchant is used (visit count), with per-merchant totals, and a "Spending per card / account" breakdown with Bank/Card badges.
- Redesigned the Finance dashboard around three large Credited / Spent / Net cash-flow cards, each showing the change versus last month.
- The 12-month chart now prints the credited and spent amounts directly on the bars in compact Indian notation (₹1.2L, ₹45k) and highlights the selected month.
- Added an EMI overview strip — active loans, total per month, instalments paid of total, remaining count and balance left — with an overall repayment progress bar.
- Each loan card now leads with "X of Y paid · Z remaining" and a segmented per-instalment tracker (one block per EMI), with balance, next due, end date and last payment below.

## v1.25.6 - 2026-07-19

- BiglyBT now stops each download when it completes instead of auto-removing it, so finished films move to History while staying loaded and fully deletable.
- Removed the "Remove completed" toggle, since completion always stops (never removes) the torrent now.
- History records are permanent and can no longer be removed; the only action is "Delete torrent + files", which deletes the file and torrent from the drive.
- After a permanent delete the download stays in History as a greyed-out entry marked "Files deleted" (worker gateway github-v19).

## v1.25.5 - 2026-07-19

- Added per-record actions to the BiglyBT download History: "Delete torrent + files" permanently removes a still-loaded torrent and its downloaded file from the drive, and "Remove record" clears just the history log entry.
- History entries whose torrent is no longer loaded in BiglyBT are clearly marked "Not in BiglyBT — delete on the Shield", because Transmission's RPC cannot delete files it no longer tracks.
- Synced history deletions and file-deleted status back to the encrypted GameVault vault so the log stays consistent across devices (worker gateway github-v18).

## v1.25.4 - 2026-07-19

- Added a "Files" button to the BiglyBT toolbar (both the native dashboard and Web UI views) that opens the main downloads folder where every film is saved.
- Added a "Downloads folder" field in Settings to point the button at that location once per device (for example `Z:\Downloads`, `\\192.168.0.100\Elements`, or a Plex/file-server web URL).
- Web (http/https) folder links open directly; because browsers block `file://` and network paths from an HTTPS page, those paths are copied to the clipboard so they can be pasted straight into Explorer or the Files app.

## v1.25.3 - 2026-07-19

- Finance now opens password-protected PDF statements automatically. Add your name, date of birth and last five mobile digits once (stored only inside the encrypted vault) and GameVault derives each bank's password.
- Added per-issuer password formats for ICICI and Kotak (first four name letters + DDMM, Kotak lowercase) and SBI (last five mobile digits + DDMMYY), with a manual override for cards like Neyo forex.
- Password candidates are tried in order against PDF.js, so previously unreadable ICICI, Kotak and SBI statements now import instead of sitting in the retry queue.

## v1.25.2 - 2026-07-19

- Replaced the 200-attachment iPhone scan with six-statement sequential batches to prevent Safari memory termination.
- Preserved the complete five-year backfill across batches before switching to lightweight incremental Gmail scans.
- Added a Face ID device-key fallback for Safari installations that do not expose the WebAuthn PRF extension.
- Kept the fallback wrapping key non-exportable and device-only in IndexedDB; biometric verification is still required before vault access.

## v1.25.1 - 2026-07-19

- Prevented Finance inactivity and background locks while Gmail authorization, statement parsing or encrypted saving is active.
- Started Face ID WebAuthn requests before UI rendering so iPhone Safari preserves the required tap gesture.
- Added one-step Face ID re-enrollment from the Finance Security menu.

## v1.25.0 - 2026-07-19

- Made Finance unlock Face ID-first on supported devices, with one-tap entry, a hidden PIN fallback, clearer error states, vault-bound credentials, and PIN retry delays.
- Added configurable Finance auto-lock timing, background locking, and a compact Security menu with device enrollment status.
- Reworked Gmail statement sync into an incremental seven-day-overlap scan with four-at-a-time processing and visible progress.
- Added statement metadata, repeated-statement protection, transient-failure recovery, and an encrypted retry queue for unreadable attachments.

## v1.24.2 - 2026-07-19

- Added a direct Gmail API setup action when Google reports that the API is disabled.
- Stopped automatic Gmail retries after configuration or network failures, preventing repeated refresh loops.
- Replaced long raw Google API errors with a concise in-app setup message optimized for mobile.

## v1.24.1 - 2026-07-19

- Restricted Gmail Finance synchronization to attached credit-card and bank/debit-account statements only.
- Removed individual transaction-alert emails from future Gmail imports and enforced a five-year statement search.
- Added review warnings for statement attachments that cannot be read, including password-protected PDFs.

## v1.24.0 - 2026-07-19

- Rebuilt Finance around a simple monthly summary with previous-month comparison, credits, spending, net cash flow, top categories and merchant insights.
- Added automatic Gmail classification for refunds, reversals, failures, transfers, card payments, accounts, merchants and reference-based duplicate detection.
- Added 12-month credits-versus-spending charts, category drill-downs, filters and collapsed transaction details instead of showing the full ledger by default.
- Added Gmail-derived EMI progress, remaining instalments, expected completion, upcoming payments and recurring-expense increase alerts.
- Removed manual transaction, loan and statement-entry controls so Gmail is the Finance workspace's primary data source.
- Added latest Gmail synchronization time, manual refresh and automatic refresh while an authorized Finance session remains open.

## v1.23.0 - 2026-07-19

- Added optional Gmail statement and transaction-alert discovery to the encrypted Finance workspace.
- Added incremental Gmail read-only OAuth using the existing Google Client ID, with access tokens kept only in memory.
- Added a configurable Gmail search query, labeled-message workflow, connection status and explicit session disconnect.
- Added local parsing of supported CSV, TXT and text-based PDF attachments plus cautious transaction-alert detection.
- Added review-before-import, encrypted Gmail message-ID deduplication and privacy-safe Gmail import history.

## v1.22.0 - 2026-07-19

- Added a separate PC and mobile Finance workspace with encrypted expense, income, loan and EMI tracking.
- Added six-digit PIN protection and optional iPhone Face ID unlock through WebAuthn PRF when supported.
- Added local CSV, TXT and text-based PDF statement parsing, review, categorization and duplicate detection.
- Added monthly and category insights, statement history, manual transactions and loan payoff tracking.
- Reduced the size of the 12-month rental, history and library-purchase chart.
- Added a privacy-safe Finance summary to Home that reveals values only while the vault is unlocked.

## v1.21.0 - 2026-07-19

- Added a one-click BiglyBT Paste & Add button that reads a copied magnet link and immediately submits it.
- Added consistent confirmation warnings before removing games, watchlist titles, watched status, health records and upcoming records.
- Added per-episode IMDb ratings from one cached OMDb season lookup, with clear pending and unavailable states.
- Improved Home with an at-a-glance priority strip, overdue rental warnings, queue availability and a unified Continue section.

## v1.20.0 - 2026-07-18

- Redesigned the BiglyBT native dashboard as a compact download workspace with a sticky connection and transfer summary.
- Corrected Native Dashboard and Web UI switching while preserving the current gateway and authentication flow.
- Replaced full two-second list redraws with keyed torrent-row updates that preserve focus, expansion and scroll position.
- Added global totals, counted Active, Queued, Completed, Seeding, Errors and All filters, plus seven sorting options.
- Added state-aware primary actions, secondary action menus, stronger progress hierarchy and safer named deletion confirmations.
- Added expandable torrent details with save location, dates, trackers, files and individual file priorities.
- Added fixed notifications, offline and idle states, five-minute polling pause, alternative speed-limit control and last-updated status.
- Added searchable and date-filtered torrent history, storage totals, CSV export, improved mobile layout and light-mode support.

## v1.19.0 - 2026-07-18

- Unified Game, Film and TV title details around a consistent artwork, status, facts, overview and actions hierarchy.
- Added lazy Film and TV metadata enrichment for runtime, director, certification, providers, network, series status and episode totals.
- Added context-aware card metadata for release dates, providers, seasons and countdowns with stable card alignment.
- Rebuilt the TV-series season and episode selector as a browsable episode list with dates and summaries.
- Improved iPhone title details so facts and overviews use the full screen width below the artwork.
- Improved 1080p and 2K list layouts, light-mode contrast, missing-artwork treatment and responsive action alignment.
- Clarified game rating sources and added context-specific library details for Rentals, Queue, Playing, Upcoming and Played.

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
