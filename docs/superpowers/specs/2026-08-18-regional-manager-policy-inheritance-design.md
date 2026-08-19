# Regional Manager Playbooks and Policy Inheritance Design

**Date:** 2026-08-18  
**Linear:** HPA-41 — Regional manager playbooks and policy inheritance  
**Status:** Normative planning baseline

## Outcome

Add a small delegation layer on top of the existing retail simulation:

1. company policy remains the root default;
2. optional retail-city overrides inherit from company policy;
3. optional store overrides inherit from the effective city policy;
4. manager-role staff can run one deterministic playbook inside an explicit store or city authority scope;
5. every manager proposal records its outcome and reason so the player can inspect or disable automation.

This is one vertical slice. Do not add a generic policy/rules engine, AI decision service, autonomous construction, hiring/firing automation, or a new management dashboard.

## Why HPA-41 is next

HPA-38 is implemented on `main`, completing the other Phase-2 vertical slice from HPA-275. HPA-41 has no Linear blockers and no dedicated planning PR. HPA-39 is now technically unblocked by HPA-38, but it is a later roadmap phase; HPA-41 is therefore the next roadmap-ordered actionable slice.

## Approaches considered

### A. Generic hierarchical policy + automation framework

A reusable scope tree, rule DSL, generic action registry, and policy engine could model future regions, brands, competitors, and events.

Reject it. HPA-41 has exactly three policy levels and five named playbooks. A framework would add authoring, validation, persistence, and debugging surface before another consumer exists.

### B. Put override and automation fields directly on `City`, `Store`, and `StaffMember`

This minimizes new top-level state but mixes three responsibilities into core entities. It also makes city/store policy comparison and manager audit history harder to isolate.

Reject it. The short-term file count is smaller, but simulation and UI would need to know which entity owns every automation concern.

### C. Explicit policy-inheritance and manager-delegation modules

Keep the current `GameState.policy` root, add compact override/delegation collections, and resolve/apply them through focused pure modules.

Choose this. It is the smallest design that keeps policy resolution, manager heuristics, persistence, and UI explanations deterministic and independently testable.

## Scope decisions

- `GameState.policy` stays the company default. Do not rename it.
- Policy inheritance applies to retail cities/stores only because policy is consumed by store simulation.
- A manager's existing `assignedStoreId` remains the physical staffing/coverage assignment. HPA-41 adds a separate delegation scope; regional authority must not silently rewrite staffing coverage semantics.
- Every `StaffMember` with `role === 'manager'` is qualified. Do not add another level/skill gate.
- One manager has at most one active delegation record.
- Scoped policy edits and manager configuration are sandbox-only in HPA-41. Existing scenario `updatePolicy` remains company-level; do not widen the scenario command grammar.
- Manager actions run at the start of `simulateDay`, before production/sales/replenishment, and read only the state plus already-completed reports available at that point.
- Manager evaluation adds no RNG calls and must not change RNG ordering.
- Pre-release saves remain unsupported: bump schema 17 to 18 and reject 17; no migration.

## Policy state

Add explicit scoped overrides rather than copying full policies into every city/store.

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

export type PolicyProvenance = {
  [K in keyof CompanyPolicy]: PolicyValueSource;
};

export interface EffectivePolicy {
  values: CompanyPolicy;
  provenance: PolicyProvenance;
}
```

`GameState` gains:

```ts
policyOverrides: PolicyOverride[];
```

Rules:

- at most one city override record per city and one store override record per store;
- override records contain only explicitly overridden fields;
- an explicit child value equal to its parent remains explicit; provenance must not infer inheritance from equality;
- clearing one field removes that field and immediately restores its parent value;
- clearing the final field removes the empty override record;
- reset-to-parent for a scope removes the whole scope record;
- override arrays are stored in canonical scope order for deterministic snapshots.

`policyInheritance.ts` owns:

```ts
resolveEffectivePolicy(game, store): EffectivePolicy
setPolicyOverride(game, scope, patch): GameState
clearPolicyOverrideField(game, scope, field): GameState
resetPolicyOverrideScope(game, scope): GameState
```

Resolution is strictly:

```text
company default -> city explicit values -> store explicit values
```

The UI compares parent/effective values from this resolver. Do not persist duplicated resolved policy or comparison data.

## Simulation contract

Today `simulateDay.ts` reads `game.policy` directly for pricing, inventory, staffing, marketing, and service. HPA-41 resolves policy once per store and passes the resolved values to the existing calculation seams.

### Store operations

`buildStoreOperationProfile` receives the store's effective policy instead of indexing `game.policy` internally.

Temporary policy pricing is also per store. `applyPolicyPricingToStores` uses the resolved pricing posture for each store, then the existing restore path returns configured product prices after sales.

### Shared city demand

`buildCityDemandPools` is a city-level pool, so a store override must not multiply demand for every competitor in the city.

For each product, collect sellers in that city carrying the product and calculate:

```text
sellerPolicyMultiplier =
  marketingDemandMultiplier(effectivePolicy.marketing)
  * pricingDemandMultiplier(effectivePolicy.pricing)

productPolicyMultiplier = average(sellerPolicyMultiplier across sellers)

base city product pool =
  city demand
  * product demandWeight
  * productPolicyMultiplier
  * retail city product multiplier
```

When all stores inherit the same policy, this exactly preserves the current city-pool multiplier. A local override affects only its proportional contribution to the shared pool.

`buildCityDemandPools` stays trend-free. `simulateProductSalesForCity` remains the single place that applies product trend. The Supply Planner continues to reuse the trend-free pool, now with effective policy values.

### No forward manager simulation in planning

The Supply Planner reads current state only. It does not forecast future manager decisions. A manager action that has already changed policy/targets is naturally visible to the planner on the next read.

## Manager delegation state

```ts
export type ManagerPlaybookId =
  | 'protect-margin'
  | 'protect-availability'
  | 'grow-market-share'
  | 'stabilize-cash'
  | 'prefer-local-supply';

export type ManagerDelegationScope =
  | { kind: 'store'; storeId: string }
  | { kind: 'city'; cityId: WorldCityId };

export interface ManagerAuthority {
  pricing: boolean;
  inventory: boolean;
  staffing: boolean;
  supply: boolean;
}

export interface ManagerDelegation {
  managerId: string;
  scope: ManagerDelegationScope;
  playbook: ManagerPlaybookId;
  authority: ManagerAuthority;
  enabled: boolean;
}
```

`GameState` gains:

```ts
managerDelegations: ManagerDelegation[];
managerActionHistory: ManagerActionRecord[];
```

Configuration rules:

- `managerId` must reference an existing manager-role staff member;
- store scope references one existing store;
- city scope references one materialized/open retail city;
- `prefer-local-supply` requires city scope because retail supply assignment is city-wide;
- a manager may be physically assigned to one store while holding city delegation authority; the two concepts intentionally remain independent;
- disabling/removing delegation never rewrites store policy, product targets, or supply state already applied by previous days.

## Authority limits

Authority is domain-level and player controlled. The evaluator itself also has fixed bounded actions:

- **pricing:** one existing pricing-posture step per day per target store; never writes raw product price;
- **inventory:** at most a 10% target/reorder adjustment for one product per target store per day, preserving `reorderThreshold <= targetStock`;
- **staffing:** one existing staffing-posture step per day per target store; never hires, fires, promotes, or reassigns staff;
- **supply:** an already-open/materialized inventory city only; never opens cities, builds production, or creates logistics routes.

These fixed limits are code constants, not a persisted tuning DSL.

## Playbooks

All playbooks are pure, deterministic heuristics over current state and the latest completed report. If the trigger is not met, no proposal/history entry is created.

### Protect Margin

For each target store with latest report evidence:

```text
marginRate = grossMargin / revenue
trigger when revenue > 0 and marginRate < 0.30
proposal = pricing one step toward premium
```

Step order:

```text
discount -> competitive -> standard -> premium
```

Requires `authority.pricing`.

### Protect Availability

For each target store:

1. if any product has `stockoutLostDemand > 0` or `demandMissed > 0`, choose the product by:
   - highest `stockoutLostDemand`;
   - then highest `demandMissed`;
   - then `productId` ascending;
2. propose increasing both target/reorder by 10%, rounded upward with a minimum one-unit step;
3. otherwise, if the latest store warnings contain `nearStaffCapacity`, propose staffing one step toward `service`.

Staffing order:

```text
minimal -> efficient -> service
```

The inventory proposal requires `authority.inventory`; the staffing fallback requires `authority.staffing`.

### Grow Market Share

For each target store:

```text
trigger when marketPosition < 60 and stockHealth >= 40
proposal = pricing one step toward discount
```

Step order:

```text
premium -> standard -> competitive -> discount
```

Requires `authority.pricing`.

### Stabilize Cash

Trigger only when the latest company report has negative `operatingCashFlow`.

For each target store, choose its product with the fewest `unitsSold` (then `productId` ascending) and propose:

```text
nextTarget = max(1, floor(targetStock * 0.90))
nextThreshold = min(nextTarget, max(0, floor(reorderThreshold * 0.90)))
```

Requires `authority.inventory`. This reduces future replenishment exposure without pretending the staffing posture changes actual payroll headcount.

### Prefer Local Supply

City-scope only. Consider opened/materialized cities that support inventory. For the retail city's currently sold products, sum compatible finished-material inventory in each candidate source.

Choose:

```text
highest compatible units -> WorldCityId ascending tie-break
```

If the best positive-stock source differs from the current retail supply assignment, propose switching via the existing `setRetailSupplySource` transition. If no compatible positive stock exists, do nothing.

Requires `authority.supply`.

## Proposal, conflict, and audit contract

Manager decisions are two-phase:

1. build proposals from one immutable start-of-day snapshot;
2. resolve/apply proposals to a working game state.

This prevents one manager's mutation from changing another manager's trigger inputs.

Canonical conflict keys are:

```text
pricing:<storeId>
inventory:<storeId>:<productId>
staffing:<storeId>
supply:<retailCityId>
```

Winner order:

1. store-scope proposal beats city-scope proposal for the same key;
2. same specificity uses `managerId` ascending.

Losing valid proposals are recorded as `overridden`. Proposals whose required authority flag is false are recorded as `out-of-authority` before conflict resolution.

Use a discriminated action change rather than generic JSON:

```ts
export type ManagerActionChange =
  | {
      kind: 'pricing-policy';
      storeId: string;
      before: PricingPosture;
      proposed: PricingPosture;
      applied: PricingPosture | null;
    }
  | {
      kind: 'inventory-targets';
      storeId: string;
      productId: ProductId;
      before: { reorderThreshold: number; targetStock: number };
      proposed: { reorderThreshold: number; targetStock: number };
      applied: { reorderThreshold: number; targetStock: number } | null;
    }
  | {
      kind: 'staffing-policy';
      storeId: string;
      before: StaffingPosture;
      proposed: StaffingPosture;
      applied: StaffingPosture | null;
    }
  | {
      kind: 'supply-source';
      retailCityId: WorldCityId;
      before: WorldCityId | null;
      proposed: WorldCityId;
      applied: WorldCityId | null;
    };

export type ManagerActionOutcome =
  | 'applied'
  | 'overridden'
  | 'rejected'
  | 'out-of-authority';

export interface ManagerActionRecord {
  id: string;
  day: number;
  managerId: string;
  scope: ManagerDelegationScope;
  playbook: ManagerPlaybookId;
  outcome: ManagerActionOutcome;
  reason: ManagerActionReason;
  change: ManagerActionChange;
}
```

Every record is the proposal; `outcome` records what happened to it. `applied` inside the change is non-null only for an applied winner.

IDs are deterministic from `day + managerId + conflictKey`; no extra sequence state is needed. Keep only the newest 100 records (`MANAGER_ACTION_HISTORY_LIMIT = 100`).

`rejected` is reserved for a winning proposal whose target or domain transition is no longer valid when applied. It must not silently disappear.

## Manual control

Players retain all existing manual controls. HPA-41 does not lock product settings, policy controls, or supply source selectors when a manager has authority.

Manual intervention is explicit through delegation controls:

- disable the delegation, or
- revoke one authority domain, then make the manual edit.

Future proposals that hit a revoked domain are recorded `out-of-authority`. HPA-41 does not add temporary hold timers or attempt to infer player intent from a manual edit.

## Exception alerts

Extend `GameAlert` with `manager-exception` and `managerId`, routing to the existing `staff` management panel.

For the newest manager-action day, emit at most one alert per manager when that manager has a non-applied action (`overridden`, `rejected`, or `out-of-authority`). Applied actions stay in history but do not create alerts.

This reuses the existing alert system; do not add a second notification store.

## UI

### Policies panel

Evolve `PolicyPanel.svelte` instead of adding another panel.

- scope selector: Company / City / Store;
- city/store selector for the chosen scope;
- each field shows effective value and provenance (`Company`, selected city, selected store);
- city/store fields provide an `Inherit from parent` option that clears only that field;
- `Reset scope to parent` clears the whole scope record;
- show parent value beside effective value so comparison is visible without a separate compare modal;
- equal explicit values still show as explicit overrides.

Company mode keeps the existing policy edit behavior.

### Staff panel

Keep `StaffPanel.svelte` focused on hiring, physical assignment, coverage, and promotion.

Add `ManagerDelegationPanel.svelte` beside it inside the existing `staff` control-tower surface. It shows:

- manager identity and current physical assignment;
- enabled state;
- delegation scope/target;
- playbook;
- four authority toggles;
- recent manager action history with outcome/reason/change.

Do not add a new `ManagementPanelId`.

All new copy is localized in the existing English/Japanese/Traditional-Chinese bundles. Inherited/explicit state must not rely on color alone.

## Route/controller boundary

Keep current company `updatePolicy` and scenario command unchanged.

Add sandbox-only controller mutations for:

```ts
setScopedPolicyOverride(scope, patch)
clearScopedPolicyOverrideField(scope, field)
resetScopedPolicyOverride(scope)
setManagerDelegation(input)
removeManagerDelegation(managerId)
```

Expose separate mutation-availability flags for scoped policy and manager delegation. In scenario mode those flags are false; company policy continues through the existing `updatePolicy` command.

## Persistence

Bump:

```ts
SAVE_SCHEMA_VERSION = 18
```

Reject schema 17; no migration.

Validate:

- policy override scope IDs, unique scope records, known policy values, and non-empty partial values;
- manager delegation manager role, unique manager IDs, scope targets, playbook/scope constraint, booleans, and enums;
- action-history length <= 100, known outcomes/reasons/change variants, finite inventory quantities, and referenced manager/store/city/product IDs;
- canonical arrays after decode.

`createNewGame` initializes all three new collections empty. Scenario setup inherits those empty collections from normal game creation; no new scenario commands or scenario content fields are added.

## Testing

### Unit

- all 3-level inheritance/provenance combinations;
- clear field and reset scope;
- explicit child value equal to parent remains explicit;
- simulation uses per-store values for all five policy dimensions;
- mixed-policy city demand averages seller policy multipliers and preserves the uniform-policy baseline;
- Supply Planner remains trend-free and responds to effective policy;
- each playbook trigger and no-trigger path;
- authority rejection;
- store-over-city and manager-ID conflict ordering;
- action history cap and deterministic IDs;
- fixed-seed simulation determinism / unchanged RNG call order;
- manager exception alert deduplication.

### Persistence

- schema 18 round trip with overrides, delegation, and action history;
- malformed/duplicate scope records rejected;
- non-manager delegation rejected;
- invalid scope/playbook pair rejected;
- history >100 or malformed change rejected;
- schema 17 rejected.

### Component

- Policy panel inherited/explicit/provenance/reset controls;
- manager delegation scope/playbook/authority controls;
- localized activity history and non-color-only outcomes;
- scenario mode disables scoped/delegation mutations while company policy remains available.

### E2E

One sandbox workflow is enough:

1. start a fixed-seed game;
2. create a store override and verify provenance;
3. configure an existing manager with store-scope `grow-market-share` and pricing authority;
4. advance a day until the deterministic trigger applies;
5. verify the manager history and resulting store pricing override;
6. reload the auto-save and verify override/delegation/history persist.

Do not create a second E2E scenario matrix.

## Risks

- **Mixed-policy demand semantics:** city demand is shared. The seller-average multiplier preserves today's behavior for uniform policies and prevents one overridden store from scaling all city demand.
- **Order sensitivity:** manager proposals must read one immutable snapshot and resolve by explicit precedence before application.
- **Automation fighting the player:** authority toggles and enabled state are the control boundary; do not invent hidden cooldowns.
- **RNG drift:** policy/manager resolution is pure and must not add/move RNG calls.
- **Unbounded save growth:** history is capped at 100 records.

## Non-goals

- autonomous store/factory/city construction;
- manager hiring/firing/promotion/reassignment;
- generic rules/conditions/actions DSL;
- LLM/AI manager logic;
- new regions above city scope;
- per-field manager cooldown/hold timers;
- scenario-authorable manager delegations;
- changes to event modifier policy semantics;
- a new dashboard or management-panel ID.

## Definition of done

- company -> city -> store policy inheritance is deterministic and provenance-aware;
- clearing/resetting overrides restores parent behavior immediately;
- daily simulation and baseline supply planning consume effective policies consistently;
- manager-role staff can run one bounded deterministic store/city playbook;
- all five named playbooks are implemented without a generic rule engine;
- authority, conflicts, and rejected actions are explicit and audited;
- manual controls remain available and authority can be revoked per domain;
- manager exceptions use the existing alert system;
- schema 18 strictly persists/validates overrides, delegation, and bounded history with no migration;
- existing staff/policy surfaces expose the feature accessibly;
- focused unit/component/E2E tests and full project verification pass.