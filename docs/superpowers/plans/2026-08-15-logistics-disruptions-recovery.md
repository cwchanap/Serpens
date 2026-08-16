# Event-Driven Logistics Disruptions and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-296 so strategic events deterministically target recurring logistics routes, temporarily alter future scheduled dispatches, preserve historical attribution, recover cleanly, and project the same behavior through the Supply Planner.

**Architecture:** `RecurringRoute` remains the only editable route state. `eventTargets.ts` owns route target semantics; `logisticsRouteModifiers.ts` owns day-aware modifier composition; `interCityLogistics.ts` owns shared checked transport-cost arithmetic and a pure `buildRouteDispatchAttempt` used by both live and planner loops. Historical attempts persist only `baselineCapacity`, `dispatchSuspended`, and discriminated modifier-impact rows; schema 16 is introduced when that persisted shape first changes.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest 4, Playwright, Bun, existing HPA-278 event framework, HPA-294 logistics core, HPA-574 logistics UI, HPA-297 Supply Planner.

## Global Constraints

- Keep one authoritative `RecurringRoute`; never persist copied effective-route fields or a pre-disruption snapshot.
- Support exactly four route effects: lead-time adjustment, capacity multiplier, dispatch suspension, transport-cost multiplier.
- Manual transfers and already-dispatched transfer orders are unaffected.
- Replacement remains `stackingRule: 'replace'`, scoped by stacking key **and** concrete target.
- Keep exactly three top-level event RNG draws; route target selection uses only the reserved materialization RNG.
- Route count never multiplies an event definition's weight.
- Event selection requires an active/open route; resolution requires only that the materialized route still exists.
- A due event-suspended route records a zero-quantity attempt and advances normal cadence; a player-paused route stays out of the due set.
- `DailyRouteDispatchAttempt.capacity` means effective capacity; `baselineCapacity` owns configuration matching and structural capacity-alert semantics.
- Persist historical modifier attribution; do not reconstruct expired dispatches from live `activeModifiers`.
- Live and planner dispatch loops both call `resolveEffectiveRecurringRoute` and `buildRouteDispatchAttempt`.
- Transport cost uses one route-specific helper in `interCityLogistics.ts`: checked integer base multiplication, one combined multiplier, one final round.
- `route-event-suspended` is one shared `RouteOperationalCondition` inherited by the planner.
- Utilization remains effective-relative and the inspector must expose base/effective capacity beside it.
- Reuse the existing `event-modifier` alert kind; do not add a disruption alert kind.
- Schema 16 is the first schema containing any changed persisted attempt/report shape; schema 15 is rejected with no migration.
- No reliability RNG, shipment failures, rerouting, recall, vehicle/path simulation, generic target DSL, modifier registry, scripting layer, or full live/planner loop refactor.

---

## File structure

### New focused files

- `src/lib/game/eventTargets.ts` — target clone/equality, selection eligibility, resolution existence, concrete target resolution, and route copy context.
- `src/lib/game/eventTargets.spec.ts` — target semantics and copy-context tests.
- `src/lib/game/logisticsRouteModifiers.ts` — active route modifier filtering/composition, resolver contributions, compact persisted impact derivation, and recovery derivation.
- `src/lib/game/logisticsRouteModifiers.spec.ts` — resolver/impact/recovery arithmetic and expiry tests.

### Existing owners to extend

- Event contracts/catalog/materialization: `src/lib/game/types.ts`, `eventDefinitions.ts`, `eventSelection.ts`, `eventCatalog.ts`.
- Modifier lifecycle/resolution: `eventModifiers.ts`, `eventEffects.ts`, `simulateDay.ts`.
- Logistics dispatch/read models: `interCityLogistics.ts`, `logisticsReadModels.ts`, `alerts.ts`, `logisticsReport.testUtils.ts`.
- Planner: `supplyPlannerLogistics.ts`, `supplyPlanner.ts`, their focused specs, `SupplyAdvisor.svelte`.
- Persistence: `src/lib/persistence/saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`, repository specs that use current-schema fixtures.
- Presentation: `ActiveModifiers.svelte`, `LogisticsRouteInspector.svelte`, `WorldLogisticsRoutes.svelte`, `ReportsPanel.svelte` and focused component specs.
- Localization: `src/lib/i18n/gameCopy.ts`, `gameCopy.spec.ts`, `messages/en.ts`, `messages/ja.ts`, `messages/zh-Hant.ts`.
- Navigation/E2E: `src/routes/alertNavigation.ts`, its spec, `retail-sim.e2e.ts`.

---

### Task 1: Add recurring-route targets, deterministic target materialization, and persisted route copy context

**Files:**
- Create: `src/lib/game/eventTargets.ts`
- Create: `src/lib/game/eventTargets.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/eventDefinitions.ts`
- Modify: `src/lib/game/eventSelection.ts`
- Test: `src/lib/game/eventSelection.spec.ts`
- Test: `src/lib/game/eventCatalog.spec.ts`

**Interfaces:**

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

export function getEventTargetCopyParams(
  game: GameState,
  target: EventTarget
): StructuredCopyParams;
```

- [ ] **Step 1: Write target-resolution tests**

Cover company, active route, paused route, removed route, unopened endpoint, and raw route-ID ordering.

```ts
it('selects only active routes with opened endpoints in raw id order', () => {
  const game = gameWithRoutes([
    route({ id: 'route-20', state: 'active', priority: 0 }),
    route({ id: 'route-3', state: 'active', priority: 99 }),
    route({ id: 'route-1', state: 'paused', priority: 0 })
  ]);

  expect(resolveEventTargets(game, { kind: 'recurring-route', state: 'active' })).toEqual([
    { kind: 'recurring-route', routeId: 'route-20' },
    { kind: 'recurring-route', routeId: 'route-3' }
  ]);
});
```

- [ ] **Step 2: Run the focused target test and verify RED**

```bash
bun run test:unit -- --run src/lib/game/eventTargets.spec.ts
```

Expected: fail because route target helpers/types do not exist.

- [ ] **Step 3: Implement the minimum target union and explicit helpers**

```ts
export type EventTarget =
  | { kind: 'company' }
  | { kind: 'recurring-route'; routeId: string };

export type EventTargetSelector =
  | { kind: 'company' }
  | { kind: 'recurring-route'; state: 'active' };
```

`isEventTargetEligibleForSelection` requires active route + opened endpoints. `isEventTargetResolvable` requires only route existence for recurring-route targets. Company is always resolvable.

- [ ] **Step 4: Write definition-level weighting/materialization tests**

Create fixture definitions for one weighted company event and one weighted route event. Assert:

- one route and four routes give the route definition the same authored weight;
- a fixed event RNG state chooses the same concrete route after structured cloning;
- pending/cooldown exclusion is concrete-target-specific;
- `EVENT_SELECTION_SCHEMA_VERSION` and top-level draw count remain unchanged.

- [ ] **Step 5: Refactor `eventSelection.ts` around eligible target sets**

Keep exactly:

```ts
const cadenceDraw = packet.next();
const weightedDraw = packet.next();
const materializationSeedDraw = packet.next();
```

Select the event definition once. Only after a route definition wins, call `materializationRng.next()` once over sorted concrete route targets.

- [ ] **Step 6: Persist stable route copy params during materialization**

Merge:

```ts
{
  routeId,
  originCityId,
  destinationCityId,
  materialId
}
```

into `decision.copy.params`. Test that removing the route after materialization does not erase these IDs.

- [ ] **Step 7: Extend selector validation/cloning**

`eventDefinitions.ts` accepts exactly company and `{ kind: 'recurring-route', state: 'active' }`. Clone through explicit switches.

- [ ] **Step 8: Run focused tests/check and commit**

```bash
bun run test:unit -- --run src/lib/game/eventTargets.spec.ts src/lib/game/eventSelection.spec.ts src/lib/game/eventCatalog.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventTargets.ts src/lib/game/eventTargets.spec.ts src/lib/game/eventDefinitions.ts src/lib/game/eventSelection.ts src/lib/game/eventSelection.spec.ts src/lib/game/eventCatalog.spec.ts
git commit -m "feat(events): add recurring route targets"
```

---

### Task 2: Add route timed effects and make modifier lifecycle target-aware

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/eventDefinitions.ts`
- Modify: `src/lib/game/eventModifiers.ts`
- Modify: `src/lib/game/eventEffects.ts`
- Modify: `src/lib/game/eventSelection.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/components/game/ActiveModifiers.svelte` only enough to compile across the widened union
- Test: `src/lib/game/eventModifiers.spec.ts`
- Test: `src/lib/game/eventEffects.spec.ts`
- Test: `src/lib/game/eventCatalog.spec.ts`
- Test: `src/lib/game/eventSelection.spec.ts`

**Interfaces:**

```ts
activateEventModifiers(
  state: EventRuntimeState,
  source: ActiveEventModifier['source'],
  target: EventTarget,
  day: number,
  templates: readonly EventModifierTemplate[]
): EventModifierActivationResult;
```

Route effects:

```ts
| { kind: 'route-lead-time-adjustment'; days: number }
| { kind: 'route-capacity-multiplier'; multiplier: number }
| { kind: 'route-dispatch-suspension' }
| { kind: 'route-transport-cost-multiplier'; multiplier: number }
```

- [ ] **Step 1: Write catalog/runtime validation tests**

Assert positive safe lead-time days, positive finite multipliers, parameterless suspension, company/import compatibility, and recurring-route/route-effect compatibility.

- [ ] **Step 2: Run validation tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/game/eventEffects.spec.ts
```

- [ ] **Step 3: Extend `EventTimedEffect` and validation switches**

Do not add `effect.target` to route effects; concrete route identity lives in `ActiveEventModifier.target`.

- [ ] **Step 4: Write target-scoped replacement tests**

The same stacking key on `route-1` and `route-2` must coexist. Reapplying it on `route-1` replaces only the old `route-1` modifier.

- [ ] **Step 5: Pass concrete target through modifier activation/snapshots**

Replacement predicate:

```ts
candidate.stackingKey === modifier.stackingKey &&
sameEventTarget(candidate.target, modifier.target)
```

Use discriminated cloning for both `EventTarget` and `EventTimedEffect`.

- [ ] **Step 6: Fix every union-unsafe materialization clone site**

Replace `eventSelection.ts#materializeEvent`'s current assumption:

```ts
{ ...modifier.effect, target: { ...modifier.effect.target } }
```

with the same discriminated timed-effect clone used by the lifecycle path. Add a route-event materialization regression test.

- [ ] **Step 7: Write resolution-time route existence tests**

Materialize a route decision, then:

1. pause the route — resolution **succeeds**, modifier is stored, route remains paused;
2. remove the route — resolution returns `effect-rejected`, immediate cash/modifier state stays unchanged.

```ts
expect(resolveDecision(pausedGame, decision.id, option.id).ok).toBe(true);
expect(resolveDecision(removedGame, decision.id, option.id)).toMatchObject({
  ok: false,
  code: 'effect-rejected'
});
```

- [ ] **Step 8: Replace company-only resolution guard with `isEventTargetResolvable`**

Selection remains active-only. Resolution checks existence only and passes `decision.target` into `activateEventModifiers`.

- [ ] **Step 9: Narrow existing import-cost consumers**

`simulateDay.ts#compileEventModifierRules` includes only `effect.kind === 'import-cost-multiplier'`. Lifecycle cloning and temporary Active Modifiers rendering switch on effect kind rather than reading `.multiplier` unconditionally.

- [ ] **Step 10: Run focused suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventDefinitions.ts src/lib/game/eventModifiers.ts src/lib/game/eventEffects.ts src/lib/game/eventSelection.ts src/lib/game/simulateDay.ts src/lib/components/game/ActiveModifiers.svelte src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts
git commit -m "feat(events): support route modifier effects"
```

---

### Task 3: Centralize disruption dispatch derivation, widen live conditions, and land the complete schema-16 shape

**Files:**
- Create: `src/lib/game/logisticsRouteModifiers.ts`
- Create: `src/lib/game/logisticsRouteModifiers.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/logisticsReadModels.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/logisticsReport.testUtils.ts`
- Modify: `src/lib/game/supplyPlanner.ts` (condition rank only)
- Modify: `src/lib/components/game/SupplyAdvisor.svelte` (condition mapping only)
- Modify: `src/lib/i18n/messages/en.ts` (compile-time condition completeness + new copy key)
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Test: `src/lib/game/interCityLogistics.integration.spec.ts`
- Test: `src/lib/game/logisticsReadModels.spec.ts`
- Test: `src/lib/game/alerts.spec.ts`
- Test: relevant `src/lib/game/simulateDay.spec.ts` cases

**Interfaces:**

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

export function calculateEffectiveRouteTransportCost(input: {
  baseTransportCostPerUnit: number;
  quantity: number;
  transportCostMultiplier: number;
}): number;

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

- [ ] **Step 1: Add the shared test attempt factory before changing the type**

Extend `logisticsReport.testUtils.ts`:

```ts
export function createRouteDispatchAttempt(
  overrides: Partial<DailyRouteDispatchAttempt> = {}
): DailyRouteDispatchAttempt {
  return {
    routeId: 'route-1',
    originCityId: 'industry-city',
    destinationCityId: 'breadbasket-basin',
    materialId: 'grain',
    destinationNeed: 100,
    capacity: 100,
    availableOriginStock: 100,
    dispatchedQuantity: 100,
    unusedCapacity: 0,
    unmetDestinationNeed: 0,
    transportCost: 200,
    transferOrderId: 'transfer-1',
    baselineCapacity: 100,
    dispatchSuspended: false,
    modifierImpacts: [],
    ...overrides
  };
}
```

Move affected spec-local attempt builders/literals to this helper as they are touched.

- [ ] **Step 2: Write resolver tests and verify RED**

Cover unrelated target, inactive day, additive lead time, multiplicative capacity with one final floor/minimum 1, suspension OR, cost multiplier composition, modifier-ID ordering, and overflow rejection.

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts
```

Expected: fail because resolver does not exist.

- [ ] **Step 3: Implement the pure resolver and discriminated in-memory contributions**

Filter route-targeted active modifiers using existing day lifecycle semantics; sort by modifier ID; reduce explicit accumulators. No route mutation and no generic registry.

- [ ] **Step 4: Add shared checked route transport-cost calculation**

Reuse the existing `checkedMultiply` for the base total, then one final round:

```ts
const baseTotal = checkedMultiply(baseTransportCostPerUnit, quantity);
if (baseTotal === null) {
  throw new RangeError('Recurring route transport cost exceeds the safe integer range');
}
const effectiveTotal = Math.round(baseTotal * transportCostMultiplier);
if (!Number.isSafeInteger(effectiveTotal) || effectiveTotal < 0) {
  throw new RangeError('Recurring route transport cost exceeds the safe integer range');
}
return effectiveTotal;
```

Do not add another generic arithmetic dialect.

- [ ] **Step 5: Define compact persisted modifier impacts**

`DailyRouteDispatchAttempt` adds only:

```ts
baselineCapacity: number;
dispatchSuspended: boolean;
modifierImpacts: RouteDispatchModifierImpact[];
```

Keep `capacity` as effective capacity.

Define a discriminated `RouteDispatchModifierImpact` union whose common `contributors` list stores modifier ID, source event/instance/option, and explanation. Effect rows store:

- lead time: baseline/effective lead-time days;
- capacity: baseline/effective capacity and baseline/effective dispatched quantity;
- suspension: baseline quantity and effective zero;
- transport cost: baseline/effective total cost.

Unaffected attempts store `[]`. Group multiple same-kind contributors in deterministic modifier-ID order.

- [ ] **Step 6: Write builder tests, then implement `buildRouteDispatchAttempt`**

Tests prove:

- base route 100 + ×0.75 resolves `baselineCapacity=100`, `capacity=75`;
- the capacity impact records baseline/effective shipped units;
- suspension records baseline shipped units → 0 and zero actual cost;
- cost multiplier compares totals using the actual dispatched quantity;
- no modifiers returns `modifierImpacts=[]`;
- live/planner callers no longer need to duplicate baseline/effective/suspension derivation.

- [ ] **Step 7: Integrate live recurring dispatch through resolver + builder**

Keep due-route ordering and inventory/order plumbing in `processRecurringRouteDispatches`. Replace route-specific quantity/cost/evidence derivation with:

```ts
const effective = resolveEffectiveRecurringRoute(route, nextGame.events.activeModifiers, closingDay);
const built = buildRouteDispatchAttempt({
  route,
  effective,
  destinationNeed,
  availableOriginStock
});
```

When `built.dispatchedQuantity > 0`, create the immutable transfer order with `effective.leadTimeDays`, then attach its ID to `built.attempt`. Event suspension still advances cadence.

- [ ] **Step 8: Widen live condition/read-model semantics and lock utilization meaning**

Add `route-event-suspended` to `RouteOperationalCondition` and classify it before stock/capacity conditions.

Change `attemptMatchesRoute` to compare current base capacity with `attempt.baselineCapacity`.

Keep:

```ts
utilization = latestAttempt.dispatchedQuantity / latestAttempt.capacity;
```

Add tests proving a fully saturated ×0.75 attempt is 100% utilized **relative to effective capacity**, while the summary exposes base/effective capacity separately for presentation.

- [ ] **Step 9: Keep normal structural capacity alerts disruption-safe**

Capacity-streak evidence requires:

```ts
!attempt.dispatchSuspended &&
attempt.availableOriginStock >= Math.min(attempt.destinationNeed, attempt.baselineCapacity) &&
attempt.unmetDestinationNeed > 0 &&
attempt.dispatchedQuantity === attempt.baselineCapacity
```

Write tests proving two ×0.75 saturated disruption attempts do not emit `logistics-route-capacity`, while two undisrupted base-capacity-saturated attempts still do.

Origin-stock alerts use current effective capacity from the resolved route summary.

- [ ] **Step 10: Widen planner/UI condition exhaustiveness in the same checkpoint**

Add `'route-event-suspended'` to `SUPPLY_PLANNER_ROUTE_CONDITION_RANK` **now**, before Task 5 planner behavior.

Add the `SupplyAdvisor.svelte` route-condition message mapping/case now so `bun run check` remains green.

Bind copy to the domain at compile time:

```ts
conditions: {
  'awaiting-dispatch': 'Awaiting dispatch',
  'destination-full': 'Destination full',
  'origin-stock-constrained': 'Origin stock constrained',
  'route-capacity-constrained': 'Route capacity constrained',
  'route-event-suspended': 'Suspended by event',
  normal: 'Normal'
} satisfies Record<RouteOperationalCondition, string>
```

Because Supply Advisor's existing locale keys are camelCase, use a typed message-key map rather than renaming all locale keys:

```ts
const ROUTE_CONDITION_MESSAGE_KEY = {
  'awaiting-dispatch': 'supplyAdvisor.logistics.conditions.awaitingDispatch',
  normal: 'supplyAdvisor.logistics.conditions.normal',
  'destination-full': 'supplyAdvisor.logistics.conditions.destinationFull',
  'origin-stock-constrained': 'supplyAdvisor.logistics.conditions.originStockConstrained',
  'route-capacity-constrained': 'supplyAdvisor.logistics.conditions.routeCapacityConstrained',
  'route-event-suspended': 'supplyAdvisor.logistics.conditions.routeEventSuspended',
  'route-priority-constrained': 'supplyAdvisor.logistics.conditions.routePriorityConstrained',
  'route-frequency': 'supplyAdvisor.logistics.conditions.routeFrequency',
  'route-lead-time': 'supplyAdvisor.logistics.conditions.routeLeadTime',
  'route-paused': 'supplyAdvisor.logistics.conditions.routePaused'
} satisfies Record<SupplyPlannerRouteCondition, string>;
```

Add matching en/ja/zh-Hant copy.

- [ ] **Step 11: Land the complete strict schema-16 structure now**

Set:

```ts
export const SAVE_SCHEMA_VERSION = 16;
```

Update current-schema codec validation for:

- route event target/selector payloads that can be persisted;
- all four route timed effects;
- `baselineCapacity`, `dispatchSuspended`, `modifierImpacts` exact keys and discriminated invariants;
- `modifierRecoveries` on every `DailyLogisticsReport`.

Introduce the recovery union/codec shape now and have `simulateDay` emit `modifierRecoveries: []` until Task 4 fills it. Do **not** add a new required persisted key later under the same schema version.

Schema 15 fixtures must be rejected; no migration helper is added.

- [ ] **Step 12: Run focused persistence/live suites, check, then commit**

```bash
bun run test:unit -- --run \
  src/lib/game/logisticsRouteModifiers.spec.ts \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/components/game/SupplyAdvisor.svelte.spec.ts
bun run check
git add src/lib/game src/lib/components/game/SupplyAdvisor.svelte src/lib/i18n/messages src/lib/persistence
git commit -m "feat(logistics): apply route disruptions"
```

This checkpoint must be independently type-correct and must write truthful schema-16 saves.

---

### Task 4: Derive and report deterministic recovery without changing the schema shape

**Files:**
- Modify: `src/lib/game/logisticsRouteModifiers.ts`
- Modify: `src/lib/game/logisticsRouteModifiers.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: relevant `src/lib/game/simulateDay.spec.ts` cases
- Test: persistence round-trip remains in `saveCodec.spec.ts`

**Interfaces:**

```ts
export function buildRouteModifierRecoveries(input: {
  routes: readonly RecurringRoute[];
  beforeExpiry: readonly ActiveEventModifier[];
  afterExpiry: readonly ActiveEventModifier[];
  closingDay: number;
}): DailyRouteModifierRecovery[];
```

- [ ] **Step 1: Write recovery tests**

Cover each effect kind, multiple same-kind contributors, edited base route, removed route, and no-op expiry where another modifier leaves the same effective value.

- [ ] **Step 2: Run focused recovery tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts
```

- [ ] **Step 3: Implement pure discriminated recovery derivation**

Compare each still-existing route with pre-expiry and post-expiry modifier sets. Emit one row only when that effect-kind value changes. Never restore route state.

- [ ] **Step 4: Attach recovery rows in `simulateDay.ts`**

Capture active modifiers before expiry, run the existing expiry lifecycle, then call `buildRouteModifierRecoveries`. Set the already-present schema-16 `report.logistics.modifierRecoveries` field.

- [ ] **Step 5: Verify route edit/removal behavior**

Tests must prove:

- edit during disruption → recovery reveals the edited base;
- removed route → generic modifier lifecycle expires but logistics recovery array has no fabricated row.

- [ ] **Step 6: Run focused suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/simulateDay.spec.ts src/lib/persistence/saveCodec.spec.ts
bun run check
git add src/lib/game/logisticsRouteModifiers.ts src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat(logistics): report disruption recovery"
```

---

### Task 5: Project route modifiers through the Supply Planner using the shared builder

**Files:**
- Modify: `src/lib/game/supplyPlannerLogistics.ts`
- Modify: `src/lib/game/supplyPlannerLogistics.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

**Interfaces:**
- Consumes `resolveEffectiveRecurringRoute`, `buildRouteDispatchAttempt`, and `calculateEffectiveRouteTransportCost` from Tasks 3–4.
- `SupplyPlannerLogisticsSnapshot` copies only active route-targeted modifiers needed for dated projection.

- [ ] **Step 1: Write planner snapshot tests**

Assert the snapshot copies route-targeted active modifiers but not company import-cost modifiers, event RNG/cooldowns/history, or precomputed effective routes.

- [ ] **Step 2: Write projected dispatch tests**

Cover:

- capacity ×0.75;
- +1 lead time;
- ×1.5 transport cost;
- suspension advances projected cadence with zero order;
- modifier expiry inside 30 days restores base behavior;
- route edit/base fields remain the projection's authoritative route state.

- [ ] **Step 3: Run focused planner tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts
```

- [ ] **Step 4: Extend planner snapshot with copied route modifiers**

Deep-copy only route-targeted modifier fields used by the resolver. Do not copy the entire `EventRuntimeState`.

- [ ] **Step 5: Replace planner-local disruption derivation with shared resolver + builder**

Inside `processSupplyPlannerRouteDispatches`:

```ts
const effective = resolveEffectiveRecurringRoute(route, state.routeModifiers, day);
const built = buildRouteDispatchAttempt({
  route,
  effective,
  destinationNeed,
  availableOriginStock
});
```

Keep planner-local integer inventories, order creation, sequence, and warehouse bookkeeping. Attach the projected transfer ID to the shared attempt result.

- [ ] **Step 6: Remove duplicate planner transport-cost math if now unused**

Delete the private planner copy of checked route cost calculation only after all callers use `calculateEffectiveRouteTransportCost` through the shared builder.

- [ ] **Step 7: Assert planner/live structural parity by shared output shape**

Tests compare representative live/planner attempts for the same route/modifier/day and assert matching `baselineCapacity`, effective `capacity`, suspension, quantity, cost, and `modifierImpacts`. This is a regression check on integration, not the primary mechanism for keeping two derivations synchronized—the shared builder is.

- [ ] **Step 8: Run planner + live suites/check and commit**

```bash
bun run test:unit -- --run \
  src/lib/game/supplyPlannerLogistics.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/interCityLogistics.integration.spec.ts
bun run check
git add src/lib/game/supplyPlannerLogistics.ts src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project route disruptions"
```

---

### Task 6: Surface route disruption through existing UI, report, alert, and navigation seams

**Files:**
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/components/game/ActiveModifiers.svelte`
- Modify: `src/lib/components/game/ActiveModifiers.svelte.spec.ts`
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte`
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/WorldLogisticsRoutes.svelte`
- Modify: `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/DecisionQueue.svelte.spec.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/routes/alertNavigation.ts`
- Modify: `src/routes/alertNavigation.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

- [ ] **Step 1: Write decision localization tests for concrete route copy**

Use a materialized route decision whose route has been removed from live state. Assert title/context/option description still include localized origin, destination, and material derived from persisted IDs.

- [ ] **Step 2: Pass event copy params through option localization**

`localizeEventDecisionOption` must use the same enriched params as event title/context translation. Do not make `DecisionQueue.svelte` query route state directly.

- [ ] **Step 3: Write Active Modifiers route-effect tests**

Cover all four effect kinds. Route modifiers show endpoints/material, base → effective value, event source, and remaining duration. Company import-cost modifier rendering remains unchanged.

- [ ] **Step 4: Extend route inspector while keeping utilization effective-relative**

Show:

- configured/base capacity;
- current effective capacity;
- current base/effective lead time/cost when changed;
- `route-event-suspended` condition;
- latest historical `modifierImpacts`;
- explicit copy that utilization is relative to available/effective capacity.

Do not add a second utilization ratio.

- [ ] **Step 5: Add non-color world-route disruption state**

Set:

```svelte
data-disrupted={summary.disruptionActive ? 'true' : 'false'}
```

and add a visual cue independent of color. Keep existing geometry and route selection.

- [ ] **Step 6: Render persisted disruption impacts and recoveries in Reports**

Switch on the discriminated unions. Historical report rows use persisted attribution and never require the modifier to remain active.

- [ ] **Step 7: Reuse `event-modifier` for actionable route alerts**

Do **not** add a new alert kind.

In the existing important-modifier branch:

```ts
if (modifier.target.kind === 'recurring-route') {
  const routeExists = game.logistics.recurringRoutes.some(
    (route) => route.id === modifier.target.routeId
  );
  if (!routeExists) continue;

  alerts.push({
    id: `event-modifier:${modifier.id}`,
    kind: 'event-modifier',
    modifierId: modifier.id,
    routeId: modifier.target.routeId
  });
  continue;
}
```

Company important modifiers retain `managementPanelId: 'decisions'`.

- [ ] **Step 8: Route existing event-modifier alerts to the world route**

Extend `resolveAlertNavigation` so `alert.kind === 'event-modifier' && alert.routeId` returns the existing `{ kind: 'world-route', routeId }` result before panel navigation.

- [ ] **Step 9: Run focused UI/i18n/alert tests and commit**

```bash
bun run test:unit -- --run \
  src/lib/i18n/gameCopy.spec.ts \
  src/lib/components/game/ActiveModifiers.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/components/game/DecisionQueue.svelte.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/routes/alertNavigation.spec.ts
bun run check
git add src/lib/i18n src/lib/components/game src/lib/game/alerts.ts src/lib/game/alerts.spec.ts src/routes/alertNavigation.ts src/routes/alertNavigation.spec.ts
git commit -m "feat(logistics): surface route disruptions"
```

---

### Task 7: Add the production freight-disruption event and own the event-mix change

**Files:**
- Modify: `src/lib/game/eventCatalog.ts`
- Modify: `src/lib/game/eventCatalog.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts` as needed for production copy

**Production definition:**

```ts
{
  id: 'freight-disruption',
  version: 1,
  selection: { kind: 'weighted', weight: 1 },
  condition: { kind: 'always' },
  target: { kind: 'recurring-route', state: 'active' },
  expiresAfterDays: 2,
  cooldownDays: 7,
  // localized copy + three options below
}
```

Options:

1. `accept-delay`: +1 lead-time day and ×0.75 capacity for 3 days.
2. `charter-carriers`: immediate cash -2,000, ×1.25 capacity and ×1.5 transport cost for 2 days.
3. `suspend-shipments`: dispatch suspension for 2 days.

- [ ] **Step 1: Write production catalog tests**

Assert exact production IDs now include `freight-disruption`, route selector is active-only, cooldown is 7, all stacking keys are stable, and no unsupported effect kind enters the bundle.

- [ ] **Step 2: Write production option tests**

Assert exact option ordering/payloads and that each option has one primary `importance: 'important'` route modifier for the existing actionable alert path. Secondary modifiers in multi-effect options are `normal`, preventing duplicate top-bar alerts from the same response while still appearing in Active Modifiers.

Recommended importance ownership:

- `accept-delay`: lead-time important, capacity normal;
- `charter-carriers`: transport-cost important, capacity normal;
- `suspend-shipments`: suspension important.

Durations inside each option are identical, so the one important modifier covers the whole response window.

- [ ] **Step 3: Encode the deliberate weighted-event balance in a test/comment**

When a route is eligible, `supplier-terms` weight 1 and `freight-disruption` weight 1 share the existing weighted-event selection evenly. The global cadence is unchanged. Route count does not alter either definition's weight.

Add a selection test demonstrating one eligible route versus several eligible routes leaves the 1:1 definition weights unchanged.

- [ ] **Step 4: Add route-aware decision/modifier copy in all locales**

Copy names the concrete origin → destination/material and makes each option's duration/trade-off clear before resolution.

- [ ] **Step 5: Run catalog/i18n/selection suites and commit**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts src/lib/i18n/gameCopy.spec.ts
bun run check
git add src/lib/game/eventCatalog.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts src/lib/i18n
git commit -m "feat(events): add freight disruption event"
```

---

### Task 8: Cover the complete lifecycle and run final gates

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only focused fixture/helper files required by the deterministic current-schema save injection

- [ ] **Step 1: Add deterministic current-schema E2E setup**

Inject a schema-16 sandbox state with:

- two opened industry cities;
- a valid active recurring route;
- enough origin stock/destination capacity/cash;
- deterministic event runtime state that materializes `freight-disruption` for that route.

Do not add an E2E-only production command.

- [ ] **Step 2: Assert the unresolved decision names its concrete route**

Before resolving, verify visible decision/option copy includes the expected origin, destination, and material.

- [ ] **Step 3: Resolve a disruption and assert active presentation**

Verify Active Modifiers shows the effect and the world route exposes:

```text
data-disrupted="true"
```

Verify the existing event-modifier alert navigates to that route.

- [ ] **Step 4: Close through an affected dispatch**

Assert the resulting order uses adjusted arrival/cost as appropriate and the latest report carries the compact historical `modifierImpacts` evidence.

- [ ] **Step 5: Edit and pause/resume while the modifier is active**

Assert pausing does not delete the modifier or create restoration state; resuming reuses current base route + still-active modifier. An unresolved decision paused before resolution remains resolvable.

- [ ] **Step 6: Close through expiry and assert recovery**

Assert:

- existing in-transit order stays immutable;
- current effective route returns to the **edited** base route;
- recovery row appears for the still-existing route;
- `data-disrupted` clears;
- no stale route restoration occurs.

- [ ] **Step 7: Run targeted E2E first**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts --grep "freight disruption"
```

Expected: targeted lifecycle passes.

- [ ] **Step 8: Run all focused unit/component suites**

```bash
bun run test:unit -- --run \
  src/lib/game/eventTargets.spec.ts \
  src/lib/game/eventSelection.spec.ts \
  src/lib/game/eventCatalog.spec.ts \
  src/lib/game/eventModifiers.spec.ts \
  src/lib/game/eventEffects.spec.ts \
  src/lib/game/logisticsRouteModifiers.spec.ts \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/game/supplyPlannerLogistics.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/i18n/gameCopy.spec.ts
```

Expected: all focused suites pass.

- [ ] **Step 9: Run full repository gates**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
bun run build
git diff --check origin/main...HEAD
```

Expected:

- Svelte/TypeScript check: zero errors/warnings;
- lint/format: pass;
- complete unit suite: pass;
- complete Playwright suite: pass;
- production build: pass;
- diff whitespace check: pass.

- [ ] **Step 10: Run explicit scope/consistency audits**

```bash
git grep -n "event-suspend" -- src docs
git grep -n "checkedRoundedProduct" -- src/lib/game
git grep -n "Math.random\|rngState" -- src/lib/game/logisticsRouteModifiers.ts src/lib/game/interCityLogistics.ts
git grep -n "effectiveRoute\|effective.*Route" -- src/lib/game src/routes
git grep -n "SAVE_SCHEMA_VERSION.*15\|schemaVersion.*15" -- src/lib src/routes
```

Review expectations:

- every suspension spelling is `route-event-suspended` / `route-dispatch-suspension`; no accidental alternate domain ID exists;
- no generic rounded-product helper exists;
- no logistics RNG path was introduced;
- any `effectiveRoute` match is a derived local/read model, never persisted authoritative state;
- schema-15 references are rejection fixtures only, not migration support.

- [ ] **Step 11: Perform final whole-branch review**

Verify against the design acceptance criteria:

- definition-level weighting and reserved materialization RNG;
- selection active-only, resolution existence-only;
- target-scoped replacement;
- shared resolver **and** shared dispatch-attempt builder;
- event suspension advances cadence;
- compact historical modifier attribution survives expiry;
- `baselineCapacity` protects structural capacity alerts;
- utilization remains effective-relative and is explained in the inspector;
- route event alerts reuse `event-modifier` + world-route navigation;
- schema 16 is introduced once, with the complete required shape and no migration;
- planner expires modifiers by projected day;
- route edits survive expiry without restoration snapshots;
- production weight-1 freight disruption deliberately shares weighted-event selections 1:1 with supplier terms when eligible.

- [ ] **Step 12: Commit final lifecycle/gate work**

```bash
git add src/routes/retail-sim.e2e.ts
# Add only deterministic fixture/helper files intentionally changed for this lifecycle.
git commit -m "test(logistics): cover disruption recovery lifecycle"
```

---

## Expected implementation commit sequence

1. `feat(events): add recurring route targets`
2. `feat(events): support route modifier effects`
3. `feat(logistics): apply route disruptions`
4. `feat(logistics): report disruption recovery`
5. `feat(supply): project route disruptions`
6. `feat(logistics): surface route disruptions`
7. `feat(events): add freight disruption event`
8. `test(logistics): cover disruption recovery lifecycle`

Each checkpoint must pass its focused suites and `bun run check` before the next checkpoint. Full lint/unit/E2E/build gates run at the end.
