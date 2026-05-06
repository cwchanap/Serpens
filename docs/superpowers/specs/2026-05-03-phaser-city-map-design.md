# Phaser City Map Design

## Status

Approved for design documentation on 2026-05-03.

## Goal

Add a main game scene for the retail business simulation: a scalable, grid-based city map where the player chooses store locations directly on the map. The first implementation should use Phaser for the visual map scene while keeping the existing business simulation in pure TypeScript.

The feature should make the game feel more like a city management simulation without moving business rules into the renderer.

## Product Scope

The first city-map implementation includes:

- A map-first main game screen.
- A scalable city data model with an initial `20 x 20` city.
- Tile-based store placement for the founding store and later expansion.
- Neighborhood identities that translate into business traits.
- Phaser rendering for terrain, buildings, selection, camera movement, zoom, and light placeholder animation.
- Svelte panels for tile inspection, store inspection, policies, reports, scorecard, decisions, and day advancement.

The feature intentionally prepares for richer anime-style city art and animation, but it does not require final art assets in this step.

## Renderer Decision

Use Phaser for the city map scene.

Phaser is a better fit than Svelte DOM, raw Canvas, or PixiJS for the intended direction because the game is moving toward a visual city scene with terrain, buildings, camera controls, input handling, sprite animation, and possibly tilemaps. PixiJS is strong for low-level 2D rendering, but Phaser provides more game-oriented structure out of the box. Raw Canvas would require rebuilding too many engine features.

The renderer boundary must remain strict:

- Pure TypeScript game modules own city data, placement rules, forecasts, economics, daily simulation, and persistence-ready game state.
- Phaser owns visual rendering, camera behavior, hover state, selection highlights, building sprites, terrain sprites, and simple animations.
- Svelte owns app layout, business panels, inspector controls, reports, policies, decisions, and action buttons.
- Phaser emits user intent events such as `tileSelected`; it never calculates business outcomes.

This keeps the simulation testable and allows the renderer to evolve without rewriting the core economy.

## City Model

Introduce a scalable city model rather than a hardcoded board.

Core concepts:

- `City`: id, name, width, height, tiles.
- `CityTile`: id, city id, x, y, neighborhood, terrain, demand, rent, foot traffic, customer fit, locked state.
- `Store`: add city id, tile id, and map coordinates.
- `GameState`: add cities and active city id.

The first generated city is `20 x 20`, but city dimensions must not be hardcoded into rendering or rules. Future cities may use different dimensions.

City generation should be deterministic from the game seed. The same seed should produce the same city layout and tile traits.

Neighborhood identities should be readable business categories:

- Downtown
- Campus
- Residential
- Mall district
- Transit hub
- Industrial
- Suburb
- Park edge

Each neighborhood identity maps to economic traits such as demand, rent, foot traffic, and customer fit. This makes the map understandable at a glance while keeping the data model useful for simulation.

Competitors are deferred. The first map version should not include competitor markers or competitor-driven forecasts.

## Store Placement Flow

The player starts with the city map, not the archetype picker.

Founding store flow:

1. Player selects an available city tile.
2. The inspector shows neighborhood identity, terrain, rent, demand, foot traffic, customer profile, and recommended archetypes for that tile.
3. Player chooses a starting archetype from the recommended list or from the full archetype list.
4. The game creates the founding store at the selected tile.
5. The store appears on the map and the Control Tower panels become available.

Expansion flow:

1. Player selects an available tile after the business has started.
2. The inspector shows setup cost, rent, forecast, and location risks.
3. Player confirms opening if eligible.
4. Store placement data records the selected city and tile.
5. The new store appears on the map and in store overview panels.

Tile traits affect store starting stats and the opening forecast in this version. The daily simulation can continue using store-level derived values rather than reading city tiles every day.

## Main Screen Layout

The main screen becomes map-first.

Primary areas:

- Center: Phaser city map scene.
- Top bar: current day, cash, active city, advance-day control.
- Right inspector: selected tile or selected store.
- Supporting management panels: scorecard, store overview, policies, decision queue, and reports.

Map interaction:

- Click tile: select it.
- Empty selected tile: show location stats, archetype recommendations, forecast, and open-store action.
- Owned store tile: show store status, latest report, warnings, and links to management panels.
- Drag or pointer pan: move around the city.
- Wheel or explicit controls: zoom in and out.
- Visual states: selected tile, hover tile, available tile, locked tile, and owned store.

The existing Control Tower information remains available, but it becomes supporting UI around the map rather than the primary scene.

## Visual Direction

The first implementation should use stylized placeholder visuals in Phaser:

- Colored terrain tiles.
- Simple neighborhood/building silhouettes.
- Storefront markers for owned stores.
- Selection and hover outlines.
- Subtle idle animation, such as a storefront pulse or small light shimmer.

The asset pipeline should be ready for later anime-style building and terrain art. Placeholder assets should be easy to replace with spritesheets or tilemap art.

Final anime art, animated citizens, traffic systems, and pathfinding are out of scope for this design.

## Phaser Integration

Add a Svelte bridge component, likely `CityMap.svelte`, that mounts Phaser only in the browser.

Integration pattern:

- The Svelte component renders a stable map container.
- On browser mount, it creates one Phaser game instance.
- On component cleanup, it destroys the Phaser instance.
- Svelte sends render snapshots into the scene when city, store, selection, or affordability state changes.
- The Phaser scene emits selection events back to Svelte callbacks.

Phaser receives a render snapshot containing:

- City dimensions.
- Tile render data.
- Owned store positions.
- Selected tile id.
- Locked or unavailable tile flags.
- Affordability or eligibility hints needed for visual states.

Phaser emits:

- `tileSelected` with tile id.

The scene should resize with the browser without mutating game state.

If Phaser fails to load, the app should show a non-crashing fallback message and keep management panels usable.

## Data Flow

The route owns the active `GameState` and selected tile id.

Typical selection flow:

1. Player clicks a tile in Phaser.
2. Phaser emits `tileSelected`.
3. Svelte stores the selected tile id.
4. Svelte derives the selected tile or store from pure TypeScript helpers.
5. Inspector renders the relevant forecast or store status.

Typical founding store flow:

1. Selected tile id and chosen archetype are passed to a pure state helper.
2. The helper validates the tile and creates the initial game state.
3. Svelte updates the game state.
4. `CityMap.svelte` sends a new render snapshot to Phaser.
5. Phaser redraws the owned store marker.

Typical expansion flow:

1. Selected tile id is passed to the expansion helper.
2. The helper validates cash, store limit, lock state, and occupancy.
3. The helper returns a new game state or an explanatory decision/warning.
4. Svelte updates panels and map snapshot.

## Error Handling and Edge Cases

The feature should handle:

- Phaser not loading in the browser.
- Server-side rendering trying to evaluate browser-only Phaser code.
- Missing or stale selected tile id.
- Selecting a locked tile.
- Selecting a tile already occupied by a store.
- Opening without enough cash.
- Reaching the current maximum store count.
- City dimensions other than `20 x 20`.
- Empty or malformed city tile arrays in tests.
- Browser resize while a tile is selected.

Failure states should leave the game playable. The UI should explain why a store cannot open rather than silently doing nothing.

## Testing Strategy

Pure TypeScript tests:

- City generation is deterministic for a seed.
- City dimensions vary correctly and include the initial `20 x 20` case.
- Tile ids and coordinates are stable.
- Generated neighborhood traits stay within valid economic ranges.
- Founding store creation requires a selected valid tile.
- Opening a store records city id, tile id, and coordinates.
- Opening forecast is deterministic and explains demand, rent, and customer fit.
- Invalid placement attempts return a safe result.

Svelte and Playwright tests:

- Start flow begins on a city map.
- Selecting a tile shows stats and recommended archetypes.
- Choosing an archetype opens the founding store on that tile.
- Advancing a day still updates the existing business panels.
- Expansion happens from a selected map tile rather than a generic open-store button.

Phaser-specific tests:

- Keep scene logic thin and integration-focused.
- Unit test snapshot transformation helpers before data enters Phaser.
- Prefer Playwright coverage for user-visible map flows.
- Keep critical actions available through accessible Svelte controls so canvas interaction is not the only path.

## Out of Scope

- Competitor map system.
- Multi-city travel or city unlock progression.
- Final anime art pack.
- Animated citizens.
- Traffic economy.
- Pathfinding.
- Logistics and warehouses.
- Phaser-owned business rules.
- Backend persistence.

