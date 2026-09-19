# HPA-283 Store Upgrade Rewards & Next Supply Decision — Design

**Linear:** HPA-283\
**Status:** implementation design for the single HPA-283 delivery PR\
**Baseline:** `main` after HPA-293 / PR #58 (`2b23a4003377abfc53168a408cfd04a4e149c3e6`)

## Goal

Make the existing retail-store upgrade understandable before purchase and visibly meaningful after a real command result, without creating another progression, reward, planner, or persistence system.

From the current retail inspector, the player should be able to tell:

1. which level is next;
2. what it costs;
3. what actually changes;
4. whether the purchase applied;
5. where to inspect stock/supply for a newly unlocked product.

Everything remains in **one ticket / one PR**.

## Existing authority boundaries

Keep these owners unchanged:

- `src/lib/game/leveling.ts`: level cap, milestone levels, cost curve, revenue multiplier, staff-capacity bonus;
- `src/lib/game/state.ts::upgradeStore`: authoritative mutation;
- `src/lib/game/archetypes.ts`: authored product order;
- `src/lib/game/staffing.ts::getStaffingRequirement`: staffing rules;
- `src/routes/gameRouteController.ts::upgradeStore`: command/persistence/scenario boundary;
- `src/lib/components/game/TileInspector.svelte`: upgrade presentation;
- HPA-293’s `focusedStockProductId` + Store Detail stock row + existing Supply Planner handoff.

No controller behavior, save schema, planner domain, progression framework, or new art is required.

## Current UX gap

The inspector currently has a cost button and tooltip-only generic benefit text.

That hides:

- the actual product at milestones;
- the real ordinary-level multiplier before → after;
- the fact that levels 4 / 7 / 10 intentionally do **not** add the ordinary revenue step;
- staff capacity versus staffing requirement;
- the next real product milestone;
- whether a command failed/no-op’d;
- the existing stock/supply follow-up after a product unlock.

## Design decisions

### 1. Colocate upgrade resolution, preview, and mutation in `state.ts`

Do not create a new `storeUpgrade.ts`.

Extract the mutation-relevant effects from the existing `upgradeStore` block:

```ts
interface StoreUpgradeResolution {
  currentLevel: number;
  nextLevel: number;
  cost: number;
  unlockedProductId: ProductId | null;
  staffCapacityAfter: number;
}

function resolveStoreUpgrade(store: Store): StoreUpgradeResolution | null;
```

`null` means max level.

This helper owns only values the mutation consumes:

- next level;
- pre-upgrade-level cost;
- actual product materialization decision;
- post-upgrade staff capacity.

`upgradeStore()` remains the only mutator and still owns:

- unknown/max/insufficient-cash guards;
- cash deduction;
- `createStoreProduct(..., game.day)`;
- stock-health recomputation;
- store replacement.

### 2. Build display preview on top of the resolution

Export `previewStoreUpgrade(store)` from `state.ts`.

Its DTO adds display-only fields:

```ts
export interface StoreUpgradePreview extends StoreUpgradeResolution {
  revenueMultiplierBefore: number;
  revenueMultiplierAfter: number;
  staffCapacityBefore: number;
  staffingRequirementBefore: StaffingRequirement;
  staffingRequirementAfter: StaffingRequirement;
  nextProductMilestone: {
    level: number;
    productId: ProductId;
  } | null;
}
```

Display fields come from existing helpers:

- `getStoreRevenueMultiplier`;
- `getStaffingRequirement`;
- milestone/product definitions already owned by leveling/archetypes.

The mutation must never depend on multiplier, staffing-display, next-milestone, or copy fields.

### 3. Preserve the current defensive unlock resolver, but do not make impossible catch-up UI first-class

The mutation keeps its current defensive rule:

1. on a milestone, find the first authored product not already stocked;
2. materialize only when `products.length < getUnlockedProductCount(nextLevel)`.

That protects direct in-memory callers and preserves current state tests.

However, valid persisted/runtime stores obey stronger invariants:

- product count equals `getUnlockedProductCount(level)`;
- product IDs belong to the currently unlocked archetype prefix;
- normal creation initializes exactly that prefix.

Therefore a valid player-facing level-3 store cannot already hold the level-4 product budget. A “catch-up milestone with no product unlock” is not a supported UI state.

Keep one defensive state-level parity assertion for the cap/resolver, but do not add:

- a special component fixture;
- a dedicated player-facing copy rule;
- a headline design branch.

### 4. Use a closed-form next product milestone under the validated-store invariant

For player-facing preview, the next product milestone is:

1. first value in `STORE_MILESTONE_LEVELS` greater than `store.level`;
2. product index `getUnlockedProductCount(milestoneLevel) - 1`;
3. `null` if no later milestone exists.

This is safe because validated live stores contain the unlocked prefix.

Add a short code comment stating that assumption.

The mutation’s defensive find-based resolver remains unchanged; preview does not replace it.

This yields:

- level 2 → next unlock at 4;
- level 9 → next unlock Essentials at 10;
- Household is never advertised.

### 5. Cash stays out of the preview; preview stays visible when purchase is blocked

`TileInspector` derives affordability:

```ts
game.cash >= preview.cost
```

The preview card is visible whenever a next upgrade exists, including when:

- cash is insufficient;
- scenario command availability disables upgrading;
- an operation is temporarily pending.

Purchase availability and preview visibility are separate.

### 6. Replace tooltip-only hints with a visible compact card

Keep the feature in `TileInspector`.

Show:

- `Level N → N+1`;
- exact cost;
- actual effects.

Ordinary level:

- revenue **model multiplier** before → after;
- no sales/profit promise;
- next product milestone.

Milestone:

- actual product name/image;
- staff capacity before → after;
- changed staffing requirement;
- no revenue increase when multiplier is unchanged.

Reuse `getProductArt(productId)`. No new asset work.

Remove the current tooltip-specific “+10% revenue” / “product #2” behavior.

### 7. Await the command and prevent duplicate sandbox upgrades

Widen the callback:

```ts
onUpgradeStore: (storeId: string) => Promise<GameRouteCommitResult | null>
```

The optional default becomes:

```ts
async () => null
```

The route returns `gameRouteController.upgradeStore(storeId)`; controller behavior is unchanged.

`TileInspector` owns local `upgradePending`:

- ignore clicks while pending;
- disable Upgrade while pending;
- capture store ID + preview before await;
- clear pending in `finally`.

This prevents two sandbox clicks from applying 3 → 4 and 4 → 5 against one captured preview.

### 8. Standardize committed-result semantics across existing callers

Add beside `GameRouteCommitResult`:

```ts
export function isGameRouteCommitted(
  result: GameRouteCommitResult | null | undefined
): boolean {
  return (
    result?.status === 'committed' ||
    (result?.status === 'sandbox-committed' && result.changed)
  );
}
```

Use it in the new upgrade flow and replace the existing byte-equivalent committed checks in:

- `LogisticsPanel.svelte`;
- `FinancePanel.svelte`;
- `StoreStockTable.svelte`;
- `+page.svelte`.

This is a mechanical deduplication only. Do not change those surfaces’ behavior or copy.

### 9. Give every upgrade attempt truthful acknowledgement

Mirror the three-way acknowledgement pattern HPA-293 uses for inventory targets:

- **committed** → success confirmation + optional product CTA;
- **unchanged / sandbox committed with changed=false** → neutral “no upgrade was applied / level unchanged” status;
- **all other results** → generic “upgrade was not applied” status.

The upgrade surface does not need to reinterpret every domain error code. The point is to avoid a silent enabled-click/no-change experience.

Add localized strings in EN / JA / zh-Hant.

Use `role="status"`; never steal focus.

### 10. Keep success transient and one-shot

A committed success stores the captured preview only for the currently selected store.

Clear acknowledgement/success when:

- selected `store.id` changes;
- inspector closes/unmounts;
- a stale async result returns after selection changed.

Returning to the old store must not replay the previous success.

No persisted acknowledgement state.

### 11. Reuse HPA-293’s focused Store Detail path with one null convention

Use one explicit callback shape:

```ts
onOpenDetails: (productId: ProductId | null) => void
```

Call sites are explicit:

- normal Details → `onOpenDetails(null)`;
- milestone success CTA → `onOpenDetails(unlockedProductId)`.

The route remains:

```ts
function openStoreDetail(productId: ProductId | null = null): void {
  if (!selectedStore) return;
  focusedStockProductId = productId;
  isStoreDetailOpen = true;
}
```

No second focus atom or planner state.

### 12. Snacks planner support is a verified contract for the milestone journey

For the normal convenience 3 → 4 path:

- Snacks has a supported finished production material/recipe;
- supported chain categories include it;
- `listSupplyPlannerCategories` includes stocked supported products;
- sandbox `allowedProductIds` includes stocked products.

Therefore the existing Plan Supply action for newly unlocked Snacks is expected to be enabled in the deterministic sandbox journey.

Do not add planner fallback copy or planner-domain changes.

A failure here is a regression/incorrect assumption to fix at the existing seam, not a reason to add another HPA-283 feature.

## Risks

### Taller inspector / bottom-sheet interception

The visible card increases inspector height. The repo already has a dedicated 960×800 bottom-sheet regression test.

Mitigation:

- keep the full milestone journey at a stable desktop viewport;
- extend the existing 960×800 test to assert the new card is visible and Upgrade remains clickable/reachable.

Do not claim narrow-viewport CTA coverage unless a narrow CTA assertion is actually added.

### Async selection change

An upgrade result can settle after the user selects another store.

Mitigation:

- capture source store ID;
- ignore stale completion for acknowledgement/success;
- clear local status on store change.

### Planner handoff

Snacks support is verified from the current chain/planner rules.

Mitigation:

- Task 4 host/route tests pin `onOpenDetails('snacks')` → `focusedStockProductId = 'snacks'` before browser E2E;
- final E2E verifies the existing Plan Supply button for Snacks.

## Examples

### Level 2 → 3

- exact cost;
- multiplier before → after;
- no product unlock;
- next product milestone = level 4 / Snacks.

### Level 3 → 4

- cost based on level 3;
- unchanged revenue multiplier;
- Snacks unlock;
- real staff-capacity/staffing changes.

Committed result shows success + “Review Snacks stock & supply”.

### Level 9 → 10 convenience

- Essentials unlock;
- no later milestone;
- Household never appears.

### Maximum level

`previewStoreUpgrade` returns `null`; no next-upgrade card.

## State ownership

Persisted state is unchanged.

Pure derived state:

- `resolveStoreUpgrade(store)`;
- `previewStoreUpgrade(store)`.

Transient inspector state:

- `upgradePending`;
- acknowledgement status;
- captured committed preview.

No persistence, event log, global store, or reward registry.

## Accessibility / responsive requirements

- benefits visible without hover;
- preview visible even when purchase is disabled;
- localized product alt text;
- status feedback is non-blocking;
- no focus stealing;
- narrow card stacks cleanly;
- 960×800 browser regression proves card/Upgrade reachability.

## Localization

Update EN / JA / zh-Hant for:

- level transition / cost;
- model multiplier;
- unlocked product;
- staff capacity;
- staffing requirement;
- next milestone;
- committed confirmation;
- unchanged/no-upgrade status;
- generic not-applied status;
- review-stock-and-supply CTA.

No planner-unavailable copy.

## Test strategy

### State/domain

Cover:

- 2 → 3;
- normal 3 → 4;
- 6 → 7;
- 9 → 10;
- max level;
- all four archetypes;
- convenience Essentials vs unreachable Household;
- closed-form next milestone under valid-store invariant;
- preview purity;
- preview/mutation parity;
- one defensive cap/resolver assertion for malformed direct in-memory state.

### Component

Replace tooltip tests.

Prove:

- ordinary card;
- milestone product/capacity/staffing card;
- insufficient cash still shows preview;
- command-disabled still shows preview;
- max level;
- pending double-click guard;
- committed → success;
- unchanged → neutral status;
- rejected/busy/unavailable/failed → not-applied status;
- status clears on store change;
- stale async completion is ignored;
- milestone CTA passes the product ID;
- default optional upgrade callback resolves to null safely.

### Route / host

Pin early:

- upgrade handler returns controller result;
- normal Details passes null;
- milestone CTA sets exact product focus;
- close paths clear focus.

### E2E

Main journey:

1. create convenience store;
2. inject cash using the existing helper;
3. use real Upgrade clicks twice to reach level 3;
4. assert visible 3 → 4 Snacks preview;
5. purchase;
6. assert level 4 + success;
7. Review Snacks stock & supply;
8. assert Snacks focused;
9. assert existing stock controls + Plan Supply.

Narrow regression:

- extend existing 960×800 test;
- assert upgrade card visible;
- assert Upgrade is clickable/reachable above the control desk.

## Non-goals

- new progression module/state machine;
- industrial upgrade redesign;
- technology tree;
- new rewards/inventory/staff/currency;
- auto-hiring;
- ROI/forecast logic;
- planner behavior changes;
- StoreStockTable UX changes beyond mechanical commit-helper deduplication;
- new event/notification system;
- persistent completion history;
- map effects (HPA-295);
- balance changes;
- save migration/backward-compatibility work;
- new art generation.
