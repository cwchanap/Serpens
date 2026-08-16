# Event-Driven Logistics Disruptions and Recovery Design

**Date:** 2026-08-15

**Linear:** HPA-296 — Integrate event-driven logistics disruptions and recovery

**Status:** Proposed implementation design for the HPA-296 planning PR

## Outcome

Extend the existing event/modifier framework and recurring-route domain so strategic events can target one concrete recurring logistics route and temporarily change only future scheduled dispatches. The route definition remains the authoritative editable configuration; effective capacity, lead time, suspension, and transport cost are derived from the route plus active event modifiers at the dispatch day.

The first slice must remain deterministic, explainable, and small:

- one new event target family: recurring routes;
- four route modifier effects: lead-time adjustment, capacity multiplier, dispatch suspension, and transport-cost multiplier;
- one pure effective-route resolver shared by live simulation and the Supply Planner;
- no copied effective-route state, recovery snapshot, reliability simulation, rerouting, shipment mutation, or logistics-specific event engine;
- current-schema persistence only, with a schema bump and no migration from schema 15.

## Why HPA-296 is actionable now

The dependency chain in HPA-279 is complete through the player-facing route layer:

- HPA-294 owns authoritative transfer orders, recurring routes, dispatch/arrival accounting, and normal logistics evidence;
- HPA-568 owns the route-local presentation hosts;
- HPA-574 owns logistics management, route inspection, reports, alerts, navigation, and world-map route presentation;
- HPA-278 owns event selection, materialized decisions, timed modifiers, lifecycle history, alerts, reports, and isolated event RNG;
- HPA-297 now projects the HPA-294 route lifecycle over 7/30 days.

HPA-296 can therefore extend stable seams instead of predicting interfaces that do not exist yet.

## Current baseline

### Event framework

`src/lib/game/types.ts` currently has company-only `EventTarget` / `EventTargetSelector` and a single `import-cost-multiplier` timed effect.

`src/lib/game/eventSelection.ts` already consumes three fixed event RNG draws per simulated day:

1. cadence draw;
2. weighted-event draw;
3. materialization seed draw.

The third draw already creates an isolated `materializationRng`, but no current company-targeted event needs it. HPA-296 should use that reserved stream for route selection without changing the top-level RNG draw count.

`src/lib/game/eventModifiers.ts` already owns activation, replacement, snapshots, and expiry, but activation currently hard-codes `{ kind: 'company' }` and replacement compares only `stackingKey`.

`src/lib/game/eventEffects.ts` already prepares an option atomically before committing it, but it rejects every non-company event target.

### Logistics core

`src/lib/game/interCityLogistics.ts` keeps `RecurringRoute` as the authoritative base configuration. `processRecurringRouteDispatches` currently:

- selects active due routes;
- orders them by priority and stable route ID;
- derives destination need and origin stock;
- dispatches `min(destination need, route capacity, origin stock)`;
- calculates cost from the route's configured cost per unit;
- creates an immutable transfer order using the configured lead time;
- advances `nextDispatchOnDay` by the configured frequency;
- records one `DailyRouteDispatchAttempt`.

That is the correct boundary for applying event-derived effective values.

### Logistics presentation

HPA-574 already provides:

- `selectRouteOperations` / `RouteOperationalSummary`;
- `LogisticsRouteInspector.svelte`;
- `WorldLogisticsRoutes.svelte`;
- latest-day logistics reporting;
- route-targeted alert navigation.

These surfaces should be extended, not replaced.

### Supply Planner

`src/lib/game/supplyPlannerLogistics.ts` intentionally replays only the small deterministic HPA-294 logistics lifecycle needed for the 7/30-day projection. It currently copies routes and in-transit orders and then uses base route capacity, lead time, state, and transport cost on each projected day.

HPA-296 must feed this projection the same day-aware effective-route resolver used by live dispatch. Copying only today's effective route values would be wrong because an event can expire inside the 30-day horizon.

### Persistence

`src/lib/persistence/saveTypes.ts` currently defines strict save schema 15. HPA-296 changes persisted event targets, modifier effect payloads, and report evidence, so the current schema becomes 16. This pre-release project does not need a schema-15 migration.

## Design approaches considered

### Approach A — focused extension of event targets + one pure route resolver

Add the minimum route target/effect contracts to the existing event framework, add one focused pure resolver for effective recurring-route values, and call it from live dispatch, the planner, and current route read models.

**Advantages**

- keeps one authoritative `RecurringRoute`;
- reuses event selection, RNG, modifier lifecycle, history, alerts, and reports;
- gives live simulation and the planner one definition of effective route behavior;
- route edits automatically affect active disruptions because effective state is re-derived;
- expiry needs no restoration logic.

**Cost**

- event and logistics boundaries both change, so type discrimination must be completed across existing modifier/report UI.

### Approach B — write temporary disruption fields onto `RecurringRoute`

An event would mutate fields such as `effectiveCapacity` or `suspendedByEvent` and expiry would restore prior values.

**Rejected.** It creates synchronized base/effective state, stale restoration after route edits, extra persistence validation, and route-removal repair logic. It directly conflicts with HPA-296's guardrails.

### Approach C — create a separate logistics incident scheduler

A new subsystem would select routes, roll incidents, store durations, and render incident alerts independently of strategic events.

**Rejected.** HPA-278 already owns deterministic event RNG, materialized decisions, timed modifiers, lifecycle, reporting, and alert provenance. A second incident engine would duplicate the exact machinery HPA-296 is meant to reuse.

## Decision

Use **Approach A**.

Two small new domain files are justified:

- `src/lib/game/eventTargets.ts` — cloning, equality, eligibility, and concrete-target resolution for company/route targets;
- `src/lib/game/logisticsRouteModifiers.ts` — pure route-modifier filtering, composition, effective values, and transport-cost rounding.

Everything else extends existing owners.

## Event target contract

### Types

Extend the current target union only as far as production content requires:

```ts
export type EventTarget =
	| { kind: 'company' }
	| { kind: 'recurring-route'; routeId: string };

export type EventTargetSelector =
	| { kind: 'company' }
	| { kind: 'recurring-route'; state: 'active' };
```

Do not add generic query predicates, city/material filters, arrays of targets, or arbitrary entity IDs.

### Target eligibility

`eventTargets.ts` owns these semantics:

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

- the route still exists in `game.logistics.recurringRoutes`;
- the base route state is `active`;
- both route endpoints are still opened world cities.

Eligible route targets are sorted by raw route ID before any random selection. Priority, next dispatch day, material, and route list insertion order must not change target ordering.

### Event selection and isolated materialization RNG

Keep the fixed three top-level event RNG draws unchanged.

For each event definition, derive its concrete eligible target set after excluding:

- a pending instance of the same event family for the same concrete target;
- an active cooldown for the same event family and concrete target.

The event definition is a single selection candidate when at least one concrete target remains. Route count does **not** multiply the definition's weighted selection probability.

After the existing forced/weighted event definition selection chooses a definition:

- a company selector materializes the company target directly;
- a recurring-route selector uses one draw from the already-created `materializationRng` to choose from the sorted concrete route targets.

This preserves today's event RNG advancement while finally using the extension stream HPA-278 reserved for materialization-specific randomness.

### Resolution-time revalidation

A materialized decision stores the concrete route ID. Before applying any immediate effect or activating any modifier, `eventEffects.ts` revalidates that concrete target.

If the route was removed, paused, or otherwise became ineligible, option preparation returns the existing atomic `effect-rejected` result with `payload: 'target'`. No immediate effect or modifier is committed.

A later route edit that leaves the route active remains valid; the active modifier applies to the edited base route.

## Route timed-effect contract

Extend `EventTimedEffect` with exactly four route effects:

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

Catalog/runtime validation is explicit, not registry-driven:

- `route-lead-time-adjustment.days` is a positive safe integer;
- capacity and transport-cost multipliers are finite and greater than zero;
- suspension has no extra parameters;
- company-targeted definitions may use the existing retail import-cost effect;
- recurring-route-targeted definitions may use only the four route effect kinds;
- `stackingRule` remains `replace` only.

Do not add arbitrary property paths, effect callbacks, a scripting language, or generic numeric modifier metadata.

## Target-scoped replacement and combination

The current modifier lifecycle replaces every active modifier sharing a `stackingKey`. With route targets, that would incorrectly allow a disruption on `route-2` to replace the same disruption type on `route-1`.

Replacement becomes:

```text
same stackingKey AND same concrete EventTarget
```

Company-targeted supplier discounts therefore retain their existing behavior, while the same authored disruption key may exist concurrently on different routes.

Different stacking keys on the same route can coexist. The effective-route resolver composes them deterministically:

- lead-time adjustments add;
- capacity multipliers multiply;
- dispatch suspension is active when any contribution suspends;
- transport-cost multipliers multiply.

Matching modifiers are sorted by modifier ID before reduction so floating-point multiplication order is stable.

## Pure effective-route resolver

Create `src/lib/game/logisticsRouteModifiers.ts` as the only owner of event-to-route calculation semantics.

The public seam is intentionally small:

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

export function calculateEffectiveRouteTransportCost(
	effective: EffectiveRecurringRoute,
	quantity: number
): number;
```

`RouteModifierContribution` contains only attribution needed by consumers: modifier ID, source event/instance/option, effect kind, authored value when applicable, and structured explanation.

### Effective values

For the current base route on day `D`:

```text
leadTimeDays = base lead time + sum(active lead adjustments)
capacity = max(1, floor(base capacity × product(active capacity multipliers)))
dispatchSuspended = any(active suspension)
transportCostMultiplier = product(active transport-cost multipliers)
transportCostPerUnit = base cost per unit × transportCostMultiplier
```

All additions/products are checked for finite/safe bounds. Invalid overflow is a programmer/data error and throws rather than silently corrupting accounting.

The stored `RecurringRoute` is never rewritten with these values.

### Transport-cost rounding

Transfer-order cost remains an integer amount. Avoid repeated per-unit rounding:

```text
base total = base transportCostPerUnit × dispatched quantity
effective total = round(base total × combined transport-cost multiplier)
```

The final rounded total must be a safe non-negative integer. Presentation may show the derived decimal effective cost per unit, but accounting uses the one rounded total above.

## Live recurring-route dispatch

`processRecurringRouteDispatches` keeps HPA-294 ordering and cadence ownership.

For each base route where:

```text
route.state === 'active' && route.nextDispatchOnDay <= closingDay
```

resolve effective values for `closingDay` and derive two quantities:

- `baselineDispatchedQuantity` — what the current base route would dispatch with the same destination need and origin stock;
- `dispatchedQuantity` — what the effective route dispatches, or zero when event-suspended.

The transfer order created for a positive effective dispatch uses:

- current base origin/destination/material;
- effective lead time for `arrivalOnDay`;
- effective rounded transport cost;
- the actual effective dispatched quantity.

Once created, the transfer order is immutable. Later modifier expiry or route edits do not change its arrival day, quantity, or cost.

### Suspended cadence

Event suspension suppresses the **shipment**, not the scheduler.

A due event-suspended route records a zero-quantity dispatch attempt and advances:

```text
nextDispatchOnDay = closingDay + route.frequencyDays
```

This prevents a suspended route from accumulating an artificial overdue dispatch that fires immediately on recovery. A base route that the player explicitly paused retains HPA-294 behavior: it is not a due route at all and its schedule is not advanced by the event system.

## Dispatch evidence

Keep the existing `DailyRouteDispatchAttempt` shape recognizable for HPA-574/HPA-297 consumers and add explicit baseline/effective evidence rather than replacing it with a generic property bag.

Add:

```ts
baselineCapacity: number;
capacity: number; // effective capacity, preserving today's consumer meaning
baselineLeadTimeDays: number;
leadTimeDays: number;
baselineTransportCostPerUnit: number;
transportCostPerUnit: number;
baselineDispatchedQuantity: number;
baselineTransportCost: number;
dispatchSuspended: boolean;
modifierContributions: RouteModifierContribution[];
```

Existing fields `dispatchedQuantity`, `transportCost`, `unusedCapacity`, and `unmetDestinationNeed` describe the effective attempt.

This gives every affected dispatch:

- responsible event/modifier IDs;
- base and effective route values;
- baseline and actual shipped units;
- baseline and actual transport cost;
- the immutable resulting transfer order ID when one exists.

### Stale-attempt matching after route edits

`attemptMatchesRoute` currently compares `attempt.capacity` with the current route capacity. Once `capacity` means effective capacity, that check would incorrectly hide every capacity-disrupted attempt.

Change the configuration check to compare the current base route against `attempt.baselineCapacity` plus the existing origin/destination/material fields. Disruption does not make an otherwise-current attempt stale; a later base-capacity edit still does.

Do not add a route revision counter or copied route snapshot solely for this purpose.

## Route edits, removal, and expiry

### Edits while disrupted

Route edit commands continue to mutate only the base `RecurringRoute`. The next read/dispatch resolves active modifiers over the edited base, so no explicit reconciliation path is needed.

### Removal while disrupted

Removing a recurring route:

- removes it from future event target eligibility;
- stops future dispatch because the route no longer exists;
- leaves already-dispatched transfer orders unchanged;
- leaves modifier lifecycle/history records intact until normal expiry;
- does not create a tombstone, recovery snapshot, or restore action.

Route-targeted alerts are omitted when the route no longer exists because there is no valid navigation target.

### Expiry and recovery evidence

Existing modifier expiry remains authoritative. HPA-296 adds a small logistics report record only when an expiring route modifier has a still-existing route and expiry changes that affected value back to the current base behavior.

`DailyLogisticsReport` gains:

```ts
modifierRecoveries: DailyRouteModifierRecovery[];
```

A recovery record contains:

- route ID;
- modifier ID and source event attribution;
- effect kind;
- disrupted value on the closing day;
- recovered base value for the next day.

If the route was removed, no recovery row is fabricated. Generic event modifier lifecycle still records the normal `expired` history entry.

## Supply Planner integration

The planner must project modifier expiry correctly across its dated simulation.

Extend `SupplyPlannerLogisticsSnapshot` with copied active **route-targeted modifier** state. Do not copy the entire event runtime and do not precompute one effective route snapshot.

`processSupplyPlannerRouteDispatches(input, day)` calls the same `resolveEffectiveRecurringRoute(route, modifiers, day)` as live dispatch, then uses the same:

- capacity composition;
- suspension behavior and cadence advancement;
- lead time for projected arrival;
- transport-cost calculation.

Add one planner condition for a due route whose dispatch is event-suspended:

```ts
'troute-event-suspended'
```

It ranks as a blocking route condition above ordinary capacity/frequency/lead-time constraints. Other disruption effects naturally flow into the existing forecast numbers and bottlenecks:

- reduced capacity can produce route-capacity constraints;
- increased lead time can worsen first-arrival/lead-time evidence;
- exceptional cost changes projected transport cost;
- effects automatically disappear after their `expiresOnDay` inside the 30-day trace.

Do not add disruption-specific planner recommendations or a second event simulator.

## Read models, alerts, and presentation

### Route operational summary

Extend `RouteOperationalSummary` with the current-day `EffectiveRecurringRoute` (or a presentation-safe projection of its values). `selectRouteOperations(game)` resolves against `game.day` so the inspector/world map describe the behavior of the next possible dispatch.

The base `route` remains available for editing/navigation and historical comparison.

### Active Modifiers

`ActiveModifiers.svelte` currently assumes every modifier is a company import-cost discount. Replace that assumption with target/effect discrimination:

- company import-cost modifier keeps the current display;
- route modifiers show the route endpoints/material when the route still exists, the localized effect, and remaining duration;
- a removed route falls back to its persisted route ID without attempting repair.

Do not create a second logistics-only modifier panel.

### Route inspector

Add one compact **Active disruption** section ahead of the normal schedule. For each active contribution, show localized explanation and remaining duration. In the schedule rows, show effective values as the primary value and the configured/base value only when it differs.

Examples:

```text
Capacity       75   (configured 100)
Lead time      3d   (configured 2d)
Transport      $1.50/unit (configured $1.00)
State          Suspended by event
```

The Manage Route action still edits the base route through the existing HPA-574 form.

### World map

Keep the same route geometry and hit targets. Add only disruption presentation:

- any active route disruption gets a small `!` marker at the route midpoint and a `data-disrupted="true"` hook;
- event-suspended routes also use a non-color dash pattern distinct from the player-paused pattern;
- selected state remains the existing selected treatment;
- exact effect details stay in the route inspector / route discovery text rather than turning the SVG into a dashboard.

The marker/dash ensures disruption is not communicated by color alone.

### Alerts and navigation

Reuse the existing `event-modifier` alert kind for important modifiers, but make route-targeted modifier alerts carry `routeId` and navigate to the world route instead of the Decisions panel.

When one event option activates multiple route modifiers, group its important alert by `(routeId, source.instanceId)` so the player receives one actionable disruption alert rather than one alert per numeric effect.

The alert copy includes the route label and remaining duration. `alertNavigation.ts` can treat any alert carrying a valid `routeId` as world-route navigation; existing logistics stock/capacity alerts continue to work.

### Reports

Extend the existing latest-day Logistics section rather than creating a new report surface. It shows:

- disrupted dispatch attempts when `modifierContributions.length > 0`, including baseline → effective values and source event title;
- zero-quantity event-suspended attempts;
- recovery rows from `modifierRecoveries`.

Existing generic event modifier lifecycle/report attribution remains intact for company import-cost modifiers.

## Production event

Add one production route event that exercises the complete target/lifecycle path without creating a new event family framework.

### `freight-disruption`

```text
id: freight-disruption
version: 1
selection: weighted, weight 1
condition: always
target: active recurring route
expiresAfterDays: 2
cooldownDays: 7 (per concrete route target)
```

The event is ineligible when no active route target exists. When multiple routes are eligible, the reserved materialization RNG selects one deterministically.

Options:

1. `accept-delay`
   - 3 days: `route-lead-time-adjustment` +1 day;
   - 3 days: `route-capacity-multiplier` ×0.75.
2. `charter-carriers`
   - immediate cash `-2,000`;
   - 2 days: `route-capacity-multiplier` ×1.25;
   - 2 days: `route-transport-cost-multiplier` ×1.5.
3. `suspend-shipments`
   - 2 days: `route-dispatch-suspension`.

Stable stacking keys are effect-specific and target-scoped by the lifecycle implementation:

```text
freight-disruption:lead-time
freight-disruption:capacity
freight-disruption:transport-cost
freight-disruption:suspension
```

All route modifiers use structured explanation copy. The event/option copy must make the concrete target route and duration visible before resolution.

This production definition covers all four first-slice effect kinds across real options. Tests may additionally use fixture multipliers to cover boundary arithmetic, but no fixture-only effect kind is shipped.

## Persistence

Bump `SAVE_SCHEMA_VERSION` from 15 to 16.

Schema 16 validates:

- concrete route targets in pending event decisions, cooldowns, active modifiers, and history snapshots;
- the four route timed-effect payloads;
- route modifier contribution evidence on daily dispatch attempts;
- route recovery evidence in daily logistics reports.

Validation checks shape and numeric bounds; it does not require a historical target route to still exist. That is necessary because removed routes must not corrupt old decisions/history/reports.

Current live references are checked at behavior boundaries instead:

- materialization/resolution target eligibility;
- current alerts/navigation/read models.

There is **no schema-15 migration** and no stale-target repair path. Old pre-release saves are rejected by the normal current-schema boundary.

`EVENT_SELECTION_SCHEMA_VERSION` stays at 1 because HPA-296 does not change the number or ordering of persisted top-level event RNG draws; it consumes the already-reserved materialization stream.

## Determinism and accounting invariants

The implementation must preserve these invariants:

- live game RNG is untouched by route target selection;
- event RNG consumes exactly the existing three top-level draws per generated day;
- target candidate order is raw route ID order;
- base route priority/order still controls dispatch contention;
- route modifier composition order is raw modifier ID order;
- manual transfers are unaffected;
- a dispatched order's quantity, arrival day, and cost never change later;
- event suspension advances only the due recurring-route cadence, not a player-paused route;
- scheduled transport cost in the daily cash flow equals the sum of actual event-adjusted transfer-order costs;
- current route edits remain visible immediately under active modifiers;
- expiry never restores a saved copy of an old route configuration;
- planner and live route arithmetic use the same resolver.

## Testing strategy

### Domain

Add focused tests for:

- target eligibility, raw-ID ordering, and concrete-target equality;
- event weight independence from route count;
- deterministic materialization target selection with unchanged top-level event RNG advancement;
- resolution rejection after pause/removal with no partial immediate effect;
- target-scoped stacking replacement;
- additive/multiplicative/suspension composition and safe rounding;
- route edits under active modifiers;
- due suspended attempts advancing cadence;
- immutable already-dispatched orders across expiry;
- removed-route expiry without recovery repair;
- truthful baseline/effective dispatch evidence and stale-attempt matching.

### Planner

Use a multi-day projection where one disruption expires inside the horizon and assert:

- disrupted days use effective capacity/lead time/cost/suspension;
- later days return to current base route behavior;
- in-transit orders created while disrupted retain their event-adjusted arrival/cost after expiry;
- projected route condition identifies event suspension without inventing a recommendation subsystem.

### Persistence

Schema-16 round-trip coverage includes a pending route event, active route modifier, disrupted dispatch attempt, and recovery report entry. Schema 15 is rejected; no migration fixture is added.

### Components

Cover:

- Active Modifiers company vs route-effect rendering;
- route inspector configured → effective differences and remaining duration;
- world route disruption marker and suspension dash/data state;
- grouped disruption alert navigation;
- latest report disrupted-attempt and recovery copy;
- English/Japanese/Traditional Chinese localization completeness.

### End-to-end lifecycle

One targeted Playwright lifecycle should:

1. inject a current-schema deterministic sandbox save with two opened industry cities and an active recurring route;
2. materialize/resolve the production `freight-disruption` event for that route;
3. inspect the active disruption and world route;
4. close enough days to produce at least one affected dispatch;
5. verify the created order keeps its adjusted arrival/cost;
6. edit the base route while the modifier is active;
7. close through expiry;
8. verify recovery uses the edited base route rather than a pre-event snapshot;
9. verify the Reports surface contains disruption and recovery evidence.

## Scope guardrails

Do **not** add:

- random shipment failure/reliability;
- pathfinding, vehicles, rerouting, or transfer recall;
- mutation of in-transit orders;
- copied effective route state;
- a saved pre-disruption route snapshot;
- a logistics-specific event scheduler/RNG/history;
- generic event target query DSL;
- generic modifier scripting or arbitrary property paths;
- new route management forms;
- disruption-specific planner recommendations;
- schema-15 migration or missing-target repair;
- backwards-compatibility aliases for old event/report shapes.

## Acceptance criteria mapping

HPA-296 is complete when:

- route-target materialization is deterministic, target-specific, and atomic;
- all four route effects alter only due future recurring-route attempts while active;
- already-dispatched orders remain immutable;
- base route + active modifier resolution is the only effective-state model;
- route edits automatically survive expiry;
- route removal leaves history/in-transit orders valid and requires no restoration;
- every affected dispatch records source plus baseline/effective values and concrete result;
- inspector, Active Modifiers, alerts, Reports, and world map expose the disruption without color-only meaning;
- expiry produces a truthful recovery row when a current base route still exists;
- the 7/30-day Supply Planner uses day-aware effective route state and naturally recovers after expiry;
- schema-16 current-save round trip and deterministic replay pass without migration;
- focused unit/component/persistence tests and the targeted multi-day Playwright lifecycle pass.
