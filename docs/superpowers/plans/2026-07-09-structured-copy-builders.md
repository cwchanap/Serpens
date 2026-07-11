# Structured Copy Builders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace regex-parsed English string copy builders in `gameCopy.ts` with structured-code objects emitted by game-core modules, eliminating silent drift to English when game builders change their string formats.

**Architecture:** Define discriminated-union types (`DecisionContext`, `BottleneckInfo`, `EdgeLabelInfo`, `GraphWarning`) that carry a `code` string plus typed params. Game-core modules emit these structured objects instead of English strings. `gameCopy.ts` switches on `code` and calls `i18n.t` with the params — no regex parsing. The save codec validates the new shapes and migrates old string contexts by dropping them (per the unreleased legacy policy).

**Tech Stack:** TypeScript, Svelte 5 runes, SvelteKit, Vitest (server + browser projects), Bun.

## Global Constraints

- Supported locales are exactly `en`, `zh-Hant`, and `ja`.
- The game is unreleased; in-development autosaves are not legacy data that must be preserved. Old string contexts/warnings are dropped during migration, not reverse-parsed.
- `SAVE_SCHEMA_VERSION` bumps from 6 to 7. `MIGRATABLE_SCHEMA_VERSIONS` becomes `[4, 5, 6]`.
- Missing translations fall back to English and must not crash gameplay.
- **`WorldCityDefinition.unlockRequirement` is a free-form English sentence** (e.g. `'Reach 2 stores or day 7.'`), NOT a milestone id. The city→milestone mapping only exists implicitly inside `refreshWorldProgress`. Therefore `worldCityNotAvailableYet` carries a `cityId: WorldCityId`; localization resolves the human requirement text from translation keys keyed by `cityId` (stable enum), never by casting the English string to `WorldMilestoneId`.
- Structured game-core types (`DecisionContext`, `ProductChainNode`, etc.) carry `{ code, ...params }`. Pre-localized display strings live in parallel `Localized*` types in `src/lib/i18n/localizedTypes.ts`. The `localize*` functions in `gameCopy.ts` are the only bridge. Svelte components render `Localized*` types; they must never render a structured object directly.
- Every Vitest test must contain an `expect` (`requireAssertions: true`).
- Unit specs live next to source as `<name>.spec.ts`; Svelte component specs use `.svelte.spec.ts` and run in the `client` project.
- Before editing Svelte files, follow the repo Svelte MCP flow: `list-sections`, `get-documentation`, `svelte-autofixer`.
- Run `bun run check` for typecheck, `bun run lint` for Prettier + ESLint, `bun run test:unit -- --run` for all unit tests.

---

## File Structure

### New files

- `src/lib/game/decisionContext.ts` — `DecisionContext` discriminated union type + constructor helpers.
- `src/lib/game/decisionContext.spec.ts` — unit tests for constructor helpers.

### New files — localized view types (i18n layer)

- `src/lib/i18n/localizedTypes.ts` — `LocalizedDecision`, `LocalizedWorldCityStatus`, `LocalizedProductChainNode`, `LocalizedProductChainEdge`, `LocalizedProductChainGraph`, `LocalizedProductChainCategorySummary`. These mirror their structured counterparts but carry pre-localized `string` fields (`context`, `bottleneck`, `label`, `warnings`). The structured game-core types carry structured objects; these localized types carry display strings. The boundary is `localize*` in `gameCopy.ts`.

### Modified files — game core (emit structured objects)

- `src/lib/game/types.ts` — widen `DecisionItem.context` from `string` to `DecisionContext`.
- `src/lib/game/state.ts` — decision generators emit `DecisionContext` instead of English strings.
- `src/lib/game/placement.ts` — duplicate `locationUnavailableDecision` emits `DecisionContext`.
- `src/lib/game/world.ts` — `worldDecision` and `getWorldCityStatus` emit `DecisionContext`. **`WorldCityStatus.blockedReason` widens from `string | null` to `DecisionContext | null`.** This ripples into the i18n layer and every `blockedReason` consumer (see below).
- `src/lib/game/industryPlacement.ts` — `getIndustrialPlacementBlockReason`/`getIndustrialPlacementBlockReasonWithContext` return `DecisionContext | null`; all three `buildIndustrialBuilding` delay branches emit `DecisionContext`; `industrialConstructionDelayedDecision` emits `DecisionContext`.
- `src/lib/game/productChainGraph.ts` — `ProductChainNode.bottleneck` becomes `BottleneckInfo`; `ProductChainEdge.label` becomes `EdgeLabelInfo`; `ProductChainGraph.warnings` becomes `GraphWarning[]`; `ProductChainCategorySummary.bottleneck` becomes `BottleneckInfo`.
- `src/lib/game/productChainTree.ts` — emit `GraphWarning` instead of string warnings; `buildStoreCategoryChainSummaries` propagates `BottleneckInfo`.

### Modified files — i18n layer (consume structured objects)

- `src/lib/i18n/localizedTypes.ts` — (new, see above) the localized view types.
- `src/lib/i18n/gameCopy.ts` — replace all regex-based builders with `switch (code)` dispatchers. `localizeDecision` returns `LocalizedDecision`; `localizeWorldCityStatus` returns `LocalizedWorldCityStatus`; `localizeProductChainGraph` returns `LocalizedProductChainGraph`; add `localizeProductChainCategorySummary` (or localize summaries in-panel). **`localizeWorldCityStatus` (the cash-regex consumer at ~line 590-622) is explicitly in scope — it is the actual regex site for world-city cash strings.**
- `src/lib/i18n/gameCopy.spec.ts` — update golden-phrase tests to call real game builders.

### Modified files — Svelte components (retype to localized view types)

- `src/lib/components/game/DecisionQueue.svelte` — props/locals use `LocalizedDecision` (context is a string it already renders).
- `src/lib/components/game/WorldMap.svelte` — renders `LocalizedWorldCityStatus.blockedReason` (string); already calls `localizeWorldCityStatus`, verify all render sites use the localized status, not the raw `WorldCityStatus`.
- `src/lib/components/game/atlas/NodeBroadside.svelte`, `ChainNode.svelte`, `ChainRoute.svelte`, `ProductChainAtlas.svelte` — props retype to the `Localized*` node/edge/graph types (`bottleneck`/`label` are strings they already render).
- `src/lib/components/game/atlas/CategoryStampIndex.svelte` — consumes `LocalizedProductChainCategorySummary`.
- `src/lib/components/game/ProductChainsPanel.svelte`, `StoreProductChainPanel.svelte` — already call `localizeProductChainGraph`; ensure they pass and bind the `Localized*` graph and localize summaries for display.
- `src/routes/+page.svelte` — line ~251 hand-builds `blockedReason: city.unlockRequirement`; must emit a `DecisionContext` instead.

### Modified files — persistence

- `src/lib/persistence/saveTypes.ts` — bump `SAVE_SCHEMA_VERSION` to 7.
- `src/lib/persistence/saveCodec.ts` — add v6→v7 migration (drop old string contexts/warnings), validate `DecisionContext` / `BottleneckInfo` / `EdgeLabelInfo` / `GraphWarning`.
- `src/lib/persistence/saveCodec.spec.ts` — add v6→v7 migration test.

### Modified files — tests (update fixtures)

- `src/lib/game/state.spec.ts` — update decision context assertions.
- `src/lib/game/world.spec.ts` — update world-city decision assertions.
- `src/lib/game/industryPlacement.spec.ts` — update industrial construction assertions.
- `src/lib/game/productChainGraph.spec.ts` — update bottleneck/edge/warning assertions.
- `src/lib/game/productChainTree.spec.ts` — update warning assertions.
- `src/lib/game/mapRender.spec.ts` — if it asserts on decision contexts.
- `src/lib/components/game/DecisionQueue.svelte.spec.ts` — if it asserts on context strings.
- `src/lib/components/game/WorldMap.svelte.spec.ts` — asserts on `blockedReason` strings (lines ~14, ~139); update to localize through `localizeWorldCityStatus` or assert structured `DecisionContext` on the raw status.
- `src/lib/components/game/ProductChainsPanel.svelte.spec.ts` — if it asserts on graph strings.
- `src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts`, `ChainNode.svelte.spec.ts`, `NodeBroadside.svelte.spec.ts`, `ChainRoute.svelte.spec.ts` — update if they assert on `bottleneck`/`label` strings (these receive localized props, so likely unchanged, but verify).

---

## Task 1: Define DecisionContext type and constructors

**Files:**
- Create: `src/lib/game/decisionContext.ts`
- Create: `src/lib/game/decisionContext.spec.ts`
- Modify: `src/lib/game/types.ts:477-483` (widen `DecisionItem.context`)

**Interfaces:**
- Produces: `DecisionContext` union type, `decisionContext.*` constructor helpers.

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/decisionContext.spec.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import {
	decisionContextExpansionUnavailable,
	decisionContextExpansionCashBlocked,
	decisionContextLocationBlocked,
	decisionContextLocationGeneric,
	decisionContextWorldCityOpeningCost,
	decisionContextWorldCityUnknown,
	decisionContextWorldCityNotAvailableYet,
	decisionContextIndustrialUnknownTile,
	decisionContextIndustrialUnknownBuilding,
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialOccupiedTile,
	decisionContextIndustrialRequiresResource,
	decisionContextIndustrialRequiresIndustrialTile,
	decisionContextIndustrialRequiresCash
} from './decisionContext';

describe('decisionContext constructors', () => {
	test('each constructor produces the expected code and params', () => {
		expect.assertions(14);
		expect(decisionContextExpansionUnavailable(5)).toEqual({
			code: 'expansionUnavailable',
			storeCap: 5
		});
		expect(decisionContextExpansionCashBlocked(15_000)).toEqual({
			code: 'expansionCashBlocked',
			cash: 15_000
		});
		expect(decisionContextLocationBlocked('locked')).toEqual({
			code: 'locationBlocked',
			reason: 'locked'
		});
		expect(decisionContextLocationBlocked('road')).toEqual({
			code: 'locationBlocked',
			reason: 'road'
		});
		expect(decisionContextLocationBlocked('river')).toEqual({
			code: 'locationBlocked',
			reason: 'river'
		});
		expect(decisionContextLocationGeneric()).toEqual({ code: 'locationGeneric' });
		expect(decisionContextWorldCityOpeningCost(18_000)).toEqual({
			code: 'worldCityOpeningCost',
			cash: 18_000
		});
		expect(decisionContextWorldCityUnknown()).toEqual({ code: 'worldCityUnknown' });
		expect(decisionContextWorldCityNotAvailableYet('campus-junction')).toEqual({
			code: 'worldCityNotAvailableYet',
			cityId: 'campus-junction'
		});
		expect(decisionContextIndustrialUnknownTile()).toEqual({ code: 'industrialUnknownTile' });
		expect(decisionContextIndustrialUnknownBuilding()).toEqual({
			code: 'industrialUnknownBuilding'
		});
		expect(decisionContextIndustrialLockedTile()).toEqual({ code: 'industrialLockedTile' });
		expect(decisionContextIndustrialOccupiedTile()).toEqual({
			code: 'industrialOccupiedTile'
		});
		expect(decisionContextIndustrialRequiresCash('grain-farm', 1_000)).toEqual({
			code: 'industrialRequiresCash',
			buildingTypeId: 'grain-farm',
			cash: 1_000
		});
	});

	test('industrialRequiresResource carries the resource id', () => {
		expect.assertions(1);
		expect(decisionContextIndustrialRequiresResource('farmland')).toEqual({
			code: 'industrialRequiresResource',
			resourceId: 'farmland'
		});
	});

	test('industrialRequiresIndustrialTile carries no params', () => {
		expect.assertions(1);
		expect(decisionContextIndustrialRequiresIndustrialTile()).toEqual({
			code: 'industrialRequiresIndustrialTile'
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/decisionContext.spec.ts --run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/game/decisionContext.ts`:

```typescript
import type { IndustrialBuildingTypeId } from './industry';
import type { WorldCityId, WorldMilestoneId } from './world';

export type DecisionContext =
	| { code: 'expansionUnavailable'; storeCap: number }
	| { code: 'expansionCashBlocked'; cash: number }
	| { code: 'locationBlocked'; reason: 'locked' | 'road' | 'river' }
	| { code: 'locationGeneric' }
	| { code: 'worldCityOpeningCost'; cash: number }
	| { code: 'worldCityUnknown' }
	| { code: 'worldCityNotAvailableYet'; cityId: WorldCityId }
	| { code: 'industrialUnknownTile' }
	| { code: 'industrialUnknownBuilding' }
	| { code: 'industrialLockedTile' }
	| { code: 'industrialOccupiedTile' }
	| { code: 'industrialRequiresResource'; resourceId: string }
	| { code: 'industrialRequiresIndustrialTile' }
	| { code: 'industrialRequiresCash'; buildingTypeId: IndustrialBuildingTypeId; cash: number };

export const decisionContextExpansionUnavailable = (storeCap: number): DecisionContext => ({
	code: 'expansionUnavailable',
	storeCap
});

export const decisionContextExpansionCashBlocked = (cash: number): DecisionContext => ({
	code: 'expansionCashBlocked',
	cash
});

export const decisionContextLocationBlocked = (
	reason: 'locked' | 'road' | 'river'
): DecisionContext => ({ code: 'locationBlocked', reason });

export const decisionContextLocationGeneric = (): DecisionContext => ({ code: 'locationGeneric' });

export const decisionContextWorldCityOpeningCost = (cash: number): DecisionContext => ({
	code: 'worldCityOpeningCost',
	cash
});

export const decisionContextWorldCityUnknown = (): DecisionContext => ({ code: 'worldCityUnknown' });

export const decisionContextWorldCityNotAvailableYet = (
	cityId: WorldCityId
): DecisionContext => ({ code: 'worldCityNotAvailableYet', cityId });

export const decisionContextIndustrialUnknownTile = (): DecisionContext => ({
	code: 'industrialUnknownTile'
});

export const decisionContextIndustrialUnknownBuilding = (): DecisionContext => ({
	code: 'industrialUnknownBuilding'
});

export const decisionContextIndustrialLockedTile = (): DecisionContext => ({
	code: 'industrialLockedTile'
});

export const decisionContextIndustrialOccupiedTile = (): DecisionContext => ({
	code: 'industrialOccupiedTile'
});

export const decisionContextIndustrialRequiresResource = (resourceId: string): DecisionContext => ({
	code: 'industrialRequiresResource',
	resourceId
});

export const decisionContextIndustrialRequiresIndustrialTile = (): DecisionContext => ({
	code: 'industrialRequiresIndustrialTile'
});

export const decisionContextIndustrialRequiresCash = (
	buildingTypeId: IndustrialBuildingTypeId,
	cash: number
): DecisionContext => ({ code: 'industrialRequiresCash', buildingTypeId, cash });
```

- [ ] **Step 4: Widen DecisionItem.context in types.ts**

In `src/lib/game/types.ts`, change the `context` field:

```typescript
import type { DecisionContext } from './decisionContext';

export interface DecisionItem {
	id: string;
	title: string;
	context: DecisionContext;
	expiresOnDay: number;
	options: DecisionOption[];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/decisionContext.spec.ts --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/decisionContext.ts src/lib/game/decisionContext.spec.ts src/lib/game/types.ts
git commit -m "feat: add DecisionContext structured type for locale-neutral decision contexts"
```

---

## Task 1b: Stabilize TilePlacementBlockReason as a code union

**Files:**
- Modify: `src/lib/game/city.ts:4, 22-26, 174-188, 194-198` (`TilePlacementBlockReason` type, `TILE_PLACEMENT_BLOCK_DECISION_ID_PART`, `getTilePlacementBlockReason`, `getTilePlacementBlockDecisionIdPart`)
- Modify: `src/lib/game/storeFootprint.ts:8, 82-108` (`StoreFootprintPlacementBlockReason`, `getStoreFootprintPlacementBlockReason`)
- Modify: `src/lib/game/placementPreview.ts:271-298` (priority loop + `mapRetailFootprintBlockReason`)
- Modify: `src/lib/game/state.ts:444-447` (`toExpansionTileBlockReason`)
- Modify: `src/lib/game/placement.ts:230-233` (`toTilePlacementDecisionReason`)
- Modify: `src/lib/game/storeFootprint.spec.ts` (update assertions)
- Modify: `src/lib/game/placement.spec.ts` (update assertions)
- Modify: `src/lib/game/state.spec.ts` (update assertions)
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts` (update assertions)

**Interfaces:**
- Produces: `TilePlacementBlockReason` changes from English string literals to stable codes `'locked' | 'road' | 'river'`. `StoreFootprintPlacementBlockReason` changes to `'locked' | 'road' | 'river' | 'occupied'`.

**Motivation:** The plan's Task 2 `locationUnavailableDecision` matches English literals (`reason === 'Locked location'`) sourced from the `TilePlacementBlockReason` union in `city.ts:4`. A wording change would silently fall back to `locationGeneric`. Making the reason a stable code at its source eliminates this drift risk entirely — the `DecisionContext.locationBlocked.reason` field already uses `'locked' | 'road' | 'river'`, so the mapping becomes identity instead of English-string matching.

- [ ] **Step 1: Write the failing test**

In `src/lib/game/storeFootprint.spec.ts`, update the existing assertions from English strings to stable codes:

```typescript
test('returns locked when the footprint extends beyond the map', () => {
	expect.assertions(1);
	// ... same setup ...
	expect(getStoreFootprintPlacementBlockReason(lookup, corner)).toBe('locked');
});

test('returns road when a non-anchor footprint tile is a road', () => {
	expect.assertions(1);
	// ... same setup ...
	expect(getStoreFootprintPlacementBlockReason(createCityTileLookup(city), anchor)).toBe('road');
});

test('returns river when a non-anchor footprint tile is a river', () => {
	expect.assertions(1);
	// ... same setup ...
	expect(getStoreFootprintPlacementBlockReason(createCityTileLookup(city), anchor)).toBe('river');
});

test('returns locked when a non-anchor footprint tile is locked', () => {
	expect.assertions(1);
	// ... same setup ...
	expect(getStoreFootprintPlacementBlockReason(createCityTileLookup(city), anchor)).toBe('locked');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/storeFootprint.spec.ts --run`
Expected: FAIL — assertions still expect English strings.

- [ ] **Step 3: Change TilePlacementBlockReason to stable codes**

In `src/lib/game/city.ts`, change the type and all its producers:

```typescript
export type TilePlacementBlockReason = 'locked' | 'road' | 'river';

const TILE_PLACEMENT_BLOCK_DECISION_ID_PART: Record<TilePlacementBlockReason, string> = {
	locked: 'locked',
	road: 'road',
	river: 'river'
};

export function getTilePlacementBlockReason(tile: CityTile): TilePlacementBlockReason | null {
	if (tile.locked) {
		return 'locked';
	}

	if (tile.feature === 'road') {
		return 'road';
	}

	if (tile.feature === 'river') {
		return 'river';
	}

	return null;
}
```

`getTilePlacementBlockDecisionIdPart` stays the same — it already looks up `TILE_PLACEMENT_BLOCK_DECISION_ID_PART[reason]`, which now maps codes to themselves. The decision id format (`location-unavailable-locked-1`, etc.) is unchanged.

- [ ] **Step 4: Update StoreFootprintPlacementBlockReason**

In `src/lib/game/storeFootprint.ts`, change the type and `getStoreFootprintPlacementBlockReason`:

```typescript
export type StoreFootprintPlacementBlockReason = TilePlacementBlockReason | 'occupied';

export function getStoreFootprintPlacementBlockReason(
	lookup: CityTileLookup,
	anchorTile: CityTile,
	occupiedTileIds: ReadonlySet<string> = new Set()
): StoreFootprintPlacementBlockReason | null {
	const footprint = getRetailStoreFootprint(lookup, anchorTile);

	if (footprint.missingCoordinates.length > 0) {
		return 'locked';
	}

	for (const tile of footprint.tiles) {
		const tileBlockReason = getTilePlacementBlockReason(tile);
		if (tileBlockReason) {
			return tileBlockReason;
		}
	}

	for (const tile of footprint.tiles) {
		if (occupiedTileIds.has(tile.id)) {
			return 'occupied';
		}
	}

	return null;
}
```

- [ ] **Step 5: Update placementPreview.ts**

In `src/lib/game/placementPreview.ts`, update the priority loop and `mapRetailFootprintBlockReason` to match on stable codes:

```typescript
for (const reason of ['occupied', 'locked', 'road', 'river'] as const) {
	if (footprintReasons.has(reason)) {
		return mapRetailFootprintBlockReason(reason);
	}
}

// ...

function mapRetailFootprintBlockReason(
	reason: StoreFootprintPlacementBlockReason
): PlacementBlockReason {
	switch (reason) {
		case 'occupied':
			return { code: 'retail.occupiedLocation' };
		case 'locked':
			return { code: 'retail.lockedLocation' };
		case 'road':
			return { code: 'retail.roadLocation' };
		case 'river':
			return { code: 'retail.riverLocation' };
	}
}
```

The `PlacementBlockReason` codes (`retail.lockedLocation`, etc.) are unchanged — they are i18n keys, not the raw reason values.

- [ ] **Step 6: Update state.ts and placement.ts passthrough functions**

In `src/lib/game/state.ts`, update `toExpansionTileBlockReason`:

```typescript
function toExpansionTileBlockReason(
	reason: StoreFootprintPlacementBlockReason
): TilePlacementBlockReason | null {
	return reason === 'occupied' ? null : reason;
}
```

In `src/lib/game/placement.ts`, update `toTilePlacementDecisionReason`:

```typescript
function toTilePlacementDecisionReason(
	reason: StoreFootprintPlacementBlockReason
): TilePlacementBlockReason | null {
	return reason === 'occupied' ? null : reason;
}
```

- [ ] **Step 7: Update spec assertions**

Update all spec files that assert on the English string values. In `placement.spec.ts`, the `toThrow` assertions change from `Road location: ${tileId}` to `road: ${tileId}` (or whatever format the error message uses — check `getTilePlacementBlockReason` callers that throw). In `state.spec.ts`, the context assertions will be updated in Task 2 when the context becomes a `DecisionContext` object. In `TileInspector.svelte.spec.ts`, update `getByText('Road location')` to `getByText('road')` or the localized display text (check what the component actually renders — it may render the localized label from `placementPreview`, not the raw reason).

- [ ] **Step 8: Run tests**

Run: `bun run test:unit -- src/lib/game/storeFootprint.spec.ts src/lib/game/placement.spec.ts src/lib/game/state.spec.ts --run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/city.ts src/lib/game/storeFootprint.ts src/lib/game/placementPreview.ts src/lib/game/state.ts src/lib/game/placement.ts src/lib/game/storeFootprint.spec.ts src/lib/game/placement.spec.ts src/lib/game/state.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts
git commit -m "refactor: stabilize TilePlacementBlockReason as code union instead of English literals"
```

---

## Task 2: Update decision generators in state.ts

**Files:**
- Modify: `src/lib/game/state.ts:477-512` (expansion + location decision generators)
- Modify: `src/lib/game/state.spec.ts` (update context assertions)

**Interfaces:**
- Consumes: `DecisionContext` constructors from Task 1.
- Produces: `state.ts` decision generators emit `DecisionContext` instead of `string`.

- [ ] **Step 1: Write the failing test**

In `src/lib/game/state.spec.ts`, add a test that asserts the structured context shape. Find an existing test that triggers `expansionUnavailableDecision` (store cap reached) and update its context assertion from a string to the structured object:

```typescript
test('expansion unavailable decision carries structured context', () => {
	expect.assertions(2);
	const game = { ...createBaseGame(), storeCap: 1, stores: [createBaseGame().stores[0]!] };
	const result = openStoreAtTile(game, { archetypeId: 'convenience', tileId: 'some-tile' });
	const decision = result.decisions.find((d) => d.id.startsWith('expansion-unavailable'));
	expect(decision).toBeDefined();
	expect(decision?.context).toEqual({ code: 'expansionUnavailable', storeCap: 1 });
});
```

Also add a test for `locationUnavailableDecision`:

```typescript
test('location unavailable decision carries structured context for locked tile', () => {
	expect.assertions(2);
	const game = createBaseGame();
	const result = openStoreAtTile(game, { archetypeId: 'convenience', tileId: 'locked-tile-id' });
	const decision = result.decisions.find((d) => d.id.startsWith('location-unavailable'));
	expect(decision).toBeDefined();
	expect(decision?.context).toEqual({ code: 'locationBlocked', reason: 'locked' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/state.spec.ts --run -t "structured context"`
Expected: FAIL — context is still a string.

- [ ] **Step 3: Update state.ts decision generators**

In `src/lib/game/state.ts`, update `expansionUnavailableDecision`:

```typescript
import {
	decisionContextExpansionUnavailable,
	decisionContextExpansionCashBlocked,
	decisionContextLocationBlocked,
	decisionContextLocationGeneric
} from './decisionContext';

function expansionUnavailableDecision(game: GameState): DecisionItem {
	return {
		id: `expansion-unavailable-${game.day}`,
		title: 'Expansion unavailable',
		context: decisionContextExpansionUnavailable(game.storeCap),
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}

function expansionCashBlockedDecision(game: GameState, setupCost: number): DecisionItem {
	return {
		id: `expansion-cash-blocked-${game.day}`,
		title: 'Expansion delayed',
		context: decisionContextExpansionCashBlocked(setupCost),
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}

function locationUnavailableDecision(
	game: GameState,
	reason?: TilePlacementBlockReason | null
): DecisionItem {
	const idPart = getTilePlacementBlockDecisionIdPart(reason);

	return {
		id: `location-unavailable${idPart ? `-${idPart}` : ''}-${game.day}`,
		title: 'Location unavailable',
		// After Task 1b, TilePlacementBlockReason is already 'locked' | 'road' | 'river'
		// — no English-literal matching needed. The reason IS the stable code.
		context: reason
			? decisionContextLocationBlocked(reason)
			: decisionContextLocationGeneric(),
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/state.spec.ts --run -t "structured context"`
Expected: PASS.

- [ ] **Step 5: Run full state.spec.ts to check for regressions**

Run: `bun run test:unit -- src/lib/game/state.spec.ts --run`
Expected: PASS — update any other assertions that check `.context` as a string.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/state.ts src/lib/game/state.spec.ts
git commit -m "feat: emit structured DecisionContext from state.ts decision generators"
```

---

## Task 3: Update decision generators in placement.ts

**Files:**
- Modify: `src/lib/game/placement.ts:278-300` (duplicate `locationUnavailableDecision`)

**Interfaces:**
- Consumes: `DecisionContext` constructors from Task 1.
- Produces: `placement.ts` decision generators emit `DecisionContext`.

- [ ] **Step 1: Update placement.ts locationUnavailableDecision**

Apply the same change as Task 2 Step 3 to the duplicate `locationUnavailableDecision` in `src/lib/game/placement.ts`. Import the same constructors and replace the string context with structured objects.

- [ ] **Step 2: Run placement-related tests**

Run: `bun run test:unit -- src/lib/game/placement.spec.ts --run`
Expected: PASS — update any context string assertions.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/placement.ts src/lib/game/placement.spec.ts
git commit -m "feat: emit structured DecisionContext from placement.ts locationUnavailableDecision"
```

---

## Task 4: Update decision generators in world.ts

**Files:**
- Modify: `src/lib/game/world.ts:197-223, 240-248, 312-353` (`getWorldCityStatus` + `blockedReason`, `worldDecision`, `openWorldCity`) and the `WorldCityStatus` interface (~line 38-44)
- Modify: `src/lib/game/world.spec.ts` (update context assertions)
- Modify: `src/routes/+page.svelte:~251` (hand-built `blockedReason` must become a `DecisionContext`)
- Modify: `src/lib/components/game/WorldMap.svelte` (verify it renders the **localized** status, not the raw `WorldCityStatus`)
- Modify: `src/lib/components/game/WorldMap.svelte.spec.ts` (blockedReason fixtures)

**Interfaces:**
- Consumes: `DecisionContext` constructors from Task 1.
- Produces: `world.ts` decision generators emit `DecisionContext`.

- [ ] **Step 1: Write the failing test**

In `src/lib/game/world.spec.ts`, add a test that calls `openWorldCity` with insufficient cash and asserts the structured context. The fixture must **reveal** `campus-junction` (so it skips the "not available yet" branch and reaches the cash branch):

```typescript
test('openWorldCity with insufficient cash emits structured openingCost context', () => {
	expect.assertions(2);
	const base = createBaseGame();
	const game: GameState = {
		...base,
		cash: 1_000,
		world: {
			...base.world,
			revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
		}
	};
	const result = openWorldCity(game, 'campus-junction');
	const decision = result.decisions.find((d) => d.id.startsWith('world-city'));
	expect(decision).toBeDefined();
	expect(decision?.context).toEqual({ code: 'worldCityOpeningCost', cash: 18_000 });
});
```

And a test for the "not available yet" branch (locked/unrevealed city), asserting it carries the **cityId**, not the English requirement string:

```typescript
test('openWorldCity on an unrevealed city emits cityId in the context', () => {
	expect.assertions(2);
	const game = createBaseGame();
	const result = openWorldCity(game, 'campus-junction');
	const decision = result.decisions.find((d) => d.id.startsWith('world-city'));
	expect(decision).toBeDefined();
	expect(decision?.context).toEqual({ code: 'worldCityNotAvailableYet', cityId: 'campus-junction' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/world.spec.ts --run -t "structured openingCost"`
Expected: FAIL.

- [ ] **Step 3: Update world.ts**

Update `worldDecision` to accept `DecisionContext` instead of `string`. **Note:** the decision id is now derived from `context.code`, which changes observable id formats (logged in saves/tests). This is acceptable for an unreleased game — just flag it.

```typescript
import {
	decisionContextWorldCityOpeningCost,
	decisionContextWorldCityUnknown,
	decisionContextWorldCityNotAvailableYet
} from './decisionContext';
import type { DecisionContext } from './decisionContext';

function worldDecision(game: GameState, title: string, context: DecisionContext): DecisionItem {
	return {
		id: ['world-city', toDecisionIdPart(title), toDecisionIdPart(context.code), game.day].join('-'),
		title,
		context,
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}
```

Update `openWorldCity` calls — note the "not available yet" branch now carries the **cityId** (a stable enum), not the English `unlockRequirement` string:

- `worldDecision(game, 'City unavailable', decisionContextWorldCityUnknown())`
- `worldDecision(game, 'City is not available yet', decisionContextWorldCityNotAvailableYet(city.id))`
- `worldDecision(game, 'City opening delayed', decisionContextWorldCityOpeningCost(city.openingCost))`

**Widen `WorldCityStatus.blockedReason`** and update `getWorldCityStatus`. `blockedReason` changes from `string | null` to `DecisionContext | null`. This is a breaking change to a type consumed by `+page.svelte`, `WorldMap.svelte`, and `localizeWorldCityStatus` — all addressed in this plan.

```typescript
export interface WorldCityStatus {
	city: WorldCityDefinition;
	state: WorldCityState;
	canOpen: boolean;
	blockedReason: DecisionContext | null; // was: string | null
	storeCount: number;
	buildingCount: number;
}

export function getWorldCityStatus(game: GameState, cityId: string): WorldCityStatus | null {
	const city = getWorldCityDefinition(cityId);
	if (!city) return null;

	const opened = game.world.openedCityIds.includes(city.id);
	const revealed = game.world.revealedCityIds.includes(city.id);
	const state: WorldCityState = opened ? 'opened' : revealed ? 'revealed' : 'locked';
	const storeCount = game.stores.filter((store) => store.cityId === city.id).length;
	const buildingCount = game.industrialBuildings.filter(
		(building) => building.cityId === city.id
	).length;
	const blockedReason: DecisionContext | null =
		state === 'locked'
			? decisionContextWorldCityNotAvailableYet(city.id)
			: state === 'revealed' && game.cash < city.openingCost
				? decisionContextWorldCityOpeningCost(city.openingCost)
				: null;

	return {
		city,
		state,
		canOpen: state === 'revealed' && game.cash >= city.openingCost,
		blockedReason,
		storeCount,
		buildingCount
	};
}
```

**Update `src/routes/+page.svelte` (~line 251)** which hand-builds a `WorldCityStatus` with `blockedReason: city.unlockRequirement`. Replace it with `decisionContextWorldCityNotAvailableYet(city.id)` (the locked-city case), or better, call `getWorldCityStatus(game, city.id)` directly so there is one constructor. The raw `city.unlockRequirement` string must not leak into `blockedReason`.

**`WorldMap.svelte` must render the localized status.** It already calls `localizeWorldCityStatus` (2 call sites). Verify every `{status.blockedReason}` / `{selectedStatus.blockedReason}` render site is bound to a `LocalizedWorldCityStatus` (whose `blockedReason` is a `string`), never the raw `WorldCityStatus`. The localization of `blockedReason` happens in Task 6 (`localizeWorldCityStatus` switch).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/world.spec.ts --run`
Expected: PASS — update any other context assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/world.ts src/lib/game/world.spec.ts
git commit -m "feat: emit structured DecisionContext from world.ts decision generators"
```

---

## Task 5: Update decision generators in industryPlacement.ts

**Files:**
- Modify: `src/lib/game/industryPlacement.ts:38-50` (wrapper `getIndustrialPlacementBlockReason`), `:68-121` (`getIndustrialPlacementBlockReasonWithContext`), `:32-36` (`IndustrialConstructionDelay`), `:132-182` (`buildIndustrialBuilding` — **all three delay branches**), `:257-274` (`industrialConstructionDelayedDecision`)
- Modify: `src/lib/game/industryPlacement.spec.ts`

**Interfaces:**
- Consumes: `DecisionContext` constructors from Task 1.
- Produces: `industryPlacement.ts` emits `DecisionContext` for industrial construction delays.

- [ ] **Step 1: Refactor getIndustrialPlacementBlockReasonWithContext**

Change the return type from `string | null` to `DecisionContext | null`. Replace each English string return with the corresponding constructor:

```typescript
import {
	decisionContextIndustrialUnknownTile,
	decisionContextIndustrialUnknownBuilding,
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialOccupiedTile,
	decisionContextIndustrialRequiresResource,
	decisionContextIndustrialRequiresIndustrialTile
} from './decisionContext';
import type { DecisionContext } from './decisionContext';

export function getIndustrialPlacementBlockReasonWithContext(
	context: IndustrialPlacementContext,
	tileId: string,
	buildingTypeId: IndustrialBuildingTypeId
): DecisionContext | null {
	// ... same logic, but return structured objects instead of strings
	if (!tile) return decisionContextIndustrialUnknownTile();
	if (!buildingType) return decisionContextIndustrialUnknownBuilding();
	if (tile.locked) return decisionContextIndustrialLockedTile();
	// ... etc.
	if (buildingType.requiredResource && tile.resource !== buildingType.requiredResource) {
		return decisionContextIndustrialRequiresResource(buildingType.requiredResource);
	}
	if (buildingType.requiresIndustrialTile && /* ... */) {
		return decisionContextIndustrialRequiresIndustrialTile();
	}
	return null;
}
```

Also update `getIndustrialPlacementBlockReason` (the wrapper at line 38-50) to return `DecisionContext | null`. It currently hardcodes `'Unknown industrial tile'` at line 46 when the placement context cannot be created — replace that with `decisionContextIndustrialUnknownTile()`:

```typescript
export function getIndustrialPlacementBlockReason(
	game: GameState,
	tileId: string,
	buildingTypeId: IndustrialBuildingTypeId
): DecisionContext | null {
	const context = createIndustrialPlacementContext(game);
	if (!context) {
		return decisionContextIndustrialUnknownTile();
	}
	return getIndustrialPlacementBlockReasonWithContext(context, tileId, buildingTypeId);
}
```

- [ ] **Step 2: Update buildIndustrialBuilding — ALL THREE delay branches**

`buildIndustrialBuilding` (line 132-182) has **three** branches that create an `IndustrialConstructionDelay`. Each must emit a `DecisionContext`. Update the `IndustrialConstructionDelay.context` field from `string` to `DecisionContext`:

```typescript
interface IndustrialConstructionDelay {
	tileId: string;
	buildingTypeId: IndustrialBuildingTypeId;
	context: DecisionContext; // was: string
}
```

Branch 1 (line 141-150) — `blockReason` is now already a `DecisionContext | null` from Step 1, so pass it through unchanged:

```typescript
const blockReason = getIndustrialPlacementBlockReason(game, input.tileId, input.buildingTypeId);
if (blockReason) {
	return appendDecision(
		game,
		industrialConstructionDelayedDecision(game, {
			tileId: input.tileId,
			buildingTypeId: input.buildingTypeId,
			context: blockReason
		})
	);
}
```

Branch 2 (line 152-161) — the "unknown tile/city/building" fallback that currently hardcodes `'Unknown industrial tile'`:

```typescript
if (!city || !tile || !buildingType) {
	return appendDecision(
		game,
		industrialConstructionDelayedDecision(game, {
			tileId: input.tileId,
			buildingTypeId: input.buildingTypeId,
			context: decisionContextIndustrialUnknownTile()
		})
	);
}
```

Branch 3 (line 163-172) — cash-blocked:

```typescript
if (game.cash < buildingType.buildCost) {
	return appendDecision(
		game,
		industrialConstructionDelayedDecision(game, {
			tileId: input.tileId,
			buildingTypeId: input.buildingTypeId,
			context: decisionContextIndustrialRequiresCash(input.buildingTypeId, buildingType.buildCost)
		})
	);
}
```

Update `industrialConstructionDelayedDecision` to build the id from `context.code` (a stable string) instead of the old free-form English string:

```typescript
function industrialConstructionDelayedDecision(
	game: GameState,
	delay: IndustrialConstructionDelay
): DecisionItem {
	return {
		id: [
			'industrial-construction-delayed',
			toDecisionIdPart(delay.buildingTypeId),
			toDecisionIdPart(delay.tileId),
			toDecisionIdPart(delay.context.code),
			game.day
		].join('-'),
		title: 'Industrial construction delayed',
		context: delay.context,
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}
```

- [ ] **Step 3: Run industryPlacement tests**

Run: `bun run test:unit -- src/lib/game/industryPlacement.spec.ts --run`
Expected: PASS — update assertions that check context strings.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/industryPlacement.ts src/lib/game/industryPlacement.spec.ts
git commit -m "feat: emit structured DecisionContext from industryPlacement.ts"
```

---

## Task 6: Update gameCopy.ts decision localization

**Files:**
- Modify: `src/lib/i18n/localizedTypes.ts` (new — define `LocalizedDecision`, `LocalizedWorldCityStatus`)
- Modify: `src/lib/i18n/gameCopy.ts:100-130, 277-292, 294-445` (decision builders), `:590-622` (`localizeWorldCityStatus` — the cash-regex site), retype `localizeDecision` to return `LocalizedDecision`
- Modify: `src/lib/i18n/gameCopy.spec.ts` (update golden-phrase tests)

**Interfaces:**
- Consumes: `DecisionContext` from Task 1, emitted by Tasks 2-5.
- Produces: `localizeDecision` returns `DecisionItem` with localized `context` string.

- [ ] **Step 1: Replace regex-based decision context localization**

**Define localized view types** in `src/lib/i18n/localizedTypes.ts`. The key fix: `DecisionItem.context` is now a structured `DecisionContext` object, but components render a localized **string**. `LocalizedDecision` must re-declare `context: string` (it cannot simply `extend DecisionItem`, or it would inherit the object type and `DecisionQueue.svelte` would render `[object Object]`).

```typescript
import type { DecisionItem, DecisionOption } from '$lib/game/types';
import type { WorldCityStatus } from '$lib/game/world';

export type LocalizedDecisionOption = DecisionOption;

export interface LocalizedDecision extends Omit<DecisionItem, 'context'> {
	context: string; // localized display string (was inherited as DecisionContext)
	options: LocalizedDecisionOption[];
}

export interface LocalizedWorldCityStatus extends Omit<WorldCityStatus, 'blockedReason'> {
	blockedReason: string | null; // localized (was DecisionContext | null on the raw type)
}
```

Move the existing `LocalizedDecision`/`LocalizedDecisionOption`/`LocalizedWorldCityStatus` declarations out of `gameCopy.ts` into this new file, then re-export from `gameCopy.ts` to preserve import paths.

Replace `localizeDecisionContext` with a `switch (decision.context.code)` dispatcher. The `worldCityNotAvailableYet` case resolves the human requirement text keyed by **`cityId`** (a stable enum), never by casting the English `unlockRequirement`:

```typescript
function localizeDecisionContext(decision: DecisionItem, i18n: I18nBundle): string {
	const ctx = decision.context;
	switch (ctx.code) {
		case 'expansionUnavailable':
			return i18n.t('copy.decisions.expansionUnavailable.context', { storeCap: ctx.storeCap });
		case 'expansionCashBlocked':
			return i18n.t('copy.decisions.expansionCashBlocked.context', {
				cash: i18n.format.currency(ctx.cash)
			});
		case 'locationBlocked':
			return i18n.t('copy.decisions.locationUnavailable.blockedContext', {
				reason: i18n.t(`copy.decisions.locationUnavailable.reasons.${ctx.reason}` as never)
			});
		case 'locationGeneric':
			return i18n.t('copy.decisions.locationUnavailable.genericContext');
		case 'worldCityOpeningCost':
			return i18n.t('copy.decisions.worldCity.openingDelayed.context', {
				cash: i18n.format.currency(ctx.cash)
			});
		case 'worldCityUnknown':
			return i18n.t('copy.decisions.worldCity.cityUnavailable.context');
		case 'worldCityNotAvailableYet':
			// ctx.cityId is a stable WorldCityId enum; the requirement text is
			// translated under a per-city key. Do NOT use city.unlockRequirement
			// (that is a free-form English string, not a key).
			return i18n.t('copy.decisions.worldCity.notAvailableYet.context', {
				requirement: i18n.t(`copy.worldCities.${ctx.cityId}.unlockRequirement` as never)
			});
		case 'industrialUnknownTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.unknownTile');
		case 'industrialUnknownBuilding':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.unknownBuildingType');
		case 'industrialLockedTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.lockedTile');
		case 'industrialOccupiedTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.occupiedTile');
		case 'industrialRequiresResource':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.requiresResource', {
				resource: i18n.labels.industryResource(ctx.resourceId)
			});
		case 'industrialRequiresIndustrialTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.requiresIndustrialTile');
		case 'industrialRequiresCash':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.requiresCash', {
				buildingName: i18n.labels.industrialBuilding(ctx.buildingTypeId),
				cash: i18n.format.currency(ctx.cash)
			});
	}
}
```

**Add the per-city `unlockRequirement` translation keys** to the locale files for `en`, `zh-Hant`, `ja` under `copy.worldCities.<cityId>.unlockRequirement` (e.g. `copy.worldCities.campus-junction.unlockRequirement`). These hold the localized version of the current English sentences ("Reach 2 stores or day 7.", etc.). This is required for Issue #1 to actually produce localized text.

Remove the now-dead regex constants and helper functions: `WORLD_CITY_OPENING_COST_CONTEXT`, `formatWorldCityOpeningCost`, `localizeLocationUnavailableContext`, `localizeWorldDecisionContext`, `localizeIndustrialConstructionContext`.

**Replace `localizeWorldCityStatus` regex/identity logic (~line 590-622).** This is the actual site that today parses the world-city cash string and identity-compares `blockedReason === city.unlockRequirement`. Now that `blockedReason` is a `DecisionContext`, switch on its code:

```typescript
export function localizeWorldCityStatus(
	status: WorldCityStatus,
	i18n: I18nBundle
): LocalizedWorldCityStatus {
	let blockedReason: string | null = null;
	if (status.blockedReason) {
		switch (status.blockedReason.code) {
			case 'worldCityOpeningCost':
				blockedReason = i18n.t('copy.worldCity.blockedOpeningCost', {
					cash: i18n.format.currency(status.blockedReason.cash)
				});
				break;
			case 'worldCityNotAvailableYet':
				blockedReason = i18n.t(`copy.worldCities.${status.blockedReason.cityId}.unlockRequirement` as never);
				break;
			default:
				blockedReason = null;
		}
	}
	return { ...status, blockedReason };
}
```

Retype `localizeDecision` to return `LocalizedDecision` and `localizeWorldCityStatus` to return `LocalizedWorldCityStatus`.

Also update `localizeDecisionTitle` for world-city decisions to switch on `decision.context.code` instead of `decision.title`:

```typescript
case 'worldCity':
	switch (decision.context.code) {
		case 'worldCityUnknown':
			return i18n.t('copy.decisions.worldCity.cityUnavailable.title');
		case 'worldCityNotAvailableYet':
			return i18n.t('copy.decisions.worldCity.notAvailableYet.title');
		case 'worldCityOpeningCost':
			return i18n.t('copy.decisions.worldCity.openingDelayed.title');
		default:
			return decision.title;
	}
```

Update `classifyDecision` — the world-city check `decision.id.startsWith('world-city-')` stays the same.

- [ ] **Step 2: Update golden-phrase tests in gameCopy.spec.ts**

Replace hand-built `DecisionItem` fixtures that use string contexts with ones that use structured `DecisionContext` objects. For each test that currently does:

```typescript
const worldDecision: DecisionItem = {
	id: 'world-city-city-opening-delayed-...',
	title: 'City opening delayed',
	context: 'Opening this city requires 18,000 cash.',
	...
};
```

Change to:

```typescript
const worldDecision: DecisionItem = {
	id: 'world-city-city-opening-delayed-...',
	title: 'City opening delayed',
	context: { code: 'worldCityOpeningCost', cash: 18_000 },
	...
};
```

Do this for every `DecisionItem` fixture in the spec file. The assertions (`expect(localized.context).not.toBe(...)`) stay the same since `localizeDecision` still returns a string `context` in the localized output.

For the "golden-phrase guard" test (line 444), rename it to "structured-context guard" and update fixtures to use structured contexts. The assertions remain the same.

- [ ] **Step 3: Run gameCopy tests**

Run: `bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run`
Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `bun run check`
Expected: 0 errors — fix any remaining string-context references.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts
git commit -m "refactor: replace regex-parsed decision context builders with structured-code dispatch"
```

---

## Task 7: Define structured types for product chain (bottleneck, edge label, graph warning)

**Files:**
- Modify: `src/lib/game/productChainGraph.ts:46-86, 88-106` (type definitions incl. `ProductChainCategorySummary`)
- Modify: `src/lib/i18n/localizedTypes.ts` (add `LocalizedProductChainNode/Edge/Graph/CategorySummary`)
- Modify: `src/lib/game/productChainGraph.spec.ts`

**Interfaces:**
- Produces: `BottleneckInfo`, `EdgeLabelInfo`, `GraphWarning` types.

- [ ] **Step 1: Define the structured types**

In `src/lib/game/productChainGraph.ts`, add these types and update the interfaces:

```typescript
export type BottleneckInfo =
	| { code: 'warehouseNoCapacity' }
	| { code: 'warehouseOverflow'; quantity: number }
	| { code: 'warehouseAvailable' }
	| { code: 'healthStatus'; health: ProductChainHealth; label: string };

export type EdgeLabelInfo =
	| { code: 'in'; quantity: number }
	| { code: 'out'; quantity: number }
	| { code: 'cycle'; direction: 'produced' | 'used'; actual: number; required: number; imported: boolean };

export type GraphWarning =
	| { code: 'noDailyReport' }
	| { code: 'noProductionRecipe'; materialId: MaterialId };
```

Update `ProductChainNode.bottleneck` from `string` to `BottleneckInfo`.
Update `ProductChainEdge.label` from `string` to `EdgeLabelInfo`.
Update `ProductChainGraph.warnings` from `string[]` to `GraphWarning[]`.
Update `ProductChainCategorySummary.bottleneck` from `string` to `BottleneckInfo` (it mirrors `ProductChainNode.bottleneck` and is consumed by `CategoryStampIndex.svelte`).

- [ ] **Step 1b: Define localized view types (prevents `[object Object]` in atlas components)**

`NodeBroadside.svelte` renders `{node.bottleneck}`, `ChainRoute`/`ChainNode` render `{edge.label}`, and `CategoryStampIndex` reads `summary.bottleneck` — all as **strings**. Once the structured types make these objects, those render sites break. The fix is a parallel set of `Localized*` types carrying display strings; `localizeProductChainGraph` (Task 8) is the only bridge. Add to `src/lib/i18n/localizedTypes.ts`:

```typescript
import type {
	ProductChainNode,
	ProductChainEdge,
	ProductChainGraph,
	ProductChainCategorySummary
} from '$lib/game/productChainGraph';

export interface LocalizedProductChainNode extends Omit<ProductChainNode, 'bottleneck'> {
	bottleneck: string; // localized
}
export interface LocalizedProductChainEdge extends Omit<ProductChainEdge, 'label'> {
	label: string; // localized
}
export interface LocalizedProductChainGraph
	extends Omit<ProductChainGraph, 'nodes' | 'edges' | 'warnings' | 'details'> {
	nodes: LocalizedProductChainNode[];
	edges: LocalizedProductChainEdge[];
	warnings: string[]; // localized
	details: Record<string, LocalizedProductChainNode>;
}
export interface LocalizedProductChainCategorySummary
	extends Omit<ProductChainCategorySummary, 'bottleneck'> {
	bottleneck: string; // localized
}
```

**Retype the atlas component props** to accept the `Localized*` types:
- `NodeBroadside.svelte`, `ChainNode.svelte` → `node: LocalizedProductChainNode`
- `ChainRoute.svelte` → `edge: LocalizedProductChainEdge`
- `ProductChainAtlas.svelte` → `graph: LocalizedProductChainGraph`
- `CategoryStampIndex.svelte` → `summary: LocalizedProductChainCategorySummary`

These components already render the fields as strings, so no template changes are needed — only the prop type annotations. `ProductChainsPanel.svelte` / `StoreProductChainPanel.svelte` already call `localizeProductChainGraph`; ensure the resulting `LocalizedProductChainGraph` flows into `<ProductChainAtlas>` and `<NodeBroadside>`, and that summaries are localized for `CategoryStampIndex` (add a `localizeProductChainCategorySummary` helper or localize inline in Task 8).

- [ ] **Step 2: Update buildWarehouseFlowGraph to emit structured objects**

Replace the bottleneck ternary (lines 166-171):

```typescript
bottleneck:
	game.warehouse.capacity <= 0
		? { code: 'warehouseNoCapacity' }
		: game.warehouse.overflowUnits > 0
			? { code: 'warehouseOverflow', quantity: game.warehouse.overflowUnits }
			: { code: 'warehouseAvailable' }
```

Replace edge labels (lines 211-235):

```typescript
// in edge
label: { code: 'in', quantity: actual.produced }

// out edge
label: { code: 'out', quantity: actual.warehousePulled }
```

Replace `formatRecipeEdgeLabel` to return `EdgeLabelInfo`:

```typescript
export function formatRecipeEdgeLabel(input: {
	actualPerDay: number;
	requiredPerCycle: number;
	direction: 'input' | 'output';
	imported: number;
}): EdgeLabelInfo {
	return {
		code: 'cycle',
		direction: input.direction === 'output' ? 'produced' : 'used',
		actual: input.actualPerDay,
		required: input.requiredPerCycle,
		imported: input.imported > 0
	};
}
```

Replace warnings (line 249):

```typescript
warnings: report ? [] : [{ code: 'noDailyReport' }],
```

Replace `bottleneckText` to return `BottleneckInfo`:

```typescript
export function bottleneckText(node: Pick<ProductChainNode, 'kind' | 'health' | 'label'>): BottleneckInfo {
	return { code: 'healthStatus', health: node.health, label: node.label };
}
```

- [ ] **Step 3: Update productChainTree.ts warning generation**

In `src/lib/game/productChainTree.ts`, replace:

```typescript
warnings.push('No daily report yet; latest-day flow is unavailable.');
```
with:
```typescript
warnings.push({ code: 'noDailyReport' });
```

Replace:
```typescript
warnings.push(`No production recipe found for ${MATERIALS[inputMaterial.materialId]?.name ?? inputMaterial.materialId}.`);
```
with:
```typescript
warnings.push({ code: 'noProductionRecipe', materialId: inputMaterial.materialId });
```

- [ ] **Step 4: Update productChainGraph.spec.ts and productChainTree.spec.ts**

Update all assertions that check bottleneck/edge/warning strings to check structured objects instead.

- [ ] **Step 5: Run tests**

Run: `bun run test:unit -- src/lib/game/productChainGraph.spec.ts src/lib/game/productChainTree.spec.ts --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/productChainGraph.ts src/lib/game/productChainTree.ts src/lib/game/productChainGraph.spec.ts src/lib/game/productChainTree.spec.ts
git commit -m "feat: emit structured BottleneckInfo, EdgeLabelInfo, GraphWarning from product chain builders"
```

---

## Task 8: Update gameCopy.ts product chain localization

**Files:**
- Modify: `src/lib/i18n/gameCopy.ts:132-199, 277-292, 628+` (product chain copy builders; retype `localizeProductChainGraph` → `LocalizedProductChainGraph`; add `localizeProductChainCategorySummary`)
- Modify: `src/lib/i18n/localizedTypes.ts` (consumes the `Localized*` types defined in Task 7)
- Modify: `src/lib/i18n/gameCopy.spec.ts` (product chain tests)

**Interfaces:**
- Consumes: `BottleneckInfo`, `EdgeLabelInfo`, `GraphWarning` from Task 7.
- Produces: `localizeProductChainGraph` returns graph with localized string labels.

- [ ] **Step 1: Replace regex-based product chain builders**

**Replace `localizeBottleneck` with a single exhaustive `switch (info.code)` helper.** The `BottleneckInfo` union has variants like `{ code: 'warehouseNoCapacity' }` that do not carry a `health` field, so `bn.health` must only be accessed after narrowing to the `healthStatus` variant. Use one shared `localizeBottleneckInfo` helper (exhaustive on `info.code`) so both `localizeBottleneck` (node) and `localizeProductChainCategorySummary` (summary) call the same type-safe dispatcher. The `healthStatus` case delegates to a second exhaustive switch on `ProductChainHealth` that preserves the current health→key mapping (note: `no-local-capacity` → `noLocalCapacity`, `no-report` → `noReport` — the keys are camelCase, not the kebab-case health enum values, so `copy.productChainGraph.bottlenecks.${bn.health}` would miss):

```typescript
function localizeHealthBottleneck(
	health: ProductChainHealth,
	label: string,
	i18n: I18nBundle
): string {
	switch (health) {
		case 'healthy':
			return i18n.t('copy.productChainGraph.bottlenecks.healthy', { label });
		case 'watch':
			return i18n.t('copy.productChainGraph.bottlenecks.watch', { label });
		case 'shortage':
			return i18n.t('copy.productChainGraph.bottlenecks.shortage', { label });
		case 'no-local-capacity':
			return i18n.t('copy.productChainGraph.bottlenecks.noLocalCapacity', { label });
		case 'no-report':
			return i18n.t('copy.productChainGraph.bottlenecks.noReport', { label });
	}
}

function localizeBottleneckInfo(
	info: BottleneckInfo,
	label: string,
	i18n: I18nBundle
): string {
	switch (info.code) {
		case 'warehouseNoCapacity':
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseNoCapacity');
		case 'warehouseOverflow':
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseOverflow', {
				quantity: info.quantity
			});
		case 'warehouseAvailable':
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseAvailable');
		case 'healthStatus':
			return localizeHealthBottleneck(info.health, label, i18n);
	}
}

function localizeBottleneck(node: ProductChainNode, label: string, i18n: I18nBundle): string {
	return localizeBottleneckInfo(node.bottleneck, label, i18n);
}
```

Replace `localizeEdgeLabel` with a `switch (label.code)` dispatcher:

```typescript
function localizeEdgeLabel(labelInfo: EdgeLabelInfo, i18n: I18nBundle): string {
	switch (labelInfo.code) {
		case 'in':
			return i18n.t('copy.productChainGraph.edges.in', { quantity: labelInfo.quantity });
		case 'out':
			return i18n.t('copy.productChainGraph.edges.out', { quantity: labelInfo.quantity });
		case 'cycle': {
			const key =
				labelInfo.direction === 'produced'
					? labelInfo.imported
						? 'copy.productChainGraph.edges.producedImported'
						: 'copy.productChainGraph.edges.produced'
					: labelInfo.imported
						? 'copy.productChainGraph.edges.usedImported'
						: 'copy.productChainGraph.edges.used';
			return i18n.t(key as never, {
				actual: labelInfo.actual,
				required: labelInfo.required
			});
		}
	}
}
```

Replace `localizeGraphWarning` with a `switch (warning.code)` dispatcher:

```typescript
function localizeGraphWarning(warning: GraphWarning, i18n: I18nBundle): string {
	switch (warning.code) {
		case 'noDailyReport':
			return i18n.t('copy.productChainGraph.warnings.noDailyReport');
		case 'noProductionRecipe':
			return i18n.t('copy.productChainGraph.warnings.noProductionRecipe', {
				materialName: i18n.labels.material(warning.materialId)
			});
	}
}
```

**Update `localizeProductChainGraph` to preserve the existing localization pipeline.** The current implementation (gameCopy.ts:628-675) computes a localized `label` from `node.id`/`node.materialId`/`node.recipeId` before passing it to `localizeBottleneck`, and also localizes `title` (`localizeGraphTitle`), `subLabel`, `healthLabel` (`localizeHealth`), and `emptyReason` (`localizeGraphReason`). The replacement must not regress any of these — pass the computed localized label (not the raw English `node.label`) to `localizeBottleneck`, and carry forward `title`/`subLabel`/`healthLabel`/`emptyReason` localization. The return type must be **`LocalizedProductChainGraph`** (string fields), NOT `ProductChainGraph` — the latter would carry `BottleneckInfo`/`EdgeLabelInfo`/`GraphWarning` objects straight into the atlas components, which render them as `[object Object]`.

```typescript
export function localizeProductChainGraph(
	graph: ProductChainGraph,
	i18n: I18nBundle
): LocalizedProductChainGraph {
	const localizedNodes = graph.nodes.map((node) => {
		const label =
			node.id === 'warehouse'
				? i18n.t('copy.productChainGraph.warehouseNode')
				: node.materialId
					? i18n.labels.material(node.materialId)
					: node.recipeId
						? i18n.labels.industrialBuilding(
								Object.values(INDUSTRIAL_BUILDING_TYPES).find(
									(type) => type.recipeId === node.recipeId
								)?.id ?? node.label
							)
						: node.label;

		return {
			...node,
			label,
			subLabel:
				node.subLabel && node.materialId ? i18n.labels.material(node.materialId) : node.subLabel,
			healthLabel: localizeHealth(node.health, i18n),
			bottleneck: localizeBottleneck(node, label, i18n)
		};
	});

	const localizedNodeMap = Object.fromEntries(localizedNodes.map((node) => [node.id, node]));

	return {
		...graph,
		title: localizeGraphTitle(graph, i18n),
		nodes: localizedNodes,
		edges: graph.edges.map(
			(edge): LocalizedProductChainEdge => ({
				...edge,
				label: localizeEdgeLabel(edge.label, i18n)
			})
		),
		details: localizedNodeMap,
		warnings: graph.warnings.map((warning) => localizeGraphWarning(warning, i18n)),
		emptyReason: localizeGraphReason(graph.emptyReason, i18n)
	};
}
```

Add a `localizeProductChainCategorySummary` helper so `CategoryStampIndex.svelte` gets a `LocalizedProductChainCategorySummary` (string bottleneck). Use the shared `localizeBottleneckInfo` helper so the `BottleneckInfo` union is narrowed to `healthStatus` before accessing `.health`:

```typescript
export function localizeProductChainCategorySummary(
	summary: ProductChainCategorySummary,
	i18n: I18nBundle
): LocalizedProductChainCategorySummary {
	return {
		...summary,
		bottleneck: localizeBottleneckInfo(summary.bottleneck, summary.name, i18n)
	};
}
```

Have `ProductChainsPanel.svelte` map its `summaries` through this helper before passing to `<CategoryStampIndex>`.

Remove the dead regex constants: `NO_PRODUCTION_RECIPE_WARNING`, `formatQuantity`, `formatWorldCityOpeningCost` (if not already removed in Task 6).

- [ ] **Step 2: Update gameCopy.spec.ts product chain tests**

Update any tests that build `ProductChainGraph` fixtures with string bottlenecks/edges/warnings to use structured objects. For tests that call `buildWarehouseFlowGraph` or `buildProductChainTree` (the real builders), the assertions on localized output stay the same.

- [ ] **Step 3: Run tests**

Run: `bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run`
Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts
git commit -m "refactor: replace regex-parsed product chain builders with structured-code dispatch"
```

---

## Task 9: Update save codec for structured types

**Files:**
- Modify: `src/lib/persistence/saveTypes.ts:3` (bump SAVE_SCHEMA_VERSION)
- Modify: `src/lib/persistence/saveCodec.ts` (add v6→v7 migration, validate structured types)
- Modify: `src/lib/persistence/saveCodec.spec.ts` (add migration test)

**Interfaces:**
- Consumes: `DecisionContext`, `BottleneckInfo`, `EdgeLabelInfo`, `GraphWarning` types.
- Produces: save codec validates structured contexts; old string contexts are dropped.

- [ ] **Step 1: Bump SAVE_SCHEMA_VERSION**

In `src/lib/persistence/saveTypes.ts`:

```typescript
export const SAVE_SCHEMA_VERSION = 7;
```

In `src/lib/persistence/saveCodec.ts`:

```typescript
const MIGRATABLE_SCHEMA_VERSIONS = new Set<number>([4, 5, 6]);
```

**Fix `migrateV5SaveRecord` to emit schema 6, not `SAVE_SCHEMA_VERSION`.** The current implementation (saveCodec.ts:157-166) writes `schemaVersion: SAVE_SCHEMA_VERSION` to the migrated record. After the bump to 7, a v5 save would jump directly to schema 7, skipping the v6→v7 migration step entirely — so its string decision contexts would survive and fail structured validation. Each migration function must advance the schema by exactly one version so the chain in `migrateSaveRecord` can run the next step. `migrateV4SaveRecord` already follows this pattern (it emits `schemaVersion: 5`, not the constant). Apply the same fix to `migrateV5SaveRecord`:

```typescript
function migrateV5SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	const migratedGame = migrateV5Game(recordObject.game);
	// Advance by one version so migrateSaveRecord's chain runs the v6→v7 step.
	// Do NOT use SAVE_SCHEMA_VERSION here — that would skip intermediate migrations.
	return {
		...recordObject,
		schemaVersion: 6,
		game: migratedGame
	};
}
```

- [ ] **Step 2: Add v6→v7 migration (DROP old string contexts, do not stub them)**

Add a migration step that **drops** decisions whose `context` is still a free-form English string. Do NOT replace them with a placeholder code — `{ code: 'legacyStringDropped' }` is not in the `DecisionContext` union, so it would be a type hole that `localizeDecisionContext`'s switch cannot handle (exhaustiveness error or runtime `undefined`). Per the legacy save policy (game unreleased), old string contexts are dropped rather than reverse-parsed. In `saveCodec.ts`:

```typescript
/**
 * v6 → v7: decision contexts changed from free-form English strings to
 * structured `{ code, ... }` objects. Per the legacy save policy (game is
 * unreleased), old string-valued contexts are DROPPED — not reverse-parsed
 * and not stubbed with a sentinel code that the DecisionContext union
 * doesn't define.
 */
function migrateV6Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;
	const decisions = gameRecord.decisions;

	if (!Array.isArray(decisions)) return game;

	const migratedDecisions = decisions.filter((decision) => {
		if (typeof decision !== 'object' || decision === null) return true;
		const context = (decision as Record<string, unknown>).context;
		return typeof context !== 'string'; // keep structured/object contexts, drop string ones
	});

	if (migratedDecisions.length === decisions.length) return game;

	return { ...gameRecord, decisions: migratedDecisions };
}

function migrateV6SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	const migratedGame = migrateV6Game(recordObject.game);
	return {
		...recordObject,
		schemaVersion: SAVE_SCHEMA_VERSION,
		game: migratedGame
	};
}
```

**Scope note:** `ProductChainGraph` / `BottleneckInfo` / `EdgeLabelInfo` / `GraphWarning` are **not persisted** in `GameState` (they are derived on the fly from `reports`, `industrialBuildings`, etc.). The migration therefore only touches `game.decisions`. Do not add migration/validation for product-chain fields — there is nothing to migrate.

Update `migrateSaveRecord` chain:

```typescript
let migrated = record;
if (migrated.schemaVersion === 4) {
	migrated = migrateV4SaveRecord(migrated) as Record<string, unknown>;
}
if (migrated.schemaVersion === 5) {
	migrated = migrateV5SaveRecord(migrated) as Record<string, unknown>;
}
if (migrated.schemaVersion === 6) {
	migrated = migrateV6SaveRecord(migrated) as Record<string, unknown>;
}
```

- [ ] **Step 3: Update validation for DecisionContext (persisted data only)**

In `validateSavedDecision` (or wherever decisions are validated), replace the string context check with a `DecisionContext` validator. Validate **only persisted** structured types — i.e. `DecisionContext` (it lives on `game.decisions`). Product-chain fields are not persisted, so there is nothing to validate for `BottleneckInfo`/`EdgeLabelInfo`/`GraphWarning`.

**Use runtime guards, not `as` casts.** `ctx.cityId as WorldCityId` accepts any string and silently bypasses enum validation. Import `isWorldCityId` from `$lib/game/world` (the existing guard at world.ts:193) and throw `SaveDataError` when it fails. For `buildingTypeId` and `resourceId`, reuse the existing `INDUSTRIAL_BUILDING_TYPE_ID_SET` / `INDUSTRY_RESOURCE_ID_SET` sets already defined in `saveCodec.ts` (lines 251-256) — add small `requireIndustrialBuildingTypeId` / `requireIndustryResourceId` helpers that check membership and throw on unknown ids. Every case in the `DecisionContext` union must be handled explicitly — no `// ... one case per remaining code` placeholder:

```typescript
import { isWorldCityId } from '$lib/game/world';

function requireIndustrialBuildingTypeId(value: unknown, label: string): IndustrialBuildingTypeId {
	const id = requireString(value, label);
	if (!INDUSTRIAL_BUILDING_TYPE_ID_SET.has(id)) {
		throw new SaveDataError(`${label} must be a known industrial building type id: ${id}`);
	}
	return id as IndustrialBuildingTypeId;
}

function requireIndustryResourceId(value: unknown, label: string): string {
	const id = requireString(value, label);
	if (!INDUSTRY_RESOURCE_ID_SET.has(id)) {
		throw new SaveDataError(`${label} must be a known industry resource id: ${id}`);
	}
	return id;
}

function validateSavedDecisionContext(value: unknown, label: string): DecisionContext {
	const ctx = requireRecord(value, `${label} context`);
	const code = requireString(ctx.code, `${label} context code`);
	switch (code) {
		case 'expansionUnavailable':
			return { code, storeCap: requireNumber(ctx.storeCap, `${label} context storeCap`) };
		case 'expansionCashBlocked':
			return { code, cash: requireNumber(ctx.cash, `${label} context cash`) };
		case 'locationBlocked':
			requireString(ctx.reason, `${label} context reason`);
			if (ctx.reason !== 'locked' && ctx.reason !== 'road' && ctx.reason !== 'river') {
				throw new SaveDataError(`${label} context reason must be locked|road|river`);
			}
			return { code, reason: ctx.reason };
		case 'locationGeneric':
			return { code };
		case 'worldCityOpeningCost':
			return { code, cash: requireNumber(ctx.cash, `${label} context cash`) };
		case 'worldCityUnknown':
			return { code };
		case 'worldCityNotAvailableYet': {
			const cityId = requireString(ctx.cityId, `${label} context cityId`);
			if (!isWorldCityId(cityId)) {
				throw new SaveDataError(`${label} context cityId must be a known WorldCityId: ${cityId}`);
			}
			return { code, cityId };
		}
		case 'industrialUnknownTile':
			return { code };
		case 'industrialUnknownBuilding':
			return { code };
		case 'industrialLockedTile':
			return { code };
		case 'industrialOccupiedTile':
			return { code };
		case 'industrialRequiresResource':
			return {
				code,
				resourceId: requireIndustryResourceId(ctx.resourceId, `${label} context resourceId`)
			};
		case 'industrialRequiresIndustrialTile':
			return { code };
		case 'industrialRequiresCash':
			return {
				code,
				buildingTypeId: requireIndustrialBuildingTypeId(
					ctx.buildingTypeId,
					`${label} context buildingTypeId`
				),
				cash: requireNumber(ctx.cash, `${label} context cash`)
			};
		default:
			throw new SaveDataError(`${label} context code must be a known decision context code`);
	}
}
```

There is **no `legacyStringDropped` case** — Step 2 drops those decisions before validation runs, so a string context never reaches this validator. If one somehow does, the default branch throws (fail-closed).

- [ ] **Step 4: Write the migration test**

In `saveCodec.spec.ts`:

```typescript
test('v6 migration drops old string decision contexts', () => {
	expect.assertions(3);
	const record = createV6Record({
		game: {
			decisions: [
				{
					id: 'expansion-cash-blocked-1',
					title: 'Expansion delayed',
					context: 'Opening another store requires 15,000 cash.',
					expiresOnDay: 2,
					options: [{ id: 'acknowledge', label: 'Acknowledge', description: '...', effects: {} }]
				}
			]
		}
	});

	const validated = validateSaveRecord(record);
	expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
	// The string-context decision is DROPPED, not stubbed — it does not survive
	// as a zombie { code: 'legacyStringDropped' } that the switch can't handle.
	expect(validated.game.decisions).toHaveLength(0);
	expect(() => validateSaveRecord(record)).not.toThrow();
});
```

Add a `createV6Record` helper (same pattern as `createV5Record` but with `schemaVersion: 6`). Also add a test that a decision with a **structured** object context survives v6→v7 unchanged, to prove the filter is context-type-specific.

- [ ] **Step 5: Run save codec tests**

Run: `bun run test:unit -- src/lib/persistence/saveCodec.spec.ts --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts
git commit -m "feat: add v6→v7 save migration for structured decision contexts"
```

---

## Task 10: Update remaining tests and component specs

**Files:**
- Modify: any test files that build `DecisionItem` fixtures with string contexts or assert on product chain string fields.
- Modify: component specs that render `DecisionQueue`, `ProductChainsPanel`, etc.

- [ ] **Step 1: Search for remaining string-context fixtures**

Run: `grep -rn "context: '" src --include="*.spec.ts" --include="*.svelte.spec.ts"`
Update every fixture that uses a string `context` to use a structured `DecisionContext` object.

- [ ] **Step 2: Search for remaining string bottleneck/edge/warning fixtures**

Run: `grep -rn "bottleneck:" src --include="*.spec.ts"`
Run: `grep -rn "label:.*day" src --include="*.spec.ts"`
Update every fixture that uses string values.

- [ ] **Step 3: Run full test suite**

Run: `bun run test:unit -- --run`
Expected: ALL PASS.

- [ ] **Step 4: Run typecheck and lint**

Run: `bun run check && bun run lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: update all fixtures for structured decision contexts and product chain fields"
```

---

## Task 11: Full verification and golden-phrase test hardening

**Files:**
- Modify: `src/lib/i18n/gameCopy.spec.ts` (add real-builder golden-phrase tests)

- [ ] **Step 1: Add real-builder golden-phrase tests**

For each decision family, add a test that calls the real game builder (e.g., `openStoreAtTile` for expansion decisions, `openWorldCity` for world-city decisions, `buildIndustrialBuilding` for industrial decisions) and asserts the **exact** localized output, not just that it differs from the structured context object. This ensures drift is caught at the source, not just at the copy layer.

**The test must use a real buildable tile from the generated city, not a placeholder like `'valid-tile'`.** A placeholder tile id will not match any tile in the city, so `openStoreAtTile` will emit a `locationUnavailable` decision (not `expansionCashBlocked`), and the `find` will return `undefined`. The test must also assert the exact expected Japanese phrase — `expect(localized.context).not.toBe(decision.context)` is vacuous because `localized.context` is a `string` while `decision.context` is a `DecisionContext` object, so the inequality always holds.

Example — expansion-cash-blocked with a real tile and an exact Japanese assertion:

```typescript
import { generateCity, isTileBuildable } from '$lib/game/city';
import { createCityTileLookup, getOccupiedStoreTileIds } from '$lib/game/storeFootprint';
import { getExpansionSetupCost, createNewGame } from '$lib/game/state';
import { openStoreAtTile } from '$lib/game/placement';

it('golden-phrase guard: real expansion-cash-blocked decision localizes to exact Japanese phrase', () => {
	expect.assertions(3);
	// Use a deterministic seed so the city layout and setup cost are reproducible.
	const game = createNewGame('convenience', 1);
	const city = game.cities.find((c) => c.id === game.activeCityId)!;
	const lookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, lookup);

	// Find a real buildable tile whose 2x2 footprint is not occupied by the
	// founding store — not a placeholder like 'valid-tile'.
	const expansionTile = city.tiles.find(
		(tile) =>
			isTileBuildable(tile) &&
			tile.id !== game.stores[0]!.tileId &&
			getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) === null
	)!;
	expect(expansionTile).toBeDefined();

	// Set cash to 0 so the expansion is cash-blocked (setupCost > 0 for any
	// buildable tile). storeCap (STARTER_STORE_CAP) is already > 1 store.
	const cashBlockedGame = { ...game, cash: 0 };
	const result = openStoreAtTile(cashBlockedGame, {
		tileId: expansionTile.id,
		archetypeId: 'convenience'
	});
	const decision = result.decisions.find((d) => d.context.code === 'expansionCashBlocked');
	expect(decision).toBeDefined();

	const japanese = createI18n('ja');
	const setupCost = getExpansionSetupCost(expansionTile, 'convenience');
	const localized = localizeDecision(decision!, japanese);
	// Assert the EXACT expected Japanese phrase — not.toBe(decision.context)
	// is vacuous (string vs object). The Japanese template is
	// '新しい店舗を開くには {cash} の資金が必要です。'
	expect(localized.context).toBe(
		japanese.t('copy.decisions.expansionCashBlocked.context', {
			cash: japanese.format.currency(setupCost)
		})
	);
});
```

Follow the same pattern for each decision family: use a real game builder, find a real tile/city from the generated state, and assert the exact localized string from the locale catalog (computed via `i18n.t` with the structured params), not a vacuous inequality.

- [ ] **Step 2: Run all tests**

Run: `bun run test:unit -- --run`
Expected: ALL PASS.

- [ ] **Step 3: Run e2e tests**

Run: `bun run test:e2e`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/gameCopy.spec.ts
git commit -m "test: add real-builder golden-phrase tests for structured copy builders"
```

---

## Self-Review

**1. Spec coverage:** Two regex patterns: (a) regex-parsed decision contexts → Tasks 1-6 + 9-11; (b) regex-parsed product chain fields → Tasks 7-8 + 10-11. Golden-phrase hardening → Task 11. The **`localizeWorldCityStatus` cash regex (~gameCopy.ts:590-622)** — the actual site that today parses the world-city cash string and identity-compares `blockedReason === city.unlockRequirement` — is explicitly in scope in Task 6 (it was missing from the original draft). All `blockedReason` consumers (`WorldMap.svelte`, `+page.svelte`, `WorldMap.svelte.spec.ts`) are now listed. The `Localized*` view types (`src/lib/i18n/localizedTypes.ts`) bridge structured game-core types to the string-rendering Svelte components.

**2. Placeholder scan:** The original draft's Task 4 test fixture used `[...]` placeholders and a `city.unlockRequirement as WorldMilestoneId` cast on a free-form English string — both are now filled with real values (`revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']`) and corrected to carry a stable `cityId`. The `// ... one case per remaining code` placeholder in Task 9 Step 3 has been replaced with explicit validation for every `DecisionContext` union member. The Task 11 golden test no longer uses a `valid-tile` placeholder — it finds a real buildable tile from the generated city and asserts the exact Japanese phrase. The Task 2 `locationUnavailableDecision` no longer matches English literals — Task 1b stabilizes `TilePlacementBlockReason` as `'locked' | 'road' | 'river'` at the source so the reason is already the stable code.

**3. Type consistency:** `DecisionContext` is defined in Task 1, emitted in Tasks 2-5, localized in Task 6, validated in Task 9. `worldCityNotAvailableYet` carries `cityId: WorldCityId` throughout (type def → constructors → `openWorldCity`/`getWorldCityStatus` callers → `localizeDecisionContext`/`localizeWorldCityStatus` switches → codec validator using `isWorldCityId` guard, not `as` cast). `BottleneckInfo`/`EdgeLabelInfo`/`GraphWarning` are defined in Task 7 and localized in Task 8; they are **NOT** validated in the codec because `ProductChainGraph` is derived, not persisted. Task 8's `localizeBottleneckInfo` uses an exhaustive `switch (info.code)` that narrows to the `healthStatus` variant before accessing `.health` — `bn.health` is never accessed on warehouse variants. The `healthStatus` case delegates to `localizeHealthBottleneck`, an exhaustive switch on `ProductChainHealth` that preserves the current camelCase key mapping (`no-local-capacity` → `noLocalCapacity`, `no-report` → `noReport`). Task 8's `localizeProductChainGraph` preserves the full existing localization pipeline (computed label, `title`, `subLabel`, `healthLabel`, `emptyReason`) — not just bottleneck/edge/warning. The `Localized*` types (Task 6/7) re-declare the rendered fields as `string` via `Omit` + override so that widening `DecisionItem.context` and `ProductChainNode.bottleneck` to objects does not break `DecisionQueue.svelte` (`{localizedDecision.context}`) or `NodeBroadside.svelte` (`{node.bottleneck}`). Constructor names match between Task 1 and Tasks 2-5; code strings match between the Task 1 union and the Task 6/8 switch cases (no `legacyStringDropped` code exists — migrated string contexts are dropped in Task 9 Step 2 before validation). Task 1b stabilizes `TilePlacementBlockReason` as `'locked' | 'road' | 'river'` so Task 2's `locationUnavailableDecision` passes the reason directly to `decisionContextLocationBlocked` without English-literal matching. Task 9's `migrateV5SaveRecord` emits `schemaVersion: 6` (not `SAVE_SCHEMA_VERSION`) so the v6→v7 migration chain runs correctly for v4/v5 saves.

**4. Translation keys:** Task 6 introduces `copy.worldCities.<cityId>.unlockRequirement` keys per city for `en`/`zh-Hant`/`ja`. These hold the localized equivalents of the current English `unlockRequirement` sentences and must be added to the locale files, or `worldCityNotAvailableYet` / locked-city `blockedReason` will fall back to the raw key.
