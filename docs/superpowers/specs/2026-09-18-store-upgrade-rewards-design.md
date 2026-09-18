# HPA-283 Store Upgrade Rewards & Next Supply Decision — Design

**Linear:** HPA-283  
**Status:** implementation design for the single HPA-283 delivery PR  
**Baseline:** `main` after HPA-293 / PR #58 (`2b23a4003377abfc53168a408cfd04a4e149c3e6`)

## Goal

Make store upgrades understandable before purchase and visibly meaningful after purchase without creating another progression system.

The player should be able to answer, from the existing retail inspector:

1. What level am I buying?
2. What does it cost?
3. What actually changes at that level?
4. If a product unlocks, where do I configure its stock and inspect its supply path?

The slice stays in **one ticket / one PR**. Planning, implementation, localization, focused tests, and the milestone E2E journey all land together.

## Existing code we should preserve

The current game already owns the important rules:

- `src/lib/game/leveling.ts`
  - max store level;
  - milestone levels 4 / 7 / 10;
  - pre-upgrade-level cost;
  - non-milestone revenue multiplier;
  - milestone staff-capacity bonus.
- `src/lib/game/state.ts::upgradeStore`
  - affordability / max-level no-op behavior;
  - product materialization;
  - cash deduction;
  - staff-capacity mutation.
- `src/lib/game/archetypes.ts`
  - authored product order for all four retail archetypes.
- `src/lib/game/staffing.ts::getStaffingRequirement`
  - real staffing requirement at each level.
- `src/routes/gameRouteController.ts::upgradeStore`
  - existing command, persistence, scenario gating, and `GameRouteCommitResult`.
- `src/lib/components/game/TileInspector.svelte`
  - existing upgrade action and compact inspector surface.
- HPA-293 stock-recovery flow
  - transient `focusedStockProductId`;
  - Store Detail stock-row focus;
  - per-product stock controls;
  - existing Supply Planner handoff and availability.

Those are the authority boundaries for this ticket.

## Current UX gap

The existing inspector currently compresses the upgrade into:

- a cost button;
- a tooltip-only “next benefit”;
- generic “unlock product + staff capacity” copy at milestones.

That hides the important facts:

- the actual product identity;
- the actual multiplier before/after on ordinary levels;
- the fact that milestone levels intentionally **do not** add the ordinary revenue step;
- the difference between staff capacity and staffing requirement;
- the next future product milestone between unlock levels;
- what the player should inspect immediately after a product unlock.

## Design decisions

### 1. Add one pure upgrade-preview boundary and make the transition consume it

Create `src/lib/game/storeUpgrade.ts` with a pure preview function:

```ts
export interface StoreUpgradePreview {
  currentLevel: number;
  nextLevel: number;
  cost: number;
  revenueMultiplierBefore: number;
  revenueMultiplierAfter: number;
  unlockedProductId: ProductId | null;
  staffCapacityBefore: number;
  staffCapacityAfter: number;
  staffingRequirementBefore: StaffingRequirement;
  staffingRequirementAfter: StaffingRequirement;
  nextProductMilestone: {
    level: number;
    productId: ProductId;
  } | null;
}

export function previewStoreUpgrade(store: Store): StoreUpgradePreview | null;
```

`null` means max level.

The helper must derive everything from existing rules:

- `getStoreUpgradeCost`;
- `getStoreRevenueMultiplier`;
- `isMilestoneLevel`;
- `getUnlockedProductCount`;
- `getStoreStaffCapacityBonus`;
- `getArchetype(...).startingProductIds`;
- `getStaffingRequirement`.

Do not copy numeric balance constants into UI code.

The current product-unlock selection logic should move into this preview boundary so `upgradeStore()` and the UI cannot disagree about which product is next. The transition still performs the mutation and remains authoritative; the preview only describes that transition.

### 2. Keep affordability outside the domain preview

Affordability is current game-state context, not a property of the upgrade rules.

`TileInspector` continues to compute:

```ts
game.cash >= preview.cost
```

This keeps the preview reusable and side-effect free.

### 3. Replace the tooltip-only hint with a visible compact upgrade card

Keep the action in `TileInspector`; do not add an upgrade screen or modal.

The card shows:

- `Level N → N+1`;
- exact cost;
- disabled reason for maximum level, insufficient cash, or command unavailability;
- actual benefits.

For an ordinary level:

- show the model multiplier before → after;
- label it as a **revenue model multiplier**, not guaranteed revenue or profit;
- show the next product milestone, e.g. “Next product unlock: Level 4 · Snacks”.

For a milestone level:

- show the actual product name and existing registered product art;
- show staff capacity before → after / delta;
- show any changed staffing requirement;
- do **not** claim a revenue multiplier step when the multiplier is unchanged.

The convenience archetype’s fifth authored product remains unreachable because the level cap unlocks only four products. The preview follows the same unlock budget as the real transition.

### 4. Use existing product art only

Product imagery comes from `getProductArt(productId)`.

No new raster/vector art is required, so this ticket does **not** need a separate image-generation task.

### 5. Make post-upgrade feedback transient and local to the inspector

Do not persist completion state and do not add a global notification/event system.

Change the existing upgrade callback to return the controller result:

```ts
(storeId: string) => Promise<GameRouteCommitResult | null>
```

`TileInspector` captures the pure preview immediately before the command and shows a one-shot completion card only when the result proves the command committed:

- scenario: `status === 'committed'`;
- sandbox: `status === 'sandbox-committed' && changed === true`.

All other results — unchanged, rejected, busy, unavailable, failed, confirmation-required — show no success treatment.

The transient feedback is keyed by `storeId`; it is rendered only for the currently selected store. Closing the inspector naturally discards it. Reloading or reopening an already-upgraded store does not recreate it.

Because `upgradeStore()` consumes the same preview helper, the completion card can safely report the attained level and captured effects without inventing a second source of truth.

### 6. Reuse HPA-293’s focused Store Detail flow for the new product

Do not add a second planner handoff to the upgrade card.

Widen the existing detail callback so the inspector may optionally name a product:

```ts
onOpenDetails(productId?: ProductId): void
```

The route’s existing `openStoreDetail` becomes:

- no argument → current behavior, Stock tab opens normally;
- product argument → set `focusedStockProductId` and open the same Store Detail modal.

After a successful milestone upgrade, the confirmation card exposes an action such as “Review Snacks stock & supply”. That action opens Store Detail with the unlocked product focused.

This reuses HPA-293 behavior:

- the existing stock row;
- existing threshold / target controls;
- existing supply-source context;
- existing per-product Supply Planner button;
- existing planner product validation.

No new inventory, supply, logistics, or planner behavior is introduced.

### 7. Planner availability remains honest

The focused stock row already receives `plannerProductIds`.

If the product is not a valid planner category, the planner action stays unavailable. Add concise disabled explanatory copy/title if necessary so the player is not left with a silent disabled control.

If the product is supported but scenario/action constraints prevent a recommendation, the existing Supply Planner remains responsible for explaining that state.

Do not fabricate a recommendation in the upgrade flow.

## Detailed behavior

### Ordinary example: level 2 → 3

Expected preview:

- cost from `getStoreUpgradeCost(2)`;
- revenue multiplier changes from the level-2 value to the level-3 value;
- no product unlock;
- no staff-capacity change;
- no staffing-requirement change;
- next milestone points to level 4 and the actual second authored product.

### Milestone example: level 3 → 4

Expected preview:

- cost uses level 3;
- revenue multiplier before and after is unchanged;
- exact second product unlock is shown;
- staff capacity increases by the real milestone delta;
- staffing requirement reflects the level-4 rule;
- completion feedback appears only after a real successful command.

### Level 9 → 10

Expected preview:

- exact fourth reachable product;
- final staff-capacity / staffing change;
- no fifth product;
- no later milestone.

### Maximum level

No preview/purchase is offered. Existing max-level behavior remains.

## State ownership

### Authoritative persisted state

Unchanged:

- `GameState`;
- store `level`;
- `products`;
- `staffCapacity`;
- cash;
- scenario run state.

### New derived state

Pure only:

- `StoreUpgradePreview`.

### New transient UI state

Local to `TileInspector` only:

- last successful preview for the selected `storeId`.

No save-schema field, migration, compatibility layer, acknowledgement log, or global store is added.

## Accessibility and responsive behavior

The benefits must be readable without hover.

Requirements:

- visible labels for level, cost, and each benefit;
- product image has localized product-name alt text in the upgrade card;
- successful confirmation uses a non-blocking status region;
- no focus stealing after purchase;
- the focused-product action is a normal keyboard-operable button;
- narrow layouts stack the preview content instead of requiring horizontal scrolling.

## Localization

Add/update copy in:

- `src/lib/i18n/messages/en.ts`;
- `src/lib/i18n/messages/ja.ts`;
- `src/lib/i18n/messages/zh-Hant.ts`.

Copy must distinguish:

- model multiplier vs guaranteed business outcome;
- staff capacity vs staff requirement;
- “unlocked product” vs inventory received;
- planner unavailable vs planner recommendation.

## Test strategy

### Pure domain tests

Cover at minimum:

- 2 → 3;
- 3 → 4;
- 6 → 7;
- 9 → 10;
- max level;
- all four archetypes’ milestone product identities;
- convenience never advertises the fifth product;
- preview does not mutate the input store;
- `upgradeStore` materializes the same product/capacity/level described by the preview.

### Component tests

`TileInspector.svelte.spec.ts` should prove:

- visible ordinary multiplier delta;
- visible milestone product art/name/capacity/staffing effects;
- insufficient cash / command-disabled / max-level states;
- successful command shows confirmation once;
- rejected/no-op command shows no success treatment;
- focused product detail action passes the real product ID;
- no benefit depends on hover.

### Route / host tests

Pin the widened `onOpenDetails(productId?)` callback and the route’s focused-stock behavior without adding another route state owner.

### E2E

Add one deterministic milestone journey:

1. load a store at level 3 with enough cash;
2. inspect the visible 3 → 4 upgrade preview;
3. purchase through the existing command;
4. verify level 4 and the actual unlocked product;
5. verify completion feedback;
6. open that product’s stock/supply action;
7. verify Store Detail focuses the unlocked product;
8. verify the existing planner handoff is present/available only according to current planner support.

Do not add a second browser journey for ordinary levels; unit/component coverage is sufficient.

## Non-goals

- industrial upgrade redesign;
- new rewards, currency, inventory, or staff grants;
- automatic hiring;
- upgrade ROI/forecasting;
- technology tree;
- new progression state machine;
- new planner behavior;
- new supply command;
- global event bus;
- persistent completion history;
- broad inspector/layout rewrite;
- map effects (HPA-295);
- economic rebalance;
- save migration or backwards-compatibility work.

## Files expected to change

Primary:

- `src/lib/game/storeUpgrade.ts` + spec;
- `src/lib/game/state.ts` + focused upgrade tests;
- `src/lib/components/game/TileInspector.svelte` + spec;
- `src/routes/MapInspectorHost.svelte` + spec;
- `src/routes/+page.svelte` + route spec;
- locale files;
- `src/routes/retail-sim.e2e.ts`.

Possible small follow-up only if required for honest disabled copy:

- `src/lib/components/game/StoreStockTable.svelte` + spec.

No schema, persistence codec, planner-domain, or art registry files should need changes.
