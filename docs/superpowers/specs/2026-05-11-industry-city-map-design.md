# Industry City Map Design

## Status

Approved for written-spec review on 2026-05-11.

## Goal

Add a separate Industry City Map where the player builds industrial buildings that produce shop goods from raw materials through intermediate materials into finished product categories.

The system should make local production a strategic alternative to importing. Shops keep the current category-level stock model and weekly refill-to-target behavior, but refills should pull from warehouse stock first and import only the remaining shortage.

## Player Experience

The player can switch between the existing Retail City Map and a new Industry City Map from the map menu.

The retail map remains focused on customer-facing store placement, shop stock settings, staff, and daily sales. The industry map is focused on resource extraction, processing, factories, warehouses, and production pressure.

The player places one industrial building per production step. A `Wheat Farm` produces wheat, a `Flour Mill` turns wheat into flour, and a `Snack Factory` turns inputs into packaged snacks. Buildings do not have selectable recipes in this design.

Every raw material has a matching industrial-map producer. Imports remain available as fallback for missing raw, intermediate, or finished materials, but the intended profitable path is local production through warehouses.

## Accepted Decisions

- Product chains should be detailed component chains, not direct category production.
- The design should define chains for all 12 current shop product categories.
- The first playable implementation slice should focus on Convenience Store categories: `snacks`, `drinks`, and `essentials`.
- All raw materials should have industrial-map buildings.
- Warehouses are the buffer and bottleneck for raw, intermediate, and finished goods.
- Shops refill weekly to target stock by pulling from warehouses first, then importing any remaining shortfall.
- Import fallback can cover raw, intermediate, or finished goods.
- Industrial buildings are one building per step, not selectable-recipe containers.
- Raw-material buildings require strict matching resource or terrain tiles.
- The industry map is a separate map view, not part of the retail city map.
- Industrial buildings run automatic daily production.
- Warehouse overflow uses emergency storage with extra daily cost.

## Scope

Included:

- Add a separate deterministic industry city map.
- Add industry tiles with terrain/resource constraints.
- Add industrial buildings for raw extraction, processing, manufacturing, and warehouses.
- Add material definitions for raw, intermediate, and finished goods.
- Add production recipes with daily input/output rules.
- Add company-wide warehouse inventory and capacity from warehouse buildings.
- Add emergency overflow storage with a daily cost.
- Add local-production-first weekly shop refill.
- Add import fallback for missing raw, intermediate, and finished materials.
- Add production, warehouse, import, and overflow report summaries.
- Add save validation for industry state.
- Add tests for the first Convenience production slice.

Deferred:

- Explicit truck routes or per-building routing.
- Warehouse distance, delivery times, or transport fleet management.
- Perishable spoilage beyond generic overflow cost.
- Worker staffing for industrial buildings.
- Pollution, utilities, zoning politics, or permit systems.
- Multi-city production networks.
- Old-save migration. The game is still a prototype, so incompatible old saves may reset through existing save-validation behavior.

## Product Chain Catalog

The game continues to sell the existing category-level shop products. The industry system adds detailed upstream materials and buildings behind those categories.

| Shop category | Chain |
| --- | --- |
| `snacks` | Grain Farm + Salt Mine + Oilseed Farm -> Flour Mill + Oil Press -> Snack Factory -> Packaged Snacks |
| `drinks` | Water Pump + Fruit Farm + Sugar Farm -> Water Filtration Plant + Syrup Plant -> Drink Bottling Plant -> Bottled Drinks |
| `essentials` | Pulpwood Grove + Chemical Feedstock Well + Oilseed Farm -> Pulp Mill + Chemical Plant + Plastic Plant -> Household Goods Factory -> Essentials |
| `apparel` | Cotton Farm + Dye Plant -> Textile Mill -> Garment Factory -> Apparel |
| `home-goods` | Timber Camp + Clay Quarry + Cotton Farm -> Sawmill + Ceramics Workshop + Textile Mill -> Home Goods Workshop -> Home Goods |
| `gifts` | Timber Camp + Glassworks + Metalworks -> Craft Workshop -> Gift Goods |
| `games` | Pulpwood Grove + Plastic Plant + Electronics Parts Plant -> Game Pressing Plant -> Games |
| `accessories` | Plastic Plant + Copper Mine + Textile Mill -> Accessories Assembly -> Accessories |
| `devices` | Silica Quarry + Copper Mine + Rare Metals Mine + Plastic Plant -> Chip Plant -> Device Assembly -> Devices |
| `produce` | Vegetable Farm and Fruit Farm -> Cold Storage -> Produce |
| `pantry` | Grain Farm + Fruit Farm + Vegetable Farm -> Canning Plant + Drying Plant -> Pantry Goods |
| `prepared` | Produce + Pantry Goods + Packaging Plant -> Commissary Kitchen -> Prepared Food |

For the first playable slice, implement enough materials and buildings to complete `snacks`, `drinks`, and `essentials`. The full catalog should live in the design and be reflected in type-friendly definitions so later categories can be added without changing the shape of the system.

## Industry Map

The Industry City Map should follow the existing map architecture where practical: pure map generation in `src/lib/game`, a snapshot adapter for rendering, a Svelte bridge component, and a selected-tile inspector.

The industry map should have its own domain types rather than reusing retail `CityTile` fields that are customer-demand oriented. Industrial tiles need production-specific data:

- Terrain or resource type.
- Buildable/blocked status.
- Matching resource for strict raw-building placement.
- Existing industrial building id, if any.
- Warehouse pressure indicators for display when the tile contains or affects storage.

Resource placement rules are strict:

- Farms require matching fertile crop resource tiles.
- Mines and quarries require matching deposits such as salt, clay, silica, copper, or rare metals.
- Timber and pulpwood buildings require forest resource tiles.
- Water pumps require water-source tiles.
- Refineries, mills, factories, bottlers, kitchens, workshops, and warehouses require buildable industrial tiles.

The first implementation does not need a new art set for every building. It can use clear industrial markers or a small set of generic sprites if the building identity is readable in the inspector and tests can verify placement.

## Industrial Buildings

Each industrial building has one clear production role. The building catalog should distinguish:

- Raw producers: farms, mines, quarries, groves, pumps.
- Processors: mills, presses, filtration plants, chemical plants, plastic plants.
- Final factories: snack factories, bottling plants, household goods factories, and later category factories.
- Warehouses: buildings that add storage capacity to the company-wide warehouse inventory.

Industrial buildings should store:

- `id`.
- `buildingTypeId`.
- `tileId`.
- `status`.
- `lastProduction`.
- Cumulative counters for produced units, imported inputs, and blocked days.

The building type definition should store:

- Display name.
- Placement rule.
- Build cost.
- Daily operating cost.
- Recipe id, if the building produces materials.
- Warehouse capacity contribution, if the building is a warehouse.

## Materials And Recipes

Materials should be stable ids, not display strings. Use one material namespace for raw, intermediate, and finished goods so warehouse inventory and imports can use the same code path.

Material examples for the first slice:

- Raw: `grain`, `salt`, `oilseeds`, `water`, `fruit`, `sugar`, `pulpwood`, `chemical-feedstock`.
- Intermediate: `flour`, `cooking-oil`, `filtered-water`, `syrup`, `plastic`, `packaging`, `cleaning-base`.
- Finished: `snacks`, `drinks`, `essentials`.

Recipes should be deterministic daily rules:

- Inputs consumed per day.
- Outputs produced per day.
- Cash operating cost, using `0` for recipes without direct operating cost.
- Import fallback eligibility for missing inputs.

If a production building lacks warehouse inputs, it should import the missing inputs when import fallback is enabled for that material. The import should be recorded separately from local consumption so reports can show how much production depended on outside supply.

## Daily Production Flow

Industrial production runs automatically during each day tick. The recommended order is:

1. Raw producers add their daily output to warehouse inventory.
2. Processing buildings consume warehouse inputs, import missing inputs if needed, and add intermediate outputs.
3. Final factories consume warehouse inputs, import missing inputs if needed, and add finished outputs.
4. Warehouse capacity and overflow are calculated.
5. Retail sales run using the current store stock.
6. On weekly refill days, shops refill below-threshold categories from finished warehouse stock first, then import any remaining finished-goods shortage.
7. Reports record production, import fallback, warehouse ending stock, overflow, and shop refill source.

This order keeps the current weekly refill rhythm intact while making same-day industrial output visible in warehouse state. The implementation can preserve the existing import-day helper, but the refill helper should become source-aware.

## Warehouses And Overflow

Warehouse inventory is company-wide for this first industry slice. Individual warehouse buildings contribute total capacity, but materials do not need to be assigned to a specific warehouse.

Warehouse state should track:

- Stored units by material id.
- Total normal capacity.
- Overflow units.
- Daily overflow cost.

When production output exceeds normal warehouse capacity, the excess remains available through emergency overflow storage. Overflow should add a daily cost so overproduction has a downside without deleting goods or deadlocking the chain.

The first overflow model can be simple:

- Normal capacity comes from warehouse buildings.
- Total stored units above capacity count as overflow.
- Overflow cost is `overflowUnits * overflowCostPerUnit`.

Future spoilage or risk events can build on the overflow count, but they are out of scope for this first design.

## Weekly Shop Refill

Current shop stock settings remain the player-facing retail control:

- Selling price.
- Reorder threshold.
- Target stock.

On weekly refill days, each below-threshold store product computes the units needed to reach target stock. The refill source order is:

1. Pull available finished goods from warehouse inventory using the product category id as the finished material id.
2. Import any remaining shortage.
3. Add the full refill amount to store stock.
4. Record warehouse units, imported units, warehouse value used, and import spend in the product report.

This keeps store management stable while making industrial production reduce import spend. If warehouses cannot cover demand, the store still refills through import fallback and the game remains recoverable.

## UI Design

Add a map switch through the current map menu:

- `Retail City Map`.
- `Industry City Map`.

The map title and selected inspector should reflect the active map. Switching maps should not reset the selected retail store or industry tile unless the selection is invalid for the active map.

The industry tile inspector should show different actions by tile state:

- Empty resource tile: allowed raw producer buildings and why other buildings are blocked.
- Empty industrial tile: allowed processor, factory, and warehouse buildings.
- Built tile: building name, daily input needs, daily output, status, last production, imported inputs, and blocked/overflow pressure.
- Warehouse building or warehouse summary: stored material totals, normal capacity, overflow units, and overflow cost.

The UI should avoid turning production into spreadsheet micromanagement. The main decision is what to build and where. Daily production, warehouse consumption, and import fallback should be automatic.

## Reports

Daily reports should gain industry fields without removing current retail summaries.

Add a production summary that can answer:

- Which materials were produced today.
- Which materials were consumed today.
- Which inputs were imported for production.
- Which finished goods were pulled into shop refills from warehouse stock.
- Which finished goods were imported for shop refills.
- Current warehouse utilization and overflow cost.

Store-level reports should continue to show product-level sales, missed demand, ending stock, and import spend. Product reports should be extended or accompanied by refill-source detail so the player can see when local production replaced imports.

## Data Model

New or extended types:

- `IndustryCity`.
- `IndustryTile`.
- `IndustryResourceId`.
- `IndustrialBuilding`.
- `IndustrialBuildingType`.
- `MaterialId`.
- `ProductionRecipe`.
- `WarehouseInventory`.
- `DailyProductionReport`.
- `DailyMaterialMovement`.

`GameState` additions:

- `industryCities`.
- `activeIndustryCityId`.
- `industrialBuildings`.
- `warehouse`.

Pure transition helpers should own:

- Industry map generation.
- Industrial placement validation.
- Building creation.
- Daily production simulation.
- Warehouse add/remove operations.
- Source-aware weekly shop refill.

Svelte components should not calculate production, mutate nested warehouse state, or own import fallback rules.

## Validation And Error Handling

Placement helpers should reject or explain:

- Unknown industry tile.
- Occupied tile.
- Blocked tile.
- Raw building on a non-matching resource tile.
- Factory or warehouse on a non-industrial tile.
- Insufficient cash for construction.

Production helpers should be deterministic and recoverable:

- Missing local inputs trigger import fallback when the material is importable.
- Unknown material ids or recipe ids should fail tests and save validation rather than silently disappearing.
- Warehouse removals should clamp to available stock and return the shortage for import fallback.
- Overflow should create cost, not discard goods.

## Persistence

Update save validation for:

- Industry map state.
- Industrial buildings.
- Warehouse inventory.
- Production reports.
- Refill-source details.

No old-save migration is required for this prototype slice. If the schema changes, invalid old saves can reset through the existing validation behavior.

## Testing

Unit tests:

- Industry map generation is deterministic for a seed.
- Resource tiles are present for the Convenience first slice.
- Raw producer placement requires matching resource tiles.
- Processor/factory/warehouse placement requires buildable industrial tiles.
- Building creation is immutable and charges build cost.
- Daily raw production adds materials to warehouse inventory.
- Daily processing consumes inputs and produces intermediates.
- Missing production inputs are imported and reported.
- Warehouse capacity creates overflow and daily overflow cost.
- Weekly store refill pulls finished goods from warehouse before importing.
- Store stock still refills to target when warehouse stock is insufficient.
- Save validation accepts valid industry state and rejects invalid material, recipe, or building references.

Component tests:

- The map switch exposes Retail City Map and Industry City Map.
- Industry tile inspector renders allowed buildings for an empty resource tile.
- Industry tile inspector renders placement block reasons for invalid buildings.
- Built industrial tile view shows input, output, and latest production status.
- Warehouse view shows capacity, stored units, overflow, and cost.

E2E tests:

- Start a new game.
- Switch to Industry City Map.
- Place the first Convenience chain buildings on valid resource/industrial tiles.
- Advance days until finished goods enter warehouse stock.
- Return to Retail City Map.
- Advance to a weekly refill.
- Verify a store product refills from warehouse first and only imports the shortfall.

## Implementation Boundary

The first implementation should deliver a playable Convenience chain slice with the full architecture in place:

- Industrial map.
- Strict resource placement.
- Convenience raw, intermediate, and finished materials.
- Warehouses and overflow cost.
- Daily automatic production.
- Weekly shop refill from warehouse then import fallback.
- Reports and tests for the full first-slice loop.

The broader chain catalog for all 12 categories should be represented in the design and can be added incrementally after the first slice is verified.
