# Shop Art Asset Design

## Status

Approved for design documentation on 2026-05-03.

## Goal

Enhance the retail city map with the first real game art asset: an anime-style shop image generated with the image generation tool. The first pass should make owned stores feel like actual shops on the Phaser map and add a larger storefront image to the selected-store inspector.

This is an art integration pass, not a simulation change. Store placement, economy rules, city generation, and daily simulation should keep their current behavior.

## Scope

Included:

- Generate one anime-style retail shop image.
- Store the generated asset in the project under `static/assets/game/shops/`.
- Use the asset as a compact in-map shop sprite for owned store tiles.
- Use the same asset as a larger detail image when an owned store tile is selected.
- Preserve the current orange marker behavior as a fallback if the image cannot be loaded.
- Verify store selection, map interaction, and inspector rendering still work.

Deferred:

- Multiple shop variants.
- Archetype-specific shop art.
- Store-level asset ids in game state.
- Animated sprite sheets.
- Full terrain, building, pedestrian, or traffic art replacement.

## Asset Direction

Generate a single anime-style storefront image. It should read as a friendly small retail shop with colorful signage, warm interior light, and a clean silhouette. The image should avoid meaningful text on signs so scaling and localization do not matter.

The image should work in two contexts:

- Map sprite: compact and readable at tile scale.
- Inspector detail: larger and more expressive when a player selects an owned store tile.

The preferred output is a transparent-background storefront. If the generated image is not transparent, the implementation should still use it in a framed inspector image and can crop or frame it for the map sprite.

## Asset Pipeline

Place the generated image at:

`static/assets/game/shops/anime-storefront.png`

Assets under `static/` are browser-served by SvelteKit, so both Phaser and Svelte can reference the same URL:

`/assets/game/shops/anime-storefront.png`

This keeps the first asset path simple and avoids bundler-specific imports for Phaser runtime loading.

## Phaser Integration

`CityMapScene` should load the shop image as a Phaser texture and render owned stores with image sprites centered on their store tile.

Rendering rules:

- Store sprites appear above terrain tiles.
- Store sprites appear below hover and selection outlines.
- Store sprites can overlap the tile slightly for character.
- Tile zones remain unchanged so click, hover, drag, pan, and zoom behavior stay stable.
- The existing animated orange marker remains as the fallback if the image texture is missing or fails to load.

The scene should continue to consume `CityMapSnapshot`. The snapshot does not need a new asset field for this pass because every store uses the same first shop asset.

## Svelte Inspector Integration

`TileInspector.svelte` should show the shop image when the selected tile contains an owned store. The image should be presented as store detail art, not as business logic.

The inspector should continue to show the existing store/tile information. The image is an enhancement to the selected-store view, not a replacement for operational stats or actions.

The component can reference the shared static asset URL directly. No game-state schema change is required.

## Data Flow

The existing data flow remains unchanged:

1. The player opens a store.
2. Pure TypeScript game state records the store and tile position.
3. `createCityMapSnapshot` includes the owned store in `stores`.
4. `CityMap.svelte` sends the snapshot to `CityMapScene`.
5. Phaser renders the shop sprite for the owned store.
6. Selecting the owned store tile causes Svelte to derive `selectedStore`.
7. `TileInspector.svelte` displays the store details and storefront image.

No simulation module should import or know about the image asset.

## Error Handling

The implementation should handle:

- Phaser texture load failure by drawing the current fallback marker.
- Missing store image in the Svelte inspector by keeping the text details usable.
- Store marker redraws after snapshot changes.
- Camera zoom and pan with image sprites present.
- Selected and hover outlines staying visible over the sprite.

The game should remain playable if the art asset fails to load.

## Testing Strategy

Svelte and component-level verification:

- Selecting an empty tile does not show the shop detail image.
- Selecting an owned store tile shows the shop detail image.
- Existing inspector actions and disabled states remain visible.

Phaser/browser verification:

- Opening the founding store draws a storefront sprite on the map.
- Selecting the store tile still opens the store inspector.
- Hover and selected outlines remain visible.
- Drag/pan and wheel zoom continue working.

Project verification:

- Run the standard project checks after implementation.
- Use the Svelte MCP documentation lookup before editing Svelte code.
- Run the Svelte autofixer on changed Svelte files until it returns no issues or suggestions.

## Implementation Boundary

This design intentionally avoids adding an asset system to `GameState`. One hardcoded first shop asset is enough for this pass. If later work adds per-archetype or per-store visuals, that should be a separate design that introduces asset keys deliberately.
