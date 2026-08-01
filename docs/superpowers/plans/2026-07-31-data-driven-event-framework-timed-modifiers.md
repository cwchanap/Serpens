# Data-Driven Event Framework with Timed Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three hard-coded strategic decisions with a deterministic materialized event system and ship `supplier-terms.bulk-discount` as a real three-day retail import-cost modifier in one implementation pull request.

**Architecture:** Keep command-owned system notices and strategic events in the existing Decisions queue as a discriminated union. A validated TypeScript catalog feeds an isolated, versioned three-draw event RNG packet and materializes self-contained choices; one pure preparation path drives availability and atomic resolution. The same PR adds the supplier modifier, composes it with scenario rules through provenance-aware `SimulationRules`, migrates saves directly from v11 to the complete v12 shape, and presents attribution through reports, alerts, and the existing Decisions panel.

**Tech Stack:** TypeScript 6, Svelte 5/SvelteKit, Vitest 4, Playwright, browser/Tauri/in-memory persistence, existing Park-Miller RNG, HPA-277 finance, and HPA-280 scenarios.

## Delivery Override

The user approved one implementation PR. This plan supersedes only the design document's earlier two-PR delivery split:

- one implementation branch and one draft PR targeting `main`;
- staged commits and readiness gates inside that PR;
- one final save bump, v11 → v12, containing event-core and modifier state;
- no intermediate core-only schema and no v13 migration;
- HPA-278 completes when that single implementation PR merges.

## Global Constraints

- Production catalog is exactly `cash-pressure`, `expansion-opportunity`, and `supplier-terms`.
- Event targets are company-only in v1.
- Follow-ups, non-company targets, generic stack semantics, target-deletion cancellation, and unused handlers are out of scope.
- The sole timed effect is an all-target `retail-product` import-cost multiplier.
- The sole conflict rule is `stackingRule: 'replace'` by exact `stackingKey`.
- `supplier-terms.bulk-discount` keeps cash `-2_500`, profit `+3`, stock `+6%`, and adds a three-day `0.9` modifier.
- Repeating the option replaces the existing matching modifier and restarts duration.
- A modifier resolved on day `D` applies when day `D` closes and on closing days `D + 1` and `D + 2`; it is absent from state day `D + 3`.
- Existing v11 supplier decisions migrate as definition version 1 without retroactive modifiers.
- Event resolution uses instance IDs; family logic uses `eventId`.
- All migrated families use `cooldownDays = 1`; pending-instance exclusion preserves unresolved expiry timing.
- Event RNG never consumes `GameState.rngState`.
- Each completed day consumes exactly three global event draws: cadence, weighted selection, materialization seed.
- Draw 3 seeds a local materialization RNG; local random choices never consume additional global event draws.
- `selectionSchemaVersion` starts at 1. Changing the global packet requires a save migration; changing local materialization requires a new event definition version.
- V1 preserves cash/finance mutual exclusion and permits at most one `finance-borrow` effect per option.
- Availability and resolution share one ordered pure preparation path.
- Failure returns the original state object and commits no state, autosave, scenario persistence, revision, result, or success sound.
- Event copy is key-driven; system fallback copy remains inline.
- Domain alerts carry typed references; localized event alert text never reads an event `title` field.
- Scenario-only import-cost outcomes remain unchanged under the current overlap validator.
- Final persisted schema is v12 and includes event runtime, active modifiers, event history, and report attribution.
- Every Vitest test executes at least one `expect`.
- Every changed Svelte file follows the repository-required Svelte MCP documentation and autofixer workflow.
- The implementation PR must pass `bun run check`, `bun run lint`, and `bun run test`.

## Locked File Boundaries

### New files

- `src/lib/game/eventDefinitions.ts` and `.spec.ts` — authoring contracts, bounded validation, normalization.
- `src/lib/game/eventCatalog.ts` and `.spec.ts` — three production definitions.
- `src/lib/game/eventSelection.ts` and `.spec.ts` — runtime initialization, fixed RNG packet, conditions, cooldowns, selection, materialization.
- `src/lib/game/eventEffects.ts` and `.spec.ts` — availability, typed effects, atomic resolution.
- `src/lib/game/eventModifiers.ts` and `.spec.ts` — replace-only activation, active-day compilation, expiry, lifecycle snapshots.
- `src/lib/components/game/ActiveModifiers.svelte` and `.svelte.spec.ts` — active-modifier UI in Decisions.

### Existing files

- `src/lib/game/types.ts` — persisted event/system union and all event/modifier/report value types.
- `src/lib/game/events.ts` and `.spec.ts` — thin production facade and parity/queue lifecycle.
- `src/lib/game/state.ts` and `.spec.ts` — system acknowledgement versus typed event resolution.
- `src/lib/game/simulateDay.ts` and `.spec.ts` — modifier/rule/report/expiry/selection order.
- `src/lib/game/simulationRules.ts` and `.spec.ts` — provenance, merge, multiplicative resolution.
- `src/lib/game/stock.ts` and `.spec.ts` — retail application evidence.
- `src/lib/game/industryProduction.ts` and `.spec.ts` — industrial call-site adaptation and scenario parity.
- `src/lib/game/alerts.ts` and `.spec.ts` — typed alert references and group ordering.
- `src/lib/game/reports.ts` and related specs — latest-day attribution only.
- `src/lib/game/commandResult.ts` — route `decision-rejected` result.
- `src/lib/scenarios/runtime.ts`, `types.ts`, and specs — source metadata and decision-failure mapping.
- `src/routes/gameRouteController.ts` and `.spec.ts` — no-commit rejection adaptation.
- `src/lib/persistence/saveTypes.ts`, `saveCodec.ts`, repository/scenario codecs and specs — v12 migration/validation.
- `src/lib/i18n/gameCopy.ts`, `localizedTypes.ts`, locale messages and specs — event/alert/modifier/report copy.
- `DecisionQueue.svelte`, `ReportsPanel.svelte`, `TopBar.svelte`, `+page.svelte`, and specs — presentation and alert routing.
- `src/routes/retail-sim.e2e.ts` — production lifecycle.

---

### Task 1: Characterize Current Strategic-Decision Behavior

**Files:**
- Modify: `src/lib/game/events.spec.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`

**Produces:** Golden parity tests that stay green until the old constructors and broad mutation path are removed.

- [ ] **Step 1: Add exact eligibility and priority tests**

Test cash `-1` versus `0`; expansion day `14`, cash `55_000`, profit `62`, and store-cap boundary; cash pressure priority over expansion/supplier; at most one new strategic decision.

- [ ] **Step 2: Add exact option/effect tests**

Assert option IDs/order, emergency amount formula, finance purpose/term, cash/score effects, scorecard plus all-store morale coupling, and target-stock-based stock adjustment followed by `calculateStockHealth`.

- [ ] **Step 3: Add recurrence tests**

For each family, assert next-visible-day recurrence after early resolution and no duplicate while pending. Assert unresolved recurrence only after current queue cleanup; supplier paths remain cadence-dependent.

- [ ] **Step 4: Characterize legacy supplier draw days**

Use a small fixed seed/day table against `createRngFromState(game.rngState + game.day * 97)`. Name it `legacy supplier cadence characterization`; later tasks intentionally replace exact dates with isolated-packet goldens while preserving deterministic 12% cadence.

- [ ] **Step 5: Lock current scenario family-ID calibration**

Add a test around the current helper that finds/resolves `supplier-terms` by `decision.id`. Task 5 must replace this with `eventId` lookup plus instance-ID resolution.

- [ ] **Step 6: Run and commit**

```bash
bunx vitest run src/lib/game/events.spec.ts src/lib/game/state.spec.ts src/lib/game/simulateDay.spec.ts src/lib/scenarios/runtime.spec.ts
git add src/lib/game/events.spec.ts src/lib/game/state.spec.ts src/lib/game/simulateDay.spec.ts src/lib/scenarios/runtime.spec.ts
git commit -m "test(events): lock strategic decision parity"
```

Expected: PASS on unchanged production code.

**Gate:** No domain refactor begins until this commit is green.

---

### Task 2: Introduce Complete Event Value Types, Validation, and Catalog

**Files:**
- Create: `src/lib/game/eventDefinitions.ts`
- Create: `src/lib/game/eventDefinitions.spec.ts`
- Create: `src/lib/game/eventCatalog.ts`
- Create: `src/lib/game/eventCatalog.spec.ts`
- Modify: `src/lib/game/types.ts`

**Produces these exact value contracts before runtime references them:**

```ts
export type StructuredCopyParams = Readonly<Record<string, string | number>>;
export interface StructuredCopyRef { key: string; params: StructuredCopyParams }

export type EventTarget = { kind: 'company' };
export type EventTargetSelector = { kind: 'company' };

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

export type EventImmediateEffect =
	| { kind: 'cash-adjust'; amount: number }
	| { kind: 'score-adjust'; score: ScoreKey; amount: number }
	| { kind: 'store-morale-adjust'; scope: 'all-stores'; amount: number }
	| { kind: 'store-stock-adjust-by-target-percent'; scope: 'all-stores'; percent: number }
	| {
			kind: 'finance-borrow';
			purpose: 'emergency' | 'supplierCredit';
			amount: number;
			termDays: 28 | 56;
	  };

export type EventTimedEffect = {
	kind: 'import-cost-multiplier';
	scope: 'retail-product';
	target: { kind: 'all' };
	multiplier: number;
};

export interface EventModifierTemplate {
	durationDays: number;
	stackingKey: string;
	stackingRule: 'replace';
	effect: EventTimedEffect;
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}

export interface ActiveEventModifier {
	id: string;
	source: { eventId: string; instanceId: string; optionId: string };
	target: EventTarget;
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
	readonly target: Readonly<EventTarget>;
	readonly startsOnDay: number;
	readonly expiresOnDay: number;
	readonly stackingKey: string;
	readonly effect: Readonly<EventTimedEffect>;
	readonly explanation: Readonly<StructuredCopyRef>;
	readonly importance: 'normal' | 'important';
}
```

Authoring may use `available-credit-clamped`; normalization materializes it later into numeric `finance-borrow.amount`.

- [ ] **Step 1: Write failing validator tests**

Cover ID syntax/duplicates, positive versions/expiry/cooldowns, option duplicates, selection numbers, empty `all`, finite condition/effect values, cash+finance conflict, duplicate finance, invalid modifier duration/key/multiplier/rule, and bounded contradictions only: incompatible cash bounds and score thresholds outside `0..100`. Diagnostics sort by event ID then path.

- [ ] **Step 2: Implement normalized catalog contracts**

Export `validateAndNormalizeEventCatalog(definitions)` and `NormalizedEventCatalog`. Preserve authored option/effect/modifier order; sort definitions by event ID; build readonly lookup; freeze in development/test.

- [ ] **Step 3: Implement exact production definitions**

```text
cash-pressure          v1 forced 100 expires 2 cooldown 1
expansion-opportunity  v1 forced 50  expires 3 cooldown 1
supplier-terms         v2 weighted 1 expires 2 cooldown 1
```

`bulk-discount` adds:

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

- [ ] **Step 4: Add production allowlist and payload tests**

Assert exactly three IDs, definition versions, condition trees, option/effect order, current immediate values, and the supplier modifier payload. Assert no deferred union variant is exported.

- [ ] **Step 5: Run and commit**

```bash
bunx vitest run src/lib/game/eventDefinitions.spec.ts src/lib/game/eventCatalog.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventDefinitions.ts src/lib/game/eventDefinitions.spec.ts src/lib/game/eventCatalog.ts src/lib/game/eventCatalog.spec.ts
git commit -m "feat(events): define validated production catalog"
```

---

### Task 3: Add Event Runtime and Fixed-Packet Materialization

**Files:**
- Create: `src/lib/game/eventSelection.ts`
- Create: `src/lib/game/eventSelection.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/placement.ts`
- Modify: `src/routes/+page.svelte`
- Modify: every GameState builder reported by `bun run check`

**Produces:**

```ts
export const EVENT_SELECTION_SCHEMA_VERSION = 1;
export const EVENT_DRAW_COUNT_PER_DAY = 3;
export const EVENT_HISTORY_LIMIT = 200;

export interface EventCooldownRecord {
	eventId: string;
	target: EventTarget;
	generatedOnDay: number;
	eligibleOnDay: number;
}

export type EventHistoryEntry =
	| { kind: 'event-generated'; day: number; eventId: string; instanceId: string; target: EventTarget }
	| { kind: 'event-resolved'; day: number; eventId: string; instanceId: string; optionId: string; target: EventTarget }
	| { kind: 'event-decision-expired'; day: number; eventId: string; instanceId: string; target: EventTarget }
	| {
			kind: 'modifier-lifecycle';
			day: number;
			status: 'activated' | 'replaced' | 'expired';
			modifier: EventModifierSnapshot;
			replacedByModifierId?: string;
	  };

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
export function selectEventForDay(game: GameState, catalog: NormalizedEventCatalog): GameState;
```

- [ ] **Step 1: Write fixed-packet golden tests**

For fixed seeds assert the same post-packet RNG state for no candidate, cadence fail, cadence pass with empty weighted fixture, forced winner, weighted winner, and pending duplicate. All three draws occur before branching.

- [ ] **Step 2: Write selection/materialization tests**

Assert forced priority/ID tie-break, weighted cumulative threshold, draw 3 local seed, no extra global draw, company target, `event-instance-N`, already-advanced `generatedOnDay`, concrete emergency amount, cooldown boundary, pending exclusion, next-day recurrence after early resolution, and same-input deep equality.

- [ ] **Step 3: Implement initialization and packet**

Derive a salted normalized event RNG state. Initialize sequences at 1 and arrays empty. Consume cadence, weighted, and materialization-seed draws unconditionally; persist state after draw 3. Seed a local RNG from draw 3 even though v1 definitions need no extra random branch.

- [ ] **Step 4: Implement conditions, selection, and materialization**

Forced candidates sort priority descending then ID. Weighted selection runs only when cadence `< 0.12`, uses positive weights and stable ID order, and produces zero or one winner. Materialize instance/version/day/expiry/company target/copy/options/effects/modifiers, cooldown, generated history, and sequence increments.

- [ ] **Step 5: Initialize production/test GameState literals**

Add `events: createInitialEventRuntime(seed)` to founding-game creation, starter state, and all compile-reported fixtures. Scenario start-day overrides do not fast-forward event draws.

- [ ] **Step 6: Run and commit**

```bash
bunx vitest run src/lib/game/eventSelection.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/eventSelection.ts src/lib/game/eventSelection.spec.ts src/lib/game/placement.ts src/routes/+page.svelte
git add -u
git commit -m "feat(events): add deterministic event runtime"
```

---

### Task 4: Cut Over the Decision Union and Daily Selector

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/events.ts`
- Modify: `src/lib/game/events.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: every system-notice constructor found by `rg "effects: \{\}" src/lib/game src/routes`
- Modify: associated specs.

**Produces:**

```ts
export interface SystemDecisionOption { id: string; label: string; description: string }
export interface SystemDecisionItem {
	kind: 'system'; id: string; title: string; context: DecisionContext;
	expiresOnDay: number; options: SystemDecisionOption[];
}
export interface EventDecisionOption {
	id: string; effects: EventImmediateEffect[]; modifiers: EventModifierTemplate[];
}
export interface EventDecisionItem {
	kind: 'event'; id: string; eventId: string; definitionVersion: number;
	generatedOnDay: number; expiresOnDay: number; target: EventTarget;
	copy: StructuredCopyRef; options: EventDecisionOption[];
}
export type DecisionItem = SystemDecisionItem | EventDecisionItem;
```

- [ ] **Step 1: Test union cleanup behavior**

System expiry removes without event history. Event expiry after day advance removes once and writes `event-decision-expired` stamped with closing day.

- [ ] **Step 2: Convert system constructors**

Add `kind: 'system'`, preserve IDs/copy/context/expiry, remove empty effects. Do not catalog these notices.

- [ ] **Step 3: Replace hard-coded events with facade**

`events.ts` delegates production selection to `selectEventForDay(PRODUCTION_EVENT_CATALOG)` and owns queue cleanup only. Delete family constructors after equivalent materialized tests pass.

- [ ] **Step 4: Change `simulateDay` tail**

Build report for `closingDay`; advance to `selectionDay`; clean decisions using `closingDay`; consume packet/select on already-advanced state; run `refreshWorldProgress`.

- [ ] **Step 5: Update tests to family/instance identity**

Find events by `decision.kind === 'event' && decision.eventId === family`; resolve later by `decision.id`. Preserve parity except intentional old supplier-day sequence replacement.

- [ ] **Step 6: Run and commit**

```bash
bunx vitest run src/lib/game/events.spec.ts src/lib/game/eventSelection.spec.ts src/lib/game/simulateDay.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/events.ts src/lib/game/events.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts
git add -u
git commit -m "feat(events): materialize catalog decisions daily"
```

**Gate:** All strategic decisions now come only from the normalized production catalog.

---

### Task 5: Implement Atomic Effects and Failure Adapters

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

**Produces:**

```ts
export type DecisionResolutionFailureCode =
	| 'decision-not-found' | 'option-not-found' | 'decision-expired'
	| 'target-missing' | 'finance-unavailable' | 'effect-rejected';

export type DecisionResolutionResult =
	| { ok: true; game: GameState; decisionKind: 'system' | 'event' }
	| {
			ok: false; game: GameState; code: DecisionResolutionFailureCode;
			context: Record<string, string | number>; financeFailure?: FinanceFailureCode;
	  };

export function getDecisionOptionAvailability(
	game: GameState, decision: DecisionItem, optionId: string
): DecisionOptionAvailability;

export function resolveDecision(
	game: GameState, decisionId: string, optionId: string
): DecisionResolutionResult;
```

`GameRouteCommitResult` gains:

```ts
| {
	status: 'decision-rejected'; code: DecisionResolutionFailureCode;
	context: Record<string, string | number>; financeFailure?: FinanceFailureCode;
  }
```

`ExecuteScenarioCommandResult` gains structured `decisionFailure` on `invalid-command`.

- [ ] **Step 1: Write failing domain atomicity tests**

Cover missing/expired values, system acknowledgement, every effect, changed finance availability, late failure rollback, original object identity, effect order, and no mutation/ID allocation during availability.

- [ ] **Step 2: Implement one preparation path**

Preparation validates target/effects/modifiers, applies tentative immediate effects in order, calls HPA-277 `borrow`, and prepares history/modifier activation. Dry-run returns availability without mutation. Commit occurs only after full success and finishes with `refreshWorldProgress`.

- [ ] **Step 3: Replace broad mutation helpers**

Implement exact cash, score, all-store morale, target-stock percent, and finance handlers. Remove old decision `applyScoreEffects`/`applyStoreEffects` after parity tests pass.

- [ ] **Step 4: Adapt route failures**

`GameRouteController.resolveDecision` returns `decision-rejected` before state assignment/persist/success SFX. Tests assert no sandbox autosave, no scenario write, no state change, and no sound.

- [ ] **Step 5: Adapt scenario failures and calibration**

Map failed resolution to `ok: false`, `code: 'invalid-command'`, with structured decision failure. Run/evaluation/result/revision remain unchanged. Find supplier decisions by `eventId`, then resolve with instance ID.

- [ ] **Step 6: Run and commit**

```bash
bunx vitest run src/lib/game/eventEffects.spec.ts src/lib/game/state.spec.ts src/routes/gameRouteController.spec.ts src/lib/scenarios/runtime.spec.ts
bun run check
git add src/lib/game/eventEffects.ts src/lib/game/eventEffects.spec.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/commandResult.ts src/routes/gameRouteController.ts src/routes/gameRouteController.spec.ts src/lib/scenarios/runtime.ts src/lib/scenarios/runtime.spec.ts src/lib/scenarios/types.ts
git commit -m "feat(events): resolve typed effects atomically"
```

---

### Task 6: Localize Decisions with Display-Only Models

**Files:**
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/localizedTypes.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/components/game/DecisionQueue.svelte`
- Modify: `src/lib/components/game/DecisionQueue.svelte.spec.ts`

**Produces:** `LocalizedDecision` and `LocalizedDecisionOption` containing identifiers and copy only; no effects, finance payloads, modifiers, or runtime state.

- [ ] **Step 1: Add locale-completeness tests**

Iterate the normalized catalog and require title/context/option/modifier keys in all locales. Prove event title localization does not access `decision.title`.

- [ ] **Step 2: Add complete locale copy**

Include all event/options, three-day discount disclosure, modifier summary/duration/replacement/expiry/report text, company target, and decision failure copy.

- [ ] **Step 3: Split localization by decision kind**

System decisions retain context and inline fallback. Event decisions resolve from persisted copy ref and option ID.

- [ ] **Step 4: Update DecisionQueue**

Render localized copy but call `getDecisionOptionAvailability(game, originalDecision, localizedOption.id)`. Never pass a localized option into the domain.

- [ ] **Step 5: Run Svelte workflow, tests, and commit**

Consult required Svelte MCP docs, run autofixer, then:

```bash
bunx vitest run src/lib/i18n/gameCopy.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts
bun run check
git add src/lib/i18n src/lib/components/game/DecisionQueue.svelte src/lib/components/game/DecisionQueue.svelte.spec.ts
git commit -m "feat(events): localize materialized decisions"
```

---

### Task 7: Implement Replace-Only Modifier Activation and Expiry

**Files:**
- Create: `src/lib/game/eventModifiers.ts`
- Create: `src/lib/game/eventModifiers.spec.ts`
- Modify: `src/lib/game/eventEffects.ts`
- Modify: `src/lib/game/eventEffects.spec.ts`

**Consumes:** Event/modifier value types introduced in Task 2.

**Produces:**

```ts
export interface EventModifierActivationResult {
	state: EventRuntimeState;
	activated: ActiveEventModifier[];
	lifecycle: EventModifierLifecycle[];
}

export function activateEventModifiers(
	state: EventRuntimeState,
	source: ActiveEventModifier['source'],
	day: number,
	templates: readonly EventModifierTemplate[]
): EventModifierActivationResult;

export function isModifierActiveOnDay(
	modifier: ActiveEventModifier, closingDay: number
): boolean;

export function expireModifiersAfterDay(
	state: EventRuntimeState, closingDay: number
): { state: EventRuntimeState; expired: EventModifierSnapshot[] };
```

- [ ] **Step 1: Write lifecycle tests**

Assert bulk-discount activation only, ID/sequence, start/expiry, same-key replacement, old snapshot plus `replacedByModifierId`, unrelated-key retention, copied snapshots, every active day, and exclusive expiry.

- [ ] **Step 2: Implement activation**

Allocate new IDs before replacement history; remove exact-key matches; append replacement and activation lifecycle deterministically; preserve template order.

- [ ] **Step 3: Integrate with atomic resolution**

Validate templates during preparation; activate and append history only on full commit. Modifier failure rolls back immediate effects and finance.

- [ ] **Step 4: Implement expiry**

Active condition is `startsOnDay <= closingDay && closingDay < expiresOnDay`. Expire after the final active closing day when `expiresOnDay === closingDay + 1`; stamp lifecycle with closing day.

- [ ] **Step 5: Run and commit**

```bash
bunx vitest run src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.spec.ts
bun run check
git add src/lib/game/eventModifiers.ts src/lib/game/eventModifiers.spec.ts src/lib/game/eventEffects.ts src/lib/game/eventEffects.spec.ts
git commit -m "feat(events): activate supplier timed modifier"
```

---

### Task 8: Add Rule Provenance and Import Application Evidence

**Files:**
- Modify: `src/lib/game/simulationRules.ts`
- Modify: `src/lib/game/simulationRules.spec.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/industryProduction.ts`
- Modify: `src/lib/game/industryProduction.spec.ts`
- Modify: `src/lib/scenarios/runtime.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`

**Produces:**

```ts
export type SimulationRuleSource =
	| { kind: 'scenario'; sourceId: string }
	| {
			kind: 'event-modifier'; sourceId: string; modifierId: string;
			eventId: string; instanceId: string; explanation: StructuredCopyRef;
	  };

export interface ImportCostResolution {
	multiplier: number;
	contributions: readonly { source: SimulationRuleSource; multiplier: number }[];
}

export function mergeSimulationRules(...sets: readonly SimulationRules[]): SimulationRules;
export function resolveImportCostMultiplier(
	rules: SimulationRules, scope: ImportCostScope, targetId: string
): ImportCostResolution;
```

- [ ] **Step 1: Write resolver tests**

No matches → 1/empty; scenario-only unchanged; event-only 0.9; scenario×event product; stable source order; immutable merge; valid scenarios retain at most one same-scope match.

- [ ] **Step 2: Implement source metadata and multiplication**

Scenario source IDs are `scenario:<scenarioId>:modifier:<index>`; event source IDs are modifier IDs. Sort by source key before reduction.

- [ ] **Step 3: Update both current consumers**

Use `resolution.multiplier`. Return pure application evidence only when quantity and baseline import cost are non-zero. Evidence records scope, target ID, baseline cost, and contributions.

- [ ] **Step 4: Compile scenario sources and run replay parity**

Keep existing modifier validation/list. Add source metadata without changing scenario outcomes.

- [ ] **Step 5: Run and commit**

```bash
bunx vitest run src/lib/game/simulationRules.spec.ts src/lib/game/stock.spec.ts src/lib/game/industryProduction.spec.ts src/lib/scenarios/runtime.spec.ts
bun run check
git add src/lib/game/simulationRules.ts src/lib/game/simulationRules.spec.ts src/lib/game/stock.ts src/lib/game/stock.spec.ts src/lib/game/industryProduction.ts src/lib/game/industryProduction.spec.ts src/lib/scenarios/runtime.ts src/lib/scenarios/runtime.spec.ts
git commit -m "feat(events): compose modifier simulation rules"
```

---

### Task 9: Integrate Daily Modifier Ordering and Report Attribution

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/reports.ts`
- Modify: report-related specs.

**Produces:**

```ts
export interface EventModifierImpact {
	modifierId: string;
	source: ActiveEventModifier['source'];
	target: EventTarget;
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

`DailyReport` gains `modifierImpacts` and `modifierLifecycle`.

- [ ] **Step 1: Write the normative three-day test**

Resolve on day `D`; assert application on closing days `D`, `D+1`, `D+2`; final report contains application and expiry; returned day `D+3` lacks modifier; selection happens afterward; event RNG advances three draws each day.

- [ ] **Step 2: Compile event rules before operations**

Filter active modifiers for closing day, create event rules, merge supplied scenario rules, and pass merged rules to industry/retail consumers.

- [ ] **Step 3: Aggregate event evidence**

Group by modifier ID; sort IDs; sort/dedupe affected IDs; sum baseline cost; count applications; retain modifier multiplier. Ignore scenario sources in event-impact UI arrays.

- [ ] **Step 4: Expire and report before day advance**

After operations and finance, expire final-day modifiers, add lifecycle to closing-day report, then advance, clean decisions, consume packet, and select next event.

- [ ] **Step 5: Preserve report summary scope**

`reports.ts` exposes arrays on `latest` only; no rolling modifier totals.

- [ ] **Step 6: Run and commit**

```bash
bunx vitest run src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.ts
git add -u
git commit -m "feat(events): report modifier lifecycle"
```

---

### Task 10: Migrate Directly from Save v11 to Complete v12

**Files:**
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/scenarioCodec.ts`
- Modify: `src/lib/persistence/scenarioCodec.spec.ts`
- Modify: `src/lib/persistence/scenarioRepository.spec.ts`
- Modify: backend-specific fixtures/specs found by `rg "schemaVersion: 11|SAVE_SCHEMA_VERSION" src/lib/persistence src-tauri`.

**Produces:** `SAVE_SCHEMA_VERSION = 12`; no v13 references.

- [ ] **Step 1: Add complete v12 round-trip**

Round-trip pending event, cooldown, active modifier, event/modifier history, report impact/lifecycle, and sequence counters.

- [ ] **Step 2: Add v11 strategic/system migrations**

Process decisions in array order. Known strategic IDs become event instances after exact option/effect validation. Preserve concrete amounts/order; derive generated day from family expiry offset; create company target/copy/cooldown/history. Supplier migrates as definition version 1 with no modifier templates. Every other row becomes system only when all old effects are empty; reject unsafe unknown effects.

- [ ] **Step 3: Initialize final runtime/report state**

Derive salted event RNG, selection schema 1, next instance count, modifier sequence 1, empty modifiers, migrated generation history, and empty report arrays.

- [ ] **Step 4: Add strict decoder validation**

Validate union IDs/shapes, company target, copy/effects/modifiers, cash/finance exclusion, one finance effect, RNG/schema/sequences, unique cooldown key/date ordering, active modifier source/date/key/rule/effect, complete-state active-date invariant, history ≤200, and report evidence. Add path-specific `invariant-event-runtime` errors.

- [ ] **Step 5: Add v11 to migration tables and scenario codec coverage**

Old versions chain through v11 then v12. Embedded active scenario games migrate through shared game codec; run ID/revision/definition/evaluation/result remain unchanged.

- [ ] **Step 6: Run and commit**

```bash
bunx vitest run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/scenarioCodec.spec.ts src/lib/persistence/scenarioRepository.spec.ts
bun run check
git add src/lib/persistence
git add -u
git commit -m "feat(events): migrate saves to event schema v12"
```

**Gate:** All browser, in-memory, Tauri, and scenario persistence contracts are green before UI work.

---

### Task 11: Add Typed Alerts and Player Surfaces

**Files:**
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/localizedTypes.ts`
- Modify: locale messages/specs.
- Create: `src/lib/components/game/ActiveModifiers.svelte`
- Create: `src/lib/components/game/ActiveModifiers.svelte.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/TopBar.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Produces:**

```ts
export type GameAlertKind = ExistingAlertKind | 'event-modifier';
export interface GameAlert {
	/* existing typed references */
	decisionId?: string;
	modifierId?: string;
	managementPanelId?: 'finance' | 'decisions';
	message?: string;
}
export interface LocalizedGameAlert extends GameAlert { message: string }
export function localizeGameAlert(
	game: GameState, alert: GameAlert, i18n: I18n
): LocalizedGameAlert;
```

- [ ] **Step 1: Test alert group order and IDs**

Order: stock, decisions, important modifiers by expiry/ID, blocked factories, finance. Decision alerts use instance IDs. Modifier alerts use `event-modifier:<id>` and Decisions panel.

- [ ] **Step 2: Remove event text construction from domain alerts**

`alerts.ts` emits references. `localizeGameAlert` resolves event decisions via copy key and system decisions via narrowed inline title. No event path reads `decision.title`.

- [ ] **Step 3: Build Active Modifiers**

Accessible article per modifier: event title, company target, 10% retail discount, start, exclusive expiry, remaining days including current day, important status; sort expiry then ID; localized empty state.

- [ ] **Step 4: Extend ReportsPanel**

Latest-day impact/lifecycle sections show source, affected IDs, multiplier, baseline cost, count, replacement, and expiry. No rolling totals.

- [ ] **Step 5: Wire page and TopBar**

Derive localized alerts before rendering. Place Active Modifiers beside DecisionQueue in existing Decisions branch. `handleSelectAlert` opens explicit panel; finance sets focused loan; decision fallback remains.

- [ ] **Step 6: Run Svelte workflow, tests, and commit**

Consult required Svelte MCP docs and run autofixer on every changed Svelte file, then:

```bash
bunx vitest run src/lib/game/alerts.spec.ts src/lib/i18n/gameCopy.spec.ts src/lib/components/game/ActiveModifiers.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts src/routes/page.svelte.spec.ts
bun run check
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts src/lib/i18n src/lib/components/game src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(events): surface active modifier impacts"
```

---

### Task 12: Add Production-Catalog E2E and Remove Transitional Paths

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: `src/lib/game/eventCatalog.spec.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`
- Modify/delete: transitional paths found by `rg "CASH_PRESSURE_ID|EXPANSION_ID|SUPPLIER_TERMS_ID|applyScoreEffects|applyStoreEffects|legacy" src`.

- [ ] **Step 1: Seed a production supplier event**

Node-side test setup creates a game with no forced eligibility, finds a deterministic event seed whose production selector generates supplier terms, calls real `selectEventForDay(PRODUCTION_EVENT_CATALOG)`, encodes v12 save, and seeds browser storage. No fixture catalog enters the production graph.

- [ ] **Step 2: Resolve bulk discount through UI**

Assert copy discloses the three-day 10% discount before click; after resolution assert current immediate effects and Active Modifiers entry.

- [ ] **Step 3: Exercise all active days**

Arrange import calendar/state so report evidence occurs on asserted days. Advance closing days `D`, `D+1`, `D+2`; verify 0.9 application and report evidence.

- [ ] **Step 4: Verify alert navigation and expiry**

Click modifier alert → Decisions → matching entry. Final active-day report contains application and expiry. Returned day `D+3` has no modifier/alert and UI empty state.

- [ ] **Step 5: Enforce production allowlist and remove legacy paths**

Catalog test fails on any fourth production event. Remove old constructors/constants, broad mutation helpers, family-ID resolution aliases, and test-only production exports.

- [ ] **Step 6: Run and commit**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts
bunx vitest run src/lib/game/eventCatalog.spec.ts src/lib/scenarios/runtime.spec.ts
bun run check
git add src/routes/retail-sim.e2e.ts src/lib/game/eventCatalog.spec.ts src/lib/scenarios/runtime.spec.ts
git add -u
git commit -m "test(events): cover production modifier lifecycle"
```

---

### Task 13: Full Verification and Single-PR Readiness

**Files:** Modify only files needed to fix verification findings. Update this plan only when an implemented public interface differs from the plan.

- [ ] **Step 1: Static verification**

```bash
bun run check
bun run lint
```

Expected: PASS without ignored warnings.

- [ ] **Step 2: Unit/component verification**

```bash
bun run test:unit -- --run
```

Expected: PASS.

- [ ] **Step 3: E2E and aggregate verification**

```bash
bun run test:e2e
bun run test
```

Expected: PASS.

- [ ] **Step 4: Audit save versions**

```bash
rg "SAVE_SCHEMA_VERSION|schemaVersion: 11|gameSchemaVersion: 11|schemaVersion: 12|gameSchemaVersion: 12|schemaVersion: 13|gameSchemaVersion: 13" src src-tauri
```

Confirm current writes are v12, v11 appears only in migration/tests, and no v13 exists.

- [ ] **Step 5: Audit deferred scope**

```bash
rg "scheduledFollowUps|logistics-route|store-reputation-adjust|stackingRule: 'stack'|target-missing" src
```

No production event-framework contract may implement deferred scope. Review unrelated matches before changing them.

- [ ] **Step 6: Audit identity/localization**

```bash
rg "decisionId: 'cash-pressure'|decisionId: 'expansion-opportunity'|decisionId: 'supplier-terms'" src
rg "decision\.title" src/lib/game/alerts.ts src/lib/i18n/gameCopy.ts
```

No family ID resolves an event. `decision.title` appears only after narrowing to system.

- [ ] **Step 7: Review staged diff**

```bash
git log --oneline main..HEAD
git diff --stat main...HEAD
git diff main...HEAD -- src/lib/game src/lib/persistence src/lib/scenarios src/lib/i18n src/lib/components src/routes
```

Check no unrelated refactor, fixture content, mutable evidence collector, extra global event draw, partial failure commit, or undocumented scope expansion.

- [ ] **Step 8: Commit verification fixes without an empty commit**

```bash
git add -A
if ! git diff --cached --quiet; then
	git commit -m "fix(events): address integration verification"
fi
```

- [ ] **Step 9: Update one implementation PR body**

Document HPA-278, one-PR delivery, v11→v12, supplier modifier, deferred scope, staged commits, exact command results, and remaining risks. Keep draft until every gate passes and review threads are resolved.
