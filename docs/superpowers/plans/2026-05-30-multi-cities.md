# Multi Cities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hand-authored multi-city campaign layer with a combined world map, progressive city unlocks, city specialization, and a company-wide dynamic store cap.

**Architecture:** Add pure world/campaign logic in `src/lib/game/world.ts`, then thread it through `GameState`, placement, simulation, persistence, and the route. Keep detailed retail and industry maps as generated `City` and `IndustryCity` values; the new Svelte world map is a small SVG/HTML node map above those existing detailed maps.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 runes, Vitest browser/node projects, Playwright e2e, Bun, Tailwind v4/global tokens, adapter-static SPA build.

**Spec:** `docs/superpowers/specs/2026-05-30-multi-cities-design.md`

---

## File Structure

**New files:**

- `src/lib/game/world.ts` - world-city catalog, world progress, reveal/open/select helpers, demand/resource profile helpers.
- `src/lib/game/world.spec.ts` - node Vitest tests for catalog integrity, initial progress, reveal milestones, opening cities, blocked decisions, and store-cap bumps.
- `src/lib/components/game/WorldMap.svelte` - combined retail/industry world map node view and city inspector.
- `src/lib/components/game/WorldMap.svelte.spec.ts` - browser Vitest tests for opened/revealed/locked node rendering and callbacks.

**Modified files:**

- `src/lib/game/types.ts` - add world/campaign types to `GameState`, remove `MAX_STORES`.
- `src/lib/game/state.ts` - initialize world progress and `storeCap`; use `storeCap` for store opening; refresh world progress after store opening.
- `src/lib/game/state.spec.ts` - update starter-state and store-cap tests.
- `src/lib/game/placement.ts` - keep founding game world state consistent after placing the starter store.
- `src/lib/game/placementPreview.ts` - replace `MAX_STORES` checks with `game.storeCap`.
- `src/lib/game/placementPreview.spec.ts` - update cap tests to use explicit `storeCap`.
- `src/lib/game/events.ts` - replace `MAX_STORES` in expansion opportunity logic with `game.storeCap`.
- `src/lib/game/industry.ts` - make `generateIndustryCity` accept an optional resource profile.
- `src/lib/game/industry.spec.ts` - add specialized resource-profile tests and keep starter broad-resource test.
- `src/lib/game/industryPlacement.ts` - refresh world progress after industrial construction if a milestone is earned.
- `src/lib/game/stock.ts` - apply retail city demand multipliers in `buildCityDemandPools`.
- `src/lib/game/stock.spec.ts` - add demand multiplier coverage.
- `src/lib/game/simulateDay.ts` - refresh world progress after day advancement.
- `src/lib/persistence/saveCodec.ts` - validate and normalize `world` and `storeCap`.
- `src/lib/persistence/saveRepository.spec.ts` - add save validation/migration tests.
- `src/routes/+page.svelte` - add world view mode, world selection/opening handlers, menu item, and `<WorldMap>`.
- `src/routes/retail-sim.e2e.ts` - add world-map open/switch/build coverage.

---

## Task 1: Add World Types, Catalog, And Initial Progress

**Files:**

- Modify: `src/lib/game/types.ts`
- Create: `src/lib/game/world.ts`
- Create: `src/lib/game/world.spec.ts`

- [ ] **Step 1: Write the failing world catalog tests**

Create `src/lib/game/world.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
	STARTER_STORE_CAP,
	WORLD_CITY_CATALOG,
	createInitialWorldProgress,
	getWorldCityDefinition,
	getWorldCityStatus
} from './world';
import type { GameState } from './types';

function gameStub(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260530,
		rngState: 1,
		day: 1,
		cash: 20_000,
		debt: 0,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
		},
		cities: [],
		activeCityId: 'harbor-city',
		industryCities: [],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		warehouse: {
			capacity: 0,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		},
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		...overrides
	};
}

describe('world city catalog', () => {
	test('defines three retail and three industry city nodes with unique ids', () => {
		expect.assertions(5);
		const ids = WORLD_CITY_CATALOG.map((city) => city.id);

		expect(WORLD_CITY_CATALOG).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
		expect(WORLD_CITY_CATALOG.filter((city) => city.kind === 'retail')).toHaveLength(3);
		expect(WORLD_CITY_CATALOG.filter((city) => city.kind === 'industry')).toHaveLength(3);
		expect(WORLD_CITY_CATALOG.every((city) => city.openingCost >= 0)).toBe(true);
	});

	test('creates initial world progress with the starter retail and industry cities opened', () => {
		expect.assertions(4);
		const progress = createInitialWorldProgress();

		expect(progress.openedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(progress.revealedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(progress.claimedMilestoneIds).toEqual([]);
		expect(STARTER_STORE_CAP).toBeGreaterThan(1);
	});

	test('returns world city status from saved progress and company cash', () => {
		expect.assertions(5);
		const game = gameStub({
			cash: 1_000,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		});

		const harbor = getWorldCityStatus(game, 'harbor-city');
		const campus = getWorldCityStatus(game, 'campus-junction');
		const garden = getWorldCityStatus(game, 'garden-borough');

		expect(harbor?.state).toBe('opened');
		expect(campus?.state).toBe('revealed');
		expect(campus?.canOpen).toBe(false);
		expect(garden?.state).toBe('locked');
		expect(getWorldCityDefinition('missing-city')).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run the focused test to confirm it fails**

Run: `bun run test:unit -- src/lib/game/world.spec.ts --project server --run`

Expected: FAIL with `Failed to resolve import "./world"` or missing `world` / `storeCap` properties on `GameState`.

- [ ] **Step 3: Add world types to `src/lib/game/types.ts`**

Delete the current top-level `export const MAX_STORES = 3;`.

Add these types near the other domain type aliases:

```ts
export type WorldCityId =
	| 'harbor-city'
	| 'campus-junction'
	| 'garden-borough'
	| 'industry-city'
	| 'breadbasket-basin'
	| 'quarry-works';
export type WorldCityKind = 'retail' | 'industry';
export type WorldCityState = 'opened' | 'revealed' | 'locked';
export type WorldMilestoneId =
	| 'reveal-campus-junction'
	| 'reveal-breadbasket-basin'
	| 'reveal-garden-borough'
	| 'reveal-quarry-works'
	| 'positive-income-store-cap';

export interface WorldProgress {
	revealedCityIds: WorldCityId[];
	openedCityIds: WorldCityId[];
	claimedMilestoneIds: WorldMilestoneId[];
}

export type RetailDemandProfile = Partial<Record<string, number>>;

export interface IndustryResourceProfile {
	resourceIds: IndustryResourceId[];
	industrialBias: number;
}

export interface WorldCityDefinition {
	id: WorldCityId;
	name: string;
	kind: WorldCityKind;
	worldX: number;
	worldY: number;
	seed: number;
	openingCost: number;
	initiallyOpened: boolean;
	unlockRequirement: string;
	specialtySummary: string;
	storeCapBonus: number;
	retailDemandProfile: RetailDemandProfile;
	industryResourceProfile: IndustryResourceProfile | null;
}
```

Add these fields to `GameState`:

```ts
world: WorldProgress;
storeCap: number;
```

- [ ] **Step 4: Create `src/lib/game/world.ts`**

Add:

```ts
import type {
	GameState,
	MaterialId,
	WorldCityDefinition,
	WorldCityId,
	WorldCityState,
	WorldMilestoneId,
	WorldProgress
} from './types';

export const STARTER_STORE_CAP = 3;

const STARTER_CITY_IDS: WorldCityId[] = ['harbor-city', 'industry-city'];

export interface WorldCityStatus {
	city: WorldCityDefinition;
	state: WorldCityState;
	canOpen: boolean;
	blockedReason: string | null;
	storeCount: number;
	buildingCount: number;
}

export const WORLD_CITY_CATALOG: readonly WorldCityDefinition[] = [
	{
		id: 'harbor-city',
		name: 'Harbor City',
		kind: 'retail',
		worldX: 28,
		worldY: 52,
		seed: 20260503,
		openingCost: 0,
		initiallyOpened: true,
		unlockRequirement: 'Starter retail city',
		specialtySummary: 'Balanced starter market with steady everyday demand.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: null
	},
	{
		id: 'campus-junction',
		name: 'Campus Junction',
		kind: 'retail',
		worldX: 48,
		worldY: 28,
		seed: 20260531,
		openingCost: 18_000,
		initiallyOpened: false,
		unlockRequirement: 'Reach 2 stores or day 7.',
		specialtySummary: 'Student-heavy districts favor electronics, games, accessories, and gifts.',
		storeCapBonus: 1,
		retailDemandProfile: {
			games: 1.35,
			accessories: 1.22,
			devices: 1.18,
			gifts: 1.2,
			produce: 0.9,
			pantry: 0.92,
			prepared: 0.96,
			essentials: 0.94
		},
		industryResourceProfile: null
	},
	{
		id: 'garden-borough',
		name: 'Garden Borough',
		kind: 'retail',
		worldX: 66,
		worldY: 64,
		seed: 20260532,
		openingCost: 28_000,
		initiallyOpened: false,
		unlockRequirement: 'Reach 4 stores or hold positive cash after daily reports.',
		specialtySummary:
			'Residential neighborhoods favor groceries, essentials, and convenience goods.',
		storeCapBonus: 1,
		retailDemandProfile: {
			produce: 1.3,
			pantry: 1.25,
			prepared: 1.18,
			essentials: 1.25,
			snacks: 1.12,
			drinks: 1.08,
			games: 0.9,
			devices: 0.88
		},
		industryResourceProfile: null
	},
	{
		id: 'industry-city',
		name: 'Industry City',
		kind: 'industry',
		worldX: 30,
		worldY: 75,
		seed: 20260512,
		openingCost: 0,
		initiallyOpened: true,
		unlockRequirement: 'Starter industrial city',
		specialtySummary: 'Balanced starter resources with broad processing room.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: {
			resourceIds: [
				'grain-field',
				'salt-deposit',
				'oilseed-field',
				'water-source',
				'fruit-orchard',
				'sugar-field',
				'pulpwood-forest',
				'chemical-feedstock'
			],
			industrialBias: 1
		}
	},
	{
		id: 'breadbasket-basin',
		name: 'Breadbasket Basin',
		kind: 'industry',
		worldX: 58,
		worldY: 82,
		seed: 20260533,
		openingCost: 15_000,
		initiallyOpened: false,
		unlockRequirement: 'Build a warehouse and one raw producer.',
		specialtySummary: 'Food-chain resource basin for grain, oilseeds, fruit, and sugar.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: {
			resourceIds: ['grain-field', 'oilseed-field', 'fruit-orchard', 'sugar-field', 'water-source'],
			industrialBias: 0.9
		}
	},
	{
		id: 'quarry-works',
		name: 'Quarry Works',
		kind: 'industry',
		worldX: 76,
		worldY: 36,
		seed: 20260534,
		openingCost: 26_000,
		initiallyOpened: false,
		unlockRequirement: 'Produce a finished material locally.',
		specialtySummary:
			'Extraction and factory district for salt, chemicals, pulpwood, and packaging chains.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: {
			resourceIds: ['salt-deposit', 'chemical-feedstock', 'pulpwood-forest', 'water-source'],
			industrialBias: 1.25
		}
	}
];

export function createInitialWorldProgress(): WorldProgress {
	return {
		revealedCityIds: [...STARTER_CITY_IDS],
		openedCityIds: [...STARTER_CITY_IDS],
		claimedMilestoneIds: []
	};
}

export function getWorldCityDefinition(cityId: string): WorldCityDefinition | undefined {
	return WORLD_CITY_CATALOG.find((city) => city.id === cityId);
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
	const blockedReason =
		state === 'locked'
			? city.unlockRequirement
			: state === 'revealed' && game.cash < city.openingCost
				? `Opening this city requires ${city.openingCost.toLocaleString('en-US')} cash.`
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

export function getRetailCityDemandMultiplier(
	_game: Pick<GameState, 'world'>,
	cityId: string,
	categoryId: string
): number {
	const city = getWorldCityDefinition(cityId);
	return city?.retailDemandProfile[categoryId] ?? 1;
}

export function getIndustryCityResourceProfile(cityId: string) {
	return getWorldCityDefinition(cityId)?.industryResourceProfile ?? null;
}
```

- [ ] **Step 5: Run focused test**

Run: `bun run test:unit -- src/lib/game/world.spec.ts --project server --run`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/world.ts src/lib/game/world.spec.ts
git commit -m "feat: add world city catalog and progress state"
```

---

## Task 2: Initialize World State In New Games

**Files:**

- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/placement.ts`
- Test: `src/lib/game/state.spec.ts`

- [ ] **Step 1: Update state tests**

In `src/lib/game/state.spec.ts`, update the first test assertion count from `14` to `18` and add these expectations after `expect(game.hiringCandidates).toHaveLength(5);`:

```ts
expect(game.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
expect(game.world.revealedCityIds).toEqual(['harbor-city', 'industry-city']);
expect(game.world.claimedMilestoneIds).toEqual([]);
expect(game.storeCap).toBe(3);
```

Add this test after `creates industry state for a new game`:

```ts
test('new games keep world progress aligned with generated starter maps', () => {
	expect.assertions(4);
	const game = createNewGame('convenience', 20260512);

	expect(game.cities.map((city) => city.id)).toEqual(['harbor-city']);
	expect(game.industryCities.map((city) => city.id)).toEqual(['industry-city']);
	expect(game.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
	expect(game.storeCap).toBeGreaterThan(game.stores.length);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun run test:unit -- src/lib/game/state.spec.ts --project server --run`

Expected: FAIL because `world` and `storeCap` are missing from `createNewGame`.

- [ ] **Step 3: Update `src/lib/game/state.ts`**

Add import:

```ts
import { STARTER_STORE_CAP, createInitialWorldProgress } from './world';
```

In `createNewGame`, add these properties before `cities`:

```ts
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
```

- [ ] **Step 4: Verify `createFoundingGameAtTile` preserves world fields**

Run: `rg -n "\\.\\.\\.game" src/lib/game/placement.ts`

Expected: a match inside the returned object from `createFoundingGameAtTile`, before `cities`, `activeCityId`, and `stores` are assigned.

- [ ] **Step 5: Run focused tests**

Run: `bun run test:unit -- src/lib/game/state.spec.ts src/lib/game/placement.spec.ts --project server --run`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/placement.ts
git commit -m "feat: initialize world state for new games"
```

---

## Task 3: Implement World Progress Refresh And City Opening

**Files:**

- Modify: `src/lib/game/world.ts`
- Modify: `src/lib/game/world.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/industryPlacement.ts`
- Modify: `src/lib/game/simulateDay.ts`

- [ ] **Step 1: Add failing world transition tests**

Add these imports to the top of `src/lib/game/world.spec.ts`:

```ts
import { createNewGame } from './state';
import { buildIndustrialBuilding } from './industryPlacement';
import { addWarehouseMaterial } from './industryProduction';
import { openWorldCity, refreshWorldProgress } from './world';
```

Append this describe block to `src/lib/game/world.spec.ts`:

```ts
describe('world progression and city opening', () => {
	test('reveals the second retail city after the company reaches two stores', () => {
		expect.assertions(1);
		const game = gameStub({
			stores: [
				{ id: 'store-1', cityId: 'harbor-city' } as GameState['stores'][number],
				{ id: 'store-2', cityId: 'harbor-city' } as GameState['stores'][number]
			]
		});

		expect(refreshWorldProgress(game).world.revealedCityIds).toContain('campus-junction');
	});

	test('opens a revealed retail city, deducts cash, appends its city map, and raises store cap', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260530);
		const revealed = {
			...game,
			cash: 50_000,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
			}
		};

		const opened = openWorldCity(revealed, 'campus-junction');

		expect(opened.cash).toBe(32_000);
		expect(opened.world.openedCityIds).toContain('campus-junction');
		expect(opened.cities.some((city) => city.id === 'campus-junction')).toBe(true);
		expect(opened.activeCityId).toBe('campus-junction');
		expect(opened.industryCities).toHaveLength(1);
		expect(opened.storeCap).toBe(game.storeCap + 1);
	});

	test('opens a revealed industrial city and sets it active without changing store cap', () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260530);
		const revealed = {
			...game,
			cash: 50_000,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'breadbasket-basin']
			}
		};

		const opened = openWorldCity(revealed, 'breadbasket-basin');

		expect(opened.cash).toBe(35_000);
		expect(opened.world.openedCityIds).toContain('breadbasket-basin');
		expect(opened.industryCities.some((city) => city.id === 'breadbasket-basin')).toBe(true);
		expect(opened.activeIndustryCityId).toBe('breadbasket-basin');
		expect(opened.storeCap).toBe(game.storeCap);
	});

	test('blocked city openings append decisions instead of throwing', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260530);
		const locked = openWorldCity(game, 'garden-borough');
		const unaffordable = openWorldCity(
			{
				...game,
				cash: 0,
				world: {
					...game.world,
					revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		const unknown = openWorldCity(game, 'missing-city');

		expect(locked.decisions.at(-1)?.title).toBe('City is not available yet');
		expect(unaffordable.decisions.at(-1)?.title).toBe('City opening delayed');
		expect(unknown.decisions.at(-1)?.context).toBe('Unknown city.');
	});

	test('reveals industrial and later retail milestones from production and reports', () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260530), cash: 100_000 };
		const warehouseTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		const warehouseGame = buildIndustrialBuilding(game, {
			tileId: warehouseTile.id,
			buildingTypeId: 'warehouse'
		});
		const rawTile = warehouseGame.industryCities[0]!.tiles.find(
			(tile) => tile.resource === 'grain-field'
		)!;
		const rawGame = buildIndustrialBuilding(warehouseGame, {
			tileId: rawTile.id,
			buildingTypeId: 'grain-farm'
		});
		const finishedGame = refreshWorldProgress({
			...rawGame,
			warehouse: addWarehouseMaterial(rawGame.warehouse, 'snacks', 1)
		});
		const reportedGame = refreshWorldProgress({
			...finishedGame,
			cash: 90_000,
			reports: [
				{
					day: finishedGame.day,
					revenue: 1,
					costOfGoods: 0,
					grossMargin: 1,
					operatingCosts: 0,
					payrollCost: 0,
					importSpend: 0,
					netIncome: 1,
					cashAfter: 90_001,
					scorecard: finishedGame.scorecard,
					productionReport: {
						produced: [],
						consumed: [],
						importedInputs: [],
						warehousePulls: [],
						shopImports: [],
						importSpend: 0,
						operatingCost: 0,
						overflowUnits: 0,
						overflowCost: 0,
						warehouseCapacity: 0,
						warehouseUsed: 0
					},
					storeReports: [],
					warnings: []
				}
			]
		});

		expect(rawGame.world.revealedCityIds).toContain('breadbasket-basin');
		expect(finishedGame.world.revealedCityIds).toContain('quarry-works');
		expect(reportedGame.world.revealedCityIds).toContain('garden-borough');
	});
});
```

- [ ] **Step 2: Run focused test to verify failure**

Run: `bun run test:unit -- src/lib/game/world.spec.ts --project server --run`

Expected: FAIL because `refreshWorldProgress` and `openWorldCity` are missing.

- [ ] **Step 3: Implement milestone and opening helpers in `src/lib/game/world.ts`**

Add imports:

```ts
import { generateCity } from './city';
import { generateIndustryCity } from './industry';
```

Add helpers:

```ts
function uniqueCityIds(ids: WorldCityId[]): WorldCityId[] {
	return [...new Set(ids)];
}

function appendDecision(game: GameState, decision: GameState['decisions'][number]): GameState {
	if (game.decisions.some((candidate) => candidate.id === decision.id)) return game;
	return { ...game, decisions: [...game.decisions, decision] };
}

function worldDecision(
	game: GameState,
	input: { id: string; title: string; context: string }
): GameState['decisions'][number] {
	return {
		id: `${input.id}-${game.day}`,
		title: input.title,
		context: input.context,
		expiresOnDay: game.day + 1,
		options: [
			{
				id: 'acknowledge',
				label: 'Acknowledge',
				description: 'Return to the world map.',
				effects: {}
			}
		]
	};
}
```

Add these functions:

```ts
export function refreshWorldProgress(game: GameState): GameState {
	let revealedCityIds = [...game.world.revealedCityIds];
	let claimedMilestoneIds = [...game.world.claimedMilestoneIds];
	let storeCap = game.storeCap;

	function reveal(cityId: WorldCityId, milestoneId: WorldMilestoneId): void {
		if (!revealedCityIds.includes(cityId)) revealedCityIds.push(cityId);
		if (!claimedMilestoneIds.includes(milestoneId)) claimedMilestoneIds.push(milestoneId);
	}

	if (game.stores.length >= 2 || game.day >= 7) {
		reveal('campus-junction', 'reveal-campus-junction');
	}

	const hasWarehouse = game.industrialBuildings.some((building) => building.typeId === 'warehouse');
	const hasRawProducer = game.industrialBuildings.some((building) =>
		[
			'grain-farm',
			'salt-mine',
			'oilseed-farm',
			'water-pump',
			'fruit-farm',
			'sugar-farm',
			'pulpwood-grove',
			'chemical-feedstock-well'
		].includes(building.typeId)
	);
	if (hasWarehouse && hasRawProducer) {
		reveal('breadbasket-basin', 'reveal-breadbasket-basin');
	}

	const hasFinishedMaterial = Object.entries(game.warehouse.materials).some(
		([materialId, quantity]) =>
			(['snacks', 'drinks', 'essentials', 'gifts'] as MaterialId[]).includes(
				materialId as MaterialId
			) && (quantity ?? 0) > 0
	);
	if (hasFinishedMaterial) {
		reveal('quarry-works', 'reveal-quarry-works');
	}

	const hasPositiveReport = game.reports.some((report) => report.netIncome > 0);
	if (game.stores.length >= 4 || (game.cash > 0 && hasPositiveReport)) {
		reveal('garden-borough', 'reveal-garden-borough');
	}

	if (
		game.world.openedCityIds.some((cityId) => {
			const city = getWorldCityDefinition(cityId);
			return city?.kind === 'retail' && city.id !== 'harbor-city';
		}) &&
		hasPositiveReport &&
		!claimedMilestoneIds.includes('positive-income-store-cap')
	) {
		claimedMilestoneIds.push('positive-income-store-cap');
		storeCap += 1;
	}

	return {
		...game,
		storeCap,
		world: {
			revealedCityIds: uniqueCityIds(revealedCityIds),
			openedCityIds: uniqueCityIds(game.world.openedCityIds),
			claimedMilestoneIds: [...new Set(claimedMilestoneIds)]
		}
	};
}

export function openWorldCity(game: GameState, cityId: string): GameState {
	const city = getWorldCityDefinition(cityId);
	if (!city) {
		return appendDecision(
			game,
			worldDecision(game, {
				id: 'world-city-unknown',
				title: 'City unavailable',
				context: 'Unknown city.'
			})
		);
	}

	if (game.world.openedCityIds.includes(city.id)) {
		return selectWorldCity(game, city.id);
	}

	if (!game.world.revealedCityIds.includes(city.id)) {
		return appendDecision(
			game,
			worldDecision(game, {
				id: `world-city-locked-${city.id}`,
				title: 'City is not available yet',
				context: city.unlockRequirement
			})
		);
	}

	if (game.cash < city.openingCost) {
		return appendDecision(
			game,
			worldDecision(game, {
				id: `world-city-cash-${city.id}`,
				title: 'City opening delayed',
				context: `Opening this city requires ${city.openingCost.toLocaleString('en-US')} cash.`
			})
		);
	}

	const openedCityIds = uniqueCityIds([...game.world.openedCityIds, city.id]);
	const base = {
		...game,
		cash: game.cash - city.openingCost,
		storeCap: game.storeCap + city.storeCapBonus,
		world: {
			...game.world,
			openedCityIds
		}
	};

	if (city.kind === 'retail') {
		return refreshWorldProgress({
			...base,
			cities: base.cities.some((candidate) => candidate.id === city.id)
				? base.cities
				: [
						...base.cities,
						generateCity({
							id: city.id,
							name: city.name,
							width: 20,
							height: 20,
							seed: city.seed
						})
					],
			activeCityId: city.id
		});
	}

	return refreshWorldProgress({
		...base,
		industryCities: base.industryCities.some((candidate) => candidate.id === city.id)
			? base.industryCities
			: [
					...base.industryCities,
					generateIndustryCity({
						id: city.id,
						name: city.name,
						width: 18,
						height: 18,
						seed: city.seed
					})
				],
		activeIndustryCityId: city.id
	});
}

export function selectWorldCity(game: GameState, cityId: WorldCityId): GameState {
	const city = getWorldCityDefinition(cityId);
	if (!city || !game.world.openedCityIds.includes(city.id)) return game;
	return city.kind === 'retail'
		? { ...game, activeCityId: city.id }
		: { ...game, activeIndustryCityId: city.id };
}
```

- [ ] **Step 4: Refresh progress after relevant transitions**

In `src/lib/game/state.ts`, add `refreshWorldProgress` to the world import and wrap the successful return in `openStore`:

```ts
return refreshWorldProgress({
	...game,
	rngState: rng.getState(),
	cash: game.cash - setupCost,
	stores: [...game.stores, placedStore],
	scorecard: {
		...game.scorecard,
		marketPosition: clampScore(game.scorecard.marketPosition + 4)
	}
});
```

In `src/lib/game/industryPlacement.ts`, import `refreshWorldProgress` and wrap the successful construction return:

```ts
return refreshWorldProgress({
	...game,
	cash: game.cash - buildingType.buildCost,
	industrialBuildings: [
		...game.industrialBuildings,
		createIndustrialBuilding(game, tile, buildingType)
	]
});
```

In `src/lib/game/simulateDay.ts`, import `refreshWorldProgress` and wrap the final returned game object at the end of `simulateDay`:

```ts
return refreshWorldProgress({
	...importResult.game,
	day: game.day + 1,
	rngState: rng.getState(),
	cash: cashAfter,
	scorecard,
	stores,
	staff,
	hiringCandidates,
	decisions,
	reports: [...game.reports, report]
});
```

Use the exact existing return object fields from `simulateDay`; only add the `refreshWorldProgress(...)` wrapper, do not rename local variables.

- [ ] **Step 5: Run focused tests**

Run: `bun run test:unit -- src/lib/game/world.spec.ts src/lib/game/state.spec.ts src/lib/game/industryPlacement.spec.ts src/lib/game/simulateDay.spec.ts --project server --run`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/world.ts src/lib/game/world.spec.ts src/lib/game/state.ts src/lib/game/industryPlacement.ts src/lib/game/simulateDay.ts
git commit -m "feat: add world city progression and opening transitions"
```

---

## Task 4: Replace Fixed Store Limit With `game.storeCap`

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/placementPreview.ts`
- Modify: `src/lib/game/placementPreview.spec.ts`
- Modify: `src/lib/game/events.ts`

- [ ] **Step 1: Update store-cap tests**

In `src/lib/game/state.spec.ts`, rename `opens stores up to the local chain limit` to `opens stores up to the company store cap`.

Replace the body with:

```ts
expect.assertions(6);
const game = { ...createNewGame('electronics', 44), storeCap: 2 };
const second = openStore(game, {
	name: 'Mall Kiosk',
	archetypeId: 'electronics',
	location: 'West Mall'
});
const third = openStore(second, {
	name: 'Campus Shop',
	archetypeId: 'electronics',
	location: 'North Campus'
});
const expandedCap = openStore(
	{ ...second, storeCap: 3 },
	{
		name: 'Campus Shop',
		archetypeId: 'electronics',
		location: 'North Campus'
	}
);

expect(second.stores).toHaveLength(2);
expect(second.cash).toBeLessThan(game.cash);
expect(third.stores).toHaveLength(2);
expect(third.decisions.at(-1)?.title).toBe('Expansion unavailable');
expect(third.decisions.at(-1)?.context).toBe('This chain can operate up to 2 stores for now.');
expect(expandedCap.stores).toHaveLength(3);
```

In `src/lib/game/placementPreview.spec.ts`, remove `import { MAX_STORES } from './types';`.

Replace every `Array.from({ length: MAX_STORES }` with `Array.from({ length: game.storeCap }`.

Replace `buildableTiles[MAX_STORES]!.id` with `buildableTiles[game.storeCap]!.id`.

Add one assertion to the cap test:

```ts
expect(game.storeCap).toBeGreaterThan(1);
```

Increase that test's `expect.assertions` count by 1.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `bun run test:unit -- src/lib/game/state.spec.ts src/lib/game/placementPreview.spec.ts --project server --run`

Expected: FAIL because `state.ts`, `placementPreview.ts`, and `events.ts` still import/use `MAX_STORES`.

- [ ] **Step 3: Update implementation files**

In `src/lib/game/state.ts`:

- Remove `import { MAX_STORES } from './types';`.
- Replace:

```ts
if (game.stores.length >= MAX_STORES) {
```

with:

```ts
if (game.stores.length >= game.storeCap) {
```

- Replace expansion unavailable context with:

```ts
context: `This chain can operate up to ${game.storeCap} stores for now.`,
```

In `src/lib/game/placementPreview.ts`:

- Remove `import { MAX_STORES } from './types';`.
- Replace both store-limit checks with:

```ts
if (input.game && input.game.stores.length >= input.game.storeCap) {
	return 'Store limit reached';
}
```

In `src/lib/game/events.ts`:

- Remove `MAX_STORES` from the import.
- Replace:

```ts
game.stores.length < MAX_STORES;
```

with:

```ts
game.stores.length < game.storeCap;
```

In `src/lib/game/types.ts`, confirm there is no `MAX_STORES` export.

- [ ] **Step 4: Search for stale `MAX_STORES` references**

Run: `rg -n "MAX_STORES" src`

Expected: no matches.

- [ ] **Step 5: Run focused tests**

Run: `bun run test:unit -- src/lib/game/state.spec.ts src/lib/game/placementPreview.spec.ts src/lib/game/events.spec.ts --project server --run`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/placementPreview.ts src/lib/game/placementPreview.spec.ts src/lib/game/events.ts
git commit -m "feat: replace fixed store limit with campaign store cap"
```

---

## Task 5: Add Retail Demand And Industrial Resource Specialization

**Files:**

- Modify: `src/lib/game/industry.ts`
- Modify: `src/lib/game/industry.spec.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/world.ts`

- [ ] **Step 1: Add failing specialization tests**

Append to `src/lib/game/industry.spec.ts`:

```ts
test('can generate a specialized industry city with only selected resource anchors', () => {
	expect.assertions(4);
	const city = generateIndustryCity({
		id: 'breadbasket-basin',
		name: 'Breadbasket Basin',
		width: 18,
		height: 18,
		seed: 20260533,
		resourceProfile: {
			resourceIds: ['grain-field', 'oilseed-field', 'fruit-orchard', 'sugar-field', 'water-source'],
			industrialBias: 0.9
		}
	});

	expect(getIndustryTilesByResource(city, 'grain-field')).toHaveLength(1);
	expect(getIndustryTilesByResource(city, 'fruit-orchard')).toHaveLength(1);
	expect(getIndustryTilesByResource(city, 'salt-deposit')).toHaveLength(0);
	expect(city.tiles.some((tile) => tile.terrain === 'industrial' && !tile.locked)).toBe(true);
});
```

Append to `src/lib/game/stock.spec.ts` after `builds city-wide demand pools from city demand and product weights`:

```ts
test('applies retail city demand multipliers to city demand pools', () => {
	expect.assertions(2);
	const game = createNewGame('electronics', 20260508);
	const campusCity = {
		...game.cities[0]!,
		id: 'campus-junction',
		name: 'Campus Junction',
		tiles: game.cities[0]!.tiles.map((tile) => ({
			...tile,
			id: tile.id.replace('harbor-city', 'campus-junction'),
			cityId: 'campus-junction'
		}))
	};
	const campusGame = {
		...game,
		cities: [campusCity],
		activeCityId: 'campus-junction',
		stores: game.stores.map((store) => ({
			...store,
			cityId: 'campus-junction',
			tileId: store.tileId.replace('harbor-city', 'campus-junction')
		}))
	};

	const harborPools = buildCityDemandPools(game, game.cities[0]!);
	const campusPools = buildCityDemandPools(campusGame, campusCity);

	expect(campusPools.games).toBeGreaterThan(harborPools.games ?? 0);
	expect(campusPools.devices).toBeGreaterThan(harborPools.devices ?? 0);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `bun run test:unit -- src/lib/game/industry.spec.ts src/lib/game/stock.spec.ts --project server --run`

Expected: FAIL because `resourceProfile` is not accepted and demand multipliers are not applied.

- [ ] **Step 3: Update `generateIndustryCity`**

In `src/lib/game/industry.ts`, import `IndustryResourceProfile` from `./types`.

Change `GenerateIndustryCityInput`:

```ts
interface GenerateIndustryCityInput {
	id: string;
	name: string;
	width: number;
	height: number;
	seed: number;
	resourceProfile?: IndustryResourceProfile | null;
}
```

Change the resource-anchor placement loop so it iterates over filtered anchors:

```ts
const enabledResourceIds = new Set(
	input.resourceProfile?.resourceIds ?? RESOURCE_ANCHORS.map((anchor) => anchor.resource)
);
const resourceAnchors = RESOURCE_ANCHORS.filter((anchor) =>
	enabledResourceIds.has(anchor.resource)
);
```

Use `resourceAnchors` anywhere the generator currently uses `RESOURCE_ANCHORS`.

Change anchor lookup so non-selected anchor coordinates fall through to filler terrain. Do not create locked tiles for missing resources.

In `src/lib/game/world.ts`, update the `generateIndustryCity` call inside `openWorldCity` so newly opened industrial cities use their profile:

```ts
generateIndustryCity({
	id: city.id,
	name: city.name,
	width: 18,
	height: 18,
	seed: city.seed,
	resourceProfile: city.industryResourceProfile ?? undefined
});
```

- [ ] **Step 4: Apply retail city demand multipliers**

In `src/lib/game/stock.ts`, import:

```ts
import { getRetailCityDemandMultiplier } from './world';
```

In `buildCityDemandPools`, change the category demand calculation to:

```ts
const cityMultiplier = getRetailCityDemandMultiplier(game, city.id, category.id);
return [
	category.id,
	Math.max(
		0,
		Math.round(
			cityDemand * category.demandWeight * marketingMultiplier * pricingMultiplier * cityMultiplier
		)
	)
];
```

Keep the rest of the function unchanged.

- [ ] **Step 5: Run focused tests**

Run: `bun run test:unit -- src/lib/game/industry.spec.ts src/lib/game/stock.spec.ts src/lib/game/world.spec.ts --project server --run`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/industry.ts src/lib/game/industry.spec.ts src/lib/game/stock.ts src/lib/game/stock.spec.ts src/lib/game/world.ts
git commit -m "feat: specialize city demand and industry resources"
```

---

## Task 6: Normalize World Fields In Save Validation

**Files:**

- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`

- [ ] **Step 1: Add failing save tests**

Append to `src/lib/persistence/saveRepository.spec.ts` near other validation tests:

```ts
test('validates and preserves world progress and store cap in save records', () => {
	expect.assertions(3);
	const game = createGame({
		world: {
			revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
			openedCityIds: ['harbor-city', 'industry-city'],
			claimedMilestoneIds: ['reveal-campus-junction']
		},
		storeCap: 4
	});
	const record = createSaveRecord(game, {
		id: 'manual-world',
		name: 'World Save',
		kind: 'manual',
		updatedAt: new Date('2026-05-30T12:00:00.000Z')
	});

	const validated = validateSaveRecord(record);

	expect(validated.game.world.revealedCityIds).toContain('campus-junction');
	expect(validated.game.world.claimedMilestoneIds).toContain('reveal-campus-junction');
	expect(validated.game.storeCap).toBe(4);
});

test('normalizes old save records that do not have world progress or store cap', () => {
	expect.assertions(3);
	const record = createSaveRecord(createGame(), {
		id: 'manual-old-world',
		name: 'Old World Save',
		kind: 'manual',
		updatedAt: new Date('2026-05-30T12:00:00.000Z')
	});
	const oldGame = { ...record.game } as Partial<GameState>;
	delete oldGame.world;
	delete oldGame.storeCap;

	const validated = validateSaveRecord({ ...record, game: oldGame as GameState });

	expect(validated.game.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
	expect(validated.game.world.revealedCityIds).toEqual(['harbor-city', 'industry-city']);
	expect(validated.game.storeCap).toBe(3);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --project server --run`

Expected: FAIL because `createGame()` lacks `world`/`storeCap` and save validation does not normalize missing fields.

- [ ] **Step 3: Update test helper `createGame()`**

In `src/lib/persistence/saveRepository.spec.ts`, import:

```ts
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
```

Add to `createGame()` before `cities`:

```ts
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
```

- [ ] **Step 4: Add validation constants in `saveCodec.ts`**

Import:

```ts
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
```

Add constants:

```ts
const WORLD_CITY_IDS = [
	'harbor-city',
	'campus-junction',
	'garden-borough',
	'industry-city',
	'breadbasket-basin',
	'quarry-works'
] as const;
const WORLD_MILESTONE_IDS = [
	'reveal-campus-junction',
	'reveal-breadbasket-basin',
	'reveal-garden-borough',
	'reveal-quarry-works',
	'positive-income-store-cap'
] as const;
```

- [ ] **Step 5: Normalize and validate world fields**

Change `validateSaveRecord` so it stores normalized game:

```ts
const game = validateSavedGame(record.game);
```

Return a cloned record instead of `value as SaveRecord`:

```ts
return {
	...(value as SaveRecord),
	game
};
```

Change `validateSavedGame` signature:

```ts
function validateSavedGame(value: unknown): GameState {
	const game = normalizeSavedGame(requireRecord(value, 'Saved game'));
```

Add before `return game;`:

```ts
validateSavedWorld(game.world, 'Saved game world');
requireNumber(game.storeCap, 'Saved game storeCap');
if (game.storeCap < game.stores.length) {
	throw new SaveDataError('Saved game storeCap must be at least the current store count');
}
```

Add helpers near other validation helpers:

```ts
function normalizeSavedGame(game: Record<string, unknown>): GameState {
	const normalizedWorld =
		game.world === undefined
			? createInitialWorldProgress()
			: validateSavedWorld(game.world, 'Saved game world');
	const normalizedStoreCap =
		game.storeCap === undefined
			? Math.max(
					STARTER_STORE_CAP,
					Array.isArray(game.stores) ? game.stores.length : STARTER_STORE_CAP
				)
			: game.storeCap;

	return {
		...game,
		world: normalizedWorld,
		storeCap: normalizedStoreCap
	} as GameState;
}

function validateSavedWorld(value: unknown, label: string): GameState['world'] {
	const world = requireRecord(value, label);
	const revealedCityIds = requireArray(world.revealedCityIds, `${label} revealedCityIds`).map(
		(cityId, index) => requireOneOf(cityId, `${label} revealedCityIds[${index}]`, WORLD_CITY_IDS)
	);
	const openedCityIds = requireArray(world.openedCityIds, `${label} openedCityIds`).map(
		(cityId, index) => requireOneOf(cityId, `${label} openedCityIds[${index}]`, WORLD_CITY_IDS)
	);
	const claimedMilestoneIds = requireArray(
		world.claimedMilestoneIds,
		`${label} claimedMilestoneIds`
	).map((milestoneId, index) =>
		requireOneOf(milestoneId, `${label} claimedMilestoneIds[${index}]`, WORLD_MILESTONE_IDS)
	);

	for (const cityId of openedCityIds) {
		if (!revealedCityIds.includes(cityId)) {
			throw new SaveDataError(`${label} opened city must also be revealed: ${cityId}`);
		}
	}

	return {
		revealedCityIds,
		openedCityIds,
		claimedMilestoneIds
	};
}
```

Change `requireOneOf` so it returns the narrowed string:

```ts
function requireOneOf<T extends readonly string[]>(
	value: unknown,
	label: string,
	allowed: T
): T[number] {
	const text = requireString(value, label);
	if (!(allowed as readonly string[]).includes(text)) {
		throw new SaveDataError(`${label} must be one of: ${allowed.join(', ')}`);
	}
	return text;
}
```

Update existing callers if TypeScript requires it; they can ignore the returned value.

- [ ] **Step 6: Run focused tests**

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --project server --run`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/persistence/saveCodec.ts src/lib/persistence/saveRepository.spec.ts
git commit -m "feat: validate and normalize world save fields"
```

---

## Task 7: Add World Map Component

**Files:**

- Create: `src/lib/components/game/WorldMap.svelte`
- Create: `src/lib/components/game/WorldMap.svelte.spec.ts`

Use the Svelte MCP workflow before changing Svelte files: `list-sections`, `get-documentation` for runes/props/if/each/class/scoped styles/accessibility/testing, then `svelte-autofixer` on the final component until it reports no issues.

- [ ] **Step 1: Write the failing component tests**

Create `src/lib/components/game/WorldMap.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { WORLD_CITY_CATALOG, type WorldCityStatus } from '$lib/game/world';
import WorldMap from './WorldMap.svelte';

function status(cityId: string, state: WorldCityStatus['state']): WorldCityStatus {
	const city = WORLD_CITY_CATALOG.find((candidate) => candidate.id === cityId)!;
	return {
		city,
		state,
		canOpen: state === 'revealed',
		blockedReason: state === 'locked' ? city.unlockRequirement : null,
		storeCount: city.kind === 'retail' && state === 'opened' ? 1 : 0,
		buildingCount: city.kind === 'industry' && state === 'opened' ? 2 : 0
	};
}

describe('WorldMap', () => {
	it('renders opened, revealed, and locked city nodes', async () => {
		expect.assertions(4);
		render(WorldMap, {
			statuses: [
				status('harbor-city', 'opened'),
				status('campus-junction', 'revealed'),
				status('garden-borough', 'locked')
			],
			selectedCityId: null,
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /harbor city/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /campus junction/i })).toBeVisible();
		await expect.element(page.getByText(/reach 4 stores/i)).toBeVisible();
	});

	it('selects cities and opens a revealed city from the inspector', async () => {
		expect.assertions(3);
		const onSelectCity = vi.fn();
		const onOpenCity = vi.fn();
		render(WorldMap, {
			statuses: [status('campus-junction', 'revealed')],
			selectedCityId: 'campus-junction',
			onSelectCity,
			onOpenCity,
			onCloseInspector: vi.fn()
		});

		await page.getByRole('button', { name: /campus junction/i }).click();
		expect(onSelectCity).toHaveBeenCalledWith('campus-junction');
		await expect.element(page.getByRole('dialog', { name: /city details/i })).toBeVisible();
		await page.getByRole('button', { name: /open for/i }).click();
		expect(onOpenCity).toHaveBeenCalledWith('campus-junction');
	});

	it('disables opening when a revealed city is unaffordable', async () => {
		expect.assertions(1);
		render(WorldMap, {
			statuses: [{ ...status('campus-junction', 'revealed'), canOpen: false }],
			selectedCityId: 'campus-junction',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /open for/i })).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run browser component test to verify failure**

Run: `bun run test:unit -- src/lib/components/game/WorldMap.svelte.spec.ts --project client --run`

Expected: FAIL because `WorldMap.svelte` does not exist.

- [ ] **Step 3: Create `WorldMap.svelte`**

Create `src/lib/components/game/WorldMap.svelte` with the final code that has passed `svelte-autofixer`:

```svelte
<script lang="ts">
	import type { WorldCityStatus } from '$lib/game/world';

	interface Props {
		statuses: WorldCityStatus[];
		selectedCityId: string | null;
		onSelectCity: (cityId: string) => void;
		onOpenCity: (cityId: string) => void;
		onCloseInspector: () => void;
	}

	let { statuses, selectedCityId, onSelectCity, onOpenCity, onCloseInspector }: Props = $props();

	const selectedStatus = $derived(
		selectedCityId ? (statuses.find((status) => status.city.id === selectedCityId) ?? null) : null
	);

	function statusLabel(status: WorldCityStatus): string {
		if (status.state === 'opened') return 'Opened';
		if (status.state === 'revealed') return 'Ready to open';
		return 'Locked';
	}
</script>

<section class="world-map" aria-label="World map">
	<svg class="world-map-canvas" viewBox="0 0 100 100" role="img" aria-label="Regional city network">
		{#each statuses as status (status.city.id)}
			<g>
				<circle
					class={['city-node', status.city.kind, status.state]}
					cx={status.city.worldX}
					cy={status.city.worldY}
					r="4"
				/>
			</g>
		{/each}
	</svg>

	<div class="world-node-list" aria-label="Cities">
		{#each statuses as status (status.city.id)}
			<button
				type="button"
				class={['world-node-card', status.city.kind, status.state]}
				aria-pressed={selectedCityId === status.city.id}
				onclick={() => onSelectCity(status.city.id)}
			>
				<strong>{status.city.name}</strong>
				<span>{status.city.kind === 'retail' ? 'Retail' : 'Industry'} · {statusLabel(status)}</span>
				<small>{status.city.specialtySummary}</small>
				{#if status.state === 'locked' && status.blockedReason}
					<small>{status.blockedReason}</small>
				{/if}
			</button>
		{/each}
	</div>

	{#if selectedStatus}
		<div class="world-inspector paper" role="dialog" aria-label="City details" aria-modal="false">
			<button type="button" class="close" aria-label="Close city details" onclick={onCloseInspector}
				>×</button
			>
			<p>{selectedStatus.city.kind === 'retail' ? 'Retail city' : 'Industrial city'}</p>
			<h2>{selectedStatus.city.name}</h2>
			<p>{selectedStatus.city.specialtySummary}</p>
			{#if selectedStatus.state === 'revealed'}
				<button
					type="button"
					disabled={!selectedStatus.canOpen}
					onclick={() => onOpenCity(selectedStatus.city.id)}
				>
					Open for {selectedStatus.city.openingCost.toLocaleString('en-US')} cash
				</button>
			{:else if selectedStatus.state === 'locked'}
				<p>{selectedStatus.blockedReason}</p>
			{:else}
				<p>
					{selectedStatus.storeCount} stores · {selectedStatus.buildingCount} industrial buildings
				</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	.world-map {
		position: relative;
		height: 100%;
		background: var(--walnut-900);
		color: var(--paper-100);
	}

	.world-map-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.city-node.retail {
		fill: var(--brass-500);
	}

	.city-node.industry {
		fill: var(--moss);
	}

	.city-node.locked {
		opacity: 0.36;
	}

	.world-node-list {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		display: grid;
		gap: 0.5rem;
		width: min(24rem, calc(100% - 2rem));
	}

	.world-node-card {
		display: grid;
		gap: 0.2rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--brass-500);
		background: var(--paper-100);
		color: var(--ink-700);
		text-align: left;
	}

	.world-inspector {
		position: absolute;
		top: 5.9rem;
		right: 1rem;
		width: min(360px, calc(100% - 2rem));
		padding: 1rem;
		color: var(--ink-700);
	}

	.close {
		float: right;
	}
</style>
```

- [ ] **Step 4: Run Svelte autofixer**

Run the official Svelte MCP `svelte-autofixer` on `WorldMap.svelte`.

Expected: no issues. If it reports issues, apply the fixes and run the autofixer again until clean.

- [ ] **Step 5: Run focused component test**

Run: `bun run test:unit -- src/lib/components/game/WorldMap.svelte.spec.ts --project client --run`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/game/WorldMap.svelte src/lib/components/game/WorldMap.svelte.spec.ts
git commit -m "feat: add world map component"
```

---

## Task 8: Integrate World Map Into The Route

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

Use the Svelte MCP workflow before editing `+page.svelte`: docs first, then `svelte-autofixer` on the final changed component.

- [ ] **Step 1: Add failing e2e coverage**

Append to `src/routes/retail-sim.e2e.ts`:

```ts
test('player opens a revealed retail city from the world map and builds there', async ({
	page
}) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await openMapMenuItem(page, /world map/i);
	await expect(page.getByRole('region', { name: /world map/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /harbor city/i })).toBeVisible();

	await page.evaluate(() => {
		const serialized = window.localStorage.getItem('serpens.saves.v2');
		if (!serialized) throw new Error('Missing save data');
		const saveStore = JSON.parse(serialized);
		const game = saveStore.autoSave.game;
		game.cash = 100000;
		game.storeCap = 4;
		game.world.revealedCityIds = [...new Set([...game.world.revealedCityIds, 'campus-junction'])];
		window.localStorage.setItem('serpens.saves.v2', JSON.stringify(saveStore));
	});
	await page.reload();
	await page.getByRole('menuitem', { name: /saves/i }).click();
	await page.getByRole('button', { name: /^resume$/i }).click();
	await page.getByRole('button', { name: /close saves/i }).click();

	await openMapMenuItem(page, /world map/i);
	await page.getByRole('button', { name: /campus junction/i }).click();
	await page.getByRole('button', { name: /open for/i }).click();
	await page.getByRole('button', { name: /campus junction/i }).click();
	await openMapMenuItem(page, /retail city map/i);
	await expect(page.getByRole('heading', { name: /campus junction/i })).toBeVisible();

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build electronics & games/i,
		expectedStoreCount: 2
	});
});
```

Use the existing `openMapMenuItem`, `buildRetailStoreAt`, and map-ready helpers already present in the e2e file. Do not add new duplicate helpers.

- [ ] **Step 2: Run e2e test to verify failure**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "player opens a revealed retail city"`

Expected: FAIL because the World Map menu item and route integration do not exist yet.

- [ ] **Step 3: Update route imports and state**

In `src/routes/+page.svelte`, add imports:

```ts
import WorldMap from '$lib/components/game/WorldMap.svelte';
import {
	WORLD_CITY_CATALOG,
	getWorldCityStatus,
	openWorldCity,
	selectWorldCity
} from '$lib/game/world';
import type { WorldCityStatus } from '$lib/game/world';
```

Change:

```ts
let activeMapView = $state<'retail' | 'industry'>('retail');
```

to:

```ts
let activeMapView = $state<'world' | 'retail' | 'industry'>('retail');
let selectedWorldCityId = $state<string | null>(null);
```

Add derived statuses:

```ts
let worldCityStatuses = $derived.by((): WorldCityStatus[] => {
	const currentGame: GameState | null = game;
	return WORLD_CITY_CATALOG.map((city) =>
		currentGame
			? getWorldCityStatus(currentGame, city.id)
			: ({
					city,
					state: city.initiallyOpened ? 'opened' : 'locked',
					canOpen: false,
					blockedReason: city.unlockRequirement,
					storeCount: 0,
					buildingCount: 0
				} satisfies WorldCityStatus)
	).filter((status): status is WorldCityStatus => status !== null);
});
```

- [ ] **Step 4: Add world handlers**

Add functions near the map switching handlers:

```ts
function showWorldMap(): void {
	activeMapView = 'world';
	selectedTileId = null;
	selectedIndustryTileId = null;
	isViewMenuOpen = false;
	cancelPlacement();
}

function selectWorldCityNode(cityId: string): void {
	if (!game) {
		selectedWorldCityId = cityId;
		return;
	}

	const status = getWorldCityStatus(game, cityId);
	if (!status) {
		return;
	}

	selectedWorldCityId = cityId;

	if (status.state !== 'opened') {
		return;
	}

	const nextGame = selectWorldCity(game, status.city.id);
	game = nextGame;
	activeMapView = status.city.kind === 'retail' ? 'retail' : 'industry';
	selectedTileId = null;
	selectedIndustryTileId = null;
	cancelPlacement();
	void writeAutoSave(nextGame);
}

function openSelectedWorldCity(cityId: string): void {
	if (!game) {
		return;
	}

	const nextGame = openWorldCity(game, cityId);
	setGameAndAutosave(nextGame);
	selectedWorldCityId = cityId;
}

function closeWorldInspector(): void {
	selectedWorldCityId = null;
}
```

In `showRetailMap()` and `showIndustryMap()`, add `selectedWorldCityId = null;`.

When loading saves in `resumeAutoSave()` and `loadManualSlot()`, add `selectedWorldCityId = null;`.

- [ ] **Step 5: Render `WorldMap` and menu item**

In the map layout block, replace:

```svelte
{#if activeMapView === 'retail'}
	<CityMap snapshot={mapSnapshot} onTileSelected={selectTile} />
{:else}
	<IndustryMap snapshot={industryMapSnapshot} onTileSelected={selectIndustryTile} />
{/if}
```

with:

```svelte
{#if activeMapView === 'world'}
	<WorldMap
		statuses={worldCityStatuses}
		selectedCityId={selectedWorldCityId}
		onSelectCity={selectWorldCityNode}
		onOpenCity={openSelectedWorldCity}
		onCloseInspector={closeWorldInspector}
	/>
{:else if activeMapView === 'retail'}
	<CityMap snapshot={mapSnapshot} onTileSelected={selectTile} />
{:else}
	<IndustryMap snapshot={industryMapSnapshot} onTileSelected={selectIndustryTile} />
{/if}
```

Update `<title>`:

```svelte
<title>
	{activeMapView === 'world'
		? 'World Map'
		: activeMapView === 'industry'
			? 'Industry City Map'
			: 'Retail City Map'}
</title>
```

In the map title eyebrow and heading expressions, handle `world`:

```svelte
{activeMapView === 'world'
	? 'World Map'
	: activeMapView === 'industry'
		? 'Industry City Map'
		: 'Retail City Map'}
```

For the `<h1>`, use:

```svelte
{activeMapView === 'world'
	? 'Regional Network'
	: activeMapView === 'industry'
		? industryCity.name
		: activeCity.name}
```

Add the menu item before Retail City Map:

```svelte
<button
	type="button"
	role="menuitem"
	class:active-view={activeMapView === 'world'}
	onclick={showWorldMap}
	disabled={!game}
>
	World Map
</button>
```

- [ ] **Step 6: Run Svelte autofixer**

Run `svelte-autofixer` on the full updated `+page.svelte`.

Expected: no issues. If it reports issues, apply fixes and run again until clean.

- [ ] **Step 7: Run checks and e2e**

Run: `bun run check`

Expected: PASS.

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "player opens a revealed retail city"`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat: integrate world map route flow"
```

---

## Task 9: Full Verification And Cleanup

**Files:**

- Review: all changed files
- Modify only if verification finds an issue

- [ ] **Step 1: Run stale reference searches**

Run: `rg -n "MAX_STORES|activeWorldCityId|per-city store cap|route logistics|shipping cost" src docs/superpowers/plans/2026-05-30-multi-cities.md`

Expected: no `MAX_STORES` or `activeWorldCityId` matches in `src`; deferred terms may only appear in docs/specs.

- [ ] **Step 2: Run unit tests**

Run: `bun run test:unit -- --run`

Expected: PASS.

- [ ] **Step 3: Run Svelte/TypeScript diagnostics**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 4: Run e2e tests**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts`

Expected: PASS.

- [ ] **Step 5: Run production build**

Run: `bun run build`

Expected: PASS.

- [ ] **Step 6: Inspect final worktree**

Run: `git status --short`

Expected: no uncommitted changes after the task commits above. If verification exposed a bug, fix it in the narrowest touched file, rerun the failed command, and commit the exact changed files with `git add` before this final status check.

---

## Execution Notes

- Follow the repo instruction that `AGENTS.md` is a symlink to `CLAUDE.md`; do not edit `AGENTS.md`.
- Use `rg` for searches.
- Use `apply_patch` for manual file edits.
- Do not start implementation before choosing the execution mode requested after this plan.
- For Svelte work, call the official Svelte MCP tools in this order: `list-sections`, `get-documentation`, `svelte-autofixer` until clean.
- Every Vitest test must contain at least one `expect` because `vite.config.ts` enforces `expect.requireAssertions`.
