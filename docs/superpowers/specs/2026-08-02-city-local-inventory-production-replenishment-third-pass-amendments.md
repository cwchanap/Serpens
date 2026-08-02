# HPA-292 City-Local Inventory — Third-Pass Amendments

**Date:** 2026-08-02  
**Status:** Normative amendments to the HPA-292 design  
**Base design:** `2026-08-02-city-local-inventory-production-replenishment-design.md`  
**Linear:** HPA-292

## Precedence

This document is part of the HPA-292 implementation contract. Where it conflicts
with the base design, this document takes precedence. Unchanged sections of the
base design remain authoritative.

These amendments resolve the third-pass review concerns around derived save
fields, v12 stock allocation, invalid entity ownership, historical report
attribution, ordering, report size, inventory timing labels, and delivery
reviewability.

## 1. Derived inventory fields are normalized, not authoritative

`CityInventory.materials` and city ownership are persisted truth. The following
fields are derived cache:

- `capacity`;
- `overflowUnits`;
- `overflowCost`.

Their values depend on warehouse-building definitions and
`WAREHOUSE_OVERFLOW_COST_PER_UNIT`, which are balance constants and may change
without changing player-owned stock.

### Load pipeline

Sandbox and embedded-game decoding must:

1. structurally decode ownership, canonical ordering, buildings, assignments,
   and material quantities;
2. require the stored derived fields to have valid numeric types, but do not
   compare their stored values with current constants as a rejection condition;
3. recompute each city inventory's capacity from current same-city warehouse
   buildings;
4. recompute overflow units and cost using current constants;
5. validate the normalized current state;
6. serialize only normalized derived values on the next save.

A balance retune must not make an otherwise valid save unreadable solely because
its cached capacity or pressure was calculated under older constants.

Hard rejection remains appropriate for authoritative failures, including:

- invalid or duplicate ownership;
- noncanonical collections;
- unknown material IDs;
- negative, fractional, unsafe, or nonfinite material quantities;
- malformed derived-field types;
- missing required inventory or assignment records.

Live transitions and scenario setup must still return synchronized derived
fields. They cannot rely on the next load or daily tick to repair an in-memory
state.

## 2. v12 stock allocation must not create avoidable overflow

The base design's single primary migration city remains useful as a deterministic
priority and default retail source, but v12 stock must not be concentrated there
when other eligible city capacity exists.

### Primary-city selection

Choose the primary city by:

1. greatest current derived warehouse capacity;
2. prefer a valid `activeIndustryCityId` on a capacity tie;
3. world-catalog order;
4. plain code-unit ID comparison.

A stale active city does not participate. Nonempty stock with no eligible city is
still rejected. Empty stock requires no primary city.

### Allocation algorithm

Allocate the legacy global material pool as follows:

1. destination order is the primary city followed by all remaining eligible
   cities in canonical catalog/ID order;
2. material order is the material catalog order, followed by plain code-unit ID
   as a defensive tie-break;
3. for each material, fill each destination's remaining free capacity in order;
4. after aggregate free capacity is exhausted, put residual units in the primary
   city as overflow;
5. recalculate every city's pressure with current constants.

This guarantees:

```text
sum(v13 city quantity for material M) = v12 global quantity for material M
```

and:

```text
total v13 overflow units = max(0, total material units - total v13 capacity)
```

Migration therefore creates no overflow caused only by concentrating a formerly
global pool. For example, 300 units with two 200-capacity cities migrate with
zero overflow, not 100 newly overflowed units in one city.

The allocation is migration attribution, not a gameplay transfer, route, or
in-transit operation.

## 3. Persisted entity city ownership is strict

Capacity derivation and replenishment ordering must never silently ignore an
entity whose string city ID cannot be narrowed.

Every current-schema state and scenario start must satisfy:

- every `IndustrialBuilding.cityId` resolves to a known, opened catalog city of
  kind `industry` with a generated `IndustryCity`;
- every warehouse building contributes capacity to exactly one such city;
- every `Store.cityId` resolves to a known, opened catalog city of kind `retail`
  with a generated `City`.

Unknown, wrong-kind, closed, or ungenerated entity cities are validation errors.
This validation runs before production, capacity calculation, retail grouping,
or replenishment.

Consequences:

- a warehouse with an invalid city cannot vanish from capacity calculations;
- a store with an invalid city cannot receive an implicit ordering bucket;
- every valid store belongs to exactly one world-catalog retail-city group.

Pure lookup helpers may still return typed failures for defensive callers, but
current persisted/scenario states containing invalid entity ownership are
rejected.

## 4. Pre-v13 replenishment attribution remains unknown

Pre-v13 reports were produced from a global warehouse and did not contain a
retail supply assignment. The migration must not manufacture source evidence
from an assignment created later.

For every migrated pre-v13 report:

- preserve `warehouseUnits`, `warehouseValue`, `importedUnits`, `importCost`, and
  `importSpend` exactly;
- set the new store-level replenishment context to `null`;
- set the new per-product replenishment outcome to `null`;
- preserve existing revenue, cost, cash, score, and quantity totals.

Production and rail movements may use recoverable building/city references.
Legacy global-pool movements with no recoverable city context use the primary
migration city as explicit migration provenance only; they do not claim that the
city was the historical retail source.

The codec validates context/outcome consistency when attribution is present. A
null context/outcome is permitted for migrated historical reports even when the
legacy numeric fields are nonzero. New v13 runtime reports must populate the
new fields for actual replenishment attempts, and runtime tests enforce that
stronger contract.

No v12 save is rejected merely because a historical local unit has no genuine
city source.

## 5. Replenishment source context is stored once per store report

Assignment and source-capability resolution is shared by every product in one
store on a replenishment tick. Do not repeat city/source IDs in every
`DailyProductReport`.

Use:

```ts
export type RetailReplenishmentOutcome =
	| 'city-inventory'
	| 'mixed'
	| 'import-only'
	| 'unassigned-import'
	| 'source-unavailable-import';

export interface RetailReplenishmentContext {
	retailCityId: WorldCityId;
	configuredSupplyCityId: WorldCityId | null;
	resolvedSupplyCityId: WorldCityId | null;
}

export interface DailyStoreReport {
	// existing fields...
	replenishment: RetailReplenishmentContext | null;
}

export interface DailyProductReport {
	// existing fields...
	replenishmentOutcome: RetailReplenishmentOutcome | null;
}
```

Rules:

- store context is non-null only when at least one product attempted
  replenishment;
- a product that did not attempt a refill has `replenishmentOutcome: null`;
- source resolution is performed once per retail city and reused by its stores;
- only the product outcome varies with product mapping and available material;
- when context/outcome is present, it must reconcile with the existing numerical
  product fields.

This retains explicit attribution without multiplying the same city/source IDs
by products × stores × report days.

## 6. Multi-city ordering has no unresolved-city case

For validated states, replenishment order remains:

1. retail cities by world-catalog order, then plain ID;
2. stores within a retail city in their original relative `GameState.stores`
   order;
3. products in original `Store.products` order.

Because invalid store ownership is rejected before simulation, every store has a
well-defined catalog group. There is no terminal bucket and no silent fallback
for unresolved store cities in a valid state.

One-retail-city allocation remains bit-identical to the current global traversal.
Multi-city shared-source allocation intentionally uses city-catalog-first
ordering.

## 7. Report and inspector inventory values require timing labels

`DailyProductionReport.cityInventories` is captured after industrial production
and rail pushes but before retail replenishment. `GameState.cityInventories` is
the current post-replenishment state.

Player-facing copy must distinguish them:

- Reports: **Production-close inventory (before retail replenishment)** and the
  report day;
- Inspector/current panels: **Current city inventory (after the latest
  replenishment)**.

The values may legitimately differ on replenishment days. Components and e2e
coverage must include a case where the report and current panel show different
numbers while both labels remain visible.

## 8. Delivery remains one feature PR with late additive review slices

The feature is not complete without its UI, localization, persistence lifecycle,
and multi-city e2e. HPA-292 therefore remains one end-to-end feature PR.

For reviewability, keep the internal gates and make the late additive work
separate commits/checkpoints:

1. one-city golden locks and city-inventory helpers;
2. production and rail;
3. retail assignment and replenishment;
4. persistence allocation, derived normalization, and legacy-unattributed
   reports;
5. scenarios and codecs;
6. UI and localization;
7. multi-city e2e and full verification.

Gates 6 and 7 may be reviewed independently as late commits or stacked draft
checkpoints, but they are not separately mergeable feature PRs. No partial data
model is a complete deliverable.

## Required third-pass tests

Add coverage for:

- a current-schema save with stale derived values loading and normalizing after a
  simulated capacity/overflow-cost retune;
- malformed derived-field types still rejecting;
- 300 legacy units across two 200-capacity cities producing zero migration
  overflow;
- legacy stock above aggregate capacity producing exactly the unavoidable excess;
- exact per-material conservation after distributed allocation;
- invalid store and industrial-building city ownership rejecting;
- pre-v13 report context/outcomes migrating to `null` while numeric fields remain
  unchanged;
- new v13 store context and per-product outcomes reconciling with numeric fields;
- production-close report and post-replenishment current inventory displaying
  different, explicitly labelled values.

## Updated acceptance additions

In addition to the base design acceptance criteria:

- balance retunes do not make valid saves unreadable because of stale derived
  cache values;
- v12 migration introduces no avoidable overflow;
- invalid store/building city ownership is rejected rather than silently
  ignored;
- migrated historical replenishment attribution remains explicitly unknown;
- replenishment source context is not duplicated per product;
- production-close and current inventory values are clearly distinguished in
  player copy.
