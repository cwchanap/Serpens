# Event-Driven Logistics Disruptions and Recovery Design

**Date:** 2026-08-15

**Linear:** HPA-296 — Integrate event-driven logistics disruptions and recovery

**Status:** Revised after codebase review; normative design for the HPA-296 implementation plan

## Outcome

Extend the existing event/modifier framework and recurring-route domain so strategic events can target one concrete recurring logistics route and temporarily change only future scheduled dispatches.

The first slice stays deliberately small:

- one new event target family: active recurring routes;
- four route modifier effects: lead-time adjustment, capacity multiplier, dispatch suspension, and transport-cost multiplier;
- one authoritative editable `RecurringRoute`;
- one pure effective-route resolver shared by live logistics, route read models, and the Supply Planner;
- explicit baseline/effective dispatch evidence;
- one production `freight-disruption` event;
- strict save schema 16 with no schema-15 migration;
- no copied effective-route state, pre-disruption snapshot, reliability RNG, shipment failure, rerouting, in-transit mutation, generic target DSL, or modifier registry.

## Why HPA-296 is actionable

The dependencies are complete:

- HPA-278 owns event selection, materialized decisions, isolated event RNG, timed modifiers, history, alerts, reports, and expiry;
- HPA-294 owns authoritative transfer orders, recurring routes, dispatch cadence, accounting, and logistics evidence;
- HPA-574 owns route management, inspector, reports, alerts, navigation, and world-map route presentation;
- HPA-297 owns the dated 7/30-day logistics projection used by the Supply Planner.

HPA-296 extends those seams instead of introducing a second incident or logistics scheduler.

## Reuse survey

| Need | Decision |
| --- | --- |
| Route event target | Extend `EventTarget` / `EventTargetSelector` in `types.ts`. |
| Target clone/equality/eligibility | Move company-only logic out of `eventSelection.ts` into focused `eventTargets.ts`. |
| Timed route effects | Extend the closed `EventTimedEffect` union. |
| Modifier activation | Extend `eventModifiers.ts` with a concrete target parameter and target-scoped replacement. |
| Effective route values | Add one focused `logisticsRouteModifiers.ts`; do not use `SimulationRules` for route effects. |
| Dispatch evidence | Extend `DailyRouteDispatchAttempt`; do not add a generic property bag. |
| Live condition | Extend `RouteOperationalCondition` with `route-event-suspended`. |
| Planner projection | Copy only active route-targeted modifiers into `SupplyPlannerLogisticsSnapshot` and reuse the resolver by projected day. |
| Cost rounding | Keep the shared total-cost function in `interCityLogistics.ts`, built on its existing checked integer helpers; planner imports it. |
| Recovery | Extend `DailyLogisticsReport` with a discriminated per-effect recovery union. |
| Persistence/UI | Extend the existing strict codec, alerts, route inspector, Active Modifiers, Reports, and world-route rendering. |

## Design approaches

### Approach A — focused event extension plus one route resolver

Add the minimum route target/effect contracts to the existing event framework and derive current effective route behavior from base route plus active modifiers.

This is the selected approach because it preserves one route owner and gives live dispatch, read models, and planner projection one interpretation of disruption state.

### Approach B — persist effective fields on `RecurringRoute`

Rejected. Route edits during a disruption would require synchronized base/effective copies and stale restoration logic.

### Approach C — separate logistics incident scheduler

Rejected. HPA-278 already owns the exact RNG, materialization, duration, replacement, reporting, and alert machinery HPA-296 needs.

## Event target contract

Extend the target union only as far as production content requires:

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

export function isEventTargetEligible(game: GameState, target: EventTarget): boolean;
export function sameEventTarget(left: EventTarget, right: EventTarget): boolean;
export function cloneEventTarget(target: EventTarget): EventTarget;
```

A recurring-route target is eligible only when:

- the route exists;
- its base state is `active`;
- both endpoints are opened world cities.

Eligible routes are sorted by raw route ID before random selection. Priority, list insertion order, next-dispatch day, and material do not affect target ordering.

## Definition selection and materialization RNG

Keep the existing three top-level event RNG draws:

1. cadence;
2. weighted event selection;
3. materialization seed.

For each definition, derive eligible concrete targets after pending-instance and cooldown exclusion. A definition is one candidate when at least one target remains; route count never multiplies the definition's weight.

After the event definition wins:

- company selectors materialize the company target directly;
- recurring-route selectors spend one draw from the already-created `materializationRng` over the sorted eligible route IDs.

Do not bump `EVENT_SELECTION_SCHEMA_VERSION`: the top-level RNG advancement remains unchanged.

## Persisted route copy context

The player must know which route a materialized decision refers to before choosing an option, and the copy must survive route removal after materialization.

When a route target is materialized, merge these stable IDs into the persisted decision copy params:

```ts
{
	routeId,
	originCityId,
	destinationCityId,
	materialId
}
```

`gameCopy.ts` derives localized `originCityName`, `destinationCityName`, and `materialName` from those persisted IDs when translating event title/context/options. `localizeEventDecisionOption` receives the same enriched params as title/context localization.

This avoids storing localized strings and avoids requiring the live route to still exist. `DecisionQueue.svelte` remains a renderer of `LocalizedDecision`; its focused test must prove the concrete route is visible in the decision and option copy.

## Resolution-time target revalidation

Before applying any immediate effect or activating modifiers, `eventEffects.ts` revalidates the persisted concrete target.

If the route was removed, paused, or otherwise became ineligible, option preparation returns the existing atomic `effect-rejected` result with `payload: 'target'`. No immediate effect or modifier is committed.

A route edit that leaves the route active remains valid.

## Timed route effects

Extend the closed `EventTimedEffect` union:

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

Validation is explicit:

- lead-time adjustment is a positive safe integer;
- capacity and cost multipliers are finite and greater than zero;
- suspension has no payload;
- company definitions may use the existing import-cost effect;
- recurring-route definitions may use only route effect kinds;
- stacking remains `replace` only.

Do not normalize the union into property paths, callbacks, registries, or scripts.

## Target-scoped modifier replacement

Current replacement is keyed only by `stackingKey`. Route targets require:

```text
same stackingKey AND same concrete EventTarget
```

The same disruption type may therefore coexist on different routes, while a replacement on one route does not touch another route.

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

`RouteModifierContribution` is itself discriminated by effect kind and carries modifier/source attribution plus only the value relevant to that effect. It is not a string/value bag.

The resolver never mutates the route.

## Shared transport-cost arithmetic

Keep total transport-cost calculation in `interCityLogistics.ts`, where the existing checked integer arithmetic already lives:

```ts
export function calculateEffectiveRouteTransportCost(input: {
	baseTransportCostPerUnit: number;
	quantity: number;
	transportCostMultiplier: number;
}): number;
```

Implementation rules:

1. use the existing `checkedMultiply(baseTransportCostPerUnit, quantity)` for the integer base total;
2. multiply that base total by the combined route multiplier;
3. round once with `Math.round`;
4. reject a non-finite, negative, or non-safe-integer result with the same `RangeError` style used by the logistics core.

Do not add a generic `checkedRoundedProduct` or a second transport-cost calculation in the planner. `supplyPlannerLogistics.ts` imports this helper.

## Live dispatch

`processRecurringRouteDispatches` preserves HPA-294 due-route ordering:

```text
route.state === active && route.nextDispatchOnDay <= closingDay
```

For each due base route, resolve effective values for `closingDay`.

Derive:

- `baselineDispatchedQuantity` from destination need, origin stock, and base capacity;
- `dispatchedQuantity` from destination need, origin stock, and effective capacity, or zero when event-suspended.

A positive transfer order uses effective lead time, effective quantity, and the shared effective transport-cost helper. Once created, the order is immutable.

### Event suspension cadence

A due event-suspended route:

- records a zero-quantity attempt;
- advances `nextDispatchOnDay = closingDay + frequencyDays`;
- does not create an empty transfer order.

A player-paused route remains outside the due set and keeps existing cadence behavior.

## Dispatch evidence

Extend `DailyRouteDispatchAttempt` with explicit baseline/effective evidence:

```ts
baselineCapacity: number;
capacity: number; // effective capacity
baselineLeadTimeDays: number;
leadTimeDays: number;
baselineTransportCostPerUnit: number;
transportCostPerUnit: number;
baselineDispatchedQuantity: number;
baselineTransportCost: number;
dispatchSuspended: boolean;
modifierContributions: RouteModifierContribution[];
```

Existing `dispatchedQuantity`, `transportCost`, `unusedCapacity`, and `unmetDestinationNeed` remain effective-attempt values.

`attemptMatchesRoute` compares the route definition with `attempt.baselineCapacity`, not effective `attempt.capacity`, plus the existing origin/destination/material checks.

No route revision counter is added.

## Live route conditions and alerts

Add the suspension state to the shared live condition union:

```ts
export type RouteOperationalCondition =
	| 'awaiting-dispatch'
	| 'destination-full'
	| 'origin-stock-constrained'
	| 'route-capacity-constrained'
	| 'route-event-suspended'
	| 'normal';
```

Classification order is explicit:

1. no attempt → `awaiting-dispatch`;
2. `attempt.dispatchSuspended` → `route-event-suspended`;
3. destination full;
4. origin stock constrained using effective capacity;
5. route capacity constrained using effective capacity;
6. normal.

`selectRouteOperations(game)` also calls `resolveEffectiveRecurringRoute(route, game.events.activeModifiers, game.day)` and exposes current effective values for the inspector/alerts. Historic attempt evidence stays recorded and immutable.

### Origin-stock alerts

The self-clearing current-stock threshold uses the route's **current effective capacity**, not blindly the base or historic effective capacity. This keeps the alert truthful while a disruption activates or expires.

### Structural route-capacity alerts

The existing multi-attempt capacity alert means the configured base route is persistently undersized. Temporary event effects must not manufacture that signal.

A recent attempt may satisfy the structural capacity streak only when:

- `dispatchSuspended === false`;
- origin stock can satisfy `min(destinationNeed, baselineCapacity)`;
- `unmetDestinationNeed > 0`;
- `dispatchedQuantity === baselineCapacity`.

Thus a temporary ×0.75 capacity disruption may classify the latest attempt as effective `route-capacity-constrained` for the inspector, but it cannot by itself trigger or extend the structural capacity-pressure alert.

## Route edits, removal, and expiry

Route edits mutate only base `RecurringRoute`. Effective state is recalculated from the edited base plus active modifiers.

Removing a route:

- removes it from future event eligibility;
- leaves in-transit/historical orders unchanged;
- leaves modifier history to expire normally;
- suppresses route-targeted alert/recovery UI because no navigation target remains;
- creates no tombstone or recovery snapshot.

## Discriminated recovery evidence

`DailyLogisticsReport` gains:

```ts
modifierRecoveries: DailyRouteModifierRecovery[];
```

Lock the recovery shape now instead of using `number | 'suspended'` bags:

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

A pure helper in `logisticsRouteModifiers.ts` compares the still-existing route under pre-expiry and post-expiry modifier sets and emits only rows whose relevant value changes. Removed routes produce no recovery row. `simulateDay.ts` only attaches the returned rows to the daily report.

## Supply Planner integration

`SupplyPlannerLogisticsSnapshot` copies only active route-targeted modifiers needed by the projection. It does not copy the entire event runtime or one precomputed effective route.

On each projected day, `processSupplyPlannerRouteDispatches`:

1. resolves each due route with `resolveEffectiveRecurringRoute(route, copiedModifiers, projectedDay)`;
2. uses the shared `calculateEffectiveRouteTransportCost` helper;
3. writes the same baseline/effective `DailyRouteDispatchAttempt` fields as live dispatch;
4. advances cadence on event suspension exactly like live dispatch.

`SupplyPlannerRouteCondition` continues to extend `RouteOperationalCondition`; it does **not** define a second suspension spelling. The planner rank table adds the inherited `route-event-suspended` condition as a blocking condition.

Modifier expiry inside a 7/30-day horizon therefore happens naturally through the resolver's day check.

## Persistence

Bump `SAVE_SCHEMA_VERSION` from 15 to 16.

Schema 16 validates:

- recurring-route event targets/selectors where persisted;
- all four timed route effects;
- discriminated route modifier contributions;
- all new required dispatch-attempt keys;
- discriminated recovery rows.

`validateSavedDailyRouteDispatchAttempt` uses exact keys today, so its key list and all report fixtures must change in the same implementation checkpoint as the attempt type.

Schema 15 is rejected. No migration, aliases, or repair framework is added.

## Presentation

### Active Modifiers

`ActiveModifiers.svelte` switches on target/effect kind. It must stop assuming every modifier is a company import-cost discount.

For route modifiers it shows:

- event source;
- concrete route endpoints/material from persisted target/copy context or current route when available;
- effect-specific value;
- remaining duration.

### Route inspector

`RouteOperationalSummary` exposes current effective route values. `LogisticsRouteInspector.svelte` shows base → effective differences for capacity, lead time, cost, and suspension plus latest-attempt evidence.

### World map

`WorldLogisticsRoutes.svelte` keeps existing geometry. A disrupted route gets a non-color-only disrupted visual treatment and:

```html
data-disrupted="true"
```

The accessible route list/inspector copy states the disruption; SVG color is not the sole signal.

### Reports and alerts

Reports render dispatch contribution evidence and discriminated recovery rows. Disruption alerts reuse existing route navigation and include remaining duration.

## Production event

Add one weighted production event:

```text
id: freight-disruption
version: 1
selection: weighted weight 1
condition: always
target: active recurring route
expiresAfterDays: 2
cooldownDays: 7 per concrete route target
```

It is ineligible when no active route target exists. The reserved materialization RNG selects one eligible route deterministically.

Options:

1. `accept-delay`
   - 3 days: lead time +1;
   - 3 days: capacity ×0.75.
2. `charter-carriers`
   - immediate cash -2,000;
   - 2 days: capacity ×1.25;
   - 2 days: transport cost ×1.5.
3. `suspend-shipments`
   - 2 days: dispatch suspension.

Effect-specific stacking keys are target-scoped by lifecycle logic:

```text
freight-disruption:lead-time
freight-disruption:capacity
freight-disruption:transport-cost
freight-disruption:suspension
```

The materialized decision title/context/options must visibly name the concrete route before resolution.

## Verification strategy

### Domain coverage

Cover:

- definition-level weighting independent of route count;
- deterministic route target choice with fixed RNG state;
- concrete-target cooldown/pending exclusion;
- target-scoped replacement;
- paused/removed target atomic rejection;
- all four resolver effects and multi-key composition;
- base/effective dispatch evidence;
- suspension cadence;
- immutable already-dispatched order arrival/cost;
- route edit + expiry behavior;
- removed-route expiry with no recovery row;
- shared `route-event-suspended` condition;
- structural capacity alerts ignoring temporary capacity/suspension effects;
- planner/live attempt parity and projected expiry;
- schema-16 exact-key validation and schema-15 rejection;
- localized decision/option route identity.

### End-to-end lifecycle

One targeted Playwright lifecycle should:

1. inject a deterministic schema-16 sandbox save with an active route;
2. materialize `freight-disruption` and assert the decision names that route;
3. resolve one option;
4. assert Active Modifiers and `data-disrupted="true"` on the world route;
5. close through an affected dispatch and verify baseline/effective evidence;
6. edit the base route while disrupted;
7. close through expiry;
8. assert recovery reflects the edited base route;
9. verify the already-dispatched order kept its original adjusted arrival/cost.

## Risks and mitigations

### Effective capacity vs HPA-574 alerts

**Risk:** treating effective capacity as configured capacity creates false structural capacity alerts and stale attempt mismatches.

**Mitigation:** `capacity` remains effective for attempt presentation; `baselineCapacity` owns configuration matching and structural alert gating; suspension is a first-class live condition.

### Materialized decision copy

**Risk:** the event resolves against a concrete route but player copy does not identify it, or later route removal makes the decision opaque.

**Mitigation:** persist route/origin/destination/material IDs in `decision.copy.params`; localize title/context/options from those persisted IDs.

### Exact-key persistence

**Risk:** adding required dispatch fields before codec fixtures makes intermediate checkpoints uncompilable or causes encode/decode failures.

**Mitigation:** update `validateSavedDailyRouteDispatchAttempt` and all direct attempt fixtures in the same checkpoint as the attempt type; schema number and recovery keys move in the next persistence checkpoint.

### Cost arithmetic drift

**Risk:** live and planner round or overflow differently.

**Mitigation:** one exported route-specific cost helper in `interCityLogistics.ts` uses the existing checked integer base multiplication and one final round; planner imports it.

## Non-goals

- random reliability/failure probabilities;
- delayed mutation of already-dispatched transfer orders;
- rerouting or recall;
- city closure simulation;
- vehicle/path simulation;
- arbitrary effect scripting;
- generic entity-target registry;
- route recovery snapshots;
- route tombstones;
- pre-release save migration;
- a second logistics or event UI subsystem.

## Acceptance criteria

- Route-target selection is deterministic and definition-level weighting is independent of route count.
- Materialized freight-disruption copy identifies the concrete route before resolution.
- Lead-time, capacity, suspension, and cost effects apply only to due recurring-route dispatches while active.
- Already-dispatched transfer orders remain immutable.
- Effective state derives from current base route plus active modifiers; no synchronized copy exists.
- Target-scoped replacement permits identical stacking keys on different routes.
- `route-event-suspended` is a shared live/planner operational condition.
- Structural route-capacity alerts use baseline capacity and ignore event-suspended attempts.
- Route edits during disruption survive expiry automatically.
- Removed routes produce no stale recovery/alert repair.
- Live dispatch, `selectRouteOperations`, and the Supply Planner use the same route resolver.
- Recovery evidence is discriminated by effect kind.
- Schema 16 validates exact new shapes and rejects 15 without migration.
- Active Modifiers, route inspector, world route, reports, alerts, and decision copy expose disruption without relying on color alone.
- Focused unit/persistence/component coverage and the targeted multi-day Playwright lifecycle pass.