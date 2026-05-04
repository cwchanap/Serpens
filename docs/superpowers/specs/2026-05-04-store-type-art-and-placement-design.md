# Store Type Art and Placement Design

## Goal

Storefront art should communicate the store type, and opening a store should not happen until the player has selected both a city tile and a store type.

## Scope

- Add one storefront art entry for each `ArchetypeId`: convenience, boutique, electronics, and grocery.
- Use the selected store type for both founding stores and expansion stores.
- Show all store types when opening on an empty tile, sorted by tile fit.
- Keep tile clicks as selection only. A tile click opens the inspector but never creates a store by itself.
- Keep the existing inspector image size constraints and map sprite size constraints from the prior storefront sizing fix.

## Out of Scope

- Per-store-instance random art variation.
- Save/load migrations.
- New store archetypes.
- Changing the core daily simulation model beyond using the selected archetype for new stores.

## Architecture

Create a typed art registry in `src/lib/assets/gameArt.ts`, keyed by `ArchetypeId`. Each entry will include:

- `path`: static asset URL under `/assets/game/shops/`.
- `textureKey`: Phaser texture key.
- `alt`: accessible image description for the inspector.

Expose a helper such as `getStoreArt(archetypeId)` so Svelte and Phaser share the same source of truth.

`CityMapStoreRender` will include `archetypeId`. The Phaser scene will preload every store art texture from the registry, then choose the texture for each rendered store based on that store render's `archetypeId`. If a texture is unavailable, the scene can fall back to the existing circle marker behavior.

## Placement Flow

The selected city tile remains the spatial choice. The store type button becomes the creation action.

Before the game starts:

- Clicking an unlocked tile opens the inspector.
- The inspector shows all four store type buttons sorted by fit for that tile.
- Clicking a store type calls `createFoundingGameAtTile` with that `archetypeId`.

After the game starts:

- Clicking an empty unlocked tile opens the inspector.
- The inspector shows all four store type buttons sorted by fit for that tile.
- Each button shows opening economics for that specific archetype.
- Clicking a store type calls `openStoreAtTile` with that `archetypeId`.

Occupied and locked tiles continue to show details and disabled feedback. They do not show an enabled store creation action.

## Data Flow

`openStore` in `src/lib/game/state.ts` will accept `archetypeId` in `OpenStoreInput` instead of defaulting expansions to the first store's archetype.

`openStoreAtTile` in `src/lib/game/placement.ts` will accept `archetypeId` and pass it through to `openStore`.

The route component will build opening options for the selected tile by scoring all archetypes. It will pass those options to `TileInspector` so the component can render buttons and per-type disabled reasons without owning business rules.

## Error Handling

- Locked, occupied, missing, and max-store tiles are guarded in the route and in placement/state functions.
- Expansion cash checks use the chosen archetype's setup cost.
- If a caller bypasses the UI and tries to open an unavailable location, the existing decision item behavior remains.
- If art lookup receives an unknown type, TypeScript should catch it because the registry is keyed by `ArchetypeId`.

## Testing

Add or update tests to cover:

- Tile selection alone does not create a store.
- Founding store creation uses the selected archetype.
- Expansion store creation uses the selected archetype, not the first store's archetype.
- Expansion setup cost uses the chosen archetype.
- `createCityMapSnapshot` includes each store's `archetypeId`.
- `TileInspector` renders the image path and alt text for the selected store's archetype.
- Playwright verifies that selecting a tile shows type choices, then selecting a type places the store.
- Playwright verifies an expansion can choose a different type from the founding store.
