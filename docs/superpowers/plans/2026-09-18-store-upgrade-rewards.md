# HPA-283 Store Upgrade Rewards & Next Supply Decision — Implementation Plan

> Implement this plan in the **same HPA-283 PR**. Do not split planning, preview UI, completion feedback, planner handoff, or tests into separate PRs.

**Goal:** Make the existing store upgrade action show its real effects before purchase, confirm real effects after a successful commit, and focus the newly unlocked product in the existing Store Detail stock/supply flow.

**Architecture:** One pure `StoreUpgradePreview` describes the existing transition. `upgradeStore()` consumes that preview, keeping product identity and milestone effects aligned. `TileInspector` renders the preview and owns transient one-shot completion feedback. The route only returns the existing `GameRouteCommitResult` and reuses HPA-293’s `focusedStockProductId` path.

**Tech:** TypeScript, Svelte 5 / SvelteKit, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-18-store-upgrade-rewards-design.md`

## Global constraints

- One ticket / one PR.
- Keep `upgradeStore` as the authoritative mutation.
- No save-schema/migration work.
- No new progression state machine, event bus, global store, reward ledger, or planner behavior.
- No balance changes.
- No automatic inventory, hiring, currency, or other rewards.
- Reuse registered product art; no new image-generation task.
- Completion UI appears only after a proven committed command and is not persisted.
- Reuse the existing Store Detail / stock / Supply Planner handoff from HPA-293.
- Do not advertise convenience’s unreachable fifth product.

---

## Task 1 — Centralize a pure upgrade preview and align the transition

**Create**

- `src/lib/game/storeUpgrade.ts`
- `src/lib/game/storeUpgrade.spec.ts`

**Modify**

- `src/lib/game/state.ts`
- `src/lib/game/state.spec.ts`

### 1.1 Write RED tests for the preview contract

Add fixtures covering:

- level 2 → 3 ordinary upgrade;
- level 3 → 4 milestone;
- level 6 → 7 milestone;
- level 9 → 10 milestone;
- level 10 max;
- all four archetypes.

Assert:

- pre-upgrade-level cost;
- before/after revenue multiplier;
- exact unlocked `ProductId`;
- capacity before/after;
- staffing requirement before/after;
- next future product milestone for ordinary levels;
- no level-10 next milestone;
- convenience never exposes `household`.

Also deep-clone the input store and assert previewing did not mutate it.

Run:

```bash
bun run test:unit -- --run src/lib/game/storeUpgrade.spec.ts
```

Expected: RED before implementation.

### 1.2 Implement `previewStoreUpgrade(store)`

Use existing rule helpers only.

Recommended internal helper:

```ts
function resolveUnlockedProductId(store: Store, nextLevel: number): ProductId | null
```

It must preserve the current transition rule:

1. only milestone levels unlock;
2. get the archetype’s authored order;
3. choose the first product not already materialized;
4. respect `getUnlockedProductCount(nextLevel)` so authored-but-unreachable products stay locked.

For staff capacity, mirror the real transition:

```ts
store.staffCapacity
  + getStoreStaffCapacityBonus(nextLevel)
  - getStoreStaffCapacityBonus(store.level)
```

Clamp using the same existing score helper as the transition.

### 1.3 Refactor `upgradeStore` to consume the preview

Keep existing guards:

- unknown store;
- max level;
- insufficient cash.

After preview succeeds, use its:

- `nextLevel`;
- `cost`;
- `unlockedProductId`;
- `staffCapacityAfter`.

The transition still calls `createStoreProduct(..., game.day)` and still recomputes stock health.

Add parity tests:

```text
preview unlockedProductId === newly materialized product
preview staffCapacityAfter === stored staffCapacity
preview nextLevel === stored level
cash delta === preview cost
```

Run:

```bash
bun run test:unit -- --run src/lib/game/storeUpgrade.spec.ts src/lib/game/state.spec.ts
```

---

## Task 2 — Replace the tooltip with a visible upgrade card

**Modify**

- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

### 2.1 Add RED component coverage

Ordinary level fixture (2 → 3):

- renders “Level 2 → 3”;
- renders exact cost;
- renders revenue model multiplier before → after;
- does not render an unlocked product;
- renders next product milestone / exact product name.

Milestone fixture (3 → 4):

- renders exact unlocked product name and registered art;
- renders capacity delta;
- renders changed staffing requirement;
- does not claim a revenue increase.

Also cover:

- insufficient cash;
- command disabled;
- max level.

### 2.2 Render from `previewStoreUpgrade`

Remove the current generic `nextBenefit` tooltip derivation.

Keep the existing inspector and action button; add a compact visible section immediately around the upgrade action.

Ordinary benefit copy should say “revenue model multiplier” (or equivalent localized wording), not “revenue +10%”.

Milestone copy should distinguish:

- “staff capacity”;
- “required general staff” (when changed).

Use:

```ts
getProductArt(preview.unlockedProductId)
i18n.labels.productCategory(preview.unlockedProductId)
```

No new art files.

### 2.3 Narrow-layout and keyboard pass

Keep benefits in normal document flow.

No hover-only information and no custom focus management.

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
bun run check
```

---

## Task 3 — Return the existing command result and show truthful one-shot confirmation

**Modify**

- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/MapInspectorHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`

### 3.1 Widen the existing callback, do not add a new command

Change the callback contract to:

```ts
onUpgradeStore: (storeId: string) => Promise<GameRouteCommitResult | null>
```

Route handler:

```ts
async function upgradeStoreHandler(
  storeId: string
): Promise<GameRouteCommitResult | null> {
  if (!game || !mutationAvailability.upgradeStore) return null;
  return gameRouteController.upgradeStore(storeId);
}
```

No controller change is required.

### 3.2 Add a small success predicate in the component

Treat only these as success:

```ts
result?.status === 'committed'
||
(result?.status === 'sandbox-committed' && result.changed)
```

Everything else is non-success.

### 3.3 Capture preview-before-command and show it once after success

On click:

1. capture `previewStoreUpgrade(store)`;
2. await `onUpgradeStore(store.id)`;
3. if the result proves success, save `{ storeId, preview }` in local component state;
4. otherwise leave/clear success feedback.

Render the confirmation only when its `storeId === store.id`.

Use `role="status"` / polite semantics and do not focus it.

The confirmation includes:

- attained level;
- the same actual benefits;
- when a product unlocked, a “Review <product> stock & supply” action.

Unit tests must prove:

- committed scenario result → feedback;
- sandbox committed + changed → feedback;
- sandbox committed + unchanged → no feedback;
- rejected/busy/unavailable/failed/confirmation-required → no feedback.

---

## Task 4 — Reuse Store Detail’s focused-product path

**Modify**

- `src/lib/components/game/TileInspector.svelte`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/+page.svelte`
- focused specs for those files.

### 4.1 Widen `onOpenDetails`

Change:

```ts
onOpenDetails: () => void
```

to:

```ts
onOpenDetails: (productId?: ProductId) => void
```

The existing Details button still calls it with no argument.

### 4.2 Reuse `focusedStockProductId`

Update the route helper:

```ts
function openStoreDetail(productId: ProductId | null = null): void {
  if (!selectedStore) return;
  focusedStockProductId = productId;
  isStoreDetailOpen = true;
}
```

Do not add another focus variable.

The milestone confirmation action calls:

```ts
onOpenDetails(preview.unlockedProductId)
```

HPA-293 already handles the focused row in `StoreDetailModal` / `StoreStockTable`.

### 4.3 Prove no stale focus

Pin:

- normal Details → null focus;
- milestone action → exact unlocked product;
- closing detail clears focus (existing HPA-293 behavior remains).

Run focused host/route specs.

---

## Task 5 — Keep the planner handoff honest, without adding planner behavior

**Primary expectation:** no planner-domain changes.

Inspect the focused stock row produced by Task 4.

The existing `StoreStockTable` already:

- shows stock controls;
- shows recovery/supply context for a focused product;
- enables planner action only when `plannerProductIds.includes(productId)`;
- calls the existing `onPlanSupply(productId)`.

Only if the disabled planner control is currently ambiguous, make a minimal presentation-only improvement in:

- `src/lib/components/game/StoreStockTable.svelte`;
- its component spec;
- locale files.

Allowed change:

- visible or accessible “Supply Planner unavailable for this product” reason.

Not allowed:

- new planner category mapping;
- new recommendation;
- direct upgrade-card planner state;
- new supply command;
- new persistence.

Focused tests should assert the unlocked product’s existing planner button receives the same real `ProductId`.

---

## Task 6 — Deterministic milestone E2E and final gates

**Modify**

- `src/routes/retail-sim.e2e.ts`

### 6.1 Add one level-3 → 4 journey

Use deterministic current-schema save injection or the existing retail fixture style.

Journey:

1. load/select a level-3 store with enough cash;
2. assert visible 3 → 4 preview and exact unlocked product;
3. click the existing upgrade command;
4. assert level becomes 4;
5. assert cash falls by `getStoreUpgradeCost(3)` where the test can observe it;
6. assert one-shot success feedback;
7. click “Review <product> stock & supply”;
8. assert Store Detail opens with that product focused;
9. assert its existing stock controls are present;
10. assert planner action is enabled/disabled according to the real `plannerProductIds` contract.

Do not create a second E2E for 2 → 3.

### 6.2 Full verification

Run:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
git diff --check main...HEAD
```

If project CI has a patch-coverage gate, close only HPA-283-introduced gaps; do not expand scope to unrelated coverage cleanup.

## Completion checklist

- [ ] Preview uses existing rules and is pure.
- [ ] Transition consumes the same product/effect resolver.
- [ ] Ordinary levels show truthful multiplier change.
- [ ] Milestones show exact product/capacity/staffing change and no fake revenue step.
- [ ] Convenience fifth product is never advertised.
- [ ] Upgrade cost uses the pre-upgrade level.
- [ ] Success feedback appears only after a committed mutation.
- [ ] Rejected/no-op commands never celebrate.
- [ ] Feedback is transient and does not replay after load/open.
- [ ] Unlocked product opens the existing focused stock row.
- [ ] Existing Supply Planner handoff owns planner availability.
- [ ] EN / JA / zh-Hant copy is updated.
- [ ] Keyboard/narrow layouts do not depend on hover.
- [ ] No new art, save schema, progression framework, planner behavior, or global state.
- [ ] One deterministic milestone E2E passes.
- [ ] Full project gates pass.
