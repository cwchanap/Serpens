# Regional Manager Playbooks and Policy Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement each behavior change test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement HPA-41 in one PR: company -> city -> store policy inheritance, the explicit per-seller demand model cut, bounded deterministic manager playbooks with configured authority, audit history, persistence, alerts, and existing-panel UI.

**Architecture:** Keep `GameState.policy` as the company root. `policyInheritance.ts` owns sparse overrides, provenance, shared ordered policy values, and stepping. `stock.ts` owns one shared seller eligibility/scoring/policy-demand seam used by live sales and Supply Planner. `managerDelegation.ts` owns report-backed proposals, configured authority, deterministic conflicts, existing-transition application, and bounded history. Daily simulation processes arrivals, manager actions, then the existing production/sales/replenishment/route/finance flow.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-08-18-regional-manager-policy-inheritance-design.md`

## Global Constraints

- One implementation PR for HPA-41; six tasks are commit/review checkpoints, not separate PRs.
- Keep `GameState.policy` as company root; no rename/alias/generic hierarchy engine.
- Persist sparse explicit overrides only; provenance/effective policy stay derived.
- Keep `StaffMember.assignedStoreId` physical; delegation scope is separate.
- Exactly five hard-coded playbooks; no DSL/registry/plugin/AI system.
- Keep configured `ManagerAuthority`: HPA-41 explicitly requires authority configuration, out-of-authority audit rows, UI, persistence, and tests.
- Show only authority domains relevant to the selected playbook; irrelevant booleans create no behavior.
- Scoped policy/delegation configuration is sandbox-only; no new `ScenarioCommand` variants.
- Manager evaluation runs after `processTransferArrivals` and before production/sales/replenishment.
- Report-backed playbooks read latest completed `DailyReport`; missing report means no proposal/history row.
- Manager evaluation itself consumes no RNG and does not move existing RNG call sites.
- Empty/enabled-false delegations are a strict manager-phase no-op.
- `buildCityDemandPools` becomes policy-free and trend-free.
- Live seller allocation deliberately stops using the shared `remainingDemand` cap. This is a declared balance change, not a parity refactor.
- Planner potential demand remains trend-free and structurally reuses seller eligibility/share/policy-demand arithmetic.
- Reuse `updateStoreProduct` and `setRetailSupplySource`; never patch their state in parallel.
- Inventory application is classified from post-transition stored values, never object identity.
- City delegation expands store-oriented playbooks into store writes; Prefer Local Supply is the only city-level write.
- Reuse `ManagementPanelId` for alert panel destinations; do not hand-maintain another subset.
- Final schema 18 rejects 17 with no migration/aliases.
- Persistence normalizes collection order on decode; historical action rows do not require current live entity references or deterministic ID string format.
- Full unit suite runs immediately after Task 2 and Task 3, in addition to final full verification.
- Follow `AGENTS.md` Svelte MCP/autofixer requirements before Svelte edits.

## Risks

1. **Demand balance change:** old shared residual city-demand cap sometimes clipped jittered seller demand. Removing it changes live sales; pin the replacement invariant explicitly.
2. **Demand spillover:** a store policy override must not change a sibling seller's desired units.
3. **Empty day-1 reports:** first advance creates manager evidence; second is the first report-backed action opportunity.
4. **Inventory normalization:** `updateStoreProduct` may return a fresh game with normalized/fallback values; audit actual stored values.
5. **No-op floors:** playbooks at pricing/staffing/target floors must emit no proposal rather than crowd history.
6. **`GameState` literal blast radius:** all complete literals gain the three new arrays before checkpoint-1 `bun run check`.
7. **E2E timing:** fixed two-advance/injected fixtures only; never advance-until-trigger.
8. **City-scope fragmentation:** city authority intentionally creates store overrides for store-oriented actions.
9. **Policy option drift:** UI, save/scenario validators, and playbook stepping must consume one `POLICY_FIELD_OPTIONS` table.
10. **RNG:** enabled delegation changes policy/targets and therefore outputs; only empty-delegation parity and unchanged RNG call count are required.

---

### Task 1: Add shared policy values, inheritance, and the complete `GameState` type cut

**Files:**
- Create: `src/lib/game/policyInheritance.ts`
- Create: `src/lib/game/policyInheritance.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/routes/+page.svelte`
- Modify: every direct complete-`GameState` fixture/factory found by the constructor audit

**Interfaces:**

```ts
export const POLICY_FIELD_OPTIONS = {
  pricing: ['discount', 'competitive', 'standard', 'premium'],
  inventory: ['lean', 'balanced', 'generous'],
  staffing: ['minimal', 'efficient', 'service'],
  marketing: ['none', 'awareness', 'promotions', 'loyalty'],
  service: ['speed', 'balanced', 'highTouch']
} as const satisfies {
  [K in keyof CompanyPolicy]: readonly CompanyPolicy[K][];
};

export type PolicyOverrideScope =
  | { kind: 'city'; cityId: WorldCityId }
  | { kind: 'store'; storeId: string };

export type PolicyValueSource = { kind: 'company' } | PolicyOverrideScope;

export interface PolicyOverride {
  scope: PolicyOverrideScope;
  values: Partial<CompanyPolicy>;
}

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

export function stepPolicyValue<K extends keyof CompanyPolicy>(
  field: K,
  current: CompanyPolicy[K],
  direction: -1 | 1
): CompanyPolicy[K];
```

`GameState` gains required:

```ts
policyOverrides: PolicyOverride[];
managerDelegations: ManagerDelegation[];
managerActionHistory: ManagerActionRecord[];
```

Manager type declarations land here with empty runtime arrays; behavior lands in Task 3.

- [ ] **Step 1: Write RED inheritance/ordering tests**

Cover:

```text
company -> city provenance
company -> city -> store provenance
explicit equal-parent stays explicit
clear one field restores parent
reset scope removes record
canonical scope/id order
invalid mutation scope returns original game
stepPolicyValue respects POLICY_FIELD_OPTIONS boundaries
```

- [ ] **Step 2: Run RED spec**

```bash
bun run test:unit -- --run src/lib/game/policyInheritance.spec.ts
```

Expected: FAIL because the module/contracts do not exist.

- [ ] **Step 3: Implement sparse inheritance + shared table**

Keep only explicit values. Field clear:

```ts
const values = { ...existing.values };
delete values[field];
return Object.keys(values).length === 0
  ? removeOverride(game, scope)
  : replaceOverride(game, { scope, values });
```

Resolution:

```text
city  = company -> city
store = company -> store.city -> store
```

`stepPolicyValue` clamps at first/last option rather than wrapping.

- [ ] **Step 4: Initialize all required arrays in every complete `GameState` construction**

Canonical values:

```ts
policyOverrides: [],
managerDelegations: [],
managerActionHistory: [],
```

At minimum this includes `createNewGame` and `src/routes/+page.svelte` `starterMapState`.

Audit:

```bash
rg -n "GameState\s*=\s*\{|satisfies\s+GameState|as\s+GameState" src
```

Add fields only to standalone complete literals; do not duplicate them in builders that spread a complete game.

- [ ] **Step 5: Verify checkpoint 1**

```bash
bun run test:unit -- --run src/lib/game/policyInheritance.spec.ts src/lib/game/state.spec.ts
bun run check
```

Expected: PASS; no required-field failures deferred.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/state.ts \
  src/lib/game/policyInheritance.ts src/lib/game/policyInheritance.spec.ts \
  src/routes/+page.svelte src
git commit -m "feat(policy): add scoped policy inheritance"
```

---

### Task 2: Make live sales and Supply Planner consume one per-store policy-demand seam

**Files:**
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Use: `src/lib/game/policyInheritance.ts`

**Interfaces:**

```ts
export type EffectivePolicyByStoreId = ReadonlyMap<string, CompanyPolicy>;

export function getPolicyDemandMultiplier(
  policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>
): number;

export function sellerPolicyDemand(
  rawPool: number,
  share: number,
  policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>
): number;

export function getPolicyAdjustedCityProductDemand(
  game: GameState,
  city: City,
  productId: ProductId,
  effectivePolicyByStoreId: EffectivePolicyByStoreId
): number;

export function buildCityDemandPools(
  game: Pick<GameState, 'stores' | 'world'>,
  city: City
): RetailDemandProfile;
```

`stock.ts` also owns one private `getEligibleProductSellers(game, cityId, productId)` used by both live sales and `getPolicyAdjustedCityProductDemand`.

- [ ] **Step 1: Write RED tests that declare the live balance change**

Build a high-stock/high-capacity fixed-seed fixture where old `remainingDemand` would bind.

Pin:

```text
initial raw/trend city demand = known diagnostic pool
new total sold may exceed that diagnostic pool
new total sold <= sum of per-seller desiredUnits
reordering input stores does not change per-store reports or RNG end state
```

The test must explicitly comment that pre-HPA-41 allocation could not sell above `initialDemand[productId]` because `availableDemand` was in `Math.min(...)`. Do **not** write a false "uniform live sales unchanged" assertion.

Also pin planner uniform-policy potential demand to its existing numeric baseline; planner does not use jitter/residual allocation.

- [ ] **Step 2: Write RED mixed-policy no-spillover + seller eligibility tests**

Two stores sell the same product; override only store A.

Assert:

```text
store A policy-scaled seller term changes
store B policy-scaled seller term is unchanged
store B desired units are unchanged for the same RNG draw/state
planner potential demand changes only by store A weighted contribution
```

Add a store product that is not in that store archetype's `startingProductIds`; assert both live seller eligibility and planner policy demand exclude it through the same predicate.

- [ ] **Step 3: Make `buildCityDemandPools` raw/policy-free**

Remove the policy parameter/default. Keep only city/product/world multipliers.

Compose the existing `stock.ts` multiplier functions:

```ts
export function getPolicyDemandMultiplier(policy) {
  return getMarketingDemandMultiplier(policy.marketing)
    * getPricingDemandMultiplier(policy.pricing);
}

export function sellerPolicyDemand(rawPool, share, policy) {
  return rawPool * share * getPolicyDemandMultiplier(policy);
}
```

Do not use `simulateDay.ts` `PRICING.demand`.

- [ ] **Step 4: Share seller eligibility/scoring in planner helper**

`getPolicyAdjustedCityProductDemand`:

```ts
const rawPool = buildCityDemandPools(game, city)[productId] ?? 0;
const sellers = getEligibleProductSellers(game, city.id, productId);
const totalScore = sellers.reduce(
  (sum, store) => sum + scoreStoreForCategory(store, productId),
  0
);
if (totalScore <= 0) return 0;

return sellers.reduce((sum, store) => {
  const share = scoreStoreForCategory(store, productId) / totalScore;
  const policy = effectivePolicyByStoreId.get(store.id)!;
  return sum + sellerPolicyDemand(rawPool, share, policy);
}, 0);
```

No trend/jitter/obsolescence/configured-price multiplier here.

- [ ] **Step 5: Resolve policies once per calculation pass**

In `simulateDay`, build `effectivePolicyByStoreId` once before store operations and pass it to profile/pricing/sales helpers.

In `buildSupplyPlannerSnapshot`, build one equivalent map once for the current stores and pass it through `buildDemandContributor` to `getPolicyAdjustedCityProductDemand`.

Do not resolve policy again inside per-product seller loops.

- [ ] **Step 6: Remove shared residual cap from live seller allocation**

Live seller term:

```ts
const share = scoreStoreForCategory(store, productId) / totalScore;
const policyDemand = sellerPolicyDemand(
  trendPool,
  share,
  effectivePolicyByStoreId.get(store.id)!
);
const desiredUnits = Math.max(
  0,
  Math.round(
    policyDemand
      * marketDynamics.obsolescenceMultiplier
      * priceMultiplier
      * randomBetween(input.rng, 0.94, 1.06)
  )
);
const sellableDemand = Math.min(desiredUnits, capacity);
```

Remove `availableDemand` from the allocation minimum.

If `remainingDemand` remains on `ProductSalesResult`, compute after all sellers:

```text
max(0, initialDemand[productId] - totalUnitsSoldForProduct)
```

Diagnostic only; never read during seller allocation.

Preserve canonical seller order and existing RNG call location/count.

- [ ] **Step 7: Move planner potential demand to the shared helper**

`buildDemandContributor` receives the map and uses:

```ts
const potentialDemandPerDay = getPolicyAdjustedCityProductDemand(
  game,
  city,
  productId,
  effectivePolicyByStoreId
);
```

Retain current replenishment/target-stock ceiling and trend-free behavior.

- [ ] **Step 8: Run focused gates**

```bash
bun run test:unit -- --run \
  src/lib/game/policyInheritance.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/simulateDay.spec.ts
bun run check
```

- [ ] **Step 9: Run the full unit suite immediately**

```bash
bun run test:unit -- --run
```

Expected: PASS before manager work starts. This isolates demand regressions in finance/alerts/retail/logistics/scenario consumers at this checkpoint.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/stock.ts src/lib/game/stock.spec.ts \
  src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(policy): apply effective policy per seller"
```

---

### Task 3: Add deterministic manager proposals, configured authority, truthful application, conflicts, and bounded history

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

export function appendBoundedHistory<T>(
  history: readonly T[],
  entries: readonly T[],
  limit: number
): T[];
```

Existing event wrapper remains:

```ts
export function appendHistory<T>(history: readonly T[], entry: T): T[] {
  return appendBoundedHistory(history, [entry], EVENT_HISTORY_LIMIT);
}
```

- [ ] **Step 1: Write RED report/no-op tests**

```text
no enabled delegation => same game reference
reports empty => no proposal/history
Grow Market Share uses latest store-report marketPosition
Stabilize Cash uses latest DailyReport operatingCashFlow
pricing/staffing already at target posture => no proposal
Stabilize Cash target floor producing identical values => no proposal
```

- [ ] **Step 2: Write RED five-playbook + configured-authority tests**

Pin exact triggers from the spec.

For relevant authority only:

```text
Protect Margin -> pricing
Protect Availability inventory path -> inventory
Protect Availability staffing fallback -> staffing
Grow Market Share -> pricing
Stabilize Cash -> inventory
Prefer Local Supply -> supply
```

Set the relevant flag false and assert `out-of-authority` + no state change. Irrelevant authority flags do not change evaluation.

- [ ] **Step 3: Write RED city scope/conflict tests**

```text
city-scope store-oriented playbook expands to store proposals
pricing/staffing winners write store overrides, never city override
Prefer Local Supply is the only city-level write
store scope beats city scope on same conflict key
equal specificity uses managerId ascending
loser records overridden/conflict-lost
```

- [ ] **Step 4: Write RED truthful inventory transition tests**

Cover three cases using `updateStoreProduct`:

```text
actual stored values == proposal and differ from before -> applied; applied stores actual values
actual stored values differ from proposal but differ from before -> applied; applied stores normalized actual values
actual stored values == before -> rejected/transition-rejected; applied is null
```

Never classify by `next === workingGame`.

Supply tests pin existing `{ ok, changed, game }`: `changed: false` never creates fake applied history; `ok: false` is rejected.

- [ ] **Step 5: Generalize history helper test-first**

`eventHistory.spec.ts`:

```text
appendHistory keeps newest 200
appendBoundedHistory(history, multipleEntries, 100) appends in order and keeps newest 100
```

Implement one slice per manager day:

```ts
managerActionHistory: appendBoundedHistory(
  game.managerActionHistory,
  records,
  MANAGER_ACTION_HISTORY_LIMIT
)
```

- [ ] **Step 6: Implement immutable proposal generation**

Canonical order:

```text
enabled delegations: managerId ascending
target stores: storeId ascending
product tie: productId ascending
supply cities: compareWorldCityIds
```

All proposals are built from the post-arrival immutable snapshot before any winner mutates the working game.

Use `stepPolicyValue` for pricing/staffing. Do not add ladder arrays.

- [ ] **Step 7: Implement authority/conflict/apply classification**

Conflict keys:

```text
pricing:<storeId>
inventory:<storeId>:<productId>
staffing:<storeId>
supply:<retailCityId>
```

For inventory winner:

```ts
const before = findProduct(working, storeId, productId);
const next = updateStoreProduct(working, storeId, productId, proposed);
const stored = findProduct(next, storeId, productId);
const actual = {
  reorderThreshold: stored.reorderThreshold,
  targetStock: stored.targetStock
};
```

Classify from actual vs before, and populate `change.applied` from actual stored values—not proposed values.

- [ ] **Step 8: Insert manager phase after arrivals**

```ts
const arrivalResult = processTransferArrivals(game);
const managerResult = applyManagerDelegations(arrivalResult.game);
const managedGame = managerResult.game;
```

All subsequent modifier/production/store work begins from `managedGame`.

- [ ] **Step 9: Add empty-delegation parity/RNG regression**

Fixed seeded current-state fixture with three arrays empty:

```text
applyManagerDelegations(game).game === game
daily report/state values match pre-manager expected fixture
rngState matches pre-manager expected fixture
```

Do not compare enabled delegation against no-manager outputs after policy/target changes.

- [ ] **Step 10: Run focused gates**

```bash
bun run test:unit -- --run \
  src/lib/game/managerDelegation.spec.ts \
  src/lib/game/eventHistory.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.spec.ts
bun run check
```

- [ ] **Step 11: Run the full unit suite immediately**

```bash
bun run test:unit -- --run
```

Expected: PASS before persistence/UI work starts.

- [ ] **Step 12: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/managerDelegation.ts \
  src/lib/game/managerDelegation.spec.ts src/lib/game/eventHistory.ts \
  src/lib/game/eventHistory.spec.ts src/lib/game/simulateDay.ts \
  src/lib/game/simulateDay.spec.ts
git commit -m "feat(managers): add deterministic delegation playbooks"
```

---

### Task 4: Make schema 18 strict, normalize ordering, and expose sandbox-only controller mutations

**Files:**
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/scenarios/validation/shared.ts`
- Modify: `src/lib/scenarios/validation/shared.spec.ts` if present; otherwise the focused scenario validation spec that currently covers policy values
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`
- Update current-schema scenario/runtime fixtures only as required by schema/state shape
- Audit: `src/lib/scenarios/types.ts`; no command variants

**Interfaces:**

```ts
export const SAVE_SCHEMA_VERSION = 18;
```

Controller adds sandbox-only scoped-policy set/clear/reset and delegation set/remove methods; `MutationAvailability` adds scoped-policy/delegation flags.

- [ ] **Step 1: Write RED schema-18 shape tests**

Reject:

```text
schema 17
missing one of three arrays
invalid/duplicate live override scope
empty override values
invalid policy value
invalid/current-nonexistent live override reference
invalid manager role/scope/playbook constraint
invalid/duplicate live manager delegation
history > 100
invalid history outcome/reason/change discriminant
unsafe history numeric values
duplicate history action IDs
```

Explicitly **accept**:

```text
out-of-order valid policyOverrides and managerDelegations, normalized on decode
out-of-order valid managerActionHistory, normalized by day/id
historical row whose manager/store/product no longer exists today
opaque unique history action ID that does not match a generated string format
```

Keep live reference checks for `policyOverrides` and `managerDelegations`.

- [ ] **Step 2: Derive policy validation from `POLICY_FIELD_OPTIONS`**

Remove the five duplicate policy arrays in `saveCodec.ts`; derive sets/options from the shared table.

Update `scenarios/validation/shared.ts` `POLICY_VALUES` from the same table. Do not change scenario command grammar.

- [ ] **Step 3: Bump schema and implement normalized decode**

No schema-17 migration/repair/alias.

Normalize:

```text
policyOverrides -> scope kind/id
managerDelegations -> managerId
managerActionHistory -> day then id
```

Do not reject ordering. Validate unique action IDs but not deterministic format. Do not cross-reference historical row IDs to current mutable entities.

- [ ] **Step 4: Update current-schema fixtures**

```bash
rg -n "schemaVersion:\s*17|SAVE_SCHEMA_VERSION" src/lib/persistence src/lib/scenarios src/routes
```

Historical rejection fixtures may retain 17 intentionally.

- [ ] **Step 5: Write RED controller tests**

```text
sandbox scoped-policy/delegation flags true when available
scenario flags false
company scenario updatePolicy unchanged
sandbox methods mutate through commitMutation/autosave
scenario direct scoped/delegation methods return unavailable/rejected and do not mutate
```

- [ ] **Step 6: Implement controller methods without scenario commands**

Use direct sandbox guards and existing `commitMutation` for successful sandbox transitions.

- [ ] **Step 7: Verify checkpoint 4**

```bash
bun run test:unit -- --run \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/scenarios/capabilities.spec.ts \
  src/lib/scenarios/runtime.spec.ts \
  src/routes/gameRouteController.spec.ts
bun run check
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/persistence src/lib/scenarios/validation \
  src/routes/gameRouteController.ts src/routes/gameRouteController.spec.ts \
  src/lib/scenarios
git commit -m "feat(managers): persist and control delegation state"
```

---

### Task 5: Extend Policies and Staff surfaces using shared policy values and relevant authority controls

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
- Reuse: `src/lib/i18n/gameLabels.ts`
- Reuse: `POLICY_FIELD_OPTIONS` from `policyInheritance.ts`

- [ ] **Step 1: Load Svelte docs and write RED component tests**

Policy:

```text
Company mode edits company policy
City mode shows company -> city parent/effective/provenance
Store mode shows company -> city -> store provenance
explicit equal-parent remains explicit
Inherit clears one field
Reset clears scope
rendered select options come from POLICY_FIELD_OPTIONS order
```

Manager:

```text
only manager-role staff configurable
physical assignment is context only
scope/playbook/enabled updates emit typed delegation
only relevant authority toggles render for selected playbook
revoking relevant authority emits updated delegation
Prefer Local Supply requires city scope
history renders applied/overridden/rejected/out-of-authority and reason
```

- [ ] **Step 2: Replace component-local policy option table**

`PolicyPanel.svelte` iterates `POLICY_FIELD_OPTIONS`. Keep existing `i18n.labels.policyField` / `policyValue` copy.

For scoped targets use `resolveEffectivePolicy(game, selectedScope)`; store parent value comes from resolving the store's city.

- [ ] **Step 3: Add sibling `ManagerDelegationPanel`**

Inside Staff branch:

```svelte
<div class="staff-surfaces">
  <StaffPanel ... />
  <ManagerDelegationPanel ... />
</div>
```

No new panel ID/launcher. Keep `StaffPanel` responsibility unchanged.

- [ ] **Step 4: Wire controller callbacks/availability**

Scenario mode disables scoped-policy/delegation controls; company policy retains existing scenario capability.

- [ ] **Step 5: Localize new copy**

All three bundles cover scope/provenance/inherit/reset, playbooks, relevant authority domains, enabled state, history outcomes/reasons/change summaries, and empty states.

Do not duplicate existing policy value labels.

- [ ] **Step 6: Run Svelte autofixer on every changed/new Svelte file until clean**

Required by repository instructions.

- [ ] **Step 7: Verify client/static gates**

```bash
bun run test:unit -- --run --project client \
  src/lib/components/game/PolicyPanel.svelte.spec.ts \
  src/lib/components/game/ManagerDelegationPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/routes/page.svelte.spec.ts
bun run check
bun run lint
```

- [ ] **Step 8: Commit**

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
- Audit: `src/lib/i18n/localizedTypes.ts`
- Modify: `src/routes/alertNavigation.ts`
- Modify: `src/routes/alertNavigation.spec.ts`
- Modify: `src/routes/+page.svelte` only if focused-manager navigation state needs route composition
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: localization bundles for exception copy
- Reuse: `src/lib/game/keyboardShortcuts.ts` `ManagementPanelId`

**Interfaces:**

```ts
export type GameAlertKind = /* existing */ | 'manager-exception';

export interface GameAlert {
  // existing fields
  managerId?: string;
  managementPanelId?: ManagementPanelId;
}

export interface AlertPanelNavigation {
  panelId: ManagementPanelId;
  focusedFinanceLoanId: string | null;
}
```

Do not copy `'finance' | 'decisions' | 'staff'` unions.

- [ ] **Step 1: Write RED alert collection tests**

Newest manager-action day:

```text
applied-only manager => no alert
multiple non-applied rows same manager => one alert
multiple affected managers => one each
older exception + newer applied-only day => no stale alert
```

Alert includes `managerId` + `managementPanelId: 'staff'`.

- [ ] **Step 2: Write RED copy/navigation tests**

`gameCopy.spec.ts` localizes manager exception using manager identity without raw enums.

`alertNavigation.spec.ts` asserts Staff destination and existing finance/decisions/world-route behavior unchanged.

- [ ] **Step 3: Implement using existing alert/copy/navigation seams**

`alerts.ts` and `alertNavigation.ts` import `ManagementPanelId`; no second hand-maintained subset. `LocalizedGameAlert` continues to extend `GameAlert` structurally.

- [ ] **Step 4: Add deterministic two-advance manager lifecycle E2E**

Current-schema browser-save injection seeds:

- manager delegation with Protect Margin, enabled, pricing authority true;
- known low-margin store setup;
- empty manager history.

Flow:

```text
load save
advance once -> no action because manager phase started with no completed report
advance second -> Protect Margin applies one store pricing override
Policies/Store shows explicit provenance
Staff shows applied manager history
revoke pricing authority and manually edit policy; manual control remains available
next triggered manager attempt is out-of-authority rather than overriding manual edit
```

No retry/loop-until-threshold.

- [ ] **Step 5: Add exception-to-Staff E2E**

Use deterministic current-schema injection with either an `overridden` newest-day row or the out-of-authority row from the lifecycle fixture. Click manager-exception alert and assert existing Staff surface opens with manager history visible.

- [ ] **Step 6: Run focused HPA-41 suite**

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

- [ ] **Step 7: Run final full regression gates**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
bun run build
git diff --check origin/main...HEAD
```

Expected: all exit 0.

- [ ] **Step 8: Run final contract audits**

```bash
# No scenario grammar expansion.
git diff origin/main...HEAD -- src/lib/scenarios/types.ts

# No new management panel ID / generic manager framework.
rg -n "manager-exception|ManagerDelegation|policyOverrides" src
rg -n "rules engine|automation registry|ManagerDashboard|managerPanel" src

# Shared policy option table is authoritative.
rg -n "discount.*competitive.*standard.*premium|minimal.*efficient.*service" \
  src/lib/components/game/PolicyPanel.svelte \
  src/lib/persistence/saveCodec.ts \
  src/lib/scenarios/validation/shared.ts \
  src/lib/game/managerDelegation.ts

# Schema and old-version policy.
rg -n "SAVE_SCHEMA_VERSION|schemaVersion:\s*17|schemaVersion:\s*18" src

# Required state fields in complete literals.
rg -n "GameState\s*=\s*\{|satisfies\s+GameState|as\s+GameState" src
```

Inspect matches. Policy ladder sequences should live in `POLICY_FIELD_OPTIONS`, not duplicated consumer tables. Schema 17 remains only in explicit rejection/history tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts \
  src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts \
  src/lib/i18n/localizedTypes.ts src/routes/alertNavigation.ts \
  src/routes/alertNavigation.spec.ts src/routes/retail-sim.e2e.ts \
  src/lib/i18n/messages src/routes/+page.svelte
git commit -m "test(managers): complete delegation lifecycle coverage"
```

## Final implementation PR definition

The single HPA-41 implementation PR is ready only when all six checkpoints prove:

- deterministic company/city/store policy inheritance and provenance;
- shared policy option ordering used by UI/validators/playbook stepping;
- one scope resolver serves UI and simulation;
- raw city demand is policy-free/trend-free;
- live sales use shared per-seller policy demand without the old residual city cap, with the intentional balance change pinned;
- planner and live structurally share seller eligibility/share/policy-demand arithmetic and receive pre-resolved store policies;
- planner uniform-policy potential demand remains baseline-compatible;
- no report-backed action before completed report evidence;
- manager phase runs after arrivals;
- five closed playbooks with configured relevant authority;
- inventory audit records actual post-transition stored values and suppresses computed no-op proposals;
- deterministic conflicts + newest-100 history via multi-entry bounded append;
- persistence normalizes ordering and keeps historical rows independent of current mutable entities;
- strict schema 18 / schema 17 rejection;
- alerts use `ManagementPanelId` and navigate manager exceptions to Staff;
- Policies + Staff UI only; no new panel ID;
- empty-delegation parity and no manager RNG calls;
- full unit suite green immediately after Task 2 and Task 3, then final check/lint/unit/E2E/build gates green.