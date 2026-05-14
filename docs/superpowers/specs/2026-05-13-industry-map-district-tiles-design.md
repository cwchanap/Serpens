# Industry Map District Tiles Design

## Goal

Redesign the Industry City Map terrain generation so the map reads as planned industrial districts instead of a chaotic random patchwork.

## Approved Direction

- Prioritize calmer terrain layout over art or overlay changes.
- Keep the existing industry map, production rules, resource anchors, save shape, and placement rules.
- Use planned industrial districts:
  - northern farmland belt around crop resource anchors
  - west and mid extraction pocket around deposit resource anchors
  - southern natural utility belt around water and pulpwood resource anchors
  - southeast industrial park for processors, factories, and warehouses
  - locked border and sparse internal separators only where they help structure the map

## Implementation Shape

Change only the industry city generator in `src/lib/game/industry.ts`.

The existing resource anchors remain authoritative. Filler terrain should be derived from tile position and nearby districts instead of per-tile random rolls. The resulting 18x18 starter industry city should have coherent regions that are stable and easy to scan:

- crop resources sit in mostly farmland neighborhoods
- salt and chemical-feedstock resources sit in mostly deposit neighborhoods
- water and pulpwood resources sit in a mostly water/forest lower belt
- most non-resource buildable industrial tiles are concentrated in the southeast district
- blocked tiles are mostly border/structure, not scattered noise

## Testing

Extend `src/lib/game/industry.spec.ts` with focused generator assertions:

- resource anchors keep the same terrain/resource guarantees
- the north crop belt is mostly farmland
- deposit resources are surrounded by deposit terrain
- the lower utility belt contains coherent water and forest areas
- the southeast industrial district has a strong majority of buildable industrial tiles
- internal blocked tiles stay low enough that the playable map does not look speckled

## Out Of Scope

- Replacing PNG assets
- Changing Phaser rendering, overlays, or marker sizes
- Changing production recipes, placement rules, warehouse behavior, or save validation
- Adding new resources or material categories
