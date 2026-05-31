# Multi Cities Design

## Status

Approved for written-spec review on 2026-05-30.

## Goal

Add a multi-city campaign layer to the retail simulation.

The player starts with one retail city and one industrial city, then progressively reveals and opens additional retail and industrial cities from a higher-scope world map. Each city has a distinct gameplay role: retail cities create different product demand patterns, while industrial cities expose different resource and production opportunities.

The first version should make city choice meaningful without replacing the current deterministic daily simulation, global cash, global warehouse, or existing detailed tile maps.

## Accepted Decisions

- Use the `superpowers:brainstorming` flow before implementation.
- Build a higher-scope **combined world map** with both retail and industrial city nodes.
- Use approach 1: a campaign/world-city layer above the existing retail and industry maps.
- Use a hand-authored city catalog.
- Include 3 retail cities and 3 industrial cities in the first catalog.
- The player starts with 1 retail city and 1 industrial city already opened.
- Additional cities are revealed by milestones, then opened by paying an upfront cash cost.
- City specialization affects both sides:
  - Retail cities apply product/category demand modifiers.
  - Industrial cities apply resource and production opportunity profiles.
- Keep cash, debt, warehouse inventory, staff pool, reports, and product chains company-wide for the first version.
- Do not add daily city overhead, distance penalties, shipping cost, or logistics latency in this version.
- Store capacity is company-wide, not per retail city.
- Remove the old fixed `MAX_STORES = 3` cap. Store capacity is campaign state, for example `game.storeCap`.
- Opening additional retail cities and milestone progress can raise `game.storeCap`.

## Scope

Included:

- Add a pure world/campaign module with the city catalog, unlock requirements, opening costs, progression refresh, city opening, and city selection helpers.
- Add world/campaign fields to `GameState`, including opened/revealed city IDs and company-wide store cap.
- Generate detailed `City` and `IndustryCity` instances from the hand-authored world city definitions.
- Add retail demand modifiers to city definitions and apply them during demand-pool creation.
- Add industrial resource profiles so different industrial cities expose different resource anchors and build opportunities.
- Add a third map mode, `world`, in addition to existing `retail` and `industry` modes.
- Add world-map rendering and a city inspector/opening flow.
- Replace all `MAX_STORES` checks with `game.storeCap`.
- Update save validation and save tests for new campaign fields.
- Add unit and e2e coverage for city reveal, city opening, active-city switching, specialization, and store-cap progression.

Deferred:

- Separate per-city cash, debt, staff, warehouses, or reports.
- Shipping routes, distance costs, route capacity, delivery time, or logistics fleet management.
- Per-city policies.
- Per-city store caps.
- Random/procedural world city generation.
- A large campaign with more than 3 retail and 3 industrial cities.
- New route art or animated transport lines beyond simple world-map node status.

## Current Context

The existing state shape already has `cities[]`, `activeCityId`, `industryCities[]`, and `activeIndustryCityId`, but the game effectively assumes one retail city and one industrial city.

Retail placement, map rendering, and sales already filter by the active or store-owning city. Industrial placement and rendering already filter by active industrial city. This makes a world-city layer a natural extension, as long as detailed city maps remain generated `City` / `IndustryCity` values.

The current `locked` tile concept is map-local. It means an edge tile, road/river block, or blocked industrial terrain. It should not be reused for world-city progression. World-city reveal/open state should be separate campaign state.

The current warehouse is company-wide and should remain so. Industrial cities specialize by resource availability and building opportunities, not by owning separate inventory.

## World City Catalog

Add a hand-authored catalog in a new pure module, `src/lib/game/world.ts`.

Each world city definition should include:

- `id`.
- `name`.
- `kind`: `retail` or `industry`.
- `worldX` and `worldY` coordinates for the combined world map.
- `seed` used to generate the detailed tile map.
- `openingCost`.
- `initiallyOpened`.
- `unlockRequirement`.
- `specialtySummary` for UI.
- `storeCapBonus` for retail cities where applicable.
- Retail demand profile for retail cities.
- Industrial resource profile for industrial cities.

First catalog:

| ID                  | Kind     | Role                                                                       |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `harbor-city`       | retail   | Balanced starter market.                                                   |
| `campus-junction`   | retail   | Strong electronics and gifts demand, weaker grocery and essentials demand. |
| `garden-borough`    | retail   | Strong grocery and essentials demand, moderate convenience demand.         |
| `industry-city`     | industry | Balanced starter resources and processing space.                           |
| `breadbasket-basin` | industry | Grain, oilseed, sugar, fruit, and food-chain raw production emphasis.      |
| `quarry-works`      | industry | Salt, chemical feedstock, pulpwood, and processing/factory emphasis.       |

The detailed city names and numbers can be tuned during implementation, but the catalog should remain small, explicit, and testable in this first version.

## Game State

Extend `GameState` with campaign fields:

```ts
interface WorldProgress {
	revealedCityIds: string[];
	openedCityIds: string[];
	claimedMilestoneIds: string[];
}

interface GameState {
	// existing fields...
	world: WorldProgress;
	storeCap: number;
}
```

The design requires:

- Revealed and opened city IDs are saved game state.
- Store cap is saved game state.
- Active detailed retail/industry city IDs remain `activeCityId` and `activeIndustryCityId`.
- The selected world-map node is local Svelte UI state, like selected retail and industry tile IDs. It is not persisted.

Starter game creation should:

- Open `harbor-city`.
- Open `industry-city`.
- Reveal at least those two nodes.
- Generate and store one `City` and one `IndustryCity`.
- Set `activeCityId = 'harbor-city'`.
- Set `activeIndustryCityId = 'industry-city'`.
- Initialize `storeCap` from the starter campaign rules.

## Store Capacity

Remove the fixed `MAX_STORES = 3` model.

All store-opening checks should use `game.storeCap`:

- Placement preview disabled reason.
- Store-opening transition.
- Expansion decisions.
- Any event or recommendation logic that currently checks `MAX_STORES`.

`storeCap` is company-wide. It is not partitioned by retail city.

Store-cap progression rules for the first version:

- Starter cap is defined by the world/campaign module.
- Opening an additional retail city can grant a one-time `storeCapBonus`.
- Milestones can grant additional one-time cap increases.
- `refreshWorldProgress(game)` recalculates or applies newly earned cap increases deterministically.

Milestone bonuses should be tracked through `claimedMilestoneIds` so repeated calls do not keep increasing the cap.

## Unlock And Opening Rules

Use a hybrid reveal/opening model:

1. Milestones reveal city candidates.
2. The player opens a revealed city by paying its upfront opening cost.
3. Opening the city generates its detailed map and appends it to `cities[]` or `industryCities[]`.
4. Opening a retail city applies its store-cap bonus, if any.

Initial milestone set:

- Start opened: `harbor-city` and `industry-city`.
- Reveal second retail city after 2 total stores or day 7.
- Reveal second industrial city after building a warehouse and one raw producer.
- Reveal third retail city after 4 total stores or sustained positive cash.
- Reveal third industrial city after producing a finished material locally.
- Grant one additional store-cap milestone after the first non-starter retail city is opened and the company has at least one positive net-income report.

These rules should be implemented as named milestone definitions in the world module, not scattered conditionals in the UI.

## Retail Specialization

Retail city profiles affect demand only. They do not change store archetype definitions or product catalogs in the first version.

`buildCityDemandPools` should apply city-level category multipliers after the current tile average and policy multipliers. Example:

```ts
cityDemand * category.demandWeight * policyMultipliers * cityCategoryMultiplier;
```

Demand profiles should be keyed by product category ID, with a default multiplier of `1`.

The balanced starter city should behave close to the current game so existing tests and player expectations remain recognizable. New cities should create clear reasons to expand:

- `campus-junction`: electronics/games/gifts style categories perform better.
- `garden-borough`: grocery/essentials/convenience style categories perform better.

If a city has no profile entry for a category, demand should use multiplier `1`.

## Industrial Specialization

Industrial city profiles affect resource availability and industrial terrain opportunities.

`generateIndustryCity` should accept a resource profile input rather than always placing all current resource anchors. The starter profile can remain broad. Specialized profiles should include only selected resource anchors and enough industrial terrain to make the intended chain viable.

Placement does not need a new resource-blocking system. If a resource does not exist in a city, matching raw producer placement naturally has no valid resource tile there.

The first version should preserve import fallback, so a missing resource city never deadlocks the company. Specialization changes profitability and planning, not recoverability.

## World Map UI

Add `activeMapView = 'world' | 'retail' | 'industry'`.

The world map is the default high-level expansion scene once a game exists. Before founding the first store, the current starter retail map flow can remain the first screen so onboarding is not blocked by a world map with no company yet.

The combined world map should show all six nodes:

- Retail nodes and industrial nodes use distinct icons and labels.
- Opened nodes are selectable and can enter their detailed map.
- Revealed unopened nodes show opening cost, specialty summary, and an open action.
- Locked nodes show a milestone hint and disabled state.

Selecting an opened retail node:

- Sets `activeCityId`.
- Switches `activeMapView` to `retail`.
- Clears selected retail and industry tile state.
- Cancels placement mode.

Selecting an opened industrial node:

- Sets `activeIndustryCityId`.
- Switches `activeMapView` to `industry`.
- Clears selected retail and industry tile state.
- Cancels placement mode.

Selecting a revealed unopened node opens a compact city inspector with:

- City name.
- Kind.
- Specialty summary.
- Unlock/opening status.
- Opening cost.
- Open city button if affordable.

The existing map menu should include:

- World Map.
- Retail City Map.
- Industry City Map.
- Saves.
- Management panels.

## Transitions And Data Flow

The world module should provide pure helpers:

- `createInitialWorldProgress()`.
- `refreshWorldProgress(game)`.
- `getWorldCityStatus(game, cityId)`.
- `openWorldCity(game, cityId)`.
- `selectWorldCity(game, cityId)`.
- `getRetailCityDemandMultiplier(game, cityId, categoryId)`.
- `getIndustryCityResourceProfile(cityId)`.

`openWorldCity` should:

- Validate that the city exists.
- Validate that the city is revealed and not already opened.
- Validate sufficient cash.
- Deduct opening cost.
- Generate the detailed map using the catalog definition.
- Append the generated map to the right array.
- Mark the city opened.
- Apply store-cap bonus or claim related milestone if applicable.
- Set the active detailed city ID for the opened city.
- Return a new `GameState`.

`refreshWorldProgress` should run after relevant transitions:

- Founding a game.
- Opening a store.
- Building an industrial building.
- Advancing a day.
- Opening a world city.
- Loading a save, if validation/migration needs to fill missing derived state.

The UI should not own progression rules. It should call pure transitions and render derived city statuses.

## Error Handling

Invalid world actions should not throw from UI handlers.

Blocked world-city opening actions should append a `DecisionItem` following the existing transition pattern. The world inspector can still show disabled button reasons before the player attempts the action, but attempted blocked transitions should be represented in game state.

Recommended v1 behavior:

- Unrevealed or locked city: append a decision with "City is not available yet" and the milestone hint.
- Unaffordable city: append a decision with "Opening this city requires X cash."
- Unknown city ID: append a decision with "Unknown city."
- Already opened city: select/enter the city instead of treating it as an error.

## Persistence

Update save validation for new world and store-cap fields.

Because existing saves may lack the new fields, use a migration/normalization step that derives missing `world` and `storeCap` fields from existing `cities`, `industryCities`, and `stores`.

This is preferred over rejecting old prototype saves because it is small and preserves current saves:

- If `world` is missing, infer opened starter cities from existing city arrays and reveal/open starter IDs.
- If `storeCap` is missing, derive it from starter cap plus opened retail city bonuses and claimed milestone equivalents that can be safely inferred.
- Validate the normalized result and save it normally on the next autosave.

## Testing

Unit tests:

- World catalog has unique IDs, valid seeds, valid coordinates, and valid opening costs.
- Initial world progress opens exactly the starter retail and industrial cities.
- Milestones reveal the expected city IDs.
- Opening a revealed city deducts cash, appends a detailed map, marks the city opened, and sets the active detailed city ID.
- Opening an unaffordable, locked, unknown, or already-opened city follows the defined blocked behavior.
- Store-opening checks use `game.storeCap` and no longer import or depend on `MAX_STORES`.
- Retail demand modifiers affect `buildCityDemandPools`.
- Industrial resource profiles generate the expected resource availability.
- Save validation accepts the new world fields and handles missing fields through the chosen migration/normalization path.

Svelte/component tests:

- World map renders retail and industrial nodes with opened/revealed/locked states.
- Revealed unopened city inspector shows specialty, cost, and disabled/enabled open action.
- Opened city selection calls the right handler.

E2E tests:

- A started game exposes the world map from the map menu.
- The player can open a revealed city when affordable.
- Opening a retail city increases company-wide `storeCap`.
- The player can switch to the newly opened retail city and build a store there.
- The player can switch to a newly opened industrial city and see its specialized resources.

## Implementation Notes

- Keep world/campaign logic in pure `src/lib/game` modules.
- Keep Phaser scenes snapshot-driven. Implement the first world map as Svelte/SVG/HTML because it is a small node map, not a tile grid.
- Do not statically import Tauri-only persistence code.
- Use Svelte 5 runes in any new or edited component.
- Use official Svelte MCP documentation before writing Svelte code during implementation.
- Keep the first implementation focused on city unlocks and specialization. Do not add route logistics in this pass.
