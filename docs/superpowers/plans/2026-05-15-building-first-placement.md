# Building-First Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tile-first construction with active building-first placement on both the retail and industry city maps.

**Architecture:** Keep placement rules in pure TypeScript helpers, pass preview metadata through map snapshots, and let Phaser render green/red overlays without owning game rules. Add a focused Svelte build menu for choosing what to place, while tile inspectors become detail-only surfaces.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 runes, Vitest browser/node projects, Phaser 4, Playwright e2e, bun.

---

## File Structure

- Create `src/lib/game/placementPreview.ts`: pure validation and preview helpers for retail and industry placement mode.
- Create `src/lib/game/placementPreview.spec.ts`: node Vitest coverage for preview validity, invalid reasons, cash checks, and retail build-menu ranges.
- Modify `src/lib/game/mapRender.ts`: add optional retail placement preview metadata to `CityMapSnapshot`.
- Modify `src/lib/game/mapRender.spec.ts`: verify retail preview metadata is serialized and safe for missing cities.
- Modify `src/lib/game/industryMapRender.ts`: add optional industry placement preview metadata to `IndustryMapSnapshot`.
- Modify `src/lib/game/industryMapRender.spec.ts`: verify industry preview metadata is serialized and safe for missing cities.
- Modify `src/lib/phaser/cityMapScene.ts`: draw retail placement overlays and expose preview count `data-*` attributes.
- Modify `src/lib/phaser/industryMapScene.ts`: draw industry placement overlays and expose preview count `data-*` attributes.
- Create `src/lib/components/game/BuildMenu.svelte`: active-map-aware picker for retail archetypes and industrial buildings.
- Create `src/lib/components/game/BuildMenu.svelte.spec.ts`: browser Vitest coverage for picker rendering, callbacks, locked industry state, and product filter/search.
- Modify `src/lib/components/game/TileInspector.svelte`: remove store construction choices and confirmation UI; keep tile/store details, stock, and staff.
- Modify `src/lib/components/game/TileInspector.svelte.spec.ts`: update assertions to prove construction controls are gone and detail content remains.
- Modify `src/lib/components/game/IndustryTileInspector.svelte`: remove industrial construction choices, product filter, and confirmation UI; keep tile/building/warehouse detail content.
- Modify `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`: update assertions to prove construction controls are gone and detail content remains.
- Modify `src/routes/+page.svelte`: route-level build menu, placement state, click handling, preview derivation, HUD feedback, and Escape cancellation.
- Modify `src/routes/retail-sim.e2e.ts`: update e2e flows to use `Build -> choose building -> click tile`, assert no confirmation dialogs, assert preview counts, and keep detail-only inspector coverage.

## Task 1: Pure Placement Preview Helpers

**Files:**

- Create: `src/lib/game/placementPreview.ts`
- Create: `src/lib/game/placementPreview.spec.ts`

- [ ] **Step 1: Write failing preview tests**

Create `src/lib/game/placementPreview.spec.ts` with these tests:

```ts
import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { getIndustryTilesByResource } from './industry';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview,
	getIndustryBuildPlacementBlockReason,
	getRetailBuildMenuOptions,
	getRetailPlacementBlockReason
} from './placementPreview';
import { createFoundingGameAtTile } from './placement';
import { createNewGame } from './state';

describe('retail placement preview', () => {
	test('marks buildable empty tiles as valid and road tiles as invalid before founding', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const openTile = city.tiles.find((tile) => !tile.locked && tile.feature === null)!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;

		const preview = createRetailPlacementPreview({
			game: null,
			city,
			archetypeId: 'boutique'
		});

		expect(preview.validTileIds).toContain(openTile.id);
		expect(preview.invalidTileIds).toContain(roadTile.id);
		expect(
			getRetailPlacementBlockReason({
				game: null,
				city,
				tileId: openTile.id,
				archetypeId: 'boutique'
			})
		).toBeNull();
		expect(
			getRetailPlacementBlockReason({
				game: null,
				city,
				tileId: roadTile.id,
				archetypeId: 'boutique'
			})
		).toBe('Road location');
	});

	test('blocks occupied retail tiles, max store count, and unaffordable expansion tiles', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const buildableTiles = city.tiles.filter((tile) => !tile.locked && tile.feature === null);
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: buildableTiles[0]!.id,
			seed: 20260503
		});
		const occupiedReason = getRetailPlacementBlockReason({
			game,
			city,
			tileId: buildableTiles[0]!.id,
			archetypeId: 'electronics'
		});
		const cashReason = getRetailPlacementBlockReason({
			game: { ...game, cash: 0 },
			city,
			tileId: buildableTiles[1]!.id,
			archetypeId: 'electronics'
		});
		const cappedGame = {
			...game,
			stores: [
				game.stores[0]!,
				{ ...game.stores[0]!, id: 'store-2', tileId: buildableTiles[1]!.id },
				{ ...game.stores[0]!, id: 'store-3', tileId: buildableTiles[2]!.id }
			]
		};

		expect(occupiedReason).toBe('Occupied location');
		expect(cashReason).toMatch(/^Requires \d[\d,]* cash$/);
		expect(
			getRetailPlacementBlockReason({
				game: cappedGame,
				city,
				tileId: buildableTiles[3]!.id,
				archetypeId: 'grocery'
			})
		).toBe('Store limit reached');
		expect(
			createRetailPlacementPreview({ game: cappedGame, city, archetypeId: 'grocery' }).validTileIds
		).toHaveLength(0);
	});

	test('summarizes retail build menu options as tile-derived ranges', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});

		const options = getRetailBuildMenuOptions({ game: null, city });
		const boutique = options.find((option) => option.archetypeId === 'boutique')!;

		expect(options).toHaveLength(4);
		expect(boutique.validTileCount).toBeGreaterThan(0);
		expect(boutique.setupCostRange.min).toBeLessThanOrEqual(boutique.setupCostRange.max);
		expect(boutique.projectedDailyRevenueRange.max).toBeGreaterThan(0);
	});
});

describe('industry placement preview', () => {
	test('marks matching resource tiles valid for raw producers', () => {
		expect.assertions(4);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const saltTile = getIndustryTilesByResource(city, 'salt-deposit')[0]!;

		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'grain-farm'
		});

		expect(preview.validTileIds).toContain(grainTile.id);
		expect(preview.invalidTileIds).toContain(saltTile.id);
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: grainTile.id,
				buildingTypeId: 'grain-farm'
			})
		).toBeNull();
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: saltTile.id,
				buildingTypeId: 'grain-farm'
			})
		).toBe('Requires grain field');
	});

	test('blocks industry construction before retail founding and when cash is short', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const industrialTile = city.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;

		expect(
			getIndustryBuildPlacementBlockReason({
				game: null,
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse'
			})
		).toBe('Found a retail store to unlock construction.');
		expect(
			getIndustryBuildPlacementBlockReason({
				game: { ...game, cash: 0 },
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse'
			})
		).toBe('Warehouse requires 1,000 cash.');
		expect(
			createIndustryPlacementPreview({ game: { ...game, cash: 0 }, buildingTypeId: 'warehouse' })
				.validTileIds
		).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
bun run test:unit -- src/lib/game/placementPreview.spec.ts --run
```

Expected: FAIL because `src/lib/game/placementPreview.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `src/lib/game/placementPreview.ts`:

```ts
import { ARCHETYPES } from './archetypes';
import { getTileById, getTilePlacementBlockReason } from './city';
import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { getIndustrialPlacementBlockReason } from './industryPlacement';
import { forecastOpening } from './placement';
import type { ArchetypeId, City, GameState, IndustrialBuildingTypeId, IndustryCity } from './types';
import { MAX_STORES } from './types';

export interface PlacementPreview {
	validTileIds: string[];
	invalidTileIds: string[];
}

export interface NumberRange {
	min: number;
	max: number;
}

export interface RetailBuildMenuOption {
	archetypeId: ArchetypeId;
	setupCostRange: NumberRange;
	projectedDailyRevenueRange: NumberRange;
	validTileCount: number;
	disabledReason: string | null;
}

interface RetailPlacementInput {
	game: GameState | null;
	city: City;
	tileId: string;
	archetypeId: ArchetypeId;
}

interface RetailPreviewInput {
	game: GameState | null;
	city: City;
	archetypeId: ArchetypeId;
}

interface RetailBuildMenuInput {
	game: GameState | null;
	city: City;
}

interface IndustryPlacementInput {
	game: GameState | null;
	tileId: string;
	buildingTypeId: IndustrialBuildingTypeId;
}

interface IndustryPreviewInput {
	game: GameState | null;
	buildingTypeId: IndustrialBuildingTypeId;
}

export function getRetailPlacementBlockReason(input: RetailPlacementInput): string | null {
	const tile = getTileById(input.city, input.tileId);

	if (!tile) {
		return 'Unknown city tile';
	}

	const tileBlockReason = getTilePlacementBlockReason(tile);

	if (tileBlockReason) {
		return tileBlockReason;
	}

	if (input.game?.stores.some((store) => store.tileId === tile.id)) {
		return 'Occupied location';
	}

	if (input.game && input.game.stores.length >= MAX_STORES) {
		return 'Store limit reached';
	}

	const setupCost = forecastOpening(tile, input.archetypeId).setupCost;

	if (input.game && input.game.cash < setupCost) {
		return `Requires ${setupCost.toLocaleString('en-US')} cash`;
	}

	return null;
}

export function createRetailPlacementPreview(input: RetailPreviewInput): PlacementPreview {
	const validTileIds: string[] = [];
	const invalidTileIds: string[] = [];

	for (const tile of input.city.tiles) {
		const reason = getRetailPlacementBlockReason({
			...input,
			tileId: tile.id
		});

		if (reason) {
			invalidTileIds.push(tile.id);
		} else {
			validTileIds.push(tile.id);
		}
	}

	return { validTileIds, invalidTileIds };
}

export function getRetailBuildMenuOptions(input: RetailBuildMenuInput): RetailBuildMenuOption[] {
	return ARCHETYPES.map((archetype) => {
		const forecasts = input.city.tiles
			.filter(
				(tile) =>
					getRetailPlacementBlockReason({
						game: input.game,
						city: input.city,
						tileId: tile.id,
						archetypeId: archetype.id
					}) === null
			)
			.map((tile) => forecastOpening(tile, archetype.id));

		if (forecasts.length === 0) {
			return {
				archetypeId: archetype.id,
				setupCostRange: { min: 0, max: 0 },
				projectedDailyRevenueRange: { min: 0, max: 0 },
				validTileCount: 0,
				disabledReason: 'No valid tiles'
			};
		}

		return {
			archetypeId: archetype.id,
			setupCostRange: rangeFrom(forecasts.map((forecast) => forecast.setupCost)),
			projectedDailyRevenueRange: rangeFrom(
				forecasts.map((forecast) => forecast.projectedDailyRevenue)
			),
			validTileCount: forecasts.length,
			disabledReason: null
		};
	});
}

export function getIndustryBuildPlacementBlockReason(input: IndustryPlacementInput): string | null {
	if (!input.game) {
		return 'Found a retail store to unlock construction.';
	}

	const buildingType = INDUSTRIAL_BUILDING_TYPES[input.buildingTypeId];
	const placementReason = getIndustrialPlacementBlockReason(
		input.game,
		input.tileId,
		input.buildingTypeId
	);

	if (placementReason) {
		return placementReason;
	}

	if (!buildingType) {
		return 'Unknown industrial building type';
	}

	if (input.game.cash < buildingType.buildCost) {
		return `${buildingType.name} requires ${buildingType.buildCost.toLocaleString('en-US')} cash.`;
	}

	return null;
}

export function createIndustryPlacementPreview(input: IndustryPreviewInput): PlacementPreview {
	const city = getActiveIndustryCity(input.game);

	if (!city) {
		return { validTileIds: [], invalidTileIds: [] };
	}

	const validTileIds: string[] = [];
	const invalidTileIds: string[] = [];

	for (const tile of city.tiles) {
		const reason = getIndustryBuildPlacementBlockReason({
			...input,
			tileId: tile.id
		});

		if (reason) {
			invalidTileIds.push(tile.id);
		} else {
			validTileIds.push(tile.id);
		}
	}

	return { validTileIds, invalidTileIds };
}

function getActiveIndustryCity(game: GameState | null): IndustryCity | undefined {
	return game?.industryCities.find((city) => city.id === game.activeIndustryCityId);
}

function rangeFrom(values: number[]): NumberRange {
	return {
		min: Math.min(...values),
		max: Math.max(...values)
	};
}
```

- [ ] **Step 4: Run the focused helper tests**

Run:

```bash
bun run test:unit -- src/lib/game/placementPreview.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit the helper**

Run:

```bash
git add src/lib/game/placementPreview.ts src/lib/game/placementPreview.spec.ts
git commit -m "feat: add placement preview rules"
```

## Task 2: Snapshot Preview Metadata

**Files:**

- Modify: `src/lib/game/mapRender.ts`
- Modify: `src/lib/game/mapRender.spec.ts`
- Modify: `src/lib/game/industryMapRender.ts`
- Modify: `src/lib/game/industryMapRender.spec.ts`

- [ ] **Step 1: Add failing map snapshot tests**

Update `src/lib/game/mapRender.spec.ts` with this test:

```ts
test('includes retail placement preview metadata when provided', () => {
	expect.assertions(3);
	const city = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: 20,
		height: 20,
		seed: 9
	});
	const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
	const game = createFoundingGameAtTile({
		archetypeId: 'convenience',
		city,
		tileId: tile.id,
		seed: 9
	});

	const snapshot = createCityMapSnapshot(game, null, {
		validTileIds: ['harbor-city-1-1'],
		invalidTileIds: ['harbor-city-10-6']
	});

	expect(snapshot.placementPreview?.validTileIds).toEqual(['harbor-city-1-1']);
	expect(snapshot.placementPreview?.invalidTileIds).toEqual(['harbor-city-10-6']);
	expect(createCityMapSnapshot(game, null).placementPreview).toBeNull();
});
```

Update `src/lib/game/industryMapRender.spec.ts` with this test:

```ts
test('includes industry placement preview metadata when provided', () => {
	expect.assertions(3);
	const game = createNewGame('convenience', 20260512);

	const snapshot = createIndustryMapSnapshot(game, null, {
		validTileIds: ['industry-city-1-1'],
		invalidTileIds: ['industry-city-1-4']
	});

	expect(snapshot.placementPreview?.validTileIds).toEqual(['industry-city-1-1']);
	expect(snapshot.placementPreview?.invalidTileIds).toEqual(['industry-city-1-4']);
	expect(createIndustryMapSnapshot(game, null).placementPreview).toBeNull();
});
```

- [ ] **Step 2: Run snapshot tests and verify failure**

Run:

```bash
bun run test:unit -- src/lib/game/mapRender.spec.ts src/lib/game/industryMapRender.spec.ts --run
```

Expected: FAIL because `createCityMapSnapshot` and `createIndustryMapSnapshot` do not accept preview metadata yet.

- [ ] **Step 3: Update retail snapshot types**

Modify `src/lib/game/mapRender.ts`:

```ts
import type { PlacementPreview } from './placementPreview';
```

Add `placementPreview` to `CityMapSnapshot`:

```ts
export interface CityMapSnapshot {
	cityId: string;
	width: number;
	height: number;
	selectedTileId: string | null;
	placementPreview: PlacementPreview | null;
	tiles: CityMapTileRender[];
	stores: CityMapStoreRender[];
}
```

Change the function signature and returned objects:

```ts
export function createCityMapSnapshot(
	game: GameState,
	selectedTileId: string | null,
	placementPreview: PlacementPreview | null = null
): CityMapSnapshot {
```

For both the missing-city return and active-city return, include:

```ts
placementPreview,
```

- [ ] **Step 4: Update industry snapshot types**

Modify `src/lib/game/industryMapRender.ts`:

```ts
import type { PlacementPreview } from './placementPreview';
```

Add `placementPreview` to `IndustryMapSnapshot`:

```ts
export interface IndustryMapSnapshot {
	cityId: string;
	width: number;
	height: number;
	selectedTileId: string | null;
	placementPreview: PlacementPreview | null;
	tiles: IndustryMapTileRender[];
	buildings: IndustryMapBuildingRender[];
}
```

Change the function signature and returned objects:

```ts
export function createIndustryMapSnapshot(
	game: GameState,
	selectedTileId: string | null,
	placementPreview: PlacementPreview | null = null
): IndustryMapSnapshot {
```

For both the missing-city return and active-city return, include:

```ts
placementPreview,
```

- [ ] **Step 5: Run snapshot tests**

Run:

```bash
bun run test:unit -- src/lib/game/mapRender.spec.ts src/lib/game/industryMapRender.spec.ts --run
```

Expected: PASS.

- [ ] **Step 6: Commit snapshot metadata**

Run:

```bash
git add src/lib/game/mapRender.ts src/lib/game/mapRender.spec.ts src/lib/game/industryMapRender.ts src/lib/game/industryMapRender.spec.ts
git commit -m "feat: pass placement previews through map snapshots"
```

## Task 3: Phaser Overlay Rendering

**Files:**

- Modify: `src/lib/phaser/cityMapScene.ts`
- Modify: `src/lib/phaser/industryMapScene.ts`

- [ ] **Step 1: Add retail preview drawing**

Modify `src/lib/phaser/cityMapScene.ts`.

Add constants near the existing depth constants:

```ts
const PLACEMENT_PREVIEW_VALID_COLOR = 0x22c55e;
const PLACEMENT_PREVIEW_INVALID_COLOR = 0xef4444;
const PLACEMENT_PREVIEW_ALPHA = 0.28;
```

Call `this.drawPlacementPreview();` in `renderSnapshot()` after the tile loop and before `createTerrainSprites()`:

```ts
for (const tile of this.snapshot.tiles) {
	this.drawTile(tile);
	this.createTileZone(tile);
}

this.drawPlacementPreview();
this.createTerrainSprites();
```

Add this method:

```ts
private drawPlacementPreview(): void {
	if (!this.mapGraphics || !this.snapshot?.placementPreview) {
		this.updateCanvasPlacementPreviewAttributes(0, 0);
		return;
	}

	const validTileIds = new Set(this.snapshot.placementPreview.validTileIds);
	const invalidTileIds = new Set(this.snapshot.placementPreview.invalidTileIds);

	for (const tile of this.snapshot.tiles) {
		const isValid = validTileIds.has(tile.id);
		const isInvalid = invalidTileIds.has(tile.id);

		if (!isValid && !isInvalid) {
			continue;
		}

		const x = tile.x * TILE_SIZE;
		const y = tile.y * TILE_SIZE;
		const color = isValid ? PLACEMENT_PREVIEW_VALID_COLOR : PLACEMENT_PREVIEW_INVALID_COLOR;

		this.mapGraphics.fillStyle(color, PLACEMENT_PREVIEW_ALPHA);
		this.mapGraphics.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
		this.mapGraphics.lineStyle(2, color, 0.55);
		this.mapGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
	}

	this.updateCanvasPlacementPreviewAttributes(validTileIds.size, invalidTileIds.size);
}
```

Add this method near the other canvas attribute helpers:

```ts
private updateCanvasPlacementPreviewAttributes(validCount: number, invalidCount: number): void {
	const canvas = this.game?.canvas;

	if (!canvas) {
		return;
	}

	canvas.dataset.placementPreviewMode = validCount + invalidCount > 0 ? 'active' : 'inactive';
	canvas.dataset.placementValidTileCount = String(validCount);
	canvas.dataset.placementInvalidTileCount = String(invalidCount);
}
```

- [ ] **Step 2: Add industry preview drawing**

Modify `src/lib/phaser/industryMapScene.ts`.

Add the same constants near the depth constants:

```ts
const PLACEMENT_PREVIEW_VALID_COLOR = 0x22c55e;
const PLACEMENT_PREVIEW_INVALID_COLOR = 0xef4444;
const PLACEMENT_PREVIEW_ALPHA = 0.28;
```

Call `this.drawPlacementPreview();` in `renderSnapshot()` after the tile loop and before `rebuildMarkerSprites()`:

```ts
for (const tile of this.snapshot.tiles) {
	this.drawTile(tile);
	this.createTileZone(tile);
}

this.drawPlacementPreview();
this.rebuildMarkerSprites();
```

Add the same `drawPlacementPreview()` method, changing only the tile type inferred from `this.snapshot.tiles`.

Add the same `updateCanvasPlacementPreviewAttributes()` method near `updateCanvasIndustryAttributes()`.

- [ ] **Step 3: Run type checking**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 4: Commit overlay rendering**

Run:

```bash
git add src/lib/phaser/cityMapScene.ts src/lib/phaser/industryMapScene.ts
git commit -m "feat: render placement preview overlays"
```

## Task 4: Build Menu Component

**Files:**

- Create: `src/lib/components/game/BuildMenu.svelte`
- Create: `src/lib/components/game/BuildMenu.svelte.spec.ts`

- [ ] **Step 1: Load Svelte docs before Svelte edits**

Use the official Svelte MCP workflow required by this repo:

1. Call `list-sections`.
2. Fetch all relevant sections with `get-documentation`.
3. After writing the component, run `svelte-autofixer` on the Svelte snippets until no issues remain.

Relevant docs sections should cover Svelte 5 runes, component props, event handlers, conditional blocks, keyed each blocks, and form inputs.

- [ ] **Step 2: Write failing BuildMenu component tests**

Create `src/lib/components/game/BuildMenu.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BuildMenu from './BuildMenu.svelte';
import type { RetailBuildMenuOption } from '$lib/game/placementPreview';

const retailOptions: RetailBuildMenuOption[] = [
	{
		archetypeId: 'convenience',
		setupCostRange: { min: 1100, max: 1500 },
		projectedDailyRevenueRange: { min: 700, max: 980 },
		validTileCount: 24,
		disabledReason: null
	},
	{
		archetypeId: 'boutique',
		setupCostRange: { min: 1200, max: 1900 },
		projectedDailyRevenueRange: { min: 420, max: 880 },
		validTileCount: 18,
		disabledReason: null
	}
];

describe('BuildMenu', () => {
	it('renders retail store types and chooses a retail placement tool', async () => {
		expect.assertions(5);
		const onChooseRetail = vi.fn();

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail,
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('dialog', { name: /build menu/i })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: /build retail/i })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /build convenience store/i }))
			.toBeVisible();
		await expect.element(page.getByText(/24 valid tiles/i)).toBeVisible();
		await page.getByRole('button', { name: /build convenience store/i }).click();
		expect(onChooseRetail).toHaveBeenCalledWith('convenience');
	});

	it('renders industry buildings and filters them by product chain search', async () => {
		expect.assertions(6);
		const onChooseIndustry = vi.fn();

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry,
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: /build industry/i })).toBeVisible();
		await page.getByRole('button', { name: /filter: all products/i }).click();
		await page.getByLabelText(/search products/i).fill('gift');
		await expect.element(page.getByRole('button', { name: /gifts/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /snacks/i })).not.toBeInTheDocument();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /build gift workshop/i })).toBeVisible();
		await page.getByRole('button', { name: /build gift workshop/i }).click();
		expect(onChooseIndustry).toHaveBeenCalledWith('gift-workshop');
	});

	it('explains locked industry construction before a store exists', async () => {
		expect.assertions(2);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: 'Found a retail store to unlock construction.',
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect
			.element(page.getByText('Found a retail store to unlock construction.'))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeDisabled();
	});
});
```

- [ ] **Step 3: Run the failing BuildMenu tests**

Run:

```bash
bun run test:unit -- --project client src/lib/components/game/BuildMenu.svelte.spec.ts --run
```

Expected: FAIL because `BuildMenu.svelte` does not exist.

- [ ] **Step 4: Implement `BuildMenu.svelte`**

Create `src/lib/components/game/BuildMenu.svelte` with these behaviors:

```svelte
<script lang="ts">
	import { asset } from '$app/paths';
	import { getIndustrialBuildingArt, getStoreArt } from '$lib/assets/gameArt';
	import { ARCHETYPES, getArchetype } from '$lib/game/archetypes';
	import {
		INDUSTRIAL_BUILDING_TYPES,
		getIndustrialBuildingTypesForProductChain
	} from '$lib/game/industry';
	import type { RetailBuildMenuOption } from '$lib/game/placementPreview';
	import type { ArchetypeId, IndustrialBuildingTypeId } from '$lib/game/types';

	interface ProductChainFilter {
		id: string;
		name: string;
		buildingCount: number;
	}

	interface Props {
		activeMapView: 'retail' | 'industry';
		retailOptions: RetailBuildMenuOption[];
		industryLockedReason: string | null;
		onChooseRetail: (archetypeId: ArchetypeId) => void;
		onChooseIndustry: (buildingTypeId: IndustrialBuildingTypeId) => void;
		onClose: () => void;
	}

	let {
		activeMapView,
		retailOptions,
		industryLockedReason,
		onChooseRetail,
		onChooseIndustry,
		onClose
	}: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	let selectedProductFilterId = $state<string | null>(null);
	let productFilterOpen = $state(false);
	let productFilterSearch = $state('');
	const productFilters = $derived.by(() => getProductChainFilters());
	const selectedProductFilter = $derived(
		selectedProductFilterId
			? (productFilters.find((filter) => filter.id === selectedProductFilterId) ?? null)
			: null
	);
	const filterButtonLabel = $derived(
		selectedProductFilter ? `Filter: ${selectedProductFilter.name}` : 'Filter: All products'
	);
	const filteredProductFilters = $derived.by(() => {
		const query = productFilterSearch.trim().toLowerCase();

		if (!query) {
			return productFilters;
		}

		return productFilters.filter(
			(filter) =>
				filter.name.toLowerCase().includes(query) || filter.id.toLowerCase().includes(query)
		);
	});
	const visibleIndustryBuildingTypes = $derived.by(() =>
		selectedProductFilterId
			? getIndustrialBuildingTypesForProductChain(selectedProductFilterId)
			: Object.values(INDUSTRIAL_BUILDING_TYPES)
	);

	function formatRange(range: { min: number; max: number }): string {
		if (range.min === range.max) {
			return currency.format(range.min);
		}

		return `${currency.format(range.min)}-${currency.format(range.max)}`;
	}

	function getProductChainFilters(): ProductChainFilter[] {
		const categories: Array<{ id: string; name: string }> = [];

		for (const archetype of ARCHETYPES) {
			for (const category of archetype.startingCategories) {
				if (!categories.some((candidate) => candidate.id === category.id)) {
					categories.push({ id: category.id, name: category.name });
				}
			}
		}

		return categories
			.map((category) => ({
				id: category.id,
				name: category.name,
				buildingCount: getIndustrialBuildingTypesForProductChain(category.id).length
			}))
			.sort((first, second) => first.name.localeCompare(second.name));
	}

	function selectProductFilter(filterId: string | null): void {
		selectedProductFilterId = filterId;
		productFilterOpen = false;
		productFilterSearch = '';
	}

	function chooseRetail(archetypeId: ArchetypeId): void {
		onChooseRetail(archetypeId);
	}

	function chooseIndustry(buildingTypeId: IndustrialBuildingTypeId): void {
		if (industryLockedReason) {
			return;
		}

		onChooseIndustry(buildingTypeId);
	}
</script>

<div class="build-backdrop">
	<button type="button" class="backdrop-button" aria-label="Close build menu" onclick={onClose}
	></button>
	<section class="build-menu" role="dialog" aria-modal="true" aria-label="Build menu">
		<header>
			<div>
				<p>{activeMapView === 'retail' ? 'Retail city' : 'Industry city'}</p>
				<h2>{activeMapView === 'retail' ? 'Build Retail' : 'Build Industry'}</h2>
			</div>
			<button type="button" class="close" aria-label="Close build menu" onclick={onClose}>x</button>
		</header>

		{#if activeMapView === 'retail'}
			<div class="option-list">
				{#each retailOptions as option (option.archetypeId)}
					{@const archetype = getArchetype(option.archetypeId)}
					{@const art = getStoreArt(option.archetypeId)}
					<button
						type="button"
						class="build-option"
						disabled={option.disabledReason !== null}
						onclick={() => chooseRetail(option.archetypeId)}
					>
						<img src={asset(art.path)} alt={art.alt} width="64" height="48" />
						<span>
							<strong>Build {archetype.name}</strong>
							<small>
								Setup {formatRange(option.setupCostRange)} · Revenue {formatRange(
									option.projectedDailyRevenueRange
								)}/day
							</small>
							<small>
								{option.disabledReason ?? `${option.validTileCount} valid tiles`}
							</small>
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<div class="product-filter">
				<button
					type="button"
					class="filter-trigger"
					aria-expanded={productFilterOpen}
					onclick={() => (productFilterOpen = !productFilterOpen)}
				>
					{filterButtonLabel}
				</button>
				{#if selectedProductFilterId}
					<button
						type="button"
						class="filter-clear"
						aria-label="Clear product filter"
						onclick={() => selectProductFilter(null)}>x</button
					>
				{/if}
			</div>
			{#if industryLockedReason}
				<p class="disabled-copy">{industryLockedReason}</p>
			{/if}
			{#if productFilterOpen}
				<div class="filter-popup" role="dialog" aria-modal="true" aria-label="Product chain filter">
					<label>
						<span>Search products</span>
						<input type="search" bind:value={productFilterSearch} />
					</label>
					<div class="filter-list">
						<button
							type="button"
							aria-pressed={selectedProductFilterId === null}
							onclick={() => selectProductFilter(null)}
						>
							<span>All products</span>
							<small>All industrial buildings</small>
						</button>
						{#each filteredProductFilters as filter (filter.id)}
							<button
								type="button"
								aria-pressed={selectedProductFilterId === filter.id}
								disabled={filter.buildingCount === 0}
								onclick={() => selectProductFilter(filter.id)}
							>
								<span>{filter.name}</span>
								<small>{filter.buildingCount} chain buildings</small>
							</button>
						{/each}
					</div>
				</div>
			{/if}
			<div class="option-list">
				{#each visibleIndustryBuildingTypes as type (type.id)}
					<button
						type="button"
						class="build-option"
						disabled={industryLockedReason !== null}
						onclick={() => chooseIndustry(type.id)}
					>
						<img src={asset(getIndustrialBuildingArt(type.id))} alt="" width="40" height="40" />
						<span>
							<strong>Build {type.name}</strong>
							<small
								>Cost {currency.format(type.buildCost)} · Operating {currency.format(
									type.dailyOperatingCost
								)}/day</small
							>
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</section>
</div>
```

Add CSS in the same component with the existing Serpens quiet dark style:

```svelte
<style>
	.build-backdrop {
		position: fixed;
		inset: 0;
		z-index: 45;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(4 8 13 / 0.56);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
	}

	.build-menu {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 0.8rem;
		width: min(30rem, 100%);
		max-height: calc(100dvh - 2rem);
		overflow: auto;
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #0b111b;
		color: #edf2f7;
		padding: 1rem;
		box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
	}

	header,
	.build-option,
	.product-filter {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	header {
		justify-content: space-between;
	}

	h2,
	p {
		margin: 0;
	}

	header p,
	small,
	.disabled-copy {
		color: #a7b4c8;
	}

	.option-list,
	.filter-popup,
	.filter-list {
		display: grid;
		gap: 0.55rem;
	}

	button {
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #151f2d;
		color: inherit;
	}

	button:hover,
	button:focus-visible {
		border-color: #5f8fd0;
		background: #1b2a3d;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.close,
	.filter-clear {
		width: 2rem;
		height: 2rem;
		padding: 0;
	}

	.build-option {
		width: 100%;
		padding: 0.65rem;
		text-align: left;
	}

	.build-option img {
		flex: 0 0 auto;
		border-radius: 6px;
		object-fit: cover;
	}

	.build-option span {
		display: grid;
		gap: 0.18rem;
		min-width: 0;
	}

	.filter-trigger {
		flex: 1 1 auto;
		padding: 0.6rem 0.7rem;
		text-align: left;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input {
		min-width: 0;
		border: 1px solid #31445c;
		border-radius: 6px;
		background: #09111c;
		color: #edf2f7;
		padding: 0.55rem;
	}
</style>
```

- [ ] **Step 5: Run the Svelte autofixer**

Run `svelte-autofixer` on `BuildMenu.svelte`. Apply every suggested fix until it reports no issues.

- [ ] **Step 6: Run the BuildMenu tests**

Run:

```bash
bun run test:unit -- --project client src/lib/components/game/BuildMenu.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 7: Commit the build menu**

Run:

```bash
git add src/lib/components/game/BuildMenu.svelte src/lib/components/game/BuildMenu.svelte.spec.ts
git commit -m "feat: add active map build menu"
```

## Task 5: Detail-Only Inspectors

**Files:**

- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`

- [ ] **Step 1: Load Svelte docs before Svelte edits**

Use the same Svelte MCP docs/autofixer workflow from Task 4 before modifying either inspector.

- [ ] **Step 2: Update retail inspector tests first**

In `src/lib/components/game/TileInspector.svelte.spec.ts`, remove tests that expect store opening confirmation. Add this test:

```ts
it('keeps empty retail tiles detail-only without construction controls', async () => {
	expect.assertions(3);

	renderInspector({
		openingOptions: [
			{ archetypeId: 'boutique', forecast: forecastFor('boutique'), disabledReason: null }
		]
	});

	await expect.element(page.getByRole('heading', { name: /tile 1, 1/i })).toBeVisible();
	await expect.element(page.getByRole('heading', { name: 'Store type' })).not.toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: /open boutique goods here/i }))
		.not.toBeInTheDocument();
});
```

Then simplify the local `renderInspector` props so the component no longer receives `openingOptions`, `gameStarted`, `disabledReason`, `onFoundStore`, or `onOpenStore`.

- [ ] **Step 3: Update industry inspector tests first**

In `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`, remove tests that expect allowed building choices, product filter, confirmation, cancellation, and pending-build clearing. Add these tests:

```ts
it('keeps empty industry tiles detail-only without construction controls', async () => {
	expect.assertions(3);
	const game = createNewGame('convenience', 20260512);
	const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;

	render(IndustryTileInspector, {
		game,
		tile,
		building: null,
		onClose: vi.fn()
	});

	await expect.element(page.getByRole('heading', { name: /industry tile/i })).toBeVisible();
	await expect
		.element(page.getByRole('button', { name: /build grain farm/i }))
		.not.toBeInTheDocument();
	await expect
		.element(page.getByRole('button', { name: /filter: all products/i }))
		.not.toBeInTheDocument();
});
```

Keep the existing thumbnail, warehouse capacity, and material detail tests by rendering built tiles.

- [ ] **Step 4: Run inspector tests and verify failure**

Run:

```bash
bun run test:unit -- --project client src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run
```

Expected: FAIL because the inspectors still render construction controls.

- [ ] **Step 5: Remove retail construction UI**

Modify `src/lib/components/game/TileInspector.svelte`:

- Remove `OpeningOption` and `ArchetypeId` imports if only used for construction.
- Remove props `openingOptions`, `gameStarted`, `disabledReason`, `onFoundStore`, and `onOpenStore`.
- Remove `pendingOption`, `pendingTileId`, `pendingIsCurrent`, `pendingArchetype`, `pendingArt`, `pendingArtSrc`.
- Remove `chooseOpeningOption`, `cancelOpening`, and `confirmOpening`.
- Change `closeInspector()` to only call `onClose()`.
- Remove the empty-tile `Store type` section and `Confirm store opening` markup.
- Keep tile stats visible for empty tiles.
- Keep store detail tabs, stock, staff, and store art unchanged.

- [ ] **Step 6: Remove industry construction UI**

Modify `src/lib/components/game/IndustryTileInspector.svelte`:

- Remove `ARCHETYPES`, `getIndustrialBuildingArt`, `PRODUCTION_RECIPES`, `getIndustrialBuildingTypesForProductChain`, `getAllowedIndustrialBuildingTypes`, and `getIndustrialPlacementBlockReason` imports if no longer used.
- Remove props `constructionDisabledReason` and `onBuild`.
- Remove product filter state and handlers.
- Remove `allowedBuildingTypes`, `productFilters`, `visibleBuildingTypes`, `pendingBuilding`, `pendingTileId`, `pendingIsCurrent`, `pendingIsAllowed`, `pendingBuildingArtSrc`, and `pendingRecipe`.
- Remove `chooseBuilding`, `cancelBuild`, `confirmBuild`, and `getBuildingPlacementBlockReason`.
- Remove the `Industrial building choices`, `Confirm industrial build`, and `Product chain filter` markup.
- Keep tile stats, building detail, production log, warehouse summary, material icons, and close handling unchanged.

- [ ] **Step 7: Run Svelte autofixer on both inspectors**

Run `svelte-autofixer` on both modified inspector snippets until there are no issues.

- [ ] **Step 8: Run inspector tests**

Run:

```bash
bun run test:unit -- --project client src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 9: Commit detail-only inspectors**

Run:

```bash
git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte src/lib/components/game/IndustryTileInspector.svelte.spec.ts
git commit -m "refactor: make tile inspectors detail-only"
```

## Task 6: Route-Level Placement Flow

**Files:**

- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Load Svelte docs before route edits**

Use the Svelte MCP docs/autofixer workflow before modifying `src/routes/+page.svelte`.

- [ ] **Step 2: Import the build menu and preview helpers**

Add imports in `src/routes/+page.svelte`:

```ts
import BuildMenu from '$lib/components/game/BuildMenu.svelte';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview,
	getIndustryBuildPlacementBlockReason,
	getRetailBuildMenuOptions,
	getRetailPlacementBlockReason
} from '$lib/game/placementPreview';
```

- [ ] **Step 3: Add placement and build-menu state**

Add state near the other route-level state:

```ts
let isBuildMenuOpen = $state(false);
let retailPlacementArchetypeId = $state<ArchetypeId | null>(null);
let industryPlacementBuildingTypeId = $state<IndustrialBuildingTypeId | null>(null);
let placementFeedback = $state<string | null>(null);
```

Add derived state:

```ts
let isPlacementModeActive = $derived(
	retailPlacementArchetypeId !== null || industryPlacementBuildingTypeId !== null
);
let retailBuildOptions = $derived(getRetailBuildMenuOptions({ game, city: activeCity }));
let retailPlacementPreview = $derived(
	retailPlacementArchetypeId
		? createRetailPlacementPreview({
				game,
				city: activeCity,
				archetypeId: retailPlacementArchetypeId
			})
		: null
);
let industryPlacementPreview = $derived(
	industryPlacementBuildingTypeId
		? createIndustryPlacementPreview({
				game,
				buildingTypeId: industryPlacementBuildingTypeId
			})
		: null
);
```

Change snapshot derivation:

```ts
let mapSnapshot = $derived(
	createCityMapSnapshot(game ?? starterMapState, selectedTileId, retailPlacementPreview)
);
let industryMapSnapshot = $derived(
	createIndustryMapSnapshot(
		game ?? starterMapState,
		selectedIndustryTileId,
		industryPlacementPreview
	)
);
```

- [ ] **Step 4: Add placement handlers**

Add these functions:

```ts
function openBuildMenu(): void {
	isViewMenuOpen = false;
	isSavePanelOpen = false;
	isBuildMenuOpen = true;
}

function closeBuildMenu(): void {
	isBuildMenuOpen = false;
}

function armRetailPlacement(archetypeId: ArchetypeId): void {
	retailPlacementArchetypeId = archetypeId;
	industryPlacementBuildingTypeId = null;
	selectedTileId = null;
	selectedIndustryTileId = null;
	placementFeedback = null;
	isBuildMenuOpen = false;
}

function armIndustryPlacement(buildingTypeId: IndustrialBuildingTypeId): void {
	industryPlacementBuildingTypeId = buildingTypeId;
	retailPlacementArchetypeId = null;
	selectedTileId = null;
	selectedIndustryTileId = null;
	placementFeedback = null;
	isBuildMenuOpen = false;
}

function cancelPlacement(): void {
	retailPlacementArchetypeId = null;
	industryPlacementBuildingTypeId = null;
	placementFeedback = null;
}
```

Change `selectTile`:

```ts
function selectTile(tileId: string) {
	if (retailPlacementArchetypeId) {
		placeRetailAtTile(retailPlacementArchetypeId, tileId);
		return;
	}

	selectedTileId = tileId;
	selectedIndustryTileId = null;
}
```

Change `selectIndustryTile`:

```ts
function selectIndustryTile(tileId: string) {
	if (industryPlacementBuildingTypeId) {
		placeIndustryAtTile(industryPlacementBuildingTypeId, tileId);
		return;
	}

	selectedIndustryTileId = tileId;
	selectedTileId = null;
}
```

Add direct placement functions:

```ts
function placeRetailAtTile(archetypeId: ArchetypeId, tileId: string): void {
	const reason = getRetailPlacementBlockReason({
		game,
		city: activeCity,
		tileId,
		archetypeId
	});

	if (reason) {
		selectedTileId = tileId;
		selectedIndustryTileId = null;
		placementFeedback = reason;
		return;
	}

	if (!game) {
		const tile = getTileById(starterCity, tileId);

		if (!tile) {
			placementFeedback = 'Unknown city tile';
			return;
		}

		setGameAndAutosave(
			createFoundingGameAtTile({
				archetypeId,
				city: starterCity,
				tileId: tile.id,
				seed: 20260503
			})
		);
	} else {
		const next = game.stores.length + 1;
		setGameAndAutosave(
			openStoreAtTile(game, {
				tileId,
				name: `Store #${next}`,
				archetypeId
			})
		);
	}

	selectedTileId = null;
	selectedIndustryTileId = null;
	cancelPlacement();
}

function placeIndustryAtTile(buildingTypeId: IndustrialBuildingTypeId, tileId: string): void {
	const reason = getIndustryBuildPlacementBlockReason({
		game,
		tileId,
		buildingTypeId
	});

	if (reason) {
		selectedIndustryTileId = tileId;
		selectedTileId = null;
		placementFeedback = reason;
		return;
	}

	if (!game) {
		placementFeedback = 'Found a retail store to unlock construction.';
		return;
	}

	setGameAndAutosave(buildIndustrialBuilding(game, { tileId, buildingTypeId }));
	selectedIndustryTileId = null;
	selectedTileId = null;
	cancelPlacement();
}
```

- [ ] **Step 5: Update menu switching and Escape behavior**

In `showRetailMap()` and `showIndustryMap()`, call `cancelPlacement()` so hidden map placement does not stay armed.

In `handleKeydown`, add build menu and placement handling before tile inspector handling:

```ts
if (isBuildMenuOpen) {
	isBuildMenuOpen = false;
	isViewMenuOpen = false;
	return;
}

if (isPlacementModeActive) {
	cancelPlacement();
	return;
}
```

- [ ] **Step 6: Add HUD controls and render BuildMenu**

Add a Build button in `.map-actions`:

```svelte
<button
	type="button"
	class="map-icon-button"
	aria-label="Build"
	aria-pressed={isPlacementModeActive}
	onclick={openBuildMenu}
>
	<svg aria-hidden="true" viewBox="0 0 24 24">
		<path d="M4 20h16" />
		<path d="M6 20V8l6-4 6 4v12" />
		<path d="M9 20v-6h6v6" />
	</svg>
</button>
```

Add placement status near the HUD title:

```svelte
{#if isPlacementModeActive}
	<div class="placement-status" role="status" aria-label="Placement status">
		<span>{placementFeedback ?? 'Choose a highlighted tile to build.'}</span>
		<button type="button" onclick={cancelPlacement}>Cancel</button>
	</div>
{/if}
```

Render the build menu after the map section content:

```svelte
{#if isBuildMenuOpen}
	<BuildMenu
		{activeMapView}
		retailOptions={retailBuildOptions}
		industryLockedReason={game ? null : 'Found a retail store to unlock construction.'}
		onChooseRetail={armRetailPlacement}
		onChooseIndustry={armIndustryPlacement}
		onClose={closeBuildMenu}
	/>
{/if}
```

Gate inspectors so placement clicks do not open them:

```svelte
{#if selectedTile && !isPlacementModeActive}
```

```svelte
{#if selectedIndustryTile && !isPlacementModeActive}
```

Remove `openingOptions`, `gameStarted`, `disabledReason`, `onFoundStore`, and `onOpenStore` props from `TileInspector`.

Remove `constructionDisabledReason` and `onBuild` props from `IndustryTileInspector`.

- [ ] **Step 7: Add placement status CSS**

Add CSS to `src/routes/+page.svelte`:

```css
.placement-status {
	position: absolute;
	left: 1rem;
	bottom: 1rem;
	z-index: 22;
	display: flex;
	align-items: center;
	gap: 0.6rem;
	max-width: min(32rem, calc(100vw - 2rem));
	border: 1px solid rgb(49 68 92 / 0.82);
	border-radius: 8px;
	background: rgb(11 17 27 / 0.9);
	box-shadow: 0 18px 40px rgb(0 0 0 / 0.32);
	color: #edf2f7;
	padding: 0.65rem 0.75rem;
	backdrop-filter: blur(6px);
}

.placement-status span {
	min-width: 0;
	color: #d8e2ef;
	font-size: 0.86rem;
}

.placement-status button {
	flex: 0 0 auto;
	border: 1px solid #31445c;
	border-radius: 8px;
	background: #151f2d;
	color: #edf2f7;
	padding: 0.45rem 0.65rem;
}
```

- [ ] **Step 8: Run Svelte autofixer on the route**

Run `svelte-autofixer` on `src/routes/+page.svelte` until there are no issues.

- [ ] **Step 9: Run focused checks**

Run:

```bash
bun run check
bun run test:unit -- src/lib/game/placementPreview.spec.ts src/lib/game/mapRender.spec.ts src/lib/game/industryMapRender.spec.ts --run
bun run test:unit -- --project client src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run
```

Expected: all commands PASS.

- [ ] **Step 10: Commit route placement flow**

Run:

```bash
git add src/routes/+page.svelte
git commit -m "feat: wire building-first placement flow"
```

## Task 7: E2E Flow Updates And Full Verification

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Replace e2e build helpers**

In `src/routes/retail-sim.e2e.ts`, replace `chooseStoreType` with:

```ts
async function chooseRetailBuildTool(page: Page, storeTypeName: RegExp) {
	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu).toBeVisible();
	await buildMenu.getByRole('button', { name: storeTypeName }).click();
	await expect(buildMenu).toHaveCount(0);
	await expect(page.locator('.map-canvas canvas')).toHaveAttribute(
		'data-placement-preview-mode',
		'active'
	);
}
```

Replace `buildIndustryBuildingAt` with:

```ts
async function buildIndustryBuildingAt(
	page: Page,
	canvas: Locator,
	input: { x: number; y: number; buildingName: RegExp; expectedBuildingCount: number }
) {
	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu).toBeVisible();
	await buildMenu.getByRole('button', { name: input.buildingName }).click();
	await expect(buildMenu).toHaveCount(0);
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'active');
	await expect(canvas).toHaveAttribute('data-placement-valid-tile-count', /^[1-9]\d*$/);
	await clickCanvasTile(page, canvas, input.x, input.y);
	await expect(page.getByRole('dialog', { name: /confirm industrial build/i })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: /industry tile details/i })).toHaveCount(0);
	await expect(canvas).toHaveAttribute(
		'data-industry-building-count',
		String(input.expectedBuildingCount)
	);
	await expect(canvas).toHaveAttribute('data-industry-building-sprite-count', /^[1-9]\d*$/);
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'inactive');
}
```

- [ ] **Step 2: Update retail founding and expansion tests**

In `player can found a store from the city map and advance a day`, replace tile-first opening assertions with:

```ts
const mapCanvas = page.locator('.map-canvas canvas');
await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '0');
await chooseRetailBuildTool(page, /build boutique goods/i);
await clickCanvasTile(page, mapCanvas, 1, 6);
await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
await expect(mapCanvas).toHaveAttribute('data-store-marker-mode', 'image');
await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');
```

In `player expands from a selected city tile`, use:

```ts
await chooseRetailBuildTool(page, /build electronics & games/i);
await clickCanvasTile(page, mapCanvas, 2, 6);
await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '2');
```

- [ ] **Step 3: Update invalid retail placement e2e**

Change `city map renders terrain assets and blocks road and river placement` so detail inspection and placement invalid feedback are separate:

```ts
await clickMapTile(page, 10, 6);
const roadDialog = page.getByRole('dialog', { name: /tile details/i });
await expect(roadDialog).toBeVisible();
await expect(roadDialog.getByText(/road/i).first()).toBeVisible();
await page.getByRole('button', { name: /close tile inspector/i }).click();

const canvas = await expectRetailMapReady(page);
await chooseRetailBuildTool(page, /build boutique goods/i);
await clickCanvasTile(page, canvas, 10, 6);
await expect(page.getByRole('status', { name: /placement status/i })).toContainText(
	/road location/i
);
await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'active');
await expect(canvas).toHaveAttribute('data-placement-invalid-tile-count', /^[1-9]\d*$/);
await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
```

- [ ] **Step 4: Update industry map e2e**

In `player can switch to the industry city map and back to retail`, replace inspector build confirmation with:

```ts
const cashBeforeBuild = await readCompanyCash(page);
await page.getByRole('button', { name: /^build$/i }).click();
await page
	.getByRole('dialog', { name: /build menu/i })
	.getByRole('button', { name: /build water pump/i })
	.click();
await expect(industryCanvas).toHaveAttribute('data-placement-preview-mode', 'active');
await clickCanvasTile(page, industryCanvas, 1, 7);
await expect(page.getByRole('dialog', { name: /confirm industrial build/i })).toHaveCount(0);
await expect(page.getByRole('dialog', { name: /industry tile details/i })).toHaveCount(0);
await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '1');
await expect(industryCanvas).toHaveAttribute('data-industry-building-sprite-count', /^[1-9]\d*$/);
expect(await readCompanyCash(page)).toBeLessThan(cashBeforeBuild);
```

Change `industry map tile click shows construction status before founding a store` so the product filter is tested from the build menu:

```ts
await page.getByRole('button', { name: /^build$/i }).click();
const buildMenu = page.getByRole('dialog', { name: /build menu/i });
await expect(buildMenu.getByText(/found a retail store to unlock construction/i)).toBeVisible();
await buildMenu.getByRole('button', { name: /filter: all products/i }).click();
await buildMenu.getByLabel(/search products/i).fill('gift');
await expect(buildMenu.getByRole('button', { name: /gifts/i })).toBeVisible();
await buildMenu.getByRole('button', { name: /gifts/i }).click();
await expect(buildMenu.getByRole('button', { name: /build gift workshop/i })).toBeDisabled();
```

- [ ] **Step 5: Run targeted e2e tests**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "found a store|city map renders terrain assets|switch to the industry city map|construction status|builds convenience production|expands"
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
bun run check
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: all commands PASS.

- [ ] **Step 7: Commit e2e updates**

Run:

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test: cover building-first placement flows"
```

## Self-Review Notes

- Spec coverage: Tasks 1 and 2 cover pure rule and preview metadata. Task 3 covers green/red overlays and `data-*` attributes. Task 4 covers the active-map build picker. Task 5 makes inspectors detail-only. Task 6 wires route-level placement, immediate build commits, invalid feedback, autosave, and Escape/cancel. Task 7 updates Playwright coverage for retail, industry, invalid placement, and detail-only tile clicks.
- Scope check: This is one interaction refactor. It does not add new buildings, recipes, drag placement, multi-build tools, or Control Tower changes.
- Type consistency: The plan uses `ArchetypeId`, `IndustrialBuildingTypeId`, `PlacementPreview`, `RetailBuildMenuOption`, `createRetailPlacementPreview`, `createIndustryPlacementPreview`, `getRetailPlacementBlockReason`, and `getIndustryBuildPlacementBlockReason` consistently across helper, snapshots, Svelte, and e2e steps.
