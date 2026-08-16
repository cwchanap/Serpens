# Event-Driven Logistics Disruptions and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-296 so existing strategic events can deterministically target recurring logistics routes, apply four temporary route effects to future dispatches, surface attribution/recovery, and feed the same day-aware effective-route behavior into the Supply Planner.

**Architecture:** Keep `RecurringRoute` as the only authoritative editable route state. Add a small event-target helper and a small pure logistics-route-modifier resolver; event lifecycle owns target/materialization/expiry, while live logistics and the Supply Planner both call the resolver for dated effective values. Reports and UI consume recorded baseline/effective evidence rather than re-simulating past dispatches.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest 4, Playwright, Bun, existing Serpens event/modifier framework, HPA-294 logistics core, HPA-574 route UI, HPA-297 Supply Planner.

## Global Constraints

- Keep one authoritative `RecurringRoute`; never persist copied effective route state.
- Support exactly four route effects: lead-time adjustment, capacity multiplier, dispatch suspension, and transport-cost multiplier.
- Effects apply only to future recurring-route dispatch attempts while active; manual transfers and already-dispatched transfer orders are unchanged.
- Replacement remains `stackingRule: 'replace'`, scoped by both stacking key and concrete event target.
- Use the existing three-draw event RNG contract; route selection consumes only the already-reserved materialization RNG stream.
- A due event-suspended recurring route records a zero-quantity attempt and advances normal route cadence; a player-paused route retains existing behavior.
- Live dispatch and 7/30-day Supply Planner projection must use the same pure effective-route resolver.
- Route removal creates no tombstone, stale-target repair, or pre-effect recovery snapshot.
- Bump strict current save schema from 15 to 16; add no schema-15 migration or backwards-compatibility aliases.
- No reliability RNG, shipment failures, rerouting, vehicle/path simulation, in-transit mutation, generic target DSL, or modifier scripting language.

---

## File structure

### New focused domain files

- `src/lib/game/eventTargets.ts` — concrete event-target cloning/equality/eligibility and selector resolution.
- `src/lib/game/eventTargets.spec.ts` — company/route target semantics and stable route ordering.
- `src/lib/game/logisticsRouteModifiers.ts` — active route modifier selection, deterministic composition, effective values, contribution attribution, and transport-cost rounding.
- `src/lib/game/logisticsRouteModifiers.spec.ts` — composition, target filtering, expiry/day behavior, overflow, and rounding.

### Existing owners to extend

- Event contracts/catalog/materialization: `src/lib/game/types.ts`, `eventDefinitions.ts`, `eventSelection.ts`, `eventCatalog.ts` and their existing specs.
- Atomic resolution/lifecycle: `eventEffects.ts`, `eventModifiers.ts` and their existing specs.
- Live route lifecycle/evidence: `interCityLogistics.ts`, `simulateDay.ts`, `logisticsReadModels.ts`, `logisticsReport.testUtils.ts` and existing specs.
- Planner projection: `supplyPlannerLogistics.ts`, `supplyPlanner.ts` and their specs.
- Persistence: `src/lib/persistence/saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`.
- Alerts/navigation: `src/lib/game/alerts.ts`, `alerts.spec.ts`, `src/routes/alertNavigation.ts` and its spec.
- Presentation: `ActiveModifiers.svelte`, `LogisticsRouteInspector.svelte`, `WorldLogisticsRoutes.svelte`, `ReportsPanel.svelte`, `ManagementPanelHost.svelte` and focused specs.
- Localization: `src/lib/i18n/gameCopy.ts`, `gameCopy.spec.ts`, `messages/en.ts`, `messages/ja.ts`, `messages/zh-Hant.ts`.
- Lifecycle E2E: `src/routes/retail-sim.e2e.ts`.

---

### Task 1: Add concrete recurring-route event targets and deterministic materialization

**Files:**
- Create: `src/lib/game/eventTargets.ts`
- Create: `src/lib/game/eventTargets.spec.ts`
- Modify: `src/lib/game/types.ts` (`EventTarget`, `EventTargetSelector`)
- Modify: `src/lib/game/eventDefinitions.ts` (target validation/cloning)
- Modify: `src/lib/game/eventSelection.ts` (eligible concrete target sets + materialization RNG)
- Test: existing `eventCatalog.spec.ts` / event-selection tests beside `eventSelection.ts`

**Interfaces:**
- Produces:

```ts
export function resolveEventTargets(
	game: GameState,
	selector: EventTargetSelector
): EventTarget[];

export function isEventTargetEligible(game: GameState, target: EventTarget): boolean;
export function sameEventTarget(left: EventTarget, right: EventTarget): boolean;
export function cloneEventTarget(target: EventTarget): EventTarget;
```

- `EventTargetSelector` supports only company or active recurring route.
- `selectEventForDay` still consumes exactly three top-level event RNG draws.

- [ ] **Step 1: Write failing target-resolution tests**

Cover company, no-route, paused-route, removed/nonexistent route, opened-endpoint eligibility, and raw route-ID sort independent of priority/list order.

```ts
it('resolves only active recurring routes in raw id order', () => {
	const game = gameWithRoutes([
		route({ id: 'route-20', priority: 0, state: 'active' }),
		route({ id: 'route-3', priority: 99, state: 'active' }),
		route({ id: 'route-1', state: 'paused' })
	]);

	expect(resolveEventTargets(game, { kind: 'recurring-route', state: 'active' })).toEqual([
		{ kind: 'recurring-route', routeId: 'route-20' },
		{ kind: 'recurring-route', routeId: 'route-3' }
	]);
});
```

- [ ] **Step 2: Run the focused target test and verify RED**

Run:

```bash
bun run test:unit -- --run src/lib/game/eventTargets.spec.ts
```

Expected: fail because `eventTargets.ts` / route target union does not exist.

- [ ] **Step 3: Implement the minimum target union and helper**

Use explicit switches; do not introduce a target registry.

```ts
export type EventTarget =
	| { kind: 'company' }
	| { kind: 'recurring-route'; routeId: string };

export type EventTargetSelector =
	| { kind: 'company' }
	| { kind: 'recurring-route'; state: 'active' };
```

`resolveEventTargets` finds existing active routes, verifies both endpoints are in `game.world.openedCityIds`, maps to concrete route targets, and sorts by `routeId` with raw code-unit comparison.

- [ ] **Step 4: Write failing event-selection tests for definition-level weighting and target choice**

Use a fixture catalog containing one weighted company event and one weighted route event. Assert that adding extra eligible routes does not multiply the route event's selection weight, and that a fixed game/event RNG state picks the same concrete route target after save-like cloning.

Also assert pending/cooldown exclusion is concrete-target-specific:

```ts
expect(generated.decisions.at(-1)).toMatchObject({
	kind: 'event',
	target: { kind: 'recurring-route', routeId: expectedRouteId }
});
```

- [ ] **Step 5: Refactor `eventSelection.ts` around eligible target sets**

Keep the current `cadenceDraw`, `weightedDraw`, and `materializationSeedDraw`. Build a map from definition ID to eligible concrete targets, select the definition exactly once, then choose a route target with one draw from the already-created materialization RNG.

Do not change `EVENT_SELECTION_SCHEMA_VERSION` or the top-level RNG advancement.

Use `sameEventTarget` for pending-instance and cooldown comparison.

- [ ] **Step 6: Extend event-definition target validation/cloning**

Accept exactly:

```ts
{ kind: 'company' }
{ kind: 'recurring-route', state: 'active' }
```

Reject other selector shapes with a deterministic catalog diagnostic.

- [ ] **Step 7: Run focused event tests, type check, then commit**

```bash
bun run test:unit -- --run src/lib/game/eventTargets.spec.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventTargets.ts src/lib/game/eventTargets.spec.ts src/lib/game/eventDefinitions.ts src/lib/game/eventSelection.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts
git commit -m "feat(events): add recurring route targets"
```

If the repository names the event-selection spec differently, use the existing colocated selection spec discovered in the worktree; do not create a duplicate suite solely to match this plan name.

---

### Task 2: Extend timed effects and make modifier activation target-aware and atomic

**Files:**
- Modify: `src/lib/game/types.ts` (`EventTimedEffect`)
- Modify: `src/lib/game/eventDefinitions.ts` (effect/target compatibility validation)
- Modify: `src/lib/game/eventModifiers.ts` (target parameter, target-scoped replacement, union-safe cloning)
- Modify: `src/lib/game/eventEffects.ts` (resolution-time target eligibility, route modifier validation)
- Modify: `src/lib/game/simulateDay.ts` (`compileEventModifierRules`, lifecycle cloning narrowed to import-cost effect)
- Modify: `src/lib/components/game/ActiveModifiers.svelte` only as needed to compile safely across the new union; full route presentation lands in Task 6.
- Test: `eventModifiers.spec.ts`, `eventEffects.spec.ts`, event catalog validation tests

**Interfaces:**
- Consumes: `isEventTargetEligible`, `sameEventTarget`, `cloneEventTarget` from Task 1.
- Changes activation to:

```ts
activateEventModifiers(
	state: EventRuntimeState,
	source: ActiveEventModifier['source'],
	target: EventTarget,
	day: number,
	templates: readonly EventModifierTemplate[]
): EventModifierActivationResult;
```

- Produces four route effect variants in `EventTimedEffect`.

- [ ] **Step 1: Write failing catalog/runtime validation tests for all four effect kinds**

Assert positive integer lead-time adjustment, positive finite multipliers, parameterless suspension, company/import compatibility, and route/route-effect compatibility.

Example invalid pair:

```ts
expect(() =>
	validateAndNormalizeEventCatalog([
		fixtureEvent({
			target: { kind: 'company' },
			modifier: { effect: { kind: 'route-dispatch-suspension' } }
		})
	])
).toThrow(/recurring-route target/);
```

- [ ] **Step 2: Run focused validation tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/game/eventEffects.spec.ts
```

- [ ] **Step 3: Add the explicit route effect union and validator switches**

```ts
| { kind: 'route-lead-time-adjustment'; days: number }
| { kind: 'route-capacity-multiplier'; multiplier: number }
| { kind: 'route-dispatch-suspension' }
| { kind: 'route-transport-cost-multiplier'; multiplier: number }
```

Do not generalize `effect.target` onto route effects; the concrete route lives in `ActiveEventModifier.target`.

- [ ] **Step 4: Write failing target-scoped replacement tests**

Activate the same stacking key on `route-1` and `route-2`: both remain active. Activate it again on `route-1`: only the old `route-1` modifier gets a `replaced` lifecycle entry.

```ts
expect(next.activeModifiers.map(({ target }) => target)).toEqual([
	{ kind: 'recurring-route', routeId: 'route-2' },
	{ kind: 'recurring-route', routeId: 'route-1' }
]);
```

- [ ] **Step 5: Pass concrete target into modifier activation**

Clone the target into the modifier/snapshot and replace only candidates where:

```ts
candidate.stackingKey === modifier.stackingKey &&
sameEventTarget(candidate.target, modifier.target)
```

Use a discriminated clone helper or `structuredClone` for `EventTimedEffect`; remove assumptions that every timed effect has `.target`.

- [ ] **Step 6: Write failing atomic-resolution tests for paused/removed route targets**

Materialize a route decision, then pause or remove the route before `resolveDecision`. Assert:

```ts
expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
expect(result.game.cash).toBe(original.cash);
expect(result.game.events.activeModifiers).toEqual(original.events.activeModifiers);
```

- [ ] **Step 7: Replace company-only option preparation with target eligibility**

In `eventEffects.ts`, validate the persisted concrete target before applying any immediate effect. Keep the existing `effect-rejected` failure code and `payload: 'target'` rather than adding a logistics-specific failure hierarchy.

Pass `decision.target` to `activateEventModifiers`.

- [ ] **Step 8: Narrow existing import-cost consumers**

`compileEventModifierRules` must filter only `effect.kind === 'import-cost-multiplier'`. Lifecycle cloning and temporary Active Modifiers rendering must switch on effect kind instead of reading `.multiplier` unconditionally.

- [ ] **Step 9: Run focused suites + check and commit**

```bash
bun run test:unit -- --run src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/eventCatalog.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventDefinitions.ts src/lib/game/eventModifiers.ts src/lib/game/eventEffects.ts src/lib/game/simulateDay.ts src/lib/components/game/ActiveModifiers.svelte
git commit -m "feat(events): support route modifier effects"
```

---

### Task 3: Build one pure effective-route resolver and integrate live dispatch

**Files:**
- Create: `src/lib/game/logisticsRouteModifiers.ts`
- Create: `src/lib/game/logisticsRouteModifiers.spec.ts`
- Modify: `src/lib/game/types.ts` (`DailyRouteDispatchAttempt`, route contribution evidence)
- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/logisticsReadModels.ts` (`attemptMatchesRoute` baseline capacity)
- Modify: `src/lib/game/logisticsReport.testUtils.ts` and direct attempt fixtures in focused tests
- Test: `interCityLogistics.integration.spec.ts`, logistics read-model tests, relevant `simulateDay.spec.ts`

**Interfaces:**
- Produces:

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

- `DailyRouteDispatchAttempt.capacity` remains the **effective** capacity for current consumers and gains explicit baseline/effective attribution fields from the design.

- [ ] **Step 1: Write failing resolver tests**

Cover:

- unrelated target ignored;
- expired/not-yet-active modifier ignored;
- additive lead time;
- multiplicative capacity with one final floor and minimum 1;
- suspension OR behavior;
- multiplicative transport cost with one final total-cost round;
- deterministic modifier-ID ordering;
- non-finite/safe-integer overflow rejection.

Example:

```ts
expect(
	resolveEffectiveRecurringRoute(baseRoute({ capacity: 100, leadTimeDays: 2 }), modifiers, 12)
).toMatchObject({
	capacity: 75,
	leadTimeDays: 3,
	dispatchSuspended: false
});
```

- [ ] **Step 2: Run resolver tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts
```

- [ ] **Step 3: Implement the resolver with explicit switches**

Filter active modifiers using existing `isModifierActiveOnDay`, require target `recurring-route` with matching route ID, sort by modifier ID, then reduce four local accumulators. No route mutation.

Calculate transport cost as:

```ts
const baseTotal = checkedMultiply(route.transportCostPerUnit, quantity);
return checkedRoundedProduct(baseTotal, effective.transportCostMultiplier);
```

Round once after the combined multiplier.

- [ ] **Step 4: Write failing live-dispatch tests for baseline vs effective behavior**

Use an active route with enough stock/destination need and assert the created order uses effective quantity/arrival/cost while the stored route keeps its base configuration.

Also assert a pre-existing in-transit order remains byte-for-byte unchanged after a later disrupted day.

- [ ] **Step 5: Add explicit attempt evidence fields**

Add the design fields:

```ts
baselineCapacity: number;
capacity: number;
baselineLeadTimeDays: number;
leadTimeDays: number;
baselineTransportCostPerUnit: number;
transportCostPerUnit: number;
baselineDispatchedQuantity: number;
baselineTransportCost: number;
dispatchSuspended: boolean;
modifierContributions: RouteModifierContribution[];
```

Update the shared report fixture helper so unrelated tests can create a normal attempt with base === effective values without duplicating literals.

- [ ] **Step 6: Integrate the resolver at `processRecurringRouteDispatches`**

For each due base-active route:

```ts
const effective = resolveEffectiveRecurringRoute(route, game.events.activeModifiers, closingDay);
const baselineDispatchedQuantity = getRecurringDispatchQuantity({
	destinationNeed,
	routeCapacity: route.capacity,
	availableOriginStock
});
const dispatchedQuantity = effective.dispatchSuspended
	? 0
	: getRecurringDispatchQuantity({
			destinationNeed,
			routeCapacity: effective.capacity,
			availableOriginStock
		});
```

Use effective lead time and cost only when creating the new order.

- [ ] **Step 7: Add the event-suspension cadence test**

A route due on day 10 with frequency 3 and an active suspension must:

- create no transfer order;
- record an attempt with `dispatchSuspended: true` and `dispatchedQuantity: 0`;
- advance `nextDispatchOnDay` to 13.

A base route with `state: 'paused'` must continue to record no attempt and not advance because it never enters the due-route set.

- [ ] **Step 8: Fix stale-attempt matching**

Change `attemptMatchesRoute` to compare current base capacity with `attempt.baselineCapacity`; keep origin/destination/material checks. Do not add a route revision counter.

- [ ] **Step 9: Run focused logistics/simulation suites and commit**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/logisticsReadModels.spec.ts src/lib/game/simulateDay.spec.ts
bun run check
git add src/lib/game/logisticsRouteModifiers.ts src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/types.ts src/lib/game/interCityLogistics.ts src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReport.testUtils.ts src/lib/game/*.spec.ts
git commit -m "feat(logistics): apply event modifiers to dispatches"
```

Before committing, stage only focused spec files actually changed; do not use the wildcard if it includes unrelated worktree changes.

---

### Task 4: Record recovery evidence and persist strict schema 16

**Files:**
- Modify: `src/lib/game/types.ts` (`DailyRouteModifierRecovery`, `DailyLogisticsReport.modifierRecoveries`)
- Modify: `src/lib/game/logisticsRouteModifiers.ts` (recovery comparison helper if useful)
- Modify: `src/lib/game/simulateDay.ts` (build recovery rows around normal expiry)
- Modify: `src/lib/persistence/saveTypes.ts` (`SAVE_SCHEMA_VERSION = 16`)
- Modify: `src/lib/persistence/saveCodec.ts` (route target/effect/attempt/recovery validation)
- Test: `saveCodec.spec.ts`, `simulateDay.spec.ts`, reports tests affected by the new logistics field

**Interfaces:**
- Produces:

```ts
export interface DailyRouteModifierRecovery {
	routeId: string;
	modifierId: string;
	source: ActiveEventModifier['source'];
	effectKind: RouteTimedEffect['kind'];
	disruptedValue: number | 'suspended';
	recoveredValue: number | 'active';
}
```

Use a discriminated recovery shape instead if that makes validation/localization clearer; do not use `unknown` property bags.

- [ ] **Step 1: Write failing recovery lifecycle tests**

Scenario:

1. route base capacity 100;
2. active ×0.5 modifier on closing day 5;
3. edit base route to capacity 120 while modifier remains active;
4. closing day 6 expires modifier.

Assert the recovery record resolves to current base capacity 120, not pre-event 100. Remove the route before expiry in a second test and assert no recovery row is created while generic modifier lifecycle still records expiry.

- [ ] **Step 2: Run the focused simulation tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/simulateDay.spec.ts
```

- [ ] **Step 3: Build recovery rows from before/after expiry views**

Use the route state that exists after dispatch and before report creation. Compare closing-day effective values with next-day values after `expireModifiersAfterDay`. Record a recovery only when the target route still exists and the affected value returns to the current base behavior.

Do not modify modifier expiry itself and do not persist a pre-effect snapshot.

- [ ] **Step 4: Add failing schema-16 round-trip and schema-15 rejection tests**

Build one save containing:

- a pending event decision with concrete route target;
- an active route modifier;
- a daily disrupted dispatch attempt with contribution evidence;
- a daily route recovery row.

Assert encode/decode round-trip equality. Change only `schemaVersion` to 15 and assert current-schema rejection; do not add a migration expectation.

- [ ] **Step 5: Bump `SAVE_SCHEMA_VERSION` to 16 and extend validation switches**

Historical route IDs in cooldown/history/report evidence are shape-validated but are **not** required to resolve to a currently existing route. Current target eligibility remains a runtime behavior check, not save repair.

Validate numeric bounds for all route effect/evidence fields and keep existing `invariant-event-runtime` / `invariant-logistics` boundaries rather than inventing a third overlapping invariant category.

- [ ] **Step 6: Run persistence + report regressions and commit**

```bash
bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/logisticsRouteModifiers.ts src/lib/game/simulateDay.ts src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
git commit -m "feat(logistics): persist disruption recovery evidence"
```

---

### Task 5: Make the Supply Planner project dated effective route state

**Files:**
- Modify: `src/lib/game/supplyPlannerLogistics.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Test: planner logistics tests / `supplyPlanner.spec.ts`

**Interfaces:**
- Consumes: `resolveEffectiveRecurringRoute` and `calculateEffectiveRouteTransportCost` from Task 3.
- `SupplyPlannerLogisticsSnapshot` gains only copied route-targeted active modifiers needed for projection.
- `SupplyPlannerRouteCondition` gains `'route-event-suspended'`.

- [ ] **Step 1: Write a failing 30-day expiry projection test**

Create a snapshot on day 10 with a route modifier active through day 12. Project through at least day 14 and assert:

- dispatches on active days use effective values;
- a transfer dispatched while delayed keeps its adjusted arrival day after modifier expiry;
- later due dispatches use current base values.

- [ ] **Step 2: Write a failing projected suspension/cadence test**

A due suspended projected route must produce a zero-quantity attempt, advance cadence, and surface `'route-event-suspended'`; it must not create a phantom transfer order.

- [ ] **Step 3: Run focused planner tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/supplyPlanner.spec.ts
```

Include the colocated `supplyPlannerLogistics` spec as well when present in the worktree.

- [ ] **Step 4: Copy active route modifiers into the planner snapshot**

Store structured-cloned modifiers whose target kind is `recurring-route`. Do not copy event cooldowns/history/RNG or pre-resolve today's route values.

- [ ] **Step 5: Resolve each projected due route for that projected day**

In `processSupplyPlannerRouteDispatches(input, day)`, call the shared resolver before calculating dispatch quantity/order arrival/cost. Match live suspension cadence exactly.

- [ ] **Step 6: Promote event suspension as a planner route condition**

Add `'route-event-suspended'` above normal capacity/frequency/lead-time constraints in `SUPPLY_PLANNER_ROUTE_CONDITION_RANK`. Do not add disruption-specific recommendations; existing projected shortages/costs remain the planner's evidence.

- [ ] **Step 7: Run focused planner and live parity tests, then commit**

```bash
bun run test:unit -- --run src/lib/game/supplyPlanner.spec.ts src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/logisticsRouteModifiers.spec.ts
bun run check
git add src/lib/game/supplyPlannerLogistics.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner*.spec.ts
git commit -m "feat(supply): project active route disruptions"
```

Stage only changed planner spec files, not unrelated wildcard matches.

---

### Task 6: Extend route read models, alerts, inspector, map, Active Modifiers, and Reports

**Files:**
- Modify: `src/lib/game/logisticsReadModels.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/routes/alertNavigation.ts`
- Modify: `src/lib/components/game/ActiveModifiers.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte`
- Modify: `src/lib/components/game/WorldLogisticsRoutes.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Test: focused specs for every modified read model/component/localizer/navigation helper

**Interfaces:**
- `RouteOperationalSummary` exposes current-day effective route values/contributions in addition to the base `route`.
- Route-targeted important event modifier alerts navigate through existing world-route navigation.

- [ ] **Step 1: Write failing read-model tests for current effective values**

Assert `selectRouteOperations(game)` returns base route plus current-day effective capacity/lead time/cost/suspension and active contribution IDs. An expired modifier must not appear.

- [ ] **Step 2: Implement effective state in `RouteOperationalSummary`**

Call the shared resolver with `game.day`. Do not cache/persist the result in `GameState`.

- [ ] **Step 3: Write failing grouped route-modifier alert/navigation tests**

For two modifiers from the same event instance and route, expect one actionable modifier alert. It carries `routeId`, reports remaining duration via localization, and `resolveAlertNavigation` returns:

```ts
{ kind: 'world-route', routeId }
```

A route-target modifier whose route was removed produces no route alert.

- [ ] **Step 4: Implement grouped route alerts with existing alert primitives**

Keep company important modifiers on the Decisions panel. Group route-targeted important modifiers by `(routeId, source.instanceId)` and keep a representative modifier ID for localization/source lookup. Generalize route navigation to prefer a valid `routeId` rather than enumerating only the two old logistics alert kinds.

- [ ] **Step 5: Write failing Active Modifiers and inspector component tests**

Cover:

- existing supplier import discount unchanged;
- route target name/material + localized effect + remaining days;
- effective/configured capacity and lead time differences;
- event-suspended state text;
- removed-route fallback using persisted route ID rather than crashing.

- [ ] **Step 6: Finish discriminated Active Modifiers rendering**

Pass the existing recurring-route list (not a second store) through `ManagementPanelHost` to `ActiveModifiers`. Switch on target/effect kinds and use structured-copy localization. Do not create a logistics-specific modifier panel.

- [ ] **Step 7: Extend the route inspector with one compact disruption section**

Show effect explanation and remaining duration. In normal schedule rows, add configured/base text only when effective differs. The Manage Route button continues to edit the base route.

- [ ] **Step 8: Write failing world-route presentation tests**

For an active disruption, assert `data-disrupted="true"` plus a visible `!` midpoint marker. For event suspension, assert a non-color dash/data state distinct from player-paused routing. Normal routes preserve existing geometry/click behavior.

- [ ] **Step 9: Implement the minimal world-map disruption treatment**

Do not change route geometry. Add only the disruption marker/state hooks and suspension dash treatment; exact effect details stay in inspector/discovery copy.

- [ ] **Step 10: Write failing Reports tests for disrupted attempts and recovery**

The latest Logistics section must render:

- source event title;
- baseline → effective values for an affected attempt;
- suspended zero-quantity attempt copy;
- recovery row.

- [ ] **Step 11: Extend Reports and localization in all three languages**

Add typed copy keys in English, Japanese, and Traditional Chinese for target labels, four effect summaries, alert text, inspector configured/effective text, disruption marker/discovery state, dispatch evidence, and recovery.

Update `gameCopy.spec.ts` completeness/localization expectations; do not hard-code English strings into domain state.

- [ ] **Step 12: Run focused UI/read-model suites + check and commit**

```bash
bun run test:unit -- --run \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/components/game/ActiveModifiers.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/i18n/gameCopy.spec.ts
bun run check
git add src/lib/game/logisticsReadModels.ts src/lib/game/alerts.ts src/routes/alertNavigation.ts src/lib/components/game/ActiveModifiers.svelte src/routes/ManagementPanelHost.svelte src/lib/components/game/LogisticsRouteInspector.svelte src/lib/components/game/WorldLogisticsRoutes.svelte src/lib/components/game/ReportsPanel.svelte src/lib/i18n/gameCopy.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git add src/lib/game/logisticsReadModels.spec.ts src/lib/game/alerts.spec.ts src/lib/components/game/ActiveModifiers.svelte.spec.ts src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/i18n/gameCopy.spec.ts src/routes/alertNavigation.spec.ts
git commit -m "feat(logistics): surface active route disruptions"
```

If `alertNavigation.spec.ts` has a different existing filename, modify that existing focused suite instead of creating a parallel one.

---

### Task 7: Add the production `freight-disruption` event and prove catalog/runtime behavior

**Files:**
- Modify: `src/lib/game/eventCatalog.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Test: `src/lib/game/eventCatalog.spec.ts`, event selection/effects specs, `gameCopy.spec.ts`

**Interfaces:**
- Produces one production definition:

```ts
{
	id: 'freight-disruption',
	version: 1,
	selection: { kind: 'weighted', weight: 1 },
	condition: { kind: 'always' },
	target: { kind: 'recurring-route', state: 'active' },
	expiresAfterDays: 2,
	cooldownDays: 7,
	// three options from the design
}
```

- [ ] **Step 1: Write failing production-catalog completeness/content tests**

Update the exact production ID allowlist to include `freight-disruption`. Assert it is route-targeted and that its options contain exactly the designed effects/values:

```text
accept-delay: +1 lead day, ×0.75 capacity for 3 days
charter-carriers: -$2,000 cash, ×1.25 capacity, ×1.5 transport cost for 2 days
suspend-shipments: route suspension for 2 days
```

- [ ] **Step 2: Run catalog/copy tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/i18n/gameCopy.spec.ts
```

- [ ] **Step 3: Add the production definition with target-scoped stable keys**

Use exactly:

```text
freight-disruption:lead-time
freight-disruption:capacity
freight-disruption:transport-cost
freight-disruption:suspension
```

All option copy must explain target route, duration, and tradeoff before resolution. Mark the primary disruption modifier in each option important so the grouped route alert is produced; companion modifiers may remain normal to avoid duplicate alert emphasis.

- [ ] **Step 4: Add localized title/options/explanations in all supported languages**

Follow current event copy naming conventions. Do not store authoritative English labels in `EventDecisionItem` or `ActiveEventModifier`.

- [ ] **Step 5: Add deterministic production-selection tests**

With no active route, `freight-disruption` is absent from candidates. With fixed event RNG and two active routes, assert one concrete route target. Clone/save-load the state and assert the same materialized target/option payload.

- [ ] **Step 6: Run event + localization regressions and commit**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/eventModifiers.spec.ts src/lib/i18n/gameCopy.spec.ts
bun run check
git add src/lib/game/eventCatalog.ts src/lib/game/eventCatalog.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts src/lib/i18n/gameCopy.spec.ts
git commit -m "feat(events): add freight disruption event"
```

---

### Task 8: Add one deterministic multi-day Playwright lifecycle and run full gates

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify focused fixtures/helpers only if the existing current-schema save injection needs schema-16 disruption payloads.

**Interfaces:**
- Consumes the complete HPA-296 behavior from Tasks 1–7.
- Produces one browser lifecycle proving event → route → dispatch → edit → expiry → recovery presentation.

- [ ] **Step 1: Add a deterministic current-schema E2E fixture**

Inject a schema-16 sandbox save with:

- two opened industry cities;
- inventory and warehouse capacity sufficient for a known recurring dispatch;
- one active recurring route;
- deterministic event runtime state that materializes `freight-disruption` for that route without mutating live game RNG.

Use existing save-injection helpers instead of adding a new debug API.

- [ ] **Step 2: Write the browser lifecycle assertions before production fixes**

The scenario must:

1. open/resolve the disruption decision;
2. navigate from the disruption alert to the world route;
3. inspect configured → effective values and the non-color disruption marker;
4. close a day that creates an affected dispatch;
5. verify the Reports evidence and the transfer's adjusted arrival/cost;
6. edit the base route while the modifier is still active;
7. close through expiry;
8. verify the active disruption disappears and recovery reports the edited base route value;
9. verify the already-dispatched transfer order did not change.

- [ ] **Step 3: Run only the targeted lifecycle and fix implementation defects, not the test contract**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts -g "freight disruption"
```

Expected: PASS.

- [ ] **Step 4: Run all focused HPA-296 unit/component/persistence suites**

```bash
bun run test:unit -- --run \
  src/lib/game/eventTargets.spec.ts \
  src/lib/game/eventCatalog.spec.ts \
  src/lib/game/eventModifiers.spec.ts \
  src/lib/game/eventEffects.spec.ts \
  src/lib/game/logisticsRouteModifiers.spec.ts \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/components/game/ActiveModifiers.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/i18n/gameCopy.spec.ts
```

Include any existing colocated event-selection, supply-planner-logistics, or alert-navigation spec touched during implementation.

- [ ] **Step 5: Run static and full regression gates**

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

- [ ] **Step 6: Perform explicit scope audits**

```bash
git grep -n "effective.*Route\|effectiveRoute" -- src/lib/game src/routes
# Inspect matches: derived values are acceptable; persisted duplicate effective route state is not.

git grep -n "Math.random\|rngState" -- src/lib/game/logisticsRouteModifiers.ts src/lib/game/interCityLogistics.ts
# Expect no new logistics RNG path.

git grep -n "schemaVersion.*15\|SAVE_SCHEMA_VERSION.*15" -- src/lib src/routes
# Remaining 15 references must be negative/rejection fixtures only, not migration support.
```

Also inspect the final diff for any manual-transfer behavior change, route-restoration snapshot, generic scripting/registry, or disruption-specific planner recommendation.

- [ ] **Step 7: Commit the lifecycle/gate work**

```bash
git add src/routes/retail-sim.e2e.ts
# Add only any focused fixture/helper files intentionally changed.
git commit -m "test(logistics): cover disruption recovery lifecycle"
```

- [ ] **Step 8: Final whole-branch review**

Review `origin/main...HEAD` against the design acceptance criteria. In particular verify:

- target selection remains one event candidate regardless of route count;
- replacement is target-scoped;
- suspension advances recurring cadence;
- route edit + expiry reveals edited base values;
- planner expires effects on projected dates;
- removed targets do not cause recovery/alert repair;
- Active Modifiers no longer assumes every effect is an import multiplier;
- save schema is strict 16 with no v15 migration.

Only after this review should the implementation PR be marked ready.

---

## Expected implementation commit sequence

1. `feat(events): add recurring route targets`
2. `feat(events): support route modifier effects`
3. `feat(logistics): apply event modifiers to dispatches`
4. `feat(logistics): persist disruption recovery evidence`
5. `feat(supply): project active route disruptions`
6. `feat(logistics): surface active route disruptions`
7. `feat(events): add freight disruption event`
8. `test(logistics): cover disruption recovery lifecycle`

Each checkpoint should pass its focused suite and `bun run check` before the next one. Full lint/unit/E2E/build gates run at the end rather than after every checkpoint.
