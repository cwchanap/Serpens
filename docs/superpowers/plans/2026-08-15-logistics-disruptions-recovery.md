# Event-Driven Logistics Disruptions and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-296 so strategic events deterministically target recurring logistics routes, temporarily alter future scheduled dispatches, preserve historical attribution, recover cleanly, and project the same behavior through the Supply Planner.

**Architecture:** `RecurringRoute` remains the only editable route state. `eventTargets.ts` owns target semantics; `logisticsRouteModifiers.ts` owns dated modifier composition; `interCityLogistics.ts` owns checked route-cost arithmetic and a pure `buildRouteDispatchAttempt` shared by live and planner loops. Historical attempts add only `baselineCapacity`, `dispatchSuspended`, and discriminated `modifierImpacts`; schema 16 lands when that persisted shape first changes.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest 4, Playwright, Bun, existing HPA-278 event framework, HPA-294 logistics core, HPA-574 logistics UI, HPA-297 Supply Planner.

## Global Constraints

- Keep one authoritative `RecurringRoute`; no copied effective-route fields or pre-disruption snapshot.
- Support exactly four route effects: lead-time adjustment, capacity multiplier, dispatch suspension, transport-cost multiplier.
- Manual transfers and already-dispatched transfer orders are unaffected.
- Replacement remains `stackingRule: 'replace'`, scoped by stacking key + concrete target.
- Keep exactly three top-level event RNG draws; route selection uses only the reserved materialization RNG.
- Route count never multiplies event-definition weight.
- Selection requires active/open route; resolution requires only that the materialized route still exists.
- Event suspension advances a due route's cadence; player pause keeps the route out of the due set.
- `DailyRouteDispatchAttempt.capacity` means effective capacity; `baselineCapacity` owns base-configuration matching and structural capacity-alert semantics.
- Historical modifier attribution is persisted; never reconstruct an expired dispatch from live `activeModifiers`.
- Live and planner loops both call `resolveEffectiveRecurringRoute` and `buildRouteDispatchAttempt`.
- Route cost uses one helper in `interCityLogistics.ts`: checked integer base multiplication, one combined multiplier, one final round.
- `route-event-suspended` is one shared `RouteOperationalCondition` inherited by the planner.
- Utilization stays effective-relative; inspector copy must show base/effective capacity beside it.
- Reuse `event-modifier` alerts; do not add a disruption alert kind.
- Schema 16 is introduced with the complete new required persisted shape; schema 15 is rejected with no migration.
- No reliability RNG, shipment failure, rerouting, recall, vehicle/path simulation, generic target DSL, modifier registry, scripting layer, second incident engine, or full live/planner loop refactor.

---

## File structure

### New focused files

- `src/lib/game/eventTargets.ts` — clone/equality, selection eligibility, resolution existence, target resolution, route copy params.
- `src/lib/game/eventTargets.spec.ts` — target semantics and copy context.
- `src/lib/game/logisticsRouteModifiers.ts` — route modifier resolver, in-memory contributions, persisted impact derivation, recovery derivation.
- `src/lib/game/logisticsRouteModifiers.spec.ts` — resolver/impact/recovery arithmetic and expiry.

### Existing owners to extend

- Events: `types.ts`, `eventDefinitions.ts`, `eventSelection.ts`, `eventCatalog.ts`, `eventModifiers.ts`, `eventEffects.ts`.
- Logistics: `interCityLogistics.ts`, `logisticsReadModels.ts`, `alerts.ts`, `logisticsReport.testUtils.ts`, `simulateDay.ts`.
- Planner: `supplyPlannerLogistics.ts`, `supplyPlanner.ts`, `SupplyAdvisor.svelte` and focused specs.
- Persistence: `saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`, current-schema repository fixtures.
- UI: `ActiveModifiers.svelte`, `LogisticsRouteInspector.svelte`, `WorldLogisticsRoutes.svelte`, `ReportsPanel.svelte`, `DecisionQueue.svelte` specs.
- Localization: `gameCopy.ts`, `gameCopy.spec.ts`, `messages/en.ts`, `messages/ja.ts`, `messages/zh-Hant.ts`.
- Navigation/E2E: `alertNavigation.ts`, its spec, `retail-sim.e2e.ts`.

---

### Task 1: Add recurring-route targets, deterministic materialization, and persisted route copy context

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
export function resolveEventTargets(game: GameState, selector: EventTargetSelector): EventTarget[];
export function isEventTargetEligibleForSelection(game: GameState, target: EventTarget): boolean;
export function isEventTargetResolvable(game: GameState, target: EventTarget): boolean;
export function sameEventTarget(left: EventTarget, right: EventTarget): boolean;
export function cloneEventTarget(target: EventTarget): EventTarget;
export function getEventTargetCopyParams(game: GameState, target: EventTarget): StructuredCopyParams;
```

- [ ] **Step 1: Write target-resolution tests**

Cover company, active route, paused route, missing route, unopened endpoint, and raw route-ID ordering.

```ts
it('resolves active opened routes in raw id order', () => {
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

Expected: module/route target types do not exist.

- [ ] **Step 3: Implement the minimum target union and helpers**

```ts
export type EventTarget =
  | { kind: 'company' }
  | { kind: 'recurring-route'; routeId: string };

export type EventTargetSelector =
  | { kind: 'company' }
  | { kind: 'recurring-route'; state: 'active' };
```

Selection eligibility = route exists + active + opened endpoints. Resolution eligibility = route exists. Company is always resolvable.

- [ ] **Step 4: Write definition-level weighting/materialization tests**

Assert:

- one route and four routes give the route definition the same authored weight;
- fixed event RNG state chooses the same concrete route after structured cloning;
- pending/cooldown exclusion is concrete-target-specific;
- top-level draw count and `EVENT_SELECTION_SCHEMA_VERSION` remain unchanged.

- [ ] **Step 5: Refactor event selection around eligible target sets**

Keep exactly:

```ts
const cadenceDraw = packet.next();
const weightedDraw = packet.next();
const materializationSeedDraw = packet.next();
```

Select the definition once; only then spend one `materializationRng.next()` for a route target.

- [ ] **Step 6: Persist stable route IDs into decision copy params**

Merge:

```ts
{ routeId, originCityId, destinationCityId, materialId }
```

into materialized `decision.copy.params`. Test that removing the route later does not erase those IDs.

- [ ] **Step 7: Extend selector validation/cloning**

Accept exactly company and `{ kind: 'recurring-route', state: 'active' }`; clone with switches.

- [ ] **Step 8: Run focused suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/eventTargets.spec.ts src/lib/game/eventSelection.spec.ts src/lib/game/eventCatalog.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventTargets.ts src/lib/game/eventTargets.spec.ts src/lib/game/eventDefinitions.ts src/lib/game/eventSelection.ts src/lib/game/eventSelection.spec.ts src/lib/game/eventCatalog.spec.ts
git commit -m "feat(events): add recurring route targets"
```

---

### Task 2: Add route timed effects and target-aware modifier lifecycle

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/eventDefinitions.ts`
- Modify: `src/lib/game/eventModifiers.ts`
- Modify: `src/lib/game/eventEffects.ts`
- Modify: `src/lib/game/eventSelection.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/components/game/ActiveModifiers.svelte` only enough to compile safely across the new union
- Test: `eventModifiers.spec.ts`, `eventEffects.spec.ts`, `eventCatalog.spec.ts`, `eventSelection.spec.ts`

**Interface change:**

```ts
activateEventModifiers(
  state: EventRuntimeState,
  source: ActiveEventModifier['source'],
  target: EventTarget,
  day: number,
  templates: readonly EventModifierTemplate[]
): EventModifierActivationResult;
```

- [ ] **Step 1: Write validation tests for the four route effects**

```ts
| { kind: 'route-lead-time-adjustment'; days: number }
| { kind: 'route-capacity-multiplier'; multiplier: number }
| { kind: 'route-dispatch-suspension' }
| { kind: 'route-transport-cost-multiplier'; multiplier: number }
```

Validate positive safe days, positive finite multipliers, parameterless suspension, and target/effect compatibility.

- [ ] **Step 2: Run validation tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/game/eventEffects.spec.ts
```

- [ ] **Step 3: Extend the effect union and explicit validator switches**

Do not add `effect.target` to route effects; concrete route identity is `ActiveEventModifier.target`.

- [ ] **Step 4: Write target-scoped replacement tests**

Same stacking key on route-1 and route-2 coexists. Reapplying route-1 replaces only route-1.

- [ ] **Step 5: Pass/clone the concrete target through activation and snapshots**

```ts
candidate.stackingKey === modifier.stackingKey &&
sameEventTarget(candidate.target, modifier.target)
```

- [ ] **Step 6: Fix every union-unsafe timed-effect clone now**

Replace `materializeEvent`'s assumption that all effects own `.target`; use one discriminated clone helper shared with modifier lifecycle code. Add a route-event materialization regression.

- [ ] **Step 7: Write resolution existence tests**

Pause after materialization → resolution succeeds and modifier is stored. Remove after materialization → resolution returns `effect-rejected` and commits nothing.

- [ ] **Step 8: Replace company-only resolution guard with `isEventTargetResolvable`**

Selection remains active-only; resolution checks existence only.

- [ ] **Step 9: Narrow existing import-cost consumers**

`compileEventModifierRules` includes only `import-cost-multiplier`; snapshot/render code switches on effect kind.

- [ ] **Step 10: Run focused suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts
bun run check
git add src/lib/game src/lib/components/game/ActiveModifiers.svelte
git commit -m "feat(events): support route modifier effects"
```

---

### Task 3: Centralize disruption dispatch derivation, widen live conditions, and land complete schema 16

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
- Modify: `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`
- Modify: `src/lib/persistence/saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`
- Test: `interCityLogistics.integration.spec.ts`, `logisticsReadModels.spec.ts`, `alerts.spec.ts`, relevant `simulateDay.spec.ts`, `SupplyAdvisor.svelte.spec.ts`

**Interfaces:**

```ts
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

- [ ] **Step 1: Introduce the shared attempt test factory using the current shape**

Before widening `DailyRouteDispatchAttempt`, extend `logisticsReport.testUtils.ts` with only today's fields:

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
    ...overrides
  };
}
```

Move touched spec-local attempt builders/literals to this helper.

- [ ] **Step 2: Write resolver tests and verify RED**

Cover unrelated targets, inactive day, additive lead time, multiplicative capacity with one final floor/minimum 1, suspension OR, cost composition, modifier-ID ordering, and overflow rejection.

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts
```

- [ ] **Step 3: Implement the pure resolver**

Filter matching route-targeted active modifiers, sort by modifier ID, and reduce explicit effect accumulators. No route mutation or registry.

- [ ] **Step 4: Add shared checked route transport-cost calculation**

```ts
const baseTotal = checkedMultiply(baseTransportCostPerUnit, quantity);
if (baseTotal === null) throw new RangeError('Recurring route transport cost exceeds the safe integer range');
const effectiveTotal = Math.round(baseTotal * transportCostMultiplier);
if (!Number.isSafeInteger(effectiveTotal) || effectiveTotal < 0) {
  throw new RangeError('Recurring route transport cost exceeds the safe integer range');
}
return effectiveTotal;
```

Do not add `checkedRoundedProduct`.

- [ ] **Step 5: Widen attempt evidence and update the shared factory in the same edit**

Add only:

```ts
baselineCapacity: number;
dispatchSuspended: boolean;
modifierImpacts: RouteDispatchModifierImpact[];
```

Keep `capacity` as effective capacity. Immediately update `createRouteDispatchAttempt` defaults:

```ts
baselineCapacity: 100,
dispatchSuspended: false,
modifierImpacts: [],
```

Define `RouteDispatchModifierImpact` as a discriminated union:

- lead time → baseline/effective lead-time days;
- capacity → baseline/effective capacity and baseline/effective dispatched quantity;
- suspension → baseline quantity and effective zero;
- cost → baseline/effective total cost.

Each row contains deterministic `contributors` with modifier ID, source event/instance/option, and explanation. Unaffected attempts store `[]`.

- [ ] **Step 6: Write builder tests and implement `buildRouteDispatchAttempt`**

Assert:

- 100 base capacity + ×0.75 → baseline 100, effective 75;
- capacity impact records baseline/effective shipped quantity;
- suspension records baseline quantity → 0 and zero actual cost;
- cost multiplier compares totals using actual dispatched quantity;
- no modifiers → empty impact array.

The builder owns all new baseline/effective/suspension derivation for both loops.

- [ ] **Step 7: Integrate live recurring dispatch through resolver + builder**

Keep due-route ordering and inventory/order mutation local. Use effective lead time for the order and attach its ID to the built attempt. A suspended due route creates no order but advances cadence.

- [ ] **Step 8: Widen live condition/read-model semantics and lock utilization**

Add `route-event-suspended` before stock/capacity classification. `attemptMatchesRoute` compares current base capacity with `baselineCapacity`.

Keep:

```ts
utilization = latestAttempt.dispatchedQuantity / latestAttempt.capacity;
```

Test a fully saturated ×0.75 attempt as 100% utilized relative to effective capacity and expose base/effective capacity in the summary for UI.

- [ ] **Step 9: Protect structural capacity alerts from temporary effects**

```ts
!attempt.dispatchSuspended &&
attempt.availableOriginStock >= Math.min(attempt.destinationNeed, attempt.baselineCapacity) &&
attempt.unmetDestinationNeed > 0 &&
attempt.dispatchedQuantity === attempt.baselineCapacity
```

Two ×0.75 saturated attempts must not emit `logistics-route-capacity`; two undisrupted base-capacity-saturated attempts still do. Origin-stock threshold uses current effective capacity.

- [ ] **Step 10: Widen planner/UI condition exhaustiveness now**

The same checkpoint that adds the shared condition also adds this exact planner rank entry:

```ts
'route-event-suspended': 5,
```

This is above priority/paused (4), capacity/stock (3), timing (2), destination full (1), normal (0), and awaiting (-1).

Add the Supply Advisor mapping/case now so Task 3's `bun run check` can pass.

Bind English logistics condition copy directly:

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

Supply Advisor's locale keys are camelCase, so keep them and add a typed domain-to-message map:

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

Add `routeEventSuspended` copy in en/ja/zh-Hant.

- [ ] **Step 11: Land the complete schema-16 required structure**

Set `SAVE_SCHEMA_VERSION = 16` in this checkpoint.

Validate exact keys/invariants for:

- route event targets/effects;
- `baselineCapacity`, `dispatchSuspended`, discriminated `modifierImpacts`;
- `modifierRecoveries` on every `DailyLogisticsReport`.

Introduce the recovery union and have `simulateDay` emit `modifierRecoveries: []` until Task 4 fills it. No later task may add another required persisted key under schema 16.

Schema 15 fixtures are rejection cases only; no migration helper.

- [ ] **Step 12: Run focused suites/check and commit**

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

---

### Task 4: Derive deterministic recovery without changing schema shape

**Files:**
- Modify: `logisticsRouteModifiers.ts`, its spec, `simulateDay.ts`, focused `simulateDay.spec.ts`

**Interface:**

```ts
export function buildRouteModifierRecoveries(input: {
  routes: readonly RecurringRoute[];
  beforeExpiry: readonly ActiveEventModifier[];
  afterExpiry: readonly ActiveEventModifier[];
  closingDay: number;
}): DailyRouteModifierRecovery[];
```

- [ ] **Step 1: Write recovery tests**

Cover all four effect kinds, edited base route, multiple same-kind contributors, removed route, and no-op expiry where another modifier preserves the effective value.

- [ ] **Step 2: Verify RED**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts
```

- [ ] **Step 3: Implement pure discriminated recovery derivation**

Compare still-existing routes before/after expiry and emit only changed effect-kind rows. Never restore state.

- [ ] **Step 4: Attach rows in `simulateDay.ts`**

Capture pre-expiry modifiers, run existing expiry, derive recoveries, populate the already-schema-16 `modifierRecoveries` key.

- [ ] **Step 5: Test edit/removal behavior**

Edit during disruption → recovery reveals edited base. Removed route → lifecycle expires, no logistics recovery row.

- [ ] **Step 6: Run suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/simulateDay.spec.ts src/lib/persistence/saveCodec.spec.ts
bun run check
git add src/lib/game/logisticsRouteModifiers.ts src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat(logistics): report disruption recovery"
```

---

### Task 5: Project route modifiers through the Supply Planner with the shared builder

**Files:**
- Modify: `supplyPlannerLogistics.ts`, its spec, `supplyPlanner.ts`, `supplyPlanner.spec.ts`

- [ ] **Step 1: Write planner snapshot tests**

Copy route-targeted active modifiers only; do not copy company modifiers, event RNG/cooldowns/history, or precomputed effective routes.

- [ ] **Step 2: Write projected dispatch tests**

Cover capacity, lead time, cost, suspension cadence, expiry inside 30 days, and edited base values.

- [ ] **Step 3: Verify RED**

```bash
bun run test:unit -- --run src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts
```

- [ ] **Step 4: Copy route-targeted modifiers into the planner snapshot**

Deep-copy only fields required by `resolveEffectiveRecurringRoute`.

- [ ] **Step 5: Use shared resolver + builder in planner dispatch**

```ts
const effective = resolveEffectiveRecurringRoute(route, state.routeModifiers, day);
const built = buildRouteDispatchAttempt({ route, effective, destinationNeed, availableOriginStock });
```

Keep planner inventory/order/sequence bookkeeping local; attach projected transfer ID after order creation.

- [ ] **Step 6: Delete duplicate planner route-cost math once unused**

No second checked route-cost implementation remains.

- [ ] **Step 7: Keep one integration parity assertion**

Representative live/planner attempts for the same state/day match `baselineCapacity`, effective `capacity`, suspension, quantity, cost, and `modifierImpacts`. This checks wiring; the shared builder is the actual anti-drift mechanism.

- [ ] **Step 8: Run suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/interCityLogistics.integration.spec.ts
bun run check
git add src/lib/game/supplyPlannerLogistics.ts src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project route disruptions"
```

---

### Task 6: Surface disruptions through existing UI, report, alert, and navigation seams

**Files:**
- Modify: `gameCopy.ts`, `gameCopy.spec.ts`
- Modify: `ActiveModifiers.svelte`, `LogisticsRouteInspector.svelte`, `WorldLogisticsRoutes.svelte`, `ReportsPanel.svelte` and focused specs
- Modify: `DecisionQueue.svelte.spec.ts`
- Modify: `alerts.ts`, `alerts.spec.ts`
- Modify: `alertNavigation.ts`, its spec
- Modify: en/ja/zh-Hant message files

- [ ] **Step 1: Write route decision localization tests**

A materialized route decision remains understandable after live route removal. Title/context/option description use persisted IDs, not route lookup.

- [ ] **Step 2: Pass event copy params through option localization**

`localizeEventDecisionOption` uses the same enriched params as title/context.

- [ ] **Step 3: Write/implement Active Modifiers route-effect rendering**

All four route effects show source, route/material, base → effective value, and remaining duration. Company import discount remains unchanged.

- [ ] **Step 4: Extend route inspector**

Show configured/effective capacity, current lead-time/cost changes, suspension condition, latest historical `modifierImpacts`, and copy that utilization is relative to effective capacity. Do not add a second utilization ratio.

- [ ] **Step 5: Add non-color world-route disruption state**

Set `data-disrupted="true"` while route modifiers are active; retain existing geometry/selection.

- [ ] **Step 6: Render persisted impacts/recoveries in Reports**

Switch on the discriminated unions. Reports must remain valid after modifiers expire.

- [ ] **Step 7: Reuse existing `event-modifier` route alert**

For an important recurring-route modifier whose route still exists, emit the existing alert kind with `modifierId` + `routeId` and no decisions-panel target. Removed route → no actionable alert. Company modifier behavior is unchanged.

- [ ] **Step 8: Route `event-modifier + routeId` to existing world-route navigation**

Handle it before generic panel navigation in `resolveAlertNavigation`.

- [ ] **Step 9: Run UI/i18n/alert suites/check and commit**

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

### Task 7: Add production `freight-disruption` and own the weighted-event balance change

**Files:**
- Modify: `eventCatalog.ts`, `eventCatalog.spec.ts`, `eventSelection.spec.ts`
- Modify: en/ja/zh-Hant messages and focused game-copy tests

**Definition:**

```ts
{
  id: 'freight-disruption',
  version: 1,
  selection: { kind: 'weighted', weight: 1 },
  condition: { kind: 'always' },
  target: { kind: 'recurring-route', state: 'active' },
  expiresAfterDays: 2,
  cooldownDays: 7
}
```

Options:

1. `accept-delay`: +1 lead-time day and ×0.75 capacity for 3 days.
2. `charter-carriers`: immediate cash -2,000, ×1.25 capacity and ×1.5 transport cost for 2 days.
3. `suspend-shipments`: dispatch suspension for 2 days.

- [ ] **Step 1: Write production catalog tests**

Assert exact ID, selector, cooldown, option order, effects, stable stacking keys, and no unsupported effect kind.

- [ ] **Step 2: Give each response exactly one primary important modifier**

Avoid duplicate top-bar alerts from multi-effect responses while keeping all effects visible in Active Modifiers:

- accept-delay: lead-time `important`, capacity `normal`;
- charter-carriers: transport-cost `important`, capacity `normal`;
- suspend-shipments: suspension `important`.

Durations within each response are identical, so the primary important modifier spans the full response window.

- [ ] **Step 3: Lock the deliberate event-mix change**

When a route is eligible, `supplier-terms` weight 1 and `freight-disruption` weight 1 split weighted selections 1:1. The global 12% weighted cadence remains unchanged. One route versus several routes does not change this ratio.

- [ ] **Step 4: Add localized decision/modifier copy**

Copy names the concrete route/material and explains each choice's duration/trade-off before resolution.

- [ ] **Step 5: Run catalog/selection/i18n suites and commit**

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
- Modify only deterministic fixture/helper files required by current-schema injection

- [ ] **Step 1: Add schema-16 deterministic sandbox setup**

Use two opened industry cities, one active route, sufficient stock/capacity/cash, and event RNG state that produces freight disruption. No E2E-only game command.

- [ ] **Step 2: Assert unresolved decision names the concrete route**

Verify visible origin, destination, and material before choosing an option.

- [ ] **Step 3: Resolve and assert active presentation/navigation**

Verify Active Modifiers, `data-disrupted="true"`, and existing event-modifier alert → world-route navigation.

- [ ] **Step 4: Close through an affected dispatch**

Verify immutable order arrival/cost and persisted `modifierImpacts` evidence.

- [ ] **Step 5: Exercise pause/edit/resume while active**

Pausing does not delete the modifier; an unresolved paused target remains resolvable; resume uses current base route + still-active modifier.

- [ ] **Step 6: Close through expiry**

Verify in-transit order stays unchanged, current route returns to edited base behavior, recovery row appears, disrupted marker clears, and no stale restoration exists.

- [ ] **Step 7: Run targeted E2E first**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts --grep "freight disruption"
```

- [ ] **Step 8: Run focused suites**

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

- [ ] **Step 9: Run full repository gates**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
bun run build
git diff --check origin/main...HEAD
```

Expected: all commands exit 0; Svelte check reports zero errors/warnings.

- [ ] **Step 10: Run scope/consistency audits**

```bash
git grep -n "event-suspend" -- src docs
git grep -n "checkedRoundedProduct" -- src/lib/game
git grep -n "Math.random\|rngState" -- src/lib/game/logisticsRouteModifiers.ts src/lib/game/interCityLogistics.ts
git grep -n "effectiveRoute\|effective.*Route" -- src/lib/game src/routes
git grep -n "SAVE_SCHEMA_VERSION.*15\|schemaVersion.*15" -- src/lib src/routes
```

Review expectations:

- suspension references use only `route-event-suspended` / `route-dispatch-suspension` spellings;
- no generic rounded-product helper;
- no logistics RNG path;
- any effective-route match is derived, never persisted authority;
- schema-15 references are rejection fixtures only.

- [ ] **Step 11: Final whole-branch review**

Verify definition-level weighting, selection-vs-resolution target semantics, target-scoped replacement, shared resolver + builder, suspension cadence, compact historical attribution, `baselineCapacity` alert semantics, effective-relative utilization, reused event-modifier route navigation, truthful schema 16, planner expiry, edit-preserving recovery, and intentional 1:1 later-game weighted-event mix.

- [ ] **Step 12: Commit final lifecycle work**

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

Each checkpoint must pass focused suites and `bun run check`. Full lint/unit/E2E/build gates run at the end.
