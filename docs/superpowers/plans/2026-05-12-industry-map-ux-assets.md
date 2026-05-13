# Industry Map UX Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Industry City Map follow the same construction UX flow as the main city map and add generated image assets for industry terrain, resources, materials/products, and factory plants.

**Architecture:** Keep the game state transitions pure and unchanged. Put confirmation UX inside `IndustryTileInspector.svelte`, keep route state ownership in `src/routes/+page.svelte`, register art through `src/lib/assets/gameArt.ts`, render industry sprites in the Phaser snapshot scene, and verify the visible map/inspector flow through component, unit, and e2e tests.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 runes, Phaser 4, Tailwind v4, Bun, Vitest, Playwright, PNG assets under `static/assets/game/`.

---

## Requirements From Approved Design

- Industry construction mirrors the main city map:
  - Selecting an industry tile opens an inspector.
  - Clicking an available plant does not build immediately.
  - A confirmation modal appears with plant name, cost, recipe/output summary, and tile details.
  - Confirm builds the plant, autosaves through the existing route handler, and closes the inspector.
  - Cancel returns to the inspector without changing state.
- Asset scope is the full planned industry catalog:
  - Terrain: all `IndustryTerrainId` values.
  - Resources: all `IndustryResourceId` values.
  - Materials/products: all `MaterialId` values.
  - Factory plants: all `IndustrialBuildingTypeId` values.
- Visual style should match the current clean stylized game-art direction used by the retail storefront/product/terrain assets.
- Retail shops should still use warehouse-first refill with import fallback. This plan does not change simulation rules.

---

## Task 1: Add Industry Art Registry Contracts

**Files:**

- `src/lib/assets/gameArt.ts`
- `src/lib/assets/gameArt.spec.ts`

**Intent:** Establish typed, test-covered registries for all industry art before wiring rendering/UI.

**Steps:**

- [ ] In `src/lib/assets/gameArt.ts`, import the industry types:

```ts
import type {
	IndustrialBuildingTypeId,
	IndustryResourceId,
	IndustryTerrainId,
	MaterialId
} from '$lib/game/types';
```

- [ ] Add typed registries with stable path conventions:

```ts
export const INDUSTRY_TERRAIN_ART: Record<IndustryTerrainId, string> = {
	farmland: '/assets/game/industry/terrain/farmland-tile.png',
	forest: '/assets/game/industry/terrain/forest-tile.png',
	water: '/assets/game/industry/terrain/water-tile.png',
	deposit: '/assets/game/industry/terrain/deposit-tile.png',
	industrial: '/assets/game/industry/terrain/industrial-tile.png',
	blocked: '/assets/game/industry/terrain/blocked-tile.png'
};

export const INDUSTRY_RESOURCE_ART: Record<IndustryResourceId, string> = {
	'grain-field': '/assets/game/industry/resources/grain-field.png',
	'salt-deposit': '/assets/game/industry/resources/salt-deposit.png',
	'oilseed-field': '/assets/game/industry/resources/oilseed-field.png',
	'water-source': '/assets/game/industry/resources/water-source.png',
	'fruit-orchard': '/assets/game/industry/resources/fruit-orchard.png',
	'sugar-field': '/assets/game/industry/resources/sugar-field.png',
	'pulpwood-forest': '/assets/game/industry/resources/pulpwood-forest.png',
	'chemical-feedstock': '/assets/game/industry/resources/chemical-feedstock.png'
};

export const INDUSTRY_MATERIAL_ART: Record<MaterialId, string> = {
	grain: '/assets/game/industry/materials/grain.png',
	salt: '/assets/game/industry/materials/salt.png',
	oilseeds: '/assets/game/industry/materials/oilseeds.png',
	water: '/assets/game/industry/materials/water.png',
	fruit: '/assets/game/industry/materials/fruit.png',
	sugar: '/assets/game/industry/materials/sugar.png',
	pulpwood: '/assets/game/industry/materials/pulpwood.png',
	'chemical-feedstock': '/assets/game/industry/materials/chemical-feedstock.png',
	flour: '/assets/game/industry/materials/flour.png',
	'cooking-oil': '/assets/game/industry/materials/cooking-oil.png',
	'filtered-water': '/assets/game/industry/materials/filtered-water.png',
	syrup: '/assets/game/industry/materials/syrup.png',
	'paper-pulp': '/assets/game/industry/materials/paper-pulp.png',
	plastic: '/assets/game/industry/materials/plastic.png',
	packaging: '/assets/game/industry/materials/packaging.png',
	'cleaning-base': '/assets/game/industry/materials/cleaning-base.png',
	snacks: '/assets/game/industry/materials/snacks.png',
	drinks: '/assets/game/industry/materials/drinks.png',
	essentials: '/assets/game/industry/materials/essentials.png'
};

export const INDUSTRIAL_BUILDING_ART: Record<IndustrialBuildingTypeId, string> = {
	'grain-farm': '/assets/game/industry/buildings/grain-farm.png',
	'salt-mine': '/assets/game/industry/buildings/salt-mine.png',
	'oilseed-farm': '/assets/game/industry/buildings/oilseed-farm.png',
	'water-pump': '/assets/game/industry/buildings/water-pump.png',
	'fruit-farm': '/assets/game/industry/buildings/fruit-farm.png',
	'sugar-farm': '/assets/game/industry/buildings/sugar-farm.png',
	'pulpwood-grove': '/assets/game/industry/buildings/pulpwood-grove.png',
	'chemical-feedstock-well': '/assets/game/industry/buildings/chemical-feedstock-well.png',
	'flour-mill': '/assets/game/industry/buildings/flour-mill.png',
	'oil-press': '/assets/game/industry/buildings/oil-press.png',
	'water-filtration-plant': '/assets/game/industry/buildings/water-filtration-plant.png',
	'syrup-plant': '/assets/game/industry/buildings/syrup-plant.png',
	'pulp-mill': '/assets/game/industry/buildings/pulp-mill.png',
	'plastic-plant': '/assets/game/industry/buildings/plastic-plant.png',
	'packaging-plant': '/assets/game/industry/buildings/packaging-plant.png',
	'chemical-plant': '/assets/game/industry/buildings/chemical-plant.png',
	'snack-factory': '/assets/game/industry/buildings/snack-factory.png',
	'drink-bottling-plant': '/assets/game/industry/buildings/drink-bottling-plant.png',
	'household-goods-factory': '/assets/game/industry/buildings/household-goods-factory.png',
	warehouse: '/assets/game/industry/buildings/warehouse.png'
};
```

- [ ] Add sorted list exports for preload/test loops:

```ts
export const INDUSTRY_TERRAIN_ART_LIST = Object.values(INDUSTRY_TERRAIN_ART);
export const INDUSTRY_RESOURCE_ART_LIST = Object.values(INDUSTRY_RESOURCE_ART);
export const INDUSTRY_MATERIAL_ART_LIST = Object.values(INDUSTRY_MATERIAL_ART);
export const INDUSTRIAL_BUILDING_ART_LIST = Object.values(INDUSTRIAL_BUILDING_ART);
export const INDUSTRY_ART_LIST = [
	...INDUSTRY_TERRAIN_ART_LIST,
	...INDUSTRY_RESOURCE_ART_LIST,
	...INDUSTRY_MATERIAL_ART_LIST,
	...INDUSTRIAL_BUILDING_ART_LIST
];
```

- [ ] Add accessor helpers:

```ts
export function getIndustryTerrainArt(terrain: IndustryTerrainId): string {
	return INDUSTRY_TERRAIN_ART[terrain];
}

export function getIndustryResourceArt(resource: IndustryResourceId): string {
	return INDUSTRY_RESOURCE_ART[resource];
}

export function getIndustryMaterialArt(material: MaterialId): string {
	return INDUSTRY_MATERIAL_ART[material];
}

export function getIndustrialBuildingArt(buildingType: IndustrialBuildingTypeId): string {
	return INDUSTRIAL_BUILDING_ART[buildingType];
}
```

- [ ] In `src/lib/assets/gameArt.spec.ts`, extend imports to include the industry registries and lists.
- [ ] Add assertions for exact registry keys:

```ts
expect(Object.keys(INDUSTRY_TERRAIN_ART).sort()).toEqual([
	'blocked',
	'deposit',
	'farmland',
	'forest',
	'industrial',
	'water'
]);

expect(Object.keys(INDUSTRY_RESOURCE_ART).sort()).toEqual([
	'chemical-feedstock',
	'fruit-orchard',
	'grain-field',
	'oilseed-field',
	'pulpwood-forest',
	'salt-deposit',
	'sugar-field',
	'water-source'
]);

expect(Object.keys(INDUSTRY_MATERIAL_ART).sort()).toEqual([
	'chemical-feedstock',
	'cleaning-base',
	'cooking-oil',
	'drinks',
	'essentials',
	'filtered-water',
	'flour',
	'fruit',
	'grain',
	'oilseeds',
	'packaging',
	'paper-pulp',
	'plastic',
	'pulpwood',
	'salt',
	'snacks',
	'sugar',
	'syrup',
	'water'
]);

expect(Object.keys(INDUSTRIAL_BUILDING_ART).sort()).toEqual([
	'chemical-feedstock-well',
	'chemical-plant',
	'drink-bottling-plant',
	'flour-mill',
	'fruit-farm',
	'grain-farm',
	'household-goods-factory',
	'oil-press',
	'oilseed-farm',
	'packaging-plant',
	'plastic-plant',
	'pulp-mill',
	'pulpwood-grove',
	'salt-mine',
	'snack-factory',
	'sugar-farm',
	'syrup-plant',
	'warehouse',
	'water-filtration-plant',
	'water-pump'
]);
```

- [ ] Add image-file tests:
  - Industry terrain images must be `64x64`.
  - Industry resource images must be `96x96` and include transparent pixels.
  - Industry material images must be `96x96` and include transparent pixels.
  - Industry building images must be `96x96` and include transparent pixels.
- [ ] Run the targeted registry tests and confirm they fail before assets exist:

```bash
bun run test:unit -- src/lib/assets/gameArt.spec.ts --run
```

**Expected failure before Task 2:** Missing files under `static/assets/game/industry/**`.

---

## Task 2: Generate And Commit Industry PNG Assets

**Files:**

- `tools/generate_industry_assets.mjs`
- `static/assets/game/industry/terrain/*.png`
- `static/assets/game/industry/resources/*.png`
- `static/assets/game/industry/materials/*.png`
- `static/assets/game/industry/buildings/*.png`

**Intent:** Produce a full deterministic asset set that can be regenerated, reviewed, and verified by tests.

**Steps:**

- [ ] Create `tools/generate_industry_assets.mjs` using `pngjs` and Node `fs`.
- [ ] The script must create these directories with `mkdirSync(..., { recursive: true })`:

```js
const outputRoots = [
	'static/assets/game/industry/terrain',
	'static/assets/game/industry/resources',
	'static/assets/game/industry/materials',
	'static/assets/game/industry/buildings'
];
```

- [ ] Generate terrain as opaque `64x64` tiles with soft edge shading and small subject-specific detail:
  - `farmland-tile.png`: green field rows.
  - `forest-tile.png`: grass base with tree clusters.
  - `water-tile.png`: blue water with light wave strokes.
  - `deposit-tile.png`: rocky ground with ore/salt flecks.
  - `industrial-tile.png`: paved industrial yard with diagonal caution marks.
  - `blocked-tile.png`: muted rocky blocked tile with dark crosshatch.
- [ ] Generate resource icons as transparent `96x96` overlays:
  - `grain-field.png`: wheat stalk bundle.
  - `salt-deposit.png`: white salt crystal pile.
  - `oilseed-field.png`: yellow seed pod crop.
  - `water-source.png`: blue spring/well.
  - `fruit-orchard.png`: fruit tree with red/orange fruit.
  - `sugar-field.png`: cane stalk bundle.
  - `pulpwood-forest.png`: stacked logs.
  - `chemical-feedstock.png`: teal industrial barrel.
- [ ] Generate material/product icons as transparent `96x96` icons:
  - Raw inputs: `grain`, `salt`, `oilseeds`, `water`, `fruit`, `sugar`, `pulpwood`, `chemical-feedstock`.
  - Intermediate goods: `flour`, `cooking-oil`, `filtered-water`, `syrup`, `paper-pulp`, `plastic`, `packaging`, `cleaning-base`.
  - End products: `snacks`, `drinks`, `essentials`.
- [ ] Generate building icons as transparent `96x96` plant sprites:
  - Resource sites should be compact industrial/farm plants matching their source resource.
  - Intermediate plants should use a factory silhouette with one distinguishing icon or colored tank.
  - End-product plants should use larger factory silhouettes with product-colored accents.
  - `warehouse.png` should be a warehouse building with bay doors and pallet crates.
- [ ] Use this deterministic drawing structure, not random generation:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

function createPng(width, height, transparent = true) {
	const png = new PNG({ width, height });
	const background = transparent ? [0, 0, 0, 0] : [242, 236, 218, 255];
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) setPixel(png, x, y, background);
	}
	return png;
}

function savePng(path, png) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, PNG.sync.write(png));
}
```

- [ ] Include these drawing primitives in the script:
  - `setPixel(png, x, y, rgba)`
  - `rect(png, x, y, width, height, rgba)`
  - `circle(png, cx, cy, radius, rgba)`
  - `line(png, x0, y0, x1, y1, rgba)`
  - `diamond(png, cx, cy, radius, rgba)`
  - `roundedBuilding(png, x, y, width, height, body, roof, trim)`
  - `drawFactoryBase(png, palette)` for consistent factory silhouettes.
- [ ] Add asset manifests in the script with the same ids as Task 1, then loop over them and write the exact file names referenced by `gameArt.ts`.
- [ ] Run the generator:

```bash
bun tools/generate_industry_assets.mjs
```

- [ ] Re-run image registry tests and confirm they pass:

```bash
bun run test:unit -- src/lib/assets/gameArt.spec.ts --run
```

---

## Task 3: Render Image-Backed Industry Map

**Files:**

- `src/lib/phaser/industryMapScene.ts`
- `src/routes/retail-sim.e2e.ts`

**Intent:** Replace purely geometric industry map markers with registered sprites while keeping geometric fallback behavior for resilience.

**Steps:**

- [ ] Import asset helpers and SvelteKit path helper:

```ts
import { asset } from '$app/paths';
import {
	INDUSTRIAL_BUILDING_ART,
	INDUSTRIAL_BUILDING_ART_LIST,
	INDUSTRY_RESOURCE_ART,
	INDUSTRY_RESOURCE_ART_LIST,
	INDUSTRY_TERRAIN_ART,
	INDUSTRY_TERRAIN_ART_LIST
} from '$lib/assets/gameArt';
```

- [ ] Add texture-key helpers:

```ts
function industryTextureKey(path: string): string {
	return `industry:${path}`;
}

function preloadIndustryAsset(scene: Phaser.Scene, path: string): void {
	const key = industryTextureKey(path);
	if (!scene.textures.exists(key)) {
		scene.load.image(key, asset(path));
	}
}
```

- [ ] Add `preload()` to load every terrain, resource, and building image:

```ts
preload(): void {
	for (const path of [
		...INDUSTRY_TERRAIN_ART_LIST,
		...INDUSTRY_RESOURCE_ART_LIST,
		...INDUSTRIAL_BUILDING_ART_LIST
	]) {
		preloadIndustryAsset(this, path);
	}
}
```

- [ ] Track sprite objects separately from fallback graphics:

```ts
private terrainSprites: Phaser.GameObjects.Image[] = [];
private resourceSprites: Phaser.GameObjects.Image[] = [];
private buildingSprites: Phaser.GameObjects.Image[] = [];
```

- [ ] Extend `clearRenderedMap()` to destroy all industry image arrays.
- [ ] In `drawTile`, prefer a terrain sprite:
  - Get path from `INDUSTRY_TERRAIN_ART[tile.terrain]`.
  - If `this.textures.exists(industryTextureKey(path))`, add image at tile center and set `displayWidth/displayHeight = TILE_SIZE`.
  - Add the image to `terrainSprites`.
  - Keep the existing fill/line fallback when the texture is unavailable.
- [ ] In `drawResourceMarker`, prefer resource image:
  - Path from `INDUSTRY_RESOURCE_ART[tile.resource.resourceId]`.
  - Display as `22x22` to preserve map density.
  - Keep existing geometric marker fallback.
- [ ] In `drawBuildingMarker`, prefer building image:
  - Path from `INDUSTRIAL_BUILDING_ART[building.typeId]`.
  - Display as `28x28`.
  - If `building.status === 'idle'`, apply a muted tint or alpha; otherwise normal.
  - Keep construction-stage fallback for missing textures.
- [ ] Preserve existing text labels and selection outline.
- [ ] Add canvas data attributes in `syncCanvasDataset()`:

```ts
canvas.dataset.industryTerrainAssetMode =
	this.terrainSprites.length === snapshot.city.tiles.length ? 'image' : 'fallback';
canvas.dataset.industryTerrainSpriteCount = String(this.terrainSprites.length);
canvas.dataset.industryResourceSpriteCount = String(this.resourceSprites.length);
canvas.dataset.industryBuildingSpriteCount = String(this.buildingSprites.length);
```

- [ ] Update or add e2e waits in `src/routes/retail-sim.e2e.ts` to assert the industry canvas settles with image-backed terrain:

```ts
await expect(canvas).toHaveAttribute('data-industry-terrain-asset-mode', 'image');
await expect(canvas).toHaveAttribute('data-industry-terrain-sprite-count', '400');
```

---

## Task 4: Mirror Main-City Confirmation UX In Industry Inspector

**Files:**

- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- `src/routes/+page.svelte`

**Intent:** Make industry construction use the same open-inspector, choose-option, confirm, build, close flow as retail construction.

**Mandatory Svelte MCP Workflow:**

- [ ] Before modifying Svelte files, call `tool_search` for the Svelte MCP tools if they are not already available.
- [ ] Call `list-sections`.
- [ ] Call `get-documentation` for all relevant sections covering Svelte 5 runes, event handling, conditional rendering, and component state.
- [ ] After editing each Svelte file, run `svelte-autofixer` on the changed snippets until it reports no issues.

**Implementation steps:**

- [ ] In `IndustryTileInspector.svelte`, import art helpers:

```ts
import { getIndustrialBuildingArt, getIndustryMaterialArt } from '$lib/assets/gameArt';
```

- [ ] Add local pending-confirm state:

```ts
let pendingBuilding = $state<IndustrialBuildingType | null>(null);
let pendingTileId = $state<string | null>(null);
```

- [ ] Replace immediate `build(type.id)` behavior with:

```ts
function chooseBuilding(type: IndustrialBuildingType): void {
	if (!tile) return;
	pendingBuilding = type;
	pendingTileId = tile.id;
}

function cancelBuild(): void {
	pendingBuilding = null;
	pendingTileId = null;
}

function confirmBuild(): void {
	if (!pendingBuilding || !pendingTileId) return;
	onBuild(pendingBuilding.id, pendingTileId);
	cancelBuild();
	onClose();
}
```

- [ ] Reset pending confirmation when the selected tile changes:

```svelte
$effect(() => {
	tile?.id;
	cancelBuild();
});
```

- [ ] Update the available-building list:
  - Show `getIndustrialBuildingArt(type.id)` as a `32x32` icon in each option.
  - Preserve current cost/capacity/recipe text.
  - Button label should use plant name and an action such as `Plan`.
  - Disable only when the same existing affordability/buildability constraints already apply.
- [ ] Add a confirmation modal when `pendingBuilding` is set:
  - Use the same visual and interaction pattern as `TileInspector.svelte`.
  - Include plant icon, name, cost, tile type, and recipe summary.
  - Include `Cancel` and `Confirm build`.
  - Add `{@attach industryModalBlocker}` if the component already uses the map-blocking attachment pattern, matching the retail inspector behavior.
- [ ] In the warehouse/current-production sections, show `getIndustryMaterialArt(materialId)` thumbnails next to material labels. Keep text quantities for scanability.
- [ ] Do not change `src/routes/+page.svelte` unless the current `buildIndustryAtTile` route handler prevents the inspector from closing after `onClose()`. The desired behavior is: inspector component calls `onBuild`, route mutates/autosaves, inspector component calls `onClose`.

**Component tests:**

- [ ] Add or update `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`.
- [ ] Test that clicking a build option opens the confirm modal and does not call `onBuild`.
- [ ] Test that cancel closes the modal and does not call `onBuild`.
- [ ] Test that confirm calls `onBuild(typeId, tileId)` exactly once and then calls `onClose`.
- [ ] Test that material/building images are present with non-empty `src` attributes.
- [ ] Run:

```bash
bun run test:unit -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run --project client
```

---

## Task 5: Update Industry E2E Construction Flow

**Files:**

- `src/routes/retail-sim.e2e.ts`

**Intent:** Keep end-to-end coverage aligned with the new confirmation flow and visible asset-backed map.

**Steps:**

- [ ] Find the existing helper that builds an industry building by clicking a direct plant button.
- [ ] Update it to:
  - Select the industry tile.
  - Click the desired plant option.
  - Assert a confirmation modal appears.
  - Click `Confirm build`.
  - Assert the inspector closes.
- [ ] Keep the existing coverage that production reaches retail through warehouse-first refill with import fallback.
- [ ] Add an assertion after opening the industry map:

```ts
await expect(industryCanvas).toHaveAttribute('data-industry-terrain-asset-mode', 'image');
await expect(industryCanvas).toHaveAttribute('data-industry-terrain-sprite-count', '400');
```

- [ ] Add an assertion after building a plant:

```ts
await expect(industryCanvas).toHaveAttribute('data-industry-building-sprite-count', /[1-9]\d*/);
```

- [ ] Run the focused e2e:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "industry"
```

---

## Task 6: Full Verification And Browser Check

**Intent:** Prove the feature works in code, renderer, and the local app.

**Steps:**

- [ ] Run Svelte/type checks:

```bash
bun run check
```

- [ ] Run focused unit tests:

```bash
bun run test:unit -- src/lib/assets/gameArt.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run
```

- [ ] Run focused e2e:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "industry"
```

- [ ] Start or reuse the Vite dev server:

```bash
bun run dev -- --host 127.0.0.1
```

- [ ] Open the app at the active Vite URL in the in-app browser.
- [ ] Manually verify:
  - Industry map terrain uses image tiles.
  - Selecting an industry tile opens the inspector.
  - Plant options show images.
  - Clicking a plant opens confirmation instead of building immediately.
  - Cancel returns to inspector.
  - Confirm builds, closes inspector, and the plant appears on the industry map.
  - Warehouse/current-production rows show material/product icons.

---

## Risk Notes

- Phaser loading is asynchronous. Use existing scene lifecycle and dataset waits rather than assuming textures are immediately available.
- Svelte 5 runes mode is forced. Do not introduce legacy reactive declarations.
- Keep image paths under `static/assets/game/industry/**`; public URLs must omit the `static` segment.
- Do not alter production-chain/refill rules while adding UI/art. Existing warehouse-first import fallback behavior is part of the accepted design.
- The existing `gameArt.spec.ts` has exact registry checks for retail terrain and product art. Add separate industry registries so retail tests remain stable.

---

## Commit Plan

- Commit 1: `Add industry art registries and generated assets`
- Commit 2: `Render industry map with image assets`
- Commit 3: `Add industry build confirmation flow`
- Commit 4: `Update industry e2e for asset-backed construction`

Commit boundaries can be combined if the implementation is small, but each commit must leave tests passing for the changed area.
