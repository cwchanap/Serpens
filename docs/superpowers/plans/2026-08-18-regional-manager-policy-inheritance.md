# Regional Manager Playbooks and Policy Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement each behavior change test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement HPA-41 as one PR: company -> city -> store policy inheritance plus bounded deterministic manager playbooks, audit history, persistence, alerts, and existing-panel UI.

**Architecture:** Keep `GameState.policy` as the company root. `policyInheritance.ts` owns sparse city/store overrides and provenance; `managerDelegation.ts` owns manager configuration, deterministic proposals, conflict resolution, and bounded history. Daily simulation resolves effective policy per store and applies manager actions before existing production/sales/replenishment. Reuse the Policies, Staff, alert, save, and route-controller surfaces rather than adding frameworks or new panels.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-08-18-regional-manager-policy-inheritance-design.md`

## Global Constraints

- Ship HPA-41 in one implementation PR; do not split policy inheritance and manager delegation into separate tickets/PRs.
- Keep `GameState.policy` as the company default; no rename/compatibility alias.
- Policy levels are exactly company -> retail city -> store; no generic hierarchy engine.
- Sparse overrides preserve explicit-vs-inherited provenance even when values are equal.
- Existing `StaffMember.assignedStoreId` remains physical staffing coverage; manager delegation scope is separate.
- Every manager-role staff member qualifies; no new skill/level gate.
- One delegation per manager; `prefer-local-supply` is city-scope only.
- Manager actions are bounded to pricing posture, inventory targets, staffing posture, and an existing retail supply source; no construction, hiring/firing/reassignment, or route creation.
- Manager proposals read one immutable start-of-day snapshot; conflicts resolve deterministically before application.
- Manager evaluation adds no RNG calls and must not move existing RNG call sites.
- `buildCityDemandPools` stays trend-free; mixed policies use the seller-average policy multiplier from the spec.
- The Supply Planner reads effective policy but does not simulate future manager choices.
- Scoped policy edits and manager configuration are sandbox-only; existing scenario `updatePolicy` remains company-level.
- Reuse `PolicyPanel`, the existing Staff management surface, and `collectGameAlerts`; no new `ManagementPanelId` or notification store.
- Schema 18 rejects 17; no migration per the repository's pre-release save policy.
- Keep only the newest 100 manager action records.
- All new Svelte work follows `AGENTS.md`: Svelte MCP docs first and `svelte-autofixer` until clean.

## File Map

**Create**
- `src/lib/game/policyInheritance.ts` — sparse override mutations, canonical ordering, effective values + provenance.
- `src/lib/game/policyInheritance.spec.ts` — inheritance/provenance/mutation tests.
- `src/lib/game/managerDelegation.ts` — delegation validation/mutations, playbook proposals, conflict resolution, action application/history.
- `src/lib/game/managerDelegation.spec.ts` — playbooks, authority, conflicts, history, determinism.
- `src/lib/components/game/ManagerDelegationPanel.svelte` — manager automation configuration + activity history.
- `src/lib/components/game/ManagerDelegationPanel.svelte.spec.ts` — browser component coverage.

**Modify**
- `src/lib/game/types.ts` — policy/delegation/action types + `GameState` fields.
- `src/lib/game/state.ts` — initialize new state; retain company `updatePolicy`.
- `src/lib/game/stock.ts` — shared city demand uses effective per-store policy.
- `src/lib/game/simulateDay.ts` — apply manager actions first; resolve effective policy once/store; per-store pricing/profile inputs.
- `src/lib/game/supplyPlanner.spec.ts` — effective-policy/trend-free regression.
- `src/lib/game/simulateDay.spec.ts` and `src/lib/game/simulateDay.invariants.spec.ts` — per-store policy + fixed-seed invariants.
- `src/lib/game/alerts.ts` / `alerts.spec.ts` — manager exception alert kind/dedupe.
- `src/lib/persistence/saveTypes.ts` — schema 18.
- `src/lib/persistence/saveCodec.ts` / `saveCodec.spec.ts` — strict validation and round trip.
- persistence repository specs/fixtures that hard-code schema/current game shape.
- `src/routes/gameRouteController.ts` / `.spec.ts` — sandbox-only scoped policy + delegation mutations and availability.
- `src/lib/components/game/PolicyPanel.svelte` / `.spec.ts` — Company/City/Store editor with provenance/inherit/reset.
- `src/routes/ManagementPanelHost.svelte` / component/route specs — render delegation panel beside Staff panel and pass callbacks.
- `src/routes/+page.svelte`, `src/routes/page.svelte.spec.ts` — controller wiring + manager-alert routing.
- `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts` and relevant i18n specs — policy provenance, playbooks, authority, outcomes/reasons.
- `src/routes/retail-sim.e2e.ts` — one end-to-end sandbox workflow.

---

### Task 1: Add policy inheritance as a pure domain boundary

**Files:** create `policyInheritance.ts`, `policyInheritance.spec.ts`; modify `types.ts`, `state.ts`.

**Interfaces**

Produces:

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

export function resolveEffectivePolicy(game: GameState, store: Store): EffectivePolicy;
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
export function resetPolicyOverrideScope(game: GameState, scope: PolicyOverrideScope): GameState;
```

- [ ] **Step 1: Write RED inheritance/provenance tests**

Cover:

```text
company only -> all fields source company
city pricing override -> city pricing + company other fields
store staffing override -> store staffing + inherited city/company fields
store value equal to parent -> source is still store
clear one field -> exact parent value/source restored
clear final field -> override record removed
reset scope -> all fields return to parent
invalid/missing scope target -> transition returns original GameState
canonical order -> city scopes before store scopes, then ID ascending
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
bun run test:unit -- src/lib/game/policyInheritance.spec.ts --run
```

Expected failure: missing types/module/functions.

- [ ] **Step 3: Add sparse state and resolver/mutations**

Initialize:

```ts
policyOverrides: []
```

Resolution must apply values in this exact order:

```ts
const values = { ...game.policy };
const provenance = companyProvenance();
applyCityOverride(values, provenance, cityOverride);
applyStoreOverride(values, provenance, storeOverride);
return { values, provenance };
```

Do not compare values to infer source; provenance changes only when an override field exists.

- [ ] **Step 4: Re-run focused tests and type-check**

```bash
bun run test:unit -- src/lib/game/policyInheritance.spec.ts src/lib/game/state.spec.ts --run
bun run check
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/game/policyInheritance*
git commit -m "feat(policy): add scoped inheritance"
```

---

### Task 2: Make simulation and baseline planning consume effective policy

**Files:** modify `stock.ts`, `simulateDay.ts`, `stock.spec.ts`, `simulateDay.spec.ts`, `simulateDay.invariants.spec.ts`, `supplyPlanner.spec.ts`.

**Consumes**

```ts
resolveEffectivePolicy(game, store).values
```

**Behavior contract**

For each store, resolve once in `simulateDay` and reuse that policy for temporary policy pricing plus `buildStoreOperationProfile`.

For city demand, each product uses:

```text
sellerPolicyMultiplier = marketingMultiplier * pricingMultiplier
productPolicyMultiplier = arithmetic mean across sellers carrying product
```

- [ ] **Step 1: Add RED simulation tests for all five policy fields**

Use two stores in one city with a store override and prove the overridden store changes the existing pricing/inventory/staffing/marketing/service effects while the sibling keeps inherited behavior.

Add a uniform-policy regression proving that an empty `policyOverrides` array produces the same fixed-seed report as the pre-HPA-41 baseline fixture.

- [ ] **Step 2: Add RED mixed-city-demand and planner tests**

In `stock.spec.ts`, make two sellers carry the same product with different effective pricing/marketing values and assert the product pool uses the arithmetic mean of their policy multipliers.

In `supplyPlanner.spec.ts`, assert:

```text
store/city override changes potentialDemandPerDay
changing only game.day across a product trend phase still does not change planner potentialDemandPerDay
```

- [ ] **Step 3: Run focused RED suite**

```bash
bun run test:unit -- src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/simulateDay.invariants.spec.ts src/lib/game/supplyPlanner.spec.ts --run
```

- [ ] **Step 4: Thread effective policy through existing seams**

Implementation shape:

```ts
const policyByStoreId = new Map(
  productionGame.stores.map((store) => [store.id, resolveEffectivePolicy(productionGame, store).values])
);

const profiles = productionGame.stores.map((store) =>
  buildStoreOperationProfile(store, productionGame, policyByStoreId.get(store.id)!, rng)
);
```

Change `buildStoreOperationProfile` to index its `policy` parameter, not `game.policy`.

Change temporary pricing to apply `PRICING[policyByStoreId.get(store.id)!.pricing].price` per store.

Change `simulateProductSalesForCity` / `buildCityDemandPools` to use effective seller policies for the seller-average city multiplier. Keep trend application only in `simulateProductSalesForCity`.

- [ ] **Step 5: Verify deterministic behavior**

```bash
bun run test:unit -- src/lib/game/policyInheritance.spec.ts src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts src/lib/game/simulateDay.invariants.spec.ts \
  src/lib/game/supplyPlanner.spec.ts --run
bun run check
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/stock.ts src/lib/game/simulateDay.ts src/lib/game/*.spec.ts
git commit -m "feat(policy): resolve store policy in simulation"
```

---

### Task 3: Add bounded deterministic manager playbooks

**Files:** create `managerDelegation.ts`, `managerDelegation.spec.ts`; modify `types.ts`, `state.ts`, `simulateDay.ts`.

**Interfaces**

```ts
export type ManagerPlaybookId =
  | 'protect-margin'
  | 'protect-availability'
  | 'grow-market-share'
  | 'stabilize-cash'
  | 'prefer-local-supply';

export interface ManagerAuthority {
  pricing: boolean;
  inventory: boolean;
  staffing: boolean;
  supply: boolean;
}

export type ManagerDelegationScope =
  | { kind: 'store'; storeId: string }
  | { kind: 'city'; cityId: WorldCityId };

export interface ManagerDelegation {
  managerId: string;
  scope: ManagerDelegationScope;
  playbook: ManagerPlaybookId;
  authority: ManagerAuthority;
  enabled: boolean;
}

export type ManagerActionReason =
  | 'margin-pressure'
  | 'availability-pressure'
  | 'staff-capacity-pressure'
  | 'market-position-pressure'
  | 'negative-operating-cash-flow'
  | 'local-supply-preferred'
  | 'authority-disabled'
  | 'more-specific-manager'
  | 'manager-id-tiebreak'
  | 'transition-rejected';

export const MANAGER_ACTION_HISTORY_LIMIT = 100;

export function setManagerDelegation(game: GameState, delegation: ManagerDelegation): GameState;
export function removeManagerDelegation(game: GameState, managerId: string): GameState;
export function applyManagerDelegations(game: GameState): GameState;
```

`ManagerActionChange`, `ManagerActionOutcome`, and `ManagerActionRecord` use the discriminated shapes from the spec; do not replace them with generic `{ before: unknown; after: unknown }` payloads.

- [ ] **Step 1: Add RED configuration tests**

Cover manager-role validation, one record per manager, store/city target validation, canonical manager-ID ordering, enabled state, removal, and rejection of store-scope `prefer-local-supply`.

- [ ] **Step 2: Add one RED trigger + no-trigger test per playbook**

Use exact spec thresholds:

```text
protect-margin: revenue > 0 and grossMargin/revenue < 0.30 -> pricing toward premium
protect-availability: stockout/demand miss -> one product targets +10%; else nearStaffCapacity -> staffing toward service
grow-market-share: marketPosition < 60 and stockHealth >= 40 -> pricing toward discount
stabilize-cash: latest operatingCashFlow < 0 -> lowest-sales product targets -10%
prefer-local-supply: city scope -> best positive compatible inventory source
```

Assert no proposal/history record when a trigger is false or the posture is already at its terminal step.

- [ ] **Step 3: Add RED authority/conflict/audit tests**

Required cases:

```text
authority false -> out-of-authority, no mutation
store-scope vs city-scope same conflict key -> store wins, city record overridden
same specificity -> managerId ascending wins, loser overridden
winning invalid transition -> rejected
applied record has non-null change.applied
non-applied records have change.applied === null
record id is stable for identical day/manager/conflict key
101 prior records + new records -> newest 100 retained
```

- [ ] **Step 4: Run focused RED suite**

```bash
bun run test:unit -- src/lib/game/managerDelegation.spec.ts --run
```

- [ ] **Step 5: Implement two-phase proposal/apply**

Proposal phase reads the original `game` only. Canonical keys:

```ts
`pricing:${storeId}`
`inventory:${storeId}:${productId}`
`staffing:${storeId}`
`supply:${retailCityId}`
```

Resolution order:

```text
store scope > city scope > managerId ascending
```

Apply policy proposals through `setPolicyOverride` at store scope, inventory through `updateStoreProduct`, and supply through existing `setRetailSupplySource`. Do not duplicate those mutation invariants.

- [ ] **Step 6: Integrate at the start of `simulateDay`**

After ownership validation and before arrival/production/sales work:

```ts
const managedGame = applyManagerDelegations(game);
const closingDay = managedGame.day;
```

All subsequent daily work must use `managedGame` as the base. Preserve `seed`/`rngState` exactly until the existing RNG creation site.

- [ ] **Step 7: Add fixed-seed/no-new-RNG regression**

With no enabled delegations, the fixed-seed next state/report must be deeply equal to the Task-2 behavior. With deterministic manager actions, replaying the same state twice must produce equal action history and equal reports.

- [ ] **Step 8: Verify/commit**

```bash
bun run test:unit -- src/lib/game/managerDelegation.spec.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/simulateDay.invariants.spec.ts --run
bun run check
git add src/lib/game
git commit -m "feat(managers): add deterministic playbooks"
```

---

### Task 4: Persist schema 18 and expose sandbox mutation boundaries

**Files:** modify `saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`, persistence repository specs/fixtures, `gameRouteController.ts`, `gameRouteController.spec.ts`; scenario specs only for the explicit availability regression.

**Controller interfaces**

```ts
setScopedPolicyOverride(
  scope: PolicyOverrideScope,
  patch: Partial<CompanyPolicy>
): Promise<GameRouteCommitResult>;

clearScopedPolicyOverrideField(
  scope: PolicyOverrideScope,
  field: keyof CompanyPolicy
): Promise<GameRouteCommitResult>;

resetScopedPolicyOverride(scope: PolicyOverrideScope): Promise<GameRouteCommitResult>;

setManagerDelegation(delegation: ManagerDelegation): Promise<GameRouteCommitResult>;
removeManagerDelegation(managerId: string): Promise<GameRouteCommitResult>;
```

Add availability fields:

```ts
managePolicyOverrides: boolean;
manageManagerDelegation: boolean;
```

Both are true only in sandbox mode. Keep existing `updatePolicy` availability/ScenarioCommand unchanged.

- [ ] **Step 1: Add RED schema-18 round-trip tests**

Round-trip one save containing:

```text
one city override
one store override
one enabled manager delegation
one applied manager action
one overridden manager action
```

Assert decode preserves canonical arrays and provenance can be re-derived.

- [ ] **Step 2: Add malformed-save RED cases**

Reject:

```text
schema 17
duplicate policy scope
empty policy override values
unknown policy value
nonexistent city/store scope
non-manager managerId
duplicate manager delegation
store-scope prefer-local-supply
non-boolean authority
action history length 101
unknown outcome/reason/change kind
negative/non-finite inventory target in action change
unknown referenced manager/store/city/product
```

- [ ] **Step 3: Implement schema 18 validation**

Set:

```ts
export const SAVE_SCHEMA_VERSION = 18;
```

Validate new collections after stores/staff/cities are available so referential checks reuse decoded current entities. Do not add a schema-17 migration branch.

- [ ] **Step 4: Add RED controller/availability tests**

Prove:

```text
sandbox scoped policy mutation commits + autosaves
sandbox manager delegation commits + autosaves
scenario managePolicyOverrides === false
scenario manageManagerDelegation === false
scenario company updatePolicy still follows existing command gate
calling sandbox-only controller methods in scenario returns unavailable/rejected without changing run state
```

- [ ] **Step 5: Implement controller methods with existing transition helpers**

Use the same commit/autosave path as current policy/staff mutations. Do not add new `ScenarioCommand` variants.

- [ ] **Step 6: Verify/commit**

```bash
bun run test:unit -- src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts \
  src/routes/gameRouteController.spec.ts src/lib/scenarios/runtime.spec.ts --run
bun run check
git add src/lib/persistence src/routes/gameRouteController* src/lib/scenarios
 git commit -m "feat(managers): persist delegation state"
```

---

### Task 5: Add hierarchical policy and manager delegation UI on existing surfaces

**Files:** modify `PolicyPanel.svelte`, `PolicyPanel.svelte.spec.ts`, `ManagementPanelHost.svelte`, route/component specs, `+page.svelte`, `page.svelte.spec.ts`, i18n bundles/specs; create `ManagerDelegationPanel.svelte` and `.svelte.spec.ts`.

- [ ] **Step 1: Load required Svelte MCP documentation**

Follow `AGENTS.md`: run `list-sections`, fetch every relevant Svelte 5 forms/runes/component/accessibility section, and use `svelte-autofixer` on each edited/new Svelte component until it reports no issues.

- [ ] **Step 2: Write RED `PolicyPanel` component tests**

Cover:

```text
Company mode edits current root policy
City mode defaults to active retail city
Store mode selects a store
Inherited field renders parent value + textual Company/City provenance
explicit equal-to-parent override still renders Explicit/Store provenance
Inherit from parent calls clear-one-field callback
Reset scope to parent calls reset callback
scenario-disabled scoped controls are disabled while Company controls can remain enabled
```

- [ ] **Step 3: Implement hierarchical `PolicyPanel`**

Pass the game/policy scope data required to resolve views. Keep selection local to the panel; do not persist which scope tab the player last opened.

Render parent and effective value in every scoped row. Use text/badges plus native select semantics; color may supplement but never carry inherited/explicit meaning alone.

- [ ] **Step 4: Write RED manager panel tests**

Cover:

```text
only manager-role staff appear in delegation cards
physical staffing assignment is shown but not edited here
scope type + target + playbook + enabled state call setManagerDelegation
prefer-local-supply unavailable for store scope
authority toggles update one ManagerAuthority field
recent history renders playbook, change, outcome, reason
remove/disable remains available for manual control
scenario-disabled controls are disabled
```

- [ ] **Step 5: Implement `ManagerDelegationPanel` and host wiring**

Inside the existing `panelId === 'staff'` branch render:

```svelte
<div class="staff-surfaces">
  <StaffPanel ... />
  <ManagerDelegationPanel ... />
</div>
```

Do not modify `ManagementPanelId` or keyboard shortcut registration.

Wire new callbacks from `+page.svelte` through `ManagementPanelHost` to the controller methods from Task 4.

- [ ] **Step 6: Add localized copy**

Add English/Japanese/Traditional-Chinese keys for:

```text
Company / City / Store
Inherited from / Explicit override / Reset to parent
five playbook names + short explanations
four authority domains
Applied / Overridden / Rejected / Out of authority
all ten ManagerActionReason values from Task 3
manager exception alert copy
```

Use existing policy-value label helpers for the five policy fields/postures instead of duplicating their translations.

- [ ] **Step 7: Run component/route tests and autofixer**

```bash
bun run test:unit -- --project client src/lib/components/game/PolicyPanel.svelte.spec.ts \
  src/lib/components/game/ManagerDelegationPanel.svelte.spec.ts \
  src/routes/page.svelte.spec.ts --run
bun run check
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/components src/lib/i18n src/routes/+page.svelte src/routes/ManagementPanelHost.svelte src/routes/*.spec.ts
git commit -m "feat(managers): add delegation controls"
```

---

### Task 6: Surface manager exceptions, prove the workflow E2E, and run full verification

**Files:** modify `alerts.ts`, `alerts.spec.ts`, alert copy/routing as needed, `retail-sim.e2e.ts`.

- [ ] **Step 1: Add RED alert tests**

Extend `GameAlert` with:

```ts
kind: 'manager-exception';
managerId?: string;
managementPanelId?: 'finance' | 'decisions' | 'staff';
```

For the newest manager-action day:

```text
applied-only manager -> no alert
overridden/rejected/out-of-authority -> one alert per manager
multiple failed records same manager -> still one alert
older failure + newer applied-only day -> no stale alert
```

- [ ] **Step 2: Implement alert collection/routing**

Reuse `collectGameAlerts`; do not persist alert state. Clicking the alert opens the existing Staff management panel and keeps manager history as the diagnostic source.

- [ ] **Step 3: Add one Playwright workflow**

In `retail-sim.e2e.ts`:

```text
start fixed-seed sandbox
open Policies -> Store scope -> set one explicit override -> verify provenance text
open Staff -> configure an existing manager as store-scope Grow Market Share with pricing authority
advance day under a fixture/seed where marketPosition < 60 and stockHealth >= 40
re-open Staff -> assert Applied history entry/reason
open Policies -> assert manager-created store pricing override
reload page -> load auto-save -> assert override, delegation, and history remain
```

Use existing app selectors/settled-state helpers; do not create a second E2E matrix for every playbook.

- [ ] **Step 4: Run focused final suite**

```bash
bun run test:unit -- src/lib/game/policyInheritance.spec.ts src/lib/game/managerDelegation.spec.ts \
  src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/simulateDay.invariants.spec.ts src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/alerts.spec.ts src/lib/persistence/saveCodec.spec.ts \
  src/routes/gameRouteController.spec.ts --run
bun run test:unit -- --project client src/lib/components/game/PolicyPanel.svelte.spec.ts \
  src/lib/components/game/ManagerDelegationPanel.svelte.spec.ts src/routes/page.svelte.spec.ts --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "manager delegation"
```

- [ ] **Step 5: Run repository-wide verification**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run build
bun run test:e2e
```

- [ ] **Step 6: Run final scope scans**

```bash
rg "game\.policy\.(pricing|inventory|staffing|marketing|service)" src/lib/game
rg "ManagerDelegation|policyOverrides|managerActionHistory" src
```

Inspect every direct `game.policy.*` simulation match: company-only UI/setup/validation is fine, but store simulation/planning must use effective policy.

- [ ] **Step 7: Commit final tests/alerts**

```bash
git add src/lib/game/alerts* src/lib/i18n src/routes/retail-sim.e2e.ts
git commit -m "test(managers): cover delegated operations"
```

## Self-review checklist before implementation PR review

- [ ] Every HPA-41 acceptance requirement maps to a task above.
- [ ] No generic scope/rule/action registry was introduced.
- [ ] All five existing policy dimensions are resolved per store.
- [ ] Uniform-policy simulation behavior is regression-tested.
- [ ] Mixed city demand does not let one store override multiply every seller's demand.
- [ ] Manager triggers read immutable start-of-day evidence.
- [ ] Store-scope precedence and manager-ID tie-break are deterministic.
- [ ] Physical staffing assignment semantics did not change.
- [ ] Manual product/policy/supply controls remain usable.
- [ ] Scenario command grammar is unchanged.
- [ ] Schema 18 rejects 17 with no migration.
- [ ] Svelte MCP/autofixer requirements were followed.
- [ ] One HPA-41 implementation PR contains the whole vertical slice.