# City Terrain Background Design

## Status

Approved for design documentation on 2026-05-05.

## Goal

Make the Phaser city map feel more lively by adding visible road, river, and tree-style terrain assets while keeping the map readable as a business placement tool.

Roads and rivers are not only decoration in this slice. They occupy whole tiles and block store placement. Trees and green details are visual background decoration only.

## Scope

- Add deterministic whole-tile road and river features to generated cities.
- Treat road and river tiles as unavailable build sites for founding and expansion.
- Keep road and river tiles selectable so the inspector can explain why the player cannot place a store there.
- Add terrain art metadata alongside the existing storefront art registry.
- Render terrain assets in Phaser above base terrain colors and below store sprites.
- Add tree decoration to eligible green/park-style tiles without blocking placement.
- Preserve existing map selection, overlay, drag, zoom, and storefront behavior.

## Out of Scope

- Road traffic simulation.
- River gameplay effects.
- Bridges.
- Animated water.
- Pathfinding.
- Road-based foot traffic bonuses.
- Multi-layer tile occupancy.
- New store archetypes.
- A broad save migration system.

## Data and Placement Rules

Add a tile-level feature field to the city model: `feature: 'road' | 'river' | null`. The feature is deterministic output from city generation and is included in map render snapshots.

City generation should create:

- A small road spine or cross that reads as city infrastructure.
- A river path that reads as water and differs visually from green terrain.
- Enough ordinary buildable tiles that founding and expansion flows remain easy to test and play.

Placement rules treat road and river tiles as unavailable, in addition to existing locked, occupied, max-store, and cash checks. The player can still click a road or river tile. The inspector should show the tile details and a clear disabled reason, such as `Road location` or `River location`.

Locked border tiles remain locked. If a tile is both locked and a road or river, locked feedback takes priority because it is the broader availability state. Interior road and river tiles must expose road or river feedback.

Tree decoration does not block placement by itself.

## Renderer and Assets

Keep Phaser as the owner of city-map drawing. Svelte continues to pass a serializable `CityMapSnapshot` into `CityMapScene`.

Extend `src/lib/assets/gameArt.ts` with terrain art entries for road, river, and tree decoration assets. Each terrain entry should include:

- Static asset path under `/assets/game/terrain/`.
- Phaser texture key.
- A stable semantic id.

`CityMapScene.preload()` should load terrain textures with SvelteKit `asset(...)`, following the existing storefront pattern.

Render order:

1. Base terrain color.
2. Road and river full-tile sprites or fallback shapes.
3. Tree decorative sprites on eligible tiles.
4. Owned store sprites.
5. Hover and selected outlines.

If a terrain image texture is missing, the map should remain playable. Phaser can draw simple road or river fallback shapes over the base tile color, just as storefront rendering already has a circle fallback when image textures are unavailable.

Add canvas dataset attributes for test visibility, similar to the existing store marker attributes. The tests should be able to assert that terrain asset rendering is active without relying on pixel-perfect canvas inspection.

## User Flow

Selecting a road or river tile opens the same tile inspector used for other locations. Store-opening controls appear disabled with the matching reason.

Selecting a normal buildable tile should continue to support the existing founding and expansion flow:

1. Player selects an unlocked, unoccupied, non-road, non-river tile.
2. Inspector shows store type options sorted by fit.
3. Player chooses a store type.
4. Existing placement helpers create the founding or expansion store.
5. Phaser redraws the store sprite above the terrain assets.

The Control Tower, save panel, and tile inspector overlay behavior should not change.

## Architecture Boundaries

Pure TypeScript game modules own feature generation, placement availability, and disabled reasons.

Phaser owns drawing, texture fallback, camera behavior, hover, selected outlines, and lightweight decorative animation if needed.

Svelte owns page state, inspector controls, disabled button display, save UI, and management overlays.

This keeps the road and river placement rule testable without putting business rules inside the renderer.

## Error Handling and Edge Cases

The implementation should handle:

- Missing terrain image files or failed Phaser texture loads.
- Empty city snapshots.
- City dimensions other than `20 x 20`.
- Road or river features on locked border tiles.
- Selecting road or river tiles before the founding store exists.
- Selecting road or river tiles after the player already owns stores.
- Existing saved games that lack the new tile feature field.

Existing saved games should continue to load by treating missing tile feature values as `null` or regenerating safe default feature metadata where appropriate. This is not a broad migration project; it is a compatibility guard for optional tile metadata.

## Testing Strategy

Pure TypeScript tests:

- City generation deterministically includes road and river feature tiles for the same seed.
- Road and river tiles are not valid placement targets.
- Founding placement cannot create a store on road or river tiles.
- Expansion placement cannot create a store on road or river tiles.
- Disabled reasons distinguish road and river tiles from locked and occupied tiles.
- `createCityMapSnapshot` includes feature metadata needed by Phaser.

Asset tests:

- Terrain art registry entries point to real static files.
- Texture keys and asset paths are stable.
- Terrain assets are grouped separately from storefront assets while sharing the same registry module.

Playwright tests:

- The map renders terrain asset markers through canvas dataset attributes.
- Selecting a road tile shows disabled placement feedback.
- Selecting a river tile shows disabled placement feedback.
- Selecting a normal tile can still found a store.
- Expansion from a normal tile still works after terrain assets are active.
- Narrow viewport overlay behavior remains intact.

## Implementation Notes

Use the existing storefront art pipeline as the model:

- Static PNGs live under `static/assets/game/...`.
- `src/lib/assets/gameArt.ts` is the typed registry.
- Phaser preloads with `asset(...)`.
- Playwright checks stable canvas dataset attributes rather than brittle canvas pixels.

Do not move tile inspector UI below the map to avoid overlay interaction issues. Preserve the current overlay and keep map input fixes focused on Phaser pointer boundaries.
