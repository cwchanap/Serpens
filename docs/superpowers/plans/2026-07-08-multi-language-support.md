# Multi-Language Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production game UI localization for English, Traditional Chinese, and Japanese without changing saved game state or generated/player-entered names.

**Architecture:** Add a first-party typed i18n layer under `src/lib/i18n/`, then route all production UI labels, fixed game-domain names, active status messages, and formatting through a locale-specific `I18nBundle`. `src/routes/+page.svelte` owns the active locale, persists manual language changes in local storage, updates `document.documentElement.lang`, and passes the bundle to game components.

**Tech Stack:** TypeScript, Svelte 5 runes, SvelteKit SPA/static adapter, Vitest browser/server projects, Playwright e2e, Bun scripts.

## Global Constraints

- Supported locales are exactly `en`, `zh-Hant`, and `ja`.
- Starting locale resolves from saved local preference, then matching browser language, then English.
- Manual language changes are a local app preference, not save-slot state.
- The language selector lives in the existing game menu.
- Production game UI only: `/`, `src/lib/components/game/`, fixed game-domain labels, active alerts/decisions/placement feedback, save/status messages, formatters, and `document.documentElement.lang`.
- Out of scope: demo routes, docs localization, image assets, player-entered save names, generated staff names, generated store names, historic prose already stored in older save records, and per-save language selection.
- Missing translations fall back to English and must not crash gameplay.
- No save schema migration for language.
- No new runtime i18n dependency.
- Before editing Svelte files, follow the repo Svelte MCP flow: `list-sections`, `get-documentation`, and `svelte-autofixer` until modified component content is clean.

---

## File Structure

Create `src/lib/i18n/` with focused modules:

- `src/lib/i18n/locales.ts`: locale IDs, metadata, browser matching, localStorage preference helpers.
- `src/lib/i18n/locales.spec.ts`: locale resolution and persistence tests.
- `src/lib/i18n/messages/en.ts`: English source message tree.
- `src/lib/i18n/messages/zh-Hant.ts`: Traditional Chinese message tree with the same shape as English.
- `src/lib/i18n/messages/ja.ts`: Japanese message tree with the same shape as English.
- `src/lib/i18n/messages/index.ts`: locale-to-message map and exported message types.
- `src/lib/i18n/translate.ts`: typed dot-key lookup, interpolation, English fallback, development warning.
- `src/lib/i18n/translate.spec.ts`: lookup, interpolation, fallback, and key parity tests.
- `src/lib/i18n/format.ts`: locale-specific currency, number, percent, date/time, and list formatters.
- `src/lib/i18n/format.spec.ts`: formatter tests.
- `src/lib/i18n/gameLabels.ts`: stable-ID display labels for game domain IDs.
- `src/lib/i18n/gameLabels.spec.ts`: label lookup and fallback tests.
- `src/lib/i18n/gameCopy.ts`: active UI copy builders for alerts, placement reasons, world statuses, decisions, stock status, and product-chain graph view models.
- `src/lib/i18n/gameCopy.spec.ts`: copy-builder tests.
- `src/lib/i18n/index.ts`: public exports and `createI18n(locale)`.

Modify pure game modules only where they currently return active UI strings that need structured data:

- `src/lib/game/placementPreview.ts`: return structured placement block reasons instead of English strings.
- `src/lib/game/placementPreview.spec.ts`: update expectations to reason objects.

Modify production Svelte UI:

- `src/routes/+page.svelte`
- `src/app.html`
- `src/lib/components/game/TopBar.svelte`
- `src/lib/components/game/GameMenu.svelte`
- `src/lib/components/game/ControlDesk.svelte`
- `src/lib/components/game/AudioSettings.svelte`
- `src/lib/components/game/BuildMenu.svelte`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/WorldMap.svelte`
- `src/lib/components/game/SavePanel.svelte`
- `src/lib/components/game/DecisionQueue.svelte`
- `src/lib/components/game/PolicyPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/StaffPanel.svelte`
- `src/lib/components/game/StoreOverview.svelte`
- `src/lib/components/game/StoreDetailModal.svelte`
- `src/lib/components/game/StoreStockTable.svelte`
- `src/lib/components/game/StoreStaffPanel.svelte`
- `src/lib/components/game/StoreProductChainPanel.svelte`
- `src/lib/components/game/ProductChainsPanel.svelte`
- `src/lib/components/game/SupplyAdvisor.svelte`
- `src/lib/components/game/Scorecard.svelte`
- `src/lib/components/game/ShortcutCheatSheet.svelte`
- `src/lib/components/game/atlas/CategoryStampIndex.svelte`
- `src/lib/components/game/atlas/NodeBroadside.svelte`
- `src/lib/components/game/atlas/LegendCartouche.svelte`

Modify tests:

- Component specs for any changed props or text assertions.
- `src/routes/retail-sim.e2e.ts`: add a language-switching smoke.

---

### Task 1: Core Locale Runtime

**Files:**

- Create: `src/lib/i18n/locales.ts`
- Create: `src/lib/i18n/locales.spec.ts`
- Create: `src/lib/i18n/messages/en.ts`
- Create: `src/lib/i18n/messages/zh-Hant.ts`
- Create: `src/lib/i18n/messages/ja.ts`
- Create: `src/lib/i18n/messages/index.ts`
- Create: `src/lib/i18n/translate.ts`
- Create: `src/lib/i18n/translate.spec.ts`
- Create: `src/lib/i18n/format.ts`
- Create: `src/lib/i18n/format.spec.ts`
- Create: `src/lib/i18n/index.ts`

**Interfaces:**

- Produces: `type SupportedLocale = 'en' | 'zh-Hant' | 'ja'`
- Produces: `const LANGUAGE_PREFERENCE_STORAGE_KEY = 'serpens.languagePreference.v1'`
- Produces: `resolveSupportedLocale(input?: { storedLocale?: unknown; navigatorLanguages?: readonly string[] }): SupportedLocale`
- Produces: `readLocalePreference(storage?: StorageLike | null, navigatorLanguages?: readonly string[]): SupportedLocale`
- Produces: `saveLocalePreference(locale: SupportedLocale, storage?: StorageLike | null): SupportedLocale`
- Produces: `type TranslationKey`
- Produces: `type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string`
- Produces: `createTranslator(locale: SupportedLocale, options?: { warn?: (message: string) => void; dev?: boolean }): Translator`
- Produces: `createLocaleFormatters(locale: SupportedLocale): LocaleFormatters`
- Produces: `createI18n(locale: SupportedLocale): I18nBundle`

- [ ] **Step 1: Write failing locale tests**

Add `src/lib/i18n/locales.spec.ts` with assertions for browser matching, stored preference precedence, invalid stored preference fallback, and storage write failures.

```ts
import { describe, expect, it, vi } from 'vitest';
import {
	LANGUAGE_PREFERENCE_STORAGE_KEY,
	readLocalePreference,
	resolveSupportedLocale,
	saveLocalePreference
} from './locales';

function storageMock(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => (data.has(key) ? data.get(key)! : null)),
		setItem: vi.fn((key: string, value: string) => {
			data.set(key, value);
		})
	};
}

describe('locale resolution', () => {
	it('prefers a valid stored preference over browser language', () => {
		expect.assertions(1);
		expect(
			resolveSupportedLocale({
				storedLocale: 'ja',
				navigatorLanguages: ['zh-TW', 'en-US']
			})
		).toBe('ja');
	});

	it('maps Traditional Chinese browser locales to zh-Hant', () => {
		expect.assertions(3);
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-TW'] })).toBe('zh-Hant');
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-HK'] })).toBe('zh-Hant');
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-MO'] })).toBe('zh-Hant');
	});

	it('maps Japanese and English browser locales', () => {
		expect.assertions(2);
		expect(resolveSupportedLocale({ navigatorLanguages: ['ja-JP'] })).toBe('ja');
		expect(resolveSupportedLocale({ navigatorLanguages: ['en-CA'] })).toBe('en');
	});

	it('falls back to English for unsupported values', () => {
		expect.assertions(1);
		expect(
			resolveSupportedLocale({
				storedLocale: 'fr',
				navigatorLanguages: ['ko-KR']
			})
		).toBe('en');
	});

	it('reads and saves the local language preference', () => {
		expect.assertions(3);
		const storage = storageMock();
		expect(readLocalePreference(storage, ['ja-JP'])).toBe('ja');
		expect(saveLocalePreference('zh-Hant', storage)).toBe('zh-Hant');
		expect(storage.setItem).toHaveBeenCalledWith(
			LANGUAGE_PREFERENCE_STORAGE_KEY,
			'zh-Hant'
		);
	});
});
```

- [ ] **Step 2: Run locale tests and verify they fail**

Run: `bun run test:unit -- src/lib/i18n/locales.spec.ts --run`

Expected: FAIL because `src/lib/i18n/locales.ts` does not exist.

- [ ] **Step 3: Implement `locales.ts`**

Add the exact exported types and functions listed in this task's Interfaces block. Use defensive storage access like `src/lib/audio/audioPreferences.ts` does, because localStorage can throw.

Key implementation rules:

- Normalize locale candidates with `toLowerCase()`.
- Return `zh-Hant` for `zh-tw`, `zh-hk`, `zh-mo`, and exact `zh-hant`.
- Return `ja` for exact `ja` and `ja-*`.
- Return `en` for exact `en` and `en-*`.
- Ignore unsupported stored values before checking browser languages.
- Catch `getItem` and `setItem` errors.

- [ ] **Step 4: Run locale tests and verify they pass**

Run: `bun run test:unit -- src/lib/i18n/locales.spec.ts --run`

Expected: PASS.

- [ ] **Step 5: Write failing translation and formatter tests**

Add `src/lib/i18n/translate.spec.ts` with tests for lookup, interpolation, English fallback, development warning, and key parity. Add `src/lib/i18n/format.spec.ts` with tests for currency/date/list formatting.

Use these test cases:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from './translate';
import { messagesByLocale } from './messages';

describe('createTranslator', () => {
	it('returns localized text and interpolates params', () => {
		expect.assertions(2);
		const t = createTranslator('en');
		expect(t('topBar.day', { day: 7 })).toBe('Day 7');
		expect(createTranslator('ja')('gameMenu.language')).toBe('言語');
	});

	it('falls back to English and warns in development', () => {
		expect.assertions(2);
		const warn = vi.fn();
		const t = createTranslator('ja', { dev: true, warn });
		expect(t('app.title')).toBe(messagesByLocale.en.app.title);
		expect(warn).not.toHaveBeenCalled();
	});

	it('keeps message key parity across supported locales', () => {
		expect.assertions(1);
		const keys = (value: unknown, prefix = ''): string[] =>
			typeof value === 'string'
				? [prefix]
				: Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
						keys(child, prefix ? `${prefix}.${key}` : key)
					);
		const englishKeys = keys(messagesByLocale.en).sort();
		expect(keys(messagesByLocale['zh-Hant']).sort()).toEqual(englishKeys);
		expect(keys(messagesByLocale.ja).sort()).toEqual(englishKeys);
	});
});
```

```ts
import { describe, expect, it } from 'vitest';
import { createLocaleFormatters } from './format';

describe('createLocaleFormatters', () => {
	it('formats USD currency with the requested locale', () => {
		expect.assertions(2);
		expect(createLocaleFormatters('en').currency(12345)).toBe('$12,345');
		expect(createLocaleFormatters('ja').currency(12345)).toContain('$');
	});

	it('formats integers, percents, dates, and lists', () => {
		expect.assertions(4);
		const format = createLocaleFormatters('en');
		expect(format.integer(12345)).toBe('12,345');
		expect(format.percent(0.42)).toBe('42%');
		expect(format.dateTime('2026-07-08T12:30:00.000Z')).toContain('2026');
		expect(format.list(['Retail', 'World'])).toContain('Retail');
	});
});
```

- [ ] **Step 6: Run translation and formatter tests and verify they fail**

Run: `bun run test:unit -- src/lib/i18n/translate.spec.ts src/lib/i18n/format.spec.ts --run`

Expected: FAIL because message, translator, and formatter modules do not exist yet.

- [ ] **Step 7: Implement messages, translator, formatters, and `createI18n`**

Create a compact first message tree that covers route/menu/top-bar/control-desk labels needed by later tasks. Include all keys used by tests:

- `app.title`
- `topBar.day`
- `topBar.cash`
- `topBar.alerts`
- `topBar.noAlerts`
- `gameMenu.menu`
- `gameMenu.mapView`
- `gameMenu.language`
- `gameMenu.saves`
- `gameMenu.views.retail`
- `gameMenu.views.industry`
- `gameMenu.views.world`
- `controlDesk.build`
- `controlDesk.management`
- `controlDesk.shortcuts`
- `controlDesk.advanceDay`

Use dot-key lookup through the nested message tree. Treat missing interpolation params by leaving `{name}` intact in the returned string. `createLocaleFormatters(locale)` should construct `Intl.NumberFormat`, `Intl.DateTimeFormat`, and `Intl.ListFormat` instances once per bundle.

- [ ] **Step 8: Run core i18n tests**

Run: `bun run test:unit -- src/lib/i18n/locales.spec.ts src/lib/i18n/translate.spec.ts src/lib/i18n/format.spec.ts --run`

Expected: PASS.

- [ ] **Step 9: Commit core runtime**

```bash
git add src/lib/i18n
git commit -m "feat: add locale runtime"
```

---

### Task 2: Game Labels and Copy Builders

**Files:**

- Create: `src/lib/i18n/gameLabels.ts`
- Create: `src/lib/i18n/gameLabels.spec.ts`
- Create: `src/lib/i18n/gameCopy.ts`
- Create: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/index.ts`

**Interfaces:**

- Consumes: `SupportedLocale`, `Translator`, `LocaleFormatters`, `I18nBundle`
- Produces: `interface NamedLabel { name: string; description?: string }`
- Produces: `interface GameLabelLookup`
- Produces: `createGameLabelLookup(t: Translator): GameLabelLookup`
- Produces: `localizeStockStatus(status: StoreProductStatus, i18n: I18nBundle): string`
- Produces: `localizeStockTrouble(products, i18n): string | null`
- Produces: `localizeAlert(alert: GameAlert, game: GameState, i18n: I18nBundle): string`
- Produces: `localizeDecision(decision: DecisionItem, i18n: I18nBundle): LocalizedDecision`
- Produces: `localizeWorldCityStatus(status: WorldCityStatus, i18n: I18nBundle): LocalizedWorldCityStatus`
- Produces: `localizeProductChainGraph(graph: ProductChainGraph, i18n: I18nBundle): ProductChainGraph`

- [ ] **Step 1: Write failing game-label tests**

Add `src/lib/i18n/gameLabels.spec.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { createI18n } from './index';

describe('game labels', () => {
	it('localizes stable game-domain IDs', () => {
		expect.assertions(5);
		const english = createI18n('en').labels;
		const japanese = createI18n('ja').labels;
		expect(english.archetype('convenience').name).toBe('Convenience Store');
		expect(japanese.archetype('convenience').name).not.toBe('Convenience Store');
		expect(english.material('bottled-water')).toBe('Bottled Water');
		expect(english.policyValue('service', 'highTouch')).toBe('High Touch');
		expect(english.worldCity('harbor-city').name).toBe('Harbor City');
	});

	it('falls back to readable IDs for unknown dynamic values', () => {
		expect.assertions(1);
		expect(createI18n('en').labels.productCategory('unknown-category')).toBe('Unknown Category');
	});
});
```

- [ ] **Step 2: Run game-label tests and verify they fail**

Run: `bun run test:unit -- src/lib/i18n/gameLabels.spec.ts --run`

Expected: FAIL because `labels` is not on `I18nBundle`.

- [ ] **Step 3: Implement game-label message keys and lookup helpers**

Extend all three message catalogs with exact key families:

- `game.archetypes.<id>.name`
- `game.archetypes.<id>.description`
- `game.archetypes.<id>.risks.<index>`
- `game.products.<id>`
- `game.materials.<id>`
- `game.industrialBuildings.<id>`
- `game.industryResources.<id>`
- `game.neighborhoods.<id>`
- `game.terrain.<id>`
- `game.industryTerrain.<id>`
- `game.policyFields.<field>`
- `game.policyValues.<field>.<value>`
- `game.scoreKeys.<key>`
- `game.worldCities.<id>.name`
- `game.worldCities.<id>.unlockRequirement`
- `game.worldCities.<id>.specialtySummary`
- `game.mapViews.<id>`
- `game.managementPanels.<id>`

Implement readable-ID fallback by replacing `-` with spaces and capitalizing words. For camelCase policy values, insert a space before capital letters before capitalizing.

- [ ] **Step 4: Run game-label tests**

Run: `bun run test:unit -- src/lib/i18n/gameLabels.spec.ts --run`

Expected: PASS.

- [ ] **Step 5: Write failing copy-builder tests**

Add `src/lib/i18n/gameCopy.spec.ts` covering stock trouble, alert messages, decision fallback, world status text, and product-chain graph relabeling.

```ts
import { describe, expect, it } from 'vitest';
import { createI18n } from './index';
import { localizeStockStatus, localizeStockTrouble } from './gameCopy';

describe('game copy builders', () => {
	it('localizes stock status and stock-trouble summaries', () => {
		expect.assertions(3);
		const i18n = createI18n('en');
		expect(localizeStockStatus('Healthy', i18n)).toBe('Healthy');
		expect(
			localizeStockTrouble(
				[
					{ stock: 0, reorderThreshold: 4 },
					{ stock: 2, reorderThreshold: 4 }
				],
				i18n
			)
		).toBe('1 product out of stock, 1 product needs import');
		expect(localizeStockStatus('Healthy', createI18n('ja'))).not.toBe('Healthy');
	});
});
```

- [ ] **Step 6: Run copy-builder tests and verify they fail**

Run: `bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run`

Expected: FAIL because `gameCopy.ts` does not exist.

- [ ] **Step 7: Implement copy builders**

Implement active-copy helpers without mutating source game objects:

- `localizeStockStatus` maps `StoreProductStatus`.
- `localizeStockTrouble` mirrors `summarizeStockTrouble` but uses localized singular/plural messages.
- `localizeAlert` rebuilds `GameAlert.message` from structured alert fields where possible. It receives `GameState` so store-stock alerts can recompute localized stock-trouble summaries from `storeId`; unknown alerts fall back to `alert.message`.
- `localizeDecision` maps known decision IDs produced by `state.ts` and `world.ts`; unknown decisions fall back to stored title/context/options.
- `localizeWorldCityStatus` returns a shallow copy with localized `city.name`, `city.unlockRequirement`, `city.specialtySummary`, `blockedReason`, kind label, and state label.
- `localizeProductChainGraph` returns a shallow graph copy with localized graph title, node labels, health labels, bottleneck text where known from IDs, edge labels with localized units, warnings, and empty reason. Preserve graph IDs, node IDs, edge IDs, metrics, and health values.

- [ ] **Step 8: Run game-label and copy-builder tests**

Run: `bun run test:unit -- src/lib/i18n/gameLabels.spec.ts src/lib/i18n/gameCopy.spec.ts --run`

Expected: PASS.

- [ ] **Step 9: Commit game labels and copy builders**

```bash
git add src/lib/i18n
git commit -m "feat: add localized game labels"
```

---

### Task 3: Structured Placement Reasons

**Files:**

- Modify: `src/lib/game/placementPreview.ts`
- Modify: `src/lib/game/placementPreview.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`

**Interfaces:**

- Produces: `type PlacementBlockReason`
- Produces: `formatPlacementBlockReason(reason: PlacementBlockReason | null, i18n: I18nBundle): string | null`
- Changes: `RetailBuildMenuOption.disabledReason` from `string | null` to `PlacementBlockReason | null`
- Changes: `getRetailPlacementBlockReason(...)` return type from `string | null` to `PlacementBlockReason | null`
- Changes: `getIndustryBuildPlacementBlockReason(...)` return type from `string | null` to `PlacementBlockReason | null`

- [ ] **Step 1: Write failing placement reason expectations**

Update `src/lib/game/placementPreview.spec.ts` so existing string expectations become structured reason expectations:

```ts
expect(
	getRetailPlacementBlockReason({
		game,
		city,
		tileId: blockedTile.id,
		archetypeId: 'convenience'
	})
).toEqual({ code: 'retail.storeLimitReached' });

expect(electronicsOption.disabledReason).toEqual({
	code: 'retail.requiresCash',
	amount: cheapestElectronicsSetupCost
});
```

For footprint reasons, use stable codes:

- `retail.unknownCityTile`
- `retail.storeLimitReached`
- `retail.requiresCash`
- `retail.occupiedLocation`
- `retail.lockedLocation`
- `retail.roadLocation`
- `retail.riverLocation`
- `retail.noValidTiles`
- `industry.lockedUntilRetail`
- `industry.unknownBuildingType`
- `industry.requiresCash`
- `industry.rawPlacementBlocked`

- [ ] **Step 2: Run placement tests and verify they fail**

Run: `bun run test:unit -- src/lib/game/placementPreview.spec.ts --run`

Expected: FAIL because production code still returns strings.

- [ ] **Step 3: Implement `PlacementBlockReason` in `placementPreview.ts`**

Add a discriminated union with exact codes from Step 1:

```ts
export type PlacementBlockReason =
	| { code: 'retail.unknownCityTile' }
	| { code: 'retail.storeLimitReached' }
	| { code: 'retail.requiresCash'; amount: number }
	| { code: 'retail.occupiedLocation' }
	| { code: 'retail.lockedLocation' }
	| { code: 'retail.roadLocation' }
	| { code: 'retail.riverLocation' }
	| { code: 'retail.noValidTiles' }
	| { code: 'industry.lockedUntilRetail' }
	| { code: 'industry.unknownBuildingType' }
	| { code: 'industry.requiresCash'; buildingTypeId: IndustrialBuildingTypeId; amount: number }
	| { code: 'industry.rawPlacementBlocked'; message: string };
```

Map existing footprint strings to typed codes at the boundary. Keep raw industrial placement strings under `industry.rawPlacementBlocked` so this task avoids rewriting `industryPlacement.ts`.

- [ ] **Step 4: Run placement tests**

Run: `bun run test:unit -- src/lib/game/placementPreview.spec.ts --run`

Expected: PASS.

- [ ] **Step 5: Add localized placement formatter tests**

Extend `src/lib/i18n/gameCopy.spec.ts`:

```ts
import { formatPlacementBlockReason } from './gameCopy';

it('formats placement block reasons', () => {
	expect.assertions(3);
	const i18n = createI18n('en');
	expect(formatPlacementBlockReason({ code: 'retail.storeLimitReached' }, i18n)).toBe(
		'Store limit reached'
	);
	expect(formatPlacementBlockReason({ code: 'retail.requiresCash', amount: 12000 }, i18n)).toBe(
		'Requires $12,000 cash'
	);
	expect(
		formatPlacementBlockReason(
			{ code: 'industry.requiresCash', buildingTypeId: 'warehouse', amount: 8000 },
			i18n
		)
	).toBe('Warehouse requires $8,000 cash.');
});
```

- [ ] **Step 6: Run copy tests and verify they fail**

Run: `bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run`

Expected: FAIL because placement formatter is not implemented.

- [ ] **Step 7: Implement `formatPlacementBlockReason`**

Add message keys under `placement.*` and use `i18n.format.currency(amount)` for cash amounts. For `industry.rawPlacementBlocked`, return the raw message so existing industrial validation remains readable until a later targeted cleanup.

- [ ] **Step 8: Run placement and copy tests**

Run: `bun run test:unit -- src/lib/game/placementPreview.spec.ts src/lib/i18n/gameCopy.spec.ts --run`

Expected: PASS.

- [ ] **Step 9: Commit structured placement reasons**

```bash
git add src/lib/game/placementPreview.ts src/lib/game/placementPreview.spec.ts src/lib/i18n
git commit -m "feat: structure placement copy"
```

---

### Task 4: Route, Document Language, and Game Menu Selector

**Files:**

- Modify: `src/app.html`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/game/TopBar.svelte`
- Modify: `src/lib/components/game/GameMenu.svelte`
- Modify: `src/lib/components/game/GameMenu.svelte.spec.ts`
- Modify: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`
- Modify: `src/lib/components/game/AudioSettings.svelte`
- Modify: `src/lib/components/game/AudioSettings.svelte.spec.ts`

**Interfaces:**

- Consumes: `SupportedLocale`, `createI18n`, `readLocalePreference`, `saveLocalePreference`
- Adds prop to game components: `i18n: I18nBundle`
- Adds prop to `GameMenu`: `activeLocale: SupportedLocale`
- Adds prop to `GameMenu`: `onSelectLocale: (locale: SupportedLocale) => void`

- [ ] **Step 1: Update component tests for new i18n props and language selector**

In touched component specs, import `createI18n` and pass `i18n: createI18n('en')`.

Extend `GameMenu.svelte.spec.ts`:

```ts
it('shows language choices and emits the selected locale', async () => {
	expect.assertions(2);
	const props = { ...baseProps(), i18n: createI18n('en'), activeLocale: 'en' as const, onSelectLocale: vi.fn() };
	render(GameMenu, props);
	await page.getByRole('button', { name: /^menu$/i }).click();
	await expect.element(page.getByLabelText('Language')).toBeVisible();
	await page.getByLabelText('Language').selectOptions('ja');
	expect(props.onSelectLocale).toHaveBeenCalledWith('ja');
});
```

- [ ] **Step 2: Run touched component tests and verify they fail**

Run: `bun run test:unit -- src/lib/components/game/GameMenu.svelte.spec.ts src/lib/components/game/TopBar.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/AudioSettings.svelte.spec.ts --run --project client`

Expected: FAIL because props and language selector are not wired.

- [ ] **Step 3: Update `src/app.html` default language**

Keep the static default as English:

```html
<html lang="en">
```

Do not add server hooks. The SPA updates `document.documentElement.lang` on mount and locale changes.

- [ ] **Step 4: Wire active locale in `src/routes/+page.svelte`**

Add locale imports, state, derived bundle, and update handlers:

- `let activeLocale = $state<SupportedLocale>('en');`
- `let i18n = $derived(createI18n(activeLocale));`
- In `onMount`, read locale preference before creating audio controller.
- Add `$effect(() => { document.documentElement.lang = activeLocale; });`
- Add `function changeLocale(locale: SupportedLocale): void { activeLocale = saveLocalePreference(locale); }`

Replace the page title with `i18n.t(...)` keys. Replace `mapEyebrow`, `managementPanelMenuItems`, placement prompt, save button, management labels, and tower header labels with `i18n` lookups and formatters.

- [ ] **Step 5: Update `TopBar.svelte`**

Replace hard-coded `Intl.NumberFormat('en-US')`, "Day", "Cash", alerts labels, and no-alerts copy with `i18n.format.currency`, `i18n.t`, and localized alert messages from `localizeAlert(alert, active game or starter map state, i18n)`. Add `data-testid="cash-readout"` to the cash readout so e2e can verify it without depending on localized accessible names.

- [ ] **Step 6: Update `GameMenu.svelte`**

Add the language selector inside the open popover after the map-view section and before rendered menu content. Use a native `<select>` with `aria-label={i18n.t('gameMenu.language')}` and options from locale metadata. Add `data-testid="game-menu-trigger"` to the menu trigger button and `data-testid="language-selector"` to the language select so e2e can switch languages after accessible names are localized.

- [ ] **Step 7: Update `ControlDesk.svelte` and `AudioSettings.svelte`**

Localize button labels, group labels, and audio setting labels. Preserve keyboard keycaps exactly.

- [ ] **Step 8: Run Svelte autofixer for touched components**

Run the Svelte MCP `svelte-autofixer` on the full contents of each modified Svelte file in this task until it reports no issues:

- `+page.svelte`
- `TopBar.svelte`
- `GameMenu.svelte`
- `ControlDesk.svelte`
- `AudioSettings.svelte`

- [ ] **Step 9: Run touched tests**

Run: `bun run test:unit -- src/lib/components/game/GameMenu.svelte.spec.ts src/lib/components/game/TopBar.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/AudioSettings.svelte.spec.ts --run --project client`

Expected: PASS.

- [ ] **Step 10: Run Svelte check**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 11: Commit route and menu selector**

```bash
git add src/app.html src/routes/+page.svelte src/lib/components/game/TopBar.svelte src/lib/components/game/GameMenu.svelte src/lib/components/game/ControlDesk.svelte src/lib/components/game/AudioSettings.svelte src/lib/components/game/*.spec.ts
git commit -m "feat: add language selector"
```

---

### Task 5: Build, Inspectors, World, Saves, and Decisions

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/game/BuildMenu.svelte`
- Modify: `src/lib/components/game/BuildMenu.svelte.spec.ts`
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/WorldMap.svelte`
- Modify: `src/lib/components/game/WorldMap.svelte.spec.ts`
- Modify: `src/lib/components/game/SavePanel.svelte`
- Modify: `src/lib/components/game/SavePanel.svelte.spec.ts`
- Modify: `src/lib/components/game/DecisionQueue.svelte`
- Modify: `src/lib/components/game/DecisionQueue.svelte.spec.ts`

**Interfaces:**

- Consumes: `I18nBundle`
- Consumes: `formatPlacementBlockReason`
- Consumes: `localizeDecision`
- Consumes: `localizeWorldCityStatus`
- Adds prop to each component: `i18n: I18nBundle`

- [ ] **Step 1: Update tests to pass `i18n` and assert representative localized copy**

For each touched component spec:

- Import `createI18n`.
- Pass `i18n: createI18n('en')` to existing renders.
- Add one test that renders with `createI18n('ja')` or `createI18n('zh-Hant')` and verifies a visible fixed label is not English.

For `BuildMenu.svelte.spec.ts`, assert structured placement reasons render as English in `en`:

```ts
expect(page.getByText('Store limit reached')).toBeVisible();
```

- [ ] **Step 2: Run touched tests and verify they fail**

Run: `bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/WorldMap.svelte.spec.ts src/lib/components/game/SavePanel.svelte.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts --run --project client`

Expected: FAIL because components do not accept `i18n` or render localized text yet.

- [ ] **Step 3: Update route placement feedback state**

In `src/routes/+page.svelte`, change `placementFeedback` from `string | null` to `PlacementBlockReason | null`. Render placement feedback with:

- `formatPlacementBlockReason(placementFeedback, i18n)`
- Fallback prompt from `i18n.t('placement.chooseHighlightedTile')`

Pass `i18n` into BuildMenu, inspectors, WorldMap, SavePanel, and DecisionQueue.

- [ ] **Step 4: Update `BuildMenu.svelte`**

Use `i18n.labels.archetype`, `i18n.labels.material`, `i18n.labels.industrialBuilding`, and `formatPlacementBlockReason`. Replace all local `new Intl.NumberFormat('en-US')` usage with `i18n.format.currency`. Preserve image alt behavior unless the alt text is a fixed game-domain label, in which case use the localized label.

- [ ] **Step 5: Update retail and industry inspectors**

In `TileInspector.svelte` and `IndustryTileInspector.svelte`:

- Replace local `label(...)` conversions with `i18n.labels` for terrain, neighborhoods, resources, statuses, and materials.
- Replace upgrade copy, level copy, empty states, aria labels, and "not enough cash" with message keys.
- Replace local currency formatters with `i18n.format.currency`.
- Use `localizeStockTrouble` for attention copy.

- [ ] **Step 6: Update `WorldMap.svelte`**

Localize city names, kind labels, state labels, specialty summaries, unlock requirements, open-cost text, counts, inspector labels, and close aria labels. Use `i18n.format.integer` and `i18n.format.currency`.

- [ ] **Step 7: Update `SavePanel.svelte`**

Localize the modal labels, auto-save/manual slot copy, status labels, slot detail strings, and button labels. Keep manual slot names unchanged. Replace `Intl.DateTimeFormat('en-US')` with `i18n.format.dateTime`.

- [ ] **Step 8: Update `DecisionQueue.svelte`**

Render decisions through `localizeDecision(decision, i18n)`. Keep unknown historical decisions readable by falling back to stored title/context/options. Localize "expires day" and the empty queue copy.

- [ ] **Step 9: Run Svelte autofixer for touched components**

Run Svelte MCP `svelte-autofixer` on every modified Svelte file in this task until no issues are reported.

- [ ] **Step 10: Run touched tests**

Run: `bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/WorldMap.svelte.spec.ts src/lib/components/game/SavePanel.svelte.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts --run --project client`

Expected: PASS.

- [ ] **Step 11: Run placement and i18n tests**

Run: `bun run test:unit -- src/lib/game/placementPreview.spec.ts src/lib/i18n/gameCopy.spec.ts --run`

Expected: PASS.

- [ ] **Step 12: Commit build and inspector localization**

```bash
git add src/routes/+page.svelte src/lib/components/game src/lib/i18n src/lib/game/placementPreview.ts src/lib/game/placementPreview.spec.ts
git commit -m "feat: localize core game panels"
```

---

### Task 6: Management Panels, Store Detail, Staff, Stock, and Product Chains

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/game/PolicyPanel.svelte`
- Modify: `src/lib/components/game/PolicyPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/StaffPanel.svelte`
- Modify: `src/lib/components/game/StaffPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreOverview.svelte`
- Modify: `src/lib/components/game/StoreOverview.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreDetailModal.svelte`
- Modify: `src/lib/components/game/StoreDetailModal.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreStaffPanel.svelte`
- Modify: `src/lib/components/game/StoreStaffPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreProductChainPanel.svelte`
- Modify: `src/lib/components/game/StoreProductChainPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/ProductChainsPanel.svelte`
- Modify: `src/lib/components/game/ProductChainsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- Modify: `src/lib/components/game/Scorecard.svelte`
- Modify: `src/lib/components/game/Scorecard.svelte.spec.ts`
- Modify: `src/lib/components/game/ShortcutCheatSheet.svelte`
- Modify: `src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts`
- Modify: `src/lib/components/game/atlas/CategoryStampIndex.svelte`
- Modify: `src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts`
- Modify: `src/lib/components/game/atlas/NodeBroadside.svelte`
- Modify: `src/lib/components/game/atlas/NodeBroadside.svelte.spec.ts`
- Modify: `src/lib/components/game/atlas/LegendCartouche.svelte`

**Interfaces:**

- Consumes: `I18nBundle`
- Consumes: `localizeStockStatus`
- Consumes: `localizeProductChainGraph`
- Adds prop to each production game component in this task: `i18n: I18nBundle`

- [ ] **Step 1: Update component tests to pass `i18n`**

For each touched spec, import `createI18n` and pass `i18n: createI18n('en')`. Add representative non-English assertions in these specs:

- `PolicyPanel.svelte.spec.ts`: Japanese field label.
- `StoreStockTable.svelte.spec.ts`: Traditional Chinese table header.
- `ProductChainsPanel.svelte.spec.ts`: Japanese mode button.
- `NodeBroadside.svelte.spec.ts`: Japanese empty-state text.

- [ ] **Step 2: Run touched tests and verify they fail**

Run the component specs touched in this task with `--project client`.

Expected: FAIL because components do not accept `i18n` yet.

- [ ] **Step 3: Update route prop wiring**

In `src/routes/+page.svelte`, pass `{i18n}` to every management panel, store detail modal, product-chain panel, supply advisor, scorecard, reports, policy, staff, and shortcut component.

- [ ] **Step 4: Localize policy, reports, scorecard, shortcuts, and audio-adjacent panels**

Replace fixed labels with `i18n.t` or `i18n.labels`. Replace `Intl.NumberFormat('en-US')` with `i18n.format`. Use `i18n.labels.policyField`, `i18n.labels.policyValue`, and `i18n.labels.scoreKey`.

- [ ] **Step 5: Localize staff panels**

In `StaffPanel.svelte` and `StoreStaffPanel.svelte`:

- Keep staff and store names unchanged.
- Localize role names, assignment action labels, section headings, empty states, promotion copy, salary suffixes, level/progress copy, skill/morale labels, and coverage summaries.
- Use `i18n.format.currency`, `i18n.format.integer`, and `i18n.format.percent`.

- [ ] **Step 6: Localize store overview and stock table**

In `StoreOverview.svelte` and `StoreStockTable.svelte`:

- Keep store names and store locations unchanged.
- Display product/category names through `i18n.labels.productCategory`.
- Display `DailyProductReport.name` through `categoryId` lookup instead of stored report name.
- Localize stock statuses through `localizeStockStatus`.
- Localize input aria labels and table headings.
- Use locale formatters for currency, integers, and percentages.

- [ ] **Step 7: Localize store detail modal and nested product-chain panel**

In `StoreDetailModal.svelte` and `StoreProductChainPanel.svelte`:

- Localize tab labels, modal labels, close labels, product category selector labels, empty-state copy, and graph title display.
- Pass `i18n` into nested `StoreStockTable`, `StoreStaffPanel`, `StoreProductChainPanel`, `ProductChainAtlas`, and `NodeBroadside`.

- [ ] **Step 8: Localize product-chain management components**

In `ProductChainsPanel.svelte`, `CategoryStampIndex.svelte`, `NodeBroadside.svelte`, and `LegendCartouche.svelte`:

- Call `localizeProductChainGraph(graph, i18n)` before rendering atlas nodes.
- Display category summaries with `i18n.labels.productCategory(summary.categoryId)`.
- Localize health labels, mode buttons, broadside metrics, empty states, legend labels, shared-branch note, and graph warnings where known.
- Preserve graph IDs, node IDs, and edge IDs.

- [ ] **Step 9: Localize Supply Advisor**

Use product/material/building label helpers and localized action copy. Keep chain IDs and building IDs unchanged.

- [ ] **Step 10: Run Svelte autofixer for touched components**

Run Svelte MCP `svelte-autofixer` on every modified Svelte file in this task until no issues are reported.

- [ ] **Step 11: Run touched component tests**

Run: `bun run test:unit -- --project client --run`

Expected: PASS for the browser component project.

- [ ] **Step 12: Run Svelte check**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 13: Commit management and detail localization**

```bash
git add src/routes/+page.svelte src/lib/components/game src/lib/i18n
git commit -m "feat: localize management panels"
```

---

### Task 7: E2E Smoke and Full Verification

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**

- Consumes: visible language selector from `GameMenu.svelte`
- Consumes: persisted locale key `serpens.languagePreference.v1`

- [ ] **Step 1: Add failing e2e language-switching smoke**

Add a test near the existing top-level UI smoke tests:

```ts
test('switches language without resetting game state', async ({ page }) => {
	await page.goto('/');
	await expectRetailMapReady(page);

	await page.getByTestId('game-menu-trigger').click();
	await page.getByTestId('language-selector').selectOption('ja');

	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
	await expect(page.getByTestId('game-menu-trigger')).toBeVisible();
	await expect(page.getByTestId('language-selector')).not.toBeVisible();

	await page.getByTestId('game-menu-trigger').click();
	await expect(page.getByTestId('language-selector')).toHaveValue('ja');
	await expect(page.getByTestId('cash-readout')).toBeVisible();
	await expect(activeMapCanvas(page)).toHaveAttribute('data-terrain-asset-mode', 'image');
});
```

This test intentionally uses stable `data-testid` selectors for the menu trigger, language selector, and cash readout because their accessible names are localized.

- [ ] **Step 2: Run e2e smoke and verify it fails before final route wiring**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "switches language without resetting game state"`

Expected before implementation: FAIL because language selector does not exist. Expected after previous tasks: PASS.

- [ ] **Step 3: Verify e2e selectors stay narrow**

Confirm the e2e uses stable `data-testid` attributes only for controls whose accessible names are localized:

- `data-testid="game-menu-trigger"`
- `data-testid="language-selector"`
- `data-testid="cash-readout"`

Keep accessibility labels localized; use test ids only in the e2e.

- [ ] **Step 4: Run focused e2e smoke**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "switches language without resetting game state"`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run in order:

```bash
bun run check
bun run test:unit -- --run
bun run test:e2e
```

Expected: all commands PASS.

- [ ] **Step 6: Inspect remaining English-only production strings**

Run:

```bash
rg -n "new Intl\\.|toLocaleString\\('en-US'|>[^<{]*(Dashboard|Policies|Staff|Stores|Reports|Build|Advance Day|Saves|Warehouse flow|Product Chains|No .* yet|Close|Open for)[^<{]*<|aria-label=\"(Menu|Cash|Day|World map|City details|Build menu|Tile inspector)\"" src/routes/+page.svelte src/lib/components/game src/lib/game
```

Expected: No unreviewed production UI hits. Hits in pure game modules are acceptable only when they are historic saved prose fallback or raw validation messages that the UI wraps through `gameCopy.ts`.

- [ ] **Step 7: Commit e2e and verification cleanup**

```bash
git add src/routes/retail-sim.e2e.ts src/routes/+page.svelte src/lib/components/game src/lib/i18n
git commit -m "test: cover language switching"
```

---

## Self-Review

- Spec coverage: Tasks 1-2 cover typed first-party i18n, locale resolution, persistence, fallback, formatters, and game ID labels. Tasks 3-6 cover active UI copy, structured placement messages, route-owned locale state, game menu selector, `document.lang`, and production components. Task 7 covers e2e language switching and final verification.
- Scope: The plan excludes demo routes, docs localization, image assets, generated/player-entered names, historical saved prose migration, and per-save language selection.
- Type consistency: All component tasks consume a single `I18nBundle`; all runtime tasks produce the same `SupportedLocale` and `createI18n` interface.
- Verification: Each task has a focused test command and commit checkpoint. Final verification runs `bun run check`, full unit tests, and full e2e.
