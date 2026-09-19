# HPA-283 Store Upgrade Rewards & Next Supply Decision — Implementation Plan

> Implement this plan in the **same HPA-283 PR**. Do not split planning, preview UI, confirmation, focused stock handoff, or tests into separate PRs.

**Goal:** Make the current store-upgrade action show its real effects before purchase, confirm those same effects only after a committed command, and focus the newly unlocked product in HPA-293’s existing stock/supply flow.

**Architecture:** Keep preview and mutation colocated in `state.ts`. Extract one small pure mutation-effects resolver from `upgradeStore`; both the exported display preview and the existing mutation call it. `TileInspector` renders the preview, awaits the existing route result, guards duplicate clicks, and owns transient confirmation. The route reuses `focusedStockProductId`. No planner-domain, StoreStockTable, controller, save-schema, or art work.

**Tech:** TypeScript, Svelte 5 / SvelteKit, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-18-store-upgrade-rewards-design.md`

## Global constraints

- One ticket / one PR.
- `upgradeStore` stays the only store-upgrade mutator.
- No new `storeUpgrade.ts`; keep effects + preview beside the mutation in `state.ts`.
- No save schema / migration / compatibility work.
- No new progression state machine, reward system, event bus, global store, planner behavior, or stock command.
- No balance changes.
- No automatic inventory, hiring, currency, or rewards.
- Reuse registered product art.
- Preview remains visible even when purchase is disabled.
- Confirmation appears only after a committed command and is never persisted.
- Reuse HPA-293’s focused stock row / existing Plan Supply handoff.
- Do not advertise convenience’s unreachable Household product.
- Do not modify `StoreStockTable` unless a real implementation regression proves the existing HPA-293 contract is broken; the planned journey expects no such change.

---

## Task 1 — Extract mutation effects in `state.ts` and build the preview from them

**Modify**

- `src/lib/game/state.ts`
- `src/lib/game/state.spec.ts`

### 1.1 Replace the current inline milestone logic with one pure effects resolver

Extract only values the mutation writes/consumes, for example:

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

Rules must remain exactly equivalent to current `upgradeStore`:

- max level → `null`;
- cost from `getStoreUpgradeCost(store.level)`;
- unlock only on milestone levels;
- choose the first authored product the store does not already stock;
- materialize it only when `store.products.length < getUnlockedProductCount(nextLevel)`;
- capacity uses the existing before/after milestone-bonus delta and `clampScore`.

Do not include display-only fields here.

### 1.2 Export `previewStoreUpgrade(store)` from the same file

Add display-only fields on top of the resolution:

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

Use existing helpers:

- `getStoreRevenueMultiplier`;
- `getStaffingRequirement`;
- the same product-materialization resolver used by the mutation.

`nextProductMilestone` must mean “the next future milestone that would actually add a product under the same unlock-count cap”, not simply the next authored product.

### 1.3 Refactor `upgradeStore` to consume only the mutation resolution

Preserve existing guards:

- unknown store;
- max level;
- insufficient cash.

Then use resolution fields for:

- cash delta;
- next level;
- optional `createStoreProduct(..., game.day)`;
- staff capacity.

Keep stock-health recomputation and store replacement unchanged.

The mutation must not depend on:

- revenue multipliers;
- staffing requirement;
- next milestone;
- UI copy.

### 1.4 Pin RED/GREEN coverage, including the catch-up case

Add/adjust focused state tests for:

- 2 → 3 ordinary;
- normal 3 → 4;
- **catch-up 3 → 4** where the store already has the level-4 product budget:
  - `unlockedProductId === null`;
  - no extra product materializes;
  - capacity still rises;
- 6 → 7;
- 9 → 10;
- max level;
- all four archetypes;
- convenience 9 → 10 = Essentials, never Household;
- nextProductMilestone uses real future materialization;
- preview does not mutate the store;
- preview/mutation parity:
  - next level;
  - cost;
  - unlocked product;
  - final staff capacity.

Run:

```bash
bun run test:unit -- --run src/lib/game/state.spec.ts
```

---

## Task 2 — Replace tooltip-only hints with the visible upgrade card

**Modify**

- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

### 2.1 Replace the existing tooltip tests

Delete/replace the current assertions around:

- `title="Next: +10% revenue"`;
- `title="Next: Unlocks product #2 + 8 staff capacity"`.

Those tests are the RED seam for the new visible card.

### 2.2 Remove the generic `nextBenefit` derivation

Drop the UI-side use of:

- `STORE_MILESTONE_CAPACITY_BONUS`;
- generic product-number copy;
- tooltip-only benefit text.

Derive:

```ts
const upgradePreview = $derived(store ? previewStoreUpgrade(store) : null);
const canAffordUpgrade = $derived(
  upgradePreview ? game.cash >= upgradePreview.cost : false
);
```

### 2.3 Render the card whenever a preview exists

Do **not** gate the card on affordability or command availability.

Ordinary 2 → 3 fixture proves:

- “Level 2 → 3” visible;
- exact cost visible;
- revenue **model multiplier** before → after visible;
- no fake product unlock;
- next actual product milestone visible.

Milestone 3 → 4 fixture proves:

- exact product name + registered art;
- staff capacity before → after;
- changed staffing requirement;
- no revenue-increase copy when multiplier is unchanged.

Catch-up fixture proves:

- no product unlock shown when `unlockedProductId === null`;
- real capacity/staffing effects still shown.

Also prove:

- insufficient cash still displays all benefits;
- command-disabled state still displays all benefits;
- max level has no next-upgrade card.

### 2.4 Keep purchase state separate

The purchase button is disabled for:

- command unavailable;
- max level;
- insufficient cash;
- Task 3 in-flight state.

Existing disabled reason / insufficient-cash copy may remain.

### 2.5 Accessibility / layout

- benefits are normal visible text, not title-only;
- localized product alt text;
- card stacks on narrow inspector layouts;
- no custom focus movement.

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
bun run check
```

---

## Task 3 — Await the existing command, share commit semantics, and gate duplicate clicks

**Modify**

- `src/lib/game/commandResult.ts`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/MapInspectorHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`

### 3.1 Add the shared success predicate next to the type

Add:

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

Use this helper for HPA-283.

Do **not** refactor Finance, Logistics, the route’s unrelated existing helper, or HPA-293 in this ticket.

### 3.2 Return the existing controller result from the route

Change:

```ts
function upgradeStoreHandler(storeId: string): void
```

to:

```ts
async function upgradeStoreHandler(
  storeId: string
): Promise<GameRouteCommitResult | null> {
  if (!game || !mutationAvailability.upgradeStore) return null;
  return gameRouteController.upgradeStore(storeId);
}
```

No controller change.

Widen the host/component callback types accordingly.

### 3.3 Add local `upgradePending`

The inspector purchase handler must:

1. return immediately if already pending;
2. capture the current `store.id` and `upgradePreview`;
3. set pending before awaiting the callback;
4. disable the Upgrade button while pending;
5. await the route result;
6. clear pending in `finally`.

This is required for sandbox, where two rapid clicks can otherwise apply consecutive upgrades before rerender.

Component test:

- first click starts a deferred promise;
- second click while pending does not invoke callback again;
- button remains disabled until the promise settles.

### 3.4 Show confirmation only for a real committed result

After await:

- require `isGameRouteCommitted(result)`;
- require the current selected store is still the store whose preview was captured;
- then store the transient success preview.

Non-success statuses produce no success UI:

- sandbox committed + `changed: false`;
- unchanged;
- busy;
- rejected/domain rejection;
- unavailable;
- failed;
- confirmation-required.

Use a non-blocking `role="status"`.

### 3.5 Clear one-shot confirmation correctly

Do not rely only on rendering `success.storeId === store.id`.

Clear confirmation when `store.id` changes so returning later cannot resurrect the old banner.

Also ensure an async result settling after the player switched stores cannot repopulate stale confirmation.

Closing/unmounting the inspector naturally drops local state.

Tests:

- success appears for committed result;
- switching to another store clears it;
- returning to the old store does not re-show it;
- stale async completion after store switch does not create feedback.

---

## Task 4 — Reuse HPA-293’s focused Store Detail path

**Modify**

- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/MapInspectorHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`

### 4.1 Widen the existing details callback

Change:

```ts
onOpenDetails: () => void
```

to:

```ts
onOpenDetails: (productId?: ProductId) => void
```

The normal Details button still calls it without a product.

The successful milestone confirmation calls it with the actual `unlockedProductId`.

### 4.2 Make the route’s null-vs-product behavior explicit

Update:

```ts
function openStoreDetail(productId: ProductId | null = null): void {
  if (!selectedStore) return;
  focusedStockProductId = productId;
  isStoreDetailOpen = true;
}
```

Mandatory route assertions:

- ordinary Details → `focusedStockProductId = null`;
- milestone CTA → exact new product;
- close paths still clear focus;
- no second focus state is introduced.

### 4.3 Do not change StoreStockTable / planner code

The existing focused row already:

- exposes the product’s stock controls;
- expands recovery/supply context even when the new product starts healthy;
- carries the existing Plan Supply action.

For the deterministic convenience 3 → 4 journey, Snacks should already be planner-supported.

If that integration fails, investigate the HPA-283 assumptions; do not add planner-disabled copy or fallback behavior as part of this task.

Run focused host/route/component tests.

---

## Task 5 — One real milestone E2E and final gates

**Modify**

- `src/routes/retail-sim.e2e.ts`

### 5.1 Extend/rework the existing store-upgrade browser journey

Do not hand-edit saved `level` / `products`.

Use the existing flow:

1. `page.goto('/')`;
2. create a convenience store with `buildRetailStoreAt`;
3. use existing `injectCashAndReload(page, 1_000_000)`;
4. select the store;
5. click the real Upgrade button twice, waiting for level 2 then level 3;
6. assert the visible 3 → 4 preview names Snacks;
7. assert the Upgrade button is actually clickable in the real overlay;
8. purchase 3 → 4;
9. assert level 4, Snacks, and success confirmation;
10. click “Review Snacks stock & supply”;
11. assert the CTA is actually clickable in the real overlay;
12. assert Store Detail focuses Snacks;
13. assert existing threshold / target controls;
14. assert existing Plan Supply for Snacks is enabled/usable.

Set a sufficiently large viewport before interacting with the taller inspector (use the existing 1920×1080 precedent rather than depending on a cramped default viewport).

This one journey replaces the current one-step “player upgrades a store from the tile inspector” coverage; do not add a second ordinary-level E2E.

### 5.2 Full verification

Run:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
git diff --check main...HEAD
```

If patch coverage fails, close only HPA-283-introduced gaps.

## Completion checklist

- [ ] Effects resolver is colocated with `upgradeStore`.
- [ ] Display preview builds on the effects resolver; mutation never consumes display fields.
- [ ] Existing unlock-count cap is preserved.
- [ ] Catch-up milestone cannot promise a product it will not receive.
- [ ] Convenience never advertises Household.
- [ ] Preview stays visible when cash/command availability blocks purchase.
- [ ] Old tooltip-only tests are replaced.
- [ ] Upgrade callback returns the existing route result.
- [ ] Shared `isGameRouteCommitted` helper is used for the new confirmation.
- [ ] In-flight guard prevents duplicate sandbox upgrades.
- [ ] Only a real committed result produces success UI.
- [ ] Confirmation clears on store change and never replays later.
- [ ] Milestone CTA reuses `focusedStockProductId`.
- [ ] Normal Details explicitly clears focus to null.
- [ ] No StoreStockTable / planner-domain work is added.
- [ ] One real 3 → 4 E2E proves Snacks preview → purchase → focused stock row → existing Plan Supply.
- [ ] EN / JA / zh-Hant copy is updated.
- [ ] No new art, schema, reward system, planner behavior, or compatibility work.
- [ ] Full gates pass.
