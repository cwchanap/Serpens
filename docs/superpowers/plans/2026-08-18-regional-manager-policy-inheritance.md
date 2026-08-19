# Regional Manager Playbooks and Policy Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement each behavior change test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement HPA-41 in one PR: company -> city -> store policy inheritance plus bounded deterministic manager playbooks, audit history, persistence, alerts, and existing-panel UI.

**Architecture:** Keep `GameState.policy` as the company root. `policyInheritance.ts` owns sparse city/store overrides and provenance. `managerDelegation.ts` owns manager configuration, report-backed proposals, authority/conflict resolution, existing-transition application, and bounded history. Daily simulation processes transfer arrivals first, then applies manager actions, then follows the existing production/sales/replenishment/route/finance flow. Live and planner demand reuse the existing `stock.ts` seller scoring and policy multipliers without a shared policy-demand cap.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-08-18-regional-manager-policy-inheritance-design.md`

## Global Constraints

- One implementation PR for HPA-41; the six tasks below are commit/review checkpoints, not separate PRs.
- Keep `GameState.policy` as the company root; no rename/alias/generic hierarchy engine.
- Persist sparse explicit overrides only; never persist `EffectivePolicy` or provenance.
- Physical `StaffMember.assignedStoreId` remains staffing coverage; delegation scope is separate.
- Exactly five hard-coded playbooks; no DSL, registry, plugin system, or AI decisions.
- Scoped policy and delegation configuration are sandbox-only; no new `ScenarioCommand` variants.
- Manager evaluation runs after `processTransferArrivals` and before production/sales/replenishment.
- Report-backed playbooks read only the latest completed `DailyReport`; missing report means no proposal/history row.
- Manager evaluation itself consumes no RNG and does not move existing RNG call sites.
- Empty/enabled-false delegations are a strict manager-phase no-op.
- `buildCityDemandPools` becomes policy-free and trend-free; seller policy scaling happens per seller in `stock.ts`.
- Do not use one policy-scaled shared `remainingDemand` cap to constrain seller allocation.
- Planner potential demand is the sum of the same policy-scaled seller shares and remains trend-free.
- Reuse `updateStoreProduct` for inventory targets and `setRetailSupplySource` for supply changes; do not bypass their validation.
- City delegation scope expands store-oriented playbooks into store proposals; only Prefer Local Supply writes city-level state.
- No new `ManagementPanelId`; extend Policies + Staff surfaces.
- Manager exceptions reuse `GameAlert` and navigate to `staff`; no second notification store.
- Final save schema is 18; schema 17 is rejected with no migration/aliases.
- Follow `AGENTS.md`: before Svelte edits, use the required Svelte MCP docs workflow and run `svelte-autofixer` until clean.

## Risks

1. **Empty day-1 reports:** first advance creates evidence; second advance is the first normal report-backed manager action opportunity.
2. **Demand spillover:** a local policy must not increase a sibling seller's demand quota or shared available-demand cap.
3. **Lot-incompatible inventory edits:** nominal +/-10% proposals can be rejected by `updateStoreProduct`; record rejection instead of patching around it.
4. **`GameState` literal blast radius:** adding three required arrays breaks direct literals such as route starter state and focused test fixtures; Task 1 must fix every construction site before `bun run check`.
5. **E2E timing:** use fixed two-advance or injected-report setup; never loop until a threshold happens.
6. **City-scope fragmentation:** store-oriented city delegation intentionally creates per-store overrides; UI/provenance tests must treat that as correct.
7. **RNG expectations:** enabled delegation changes game inputs, so do not require equality with a different policy/target state. Require no additional RNG calls and empty-delegation parity.

---

### Task 1: Add policy inheritance and complete the `GameState` type cut

**Files:**
- Create: `src/lib/game/policyInheritance.ts`
- Create: `src/lib/game/policyInheritance.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/routes/+page.svelte`
- Modify: every direct complete-`GameState` fixture/factory found by the constructor audit, including focused game/scenario/persistence specs that do not spread from `createNewGame`

**Interfaces:**
- Produces:
```ts
export type PolicyOverrideScope =
  | { kind: 'city'; cityId: WorldCityId }
  | { kind: 'store'; storeId: string };

export interface PolicyOverride {
  scope: PolicyOverrideScope;
  values: Partial<CompanyPolicy>;
}

export type PolicyValueSource =
  | { kind: 'company' }
  | { kind: 'city'; cityId: WorldCityId }
  | { kind: 'store'; storeId: string };

export interface EffectivePolicy {
  values: CompanyPolicy;
  provenance: { [K in keyof CompanyPolicy]: PolicyValueSource };
}

export function resolveEffectivePolicy(
  game: GameState,
  scope: PolicyOverrideScope
): EffectivePolicy;

export function setPolicyOverride(
  game: GameState,
  scope: PolicyOverrideScope,
  patch: Partial<CompanyPolicy>
): GameState;
export function clearPolicyOverrideField(
  game: GameState,
  scope: PolicyOverrideScope,
  field: keyof CompanyPolicy
): GameState;
export function resetPolicyOverrideScope(
  game: GameState,
  scope: PolicyOverrideScope
): GameState;
```
- Adds required `GameState` fields:
```ts
policyOverrides: PolicyOverride[];
managerDelegations: ManagerDelegation[];
managerActionHistory: ManagerActionRecord[];
```
  Manager types are declared in `types.ts` in this task with empty runtime collections; Task 3 implements their behavior.

- [ ] **Step 1: Write failing inheritance tests**

Cover:

```ts
it('resolves company -> city with per-field provenance', ...)
it('resolves company -> city -> store with per-field provenance', ...)
it('keeps an explicit child value explicit when it equals its parent', ...)
it('clearing one field restores the immediate parent', ...)
it('resetting a scope removes the complete override record', ...)
it('keeps override records in canonical scope/id order', ...)
it('returns the original game for an invalid mutation scope', ...)
```

Use existing open retail cities/stores; resolve city strings through the existing world-city helpers rather than trusting raw `Store.cityId`.

- [ ] **Step 2: Run the focused spec and confirm RED**

```bash
bun run test:unit -- --run src/lib/game/policyInheritance.spec.ts
```

Expected: FAIL because inheritance types/functions do not exist.

- [ ] **Step 3: Add closed policy/delegation/action types and inheritance implementation**

Implement sparse records only. A field clear must remove an empty override record:

```ts
const values = { ...existing.values };
delete values[field];
return Object.keys(values).length === 0
  ? removeOverride(game, scope)
  : replaceOverride(game, { scope, values });
```

Resolver semantics are explicit:

```text
city scope  = company -> city
store scope = company -> store.city -> store
```

Do not persist a copied effective policy.

- [ ] **Step 4: Initialize all new arrays in `createNewGame` and every direct `GameState` literal**

The canonical initialization is:

```ts
policyOverrides: [],
managerDelegations: [],
managerActionHistory: [],
```

At minimum update `src/routes/+page.svelte` `starterMapState` in this checkpoint.

Audit all other complete literals before type-checking:

```bash
rg -n "GameState\s*=\s*\{|satisfies\s+GameState|as\s+GameState" src
```

For test builders that spread a complete game, do not add redundant fields; for standalone literals, add all three.

- [ ] **Step 5: Run inheritance tests and the full type gate**

```bash
bun run test:unit -- --run src/lib/game/policyInheritance.spec.ts src/lib/game/state.spec.ts
bun run check
```

Expected: PASS. Do not defer missing-field failures to later tasks.

- [ ] **Step 6: Commit checkpoint 1**

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/game/policyInheritance.ts \
  src/lib/game/policyInheritance.spec.ts src/routes/+page.svelte src
git commit -m "feat(policy): add scoped policy inheritance"
```

---

### Task 2: Make live simulation and Supply Planner consume per-store effective policy

**Files:**
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Use: `src/lib/game/policyInheritance.ts`

**Interfaces:**
- Consumes:
```ts
resolveEffectivePolicy(game, { kind: 'store', storeId })
```
- Produces small reusable `stock.ts` seams using the existing multiplier tables:
```ts
export function getPolicyDemandMultiplier(
  policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>
): number;

export function scoreStoreForCategory(store: Store, productId: ProductId): number;
```
- Changes:
```ts
buildCityDemandPools(
  game: Pick<GameState, 'stores' | 'world'>,
  city: City
): RetailDemandProfile;
```
  Remove the policy parameter/default entirely.

- [ ] **Step 1: Pin uniform-policy and planner baseline behavior before changing formulas**

Add fixed-seed tests for:

```ts
it('preserves uniform-policy aggregate product demand', ...)
it('keeps planner potential demand trend-free', ...)
```

Record the current expected numeric demand for a stable fixture so the refactor cannot silently rebalance uniform policy.

- [ ] **Step 2: Add failing mixed-policy no-spillover tests**

Use two stores selling the same product. Set one store override to a higher-demand pricing/marketing posture.

Assert:

```text
- overridden store policy-scaled share changes;
- sibling store policy-scaled share is unchanged;
- sibling desired-demand budget is unchanged;
- planner potential demand changes only by the overridden store's weighted share.
```

- [ ] **Step 3: Make `buildCityDemandPools` raw/policy-free and export the existing seller policy helpers**

Keep current multiplier numbers in one place:

```ts
export function getPolicyDemandMultiplier(policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>) {
  return getMarketingDemandMultiplier(policy.marketing)
    * getPricingDemandMultiplier(policy.pricing);
}
```

Do not use `simulateDay.ts`'s separate `PRICING.demand` values.

- [ ] **Step 4: Resolve policy once per store in `simulateDay`**

Build a map before store operation calculations:

```ts
const effectivePolicyByStoreId = new Map(
  productionGame.stores.map((store) => [
    store.id,
    resolveEffectivePolicy(productionGame, {
      kind: 'store',
      storeId: store.id
    }).values
  ])
);
```

Pass the resolved policy into `buildStoreOperationProfile`, temporary policy pricing, and sales. Do not have those helpers re-read `game.policy`.

- [ ] **Step 5: Move policy scaling into each seller's desired-unit calculation**

Inside the existing product/seller loop:

```ts
const policy = effectivePolicyByStoreId.get(store.id)!;
const sellerPolicyDemand =
  trendPool
  * demandShare
  * getPolicyDemandMultiplier(policy);

const desiredUnits = Math.max(
  0,
  Math.round(
    sellerPolicyDemand
    * marketDynamics.obsolescenceMultiplier
    * priceMultiplier
    * randomBetween(input.rng, 0.94, 1.06)
  )
);
```

Then:

```ts
const sellableDemand = Math.min(desiredUnits, capacity);
```

Do **not** include one shared policy-scaled `availableDemand`/`remainingDemand` in that minimum.

If `ProductSalesResult.remainingDemand` is kept, update it only as diagnostic post-sale evidence; it must not drive allocation.

Preserve the exact existing RNG call location/count.

- [ ] **Step 6: Update planner potential demand to sum policy-scaled seller shares**

In `buildDemandContributor`, derive the city product raw pool, sellers, total score, and:

```ts
const potentialDemandPerDay = sellers.reduce((sum, store) => {
  const demandShare = scoreStoreForCategory(store, productId) / totalScore;
  const policy = resolveEffectivePolicy(game, {
    kind: 'store',
    storeId: store.id
  }).values;
  return sum + rawPool * demandShare * getPolicyDemandMultiplier(policy);
}, 0);
```

Then retain the existing replenishment/target-stock ceiling logic. Do not apply product trend here.

- [ ] **Step 7: Run focused behavior gates**

```bash
bun run test:unit -- --run \
  src/lib/game/policyInheritance.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/simulateDay.spec.ts
bun run check
```

Expected: PASS with uniform-policy baseline unchanged and mixed-policy no-spillover assertions green.

- [ ] **Step 8: Commit checkpoint 2**

```bash
git add src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/stock.ts src/lib/game/stock.spec.ts \
  src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(policy): apply effective policy per store"
```

---

### Task 3: Add deterministic manager proposals, authority, conflicts, and existing-transition application

**Files:**
- Create: `src/lib/game/managerDelegation.ts`
- Create: `src/lib/game/managerDelegation.spec.ts`
- Create: `src/lib/game/eventHistory.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/eventHistory.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Use: `src/lib/game/policyInheritance.ts`
- Use: `src/lib/game/stock.ts`
- Use: `src/lib/game/retailSupply.ts`
- Use: `src/lib/game/cityInventory.ts`

**Interfaces:**
- Produces:
```ts
export const MANAGER_ACTION_HISTORY_LIMIT = 100;

export function setManagerDelegation(
  game: GameState,
  delegation: ManagerDelegation
): GameState;

export function removeManagerDelegation(
  game: GameState,
  managerId: string
): GameState;

export interface ManagerEvaluationResult {
  game: GameState;
  records: ManagerActionRecord[];
}

export function applyManagerDelegations(game: GameState): ManagerEvaluationResult;
```
- Extends existing history helper rather than creating a parallel hard-coded pipeline:
```ts
export function appendBoundedHistory<T>(
  history: readonly T[],
  entry: T,
  limit: number
): T[];

export function appendHistory<T>(history: readonly T[], entry: T): T[] {
  return appendBoundedHistory(history, entry, EVENT_HISTORY_LIMIT);
}
```

- [ ] **Step 1: Write RED tests for report timing and no-op behavior**

Cover:

```ts
it('returns the same game object when no delegation is enabled', ...)
it('creates no proposal/history when reports are empty', ...)
it('uses latest DailyStoreReport marketPosition rather than company scorecard', ...)
it('uses latest DailyReport operatingCashFlow for stabilize-cash', ...)
```

- [ ] **Step 2: Write RED tests for all five playbooks and authority**

Pin the exact trigger/order rules from the spec:

- Protect Margin: `< 30%` store gross margin -> one pricing step toward premium.
- Protect Availability: pressured product order -> +10%; otherwise `nearStaffCapacity` -> staffing toward service.
- Grow Market Share: latest store `marketPosition < 60 && stockHealth >= 40` -> pricing toward discount.
- Stabilize Cash: latest company `operatingCashFlow < 0` -> lowest-units-sold product targets -10%.
- Prefer Local Supply: compatible `productionMaterialId` inventory, highest units then `WorldCityId` order.

For every action type, set required authority false and assert `out-of-authority` with no state change.

- [ ] **Step 3: Write RED tests for city scope and conflicts**

Cover:

```text
- city-scope Protect Margin expands into store-specific pricing proposals;
- winning pricing/staffing actions write store overrides, never a city policy override;
- Prefer Local Supply is the only city-level write;
- store-scope proposal beats city-scope proposal for the same key;
- equal specificity uses managerId ascending;
- loser records overridden/conflict-lost.
```

- [ ] **Step 4: Write RED tests for existing-transition reuse**

Inventory:

```ts
const next = updateStoreProduct(workingGame, storeId, productId, proposedPatch);
if (next === workingGame) {
  // rejected / transition-rejected
}
```

Do not write product targets directly.

Supply:

- derive compatibility via `getProductDefinition(productId).productionMaterialId` and city inventory quantities;
- choose only opened/materialized inventory cities;
- current best source already selected => no proposal;
- apply through `setRetailSupplySource`;
- `ok: false` => rejected.

- [ ] **Step 5: Generalize the existing bounded-history helper test-first**

In `eventHistory.spec.ts`, pin:

```text
appendHistory still keeps newest 200 entries
appendBoundedHistory(..., 100) keeps newest 100 entries
```

Then implement `appendBoundedHistory` and make current `appendHistory` delegate to it. Do not change existing event-history behavior.

- [ ] **Step 6: Implement proposal generation from one immutable snapshot**

Use deterministic ordering:

```text
enabled delegations: managerId ascending
target stores: storeId ascending
product tie-break: productId ascending
candidate supply cities: compareWorldCityIds
```

Build all triggered proposals before applying any mutation.

- [ ] **Step 7: Implement authority/conflict classification and apply winners**

Conflict keys are exactly:

```text
pricing:<storeId>
inventory:<storeId>:<productId>
staffing:<storeId>
supply:<retailCityId>
```

Persist discriminated `ManagerActionChange`, closed outcome/reason unions, and deterministic IDs from day + manager + conflict key.

- [ ] **Step 8: Append manager history through the generalized existing helper**

Manager records append with:

```ts
appendBoundedHistory(history, record, MANAGER_ACTION_HISTORY_LIMIT)
```

- [ ] **Step 9: Insert manager evaluation after arrivals**

Change the beginning of `simulateDay` to the equivalent of:

```ts
const arrivalResult = processTransferArrivals(game);
const managerResult = applyManagerDelegations(arrivalResult.game);
const managedGame = managerResult.game;
```

All subsequent active-modifier/production/store processing starts from `managedGame`.

This is deliberately after arrivals so Prefer Local Supply sees today's delivered inventory.

- [ ] **Step 10: Add empty-delegation daily parity regression**

Use a fixed seeded current-state fixture with the three arrays empty. Pin report/state/RNG outputs that existed before manager integration, and separately assert `applyManagerDelegations(game).game === game` for the no-op path.

Do not require an enabled manager run to match the no-manager RNG/output state after it changes policy/targets.

- [ ] **Step 11: Run focused gates**

```bash
bun run test:unit -- --run \
  src/lib/game/managerDelegation.spec.ts \
  src/lib/game/eventHistory.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.spec.ts
bun run check
```

- [ ] **Step 12: Commit checkpoint 3**

```bash
git add src/lib/game/types.ts src/lib/game/managerDelegation.ts \
  src/lib/game/managerDelegation.spec.ts src/lib/game/eventHistory.ts \
  src/lib/game/eventHistory.spec.ts src/lib/game/simulateDay.ts \
  src/lib/game/simulateDay.spec.ts
git commit -m "feat(managers): add deterministic delegation playbooks"
```

---

### Task 4: Make schema 18 strict and expose sandbox-only controller mutations

**Files:**
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`
- Modify: current-schema scenario codec/runtime fixtures only where the now-required `GameState` shape/schema number requires it
- Audit: `src/lib/scenarios/types.ts`; no new command variants

**Interfaces:**
- Final:
```ts
export const SAVE_SCHEMA_VERSION = 18;
```
- Controller adds:
```ts
setScopedPolicyOverride(scope, patch): Promise<GameRouteCommitResult>
clearScopedPolicyOverrideField(scope, field): Promise<GameRouteCommitResult>
resetScopedPolicyOverride(scope): Promise<GameRouteCommitResult>
setManagerDelegation(input): Promise<GameRouteCommitResult>
removeManagerDelegation(managerId): Promise<GameRouteCommitResult>
```
- `MutationAvailability` adds separate scoped-policy and delegation flags; both are sandbox-only.

- [ ] **Step 1: Write RED schema-18 validation tests**

Test rejection for:

```text
schema 17
missing policyOverrides
missing managerDelegations
missing managerActionHistory
duplicate/invalid override scopes
empty override values
invalid manager role/scope/playbook combination
duplicate manager delegation
history > 100
invalid action outcome/reason/change discriminant
unknown manager/store/city/product references
unsafe inventory target values
```

Also test valid current-state round trip with explicit-equal-parent override and one history row.

- [ ] **Step 2: Bump schema 18 and implement strict validation**

Reuse existing enum/policy validators. Resolve `Store.cityId` through current world-city helpers; do not accept arbitrary strings as a valid retail city.

No schema-17 migration/repair/alias path.

- [ ] **Step 3: Update save/scenario fixtures for the strict current schema**

Run:

```bash
rg -n "schemaVersion:\s*17|SAVE_SCHEMA_VERSION" src/lib/persistence src/lib/scenarios src/routes
```

Change only current-schema fixtures; historical rejection tests may intentionally keep `17`.

- [ ] **Step 4: Write RED controller availability/mutation tests**

Assert:

```text
sandbox => scoped policy/delegation flags true when not pending
scenario => both false
company updatePolicy scenario behavior unchanged
sandbox mutations call existing transitions and autosave
programmatic scoped/delegation methods in scenario mode return unavailable/rejected without mutating the scenario game
```

- [ ] **Step 5: Add controller methods without scenario commands**

Use direct sandbox guards for the five new methods. Do not add `ScenarioCommand` arms.

Successful sandbox transitions still pass through `commitMutation` so autosave behavior is unchanged.

- [ ] **Step 6: Run persistence/controller gates**

```bash
bun run test:unit -- --run \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/routes/gameRouteController.spec.ts \
  src/lib/scenarios/capabilities.spec.ts \
  src/lib/scenarios/runtime.spec.ts
bun run check
```

- [ ] **Step 7: Commit checkpoint 4**

```bash
git add src/lib/persistence src/routes/gameRouteController.ts \
  src/routes/gameRouteController.spec.ts src/lib/scenarios
git commit -m "feat(managers): persist and control delegation state"
```

---

### Task 5: Extend Policies and Staff surfaces without adding a management panel

**Files:**
- Modify: `src/lib/components/game/PolicyPanel.svelte`
- Modify: `src/lib/components/game/PolicyPanel.svelte.spec.ts`
- Create: `src/lib/components/game/ManagerDelegationPanel.svelte`
- Create: `src/lib/components/game/ManagerDelegationPanel.svelte.spec.ts`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Reuse: `src/lib/i18n/gameLabels.ts` `policyField` / `policyValue` helpers

**Interfaces:**
- Policies surface callbacks:
```ts
onChangeCompanyPolicy(patch)
onSetScopedOverride(scope, patch)
onClearScopedOverrideField(scope, field)
onResetScopedOverride(scope)
```
- Manager surface callbacks:
```ts
onSetManagerDelegation(delegation)
onRemoveManagerDelegation(managerId)
```
- Do not extend `ManagementPanelId`.

- [ ] **Step 1: Load Svelte documentation and write RED component tests first**

Follow `AGENTS.md` Svelte MCP steps before editing `.svelte` files.

Policy tests:

```text
Company mode edits company policy
City mode resolves company -> city and shows parent/effective/provenance
Store mode resolves company -> city -> store and shows provenance
explicit-equal-parent displays as explicit
Inherit from parent clears one field
Reset scope clears the scope
```

Manager tests:

```text
only manager-role staff are configurable
physical assignedStoreId is display context only
delegation scope/playbook/authority controls emit typed updates
Prefer Local Supply cannot be chosen with store scope
history renders applied/overridden/rejected/out-of-authority with reason
```

- [ ] **Step 2: Evolve `PolicyPanel.svelte` around the scope-based resolver**

For city/store targets call:

```ts
resolveEffectivePolicy(game, selectedScope)
```

For parent comparison:

- city parent = `game.policy`;
- store parent = `resolveEffectivePolicy(game, { kind: 'city', cityId: storeCityId }).values`.

Keep the existing five policy field option lists and label helpers. Do not duplicate policy-value tables in UI code.

Inherited/explicit state must have text/icon/copy, not color alone.

- [ ] **Step 3: Add the sibling manager panel**

Keep `StaffPanel.svelte` unchanged in responsibility. Add:

```svelte
<div class="staff-surfaces">
  <StaffPanel ... />
  <ManagerDelegationPanel ... />
</div>
```

inside the existing `panelId === 'staff'` branch.

Do not create a tenth management launcher/shortcut.

- [ ] **Step 4: Wire route/controller callbacks and sandbox availability**

`+page.svelte` passes the new callbacks through `ManagementPanelHost`; scenario mode renders scoped-policy/delegation controls disabled using the new mutation flags while company policy keeps its existing scenario capability.

- [ ] **Step 5: Add localized copy in all three bundles**

Cover:

```text
scope labels
inherit/reset/provenance copy
playbook labels/descriptions
authority labels
enabled/disabled labels
history outcome/reason/change copy
empty manager/history states
```

Reuse `gameLabels.ts` policy field/value localization rather than adding duplicate keys for existing policy values.

- [ ] **Step 6: Run Svelte autofixer on every changed/new Svelte file until clean**

Required by repo instructions.

- [ ] **Step 7: Run focused client/type gates**

```bash
bun run test:unit -- --run --project client \
  src/lib/components/game/PolicyPanel.svelte.spec.ts \
  src/lib/components/game/ManagerDelegationPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/routes/page.svelte.spec.ts
bun run check
bun run lint
```

- [ ] **Step 8: Commit checkpoint 5**

```bash
git add src/lib/components/game/PolicyPanel.svelte* \
  src/lib/components/game/ManagerDelegationPanel.svelte* \
  src/routes/ManagementPanelHost.svelte* src/routes/+page.svelte \
  src/routes/page.svelte.spec.ts src/lib/i18n
git commit -m "feat(managers): expose policy inheritance and delegation UI"
```

---

### Task 6: Add manager exception alerts, Staff navigation, deterministic E2E, and final verification

**Files:**
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Audit/retain structural inheritance: `src/lib/i18n/localizedTypes.ts`
- Modify: `src/routes/alertNavigation.ts`
- Modify: `src/routes/alertNavigation.spec.ts`
- Modify: `src/routes/+page.svelte` if focused-manager UI state/navigation requires route composition changes
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: localization bundles from Task 5 for manager-exception alert copy

**Interfaces:**
- Extend:
```ts
export type GameAlertKind = /* existing */ | 'manager-exception';

export interface GameAlert {
  // existing fields
  managerId?: string;
  managementPanelId?: 'finance' | 'decisions' | 'staff';
}
```
- Extend `AlertPanelNavigation.panelId` to include `'staff'`.
- `LocalizedGameAlert` continues `extends GameAlert`; do not add duplicate manager fields in `localizedTypes.ts`.

- [ ] **Step 1: Write RED alert collection tests**

For newest manager-action day:

```text
applied-only manager => no alert
one or many non-applied rows for same manager => exactly one manager-exception
multiple affected managers => one each
older-day exception with newer applied-only day => no stale alert
```

Alert includes `managerId` and `managementPanelId: 'staff'`.

- [ ] **Step 2: Write RED localization/navigation tests**

`gameCopy.spec.ts` asserts manager exception copy identifies the manager and summarizes that an action needs attention without embedding raw enum strings.

`alertNavigation.spec.ts` asserts:

```ts
resolveAlertNavigation(managerAlert) === {
  panelId: 'staff',
  focusedFinanceLoanId: null
};
```

Keep finance/decisions/world-route behavior unchanged.

- [ ] **Step 3: Implement alerts by extending existing collectors/copy/navigation**

No separate manager notification store.

`localizedTypes.ts` needs no duplicate shape; keep it in the file audit so any attempted divergence is caught in review/type-check.

- [ ] **Step 4: Add deterministic two-advance Playwright manager lifecycle**

Use the existing current-schema browser-save injection pattern. Seed:

- one manager delegation with pricing authority;
- a known low-margin store/product setup that will generate a sub-30% first daily store report;
- empty manager history.

Then:

```text
load save
advance once
assert no manager action yet (day-1 report was absent at manager phase)
advance a second time
assert Protect Margin applied exactly one store pricing override
open Policies -> Store and verify explicit provenance
open Staff and verify applied history
revoke/disable delegation authority and make a manual policy edit; verify manual control remains available
```

Do not `while`/retry/advance-until-trigger.

- [ ] **Step 5: Add deterministic exception-to-Staff E2E coverage**

Use current-schema save injection with one newest-day `out-of-authority` manager history row if necessary to isolate navigation from playbook threshold setup.

Assert the manager-exception alert is present and clicking it opens the existing Staff control-tower surface with the manager delegation/history section visible.

Evaluator correctness for `out-of-authority` remains covered by Task 3 unit tests; this browser test owns alert navigation/presentation.

- [ ] **Step 6: Run the focused HPA-41 suite**

```bash
bun run test:unit -- --run \
  src/lib/game/policyInheritance.spec.ts \
  src/lib/game/managerDelegation.spec.ts \
  src/lib/game/eventHistory.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/routes/gameRouteController.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/routes/alertNavigation.spec.ts

bun run test:unit -- --run --project client \
  src/lib/components/game/PolicyPanel.svelte.spec.ts \
  src/lib/components/game/ManagerDelegationPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/routes/page.svelte.spec.ts

bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "manager|policy inheritance"
```

- [ ] **Step 7: Run final static/full regression gates**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
bun run build
git diff --check origin/main...HEAD
```

Expected: every command exits 0.

- [ ] **Step 8: Run final scope/contract audits**

```bash
# No scenario grammar expansion for HPA-41.
git diff origin/main...HEAD -- src/lib/scenarios/types.ts

# No new management panel ID / automation framework.
rg -n "manager-exception|ManagerDelegation|policyOverrides" src
rg -n "rules engine|automation registry|ManagerDashboard|managerPanel" src

# Schema and old-version policy.
rg -n "SAVE_SCHEMA_VERSION|schemaVersion:\s*17|schemaVersion:\s*18" src

# Required state fields are initialized in direct complete literals.
rg -n "GameState\s*=\s*\{|satisfies\s+GameState|as\s+GameState" src
```

Inspect matches rather than expecting every grep to be empty. Schema 17 should remain only in explicit rejection/history-oriented tests after the cut.

- [ ] **Step 9: Commit checkpoint 6**

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts \
  src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts \
  src/lib/i18n/localizedTypes.ts src/routes/alertNavigation.ts \
  src/routes/alertNavigation.spec.ts src/routes/retail-sim.e2e.ts \
  src/lib/i18n/messages src/routes/+page.svelte
git commit -m "test(managers): complete delegation lifecycle coverage"
```

## Final implementation PR definition

The implementation branch is ready for review only when the single PR contains all six checkpoints and proves:

- deterministic company/city/store policy inheritance and provenance;
- one scope-based resolver serves both UI scopes and store simulation;
- raw city demand + per-seller policy scaling without sibling spillover;
- planner/live policy-demand parity at the seller-share seam;
- no report-backed manager action before completed report evidence exists;
- manager phase after transfer arrivals;
- five closed playbooks with fixed authority bounds;
- city authority expands to per-store writes except local-supply assignment;
- existing `updateStoreProduct` and `setRetailSupplySource` validation is authoritative;
- deterministic conflicts + newest-100 action history via the generalized existing history helper;
- strict schema 18 / schema 17 rejection;
- Policies + Staff UI only, with manager exceptions navigating to Staff;
- empty-delegation simulation parity and no manager RNG calls;
- full check/lint/unit/E2E/build gates green.