# HPA-283 Store Upgrade Rewards & Next Supply Decision — Design

**Linear:** HPA-283  
**Status:** implementation design for the single HPA-283 delivery PR  
**Baseline:** `main` after HPA-293 / PR #58 (`2b23a4003377abfc53168a408cfd04a4e149c3e6`)

## Goal

Make the existing retail-store upgrade understandable before purchase and visibly meaningful after a real commit, without creating another progression, reward, planner, or persistence system.

From the current retail inspector, the player should be able to answer:

1. What level am I buying?
2. What does it cost?
3. What actually changes at that level?
4. If a product unlocks, where do I configure its stock and inspect its existing supply path?

The complete slice remains **one ticket / one PR**.

## Existing authority boundaries

Keep these owners unchanged:

- `src/lib/game/leveling.ts`: level cap, milestone levels, cost curve, revenue multiplier, staff-capacity bonus.
- `src/lib/game/state.ts::upgradeStore`: authoritative mutation, cash deduction, product materialization, capacity mutation, stock-health refresh.
- `src/lib/game/archetypes.ts`: authored product order.
- `src/lib/game/staffing.ts::getStaffingRequirement`: staffing requirement by archetype / level.
- `src/routes/gameRouteController.ts::upgradeStore`: command, persistence, scenario gating, `GameRouteCommitResult`.
- `src/lib/components/game/TileInspector.svelte`: current upgrade surface.
- HPA-293’s existing Store Detail flow: `focusedStockProductId`, stock controls, supply context, and per-product Supply Planner handoff.

No controller change, save-schema change, planner-domain change, or new art is needed.

## Current UX gap

The inspector currently shows only a cost button plus tooltip-only generic benefit text.

That hides:

- the actual product identity at milestones;
- the real ordinary-level multiplier before → after;
- the fact that levels 4 / 7 / 10 intentionally do **not** add the ordinary revenue step;
- staff capacity versus staffing requirement;
- the next real product milestone;
- the existing stock / supply decision that follows a product unlock.

## Design decisions

### 1. Colocate upgrade effects, preview, and mutation in `state.ts`

Do **not** add `src/lib/game/storeUpgrade.ts`.

Extract the mutation-relevant effects from the current `upgradeStore` body into one small colocated helper, for example:

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

The helper owns only values that the mutation actually consumes:

- next level;
- pre-upgrade-level cost;
- real product materialization decision;
- post-upgrade staff capacity.

`upgradeStore()` remains the only mutator. It continues to:

- reject unknown / max-level / insufficient-cash upgrades;
- deduct cash;
- call `createStoreProduct(..., game.day)` only when `unlockedProductId` is non-null;
- recompute stock health;
- replace the upgraded store in `GameState`.

### 2. Build the display preview from the same resolution, not vice versa

Export `previewStoreUpgrade(store)` from `state.ts`.

Its display DTO may add fields that the mutation does not need:

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

export function previewStoreUpgrade(store: Store): StoreUpgradePreview | null;
```

The preview derives display-only fields from existing helpers:

- `getStoreRevenueMultiplier`;
- `getStaffingRequirement`;
- the same unlock resolver used by `resolveStoreUpgrade`.

The mutation must **not** consume revenue multipliers, staffing requirements, milestone labels, or other presentation fields.

### 3. Preserve the existing unlock-count cap, including catch-up states

The current transition does not mean “milestone ⇒ next authored product”.

At a milestone, product materialization occurs only when both are true:

1. there is an authored product not already in the store; and
2. `products.length < getUnlockedProductCount(nextLevel)`.

The preview must use exactly that rule.

Important cases:

- normal 3 → 4 convenience: unlock Snacks;
- catch-up / pre-materialized milestone: if the store already has the level-4 unlock budget, `unlockedProductId === null` while staff capacity still increases;
- 9 → 10 convenience: unlock Essentials;
- Household remains unreachable because the level cap allows only four products.

`nextProductMilestone` means the next future milestone that would **actually materialize a product under the same resolver**, not simply the next string in `startingProductIds`.

### 4. Affordability remains inspector state

Cash is not part of the preview.

`TileInspector` continues to derive affordability from current game state:

```ts
game.cash >= preview.cost
```

The preview card remains visible whenever a next upgrade exists, even when:

- cash is insufficient;
- the current scenario disallows upgrading;
- another route-level disabled reason applies.

Purchase availability is separate from visibility of what the player is saving toward.

### 5. Replace tooltip-only benefit text with a visible compact upgrade card

Keep the feature inside `TileInspector`; no new screen/modal.

When a preview exists, show:

- `Level N → N+1`;
- exact cost;
- real effects.

For an ordinary level:

- show revenue **model multiplier** before → after;
- do not promise sales or profit;
- show the next real product milestone if one exists.

For a milestone:

- show the exact product only when `unlockedProductId !== null`;
- reuse `getProductArt(productId)`;
- show staff capacity before → after;
- show changed staffing requirement;
- do not show a revenue increase when the multiplier is unchanged.

For catch-up milestones with no product materialization, show only the effects that really occur.

The current tooltip-specific “Next: +10% revenue” / “product #2” behavior is removed; benefits are readable without hover.

### 6. Await the existing command result and guard the in-flight purchase

Change the existing callback contract to:

```ts
onUpgradeStore: (storeId: string) => Promise<GameRouteCommitResult | null>
```

The route simply returns `gameRouteController.upgradeStore(storeId)`; the controller stays unchanged.

`TileInspector` owns local `upgradePending` state:

- ignore a second click while pending;
- disable the upgrade button until the first promise settles;
- capture the preview before invoking the command.

This prevents two sandbox clicks from applying 3 → 4 and then 4 → 5 while both confirmations still refer to the 3 → 4 preview.

### 7. Add one shared committed-result predicate

Add beside `GameRouteCommitResult` in `src/lib/game/commandResult.ts`:

```ts
export function isGameRouteCommitted(
  result: GameRouteCommitResult | null | undefined
): boolean;
```

It returns true only for:

- `status === 'committed'`;
- `status === 'sandbox-committed' && changed === true`.

Use it for the new upgrade confirmation.

Do **not** refactor Finance, Logistics, or other existing copies in this ticket.

### 8. Keep completion feedback transient and truly one-shot

After the awaited command returns:

- show confirmation only when `isGameRouteCommitted(result)` is true;
- rejected / unchanged / busy / unavailable / failed / confirmation-required results do not celebrate;
- do not persist acknowledgement state.

The confirmation reports the captured real preview:

- attained level;
- actual ordinary/milestone effects;
- optional unlocked-product follow-up.

Clear confirmation when:

- the selected `store.id` changes;
- the inspector closes/unmounts;
- a pending result settles after the user has already switched to another store.

This prevents a success banner from reappearing merely because the player later returns to the same store.

Use a non-blocking `role="status"`; never steal focus.

### 9. Reuse HPA-293’s focused Store Detail path

Widen:

```ts
onOpenDetails: () => void
```

to:

```ts
onOpenDetails: (productId?: ProductId) => void
```

The ordinary Details button passes no product.

The route becomes equivalent to:

```ts
function openStoreDetail(productId: ProductId | null = null): void {
  if (!selectedStore) return;
  focusedStockProductId = productId;
  isStoreDetailOpen = true;
}
```

A successful milestone confirmation may call:

```ts
onOpenDetails(preview.unlockedProductId)
```

That opens the existing Stock tab with the newly unlocked product focused.

No second focus atom, no planner state in the upgrade card, and no new stock/supply command.

### 10. Leave StoreStockTable / Supply Planner behavior unchanged

HPA-293 already owns the focused row and planner handoff.

For the normal 3 → 4 convenience journey, Snacks is a supported planner product and the existing Plan Supply button should be enabled.

This ticket does **not** add:

- planner-disabled explanatory chrome;
- planner category mappings;
- new planner recommendations;
- direct upgrade-card → planner state;
- StoreStockTable changes.

If the deterministic 3 → 4 journey cannot use the existing Snacks planner handoff, treat that as a spec/integration failure to investigate rather than adding fallback UI here.

## Detailed examples

### Level 2 → 3

Preview shows:

- exact 2 → 3 cost;
- revenue model multiplier before → after;
- no product unlock;
- no capacity/staffing change;
- next actual product milestone.

### Normal level 3 → 4

Preview shows:

- pre-upgrade-level cost;
- unchanged revenue multiplier;
- actual second product;
- real staff-capacity change;
- real staffing-requirement change.

After a successful commit, the confirmation offers “Review <product> stock & supply”.

### Catch-up level 3 → 4

If the store already contains the level-4 product budget:

- `unlockedProductId === null`;
- no product unlock is advertised or celebrated;
- capacity/staffing still reflect the real level-4 transition.

### Level 9 → 10 convenience

Preview shows Essentials as the fourth reachable product.

Household is never previewed.

### Maximum level

`previewStoreUpgrade` returns `null`; no next-upgrade card is rendered and the existing max-level state remains.

## State ownership

### Persisted

Unchanged:

- `GameState`;
- cash;
- store level / products / staff capacity;
- scenario run state.

### Derived

- `resolveStoreUpgrade(store)`: pure mutation effects.
- `previewStoreUpgrade(store)`: pure display projection.

### Transient UI

- `upgradePending`;
- one current-store success confirmation.

No new persistence field, event log, acknowledgement registry, or global store.

## Accessibility / responsive requirements

- all benefits visible without hover;
- purchase button disabled independently of preview visibility;
- product art uses localized product-name alt text where meaningful;
- confirmation uses non-blocking status semantics;
- no focus stealing;
- narrow layout stacks the card;
- browser coverage proves the real overlay does not intercept Upgrade or “Review … stock & supply” clicks.

## Localization

Update EN / JA / zh-Hant copy for:

- level transition / cost;
- revenue model multiplier;
- unlocked product;
- staff capacity;
- staffing requirement;
- next product milestone;
- successful upgrade confirmation;
- review-stock-and-supply CTA.

Do not introduce planner-unavailable copy in this ticket.

## Test strategy

### Domain / state tests

Cover:

- 2 → 3;
- normal 3 → 4;
- catch-up 3 → 4 with no product materialization but capacity gain;
- 6 → 7;
- 9 → 10;
- max level;
- all four archetypes;
- convenience Essentials vs unreachable Household;
- nextProductMilestone based on real future materialization;
- preview purity;
- preview/mutation parity for next level, cost, product materialization, and staff capacity.

### Component tests

Replace the current tooltip assertions.

Prove:

- ordinary card is visible;
- milestone product / capacity / staffing effects are visible;
- catch-up milestone does not invent an unlock;
- insufficient cash still shows the preview;
- command-disabled state still shows the preview;
- max-level state;
- pending click disables/rejects a second purchase;
- only committed results produce success;
- confirmation clears on store change;
- milestone CTA forwards the real product ID.

### Route / host tests

Pin:

- `upgradeStoreHandler` returns the existing controller result;
- `onOpenDetails()` clears focus to null;
- `onOpenDetails(productId)` sets exactly that product;
- existing close paths still clear `focusedStockProductId`.

### E2E

Use the existing real upgrade flow; do not hand-edit store level/products in the save.

1. create convenience store;
2. use existing `injectCashAndReload`;
3. set a viewport large enough that the real overlay cannot intercept the new actions;
4. click Upgrade twice through the existing inspector to reach level 3;
5. assert the visible 3 → 4 Snacks preview;
6. purchase;
7. assert level 4 / Snacks / success confirmation;
8. click “Review Snacks stock & supply”;
9. assert Store Detail focuses Snacks;
10. assert existing threshold/target controls and existing Plan Supply button are usable.

One browser journey is sufficient; ordinary-level behavior stays in unit/component tests.

## Non-goals

- new progression module / state machine;
- industrial upgrade redesign;
- technology tree;
- new rewards, inventory, staff, or currency;
- auto-hiring;
- ROI / forecast logic;
- planner changes;
- StoreStockTable changes;
- new event bus / notification system;
- persistent completion history;
- map effects (HPA-295);
- balance changes;
- save migration / backward-compatibility work;
- new art generation.
