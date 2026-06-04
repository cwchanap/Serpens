# Store Upgrade / Leveling — Design

**Date:** 2026-06-03
**Status:** Approved (pending spec review)

## Summary

Add a cash-funded leveling system to both retail stores and industrial buildings.

- **Retail stores** start with **1 product type** and level up to a **max of 10**.
  - **Milestone levels 4, 7, and 10** each unlock an additional product type and raise the
    store's staffing needs and sales capacity.
  - **Every other level** (2, 3, 5, 6, 8, 9) grants a **+10% revenue bonus** (additive,
    revenue-only — boosts margin, leaves units/cost-of-goods untouched). Max bonus at level 10
    is **+60%**.
- **Industrial buildings** have a fixed product set, so leveling only raises **processing
  throughput by +20% per level** (additive), scaling the whole production run (inputs, outputs,
  and per-run operating cost). Max level **10** → **2.8×** base throughput.
- Upgrades cost cash that **scales with current level only**: `base × current level`.
  Retail base **$8,000**, industrial base **$5,000**.

## Decisions (locked during brainstorming)

| Question | Decision |
| --- | --- |
| Level trigger | **Spend cash to upgrade** (player-driven transition, like hiring/policy) |
| Product count mismatch | **Add a 4th category** to each retail archetype so 4/7/10 each unlock a real type |
| Milestone "staff" reward | **Raises staffing requirement (+1 general) AND raises `staffCapacity`** |
| Revenue bonus stacking | **Additive** (+10 percentage points per non-milestone level; +60% at max) |
| Revenue bonus target | **Revenue only** (units sold and cost-of-goods unchanged) |
| Industry throughput scope | **Whole throughput** (inputs + outputs + per-run operating cost) |
| Industry max level | **10** (same as retail) |
| Industry throughput stacking | **Additive** (+20% per level; 2.8× at level 10) |
| Upgrade cost model | **Scales with level only** (`base × current level`) |
| 4th retail categories | **Import-only** — not wired into the industry production chain (out of scope) |
| Legacy saves | **Normalize** (no schema bump); 3-product legacy stores migrate to level 7 |

## Domain model changes (`src/lib/game/types.ts`)

- `Store` gains `level: number` (1–10).
- `IndustrialBuilding` gains `level: number` (1–10).

## Archetype changes (`src/lib/game/archetypes.ts`)

Add a **4th `ProductCategory`** to each retail archetype. These are plain, import-only
categories (their `id` is **not** a `MaterialId`, so they never pull from the warehouse and
always import — matching how `apparel`, `home-goods`, `games`, etc. already behave). Proposed
names (final tuning during implementation):

| Archetype | New 4th category (working name) |
| --- | --- |
| convenience | Household |
| boutique | Accessories |
| electronics | Peripherals |
| grocery | Bakery |

Category data (`baseDemand`, `margin`, `demandWeight`, `importCost`, `defaultSellingPrice`,
`priceSensitivity`) is authored to sit reasonably alongside the existing three; balancing is an
implementation detail, not a spec requirement.

The **order** of `startingCategories` defines unlock order: index 0 is the level-1 product;
index 1 unlocks at level 4; index 2 at level 7; index 3 (the new one) at level 10.

## New module: `src/lib/game/leveling.ts`

Pure, deterministic, fully unit-tested. Single source of truth for all level math.

```ts
export const MAX_STORE_LEVEL = 10;
export const MAX_BUILDING_LEVEL = 10;
export const STORE_MILESTONE_LEVELS = [4, 7, 10] as const;
export const RETAIL_UPGRADE_BASE_COST = 8_000;
export const INDUSTRY_UPGRADE_BASE_COST = 5_000;
export const STORE_MILESTONE_CAPACITY_BONUS = 8;

isMilestoneLevel(level: number): boolean;            // level ∈ {4,7,10}
getUnlockedCategoryCount(level: number): number;     // <4→1, 4–6→2, 7–9→3, ≥10→4
getStoreRevenueMultiplier(level: number): number;    // 1 + 0.10 × (#non-milestone levels in 2..level)
getStoreStaffCapacityBonus(level: number): number;   // STORE_MILESTONE_CAPACITY_BONUS × (#milestones reached ≤ level)
getStoreUpgradeCost(level: number): number;          // RETAIL_UPGRADE_BASE_COST × level  (cost level→level+1)
getBuildingThroughputMultiplier(level: number): number; // 1 + 0.20 × (level - 1)
getBuildingUpgradeCost(level: number): number;       // INDUSTRY_UPGRADE_BASE_COST × level
canUpgradeStore(level: number): boolean;             // level < MAX_STORE_LEVEL
canUpgradeBuilding(level: number): boolean;          // level < MAX_BUILDING_LEVEL
```

### Revenue multiplier reference

| Level | 1 | 2 | 3 | 4★ | 5 | 6 | 7★ | 8 | 9 | 10★ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multiplier | 1.00 | 1.10 | 1.20 | 1.20 | 1.30 | 1.40 | 1.40 | 1.50 | 1.60 | 1.60 |
| Products | 1 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 4 |

★ = milestone (unlocks product + staff). Milestone levels themselves grant **no** additional
revenue multiplier beyond the level below them — they "spend" the level on a product/staff
unlock instead.

### Building throughput reference

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Throughput | 1.0× | 1.2× | 1.4× | 1.6× | 1.8× | 2.0× | 2.2× | 2.4× | 2.6× | 2.8× |

## Transitions

### `upgradeStore(game, storeId): GameState`
1. Find the store. No-op (return `game` unchanged) if not found, already at `MAX_STORE_LEVEL`,
   or `game.cash < getStoreUpgradeCost(store.level)`.
2. Deduct cost from cash; set `store.level += 1`.
3. If the **new** level is a milestone:
   - Append the newly-unlocked category's product, initialized with the same default
     stock/threshold/target/price formula as `initializeStoreProducts`.
   - Increase `store.staffCapacity` by `STORE_MILESTONE_CAPACITY_BONUS` (clamped via
     `clampScore`).
   - Recompute `stockHealth` (now includes the new product row).
4. The staffing **requirement** increase is implicit (see Staffing hook) — the player must hire
   to restore coverage.

### `upgradeBuilding(game, buildingId): GameState`
1. Find the building. No-op if not found, at `MAX_BUILDING_LEVEL`, or
   `game.cash < getBuildingUpgradeCost(building.level)`.
2. Deduct cost; set `building.level += 1`.

Both transitions live in `leveling.ts` (or `state.ts`) and return a new `GameState`, consistent
with the existing pure-transition pattern. The UI disables the button and shows the reason, so
the no-op paths are defensive rather than user-facing.

## Starting-state changes (`src/lib/game/state.ts`, `src/lib/game/stock.ts`)

- `initializeStoreProducts(archetypeId, level = 1)` returns only the **unlocked** categories for
  the given level (`getUnlockedCategoryCount`). At level 1 this is just `startingCategories[0]`.
- `createStore` sets `level: 1` and therefore creates a **single-product** store. Both the
  founding store (`createNewGame`) and expansion stores (`openStore`) go through `createStore`,
  so both start with 1 product.
- `buildIndustrialBuilding` (`industryPlacement.ts`) sets `level: 1`.

## Simulation hooks

### Retail revenue (`src/lib/game/stock.ts`, `simulateProductSalesForCity`)
Where per-product revenue is computed, multiply by the store's revenue multiplier:

```ts
const revenueMultiplier = getStoreRevenueMultiplier(store.level);
const revenue = Math.round(unitsSold * product.sellingPrice * revenueMultiplier);
```

`costOfGoods` (= `unitsSold × importCost`) is **unchanged**. `grossMargin = revenue - costOfGoods`
therefore reflects the bonus automatically. `unitsSold`, stock draw-down, and the shared city
demand pool are untouched.

### Staffing (`src/lib/game/staffing.ts`)
- `getStaffingRequirement(archetypeId, level = 1)` adds `+1` to `general` for each milestone
  level reached (`getUnlockedCategoryCount(level) - 1`, i.e. +0/+1/+2/+3 at levels
  1–3/4–6/7–9/10).
- `summarizeStoreStaffing` passes `store.level` through.
- `generateStarterStaffForStore` is only invoked at founding (level 1), so it keeps using the
  base requirement.

### Industry throughput (`src/lib/game/industryProduction.ts`, `simulateIndustryProduction`)
For each building with a recipe, multiply by `getBuildingThroughputMultiplier(building.level)`:
- Each `recipe.inputs[].quantity` → `Math.round(quantity × multiplier)` (removed from warehouse,
  imported on shortage, as today).
- Each `recipe.outputs[].quantity` → `Math.round(quantity × multiplier)` (added to warehouse).
- `recipe.operatingCost` → `recipe.operatingCost × multiplier`.
- `buildingType.dailyOperatingCost` (fixed overhead) stays flat.

Rounding to integers keeps warehouse quantities integral and the simulation deterministic.

## Persistence (`src/lib/persistence/saveCodec.ts`)

Save schema version stays **4** — no bump. Legacy v4 saves are normalized in place, following the
existing precedent for `world` / `storeCap` inference.

- `validateSavedStore` validates `store.level` as a finite number in `[1, MAX_STORE_LEVEL]`.
- `validateSavedIndustrialBuilding` validates `building.level` in `[1, MAX_BUILDING_LEVEL]`.
- **`validateSavedStoreProducts` is relaxed**: products must be a **non-empty** set of unique,
  archetype-valid categories. It no longer requires *all* categories — count may be 1..N where N
  is the archetype's total category count.
- **Legacy normalization** (in `normalizeSavedGame`, for saves lacking the new fields):
  - Store `level` absent → infer from product count: `1→1`, `2→4`, `3→7`, `4→10`. (Legacy stores
    carry all 3 of their old categories → level 7, keeping products and level consistent.)
  - Building `level` absent → default `1`.

## UI

### `src/lib/components/game/TileInspector.svelte` (Details tab)
- Display **"Level N / 10"**.
- Show the **next-level benefit** ("Next: +10% revenue" or "Next: unlocks _Category_ + 1 staff"),
  or "Max level" at 10.
- **Upgrade — $cost** button. Disabled at max level or when `game.cash < cost`, with the reason
  surfaced.
- New prop `onUpgradeStore: (storeId: string) => void`, wired in `+page.svelte` to
  `setGameAndAutosave(upgradeStore(game, storeId))`.

### `src/lib/components/game/IndustryTileInspector.svelte`
- Display **"Level N / 10"** and current **throughput multiplier** (e.g. "1.4× output").
- **Upgrade — $cost** button with the same disabled/reason behavior.
- New prop `onUpgradeBuilding: (buildingId: string) => void`, wired in `+page.svelte` to
  `setGameAndAutosave(upgradeBuilding(game, buildingId))`.

Follow the mandatory Svelte MCP workflow (`list-sections` → `get-documentation` →
`svelte-autofixer`) for both component edits.

## Testing

- **New** `src/lib/game/leveling.spec.ts` — all level math + both transitions (cost deduction,
  level bump, milestone product/staff/capacity effects, max-level and insufficient-cash no-ops).
- `archetypes.spec.ts` — assert each retail archetype now has 4 categories with valid data.
- `stock.spec.ts` — `initializeStoreProducts` returns 1 product at level 1 and the unlocked count
  at other levels; revenue multiplier applied in sales.
- `staffing.spec.ts` — `getStaffingRequirement` scales general count with level; summary reflects
  the larger requirement.
- `industryProduction.spec.ts` — throughput scaling of inputs, outputs, and per-run operating
  cost; integer rounding.
- `saveCodec` / repository specs — `level` round-trips and is range-validated; product subset is
  accepted; legacy migration (3-product store → level 7, building → level 1).
- Svelte specs for `TileInspector` and `IndustryTileInspector` upgrade buttons (visible level,
  disabled states, callback fired).

## Out of scope

- Wiring the new 4th retail categories into the industry production chain (they remain
  import-only).
- Any change to `forecastOpening` / opening revenue projection (it does not depend on category
  count).
- Warehouse buildings are not upgradable (no recipe / no processing).
- Bumping the save schema version.
