# City-Local Inventory, Production, and Replenishment — Design

**Date:** 2026-08-02  
**Status:** Approved for implementation planning; review clarifications incorporated  
**Linear:** [HPA-292](https://linear.app/cwchanap/issue/HPA-292/implement-city-local-inventory-production-and-replenishment)

## Summary

Replace Serpens' single global warehouse with durable inventory owned by each
opened industrial city. Existing industrial production, building buffers, and
rail shipping continue to operate inside one city, while retail cities gain an
explicit supply-city assignment used by weekly replenishment. Any shortage or
unavailable source falls back to paid imports with visible attribution.

This is the first playable slice of the inter-city logistics program. It makes
location meaningful without introducing transfer orders, transit time,
recurring routes, vehicle capacity, or route operations. Those mechanics remain
owned by HPA-294 and build on the city-inventory and retail-assignment contracts
defined here.

The implementation must preserve existing one-city production, cost, rounding,
rail, retail, processing-order, and cash-reconciliation behavior. Supported v12
saves migrate to v13 without duplicating or dropping a single material unit.

## Review clarifications

The following implementation details are now explicit:

| Area | Decision |
| --- | --- |
| Historical replenishment evidence | Reconstruct from numerical local/import fields **plus** the migrated assignment and source-capability state |
| Inventory helper ownership | Replace and remove the five global warehouse helpers; do not leave compatibility wrappers in merged code |
| City-ID typing | Keep existing operational `cityId` fields as `string`; accessors accept `string`, validate against the catalog, and narrow internally |
| Retail contention | Preserve `GameState.stores` and `Store.products` relative order within each city; do not sort IDs |
| Capacity synchronization | Every transition that can change warehouse capacity must synchronize the owning city before returning |
| Scenario validation | Replace `validateWarehouseCapacity` with per-city capacity and assignment validators |
| E2E setup | Use a deterministic pre-unlocked multi-city fixture so the test targets logistics, not milestone progression |
| Symbol names | Rename weekly-import APIs to weekly-replenishment APIs and remove the old names |

## Decisions made during planning

| Question | Decision |
| --- | --- |
| Inventory ownership | Persist one `CityInventory` for every opened inventory-capable industrial city |
| Retail assignment granularity | Persist one supply source per retail city, not per store |
| Inventory representation | Use deterministically ordered arrays, not string-keyed records |
| Industrial movement | Preserve building buffers and same-city rail movement; never inspect another city's stock |
| Retail movement in this slice | Debit the configured supply city immediately during weekly replenishment |
| Insufficient supply | Consume available local stock, import the exact shortage, and report both |
| Missing or unavailable source | Preserve the assignment, mutate no city inventory, and import all required units |
| Automatic reassignment | Never change a supply assignment during the daily tick |
| Legacy stock migration | Move all v12 global stock exactly once to one deterministic eligible industrial city |
| Legacy destination tie-break | Greatest warehouse capacity, then active industrial city, then world-catalog order, then plain ID |
| No eligible legacy destination | Empty stock may migrate; nonempty stock is rejected rather than lost or assigned to an invented city |
| Report compatibility | Keep existing scalar warehouse totals as explicit cross-city aggregates and add city-attributed evidence |
| Delivery | One end-to-end HPA-292 implementation branch and PR; no separately shippable partial model |

## Goals

- Make inventory quantity, capacity, used capacity, overflow, and overflow cost
  independent for every opened industrial city.
- Ensure warehouse-building capacity affects only the building's city.
- Keep industrial production and rail movement strictly city-local.
- Let every opened retail city select one opened industrial city as its supply
  source, or explicitly use imports only.
- Keep fallback imports visible in product reports, production reports, cash
  flow, and player-facing UI.
- Preserve deterministic simulation for the same state and action sequence.
- Preserve existing one-city throughput, recipe scaling, rounding, operating
  cost, import cost, rail budget, store order, product order, and target-stock
  formulas.
- Migrate supported saves and embedded scenario game states with exact material
  conservation and deterministic historical attribution.
- Provide accessible inspection, assignment, empty, and unavailable states.
- Establish stable ownership and attribution contracts for HPA-294 transfers and
  recurring routes.

## Non-goals

- Transfer orders or an in-transit inventory ledger.
- Dispatch dates, arrival dates, transport lead times, or delivery ETAs.
- Recurring routes, route cadence, priority, capacity, reliability, cost, or
  utilization.
- Route creation or route visualization on the world map.
- Automatic source optimization or automatic reassignment.
- Fair-share or proportional allocation across competing retail cities.
- A new `logistics` world-city kind.
- Supply-planner forecasts, available-to-promise calculations, or recommended
  transfers.
- Closing cities as a new player command. Runtime and persistence semantics are
  still defined for a configured source that is no longer open.
- Narrowing every existing `string` city field to `WorldCityId`; that broader
  type cleanup is not required to deliver this feature.

## Current-system constraints

The current warehouse is a single `GameState.warehouse` value used by:

- industrial production and overflow charging;
- same-city rail pulls and pushes;
- weekly retail replenishment;
- daily cash and report reconciliation;
- world unlock checks;
- supply-advisor and product-chain views;
- scenario setup, metrics, validation, and persistence;
- strict sandbox and embedded scenario save codecs;
- industry inspectors and reports.

Changing only the state field would leave operational paths sharing stock across
cities or reporting totals from the wrong scope. HPA-292 is complete only when
every operational reader and writer uses the city-local model end to end.

## Domain model

### Persisted city inventory

Replace `GameState.warehouse` with deterministically ordered city records:

```ts
export interface CityInventory {
	cityId: WorldCityId;
	capacity: number;
	materials: Partial<Record<MaterialId, number>>;
	overflowUnits: number;
	overflowCost: number;
}

export interface RetailSupplyAssignment {
	retailCityId: WorldCityId;
	supplyCityId: WorldCityId | null;
}

export interface GameState {
	// existing fields...
	cityInventories: CityInventory[];
	retailSupplyAssignments: RetailSupplyAssignment[];
}
```

Arrays are intentional. They let the save codec reject duplicates, validate one
entry at a time, and require canonical catalog ordering. A record keyed by an
unvalidated string could silently overwrite a duplicate city during decoding.

### City-ID typing boundary

The new persisted ownership fields use `WorldCityId`, but current operational
entities retain their existing `string` IDs:

- `GameState.activeCityId`;
- `GameState.activeIndustryCityId`;
- `Store.cityId`;
- `IndustrialBuilding.cityId`;
- `IndustryTile.cityId`;
- `IndustryCity.id`;
- `City.id`.

Do not widen HPA-292 into a repository-wide type migration. Public capability
and access helpers accept `string`, resolve the ID through the world catalog,
and narrow to `WorldCityId` only after validation:

```ts
export function getCityInventory(
	game: Pick<GameState, 'world' | 'industryCities' | 'cityInventories'>,
	cityId: string
): CityInventoryAccessResult;
```

The same rule applies before using `building.cityId`, `store.cityId`, or an
active-city field as a key in `Map<WorldCityId, ...>`. An unknown string returns
a typed failure. Production code must not use unchecked `as WorldCityId` casts.

Persisted `CityInventory.cityId`, `RetailSupplyAssignment.retailCityId`, and
non-null `supplyCityId` remain strict `WorldCityId` values.

### Inventory-capable cities

In v1, a city supports inventory when all of the following are true:

1. the city ID exists in `WORLD_CITY_CATALOG`;
2. its catalog kind is `industry`;
3. it appears in `game.world.openedCityIds`;
4. its generated `IndustryCity` exists in `game.industryCities`.

Put this rule behind `supportsCityInventory(...)` and related lookup helpers.
Callers must not inline catalog-kind or opened-state checks. A future logistics
city kind can then extend one capability function without changing production,
retail, persistence, and UI call sites.

### Canonical ordering

`cityInventories` and `retailSupplyAssignments` are ordered by:

1. `WORLD_CITY_CATALOG` position;
2. plain code-unit ID comparison as a defensive tie-break.

Domain transitions preserve this order. Simulation tie-breaks never use
`localeCompare`.

### Typed inventory access

Create `src/lib/game/cityInventory.ts` as the only inventory mutation boundary:

```ts
export type CityInventoryAccessFailure =
	| 'unknown-city'
	| 'city-closed'
	| 'unsupported-city'
	| 'inventory-missing';

export type CityInventoryAccessResult =
	| { ok: true; cityId: WorldCityId; inventory: CityInventory; index: number }
	| { ok: false; reason: CityInventoryAccessFailure };
```

The module owns:

- capability and access resolution;
- catalog-safe string-to-`WorldCityId` narrowing;
- used-capacity calculation;
- warehouse capacity derived from same-city buildings;
- overflow and overflow-cost calculation;
- add/remove receipts and shortage calculation;
- immutable replacement in `GameState`;
- one-city and all-city capacity synchronization;
- deterministic default-source selection;
- canonical inventory and assignment ordering;
- inventory and material-conservation assertions shared by simulation, scenario
  setup, and persistence.

Unknown, closed, unsupported, and missing city IDs return a typed failure. They
never fall through to an arbitrary inventory and never throw from ordinary
simulation paths.

### Global helper replacement

The existing global warehouse helpers are replaced rather than retained as
wrappers:

| Remove from `industryProduction.ts` | Replace in `cityInventory.ts` |
| --- | --- |
| `getWarehouseUsed` | `getCityInventoryUsed` |
| `recalculateWarehousePressure` | `recalculateCityInventoryPressure` |
| `addWarehouseMaterial` | `addCityInventoryMaterial` |
| `removeWarehouseMaterial` | `removeCityInventoryMaterial` |
| `getWarehouseCapacity` | `getCityWarehouseCapacity` |
| `WAREHOUSE_OVERFLOW_COST_PER_UNIT` | move unchanged to `cityInventory.ts` |

`addCityInventoryMaterial` and `removeCityInventoryMaterial` operate on one
`CityInventory` value. They do not resolve a city or mutate `GameState`.
`replaceCityInventory` folds the returned inventory back into the canonical
array.

All existing callers must move to the city-scoped API:

- rail shipping resolves the producer or consumer city before reading stock;
- industrial production synchronizes and folds each city's working inventory;
- retail sourcing moves out of `stock.ts` into `retailSupply.ts`;
- world progression, product chains, supply advice, scenario setup/metrics, and
  save validation use explicit city scope.

The merged implementation must have no operational compatibility export named
`addWarehouseMaterial`, `removeWarehouseMaterial`,
`recalculateWarehousePressure`, `getWarehouseCapacity`, or `getWarehouseUsed`.
Leaving wrappers would preserve an attractive path back to global semantics.

### Quantity semantics

All persisted quantities, capacities, overflow units, and costs are finite
nonnegative integers.

Inventory mutation helpers canonicalize requested quantities to a finite
nonnegative integer before applying them. Adding a nonpositive quantity is a
no-op. Removing a nonpositive quantity removes zero and reports zero shortage.
The save codec remains strict and rejects malformed persisted values rather than
repairing them.

Overflow never discards stock:

```text
used          = sum(material quantities)
overflowUnits = max(0, used - capacity)
overflowCost  = overflowUnits * WAREHOUSE_OVERFLOW_COST_PER_UNIT
```

## State invariants

Every validated current-schema `GameState` satisfies these invariants.

### City inventories

- Exactly one `CityInventory` exists for every opened inventory-capable city.
- No city inventory is owned by a retail, unknown, unsupported, or closed city.
- Inventory IDs are unique and canonically ordered.
- Capacity equals the sum of `warehouseCapacity` for warehouse buildings whose
  validated `building.cityId` equals the inventory city.
- Used capacity equals the sum of material quantities.
- Overflow units and cost equal the documented formula.
- Material quantities never become negative.
- Inventory operations conserve each material except for documented production,
  recipe consumption, retail consumption, and imports.

### Retail supply assignments

- Exactly one assignment exists for every opened retail city.
- Assignment owner IDs are unique and canonically ordered.
- The assignment owner is a known opened retail city.
- `supplyCityId: null` means explicit imports-only operation.
- A non-null source must be a known inventory-capable catalog city.
- A non-null source may be closed or temporarily lack an inventory record. This
  is a valid persisted stale assignment so source-closure behavior remains
  deterministic and the player's choice is not silently erased.
- The daily tick never changes an assignment.

Pure operational functions still defend against a missing assignment record,
even though current-schema save validation requires one.

### Capacity synchronization ownership

Capacity is persisted but derived from buildings. The following operations must
synchronize capacity before returning or validating state:

- new-game initialization;
- opening an industrial city;
- building a warehouse;
- scenario setup after authored buildings are materialized;
- v12-to-v13 migration;
- current-state save and embedded-game validation;
- daily simulation before production.

Today `buildIndustrialBuilding` is the only player transition that can add
warehouse capacity. Warehouse buildings remain non-upgradeable and HPA-292 does
not add demolition. Nevertheless, any future transition that adds, removes,
moves, upgrades, or changes the type of a warehouse building must call
`synchronizeCityInventoryCapacity(game, owningCityId)` before returning.

A future capacity-changing transition cannot rely on the next daily tick to
repair state. The codec and scenario invariant checks reject a capacity mismatch.

## Initialization and city opening

### New game

A new sandbox game starts with:

- one empty `CityInventory` owned by `industry-city`;
- capacity `0`, empty materials, and zero overflow;
- one `harbor-city -> industry-city` retail supply assignment.

### Opening an industrial city

After the normal world-city opening transition generates the city map, append
one empty inventory record and derive its capacity from buildings already owned
by that city. Duplicate opening or repeated normalization must not append a
second record.

### Opening a retail city

Append one assignment for the new retail city. Its default source is selected
from currently opened, accessible inventory cities by:

1. greatest derived warehouse capacity;
2. then prefer a valid `activeIndustryCityId` on a capacity tie;
3. then world-catalog order;
4. then plain ID comparison.

If there is no eligible source, assign `null`. Opening another industrial city
later does not automatically replace existing `null` or explicit assignments.

### Building a warehouse

`buildIndustrialBuilding` synchronizes only the inventory owned by the new
building's city before returning the transition. Capacity in city A must never
change city B's pressure or overflow cost.

## Retail supply assignment command

Create `src/lib/game/retailSupply.ts` for assignment and replenishment behavior.

```ts
export type RetailSupplyAssignmentFailure =
	| 'unknown-retail-city'
	| 'retail-city-closed'
	| 'unsupported-retail-city'
	| 'unknown-supply-city'
	| 'supply-city-closed'
	| 'unsupported-supply-city';

export type RetailSupplyAssignmentResult =
	| { ok: true; game: GameState; changed: boolean }
	| { ok: false; game: GameState; reason: RetailSupplyAssignmentFailure };

export function setRetailSupplySource(
	game: GameState,
	retailCityId: string,
	supplyCityId: string | null
): RetailSupplyAssignmentResult;
```

The function accepts strings at the operational boundary and narrows internally.
Assigning a known inventory-capable but currently closed source is rejected by
the command; stale closed references are permitted only so already persisted
assignments survive source closure. Assigning the existing value succeeds with
`changed: false` and causes no autosave or success sound.

Invalid assignment attempts return the original state object. They create no
system decision, scenario revision, autosave, or success cue. UI options are
built from valid opened sources, so failures primarily protect stale commands
and corrupted runtime inputs.

Add `setRetailSupplySource` to route-controller mutation availability and to the
scenario command inventory. Each built-in scenario explicitly permits or
forbids it.

## Industrial production and rail shipping

### Preserved production precedence

For every recipe input, preserve the existing order:

1. consume the producing building's own buffer;
2. pull from reachable same-city producer buffers through rail;
3. pull from the producing city's inventory through a reachable same-city
   warehouse building;
4. import the exact remaining shortage.

Preserve current throughput, stage ordering, atomic recipe scaling, buffer
projection, rounding, operating cost, import cost, and building-status rules.

### Output flow

Produced output enters the producing building's buffer exactly as it does now.
The existing post-production rail push may move surplus output into the pooled
inventory owned by that building's city. Disconnected output remains in the
building buffer. It is never deposited into another city's inventory.

### Rail tick state

Replace the rail tick's single working warehouse with a map keyed by validated
city ID:

```ts
interface RailTickState {
	// existing per-city rail networks, budgets, buildings, and buffers...
	cityInventoriesByCityId: Map<WorldCityId, CityInventory>;
}
```

When seeding or accessing this map, validate and narrow any `string` city field
first. A consumer or producer can consider only:

- buildings whose validated `building.cityId` equals its own validated city;
- the inventory record with that same city ID;
- warehouse access buildings in that same rail network.

No candidate enumeration may read stock from another city's inventory. Candidate
ordering and path tie-break rules remain unchanged inside one city.

## Retail replenishment

Rename the operational concept and symbols from weekly imports to weekly
replenishment. The seven-day cadence, reorder threshold, target stock, category
import cost, and import-cost modifier behavior remain unchanged.

| Remove old symbol | Introduce |
| --- | --- |
| `IMPORT_INTERVAL_DAYS` | `REPLENISHMENT_INTERVAL_DAYS` |
| `isImportDay` | `isReplenishmentDay` |
| `WeeklyImportResult` | `WeeklyReplenishmentResult` |
| `applyWeeklyImports` | `applyWeeklyReplenishment` |

Product creation, sales, stock health, and product-edit helpers remain in
`stock.ts`. The renamed replenishment implementation lives in
`retailSupply.ts`. The final code does not retain aliases for the old names.

### Replenishment evidence

`DailyProductReport.replenishment` is `null` when the product did not attempt a
refill. Otherwise it contains:

```ts
export type RetailReplenishmentOutcome =
	| 'city-inventory'
	| 'mixed'
	| 'import-only'
	| 'unassigned-import'
	| 'source-unavailable-import';

export interface RetailReplenishmentEvidence {
	retailCityId: WorldCityId;
	configuredSupplyCityId: WorldCityId | null;
	resolvedSupplyCityId: WorldCityId | null;
	outcome: RetailReplenishmentOutcome;
}
```

Numerical reconciliation continues to use the existing fields:

- `warehouseUnits`: units taken from the configured city inventory;
- `warehouseValue`: local units multiplied by material `localValue`;
- `importedUnits`: the exact externally bought shortage;
- `importCost`: base per-unit category cost;
- `importSpend`: modifier-adjusted external spend.

The field names remain for save/report compatibility even though local units now
come from a named city inventory.

### Resolution rules

For a product below its reorder threshold:

1. valid source with enough stock: debit the source, import zero, report
   `city-inventory`;
2. valid source with partial stock: debit available stock, import the exact
   shortage, report `mixed`;
3. valid source with zero relevant stock: import all units, report
   `import-only`;
4. no assignment or explicit `null`: import all units, report
   `unassigned-import`;
5. unknown, closed, unsupported, or missing source inventory: retain the
   assignment, mutate no inventory, import all units, report
   `source-unavailable-import`.

A product category with no supported finished-material mapping cannot consume
local inventory. Import-cost rules apply only to `importedUnits`.

### Deterministic contention and parity

Several retail cities may debit the same source before HPA-294 adds route
capacity and priority. Resolve contention in this order:

1. retail cities by world-catalog order, then plain ID;
2. within a retail city, stores in their original relative order from
   `GameState.stores`;
3. within a store, products in their original `Store.products` order.

Do not sort store IDs or category IDs. Existing IDs such as `store-10` and
`store-2` are lexicographically different from creation order, and sorting would
change which store receives scarce local stock.

The result returns stores in original global `GameState.stores` order and
inventories in canonical city order. There is no fairness or proportional
allocation in HPA-292.

## Daily simulation order and reconciliation

The daily tick remains one pure transition:

1. compile active event/scenario import-cost rules;
2. synchronize all city inventory capacities;
3. run industrial production and same-city rail movement;
4. snapshot production-close city inventory pressure;
5. simulate retail sales by retail city;
6. on a replenishment day, resolve assignments and debit working city
   inventories before buying shortages externally;
7. build store reports and merge retail-local and import movements into the
   production report;
8. reconcile operating costs, import spend, operating cash flow, financing, and
   final cash using existing formulas;
9. persist post-replenishment city inventories in the returned `GameState`.

The existing cash invariant remains mandatory:

```text
cashAfter = cashBefore + operatingCashFlow + financingCashFlow
```

One-city golden tests must prove explicit city scoping produces the same
quantities, allocation order, costs, and cash as the former global model.

## Reporting contracts

### Movement attribution

Add `cityId` to `DailyMaterialMovement` and `RailShipment`.

- production output, recipe consumption, and industrial fallback imports use the
  industrial operation city;
- warehouse pulls use the inventory source city;
- rail shipments use the city containing the rail network and both endpoints;
- retail fallback imports use the retail destination city;
- retail local usage is also explained by replenishment evidence, which carries
  configured and resolved supply cities.

### Per-city inventory summaries

```ts
export interface DailyCityInventorySummary {
	cityId: WorldCityId;
	capacity: number;
	used: number;
	overflowUnits: number;
	overflowCost: number;
}

export interface DailyProductionReport {
	// existing fields...
	cityInventories: DailyCityInventorySummary[];
}
```

`cityInventories` is captured after industrial production and rail pushes but
before retail replenishment. This preserves the current overflow-charge timing.
Current-inventory UI reads post-replenishment `GameState.cityInventories`, not
the historical production-close snapshot.

Keep existing aggregate report fields:

- `warehouseCapacity`;
- `warehouseUsed`;
- `overflowUnits`;
- `overflowCost`.

They become sums across production-close city summaries. Financial summaries may
use these aggregates; operational UI and graphs must use explicit city records.

### World progression

Rules that previously inspected the global warehouse inspect all city
inventories. A finished-material milestone succeeds when a supported finished
material exists in any opened city inventory or was locally produced in the
latest attributed report.

## Product chains and supply advice

Scope formerly global views:

- warehouse-flow graph: `game.activeIndustryCityId`;
- category-chain views: `game.activeCityId`, its stores, and configured source;
- supply advisor: active industrial city's buildings, buffers, and inventory;
- category summaries: do not count city A capacity as local for a retail city
  assigned to city B;
- stale, unassigned, zero-capacity, and empty sources produce explicit states.

Switching cities through the world map changes scope. HPA-292 does not add a
second selector inside every graph.

## Scenario integration

Scenario runs continue to wrap ordinary `GameState`.

### Starting blueprint

Replace the global override:

```ts
warehouseMaterials?: Partial<Record<MaterialId, number>>;
```

with:

```ts
cityInventoryMaterials?: readonly {
	cityId: WorldCityId;
	materials: Partial<Record<MaterialId, number>>;
}[];

retailSupplyAssignments?: readonly {
	retailCityId: WorldCityId;
	supplyCityId: WorldCityId | null;
}[];
```

Scenario setup creates and opens cities/buildings through existing factories,
synchronizes capacities, applies validated city material overrides, applies
explicit/default assignments, recalculates pressure, and validates the complete
game.

### Scenario validators

Replace the existing global `validateWarehouseCapacity` path with:

```ts
validateCityInventoryCapacities(game, blueprint)
validateRetailSupplyAssignments(game, blueprint)
```

`validateCityInventoryCapacities` validates each authored city independently
against same-city warehouse buildings and rejects duplicates, unknown/closed
cities, negative quantities, and overflowed authored starts.

`validateRetailSupplyAssignments` validates one assignment per opened retail
city, owner/source capability, duplicates, and canonical ordering.

The implementation may split these into singular internal helpers, but these
aggregate responsibilities and names must be visible at the scenario-validation
boundary so the former global check cannot survive accidentally.

### Metrics

Replace ambiguous global warehouse metrics with:

```ts
{
	metric: 'city-inventory-quantity';
	cityId: WorldCityId;
	materialId: MaterialId;
}
```

No metric implicitly sums every city unless a future metric explicitly requests
aggregation.

### Commands and persistence

Add `setRetailSupplySource` to `ScenarioCommand` and capability checks. Embedded
v12 `GameState` values run the same v12-to-v13 migration and current validation
as sandbox saves. The scenario store's outer schema remains unchanged when its
existing embedded-game-version mechanism can carry v13 safely.

## Persistence and migration

Bump `SAVE_SCHEMA_VERSION` from `12` to `13`. Add v12 to the migratable set and
run one warehouse-shape migration before current v13 validation.

### Eligible destination set

Eligible IDs are the intersection of:

- generated `game.industryCities`;
- `game.world.openedCityIds`;
- known catalog industrial cities;
- cities accepted by the capability rule.

Create one empty inventory for each eligible city in canonical order. Derive
capacity only from warehouse buildings whose validated `building.cityId`
matches that city.

### Legacy stock destination

Choose one destination by:

1. greatest derived warehouse capacity;
2. prefer a valid `activeIndustryCityId` on a capacity tie;
3. world-catalog order;
4. plain ID comparison.

A stale active city does not participate. Empty legacy materials require no
destination. Nonempty materials with no eligible city reject with a dedicated
city-inventory invariant error.

Copy every material quantity exactly once into the selected destination and
recalculate pressure independently.

### Default retail assignments

Create one assignment for every opened known retail city. Use the same
deterministic eligible source selector; use `null` when none exists. This
migration default does not establish automatic reassignment.

### Historical report attribution

Migrate historical data without changing numerical totals:

- production movements without recoverable context use the selected legacy
  destination;
- rail shipments use the city resolved from `fromId`/`toId` building references,
  falling back to the selected destination only when necessary;
- retail destination city is derived from each `DailyStoreReport.storeId`;
- legacy local replenishment uses the migrated default source;
- retail import movements are rebuilt from product reports;
- historical replenishment outcome uses local/import quantities **together
  with** the migrated assignment and source-capability result.

Outcome reconstruction is:

| Legacy numeric evidence | Migrated assignment/capability | Outcome |
| --- | --- | --- |
| `warehouseUnits > 0`, `importedUnits = 0` | accessible non-null source | `city-inventory` |
| `warehouseUnits > 0`, `importedUnits > 0` | accessible non-null source | `mixed` |
| `warehouseUnits = 0`, `importedUnits > 0` | `supplyCityId: null` | `unassigned-import` |
| `warehouseUnits = 0`, `importedUnits > 0` | accessible non-null source | `import-only` |
| `warehouseUnits = 0`, `importedUnits > 0` | non-null source unavailable | `source-unavailable-import` |

A row containing local units requires an accessible deterministic source. If it
cannot be attributed, reject the save rather than invent a source. Reports with
no replenishment attempt keep `replenishment: null`.

The two numeric fields alone are not sufficient to distinguish all import-only
outcomes; migration must not claim otherwise.

### Conservation check

For every `MaterialId`:

```text
sum(v13 city inventory quantity) = v12 global warehouse quantity
```

A mismatch rejects the migrated save.

### Current v13 validation

Reject:

- duplicate or noncanonical inventory IDs;
- missing records for opened eligible cities;
- records owned by unknown, retail, unsupported, or closed cities;
- duplicate/noncanonical assignment owners or missing opened-retail assignments;
- unknown or unsupported non-null source IDs;
- negative, fractional, unsafe, or nonfinite quantities/capacities;
- capacity mismatches with same-city buildings;
- incorrect overflow units or cost;
- movement/shipment attribution to unknown cities;
- replenishment evidence inconsistent with numerical fields, migrated
  assignment, or source capability.

Use dedicated `SaveDataError` codes for city inventory and retail supply
invariants.

## Player-facing UI

### Industry inventory inspection

`IndustryTileInspector` resolves the selected warehouse building's city and shows
only that city's capacity, used capacity, overflow, pressure cost, and materials.
Empty, zero-capacity, and unavailable records have distinct accessible states.

### Retail supply sources

Add `RetailSupplySources.svelte` alongside `StoreOverview`. For every opened
retail city show:

- configured source or Imports only;
- source availability;
- source used/capacity and overflow;
- a select with Imports only plus valid opened sources;
- pending, unchanged, and rejected-command behavior.

Keep a stale configured source visible as unavailable even though it is not a
valid selectable option.

### Reports and product chains

`ReportsPanel` groups production-close summaries by city and labels production,
consumption, retail-local usage, and fallback imports with city context.
`ProductChainsPanel` labels the active industrial inventory or active retail
city's configured source and explains unassigned/unavailable import operation.

### Accessibility and localization

- Stable accessible names for inventory/source sections.
- Visible labels and programmatic descriptions for selects.
- State conveyed by text, not color alone.
- Assignment controls disabled through existing mutation availability.
- All copy key-driven in every supported locale.
- No new image assets.

## Module boundaries

### New modules

| Module | Responsibility |
| --- | --- |
| `src/lib/game/cityInventory.ts` | capability, narrowing, access, mutation, capacity synchronization, pressure, ordering, conservation |
| `src/lib/game/retailSupply.ts` | assignment command, source resolution, weekly replenishment, fallback evidence |
| `src/lib/components/game/RetailSupplySources.svelte` | retail-city source management and source status |

### Primary existing modules

| Module | Change |
| --- | --- |
| `src/lib/game/types.ts` | persisted inventories, assignments, replenishment evidence, attributed reports |
| `src/lib/game/state.ts` | new-game initialization and fixtures |
| `src/lib/game/world.ts` | city-opening normalization and any-city milestones |
| `src/lib/game/industryPlacement.ts` | owning-city synchronization after construction |
| `src/lib/game/industryProduction.ts` | remove global helpers; city-scoped production and aggregate compatibility |
| `src/lib/game/railShipping.ts` | per-city working inventories and same-city candidates |
| `src/lib/game/stock.ts` | product/sales helpers only; remove weekly import implementation |
| `src/lib/game/retailSupply.ts` | renamed replenishment implementation |
| `src/lib/game/simulateDay.ts` | production/replenishment order, final fold, cash reconciliation |
| `src/lib/game/productChainGraph.ts` | active-city/configured-source scope |
| `src/lib/game/productChainTree.ts` | active retail-city/source scope |
| `src/lib/game/supplyAdvisor.ts` | active industrial-city inputs/buildings/stock |
| `src/lib/game/reports.ts` | aggregate finance plus city summaries |
| `src/lib/scenarios/*` | city-scoped setup, validators, metrics, commands, fixtures |
| `src/lib/persistence/saveTypes.ts` | schema v13 |
| `src/lib/persistence/saveCodec.ts` | v12-to-v13 migration and strict validation |
| `src/lib/persistence/scenarioCodec.ts` | embedded-game migration/validation |
| `src/routes/gameRouteController.ts` | assignment mutation and scenario commit path |
| `src/routes/+page.svelte` | assignment handler and Stores-panel composition |
| UI/i18n files | city inspection, report attribution, source copy |

Game-domain modules do not depend on Svelte, route state, current scenario, or
persistence. Persistence may call shared pure invariant helpers but owns strict
shape and exact-key validation.

## Testing strategy

### Domain tests

- Access success and every typed failure.
- String city-ID narrowing without unchecked casts.
- Add/remove receipts, shortages, integer normalization, and independent
  overflow.
- Two-city capacity isolation.
- New-game and city-opening canonical records.
- Assignment success, null, unchanged, closed-source, and invalid-source paths.
- Same-city producer/warehouse pulls and cross-city invisibility.
- All five replenishment outcomes and exact local/import quantities.
- Import-cost modifiers applied only to imported shortages.
- Shared-source contention across retail cities.
- A depleted-source fixture with at least 10 stores proving original array order:
  a `store-2` entry placed before `store-10` remains earlier despite
  lexicographic ID ordering.
- Product order remains the authored `Store.products` order.
- One-city golden fixtures preserve production, allocation, overflow, reports,
  and cash exactly.
- Aggregate report totals equal city-summary sums.

### Persistence tests

- v13 multi-city round trip.
- v12 destination selection and every tie-break.
- Empty stock with/without eligible cities.
- Nonempty stock without destination rejects.
- Stale active city ignored.
- Per-material conservation.
- Deterministic default assignments.
- Historical attribution and all five reconstruction outcomes.
- Numeric evidence that would be ambiguous without assignment/capability state.
- Duplicate IDs, missing records, malformed numbers, capacity/pressure mismatch,
  unknown endpoints, and inconsistent evidence reject.
- Browser, Tauri, in-memory, and scenario repositories preserve the shape.

### Scenario tests

- `validateCityInventoryCapacities` accepts valid per-city starts and rejects
  cross-city/global capacity assumptions.
- `validateRetailSupplyAssignments` rejects duplicates and invalid endpoints.
- Existing `warehouseMaterials` definitions migrate to explicit city overrides.
- City-scoped metric evidence remains deterministic.
- Assignment commands obey scenario capabilities.

### Component tests

- Industry inspector shows only selected-city inventory.
- Empty, zero-capacity, overflow, and unavailable states.
- Source options, Imports only, stale-source display, and pending disabling.
- Reports and product chains label cities/sources correctly.
- Keyboard, focus, labels, and status text remain accessible.

### End-to-end test

Use a deterministic test save/fixture that already has:

- a second industrial city opened;
- a second retail city opened;
- stable maps/building placements needed for the logistics flow.

Do not make the logistics e2e traverse the `breadbasket-basin` and retail-city
milestone progression. That progression is tested by world-domain coverage and
would make this test slow and brittle.

The Playwright flow then:

1. creates capacity and stock in only one industrial city;
2. assigns the second retail city to that source;
3. advances to replenishment;
4. verifies local units and fallback imports;
5. verifies the other industrial inventory is unchanged;
6. saves and reloads;
7. verifies inventories and assignments persist.

### Required validation

The implementation PR must pass:

```bash
bun run check
bun run lint
bun run test
```

Every Vitest test executes at least one `expect`. Every changed Svelte file
follows the repository-required Svelte MCP documentation and autofixer workflow.

## Alternatives rejected

### Per-store supply assignments

Rejected because they create repetitive micromanagement and HPA-294 needs a
stable city-to-city relationship.

### Narrow all city fields to `WorldCityId`

Rejected for HPA-292 because it broadens the feature into a repository-wide type
migration. Catalog-validating string accessors provide a safe boundary without
unchecked casts.

### Sort stores or products by ID

Rejected because it changes existing one-city allocation behavior and causes
`store-10` to precede `store-2`. Persisted array order is already deterministic
and is the compatibility contract.

### Keep global helper wrappers

Rejected because compatibility wrappers would let old code retain global
semantics. Callers must migrate to explicit city ownership.

### Automatic nearest or fullest source

Rejected because it hides decisions and competes with future planner/route
systems.

### Introduce transfer orders now

Rejected because dispatch, transit, arrival, cancellation, route capacity, cost,
and persistence form the shared HPA-294 lifecycle.

### Keep a compatibility global warehouse

Rejected because dual truth would permit silent cross-city consumption. Only
aggregate historical/financial report fields remain.

## Delivery boundary and follow-up

HPA-292 ships as one end-to-end implementation PR. Production, retail,
persistence, reporting, scenarios, and player surfaces all use the city-local
contract before merge.

HPA-294 consumes:

- `CityInventory` ownership and mutation helpers;
- `RetailSupplyAssignment` city relationships;
- city-attributed material movements and rail shipments;
- strict conservation and persistence validation.

HPA-294 replaces temporary immediate retail debit with explicit transfer orders
and in-transit stock. It must not move ownership back to a global pool or
reinterpret assignments as per-store state.

## Acceptance criteria

The design is implemented when:

- every opened industrial city has independent inventory and capacity;
- capacity-changing transitions synchronize the owning city before returning;
- production consumes and deposits only within the producing city;
- retail replenishment uses its configured source and visibly imports shortages;
- one-city store/product allocation order remains unchanged;
- missing, closed, unknown, unsupported, and empty sources resolve
  deterministically without corrupting state;
- no operational global warehouse helper or field remains;
- supported saves migrate without material duplication, loss, or invented
  replenishment attribution;
- cash, production, retail, inventory, and reports reconcile under existing
  formulas;
- players can inspect stock by city and manage retail-city supply sources;
- domain, persistence, scenario, component, and pre-unlocked multi-city e2e
  coverage prove the lifecycle;
- transfer orders, in-transit inventory, and recurring routes remain absent.
