# City Terrain Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lively road, river, and tree terrain assets to the Phaser city map, with whole-tile roads and rivers blocking store placement.

**Architecture:** Add deterministic `CityTile.feature` metadata in pure TypeScript city generation, centralize road/river placement blocking in game helpers, thread the feature through `CityMapSnapshot`, and let Phaser render registered terrain assets below store sprites. Svelte remains the UI shell and displays disabled placement feedback from the game helpers.

**Tech Stack:** Svelte 5, SvelteKit, TypeScript, Phaser, Bun, Vitest browser tests, Playwright e2e tests.

---

## File Structure

- Modify `src/lib/game/types.ts`: add `CityTileFeature` and `feature` on `CityTile` and `CityMapTileRender` dependencies.
- Modify `src/lib/game/city.ts`: generate deterministic whole-tile road and river features; expose placement block helpers.
- Modify `src/lib/game/city.spec.ts`: cover deterministic features and placement block reasons.
- Modify `src/lib/game/placement.ts`: reject road and river tiles for founding and expansion placement.
- Modify `src/lib/game/placement.spec.ts`: cover founding and expansion blocks on road and river tiles.
- Modify `src/lib/game/state.ts`: reject road and river tiles in direct expansion placement fallback.
- Modify `src/lib/game/state.spec.ts`: ensure direct expansion never chooses road or river tiles.
- Modify `src/lib/game/mapRender.ts`: include `feature` in render snapshots.
- Modify `src/lib/game/mapRender.spec.ts`: verify snapshot feature metadata.
- Modify `src/lib/assets/gameArt.ts`: add terrain art registry entries.
- Modify `src/lib/assets/gameArt.spec.ts`: verify terrain asset registry and files.
- Create `static/assets/game/terrain/road-tile.png`: road tile asset.
- Create `static/assets/game/terrain/river-tile.png`: river tile asset.
- Create `static/assets/game/terrain/tree-decoration.png`: tree decoration asset.
- Modify `src/lib/phaser/cityMapScene.ts`: preload terrain textures, render terrain feature sprites/decorations, and expose dataset markers.
- Modify `src/lib/components/game/TileInspector.svelte`: display feature labels for road/river tiles while keeping disabled store actions.
- Modify `src/lib/components/game/TileInspector.svelte.spec.ts`: add `feature` to test tiles and assert road/river disabled feedback.
- Modify `src/routes/+page.svelte`: use pure TypeScript placement block helpers for selected-tile disabled reasons and founding guards.
- Modify `src/routes/retail-sim.e2e.ts`: assert terrain render markers, road/river disabled feedback, and normal placement still works.

Before editing, check:

```bash
git status --short
```

Expected: clean or only this plan file if it has not been committed yet. Preserve unrelated user changes if present.

---

### Task 1: Tile Feature Model and City Generation

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/city.ts`
- Modify: `src/lib/game/city.spec.ts`

- [ ] **Step 1: Write failing city feature tests**

Append these tests inside the existing `describe('city generation', () => { ... })` block in `src/lib/game/city.spec.ts`:

```ts
	test('adds deterministic road and river features to playable cities', () => {
		expect.assertions(8);
		const first = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const second = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const roadTiles = first.tiles.filter((tile) => tile.feature === 'road');
		const riverTiles = first.tiles.filter((tile) => tile.feature === 'river');

		expect(first).toEqual(second);
		expect(roadTiles.length).toBeGreaterThan(0);
		expect(riverTiles.length).toBeGreaterThan(0);
		expect(roadTiles.every((tile) => !tile.locked)).toBe(true);
		expect(riverTiles.every((tile) => !tile.locked)).toBe(true);
		expect(getTileById(first, 'harbor-city-10-1')?.feature).toBe('road');
		expect(getTileById(first, 'harbor-city-5-1')?.feature).toBe('river');
		expect(first.tiles.some((tile) => !tile.locked && tile.feature === null)).toBe(true);
	});

	test('returns placement block reasons for locked, road, and river tiles', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});

		expect(getTilePlacementBlockReason(getTileById(city, 'harbor-city-0-0')!)).toBe(
			'Locked location'
		);
		expect(getTilePlacementBlockReason(getTileById(city, 'harbor-city-10-1')!)).toBe(
			'Road location'
		);
		expect(getTilePlacementBlockReason(getTileById(city, 'harbor-city-5-1')!)).toBe(
			'River location'
		);
		expect(getTilePlacementBlockReason(city.tiles.find((tile) => !tile.locked && tile.feature === null)!)).toBeNull();
	});
```

Update the import in `src/lib/game/city.spec.ts`:

```ts
import {
	generateCity,
	getTileById,
	getTilePlacementBlockReason,
	getTilesByNeighborhood
} from './city';
```

- [ ] **Step 2: Run failing city tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/city.spec.ts
```

Expected: FAIL with TypeScript errors about `feature` and `getTilePlacementBlockReason`.

- [ ] **Step 3: Add the feature type**

In `src/lib/game/types.ts`, add this type near the other map type aliases:

```ts
export type CityTileFeature = 'road' | 'river' | null;
```

Add the field to `CityTile`:

```ts
export interface CityTile {
	id: string;
	cityId: string;
	x: number;
	y: number;
	neighborhood: NeighborhoodId;
	terrain: TerrainId;
	feature: CityTileFeature;
	demand: number;
	rent: number;
	footTraffic: number;
	customerFit: number;
	locked: boolean;
}
```

- [ ] **Step 4: Generate deterministic road and river features**

In `src/lib/game/city.ts`, update the type import:

```ts
import type { City, CityTile, CityTileFeature, NeighborhoodId, TerrainId } from './types';
```

Inside `generateCity`, compute `locked` and `feature` before pushing each tile:

```ts
			const locked = x === 0 || y === 0 || x === width - 1 || y === height - 1;
			const feature = getTileFeature(width, height, x, y, locked);

			tiles.push({
				id: `${input.id}-${x}-${y}`,
				cityId: input.id,
				x,
				y,
				neighborhood: profile.id,
				terrain: profile.terrain,
				feature,
				demand: clamp(profile.demand + randomInt(rng, -10, 10), 20, 100),
				rent: clamp(profile.rent + randomInt(rng, -180, 180), 400, 2600),
				footTraffic: clamp(profile.footTraffic + randomInt(rng, -12, 12), 20, 100),
				customerFit: clamp(profile.customerFit + randomInt(rng, -10, 10), 20, 100),
				locked
			});
```

Add these helpers above `getNeighborhood`:

```ts
export function getTilePlacementBlockReason(tile: CityTile): string | null {
	if (tile.locked) {
		return 'Locked location';
	}

	if (tile.feature === 'road') {
		return 'Road location';
	}

	if (tile.feature === 'river') {
		return 'River location';
	}

	return null;
}

export function isTileBuildable(tile: CityTile): boolean {
	return getTilePlacementBlockReason(tile) === null;
}

function getTileFeature(
	width: number,
	height: number,
	x: number,
	y: number,
	locked: boolean
): CityTileFeature {
	if (locked || width < 5 || height < 5) {
		return null;
	}

	const riverColumn = clampFeatureCoordinate(Math.floor(width * 0.28), width);
	const riverBendRow = clampFeatureCoordinate(Math.floor(height * 0.5), height);
	const riverX =
		y < riverBendRow ? riverColumn : clampFeatureCoordinate(riverColumn + 1, width);

	if (x === riverX) {
		return 'river';
	}

	const roadColumn = clampFeatureCoordinate(Math.floor(width * 0.5), width);
	const roadRow = clampFeatureCoordinate(Math.floor(height * 0.55), height);

	if (x === roadColumn || y === roadRow) {
		return 'road';
	}

	return null;
}

function clampFeatureCoordinate(value: number, size: number): number {
	if (size <= 2) {
		return 0;
	}

	return clamp(value, 1, size - 2);
}
```

- [ ] **Step 5: Run city tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/city.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/game/types.ts src/lib/game/city.ts src/lib/game/city.spec.ts
git commit -m "feat: add city terrain features"
```

---

### Task 2: Placement Blocking for Roads and Rivers

**Files:**
- Modify: `src/lib/game/placement.ts`
- Modify: `src/lib/game/placement.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Write failing placement tests**

Append these tests inside `src/lib/game/placement.spec.ts`:

```ts
	test('blocks founding a store on a road tile', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 101
		});
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;

		expect(() =>
			createFoundingGameAtTile({
				archetypeId: 'boutique',
				city,
				tileId: roadTile.id,
				seed: 101
			})
		).toThrow(`Road location: ${roadTile.id}`);
	});

	test('blocks founding a store on a river tile', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 101
		});
		const riverTile = city.tiles.find((tile) => tile.feature === 'river')!;

		expect(() =>
			createFoundingGameAtTile({
				archetypeId: 'grocery',
				city,
				tileId: riverTile.id,
				seed: 101
			})
		).toThrow(`River location: ${riverTile.id}`);
	});

	test('blocks expansion on road and river tiles', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find((tile) => !tile.locked && tile.feature === null)!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;
		const riverTile = city.tiles.find((tile) => tile.feature === 'river')!;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});

		const roadResult = openStoreAtTile(game, {
			tileId: roadTile.id,
			name: 'Road Store',
			archetypeId: 'boutique'
		});
		const riverResult = openStoreAtTile(game, {
			tileId: riverTile.id,
			name: 'River Store',
			archetypeId: 'grocery'
		});

		expect(roadResult.stores).toHaveLength(1);
		expect(roadResult.decisions.at(-1)?.context).toBe(
			'Road location blocks store placement. Choose another city tile.'
		);
		expect(riverResult.stores).toHaveLength(1);
		expect(riverResult.decisions.at(-1)?.context).toBe(
			'River location blocks store placement. Choose another city tile.'
		);
	});
```

- [ ] **Step 2: Write failing direct state test**

Append this test inside `src/lib/game/state.spec.ts`:

```ts
	test('direct store opening skips road and river tiles', () => {
		expect.assertions(3);
		const game = createNewGame('electronics', 44);

		const result = openStore(game, {
			name: 'Mall Kiosk',
			archetypeId: 'electronics',
			location: 'West Mall'
		});
		const openedTile = result.cities[0]?.tiles.find((tile) => tile.id === result.stores.at(-1)?.tileId);

		expect(result.stores).toHaveLength(2);
		expect(openedTile?.feature).toBeNull();
		expect(openedTile?.locked).toBe(false);
	});
```

- [ ] **Step 3: Run failing placement tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/placement.spec.ts src/lib/game/state.spec.ts
```

Expected: FAIL because placement helpers still allow road and river tiles.

- [ ] **Step 4: Update placement helpers**

In `src/lib/game/placement.ts`, update the city import:

```ts
import { getTileById, getTilePlacementBlockReason } from './city';
```

In `openStoreAtTile`, replace the unavailable check with:

```ts
	const tileBlockReason = tile ? getTilePlacementBlockReason(tile) : 'Location unavailable';

	if (
		!city ||
		!tile ||
		tileBlockReason ||
		game.stores.some((store) => store.tileId === input.tileId)
	) {
		return appendLocationUnavailableDecision(game, tileBlockReason);
	}
```

In `getAvailableTileOrThrow`, replace the locked check with:

```ts
	const blockReason = getTilePlacementBlockReason(tile);

	if (blockReason) {
		throw new Error(`${blockReason}: ${tileId}`);
	}
```

Change `appendLocationUnavailableDecision` and `locationUnavailableDecision` to accept the reason:

```ts
function appendLocationUnavailableDecision(
	game: GameState,
	reason: string | null = null
): GameState {
	const decision = locationUnavailableDecision(game, reason);

	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function locationUnavailableDecision(game: GameState, reason: string | null): DecisionItem {
	return {
		id: `location-unavailable-${game.day}`,
		title: 'Location unavailable',
		context: reason
			? `${reason} blocks store placement. Choose another city tile.`
			: 'Choose an unlocked, unoccupied city tile before opening this store.',
		expiresOnDay: game.day + 1,
		options: [
			{
				id: 'acknowledge',
				label: 'Acknowledge',
				description: 'Return to location planning.',
				effects: {}
			}
		]
	};
}
```

- [ ] **Step 5: Update direct state placement**

In `src/lib/game/state.ts`, update the city import:

```ts
import { generateCity, isTileBuildable } from './city';
```

Replace fallback tile selection in `createNewGame`:

```ts
	const fallbackTile = city.tiles.find(isTileBuildable) ?? city.tiles.find((tile) => !tile.locked) ?? city.tiles[0]!;
```

In `getExpansionTile`, replace the requested tile check:

```ts
		if (!requestedTile || !isTileBuildable(requestedTile) || isTileOccupied(game, requestedTile.id)) {
			return undefined;
		}
```

Replace the automatic fallback return:

```ts
	return city.tiles.find((tile) => isTileBuildable(tile) && !isTileOccupied(game, tile.id));
```

- [ ] **Step 6: Update route disabled reasons and founding guard**

In `src/routes/+page.svelte`, update the city import:

```ts
	import { generateCity, getTileById, getTilePlacementBlockReason } from '$lib/game/city';
```

Replace `getSelectedTileDisabledReason()` with:

```ts
	function getSelectedTileDisabledReason(): string | null {
		const currentGame: GameState | null = game;

		if (!selectedTile) {
			return 'Select a tile';
		}

		const tileBlockReason = getTilePlacementBlockReason(selectedTile);

		if (tileBlockReason) {
			return tileBlockReason;
		}

		if (selectedStore) {
			return 'Occupied location';
		}

		if (currentGame && currentGame.stores.length >= MAX_STORES) {
			return 'Store limit reached';
		}

		return null;
	}
```

In `foundStore`, replace the locked guard:

```ts
		if (!tile || getTilePlacementBlockReason(tile)) {
			return;
		}
```

- [ ] **Step 7: Run placement tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/placement.spec.ts src/lib/game/state.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/game/placement.ts src/lib/game/placement.spec.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/routes/+page.svelte
git commit -m "feat: block stores on road and river tiles"
```

---

### Task 3: Snapshot Metadata, Terrain Art Registry, and Assets

**Files:**
- Modify: `src/lib/game/mapRender.ts`
- Modify: `src/lib/game/mapRender.spec.ts`
- Modify: `src/lib/assets/gameArt.ts`
- Modify: `src/lib/assets/gameArt.spec.ts`
- Create: `static/assets/game/terrain/road-tile.png`
- Create: `static/assets/game/terrain/river-tile.png`
- Create: `static/assets/game/terrain/tree-decoration.png`

- [ ] **Step 1: Write failing map snapshot test**

In `src/lib/game/mapRender.spec.ts`, change the first test assertion count from `7` to `8` and add this assertion after the selected tile assertion:

```ts
		expect(snapshot.tiles.find((candidate) => candidate.feature === 'road')?.feature).toBe('road');
```

- [ ] **Step 2: Write failing terrain registry test**

In `src/lib/assets/gameArt.spec.ts`, update the import:

```ts
import {
	ARCHETYPE_STORE_ART,
	SHOP_STOREFRONT_ALT,
	SHOP_STOREFRONT_PATH,
	SHOP_STOREFRONT_TEXTURE_KEY,
	STORE_ART_LIST,
	TERRAIN_ART,
	TERRAIN_ART_LIST,
	getStoreArt,
	getTerrainArt
} from './gameArt';
```

Append this test inside `describe('game art asset constants', () => { ... })`:

```ts
	it('defines terrain art for road, river, and tree decoration', () => {
		const terrainIds = ['road', 'river', 'tree'] as const;

		expect(Object.keys(TERRAIN_ART).sort()).toEqual([...terrainIds].sort());
		expect(TERRAIN_ART_LIST).toHaveLength(terrainIds.length);

		for (const terrainId of terrainIds) {
			const art = getTerrainArt(terrainId);

			expect(art.id).toBe(terrainId);
			expect(art.path).toBe(`/assets/game/terrain/${terrainId === 'tree' ? 'tree-decoration' : `${terrainId}-tile`}.png`);
			expect(art.textureKey).toBe(`terrain-${terrainId}`);
			expect(existsSync(staticPath(art.path))).toBe(true);
		}
	});
```

- [ ] **Step 3: Run failing snapshot and registry tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/mapRender.spec.ts src/lib/assets/gameArt.spec.ts
```

Expected: FAIL because snapshot tiles and terrain art exports do not exist.

- [ ] **Step 4: Add snapshot feature metadata**

In `src/lib/game/mapRender.ts`, add `feature` to `CityMapTileRender`:

```ts
	feature: CityTile['feature'];
```

In `createTileRender`, add:

```ts
		feature: tile.feature ?? null,
```

- [ ] **Step 5: Add terrain art registry**

In `src/lib/assets/gameArt.ts`, add this after `StoreArt`:

```ts
export type TerrainArtId = 'road' | 'river' | 'tree';

export interface TerrainArt {
	id: TerrainArtId;
	path: string;
	textureKey: string;
	alt: string;
}
```

Add this after `SHOP_STOREFRONT_ALT`:

```ts
export const TERRAIN_ART: Readonly<Record<TerrainArtId, TerrainArt>> = Object.freeze({
	road: Object.freeze({
		id: 'road',
		path: '/assets/game/terrain/road-tile.png',
		textureKey: 'terrain-road',
		alt: 'Stylized city road terrain tile'
	}),
	river: Object.freeze({
		id: 'river',
		path: '/assets/game/terrain/river-tile.png',
		textureKey: 'terrain-river',
		alt: 'Stylized river terrain tile'
	}),
	tree: Object.freeze({
		id: 'tree',
		path: '/assets/game/terrain/tree-decoration.png',
		textureKey: 'terrain-tree',
		alt: 'Stylized tree decoration for green city tiles'
	})
});

export const TERRAIN_ART_LIST: readonly TerrainArt[] = Object.freeze(Object.values(TERRAIN_ART));
```

Add this helper after `getStoreArt`:

```ts
export function getTerrainArt(id: TerrainArtId): TerrainArt {
	return TERRAIN_ART[id];
}
```

- [ ] **Step 6: Create terrain PNG assets**

Generate three square PNG assets and save them to the exact paths below.

Path: `static/assets/game/terrain/road-tile.png`

Prompt:

```text
Stylized anime-inspired city road tile for a 2D strategy game, top-down square tile, asphalt road surface with subtle lane markings and soft edge shading, no text, no vehicles, clean game asset, crisp edges, readable at small size.
```

Path: `static/assets/game/terrain/river-tile.png`

Prompt:

```text
Stylized anime-inspired river water tile for a 2D strategy game, top-down square tile, bright blue water with gentle highlights and subtle current lines, no text, no boats, clean game asset, crisp edges, readable at small size.
```

Path: `static/assets/game/terrain/tree-decoration.png`

Prompt:

```text
Stylized anime-inspired tree decoration for a 2D strategy city map, single leafy tree cluster, transparent background, no text, no people, clean game asset, crisp edges, readable at small size.
```

- [ ] **Step 7: Run snapshot and registry tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/mapRender.spec.ts src/lib/assets/gameArt.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/game/mapRender.ts src/lib/game/mapRender.spec.ts src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts static/assets/game/terrain/road-tile.png static/assets/game/terrain/river-tile.png static/assets/game/terrain/tree-decoration.png
git commit -m "feat: add terrain art registry"
```

---

### Task 4: Phaser Terrain Rendering

**Files:**
- Modify: `src/lib/phaser/cityMapScene.ts`

- [ ] **Step 1: Write the intended canvas contract**

Before implementation, note the expected runtime canvas attributes for tests:

```text
data-terrain-asset-mode="image" when road and river feature textures render as sprites
data-terrain-feature-sprite-count="[number of road/river sprites]"
data-terrain-decoration-sprite-count="[number of tree sprites]"
```

- [ ] **Step 2: Update imports and constants**

In `src/lib/phaser/cityMapScene.ts`, replace the art import with:

```ts
import { STORE_ART_LIST, TERRAIN_ART, TERRAIN_ART_LIST, getStoreArt } from '../assets/gameArt';
```

Add depth and size constants near the existing depth constants:

```ts
const TERRAIN_FEATURE_DEPTH = 2;
const TERRAIN_DECORATION_DEPTH = 3;
const TERRAIN_FEATURE_SIZE = TILE_SIZE;
const TREE_DECORATION_SIZE = TILE_SIZE * 0.72;
```

- [ ] **Step 3: Add sprite storage**

Add this interface below `StoreSpriteRender`:

```ts
interface TerrainSpriteRender {
	sprite: Phaser.GameObjects.Image;
}
```

Add these fields inside `CityMapScene`:

```ts
	private terrainSprites: TerrainSpriteRender[] = [];
	private terrainFeatureSpriteCount = 0;
	private terrainDecorationSpriteCount = 0;
```

- [ ] **Step 4: Preload terrain textures**

In `preload()`, after the storefront loop, add:

```ts
		for (const art of TERRAIN_ART_LIST) {
			this.load.image(art.textureKey, asset(art.path));
		}
```

- [ ] **Step 5: Clear terrain sprites on rerender**

In `renderSnapshot()`, add this after `this.destroyStoreSprites();`:

```ts
		this.destroyTerrainSprites();
```

Add this after the tile loop and before `this.createStoreSprites();`:

```ts
		this.createTerrainSprites();
```

- [ ] **Step 6: Draw feature fallbacks**

At the end of `drawTile`, before the owned outline, add:

```ts
		this.drawTerrainFeatureFallback(tile, x, y);
```

Add this method below `drawTile`:

```ts
	private drawTerrainFeatureFallback(tile: CityMapTileRender, x: number, y: number): void {
		if (!this.mapGraphics || !tile.feature || this.hasTerrainTexture(tile.feature)) {
			return;
		}

		if (tile.feature === 'road') {
			this.mapGraphics.fillStyle(0x50545a, 0.92);
			this.mapGraphics.fillRect(x, y + TILE_SIZE * 0.32, TILE_SIZE, TILE_SIZE * 0.36);
			this.mapGraphics.lineStyle(1, 0xd7d2c3, 0.65);
			this.mapGraphics.lineBetween(x + 4, y + TILE_SIZE / 2, x + TILE_SIZE - 4, y + TILE_SIZE / 2);
			return;
		}

		if (tile.feature === 'river') {
			this.mapGraphics.fillStyle(0x3ca7d8, 0.92);
			this.mapGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
			this.mapGraphics.lineStyle(2, 0xb9ecff, 0.55);
			this.mapGraphics.lineBetween(x + 4, y + 8, x + TILE_SIZE - 4, y + TILE_SIZE - 8);
		}
	}
```

- [ ] **Step 7: Create terrain sprites**

Add these methods below `createStoreSprites()`:

```ts
	private createTerrainSprites(): void {
		if (!this.snapshot) {
			this.updateCanvasTerrainAttributes('fallback', 0, 0);
			return;
		}

		let featureSpriteCount = 0;
		let decorationSpriteCount = 0;

		for (const tile of this.snapshot.tiles) {
			if (tile.feature && this.hasTerrainTexture(tile.feature)) {
				this.terrainSprites.push({
					sprite: this.add
						.image(
							tile.x * TILE_SIZE + TILE_SIZE / 2,
							tile.y * TILE_SIZE + TILE_SIZE / 2,
							getTerrainTextureKey(tile.feature)
						)
						.setOrigin(0.5)
						.setDisplaySize(TERRAIN_FEATURE_SIZE, TERRAIN_FEATURE_SIZE)
						.setDepth(TERRAIN_FEATURE_DEPTH)
				});
				featureSpriteCount += 1;
			}

			if (this.shouldDrawTreeDecoration(tile) && this.textures.exists(TERRAIN_ART.tree.textureKey)) {
				this.terrainSprites.push({
					sprite: this.add
						.image(
							tile.x * TILE_SIZE + TILE_SIZE / 2,
							tile.y * TILE_SIZE + TILE_SIZE / 2,
							TERRAIN_ART.tree.textureKey
						)
						.setOrigin(0.5)
						.setDisplaySize(TREE_DECORATION_SIZE, TREE_DECORATION_SIZE)
						.setDepth(TERRAIN_DECORATION_DEPTH)
				});
				decorationSpriteCount += 1;
			}
		}

		this.terrainFeatureSpriteCount = featureSpriteCount;
		this.terrainDecorationSpriteCount = decorationSpriteCount;
		this.updateCanvasTerrainAttributes(
			featureSpriteCount > 0 ? 'image' : 'fallback',
			featureSpriteCount,
			decorationSpriteCount
		);
	}

	private shouldDrawTreeDecoration(tile: CityMapTileRender): boolean {
		return tile.feature === null && tile.terrain === 'green' && (tile.x + tile.y) % 3 === 0;
	}

	private hasTerrainTexture(feature: NonNullable<CityMapTileRender['feature']>): boolean {
		return this.textures.exists(getTerrainTextureKey(feature));
	}
```

Add this helper outside the class at the bottom of the file:

```ts
function getTerrainTextureKey(feature: NonNullable<CityMapTileRender['feature']>): string {
	return feature === 'road' ? TERRAIN_ART.road.textureKey : TERRAIN_ART.river.textureKey;
}
```

- [ ] **Step 8: Update and clear terrain canvas attributes**

Add this method near `updateCanvasStoreMarkerAttributes`:

```ts
	private updateCanvasTerrainAttributes(
		mode: 'fallback' | 'image',
		featureSpriteCount: number,
		decorationSpriteCount: number
	): void {
		const canvas = this.game?.canvas;

		if (!canvas) {
			return;
		}

		canvas.dataset.terrainAssetMode = mode;
		canvas.dataset.terrainFeatureSpriteCount = String(featureSpriteCount);
		canvas.dataset.terrainDecorationSpriteCount = String(decorationSpriteCount);
	}
```

Add this method near `destroyStoreSprites`:

```ts
	private destroyTerrainSprites(): void {
		for (const terrainSprite of this.terrainSprites) {
			terrainSprite.sprite.destroy();
		}

		this.terrainSprites = [];
		this.terrainFeatureSpriteCount = 0;
		this.terrainDecorationSpriteCount = 0;
		this.updateCanvasTerrainAttributes('fallback', 0, 0);
	}
```

In `destroySceneObjects()`, add:

```ts
		this.destroyTerrainSprites();
```

- [ ] **Step 9: Run focused TypeScript check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add src/lib/phaser/cityMapScene.ts
git commit -m "feat: render city terrain assets"
```

---

### Task 5: Svelte Feedback and Browser Tests

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Update TileInspector test fixtures**

In `src/lib/components/game/TileInspector.svelte.spec.ts`, add `feature: null,` to the `tile` fixture after `terrain: 'commercial',`.

- [ ] **Step 2: Write failing TileInspector feature tests**

Append these tests inside `describe('TileInspector opening choices', () => { ... })`:

```ts
	it('shows road placement feedback on a road tile', async () => {
		const roadTile: CityTile = { ...tile, feature: 'road' };
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'boutique', forecast: forecastFor('boutique'), disabledReason: 'Road location' }
		];

		renderInspector({ tile: roadTile, openingOptions, disabledReason: 'Road location' });

		await expect.element(page.getByText('Road')).toBeVisible();
		await expect.element(page.getByText('Road location')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Open Boutique Goods here/ })).toBeDisabled();
	});

	it('shows river placement feedback on a river tile', async () => {
		const riverTile: CityTile = { ...tile, feature: 'river' };
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'grocery', forecast: forecastFor('grocery'), disabledReason: 'River location' }
		];

		renderInspector({ tile: riverTile, openingOptions, disabledReason: 'River location' });

		await expect.element(page.getByText('River')).toBeVisible();
		await expect.element(page.getByText('River location')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Open Grocery Market here/ })).toBeDisabled();
	});
```

- [ ] **Step 3: Run failing TileInspector tests**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
```

Expected: FAIL because the feature label is not displayed yet.

- [ ] **Step 4: Display feature labels in TileInspector**

In `src/lib/components/game/TileInspector.svelte`, add this derived value near `storeArtSrc`:

```ts
	const tileLabel = $derived(tile?.feature ? label(tile.feature) : tile ? label(tile.terrain) : '');
```

Replace the heading badge:

```svelte
			<span>{tileLabel}</span>
```

Run the Svelte autofixer on the full updated `TileInspector.svelte` file and apply any returned fixes before continuing.

- [ ] **Step 5: Write failing Playwright terrain tests**

In `src/routes/retail-sim.e2e.ts`, add this helper near `clickMapTile`:

```ts
async function expectTerrainAssets(page: import('@playwright/test').Page) {
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toHaveAttribute('data-terrain-asset-mode', 'image');

	const featureCount = Number(await canvas.getAttribute('data-terrain-feature-sprite-count'));
	const decorationCount = Number(await canvas.getAttribute('data-terrain-decoration-sprite-count'));

	expect(featureCount).toBeGreaterThan(0);
	expect(decorationCount).toBeGreaterThan(0);
}
```

Add this test after the first map flow test:

```ts
test('city map renders terrain assets and blocks road and river placement', async ({ page }) => {
	await page.goto('/');

	await expectTerrainAssets(page);

	await clickMapTile(page, 10, 1);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	await expect(page.getByText(/road location/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /open .* here/i }).first()).toBeDisabled();
	await page.getByRole('button', { name: /close tile inspector/i }).click();

	await clickMapTile(page, 5, 1);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	await expect(page.getByText(/river location/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /open .* here/i }).first()).toBeDisabled();
});
```

- [ ] **Step 6: Run failing browser tests**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
bunx playwright test --grep "terrain assets"
```

Expected: TileInspector tests PASS after the component label change; Playwright FAIL until Phaser terrain attributes and route disabled reasons are all wired correctly.

- [ ] **Step 7: Run focused browser tests after fixes**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
bunx playwright test --grep "terrain assets|player can found a store from the city map|player can confirm a founding store from a narrow viewport|player expands from a selected city tile"
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/retail-sim.e2e.ts
git commit -m "test: cover terrain placement feedback"
```

---

### Task 6: Final Verification

**Files:**
- Verify all files changed by Tasks 1-5.

- [ ] **Step 1: Run formatting**

Run:

```bash
bun run format
```

Expected: command completes and may rewrite changed files.

- [ ] **Step 2: Run Svelte check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Run unit tests**

Run:

```bash
bun run test:unit -- --run
```

Expected: PASS.

- [ ] **Step 4: Run Playwright e2e tests**

Run:

```bash
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 5: Review final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intentional formatted changes remain unstaged.

- [ ] **Step 6: Commit final formatting or verification fixes**

If `bun run format` changed files after the previous task commits, run:

```bash
git add src static docs
git commit -m "chore: finalize terrain map formatting"
```

If `git status --short` is clean, do not create an empty commit.

- [ ] **Step 7: Capture evidence for handoff**

Record the exact passing commands in the final implementation summary:

```text
bun run check
bun run test:unit -- --run
bun run test:e2e
```
