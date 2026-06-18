# City Layout And Land Cost Design

## Goal

Improve the retail city map so players have more buildable slots, connected roads and rivers, and clearer land-cost tradeoffs without removing existing shop placement freedom.

## Decisions

- Shops remain buildable on every currently valid retail tile: unlocked, unoccupied, non-road, and non-river.
- Residential and commercial terrain add a setup-cost premium. This affects forecasts, build menu ranges, founding placement, and expansion placement through the existing shared economics path.
- The starter retail city and future retail city maps become larger than 20 by 20 so players have more room to build.
- City generation changes from a plus-shaped road and diagonal river to continuous paths with connected visual variants.
- Road and river connection metadata is derived from neighboring feature tiles at the snapshot boundary, so the Phaser scene renders based on pure snapshot data.

## Architecture

The pure game layer owns city shape and build economics. `src/lib/game/city.ts` generates deterministic terrain, road, and river features; `src/lib/game/placement.ts` computes setup cost and places stores; `src/lib/game/placementPreview.ts` consumes those same rules for build menus and previews.

The map renderer remains snapshot-driven. `src/lib/game/mapRender.ts` derives road and river connection variants from generated feature coordinates and passes them to `src/lib/phaser/cityMapScene.ts`, which chooses textures or fallback drawing without reaching into game state.

## Testing

- Unit tests in `src/lib/game/city.spec.ts` verify the larger generated city, increased buildable slot count, and contiguous road and river paths.
- Unit tests in `src/lib/game/placement.spec.ts` verify residential and commercial setup costs are higher while those tiles remain buildable.
- Unit tests in `src/lib/game/mapRender.spec.ts` verify road and river render variants match connected neighbors.
- Existing placement preview tests should keep passing because they use the shared placement rules.
- E2e renderer assertions in `src/routes/retail-sim.e2e.ts` should be updated only where map dimensions or terrain sprite counts change.
