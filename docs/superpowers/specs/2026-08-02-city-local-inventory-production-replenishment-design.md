# City-Local Inventory, Production, and Replenishment — Design

**Date:** 2026-08-02  
**Status:** Approved for implementation planning; first- and second-pass review clarifications incorporated  
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
owned by HPA-294 and will build on the city-inventory and retail-assignment
contracts defined here.

The implementation must preserve existing one-city production, cost, rounding,
rail, retail, and cash-reconciliation behavior. Supported v12 saves migrate to
v13 without duplicating or dropping a single material unit.

## Review clarifications

The following implementation boundaries are explicit after codebase review:

| Topic | Decision |
| --- | --- |
| Historical replenishment | Reconstruct outcomes from local/import quantities together with the migrated assignment and source-capability state; quantities alone are insufficient |
| Inventory helper ownership | Replace and remove the five global warehouse helpers; do not leave compatibility wrappers in merged code |
| City-ID typing | Keep existing operational IDs as `string`; inventory accessors accept `string`, validate against the catalog, and narrow internally |
| Store/product order | Preserve original `GameState.stores` and `Store.products` order within each retail city |
| Capacity synchronization | Every transition that can change warehouse capacity must synchronize the owning city before returning |
| Scenario validation | Replace `validateWarehouseCapacity` with per-city capacity and assignment validators |
| E2E setup | Use a deterministic pre-unlocked multi-city fixture so the test targets logistics, not milestone progression |
| Symbol names | Rename weekly-import APIs to weekly-replenishment APIs and remove the old names |

## Decisions made during planning

| Question | Decision |
| --- | --- |
| Inventory ownership | Persist one `CityInventory` for every opened inventory-capable industrial city |
| Retail assignment granularity | Persist one supply source per retail city, not per store |
| City/assignment collection representation | Store `cityInventories` and `retailSupplyAssignments` as deterministically ordered arrays |
| Material quantity representation | Keep `CityInventory.materials` as `Partial<Record<MaterialId, number>>`; a missing material key means quantity `0` |
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

The two top-level collections are arrays intentionally. They let the save codec
reject duplicate city/assignment owners, validate one entry at a time, and
require canonical catalog ordering. This does **not** apply to quantities within
one city: `CityInventory.materials` remains the existing sparse
`Partial<Record<MaterialId, number>>` pattern, with a missing key interpreted as
zero. HPA-292 must not convert material quantities to an array.

### Inventory type replacement

Remove `WarehouseInventory` from `src/lib/game/types.ts`. `CityInventory` is the
only current-state stock/capacity/pressure shape after v13; do not keep
`WarehouseInventory` as an alias, compatibility wrapper, UI type, or repository
DTO. `DailyCityInventorySummary` is a report projection, not another mutable
inventory shape. The legacy scalar report fields remain numbers for report/save
compatibility.

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

Do not narrow all of those fields as part of HPA-292. Public inventory/capability
helpers accept `string`, resolve the world definition, and narrow internally:

```ts
export function supportsCityInventory(game: GameState, cityId: string): boolean;
export function getCityInventory(game: GameState, cityId: string): CityInventoryAccessResult;
export function getCityWarehouseCapacity(game: GameState, cityId: string): number;
```

When lookup succeeds, the returned record's `cityId` is the canonical
`WorldCityId`. Internal maps may use `Map<WorldCityId, CityInventory>`, but their
keys are created only after successful narrowing. Production and rail code must
not solve the mismatch with unchecked `as WorldCityId` casts.

The assignment command also accepts strings at the route/domain boundary and
narrows before writing persisted values:

```ts
export function setRetailSupplySource(
	game: GameState,
	retailCityId: string,
	supplyCityId: string | null
): RetailSupplyAssignmentResult;
```

### Inventory-capable cities

A city supports inventory when:

1. the ID exists in `WORLD_CITY_CATALOG`;
2. the catalog kind is `industry`;
3. it is in `game.world.openedCityIds`;
4. its generated `IndustryCity` exists in `game.industryCities`.

Put this rule behind `supportsCityInventory(...)`. Callers do not inline the
catalog/opened/generated checks. A future logistics-city kind can extend the
capability function without changing all callers. HPA-292 does not add that
kind: `WorldCityDefinition.kind` remains exactly `'retail' | 'industry'`.

### Canonical ordering

`cityInventories` and `retailSupplyAssignments` are ordered by:

1. `WORLD_CITY_CATALOG` position;
2. plain code-unit ID comparison as a defensive tie-break.

Domain transitions preserve this order. Simulation tie-breaks never use
`localeCompare`.

### Typed inventory access and mutation

Create `src/lib/game/cityInventory.ts` as the only inventory mutation boundary:

```ts
export type CityInventoryAccessFailure =
	| 'unknown-city'
	| 'city-closed'
	| 'unsupported-city'
	| 'inventory-missing';

export type CityInventoryAccessResult =
	| { ok: true; inventory: CityInventory; index: number }
	| { ok: false; reason: CityInventoryAccessFailure };

export interface RemoveCityInventoryMaterialResult {
	inventory: CityInventory;
	quantityRemoved: number;
	shortage: number;
}
```

The module owns:

- catalog validation and `WorldCityId` narrowing;
- capability/access resolution;
- used-capacity calculation;
- warehouse capacity derived from same-city buildings;
- overflow/overflow-cost calculation;
- add/remove receipts and shortage calculation;
- immutable replacement in `GameState`;
- one-city and all-city capacity synchronization;
- deterministic default-source selection;
- inventory/conservation assertions shared by simulation, scenarios, and codec.

Unknown, closed, unsupported, and missing IDs return typed failure. Ordinary
simulation paths do not throw or fall back to another inventory.

### Existing helper replacement

The existing global exports are removed and all callers migrate in the same PR:

| Remove from `industryProduction.ts` | Replacement in `cityInventory.ts` |
| --- | --- |
| `getWarehouseUsed` | `getCityInventoryUsed` |
| `recalculateWarehousePressure` | `recalculateCityInventoryPressure` |
| `addWarehouseMaterial` | `addCityInventoryMaterial` |
| `removeWarehouseMaterial` | `removeCityInventoryMaterial` |
| `getWarehouseCapacity` | `getCityWarehouseCapacity` |
| `WAREHOUSE_OVERFLOW_COST_PER_UNIT` | move unchanged to `cityInventory.ts` |

`getCityWarehouseCapacity(game, cityId)` sums only warehouse buildings whose
validated `building.cityId` equals the narrowed city. The add/remove functions
accept a `CityInventory` and return a `CityInventory`; they do not reach into
`GameState` or choose a city implicitly.

Do not keep deprecated wrappers named `addWarehouseMaterial`,
`removeWarehouseMaterial`, `recalculateWarehousePressure`,
`getWarehouseCapacity`, or `getWarehouseUsed`. A wrapper would preserve the
ambiguous global seam the ticket is intended to remove.

### Quantity semantics

All persisted quantities, capacities, overflow units, and costs are finite
nonnegative integers. Mutation helpers canonicalize requested quantities to
finite nonnegative integers. The codec remains strict and rejects malformed
persisted values.

Overflow never discards stock:

```text
used          = sum(material quantities)
overflowUnits = max(0, used - capacity)
overflowCost  = overflowUnits * WAREHOUSE_OVERFLOW_COST_PER_UNIT
```

## State invariants

### City inventories

- Exactly one record exists for every opened inventory-capable city.
- No record is owned by a retail, unknown, unsupported, or closed city.
- IDs are unique and canonically ordered.
- Capacity equals the sum of same-city warehouse-building capacity.
- Used capacity equals the sum of material quantities.
- Overflow units and cost equal the documented formula.
- Quantities never become negative.
- Inventory operations conserve material except for documented production,
  recipe consumption, retail consumption, and imports.

### Retail supply assignments

- Exactly one assignment exists for every opened retail city.
- Assignment owner IDs are unique and canonically ordered.
- The assignment owner is a known opened retail city.
- `supplyCityId: null` means Imports only.
- A non-null source is a known inventory-capable catalog city.
- A non-null source may be closed or temporarily lack an inventory record. This
  stale assignment remains persisted so the player's choice is not erased.
- The daily tick never changes an assignment.

Pure operational functions still defend against a missing assignment record,
even though current-schema save validation requires one.

### Capacity synchronization ownership

Capacity is persisted but derived from buildings. Both synchronization helpers
are pure and idempotent:

```ts
synchronizeCityInventoryCapacity(game, cityId)
synchronizeAllCityInventoryCapacities(game)
```

The city-specific helper is required at the end of every capacity-changing
transition. The all-city helper is required at industrial-production entry so
direct callers—not only `simulateDay`—receive normalized capacity before any
production or overflow calculation. In the daily-order list, the capacity-sync
step is fulfilled by `simulateIndustryProduction` calling that helper at entry;
`simulateDay` must not maintain a second capacity formula or a redundant
independent implementation.

The following paths must synchronize or recompute expected capacity:

- new-game initialization;
- opening an industrial city;
- building a warehouse;
- scenario setup after authored buildings are materialized;
- v12-to-v13 migration;
- industrial-production entry;
- current-state save and embedded-game validation.

Today `buildIndustrialBuilding` is the only player transition that can add
warehouse capacity. Warehouse buildings remain non-upgradeable and HPA-292 does
not add demolition. Nevertheless, any future transition that adds, removes,
moves, upgrades, or changes the type of a warehouse building must call
`synchronizeCityInventoryCapacity(game, owningCityId)` before returning.

A future capacity-changing transition cannot rely on the next daily tick to
repair state. Codec and scenario validation recompute the expected value without
mutating the candidate state and reject a mismatch. There is one capacity
derivation implementation in `cityInventory.ts`, not separate transition,
production, scenario, and codec formulas.

## Initialization and city opening

### New game

A new game starts with:

- one empty inventory for `industry-city`;
- capacity/overflow zero;
- `harbor-city -> industry-city` supply assignment.

### Opening an industrial city

After map generation, append one empty synchronized inventory record. Repeated
opening/normalization does not duplicate it.

### Opening a retail city

Append one assignment. Select its default source from accessible inventory
cities by:

1. greatest derived capacity;
2. active industrial city on a capacity tie;
3. catalog order;
4. plain ID.

If no source is eligible, use `null`. Later city openings do not automatically
change existing assignments.

### Building a warehouse

`buildIndustrialBuilding` synchronizes only the new building's owning city before
returning. Capacity in another city is unchanged.

## Retail supply assignment command

Create `src/lib/game/retailSupply.ts`:

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
```

Assigning a known but closed source is rejected by the command. Stale closed
references are accepted only when decoding already-persisted assignments.
Assigning the current value succeeds with `changed: false` and produces no save
or success cue.

Invalid commands return the original object and produce no decision, revision,
autosave, or success cue. Add the command to route mutation availability and the
scenario command inventory.

## Industrial production and rail shipping

### Preserved precedence

For each recipe input:

1. own building buffer;
2. reachable same-city producer buffer through rail;
3. producing city's inventory through a reachable same-city warehouse building;
4. imported shortage.

Preserve throughput, stage order, atomic scaling, projection, rounding, costs,
and building-status rules.

### Output flow

Output enters the producer buffer. Existing post-production rail push may move
surplus into the producing city's inventory. Disconnected output remains in the
buffer. It never enters another city's inventory.

### Rail tick state

Replace the single working warehouse with:

```ts
interface RailTickState {
	// existing fields...
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

Numerical reconciliation keeps existing fields:

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

This has two explicit compatibility levels:

- **One retail city:** allocation order and numerical results are bit-for-bit
  compatible with today's global `game.stores` / `store.products` traversal.
- **Multiple retail cities sharing one source:** city-catalog-first grouping is
  an intentional new policy and may differ from today's globally interleaved
  store order. For example, global order `harbor A, campus B, harbor C` resolves
  as `harbor A, harbor C, campus B`.

The result still returns stores in original global `GameState.stores` order and
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
Multi-city tests separately lock the intentional city-catalog-first contention
policy; the spec does not claim global interleaving parity once stores span
multiple retail cities.

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

Authored scenario blueprints are TypeScript catalog/test data, not legacy
`GameState` payloads. Update every in-tree definition and fixture to the new
fields in the same implementation PR, then remove `warehouseMaterials` from
`ScenarioStartBlueprint`, exact-key validation, and setup. There is no runtime
dual-read alias and no scenario-definition migration for this field.

Scenario setup creates and opens cities/buildings through existing factories,
synchronizes capacities, applies validated city material overrides, applies
explicit/default assignments, recalculates pressure, and validates the complete
game. Only persisted sandbox/embedded **GameState** v12 values use the v12-to-v13
save migration.

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

### Scenario schema compatibility

Apply this identifier policy:

| Existing identifier | HPA-292 result | Compatibility rule |
| --- | --- | --- |
| `warehouse-quantity` | `city-inventory-quantity` with `cityId` and `materialId` | Remove the old union member, evaluator branch, validator support, and scenario-codec allowlist. Update in-tree tests/fixtures. Current-schema input using the old metric is hard-rejected. |
| `completed-retail-import-cycles` | unchanged | It counts completed seven-day replenishment cadences, not the source type. Its evaluator switches to `isReplenishmentDay`, but its persisted/public metric ID stays stable. |
| `retail-import-spend` / `retail-imported-units` | unchanged | They still mean externally purchased fallback imports. |
| `retail-local-units` / `retail-local-share` | unchanged | “Local” now means units supplied from the configured city inventory. |
| `warehouseUnits` / `warehouseValue` report fields | unchanged | Legacy/internal numerical reconciliation fields; player-facing copy does not call them a global warehouse. |

No built-in published scenario definition currently uses `warehouse-quantity`.
Scenario definitions live in the TypeScript catalog, so they are updated in-tree
rather than dual-read at runtime. The scenario share code encodes only
`ScenarioDefinitionRef` plus seed; it contains no metric enum and needs no format
change. Scenario-store evaluations are validated against the resolved immutable
definition. Because no supported definition can legitimately produce old
`warehouse-quantity` evidence, such current-schema evidence is rejected rather
than rewritten. If a future published definition uses a renamed metric, that
change requires a new definition version and, if necessary, an outer scenario
store migration.

The replacement query is:

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
as sandbox saves. The scenario store's outer schema remains unchanged because
the supported definitions and share-code format do not embed a legacy inventory
query that needs rewriting.

## Relationship to the multi-cities design

This design supersedes the inventory decision in
`docs/superpowers/specs/2026-05-30-multi-cities-design.md` that kept warehouse
inventory company-wide. HPA-292 makes inventory/capacity city-local while cash,
debt, staff pool, reports, and `storeCap` remain company-wide. Product-chain
management remains company-wide, although individual graph views are scoped by
the active retail/industrial city as defined above. The world catalog kind
remains `'retail' | 'industry'`.

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

### Player-facing terminology

Persisted/report field names remain compatible, but visible copy uses:

- **City inventory** for pooled stock/capacity owned by an industrial city;
- **Local supply** for units consumed from the configured city inventory;
- **External imports** for paid fallback units;
- **Warehouse building** only for the physical industrial building that grants
  capacity or rail access.

Do not render generic global phrases such as “N warehouse” for
`warehouseUnits`. Update i18n keys, component assertions, and Playwright text
expectations to the new terminology. Internal/save fields such as
`warehouseUnits`, `warehouseValue`, `warehouseCapacity`, and `warehouseUsed`
retain their names and must not leak into player copy.

### Missing assignment versus explicit Imports only

`unassigned-import` intentionally covers the same operational refill result for
an explicit `supplyCityId: null` and the defensive case where the assignment
record is missing. Current-schema validation rejects a missing assignment record,
so this distinction is not persisted in product-report outcomes. Live management
UI still distinguishes them:

- explicit `null`: **Imports only**;
- missing record/access failure: **Supply configuration unavailable**.

The latter is an invalid-state fallback, not a selectable mode.

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
- Shared-source contention across retail cities, including global order `harbor A, campus B, harbor C` resolving as `harbor A, harbor C, campus B`.
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
- Every in-tree authored `warehouseMaterials` blueprint/fixture is rewritten to explicit city overrides; setup and validation hard-reject the removed key with no runtime dual-read path.
- City-scoped metric evidence remains deterministic.
- `warehouse-quantity` is removed from unions/evaluator/validation/codec
  allowlists and hard-rejected; `completed-retail-import-cycles` remains stable.
- Share-code round trips remain byte-for-byte compatible because codes contain
  only definition ref and seed.
- Assignment commands obey scenario capabilities.

### Component tests

- Industry inspector shows only selected-city inventory.
- Empty, zero-capacity, overflow, and unavailable states.
- Source options, Imports only, stale-source display, and pending disabling.
- Reports and product chains label cities/sources correctly and never expose generic global “warehouse” copy for local-supply units.
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

## Delivery staging inside the single PR

HPA-292 remains one feature PR, but implementation follows reviewer gates rather
than one undifferentiated change:

1. one-city golden locks and core city-inventory types/helpers;
2. production and rail scoping;
3. retail assignment and replenishment;
4. v12-to-v13 persistence and historical attribution;
5. scenario types, validators, metrics, and codecs;
6. UI/i18n surfaces;
7. multi-city e2e and full verification.

Each gate must leave its owned tests green. The implementation plan attached to
HPA-292 contains the detailed task/commit sequence.

## Alternatives rejected

### Per-store assignments

The current simulation groups stores by retail city, per-store settings would add
micromanagement, and HPA-294 needs a city-to-city route relationship.

### String-keyed city inventory record

Duplicate keys could be overwritten before validation. Canonical arrays are a
stronger persisted contract.

### Automatic nearest/fullest source

It hides decisions, changes outcomes without a command, and conflicts with
future planning/route systems.

### Add transfers now

Dispatch, transit, arrival, cancellation, capacity, cost, and persistence form
one lifecycle owned by HPA-294.

### Keep a compatibility global warehouse

Dual truth would let old code continue cross-city consumption. v13 removes the
operational global field; only aggregate report fields remain.

## Delivery boundary and HPA-294

HPA-292 ships as one end-to-end implementation PR. Intermediate commits may be
reviewed independently, but no partial data model is complete.

HPA-294 consumes:

- `CityInventory` ownership/mutation;
- retail-city supply assignments;
- attributed movements/shipments;
- conservation and persistence validation.

HPA-294 replaces immediate retail debit with explicit transfer orders and
in-transit stock. It must not restore a global pool or per-store assignment.

## Acceptance criteria

- Every opened industrial city has independent inventory/capacity.
- One city's warehouse buildings never affect another city's pressure.
- Production consumes/deposits only inside its city.
- Retail uses its configured source and visibly imports shortages.
- Missing/closed/unknown/unsupported/empty sources resolve deterministically.
- No operational global warehouse helper or field remains.
- Supported saves migrate without material duplication or loss.
- Cash, production, retail, inventory, and reports reconcile.
- Players inspect stock by city and manage retail-city sources.
- Domain, persistence, component, and e2e coverage proves the lifecycle.
- Transfer orders, in-transit inventory, and recurring routes remain absent.
