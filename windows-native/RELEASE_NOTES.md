# Sinu Game Vault for Windows 2.5.2

## 2.5.2 Fix runaway vault growth (slowness and crashing)

- Fixed the cause of the app becoming very slow and crashing: the vault file had grown to about 650 MB, almost all of it a diagnostic `audit` log that had reached 2.3 million entries. Loading it held roughly 13 GB of memory, and every edit rewrote the whole file, so the app thrashed and ran out of memory. The same oversized file syncs through Google Drive, so the web app was slow and could crash a phone tab for the same reason.
- Root cause: the Drive merge appended every entry of identity-less arrays — the `audit` log and the `deletions` tombstones — from both sides on every sync, with no cap and no de-duplication. One vault here held 2.3 million audit entries and 18,402 deletion markers that were really only 2 distinct deletions repeated thousands of times.
- The merge now keeps only the newest audit entries (matching the web app's 200-entry cap) and keeps one deletion marker per record, newest wins, instead of re-appending duplicates.
- `audit` is now capped and `deletions` de-duplicated whenever the vault loads, so an already-bloated vault heals itself on the next start.
- Recovery snapshots are now limited by total size (about 200 MB) rather than a fixed count of 60, which had let recovery grow to 11 GB when each snapshot was a copy of the 650 MB vault.
- Your existing vault on this machine was compacted from 650 MB to under 4 MB with no library data lost; the previous copy was preserved as `vault.pre-audit-cleanup.bak.json`.

## 2.5.1 Horizontal card layout, artwork that loads, larger game cards

- Games, movies and TV shows now flow across the page instead of stacking in a single column. All four card and list views used to share one collection view, so switching on grouping for Games switched it on everywhere; Movies and TV then kept laying their cards out with the group panel, which stacked them in one centred column. Each page now gets its own view.
- Artwork loads reliably. Posters were handed to WPF as a remote URL, and a fetch could come back as a 1x1 bitmap with no error raised. Because that result was cached, the card showed its initials placeholder for the rest of the session, which is why movie and TV posters were usually blank while game art happened to survive. Artwork is now downloaded once through the application's own HTTP stack, kept in a local cache folder, and decoded from that file at the size the card displays.
- Artwork is available offline after the first load, and a failed download is retried next time instead of being remembered as a failure.
- Game cards are now the same size as movie cards. Game art is 16:9 and a card frame is 2:3, so filling the frame would have to crop away half the width. The picture is instead fitted whole and the space around it filled with a soft, heavily downscaled copy of the same image: nothing is cropped, stretched or zoomed, and every card is a uniform size.
- Home shows rental returns and subscription renewals as a grid of cards rather than a single list, and each card names what is due.
- The Home panels now size to their content instead of stretching to the bottom of the window.

## 2.5.0 Home rebuild, quick actions and list order

- Title text is selectable. Detail titles, metadata, availability, notes and the story can be highlighted and copied; WPF text is not selectable by default, so these are now read-only text fields styled as body text.
- Removed "Continue where you left off" and "Coming up" from Home.
- Added a spending wheel to Home showing every vendor and subscription as its own arc, with a legend and the running total in the centre.
- Selecting a vendor or subscription in that legend opens its website.
- Added a Due dates panel to Home listing every active rental return and subscription renewal, soonest first, colour-coded once a date is close or overdue.
- The Subscriptions tab now stacks Active subscriptions above Included games, separated by a divider, instead of placing them side by side.
- Games section tabs now sit above the action buttons, matching Movies and TV Shows.
- Cards carry a quick action suited to their state: Return and complete, Rent again, Start rental, Play now, Resume, Mark completed, Add to queue or Mark watched.
- The Plex library cache is written to disk, so reopening the application reuses the last result instead of re-reading every section from the server.
- Titles without artwork now draw a local placeholder with their initials on a colour derived from the title, rather than depending on an image service that could be slow or unreachable.
- Finished games and watched titles no longer appear in Discover, the rental queue, upcoming or the watchlist.
- Hand-built lists keep the order they were built in, newest first, instead of being re-sorted by release date.

## 2.4.1 Wikipedia plot only

- The story panel now shows the plot text and nothing else. It previously carried the section heading, Wikipedia's "[edit]" link, citation markers such as [1], and the article's whole reference list, so a summary ended with lines like "^ Author (23 May 2025). Title. Publisher. Retrieved 15 October 2025."
- Infoboxes, tables and figure captions are dropped from the extracted section.
- A real "Plot" section is now preferred over a weaker stand-in such as "Premise" or "Setting" when an article has both.
- When an article has no story section at all, only the opening summary is used instead of the entire article.
- Plots saved by earlier versions are cleaned when they are displayed, so existing titles look right without needing Refresh plot.

## 2.4.0 interface redesign

- Rebuilt the visual design: refreshed palette with an accent gradient, consistent corner radii, softer elevation on cards and panels, tighter spacing and a clearer type scale.
- Redesigned the navigation rail with a compact brand lockup, grouped sections, icon columns and a persistent accent bar marking the section you are in.
- Fixed poster and cover fitting. Movie and TV artwork is 2:3 while game artwork is 16:9, and both were being forced into the same portrait frame, which cropped game art down to its middle third. Each card now sizes its art frame to the shape of the source, so nothing is cropped, stretched or zoomed. The detail page poster does the same.
- Cards gained rounded corners, a readable gradient over the artwork, a lift on hover, and stacked status pills that no longer collide on narrow cards.
- Added depth to the background: two soft ambient gradients, a faint diagonal weave and a vignette, tuned per theme so light mode stays clean and OLED stays black.
- Moved the Wikipedia story and summary below the action buttons, in its own panel, so the actions are reachable without scrolling past the plot.

## 2.3.0 sync correctness and library performance

Data fixes:

- Deleted titles no longer come back after a Google Drive sync. Record identity had three separate implementations that disagreed with each other, so a deletion recorded on one device could never be matched on another and the title returned on the next merge.
- Changes saved while a sync was already running are no longer dropped; they used to wait for the next unrelated save before reaching Drive.
- Web-only data is no longer erased by a merge that the Windows side wins. Only list fields were merged, so anything else that existed on one side only was dropped and then uploaded over the top.
- A merge is abandoned rather than uploaded when Google Drive changed while it was being prepared, instead of silently overwriting the other device.

Performance:

- Artwork is decoded at the size it is displayed instead of at full source resolution, which was holding several megabytes per poster.
- The Games and Movies list views only build the rows that are on screen.
- Switching tabs rebuilds the list once instead of re-sorting on every row.
- A background Drive sync no longer rebuilds the views unless it actually changed something.
- Plex requests are paced and paged, results are cached for thirty minutes, and artwork loads on demand rather than downloading the whole library before anything appears.
- Catalog responses are cached for longer where the data rarely changes, respect rate limits, and the cache is trimmed.

Behaviour:

- The window remembers its size, position and maximised state.
- Only one copy of the application can run at a time.
- Closing no longer waits on Google Drive when there is nothing pending.
- Checking for updates reports whether this build is actually behind rather than opening a page.
- View preferences moved out of Windows Credential Manager into a settings file; only real secrets remain in Credential Manager.

## 2.2.0 web catalog parity and native integrations

- Aligns movie and TV discovery with the web catalog, including separate upcoming Malayalam OTT results.
- Adds full Wikipedia story loading for movies and TV shows plus per-episode IMDb ratings.
- Adds Plex server discovery, integration setup guides, consistent long-form dates, and a monthly game-spending chart.
- Keeps poster crops centered while card groups remain left-aligned.

## 2.1.2 centered cards and navigation polish

- Centered poster-card rows and image crops across Games, Movies, TV Shows, and Plex.
- Added separate Coming to Malayalam OTT and Released on Malayalam OTT dividers.
- Added mouse Back button navigation, closing an open title before leaving the section.
- Replaced disruptive temporary catalog 404 dialogs with a non-blocking status message.

## 2.1.1 title layout and sync stability

- Enlarged grid and detail titles while enforcing wrapping and stable card dimensions.
- Prevented detail pages from retaining a horizontal offset or clipping content.
- Fixed legacy Google token expiry underflow during Drive synchronization.
- Fixed JSON ownership errors during Drive merge, status moves, and root updates.
- Suppressed harmless late window-closing callbacks and improved diagnostic stack traces.

## 2.1.0 reliability, cloud convergence, and visual QA

- Serializes full vault mutations and atomic writes, preserves unreadable data, and expands recovery retention.
- Adds durable deletion markers and conflict-aware Drive merging so old device data cannot resurrect removed titles.
- Prevents empty vault uploads from replacing an existing Drive backup and restores empty installations from Drive first.
- Refreshes OAuth tokens correctly, remembers the selected Drive file, and stores token expiry securely.
- Improves title identity, Plex matching and artwork caching, vendor matching, date parsing, catalog pagination, Wikipedia results, IMDb refreshes, and episode ratings.
- Restricts game story fetching to Now Playing, keeps internet cache refreshes from changing cloud revisions, and debounces library search.
- Removes full-window blocking during saves, adds visible progress, improves high-contrast and light-mode surfaces, and fixes card footer alignment.
- Removes the Health feature from the Windows edition and preserves the existing installer identity and upgrade path.
- Adds broader regression coverage for concurrency, corruption recovery, duplicate years, cloud tombstones, snapshots, and browsing-only state.

## 2.0.5 Windows library reliability and clarity

- Added a native application/taskbar icon and larger title, release-date, rental, and subscription countdown typography.
- Added PS5 and Xbox/PC Upcoming Games filters, corrected mixed upcoming/released ordering, and broadened Discover results.
- Improved Wikipedia plot discovery with a manual refresh action and safer fallback queries.
- Added clear section dividers, light-mode-safe rating colors, editable card actions, and automatic details closing during navigation.
- Added Plex token instructions and one-click library discovery, plus an always-visible BiglyBT history below active transfers.
- Removed the Health section from the Windows edition and strengthened Drive synchronization when closing the application.

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
- Native Plex, Games, Movies, TV Shows, vendor, rental, subscription, plot, ratings, and episode workflows retained.

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
