# Event-Driven Logistics Disruptions and Recovery Design

**Date:** 2026-08-15

**Linear:** HPA-296 — Integrate event-driven logistics disruptions and recovery

**Status:** Revised after two codebase review passes; normative design for implementation

## Outcome

Extend the existing event/modifier framework and recurring-route domain so strategic events can target one concrete recurring logistics route and temporarily change only future scheduled dispatches.

The first slice stays deliberately small:

- one new event target family: active recurring routes;
- four route modifier effects: lead-time adjustment, capacity multiplier, dispatch suspension, and transport-cost multiplier;
- one authoritative editable `RecurringRoute`;
- one pure effective-route resolver;
- one shared pure dispatch-attempt builder used by live logistics and the Supply Planner;
- compact historical disruption evidence that still satisfies HPA-296 attribution requirements;
- one production `freight-disruption` event;
- strict save schema 16 with no schema-15 migration;
- no copied effective-route state, pre-disruption snapshot, reliability RNG, shipment failure, rerouting, in-transit mutation, generic target DSL, modifier registry, or second incident scheduler.

## Why HPA-296 is actionable

The dependency seams are already shipped:

- HPA-278 owns event selection, materialized decisions, isolated event RNG, timed modifiers, lifecycle history, alerts, reports, and expiry;
- HPA-294 owns authoritative transfer orders, recurring routes, dispatch cadence, accounting, and logistics evidence;
- HPA-574 owns route management, inspector, reports, alerts, navigation, and world-map route presentation;
- HPA-297 owns the dated 7/30-day route projection used by the Supply Planner.

HPA-296 extends those seams instead of introducing parallel infrastructure.

## Reuse survey

| Need | Decision |
| --- | --- |
| Route event target | Extend `EventTarget` / `EventTargetSelector` in `types.ts`. |
| Target clone/equality/selection eligibility | Extract company-only logic from `eventSelection.ts` into focused `eventTargets.ts`. |
| Route timed effects | Extend the closed `EventTimedEffect` union. |
| Target-scoped replacement | Extend `eventModifiers.ts`; replacement remains `replace`, now keyed by stacking key + concrete target. |
| Effective route values | Add one focused `logisticsRouteModifiers.ts`; do not route logistics through `SimulationRules`. |
| Dispatch derivation | Extend `interCityLogistics.ts` with one pure `buildRouteDispatchAttempt`; both live and planner loops reuse it. |
| Transport-cost arithmetic | Extend the existing checked arithmetic in `interCityLogistics.ts`; no generic arithmetic helper. |
| Live suspension condition | Extend `RouteOperationalCondition` with `route-event-suspended`. |
| Historical attribution | Persist a compact discriminated `modifierImpacts` array on affected attempts; do not depend on live modifiers after expiry. |
| Attempt fixtures | Extend `logisticsReport.testUtils.ts` with one shared attempt factory before widening the type. |
| Disruption alert | Reuse the existing `event-modifier` alert kind; route-targeted important modifiers navigate to the world route. |
| Recovery | Extend `DailyLogisticsReport` with a discriminated per-effect recovery union. |
| Planner | Copy only route-targeted modifiers into the planner snapshot and reuse resolver + attempt builder by projected day. |
| Persistence | Strict schema 16, introduced when the first persisted attempt shape changes; no migration. |

## Design approaches

### Approach A — focused event extension + one route resolver + one attempt builder

Add the minimum route target/effect contracts to the existing event framework. Derive current effective route behavior from the base route plus active modifiers, and centralize the new dispatch math/evidence in a pure builder shared by the two existing dispatch loops.

This is the selected approach. It does **not** attempt to merge the live and planner inventory/order loops; it only prevents new HPA-296 rules from being implemented twice.

### Approach B — persist effective fields on `RecurringRoute`

Rejected. Route edits during a disruption would require synchronized base/effective copies and stale restoration logic.

### Approach C — separate logistics incident scheduler

Rejected. HPA-278 already owns the RNG, materialization, duration, replacement, reporting, and alert machinery this feature needs.

## Event targets

Extend only the target variants used by production content:

```ts
export type EventTarget =
  | { kind: 'company' }
  | { kind: 'recurring-route'; routeId: string };

export type EventTargetSelector =
  | { kind: 'company' }
  | { kind: 'recurring-route'; state: 'active' };
```

Create `src/lib/game/eventTargets.ts` with explicit switches:

```ts
export function resolveEventTargets(
  game: GameState,
  selector: EventTargetSelector
): EventTarget[];

export function isEventTargetEligibleForSelection(
  game: GameState,
  target: EventTarget
): boolean;

export function isEventTargetResolvable(
  game: GameState,
  target: EventTarget
): boolean;

export function sameEventTarget(left: EventTarget, right: EventTarget): boolean;
export function cloneEventTarget(target: EventTarget): EventTarget;
```

### Selection eligibility

A recurring-route target is selectable only when:

- the route exists;
- its base route state is `active`;
- both endpoints are opened world cities.

Eligible routes are sorted by raw route ID. Priority, insertion order, material, and next-dispatch day do not affect target ordering.

### Resolution eligibility

Resolution is intentionally less strict than selection.

A materialized recurring-route decision remains resolvable as long as the route still exists. Pausing the route after the event appears does **not** invalidate the decision. A paused route is not due, so an activated modifier is inert until the player resumes it; it may also expire harmlessly while paused.

A removed/missing route is rejected atomically with the existing `effect-rejected` / `payload: 'target'` path. No immediate effect or modifier is committed.

This avoids dead-ending the natural player response of pausing a disrupted route while preserving deterministic target identity.

## Definition selection and materialization RNG

Keep the current three top-level event RNG draws:

1. cadence;
2. weighted event selection;
3. materialization seed.

For each definition, derive eligible concrete targets after pending-instance and cooldown exclusion. The event definition contributes **one** selection candidate when at least one concrete target is eligible; route count never multiplies its weight.

After the definition wins:

- company selectors materialize the company target directly;
- recurring-route selectors spend one draw from the already-created `materializationRng` over sorted eligible route IDs.

Do not bump `EVENT_SELECTION_SCHEMA_VERSION`; top-level RNG advancement is unchanged.

## Persisted route copy context

The unresolved decision must name its route even if the route is later removed.

At materialization, merge stable IDs into `decision.copy.params`:

```ts
{
  routeId,
  originCityId,
  destinationCityId,
  materialId
}
```

`gameCopy.ts` derives localized city/material names from these persisted IDs and passes the same enriched params through event title, context, and option localization.

Do not persist localized strings. `DecisionQueue.svelte` remains a renderer of `LocalizedDecision`; its focused test proves that the route appears before resolution.

## Timed route effects

Extend the closed union with exactly four route effects:

```ts
export type EventTimedEffect =
  | {
      kind: 'import-cost-multiplier';
      scope: 'retail-product';
      target: { kind: 'all' };
      multiplier: number;
    }
  | { kind: 'route-lead-time-adjustment'; days: number }
  | { kind: 'route-capacity-multiplier'; multiplier: number }
  | { kind: 'route-dispatch-suspension' }
  | { kind: 'route-transport-cost-multiplier'; multiplier: number };
```

Validation remains explicit:

- lead-time adjustment is a positive safe integer;
- capacity and cost multipliers are finite and greater than zero;
- suspension has no payload;
- company definitions may use the existing import-cost effect;
- recurring-route definitions may use only route effect kinds;
- stacking remains `replace` only.

All clone sites switch on effect kind. In particular, `eventSelection.ts#materializeEvent` and `eventModifiers.ts` must stop assuming every timed effect owns an `effect.target` field.

## Target-scoped modifier replacement

Current replacement is keyed only by `stackingKey`. Route targets require:

```text
same stackingKey AND same concrete EventTarget
```

The same disruption type may coexist on different routes. Replacing a modifier on one route cannot remove the same stacking key from another route.

Company supplier-discount behavior remains unchanged.

## Pure effective-route resolver

Create `src/lib/game/logisticsRouteModifiers.ts` as the only owner of modifier filtering and effective route values:

```ts
export interface EffectiveRecurringRoute {
  base: RecurringRoute;
  capacity: number;
  leadTimeDays: number;
  transportCostMultiplier: number;
  transportCostPerUnit: number;
  dispatchSuspended: boolean;
  contributions: RouteModifierContribution[];
}

export function resolveEffectiveRecurringRoute(
  route: RecurringRoute,
  modifiers: readonly ActiveEventModifier[],
  day: number
): EffectiveRecurringRoute;
```

Matching active route modifiers are sorted by modifier ID before reduction.

Effective values are:

```text
leadTimeDays = base lead time + sum(active lead adjustments)
capacity = max(1, floor(base capacity × product(active capacity multipliers)))
dispatchSuspended = any(active suspension)
transportCostMultiplier = product(active cost multipliers)
transportCostPerUnit = base cost per unit × transportCostMultiplier
```

`RouteModifierContribution` is discriminated by effect kind and contains modifier/source attribution plus the authored value relevant to that effect. It is an in-memory resolver result, not the persisted daily-report shape.

The resolver never mutates the route.

## Shared transport-cost arithmetic

Keep total cost calculation in `interCityLogistics.ts`, next to the existing checked integer arithmetic:

```ts
export function calculateEffectiveRouteTransportCost(input: {
  baseTransportCostPerUnit: number;
  quantity: number;
  transportCostMultiplier: number;
}): number;
```

Rules:

1. calculate the integer base total with the existing checked multiplication;
2. multiply the base total by the combined event multiplier;
3. round once with `Math.round`;
4. reject non-finite, negative, or non-safe-integer results with the existing logistics `RangeError` style.

Do not add `checkedRoundedProduct`. The Supply Planner imports the same route-specific function.

## One shared dispatch-attempt builder

The live and planner dispatch loops already duplicate inventory/order plumbing. HPA-296 does not refactor those loops wholesale, but new disruption derivation must be born once.

Add to `interCityLogistics.ts`:

```ts
export function buildRouteDispatchAttempt(input: {
  route: RecurringRoute;
  effective: EffectiveRecurringRoute;
  destinationNeed: number;
  availableOriginStock: number;
}): {
  dispatchedQuantity: number;
  attempt: Omit<DailyRouteDispatchAttempt, 'transferOrderId'>;
};
```

The builder owns:

- baseline quantity from base capacity;
- effective quantity from effective capacity;
- suspension forcing effective quantity to zero;
- effective unused capacity / unmet destination need;
- baseline/effective cost comparison;
- compact modifier-impact evidence;
- `dispatchSuspended` and `baselineCapacity`.

Each loop keeps only its own mutable inventory, transfer-order creation, sequence, and cadence plumbing. After creating an order when `dispatchedQuantity > 0`, the caller attaches `transferOrderId` to the returned attempt.

This is deliberately smaller than a generic route engine and removes the need to hand-maintain two copies of every future route-effect rule.

## Compact persisted dispatch evidence

HPA-296's Linear contract explicitly requires every affected dispatch to record the responsible event/modifier and baseline-versus-effective impact. Historical reports cannot derive that from `game.events.activeModifiers`, because the modifier disappears after expiry.

The first draft over-expanded `DailyRouteDispatchAttempt` with many always-present baseline fields. Keep the persisted surface smaller:

```ts
export interface DailyRouteDispatchAttempt {
  // existing fields remain
  baselineCapacity: number;
  dispatchSuspended: boolean;
  modifierImpacts: RouteDispatchModifierImpact[];
}
```

`capacity` keeps its existing position and now means **effective capacity**.

`RouteDispatchModifierImpact` is a discriminated union. Each row contains `contributors` with modifier ID, event/instance/option source, and structured explanation, plus only the baseline/effective values needed by that effect:

```ts
type RouteDispatchModifierImpact =
  | (RouteDispatchImpactBase & {
      effectKind: 'route-lead-time-adjustment';
      baselineLeadTimeDays: number;
      effectiveLeadTimeDays: number;
    })
  | (RouteDispatchImpactBase & {
      effectKind: 'route-capacity-multiplier';
      baselineCapacity: number;
      effectiveCapacity: number;
      baselineDispatchedQuantity: number;
      effectiveDispatchedQuantity: number;
    })
  | (RouteDispatchImpactBase & {
      effectKind: 'route-dispatch-suspension';
      baselineDispatchedQuantity: number;
      effectiveDispatchedQuantity: 0;
    })
  | (RouteDispatchImpactBase & {
      effectKind: 'route-transport-cost-multiplier';
      baselineTransportCost: number;
      effectiveTransportCost: number;
    });
```

Rules:

- unaffected attempts store `modifierImpacts: []`;
- capacity impacts can record equal baseline/effective shipped quantity when only available capacity changed;
- suspension records the blocked baseline quantity versus zero;
- lead-time impact is recorded when an order is actually dispatched;
- transport-cost impact is recorded only when a positive quantity makes the multiplier materially applicable;
- multiple modifiers of one effect kind may be represented by one impact row whose `contributors` lists every responsible modifier in deterministic modifier-ID order.

This retains historical provenance and concrete impact while avoiding nine new top-level fields on every route attempt.

Before widening the type, add a shared `createRouteDispatchAttempt(overrides)` factory to `logisticsReport.testUtils.ts`. Replace private/direct attempt literals in affected specs with that factory instead of making every future field a repository-wide fixture edit.

## Stale-attempt matching

`attemptMatchesRoute` currently compares `attempt.capacity` with current configured capacity. Once `capacity` is effective, configuration matching must use `attempt.baselineCapacity` plus origin/destination/material.

A disruption does not make an otherwise-current attempt stale; editing the base route capacity still does.

No route revision counter is introduced.

## Live route conditions

Add suspension to the shared condition union:

```ts
export type RouteOperationalCondition =
  | 'awaiting-dispatch'
  | 'destination-full'
  | 'origin-stock-constrained'
  | 'route-capacity-constrained'
  | 'route-event-suspended'
  | 'normal';
```

Classification order:

1. no attempt → `awaiting-dispatch`;
2. `dispatchSuspended` → `route-event-suspended`;
3. destination full;
4. origin stock constrained against effective capacity;
5. route capacity constrained against effective capacity;
6. normal.

`selectRouteOperations` also resolves the current route through `resolveEffectiveRecurringRoute(route, activeModifiers, game.day)` so the inspector can show current base and effective values without mutating route state.

### Utilization meaning

Keep utilization **effective-relative**:

```text
utilization = dispatchedQuantity / latestAttempt.capacity
```

A route that fully uses a temporary ×0.75 capacity therefore reads 100% utilization of currently available capacity. This is intentional. The inspector must show configured/base capacity beside current effective capacity and a disruption explanation so 100% is not misread as 100% of normal throughput.

Do not add a second utilization metric in this slice.

## Normal logistics alerts

### Origin stock

The self-clearing current-stock threshold uses the route's **current effective capacity**.

### Structural capacity pressure

The existing multi-attempt capacity alert describes persistent configured route undersizing, not temporary disruption.

An attempt satisfies that streak only when:

- `dispatchSuspended === false`;
- origin stock can satisfy `min(destinationNeed, baselineCapacity)`;
- unmet destination need is positive;
- `dispatchedQuantity === baselineCapacity`.

A ×0.75 disruption can still classify the latest attempt as effective `route-capacity-constrained` for inspection, but it cannot create or extend the structural capacity-pressure alert.

## Disruption alert: reuse `event-modifier`

Do not add a new disruption alert kind.

`collectGameAlerts` already emits `event-modifier` for important active modifiers. Extend that branch:

- company-targeted important modifiers keep `managementPanelId: 'decisions'`;
- recurring-route-targeted important modifiers whose route still exists carry `routeId` and omit the decisions-panel target;
- a route-targeted modifier whose route was removed emits no actionable alert because no navigation target remains.

`resolveAlertNavigation` routes `event-modifier + routeId` to the existing world-route navigation result.

The production event uses the existing modifier importance mechanism; no parallel suppression or disruption-alert subsystem is added.

## Route edits, pause, removal, and expiry

Route edits mutate only base `RecurringRoute`; effective state is recalculated from the edited base plus active modifiers.

Pausing a route does not cancel a materialized decision or active modifier. A paused route simply does not enter the due dispatch set.

Removing a route:

- removes it from future selection eligibility;
- makes an unresolved decision fail atomic resolution because the target no longer exists;
- leaves in-transit/historical orders unchanged;
- leaves modifier history to expire normally;
- suppresses route navigation/recovery UI when no route remains;
- creates no tombstone or recovery snapshot.

## Discriminated recovery evidence

`DailyLogisticsReport` gains:

```ts
modifierRecoveries: DailyRouteModifierRecovery[];
```

Use a fixed discriminated union:

```ts
type DailyRouteModifierRecovery =
  | (RouteRecoveryBase & {
      effectKind: 'route-lead-time-adjustment';
      disruptedLeadTimeDays: number;
      recoveredLeadTimeDays: number;
    })
  | (RouteRecoveryBase & {
      effectKind: 'route-capacity-multiplier';
      disruptedCapacity: number;
      recoveredCapacity: number;
    })
  | (RouteRecoveryBase & {
      effectKind: 'route-dispatch-suspension';
      disruptedSuspended: true;
      recoveredSuspended: false;
    })
  | (RouteRecoveryBase & {
      effectKind: 'route-transport-cost-multiplier';
      disruptedTransportCostPerUnit: number;
      recoveredTransportCostPerUnit: number;
    });
```

`RouteRecoveryBase` contains route ID, modifier ID, and source event/instance/option.

A pure helper in `logisticsRouteModifiers.ts` compares a still-existing route under pre-expiry and post-expiry modifier sets. Removed routes produce no recovery row. `simulateDay.ts` only attaches the rows.

## Supply Planner integration

`SupplyPlannerLogisticsSnapshot` copies only active route-targeted modifiers needed by the projection; it does not copy the entire event runtime or one precomputed effective route.

On every projected due route/day, `processSupplyPlannerRouteDispatches`:

1. resolves the route with `resolveEffectiveRecurringRoute`;
2. calls shared `buildRouteDispatchAttempt`;
3. applies only planner-specific inventory/order mutations;
4. attaches the projected transfer-order ID;
5. advances cadence on event suspension exactly like live dispatch.

Modifier expiry inside the 7/30-day horizon therefore follows the resolver's day predicate automatically.

`SupplyPlannerRouteCondition` continues to extend `RouteOperationalCondition`; it does not invent a planner-only suspension spelling.

## Condition exhaustiveness and copy

Widening `RouteOperationalCondition` must keep every checkpoint type-correct.

The same implementation checkpoint that adds `route-event-suspended` also updates:

- `SUPPLY_PLANNER_ROUTE_CONDITION_RANK` with the new inherited key;
- `SupplyAdvisor.svelte#routeConditionText` with its message mapping;
- the English `logisticsPanel.conditions` object so it `satisfies Record<RouteOperationalCondition, string>`;
- a typed `Record<SupplyPlannerRouteCondition, string>` message-key map used by `SupplyAdvisor.svelte` (the current Supply Advisor locale keys are camelCase, so the domain-to-message map is the compile-time boundary rather than forcing an unrelated locale-key rename).

Japanese and Traditional Chinese remain structurally checked against English through the existing message type.

## Persistence and checkpoint versioning

Schema 16 begins in the same checkpoint that first changes the persisted route-attempt/report shape.

That checkpoint introduces the **complete schema-16 structure**, including:

- recurring-route event targets/effects;
- `baselineCapacity`, `dispatchSuspended`, and discriminated `modifierImpacts` on attempts;
- `modifierRecoveries` on `DailyLogisticsReport` (initially emitted as `[]` until recovery behavior lands in the next checkpoint);
- exact-key validation for every new discriminated shape.

Later tasks populate already-declared schema-16 fields but do not add another required persisted key under the same version.

Schema 15 is rejected. No migration, aliases, or repair framework is added.

## Presentation

### Active Modifiers

`ActiveModifiers.svelte` switches on target/effect kind instead of assuming every modifier is a company import-cost discount.

For a route modifier it shows event source, endpoints/material, effect, current base → effective value, and remaining duration.

### Route inspector

The existing inspector remains the one route-detail surface. It adds:

- current configured/base capacity and effective capacity;
- current base/effective lead time and cost when affected;
- event-suspended condition copy;
- latest persisted `modifierImpacts` for historical dispatch attribution;
- effective-relative utilization with explicit copy.

### World map

`WorldLogisticsRoutes.svelte` keeps existing geometry/selection. It adds a non-color disruption cue and `data-disrupted="true"` for active route modifiers.

### Reports

Reports render persisted `modifierImpacts` for affected attempts and discriminated recovery rows. Historical attribution therefore remains visible after modifiers expire.

## Production event

Add one weighted production definition:

```text
id: freight-disruption
version: 1
selection: weighted, weight 1
condition: always
target: active recurring route
expiresAfterDays: 2
cooldownDays: 7 per concrete route target
```

Options:

1. `accept-delay`
   - 3 days: lead time +1 day;
   - 3 days: capacity ×0.75.
2. `charter-carriers`
   - immediate cash -2,000;
   - 2 days: capacity ×1.25;
   - 2 days: transport cost ×1.5.
3. `suspend-shipments`
   - 2 days: dispatch suspension.

Stable stacking keys remain effect-specific and target-scoped.

### Weighted-event balance decision

Today `supplier-terms` is the only weighted production event at weight 1. When at least one route is eligible, adding `freight-disruption` at weight 1 intentionally splits weighted selections evenly between the two definitions. The global weighted-event cadence remains unchanged; supplier terms becomes less frequent only after logistics exists.

This is a deliberate later-game content-mix change, not an accidental probability multiplication by route count.

## Verification strategy

Focused tests cover:

- definition-level weighting and deterministic concrete target selection;
- selection active-only vs resolution existence-only behavior;
- target-scoped replacement;
- all four effect calculations and clone paths;
- shared builder parity by construction (both live and planner use the same builder);
- suspension cadence;
- compact historical modifier impacts and exact-key codec validation;
- stale-attempt matching with `baselineCapacity`;
- structural capacity alerts ignoring temporary disruption;
- effective-relative utilization;
- reuse of `event-modifier` route navigation;
- planner expiry across dated horizons;
- route edit/remove/expiry recovery;
- compile-time condition/copy completeness;
- schema 16 rejection of 15.

One targeted Playwright lifecycle must prove:

1. an unresolved freight-disruption decision names its concrete route;
2. resolving it exposes Active Modifier copy;
3. the world route exposes `data-disrupted="true"`;
4. an affected dispatch records historical impact evidence;
5. its transfer order keeps its original adjusted arrival/cost;
6. editing/pausing the base route does not create restoration state;
7. expiry reveals current base behavior and records recovery;
8. route navigation from the existing event-modifier alert works.

## Risks and containment

### Live/planner semantic drift

Containment: both loops call `resolveEffectiveRecurringRoute` and `buildRouteDispatchAttempt`; only inventory/order plumbing remains duplicated.

### Historical evidence bloat

Containment: only `baselineCapacity`, `dispatchSuspended`, and discriminated impact rows are added. Unaffected attempts carry an empty impact array instead of many baseline fields.

### Exact-key save churn

Containment: introduce the attempt test factory first and land the complete schema-16 shape in one checkpoint.

### Alert duplication

Containment: reuse `event-modifier`; do not introduce a second disruption alert kind.

### Utilization ambiguity

Containment: keep effective-relative utilization and show base/effective capacity beside it.

### Event copy loses its target

Containment: persist stable route context in the materialized decision before resolution.

### Route pause invalidates a decision unexpectedly

Containment: selection requires active; resolution requires existence only.

## Non-goals

- random route failures or reliability percentages;
- vehicle/path simulation;
- rerouting or transfer recall;
- mutation of in-transit transfer orders;
- copied effective routes or recovery snapshots;
- generic effect/property registries;
- scenario authoring changes;
- a second alert kind or incident system;
- a second utilization metric;
- full consolidation of the live/planner dispatch loops;
- pre-release save migration.
