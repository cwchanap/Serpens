# Data-Driven Event Framework with Timed Modifiers Design

**Date:** 2026-07-31

**Linear:** [HPA-278](https://linear.app/cwchanap/issue/HPA-278/data-driven-event-framework-with-timed-modifiers)

**Pull request:** [#28](https://github.com/cwchanap/Serpens/pull/28)

**Status:** Approved consolidated design after three written-review passes; ready for implementation planning

> This is the sole normative HPA-278 design. Earlier review-amendment text was folded into this
> file and removed, so implementation planning must use this document only.

## Outcome

Replace the three hard-coded strategic decisions with a deterministic, data-driven event core and
ship one real timed-modifier lifecycle through production gameplay.

The completed feature must:

- define cash pressure, expansion opportunity, and supplier terms in a validated TypeScript catalog;
- preserve their current eligibility, option ordering, immediate effects, expiry behavior, and
  early-resolution recurrence;
- materialize pending choices so save/load and later catalog edits cannot alter an already-visible
  decision;
- use an isolated, persisted event RNG contract;
- resolve typed effects atomically, including real HPA-277 finance borrowing;
- make `supplier-terms.bulk-discount` activate a real three-day retail import-cost discount;
- persist, apply, replace, expire, report, localize, and display that modifier;
- keep scenario import-cost behavior unchanged while allowing scenario and event multipliers to
  compose with provenance;
- split implementation into two independently reviewable pull requests under the single HPA-278
  Linear ticket.

## Scope correction after review

The earlier draft specified follow-up chains, eight target variants, two stacking modes, generic
missing-target cancellation, and a complete modifier UI while no production event created a
modifier. That was internally consistent but violated YAGNI and produced dead shipped surfaces.

The final v1 scope is narrower:

- **Production event target:** company only.
- **Production timed effect:** retail-product import-cost multiplier only.
- **Production stacking behavior:** replace by stable stacking key only.
- **Production modifier content:** supplier terms' `bulk-discount` option.
- **Deferred:** follow-up chains, store/building/material/staff/route event targets, stack semantics,
  missing-target cancellation, and arbitrary modifier effect families.

Those deferred contracts belong in the first downstream feature that actually needs them, such as
HPA-39 or HPA-296. They are not persisted as unusable v1 shapes.

## Current baseline

The current `main` branch has:

- `events.ts` hard-coding `cash-pressure`, `expansion-opportunity`, and `supplier-terms`;
- forced cash-pressure and expansion checks followed by a supplier draw from
  `createRngFromState(game.rngState + game.day * 97)`;
- at most one newly generated strategic decision per completed day;
- stable family IDs serving as decision IDs;
- `DecisionItem` also representing synchronous command-feedback notices;
- a broad `DecisionOption.effects` object interpreted directly by `state.ts#resolveDecision`;
- `staffMorale` simultaneously changing the scorecard and every store;
- the overloaded `stockHealth` effect changing product stock by a percentage of target stock and
  then recalculating the derived metric;
- first-match `SimulationRules` import-cost resolution without provenance;
- save schema version 11;
- `alerts.ts` reading `decision.title` while event decisions in the new model use structured copy;
- a `decisions` management panel that currently renders `DecisionQueue.svelte`;
- no active timed-event content, modifier reporting, or modifier UI.

HPA-277 finance and HPA-280 scenarios are complete foundations for this work.

## Goals

- Pure, immutable, deterministic domain transitions.
- Stable pending choices across save/load and catalog revisions.
- Explicit separation between strategic events and system notices.
- Exact current immediate-effect parity for the three migrated families.
- Exact next-visible-day recurrence after early resolution.
- Fixed global event-RNG advancement with a documented extension mechanism.
- Atomic option availability and resolution through one preparation path.
- A production-used timed modifier rather than fixture-only infrastructure.
- Structured report and alert attribution for modifier effects.
- Complete English, Japanese, and Traditional Chinese localization.
- Two reviewable implementation PRs instead of one approximately thirty-file change.

## Non-goals

- Follow-up chains in v1.
- Non-company event targets in v1.
- Logistics-route state or disruption effects.
- Competitor, product-trend, equipment-maintenance, or festival simulation.
- A visual or runtime event authoring editor.
- JSON scripting, callbacks, arbitrary property paths, `eval`, or third-party plugins.
- Multiple strategic prompts per completed day.
- A new management panel or TopBar ticker.
- Rolling seven-day or thirty-day modifier aggregates.
- A generic `stack` modifier rule before production content needs it.
- A generic target-deletion cancellation lifecycle before non-company targets exist.

## Delivery structure

HPA-278 remains one Linear implementation ticket but is delivered through two pull requests.

### Implementation PR A — event core

PR A delivers:

- the system/event decision union;
- the validated production catalog;
- isolated event RNG and deterministic selection;
- instance decision IDs and family `eventId` identity;
- cooldowns and bounded event history;
- materialized options;
- atomic typed immediate effects;
- route and scenario failure adapters;
- event localization;
- save schema v12 and v11-to-v12 migration.

PR A is independently valid with the current immediate supplier-terms behavior. It does not persist
modifier state or add modifier UI.

### Implementation PR B — production timed modifier

PR B is based on PR A and delivers:

- the supplier bulk-discount production modifier;
- modifier activation, replacement, application, and expiry;
- provenance-aware multiplicative simulation rules;
- report attribution;
- important-modifier alerts;
- Active Modifiers and Reports UI;
- save schema v13 and v12-to-v13 migration;
- the complete production lifecycle e2e.

HPA-278 is complete only after both PRs merge. This split limits review size without recreating
Linear sub-issues.

## Strategic events and system notices

`DecisionItem` becomes a discriminated union.

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
}

export interface EventDecisionItem {
	kind: 'event';
	id: string;
	eventId: string;
	definitionVersion: number;
	generatedOnDay: number;
	expiresOnDay: number;
	target: { kind: 'company' };
	copy: StructuredCopyRef;
	options: EventDecisionOption[];
}

export type DecisionItem = SystemDecisionItem | EventDecisionItem;
```

System notices remain owned by placement, construction, world, and rail commands. They retain their
current IDs, context localization, expiry offsets, and acknowledgement behavior. They do not enter
event history or cooldown state.

Event decisions are catalog-generated strategic instances. Their copy is key-driven and their
options carry concrete typed gameplay payloads.

## Decision identity

Event instance identity and event-family identity are separate.

```text
id: event-instance-17
eventId: supplier-terms
```

Normative rules:

- `resolveDecision`, route commands, and scenario commands always receive `DecisionItem.id`.
- Family lookup, cooldowns, catalog references, and parity assertions use `eventId`.
- A runtime caller may not resolve an event with `cash-pressure`, `expansion-opportunity`, or
  `supplier-terms` as the `decisionId`.
- v11 migration assigns new instance IDs; old family IDs are not post-migration aliases.
- Existing system-notice IDs remain unchanged.
- Decision alert IDs remain `decision:<decision.id>`.

Scenario calibration must locate supplier terms by narrowing `kind === 'event'` and comparing
`eventId`, then resolve with the discovered instance ID. Static calibration commands may not
hard-code a family ID as a decision ID.

## Structured copy and alert-title ownership

```ts
export type StructuredCopyParams = Readonly<Record<string, string | number>>;

export interface StructuredCopyRef {
	key: string;
	params: StructuredCopyParams;
}
```

Event decisions do not persist an authoritative English title. `alerts.ts` must not read
`decision.title` without first narrowing to `kind: 'system'`.

Alert construction and localization follow this boundary:

- `alerts.ts` emits typed IDs and references, not authoritative localized event strings;
- `GameAlert.message` becomes an optional fallback for alert kinds without a typed localization
  path;
- decision alerts carry `decisionId`;
- `localizeAlert(alert, game, i18n)` finds the current decision;
- system decision titles use their existing localization/fallback path;
- event decision titles use the persisted `decision.copy` key;
- `localizeDecision` and `localizeDecisionTitle` switch on `DecisionItem.kind` before accessing
  variant fields.

Localized presentation models contain display copy and stable identifiers only. They never contain
finance effects, modifier templates, or other gameplay payloads.

## Catalog contracts

Production definitions are TypeScript data checked with `satisfies` and normalized by a
runtime/development validator.

```ts
export type EventCondition =
	| { kind: 'always' }
	| { kind: 'all'; conditions: readonly EventCondition[] }
	| { kind: 'not'; condition: EventCondition }
	| { kind: 'day-at-least'; day: number }
	| { kind: 'cash-below'; amount: number }
	| { kind: 'cash-at-least'; amount: number }
	| { kind: 'score-at-least'; score: ScoreKey; value: number }
	| { kind: 'store-count-below-cap' };

export type EventSelectionPolicy =
	| { kind: 'forced'; priority: number }
	| { kind: 'weighted'; weight: number };

export interface EventDefinition {
	id: string;
	version: number;
	selection: EventSelectionPolicy;
	condition: EventCondition;
	target: { kind: 'company' };
	expiresAfterDays: number;
	cooldownDays: number;
	copyKey: string;
	options: readonly EventOptionDefinition[];
}
```

The production catalog contains exactly these IDs:

```text
cash-pressure
expansion-opportunity
supplier-terms
```

A completeness test asserts the exact allowlist so fixture definitions cannot leak into the
production bundle.

### Bounded contradiction validation

The validator does not claim to solve arbitrary logical contradictions. It performs only explicit,
finite checks:

- `cash-below: A` with `cash-at-least: B` where `B >= A` inside one `all` tree;
- score thresholds outside `0..100`;
- a condition paired with its direct `not` equivalent;
- `not(always)`;
- unsupported effect/target combinations.

The diagnostic description must say “supported bounded contradiction checks,” not
“all self-contradictory definitions.”

## Immediate-effect model

The v1 materialized effect union contains only production-used behavior.

```ts
export type EventImmediateEffect =
	| { kind: 'cash-adjust'; amount: number }
	| { kind: 'score-adjust'; score: ScoreKey; amount: number }
	| { kind: 'all-store-morale-adjust'; amount: number }
	| { kind: 'all-store-stock-adjust-by-target-percent'; percent: number }
	| {
			kind: 'finance-borrow';
			purpose: 'emergency' | 'supplierCredit';
			amount: number;
			termDays: 28 | 56;
	  };
```

`store-reputation-adjust` is not part of v1. It is added with the first real event that needs it.

### Stock semantics

The stock effect preserves the current algorithm exactly:

```ts
nextStock = Math.max(
	0,
	product.stock + Math.round(product.targetStock * percent * 0.01)
);
```

After updating products, the store's derived `stockHealth` is recalculated with
`calculateStockHealth`. The effect never directly adds `percent` to the metric.

### Cash and finance mutual exclusion

The old type permits either cash or finance on one option, not both. V1 preserves that invariant:

- catalog validation rejects an option containing both `cash-adjust` and `finance-borrow`;
- migration never emits both on one option;
- at most one `finance-borrow` effect is allowed per option.

The ordered model still permits score and store effects after a finance effect. Relaxing cash and
finance mutual exclusion requires a later design backed by production content.

## Production catalog

### Cash pressure

```text
eventId: cash-pressure
version: 1
selection: forced priority 100
condition: cash < 0
target: company
expiresAfterDays: 2
cooldownDays: 1
```

Options preserve current order and effects:

1. `short-loan`
   - borrow the materialized emergency amount for 56 days;
   - profit `-4`;
   - market position `-1`.
2. `cut-costs`
   - cash `+5,500`;
   - customer satisfaction `-4`;
   - scorecard staff morale `-5`;
   - every store morale `-5`;
   - every product stock `-8%` of target stock.
3. `hold-course`
   - profit `+1`;
   - scorecard staff morale `-2`;
   - every store morale `-2`.

Emergency amount materialization preserves the current formula and stores the concrete result in
the pending instance. Resolution rechecks current credit without silently resizing the displayed
amount.

### Expansion opportunity

```text
eventId: expansion-opportunity
version: 1
selection: forced priority 50
condition:
  day >= 14
  cash >= 55,000
  store count < store cap
  profit >= 62
target: company
expiresAfterDays: 3
cooldownDays: 1
```

Options preserve current order and effects:

1. `prepare`: cash `-3,500`, market position `+5`, profit `-1`.
2. `pass`: profit `+1`, scorecard staff morale `+1`, every store morale `+1`.

### Supplier terms — core definition

PR A introduces version 1 with exact current immediate behavior:

```text
eventId: supplier-terms
version: 1
selection: weighted weight 1
condition: always
target: company
expiresAfterDays: 2
cooldownDays: 1
```

1. `negotiate-credit`: borrow `$4,000` for 28 days, profit `-2`.
2. `bulk-discount`: cash `-2,500`, profit `+3`, product stock `+6%` of target stock.

Supplier terms remains the only weighted event, so cadence remains 12% whenever no forced event
wins.

### Supplier terms — production modifier revision

PR B publishes supplier terms definition version 2. Immediate effects remain unchanged.
`bulk-discount` additionally activates:

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
	importance: 'important',
	explanation: { key: 'copy.events.supplierTerms.bulkDiscountModifier', params: {} }
}
```

This is an intentional additive gameplay change: choosing bulk discount reduces retail-product
import cost by 10% for the current day plus the next two closing days. Copy must state this effect
before the player resolves the option.

A pending version-1 supplier event migrated or saved before PR B remains materialized without the
modifier. New version-2 instances contain it. Catalog revisions never rewrite pending choices.

Repeated version-2 bulk discounts replace the existing modifier with the same stacking key and
restart the three-day duration. V1 does not implement generic stacking.

## Cooldowns and recurrence

Cooldowns begin at generation and are keyed by event family plus the company target.

```ts
eligibleOnDay = generatedOnDay + cooldownDays
```

All three migrated events use `cooldownDays = 1`. Pending-instance exclusion preserves unresolved
expiry timing while early resolution permits next-visible-day recurrence.

| Event | Resolved on first visible day `D` | Left unresolved |
| --- | ---: | ---: |
| Cash pressure | may regenerate `D + 1` | after removal on `D + 3` |
| Expansion opportunity | may regenerate `D + 1` | after removal on `D + 4` |
| Supplier terms | may regenerate `D + 1` if cadence passes | after removal on `D + 3` if cadence passes |

A cooldown record may be pruned before selection when `eligibleOnDay <= selectionDay`; at equality
it no longer blocks. History is evidence only and never substitutes for a future cooldown record.

## Event runtime state and RNG

### Core state in schema v12

```ts
export interface EventRuntimeStateV1 {
	selectionSchemaVersion: 1;
	rngState: number;
	nextInstanceSequence: number;
	cooldowns: EventCooldownRecord[];
	history: EventHistoryEntry[];
}
```

History is capped at 200 newest entries. It records event generation, resolution, and unresolved
expiry. Follow-up and generic target-cancellation entries do not exist in v1.

### Fixed global draw packet

Every completed day consumes exactly three draws from the persisted event RNG:

1. cadence draw;
2. weighted-event draw;
3. materialization-seed draw.

All three are consumed before branching, including forced-win, cadence-fail, cadence-pass with an
empty pool, and no-candidate paths. A winner prevents every later selection branch from
materializing another event.

The third draw is not permanently defined as “one target draw.” It is converted to a deterministic
local materialization seed. Future event versions may use a local RNG seeded from that value for
multiple target, magnitude, or variant choices without changing the global three-draw advancement.

Rules for extending randomness:

- `selectionSchemaVersion` is persisted and decoder-validated;
- changing global draw count/order requires a new selection schema version and save migration;
- adding random fields to an existing event requires a new event definition version;
- local materialization draw order is part of that definition version's contract;
- local RNG consumption never advances the persisted global event RNG.

V1 company-targeted definitions consume no local materialization draws.

### Selection order

For `selectionDay = closingDay + 1`:

1. consume the three global draws;
2. prune no-longer-blocking cooldowns;
3. evaluate forced candidates by descending priority then event ID;
4. when no forced event wins and cadence is below `0.12`, evaluate weighted candidates;
5. materialize at most one event;
6. append generation history and cooldown state.

If cadence passes but the weighted pool is empty or `totalWeight <= 0`, no event materializes. The
already-consumed draws remain consumed.

## Materialization

Selection creates a self-contained event instance:

- allocate `event-instance-<nextInstanceSequence>`;
- persist `eventId`, definition version, company target, generated day, expiry day, copy reference,
  option IDs, and concrete effects;
- in PR B, persist any concrete modifier templates inside the option;
- advance the instance sequence;
- write or replace the event cooldown;
- append generation history.

`generatedOnDay` is always the post-advance `selectionDay`, never the closing day.

```ts
expiresOnDay = generatedOnDay + expiresAfterDays
```

The catalog is not consulted to render, check, or resolve an already-materialized option.

## Availability and atomic resolution

```ts
export function getDecisionOptionAvailability(
	game: GameState,
	decision: DecisionItem,
	optionId: string
): DecisionOptionAvailability;
```

Availability reads the persisted decision and option ID. It never receives localized option
payloads. Event availability executes the same pure preparation path as resolution without
allocating IDs or mutating state.

```ts
export type DecisionResolutionFailureCode =
	| 'decision-not-found'
	| 'option-not-found'
	| 'decision-expired'
	| 'finance-unavailable'
	| 'effect-rejected';
```

Event resolution:

1. find the instance and option by IDs;
2. reject `game.day > expiresOnDay`;
3. validate every persisted payload;
4. apply immediate effects to tentative immutable state in persisted order;
5. perform finance borrowing at its effect position;
6. in PR B, prepare modifier replacement and activation;
7. only after all preparation succeeds, remove the decision and commit state/history/modifier
   changes through `refreshWorldProgress`.

Every failure returns the original state object. No partial cash, score, stock, loan, history, or
modifier change is committed.

The migrated finance options place borrowing before score effects. Availability and real
resolution share that same order.

## Route and scenario failure semantics

A failed decision resolution is not an unchanged successful command.

`GameRouteCommitResult` gains:

```ts
{
	status: 'decision-rejected';
	code: DecisionResolutionFailureCode;
	context: Record<string, string | number>;
	financeFailure?: FinanceFailureCode;
}
```

Sandbox rejection performs no state assignment, autosave, or success sound.

Scenario rejection maps to `ok: false`, `code: 'invalid-command'`, with structured decision-failure
evidence. It does not persist the command, change the run or revision, recalculate a result, or
write scenario state.

The route and scenario adapters are one PR-A deliverable with focused unchanged-state,
no-autosave/no-persist, and no-success-sound tests.

## Timed modifier state in schema v13

PR B extends event runtime state:

```ts
export interface EventRuntimeStateV2 extends EventRuntimeStateV1 {
	nextModifierSequence: number;
	activeModifiers: ActiveEventModifier[];
}
```

V1 supports only company-wide import-cost modifiers and replace semantics.

```ts
export interface ActiveEventModifier {
	id: string;
	source: Readonly<{
		eventId: string;
		instanceId: string;
		optionId: string;
	}>;
	startsOnDay: number;
	expiresOnDay: number;
	stackingKey: string;
	stackingRule: 'replace';
	effect: Readonly<{
		kind: 'import-cost-multiplier';
		scope: 'retail-product';
		target: Readonly<{ kind: 'all' }>;
		multiplier: number;
	}>;
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}

export type EventModifierSnapshot = Readonly<{
	id: string;
	source: ActiveEventModifier['source'];
	startsOnDay: number;
	expiresOnDay: number;
	stackingKey: string;
	stackingRule: 'replace';
	effect: ActiveEventModifier['effect'];
	explanation: StructuredCopyRef;
	importance: 'normal' | 'important';
}>;
```

Lifecycle records store a value copy in the dedicated readonly snapshot shape.

### Activation and replacement

A modifier resolved during player actions on day `D` uses:

```ts
startsOnDay = D
expiresOnDay = D + durationDays
```

It applies when day `D` closes. Remaining duration includes the current day.

Before appending a new modifier, remove any active modifier with the same stacking key and write a
replacement lifecycle record referencing the new modifier ID. Then append activation history.

### Active days and expiry

A modifier applies while:

```ts
startsOnDay <= closingDay && closingDay < expiresOnDay
```

After the final allowed application, a modifier with `expiresOnDay === closingDay + 1` is removed
and an expiry lifecycle record is written with `day: closingDay`.

There is no generic missing-target cancellation in v1 because every event and modifier target is
company-wide.

The decoder requires every persisted active modifier to satisfy:

```ts
startsOnDay <= game.day && game.day < expiresOnDay
```

This is safe because simulation transitions and scenario command persistence commit only complete
post-reconciliation states; no intermediate post-expiry/pre-removal state is persistable. Codec
and scenario replay tests lock that invariant.

## Simulation rules and provenance

PR B changes import-cost resolution from first-match to multiplicative contributions.

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
```

`resolveImportCostMultiplier` returns both the product and ordered contributions. The only current
call sites, `stock.ts` and `industryProduction.ts`, are updated together.

Current scenario validation already rejects overlapping same-scope import targets. Therefore valid
scenario-only first-match and multiplication are equivalent by construction. Multiplication becomes
observable only when event modifiers overlap scenario rules or replace behavior changes the active
event modifier.

Application evidence is emitted only when a matching rule contributes to a non-zero imported
quantity and non-zero pre-rule import cost. Evidence records that pre-rule cost as `baselineCost`.
Because the supplier modifier is the only active event rule for its stacking key and valid scenarios
contribute at most one overlapping rule, reports calculate the actual post-rule import cost as:

```ts
actualCost = round(baselineCost * resolvedMultiplier)
```

Evidence is returned through pure result values, never mutable callbacks.

## Normative daily ordering

For `closingDay = game.day`:

1. compile active event modifiers for `closingDay`;
2. merge them with supplied scenario rules;
3. simulate industry and retail operations while collecting rule evidence;
4. apply operating cash flow and score/store transitions;
5. service finance;
6. finalize modifier expiry after its final application;
7. write the closing-day report and lifecycle records;
8. advance to `selectionDay = closingDay + 1`;
9. remove decisions invalid on `selectionDay`;
10. stamp unresolved event expiry history with `closingDay`;
11. consume the three event RNG draws;
12. select and materialize at most one next-day event;
13. refresh world state and return.

A supplier bulk-discount modifier resolved on day `D` affects imports when day `D` closes.

## Reporting

Schema v13 adds to `DailyReport`:

```ts
export interface EventModifierImpact {
	modifierId: string;
	source: ActiveEventModifier['source'];
	effectKind: 'import-cost-multiplier';
	explanation: StructuredCopyRef;
	affectedIds: string[];
	multiplier: number;
	resolvedMultiplier: number;
	baselineCost: number;
	actualCost: number;
	applicationCount: number;
}

export interface EventModifierLifecycle {
	status: 'activated' | 'replaced' | 'expired';
	modifier: EventModifierSnapshot;
	replacedByModifierId?: string;
}
```

Impacts are ordered by modifier ID, deduplicate and sort affected IDs, sum pre-rule baseline cost,
sum actual post-rule cost, and count applications. `multiplier` is the modifier's own contribution;
`resolvedMultiplier` is the effective product including an overlapping scenario rule. The report
does not attempt to allocate a unique dollar delta among individual multiplicative sources.

`reports.ts` exposes the latest arrays without adding rolling modifier aggregates.

## Alerts and Decisions navigation

`GameAlertKind` gains `event-modifier` and `managementPanelId` becomes:

```ts
managementPanelId?: 'finance' | 'decisions';
```

Each active important modifier emits:

```ts
{
	id: `event-modifier:${modifier.id}`,
	kind: 'event-modifier',
	managementPanelId: 'decisions'
}
```

Alert ordering is stable:

1. store-stock alerts in current store order;
2. pending decision alerts in queue order;
3. important event-modifier alerts by `expiresOnDay`, then modifier ID;
4. blocked-factory alerts in current building order;
5. finance alerts in their existing internal order.

`handleSelectAlert` opens the panel named by `managementPanelId`; finance additionally focuses the
loan. The existing decision-kind fallback remains for compatibility.

Component and e2e coverage click the modifier alert, open Decisions, and find the matching active
modifier.

## UI

PR B adds `ActiveModifiers.svelte` beside `DecisionQueue.svelte` in the existing Decisions panel.
It displays:

- source event title;
- “company-wide retail imports” target copy;
- 10% discount summary;
- start day;
- exclusive expiry day;
- remaining days;
- important status.

Ordering is earliest expiry then modifier ID. The empty state is explicit.

`DecisionQueue.svelte` distinguishes system and event cards, shows event provenance, and computes
availability from the original persisted decision plus displayed option ID.

`ReportsPanel.svelte` adds latest-day modifier impacts and lifecycle sections.

All modified Svelte files require the repository's Svelte MCP workflow: inspect relevant docs first
and run the autofixer until it reports no issues.

## Localization

Production event keys are:

```text
copy.events.cashPressure
copy.events.expansionOpportunity
copy.events.supplierTerms
```

Supplier terms v2 adds modifier disclosure and lifecycle copy. Every key is present in English,
Japanese, and Traditional Chinese.

Catalog completeness iterates the exact production allowlist and checks title, context, option,
and modifier-explanation keys in every locale.

## Persistence

### PR A: schema v12

The v11-to-v12 migration:

- classifies the three strategic family IDs as event instances;
- validates their expected option IDs and old effect shapes;
- assigns monotonic instance IDs;
- derives `generatedOnDay` from known expiry offsets;
- preserves concrete emergency finance amounts and option ordering;
- maps broad effects to the v1 typed union;
- creates company cooldown records and generation history;
- classifies every other decision as a system notice;
- rejects non-empty unknown system effects under the pre-release save policy;
- initializes selection schema version 1 and isolated RNG state.

No persisted v11 object outside `game.decisions` references strategic family IDs. Source code,
calibration helpers, and test command sequences still require explicit instance-ID migration.

### PR B: schema v13

The v12-to-v13 migration initializes:

- `nextModifierSequence = 1`;
- `activeModifiers = []`;
- empty `modifierImpacts` and `modifierLifecycle` on existing reports.

It does not modify pending materialized event options. Version-1 supplier events remain without a
modifier.

### Decoder validation

Validation covers exact union shapes, unique IDs, sequence bounds, structured copy, finite numbers,
finance terms, cooldown ordering, selection schema version, history bounds, and—in v13—modifier
IDs, dates, replace rule, import effect shape, readonly snapshot data, and report attribution.

Legitimate catalog revision does not invalidate materialized pending events. Unknown persisted
runtime kinds remain corrupt.

Scenario codecs continue to decode embedded games through the shared game codec and update the
embedded game schema version after successful persistence.

## Test strategy

### PR A

- Existing eligibility and option-order parity.
- Immediate cash, score, morale, stock, and finance parity.
- Early-resolution and unresolved-expiry recurrence.
- Dedicated RNG isolation and three-draw advancement.
- Forced/weighted/no-candidate/empty-pool paths.
- Instance-ID resolution and family-ID lookup.
- Atomic failure with unchanged state.
- Route no-autosave/no-sound rejection.
- Scenario no-persist rejection.
- v11-to-v12 migration and strict validation.
- Event/system localization and alert-title narrowing.
- Scenario calibration updated to find by `eventId` and resolve by instance ID.

### PR B

- Supplier version-2 materialization contains the real modifier.
- Same-day activation and three closing-day applications.
- Replacement restarts duration and records lifecycle once.
- Exclusive expiry and strict active-state decoder invariant.
- Scenario-only parity and scenario/event multiplier product.
- Retail application evidence and report totals include pre-rule baseline cost, resolved multiplier,
  and actual post-rule cost; the industrial call-site regression remains unchanged for the
  retail-only event scope.
- v12-to-v13 migration and report preservation.
- Active Modifiers, Reports, and alert click-through component coverage.
- Production lifecycle Playwright test using the real production catalog, not a fixture catalog.
- Production module-graph/allowlist test proving no test event ships.

Every Vitest case executes at least one `expect`.

## File responsibility map

### PR A core

New focused modules:

- `eventDefinitions.ts` and spec;
- `eventCatalog.ts` and spec;
- `eventSelection.ts` and spec;
- `eventEffects.ts` and spec.

Core modifications:

- `types.ts`, `events.ts`, `state.ts`, `simulateDay.ts`;
- scenario runtime/calibration and route controller adapters;
- save types/codec/repositories and scenario codecs;
- `gameCopy.ts`, localized types, and three locale catalogs;
- `DecisionQueue.svelte` and relevant component/route tests.

### PR B modifiers

New focused modules:

- `eventModifiers.ts` and spec;
- `ActiveModifiers.svelte` and spec.

Modifier modifications:

- `eventCatalog.ts`, `types.ts`, `simulateDay.ts`, `simulationRules.ts`;
- `stock.ts`, `industryProduction.ts`, reports and alerts;
- v13 save/scenario codecs and repositories;
- modifier localization;
- `DecisionQueue.svelte`, `ReportsPanel.svelte`, `+page.svelte`;
- targeted route/component tests and `retail-sim.e2e.ts`.

## Risks and mitigations

### Supplier selection dates change

The isolated event RNG changes historical supplier-term dates.

Mitigation: preserve deterministic 12% cadence, version the selection schema, and lock golden draw
advancement.

### Bulk-discount balance changes

Supplier bulk discount gains a real 10% three-day retail import discount.

Mitigation: disclose it in option copy, isolate it to retail imports, use replace rather than stack,
and add deterministic report evidence. Balance values are explicit product decisions, not hidden
implementation tuning.

### Two save migrations

Splitting review creates v12 core and v13 modifier migrations.

Mitigation: each PR is independently valid, migrations are narrow and chained, and the game remains
pre-release. This is preferable to an unreviewably large atomic change.

### Structured alert refactor

Event decisions lack an inline title.

Mitigation: narrow decision variants, move event-title resolution to the localization layer, and
make raw alert messages optional fallbacks.

## Acceptance criteria

### Core event framework

- Production catalog contains exactly the three migrated event families.
- Current eligibility, option order, expiry, immediate effects, and early-resolution recurrence are
  preserved.
- Runtime resolution always uses instance IDs; family logic uses `eventId`.
- Every completed day advances the global event RNG by the version-1 three-draw packet.
- Future local random materialization cannot alter global draw advancement.
- Pending choices survive save/load and catalog revision unchanged.
- System notices never enter event history or cooldowns.
- Decision availability and resolution share one atomic preparation path.
- Failed route/scenario resolution commits no state or persistence.
- v11-to-v12 migration and all three locales are complete.

### Production timed modifier

- New supplier-terms version-2 bulk discounts create a real three-day 0.9 retail import multiplier.
- Repeated bulk discounts replace the prior modifier and restart duration.
- The modifier applies on resolve day, expires exclusively, and is absent on the returned expiry
  day.
- Scenario and event rules compose multiplicatively with stable provenance.
- Reports explain applied source, affected IDs, modifier multiplier, resolved multiplier, pre-rule
  baseline cost, actual post-rule cost, and lifecycle.
- Important modifier alerts open the existing Decisions panel.
- Active Modifiers and Reports surfaces are accessible and localized.
- v12-to-v13 migration preserves pending v1 supplier decisions without retrofitting modifiers.
- The production e2e exercises selection, resolution, application, replacement or expiry,
  reporting, alert navigation, and final removal through real catalog content.

## Verification

Each implementation PR defines targeted commands in its implementation plan. Before each PR is
ready for review:

```bash
bun run check
bun run lint
bun run test
```
