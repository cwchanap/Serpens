# Shop Art Asset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and integrate the first anime-style shop art asset so owned stores appear as real storefront art on the Phaser city map and in the selected-store inspector.

**Architecture:** Keep the shop art as a presentation concern. A small asset constants module defines the browser-served static path and alt text, Phaser uses that path to load a texture for map sprites, and Svelte uses the same path through `$app/paths.asset` for the inspector image. The simulation state and city/store logic remain unchanged.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Phaser, Vitest browser component tests, Playwright e2e, bun.

---

## File Structure

- Create: `static/assets/game/shops/anime-storefront.png`
  - Generated anime-style storefront image. Served by SvelteKit from `/assets/game/shops/anime-storefront.png`.
- Create: `src/lib/assets/gameArt.ts`
  - Presentation-only constants for shop asset path, texture key, and alt text.
- Create: `src/lib/assets/gameArt.spec.ts`
  - Unit coverage for the asset constants.
- Create: `src/lib/components/game/TileInspector.svelte.spec.ts`
  - Browser component tests for store inspector image rendering.
- Modify: `src/lib/components/game/TileInspector.svelte`
  - Renders the shop image only when the selected tile has an owned store.
- Modify: `src/lib/phaser/cityMapScene.ts`
  - Loads the shop texture, renders owned stores as image sprites, keeps the orange marker fallback, and exposes canvas `data-store-*` attributes for e2e verification.
- Modify: `src/routes/retail-sim.e2e.ts`
  - Verifies that founding a store produces an image-backed store marker and inspector art.

## Svelte Documentation Used

Before editing Svelte code, use the Svelte MCP server:

- `list-sections`
- `get-documentation` for `kit/images`, `kit/$app-paths`, `svelte/$props`, `svelte/if`, `svelte/basic-markup`, `svelte/scoped-styles`, and `svelte/testing`

Use `svelte-autofixer` on `TileInspector.svelte` after editing it, with `desired_svelte_version: "5.55.2"` and `filename: "TileInspector.svelte"`. Repeat until the tool returns no issues or suggestions.

---

### Task 1: Asset File and URL Contract

**Files:**

- Create: `static/assets/game/shops/anime-storefront.png`
- Create: `src/lib/assets/gameArt.ts`
- Create: `src/lib/assets/gameArt.spec.ts`

- [ ] **Step 1: Write the failing asset constants test**

Create `src/lib/assets/gameArt.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	SHOP_STOREFRONT_ALT,
	SHOP_STOREFRONT_PATH,
	SHOP_STOREFRONT_TEXTURE_KEY
} from './gameArt';

describe('game art asset constants', () => {
	it('defines the first shop storefront asset contract', () => {
		expect(SHOP_STOREFRONT_PATH).toBe('/assets/game/shops/anime-storefront.png');
		expect(SHOP_STOREFRONT_TEXTURE_KEY).toBe('shop-storefront');
		expect(SHOP_STOREFRONT_ALT).toBe('Anime-style storefront for an owned shop');
	});
});
```

- [ ] **Step 2: Run the asset constants test to verify it fails**

Run:

```bash
bun run test:unit -- --run src/lib/assets/gameArt.spec.ts
```

Expected: FAIL because `src/lib/assets/gameArt.ts` does not exist.

- [ ] **Step 3: Generate the shop image asset**

Use the image generation tool with this prompt:

```text
Anime-style small retail shop storefront for a management simulation game, friendly cozy modern storefront, colorful awning, warm interior window light, clean readable silhouette, three-quarter front view, no readable text or logos, centered subject, transparent or simple light background, high contrast edges, suitable for use as both a map sprite and inspector artwork, 1024x1024.
```

Save the generated PNG as:

```text
static/assets/game/shops/anime-storefront.png
```

Acceptance checks:

```bash
ls -lh static/assets/game/shops/anime-storefront.png
file static/assets/game/shops/anime-storefront.png
```

Expected: the file exists and `file` reports a PNG image.

- [ ] **Step 4: Add the asset constants module**

Create `src/lib/assets/gameArt.ts`:

```ts
export const SHOP_STOREFRONT_PATH = '/assets/game/shops/anime-storefront.png';
export const SHOP_STOREFRONT_TEXTURE_KEY = 'shop-storefront';
export const SHOP_STOREFRONT_ALT = 'Anime-style storefront for an owned shop';
```

- [ ] **Step 5: Run the asset constants test to verify it passes**

Run:

```bash
bun run test:unit -- --run src/lib/assets/gameArt.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the asset contract**

Run:

```bash
git add static/assets/game/shops/anime-storefront.png src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts
git commit -m "feat: add shop art asset contract"
```

---

### Task 2: Store Inspector Artwork

**Files:**

- Create: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/TileInspector.svelte`

- [ ] **Step 1: Write the failing browser component test**

Create `src/lib/components/game/TileInspector.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TileInspector from './TileInspector.svelte';
import { SHOP_STOREFRONT_ALT } from '$lib/assets/gameArt';
import type { ArchetypeId, CityTile, OpeningForecast, Store } from '$lib/game/types';

const tile: CityTile = {
	id: 'harbor-city-1-1',
	cityId: 'harbor-city',
	x: 1,
	y: 1,
	neighborhood: 'downtown',
	terrain: 'commercial',
	demand: 72,
	rent: 190,
	footTraffic: 76,
	customerFit: 70,
	locked: false
};

const store: Store = {
	id: 'store-1',
	name: 'Founding Store',
	archetypeId: 'convenience',
	location: 'Downtown (1, 1)',
	cityId: 'harbor-city',
	tileId: tile.id,
	mapX: 1,
	mapY: 1,
	daysOpen: 0,
	reputation: 50,
	stockHealth: 80,
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60
};

function renderInspector(overrides: Partial<{
	tile: CityTile | null;
	store: Store | null;
	forecast: OpeningForecast | null;
	recommendations: ArchetypeId[];
	gameStarted: boolean;
	canOpenStore: boolean;
	disabledReason: string | null;
}> = {}) {
	render(TileInspector, {
		tile,
		store: null,
		forecast: null,
		recommendations: [],
		gameStarted: true,
		canOpenStore: true,
		disabledReason: null,
		onFoundStore: vi.fn(),
		onOpenStore: vi.fn(),
		onClose: vi.fn(),
		...overrides
	});
}

describe('TileInspector storefront art', () => {
	it('does not show storefront art for an empty selected tile', async () => {
		renderInspector({ store: null });

		await expect
			.element(page.getByRole('img', { name: SHOP_STOREFRONT_ALT }))
			.not.toBeInTheDocument();
	});

	it('shows storefront art for an owned store tile', async () => {
		renderInspector({ store });

		const image = page.getByRole('img', { name: SHOP_STOREFRONT_ALT });
		await expect.element(image).toBeVisible();
		await expect.element(image).toHaveAttribute(
			'src',
			/\/assets\/game\/shops\/anime-storefront\.png$/
		);
	});
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
```

Expected: FAIL because `TileInspector.svelte` does not render the storefront image.

- [ ] **Step 3: Add static asset URL imports to the inspector**

Modify the top of `src/lib/components/game/TileInspector.svelte` so the script imports the asset helper:

```svelte
<script lang="ts">
	import { asset } from '$app/paths';
	import { SHOP_STOREFRONT_ALT, SHOP_STOREFRONT_PATH } from '$lib/assets/gameArt';
	import { getArchetype } from '$lib/game/archetypes';
	import type { ArchetypeId, CityTile, OpeningForecast, Store } from '$lib/game/types';
```

Add this constant after `let { ... }: Props = $props();`:

```svelte
	const shopStorefrontSrc = asset(SHOP_STOREFRONT_PATH);
```

- [ ] **Step 4: Render the artwork inside the store details section**

In `src/lib/components/game/TileInspector.svelte`, inside:

```svelte
{#if store}
	<section aria-label="Store details">
```

insert this block before the store heading:

```svelte
				<div class="store-art">
					<img
						src={shopStorefrontSrc}
						alt={SHOP_STOREFRONT_ALT}
						width="1024"
						height="1024"
						loading="lazy"
						decoding="async"
					/>
				</div>
```

- [ ] **Step 5: Add scoped artwork styles**

Add these styles inside the existing `<style>` block in `src/lib/components/game/TileInspector.svelte`:

```css
	.store-art {
		aspect-ratio: 16 / 11;
		overflow: hidden;
		border: 1px solid #3f4a42;
		border-radius: 8px;
		background: #111814;
	}

	.store-art img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
```

- [ ] **Step 6: Run the Svelte autofixer**

Call `mcp__svelte__.svelte_autofixer` with the complete current contents of `src/lib/components/game/TileInspector.svelte` in the `code` field:

```json
{
	"filename": "TileInspector.svelte",
	"desired_svelte_version": "5.55.2"
}
```

Expected: no issues or suggestions. If the tool returns a concrete replacement, edit `src/lib/components/game/TileInspector.svelte` exactly as directed and run the autofixer again.

- [ ] **Step 7: Run the component test to verify it passes**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the inspector artwork**

Run:

```bash
git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts
git commit -m "feat: show shop art in store inspector"
```

---

### Task 3: Phaser Storefront Sprites

**Files:**

- Modify: `src/lib/phaser/cityMapScene.ts`
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Write the failing e2e assertions**

In `src/routes/retail-sim.e2e.ts`, update the first test after the founding-store click:

```ts
	await page
		.getByRole('button', { name: /open .* here/i })
		.first()
		.click();

	const mapCanvas = page.locator('.map-canvas canvas');
	await expect(mapCanvas).toHaveAttribute('data-store-marker-mode', 'image');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');
	await expect(
		page.getByRole('img', { name: /anime-style storefront for an owned shop/i })
	).toBeVisible();
```

- [ ] **Step 2: Run the focused e2e test to verify it fails**

Run:

```bash
bunx playwright test src/routes/retail-sim.e2e.ts --grep "player can found a store"
```

Expected: FAIL because the canvas does not yet expose `data-store-marker-mode="image"` and Phaser does not render image sprites.

- [ ] **Step 3: Add Phaser asset imports and sprite metadata**

At the top of `src/lib/phaser/cityMapScene.ts`, add imports:

```ts
import { asset } from '$app/paths';
import { SHOP_STOREFRONT_PATH, SHOP_STOREFRONT_TEXTURE_KEY } from '../assets/gameArt';
```

Add constants and a sprite metadata interface after the existing constants:

```ts
const SHOP_STOREFRONT_URL = asset(SHOP_STOREFRONT_PATH);
const TERRAIN_DEPTH = 0;
const STORE_MARKER_DEPTH = 10;
const OUTLINE_DEPTH = 20;

interface StoreSpriteRender {
	sprite: Phaser.GameObjects.Image;
	baseX: number;
	baseY: number;
	index: number;
}
```

- [ ] **Step 4: Add scene state for store sprites**

Inside `CityMapScene`, add this field with the other private fields:

```ts
	private storeSprites: StoreSpriteRender[] = [];
```

- [ ] **Step 5: Load the shop texture**

Add this method to `CityMapScene`:

```ts
	preload(): void {
		this.load.image(SHOP_STOREFRONT_TEXTURE_KEY, SHOP_STOREFRONT_URL);
	}
```

- [ ] **Step 6: Set explicit rendering depths**

Replace the first three graphics lines in `create()`:

```ts
		this.mapGraphics = this.add.graphics();
		this.outlineGraphics = this.add.graphics();
		this.markerGraphics = this.add.graphics();
```

with:

```ts
		this.mapGraphics = this.add.graphics().setDepth(TERRAIN_DEPTH);
		this.markerGraphics = this.add.graphics().setDepth(STORE_MARKER_DEPTH);
		this.outlineGraphics = this.add.graphics().setDepth(OUTLINE_DEPTH);
```

- [ ] **Step 7: Rebuild sprites when the snapshot changes**

In `renderSnapshot()`, replace the body after `this.setCameraBounds();` with this sequence:

```ts
		this.destroyStoreSprites();

		for (const tile of this.snapshot.tiles) {
			this.drawTile(tile);
			this.createTileZone(tile);
		}

		this.createStoreSprites();
		this.drawInteractionOutlines();
		this.drawStoreMarkers(0);
```

- [ ] **Step 8: Add sprite creation, fallback detection, and canvas test attributes**

Add these methods to `CityMapScene`:

```ts
	private createStoreSprites(): void {
		if (!this.snapshot || !this.hasStorefrontTexture()) {
			this.updateCanvasStoreMarkerAttributes('fallback', 0);
			return;
		}

		this.snapshot.stores.forEach((store, index) => {
			const baseX = store.x * TILE_SIZE + TILE_SIZE / 2;
			const baseY = store.y * TILE_SIZE + TILE_SIZE / 2 + 4;
			const sprite = this.add
				.image(baseX, baseY, SHOP_STOREFRONT_TEXTURE_KEY)
				.setOrigin(0.5, 0.82)
				.setDisplaySize(TILE_SIZE * 1.35, TILE_SIZE * 1.35)
				.setDepth(STORE_MARKER_DEPTH);

			this.storeSprites.push({ sprite, baseX, baseY, index });
		});

		this.updateCanvasStoreMarkerAttributes('image', this.storeSprites.length);
	}

	private hasStorefrontTexture(): boolean {
		return this.textures.exists(SHOP_STOREFRONT_TEXTURE_KEY);
	}

	private updateCanvasStoreMarkerAttributes(mode: 'image' | 'fallback', count: number): void {
		this.game.canvas.dataset.storeMarkerMode = mode;
		this.game.canvas.dataset.storeSpriteCount = String(count);
	}

	private destroyStoreSprites(): void {
		for (const storeSprite of this.storeSprites) {
			storeSprite.sprite.destroy();
		}

		this.storeSprites = [];
	}
```

- [ ] **Step 9: Update marker animation to animate sprites or draw fallback circles**

Replace `drawStoreMarkers(time: number): void` with:

```ts
	private drawStoreMarkers(time: number): void {
		if (!this.markerGraphics || !this.snapshot) {
			return;
		}

		this.markerGraphics.clear();

		if (this.storeSprites.length > 0) {
			for (const storeSprite of this.storeSprites) {
				storeSprite.sprite.setPosition(
					storeSprite.baseX,
					storeSprite.baseY + Math.sin(time / 350 + storeSprite.index) * 2
				);
			}

			return;
		}

		this.snapshot.stores.forEach((store, index) => {
			const x = store.x * TILE_SIZE + TILE_SIZE / 2;
			const y = store.y * TILE_SIZE + TILE_SIZE / 2 + Math.sin(time / 350 + index) * 2;

			this.markerGraphics?.fillStyle(0x0f172a, 0.24);
			this.markerGraphics?.fillCircle(x + 2, y + 3, 8);
			this.markerGraphics?.fillStyle(0xf97316, 1);
			this.markerGraphics?.fillCircle(x, y, 7);
			this.markerGraphics?.lineStyle(2, 0xffffff, 0.95);
			this.markerGraphics?.strokeCircle(x, y, 7);
		});
	}
```

- [ ] **Step 10: Destroy sprites during scene shutdown**

At the start of `destroySceneObjects()`, add:

```ts
		this.destroyStoreSprites();
```

- [ ] **Step 11: Run the focused e2e test to verify it passes**

Run:

```bash
bunx playwright test src/routes/retail-sim.e2e.ts --grep "player can found a store"
```

Expected: PASS.

- [ ] **Step 12: Commit the Phaser sprite integration**

Run:

```bash
git add src/lib/phaser/cityMapScene.ts src/routes/retail-sim.e2e.ts
git commit -m "feat: render shop art on city map"
```

---

### Task 4: Full Verification

**Files:**

- Verify: all changed files

- [ ] **Step 1: Run Svelte and TypeScript checks**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 2: Run lint and formatting checks**

Run:

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 3: Run all unit and browser component tests**

Run:

```bash
bun run test:unit -- --run
```

Expected: PASS.

- [ ] **Step 4: Run all e2e tests**

Run:

```bash
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 5: Start the local dev server for manual review**

Run:

```bash
bun run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`. Open the URL and verify:

- Founding a store shows the generated shop image in the inspector.
- The owned store appears as a storefront sprite on the map.
- Hover and selected outlines remain visible.
- Drag/pan and wheel zoom still work.

- [ ] **Step 6: Commit verification fixes if needed**

If checks required code changes, run:

```bash
git add src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/lib/phaser/cityMapScene.ts src/routes/retail-sim.e2e.ts
git commit -m "fix: polish shop art integration"
```

If no code changes were needed after Task 3, do not create an empty commit.
