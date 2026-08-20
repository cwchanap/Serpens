# Regional Manager Playbooks and Policy Inheritance Design

**Date:** 2026-08-18
**Linear:** HPA-41 — Regional manager playbooks and policy inheritance
**Status:** Normative; revised after two codebase-review passes

## Outcome

Add a small delegation layer on top of the existing retail simulation:

1. `GameState.policy` remains the company default;
2. retail cities and stores may carry sparse policy overrides with explicit provenance;
3. live simulation and the Supply Planner consume the same effective per-store policy rules;
4. manager-role staff may run one deterministic playbook over a store or retail-city authority range;
5. manager proposals are bounded, conflict-resolved deterministically, and persisted as auditable history;
6. existing Policies, Staff, alert, persistence, and route-controller surfaces expose the feature.

This stays one HPA-41 implementation PR. The implementation plan uses reviewable checkpoints, including a full unit gate after the demand rewrite and again after manager integration. Do not add a generic hierarchy engine, rules DSL, plugin/AI layer, autonomous construction, autonomous hiring/firing, or a new management dashboard.

## Second review resolution

Accepted:

- classify manager inventory writes from the **post-transition stored values**, not `GameState` reference identity;
- treat removal of the shared `remainingDemand` allocation cap as an explicit balance/competition change instead of claiming unchanged live aggregate sales;
- run the full unit suite immediately after the demand rewrite and after manager integration;
- normalize persisted collection ordering on decode rather than rejecting harmless ordering differences;
- keep history validation independent of today's mutable store/product population;
- centralize policy option ordering and reuse it from UI, validation, and playbook stepping;
- type alert panel destinations with the existing `ManagementPanelId` union;
- structurally share the seller policy-demand term between live sales and planner projection;
- pass a pre-resolved per-store policy map so policy resolution happens once per store per calculation pass;
- make bounded-history append accept multiple rows at once;
- define `PolicyValueSource` from `PolicyOverrideScope` instead of restating the child arms;
- share one seller-eligibility predicate between live sales and planner demand and pin it with a regression.

Not adopted:

- **Remove `ManagerAuthority`:** HPA-41 explicitly requires configured authority, out-of-authority audit outcomes, authority UI, and tests covering authority. Keep the small four-domain authority record. The UI only exposes domains relevant to the selected playbook so irrelevant combinations do not become product surface.
- **Split HPA-41 into two PRs:** the project rule is one PR per ticket/task unless explicitly approved otherwise. There is no technical blocker requiring a split; full-unit gates after checkpoints 2 and 3 isolate the demand and manager risks while retaining one HPA-41 PR.

Earlier review decisions remain:

- company policy stays the root and sparse overrides are the only persisted inheritance state;
- physical staff assignment stays separate from delegation scope;
- five hard-coded playbooks and closed unions only;
- completed reports are playbook evidence; missing report means no proposal;
- managers run after transfer arrivals and before production/sales/replenishment;
- Prefer Local Supply reuses `productionMaterialId`, city inventory, and `setRetailSupplySource`;
- all complete `GameState` constructors gain the three new arrays in the first type checkpoint;
- city delegation is an authority range, not a city-policy write target for store-oriented playbooks;
- manager history reuses the existing bounded-history module;
- manager exceptions reuse existing alerts and navigate to Staff;
- schema 18 rejects 17 with no migration.

## Existing seams

HPA-41 extends current code rather than replacing it:

- `src/lib/game/state.ts`: `DEFAULT_POLICY` and company-level `updatePolicy`;
- `src/lib/game/simulateDay.ts`: policy consumption and daily phase order;
- `src/lib/game/stock.ts`: city demand, seller scoring, policy-demand multipliers, sales, and `updateStoreProduct`;
- `src/lib/game/retailSupply.ts`: retail supply assignment and product-to-material compatibility;
- `src/lib/game/staffing.ts`: manager-role staff;
- `src/lib/game/eventHistory.ts`: bounded append convention;
- `src/lib/game/keyboardShortcuts.ts`: authoritative `ManagementPanelId`;
- `PolicyPanel.svelte` and Staff control-tower surface: player-facing homes;
- `GameRouteController`: mutation/autosave boundary.

Phaser and map snapshots are untouched.

## Scope decisions

- `GameState.policy` stays named and authoritative as the company root.
- Inheritance applies only to retail-city/store operations.
- `StaffMember.assignedStoreId` remains physical staffing coverage only.
- Every existing `role === 'manager'` staff member is delegation-qualified; no skill/level gate.
- One manager has at most one delegation record.
- Scoped policy edits and manager delegation configuration are sandbox-only.
- Existing scenario `updatePolicy` remains company-level; no new scenario commands.
- Manager evaluation consumes no RNG and does not move existing RNG call sites.
- With no enabled delegations, the manager phase is a strict no-op.
- Pre-release saves are unsupported: schema 18 is current and schema 17 is rejected without migration.

## Policy domain and inheritance

### Shared ordered policy values

HPA-41 adds the third behavior consumer of policy ordering, so stop hand-maintaining the same lists in UI and validators.

`policyInheritance.ts` exports:

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

export function stepPolicyValue<K extends keyof CompanyPolicy>(
  field: K,
  current: CompanyPolicy[K],
  direction: -1 | 1
): CompanyPolicy[K];
```

Consumers:

- `PolicyPanel.svelte` renders options from `POLICY_FIELD_OPTIONS`;
- `saveCodec.ts` derives policy membership checks from it;
- `scenarios/validation/shared.ts` derives `POLICY_VALUES` from it;
- manager pricing/staffing playbooks use `stepPolicyValue`.

Do not add a second playbook-specific pricing/staffing ladder.

### Sparse override state

```ts
export type PolicyOverrideScope =
  | { kind: 'city'; cityId: WorldCityId }
  | { kind: 'store'; storeId: string };

export interface PolicyOverride {
  scope: PolicyOverrideScope;
  values: Partial<CompanyPolicy>;
}

export type PolicyValueSource = { kind: 'company' } | PolicyOverrideScope;

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

Concrete resolver:

```ts
export function resolveEffectivePolicy(
  game: GameState,
  scope: PolicyOverrideScope
): EffectivePolicy;
```

Resolution:

```text
city scope  = company -> city
store scope = company -> store.city -> store
```

Rules:

- city scopes reference opened/materialized retail cities;
- store scopes reference existing stores whose city resolves to an opened retail city;
- one record per concrete scope;
- records contain only explicit fields;
- explicit value equal to parent stays explicit;
- clearing the last explicit field removes the scope record;
- reset removes the whole scope record;
- mutators keep `policyOverrides` in canonical scope/id order;
- resolver/provenance are derived, never persisted.

Invalid mutation scopes return the original game. Invalid resolver scope in validated current state is an invariant error rather than a fallback to company policy.

## Daily simulation policy consumption

### Resolve once per store

A calculation pass builds one policy map:

```ts
export type EffectivePolicyByStoreId = ReadonlyMap<string, CompanyPolicy>;

const effectivePolicyByStoreId = new Map(
  game.stores.map((store) => [
    store.id,
    resolveEffectivePolicy(game, { kind: 'store', storeId: store.id }).values
  ])
);
```

`simulateDay` reuses this map for:

- `buildStoreOperationProfile`;
- temporary policy pricing;
- live seller demand.

Supply Planner builds one equivalent map for the snapshot and passes it through demand contributors. No per-product re-resolution.

### Raw city demand is policy-free and trend-free

Change:

```ts
buildCityDemandPools(
  game: Pick<GameState, 'stores' | 'world'>,
  city: City
): RetailDemandProfile;
```

Raw pool:

```text
city demand
* product.demandWeight
* retail-city product multiplier
```

Remove the policy argument/default entirely.

### Shared seller policy-demand term

`stock.ts` owns:

```ts
export function getPolicyDemandMultiplier(
  policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>
): number;

export function sellerPolicyDemand(
  rawPool: number,
  share: number,
  policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>
): number {
  return rawPool * share * getPolicyDemandMultiplier(policy);
}
```

`getPolicyDemandMultiplier` composes the existing private marketing/pricing multiplier values. Do not use `simulateDay.ts`'s different `PRICING.demand` numbers.

One private `getEligibleProductSellers(...)` predicate owns live/planner seller eligibility, including both:

- product exists in `store.products`;
- product is supported by the archetype's `startingProductIds`.

### Live sales: intentional removal of residual city competition

For each product:

```text
trendPool = rawCityPool * trendMultiplier(product, day)
share = scoreStoreForCategory(store, product) / totalSellerScore
policyDemand = sellerPolicyDemand(trendPool, share, effectivePolicy)

desiredUnits = policyDemand
  * obsolescenceMultiplier
  * configuredPriceDemandMultiplier
  * existing jitter
```

Allocation becomes:

```text
sellableDemand = min(desiredUnits, storeSalesCapacity)
unitsSold = min(sellableDemand, availableStock)
```

The old shared `remainingDemand` cap no longer constrains a later seller.

This is a **declared balance change**, not a behavior-preserving refactor. Today, jitter can push one seller above its city-pool share and the shared residual cap clips later allocation. Once policy is per-store, that shared residual creates cross-store spillover, so HPA-41 removes it deliberately.

Required live properties:

1. changing store A policy cannot change store B's `desiredUnits` or allocation ceiling;
2. seller behavior is deterministic and independent of input store-array order because eligibility/scoring/RNG consumption use canonical seller order;
3. total units sold for a product are bounded by the sum of seller `desiredUnits`, individual capacity, and stock—not by the raw/trend city pool;
4. a fixed before/after fixture documents the intended numeric difference from the old residual-cap behavior.

If `ProductSalesResult.remainingDemand` remains, it is diagnostic only:

```text
max(0, raw/trend city pool - total units sold)
```

It must never feed allocation.

No RNG call is added or moved; only the shared cap is removed.

### Supply Planner demand

Planner potential demand remains trend-free and does **not** copy live jitter/obsolescence/configured-price dynamics.

`stock.ts` exports:

```ts
export function getPolicyAdjustedCityProductDemand(
  game: GameState,
  city: City,
  productId: ProductId,
  effectivePolicyByStoreId: EffectivePolicyByStoreId
): number;
```

It uses the shared seller eligibility, seller score/share, and `sellerPolicyDemand` term.

```text
potentialDemandPerDay = sum(
  sellerPolicyDemand(rawCityProductPool, sellerShare, effectivePolicy)
)
```

Then Supply Planner retains its current target-stock/replenishment ceiling.

Planner properties:

- uniform company policy preserves the current planner potential-demand number;
- one override changes only that seller's weighted contribution;
- no trend leakage;
- live/planner seller eligibility is structural, not two copied predicates.

The planner does not forecast future manager actions.

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

- manager ID references existing `role === 'manager'` staff;
- store scope references an existing store;
- city scope references an opened/materialized retail city;
- `prefer-local-supply` requires city scope;
- physical `assignedStoreId` is unaffected;
- disabling/removing a delegation does not roll back prior applied settings.

### Authority is retained but kept narrow

HPA-41 explicitly requires configured authority and `out-of-authority` audit behavior. Keep four closed domains, but do not surface meaningless combinations:

- Protect Margin: pricing;
- Protect Availability: inventory and staffing;
- Grow Market Share: pricing;
- Stabilize Cash: inventory;
- Prefer Local Supply: supply.

`ManagerDelegationPanel` shows only authority toggles relevant to the selected playbook. Non-relevant booleans remain ignored by evaluator behavior; they do not create additional playbook semantics.

Fixed bounds still constrain what an authorized action can do:

- pricing: one policy posture step per store/day;
- inventory: one product target/reorder proposal per store/day through `updateStoreProduct`;
- staffing: one staffing-posture step per store/day; never hires/fires/reassigns;
- supply: one source switch through `setRetailSupplySource`; never opens/builds/routes.

## Manager phase order and report evidence

Daily order:

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

Report-backed playbooks consume the latest already-completed `DailyReport`:

- per-store triggers use its matching `DailyStoreReport`;
- Stabilize Cash uses company `operatingCashFlow`;
- Grow Market Share uses store-report `marketPosition`.

No report => no proposal and no history row. A normal founding E2E therefore advances twice: first advance creates evidence; second can consume it.

## City scope is an authority range

Store-oriented city delegations expand into store-specific proposals. They never stamp a city-wide policy override.

- pricing/staffing winner -> store policy override;
- inventory winner -> that store/product;
- Prefer Local Supply -> city-level retail supply assignment.

Per-store overrides created by city delegation are expected inheritance state.

## Playbooks

All proposals are built from the immutable post-arrival snapshot before any manager mutation is applied.

### Protect Margin

For each target store with latest report:

```text
marginRate = grossMargin / revenue
trigger: revenue > 0 && marginRate < 0.30
proposal: pricing step toward premium
required authority: pricing
```

If already at `premium`, no actionable proposal is emitted.

### Protect Availability

For each target store with latest report:

1. choose product by highest `stockoutLostDemand`, then `demandMissed`, then `productId` ascending;
2. when pressure is positive, propose +10% reorder/target with upward rounding and minimum one-unit movement; authority = inventory;
3. otherwise `nearStaffCapacity` proposes staffing step toward `service`; authority = staffing.

If the computed proposed values equal current values, emit no proposal.

### Grow Market Share

```text
trigger: storeReport.marketPosition < 60 && storeReport.stockHealth >= 40
proposal: pricing step toward discount
authority: pricing
```

If already at `discount`, no proposal.

### Stabilize Cash

Requires latest company report `operatingCashFlow < 0`.

For each target store choose lowest `unitsSold`, then `productId` ascending:

```text
nextTarget = max(1, floor(targetStock * 0.90))
nextThreshold = min(nextTarget, max(0, floor(reorderThreshold * 0.90)))
```

Authority = inventory. If both values equal current values, emit no proposal; this prevents repeated no-op history at the floor.

### Prefer Local Supply

City scope only. Reuse exact replenishment compatibility:

```text
StoreProduct.productId
-> getProductDefinition(productId).productionMaterialId
-> candidate city material quantity
```

Choose opened/materialized inventory-supporting city by highest compatible positive units, then `compareWorldCityIds`.

- no positive compatible stock => no proposal;
- current source already best => no proposal;
- apply through `setRetailSupplySource` only;
- `ok: false` => rejected;
- `changed: false` => no applied record.

Authority = supply.

## Proposal, authority, conflict, and apply phases

Conflict keys:

```text
pricing:<storeId>
inventory:<storeId>:<productId>
staffing:<storeId>
supply:<retailCityId>
```

Classification:

1. required authority false -> `out-of-authority`;
2. among authorized same-key proposals, store scope beats city scope;
3. equal specificity uses `managerId` ascending;
4. loser -> `overridden` / `conflict-lost`;
5. winner applies through existing transition.

### Truthful inventory application

Never use `next === workingGame` as success/rejection classification. `updateStoreProduct` can return a new game after coercing/falling back values.

For an inventory winner:

```ts
const before = findProduct(workingGame, storeId, productId);
const next = updateStoreProduct(workingGame, storeId, productId, proposed);
const stored = findProduct(next, storeId, productId);
const actual = {
  reorderThreshold: stored.reorderThreshold,
  targetStock: stored.targetStock
};
```

Then:

- actual equals `before` => transition produced no actionable change: record `rejected` / `transition-rejected`, `change.applied = null`;
- actual differs from `before` => record `applied`, and `change.applied` is the **actual stored value**, even when it differs from `proposed` because the transition normalized it.

This keeps audit evidence truthful. Proposal generation already suppresses obvious computed no-ops; rejection remains for transition-level fallback/invalid cases.

Supply application uses the transition's existing `{ ok, changed, game }` result; `changed: false` never becomes a fake applied record.

## Audit history

```ts
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
```

Keep the existing discriminated `ManagerActionChange` arms for pricing policy, inventory targets, staffing policy, and supply source. `applied` holds actual stored state for successful actions and is null for non-applied outcomes.

Manager records keep deterministic IDs from day + manager + conflict key, but persistence validates only uniqueness—not a string-format pattern.

History cap:

```ts
export function appendBoundedHistory<T>(
  history: readonly T[],
  entries: readonly T[],
  limit: number
): T[] {
  return [...history, ...entries].slice(-limit);
}

export function appendHistory<T>(history: readonly T[], entry: T): T[] {
  return appendBoundedHistory(history, [entry], EVENT_HISTORY_LIMIT);
}
```

Manager phase appends all rows once per day with limit 100 instead of repeatedly slicing for each record. Existing event history stays 200.

## Manual control and exception alerts

Existing manual controls remain available.

Manual intervention:

- disable/remove delegation; or
- revoke a relevant authority domain, then edit manually.

Future triggered actions in the revoked domain are `out-of-authority`.

`GameAlert` adds `manager-exception` + optional `managerId`, but panel typing reuses the existing union:

```ts
import type { ManagementPanelId } from './keyboardShortcuts';

interface GameAlert {
  // ...
  managementPanelId?: ManagementPanelId;
}
```

`AlertPanelNavigation.panelId` also uses `ManagementPanelId` rather than a second hand-maintained subset.

For the newest manager-action day, emit at most one exception per manager with any `overridden`, `rejected`, or `out-of-authority` row. Applied-only activity has no alert. Navigation targets Staff.

## UI

### Policies

Extend `PolicyPanel.svelte` with Company/City/Store scope, target selection, effective value, parent value, provenance, inherit-one-field, and reset-scope actions.

Render policy option values from `POLICY_FIELD_OPTIONS`; do not keep a component-local option table. Explicit-equal-parent remains visibly explicit, and inheritance status is not color-only.

### Staff

Keep `StaffPanel.svelte` focused on hiring/physical assignment/coverage/promotion. Add sibling `ManagerDelegationPanel.svelte` in the existing Staff branch.

Show:

- manager + physical assignment context;
- enabled state;
- scope/target;
- playbook;
- only authority controls relevant to that playbook;
- recent localized action history.

No new `ManagementPanelId` or launcher.

## Controller boundary

Keep company `updatePolicy` and its scenario command unchanged.

Add sandbox-only controller mutations for scoped policy set/clear/reset and manager delegation set/remove. `MutationAvailability` gets two sandbox-only flags. Successful mutations still use `commitMutation`/autosave.

## GameState construction blast radius

The three fields are required from checkpoint 1:

```ts
policyOverrides: []
managerDelegations: []
managerActionHistory: []
```

Update every complete `GameState` constructor/literal in that checkpoint, including `createNewGame`, route `starterMapState`, and standalone core/scenario/persistence test fixtures. `bun run check` must pass before moving on.

## Persistence

Schema:

```ts
SAVE_SCHEMA_VERSION = 18
```

Schema 17 is rejected; no migration.

Validate live config strictly:

- all three arrays required;
- policy override values non-empty and closed-union valid;
- unique concrete override scopes;
- live override scope references current store/city;
- manager delegation manager is a current manager-role staff member;
- unique manager delegation;
- live delegation scope is current/valid;
- playbook/scope constraints, booleans, and authority shape.

Validate history as historical evidence, not live configuration:

- length <= 100;
- unique action IDs;
- closed outcome/reason/change unions;
- safe/finite numeric fields;
- internally valid change shape.

Do **not** require historical manager/store/product references to still exist in current mutable entity lists, and do not validate deterministic ID string format.

Ordering is normalized on decode rather than rejected:

- `policyOverrides`: scope/id order;
- `managerDelegations`: managerId order;
- `managerActionHistory`: day then id order.

This follows current codec behavior that normalizes other persisted arrays such as city inventory and retail supply assignments.

Scenario persistence carries the same `GameState`; scenarios cannot mutate scoped policy/delegation because no new commands exist.

## Verification risks

1. **Demand-model balance change:** removing the residual city-demand cap changes live aggregate sales for fixtures where the old cap bound; pin the old/new numbers deliberately rather than asserting parity.
2. **Demand spillover:** local policy must not change sibling desired units.
3. **Empty report timing:** day 1 has no completed report; E2E uses two advances or injected evidence.
4. **Inventory transition normalization:** applied audit values must match post-transition stored values, and floor/no-op proposals must not spam history.
5. **GameState literal blast radius:** all direct constructors gain the arrays before checkpoint-1 type check.
6. **E2E threshold timing:** fixed fixtures only; never advance-until-trigger.
7. **City-scope fragmentation:** city authority intentionally produces store overrides for store-oriented playbooks.
8. **RNG behavior:** manager evaluator adds no RNG; only empty-delegation parity is required.
9. **Cross-module policy option drift:** UI, save validation, scenario validation, and playbook stepping all consume `POLICY_FIELD_OPTIONS`.

## Definition of done

- deterministic company -> city -> store inheritance with provenance;
- shared `POLICY_FIELD_OPTIONS` removes duplicate policy ordering tables;
- one scope resolver serves UI and store simulation;
- raw city demand is policy-free/trend-free;
- live sales use per-seller policy demand with no shared residual cap, with the balance change explicitly regression-pinned;
- planner and live share seller eligibility, policy resolution inputs, and `sellerPolicyDemand` arithmetic;
- planner uniform-policy potential demand remains baseline-compatible and trend-free;
- manager actions run after arrivals and no-op without completed report evidence;
- five playbooks remain closed/bounded with configured authority;
- city scope expands store-oriented actions into store writes;
- inventory applied audit values equal actual stored values;
- conflicts and newest-100 history are deterministic;
- persistence normalizes ordering and does not couple historical rows to current mutable entities;
- manager exceptions use `ManagementPanelId` and navigate to Staff;
- Policies + Staff expose the feature without a new management panel;
- schema 18 rejects 17;
- full unit suite passes after demand checkpoint and manager checkpoint, then final full static/unit/E2E/build gates pass.