# Regional Manager Playbooks and Policy Inheritance Design

**Date:** 2026-08-18  
**Linear:** HPA-41 — Regional manager playbooks and policy inheritance  
**Status:** Normative planning baseline

## Outcome

Add one small delegation layer to the existing retail simulation:

1. `GameState.policy` remains the company default;
2. optional retail-city overrides inherit from company;
3. optional store overrides inherit from the effective city policy;
4. manager-role staff can run one deterministic store/city playbook inside explicit authority;
5. every manager proposal records its outcome and reason.

Do not add a generic hierarchy/rules engine, opaque AI, autonomous construction, hiring/firing automation, or a new management dashboard.

## Why HPA-41 is next

HPA-38 is implemented on `main`, completing the other Phase-2 vertical slice from HPA-275. HPA-41 has no Linear blockers and no dedicated planning PR. HPA-39 is technically unblocked by HPA-38 but belongs to the later roadmap phase, so HPA-41 is the next roadmap-ordered actionable slice.

## Approaches considered

### Generic hierarchy + automation framework

A scope tree, rule DSL, and generic action registry could model future regions and competitors. Reject it: HPA-41 has exactly three policy levels and five playbooks, so the framework would be speculative infrastructure.

### Put everything on `City`, `Store`, and `StaffMember`

This minimizes new top-level fields but mixes policy resolution, physical staffing, automation configuration, and audit history into core entities. Reject it: the apparent file-count win spreads behavior across more owners.

### Focused inheritance + delegation modules

Choose this. Keep sparse state in `GameState`, put policy resolution in `policyInheritance.ts`, and put deterministic manager behavior in `managerDelegation.ts`. Existing simulation/UI/persistence seams consume those modules.

## Scope decisions

- Policy inheritance applies to retail cities/stores because policy is consumed by store simulation.
- `StaffMember.assignedStoreId` remains physical staffing coverage. Manager delegation scope is separate.
- Every `StaffMember` with `role === 'manager'` is qualified; no level/skill gate.
- One manager has at most one delegation record.
- Scoped policy edits and manager configuration are sandbox-only for HPA-41. Existing scenario `updatePolicy` stays company-level; no new scenario command variants.
- Manager actions run at the start of `simulateDay`, before existing production/sales/replenishment work.
- Manager logic adds no RNG calls and must not move existing RNG call sites.
- Schema 17 becomes 18; schema 17 is rejected with no migration, matching the repository's pre-release save policy.

## Policy inheritance

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
```

`GameState` gains:

```ts
policyOverrides: PolicyOverride[];
```

Rules:

- at most one city record per city and one store record per store;
- records contain only explicitly overridden fields;
- an explicit child value equal to its parent remains explicit;
- clearing one field immediately restores its parent value/source;
- clearing the final field removes the empty record;
- reset-to-parent removes the scope record;
- records use deterministic scope/ID ordering.

`policyInheritance.ts` owns:

```ts
resolveEffectivePolicy(game, store): EffectivePolicy
setPolicyOverride(game, scope, patch): GameState
clearPolicyOverrideField(game, scope, field): GameState
resetPolicyOverrideScope(game, scope): GameState
```

Resolution is exactly:

```text
company -> city explicit fields -> store explicit fields
```

Resolved values/provenance are derived, never persisted.

## Simulation contract

Today `simulateDay.ts` reads `game.policy` directly. HPA-41 resolves effective policy once per store and threads it through existing pricing and `buildStoreOperationProfile` seams.

### Per-store operations

- pricing posture: temporary sales price multiplier uses the store's effective policy;
- inventory/staffing/marketing/service: `buildStoreOperationProfile` reads the passed effective policy, not `game.policy`;
- configured product prices are restored through the existing post-sales path.

### Shared city demand

`buildCityDemandPools` is city-wide, so one store override must not scale demand for all competitors. For each product:

```text
sellerPolicyMultiplier =
  marketingDemandMultiplier(effectivePolicy.marketing)
  * pricingDemandMultiplier(effectivePolicy.pricing)

productPolicyMultiplier = average(sellerPolicyMultiplier across sellers carrying the product)

base city product pool =
  city demand
  * product demandWeight
  * productPolicyMultiplier
  * retail city product multiplier
```

Uniform policies therefore preserve today's multiplier exactly. A local override contributes only its proportional share to the shared pool.

`buildCityDemandPools` remains trend-free. `simulateProductSalesForCity` remains the only product-trend application point. The Supply Planner reads effective policy through this baseline pool but does not forecast future manager choices.

## Manager delegation

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

- `managerId` references an existing manager-role staff member;
- store scope references an existing store;
- city scope references an open/materialized retail city;
- `prefer-local-supply` requires city scope because the existing retail supply assignment is city-wide;
- disabling/removing delegation never rolls back state already changed on prior days.

A manager may remain physically assigned to a home store while holding city delegation authority. HPA-41 deliberately does not change staffing coverage semantics.

## Authority limits

Player-controlled authority is domain-level, while actions are additionally bounded in code:

- **pricing:** one existing pricing-posture step per day/store; never raw price;
- **inventory:** at most a 10% reorder/target adjustment for one product per day/store, preserving `reorderThreshold <= targetStock`;
- **staffing:** one staffing-posture step per day/store; never hire/fire/promote/reassign;
- **supply:** switch only to an already-open/materialized inventory city; never open cities, build factories, or create routes.

These are fixed constants/enum steps, not persisted tuning rules.

## Playbooks

All playbooks are deterministic over current state plus the latest completed report. A false trigger produces no proposal/history entry.

### Protect Margin

For each target store:

```text
trigger: revenue > 0 and grossMargin / revenue < 0.30
proposal: pricing one step toward premium
order: discount -> competitive -> standard -> premium
```

Requires pricing authority.

### Protect Availability

For each target store:

1. when a product has `stockoutLostDemand > 0` or `demandMissed > 0`, choose highest `stockoutLostDemand`, then highest `demandMissed`, then `productId` ascending;
2. increase reorder/target by 10%, rounded upward with a minimum one-unit step;
3. otherwise, if warnings contain `nearStaffCapacity`, move staffing one step toward `service` (`minimal -> efficient -> service`).

Requires inventory or staffing authority for the chosen action.

### Grow Market Share

```text
trigger: marketPosition < 60 and stockHealth >= 40
proposal: pricing one step toward discount
order: premium -> standard -> competitive -> discount
```

Requires pricing authority.

### Stabilize Cash

Trigger when the latest company report has negative `operatingCashFlow`.

For each target store, choose the product with fewest `unitsSold`, then `productId` ascending:

```text
nextTarget = max(1, floor(targetStock * 0.90))
nextThreshold = min(nextTarget, max(0, floor(reorderThreshold * 0.90)))
```

Requires inventory authority. This reduces replenishment exposure without pretending a staffing posture changes payroll headcount.

### Prefer Local Supply

City scope only. For products sold in the retail city, sum compatible finished-material inventory in each open/materialized candidate supply city.

Choose highest compatible units, then `WorldCityId` ascending. If the best positive-stock source differs from the current assignment, apply it through existing `setRetailSupplySource`. If no positive compatible source exists, do nothing.

Requires supply authority.

## Proposal, conflict, and audit contract

Manager decisions are two-phase:

1. build every proposal from one immutable start-of-day snapshot;
2. resolve conflicts and apply winners to a working state.

Canonical conflict keys:

```text
pricing:<storeId>
inventory:<storeId>:<productId>
staffing:<storeId>
supply:<retailCityId>
```

Precedence:

1. store scope beats city scope for the same key;
2. equal specificity uses `managerId` ascending.

A proposal lacking required authority is `out-of-authority` before conflict resolution. Valid losers are `overridden`. A winning proposal rejected by its existing domain transition is `rejected`.

```ts
export type ManagerActionOutcome =
  | 'applied'
  | 'overridden'
  | 'rejected'
  | 'out-of-authority';

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
```

Use a discriminated change union, not generic JSON:

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

Every record is a proposal; `change.applied` is non-null only for an applied winner. IDs derive deterministically from `day + managerId + conflictKey`. Keep the newest 100 records only.

## Manual control

Existing product, policy, staffing, and supply controls stay usable. Manual intervention is explicit:

- disable the delegation, or
- revoke one authority domain, then make the manual edit.

Future triggered proposals against a revoked domain are recorded `out-of-authority`. Do not add hidden cooldowns, temporary holds, or inferred user intent.

## Exception alerts

Extend the existing alert model with `manager-exception`, `managerId`, and routing to `staff`.

For the newest manager-action day, emit at most one alert per manager with any non-applied record (`overridden`, `rejected`, `out-of-authority`). Applied actions remain visible in history without alerts. Do not persist a second notification store.

## UI

### Policies

Evolve `PolicyPanel.svelte`:

- scope selector: Company / City / Store;
- target selector for City/Store;
- each field shows effective value plus textual provenance;
- `Inherit from parent` clears one field;
- `Reset scope to parent` clears the scope record;
- parent value is visible beside effective value for comparison;
- equal explicit values still render as explicit overrides.

Company mode preserves existing policy editing.

### Staff

Keep `StaffPanel.svelte` focused on hiring, physical assignment, coverage, and promotion. Add `ManagerDelegationPanel.svelte` beside it inside the existing `staff` control-tower surface.

The new panel shows manager identity/home assignment, enabled state, delegation scope/target, playbook, four authority toggles, and recent action history. Do not add a new `ManagementPanelId`.

New copy uses the existing English/Japanese/Traditional-Chinese bundles. Inherited/explicit and action outcomes must not rely on color alone.

## Route/controller boundary

Keep company `updatePolicy` and its scenario command unchanged.

Add sandbox-only controller mutations:

```ts
setScopedPolicyOverride(scope, patch)
clearScopedPolicyOverrideField(scope, field)
resetScopedPolicyOverride(scope)
setManagerDelegation(delegation)
removeManagerDelegation(managerId)
```

Add separate mutation-availability flags for scoped policy and delegation. They are false in scenario mode.

## Persistence

Set:

```ts
SAVE_SCHEMA_VERSION = 18
```

Reject 17; no migration.

Validate:

- unique, non-empty policy override records with valid scope/value enums;
- manager-role delegation IDs, unique managers, valid scopes, booleans, and city-only `prefer-local-supply`;
- action history length <= 100, known outcome/reason/change variants, finite inventory quantities, and referenced manager/store/city/product IDs;
- deterministic ordering after decode.

`createNewGame` initializes all three collections empty. Scenario setup inherits those empty collections from normal game creation; no scenario content schema is added.

## Testing

Unit coverage:

- all three inheritance levels/provenance, clear/reset, explicit-equal-parent;
- per-store use of all five policy dimensions;
- mixed-policy city demand average and uniform-policy baseline;
- Supply Planner effective-policy + trend-free behavior;
- every playbook trigger/no-trigger path;
- authority rejection and deterministic conflict precedence;
- deterministic action IDs/history cap/no RNG drift;
- manager exception alert dedupe.

Persistence coverage:

- schema-18 round trip for overrides/delegation/history;
- malformed/duplicate scopes, invalid manager/scope/playbook, malformed history;
- schema 17 rejected.

Component coverage:

- inherited/explicit/provenance/reset policy controls;
- manager scope/playbook/authority/history controls;
- scenario-mode scoped/delegation controls disabled while company policy remains available.

One E2E workflow:

1. start fixed-seed sandbox;
2. create a store policy override and verify provenance;
3. configure a manager with store-scope `grow-market-share` + pricing authority;
4. advance until its deterministic trigger applies;
5. verify activity history and resulting store pricing override;
6. reload auto-save and verify override/delegation/history persist.

Do not add a per-playbook E2E matrix.

## Non-goals

- autonomous store/factory/city construction;
- manager hiring/firing/promotion/reassignment;
- generic rule/condition/action DSL;
- LLM/AI manager logic;
- hierarchy above city;
- per-field cooldown/hold timers;
- scenario-authorable delegations;
- event modifier policy changes;
- a new dashboard/panel ID.

## Definition of done

- company -> city -> store inheritance is deterministic and provenance-aware;
- clear/reset restores parent behavior immediately;
- simulation and baseline supply planning consume effective policy consistently;
- manager-role staff can run all five bounded deterministic playbooks;
- authority/conflicts/rejections are explicit and audited;
- manual controls remain available and authority can be revoked;
- manager exceptions reuse existing alerts;
- schema 18 strictly persists/validates the feature with no migration;
- existing Policies/Staff surfaces expose it accessibly;
- focused unit/component/E2E and full repository verification pass.