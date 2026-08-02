# City-Local Inventory, Production, and Replenishment — Design

**Date:** 2026-08-02  
**Status:** Approved for implementation planning  
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
- Preserve all existing production throughput, recipe scaling, rounding,
  operating-cost, import-cost, rail-budget, and retail target-stock formulas.
- Migrate supported saves and embedded scenario game states with exact material
  conservation.
- Provide accessible inspection, assignment, empty, and unavailable states.
- Establish stable ownership and attribution contracts for HPA-294 transfers and
  recurring routes.

## Non-goals

- Transfer orders or an in-transit inventory ledger.
- Dispatch dates, arrival dates, transport lead times, or delivery ETAs.
- Recurring routes, route cadence, route priority, route capacity, reliability,
  route cost, or route utilization.
- Route creation or route visualization on the world map.
- Automatic source optimization or automatic reassignment.
- Fair-share allocation across competing retail cities. V1 uses a documented
  deterministic processing order.
- A new `logistics` world-city kind. Current industrial cities are the only
  inventory-capable cities in this release.
- Supply-planner forecasts, available-to-promise calculations, or recommended
  transfers. Those remain HPA-297 scope.
- Closing cities as a new player command. Runtime and persistence semantics are
  nevertheless defined for a configured source that is no longer open.

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
	| { ok: true; inventory: CityInventory; index: number }
	| { ok: false; reason: CityInventoryAccessFailure };
```

The module owns these responsibilities:

- capability and access resolution;
- used-capacity calculation;
- warehouse capacity derived from same-city buildings;
- overflow and overflow-cost calculation;
- add/remove receipts and shortage calculation;
- immutable replacement in `GameState`;
- one-city and all-city capacity synchronization;
- deterministic default-source selection;
- inventory and material-conservation assertions shared by the simulation,
  scenario setup, and save codec.

Unknown, closed, unsupported, and missing city IDs return a typed failure. They
never fall through to an arbitrary inventory and never throw from ordinary
simulation paths.

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

Move `WAREHOUSE_OVERFLOW_COST_PER_UNIT` and global warehouse pressure helpers
out of `industryProduction.ts` into `cityInventory.ts`.

## State invariants

Every validated current-schema `GameState` satisfies all of these invariants:

### City inventories

- Exactly one `CityInventory` exists for every opened inventory-capable city.
- No city inventory is owned by a retail, unknown, unsupported, or closed city.
- Inventory IDs are unique and canonically ordered.
- Capacity equals the sum of `warehouseCapacity` for warehouse buildings whose
  `building.cityId` equals the inventory city.
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
  is a valid persisted stale assignment so source-closure behavior can remain
  deterministic and the player's choice is not silently erased.
- The daily tick never changes an assignment.

Pure operational functions still defend against a missing assignment record,
even though current-schema save validation requires one. This protects scenario
fixtures, tests, and future transitions from state corruption.

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
2. then prefer `activeIndustryCityId` on a capacity tie;
3. then world-catalog order;
4. then plain ID comparison.

If there is no eligible source, assign `null`. Opening another industrial city
later does not automatically replace existing `null` or explicit assignments.

### Building a warehouse

`buildIndustrialBuilding` synchronizes only the inventory owned by the new
building's city before returning the transition. Capacity in city A must never
change city B's pressure or overflow cost.

Current warehouse buildings cannot be upgraded because they have no recipe.
Keep that behavior. Add a regression guard so any future warehouse upgrade path
must synchronize the owning city before it can return a valid state.

## Retail supply assignment command

Create `src/lib/game/retailSupply.ts` for assignment and replenishment behavior.
The player-facing command accepts a retail city and either an inventory-capable
source city or `null`:

```ts
export type RetailSupplyAssignmentFailure =
	| 'unknown-retail-city'
	| 'retail-city-closed'
	| 'unsupported-retail-city'
	| 'unknown-supply-city'
	| 'unsupported-supply-city';

export type RetailSupplyAssignmentResult =
	| { ok: true; game: GameState; changed: boolean }
	| { ok: false; game: GameState; reason: RetailSupplyAssignmentFailure };

export function setRetailSupplySource(
	game: GameState,
	retailCityId: WorldCityId,
	supplyCityId: WorldCityId | null
): RetailSupplyAssignmentResult;
```

Assigning a known inventory-capable but currently closed source is rejected by
the command; stale closed references are permitted only so already persisted
assignments survive source closure. Assigning the existing value succeeds with
`changed: false` and causes no autosave or success sound.

Invalid assignment attempts return the original state object. They create no
system decision, scenario revision, autosave, or success cue. UI options are
built from valid opened sources, so failures are primarily a stale-command and
runtime-safety boundary.

Add `setRetailSupplySource` to the route controller's mutation availability and
to the scenario command inventory. Each built-in scenario explicitly permits or
forbids it; there is no implicit scenario bypass.

## Industrial production and rail shipping

### Preserved production precedence

For every recipe input, preserve the existing order:

1. consume the producing building's own buffer;
2. pull from reachable same-city producer buffers through rail;
3. pull from the producing city's inventory through a reachable same-city
   warehouse building;
4. import the exact remaining shortage.

Preserve all current throughput, stage ordering, atomic recipe scaling, buffer
projection, rounding, operating cost, import cost, and building-status rules.

### Output flow

Produced output enters the producing building's buffer exactly as it does now.
The existing post-production rail push may move surplus output into the pooled
inventory owned by that building's city. Disconnected output remains in the
building buffer. It is never deposited into another city's inventory.

This interpretation preserves the current meaningful rail requirement while
satisfying city ownership: every warehouse deposit and pull is resolved against
the building's city.

### Rail tick state

Replace the rail tick's single working warehouse with a map keyed by city ID:

```ts
interface RailTickState {
	// existing per-city rail networks, budgets, buildings, and buffers...
	cityInventoriesByCityId: Map<WorldCityId, CityInventory>;
}
```

A consumer or producer can consider only:

- buildings whose `building.cityId` equals its own city;
- the inventory record with that same city ID;
- warehouse access buildings in that same rail network.

No candidate enumeration may read stock from another city's inventory, even if
another city's warehouse building has a lower building ID or shorter unrelated
path.

Candidate ordering and path tie-break rules remain unchanged inside one city.

## Retail replenishment

Rename the operational concept from weekly imports to weekly replenishment. The
existing seven-day cadence, reorder threshold, target stock, category import
cost, and import-cost modifier behavior remain unchanged.

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

- `warehouseUnits` is the number of units taken from the configured city
  inventory;
- `warehouseValue` is those units multiplied by material `localValue`;
- `importedUnits` is the exact shortage bought externally;
- `importCost` remains the base per-unit category cost;
- `importSpend` is the modifier-adjusted external spend.

The field names remain for save/report compatibility even though the local units
now come from a named city inventory.

### Resolution rules

For a product below its reorder threshold:

1. **Valid source with enough stock** — debit the source inventory, import zero,
   and report `city-inventory`.
2. **Valid source with partial stock** — debit every available local unit,
   import the exact shortage, and report `mixed`.
3. **Valid source with zero relevant stock** — debit zero, import all required
   units, and report `import-only`.
4. **No assignment or explicit `null`** — import all required units and report
   `unassigned-import`.
5. **Unknown, closed, unsupported, or missing source inventory** — preserve the
   configured assignment, mutate no city inventory, import all required units,
   and report `source-unavailable-import`.

A product category with no supported finished-material mapping cannot consume
local inventory. With a valid source it follows `import-only`; with no or an
unavailable source it follows the corresponding fallback outcome.

Import-cost rules apply only to `importedUnits`, never to units taken from a city
inventory.

### Deterministic contention

Several retail cities may temporarily debit the same source before HPA-294
introduces explicit route capacity and priority. V1 resolves contention in this
stable order:

1. retail cities by world-catalog order, then plain ID;
2. stores within a retail city by plain store ID;
3. products within a store by plain category ID.

The function returns stores in original `GameState.stores` order and inventory
records in canonical city order. There is no fairness or proportional
allocation algorithm in HPA-292.

## Daily simulation order and reconciliation

The daily tick remains one pure transition. Its relevant order is:

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
   final cash using the existing formulas;
9. persist the post-replenishment city inventories in the returned `GameState`.

The existing cash invariant remains mandatory:

```text
cashAfter = cashBefore + operatingCashFlow + financingCashFlow
```

One-city golden tests must prove explicit city scoping produces the same
quantities, costs, and cash as the former global model.

## Reporting contracts

### Movement attribution

Add `cityId` to `DailyMaterialMovement` and `RailShipment`.

The field has operation-specific meaning:

- production output, recipe consumption, and industrial fallback imports use the
  industrial operation city;
- warehouse pulls use the inventory source city;
- rail shipments use the city containing the rail network and both endpoints;
- retail fallback imports use the retail destination city;
- retail local usage is also explained by `DailyProductReport.replenishment`,
  which carries the configured and resolved supply city.

### Per-city inventory summaries

Add production-close pressure snapshots:

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
before weekly retail replenishment. This matches the timing of the existing
warehouse pressure and overflow charge. Retail debits that happen afterward are
shown in product replenishment evidence and local warehouse-pull movements.

Player UI that displays **current** inventory reads `GameState.cityInventories`,
which is the post-replenishment ending state. It must not present the historical
production-close report snapshot as current stock.

### Aggregate compatibility fields

Keep these existing `DailyProductionReport` scalars:

- `warehouseCapacity`;
- `warehouseUsed`;
- `overflowUnits`;
- `overflowCost`.

They become explicit sums across all production-close city summaries. Financial
summaries continue to use these aggregate values, preserving the current daily
overflow charge and report formulas. Operational city UI and graph builders use
city records or city summaries, never an aggregate as if it were one warehouse.

### World progression

Any world rule that previously checked the global warehouse now checks all
city inventories. For example, the finished-material milestone succeeds when a
supported finished material exists in any opened city inventory or was locally
produced in the latest attributed production report.

## Product chains and supply advice

Global warehouse views would imply stock can be consumed anywhere. Scope them
explicitly:

- the warehouse-flow graph uses `game.activeIndustryCityId`;
- category-chain views use `game.activeCityId`, its stores, and its configured
  supply city;
- supply-advisor availability and built-chain status use only the active
  industrial city's buildings, buffers, and city inventory;
- category summaries do not count a producer in city A as local capacity for a
  retail city assigned to city B;
- UI headings include the relevant retail or supply city;
- stale, unassigned, zero-capacity, and empty source states produce explicit
  empty/bottleneck results rather than falling back to another city.

Switching cities through the world map changes the scope. HPA-292 does not add a
second selector inside every graph.

## Scenario integration

Scenario runs continue to wrap ordinary `GameState`; they do not gain a
parallel logistics state.

### Starting blueprint

Replace the global `warehouseMaterials` override with closed, typed city data:

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

Scenario setup first creates/open cities and buildings through existing
factories, synchronizes city capacities, applies validated material overrides,
applies explicit/default retail assignments, recalculates pressure, and then
validates the complete game.

### Metrics

Replace ambiguous global warehouse metrics with city-scoped queries:

```ts
{
	metric: 'city-inventory-quantity';
	cityId: WorldCityId;
	materialId: MaterialId;
}
```

Existing built-in definitions and evidence IDs migrate to the city-scoped
metric. No metric implicitly sums every city unless a future metric explicitly
requests that aggregation.

### Commands and capabilities

Add `setRetailSupplySource` to `ScenarioCommand` and the route-level command
inventory. Scenario definitions explicitly decide whether it is allowed. UI
availability and runtime enforcement use the same capability query.

### Scenario persistence

The independently versioned scenario store keeps its current outer schema when
possible, but embedded v12 `GameState` values must run the same v12-to-v13 game
migration and current-state validation as sandbox saves. Scenario setup,
round-trip, repository, share-code, and result evidence tests must use the new
state shape.

## Persistence and migration

Bump `SAVE_SCHEMA_VERSION` from `12` to `13`. Add v12 to the migratable version
set and perform exactly one new warehouse-shape migration before current v13
validation.

### Eligible destination set

Build eligible city IDs from the intersection of:

- generated `game.industryCities`;
- `game.world.openedCityIds`;
- known catalog industrial cities;
- cities accepted by the inventory capability rule.

Create one empty city inventory for each eligible ID in canonical order. Derive
capacity only from warehouse buildings whose `building.cityId` equals that ID.

### Legacy stock destination

Choose one destination by:

1. greatest derived warehouse capacity;
2. prefer a valid `activeIndustryCityId` on a capacity tie;
3. world-catalog order;
4. plain ID comparison.

A stale or unsupported active city does not participate in the tie-break.

If the legacy material map is empty, no destination is required and all eligible
inventories remain empty. If it is nonempty and no eligible destination exists,
throw a dedicated city-inventory invariant error. Do not open a city, invent a
record, or drop stock.

Copy every material quantity exactly once into the selected destination and
recalculate each city's pressure independently.

### Default retail assignments

Create one assignment for every opened known retail city in canonical order.
Use the selected deterministic eligible source when one exists; otherwise use
`null`. This migration choice does not imply future automatic reassignment.

### Historical report attribution

Migrate historical data without changing numerical totals:

- production movements without recoverable city context use the selected legacy
  destination;
- rail shipments use the city resolved from their referenced building IDs and
  fall back to the selected destination only when necessary;
- retail city attribution is derived from each `DailyStoreReport.storeId` and
  the saved store's city;
- product replenishment outcomes are reconstructed from `warehouseUnits` and
  `importedUnits`;
- legacy local replenishment uses the migrated default source;
- retail import movements are rebuilt from migrated product reports so their
  destination city is unambiguous;
- if historical local movement requires a source city but no deterministic
  eligible city exists, reject the save rather than invent attribution.

Historical report values for units, value, revenue, costs, cash, and scores stay
unchanged.

### Conservation check

After migration, for every `MaterialId`:

```text
sum(v13 city inventory quantity) = v12 global warehouse quantity
```

Check each material independently. A mismatch rejects the migrated save before
it reaches repository state.

### Current v13 validation

Reject all of the following:

- duplicate or noncanonical city inventory IDs;
- missing inventory records for opened eligible cities;
- inventory records owned by unknown, retail, unsupported, or closed cities;
- duplicate or noncanonical retail assignment owners;
- missing assignment records for opened retail cities;
- unknown retail assignment owners;
- unknown or non-inventory-capable non-null source IDs;
- negative, fractional, unsafe, or nonfinite quantities and capacities;
- capacity that does not match same-city warehouse buildings;
- incorrect used capacity, overflow units, or overflow cost;
- historical movement or shipment attribution to unknown cities;
- replenishment evidence inconsistent with the numerical local/import fields.

Use dedicated `SaveDataError` codes for city inventory and retail supply
invariants so diagnostics do not collapse into the former global warehouse
error.

## Player-facing UI

### Industry inventory inspection

`IndustryTileInspector` resolves the selected warehouse building's `cityId` and
shows only that city's:

- capacity;
- used capacity;
- overflow units and daily pressure cost;
- material quantities.

A warehouse in city A must never display city B's stock. A city with zero
capacity shows a zero-capacity state. An empty city shows accessible empty copy.
A missing or unavailable record shows an explicit unavailable state rather than
crashing or displaying another city.

### Retail supply sources

Add `RetailSupplySources.svelte` to the Stores management surface alongside
`StoreOverview`. For each opened retail city it shows:

- current configured source or Imports only;
- source availability state;
- source used/capacity and overflow status;
- a select control containing Imports only plus valid opened inventory cities;
- inline pending, unchanged, and rejected-command behavior.

Source options are in canonical city order. Changing one retail city's source
must not change any other city's assignment.

When the configured source is stale or closed, keep it visible as unavailable
even though it is not a selectable valid destination. The daily simulation
imports until the player chooses another source.

### Reports

`ReportsPanel` groups the latest production-close inventory summaries by city
and labels production, consumption, local retail usage, and fallback imports
with city context. Existing financial aggregate cards remain.

### Product chains

`ProductChainsPanel` labels the active industrial inventory or the active retail
city's configured source. Unassigned and unavailable states explain that the
retail city is using imports rather than implying no demand or no production.

### Accessibility and localization

- Every city inventory and supply-source section has a stable accessible name.
- Select controls have visible labels and programmatic descriptions.
- Empty, zero-capacity, unavailable, mixed-source, and imports-only states use
  status text, not color alone.
- Pending scenario writes disable the assignment control through the existing
  mutation-availability path.
- All new copy is key-driven in every supported locale.
- No new image assets are required.

## Error and fallback behavior

| Condition | Domain result | Inventory mutation | Retail result |
| --- | --- | --- | --- |
| Unknown inventory city | typed `unknown-city` | none | unavailable-source import when configured |
| Closed inventory city | typed `city-closed` | none | unavailable-source import; assignment retained |
| Retail city used as source | typed `unsupported-city` | none | rejected command or unavailable-source import for stale data |
| Missing inventory record | typed `inventory-missing` | none | unavailable-source import; assignment retained |
| Valid source, insufficient material | successful removal with shortage | remove available units only | mixed local/import refill |
| No assignment | no source resolution | none | unassigned import refill |
| Same assignment selected | successful unchanged command | none | no autosave or success cue |
| Invalid assignment command | typed failure with original state | none | no save, revision, or success cue |
| Legacy nonempty stock with no destination | save migration error | none committed | load rejected |

Fallback imports are an intentional operational result, not a hidden repair.
They remain subject to existing import-cost modifiers and are visible in reports
and cash.

## Module boundaries

### New modules

| Module | Responsibility |
| --- | --- |
| `src/lib/game/cityInventory.ts` | capability, access, mutation, capacity synchronization, pressure, ordering, conservation |
| `src/lib/game/retailSupply.ts` | assignment command, source resolution, weekly replenishment, fallback evidence |
| `src/lib/components/game/RetailSupplySources.svelte` | retail-city source management and source status presentation |

### Primary existing modules

| Module | Change |
| --- | --- |
| `src/lib/game/types.ts` | persisted city inventory, assignments, replenishment evidence, city-attributed reports |
| `src/lib/game/state.ts` | new-game initialization and fixtures |
| `src/lib/game/world.ts` | city opening normalization and any-city inventory milestones |
| `src/lib/game/industryPlacement.ts` | synchronize only the owning city after warehouse construction |
| `src/lib/game/industryProduction.ts` | city-scoped production state and aggregate report compatibility |
| `src/lib/game/railShipping.ts` | per-city inventory working map and strict same-city candidates |
| `src/lib/game/stock.ts` | retain product/sales helpers; weekly sourcing moves to `retailSupply.ts` |
| `src/lib/game/simulateDay.ts` | production/replenishment order, final inventory fold, cash reconciliation |
| `src/lib/game/productChainGraph.ts` | active-city and configured-source graph scope |
| `src/lib/game/productChainTree.ts` | active retail-city/source category scope |
| `src/lib/game/supplyAdvisor.ts` | active industrial-city inputs, buildings, and stock |
| `src/lib/game/reports.ts` | preserve aggregate finance and expose city summaries |
| `src/lib/scenarios/*` | city-scoped setup, metrics, commands, validation, and fixtures |
| `src/lib/persistence/saveTypes.ts` | schema v13 |
| `src/lib/persistence/saveCodec.ts` | v12-to-v13 migration and strict current validation |
| `src/lib/persistence/scenarioCodec.ts` | embedded game migration/validation |
| `src/routes/gameRouteController.ts` | assignment mutation and scenario command commit path |
| `src/routes/+page.svelte` | assignment handler and Stores-panel composition |
| `IndustryTileInspector.svelte` | selected-city inventory inspection |
| `ReportsPanel.svelte` | per-city inventory and source attribution |
| `ProductChainsPanel.svelte` | active-city/source context and empty states |
| i18n modules and locale files | localized inventory, source, outcome, and error copy |

Game-domain modules must not depend on Svelte, route state, the current scenario,
or persistence. Persistence may call shared pure invariant helpers but remains
responsible for strict shape and exact-key validation.

## Testing strategy

### Domain tests

- Access success plus unknown, closed, unsupported, and missing failures.
- Add/remove receipts, shortages, nonnegative stock, integer normalization, and
  independent overflow.
- Two-city capacity where building city A never changes city B.
- New game and city opening create exactly one canonical record/assignment.
- Assignment success, null assignment, unchanged result, and every rejection.
- Same-city producer and warehouse pulls continue to work.
- Cross-city producer and warehouse stock are invisible without a transfer.
- Production output deposits only through the producing city's rail network.
- Multiple retail cities sharing one source resolve in documented order.
- All five replenishment outcomes and exact local/import quantities.
- Import-cost modifiers affect only imported shortages.
- One-city golden fixtures preserve current production, overflow, store stock,
  reports, and cash exactly.
- Aggregate report totals equal the sum of city summaries.
- End-of-day inventory plus reported retail local usage reconciles with the
  production-close snapshot.

### Persistence tests

- v13 round trip with multiple industry and retail cities.
- v12 migration selects the greatest-capacity destination.
- Active-city, catalog-order, and plain-ID tie-breaks.
- Empty legacy stock with and without eligible cities.
- Nonempty stock with no eligible city rejects.
- Stale active city is ignored.
- Every material is copied once and conservation is exact.
- Default retail assignments are deterministic.
- Historical movement, shipment, product, and replenishment attribution.
- Duplicate IDs, missing records, malformed numbers, capacity mismatch,
  pressure mismatch, unknown endpoints, and inconsistent evidence reject.
- Browser, Tauri, in-memory, and scenario repositories preserve the new shape.

### Component tests

- Industry warehouse inspector shows only the selected city.
- Empty, zero-capacity, overflow, and unavailable inventory states.
- Retail supply source options, Imports only, stale-source display, and pending
  mutation disabling.
- Reports group city summaries and show local/mixed/import attribution.
- Product-chain headings and empty states identify the active city/source.
- Keyboard, focus, labels, and status text remain accessible.

### End-to-end test

One Playwright flow must:

1. open a second industrial city and a second retail city;
2. create warehouse capacity and stock in only one industrial city;
3. assign the second retail city to that source;
4. advance to replenishment;
5. verify local units and fallback imports are reported correctly;
6. verify the other industrial city's inventory remains unchanged;
7. save and reload;
8. verify inventories and assignments persist.

### Required validation

The implementation PR must pass:

```bash
bun run check
bun run lint
bun run test
```

Every Vitest test must execute at least one `expect`. Every changed Svelte file
must follow the repository-required Svelte MCP documentation and autofixer
workflow.

## Alternatives rejected

### Per-store supply assignments

Rejected because the current simulation already groups stores by retail city,
per-store configuration would create repetitive micromanagement, and HPA-294
needs a stable city-to-city relationship for routes.

### One inventory record keyed by city ID

Rejected because duplicate keys can be overwritten before validation and object
ordering is a weaker persisted contract than explicit canonical arrays.

### Automatic nearest or fullest source

Rejected because it hides operational decisions, changes outcomes without a
player command, and would compete with the future supply planner and route
system.

### Introducing transfer orders now

Rejected because dispatch, transit, arrival, cancellation, route capacity,
cost, and persistence form one shared lifecycle owned by HPA-294. A partial
transfer model would be harder to migrate than the temporary direct-debit seam.

### Keeping a compatibility global warehouse

Rejected because dual truth would let old code silently continue cross-city
consumption. The operational global field is removed in v13; only aggregate
report fields remain for historical and financial compatibility.

## Delivery boundary and follow-up

HPA-292 ships as one end-to-end implementation PR. Intermediate commits may be
reviewed independently, but no partial data model is a complete deliverable.
Production, retail, persistence, reporting, scenarios, and player surfaces must
all use the city-local contract before merge.

HPA-294 consumes these stable seams:

- `CityInventory` ownership and mutation helpers;
- `RetailSupplyAssignment` city relationships;
- city-attributed material movements and rail shipments;
- strict conservation and persistence validation.

HPA-294 then replaces the temporary immediate retail debit with explicit
transfer orders and in-transit stock. It must not move inventory ownership back
to a global pool or reinterpret a retail assignment as per-store state.

## Acceptance criteria

The design is implemented when:

- every opened industrial city has independent inventory and capacity;
- one city's warehouse buildings never affect another city's pressure;
- production consumes and deposits only within the producing city;
- retail replenishment uses its configured source and visibly imports any
  shortage;
- missing, closed, unknown, unsupported, and empty sources resolve
  deterministically without corrupting state;
- no operational code path reads or writes a global warehouse;
- supported saves migrate without material duplication or loss;
- cash, production, retail, inventory, and reports reconcile under existing
  formulas;
- players can inspect stock by city and manage retail-city supply sources;
- domain, persistence, component, and end-to-end coverage proves the complete
  multi-city lifecycle;
- transfer orders, in-transit inventory, and recurring routes remain absent.
