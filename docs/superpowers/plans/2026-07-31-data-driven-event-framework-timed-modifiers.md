# Data-Driven Event Framework with Timed Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three hard-coded strategic decisions with a deterministic, materialized event system and ship `supplier-terms.bulk-discount` as a real three-day retail import-cost modifier in one implementation pull request.

**Architecture:** Keep command-owned system notices and strategic events in the existing Decisions queue, but represent them as a discriminated union. A validated TypeScript catalog feeds an isolated three-draw event RNG packet and materializes self-contained event instances; typed effect preparation applies choices atomically. The same implementation PR then adds a company-scoped replace-only timed modifier, compiles it with scenario rules through provenance-aware `SimulationRules`, persists the complete v12 state, and exposes attribution through reports, alerts, and the existing Decisions panel.

**Tech Stack:** TypeScript 6, Svelte 5/SvelteKit, Vitest 4, Playwright, Tauri/browser/in-memory save repositories, existing Park-Miller RNG, existing HPA-277 finance domain, existing HPA-280 scenario runtime.

## Delivery Override

The user approved **one implementation PR**, not the two-PR delivery split described in the latest design revision. This plan supersedes only that delivery split:

- one branch and one draft implementation PR targeting `main`;
- one final save schema bump from v11 directly to v12;
- no intermediate core-only schema and no v13 migration;
- staged commits and explicit readiness gates preserve reviewability inside the single PR;
- HPA-278 is complete when this one implementation PR merges.

## Global Constraints

- Production catalog contains exactly `cash-pressure`, `expansion-opportunity`, and `supplier-terms`.
- Production event target is `{ kind: 'company' }` only.
- Follow-up chains, non-company targets, generic stack semantics, target-deletion cancellation, and unused handlers remain out of scope.
- The only production timed effect is an all-target `retail-product` import-cost multiplier.
- The only v1 modifier conflict rule is `stackingRule: 'replace'` by exact `stackingKey`.
- `supplier-terms.bulk-discount` keeps its current immediate effects and additionally activates a three-day `0.9` multiplier.
- The modifier is active when the resolution day closes and for the next two closing days; expiry is exclusive.
- Repeating `bulk-discount` replaces the prior matching modifier and restarts duration.
- Existing supplier decisions migrated from v11 remain definition version 1 and gain no retroactive modifier.
- Event decisions resolve by materialized instance ID; family lookup uses `eventId`.
- All three migrated event families use `cooldownDays = 1`; pending-instance exclusion preserves unresolved expiry timing.
- Event RNG is isolated from `GameState.rngState` and consumes exactly three global draws per completed day: cadence, weighted-event selection, and materialization seed.
- The third global draw seeds a local materialization RNG. Future local randomness must not consume extra global event draws.
- `selectionSchemaVersion` starts at `1`; changing the global packet requires a save migration.
- Event definition versions own local materialization semantics.
- V1 preserves the existing cash/finance mutual exclusion: one option cannot contain both `cash-adjust` and `finance-borrow`.
- At most one `finance-borrow` effect may appear in an option.
- Availability and resolution share the same pure ordered preparation path.
- Any decision failure returns the original state object and commits no state, autosave, scenario persistence, revision, terminal result, or success sound.
- Event copy is key-driven; system fallback copy remains inline.
- `alerts.ts` emits typed references. Event alert text is produced in the localization layer, never by reading a nonexistent event `title`.
- Scenario-only import-cost outcomes remain unchanged under the existing same-scope overlap validator.
- Final persisted schema is v12 and includes event runtime, modifiers, event report attribution, and migrated decisions.
- Every Vitest case must execute at least one `expect` because `expect.requireAssertions` is enabled.
- Every Svelte task must consult the repository-required Svelte MCP documentation and run the Svelte autofixer before its task commit.
- The implementation PR must pass `bun run check`, `bun run lint`, and `bun run test` before readiness.

## File and Responsibility Map

### New domain modules

- `src/lib/game/eventDefinitions.ts`
  - catalog authoring types;
  - bounded validation and stable diagnostics;
  - normalization and event lookup.
- `src/lib/game/eventDefinitions.spec.ts`
  - validation diagnostics and normalization order.
- `src/lib/game/eventCatalog.ts`
  - the three production definitions and supplier definition version 2.
- `src/lib/game/eventCatalog.spec.ts`
  - exact production allowlist, versions, parity payloads, and localization keys.
- `src/lib/game/eventSelection.ts`
  - event runtime initialization;
  - fixed RNG packet advancement;
  - conditions, cooldowns, pending exclusion, weighted/forced selection, and materialization.
- `src/lib/game/eventSelection.spec.ts`
  - RNG golden tests, selection boundaries, instance IDs, cooldowns, and determinism.
- `src/lib/game/eventEffects.ts`
  - availability dry run;
  - typed immediate-effect preparation and atomic commit;
  - typed decision-resolution results.
- `src/lib/game/eventEffects.spec.ts`
  - effect parity, finance failures, atomic rollback, and history.
- `src/lib/game/eventModifiers.ts`
  - supplier modifier activation;
  - replace semantics;
  - active-day compilation and exclusive expiry;
  - modifier lifecycle snapshots.
- `src/lib/game/eventModifiers.spec.ts`
  - activation, replacement, every active day, exclusive expiry, and save-safe snapshots.
- `src/lib/components/game/ActiveModifiers.svelte`
  - localized active-modifier presentation inside Decisions.
- `src/lib/components/game/ActiveModifiers.svelte.spec.ts`
  - empty, active, important, and expiring states.

### Existing domain boundaries

- `src/lib/game/types.ts`
  - persisted system/event decision union;
  - event runtime, cooldown, modifier, history, application evidence, and report shapes.
- `src/lib/game/events.ts`
  - thin production facade for queue cleanup and catalog-backed selection.
- `src/lib/game/events.spec.ts`
  - migrated-family parity and queue lifecycle.
- `src/lib/game/state.ts`
  - dispatch system acknowledgement versus typed event resolution.
- `src/lib/game/state.spec.ts`
  - public resolution semantics and world refresh.
- `src/lib/game/simulateDay.ts`
  - modifier/rule/report/expiry/selection orchestration.
- `src/lib/game/simulateDay.spec.ts`
  - normative daily ordering and report reconciliation.
- `src/lib/game/simulationRules.ts`
  - source metadata, deterministic merge, multiplicative resolution, and contributions.
- `src/lib/game/simulationRules.spec.ts`
  - scenario-only parity and scenario/event multiplication.
- `src/lib/game/stock.ts`
  - retail import-cost contribution evidence.
- `src/lib/game/stock.spec.ts`
  - multiplier application and evidence.
- `src/lib/game/industryProduction.ts`
  - adapt the second `getImportCostMultiplier` call site to the new resolution result.
- `src/lib/game/industryProduction.spec.ts`
  - unchanged industrial scenario behavior and source evidence.
- `src/lib/game/alerts.ts`
  - typed decision/modifier alert references and stable group ordering.
- `src/lib/game/alerts.spec.ts`
  - instance-derived IDs, modifier ordering, and Decisions deep links.
- `src/lib/game/reports.ts`
  - retain latest event impact/lifecycle arrays without rolling aggregates.

### Scenario and route adapters

- `src/lib/scenarios/runtime.ts`
  - scenario rule source metadata;
  - decision-resolution failure mapping;
  - instance-ID calibration updates.
- `src/lib/scenarios/runtime.spec.ts`
  - no-history-on-failure, replay parity, and instance-ID resolution.
- `src/lib/scenarios/types.ts`
  - structured decision failure payload on invalid commands if needed by existing result types.
- `src/routes/gameRouteController.ts`
  - route-level `decision-rejected` adaptation and no-commit behavior.
- `src/routes/gameRouteController.spec.ts`
  - no autosave, no scenario persist, no state assignment, and no success sound.
- `src/lib/game/commandResult.ts`
  - `decision-rejected` commit result variant.

### Persistence

- `src/lib/persistence/saveTypes.ts`
  - `SAVE_SCHEMA_VERSION = 12`.
- `src/lib/persistence/saveCodec.ts`
  - v11 → v12 migration and strict v12 validation.
- `src/lib/persistence/saveCodec.spec.ts`
  - migrated strategic/system decisions, runtime state, modifiers, reports, and malformed-data diagnostics.
- `src/lib/persistence/saveRepository.spec.ts`
  - in-memory/browser shared repository contract.
- `src/lib/persistence/scenarioCodec.ts`
  - shared embedded-game v12 decode.
- `src/lib/persistence/scenarioCodec.spec.ts`
  - active scenario run migration.
- `src/lib/persistence/scenarioRepository.spec.ts`
  - v12 active-run persistence and revision preservation.
- backend-specific repository specs discovered by `rg "SAVE_SCHEMA_VERSION|schemaVersion: 11" src/lib/persistence src-tauri`.

### Localization and presentation

- `src/lib/i18n/gameCopy.ts`
  - event/system decision localization;
  - alert localization;
  - target/effect/lifecycle copy.
- `src/lib/i18n/localizedTypes.ts`
  - display-only localized decisions, options, modifiers, reports, and alerts.
- `src/lib/i18n/gameCopy.spec.ts`
  - event copy and locale completeness.
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/components/game/DecisionQueue.svelte`
  - event provenance and availability from persisted decisions.
- `src/lib/components/game/DecisionQueue.svelte.spec.ts`
  - system/event rendering and finance-disabled behavior.
- `src/lib/components/game/ReportsPanel.svelte`
  - latest-day modifier impacts and lifecycle.
- `src/lib/components/game/ReportsPanel.svelte.spec.ts`
  - localized impact/replacement/expiry evidence.
- `src/lib/components/game/TopBar.svelte`
  - consume localized alerts if its current prop remains domain-typed.
- `src/routes/+page.svelte`
  - Active Modifiers placement, alert localization, and Decisions routing.
- `src/routes/page.svelte.spec.ts`
  - alert click and Decisions-panel visibility.
- `src/routes/retail-sim.e2e.ts`
  - production-catalog supplier lifecycle.

---

### Task 1: Lock Current Strategic-Decision Behavior

**Files:**
- Modify: `src/lib/game/events.spec.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`

**Interfaces:**
- Consumes: current `generateDecisions`, `pruneExpiredDecisions`, `resolveDecision`, and `simulateDay` behavior.
- Produces: golden parity fixtures that later tasks must keep green until the old implementation is removed.

- [ ] **Step 1: Add a shared parity helper that finds a generated family by stable ID**

```ts
function findDecision(game: GameState, decisionId: string): DecisionItem {
	const decision = game.decisions.find((candidate) => candidate.id === decisionId);
	expect(decision).toBeDefined();
	return decision!;
}
```

Keep this helper local to the pre-cutover tests. Task 4 replaces family-ID lookup with `eventId` lookup.

- [ ] **Step 2: Add exact catalog-family parity tests**

Cover:

```ts
it('generates cash pressure only below zero cash', () => { /* cash -1 yes, cash 0 no */ });
it('generates expansion only at every exact boundary', () => { /* day 14, cash 55_000, profit 62, below cap */ });
it('prioritizes cash pressure over expansion and supplier terms', () => { /* one result */ });
it('materializes the exact emergency-loan amount, purpose, and 56-day term', () => {});
it('keeps option order and exact effects for all three families', () => {});
it('applies morale to both scorecard and every store', () => {});
it('adjusts stock by targetStock percent then recalculates stockHealth', () => {});
```

Assert concrete option IDs and values, not snapshots alone.

- [ ] **Step 3: Add early-resolution and unresolved-expiry recurrence tests**

For each family, prove current behavior before cutover:

```ts
it('allows cash pressure to regenerate on the next visible day after early resolution', () => {});
it('does not duplicate cash pressure while its previous decision remains pending', () => {});
it('allows unresolved cash pressure to regenerate only after queue cleanup', () => {});
```

Repeat the boundary shape for expansion and supplier terms; supplier assertions must account for cadence.

- [ ] **Step 4: Lock the current supplier cadence sequence separately from the future RNG contract**

Use a small seed/day table against current `createRngFromState(game.rngState + game.day * 97)`. Name the test `legacy supplier cadence characterization` so Task 3 may intentionally replace exact days while preserving deterministic 12% behavior.

- [ ] **Step 5: Lock scenario calibration assumptions that must change**

Add a test showing the current calibration helper resolves supplier terms using family ID. This test should be changed, not preserved, when instance IDs land.

- [ ] **Step 6: Run the characterization suite**

Run:

```bash
bunx vitest run src/lib/game/events.spec.ts src/lib/game/state.spec.ts src/lib/game/simulateDay.spec.ts src/lib/scenarios/runtime.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/events.spec.ts src/lib/game/state.spec.ts src/lib/game/simulateDay.spec.ts src/lib/scenarios/runtime.spec.ts
git commit -m "test(events): lock strategic decision parity"
```

**Gate:** Do not start Task 2 until every parity assertion passes on unchanged production code.

---

### Task 2: Add Typed Event Definitions and the Production Catalog

**Files:**
- Create: `src/lib/game/eventDefinitions.ts`
- Create: `src/lib/game/eventDefinitions.spec.ts`
- Create: `src/lib/game/eventCatalog.ts`
- Create: `src/lib/game/eventCatalog.spec.ts`
- Modify: `src/lib/game/types.ts`

**Interfaces:**
- Consumes: `ScoreKey`, finance purposes/terms, and structured copy conventions.
- Produces:

```ts
export type StructuredCopyParams = Readonly<Record<string, string | number>>;
export interface StructuredCopyRef { key: string; params: StructuredCopyParams }

export type EventCondition =
	| { kind: 'always' }
	| { kind: 'all'; conditions: readonly EventCondition[] }
	| { kind: 'day-at-least'; day: number }
	| { kind: 'cash-below'; amount: number }
	| { kind: 'cash-at-least'; amount: number }
	| { kind: 'score-at-least'; score: ScoreKey; value: number }
	| { kind: 'store-count-below-cap' };

export type EventSelectionPolicy =
	| { kind: 'forced'; priority: number }
	| { kind: 'weighted'; weight: number };

export type EventTarget = { kind: 'company' };
export type EventTargetSelector = { kind: 'company' };
```

- Produces `validateAndNormalizeEventCatalog(definitions)` and `PRODUCTION_EVENT_CATALOG`.

- [ ] **Step 1: Write failing validation tests**

Add focused cases for:

- duplicate event IDs;
- invalid ID syntax;
- non-positive definition versions;
- non-positive expiry/cooldown;
- duplicate option IDs;
- invalid forced priority or weighted weight;
- empty `all` groups;
- finite cash/score values;
- unsupported option payloads introduced through unsafe casts;
- cash and finance in the same option;
- more than one finance effect;
- bounded contradictions only:
  - `cash-below: A` with `cash-at-least: B` when `B >= A`;
  - score thresholds outside `0..100`.

Diagnostics must sort by `eventId`, then `path`.

- [ ] **Step 2: Run tests to verify failure**

```bash
bunx vitest run src/lib/game/eventDefinitions.spec.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement definition, template, diagnostic, and normalization types**

Use exhaustive TypeScript unions. Do not add callbacks, arbitrary paths, `any` state patches, follow-ups, non-company selectors, generic stack, or target cancellation.

Define immediate-effect templates as:

```ts
export type EventImmediateEffectTemplate =
	| { kind: 'cash-adjust'; amount: number }
	| { kind: 'score-adjust'; score: ScoreKey; amount: number }
	| { kind: 'store-morale-adjust'; scope: 'all-stores'; amount: number }
	| { kind: 'store-stock-adjust-by-target-percent'; scope: 'all-stores'; percent: number }
	| {
			kind: 'finance-borrow';
			purpose: 'emergency' | 'supplierCredit';
			amount:
				| { kind: 'fixed'; amount: number }
				| { kind: 'available-credit-clamped'; minimum: number; maximum: number; increment: number };
			termDays: 28 | 56;
	  };
```

Define the only modifier template as a replace-only retail multiplier:

```ts
export interface EventModifierTemplate {
	durationDays: number;
	stackingKey: string;
	stackingRule: 'replace';
	effect: {
		kind: 'import-cost-multiplier';
		scope: 'retail-product';
		target: { kind: 'all' };
		multiplier: number;
	};
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}
```

- [ ] **Step 4: Implement the three production definitions**

Use exact parity values:

```ts
cash-pressure: version 1, forced priority 100, expiresAfterDays 2, cooldownDays 1
expansion-opportunity: version 1, forced priority 50, expiresAfterDays 3, cooldownDays 1
supplier-terms: version 2, weighted weight 1, expiresAfterDays 2, cooldownDays 1
```

`bulk-discount` keeps cash `-2_500`, profit `+3`, stock `+6%`, and adds:

```ts
{
	durationDays: 3,
	stackingKey: 'supplier-bulk-discount:retail-product',
	stackingRule: 'replace',
	effect: {
		kind: 'import-cost-multiplier',
		scope: 'retail-product',
		target: { kind: 'all' },
		multiplier: 0.9
	},
	explanation: { key: 'events.supplierTerms.bulkDiscount.modifier', params: {} },
	importance: 'important'
}
```

- [ ] **Step 5: Add exact production-catalog tests**

Assert:

```ts
expect(PRODUCTION_EVENT_CATALOG.definitions.map((definition) => definition.id)).toEqual([
	'cash-pressure',
	'expansion-opportunity',
	'supplier-terms'
]);
```

Also assert definition versions, conditions, option order, effect order, modifier payload, and absence of unsupported contract kinds.

- [ ] **Step 6: Run targeted tests and typecheck**

```bash
bunx vitest run src/lib/game/eventDefinitions.spec.ts src/lib/game/eventCatalog.spec.ts
bun run check
```

Expected: PASS while current runtime still uses `events.ts` hard-coded constructors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/eventDefinitions.ts src/lib/game/eventDefinitions.spec.ts src/lib/game/eventCatalog.ts src/lib/game/eventCatalog.spec.ts
git commit -m "feat(events): define validated production catalog"
```

---

### Task 3: Implement Event Runtime State and Deterministic Materialization

**Files:**
- Create: `src/lib/game/eventSelection.ts`
- Create: `src/lib/game/eventSelection.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/placement.ts`
- Modify: `src/routes/+page.svelte`
- Modify: GameState test builders reported by `bun run check`

**Interfaces:**
- Consumes: normalized catalog from Task 2 and existing `createRngFromState`.
- Produces:

```ts
export const EVENT_SELECTION_SCHEMA_VERSION = 1;
export const EVENT_DRAW_COUNT_PER_DAY = 3;
export const EVENT_HISTORY_LIMIT = 200;

export interface EventRuntimeState {
	selectionSchemaVersion: 1;
	rngState: number;
	nextInstanceSequence: number;
	nextModifierSequence: number;
	cooldowns: EventCooldownRecord[];
	activeModifiers: ActiveEventModifier[];
	history: EventHistoryEntry[];
}

export function createInitialEventRuntime(seed: number): EventRuntimeState;
export function selectEventForDay(
	game: GameState,
	catalog: NormalizedEventCatalog
): GameState;
```

- [ ] **Step 1: Write failing RNG packet tests**

Cover identical three-draw advancement for:

- no eligible candidates;
- cadence failure;
- cadence pass with an empty weighted pool fixture;
- forced winner;
- one weighted winner;
- pending duplicate exclusion.

Capture the post-packet RNG state as explicit integers for fixed seeds.

- [ ] **Step 2: Write failing selection and materialization tests**

Assert:

- forced priority then event ID tie-break;
- weighted threshold uses draw 2;
- draw 3 becomes a local RNG seed and no extra global draw occurs;
- company target is persisted;
- unique IDs `event-instance-1`, `event-instance-2`;
- `generatedOnDay === game.day` for the already-advanced selection state;
- concrete finance amount is materialized;
- pending same `eventId` + company target is excluded;
- cooldown blocks only while `selectionDay < eligibleOnDay`;
- `cooldownDays = 1` permits next-day recurrence after early resolution;
- same state and catalog produce deep-equal output;
- source array order does not change normalized catalog selection.

- [ ] **Step 3: Run tests to verify failure**

```bash
bunx vitest run src/lib/game/eventSelection.spec.ts
```

Expected: FAIL because runtime functions do not exist.

- [ ] **Step 4: Implement isolated runtime initialization**

Derive the event RNG with a stable salt and normalize it using the existing RNG helper. Initialize empty modifiers/history/cooldowns and sequences at 1.

Add `events: createInitialEventRuntime(seed)` to every production new-game path. Do not fast-forward event draws for scenario start-day overrides.

- [ ] **Step 5: Implement fixed packet consumption**

Consume before branching:

```ts
const rng = createRngFromState(game.events.rngState);
const cadenceDraw = rng.next();
const weightedDraw = rng.next();
const materializationSeedDraw = rng.next();
const materializationSeed = normalizeSeed(Math.floor(materializationSeedDraw * 2_147_483_646) + 1);
```

Persist `rng.getState()` after draw 3 regardless of winner.

- [ ] **Step 6: Implement conditions, pending checks, cooldowns, and selection**

Selection order is forced then weighted because follow-ups are out of scope. Forced candidates sort by descending priority then ID. Weighted candidates sort by ID; cadence must pass `< 0.12`; use cumulative positive weights.

Exactly one or zero events materialize.

- [ ] **Step 7: Implement materialization**

Persist:

- instance ID;
- event ID/version;
- company target;
- generated/expiry days;
- copy ref;
- option IDs;
- concrete ordered effects;
- concrete modifier templates;
- cooldown and generated-history entry.

Use the local RNG object for future-compatible materialization, even if current definitions need no random branch after the seed is created.

- [ ] **Step 8: Update GameState fixtures and run checks**

```bash
bunx vitest run src/lib/game/eventSelection.spec.ts
bun run check
```

Expected: PASS. Do not switch `simulateDay` yet.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/eventSelection.ts src/lib/game/eventSelection.spec.ts src/lib/game/placement.ts src/routes/+page.svelte
git add -u
git commit -m "feat(events): add deterministic event runtime"
```

---

### Task 4: Cut Over the Decision Union and Daily Event Selection

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/events.ts`
- Modify: `src/lib/game/events.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: system-notice constructors discovered by:

```bash
rg "decisions: \[|options: \[|effects: \{\}" src/lib/game src/routes --glob '*.ts' --glob '*.svelte'
```

- Modify: associated constructor specs.

**Interfaces:**
- Consumes: `selectEventForDay` and event definitions from Tasks 2–3.
- Produces:

```ts
export interface SystemDecisionItem { kind: 'system'; /* existing inline copy/context */ }
export interface EventDecisionItem { kind: 'event'; id: string; eventId: string; /* materialized */ }
export type DecisionItem = SystemDecisionItem | EventDecisionItem;

export function pruneExpiredDecisions(game: GameState, closingDay: number): GameState;
export function generateNextEvent(game: GameState): GameState;
```

- [ ] **Step 1: Write union and queue-cleanup tests**

Assert system notices:

- retain IDs, title, context, option copy, and expiry;
- contain no gameplay effects;
- disappear without event history.

Assert expired event decisions:

- disappear after day advance;
- write one `event-decision-expired` history entry stamped with `closingDay`, not selection day.

- [ ] **Step 2: Convert `DecisionItem` to a discriminated union**

System options contain only `id`, `label`, and `description`. Event options contain `id`, ordered concrete effects, and concrete modifier templates.

- [ ] **Step 3: Convert every system-notice constructor mechanically**

Add `kind: 'system'` and remove `effects: {}`. Preserve all existing copy and IDs. Do not move these notices into `eventCatalog.ts`.

- [ ] **Step 4: Replace `events.ts` with a thin facade**

It should import the normalized production catalog and delegate to Task 3. Remove the three hard-coded constructors only after parity tests have equivalent materialized assertions.

- [ ] **Step 5: Change `simulateDay` tail ordering**

After the report:

```ts
const selectionDayGame = { ...postServiceGame, day: closingDay + 1, reports: [...] };
const cleaned = pruneExpiredDecisions(selectionDayGame, closingDay);
const selected = generateNextEvent(cleaned);
return refreshWorldProgress(selected);
```

Selection receives the already-advanced day. The event packet advances on every completed day.

- [ ] **Step 6: Replace family-ID tests with instance/event identity tests**

Use:

```ts
const supplier = game.decisions.find(
	(decision): decision is EventDecisionItem =>
		decision.kind === 'event' && decision.eventId === 'supplier-terms'
);
expect(supplier?.id).toMatch(/^event-instance-\d+$/);
```

- [ ] **Step 7: Run parity, selection, and daily integration tests**

```bash
bunx vitest run src/lib/game/events.spec.ts src/lib/game/eventSelection.spec.ts src/lib/game/simulateDay.spec.ts
bun run check
```

Expected: PASS. The legacy exact supplier-day characterization may be replaced with fixed packet goldens; eligibility, 12% cadence, option/effect parity, expiry, and recurrence must remain covered.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/events.ts src/lib/game/events.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts
git add -u
git commit -m "feat(events): materialize catalog decisions daily"
```

**Gate:** Do not begin effect migration until all strategic events are generated only through the production catalog.

---

### Task 5: Add Atomic Typed Effects and Explicit Failure Adapters

**Files:**
- Create: `src/lib/game/eventEffects.ts`
- Create: `src/lib/game/eventEffects.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/commandResult.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`
- Modify: `src/lib/scenarios/runtime.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`
- Modify: `src/lib/scenarios/types.ts`

**Interfaces:**
- Produces:

```ts
export type DecisionResolutionFailureCode =
	| 'decision-not-found'
	| 'option-not-found'
	| 'decision-expired'
	| 'target-missing'
	| 'finance-unavailable'
	| 'effect-rejected';

export type DecisionResolutionResult =
	| { ok: true; game: GameState; decisionKind: 'system' | 'event' }
	| {
			ok: false;
			game: GameState;
			code: DecisionResolutionFailureCode;
			context: Record<string, string | number>;
			financeFailure?: FinanceFailureCode;
	  };

export function getDecisionOptionAvailability(
	game: GameState,
	decision: DecisionItem,
	optionId: string
): DecisionOptionAvailability;

export function resolveDecision(
	game: GameState,
	decisionId: string,
	optionId: string
): DecisionResolutionResult;
```

- [ ] **Step 1: Write failing atomicity and availability tests**

Cover:

- missing decision/option;
- expired event;
- valid system acknowledgement;
- each immediate effect;
- finance amount available at generation but unavailable at resolution;
- a late invalid effect rolling back earlier tentative cash/score/store/loan changes;
- exact ordered effects for both finance options;
- no mutation or ID allocation during availability;
- original object identity on every failure.

- [ ] **Step 2: Run tests to verify failure**

```bash
bunx vitest run src/lib/game/eventEffects.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement one pure preparation path**

Preparation accepts the persisted event option and returns either a complete candidate transition/activation plan or a typed failure. Availability calls preparation in dry-run mode. Resolution commits only a fully prepared candidate.

Preserve v1 cash/finance mutual exclusion defensively at runtime even though catalog validation already enforces it.

- [ ] **Step 4: Implement exact effect handlers**

- `cash-adjust`: whole-dollar addition.
- `score-adjust`: add and `clampScore`.
- `store-morale-adjust`: all stores, `clampScore`.
- `store-stock-adjust-by-target-percent`: exact target-stock formula, clamp to zero, recalculate `stockHealth`.
- `finance-borrow`: call HPA-277 `borrow` with the persisted amount/purpose/term; abort on failure.

Commit success by removing the instance, appending resolved history, preparing modifier templates for Task 6, and calling `refreshWorldProgress`.

- [ ] **Step 5: Dispatch system versus event resolution in `state.ts`**

System acknowledgement removes only the notice. Event resolution delegates to `eventEffects.ts`. Delete the old broad `applyScoreEffects`/`applyStoreEffects` decision path once parity tests pass.

- [ ] **Step 6: Add route `decision-rejected` result**

Extend `GameRouteCommitResult`:

```ts
| {
	status: 'decision-rejected';
	code: DecisionResolutionFailureCode;
	context: Record<string, string | number>;
	financeFailure?: FinanceFailureCode;
  }
```

`GameRouteController.resolveDecision` must adapt failure before `commitMutation` treats it as a game state. Assert no state assignment, autosave, scenario write, or success SFX.

- [ ] **Step 7: Add scenario invalid-command adaptation**

`dispatchScenarioCommand` returns `DecisionResolutionResult` failures as a distinct dispatch failure. `executeScenarioCommand` maps them to `ok: false`, `code: 'invalid-command'`, with structured decision context. The run and revision remain unchanged.

Update scenario calibration to locate supplier terms by `eventId` and resolve with `decision.id`.

- [ ] **Step 8: Run focused adapter tests**

```bash
bunx vitest run src/lib/game/eventEffects.spec.ts src/lib/game/state.spec.ts src/routes/gameRouteController.spec.ts src/lib/scenarios/runtime.spec.ts
bun run check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/eventEffects.ts src/lib/game/eventEffects.spec.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/commandResult.ts src/routes/gameRouteController.ts src/routes/gameRouteController.spec.ts src/lib/scenarios/runtime.ts src/lib/scenarios/runtime.spec.ts src/lib/scenarios/types.ts
git commit -m "feat(events): resolve typed effects atomically"
```

---

### Task 6: Localize Event Decisions Without Moving Gameplay Payloads into UI Models

**Files:**
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/localizedTypes.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/components/game/DecisionQueue.svelte`
- Modify: `src/lib/components/game/DecisionQueue.svelte.spec.ts`

**Interfaces:**
- Produces display-only localization:

```ts
export interface LocalizedDecisionOption {
	id: string;
	label: string;
	description: string;
}

export interface LocalizedDecision {
	id: string;
	kind: 'system' | 'event';
	title: string;
	context: string;
	options: LocalizedDecisionOption[];
}

export function localizeDecision(game: GameState, decision: DecisionItem, i18n: I18n): LocalizedDecision;
```

Localized types must not contain effects, modifier templates, finance payloads, or cooldown data.

- [ ] **Step 1: Add failing locale-completeness and union-narrowing tests**

Iterate the normalized production catalog and require event title/context/option/modifier keys in all three locales. Add a test proving event title localization does not access `decision.title`.

- [ ] **Step 2: Add copy keys and translations**

Add complete English, Japanese, and Traditional Chinese copy for:

- all three events and options;
- supplier three-day discount disclosure;
- active modifier summary;
- duration/replacement/expiry/report wording;
- target label `Company` equivalents;
- generic decision failure text.

- [ ] **Step 3: Narrow system and event localization paths**

System decisions retain current `DecisionContext` and inline fallback behavior. Event decisions resolve from persisted copy refs and option IDs.

- [ ] **Step 4: Change DecisionQueue availability calls**

For each localized option:

```ts
const availability = getDecisionOptionAvailability(game, decision, localizedOption.id);
```

Do not pass localized options to the domain API.

- [ ] **Step 5: Run Svelte documentation/autofix workflow**

Consult the repository-mandated Svelte MCP documentation for the component patterns used, run the Svelte autofixer on `DecisionQueue.svelte`, and apply every safe suggestion before tests.

- [ ] **Step 6: Run localization/component tests**

```bash
bunx vitest run src/lib/i18n/gameCopy.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n/gameCopy.ts src/lib/i18n/localizedTypes.ts src/lib/i18n/gameCopy.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts src/lib/components/game/DecisionQueue.svelte src/lib/components/game/DecisionQueue.svelte.spec.ts
git commit -m "feat(events): localize materialized decisions"
```

---

### Task 7: Implement Supplier Modifier Activation and Replacement

**Files:**
- Create: `src/lib/game/eventModifiers.ts`
- Create: `src/lib/game/eventModifiers.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/eventEffects.ts`
- Modify: `src/lib/game/eventEffects.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface ActiveEventModifier {
	id: string;
	source: { eventId: string; instanceId: string; optionId: string };
	target: { kind: 'company' };
	startsOnDay: number;
	expiresOnDay: number;
	stackingKey: string;
	stackingRule: 'replace';
	effect: EventTimedEffect;
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}

export interface EventModifierSnapshot {
	readonly id: string;
	readonly source: Readonly<ActiveEventModifier['source']>;
	readonly target: Readonly<ActiveEventModifier['target']>;
	readonly startsOnDay: number;
	readonly expiresOnDay: number;
	readonly stackingKey: string;
	readonly effect: Readonly<EventTimedEffect>;
	readonly explanation: Readonly<StructuredCopyRef>;
	readonly importance: 'normal' | 'important';
}

export function activateEventModifiers(
	state: EventRuntimeState,
	source: ActiveEventModifier['source'],
	day: number,
	templates: readonly EventModifierTemplate[]
): EventModifierActivationResult;
```

- [ ] **Step 1: Write failing lifecycle tests**

Assert:

- no modifier for other options;
- `bulk-discount` activates exactly one modifier;
- ID `event-modifier-1` and sequence increment;
- start day equals resolution day;
- expiry equals start + 3;
- identical stacking key replaces the old modifier;
- replacement history snapshots old and new IDs;
- unrelated keys would remain, even though production catalog currently has one key;
- snapshots are copied values, not active object references.

- [ ] **Step 2: Run tests to verify failure**

```bash
bunx vitest run src/lib/game/eventModifiers.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement replace-only activation**

Allocate the new ID before writing replacement history so every removed snapshot can record `replacedByModifierId` deterministically. Preserve template order.

- [ ] **Step 4: Integrate activation into atomic event commit**

Preparation validates every modifier template before immediate effects commit. Successful resolution activates modifiers atomically with cash/score/stock/finance changes and history. Any modifier validation failure rolls back the whole option.

- [ ] **Step 5: Add active-day and expiry helpers**

```ts
export function isModifierActiveOnDay(modifier: ActiveEventModifier, closingDay: number): boolean {
	return modifier.startsOnDay <= closingDay && closingDay < modifier.expiresOnDay;
}

export function expireModifiersAfterDay(
	state: EventRuntimeState,
	closingDay: number
): { state: EventRuntimeState; expired: EventModifierSnapshot[] };
```

Expire when `expiresOnDay === closingDay + 1`; stamp lifecycle day with `closingDay`.

- [ ] **Step 6: Run modifier/effect tests**

```bash
bunx vitest run src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/eventModifiers.ts src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.ts src/lib/game/eventEffects.spec.ts
git commit -m "feat(events): activate supplier timed modifier"
```

---

### Task 8: Add Provenance-Aware Simulation Rules and Application Evidence

**Files:**
- Modify: `src/lib/game/simulationRules.ts`
- Modify: `src/lib/game/simulationRules.spec.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/industryProduction.ts`
- Modify: `src/lib/game/industryProduction.spec.ts`
- Modify: `src/lib/scenarios/runtime.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`

**Interfaces:**
- Produces:

```ts
export type SimulationRuleSource =
	| { kind: 'scenario'; sourceId: string }
	| {
			kind: 'event-modifier';
			sourceId: string;
			modifierId: string;
			eventId: string;
			instanceId: string;
			explanation: StructuredCopyRef;
	  };

export interface ImportCostResolution {
	multiplier: number;
	contributions: readonly { source: SimulationRuleSource; multiplier: number }[];
}

export function mergeSimulationRules(...sets: readonly SimulationRules[]): SimulationRules;
export function resolveImportCostMultiplier(
	rules: SimulationRules,
	scope: ImportCostScope,
	targetId: string
): ImportCostResolution;
```

- [ ] **Step 1: Write failing rule tests**

Cover:

- no matches returns multiplier 1 and empty contributions;
- scenario source only retains current value;
- event source only returns 0.9;
- scenario and event matches multiply;
- stable source ordering;
- merge does not mutate inputs;
- valid scenario definitions still contribute at most one same-scope matching rule.

- [ ] **Step 2: Implement stable source metadata and multiplicative resolution**

Scenario source IDs use:

```text
scenario:<scenarioId>:modifier:<definition-index>
```

Event source IDs use modifier IDs. Sort merged rules by stable source key before matching/reduction.

- [ ] **Step 3: Change both current consumers**

At the two current call sites, replace numeric-only reads with:

```ts
const resolution = resolveImportCostMultiplier(rules, scope, targetId);
const cost = Math.round(baseCost * resolution.multiplier);
```

Return contribution evidence only when import quantity and baseline import cost are non-zero.

- [ ] **Step 4: Add pure application-evidence types**

Evidence includes scope, affected product/material ID, baseline cost, and each contribution. Do not add global collectors or callbacks.

- [ ] **Step 5: Compile scenario rules with sources**

Preserve current scenario modifier list and validation. Add index-based source metadata. Run existing scenario calibration/replay tests to prove no outcome changes.

- [ ] **Step 6: Run rule and consumer tests**

```bash
bunx vitest run src/lib/game/simulationRules.spec.ts src/lib/game/stock.spec.ts src/lib/game/industryProduction.spec.ts src/lib/scenarios/runtime.spec.ts
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/simulationRules.ts src/lib/game/simulationRules.spec.ts src/lib/game/stock.ts src/lib/game/stock.spec.ts src/lib/game/industryProduction.ts src/lib/game/industryProduction.spec.ts src/lib/scenarios/runtime.ts src/lib/scenarios/runtime.spec.ts
git commit -m "feat(events): compose modifier simulation rules"
```

---

### Task 9: Integrate Modifier Ordering, Reports, and Exclusive Expiry into `simulateDay`

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/reports.ts`
- Modify: report-related specs.

**Interfaces:**
- Produces `DailyReport.modifierImpacts` and `DailyReport.modifierLifecycle`.
- Consumes application evidence from Task 8 and modifier helpers from Task 7.

- [ ] **Step 1: Write a normative day-order test**

For a supplier discount resolved on player day `D`, assert:

1. it affects imports when day `D` closes;
2. it affects days `D + 1` and `D + 2`;
3. day `D + 2` report contains final application and expiry lifecycle;
4. returned state day `D + 3` no longer contains it;
5. event selection for `D + 3` occurs after expiry/report finalization;
6. event RNG advances exactly three draws each day.

- [ ] **Step 2: Add report shapes**

```ts
export interface EventModifierImpact {
	modifierId: string;
	source: ActiveEventModifier['source'];
	target: { kind: 'company' };
	effectKind: 'import-cost-multiplier';
	explanation: StructuredCopyRef;
	scope: 'retail-product';
	affectedIds: string[];
	multiplier: number;
	baselineCost: number;
	applicationCount: number;
}

export interface EventModifierLifecycle {
	status: 'activated' | 'replaced' | 'expired';
	modifier: EventModifierSnapshot;
	replacedByModifierId?: string;
}
```

- [ ] **Step 3: Compile active event rules before operations**

Build event rules from modifiers active on `closingDay`, merge with supplied scenario rules, and pass the merged rules to industry/retail consumers.

- [ ] **Step 4: Aggregate event-only evidence**

Group application records by modifier ID. Sort modifier IDs and affected IDs; sum baseline cost; count applications; retain the source multiplier. Do not allocate overlapping dollar deltas.

- [ ] **Step 5: Finalize expiry before report/state advance**

Expire after operations and finance, append lifecycle evidence to the closing-day report, then advance day, clean decisions, consume the event packet, and select the next event.

- [ ] **Step 6: Preserve report summaries**

`reports.ts` keeps impact/lifecycle arrays on `latest` only. Do not add rolling aggregates.

- [ ] **Step 7: Run integration tests**

```bash
bunx vitest run src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
bun run check
```

Expected: PASS with cash reconciliation unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.ts
git add -u
git commit -m "feat(events): report modifier lifecycle"
```

---

### Task 10: Migrate and Validate the Complete v12 Save Shape

**Files:**
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/scenarioCodec.ts`
- Modify: `src/lib/persistence/scenarioCodec.spec.ts`
- Modify: `src/lib/persistence/scenarioRepository.spec.ts`
- Modify: backend-specific repository fixtures/specs.

**Interfaces:**
- Final schema only:

```ts
export const SAVE_SCHEMA_VERSION = 12;
```

- v11 → v12 initializes the entire final event/modifier/report model. There is no v13 step.

- [ ] **Step 1: Add v12 round-trip tests before changing the version**

Construct a game with:

- pending event instance;
- cooldown;
- active supplier modifier mid-duration;
- generated/resolved/replaced history;
- report impact and lifecycle arrays.

Round-trip and assert deep equality.

- [ ] **Step 2: Add v11 migration fixtures**

Cover each strategic family and a system notice.

For strategic rows:

- validate exact known option IDs and old effect shapes;
- assign monotonic instance IDs in array order;
- preserve option order and concrete values;
- derive generated day from the known expiry offset;
- create company target, version, copy ref, cooldown, and generation history;
- migrate supplier terms as definition version 1 with no modifier templates, even though new catalog content is version 2.

For system notices:

- preserve ID/title/context/options/expiry;
- require every old effect object to be empty;
- reject unknown non-empty effects.

- [ ] **Step 3: Add report and runtime initialization migration**

Initialize:

```ts
selectionSchemaVersion: 1
rngState: derived from saved seed
nextInstanceSequence: migrated count + 1
nextModifierSequence: 1
activeModifiers: []
history: migrated generated entries
```

Existing reports receive empty `modifierImpacts` and `modifierLifecycle` arrays.

- [ ] **Step 4: Add strict v12 decoder tests**

Validate:

- decision discriminants and unique IDs;
- event ID/version/copy/option/effect shapes;
- company target only;
- event RNG and selection schema version;
- sequence counters above referenced suffixes;
- unique cooldown family/target key and date ordering;
- active modifier IDs, source, dates, replace rule, effect, and company target;
- complete persisted state may not contain `game.day >= expiresOnDay` modifiers;
- history bound 200;
- report impact/lifecycle shape;
- cash/finance mutual exclusion and at most one finance effect.

Add `invariant-event-runtime` to `SaveDataErrorCode` for path-specific failures.

- [ ] **Step 5: Add version 11 to the migratable chain**

Update `MIGRATABLE_SCHEMA_VERSIONS` and both save-record/store-snapshot migration tables. Ensure old versions still chain through v11 then v12.

- [ ] **Step 6: Cover embedded active scenario runs**

`scenarioCodec.ts` delegates embedded game decode to the shared game codec, rewrites `gameSchemaVersion` to 12 on persist, and preserves run ID, revision, definition, evaluation, and result.

- [ ] **Step 7: Run all persistence tests**

```bash
bunx vitest run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/scenarioCodec.spec.ts src/lib/persistence/scenarioRepository.spec.ts
bun run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/scenarioCodec.ts src/lib/persistence/scenarioCodec.spec.ts src/lib/persistence/scenarioRepository.spec.ts
git add -u
git commit -m "feat(events): migrate saves to event schema v12"
```

**Gate:** Do not begin UI work until browser, in-memory, Tauri, and scenario repository contracts all preserve the complete v12 shape.

---

### Task 11: Add Typed Alerts, Active Modifiers, and Report Surfaces

**Files:**
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/localizedTypes.ts`
- Modify: locale message files and specs.
- Create: `src/lib/components/game/ActiveModifiers.svelte`
- Create: `src/lib/components/game/ActiveModifiers.svelte.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/TopBar.svelte` if required by localized alert typing.
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Interfaces:**
- `collectGameAlerts(game)` returns typed domain references.
- `localizeGameAlert(game, alert, i18n)` returns a display-ready message.
- `managementPanelId?: 'finance' | 'decisions'`.

- [ ] **Step 1: Write failing alert tests**

Assert stable group order:

1. store-stock;
2. pending decisions;
3. important active modifiers ordered by expiry then ID;
4. blocked factories;
5. finance alerts in existing internal order.

Decision IDs use instance IDs. Event-modifier alerts use `event-modifier:<modifierId>` and `managementPanelId: 'decisions'`.

- [ ] **Step 2: Remove event-title construction from `alerts.ts`**

Narrow decision variants before reading fields. Domain alerts carry `decisionId` or `modifierId`; optional fallback `message` may remain for existing non-localized callers, but event titles must be produced only by localization.

- [ ] **Step 3: Add localized alert view models**

Localize event decision titles from copy refs and modifier alerts from source event/explanation/remaining days. Keep system and finance fallback behavior intact.

- [ ] **Step 4: Build Active Modifiers**

Render each active modifier as an accessible article showing:

- supplier event title;
- company target;
- 10% retail import discount summary;
- start day;
- exclusive expiry day;
- remaining days including current day;
- important status text.

Order by expiry then ID. Include a localized empty state.

- [ ] **Step 5: Extend ReportsPanel**

Add latest-day sections for modifier impacts and lifecycle. Show source, affected IDs, multiplier, baseline cost, application count, replacement, and expiry. Do not add rolling totals.

- [ ] **Step 6: Wire the existing Decisions panel**

Place `ActiveModifiers.svelte` beside `DecisionQueue.svelte` in the existing `decisions` branch. `handleSelectAlert` opens the panel named by `managementPanelId`; finance retains focused-loan behavior; decision-kind fallback remains.

- [ ] **Step 7: Run Svelte documentation/autofix workflow**

Consult required Svelte MCP documentation for every changed component and page. Run the Svelte autofixer on `ActiveModifiers.svelte`, `ReportsPanel.svelte`, `TopBar.svelte` when modified, and `+page.svelte`.

- [ ] **Step 8: Run component and page tests**

```bash
bunx vitest run src/lib/game/alerts.spec.ts src/lib/i18n/gameCopy.spec.ts src/lib/components/game/ActiveModifiers.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts src/routes/page.svelte.spec.ts
bun run check
```

Expected: PASS, including click → Decisions panel → matching modifier visible.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts src/lib/i18n src/lib/components/game/ActiveModifiers.svelte src/lib/components/game/ActiveModifiers.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/components/game/TopBar.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(events): surface active modifier impacts"
```

---

### Task 12: Add the Production-Catalog End-to-End Lifecycle and Remove Transitional Code

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: `src/lib/game/eventCatalog.spec.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`
- Modify: any transitional compatibility helpers identified by `rg "legacy|CASH_PRESSURE_ID|SUPPLIER_TERMS_ID|applyScoreEffects|applyStoreEffects" src`.

**Interfaces:**
- Consumes only the production catalog and public save/UI routes.
- Produces one complete lifecycle proof for selection → resolution → application → replacement/expiry → reporting/alert navigation.

- [ ] **Step 1: Build an e2e state with production modules only**

In Node-side setup:

1. create a deterministic game with no forced-event eligibility;
2. find a seed/event RNG state whose cadence produces supplier terms through `PRODUCTION_EVENT_CATALOG`;
3. call the real `selectEventForDay`;
4. encode the selected v12 game through the real save codec;
5. seed browser storage before page load.

Do not import a test-only event catalog into browser or production modules.

- [ ] **Step 2: Resolve `bulk-discount` through the real Decisions UI**

Assert the option copy discloses the three-day 10% import discount before clicking. After resolution, assert immediate cash/score/stock effects and the active modifier entry.

- [ ] **Step 3: Exercise every active day**

Advance through the resolution day and following two days. Ensure fixtures create an import on each asserted day or explicitly set the calendar/import schedule so the multiplier produces report evidence.

- [ ] **Step 4: Verify alert navigation and report attribution**

Click the important modifier alert and assert Decisions opens with the matching modifier. Verify report source, affected product IDs, multiplier, baseline cost, and application count.

- [ ] **Step 5: Verify exclusive expiry**

After the final active-day close, assert:

- expiry lifecycle is in that report;
- the returned next-day state has no active modifier;
- Active Modifiers shows the empty state;
- modifier alert is absent.

- [ ] **Step 6: Add a production-bundle allowlist test**

The production catalog test must fail if any event other than the three approved IDs is added. Search the production module graph for fixture-only exports and remove them.

- [ ] **Step 7: Remove transitional legacy paths**

Delete old hard-coded event constants/constructors, broad decision mutation helpers, family-ID resolution fallbacks, and obsolete fixtures. Keep no alias from `supplier-terms` to an event instance ID.

- [ ] **Step 8: Run e2e and targeted regressions**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts
bunx vitest run src/lib/game/eventCatalog.spec.ts src/lib/scenarios/runtime.spec.ts
bun run check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/routes/retail-sim.e2e.ts src/lib/game/eventCatalog.spec.ts src/lib/scenarios/runtime.spec.ts
git add -u
git commit -m "test(events): cover production modifier lifecycle"
```

---

### Task 13: Full Verification, Diff Audit, and Draft-PR Readiness

**Files:**
- Modify only files required to fix verification or review findings.
- Update: `docs/superpowers/plans/2026-07-31-data-driven-event-framework-timed-modifiers.md` only if implementation changes an interface named in this plan.

**Interfaces:**
- Produces one implementation branch and one draft PR with all stages green.

- [ ] **Step 1: Run format and static verification**

```bash
bun run check
bun run lint
```

Expected: PASS with no ignored warnings.

- [ ] **Step 2: Run all unit and browser-component tests**

```bash
bun run test:unit -- --run
```

Expected: PASS.

- [ ] **Step 3: Run all end-to-end tests**

```bash
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 4: Run the aggregate command**

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Audit save-version references**

```bash
rg "SAVE_SCHEMA_VERSION|schemaVersion: 11|gameSchemaVersion: 11|schemaVersion: 12|gameSchemaVersion: 12" src src-tauri
```

Confirm:

- current writes are v12;
- v11 exists only in migration fixtures/logic;
- no v13 references exist;
- active scenario games decode through shared v12 migration.

- [ ] **Step 6: Audit deferred scope**

```bash
rg "scheduledFollowUps|logistics-route|store-reputation-adjust|stackingRule: 'stack'|target-missing" src
```

Expected: no production event-framework contracts for deferred features. Existing unrelated uses must be reviewed and documented rather than blindly deleted.

- [ ] **Step 7: Audit identity and localization**

```bash
rg "decisionId: 'cash-pressure'|decisionId: 'expansion-opportunity'|decisionId: 'supplier-terms'" src
rg "decision\.title" src/lib/game/alerts.ts src/lib/i18n/gameCopy.ts
```

Expected:

- no family ID used as a post-migration event decision ID;
- `decision.title` is accessed only after narrowing to `kind: 'system'`.

- [ ] **Step 8: Review the complete diff by stage**

```bash
git log --oneline main..HEAD
git diff --stat main...HEAD
git diff main...HEAD -- src/lib/game src/lib/persistence src/lib/scenarios src/lib/i18n src/lib/components src/routes
```

Check for:

- one implementation PR scope;
- no unrelated refactors;
- no test-only production content;
- exact event option order and values;
- no mutable global evidence collector;
- no hidden second RNG stream consumption;
- no partial failure commit path.

- [ ] **Step 9: Commit any verification fixes**

```bash
git add -A
git commit -m "fix(events): address integration verification" || true
```

Do not create an empty commit.

- [ ] **Step 10: Update the implementation PR description**

The PR body must state:

- HPA-278;
- one-PR delivery;
- final v11 → v12 migration;
- production supplier modifier behavior;
- deferred follow-ups/non-company targets/stack/cancellation;
- stage commit list;
- exact verification commands and results;
- remaining known risks, if any.

**Final gate:** Keep the PR draft until every command above is green and the branch contains no unresolved review thread or undocumented spec deviation.
