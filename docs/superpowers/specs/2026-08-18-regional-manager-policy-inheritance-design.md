# Regional Manager Playbooks and Policy Inheritance Design

**Date:** 2026-08-18  
**Linear:** HPA-41 — Regional manager playbooks and policy inheritance  
**Status:** Normative; revised after codebase review

## Outcome

Add a small delegation layer on top of the existing retail simulation:

1. `GameState.policy` remains the company default;
2. retail cities and stores may carry sparse policy overrides with explicit provenance;
3. simulation and the Supply Planner consume the same effective per-store policy rules;
4. manager-role staff may run one deterministic playbook over a store or retail-city authority range;
5. manager proposals are bounded, conflict-resolved deterministically, and persisted as auditable history;
6. existing Policies, Staff, alert, persistence, and route-controller surfaces expose the feature.

This stays one HPA-41 implementation PR. Do not add a generic hierarchy engine, rules DSL, AI service, automation registry, autonomous construction, autonomous hiring/firing, or a new management dashboard.

## Review resolution

The review is accepted with one precision fix around demand allocation.

Accepted:

- keep company policy as the root and sparse overrides as the only persisted inheritance state;
- keep physical staff assignment separate from delegation scope;
- keep five hard-coded playbooks and closed unions;
- use completed reports as playbook evidence; no report means no proposal;
- run manager evaluation after transfer arrivals and before production/sales/replenishment;
- reuse `productionMaterialId`, city inventory, and `setRetailSupplySource` for local-supply actions;
- initialize the three new `GameState` arrays at every direct construction site in the first type checkpoint;
- extend existing alert localization/navigation to the Staff panel;
- treat city delegation scope as an authority range, not a city-policy write target;
- route inventory target actions through `updateStoreProduct` and accept its validation/rejection semantics;
- keep manager history bounded using the existing history-module pattern;
- add explicit risks for report timing, demand spillover, lot-compatible inventory edits, `GameState` literal blast radius, E2E timing, and city-scope store-override fragmentation.

Refined demand contract:

- the review correctly rejects averaging seller policy multipliers into one shared city demand cap;
- `buildCityDemandPools` becomes policy-free and trend-free;
- seller policy multipliers are applied only to that seller's demand share;
- the shared `remainingDemand` value must no longer constrain policy-adjusted seller allocation, otherwise a local policy can still alter sibling capacity or uniform positive policy multipliers are clipped back to the raw pool;
- the planner computes potential demand by summing the same policy-scaled seller shares.

## Existing seams

HPA-41 extends rather than replaces the current architecture:

- `src/lib/game/state.ts` owns `CompanyPolicy`, `DEFAULT_POLICY`, and company-level `updatePolicy`;
- `src/lib/game/simulateDay.ts` consumes pricing/inventory/staffing/marketing/service policy;
- `src/lib/game/stock.ts` owns city demand, seller scoring, product settings, and target validation;
- `src/lib/game/retailSupply.ts` owns retail supply assignment and product-to-material compatibility;
- `src/lib/game/staffing.ts` already identifies manager-role staff;
- `src/lib/game/eventHistory.ts` supplies the existing bounded-history convention;
- `PolicyPanel.svelte` and the Staff control-tower surface are the existing player-facing homes;
- `GameRouteController` remains the mutation/autosave boundary.

Phaser and map snapshots are untouched.

## Scope decisions

- `GameState.policy` stays named and authoritative as the company root.
- Inheritance applies only to retail-city/store operations.
- `StaffMember.assignedStoreId` remains physical staffing coverage only.
- Every existing `role === 'manager'` staff member is delegation-qualified; no extra skill/level gate.
- One manager has at most one delegation record.
- Scoped policy edits and manager delegation configuration are sandbox-only in HPA-41.
- Existing scenario `updatePolicy` remains company-level; do not add scenario commands.
- Manager evaluation consumes no RNG and does not move existing RNG call sites.
- With no enabled delegations, the manager phase is a strict no-op and daily simulation preserves current behavior apart from the newly required empty state arrays.
- Pre-release saves are unsupported: final schema is 18 and schema 17 is rejected without migration.

## Policy inheritance state

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

`policyInheritance.ts` owns:

```ts
resolveEffectivePolicy(game, scope): EffectivePolicy
setPolicyOverride(game, scope, patch): GameState
clearPolicyOverrideField(game, scope, field): GameState
resetPolicyOverrideScope(game, scope): GameState
```

with the concrete resolver signature:

```ts
resolveEffectivePolicy(
  game: GameState,
  scope: PolicyOverrideScope
): EffectivePolicy
```

This single resolver supports both store simulation and the Policies UI:

- city scope resolves company -> city;
- store scope resolves company -> store's city -> store.

Company mode uses `game.policy` directly with company provenance and does not need a synthetic company override scope.

Rules:

- city IDs resolve through the existing world-city helpers and must be materialized/open retail cities;
- store IDs must exist and their city must resolve to an open retail city;
- at most one override record exists per concrete scope;
- records contain only explicit fields;
- an explicit value equal to its parent is still explicit and keeps child provenance;
- clearing one field restores its parent immediately;
- clearing the last field removes the empty record;
- reset removes the complete scope record;
- persisted override records are canonically ordered by scope kind then concrete ID;
- provenance and parent/effective comparison are derived, never persisted.

Mutators return the original game unchanged for invalid scope IDs. The resolver is for validated current state and may treat an invalid scope as a state invariant failure rather than inventing a fallback policy.

## Daily simulation policy consumption

### Resolve once per store

At the start of store operations, build one effective policy per store with:

```ts
resolveEffectivePolicy(game, { kind: 'store', storeId: store.id })
```

Reuse it for that store's profile, temporary policy pricing, and seller demand calculation.

`buildStoreOperationProfile` receives the effective policy rather than reading `game.policy` internally.

Temporary policy pricing is per store. The existing restore path still restores configured product prices after sales.

### Raw city demand stays policy-free

Change `buildCityDemandPools` to:

```ts
buildCityDemandPools(
  game: Pick<GameState, 'stores' | 'world'>,
  city: City
): RetailDemandProfile
```

It computes only:

```text
raw city product pool =
  city demand
  * product.demandWeight
  * retail-city product multiplier
```

It remains trend-free for Supply Planner reuse. Remove the optional/default policy parameter so no caller can accidentally reintroduce company-policy scaling.

### Seller policy scaling, no upward spillover

Reuse the existing `stock.ts` marketing and pricing demand multipliers; do not introduce a second table or reuse the different `PRICING.demand` values from `simulateDay.ts`.

For each product in `simulateProductSalesForCity`:

```text
trendPool = rawCityPool * trendMultiplier(product, day)
demandShare = scoreStoreForCategory(store, product) / totalSellerScore
sellerPolicyMultiplier =
  getMarketingDemandMultiplier(effectivePolicy.marketing)
  * getPricingDemandMultiplier(effectivePolicy.pricing)

sellerPolicyDemand = trendPool * demandShare * sellerPolicyMultiplier

desiredUnits = sellerPolicyDemand
  * obsolescenceMultiplier
  * configuredPriceDemandMultiplier
  * existing jitter
```

A seller's allocation is then bounded by its own `desiredUnits`, sales capacity, and stock. Do not use one policy-scaled shared `remainingDemand` cap as an input to `sellableDemand`.

This has two required properties:

1. when all sellers inherit one policy, the sum of pre-product-dynamics seller policy demand equals today's policy-scaled city pool, subject only to existing rounding;
2. changing one store's override changes only that store's policy-scaled share, never a sibling's `desiredUnits` or available-demand cap.

If `ProductSalesResult.remainingDemand` is retained as diagnostic output, derive it after sales from raw/trend city demand and do not feed it back into seller allocation.

No RNG call is added or moved.

## Supply Planner demand

The planner continues to consume raw `buildCityDemandPools` output, then calculates policy-aware potential demand from the same seller scoring and policy multipliers used by live sales.

For each claimant city/product:

```text
potentialDemandPerDay = sum(
  rawCityProductPool
  * sellerDemandShare
  * sellerPolicyMultiplier
)
```

Each seller policy is resolved through:

```ts
resolveEffectivePolicy(game, { kind: 'store', storeId: store.id }).values
```

Then apply the existing replenishment/target-stock ceiling to derive effective planner demand.

The planner does not apply product trend and does not forecast future manager decisions. It sees manager changes only after they have actually changed policy/targets/supply state.

Tests must cover:

- uniform policy parity with the current baseline;
- one store override changes only its weighted contribution;
- no trend leakage into planner potential demand.

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

- manager IDs reference existing manager-role staff;
- store scope references an existing store;
- city scope references a materialized/open retail city;
- `prefer-local-supply` requires city scope;
- delegation scope does not alter `assignedStoreId` or staffing coverage;
- disabling/removing a delegation does not roll back already-applied settings.

## Manager phase order and evidence

Daily order becomes:

```text
1. processTransferArrivals
2. evaluate/apply manager delegations
3. existing modifier/rule resolution
4. industry production
5. retail sales
6. weekly replenishment
7. recurring-route dispatch
8. finance/report/event close
```

Running after arrivals is required so `prefer-local-supply` can see inventory delivered today.

Report-backed playbooks read only the latest already-completed `DailyReport`:

- per-store triggers read the matching latest `DailyStoreReport`;
- Stabilize Cash reads latest company `operatingCashFlow`;
- Grow Market Share reads `DailyStoreReport.marketPosition`, never company `scorecard.marketPosition`.

On day 1, `reports` is empty. Missing report evidence is equivalent to a false trigger: no proposal and no history row.

Therefore a normal founding lifecycle needs two day advances before a report-backed manager can act: first advance creates report evidence; second advance consumes it.

## City scope is an authority range

Store-oriented playbooks expand city scope into deterministic per-store proposals. They do **not** write a city-wide policy override.

Examples:

- city-scope Protect Margin may produce `pricing:<store-1>` and `pricing:<store-2>` proposals;
- each winning pricing/staffing proposal writes a **store** policy override;
- each winning inventory proposal edits that store's product targets;
- `prefer-local-supply` is the only playbook whose write target is city-level, through the existing retail supply assignment.

This can create store overrides under a city delegation. That is expected inheritance state, not a synchronization problem.

## Fixed authority bounds

Authority is domain-level and player-controlled:

- **pricing:** one existing pricing-posture step per target store per day; write via store policy override;
- **inventory:** one product target/reorder proposal per target store per day, nominally +/-10%; apply only through `updateStoreProduct`;
- **staffing:** one existing staffing-posture step per target store per day; write via store policy override;
- **supply:** switch one retail city's configured source only through `setRetailSupplySource`.

Managers never:

- write raw product selling prices;
- bypass `updateStoreProduct` quantity/lot compatibility checks;
- hire, fire, promote, or physically reassign staff;
- open cities;
- construct buildings;
- create/edit logistics routes.

A nominal inventory step rejected by `updateStoreProduct` is recorded as `rejected` / `transition-rejected`; do not introduce a parallel target patch that bypasses its validation.

## Playbooks

All playbooks are deterministic over the immutable post-arrival start-of-manager-phase snapshot.

### Protect Margin

For each target store with a latest store report:

```text
marginRate = grossMargin / revenue
trigger: revenue > 0 && marginRate < 0.30
proposal: pricing one step toward premium
```

Order:

```text
discount -> competitive -> standard -> premium
```

Required authority: pricing.

### Protect Availability

For each target store with a latest store report:

1. choose a pressured product by highest `stockoutLostDemand`, then highest `demandMissed`, then `productId` ascending;
2. if either pressure value is positive, propose +10% reorder/target values, rounded upward with minimum one-unit movement;
3. otherwise, if latest warnings include `nearStaffCapacity`, propose staffing one step toward `service`.

Order:

```text
minimal -> efficient -> service
```

Inventory applies through `updateStoreProduct`; staffing applies through a store policy override.

### Grow Market Share

For each target store with a latest store report:

```text
trigger: storeReport.marketPosition < 60 && storeReport.stockHealth >= 40
proposal: pricing one step toward discount
```

Order:

```text
premium -> standard -> competitive -> discount
```

Required authority: pricing.

### Stabilize Cash

Requires a latest company report with:

```text
operatingCashFlow < 0
```

For each target store, use its latest store report and choose the product with fewest `unitsSold`, then `productId` ascending.

Propose:

```text
nextTarget = max(1, floor(targetStock * 0.90))
nextThreshold = min(nextTarget, max(0, floor(reorderThreshold * 0.90)))
```

Apply only through `updateStoreProduct`.

Required authority: inventory.

### Prefer Local Supply

City-scope only.

Reuse the exact compatibility already used by replenishment:

```text
StoreProduct.productId
-> getProductDefinition(productId).productionMaterialId
-> candidate city inventory material quantity
```

For products currently sold in the target retail city, sum compatible finished-material inventory in each opened/materialized inventory-supporting candidate city.

Choose:

```text
highest compatible units -> WorldCityId ascending tie-break
```

Rules:

- no positive compatible stock => no proposal;
- current source already equals the best source => no proposal;
- apply only with `setRetailSupplySource`;
- `ok: false` => rejected / transition-rejected;
- `changed: false` is treated as no-op rather than a fake applied record.

Required authority: supply.

## Proposal, authority, conflict, and apply phases

Manager evaluation is explicitly two-phase:

1. build all triggered proposals from the immutable post-arrival snapshot;
2. classify authority/conflicts, then apply winners to a working game state.

Canonical conflict keys:

```text
pricing:<storeId>
inventory:<storeId>:<productId>
staffing:<storeId>
supply:<retailCityId>
```

Classification order:

1. triggered proposal with required authority disabled -> `out-of-authority`;
2. among authorized proposals sharing a key, store scope beats city scope;
3. equal specificity uses `managerId` ascending;
4. losing authorized proposal -> `overridden`;
5. winner applies through the existing domain transition; unchanged/invalid winner follows the per-action rules above.

## Audit history

Use discriminated changes, not generic JSON:

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

export type ManagerActionReason =
  | 'margin-below-threshold'
  | 'availability-pressure'
  | 'staff-capacity-pressure'
  | 'market-position-low'
  | 'negative-operating-cash-flow'
  | 'better-local-supply'
  | 'conflict-lost'
  | 'authority-disabled'
  | 'transition-rejected';

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

`applied` changes keep their trigger reason. Non-applied classification replaces it with `conflict-lost`, `authority-disabled`, or `transition-rejected` as appropriate.

IDs are deterministic from day + manager ID + conflict key. One manager cannot emit two proposals for the same key on one day.

Keep the newest 100 records:

```ts
MANAGER_ACTION_HISTORY_LIMIT = 100
```

Extend the existing `eventHistory.ts` bounded-slice pattern so manager history does not introduce another ad-hoc history pipeline. Existing event history remains capped at 200.

## Manual control

Existing manual policy/product/supply controls remain available while delegation is enabled.

Manual intervention is explicit:

- disable/remove the delegation, or
- revoke the relevant authority, then edit manually.

Do not add temporary holds, edit ownership, or inferred intent.

## Exception alerts

Extend the current alert system:

```ts
GameAlertKind += 'manager-exception'
GameAlert.managerId?: string
GameAlert.managementPanelId?: 'finance' | 'decisions' | 'staff'
```

For the newest manager-action day, emit at most one alert per manager that has any non-applied action.

- applied-only activity => no exception alert;
- overridden/rejected/out-of-authority => manager exception;
- alert navigates to the existing Staff panel;
- no second notification store.

Update `gameCopy.ts`, localization bundles, `alertNavigation.ts`, and their focused specs. `LocalizedGameAlert` continues to structurally extend `GameAlert`; do not duplicate manager IDs in a separate localized model.

## UI

### Policies surface

Extend `PolicyPanel.svelte`:

- Company / City / Store scope selector;
- target selector for city/store modes;
- each city/store target is resolved with the same `resolveEffectivePolicy(game, scope)` domain function;
- effective value + provenance for every policy field;
- `Inherit from parent` clears only that explicit field;
- `Reset scope to parent` removes the complete override record;
- parent value displayed beside effective value;
- explicit-equal-parent values remain visibly explicit;
- inherited/explicit state is not color-only.

Company mode keeps current `updatePolicy` behavior.

### Staff surface

Keep `StaffPanel.svelte` responsible for hiring, physical assignment, coverage, and promotion.

Add sibling `ManagerDelegationPanel.svelte` in a `staff-surfaces` wrapper inside the existing Staff branch of `ManagementPanelHost.svelte`, mirroring the current multi-surface composition style used by Stores.

It shows:

- qualified manager identity + physical assignment context;
- enabled state;
- delegation scope/target;
- playbook;
- pricing/inventory/staffing/supply authority toggles;
- recent manager action history and localized outcome/reason/change.

No new `ManagementPanelId`.

## Controller boundary

Keep existing company `updatePolicy` and its scenario command unchanged.

Add sandbox-only controller mutations:

```ts
setScopedPolicyOverride(scope, patch)
clearScopedPolicyOverrideField(scope, field)
resetScopedPolicyOverride(scope)
setManagerDelegation(input)
removeManagerDelegation(managerId)
```

`MutationAvailability` gets separate scoped-policy and manager-delegation flags. They are false in scenario mode.

All successful sandbox mutations continue through `commitMutation`/autosave.

## GameState construction blast radius

The three arrays are required `GameState` fields from the first type checkpoint:

```ts
policyOverrides: []
managerDelegations: []
managerActionHistory: []
```

Update every direct `GameState` construction/factory/fixture in that same checkpoint, including:

- `createNewGame`;
- route `starterMapState`;
- focused game-core test fixtures such as alerts;
- scenario/persistence/test helpers that construct a complete `GameState` literal.

Do not defer these fixes to later tasks. `bun run check` must pass immediately after the type checkpoint.

## Persistence

Final write schema:

```ts
SAVE_SCHEMA_VERSION = 18
```

Schema 17 is rejected; no migration or aliases.

Validate:

- required presence of all three new arrays;
- override scope IDs, unique scopes, known policy values, non-empty partial values, canonical ordering;
- delegation manager role, unique manager ID, scope target, playbook/scope constraint, booleans, authority shape, canonical ordering;
- action history length <= 100;
- known outcomes/reasons/change discriminants;
- finite/safe inventory target values;
- referenced manager/store/city/product IDs;
- action IDs unique and deterministic-format-compatible.

Scenario persistence naturally carries the same `GameState` through the existing codec; scenario content cannot mutate scoped overrides/delegations because no scenario commands are added.

## Verification risks

1. **Empty report timing:** day 1 has no completed report; report-backed playbooks must no-op and E2E must use two advances or injected evidence.
2. **Demand spillover:** a local policy must not increase a sibling seller's demand quota; test mixed policies and uniform parity.
3. **Inventory target compatibility:** +/-10% proposals may be rejected by `updateStoreProduct`; record rejection rather than bypassing the transition.
4. **GameState literal blast radius:** all direct constructors must gain the required arrays before the first `bun run check`.
5. **E2E threshold timing:** deterministic fixtures must cross playbook thresholds on a known report day; never loop "until trigger".
6. **City-scope fragmentation:** store-oriented city delegation intentionally creates per-store overrides; UI/provenance tests must treat that as correct.
7. **RNG behavior:** manager evaluation itself adds no RNG. Do not require enabled-delegation runs to retain the same RNG/output as a different policy/target state; require the empty-delegation path to preserve existing daily behavior.

## Definition of done

- company -> city -> store inheritance resolves deterministically with provenance;
- the same scope-based resolver serves city/store UI and store simulation;
- clearing/resetting overrides restores parent values immediately;
- live sales apply policy per seller with no policy-demand spillover;
- planner potential demand uses the same per-seller policy shares and stays trend-free;
- manager actions run after arrivals, use latest completed reports, and no-op without evidence;
- city delegation expands store-oriented playbooks into store writes;
- five playbooks remain bounded, deterministic, and authority-limited;
- inventory edits reuse `updateStoreProduct`; supply edits reuse `setRetailSupplySource`;
- conflict resolution and 100-row audit history are deterministic;
- player manual controls remain available;
- exception alerts localize and navigate to Staff;
- Policies + Staff surfaces expose inheritance/delegation without a new management panel;
- schema 18 validates and schema 17 is rejected;
- empty-delegation simulation parity, focused unit/component tests, and deterministic two-advance E2E pass.