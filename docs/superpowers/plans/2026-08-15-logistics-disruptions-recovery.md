# Event-Driven Logistics Disruptions and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-296 so strategic events deterministically target recurring logistics routes, temporarily alter future route dispatches, explain their impact and recovery, and project the same behavior through the Supply Planner.

**Architecture:** `RecurringRoute` remains the only editable route state. `eventTargets.ts` owns concrete route target semantics; `logisticsRouteModifiers.ts` owns day-aware modifier composition; live dispatch, `selectRouteOperations`, and planner projection all resolve through that seam. Historical dispatch attempts persist explicit baseline/effective evidence, while the existing logistics core owns shared integer cost arithmetic and cadence.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest 4, Playwright, Bun, existing HPA-278 event framework, HPA-294 logistics core, HPA-574 logistics UI, HPA-297 Supply Planner.

## Global Constraints

- Keep one authoritative `RecurringRoute`; never persist copied effective route fields or a pre-disruption snapshot.
- Support exactly four route effects: lead-time adjustment, capacity multiplier, dispatch suspension, transport-cost multiplier.
- Manual transfers and already-dispatched orders are unaffected.
- Replacement remains `stackingRule: 'replace'`, scoped by stacking key **and** concrete target.
- Keep the existing three top-level event RNG draws; route selection uses only the reserved materialization RNG.
- Route count never multiplies event-definition selection weight.
- Event suspension advances a due recurring route's normal cadence; player pause keeps existing behavior.
- `DailyRouteDispatchAttempt.capacity` means effective capacity; `baselineCapacity` owns configuration matching and structural capacity-alert semantics.
- `route-event-suspended` is one shared `RouteOperationalCondition` used by live read models and the planner.
- Live dispatch, `selectRouteOperations`, and 7/30-day planner projection call the same effective-route resolver.
- Transport cost uses one shared route-specific function in `interCityLogistics.ts`, built on existing checked integer multiplication and one final round.
- Recovery rows are a discriminated per-effect union.
- Persist route/origin/destination/material IDs in materialized decision copy params so the decision remains understandable if the route is later removed.
- Strict save schema becomes 16; schema 15 is rejected with no migration or compatibility aliases.
- No reliability RNG, shipment failures, rerouting, recall, vehicle/path simulation, generic target DSL, modifier registry, or scripting layer.

---

## File structure

### New focused files

- `src/lib/game/eventTargets.ts` — target clone/equality/eligibility/resolution plus route copy-context materialization.
- `src/lib/game/eventTargets.spec.ts` — company/route target and route-context tests.
- `src/lib/game/logisticsRouteModifiers.ts` — active route modifier filtering/composition plus discriminated contribution/recovery derivation.
- `src/lib/game/logisticsRouteModifiers.spec.ts` — resolver, contribution, expiry, and recovery tests.

### Existing owners to extend

- Event contracts/materialization: `src/lib/game/types.ts`, `eventDefinitions.ts`, `eventSelection.ts`, `eventCatalog.ts`.
- Modifier lifecycle/resolution: `eventModifiers.ts`, `eventEffects.ts`, `simulateDay.ts`.
- Logistics: `interCityLogistics.ts`, `logisticsReadModels.ts`, `alerts.ts`, `logisticsReport.testUtils.ts`.
- Persistence: `src/lib/persistence/saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`.
- Planner: `supplyPlannerLogistics.ts`, `supplyPlanner.ts` and their specs.
- Presentation: `ActiveModifiers.svelte`, `LogisticsRouteInspector.svelte`, `WorldLogisticsRoutes.svelte`, `ReportsPanel.svelte`, `DecisionQueue.svelte.spec.ts`.
- Localization: `src/lib/i18n/gameCopy.ts`, `gameCopy.spec.ts`, `messages/en.ts`, `messages/ja.ts`, `messages/zh-Hant.ts`.
- Navigation/E2E: `src/routes/alertNavigation.ts`, `retail-sim.e2e.ts`.

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

export function isEventTargetEligible(game: GameState, target: EventTarget): boolean;
export function sameEventTarget(left: EventTarget, right: EventTarget): boolean;
export function cloneEventTarget(target: EventTarget): EventTarget;

export function getEventTargetCopyParams(
	game: GameState,
	target: EventTarget
): StructuredCopyParams;
```

`EventTarget` / `EventTargetSelector` become:

```ts
export type EventTarget =
	| { kind: 'company' }
	| { kind: 'recurring-route'; routeId: string };

export type EventTargetSelector =
	| { kind: 'company' }
	| { kind: 'recurring-route'; state: 'active' };
```

- [ ] **Step 1: Write target resolution tests**

Cover active, paused, missing, unopened-endpoint, company, and raw-ID ordering.

```ts
it('resolves active recurring routes in raw route-id order', () => {
	const game = withRecurringRoutes(createInitialGame(7), [
		createRoute({ id: 'route-20', state: 'active', priority: 0 }),
		createRoute({ id: 'route-3', state: 'active', priority: 99 }),
		createRoute({ id: 'route-1', state: 'paused', priority: 0 })
	]);

	expect(resolveEventTargets(game, { kind: 'recurring-route', state: 'active' })).toEqual([
		{ kind: 'recurring-route', routeId: 'route-20' },
		{ kind: 'recurring-route', routeId: 'route-3' }
	]);
});
```

- [ ] **Step 2: Run target tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/eventTargets.spec.ts
```

Expected: module/route target types do not exist yet.

- [ ] **Step 3: Implement explicit target helpers**

`resolveEventTargets` must:

- return company directly for company selector;
- inspect `game.logistics.recurringRoutes` for route selector;
- require base state `active`;
- require opened origin and destination;
- sort by raw `routeId` comparison.

`sameEventTarget` compares kind and route ID. `cloneEventTarget` uses a switch, not object-shape assumptions.

- [ ] **Step 4: Write definition-level selection tests**

Add fixture definitions for one company event and one route event. Prove adding three more eligible routes does not change the route event's definition-level weight.

Also prove fixed event RNG state chooses a deterministic concrete route and pending/cooldown exclusion is target-specific.

- [ ] **Step 5: Refactor `eventSelection.ts` around eligible target sets**

Keep exactly:

```ts
const cadenceDraw = packet.next();
const weightedDraw = packet.next();
const materializationSeedDraw = packet.next();
```

Build eligible target sets before definition selection. Select the definition once. Only after a route definition wins, use one `materializationRng.next()` draw over sorted route targets.

Use `sameEventTarget` for pending and cooldown comparisons. Do not bump `EVENT_SELECTION_SCHEMA_VERSION`.

- [ ] **Step 6: Materialize stable route copy params**

After choosing the concrete target, persist these IDs in `decision.copy.params`:

```ts
{
	routeId,
	originCityId,
	destinationCityId,
	materialId
}
```

Merge them with authored copy params. Company targets add no new params.

Write a test that removes the route after materialization and asserts the persisted decision still carries all four IDs.

- [ ] **Step 7: Extend selector validation/cloning**

`eventDefinitions.ts` accepts exactly company and active-recurring-route selectors. Clone with a discriminated switch.

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
- Modify: `src/lib/components/game/ActiveModifiers.svelte`
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

- [ ] **Step 1: Write validation tests for all four effect kinds and target compatibility**

Assert:

- lead-time days is a positive safe integer;
- multipliers are finite and > 0;
- suspension has no payload;
- company + route effect is rejected;
- recurring-route + import-cost effect is rejected.

- [ ] **Step 2: Run validation tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/game/eventEffects.spec.ts
```

- [ ] **Step 3: Extend `EventTimedEffect` and validator switches**

Keep explicit switches. Do not add `effect.target` to route effects: the concrete route is `ActiveEventModifier.target`.

- [ ] **Step 4: Write target-scoped replacement tests**

Activate the same stacking key on route-1 and route-2 and assert both survive. Reapply only route-1 and assert only its old modifier receives a `replaced` lifecycle row.

- [ ] **Step 5: Pass and clone the concrete target through activation/snapshots**

Replacement predicate:

```ts
candidate.stackingKey === modifier.stackingKey &&
sameEventTarget(candidate.target, modifier.target)
```

Use discriminated cloning for `EventTimedEffect` and `EventTarget`.

- [ ] **Step 6: Fix every materialization clone site now**

`eventSelection.ts#materializeEvent` currently assumes every timed effect has `.target`. Replace:

```ts
{ ...modifier.effect, target: { ...modifier.effect.target } }
```

with the same discriminated timed-effect clone used by the lifecycle path.

Add a route-event materialization test that reaches this clone path.

- [ ] **Step 7: Write atomic resolution tests for stale route targets**

Materialize a route decision, then pause/remove the route. `resolveDecision` must return `effect-rejected` and leave cash/modifiers unchanged.

- [ ] **Step 8: Replace company-only resolution guard with target eligibility**

Validate `decision.target` before immediate effects. Pass `decision.target` into `activateEventModifiers`.

- [ ] **Step 9: Narrow existing import-cost consumers**

In `simulateDay.ts`, `compileEventModifierRules` includes only `import-cost-multiplier`. Lifecycle/snapshot cloning switches by effect kind.

`ActiveModifiers.svelte` must compile safely across the union now; full route-specific presentation is Task 6.

- [ ] **Step 10: Run focused suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventDefinitions.ts src/lib/game/eventModifiers.ts src/lib/game/eventEffects.ts src/lib/game/eventSelection.ts src/lib/game/simulateDay.ts src/lib/components/game/ActiveModifiers.svelte src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts
git commit -m "feat(events): support route modifier effects"
```

---

### Task 3: Build the effective-route resolver, integrate live dispatch, fix live condition/alerts, and keep attempt persistence runnable

**Files:**
- Create: `src/lib/game/logisticsRouteModifiers.ts`
- Create: `src/lib/game/logisticsRouteModifiers.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/logisticsReadModels.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/logisticsReport.testUtils.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Test: `src/lib/game/interCityLogistics.integration.spec.ts`
- Test: `src/lib/game/logisticsReadModels.spec.ts`
- Test: `src/lib/game/alerts.spec.ts`
- Test: relevant cases in `src/lib/game/simulateDay.spec.ts`

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
```

Shared cost function stays in `interCityLogistics.ts`:

```ts
export function calculateEffectiveRouteTransportCost(input: {
	baseTransportCostPerUnit: number;
	quantity: number;
	transportCostMultiplier: number;
}): number;
```

`RouteOperationalCondition` gains `route-event-suspended`.

- [ ] **Step 1: Write resolver tests**

Cover unrelated targets, inactive-day modifiers, additive lead time, multiplicative capacity with one final floor/minimum 1, suspension OR, cost multiplier composition, deterministic modifier-ID order, and overflow rejection.

- [ ] **Step 2: Run resolver tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts
```

- [ ] **Step 3: Implement `logisticsRouteModifiers.ts`**

Filter with existing `isModifierActiveOnDay`, require matching recurring-route target, sort by modifier ID, and reduce explicit effect-kind accumulators.

Use a discriminated `RouteModifierContribution` union so persistence/i18n can validate concrete keys.

- [ ] **Step 4: Add the shared route transport-cost helper in `interCityLogistics.ts`**

Reuse its existing private `checkedMultiply` for the integer base total:

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

Do not add `checkedRoundedProduct`.

- [ ] **Step 5: Write live dispatch tests before changing dispatch**

Assert:

- ×0.75 capacity affects actual quantity but records base quantity/capacity;
- +1 lead time changes only the new order's arrival;
- ×1.5 cost rounds once from base total;
- suspension creates no order, records an attempt, and advances cadence;
- player pause still creates no due attempt;
- an existing in-transit order remains unchanged after modifier activation/expiry.

- [ ] **Step 6: Extend `DailyRouteDispatchAttempt` and integrate live dispatch**

Required new fields:

```ts
baselineCapacity: number;
baselineLeadTimeDays: number;
leadTimeDays: number;
baselineTransportCostPerUnit: number;
transportCostPerUnit: number;
baselineDispatchedQuantity: number;
baselineTransportCost: number;
dispatchSuspended: boolean;
modifierContributions: RouteModifierContribution[];
```

Keep existing `capacity` as effective capacity.

Compute baseline and effective quantities from the same destination need/origin stock snapshot before removing stock.

- [ ] **Step 7: Add `route-event-suspended` to the live condition and resolver-backed summary**

`classifyRouteOperationalCondition` checks `dispatchSuspended` before stock/capacity classifications.

`selectRouteOperations(game)` resolves the current effective route with:

```ts
resolveEffectiveRecurringRoute(route, game.events.activeModifiers, game.day)
```

Expose that effective state on `RouteOperationalSummary` for inspector and alert consumers.

- [ ] **Step 8: Fix stale-attempt matching and logistics alert semantics**

`attemptMatchesRoute` compares:

```ts
attempt.baselineCapacity === route.capacity
```

plus current origin/destination/material fields.

Origin-stock alert threshold uses current effective route capacity.

Structural capacity-streak evidence requires:

```ts
!attempt.dispatchSuspended &&
attempt.availableOriginStock >= Math.min(attempt.destinationNeed, attempt.baselineCapacity) &&
attempt.unmetDestinationNeed > 0 &&
attempt.dispatchedQuantity === attempt.baselineCapacity
```

Write alert tests proving two ×0.75 disruption attempts do **not** create `logistics-route-capacity`, while two undisrupted base-capacity-saturated attempts still do.

- [ ] **Step 9: Update exact-key attempt persistence in the same checkpoint**

`saveCodec.ts#validateSavedDailyRouteDispatchAttempt` currently calls `requireExactKeys`; extend that exact key list and validate every new field/contribution.

Update all direct `DailyRouteDispatchAttempt` literals and `logisticsReport.testUtils.ts` fixtures in the same commit. Keep `SAVE_SCHEMA_VERSION` at 15 in this intermediate checkpoint; Task 4 performs the single 15 → 16 bump together with recovery persistence.

- [ ] **Step 10: Run focused suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/logisticsReadModels.spec.ts src/lib/game/alerts.spec.ts src/lib/persistence/saveCodec.spec.ts src/lib/game/simulateDay.spec.ts
bun run check
git add src/lib/game/logisticsRouteModifiers.ts src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/types.ts src/lib/game/interCityLogistics.ts src/lib/game/logisticsReadModels.ts src/lib/game/alerts.ts src/lib/game/logisticsReport.testUtils.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/logisticsReadModels.spec.ts src/lib/game/alerts.spec.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat(logistics): apply event modifiers to dispatches"
```

---

### Task 4: Add discriminated recovery evidence and strict schema 16

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/logisticsRouteModifiers.ts`
- Modify: `src/lib/game/logisticsRouteModifiers.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Test: `src/lib/game/simulateDay.spec.ts`

**Interfaces:**

```ts
interface RouteRecoveryBase {
	routeId: string;
	modifierId: string;
	source: ActiveEventModifier['source'];
}

export type DailyRouteModifierRecovery =
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

- [ ] **Step 1: Write recovery derivation tests**

Cover one case per effect kind, edited base values, two simultaneous effects, and removed route.

```ts
expect(
	collectRouteModifierRecoveries(routes, activeBeforeExpiry, activeAfterExpiry, closingDay)
).toContainEqual({
	effectKind: 'route-capacity-multiplier',
	routeId: 'route-1',
	modifierId: 'event-modifier-7',
	source,
	disruptedCapacity: 75,
	recoveredCapacity: 120
});
```

The `120` base demonstrates that an edit made during disruption is what recovery reveals.

- [ ] **Step 2: Run recovery tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts
```

- [ ] **Step 3: Implement pure recovery comparison**

Compare each still-existing affected route under the active pre-expiry modifier set and the post-expiry modifier set. Emit only the discriminated effect row whose relevant value changed.

Removed routes return no row.

- [ ] **Step 4: Attach recovery rows in `simulateDay.ts`**

Derive recoveries from pre-expiry vs post-expiry modifier sets around existing `expireModifiersAfterDay`. `simulateDay` does not interpret effect values itself.

Add `modifierRecoveries` to `DailyLogisticsReport`.

- [ ] **Step 5: Bump strict save schema 15 → 16 once**

Change:

```ts
export const SAVE_SCHEMA_VERSION = 16;
```

Update exact-key validation for:

- event route targets;
- route timed effects;
- discriminated route contributions;
- `modifierRecoveries` and each recovery variant.

Do not add migration code for 15.

- [ ] **Step 6: Add schema rejection/round-trip tests**

Assert:

- schema-16 active route modifier round-trips;
- schema-16 dispatch contribution/recovery evidence round-trips;
- malformed discriminated fields reject;
- schema 15 rejects as unsupported.

- [ ] **Step 7: Run focused persistence/simulation suites and commit**

```bash
bun run test:unit -- --run src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/simulateDay.spec.ts src/lib/persistence/saveCodec.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/logisticsRouteModifiers.ts src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/simulateDay.ts src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat(logistics): persist disruption recovery evidence"
```

---

### Task 5: Project active disruptions through the Supply Planner with the same attempt contract

**Files:**
- Modify: `src/lib/game/supplyPlannerLogistics.ts`
- Modify: `src/lib/game/supplyPlannerLogistics.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

**Interfaces:**

`SupplyPlannerLogisticsSnapshot` gains only copied active recurring-route modifiers.

`SupplyPlannerRouteCondition` continues to extend `RouteOperationalCondition`; `route-event-suspended` comes from that live union.

- [ ] **Step 1: Write snapshot isolation tests**

Build a game containing one company import-cost modifier and one route modifier. Assert the planner snapshot copies only the route-targeted modifier and cloning/mutating the planner state cannot mutate `game.events`.

- [ ] **Step 2: Write dated projection tests before implementation**

Cover:

- capacity reduction active on projected day 1 and expired on day 4;
- lead-time adjustment changing only orders dispatched while active;
- suspension advancing projected route cadence;
- cost multiplier using `calculateEffectiveRouteTransportCost`;
- planner attempts carrying every baseline/effective field from the live attempt contract.

- [ ] **Step 3: Run planner tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts
```

- [ ] **Step 4: Copy route modifiers into the planner snapshot**

Copy only active modifiers where `target.kind === 'recurring-route'`. Do not copy cooldowns/history/RNG/decisions.

- [ ] **Step 5: Resolve effective routes by projected day**

Inside `processSupplyPlannerRouteDispatches`, call:

```ts
resolveEffectiveRecurringRoute(route, state.routeModifiers, day)
```

Use the same baseline/effective quantity rules as live dispatch and import `calculateEffectiveRouteTransportCost` from `interCityLogistics.ts`.

Fill the complete `DailyRouteDispatchAttempt` shape, including `baselineCapacity`, `dispatchSuspended`, and contribution evidence.

- [ ] **Step 6: Reuse the shared suspension condition**

Do not define a planner-only spelling. Add `route-event-suspended` to the planner condition rank as a blocking state.

Reduced capacity may still classify forecast rows as route-capacity constrained; structural live alert semantics remain separate and are already fixed in Task 3.

- [ ] **Step 7: Run planner suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts
bun run check
git add src/lib/game/supplyPlannerLogistics.ts src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project active route disruptions"
```

---

### Task 6: Surface route identity, active effects, dispatch impact, and recovery through existing UI

**Files:**
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/components/game/DecisionQueue.svelte.spec.ts`
- Modify: `src/lib/components/game/ActiveModifiers.svelte`
- Modify: `src/lib/components/game/ActiveModifiers.svelte.spec.ts`
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte`
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/WorldLogisticsRoutes.svelte`
- Modify: `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/routes/alertNavigation.ts`
- Modify: `src/routes/ManagementPanelHost.svelte` if needed to pass current routes into Active Modifiers
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

- [ ] **Step 1: Write localization tests proving the decision and options name the concrete route**

`gameCopy.ts` must enrich persisted IDs:

```ts
{
	...decision.copy.params,
	originCityName: i18n.labels.worldCity(originCityId).name,
	destinationCityName: i18n.labels.worldCity(destinationCityId).name,
	materialName: i18n.labels.material(materialId)
}
```

Pass these params to title, context, **and** `localizeEventDecisionOption` label/description translations.

Test after the live route has been removed; localization must still use persisted IDs rather than require a route lookup.

- [ ] **Step 2: Add a DecisionQueue rendering assertion**

Mount the localized freight-disruption decision fixture and assert visible text contains origin, destination, and material. No DecisionQueue domain logic is added.

- [ ] **Step 3: Make Active Modifiers effect/target-discriminated**

Switch by modifier target/effect. Keep existing company import-cost presentation unchanged.

For route modifiers, display route ID plus live endpoint/material names when the route still exists; fall back to persisted route ID when removed. Pass only the current recurring-route list from `ManagementPanelHost` if the component needs this lookup.

- [ ] **Step 4: Extend route inspector with base/effective evidence**

Show:

- base → effective capacity;
- base → effective lead time;
- base → effective transport cost per unit;
- suspension state and remaining modifier duration;
- latest attempt baseline vs actual quantity/cost.

Use `RouteOperationalSummary.effectiveRoute`; do not recompute effect math in Svelte.

- [ ] **Step 5: Add world-route disrupted hook and non-color-only treatment**

Set:

```html
data-disrupted="true"
```

when the summary has active route contributions. Preserve existing route geometry. Add a dashed/double-stroke or similar existing-token treatment plus accessible route-list/inspector text so color is not the only signal.

- [ ] **Step 6: Render report impact and discriminated recovery rows**

`ReportsPanel.svelte` switches on contribution/recovery `effectKind` and uses specific fields. Do not inspect `unknown` values.

- [ ] **Step 7: Add actionable disruption alert copy/navigation**

Important active route modifiers produce one route-targeted disruption alert with remaining duration. Reuse existing world-route alert navigation and suppress it if the route no longer exists.

Keep Task 3's structural capacity alert policy unchanged.

- [ ] **Step 8: Add English/Japanese/Traditional Chinese copy**

Add keys for:

- freight-disruption target-aware title/context/options;
- each active route effect;
- shared `route-event-suspended` condition;
- inspector base/effective labels;
- report impact/recovery rows;
- disruption alert.

Run `gameCopy.spec.ts` completeness checks after all three locale files change.

- [ ] **Step 9: Run component/i18n/alert suites and commit**

```bash
bun run test:unit -- --run src/lib/i18n/gameCopy.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts src/lib/components/game/ActiveModifiers.svelte.spec.ts src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/game/alerts.spec.ts
bun run check
git add src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts src/lib/components/game/ActiveModifiers.svelte src/lib/components/game/ActiveModifiers.svelte.spec.ts src/lib/components/game/LogisticsRouteInspector.svelte src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts src/lib/components/game/WorldLogisticsRoutes.svelte src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/game/alerts.ts src/lib/game/alerts.spec.ts src/routes/alertNavigation.ts src/routes/ManagementPanelHost.svelte src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): surface active route disruptions"
```

---

### Task 7: Add the production `freight-disruption` event

**Files:**
- Modify: `src/lib/game/eventCatalog.ts`
- Modify: `src/lib/game/eventCatalog.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Test: `src/lib/game/eventSelection.spec.ts`
- Test: `src/lib/i18n/gameCopy.spec.ts`

**Production definition:**

```text
id: freight-disruption
version: 1
selection: weighted weight 1
condition: always
target: active recurring route
expiresAfterDays: 2
cooldownDays: 7 per concrete route
```

Options:

```text
accept-delay
  3 days: lead time +1
  3 days: capacity ×0.75

charter-carriers
  immediate cash -2,000
  2 days: capacity ×1.25
  2 days: transport cost ×1.5

suspend-shipments
  2 days: dispatch suspension
```

- [ ] **Step 1: Write production-catalog tests**

Assert exact production ID allowlist now includes `freight-disruption`, its target is recurring-route, all effect/stacking keys are valid, and it is ineligible with no active route.

- [ ] **Step 2: Add the definition with stable keys**

```text
freight-disruption:lead-time
freight-disruption:capacity
freight-disruption:transport-cost
freight-disruption:suspension
```

The lifecycle implementation scopes replacement by target; do not interpolate route ID into authored stacking keys.

- [ ] **Step 3: Add target-aware localized copy**

Use the persisted/enriched route params from Tasks 1 and 6 so title/context/options name the concrete origin → destination and material before resolution.

- [ ] **Step 4: Add deterministic selection/materialization test**

With two active routes and a fixed event RNG state, assert the selected event target is the expected route and `copy.params` matches it.

- [ ] **Step 5: Run catalog/selection/i18n suites and commit**

```bash
bun run test:unit -- --run src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts src/lib/i18n/gameCopy.spec.ts
bun run check
git add src/lib/game/eventCatalog.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventSelection.spec.ts src/lib/i18n/gameCopy.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(events): add freight disruption event"
```

---

### Task 8: Prove the full disruption/recovery lifecycle and run release gates

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only focused test helpers required by the deterministic save fixture.

- [ ] **Step 1: Add deterministic schema-16 E2E save setup**

Create a sandbox state with:

- opened origin/destination industry cities;
- warehouse capacity and origin stock sufficient for a real dispatch;
- one active due route;
- deterministic event runtime state that materializes `freight-disruption` for that route.

Do not add a production debug command solely for the test.

- [ ] **Step 2: Assert the unresolved decision visibly identifies the route**

Before resolution, assert DecisionQueue text contains the route's origin, destination, and material. This is the regression gate for materialized route copy params.

- [ ] **Step 3: Resolve a disruption and inspect active UI**

Choose `accept-delay` or `charter-carriers`. Assert:

- Active Modifiers names the route/effect;
- world route has `data-disrupted="true"`;
- route inspector shows base → effective values;
- disruption alert navigates to that route.

- [ ] **Step 4: Close through an affected dispatch**

Assert the latest attempt exposes baseline/effective capacity/lead-time/cost evidence and the created transfer order uses the adjusted arrival/cost.

- [ ] **Step 5: Edit the base route while the modifier is active**

Change base capacity or lead time through the existing route-management flow. Confirm active inspector values derive from edited base + modifier.

- [ ] **Step 6: Close through expiry and assert recovery**

Assert:

- recovery report reflects the edited base value;
- `data-disrupted` clears;
- disruption alert clears;
- previously dispatched order retains its original adjusted arrival/cost.

- [ ] **Step 7: Run the targeted E2E first**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts -g "freight disruption"
```

Expected: targeted lifecycle passes.

- [ ] **Step 8: Run focused regression groups**

```bash
bun run test:unit -- --run src/lib/game/eventTargets.spec.ts src/lib/game/eventSelection.spec.ts src/lib/game/eventCatalog.spec.ts src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts src/lib/game/logisticsRouteModifiers.spec.ts src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/logisticsReadModels.spec.ts src/lib/game/alerts.spec.ts src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/persistence/saveCodec.spec.ts src/lib/i18n/gameCopy.spec.ts src/lib/components/game/ActiveModifiers.svelte.spec.ts src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts
```

Expected: zero failures.

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

- check: 0 errors/warnings;
- lint/format: pass;
- full unit suite: pass;
- full Playwright suite: pass;
- build: pass;
- diff whitespace check: pass.

- [ ] **Step 10: Run explicit scope audits**

```bash
git grep -n "effective.*Route\|effectiveRoute" -- src/lib/game src/routes
git grep -n "Math.random\|rngState" -- src/lib/game/logisticsRouteModifiers.ts src/lib/game/interCityLogistics.ts
git grep -n "checkedRoundedProduct" -- src/lib/game
git grep -n "troute-event-suspended" -- src docs
git grep -n "schemaVersion.*15\|SAVE_SCHEMA_VERSION.*15" -- src/lib src/routes
```

Expected review:

- no persisted duplicate effective route state;
- no logistics RNG path;
- no `checkedRoundedProduct` helper;
- no misspelled suspension condition;
- remaining schema-15 references are rejection fixtures only.

Also inspect the final diff for route recovery snapshots, generic target/effect registries, manual-transfer changes, or disruption-specific planner recommendation machinery.

- [ ] **Step 11: Commit lifecycle coverage**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test(logistics): cover disruption recovery lifecycle"
```

- [ ] **Step 12: Final whole-branch requirement review**

Verify each design acceptance criterion against `origin/main...HEAD`, especially:

- one event candidate regardless of route count;
- concrete route visible before option resolution;
- target-scoped replacement;
- suspension advances cadence;
- `route-event-suspended` shared live/planner;
- structural capacity alert uses baseline capacity and ignores suspension;
- route edit + expiry reveals edited base;
- planner expires modifiers on projected dates;
- removed route creates no repair/recovery target;
- Active Modifiers discriminates effect kinds;
- schema 16 rejects 15 without migration.

Only then mark the implementation PR ready for review.

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

Each checkpoint runs its focused tests plus `bun run check`; full lint/unit/E2E/build gates run in Task 8.