# GameVault UI Design-System Review

Version: 1.0  
Application baseline: GameVault 2.0.0  
Reviewed: 25 July 2026

Editable Figma review:
<https://www.figma.com/design/rrahdQ0V0gbtvi7UesH7ZY>

## Purpose

This document is the code-to-Figma source of truth for the GameVault web
interface on Windows and iPhone. Android TV has a separate native interface and
is outside this review.

The visual regression baselines in `tests/visual/__screenshots__` are the
reference views for checking implementation changes.

## Review Summary

### Keep

- Strong content-first library model with distinct Games, Movies, and TV Shows.
- Dark and light themes driven by CSS custom properties.
- Full-page detail views with a clear close action.
- Poster-led media grids and compact game/rental summaries.
- Persistent bottom navigation on iPhone.
- Existing focus-visible and press feedback introduced in the 1.27 quality pass.

### Highest-Priority Improvements

1. Consolidate old and new CSS tokens. `app.css` currently declares overlapping
   root values in multiple passes, making later overrides hard to predict.
2. Increase dark-theme secondary-text contrast. `--dim` and `--faint` should not
   be used for meaningful text until their contrast is validated.
3. Normalize typography. The interface still contains many one-off pixel sizes
   even though a rem-based core scale now exists.
4. Improve 2560 x 1440 density. Current content remains narrow and left-heavy,
   leaving excessive unused space on a 2K monitor.
5. Normalize component radii. Sibling controls mix 7, 8, 10, 12, 14, 16, 18,
   and pill radii.
6. Reduce wrapped action density on iPhone cards. Keep one primary action and an
   overflow trigger on compact cards; expose all actions in the detail view.

## Foundations

### Color Roles

Use semantic names in Figma and bind each to the matching CSS variable.

| Figma variable | Dark | Light | CSS |
| --- | --- | --- | --- |
| `color/bg/canvas` | `#0A0D13` | `#CDD6E4` | `--bg` |
| `color/bg/surface` | `rgba(19,24,34,.88)` | `rgba(255,255,255,.96)` | `--card` |
| `color/bg/surface-subtle` | `rgba(16,20,29,.88)` | `rgba(255,255,255,.92)` | `--card2` |
| `color/bg/inset` | `#0D1119` | `#EEF2F8` | `--inset` |
| `color/border/default` | `#232E44` | `#B9C5D8` | `--border` |
| `color/border/strong` | `#2B3852` | `#AAB8CE` | `--border2` |
| `color/text/primary` | `#EAF0FA` | `#141A26` | `--text` |
| `color/text/secondary` | `#B9C3D6` | `#39435A` | `--text2` |
| `color/text/muted` | `#8B96AC` | `#586178` | `--muted` |
| `color/text/dim` | `#6E7B94` target | `#68758C` target | `--dim` |
| `color/accent/default` | `#2D7FF9` | `#1F6FE0` | `--accent` |

`--faint` is decorative-only. Do not use it for timers, labels, descriptions,
or interactive affordances.

### Typography

Font family:

```text
-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif
```

Use one scale:

| Style | Size | Weight | Use |
| --- | --- | --- | --- |
| `type/caption` | 11 px | 600 | Nonessential metadata |
| `type/meta` | 12 px | 600 | Dates, genres, providers |
| `type/body-sm` | 13 px | 600 | Compact controls and rows |
| `type/body` | 15 px | 600 | Primary body copy |
| `type/title-sm` | 17 px | 700 | Cards and panel headings |
| `type/title` | 20 px | 700 | View headings |
| `type/display` | 28 px | 800 | Detail title and key metric |

Allowed font weights are 600, 700, and 800. Use tabular numerals for prices,
ratings, progress, dates, and countdowns.

### Spacing

Use a 4 px base grid:

| Token | Value |
| --- | --- |
| `space/1` | 4 px |
| `space/2` | 8 px |
| `space/3` | 12 px |
| `space/4` | 16 px |
| `space/6` | 24 px |
| `space/8` | 32 px |

### Radius

| Token | Value | Use |
| --- | --- | --- |
| `radius/control` | 8 px | Buttons, inputs, selects |
| `radius/panel` | 12 px | Toolbars and sections |
| `radius/card` | 16 px | Media cards and detail surfaces |
| `radius/full` | 999 px | Status, filters, chips only |

### Elevation

| Token | Value | Use |
| --- | --- | --- |
| `elevation/1` | `0 2px 8px rgba(0,0,0,.16)` | Resting card |
| `elevation/2` | `0 10px 28px rgba(0,0,0,.26)` | Hover and sticky UI |
| `elevation/3` | `0 20px 56px rgba(0,0,0,.38)` | Modal and detail overlay |

## Component Inventory

Build and review these Figma components in dependency order:

1. `IconButton`: size 44, states default/hover/focus/pressed/disabled.
2. `Button`: primary/secondary/danger, small/regular, optional leading icon.
3. `Chip`: filter/status/count, inactive/active.
4. `Input`: search/text/select, empty/filled/focus/error/disabled.
5. `Tab`: icon plus label, inactive/active.
6. `Stat`: label/value/delta with neutral/success/warning/danger tone.
7. `PosterCard`: poster/title/rating/genre/status.
8. `GameCard`: cover/title/platform/classification/context metric.
9. `ListRow`: 2:3 thumbnail/title/metadata/primary action/overflow.
10. `ActionGroup`: wrapped detail actions with no horizontal scrolling.
11. `EmptyState`: icon/message/one primary action.
12. `Toast`: info/success/warning/error in one non-overlapping stack.
13. `NavigationRail`: desktop section navigation and optional counts.
14. `PhoneTabBar`: icon-primary navigation with the active label visible.
15. `DetailPage`: close, hero, identity block, metadata, actions, sections.

## Responsive Rules

### iPhone 17 Pro: 402 x 874

- Respect all four safe-area insets.
- Minimum interactive target: 44 x 44 CSS px.
- One-column list or two-column poster grid.
- Keep the title, first status, and primary action above the fold.
- Detail actions wrap into a two-column grid; never require horizontal scrolling.
- Use 44 x 66 thumbnails for film and series list rows.
- Fixed bottom navigation must not overlap toasts, keyboard controls, or sheets.
- Disable accidental page zoom while keeping form text at 16 px or larger.

### Windows Laptop: 1920 x 1080

- Navigation rail: 208-224 px.
- Main content should use the available width without exceeding readable line
  lengths; target 1180-1440 px for media views.
- Merge page title, search, filters, and view actions into one working toolbar.
- Use 5-7 poster columns depending on available width.
- Preserve visible keyboard focus and logical arrow/tab order.

### 2K Monitor: 2560 x 1440

- Do not simply center the 1080 layout at its old size.
- Increase poster/card minimum size or column count to use the canvas.
- Target a 1680-1880 px working region with 6-9 poster columns.
- Background artwork must use a high-resolution source and retain a readable
  focal point at `background-position`.

## Figma File Structure

The Starter-plan review file uses three pages:

1. `01 Foundations`
2. `02 Components`
3. `03 Screens + QA`

Desktop 1080, Desktop 2K, iPhone 17 Pro, and QA baselines are sections on the
third page. A Professional plan can split those sections into separate pages,
but that is not required for this workflow.

Variable collections in the free Starter file:

- `Semantic Color - Dark`: one Dark mode.
- `Semantic Color - Light`: one Light mode.
- `Layout`: one Value mode for spacing and radius.

Figma Starter limits variable collections to one mode, so Light and Dark are
parallel collections. The repository remains the source of truth for theme
switching.

Set Web code syntax on semantic variables to the corresponding CSS `var(...)`.
Do not put credentials, API keys, account data, health data, or financial data in
the Figma file.

## Visual Acceptance Criteria

A UI change is ready when:

- Playwright smoke and screenshot tests pass.
- There is no horizontal page overflow at 402, 1920, or 2560 px.
- Meaningful text meets WCAG AA contrast.
- Every interactive control has a visible focus state and a 44 px phone target.
- Titles do not overlap close, overflow, or status controls.
- Card heights remain stable when metadata is absent.
- Light mode surfaces remain distinct from the page background.
- Detail actions are visible without horizontal scrolling.
- Empty, loading, error, offline, and populated states are all designed.
- Intentional screenshot changes are reviewed before baselines are updated.

## Review Workflow

1. Make the UI change in code.
2. Run `npm.cmd run test:all`.
3. Open `npm.cmd run test:report` if any visual comparison fails.
4. Compare the implementation with the matching Figma component and frame.
5. Fix regressions or intentionally update snapshots.
6. Commit UI code, Figma review notes, and changed baseline images together.
