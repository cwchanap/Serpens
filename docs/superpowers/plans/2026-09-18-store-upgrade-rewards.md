# HPA-283 Store Upgrade Rewards & Next Supply Decision — Implementation Plan

> Implement this plan in the **same HPA-283 PR**. Do not split planning, preview UI, acknowledgement, focused-stock handoff, or tests into separate PRs.

**Goal:** Make the current store-upgrade action show truthful effects before purchase, acknowledge the real command result afterward, and focus the newly unlocked product in HPA-293’s existing stock/supply flow.

**Architecture:** Keep preview and mutation colocated in `state.ts`. Extract one small pure mutation-effects resolver from `upgradeStore`; both the display preview and mutation call it. `TileInspector` renders the preview, awaits the route result, blocks duplicate sandbox clicks, and owns transient acknowledgement. The route reuses `focusedStockProductId`. No planner-domain, controller, save-schema, art, or progression-framework work.

**Tech:** TypeScript, Svelte 5 / SvelteKit, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-18-store-upgrade-rewards-design.md`

## Global constraints

- One ticket / one PR.
- `upgradeStore` remains the only store-upgrade mutator.
- No new `storeUpgrade.ts`.
- No save migration / compatibility work.
- No new progression state machine, reward system, planner behavior, stock command, event bus, or global store.
- No balance changes.
- Reuse registered product art.
- Preview remains visible when purchase is disabled.
- Every attempted purchase gets truthful acknowledgement; only committed results get celebration/CTA.
- Reuse HPA-293’s focused stock row and existing Plan Supply handoff.
- No StoreStockTable UX change; only a mechanical shared-helper substitution is allowed there.
- Convenience never advertises Household.

## Risks

### R1 — Taller inspector can regress narrow bottom-sheet reachability

The new card increases inspector height, and the repo already has a 960×800 regression around the fixed control desk.

Mitigation:

- keep the full 3 → 4 journey at a stable desktop viewport;
- extend the existing 960×800 test with card-visible + Upgrade-reachable assertions.

### R2 — Sandbox has no controller re-entrancy gate

Two rapid clicks can apply consecutive upgrades before rerender.

Mitigation:

- local `upgradePending`;
- second click ignored;
- button disabled until promise settles.

### R3 — Async result can settle after store selection changes

Mitigation:

- capture source store ID;
- clear acknowledgement on store change;
- ignore stale result if current store differs.

### R4 — Snacks planner handoff is an integration dependency

Verified current contract:

- Snacks maps to a supported finished material/recipe;
- supported chain categories include it;
- `listSupplyPlannerCategories` includes stocked supported products;
- sandbox allowed product IDs include stocked products.

Task 4 pins the focused handoff before the browser journey.

---

## Task 1 — Extract mutation effects in `state.ts` and build the preview

**Modify**

- `src/lib/game/state.ts`
- `src/lib/game/state.spec.ts`

### 1.1 Extract `resolveStoreUpgrade(store)`

Move the current mutation-relevant calculations from `upgradeStore` into a pure colocated helper:

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

Preserve current behavior exactly:

- max level → null;
- cost from pre-upgrade level;
- only milestones consider products;
- find first authored product not already present;
- only materialize when `store.products.length < getUnlockedProductCount(nextLevel)`;
- use existing capacity delta + `clampScore`.

Keep the find/cap logic defensive even though valid persisted stores satisfy stricter product invariants.

### 1.2 Export `previewStoreUpgrade(store)`

Build a display projection from the resolution plus existing rules:

- revenue multiplier before/after;
- staff capacity before;
- staffing requirement before/after;
- next product milestone.

For `nextProductMilestone`, use the valid-store closed form:

```text
next milestone = first STORE_MILESTONE_LEVELS entry > store.level
product index = getUnlockedProductCount(next milestone) - 1
```

Add a one-line comment citing the validated-store invariant: product count equals unlocked count and IDs belong to the unlocked prefix.

Do not simulate future levels.

### 1.3 Refactor `upgradeStore` to consume only the resolution

Keep existing unknown-store and affordability guards.

Use resolution fields only for:

- cost;
- next level;
- optional product materialization;
- staff capacity.

Keep `createStoreProduct(..., game.day)`, stock-health recomputation, and store replacement in the mutator.

### 1.4 Tests

Cover:

- 2 → 3;
- 3 → 4;
- 6 → 7;
- 9 → 10;
- max;
- all four archetypes;
- convenience 9 → 10 = Essentials, never Household;
- closed-form next milestone;
- preview purity;
- preview/mutation parity for level, cost, product, capacity.

Keep **one defensive state-level assertion** that malformed direct in-memory input still honors the mutation’s unlock-count cap. Do not create a component/UI fixture for this unsupported state.

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

### 2.1 Replace existing tooltip tests

Delete/replace the current assertions for:

- `Next: +10% revenue`;
- `Unlocks product #2 + 8 staff capacity`.

These become visible-card tests.

### 2.2 Render from `previewStoreUpgrade`

Remove UI-side generic milestone arithmetic/copy.

Show the card whenever preview exists, regardless of cash or command availability.

Ordinary 2 → 3:

- Level 2 → 3;
- exact cost;
- revenue **model multiplier** before → after;
- next product milestone.

Milestone 3 → 4:

- exact Snacks name + registered art;
- staff capacity before → after;
- changed staffing requirement;
- no fake revenue increase.

Also cover:

- insufficient cash still shows preview;
- command-disabled still shows preview;
- max level.

### 2.3 Keep purchase availability separate

Button disabled by:

- command unavailable;
- no next upgrade;
- insufficient cash;
- Task 3 pending state.

### 2.4 Accessibility/layout

- all benefit text visible without hover;
- localized product alt;
- narrow layout stacks;
- no focus stealing.

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
bun run check
```

---

## Task 3 — Await the command, dedupe commit semantics, and acknowledge all outcomes

**Modify**

- `src/lib/game/commandResult.ts`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/lib/components/game/StoreStockTable.svelte`
- `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- `src/lib/components/game/FinancePanel.svelte`
- `src/lib/components/game/FinancePanel.svelte.spec.ts`
- `src/lib/components/game/LogisticsPanel.svelte`
- `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/MapInspectorHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`
- locale files from Task 2.

### 3.1 Add and adopt `isGameRouteCommitted`

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

In the same commit, replace the existing equivalent committed checks in:

- LogisticsPanel;
- FinancePanel;
- StoreStockTable;
- `+page.svelte`.

Do not change their behavior, status copy, or branching beyond the mechanical helper substitution.

Focused existing specs should stay green.

### 3.2 Widen the upgrade callback safely

TileInspector prop:

```ts
onUpgradeStore?: (storeId: string) => Promise<GameRouteCommitResult | null>
```

Default:

```ts
onUpgradeStore = async () => null
```

Route handler returns the existing controller result:

```ts
async function upgradeStoreHandler(
  storeId: string
): Promise<GameRouteCommitResult | null> {
  if (!game || !mutationAvailability.upgradeStore) return null;
  return gameRouteController.upgradeStore(storeId);
}
```

No controller change.

### 3.3 Add in-flight guard

Purchase handler:

1. return if already pending;
2. capture source store ID + preview;
3. set `upgradePending = true`;
4. await callback;
5. classify result;
6. clear pending in `finally`.

Test with a deferred promise:

- first click calls once;
- second click while pending does not call again;
- button disabled until settle.

### 3.4 Add three-way acknowledgement

Model local acknowledgement as success / unchanged / not-applied.

Classification:

- `isGameRouteCommitted(result)` → success confirmation;
- `status === 'unchanged'` or sandbox committed with `changed: false` → neutral level-unchanged/no-upgrade status;
- null/busy/rejected/domain-rejected/decision-rejected/retail-supply-rejected/logistics-rejected/unavailable/failed/confirmation-required → generic “Upgrade was not applied.”

Do not build a new error-code mapping.

Use `role="status"`.

Add EN / JA / zh-Hant strings for unchanged and not-applied.

### 3.5 Make acknowledgement one-shot

Clear status when store ID changes.

After await, only publish result if current store still matches captured source store.

Tests:

- committed → success;
- unchanged → neutral;
- busy/failed/unavailable/rejected → not-applied;
- switch store → clears;
- return to old store → does not replay;
- stale async settle after switch → ignored.

---

## Task 4 — Reuse HPA-293’s focused Store Detail path and pin it before E2E

**Modify**

- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/MapInspectorHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`

### 4.1 Standardize one null convention

Use:

```ts
onOpenDetails: (productId: ProductId | null) => void
```

Call explicitly:

- normal Details: `onOpenDetails(null)`;
- successful milestone CTA: `onOpenDetails(preview.unlockedProductId)`.

### 4.2 Route helper

```ts
function openStoreDetail(productId: ProductId | null = null): void {
  if (!selectedStore) return;
  focusedStockProductId = productId;
  isStoreDetailOpen = true;
}
```

### 4.3 Pin the integration early

Before browser work, route/host tests must prove:

- normal Details sets focus null;
- `onOpenDetails('snacks')` sets `focusedStockProductId = 'snacks'`;
- existing detail-close paths clear focus;
- no second focus state.

### 4.4 Leave stock/planner UX unchanged

No new planner copy or planner mapping.

The only StoreStockTable change in this ticket is Task 3’s mechanical `isGameRouteCommitted` dedupe.

Snacks Plan Supply is a verified expected path.

Run focused component/host/route tests.

---

## Task 5 — Extend real browser coverage and run final gates

**Modify**

- `src/routes/retail-sim.e2e.ts`

### 5.1 Main milestone journey at desktop viewport

Rework/extend the existing store-upgrade journey:

1. set 1920×1080;
2. create convenience store;
3. existing `injectCashAndReload(page, 1_000_000)`;
4. select store;
5. real Upgrade click → level 2;
6. real Upgrade click → level 3;
7. visible 3 → 4 Snacks preview;
8. purchase;
9. assert level 4 + committed confirmation;
10. click “Review Snacks stock & supply”;
11. assert Snacks row is focused;
12. assert existing threshold/target controls;
13. assert existing Plan Supply for Snacks is enabled/usable.

Do not hand-edit store level/products in the save.

### 5.2 Extend existing 960×800 bottom-sheet regression

In the existing narrow-viewport “Open Details stays reachable above the control desk” test, add minimal HPA-283 assertions:

- upgrade preview card is visible;
- Upgrade button is in viewport / clickable (perform the click and observe level change or equivalent committed state).

This is the narrow-layout proof for the taller card.

Do not duplicate the whole 3 → 4 journey here.

### 5.3 Full verification

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
git diff --check main...HEAD
```

Close only HPA-283-introduced patch-coverage gaps if CI requires it.

## Completion checklist

- [ ] Effects resolver stays beside `upgradeStore`.
- [ ] Preview uses display-only fields; mutation consumes only resolution.
- [ ] Defensive mutation cap remains.
- [ ] Impossible catch-up UI fixture is not added.
- [ ] Next milestone uses the closed-form valid-store rule.
- [ ] Convenience never advertises Household.
- [ ] Preview visible while purchase blocked.
- [ ] Tooltip tests replaced.
- [ ] `isGameRouteCommitted` replaces all four existing duplicates plus serves HPA-283.
- [ ] Optional upgrade callback defaults to `async () => null`.
- [ ] In-flight guard prevents duplicate sandbox upgrades.
- [ ] Committed / unchanged / not-applied outcomes are all visible and truthful.
- [ ] Status clears on store change and stale async results are ignored.
- [ ] `onOpenDetails` uses explicit `ProductId | null`.
- [ ] Task 4 pins Snacks focus before E2E.
- [ ] No planner behavior or StoreStockTable UX changes.
- [ ] Desktop 3 → 4 journey passes.
- [ ] Existing 960×800 regression proves card + Upgrade reachability.
- [ ] EN / JA / zh-Hant updated.
- [ ] No schema, art, planner, reward-system, or compatibility work.
- [ ] Full gates pass.
