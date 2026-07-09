# Multi-Language Support

**Status:** Design approved, ready for implementation plan
**Date:** 2026-07-08
**Scope:** Production game UI localization for English, Traditional Chinese, and Japanese. This covers fixed UI copy, fixed game-domain display labels, alerts/status messages, and locale-aware formatting without changing saved game state or generated/player-entered names.

## Motivation

Serpens is currently English-only. Production copy is spread across Svelte components, the main route, game-domain definitions, alerts, placement feedback, world-city decisions, and hard-coded `en-US` formatters. The app also ships with `<html lang="en">` regardless of the player's language.

The goal is a first production-ready localization layer that supports:

- English (`en`)
- Traditional Chinese (`zh-Hant`)
- Japanese (`ja`)

The implementation should keep the single-page SvelteKit/Tauri shape intact and avoid introducing runtime translation services or save migrations.

## Decisions

- Use a first-party typed i18n layer instead of adding a full i18n dependency.
- Resolve the starting locale from saved local preference, then matching browser language, then English.
- Persist manual language changes as a local app preference, not inside save slots.
- Put the language selector in the existing game menu.
- Localize the production game experience only.
- Keep player-entered save names, generated staff names, generated store names, and historical saved prose unchanged.

## Architecture

Add a small i18n module under `src/lib/i18n/`.

### `locales.ts`

Defines the supported locale IDs and display metadata:

- `en`: English
- `zh-Hant`: 繁體中文
- `ja`: 日本語

It also owns locale resolution:

1. Stored local preference.
2. Browser language match.
3. English fallback.

Browser matching rules:

- `zh-TW`, `zh-HK`, and `zh-MO` map to `zh-Hant`.
- `ja` and `ja-*` map to `ja`.
- `en` and `en-*` map to `en`.
- Everything else falls back to `en`.

Invalid stored preferences are ignored.

### `messages/*`

Add typed message modules:

- `messages/en.ts`
- `messages/zh-Hant.ts`
- `messages/ja.ts`

The English module is the source shape. Other locales must satisfy the same key structure so missing keys are caught in unit tests and TypeScript checks.

Messages are grouped by production UI area, for example:

- `app`
- `topBar`
- `gameMenu`
- `controlDesk`
- `buildMenu`
- `savePanel`
- `tileInspector`
- `industryInspector`
- `reports`
- `staff`
- `stock`
- `productChains`
- `worldMap`
- `alerts`
- `placement`
- `decisions`

### `translate.ts`

Provides a typed lookup and interpolation API:

- `t(key, params?)`
- English fallback for missing locale messages.
- Development-only warning for missing keys.

The runtime must not throw during gameplay for missing translations. If a key is missing in the active locale, the English value is returned.

### `format.ts`

Centralizes locale-aware formatting:

- Currency, still representing in-game USD.
- Integers and compact integers.
- Percentages.
- Dates and times.
- Lists where the UI joins named items.

Components should stop constructing `Intl.*Format('en-US', ...)` directly and instead use the active locale's formatter helpers.

### `gameLabels.ts`

Maps stable game IDs to localized display labels. This keeps pure game data stable while letting UI render translated names.

Covered v1 ID families:

- Store archetypes.
- Product categories.
- Materials.
- Industrial building types.
- Production/resource labels shown in production UI.
- Neighborhoods and terrain labels.
- Policy values.
- Scorecard keys.
- World cities, unlock requirements, and specialty summaries.
- Map views and management panel names.

Where components currently read English `name` or `description` fields from definitions, they should prefer localized display helpers keyed by ID. The underlying data remains unchanged unless an implementation step deliberately extracts English display strings into label maps.

## Data Flow

The main route owns the active locale as Svelte state.

On mount:

1. Resolve the active locale from local preference or browser language.
2. Update the route state.
3. Set `document.documentElement.lang` to the active locale.

When the player changes the language in the game menu:

1. Update active locale state.
2. Save the local preference.
3. Update `document.documentElement.lang`.
4. Let visible UI rerender from translated labels and locale formatters.

Saved game records are not localized. They continue to store stable IDs, numbers, player-entered names, generated names, and historical report/decision text exactly as they do today.

## UI Scope

The language selector lives in the existing game menu alongside map view, saves, and audio settings. It should be compact and use locale names:

- English
- 繁體中文
- 日本語

The top status bar remains focused on game state and should not gain an always-visible language control in v1.

Production scope:

- Main route `/`.
- Game components under `src/lib/components/game/`.
- Fixed game-domain labels shown by those components.
- Alerts.
- Active decisions.
- Placement feedback and build-menu disabled reasons.
- Save/status messages.
- Number, date, percent, and currency formatting.
- `document.documentElement.lang`.

Out of scope:

- Demo routes.
- Docs and design specs.
- Test-only sample components.
- Image assets.
- Player-entered save names.
- Generated staff names.
- Generated store names.
- Historic prose already stored in older save records.
- Per-save language selection.

## Error Handling

Missing translations fall back to English. In development, log a concise warning that identifies the missing locale and key. In production, return the fallback silently.

Malformed interpolation inputs should render a readable fallback string rather than breaking the UI. The implementation should prefer explicit params in tests so missing interpolation values are caught early.

Invalid stored language preferences are ignored and replaced by browser match or English.

Historical saves are not migrated for language. If a report or decision already contains stored English prose, it remains readable. Newly generated active UI/status text should use localized message builders as implementation touches those paths.

## Testing

Add focused unit tests for:

- Supported locale resolution.
- Local language preference persistence and invalid preference fallback.
- Translation fallback and interpolation.
- Locale-aware currency, integer, percent, date, and list formatting.
- Game-label lookup by stable ID.
- Key parity across `en`, `zh-Hant`, and `ja`.

Update component tests where rendered English assertions now flow through the i18n layer.

Add or adjust one e2e smoke path:

1. Load `/`.
2. Change the language from the game menu to Japanese or Traditional Chinese.
3. Verify top-bar/menu copy and at least one formatted value update.
4. Verify the current game state is not reset by the language change.

Recommended validation after implementation:

- `bun run check`
- Targeted i18n and touched component unit tests.
- Relevant e2e smoke.
- Full `bun run test:unit` and `bun run test:e2e` if many components are touched.

## Acceptance Criteria

- The production game UI can switch between English, Traditional Chinese, and Japanese from the game menu.
- Supported browser languages choose the matching locale on first load when no local preference exists.
- Manual locale choice persists locally across reloads.
- `document.documentElement.lang` reflects the active locale.
- Currency, date/time, integer, percent, and list formatting use the active locale.
- Fixed production UI labels and fixed game-domain labels render in the active locale.
- Player-entered names, generated names, and historical saved prose are not rewritten.
- Missing locale keys fall back to English without crashing gameplay.
- Unit tests cover locale resolution, persistence, fallback, formatting, and key parity.
- One e2e smoke verifies language switching without game-state reset.

## Implementation Notes

This feature touches Svelte components. During implementation, follow the repository's Svelte MCP requirement before writing or modifying Svelte code:

1. Use `list-sections`.
2. Fetch relevant docs with `get-documentation`.
3. Run `svelte-autofixer` on Svelte snippets until clean.

Do not migrate save schema solely for this feature. Language preference is an app preference like audio settings, not part of `GameState`.
