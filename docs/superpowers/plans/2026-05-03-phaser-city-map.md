# Phaser City Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Phaser-powered, scalable city map where players select city tiles to found and expand retail stores.

**Architecture:** Keep city generation, placement validation, forecasts, and store-opening rules in pure TypeScript under `src/lib/game`. Mount Phaser from a Svelte bridge component that renders only visual state and emits tile selection events. Keep Svelte responsible for the inspector, start flow, management panels, and accessible action buttons.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Phaser, Bun, Vitest, Playwright.

---

## File Structure

- Modify `package.json` and `bun.lock`: add `phaser`.
- Modify `src/lib/game/types.ts`: add city, tile, terrain, neighborhood, forecast, and map placement fields.
- Create `src/lib/game/city.ts`: deterministic city generation and tile lookup helpers.
- Create `src/lib/game/city.spec.ts`: city model tests.
- Create `src/lib/game/placement.ts`: tile recommendations, opening forecasts, founding store creation, and expansion placement helpers.
- Create `src/lib/game/placement.spec.ts`: placement tests.
- Modify `src/lib/game/state.ts`: accept city/tile placement for founding and expansion while preserving existing high-level helpers.
- Modify `src/lib/game/state.spec.ts`: cover map-aware state creation and expansion.
- Create `src/lib/game/mapRender.ts`: convert game state into a renderer snapshot for Phaser.
- Create `src/lib/game/mapRender.spec.ts`: renderer snapshot tests.
- Create `src/lib/phaser/cityMapScene.ts`: Phaser scene class for terrain, store markers, selection, camera, and animation.
- Create `src/lib/components/game/CityMap.svelte`: browser-only Phaser bridge.
- Create `src/lib/components/game/TileInspector.svelte`: selected tile/store inspector and store-opening controls.
- Modify `src/routes/+page.svelte`: map-first flow and supporting management panels.
- Modify `src/routes/layout.css`: full-height app and map-first base styling.
- Modify `src/routes/retail-sim.e2e.ts`: map-first founding and expansion flow coverage.

## Task 1: Add Scalable City Domain

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Create: `src/lib/game/city.ts`
- Create: `src/lib/game/city.spec.ts`

- [ ] **Step 1: Add Phaser dependency**

Run:

```bash
bun add phaser
```

Expected: `package.json` contains `phaser` in dependencies and `bun.lock` is updated.

- [ ] **Step 2: Write failing city generation tests**

Create `src/lib/game/city.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { generateCity, getTileById, getTilesByNeighborhood } from './city';

describe('city generation', () => {
	test('generates deterministic city tiles for the same seed', () => {
		expect.assertions(1);
		const first = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 99 });
		const second = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 99 });

		expect(first).toEqual(second);
	});

	test('supports city dimensions that are not 20 by 20', () => {
		expect.assertions(4);
		const city = generateCity({ id: 'test-city', name: 'Test City', width: 12, height: 8, seed: 42 });

		expect(city.width).toBe(12);
		expect(city.height).toBe(8);
		expect(city.tiles).toHaveLength(96);
		expect(city.tiles.at(-1)?.id).toBe('test-city-11-7');
	});

	test('generates stable coordinates and bounded economic traits', () => {
		expect.assertions(7);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 77 });
		const tile = getTileById(city, 'harbor-city-3-4');

		expect(tile?.x).toBe(3);
		expect(tile?.y).toBe(4);
		expect(tile?.demand).toBeGreaterThanOrEqual(20);
		expect(tile?.demand).toBeLessThanOrEqual(100);
		expect(tile?.rent).toBeGreaterThanOrEqual(400);
		expect(tile?.rent).toBeLessThanOrEqual(2600);
		expect(tile?.customerFit).toBeGreaterThanOrEqual(20);
	});

	test('creates readable neighborhood clusters', () => {
		expect.assertions(2);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 77 });

		expect(getTilesByNeighborhood(city, 'downtown').length).toBeGreaterThan(0);
		expect(getTilesByNeighborhood(city, 'campus').length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
bun run test:unit -- --run src/lib/game/city.spec.ts
```

Expected: FAIL because `src/lib/game/city.ts` does not exist.

- [ ] **Step 4: Extend shared types**

Modify `src/lib/game/types.ts` by adding these exported types and extending `Store` and `GameState`:

```ts
export type NeighborhoodId =
	| 'downtown'
	| 'campus'
	| 'residential'
	| 'mall'
	| 'transit'
	| 'industrial'
	| 'suburb'
	| 'parkEdge';

export type TerrainId = 'commercial' | 'residential' | 'green' | 'transit' | 'industrial';

export interface CityTile {
	id: string;
	cityId: string;
	x: number;
	y: number;
	neighborhood: NeighborhoodId;
	terrain: TerrainId;
	demand: number;
	rent: number;
	footTraffic: number;
	customerFit: number;
	locked: boolean;
}

export interface City {
	id: string;
	name: string;
	width: number;
	height: number;
	tiles: CityTile[];
}

export interface OpeningForecast {
	tileId: string;
	setupCost: number;
	projectedDailyRevenue: number;
	projectedDailyRent: number;
	demandScore: number;
	customerFit: number;
	risks: string[];
}
```

Add these fields to `Store`:

```ts
	cityId: string;
	tileId: string;
	mapX: number;
	mapY: number;
```

Add these fields to `GameState`:

```ts
	cities: City[];
	activeCityId: string;
```

- [ ] **Step 5: Keep existing store creation type-safe**

Modify the object returned by `createStore` in `src/lib/game/state.ts` to include temporary map placement fields. Task 2 replaces these with real selected-tile placement.

```ts
		cityId: 'harbor-city',
		tileId: `${input.id}-unplaced`,
		mapX: 0,
		mapY: 0,
```

Modify the object returned by `createNewGame` in `src/lib/game/state.ts` to include an empty city list and active city id. Task 2 replaces this with generated city data.

```ts
		cities: [],
		activeCityId: 'harbor-city',
```

- [ ] **Step 6: Implement deterministic city generation**

Create `src/lib/game/city.ts`:

```ts
import { createRng, randomInt } from './rng';
import type { City, CityTile, NeighborhoodId, TerrainId } from './types';

interface GenerateCityInput {
	id: string;
	name: string;
	width: number;
	height: number;
	seed: number;
}

interface NeighborhoodProfile {
	neighborhood: NeighborhoodId;
	terrain: TerrainId;
	demand: number;
	rent: number;
	footTraffic: number;
	customerFit: number;
}

const PROFILES: NeighborhoodProfile[] = [
	{ neighborhood: 'downtown', terrain: 'commercial', demand: 88, rent: 2300, footTraffic: 92, customerFit: 76 },
	{ neighborhood: 'campus', terrain: 'commercial', demand: 72, rent: 1250, footTraffic: 84, customerFit: 82 },
	{ neighborhood: 'residential', terrain: 'residential', demand: 62, rent: 980, footTraffic: 48, customerFit: 70 },
	{ neighborhood: 'mall', terrain: 'commercial', demand: 82, rent: 2100, footTraffic: 88, customerFit: 78 },
	{ neighborhood: 'transit', terrain: 'transit', demand: 76, rent: 1600, footTraffic: 96, customerFit: 64 },
	{ neighborhood: 'industrial', terrain: 'industrial', demand: 42, rent: 720, footTraffic: 36, customerFit: 44 },
	{ neighborhood: 'suburb', terrain: 'residential', demand: 54, rent: 840, footTraffic: 42, customerFit: 68 },
	{ neighborhood: 'parkEdge', terrain: 'green', demand: 46, rent: 760, footTraffic: 50, customerFit: 60 }
];

export function generateCity(input: GenerateCityInput): City {
	const width = Math.max(1, Math.floor(input.width));
	const height = Math.max(1, Math.floor(input.height));
	const rng = createRng(input.seed);
	const centers = buildNeighborhoodCenters(width, height);
	const tiles: CityTile[] = [];

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const profile = nearestProfile(x, y, centers);
			tiles.push({
				id: `${input.id}-${x}-${y}`,
				cityId: input.id,
				x,
				y,
				neighborhood: profile.neighborhood,
				terrain: profile.terrain,
				demand: clampTrait(profile.demand + randomInt(rng, -8, 8), 20, 100),
				rent: clampTrait(profile.rent + randomInt(rng, -140, 140), 400, 2600),
				footTraffic: clampTrait(profile.footTraffic + randomInt(rng, -8, 8), 20, 100),
				customerFit: clampTrait(profile.customerFit + randomInt(rng, -8, 8), 20, 100),
				locked: profile.terrain === 'green' && randomInt(rng, 1, 100) <= 35
			});
		}
	}

	return {
		id: input.id,
		name: input.name,
		width,
		height,
		tiles
	};
}

export function getTileById(city: City, tileId: string): CityTile | undefined {
	return city.tiles.find((tile) => tile.id === tileId);
}

export function getTilesByNeighborhood(city: City, neighborhood: NeighborhoodId): CityTile[] {
	return city.tiles.filter((tile) => tile.neighborhood === neighborhood);
}

function buildNeighborhoodCenters(width: number, height: number) {
	return PROFILES.map((profile, index) => ({
		profile,
		x: ((index % 4) + 0.5) * (width / 4),
		y: (Math.floor(index / 4) + 0.5) * (height / 2)
	}));
}

function nearestProfile(
	x: number,
	y: number,
	centers: Array<{ profile: NeighborhoodProfile; x: number; y: number }>
): NeighborhoodProfile {
	return centers.reduce((nearest, center) => {
		const nearestDistance = distanceSquared(x, y, nearest.x, nearest.y);
		const centerDistance = distanceSquared(x, y, center.x, center.y);
		return centerDistance < nearestDistance ? center : nearest;
	}).profile;
}

function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
	return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

function clampTrait(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}
```

- [ ] **Step 7: Run city tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/city.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add package.json bun.lock src/lib/game/types.ts src/lib/game/state.ts src/lib/game/city.ts src/lib/game/city.spec.ts
git commit -m "feat: add city map domain"
```

## Task 2: Add Tile Placement and Forecast Rules

**Files:**
- Create: `src/lib/game/placement.ts`
- Create: `src/lib/game/placement.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`

- [ ] **Step 1: Write failing placement tests**

Create `src/lib/game/placement.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import {
	createFoundingGameAtTile,
	forecastOpening,
	getRecommendedArchetypes,
	openStoreAtTile
} from './placement';

describe('tile placement', () => {
	test('recommends archetypes from selected tile traits', () => {
		expect.assertions(2);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 77 });
		const tile = city.tiles.find((candidate) => candidate.neighborhood === 'campus')!;

		const recommendations = getRecommendedArchetypes(tile);

		expect(recommendations.length).toBeGreaterThanOrEqual(2);
		expect(recommendations).toContain('electronics');
	});

	test('forecasts opening economics deterministically', () => {
		expect.assertions(4);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 77 });
		const tile = city.tiles.find((candidate) => !candidate.locked)!;
		const first = forecastOpening(tile, 'grocery');
		const second = forecastOpening(tile, 'grocery');

		expect(first).toEqual(second);
		expect(first.setupCost).toBeGreaterThan(0);
		expect(first.projectedDailyRent).toBe(tile.rent);
		expect(first.risks.length).toBeGreaterThanOrEqual(0);
	});

	test('creates the founding game at the selected tile', () => {
		expect.assertions(8);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 101 });
		const tile = city.tiles.find((candidate) => !candidate.locked)!;

		const game = createFoundingGameAtTile({ archetypeId: 'boutique', city, tileId: tile.id, seed: 101 });

		expect(game.activeCityId).toBe(city.id);
		expect(game.cities).toHaveLength(1);
		expect(game.stores).toHaveLength(1);
		expect(game.stores[0]?.cityId).toBe(city.id);
		expect(game.stores[0]?.tileId).toBe(tile.id);
		expect(game.stores[0]?.mapX).toBe(tile.x);
		expect(game.stores[0]?.mapY).toBe(tile.y);
		expect(game.stores[0]?.localDemand).toBeGreaterThan(0);
	});

	test('blocks opening on an occupied tile', () => {
		expect.assertions(2);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 101 });
		const tile = city.tiles.find((candidate) => !candidate.locked)!;
		const game = createFoundingGameAtTile({ archetypeId: 'boutique', city, tileId: tile.id, seed: 101 });

		const result = openStoreAtTile(game, { tileId: tile.id, name: 'Duplicate Store' });

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.title).toBe('Location unavailable');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run test:unit -- --run src/lib/game/placement.spec.ts
```

Expected: FAIL because `src/lib/game/placement.ts` does not exist.

- [ ] **Step 3: Add placement helpers**

Create `src/lib/game/placement.ts`:

```ts
import { getArchetype } from './archetypes';
import { getTileById } from './city';
import { clampScore } from './reports';
import { createNewGame, openStore } from './state';
import type { ArchetypeId, City, CityTile, DecisionItem, GameState, OpeningForecast } from './types';

const MAP_EXPANSION_COST = 14_000;

const ARCHETYPE_FIT: Record<ArchetypeId, Partial<Record<CityTile['neighborhood'], number>>> = {
	convenience: { downtown: 8, transit: 10, residential: 6, suburb: 5, campus: 5 },
	boutique: { downtown: 9, mall: 9, parkEdge: 5, residential: 4 },
	electronics: { campus: 10, mall: 9, downtown: 6, transit: 4 },
	grocery: { residential: 9, suburb: 8, downtown: 4, transit: 4 }
};

export function getRecommendedArchetypes(tile: CityTile): ArchetypeId[] {
	return (['convenience', 'boutique', 'electronics', 'grocery'] as const)
		.map((archetypeId) => ({
			archetypeId,
			score: tile.customerFit + tile.footTraffic / 2 + (ARCHETYPE_FIT[archetypeId][tile.neighborhood] ?? 0) * 5
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, 3)
		.map((item) => item.archetypeId);
}

export function forecastOpening(tile: CityTile, archetypeId: ArchetypeId): OpeningForecast {
	const archetype = getArchetype(archetypeId);
	const fitBonus = ARCHETYPE_FIT[archetypeId][tile.neighborhood] ?? 0;
	const demandScore = clampScore(Math.round((tile.demand + tile.footTraffic + fitBonus * 8) / 2.2));
	const projectedDailyRevenue = Math.round(
		(archetype.baseTraffic * 18 + tile.demand * 22 + tile.footTraffic * 12) *
			(0.72 + tile.customerFit / 180)
	);
	const risks = [
		...(tile.rent > 1900 ? ['High rent pressure'] : []),
		...(tile.customerFit < 45 ? ['Weak customer fit'] : []),
		...(tile.demand < 45 ? ['Low demand base'] : []),
		...(tile.locked ? ['Location is locked'] : [])
	];

	return {
		tileId: tile.id,
		setupCost: MAP_EXPANSION_COST,
		projectedDailyRevenue,
		projectedDailyRent: tile.rent,
		demandScore,
		customerFit: tile.customerFit,
		risks
	};
}

export function createFoundingGameAtTile(input: {
	archetypeId: ArchetypeId;
	city: City;
	tileId: string;
	seed: number;
}): GameState {
	const tile = getTileById(input.city, input.tileId);

	if (!tile || tile.locked) {
		throw new Error('A valid unlocked founding tile is required.');
	}

	const game = createNewGame(input.archetypeId, input.seed);
	const foundingStore = applyTileToStore(game.stores[0]!, input.city, tile);

	return {
		...game,
		activeCityId: input.city.id,
		cities: [input.city],
		stores: [foundingStore]
	};
}

export function openStoreAtTile(game: GameState, input: { tileId: string; name: string }): GameState {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);
	const tile = city ? getTileById(city, input.tileId) : undefined;

	if (!city || !tile || tile.locked || game.stores.some((store) => store.tileId === input.tileId)) {
		return appendDecision(game, blockedLocationDecision(game));
	}

	const next = openStore(game, {
		name: input.name,
		location: readableLocation(tile)
	});
	const openedStore = next.stores.at(-1);

	if (!openedStore || next.stores.length === game.stores.length) {
		return next;
	}

	return {
		...next,
		stores: [...next.stores.slice(0, -1), applyTileToStore(openedStore, city, tile)]
	};
}

function applyTileToStore<T extends GameState['stores'][number]>(store: T, city: City, tile: CityTile): T {
	return {
		...store,
		cityId: city.id,
		tileId: tile.id,
		mapX: tile.x,
		mapY: tile.y,
		location: readableLocation(tile),
		localDemand: Math.max(0, Math.round((store.localDemand + tile.demand + tile.footTraffic) / 2.6)),
		competition: clampScore(Math.round(store.competition * 0.7)),
		reputation: clampScore(Math.round((store.reputation + tile.customerFit) / 2)),
		staffCapacity: clampScore(Math.round(store.staffCapacity + (tile.footTraffic - 50) / 8))
	};
}

function readableLocation(tile: CityTile): string {
	return `${labelNeighborhood(tile.neighborhood)} (${tile.x}, ${tile.y})`;
}

function labelNeighborhood(neighborhood: CityTile['neighborhood']): string {
	return neighborhood === 'parkEdge'
		? 'Park Edge'
		: neighborhood === 'mall'
			? 'Mall District'
			: `${neighborhood.charAt(0).toUpperCase()}${neighborhood.slice(1)}`;
}

function blockedLocationDecision(game: GameState): DecisionItem {
	return {
		id: `location-unavailable-${game.day}`,
		title: 'Location unavailable',
		context: 'That city tile is locked, missing, or already occupied by a store.',
		expiresOnDay: game.day + 1,
		options: [
			{
				id: 'acknowledge',
				label: 'Acknowledge',
				description: 'Choose another city tile.',
				effects: {}
			}
		]
	};
}

function appendDecision(game: GameState, decision: DecisionItem): GameState {
	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}
```

- [ ] **Step 4: Update state defaults for existing tests**

Modify `createNewGame` in `src/lib/game/state.ts` so existing non-map tests still return map-compatible state. Generate a default city and apply the founding tile:

```ts
import { generateCity, getTileById } from './city';
```

Inside `createNewGame`, before returning:

```ts
	const city = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: 20,
		height: 20,
		seed: normalizedSeed
	});
	const fallbackTile = city.tiles.find((tile) => !tile.locked) ?? city.tiles[0]!;
	const placedOpeningStore = {
		...openingStore,
		cityId: city.id,
		tileId: fallbackTile.id,
		mapX: fallbackTile.x,
		mapY: fallbackTile.y,
		location: `Founding location (${fallbackTile.x}, ${fallbackTile.y})`
	};
```

Use `placedOpeningStore` in `scorecard.staffMorale` and `stores`, and include:

```ts
		cities: [city],
		activeCityId: city.id,
```

If TypeScript reports an unused `getTileById` import, remove that import and keep only `generateCity`.

- [ ] **Step 5: Update state tests for map fields**

Modify the first test in `src/lib/game/state.spec.ts` to include these expectations and update `expect.assertions(6)` to `expect.assertions(10)`:

```ts
		expect(game.cities).toHaveLength(1);
		expect(game.activeCityId).toBe(game.cities[0]?.id);
		expect(game.stores[0]?.tileId).toBeTruthy();
		expect(game.stores[0]?.mapX).toBeGreaterThanOrEqual(0);
```

- [ ] **Step 6: Run placement and state tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/placement.spec.ts src/lib/game/state.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/placement.ts src/lib/game/placement.spec.ts
git commit -m "feat: add tile-based store placement"
```

## Task 3: Add Renderer Snapshot and Phaser Scene

**Files:**
- Create: `src/lib/game/mapRender.ts`
- Create: `src/lib/game/mapRender.spec.ts`
- Create: `src/lib/phaser/cityMapScene.ts`

- [ ] **Step 1: Write failing renderer snapshot tests**

Create `src/lib/game/mapRender.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { createFoundingGameAtTile } from './placement';
import { createCityMapSnapshot } from './mapRender';

describe('city map render snapshot', () => {
	test('creates a serializable snapshot for the active city', () => {
		expect.assertions(7);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 9 });
		const tile = city.tiles.find((candidate) => !candidate.locked)!;
		const game = createFoundingGameAtTile({ archetypeId: 'convenience', city, tileId: tile.id, seed: 9 });

		const snapshot = createCityMapSnapshot(game, tile.id);

		expect(snapshot.cityId).toBe(city.id);
		expect(snapshot.width).toBe(20);
		expect(snapshot.height).toBe(20);
		expect(snapshot.tiles).toHaveLength(400);
		expect(snapshot.stores).toHaveLength(1);
		expect(snapshot.selectedTileId).toBe(tile.id);
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.owned).toBe(true);
	});

	test('returns an empty safe snapshot when the active city is missing', () => {
		expect.assertions(4);
		const city = generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 9 });
		const tile = city.tiles.find((candidate) => !candidate.locked)!;
		const game = createFoundingGameAtTile({ archetypeId: 'convenience', city, tileId: tile.id, seed: 9 });

		const snapshot = createCityMapSnapshot({ ...game, activeCityId: 'missing-city' }, null);

		expect(snapshot.cityId).toBe('missing-city');
		expect(snapshot.width).toBe(0);
		expect(snapshot.height).toBe(0);
		expect(snapshot.tiles).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run test:unit -- --run src/lib/game/mapRender.spec.ts
```

Expected: FAIL because `mapRender.ts` does not exist.

- [ ] **Step 3: Implement renderer snapshot helper**

Create `src/lib/game/mapRender.ts`:

```ts
import type { GameState, NeighborhoodId, TerrainId } from './types';

export interface CityMapTileRender {
	id: string;
	x: number;
	y: number;
	neighborhood: NeighborhoodId;
	terrain: TerrainId;
	locked: boolean;
	owned: boolean;
	selected: boolean;
	demand: number;
	rent: number;
	footTraffic: number;
	customerFit: number;
}

export interface CityMapStoreRender {
	id: string;
	name: string;
	tileId: string;
	x: number;
	y: number;
}

export interface CityMapSnapshot {
	cityId: string;
	width: number;
	height: number;
	selectedTileId: string | null;
	tiles: CityMapTileRender[];
	stores: CityMapStoreRender[];
}

export function createCityMapSnapshot(
	game: GameState,
	selectedTileId: string | null
): CityMapSnapshot {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);

	if (!city) {
		return {
			cityId: game.activeCityId,
			width: 0,
			height: 0,
			selectedTileId,
			tiles: [],
			stores: []
		};
	}

	const storeByTile = new Map(game.stores.map((store) => [store.tileId, store]));

	return {
		cityId: city.id,
		width: city.width,
		height: city.height,
		selectedTileId,
		tiles: city.tiles.map((tile) => ({
			id: tile.id,
			x: tile.x,
			y: tile.y,
			neighborhood: tile.neighborhood,
			terrain: tile.terrain,
			locked: tile.locked,
			owned: storeByTile.has(tile.id),
			selected: tile.id === selectedTileId,
			demand: tile.demand,
			rent: tile.rent,
			footTraffic: tile.footTraffic,
			customerFit: tile.customerFit
		})),
		stores: game.stores
			.filter((store) => store.cityId === city.id)
			.map((store) => ({
				id: store.id,
				name: store.name,
				tileId: store.tileId,
				x: store.mapX,
				y: store.mapY
			}))
	};
}
```

- [ ] **Step 4: Run renderer snapshot tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/mapRender.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Implement Phaser scene**

Create `src/lib/phaser/cityMapScene.ts`:

```ts
import Phaser from 'phaser';
import type { CityMapSnapshot, CityMapTileRender } from '$lib/game/mapRender';

export type CityMapEvent = { type: 'tileSelected'; tileId: string };
export type CityMapEventHandler = (event: CityMapEvent) => void;

const TILE_SIZE = 48;

const TERRAIN_COLORS: Record<CityMapTileRender['terrain'], number> = {
	commercial: 0x4d89c7,
	residential: 0x5d9f6f,
	green: 0x6fa85d,
	transit: 0xc9a857,
	industrial: 0x8a8791
};

export class CityMapScene extends Phaser.Scene {
	private snapshot: CityMapSnapshot | null = null;
	private onEvent: CityMapEventHandler = () => {};
	private tileLayer?: Phaser.GameObjects.Container;
	private markerLayer?: Phaser.GameObjects.Container;
	private dragStart?: Phaser.Math.Vector2;

	constructor() {
		super('CityMapScene');
	}

	create(): void {
		this.tileLayer = this.add.container(0, 0);
		this.markerLayer = this.add.container(0, 0);
		this.cameras.main.setZoom(0.9);
		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			this.dragStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
		});
		this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
			if (!pointer.isDown || !this.dragStart) {
				return;
			}
			this.cameras.main.scrollX -= (pointer.x - this.dragStart.x) / this.cameras.main.zoom;
			this.cameras.main.scrollY -= (pointer.y - this.dragStart.y) / this.cameras.main.zoom;
			this.dragStart.set(pointer.x, pointer.y);
		});
		this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
			const zoom = Phaser.Math.Clamp(this.cameras.main.zoom + (dy > 0 ? -0.08 : 0.08), 0.45, 1.8);
			this.cameras.main.setZoom(zoom);
		});
		this.redraw();
	}

	setEventHandler(handler: CityMapEventHandler): void {
		this.onEvent = handler;
	}

	updateSnapshot(snapshot: CityMapSnapshot): void {
		this.snapshot = snapshot;
		this.redraw();
	}

	private redraw(): void {
		if (!this.tileLayer || !this.markerLayer || !this.snapshot) {
			return;
		}

		this.tileLayer.removeAll(true);
		this.markerLayer.removeAll(true);

		for (const tile of this.snapshot.tiles) {
			this.drawTile(tile);
		}

		for (const store of this.snapshot.stores) {
			const x = store.x * TILE_SIZE + TILE_SIZE / 2;
			const y = store.y * TILE_SIZE + TILE_SIZE / 2;
			const marker = this.add.star(x, y, 5, 7, 16, 0xfff1a8).setStrokeStyle(2, 0x302411);
			this.tweens.add({ targets: marker, scale: 1.08, duration: 900, yoyo: true, repeat: -1 });
			this.markerLayer.add(marker);
		}

		this.cameras.main.setBounds(0, 0, this.snapshot.width * TILE_SIZE, this.snapshot.height * TILE_SIZE);
	}

	private drawTile(tile: CityMapTileRender): void {
		const x = tile.x * TILE_SIZE;
		const y = tile.y * TILE_SIZE;
		const color = tile.locked ? 0x2d3441 : TERRAIN_COLORS[tile.terrain];
		const rect = this.add
			.rectangle(x, y, TILE_SIZE - 2, TILE_SIZE - 2, color, tile.locked ? 0.55 : 0.9)
			.setOrigin(0)
			.setStrokeStyle(tile.selected ? 3 : 1, tile.selected ? 0xffffff : 0x172033)
			.setInteractive({ useHandCursor: true });

		rect.on('pointerover', () => rect.setStrokeStyle(2, 0xf8d978));
		rect.on('pointerout', () => rect.setStrokeStyle(tile.selected ? 3 : 1, tile.selected ? 0xffffff : 0x172033));
		rect.on('pointerup', () => this.onEvent({ type: 'tileSelected', tileId: tile.id }));
		this.tileLayer?.add(rect);

		if (tile.owned) {
			const building = this.add.rectangle(x + 13, y + 12, 22, 26, 0xf6f0dd).setOrigin(0);
			this.tileLayer?.add(building);
		}
	}
}
```

- [ ] **Step 6: Run unit tests and type check**

Run:

```bash
bun run test:unit -- --run src/lib/game/mapRender.spec.ts
bun run check
```

Expected: tests PASS and `svelte-check` reports 0 errors.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/game/mapRender.ts src/lib/game/mapRender.spec.ts src/lib/phaser/cityMapScene.ts
git commit -m "feat: add Phaser city map scene"
```

## Task 4: Add Svelte Map Bridge and Inspector

**Files:**
- Create: `src/lib/components/game/CityMap.svelte`
- Create: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Write map bridge component**

Create `src/lib/components/game/CityMap.svelte` with a browser-only Phaser mount. After writing it, run Svelte autofixer on this file until it reports no issues.

The component must expose props:

```ts
interface Props {
	snapshot: CityMapSnapshot;
	onTileSelected: (tileId: string) => void;
}
```

Use this lifecycle pattern:

```ts
import { onDestroy, onMount } from 'svelte';
import type Phaser from 'phaser';
import type { CityMapSnapshot } from '$lib/game/mapRender';
import type { CityMapEvent, CityMapScene } from '$lib/phaser/cityMapScene';

let { snapshot, onTileSelected }: Props = $props();
let container: HTMLDivElement;
let game: Phaser.Game | null = null;
let scene: CityMapScene | null = null;
let loadError: string | null = $state(null);

onMount(async () => {
	try {
		const [{ default: Phaser }, { CityMapScene }] = await Promise.all([
			import('phaser'),
			import('$lib/phaser/cityMapScene')
		]);
		scene = new CityMapScene();
		scene.setEventHandler((event: CityMapEvent) => {
			if (event.type === 'tileSelected') {
				onTileSelected(event.tileId);
			}
		});
		game = new Phaser.Game({
			type: Phaser.AUTO,
			parent: container,
			backgroundColor: '#0f1724',
			scale: { mode: Phaser.Scale.RESIZE, width: container.clientWidth, height: container.clientHeight },
			scene
		});
		scene.updateSnapshot(snapshot);
	} catch {
		loadError = 'City map renderer failed to load.';
	}
});
```

Add a `$effect` that calls `scene?.updateSnapshot(snapshot)` whenever `snapshot` changes.

- [ ] **Step 2: Write tile inspector component**

Create `src/lib/components/game/TileInspector.svelte`. After writing it, run Svelte autofixer on this file until it reports no issues.

Props:

```ts
interface Props {
	tile: CityTile | null;
	store: Store | null;
	forecast: OpeningForecast | null;
	recommendations: ArchetypeId[];
	gameStarted: boolean;
	canOpenStore: boolean;
	onFoundStore: (archetypeId: ArchetypeId) => void;
	onOpenStore: () => void;
}
```

The component should render:

- “Select a city tile” empty state.
- Tile stats for empty selected tiles.
- Recommended archetype buttons before founding.
- “Open store here” button after founding.
- Store status when the selected tile already has an owned store.
- Disabled button copy explaining locked or unaffordable states.

- [ ] **Step 3: Refactor route to map-first state**

Modify `src/routes/+page.svelte`:

- Replace start-only archetype screen with a map-first scene.
- Create `starterCity` with `generateCity({ id: 'harbor-city', name: 'Harbor City', width: 20, height: 20, seed: 20260503 })`.
- Track `selectedTileId: string | null`.
- Derive `activeCity`, `selectedTile`, `selectedStore`, `recommendations`, `forecast`, and `mapSnapshot`.
- Use `createFoundingGameAtTile` for the first store.
- Use `openStoreAtTile` for expansion.
- Keep `advanceDay`, `changePolicy`, and `chooseDecision`.
- Remove the generic top-bar `Open store` button.

Run Svelte autofixer on `+page.svelte` until it reports no issues.

- [ ] **Step 4: Update global layout CSS**

Modify `src/routes/layout.css` so `body`, `#svelte`, and the app route can support a full-height game screen. Keep the dark visual tone, but avoid one-note dark-blue dominance by using terrain accents, neutral panels, and warm highlights in component CSS.

- [ ] **Step 5: Run Svelte checks**

Run:

```bash
bun run check
```

Expected: 0 errors and 0 warnings.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/components/game/CityMap.svelte src/lib/components/game/TileInspector.svelte src/routes/+page.svelte src/routes/layout.css
git commit -m "feat: build map-first Svelte game shell"
```

## Task 5: Add End-to-End Flow and Final Verification

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Update Playwright test for map-first founding**

Modify `src/routes/retail-sim.e2e.ts` to cover:

```ts
import { expect, test } from '@playwright/test';

test('player can found a store from the city map and advance a day', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await page.getByRole('button', { name: /select tile 0, 0/i }).click();
	await expect(page.getByText(/recommended/i)).toBeVisible();
	await page.getByRole('button', { name: /open .* here/i }).first().click();

	await expect(page.getByText(/control tower/i)).toBeVisible();
	await expect(page.getByRole('heading', { name: /day 1/i })).toBeVisible();

	await page.getByLabel(/pricing/i).selectOption('premium');
	await page.getByRole('button', { name: /advance day/i }).click();

	await expect(page.getByRole('heading', { name: /day 2/i })).toBeVisible();
	await expect(page.getByText(/latest daily result/i)).toBeVisible();
});

test('player expands from a selected city tile', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: /select tile 0, 0/i }).click();
	await page.getByRole('button', { name: /open .* here/i }).first().click();

	await page.getByRole('button', { name: /select tile 1, 0/i }).click();
	await page.getByRole('button', { name: /open store here/i }).click();

	await expect(page.getByText(/store #2/i)).toBeVisible();
});
```

If Phaser canvas click targeting is unreliable in Playwright, add accessible Svelte tile buttons in a visually compact fallback list for tests and keyboard users. The buttons should use labels like `Select tile 0, 0`.

- [ ] **Step 2: Run e2e test and fix selectors if needed**

Run:

```bash
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
bun run test:unit -- --run
bun run check
bun run build
```

Expected:

- Unit tests PASS.
- `svelte-check` reports 0 errors and 0 warnings.
- Production build completes.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test: cover map-first retail flow"
```

## Self-Review Notes

Spec coverage:

- Phaser rendering: Task 3 creates the scene, Task 4 mounts it.
- Scalable city data: Task 1 adds dimensions and deterministic generation.
- Store placement on map: Task 2 adds founding and expansion helpers.
- Map-first UI: Task 4 refactors the route and inspector.
- Testing: Tasks 1, 2, 3, and 5 cover pure logic and end-to-end flow.
- Deferred competitors and final art: excluded from every task.

Type consistency:

- `City`, `CityTile`, `OpeningForecast`, `NeighborhoodId`, and `TerrainId` are introduced before use.
- `createFoundingGameAtTile`, `openStoreAtTile`, `forecastOpening`, and `getRecommendedArchetypes` are defined in Task 2 before UI tasks use them.
- `createCityMapSnapshot` is defined in Task 3 before `CityMap.svelte` consumes it.
