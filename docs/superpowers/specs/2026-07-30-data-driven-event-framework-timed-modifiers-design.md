# Data-Driven Event Framework with Timed Modifiers Design

**Date:** 2026-07-30

**Linear:** [HPA-278](https://linear.app/cwchanap/issue/HPA-278/data-driven-event-framework-with-timed-modifiers)

**Status:** Approved architecture consolidated from HPA-288 through HPA-291; awaiting written-spec review

## Outcome

Replace the three hard-coded strategic decisions with a reusable, deterministic event framework
that supports:

- validated typed catalog definitions;
- recurring event instances with explicit targets;
- sparse deterministic selection and cooldowns;
- atomic typed immediate effects;
- persisted timed modifiers;
- explicit follow-up chains;
- save-safe materialized choices;
- localized player-facing attribution in decisions, reports, and alerts.

The framework must preserve the intended behavior of cash pressure, expansion opportunity, and
supplier terms while becoming the shared foundation for later product trends, competitor actions,
route disruptions, equipment failures, city festivals, and scenario content.

HPA-288, HPA-289, HPA-290, and HPA-291 are consolidated into this design because their schema,
selection, effect, persistence, migration, reporting, and UI work crosses the same
`DecisionItem`, `GameState`, save schema, simulation loop, localization layer, and Decisions
surface. The feature is delivered as one implementation ticket and one branch/PR with staged,
reviewable commits.

## Current baseline

The current `main` branch has the following behavior:

- `src/lib/game/events.ts` hard-codes `cash-pressure`, `expansion-opportunity`, and
  `supplier-terms`.
- Eligibility, priority, sampling, copy, option construction, and effects are coupled in that
  module.
- `generateDecisions` returns at most one newly generated strategic decision per completed day,
  but unresolved decisions from earlier days can coexist.
- Cash pressure and expansion opportunity behave as forced priority checks.
- Supplier terms samples one derived RNG value and appears when that value is below `0.12`.
- `DecisionItem` is also the envelope for synchronous command-feedback notices such as unavailable
  locations, delayed construction, unavailable world cities, and rail failures.
- `DecisionOption.effects` is a broad mutation object. `state.ts#resolveDecision` interprets it
  directly, mixes finance and non-finance behavior, and applies the same `staffMorale` delta to
  both the company scorecard and every store.
- `simulateDay.ts` performs operations, finance servicing, reporting, day advancement, decision
  expiry, and new-decision generation.
- Scenario import-cost modifiers compile into `SimulationRules`.
- `simulationRules.ts` currently returns only the first matching import-cost multiplier and carries
  no source provenance.
- Event copy is localized by hard-coded decision-family classification in `gameCopy.ts`.
- Save schema version 11 persists the current decision objects and finance state.
- `DecisionQueue.svelte` is the shared presentation surface and already handles finance-disabled
  options.
- `ReportsPanel.svelte` has no event-modifier impact or lifecycle evidence.

The feature must work with the completed HPA-277 finance domain and HPA-280 scenario runtime.

## Goals

- Keep the simulation pure, immutable, seed-driven, and replayable.
- Separate strategic catalog events from command-owned system notices without creating a second
  queue.
- Make catalog authoring declarative while retaining exhaustive typed effect handlers.
- Materialize selected choices so unresolved decisions do not change when definitions are revised.
- Give event sampling its own persisted RNG stream.
- Consume a fixed event RNG budget every completed day.
- Preserve sparse decision cadence and permit at most one newly materialized catalog event per
  completed day.
- Persist cooldowns, follow-ups, active modifiers, and bounded event history.
- Apply all event options atomically, including real finance borrowing.
- Apply timed modifiers on precisely defined days with explicit stacking and replacement rules.
- Compose event modifiers with scenario rules through `SimulationRules`.
- Record which modifier affected which result and when it activated, expired, was replaced, or was
  cancelled.
- Localize event, target, modifier, report, and alert copy in English, Japanese, and Traditional
  Chinese.
- Migrate supported v11 saves to v12 with strict diagnostics.
- Provide focused unit, component, persistence, and end-to-end coverage.

## Non-goals

- Moving placement, construction, world, or rail feedback into the event catalog.
- A visual event-authoring editor.
- Runtime JSON scripts, arbitrary property paths, `eval`, or opaque mutation payloads.
- LLM-generated event content.
- A large new production event pack beyond the three migrated families.
- Full competitor, logistics-route, product-trend, equipment-maintenance, or festival simulation.
- Scenario-authored catalog overlays or event allow/deny lists in this release.
- Multiple mandatory strategic prompts every day.
- A new management panel, TopBar ticker, or new raster artwork.
- Aggregating event-modifier impacts into new seven-day or thirty-day report metrics.
- Supporting custom third-party event plugins at runtime.

## Approved behavior decisions

### Strategic events and system notices share presentation, not ownership

`DecisionItem` becomes a discriminated union:

- `kind: 'system'` represents synchronous feedback created by the command that failed or needs
  acknowledgement.
- `kind: 'event'` represents a catalog-selected strategic event instance.

Both render in `DecisionQueue`, expire through the same daily queue cleanup, and are resolved by
the same route command. Only event decisions participate in event history, cooldowns, follow-ups,
and modifiers.

System notices retain their current IDs, contexts, expiry offsets, localization rules, and
acknowledgement behavior. Their options contain no gameplay effects.

### The catalog is typed TypeScript data

Production definitions are TypeScript records checked with `satisfies` and normalized by a
development/test validator. Definitions never contain JavaScript callbacks, field paths, or
arbitrary state patches.

The initial condition, target, immediate-effect, and timed-effect unions contain only variants
needed by the migrated events and the representative modifier lifecycle. Future feature tickets
extend the exhaustive unions and validators deliberately.

### Selected event instances are self-contained

The catalog is not persisted. Selection materializes a complete event decision containing:

- stable event ID and definition version;
- unique monotonic instance ID;
- generated day and expiration day;
- resolved target;
- structured copy key and primitive parameters;
- option IDs;
- concrete immediate effects;
- concrete modifier templates;
- concrete follow-up instructions;
- optional parent-chain provenance.

An unresolved decision therefore keeps the same choices and amounts across save/load and future
catalog changes. Translation keys are compatibility keys and must not be removed while supported
saves can still reference them.

### Event RNG is isolated

Event selection uses a dedicated persisted RNG state derived from `GameState.seed`. It never
consumes or rewinds the sales/production `GameState.rngState` stream.

This intentionally changes the exact historical days on which supplier terms appears. The
preserved contract is deterministic 12% weighted cadence, not the old derived
`game.rngState + game.day * 97` sequence.

### Timed modifiers use exclusive expiration

A modifier created on day `D` with duration `N`:

- has `startsOnDay = D`;
- has `expiresOnDay = D + N`;
- applies while `startsOnDay <= closingDay < expiresOnDay`;
- applies on days `D` through `D + N - 1`;
- is removed after the report for day `D + N - 1`;
- is absent from the returned state for day `D + N`.

For an active modifier, `remainingDays = expiresOnDay - game.day`.

### Cooldowns begin at generation

Cooldown eligibility is keyed by event ID and target. If an event is generated on day `D`, it is
eligible again when:

```ts
currentDay >= D + cooldownDays
```

A pending instance of the same event and target is excluded independently of cooldown.

### Effects are atomic

Event option resolution builds a tentative immutable state and activation plan. Any failure
discards that candidate and returns the original `GameState`. A finance failure, missing target,
expired decision, invalid option, or invalid effect can never leave behind partial cash, score,
stock, loan, modifier, history, or follow-up changes.

## Architecture

The implementation is split into focused pure modules.

### `eventDefinitions.ts`

Owns:

- definition and template types;
- catalog normalization;
- validation diagnostics;
- stable event-ID ordering;
- definition lookup.

It imports domain types but does not inspect or mutate `GameState`.

### `eventCatalog.ts`

Owns the production definitions for:

- cash pressure;
- expansion opportunity;
- supplier terms.

It contains no selection loop, state mutation, localization calls, or persistence logic.

### `eventSelection.ts`

Owns:

- condition evaluation;
- stable target enumeration;
- target existence checks;
- fixed RNG draw consumption;
- follow-up, forced, and weighted selection;
- cooldown and pending-instance checks;
- event materialization.

It accepts a normalized catalog as an argument so unit tests and the Playwright state builder can
use a test-only catalog without shipping test definitions in production.

### `eventEffects.ts`

Owns:

- option availability dry runs;
- typed immediate-effect application;
- finance integration;
- modifier and follow-up preparation;
- atomic event resolution;
- typed failure results.

It does not select events or process daily modifier expiry.

### `eventModifiers.ts`

Owns:

- modifier activation;
- stack and replace behavior;
- target reconciliation;
- active-day filtering;
- `SimulationRules` compilation;
- final-day expiry;
- lifecycle history;
- report-impact aggregation helpers.

### `events.ts`

Remains the small facade imported by `simulateDay.ts`. It wires the production catalog into:

- runtime initialization;
- expired-decision cleanup;
- daily event selection;
- event-resolution delegation where needed.

It contains no production definition literals and no broad mutation logic.

### Existing orchestrators

- `state.ts` dispatches system acknowledgement versus event resolution.
- `simulateDay.ts` owns the normative daily ordering.
- `simulationRules.ts` owns rule composition and source provenance.
- `stock.ts` and `industryProduction.ts` consume resolved rules and return rule-application
  evidence.
- `scenarios/runtime.ts` supplies scenario rules with stable source metadata.
- `saveCodec.ts` owns v11 to v12 migration and strict persisted-state validation.
- Svelte components render already-derived state and invoke route-controller commands.

Dependency direction remains from orchestration toward pure domain modules. Event modules never
import Svelte components, repositories, route state, or wall-clock APIs.

## Domain model

### Structured copy

```ts
export type StructuredCopyParams = Readonly<Record<string, string | number>>;

export interface StructuredCopyRef {
	key: string;
	params: StructuredCopyParams;
}
```

Copy keys are stable semantic keys. Parameters contain only strings and finite numbers. Localized
strings are never authoritative persisted state.

### Event targets

```ts
export type EventTarget =
	| { kind: 'company' }
	| { kind: 'city'; cityId: string }
	| { kind: 'store'; storeId: string }
	| { kind: 'industrial-building'; buildingId: string }
	| { kind: 'material'; materialId: MaterialId }
	| { kind: 'product'; storeId: string; categoryId: string }
	| { kind: 'staff'; staffId: string }
	| { kind: 'logistics-route'; routeId: string };
```

`logistics-route` reserves the persisted target shape for HPA-296. HPA-278 does not add route
state or a production route selector. A production definition using that selector fails catalog
validation until HPA-296 registers target enumeration and existence support.

Canonical target keys are derived by an exhaustive `eventTargetKey` switch:

```ts
company
city:<cityId>
store:<storeId>
industrial-building:<buildingId>
material:<materialId>
product:<storeId>:<categoryId>
staff:<staffId>
logistics-route:<routeId>
```

IDs currently contain no colon. Introducing colon-bearing IDs requires escaping in
`eventTargetKey` before those IDs become valid event targets.

Selectors are explicit and exhaustive:

```ts
export type EventTargetSelector =
	| { kind: 'company' }
	| { kind: 'opened-city' }
	| { kind: 'store' }
	| { kind: 'industrial-building' }
	| { kind: 'material' }
	| { kind: 'product' }
	| { kind: 'staff' }
	| { kind: 'logistics-route' };
```

Stable target enumeration is:

- company: one target;
- city: opened city IDs sorted by ID;
- store: `game.stores` sorted by `id`;
- industrial building: `game.industrialBuildings` sorted by `id`;
- material: supported material IDs sorted lexicographically;
- product: current store products sorted by `storeId`, then `categoryId`;
- staff: `game.staff` sorted by `id`;
- logistics route: unsupported and empty until HPA-296 supplies the resolver.

Array insertion order, object iteration order, active city, and UI sorting never influence target
selection.

### Conditions

```ts
export type EventCondition =
	| { kind: 'always' }
	| { kind: 'all'; conditions: readonly EventCondition[] }
	| { kind: 'any'; conditions: readonly EventCondition[] }
	| { kind: 'not'; condition: EventCondition }
	| { kind: 'day-at-least'; day: number }
	| { kind: 'cash-below'; amount: number }
	| { kind: 'cash-at-least'; amount: number }
	| { kind: 'score-at-least'; score: ScoreKey; value: number }
	| { kind: 'store-count-below-cap' };
```

Conditions are pure reads of `GameState`. A definition is a candidate only when its condition is
true and its target selector returns at least one valid target.

The first release does not add a generic target-filter DSL. Feature-specific tickets extend the
selector union with typed filters when a real event requires them.

### Selection policy

```ts
export type EventSelectionPolicy =
	| { kind: 'forced'; priority: number }
	| { kind: 'weighted'; weight: number };
```

The weighted pool uses one global sparse cadence:

```ts
export const EVENT_WEIGHTED_CADENCE_PROBABILITY = 0.12;
```

Weights distribute the single available weighted event slot; they do not increase the overall
daily prompt probability. A later requirement for multiple cadence bands requires a separate
design rather than overloading weight.

### Definition contracts

```ts
export interface EventDefinition {
	id: string;
	version: number;
	selection: EventSelectionPolicy;
	condition: EventCondition;
	target: EventTargetSelector;
	expiresAfterDays: number;
	cooldownDays: number;
	copyKey: string;
	options: readonly EventOptionDefinition[];
}

export interface EventOptionDefinition {
	id: string;
	effects: readonly EventImmediateEffectTemplate[];
	modifiers?: readonly EventModifierTemplate[];
	followUps?: readonly EventFollowUpDefinition[];
}

export interface EventFollowUpDefinition {
	eventId: string;
	delayDays: number;
	target: 'inherit' | 'reselect';
}
```

`expiresOnDay` is materialized as:

```ts
generatedOnDay + expiresAfterDays
```

The decision is valid while `game.day <= expiresOnDay`.

Follow-up delay must be at least one day. Follow-ups are scheduled only after successful option
resolution:

```ts
dueOnDay = game.day + delayDays
```

### Immediate-effect templates and materialized effects

Only finance borrowing has a dynamic authoring expression in the initial catalog. An
`available-credit-clamped` amount uses the enclosing finance effect's `termDays`; the term is not
duplicated inside the amount expression.

```ts
export type EventBorrowAmountTemplate =
	| { kind: 'fixed'; amount: number }
	| {
			kind: 'available-credit-clamped';
			minimum: number;
			maximum: number;
			increment: number;
	  };

export type EventImmediateEffectTemplate =
	| { kind: 'cash-adjust'; amount: number }
	| { kind: 'score-adjust'; score: ScoreKey; amount: number }
	| {
			kind: 'store-morale-adjust';
			scope: 'all-stores' | 'event-target';
			amount: number;
	  }
	| {
			kind: 'store-reputation-adjust';
			scope: 'all-stores' | 'event-target';
			amount: number;
	  }
	| {
			kind: 'store-stock-adjust-by-target-percent';
			scope: 'all-stores' | 'event-target';
			percent: number;
	  }
	| {
			kind: 'finance-borrow';
			purpose: 'emergency' | 'supplierCredit';
			amount: EventBorrowAmountTemplate;
			termDays: 28 | 56;
	  };
```

A materialized `EventImmediateEffect` has the same variants except `finance-borrow.amount` is a
concrete whole-dollar number.

`scope: 'event-target'` is valid only when the event target is a store. `all-stores` is explicit
because the current company events alter every current store.

The stock effect preserves the current algorithm for every selected store and product:

```ts
nextStock = Math.max(
	0,
	product.stock + Math.round(product.targetStock * percent * 0.01)
);
```

After product updates, `stockHealth` is recalculated with `calculateStockHealth`.

Score and store-morale effects are separate. The migrated options include both effects where the
current broad `staffMorale` property changes both company scorecard morale and every store.

### Timed-effect templates

```ts
export type EventTimedEffect = {
	kind: 'import-cost-multiplier';
	scope: ImportCostScope;
	target: { kind: 'all' } | { kind: 'ids'; ids: readonly string[] };
	multiplier: number;
};

export type EventModifierStackingRule = 'stack' | 'replace';

export interface EventModifierTemplate {
	durationDays: number;
	stackingKey: string;
	stackingRule: EventModifierStackingRule;
	effect: EventTimedEffect;
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}
```

The template is persisted inside the materialized option. Modifier activation assigns source,
target, dates, and a unique modifier ID.

The representative three-day import-cost definition lives only in test fixtures. Production
catalog content remains the three migrated event families.

### Decision union

```ts
export interface SystemDecisionOption {
	id: string;
	label: string;
	description: string;
}

export interface SystemDecisionItem {
	kind: 'system';
	id: string;
	title: string;
	context: DecisionContext;
	expiresOnDay: number;
	options: SystemDecisionOption[];
}

export interface EventDecisionOption {
	id: string;
	effects: EventImmediateEffect[];
	modifiers: EventModifierTemplate[];
	followUps: EventFollowUpDefinition[];
}

export interface EventDecisionItem {
	kind: 'event';
	id: string;
	eventId: string;
	definitionVersion: number;
	generatedOnDay: number;
	expiresOnDay: number;
	target: EventTarget;
	copy: StructuredCopyRef;
	parent?: {
		eventId: string;
		instanceId: string;
	};
	options: EventDecisionOption[];
}

export type DecisionItem = SystemDecisionItem | EventDecisionItem;
```

Event instance IDs are monotonic:

```text
event-instance-1
event-instance-2
...
```

The event ID remains the stable catalog identity such as `cash-pressure`.

System decisions do not carry `effects`. Resolving a valid system option removes the notice and
does not write event history.

## Event runtime state

```ts
export interface EventRuntimeState {
	rngState: number;
	nextInstanceSequence: number;
	nextModifierSequence: number;
	cooldowns: EventCooldownRecord[];
	scheduledFollowUps: ScheduledEventFollowUp[];
	activeModifiers: ActiveEventModifier[];
	history: EventHistoryEntry[];
}
```

`GameState` gains:

```ts
events: EventRuntimeState;
```

The property is named `events`, while `events.ts` remains the runtime facade. This keeps persisted
event state grouped without overloading the existing `decisions` queue.

### Runtime initialization

```ts
export const EVENT_RNG_SEED_SALT = 0x45564e54;
export const EVENT_HISTORY_LIMIT = 200;

export function createInitialEventRuntime(seed: number): EventRuntimeState {
	return {
		rngState: normalizeSeed(seed + EVENT_RNG_SEED_SALT),
		nextInstanceSequence: 1,
		nextModifierSequence: 1,
		cooldowns: [],
		scheduledFollowUps: [],
		activeModifiers: [],
		history: []
	};
}
```

Scenario setup uses the scenario seed already passed to `createNewGame`. A scenario whose authored
start day is later than day 1 does not fast-forward event draws; its first played completed day
uses the first event draw budget because no prior scenario action history exists.

### Cooldown records

```ts
export interface EventCooldownRecord {
	eventId: string;
	target: EventTarget;
	generatedOnDay: number;
	eligibleOnDay: number;
}
```

There is at most one cooldown record per event ID and canonical target key. Generating a later
instance replaces the earlier record. Expired cooldown records are pruned during daily selection.

Cooldown records are authoritative for eligibility. Bounded history is evidence and is never used
as the only cooldown source.

### Scheduled follow-ups

```ts
export interface ScheduledEventFollowUp {
	sourceEventId: string;
	sourceInstanceId: string;
	eventId: string;
	dueOnDay: number;
	target: 'inherit' | 'reselect';
	inheritedTarget?: EventTarget;
}
```

Due follow-ups are ordered by:

1. `dueOnDay`;
2. `sourceInstanceId`;
3. `eventId`.

A due follow-up bypasses ordinary cooldown but cannot create a duplicate pending event/target.

- When blocked only by an already pending matching instance, it remains scheduled and retries on a
  later day.
- When its referenced definition no longer exists, it is removed and a
  `follow-up-skipped: definition-missing` history entry is written.
- When `target: 'inherit'` references a missing target, it is removed and a
  `follow-up-skipped: target-missing` history entry is written.
- When `target: 'reselect'` has no valid target, it is removed with the same target-missing reason.
- At most one valid due follow-up is materialized per completed day; remaining due entries stay
  scheduled.

Catalog validation guarantees follow-up references exist at authoring time. Runtime handling still
covers later catalog revisions.

### History

History is append-only within the newest 200 entries. Entries include:

- event generated;
- event resolved;
- event decision expired unresolved;
- follow-up skipped;
- modifier activated;
- modifier replaced;
- modifier cancelled;
- modifier expired.

Lifecycle entries snapshot their source, target, effect kind, and explanation so evidence remains
usable after the active modifier is removed. `DailyReport` stores its own durable impact and
lifecycle records, so pruning old runtime history does not erase past report evidence.

```ts
export type EventHistoryEntry =
	| {
			kind: 'event-generated';
			day: number;
			eventId: string;
			instanceId: string;
			target: EventTarget;
	  }
	| {
			kind: 'event-resolved';
			day: number;
			eventId: string;
			instanceId: string;
			optionId: string;
			target: EventTarget;
	  }
	| {
			kind: 'event-decision-expired';
			day: number;
			eventId: string;
			instanceId: string;
			target: EventTarget;
	  }
	| {
			kind: 'follow-up-skipped';
			day: number;
			eventId: string;
			sourceInstanceId: string;
			reason: 'definition-missing' | 'target-missing';
	  }
	| {
			kind: 'modifier-lifecycle';
			day: number;
			status: 'activated' | 'replaced' | 'cancelled' | 'expired';
			modifier: EventModifierSnapshot;
			reason?: 'target-missing';
			replacedByModifierId?: string;
	  };
```

Array order is the authoritative order for entries written on the same day. Every append operation
is deterministic, and pruning retains the newest `EVENT_HISTORY_LIMIT` entries.

## Catalog validation

```ts
export interface EventDefinitionDiagnostic {
	code: EventDefinitionDiagnosticCode;
	eventId: string;
	path: string;
	message: string;
	value?: unknown;
}

export type EventCatalogValidationResult =
	| { ok: true; catalog: NormalizedEventCatalog }
	| { ok: false; diagnostics: EventDefinitionDiagnostic[] };
```

Validation returns all diagnostics in stable event/path order. Development startup and tests throw
one formatted error if the production catalog is invalid.

Validation covers:

- event IDs matching `^[a-z][a-z0-9-]*$`;
- duplicate event IDs;
- positive integer definition versions;
- supported selection kinds;
- finite integer forced priorities;
- positive finite weights;
- supported condition variants;
- non-empty `all` and `any` groups;
- finite condition values;
- supported target selectors;
- route selectors being unavailable until a route resolver is registered;
- positive integer `expiresAfterDays`;
- positive integer `cooldownDays`;
- non-empty copy keys;
- at least one option;
- valid and unique option IDs;
- supported effect kinds;
- finite whole-dollar cash and finance amounts;
- valid score keys;
- valid store-effect scope for the selected target kind;
- valid finance purpose and term;
- valid clamped-amount minimum, maximum, and increment;
- at most one finance-borrow effect per option;
- positive finite import multipliers;
- non-empty modifier stacking keys;
- positive integer modifier durations;
- known stacking rules;
- valid structured explanation keys and primitive parameters;
- follow-up delay of at least one day;
- duplicate follow-up declarations;
- unknown follow-up event IDs;
- self-contradictory definitions that can never produce a target.

TypeScript exhaustiveness prevents most unknown handlers in production code. Runtime validation
still catches malformed records introduced through unsafe casts and test fixtures.

Normalization:

- sorts definitions by event ID;
- preserves authored option and effect order;
- freezes normalized definitions in development/test;
- builds a read-only lookup by event ID.

```ts
export interface NormalizedEventCatalog {
	definitions: readonly EventDefinition[];
	byId: ReadonlyMap<string, EventDefinition>;
}
```

The contradiction check is deliberately finite rather than a general constraint solver. Within
an `all` tree it rejects:

- `cash-below: A` combined with `cash-at-least: B` when `B >= A`;
- `score-at-least` values outside the scorecard's `0..100` domain;
- a condition combined with its direct `not` equivalent;
- `not(always)`;
- a target-dependent effect whose selector can never produce that target kind.

More complex business contradictions are expressed as explicit typed validators when a real
definition requires them.

## Production catalog parity

### Cash pressure

```text
eventId: cash-pressure
version: 1
selection: forced, priority 100
condition: cash < 0
target: company
expiresAfterDays: 2
cooldownDays: 3
```

Options, in order:

1. `short-loan`
   - borrow the materialized emergency amount for 56 days;
   - score profit `-4`;
   - score market position `-1`.
2. `cut-costs`
   - cash `+5,500`;
   - score customer satisfaction `-4`;
   - score staff morale `-5`;
   - all-store morale `-5`;
   - all-store stock adjustment `-8%` of each product target stock.
3. `hold-course`
   - score profit `+1`;
   - score staff morale `-2`;
   - all-store morale `-2`.

Emergency amount materialization exactly preserves the current formula:

```ts
const roundedCapacity =
	Math.floor(assessCredit(game, 56).availableCredit / 1_000) * 1_000;

const amount = Math.min(12_000, Math.max(4_000, roundedCapacity));
```

The amount is persisted in the event instance. At resolution, current credit is checked again.
The amount is not silently resized after the player sees the option.

### Expansion opportunity

```text
eventId: expansion-opportunity
version: 1
selection: forced, priority 50
condition:
  day >= 14
  cash >= 55,000
  store count < store cap
  profit score >= 62
target: company
expiresAfterDays: 3
cooldownDays: 4
```

Options, in order:

1. `prepare`
   - cash `-3,500`;
   - score market position `+5`;
   - score profit `-1`.
2. `pass`
   - score profit `+1`;
   - score staff morale `+1`;
   - all-store morale `+1`.

### Supplier terms

```text
eventId: supplier-terms
version: 1
selection: weighted, weight 1
condition: always
target: company
expiresAfterDays: 2
cooldownDays: 3
```

Options, in order:

1. `negotiate-credit`
   - borrow `$4,000` as supplier credit for 28 days;
   - score profit `-2`.
2. `bulk-discount`
   - cash `-2,500`;
   - score profit `+3`;
   - all-store stock adjustment `+6%` of each product target stock.

With supplier terms as the only weighted definition, the global `0.12` cadence preserves its 12%
daily probability when no due follow-up or forced event wins the day.

### Earliest recurrence parity

The cooldown values preserve the earliest day on which the current definitions can reappear after
their decision expires:

| Event | Generated `D` | Valid through | Earliest current reroll | New cooldown eligibility |
| --- | ---: | ---: | ---: | ---: |
| Cash pressure | `D` | `D + 2` | `D + 3` | `D + 3` |
| Expansion opportunity | `D` | `D + 3` | `D + 4` | `D + 4` |
| Supplier terms | `D` | `D + 2` | `D + 3` | `D + 3` |

Pending-instance exclusion still prevents duplicates before expiry.

## Deterministic daily selection

### Fixed draw budget

```ts
export const EVENT_DRAW_COUNT_PER_DAY = 3;
```

After every completed day, the event RNG consumes exactly three values in this order:

1. cadence draw;
2. weighted-event draw;
3. target draw.

All three values are consumed before selection branches. They are consumed even when:

- a follow-up event wins;
- a forced event wins;
- no definition is eligible;
- weighted cadence fails;
- only one weighted candidate exists;
- only one target exists.

The returned `events.rngState` is the state after the third draw.

### Selection order

For the returned state whose day is `D + 1`, selection proceeds:

1. prune expired cooldown records;
2. evaluate due follow-ups in stable order;
3. evaluate eligible forced definitions;
4. if no forced definition wins and cadence draw is below `0.12`, evaluate the weighted pool;
5. choose a target using the target draw;
6. materialize at most one event decision;
7. append generation history and cooldown state.

Forced definitions are ordered by descending priority, then event ID. Weighted definitions and
their targets are ordered by stable IDs before cumulative selection.

Weighted selection uses:

```ts
threshold = weightedDraw * totalWeight
```

and chooses the first candidate whose cumulative weight is strictly greater than the threshold.

Target selection uses:

```ts
index = Math.min(Math.floor(targetDraw * targets.length), targets.length - 1)
```

### Pending instances

Selection excludes only a pending event with the same event ID and target. It does not impose a
global one-event queue limit.

This preserves the current ability for a different strategic event to appear while an earlier
event remains unresolved, while still generating no more than one new catalog event per day.

System notices do not count as pending strategic events and do not consume the daily event slot.

### Pure selection API

The core API is catalog-injectable:

```ts
export function selectEventForDay(
	game: GameState,
	catalog: NormalizedEventCatalog
): GameState;
```

The function returns a new state with the fixed RNG advancement and at most one appended event
decision. `events.ts` supplies the production catalog. Tests may supply a fixture catalog.

Same input state plus the same normalized catalog must produce deeply equal output.

## Event materialization

Materialization:

1. allocates `event-instance-<nextInstanceSequence>`;
2. resolves and persists the target;
3. resolves dynamic effect templates;
4. copies concrete options, modifiers, and follow-ups;
5. writes `generatedOnDay` and `expiresOnDay`;
6. stores the definition version and structured copy key;
7. records optional parent provenance;
8. advances `nextInstanceSequence`;
9. writes or replaces the event/target cooldown;
10. appends generation history.

Materialization performs no gameplay effect and does not consume additional RNG.

The catalog is not consulted when a materialized option is later rendered, checked, or resolved.

## Decision resolution

### Public result

```ts
export type DecisionResolutionFailureCode =
	| 'decision-not-found'
	| 'option-not-found'
	| 'decision-expired'
	| 'target-missing'
	| 'finance-unavailable'
	| 'effect-rejected';

export type DecisionResolutionResult =
	| {
			ok: true;
			game: GameState;
			decisionKind: 'system' | 'event';
	  }
	| {
			ok: false;
			game: GameState;
			code: DecisionResolutionFailureCode;
			context: Record<string, string | number>;
			financeFailure?: FinanceFailureCode;
	  };
```

Every failure returns the original state object as `game`.

`GameRouteController` and scenario command dispatch adapt this typed result. A scenario
`resolveDecision` command that fails is reported as an invalid command with the decision failure
context rather than silently recording an unchanged successful command.

### Option availability

```ts
export function getDecisionOptionAvailability(
	game: GameState,
	decision: DecisionItem,
	optionId: string
): DecisionOptionAvailability;
```

- System options are available when the decision and option exist and the decision is not expired.
- Event options run the same pure preparation path as resolution.
- Finance effects call the HPA-277 credit domain against current state.
- Missing event targets disable the option with an explicit reason.
- Availability checks never allocate IDs, write history, create loans, or change state.

`DecisionQueue` retains the existing detailed credit-unavailable messages and adds generic
localized target/expiry failure text where applicable.

### Atomic event preparation and commit

Event resolution:

1. finds the event decision and option;
2. rejects `game.day > expiresOnDay`;
3. confirms the persisted target still exists;
4. validates every materialized effect and modifier payload;
5. applies immediate effects to a tentative immutable state in persisted order;
6. calls finance borrowing against that tentative state when encountered;
7. prepares modifier activations and replacement lifecycle records;
8. prepares follow-up schedules;
9. only after every step succeeds:
   - removes the decision;
   - commits the tentative state;
   - activates modifiers;
   - appends follow-ups;
   - appends resolution and lifecycle history;
   - runs `refreshWorldProgress`.

Effect order is semantically significant and is preserved during definition normalization and
materialization.

If a preceding effect changes cash or score before a finance effect, the finance effect evaluates
the tentative state at that point. Availability dry runs and real resolution share the same path,
so the UI cannot claim an option is available under different ordering semantics.

### Immediate-effect semantics

- `cash-adjust`: add the whole-dollar amount; negative cash remains allowed.
- `score-adjust`: add then pass through `clampScore`.
- `store-morale-adjust`: add then `clampScore` on selected stores.
- `store-reputation-adjust`: add then `clampScore` on selected stores.
- `store-stock-adjust-by-target-percent`: apply the exact target-stock formula, clamp stock to zero,
  then recalculate `stockHealth`.
- `finance-borrow`: call HPA-277 `borrow` with the persisted amount, purpose, and term. Any finance
  failure aborts the entire decision resolution.

### System acknowledgement

Resolving a valid system option only removes that system decision. It does not:

- apply gameplay effects;
- write event history;
- create cooldowns;
- schedule follow-ups;
- create modifiers.

System constructors are updated to omit their current empty `effects: {}` objects.

## Timed modifier lifecycle

### Active modifier shape

```ts
export interface ActiveEventModifier {
	id: string;
	source: {
		eventId: string;
		instanceId: string;
		optionId: string;
	};
	target: EventTarget;
	startsOnDay: number;
	expiresOnDay: number;
	stackingKey: string;
	stackingRule: EventModifierStackingRule;
	effect: EventTimedEffect;
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}
```

Modifier IDs are monotonic:

```text
event-modifier-1
event-modifier-2
...
```

The active array contains only modifiers that have not expired or been cancelled. Historical
status lives in lifecycle history and reports rather than as a contradictory persisted `status`
field on active entries.

```ts
export type EventModifierSnapshot = ActiveEventModifier;
```

Lifecycle records copy the modifier value rather than retain a mutable reference.

### Activation

A successfully resolved option activates each modifier template in option order:

```ts
startsOnDay = game.day
expiresOnDay = game.day + durationDays
```

Activation allocates an ID, appends an activation history entry, and advances
`nextModifierSequence`.

### Stack

`stack` retains all existing modifiers and appends the new modifier. Matching rules apply in stable
modifier-ID order.

### Replace

`replace` removes every active modifier with the same `stackingKey` before appending the new one.
For each removed modifier, history records:

- replacement day;
- replaced modifier snapshot;
- `replacedByModifierId`.

The new modifier also receives its activation entry. Replacement is atomic with option resolution.

### Target reconciliation

At the start of each simulated day, each modifier target is checked against current state.

A missing target:

- is removed before rules compile;
- contributes no rule that day;
- writes exactly one `modifier-cancelled` history entry with reason `target-missing`;
- appears in that day's lifecycle report;
- is never cancelled again.

The save decoder validates target shape, not target existence, because legitimate gameplay can
delete a target after the event was selected or the modifier was created.

### Active-day compilation

A modifier is compiled when:

```ts
modifier.startsOnDay <= closingDay &&
closingDay < modifier.expiresOnDay
```

Compiled event rules are sorted by modifier ID.

### Expiration

After closing-day operations use the compiled rules, modifiers with:

```ts
modifier.expiresOnDay === closingDay + 1
```

are removed. The closing-day report records both:

- the modifier's final application, when it affected a non-zero matching import calculation;
- a lifecycle entry with status `expired`.

The returned next-day state no longer contains the modifier. Expiration is recorded exactly once.

## Simulation rule composition and provenance

### Source metadata

```ts
export type SimulationRuleSource =
	| {
			kind: 'scenario';
			sourceId: string;
	  }
	| {
			kind: 'event-modifier';
			sourceId: string;
			modifierId: string;
			eventId: string;
			instanceId: string;
			explanation: StructuredCopyRef;
	  };

export interface ImportCostMultiplierRule {
	source: SimulationRuleSource;
	scope: ImportCostScope;
	target: { kind: 'all' } | { kind: 'ids'; ids: readonly string[] };
	multiplier: number;
}
```

Scenario source IDs are stable:

```text
scenario:<scenarioId>:modifier:<definition-index>
```

Event source IDs are the modifier IDs.

### Merge

```ts
export function mergeSimulationRules(
	...ruleSets: readonly SimulationRules[]
): SimulationRules;
```

Merge concatenates rules and sorts them by a stable source key. It never mutates an input rule
set.

### Resolution

```ts
export interface ImportCostRuleContribution {
	source: SimulationRuleSource;
	multiplier: number;
}

export interface ImportCostResolution {
	multiplier: number;
	contributions: ImportCostRuleContribution[];
}

export function resolveImportCostMultiplier(
	rules: SimulationRules,
	scope: ImportCostScope,
	targetId: string
): ImportCostResolution;
```

Every matching multiplier contributes. The final value is their product:

```ts
matching.reduce((value, rule) => value * rule.multiplier, 1)
```

This replaces the current first-match behavior.

Current scenario definitions must retain identical outcomes. Scenario regression tests prove that
none depends on overlapping first-match semantics. Overlapping future scenario and event rules
multiply in stable order.

### Application evidence

`stock.ts` and `industryProduction.ts` return pure rule-application evidence alongside their
existing results. One application record is emitted only when:

- a matching rule contributed;
- the import quantity and baseline import cost were non-zero.

The evidence includes:

- rule source;
- scope;
- affected product/material ID;
- source multiplier;
- baseline cost.

`simulateDay` aggregates event-modifier applications by modifier ID into the daily report. Scenario
sources remain available to scenario diagnostics but are not presented as event-modifier impacts.

No mutable callback or global attribution collector is introduced.

## Normative daily ordering

For a state whose current day is `D`, `simulateDay` closes day `D`.

1. Reconcile active modifier targets for day `D`.
2. Compile modifiers active on day `D`.
3. Merge event rules with the supplied scenario rules.
4. Simulate industrial production using the merged rules and collect rule applications.
5. Simulate retail operations and imports using the merged rules and collect rule applications.
6. Apply operating cash flow and score/store transitions.
7. Service finance for day `D`.
8. Finalize modifier expiry after its last allowed application.
9. Build the day-`D` report with:
   - ordinary business and finance data;
   - aggregated event-modifier impacts;
   - modifier lifecycle entries recorded on day `D`.
10. Advance state to day `D + 1` and reset finance day activity.
11. Remove decisions no longer valid on day `D + 1`.
    - expired event decisions write an unresolved-expiry history entry dated day `D`;
    - expired system decisions are removed without event history.
12. Consume exactly three event RNG draws.
13. Select and materialize at most one event for day `D + 1`.
14. Run the normal world-state refresh and return.

A modifier resolved during player actions on day `D` therefore applies when day `D` is closed.
An event generated after day `D` is closed is first visible in state day `D + 1`.

## Report attribution

`DailyReport` gains:

```ts
export interface EventModifierImpact {
	modifierId: string;
	source: ActiveEventModifier['source'];
	target: EventTarget;
	effectKind: EventTimedEffect['kind'];
	explanation: StructuredCopyRef;
	scope: ImportCostScope;
	affectedIds: string[];
	multiplier: number;
	baselineCost: number;
	applicationCount: number;
}

export type EventModifierLifecycleStatus =
	| 'activated'
	| 'replaced'
	| 'cancelled'
	| 'expired';

export interface EventModifierLifecycle {
	status: EventModifierLifecycleStatus;
	modifier: EventModifierSnapshot;
	reason?: 'target-missing';
	replacedByModifierId?: string;
}

export interface DailyReport {
	// existing fields
	modifierImpacts: EventModifierImpact[];
	modifierLifecycle: EventModifierLifecycle[];
}
```

Impact aggregation:

- sorts records by modifier ID;
- sorts and deduplicates affected IDs;
- sums baseline cost;
- counts matching import applications;
- reports the modifier's own multiplier;
- does not attempt to allocate a unique dollar delta among overlapping multiplicative sources.

Lifecycle records snapshot the modifier so expiration and replacement remain explainable after
removal.

`reports.ts` preserves the arrays on `latest` but does not add rolling modifier totals in v1.

## Alerts

`GameAlertKind` gains `event-modifier`.

An alert is emitted for each active modifier whose `importance` is `important`:

- ID: `event-modifier:<modifierId>`;
- localized source and effect summary;
- affected target;
- remaining duration;
- deep link to the Decisions management panel.

Normal-importance modifiers remain visible in Active Modifiers and reports without producing
alert noise.

Existing decision alerts continue for both system and event decisions. Event alert titles use the
event copy key; system alert titles use existing system localization.

The TopBar continues to show only the existing aggregate alert count.

## Localization

### Event copy

Production event base keys are:

```text
copy.events.cashPressure
copy.events.expansionOpportunity
copy.events.supplierTerms
```

Each base provides:

```text
title
context
options.<optionId>.label
options.<optionId>.description
```

Event localization uses the persisted `copy.key`, option ID, and structured parameters. It does
not classify event families from decision IDs.

### System copy

Existing `DecisionContext` localization and system-family classification remain for system
notices. The classifier is renamed or narrowed so it cannot rewrite event instances.

### Targets and modifiers

Localization helpers cover every `EventTarget` variant and timed effect:

- company label;
- city label;
- store display name and ordinal;
- industrial building label;
- material label;
- store product label;
- staff name;
- route fallback ID until HPA-296 adds route names;
- import-cost multiplier summary;
- remaining duration;
- activation, replacement, cancellation, and expiration status.

### Locale completeness

Every key is added to:

- `messages/en.ts`;
- `messages/ja.ts`;
- `messages/zh-Hant.ts`.

Tests iterate the normalized production catalog and assert all event title, context, option, and
modifier explanation keys exist in every locale. Existing catalog-completeness tests remain
passing.

## Active Modifiers UI

`ActiveModifiers.svelte` is added to the existing Decisions management surface.

It receives already-persisted active modifiers, current game state, and `i18n`. It displays:

- source event title;
- affected target;
- effect summary;
- start day;
- exclusive expiry day;
- remaining days;
- importance state where meaningful.

Ordering is:

1. earliest `expiresOnDay`;
2. modifier ID.

The empty state explicitly states that no timed event effects are active.

Each modifier is an accessible article with a heading and meaningful status text. Remaining
duration is text, not color-only information.

`DecisionQueue.svelte` adds event provenance and target copy for `kind: 'event'`. System cards keep
their current layout. Finance-disabled option behavior remains unchanged.

`ReportsPanel.svelte` adds two latest-day sections:

- modifier impacts;
- modifier lifecycle.

No new management panel or map overlay is introduced.

## Persistence and migration

### Schema version

```ts
export const SAVE_SCHEMA_VERSION = 12;
```

Version 11 is added to the migratable set and advances through an explicit v11 to v12 step.

### v11 decision migration

Decisions are processed in existing array order.

#### Strategic families

IDs exactly matching:

- `cash-pressure`;
- `expansion-opportunity`;
- `supplier-terms`;

are migrated into event instances.

For each:

- validate the expected family option IDs, order-independent uniqueness, and old effect shape;
- reject missing, duplicate, or unknown family options as corrupt;
- assign `event-instance-<sequence>`;
- preserve its concrete option order and values;
- map the old broad effect object to the exact typed effect list;
- derive `generatedOnDay` from its known expiry offset;
- retain `expiresOnDay`;
- set target to company;
- set definition version 1;
- set the stable event copy key;
- append a generation history entry;
- create its cooldown record.

The concrete saved emergency finance amount is retained rather than recalculated.

#### System notices

Every other decision becomes `kind: 'system'`.

Migration requires every old system option effect object to be empty. A non-empty unknown system
effect is rejected as corrupt rather than silently dropped.

System IDs, title, context, option copy, and expiry remain unchanged.

### Runtime initialization during migration

- event RNG derives from the saved game seed and stable salt;
- instance sequence follows the migrated event count;
- modifier sequence starts at 1;
- active modifiers and follow-ups start empty;
- history contains migrated event-generation snapshots;
- existing reports receive empty impact and lifecycle arrays.

No persisted field outside `game.decisions` refers to the old strategic decision IDs, so assigning
instance IDs does not require a cross-object reference rewrite.

### Strict validation

The v12 decoder validates:

- `DecisionItem.kind`;
- unique decision IDs;
- event instance ID syntax and sequence bounds;
- known event target shapes;
- structured copy keys and primitive parameters;
- option IDs and typed effects;
- whole-dollar and finite numeric fields;
- finance terms and purposes;
- event runtime RNG range;
- positive sequence counters greater than every referenced instance/modifier numeric suffix in
  pending decisions, active modifiers, runtime history, and stored reports;
- unique cooldown event/target keys;
- cooldown date ordering;
- scheduled follow-up shape and date;
- unique active modifier IDs;
- modifier source shape;
- positive duration and `startsOnDay < expiresOnDay`;
- every active modifier satisfying `startsOnDay <= game.day < expiresOnDay`;
- non-empty stacking keys and known rules;
- timed-effect payloads;
- history length at or below 200;
- report impact and lifecycle shape.

The decoder does not require a persisted event decision, modifier, or follow-up target to still
exist in current state or its referenced definition to still exist in the current catalog.
Runtime reconciliation and follow-up handling own those legitimate stale-reference cases.

Malformed state throws `SaveDataError` with a path-specific message and the
`invariant-event-runtime` code where appropriate.

### Scenario-run persistence

`scenarioCodec.ts` continues to decode the embedded game through the shared game codec. An active
scenario run with `gameSchemaVersion: 11` migrates its embedded game to v12 and rewrites
`gameSchemaVersion` to 12 on the next successful persist. Scenario definition version, run ID,
revision, evaluation, and result data are unchanged.

Result-only best records contain no `GameState` and require no event migration.

### Repository coverage

Browser, Tauri, and in-memory repository tests cover:

- v12 round-trip;
- v11 migration;
- pending materialized event preservation;
- active modifier preservation;
- remaining duration after load;
- cooldown and follow-up preservation;
- report attribution preservation;
- malformed event-state rejection.

## Error handling

### Catalog errors

Production catalog validation fails during development/test startup with all diagnostics. It is a
developer error, not a player-facing recoverable result.

### Expected player failures

Decision resolution returns typed failures for missing decisions/options, expiry, target deletion,
finance unavailability, and rejected effects. The original state is retained.

### Persisted-state errors

Malformed v12 state throws `SaveDataError`. Legitimate missing gameplay targets are not treated as
decoder corruption.

### Runtime invariants

Exhaustive switches use `assertNever`. Unknown effect, target, selection, lifecycle, or rule kinds
cannot silently no-op.

## Test strategy

### Current-behavior parity

Expand `events.spec.ts` before deleting old constructors.

Tests lock:

- cash-pressure `cash < 0` boundary;
- expansion day, cash, store-cap, and profit boundaries;
- forced priority;
- supplier 12% cadence boundary;
- exact decision expiry days;
- exact option order and IDs;
- exact emergency amount formula;
- finance purpose and term;
- exact cash and score changes;
- company and all-store morale coupling;
- stock target-percentage formula and recalculated stock health;
- no duplicate pending event/target;
- earliest recurrence after expiry.

### Catalog validation

Every diagnostic family has a focused invalid fixture. Representative valid definitions normalize
without changing authored option/effect order.

### Selection and RNG

Tests cover:

- exactly three draws on every completed day;
- identical RNG advancement for no-candidate, cadence-fail, forced, follow-up, and single-target
  paths;
- same-state determinism;
- target array order independence;
- forced priority and ID tie-break;
- weighted boundary selection;
- cooldown day immediately before and at eligibility;
- pending same-target exclusion;
- different-target recurrence;
- multiple unresolved different events;
- follow-up priority;
- pending follow-up retry;
- missing follow-up definition and target handling.

### Atomic resolution

Tests cover:

- each immediate effect;
- declared effect order;
- finance availability changing between generation and resolution;
- a later failure discarding earlier tentative cash/score/loan changes;
- target deletion;
- system acknowledgement without event history;
- successful event history, modifier activation, follow-up scheduling, and world refresh.

### Modifier lifecycle

Tests cover:

- same-day start;
- every active day;
- final active day;
- exclusive expiry;
- stack order;
- replacement lifecycle;
- target-missing cancellation;
- exact-once cancellation and expiry;
- save/load mid-duration;
- scenario and event multiplier product;
- stable rule source ordering;
- application evidence only for non-zero matched imports.

The test-only representative event creates a three-day import-cost multiplier. It is defined in
test support, not `eventCatalog.ts`.

### Simulation integration

`simulateDay.spec.ts` verifies the normative order, report day, modifier application, finance
reconciliation, expiry, decision cleanup, fixed RNG advancement, and next-day event selection.

Existing scenario definitions are replayed to prove the new multiplicative resolver does not alter
their current outcomes.

### Persistence

Save codec tests cover every migration and validation rule listed above. Repository tests verify
all backends preserve the v12 shape.

### Components

Client Vitest covers:

- system versus event card rendering;
- event target and provenance;
- finance-disabled options;
- missing-target disabled state;
- Active Modifiers empty, active, important, and expiring states;
- target labels;
- report impacts;
- activation, replacement, cancellation, and expiry copy;
- keyboard and accessible-name behavior.

### End-to-end lifecycle

The Playwright test uses a test-only catalog without shipping it in production:

1. Node-side test setup imports the pure game modules.
2. It creates a deterministic game and calls the real catalog-injectable selection function with
   the fixture catalog.
3. It encodes that selected materialized event into a v12 save.
4. It seeds browser storage before page load.
5. The browser resolves the option through the real Decisions UI.
6. It verifies the modifier is active for each intended day.
7. It verifies final-day application, next-day absence, and report attribution.

This covers real deterministic selection, persisted materialization, UI resolution, simulation,
expiry, and reporting while keeping fixture content out of the production catalog.

## File and responsibility map

### New files

- `src/lib/game/eventDefinitions.ts`
- `src/lib/game/eventDefinitions.spec.ts`
- `src/lib/game/eventCatalog.ts`
- `src/lib/game/eventCatalog.spec.ts`
- `src/lib/game/eventSelection.ts`
- `src/lib/game/eventSelection.spec.ts`
- `src/lib/game/eventEffects.ts`
- `src/lib/game/eventEffects.spec.ts`
- `src/lib/game/eventModifiers.ts`
- `src/lib/game/eventModifiers.spec.ts`
- `src/lib/components/game/ActiveModifiers.svelte`
- `src/lib/components/game/ActiveModifiers.svelte.spec.ts`

### Existing domain files

- `src/lib/game/types.ts`
  - persisted decision, event, modifier, history, and report shapes only.
- `src/lib/game/events.ts`
  - production catalog facade and queue cleanup.
- `src/lib/game/events.spec.ts`
  - migrated-event parity.
- `src/lib/game/state.ts`
  - system/event resolution dispatch.
- `src/lib/game/state.spec.ts`
  - public resolution behavior.
- `src/lib/game/simulateDay.ts`
  - daily event/modifier orchestration.
- `src/lib/game/simulateDay.spec.ts`
  - normative lifecycle integration.
- `src/lib/game/simulationRules.ts`
  - provenance, merge, and multiplicative resolution.
- `src/lib/game/simulationRules.spec.ts`
  - rule composition.
- `src/lib/game/stock.ts`
  - retail rule application evidence.
- `src/lib/game/stock.spec.ts`
  - retail modifier application.
- `src/lib/game/industryProduction.ts`
  - industrial rule application evidence.
- `src/lib/game/industryProduction.spec.ts`
  - industrial modifier application.
- `src/lib/game/alerts.ts`
  - important-modifier alerts.
- `src/lib/game/alerts.spec.ts`
  - alert ordering and deep links.
- `src/lib/game/reports.ts`
  - retain latest attribution without new rolling aggregates.
- `src/lib/scenarios/runtime.ts`
  - scenario source metadata and rule composition.
- `src/lib/scenarios/runtime.spec.ts`
  - replay parity.

### Persistence

- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- `src/lib/persistence/saveRepository.spec.ts`
- `src/lib/persistence/scenarioCodec.ts`
- `src/lib/persistence/scenarioCodec.spec.ts`
- `src/lib/persistence/scenarioRepository.spec.ts`
- backend-specific repository tests where required.

### Localization

- `src/lib/i18n/gameCopy.ts`
- `src/lib/i18n/localizedTypes.ts`
- `src/lib/i18n/gameCopy.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

### UI and orchestration

- `src/lib/components/game/DecisionQueue.svelte`
- `src/lib/components/game/DecisionQueue.svelte.spec.ts`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- `src/routes/gameRouteController.ts`
- `src/routes/gameRouteController.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`
- `src/routes/retail-sim.e2e.ts`

## Staged implementation sequence

### Stage 1: parity, union, catalog, and validation

- Lock current event behavior.
- Introduce the system/event union and empty event runtime.
- Convert system constructors to effect-free system options.
- Add definition contracts and production catalog.
- Add catalog validation and locale-key completeness.

### Stage 2: deterministic selection and materialization

- Add condition and target evaluation.
- Add dedicated RNG initialization and fixed daily draw budget.
- Add follow-up, forced, and weighted selection.
- Add cooldowns, pending exclusion, history, and instance materialization.
- Reduce `events.ts` to the production facade.

### Stage 3: atomic effects and decision resolution

- Add dry-run availability and effect handlers.
- Integrate finance borrowing.
- Add typed resolution results.
- Update route and scenario dispatch.
- Migrate the three event families away from broad mutation objects.
- Delete obsolete hard-coded constructors only after parity passes.

### Stage 4: modifiers and simulation rules

- Add modifier activation, stack, replace, reconciliation, and expiry.
- Add rule provenance, merge, and multiplicative resolution.
- Add retail and industrial application evidence.
- Integrate the normative daily order and report records.
- Add the test-only three-day lifecycle fixture.

### Stage 5: v12 persistence and localization

- Add v11 to v12 migration.
- Add strict decoder validation.
- Update all repository backends and fixtures.
- Move event localization to copy keys.
- Add event-target, modifier, report, and alert copy in all locales.

### Stage 6: player surfaces and end-to-end coverage

- Add Active Modifiers to Decisions.
- Extend DecisionQueue and ReportsPanel.
- Add important-modifier alerts and deep links.
- Complete component accessibility coverage.
- Add the deterministic Playwright lifecycle.
- Run full verification.

## Risks and mitigations

### Exact supplier selection days change

Isolation from the live simulation RNG changes the old supplier-term sequence.

Mitigation: explicitly preserve the 12% deterministic cadence contract and add fixed-draw golden
tests. This is an intentional architecture correction.

### Materialized choices increase save size

Persisting concrete options duplicates small catalog payloads.

Mitigation: only pending instances are materialized; event history is bounded; definitions are
small; correctness across revisions is worth the limited size.

### Rule provenance touches retail and industry paths

Import-cost attribution requires both consumers to return evidence.

Mitigation: keep evidence in pure return values, avoid callbacks, and test scenario-only parity
before enabling composition.

### Decision union crosses many constructors

System notices are created in several domain modules.

Mitigation: convert them mechanically to `kind: 'system'`, remove empty effects, and retain their
existing IDs, contexts, expiry, and localization tests.

### Bounded history cannot own cooldown truth

Pruning history could otherwise re-enable an event too early.

Mitigation: cooldown records are separate authoritative state and expired records are pruned
independently.

## Acceptance criteria

- The production catalog validates without diagnostics.
- Invalid definitions fail with stable event-and-field diagnostics.
- Cash pressure, expansion opportunity, and supplier terms preserve exact eligibility boundaries,
  option order, expiry offsets, finance payloads, immediate effects, and earliest recurrence.
- Supplier terms retains deterministic 12% weighted cadence.
- The same state, action history, and catalog produce the same event decisions, targets, modifiers,
  reports, and event RNG state.
- Every completed day consumes exactly three event RNG draws without touching `GameState.rngState`.
- Target ordering never depends on source array or object iteration order.
- Cooldowns and pending-instance exclusion work at exact boundaries.
- Follow-ups are explicit, deterministic, and safely handle pending or missing targets and
  definitions.
- Pending event choices survive save/load and catalog revision because they are materialized.
- System notices never enter event history, cooldowns, follow-ups, or modifiers.
- Event options apply atomically and never leave partial finance or state changes.
- Timed modifiers apply on the intended days, stack or replace explicitly, cancel missing targets
  once, expire once, and are absent on the exclusive expiration day.
- Scenario and event import multipliers compose multiplicatively with stable provenance.
- Reports identify applied modifier sources, affected IDs, and lifecycle transitions.
- Important active modifiers produce localized alerts with Decisions deep links.
- Players can inspect active modifiers, targets, effects, and remaining duration.
- Save schema v12 round-trips and v11 migrates with useful validation failures in both sandbox
  saves and embedded active scenario runs.
- English, Japanese, and Traditional Chinese catalogs remain complete.
- Unit, persistence, component, scenario regression, and targeted Playwright coverage pass.
- All modified Svelte files follow the repository's mandatory Svelte MCP documentation and
  autofixer workflow during implementation.

## Verification commands

Targeted commands are defined in the implementation plan. Before the PR is considered ready, run:

```bash
bun run check
bun run lint
bun run test
```

Every Vitest case must execute at least one `expect` because `expect.requireAssertions` is enabled.
