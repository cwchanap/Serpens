# Product Image Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transparent `96x96` product category images to the Stock tab in selected shop details.

**Architecture:** Keep product images as static presentation assets under `static/assets/game/products/`. Register them in `src/lib/assets/gameArt.ts`, then have `StoreStockTable.svelte` resolve each product row image from the registry with SvelteKit's `asset(...)`. No game-state, save-codec, simulation, or report schema changes are part of this slice.

**Tech Stack:** TypeScript, SvelteKit, Svelte 5 runes, `$app/paths.asset`, Bun, Vitest browser/server projects, `pngjs` asset validation, built-in image generation plus local chroma-key removal for transparent PNGs.

---

## File Structure

- Create `static/assets/game/products/snacks.png`: `96x96` transparent product icon for snacks.
- Create `static/assets/game/products/drinks.png`: `96x96` transparent product icon for drinks.
- Create `static/assets/game/products/essentials.png`: `96x96` transparent product icon for essentials.
- Create `static/assets/game/products/apparel.png`: `96x96` transparent product icon for apparel.
- Create `static/assets/game/products/home-goods.png`: `96x96` transparent product icon for home goods.
- Create `static/assets/game/products/gifts.png`: `96x96` transparent product icon for gifts.
- Create `static/assets/game/products/games.png`: `96x96` transparent product icon for games.
- Create `static/assets/game/products/accessories.png`: `96x96` transparent product icon for accessories.
- Create `static/assets/game/products/devices.png`: `96x96` transparent product icon for devices.
- Create `static/assets/game/products/produce.png`: `96x96` transparent product icon for produce.
- Create `static/assets/game/products/pantry.png`: `96x96` transparent product icon for pantry goods.
- Create `static/assets/game/products/prepared.png`: `96x96` transparent product icon for prepared food.
- Modify `src/lib/assets/gameArt.ts`: add the product art type, registry, list export, and lookup helper.
- Modify `src/lib/assets/gameArt.spec.ts`: verify category coverage, static file existence, dimensions, transparent pixels, and visible pixels.
- Modify `src/lib/components/game/StoreStockTable.svelte`: render a compact product image beside each category name.
- Modify `src/lib/components/game/StoreStockTable.svelte.spec.ts`: assert the stock row image renders and keeps existing stock controls intact.

Before editing, check:

```bash
git status --short
```

Expected: clean, or only unrelated user changes. Do not revert unrelated changes.

---

### Task 1: Generate Product Category PNG Assets

**Files:**

- Create: `static/assets/game/products/snacks.png`
- Create: `static/assets/game/products/drinks.png`
- Create: `static/assets/game/products/essentials.png`
- Create: `static/assets/game/products/apparel.png`
- Create: `static/assets/game/products/home-goods.png`
- Create: `static/assets/game/products/gifts.png`
- Create: `static/assets/game/products/games.png`
- Create: `static/assets/game/products/accessories.png`
- Create: `static/assets/game/products/devices.png`
- Create: `static/assets/game/products/produce.png`
- Create: `static/assets/game/products/pantry.png`
- Create: `static/assets/game/products/prepared.png`

- [ ] **Step 1: Create the product asset directory**

Run:

```bash
mkdir -p static/assets/game/products
```

Expected: `static/assets/game/products` exists.

- [ ] **Step 2: Generate chroma-key source images**

Use the built-in image generation tool once per category. Use the exact common prompt below and replace `[CATEGORY_ID]`, `[SUBJECT]`, and `[KEY_COLOR]`.

Common prompt:

```text
Use case: stylized-concept
Asset type: 96x96 game inventory product icon for the Serpens retail simulation Stock tab
Primary request: Create a small, readable, lightly stylized anime-game inventory icon for [CATEGORY_ID].
Subject: [SUBJECT].
Scene/backdrop: perfectly flat solid [KEY_COLOR] chroma-key background for background removal.
Style: colorful, clean, game-like, consistent with anime-style storefront and city terrain assets.
Composition: centered subject, generous padding, crisp silhouette, readable at small size.
Constraints: no text, no brand logos, no watermark, no cast shadow, no contact shadow, no floor plane, no reflections, no background texture, no gradients. Do not use [KEY_COLOR] anywhere in the subject.
Output intent: final project asset will be a transparent-background PNG at 96x96 pixels.
```

Category replacements:

```text
snacks | a small bag of chips, wrapped candy, and a simple cracker stack | #00ff00
drinks | a soda can, bottled water, and a small juice carton with blank labels | #00ff00
essentials | a paper roll, soap bottle, and plain first-aid box with no readable label | #00ff00
apparel | a folded shirt, scarf, and small hanger | #00ff00
home-goods | a table lamp, mug, and cushion | #00ff00
gifts | a wrapped gift box with ribbon and a small greeting card with no text | #00ff00
games | a game controller and cartridge with no logos or labels | #00ff00
accessories | headphones, charging cable, and a plain phone case | #00ff00
devices | a laptop, smartphone, and small tablet with blank screens | #00ff00
produce | apples, carrots, leafy greens, and a tomato | #ff00ff
pantry | canned goods, pasta bag, and a plain jar with no readable label | #00ff00
prepared | a sandwich, bento tray, and takeaway bowl with no label | #00ff00
```

Save the generated source files outside the final asset directory until alpha removal is complete, for example:

```text
/private/tmp/serpens-product-art/source/snacks.png
/private/tmp/serpens-product-art/source/drinks.png
/private/tmp/serpens-product-art/source/essentials.png
/private/tmp/serpens-product-art/source/apparel.png
/private/tmp/serpens-product-art/source/home-goods.png
/private/tmp/serpens-product-art/source/gifts.png
/private/tmp/serpens-product-art/source/games.png
/private/tmp/serpens-product-art/source/accessories.png
/private/tmp/serpens-product-art/source/devices.png
/private/tmp/serpens-product-art/source/produce.png
/private/tmp/serpens-product-art/source/pantry.png
/private/tmp/serpens-product-art/source/prepared.png
```

- [ ] **Step 3: Remove chroma-key backgrounds**

Run the helper once per source image, using `#ff00ff` source art for `produce` and `#00ff00` for the others. The helper auto-samples the border, so the command shape is the same for each file:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input /private/tmp/serpens-product-art/source/snacks.png \
  --out /private/tmp/serpens-product-art/alpha/snacks.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

Repeat with the matching category id for all twelve files.

Expected: `/private/tmp/serpens-product-art/alpha/<category-id>.png` files have alpha transparency and no solid chroma-key background.

- [ ] **Step 4: Resize the alpha PNGs to final 96x96 files**

Run:

```bash
sips -z 96 96 /private/tmp/serpens-product-art/alpha/snacks.png --out static/assets/game/products/snacks.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/drinks.png --out static/assets/game/products/drinks.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/essentials.png --out static/assets/game/products/essentials.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/apparel.png --out static/assets/game/products/apparel.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/home-goods.png --out static/assets/game/products/home-goods.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/gifts.png --out static/assets/game/products/gifts.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/games.png --out static/assets/game/products/games.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/accessories.png --out static/assets/game/products/accessories.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/devices.png --out static/assets/game/products/devices.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/produce.png --out static/assets/game/products/produce.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/pantry.png --out static/assets/game/products/pantry.png
sips -z 96 96 /private/tmp/serpens-product-art/alpha/prepared.png --out static/assets/game/products/prepared.png
```

Expected: all final assets exist in `static/assets/game/products/`.

- [ ] **Step 5: Commit the product PNG assets**

Run:

```bash
git add static/assets/game/products
git commit -m "Add product category image assets"
```

Expected: commit contains only the twelve product PNG files.

---

### Task 2: Add Product Art Registry And Asset Tests

**Files:**

- Modify: `src/lib/assets/gameArt.ts`
- Modify: `src/lib/assets/gameArt.spec.ts`

- [ ] **Step 1: Write the failing product art registry tests**

Modify `src/lib/assets/gameArt.spec.ts`.

Add `ARCHETYPES` to the imports:

```ts
import { ARCHETYPES } from '$lib/game/archetypes';
```

Add product art exports to the `./gameArt` import:

```ts
	PRODUCT_ART,
	PRODUCT_ART_LIST,
	getProductArt,
```

Add this helper after `archetypeIds`:

```ts
const productCategoryIds = [
	...new Set(
		ARCHETYPES.flatMap((archetype) => archetype.startingCategories.map((category) => category.id))
	)
].sort();
```

Add this test inside `describe('game art asset constants', () => { ... })`:

```ts
it('defines product art for every product category', () => {
	expect(Object.keys(PRODUCT_ART).sort()).toEqual(productCategoryIds);
	expect(PRODUCT_ART_LIST).toHaveLength(productCategoryIds.length);

	for (const categoryId of productCategoryIds) {
		const art = getProductArt(categoryId);

		expect(art.categoryId).toBe(categoryId);
		expect(art.path).toBe(`/assets/game/products/${categoryId}.png`);
		expect(art.alt).toContain('Product icon');
		expect(existsSync(staticPath(art.path))).toBe(true);

		const { width, height, opaquePixels, transparentPixels } = imageStats(art.path);

		expect(width).toBe(96);
		expect(height).toBe(96);
		expect(
			transparentPixels,
			`${art.path} should include transparent background pixels`
		).toBeGreaterThan(0);
		expect(opaquePixels, `${art.path} should preserve visible product pixels`).toBeGreaterThan(0);
	}
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun run test:unit -- src/lib/assets/gameArt.spec.ts --run
```

Expected: FAIL because `PRODUCT_ART`, `PRODUCT_ART_LIST`, and `getProductArt` are not exported yet.

- [ ] **Step 3: Add product art types and registry**

Modify `src/lib/assets/gameArt.ts`.

Add this type and interface after `TerrainArt`:

```ts
export type ProductArtCategoryId =
	| 'snacks'
	| 'drinks'
	| 'essentials'
	| 'apparel'
	| 'home-goods'
	| 'gifts'
	| 'games'
	| 'accessories'
	| 'devices'
	| 'produce'
	| 'pantry'
	| 'prepared';

export interface ProductArt {
	categoryId: ProductArtCategoryId;
	path: string;
	alt: string;
}
```

Add this registry after `STORE_ART_LIST`:

```ts
export const PRODUCT_ART: Readonly<Record<ProductArtCategoryId, ProductArt>> = Object.freeze({
	snacks: Object.freeze({
		categoryId: 'snacks',
		path: '/assets/game/products/snacks.png',
		alt: 'Product icon for snacks'
	}),
	drinks: Object.freeze({
		categoryId: 'drinks',
		path: '/assets/game/products/drinks.png',
		alt: 'Product icon for drinks'
	}),
	essentials: Object.freeze({
		categoryId: 'essentials',
		path: '/assets/game/products/essentials.png',
		alt: 'Product icon for essentials'
	}),
	apparel: Object.freeze({
		categoryId: 'apparel',
		path: '/assets/game/products/apparel.png',
		alt: 'Product icon for apparel'
	}),
	'home-goods': Object.freeze({
		categoryId: 'home-goods',
		path: '/assets/game/products/home-goods.png',
		alt: 'Product icon for home goods'
	}),
	gifts: Object.freeze({
		categoryId: 'gifts',
		path: '/assets/game/products/gifts.png',
		alt: 'Product icon for gifts'
	}),
	games: Object.freeze({
		categoryId: 'games',
		path: '/assets/game/products/games.png',
		alt: 'Product icon for games'
	}),
	accessories: Object.freeze({
		categoryId: 'accessories',
		path: '/assets/game/products/accessories.png',
		alt: 'Product icon for accessories'
	}),
	devices: Object.freeze({
		categoryId: 'devices',
		path: '/assets/game/products/devices.png',
		alt: 'Product icon for devices'
	}),
	produce: Object.freeze({
		categoryId: 'produce',
		path: '/assets/game/products/produce.png',
		alt: 'Product icon for produce'
	}),
	pantry: Object.freeze({
		categoryId: 'pantry',
		path: '/assets/game/products/pantry.png',
		alt: 'Product icon for pantry'
	}),
	prepared: Object.freeze({
		categoryId: 'prepared',
		path: '/assets/game/products/prepared.png',
		alt: 'Product icon for prepared food'
	})
});

export const PRODUCT_ART_LIST: readonly ProductArt[] = Object.freeze(Object.values(PRODUCT_ART));
```

Add this lookup function after `getStoreArt`:

```ts
export function getProductArt(categoryId: string): ProductArt {
	const art = PRODUCT_ART[categoryId as ProductArtCategoryId];

	if (!art) {
		throw new Error(`Unknown product art category: ${categoryId}`);
	}

	return art;
}
```

- [ ] **Step 4: Run the asset registry test and verify it passes**

Run:

```bash
bun run test:unit -- src/lib/assets/gameArt.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit the registry and asset tests**

Run:

```bash
git add src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts
git commit -m "Register product category art"
```

Expected: commit contains only registry and asset-test changes.

---

### Task 3: Render Product Images In The Stock Table

**Files:**

- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`

- [ ] **Step 1: Update the component test first**

Modify `src/lib/components/game/StoreStockTable.svelte.spec.ts`.

Add this import:

```ts
import { getProductArt } from '$lib/assets/gameArt';
```

In the first test, change:

```ts
expect.assertions(7);
```

to:

```ts
expect.assertions(9);
```

Add these assertions after the `Snacks` cell assertion:

```ts
const snacksArt = getProductArt('snacks');

await expect.element(page.getByRole('img', { name: snacksArt.alt })).toBeVisible();
await expect
	.element(page.getByRole('img', { name: snacksArt.alt }))
	.toHaveAttribute('src', snacksArt.path);
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
bun run test:unit -- src/lib/components/game/StoreStockTable.svelte.spec.ts --run
```

Expected: FAIL because the Stock table does not render product images yet.

- [ ] **Step 3: Import the product art registry and asset resolver**

Modify the script block in `src/lib/components/game/StoreStockTable.svelte`.

Add these imports:

```svelte
import {asset} from '$app/paths'; import {getProductArt} from '$lib/assets/gameArt';
```

Keep the existing imports from `'$lib/game/archetypes'`, `'$lib/game/stock'`, and `'$lib/game/types'`.

- [ ] **Step 4: Render a product image beside the category name**

In the `{#each store.products as product (product.categoryId)}` block, add:

```svelte
{@const productArt = getProductArt(product.categoryId)}
```

Replace:

```svelte
<td>{categoryName}</td>
```

with:

```svelte
<td>
	<div class="product-cell">
		<span class="product-thumb">
			<img
				src={asset(productArt.path)}
				alt={productArt.alt}
				width="96"
				height="96"
				loading="lazy"
				decoding="async"
			/>
		</span>
		<span>{categoryName}</span>
	</div>
</td>
```

- [ ] **Step 5: Add stable thumbnail styling**

In the `<style>` block in `src/lib/components/game/StoreStockTable.svelte`, change the table minimum width from:

```css
min-width: 40rem;
```

to:

```css
min-width: 42rem;
```

Add this CSS before the existing `input` rule:

```css
.product-cell {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	min-width: 8rem;
}

.product-thumb {
	display: grid;
	place-items: center;
	width: 2.5rem;
	height: 2.5rem;
	border: 1px solid #3f3d36;
	border-radius: 6px;
	background: #24231f;
}

.product-thumb img {
	display: block;
	width: 2.1rem;
	height: 2.1rem;
	object-fit: contain;
}
```

- [ ] **Step 6: Run the Svelte autofixer on the changed component**

Use the official Svelte MCP `svelte-autofixer` on the full contents of `StoreStockTable.svelte` with `desired_svelte_version: 5`.

Expected: no issues and no suggestions. If it reports issues, apply the suggested fixes and run it again until clean.

- [ ] **Step 7: Run the component test and verify it passes**

Run:

```bash
bun run test:unit -- src/lib/components/game/StoreStockTable.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 8: Commit the Stock tab rendering change**

Run:

```bash
git add src/lib/components/game/StoreStockTable.svelte src/lib/components/game/StoreStockTable.svelte.spec.ts
git commit -m "Show product images in stock table"
```

Expected: commit contains only Stock table component and component-test changes.

---

### Task 4: Full Verification

**Files:**

- Verify: `static/assets/game/products/*.png`
- Verify: `src/lib/assets/gameArt.ts`
- Verify: `src/lib/assets/gameArt.spec.ts`
- Verify: `src/lib/components/game/StoreStockTable.svelte`
- Verify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`

- [ ] **Step 1: Run focused product art and Stock table tests**

Run:

```bash
bun run test:unit -- src/lib/assets/gameArt.spec.ts src/lib/components/game/StoreStockTable.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 2: Run Svelte and TypeScript diagnostics**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Run focused formatting checks for touched source files**

Run:

```bash
bunx prettier --check src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts src/lib/components/game/StoreStockTable.svelte src/lib/components/game/StoreStockTable.svelte.spec.ts docs/superpowers/plans/2026-05-10-product-image-assets.md
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: clean working tree after the previous task commits, or only intentional uncommitted verification artifacts if the implementation worker chose not to commit between tasks.

- [ ] **Step 5: Record verification in the final implementation response**

Report the exact commands and outcomes:

```text
bun run test:unit -- src/lib/assets/gameArt.spec.ts src/lib/components/game/StoreStockTable.svelte.spec.ts --run
bun run check
bunx prettier --check src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts src/lib/components/game/StoreStockTable.svelte src/lib/components/game/StoreStockTable.svelte.spec.ts docs/superpowers/plans/2026-05-10-product-image-assets.md
```

Expected: final response lists whether each command passed and names any command that could not be run.
