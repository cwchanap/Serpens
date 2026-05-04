# Store Type Art and Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store creation requires a selected store type, and each store type renders with its own storefront image in the inspector and on the city map.

**Architecture:** Add a typed storefront art registry keyed by `ArchetypeId`, pass `archetypeId` through placement/state/map render data, and render type selection buttons for both founding and expansion flows. Preserve the existing image sizing changes already present in `TileInspector.svelte` and `cityMapScene.ts`.

**Tech Stack:** Svelte 5, SvelteKit, TypeScript, Phaser, Bun, Vitest browser tests, Playwright e2e tests.

---

## File Structure

- Modify `src/lib/assets/gameArt.ts`: own all storefront art metadata and lookup helpers.
- Modify `src/lib/assets/gameArt.spec.ts`: verify art registry coverage and static files.
- Add `static/assets/game/shops/boutique-storefront.png`: boutique storefront asset.
- Add `static/assets/game/shops/electronics-storefront.png`: electronics storefront asset.
- Add `static/assets/game/shops/grocery-storefront.png`: grocery storefront asset.
- Keep `static/assets/game/shops/anime-storefront.png`: use as the convenience storefront asset.
- Modify `src/lib/game/types.ts`: add `archetypeId` to `CityMapStoreRender` dependencies and add `OpeningOption`.
- Modify `src/lib/game/state.ts`: require `archetypeId` when opening an expansion store.
- Modify `src/lib/game/state.spec.ts`: update direct `openStore` calls to provide a type.
- Modify `src/lib/game/placement.ts`: return all archetypes by tile fit and pass selected type into expansion creation.
- Modify `src/lib/game/placement.spec.ts`: verify selected expansion type and selected-type setup cost.
- Modify `src/lib/game/mapRender.ts`: include store archetype in the serializable map snapshot.
- Modify `src/lib/game/mapRender.spec.ts`: verify snapshot store archetype.
- Modify `src/lib/phaser/cityMapScene.ts`: preload every store art texture and choose the texture per store.
- Modify `src/lib/components/game/TileInspector.svelte`: render per-type opening buttons and per-type store art.
- Modify `src/lib/components/game/TileInspector.svelte.spec.ts`: verify per-type art and opening buttons.
- Modify `src/routes/+page.svelte`: build opening options for the selected tile and route selected types into founding/expansion handlers.
- Modify `src/routes/retail-sim.e2e.ts`: verify type choice is required and expansion can choose a different type.

Before editing, check:

```bash
git status --short
```

Expected: `src/lib/components/game/TileInspector.svelte` and `src/lib/phaser/cityMapScene.ts` may already be modified from the storefront sizing fix. Preserve those changes.

---

### Task 1: Storefront Art Registry and Assets

**Files:**
- Modify: `src/lib/assets/gameArt.ts`
- Modify: `src/lib/assets/gameArt.spec.ts`
- Create: `static/assets/game/shops/boutique-storefront.png`
- Create: `static/assets/game/shops/electronics-storefront.png`
- Create: `static/assets/game/shops/grocery-storefront.png`

- [ ] **Step 1: Generate the three missing storefront images**

Use the image generation tool three times with square PNG output. Use these prompts:

```text
Anime-style boutique storefront for a cozy fashion and gifts shop, front-facing isometric game asset, readable shop facade, distinctive fabric awning, display windows with apparel and gift boxes, warm accent colors, clean solid transparent-looking light background with no checkerboard pattern, no text, no people, crisp edges, suitable for a tile-based strategy game.
```

```text
Anime-style electronics and games storefront, front-facing isometric game asset, neon blue accent lighting, display windows with devices and game boxes, modern sign shape with no readable text, clean solid transparent-looking light background with no checkerboard pattern, no people, crisp edges, suitable for a tile-based strategy game.
```

```text
Anime-style grocery market storefront, front-facing isometric game asset, produce crates, green awning, welcoming neighborhood market facade, clean solid transparent-looking light background with no checkerboard pattern, no text, no people, crisp edges, suitable for a tile-based strategy game.
```

Save the generated PNGs to:

```text
static/assets/game/shops/boutique-storefront.png
static/assets/game/shops/electronics-storefront.png
static/assets/game/shops/grocery-storefront.png
```

- [ ] **Step 2: Write the failing art registry test**

Replace `src/lib/assets/gameArt.spec.ts` with:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_STORE_ART, STORE_ART_LIST, getStoreArt } from './gameArt';
import type { ArchetypeId } from '$lib/game/types';

const archetypeIds: ArchetypeId[] = ['convenience', 'boutique', 'electronics', 'grocery'];

function staticPath(assetPath: string): string {
	return join(process.cwd(), 'static', assetPath.replace(/^\//, ''));
}

describe('game art asset constants', () => {
	it('defines storefront art for every store archetype', () => {
		expect(Object.keys(ARCHETYPE_STORE_ART).sort()).toEqual([...archetypeIds].sort());
		expect(STORE_ART_LIST).toHaveLength(archetypeIds.length);

		for (const archetypeId of archetypeIds) {
			const art = getStoreArt(archetypeId);

			expect(art.archetypeId).toBe(archetypeId);
			expect(art.path).toMatch(/^\/assets\/game\/shops\/.+\.png$/);
			expect(art.textureKey).toBe(`shop-storefront-${archetypeId}`);
			expect(art.alt.toLowerCase()).toContain(archetypeId === 'electronics' ? 'electronics' : archetypeId);
			expect(existsSync(staticPath(art.path))).toBe(true);
		}
	});
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
bun run test:unit -- --run src/lib/assets/gameArt.spec.ts
```

Expected: FAIL because `ARCHETYPE_STORE_ART`, `STORE_ART_LIST`, and `getStoreArt` do not exist.

- [ ] **Step 4: Implement the art registry**

Replace `src/lib/assets/gameArt.ts` with:

```ts
import type { ArchetypeId } from '$lib/game/types';

export interface StoreArt {
	archetypeId: ArchetypeId;
	path: string;
	textureKey: string;
	alt: string;
}

export const ARCHETYPE_STORE_ART: Readonly<Record<ArchetypeId, StoreArt>> = Object.freeze({
	convenience: Object.freeze({
		archetypeId: 'convenience',
		path: '/assets/game/shops/anime-storefront.png',
		textureKey: 'shop-storefront-convenience',
		alt: 'Anime-style convenience storefront for an owned shop'
	}),
	boutique: Object.freeze({
		archetypeId: 'boutique',
		path: '/assets/game/shops/boutique-storefront.png',
		textureKey: 'shop-storefront-boutique',
		alt: 'Anime-style boutique storefront for an owned shop'
	}),
	electronics: Object.freeze({
		archetypeId: 'electronics',
		path: '/assets/game/shops/electronics-storefront.png',
		textureKey: 'shop-storefront-electronics',
		alt: 'Anime-style electronics and games storefront for an owned shop'
	}),
	grocery: Object.freeze({
		archetypeId: 'grocery',
		path: '/assets/game/shops/grocery-storefront.png',
		textureKey: 'shop-storefront-grocery',
		alt: 'Anime-style grocery market storefront for an owned shop'
	})
});

export const STORE_ART_LIST: readonly StoreArt[] = Object.freeze(
	Object.values(ARCHETYPE_STORE_ART)
);

export function getStoreArt(archetypeId: ArchetypeId): StoreArt {
	return ARCHETYPE_STORE_ART[archetypeId];
}
```

- [ ] **Step 5: Verify the art registry**

Run:

```bash
bun run test:unit -- --run src/lib/assets/gameArt.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts static/assets/game/shops/boutique-storefront.png static/assets/game/shops/electronics-storefront.png static/assets/game/shops/grocery-storefront.png
git commit -m "feat: add store type art registry"
```

---

### Task 2: Selected Store Type in State and Placement

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/placement.ts`
- Modify: `src/lib/game/placement.spec.ts`

- [ ] **Step 1: Write the failing placement test**

In `src/lib/game/placement.spec.ts`, replace the test named `deducts the forecast setup cost when opening at a tile` with:

```ts
	test('deducts the chosen archetype setup cost when opening at a tile', () => {
		expect.assertions(5);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find((candidate) => !candidate.locked)!;
		const expansionTile = city.tiles.find(
			(candidate) => !candidate.locked && candidate.id !== foundingTile.id
		)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'electronics',
			city,
			tileId: foundingTile.id,
			seed: 202
		});
		const forecast = forecastOpening(expansionTile, 'grocery');

		const result = openStoreAtTile(game, {
			tileId: expansionTile.id,
			name: 'Expansion Store',
			archetypeId: 'grocery'
		});

		expect(result.stores).toHaveLength(2);
		expect(result.cash).toBe(game.cash - forecast.setupCost);
		expect(result.stores.at(-1)?.archetypeId).toBe('grocery');
		expect(result.stores.at(-1)?.tileId).toBe(expansionTile.id);
		expect(result.decisions).toHaveLength(0);
	});
```

Add this test below `recommends archetypes from selected tile traits`:

```ts
	test('returns all archetypes sorted by selected tile fit', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const tile = city.tiles.find((candidate) => candidate.neighborhood === 'campus')!;

		const recommendations = getRecommendedArchetypes(tile);

		expect(recommendations).toHaveLength(4);
		expect(recommendations[0]).toBe('electronics');
	});
```

- [ ] **Step 2: Run the failing placement test**

Run:

```bash
bun run test:unit -- --run src/lib/game/placement.spec.ts
```

Expected: FAIL because `openStoreAtTile` does not accept `archetypeId`, and `getRecommendedArchetypes` returns only three types.

- [ ] **Step 3: Add the opening option type**

In `src/lib/game/types.ts`, add this interface after `OpeningForecast`:

```ts
export interface OpeningOption {
	archetypeId: ArchetypeId;
	forecast: OpeningForecast;
	disabledReason: string | null;
}
```

- [ ] **Step 4: Require archetype when opening stores**

In `src/lib/game/state.ts`, replace `OpenStoreInput` with:

```ts
interface OpenStoreInput {
	name: string;
	location: string;
	archetypeId: ArchetypeId;
	tileId?: string;
}
```

In `openStore`, replace:

```ts
	const archetypeId = game.stores[0]?.archetypeId ?? 'convenience';
	const tile = getExpansionTile(game, input.tileId);
```

with:

```ts
	const archetypeId = input.archetypeId;
	const tile = getExpansionTile(game, input.tileId);
```

- [ ] **Step 5: Update direct state tests to pass a type**

In `src/lib/game/state.spec.ts`, update `opens stores up to the local chain limit` to pass the founding type:

```ts
		const second = openStore(game, {
			name: 'Mall Kiosk',
			location: 'West Mall',
			archetypeId: 'electronics'
		});
		const third = openStore(second, {
			name: 'Campus Shop',
			location: 'North Campus',
			archetypeId: 'electronics'
		});
		const fourth = openStore(third, {
			name: 'Airport Shop',
			location: 'Airport',
			archetypeId: 'electronics'
		});
```

Update `direct store opening uses a map tile in the active city`:

```ts
		const result = openStore(game, {
			name: 'Mall Kiosk',
			location: 'West Mall',
			archetypeId: 'electronics'
		});
```

Update `does not duplicate same-day blocked expansion decisions`:

```ts
		const second = openStore(game, {
			name: 'Mall Kiosk',
			location: 'West Mall',
			archetypeId: 'electronics'
		});
		const third = openStore(second, {
			name: 'Campus Shop',
			location: 'North Campus',
			archetypeId: 'electronics'
		});
		const fourth = openStore(third, {
			name: 'Airport Shop',
			location: 'Airport',
			archetypeId: 'electronics'
		});
		const fifth = openStore(fourth, {
			name: 'Station Shop',
			location: 'Station',
			archetypeId: 'electronics'
		});
```

- [ ] **Step 6: Pass selected type through placement**

In `src/lib/game/placement.ts`, change `getRecommendedArchetypes` by removing the `.slice(0, 3)` call:

```ts
export function getRecommendedArchetypes(tile: CityTile): ArchetypeId[] {
	return ARCHETYPES.map((archetype) => ({
		id: archetype.id,
		score: scoreTileForArchetype(tile, archetype.id)
	}))
		.sort((left, right) => right.score - left.score)
		.map((recommendation) => recommendation.id);
}
```

Change the `openStoreAtTile` input type:

```ts
export function openStoreAtTile(
	game: GameState,
	input: { tileId: string; name: string; archetypeId: ArchetypeId }
): GameState {
```

Add `archetypeId` to the `openStore` call:

```ts
	const expanded = openStore(game, {
		name: input.name,
		location: formatLocation(tile),
		archetypeId: input.archetypeId,
		tileId: tile.id
	});
```

- [ ] **Step 7: Update occupied tile test call**

In `src/lib/game/placement.spec.ts`, change the occupied tile call to:

```ts
const result = openStoreAtTile(game, {
	tileId: tile.id,
	name: 'Duplicate Store',
	archetypeId: 'boutique'
});
```

- [ ] **Step 8: Verify state and placement**

Run:

```bash
bun run test:unit -- --run src/lib/game/state.spec.ts src/lib/game/placement.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/placement.ts src/lib/game/placement.spec.ts
git commit -m "feat: choose store type for openings"
```

---

### Task 3: Store Type in Map Snapshot and Phaser Rendering

**Files:**
- Modify: `src/lib/game/mapRender.ts`
- Modify: `src/lib/game/mapRender.spec.ts`
- Modify: `src/lib/phaser/cityMapScene.ts`

- [ ] **Step 1: Write the failing map snapshot test**

In `src/lib/game/mapRender.spec.ts`, change `expect.assertions(7);` to:

```ts
expect.assertions(8);
```

Add this assertion after `expect(snapshot.stores).toHaveLength(1);`:

```ts
expect(snapshot.stores[0]?.archetypeId).toBe('convenience');
```

- [ ] **Step 2: Run the failing map render test**

Run:

```bash
bun run test:unit -- --run src/lib/game/mapRender.spec.ts
```

Expected: FAIL because `CityMapStoreRender` does not include `archetypeId`.

- [ ] **Step 3: Add archetype to map render data**

In `src/lib/game/mapRender.ts`, update imports:

```ts
import type { ArchetypeId, CityTile, GameState, Store } from './types';
```

Add `archetypeId` to `CityMapStoreRender`:

```ts
export interface CityMapStoreRender {
	id: string;
	name: string;
	archetypeId: ArchetypeId;
	tileId: string;
	x: number;
	y: number;
}
```

Add `archetypeId` in `createStoreRender`:

```ts
function createStoreRender(store: Store): CityMapStoreRender {
	return {
		id: store.id,
		name: store.name,
		archetypeId: store.archetypeId,
		tileId: store.tileId,
		x: store.mapX,
		y: store.mapY
	};
}
```

- [ ] **Step 4: Update Phaser imports and preload**

In `src/lib/phaser/cityMapScene.ts`, replace:

```ts
import { SHOP_STOREFRONT_PATH, SHOP_STOREFRONT_TEXTURE_KEY } from '../assets/gameArt';
```

with:

```ts
import { STORE_ART_LIST, getStoreArt } from '../assets/gameArt';
```

Remove:

```ts
const SHOP_STOREFRONT_URL = asset(SHOP_STOREFRONT_PATH);
```

Replace `preload()` with:

```ts
	preload(): void {
		for (const art of STORE_ART_LIST) {
			this.load.image(art.textureKey, asset(art.path));
		}
	}
```

- [ ] **Step 5: Render sprites with per-store textures**

In `src/lib/phaser/cityMapScene.ts`, replace `createStoreSprites` with:

```ts
	private createStoreSprites(): void {
		if (!this.snapshot) {
			this.updateCanvasStoreMarkerAttributes('circle', 0);
			return;
		}

		const canRenderStorefronts = this.snapshot.stores.every((store) =>
			this.hasStorefrontTexture(getStoreArt(store.archetypeId).textureKey)
		);

		if (!canRenderStorefronts) {
			this.updateCanvasStoreMarkerAttributes('circle', 0);
			return;
		}

		this.storeSprites = this.snapshot.stores.map((store, index) => {
			const baseX = store.x * TILE_SIZE + TILE_SIZE / 2;
			const baseY = store.y * TILE_SIZE + TILE_SIZE / 2;
			const art = getStoreArt(store.archetypeId);
			const sprite = this.add
				.image(baseX, baseY, art.textureKey)
				.setOrigin(0.5)
				.setDisplaySize(STORE_SPRITE_SIZE, STORE_SPRITE_SIZE)
				.setDepth(STORE_MARKER_DEPTH);

			return {
				sprite,
				baseX,
				baseY,
				index
			};
		});

		this.updateCanvasStoreMarkerAttributes(
			this.storeSprites.length > 0 ? 'image' : 'circle',
			this.storeSprites.length
		);
	}
```

Replace `hasStorefrontTexture` with:

```ts
	private hasStorefrontTexture(textureKey: string): boolean {
		return this.textures.exists(textureKey);
	}
```

- [ ] **Step 6: Verify map render and typecheck**

Run:

```bash
bun run test:unit -- --run src/lib/game/mapRender.spec.ts
bun run check
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/mapRender.ts src/lib/game/mapRender.spec.ts src/lib/phaser/cityMapScene.ts
git commit -m "feat: render store type art on map"
```

---

### Task 4: Type-Specific Tile Inspector UI

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`

- [ ] **Step 1: Write failing inspector tests**

In `src/lib/components/game/TileInspector.svelte.spec.ts`, replace the game art import with:

```ts
import { getStoreArt } from '$lib/assets/gameArt';
```

Add `OpeningOption` to the type import:

```ts
import type { ArchetypeId, CityTile, OpeningForecast, OpeningOption, Store } from '$lib/game/types';
```

In `renderInspector`, replace `forecast` and `recommendations` overrides with `openingOptions`:

```ts
		openingOptions: OpeningOption[];
```

Set the default props to:

```ts
		openingOptions: [],
```

Remove `forecast` and `recommendations` from the default props.

Replace the storefront art tests with:

```ts
describe('TileInspector storefront art', () => {
	it('does not show storefront art for an empty selected tile', async () => {
		const convenienceArt = getStoreArt('convenience');
		renderInspector({ store: null });

		await expect
			.element(page.getByRole('img', { name: convenienceArt.alt }))
			.not.toBeInTheDocument();
	});

	it('shows storefront art for the owned store archetype', async () => {
		const electronicsStore: Store = { ...store, archetypeId: 'electronics' };
		const electronicsArt = getStoreArt('electronics');
		renderInspector({ store: electronicsStore });

		const image = page.getByRole('img', { name: electronicsArt.alt });
		await expect.element(image).toBeVisible();
		await expect.element(image).toHaveAttribute('src', electronicsArt.path);
	});
});
```

Add this test:

```ts
describe('TileInspector opening choices', () => {
	it('shows one opening button per store type on an empty tile', async () => {
		const onOpenStore = vi.fn();
		const openingOptions: OpeningOption[] = [
			{
				archetypeId: 'electronics',
				forecast: forecastFor('electronics'),
				disabledReason: null
			},
			{
				archetypeId: 'boutique',
				forecast: forecastFor('boutique'),
				disabledReason: null
			},
			{
				archetypeId: 'convenience',
				forecast: forecastFor('convenience'),
				disabledReason: null
			},
			{
				archetypeId: 'grocery',
				forecast: forecastFor('grocery'),
				disabledReason: 'Requires 12,000 cash'
			}
		];

		renderInspector({
			store: null,
			gameStarted: true,
			openingOptions,
			onOpenStore
		});

		await expect.element(page.getByRole('button', { name: /open electronics & games here/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /open boutique goods here/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /open convenience store here/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /open grocery market here/i })).toBeDisabled();

		await page.getByRole('button', { name: /open electronics & games here/i }).click();

		expect(onOpenStore).toHaveBeenCalledWith('electronics');
	});
});
```

Add this helper above the tests:

```ts
function forecastFor(archetypeId: ArchetypeId): OpeningForecast {
	const offset = ['convenience', 'boutique', 'electronics', 'grocery'].indexOf(archetypeId) + 1;

	return {
		tileId: tile.id,
		setupCost: 10_000 + offset * 500,
		projectedDailyRevenue: 1_000 + offset * 100,
		projectedDailyRent: tile.rent,
		demandScore: 70,
		customerFit: 75,
		risks: []
	};
}
```

- [ ] **Step 2: Run the failing inspector test**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
```

Expected: FAIL because the component still expects `forecast`, `recommendations`, a generic `onOpenStore`, and a single shared art asset.

- [ ] **Step 3: Update TileInspector props and derived art**

In `src/lib/components/game/TileInspector.svelte`, replace the imports:

```svelte
	import { asset } from '$app/paths';
	import { SHOP_STOREFRONT_ALT, SHOP_STOREFRONT_PATH } from '$lib/assets/gameArt';
	import { getArchetype } from '$lib/game/archetypes';
	import type { ArchetypeId, CityTile, OpeningForecast, Store } from '$lib/game/types';
```

with:

```svelte
	import { asset } from '$app/paths';
	import { getStoreArt } from '$lib/assets/gameArt';
	import { getArchetype } from '$lib/game/archetypes';
	import type { ArchetypeId, CityTile, OpeningOption, Store } from '$lib/game/types';
```

Replace the props interface with:

```svelte
	interface Props {
		tile: CityTile | null;
		store: Store | null;
		openingOptions: OpeningOption[];
		gameStarted: boolean;
		disabledReason: string | null;
		onFoundStore: (archetypeId: ArchetypeId) => void;
		onOpenStore: (archetypeId: ArchetypeId) => void;
		onClose: () => void;
	}
```

Update prop destructuring:

```svelte
	let {
		tile,
		store,
		openingOptions,
		gameStarted,
		disabledReason,
		onFoundStore,
		onOpenStore,
		onClose
	}: Props = $props();
```

Replace `const shopStorefrontSrc = asset(SHOP_STOREFRONT_PATH);` with:

```svelte
	const storeArt = $derived(store ? getStoreArt(store.archetypeId) : null);
	const storeArtSrc = $derived(storeArt ? asset(storeArt.path) : '');
```

- [ ] **Step 4: Render type-specific store art**

In the store details section, replace the image block with:

```svelte
				{#if storeArt}
					<div class="store-art">
						<img
							src={storeArtSrc}
							alt={storeArt.alt}
							width="1024"
							height="1024"
							loading="lazy"
							decoding="async"
						/>
					</div>
				{/if}
```

Keep the existing `.store-art` and `.store-art img` CSS sizing rules.

- [ ] **Step 5: Render opening choices instead of the generic expansion button**

Replace the `Recommended archetypes` section and the `Expansion action` section for empty tiles with this single section:

```svelte
			{#if !tile.locked}
				<section aria-label="Store type choices">
					<h3>Store type</h3>
					<div class="actions store-type-actions">
						{#each openingOptions as option (option.archetypeId)}
							{@const archetype = getArchetype(option.archetypeId)}
							<button
								type="button"
								disabled={option.disabledReason !== null}
								onclick={() =>
									gameStarted
										? onOpenStore(option.archetypeId)
										: onFoundStore(option.archetypeId)}
							>
								<span>Open {archetype.name} here</span>
								<small>
									Setup {currency.format(option.forecast.setupCost)} · Revenue {currency.format(
										option.forecast.projectedDailyRevenue
									)}/day
								</small>
							</button>
						{/each}
					</div>
					{#each openingOptions as option (option.archetypeId)}
						{#if option.disabledReason}
							<p class="disabled-copy">{option.disabledReason}</p>
						{/if}
					{/each}
				</section>
			{:else}
				<section aria-label="Expansion action">
					<p class="disabled-copy">Locked location</p>
				</section>
			{/if}
```

In the occupied store branch, remove the disabled `Open store here` button. Keep a concise disabled copy:

```svelte
			{#if gameStarted && disabledReason}
				<section aria-label="Expansion action">
					<p class="disabled-copy">{disabledReason ?? defaultDisabledReason}</p>
				</section>
			{/if}
```

- [ ] **Step 6: Style stacked button content**

Add this CSS near `.actions` styles:

```svelte
	.store-type-actions button {
		display: grid;
		gap: 0.25rem;
		text-align: left;
	}

	.store-type-actions small {
		color: #b8b3a7;
		font-size: 0.72rem;
		line-height: 1.2;
	}
```

- [ ] **Step 7: Run Svelte autofixer**

Use the Svelte MCP `svelte-autofixer` on `TileInspector.svelte`. If it reports issues, patch them and call it again until there are no issues or suggestions.

- [ ] **Step 8: Verify inspector**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
bun run check
```

Expected: both commands PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts
git commit -m "feat: choose store type in inspector"
```

---

### Task 5: Route Wiring and End-to-End Flow

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Write failing e2e expectations**

In `src/routes/retail-sim.e2e.ts`, update the founding test after tile click:

```ts
	await expect(page.getByText(/store type/i)).toBeVisible();
	await expect(page.locator('.map-canvas canvas')).toHaveAttribute('data-store-sprite-count', '0');
	await page.getByRole('button', { name: /open boutique goods here/i }).click();
```

Replace the shared storefront image assertion with:

```ts
	await expect(
		page.getByRole('img', { name: /anime-style boutique storefront for an owned shop/i })
	).toBeVisible();
```

In `player expands from a selected city tile`, replace the expansion click:

```ts
	await expect(page.getByText(/store type/i)).toBeVisible();
	await page.getByRole('button', { name: /open electronics & games here/i }).click();
```

Add this assertion after the store details heading assertion:

```ts
	await expect(
		page.getByRole('img', { name: /anime-style electronics and games storefront for an owned shop/i })
	).toBeVisible();
```

- [ ] **Step 2: Run the failing e2e file**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: FAIL because route props and handlers still use the old generic expansion flow.

- [ ] **Step 3: Build opening options in the route**

In `src/routes/+page.svelte`, update the type import:

```svelte
	import type { ArchetypeId, CompanyPolicy, GameState, OpeningOption } from '$lib/game/types';
```

Remove the old `forecast`, `expansionSetupCost`, `openStoreDisabledReason`, and `canOpenStore` derived values. Add:

```svelte
	let recommendations = $derived(selectedTile ? getRecommendedArchetypes(selectedTile) : []);
	let openingOptions = $derived.by<OpeningOption[]>(() => {
		const tile = selectedTile;

		if (!tile) {
			return [];
		}

		return recommendations.map((archetypeId) => {
			const optionForecast = forecastOpening(tile, archetypeId);

			return {
				archetypeId,
				forecast: optionForecast,
				disabledReason: getOpenStoreDisabledReason(optionForecast.setupCost)
			};
		});
	});
	let selectedTileDisabledReason = $derived(getSelectedTileDisabledReason());
```

Add these helper functions below `selectTile`:

```svelte
	function getSelectedTileDisabledReason(): string | null {
		const currentGame: GameState | null = game;

		if (!selectedTile) {
			return 'Select a tile';
		}

		if (selectedTile.locked) {
			return 'Locked location';
		}

		if (selectedStore) {
			return 'Occupied location';
		}

		if (currentGame && currentGame.stores.length >= MAX_STORES) {
			return 'Store limit reached';
		}

		return null;
	}

	function getOpenStoreDisabledReason(setupCost: number): string | null {
		const tileReason = getSelectedTileDisabledReason();
		const currentGame: GameState | null = game;

		if (tileReason) {
			return tileReason;
		}

		if (currentGame && currentGame.cash < setupCost) {
			return `Requires ${setupCost.toLocaleString('en-US')} cash`;
		}

		return null;
	}
```

- [ ] **Step 4: Route selected type into expansion creation**

In `src/routes/+page.svelte`, replace `addStoreAtSelectedTile` with:

```svelte
	function addStoreAtSelectedTile(archetypeId: ArchetypeId) {
		if (!game || !selectedTileId) {
			return;
		}

		const next = game.stores.length + 1;
		game = openStoreAtTile(game, {
			tileId: selectedTileId,
			name: `Store #${next}`,
			archetypeId
		});
	}
```

Update the `TileInspector` props:

```svelte
				<TileInspector
					tile={selectedTile}
					store={selectedStore}
					{openingOptions}
					gameStarted={game !== null}
					disabledReason={selectedTileDisabledReason}
					onFoundStore={foundStore}
					onOpenStore={addStoreAtSelectedTile}
					onClose={closeInspector}
				/>
```

- [ ] **Step 5: Update any remaining old API calls**

Run:

```bash
rg -n "forecast=|recommendations=|canOpenStore|openStoreAtTile\\(|openStore\\(" src
```

Expected: every `openStoreAtTile` and `openStore` call includes `archetypeId`, and no `TileInspector` usage passes `forecast`, `recommendations`, or `canOpenStore`.

- [ ] **Step 6: Run Svelte autofixer**

Use the Svelte MCP `svelte-autofixer` on `+page.svelte`. If it reports issues, patch them and call it again until there are no issues or suggestions.

- [ ] **Step 7: Verify e2e route flow**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat: require store type before placement"
```

---

### Task 6: Full Verification and Browser Check

**Files:**
- No planned code changes unless verification finds a concrete defect.

- [ ] **Step 1: Run focused formatting check**

Run:

```bash
./node_modules/.bin/prettier --check src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts src/lib/game/types.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/placement.ts src/lib/game/placement.spec.ts src/lib/game/mapRender.ts src/lib/game/mapRender.spec.ts src/lib/phaser/cityMapScene.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/+page.svelte src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

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

- [ ] **Step 4: Run e2e tests**

Run:

```bash
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 5: Verify in the in-app browser**

If the dev server is not running, start it:

```bash
bun run dev -- --host 127.0.0.1
```

Use the in-app browser at `http://127.0.0.1:5173/` and verify:

- Clicking a tile opens the inspector with store type choices and does not create a store.
- Clicking `Open Boutique Goods here` creates the first store with boutique art.
- Clicking another empty tile shows store type choices again.
- Clicking `Open Electronics & Games here` creates a second store with electronics art.
- The small map sprites fit inside their tiles.
- The large inspector preview stays constrained to the existing `22rem` by `14rem` sizing.

- [ ] **Step 6: Commit verification fixes if any were made**

If Step 1-5 required code edits, commit only those edits:

```bash
git add src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts src/lib/game/types.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/placement.ts src/lib/game/placement.spec.ts src/lib/game/mapRender.ts src/lib/game/mapRender.spec.ts src/lib/phaser/cityMapScene.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/+page.svelte src/routes/retail-sim.e2e.ts static/assets/game/shops/boutique-storefront.png static/assets/game/shops/electronics-storefront.png static/assets/game/shops/grocery-storefront.png
git commit -m "fix: polish store type opening flow"
```

If no files changed, do not create a commit.
