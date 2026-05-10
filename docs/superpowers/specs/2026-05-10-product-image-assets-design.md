# Product Image Assets Design

## Status

Approved for design documentation on 2026-05-10.

## Goal

Add small product category images to the Stock tab in the selected shop details. The images should make each stock row easier to scan without changing the stock simulation, persistence schema, or category-level inventory model.

This is a presentation and asset-registration pass. Product stock remains category-level, and the tile inspector remains the detailed stock-management surface.

## Scope

Included:

- Add one image asset for each existing product category.
- Keep each asset as a `96x96` PNG with a transparent background.
- Store product assets under `static/assets/game/products/`.
- Register product images in the shared asset registry at `src/lib/assets/gameArt.ts`.
- Render each product image in `StoreStockTable.svelte` beside the category name in the Stock tab.
- Add tests that verify product art coverage, asset existence, `96x96` dimensions, transparent pixels, and visible pixels.
- Add component coverage that proves the Stock tab table renders the image for a product row.

Deferred:

- SKU-level item art.
- Product assortment editing.
- Store-specific product image overrides.
- Phaser map rendering for product images.
- Control Tower product images.
- Save data changes for asset ids.
- Animated product icons or sprite sheets.

## Asset Direction

Product images should read as simple inventory icons, not full product-package mockups. Each icon should use a clear centered subject with enough padding to remain legible in a compact table row.

The current category set is:

- `snacks`
- `drinks`
- `essentials`
- `apparel`
- `home-goods`
- `gifts`
- `games`
- `accessories`
- `devices`
- `produce`
- `pantry`
- `prepared`

The preferred visual style is consistent with the existing anime-style storefront and terrain assets: colorful, readable, lightly stylized, and game-like. The icons should avoid readable brand text, labels, watermarks, and background panels.

## Asset Pipeline

Place final PNG assets at:

`static/assets/game/products/<category-id>.png`

Each file must be:

- `96x96` pixels.
- PNG format.
- Transparent background.
- Usable directly from SvelteKit static URLs such as `/assets/game/products/snacks.png`.

If generated through the image generation workflow, use the built-in image tool first, then remove a flat chroma-key background locally to produce alpha PNGs. Final project-referenced files must live in `static/assets/game/products/`, not in a generated-image cache.

## Registry

Extend `src/lib/assets/gameArt.ts` with a product art registry rather than hardcoding paths in the component.

The registry should expose:

- A `ProductArt` interface with `categoryId`, `path`, and `alt`.
- A `PRODUCT_ART` record keyed by product category id.
- A `PRODUCT_ART_LIST` array for tests.
- A `getProductArt(categoryId)` helper.

Keeping this in the existing art registry follows the storefront and terrain pattern and keeps presentation assets out of simulation modules.

## Stock Tab UI

`StoreStockTable.svelte` should render the product image in the Product column beside the category name.

Display rules:

- The table remains the Stock tab content inside the tile inspector.
- Each product cell uses a compact thumbnail, around `2.5rem` square, with the category name next to it.
- The thumbnail should use `asset(productArt.path)` so base-path handling stays consistent with existing inspector art.
- The image should have descriptive alt text from the registry.
- Existing stock columns, numeric inputs, fixed import cost, status, and latest-report display remain unchanged.
- The table should remain horizontally scrollable on narrow screens.

The UI should not introduce extra explanatory copy. The image is a scan aid for the existing operational table.

## Data Flow

The game state continues to store only the category id in each `StoreProduct`.

Render flow:

1. `StoreStockTable.svelte` receives a `Store`.
2. Each `StoreProduct.categoryId` is matched to the store archetype category for display name and import cost.
3. The same `categoryId` is passed to `getProductArt(categoryId)` for the image path and alt text.
4. Svelte renders the static image in the Stock tab row.

No simulation, save codec, or daily report module should import product art.

## Error Handling

Every current category must have registered art. For this first pass, `getProductArt` should require known product categories, and tests should enforce complete coverage of the current category set. That keeps missing assets visible during development instead of silently shipping blank table cells.

If an image fails to load in the browser, the category name and all controls remain visible because the image is only decorative support for the product row.

## Testing Strategy

Asset tests:

- `PRODUCT_ART` includes every current product category id.
- Every registered product path exists under `static/assets/game/products/`.
- Every product asset is `96x96`.
- Every product asset has transparent pixels.
- Every product asset has visible non-transparent pixels.

Component tests:

- `StoreStockTable.svelte` renders the product image for a stock row.
- Existing assertions for category name, fixed import cost, editable selling price, reorder threshold, target stock, and latest report remain valid.

Project verification:

- Use the Svelte MCP documentation lookup before editing Svelte code.
- Run the Svelte autofixer on changed Svelte files until it returns no issues or suggestions.
- Run focused unit/component tests for `gameArt` and `StoreStockTable`.
- Run `bun run check`.

## Implementation Boundary

Product images are static presentation assets. They do not affect demand, price, stock health, import cost, save validation, or report aggregation.

If future work introduces SKU-level products or player-edited assortment, that should add a deliberate domain model for item art. This pass should stay tied to the existing category-level stock rows.
