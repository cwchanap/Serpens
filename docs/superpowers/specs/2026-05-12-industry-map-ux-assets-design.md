# Industry Map UX And Asset Upgrade Design

## Goal

Upgrade the Industry City Map so it feels like a peer to the Retail City Map instead of a prototype overlay. Industrial construction should follow the same deliberate build flow as retail store opening, and the industry map should use generated stylized game assets for terrain, resources, materials, products, and factory plants.

This extends the existing Industry City Map feature. It does not change the production-chain rules, save schema direction, or weekly refill model except where UI needs to expose existing data more clearly.

## Approved Direction

- Use the same build confirmation pattern as the main city map.
- Generate assets for the full planned industry catalog, not only the first snacks chain.
- Match the current game art direction: stylized/anime-like, clean PNG game tiles and icons.
- Use generated assets in both map rendering and inspector/detail UI.

## Industry Construction UX

The industry build flow should mirror the retail tile flow:

1. Player switches to Industry City Map from the map menu.
2. Player selects an industry tile.
3. The Industry Tile Inspector opens with tile terrain, resource, and available industrial building options.
4. Clicking a build option opens a confirmation modal instead of building immediately.
5. The modal shows:
   - building name and generated building art
   - build cost
   - daily operating cost
   - required tile/resource, when any
   - recipe inputs and outputs, using material icons
   - warehouse capacity for warehouse buildings
6. Confirming construction calls the existing `buildIndustrialBuilding` transition through route state, autosaves, and closes the industry inspector.
7. Canceling returns to the inspector without changing game state.

This should preserve the existing runtime feedback path: if a build is blocked by cash, tile, resource, or occupancy, the existing decision/feedback behavior remains available rather than silently disabling the whole flow too early.

## Asset Coverage

Assets should cover the full industry catalog currently represented in `src/lib/game/industry.ts` and `src/lib/game/types.ts`.

### Terrain And Resource Assets

Terrain base tiles:

- farmland
- forest
- water
- deposit
- industrial
- blocked

Resource overlays:

- grain field
- salt deposit
- oilseed field
- water source
- fruit orchard
- sugar field
- pulpwood forest
- chemical feedstock

Terrain should remain readable at the current map scale and should not make tile boundaries ambiguous. Resource overlays should be visually distinct from base terrain and easy to identify without text.

### Material And Product Icons

Raw materials:

- grain
- salt
- oilseeds
- water
- fruit
- sugar
- pulpwood
- chemical feedstock

Intermediate materials:

- flour
- cooking oil
- filtered water
- syrup
- paper pulp
- plastic
- packaging
- cleaning base

Finished products:

- snacks
- drinks
- essentials

Icons should be compact transparent PNGs suitable for recipe rows, warehouse rows, and future production-chain views. Finished product icons may reuse the existing product-art style, but should be registered through the industry asset registry so industry UI is not coupled to retail product art.

### Factory And Plant Sprites

Industrial buildings:

- grain farm
- salt mine
- oilseed farm
- water pump
- fruit farm
- sugar farm
- pulpwood grove
- chemical feedstock well
- flour mill
- oil press
- water filtration plant
- syrup plant
- pulp mill
- plastic plant
- packaging plant
- chemical plant
- snack factory
- drink bottling plant
- household goods factory
- warehouse

Map sprites should be readable at the same size class as retail storefront sprites. Inspector art can use the same source image at a larger display size.

## Asset Registry And Rendering

Add industry-specific asset registry entries in the existing game art layer rather than hardcoding paths inside Phaser scenes or Svelte components.

Expected registry groups:

- industry terrain art
- industry resource art
- industry material art
- industrial building art

The industry Phaser scene should preload these lists, render base terrain with image tiles when available, render resource overlays as image markers, and render industrial buildings with building sprites. The scene may keep simple geometric fallback rendering for missing textures, but tests should prove the expected assets are registered and present.

Canvas data attributes should continue supporting e2e settlement:

- `data-industry-building-count`
- `data-industry-resource-count`
- `data-map-tile-size`
- `data-map-zoom`
- camera view attributes

If useful, add industry asset mode/count attributes similar to the retail map terrain/store attributes, but only if tests need them.

## Inspector Integration

The Industry Tile Inspector should use assets to improve scanability:

- selected tile shows terrain/resource art where relevant
- build choices show building thumbnails
- confirmation modal shows building art and recipe icons
- existing building details show building art
- last production and warehouse material rows show material icons

The inspector should remain dense and operational. Avoid tutorial copy, large marketing-style panels, or decorative cards inside cards.

## Testing

Focused coverage should include:

- asset registry tests that verify every industry terrain/resource/material/building asset path exists
- image dimension/transparent-pixel checks consistent with current asset tests
- industry map scene/e2e readiness checks proving image-backed rendering settles
- component tests for confirm modal behavior:
  - clicking build opens confirmation
  - cancel does not call `onBuild`
  - confirm calls `onBuild(typeId, tileId)` and closes through route behavior
- route e2e extension proving construction still works after confirmation is added
- regression coverage that existing retail store opening behavior is unchanged

Before implementation is considered complete:

- run Svelte MCP docs/autofixer for changed Svelte files
- run focused unit/component/e2e tests
- run `bun run check`
- run full unit/e2e/build if the change touches shared route or renderer behavior

## Out Of Scope

- Changing production recipes or balancing values
- Adding new product categories beyond the current industry catalog
- Adding a separate production-chain dashboard
- Migrating old saves beyond the current prototype invalid-save reset behavior
- Reworking the retail map asset system

