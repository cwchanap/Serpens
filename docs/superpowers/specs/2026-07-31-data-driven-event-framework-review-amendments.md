# HPA-278 Design Review Amendments

**Date:** 2026-07-31

**Linear:** [HPA-278](https://linear.app/cwchanap/issue/HPA-278/data-driven-event-framework-with-timed-modifiers)

**Pull request:** [#28](https://github.com/cwchanap/Serpens/pull/28)

**Amends:** `docs/superpowers/specs/2026-07-30-data-driven-event-framework-timed-modifiers-design.md`

**Status:** Approved normative clarifications from both written-spec review passes; ready for implementation-plan review

This document resolves the first and second written-spec reviews on PR #28. It is authoritative
wherever it narrows, corrects, or clarifies the original design. The implementation plan must read
this document together with the original design spec. The original design header's earlier
"awaiting written-spec review" status is superseded by this status.

## 1. Daily terminology and generated-day semantics

The original spec used `D` for both a closing day and an event's first visible day. Implementations
must instead use the following explicit terms:

```ts
const closingDay = game.day;
const selectionDay = closingDay + 1;
```

`simulateDay` closes `closingDay`, advances the state to `selectionDay`, consumes the event draw
budget, and then selects an event for the already-advanced state.

A newly materialized event therefore always has:

```ts
generatedOnDay = selectionDay;
expiresOnDay = generatedOnDay + expiresAfterDays;
eligibleOnDay = generatedOnDay + cooldownDays;
```

An event generated after `closingDay` is closed is first visible while
`game.day === selectionDay`. The selector must never stamp `generatedOnDay` with `closingDay`.

Expiry parity uses the event's first visible day as its origin:

| Event | First visible day | Valid through | Earliest reroll when left unresolved |
| --- | ---: | ---: | ---: |
| Cash pressure | `D` | `D + 2` | `D + 3` |
| Expansion opportunity | `D` | `D + 3` | `D + 4` |
| Supplier terms | `D` | `D + 2` | `D + 3` |

Section 11 separately defines early-resolution recurrence and supersedes the original catalog
cooldown values. Parity tests must assert the stored `generatedOnDay`, early-resolution recurrence,
and unresolved-expiry recurrence.

## 2. Stock adjustment is not a stock-health metric delta

`store-stock-adjust-by-target-percent` intentionally replaces the overloaded old
`DecisionOption.effects.stockHealth` name.

Its `percent` is applied to each product's `targetStock`:

```ts
nextStock = Math.max(
	0,
	product.stock + Math.round(product.targetStock * percent * 0.01)
);
```

After product stock changes, the store's derived `stockHealth` metric is recalculated with
`calculateStockHealth`.

Implementers must not translate the effect into `store.stockHealth += percent`. The effect changes
inventory quantities; `stockHealth` remains a derived `0..100` summary.

## 3. Multiplicative scenario composition is parity-safe

Current scenario validation rejects overlapping import-cost targets within the same scope:

- `src/lib/scenarios/validation/commands.ts#trackModifierTargetOverlap` rejects an `all` target
  combined with any prior same-scope target and rejects duplicate IDs across same-scope `ids`
  targets.
- `src/lib/scenarios/validation.spec.ts` covers this with
  `rejects overlapping import-cost-multiplier targets within the same scope`.

Consequently, a valid current scenario contributes at most one matching scenario multiplier for a
given scope and target ID. For scenario-only rules, first-match and multiplication are equivalent
by construction. Multiplication becomes observable only when a scenario rule overlaps an event
modifier or multiple event modifiers overlap.

Scenario regression tests remain required, but they verify this validation/compilation invariant
rather than discover accidental first-match dependencies.

## 4. Follow-up materialization resets the cooldown clock

A due follow-up bypasses ordinary cooldown eligibility so an explicitly authored chain cannot be
blocked by the referenced event's previous generation.

When the follow-up successfully materializes, it is a new generation and writes or replaces the
cooldown for its own `eventId` and resolved target:

```ts
cooldown.generatedOnDay = selectionDay;
cooldown.eligibleOnDay = selectionDay + definition.cooldownDays;
```

This reset is intentional. Every successfully materialized instance, whether selected normally or
as a due follow-up, becomes the newest cooldown anchor for that event and target.

These cases do not change cooldown state:

- the same event/target is already pending and the follow-up remains scheduled;
- the referenced definition is missing;
- an inherited target is missing;
- a reselected follow-up has no valid target.

A chain that returns to the same event deliberately pushes that event's next ordinary eligibility
out from the follow-up's generated day.

## 5. Material target enumeration uses the registered material catalog

For `EventTargetSelector.kind === 'material'`, supported material IDs means every registered key in
`MATERIALS`:

```ts
Object.keys(MATERIALS).sort(compareStrings)
```

Enumeration is independent of production buildings, live local sources, warehouse inventory,
opened cities, recipes, and current capacity. A material target exists while its ID remains a
registered `MATERIALS` key.

A future event that needs locally produced, stocked, imported, or otherwise state-qualified
materials must introduce an explicit typed selector/filter rather than changing the base selector.

## 6. Finance availability parity depends on migrated option shapes

The ordered effect model evaluates `finance-borrow` against tentative state at that effect's
position. Current code checks finance availability before non-finance effects.

The migrated event families remain observationally identical because neither finance option has a
cash-increasing or other credit-affecting effect before borrowing:

- `cash-pressure.short-loan` borrows before score adjustments;
- `supplier-terms.negotiate-credit` borrows before its score adjustment.

Parity tests must lock this exact materialized effect order. Future events may intentionally use
tentative-state ordering, but availability dry runs and real resolution must share the same ordered
preparation path.

## 7. The alert target is the existing Decisions management panel

The existing management surface is the `decisions` management-panel branch in
`src/routes/+page.svelte`. It currently renders `DecisionQueue.svelte`.

HPA-278 adds `ActiveModifiers.svelte` as a sibling within that same branch. It does not introduce a
new panel ID or turn `DecisionQueue.svelte` into a panel.

Important modifier alerts use:

```ts
managementPanelId: 'decisions'
```

Section 12 defines the required type, routing, ordering, and interaction tests.

## 8. Event and system option copy differ deliberately

`SystemDecisionOption` retains inline `label` and `description` because system notices are owned by
command transitions, preserve existing fallback copy, and continue through context/family
localization.

`EventDecisionOption` persists no inline label or description. Event option copy is resolved from:

```text
persisted event copy key + option ID + structured parameters
```

Both variants are converted to display-only localized presentation models before rendering. Those
models never carry gameplay effects, modifier templates, or follow-up payloads.

## 9. Strict v11-to-v12 migration follows the pre-release save policy

The repository's `CLAUDE.md`/`AGENTS.md` policy states that the game has not shipped and
in-development autosaves are not open-ended legacy formats requiring best-effort preservation.

Migration therefore supports known v11 shapes and rejects unknown or semantically unsafe shapes:

- missing, duplicate, or unknown options in a known strategic family are corrupt;
- non-empty effect objects on unknown system notices are corrupt;
- unsupported effect payloads are not silently discarded or converted to acknowledgements.

This prevents migration from silently dropping gameplay effects.

## 10. Event family identity and decision instance identity are separate

For event decisions, `DecisionItem.id` is the materialized instance identity and `eventId` is the
stable family identity:

```text
id: event-instance-17
eventId: supplier-terms
```

The following rules are normative:

- `resolveDecision`, route commands, and scenario commands always receive the current
  `DecisionItem.id` instance ID.
- Family lookup, pending checks, cooldowns, and authored references use `eventId` plus canonical
  target key where applicable.
- No runtime call site may resolve an event with a stable family ID such as `supplier-terms`.
- v11 migration assigns each pending strategic decision a new instance ID. Its old family ID is not
  accepted as a post-migration `decisionId` alias.
- Existing system-notice IDs remain unchanged.
- Decision alerts retain `id: decision:<decision.id>` and `decisionId: decision.id`; an event alert
  therefore uses an instance-derived ID such as `decision:event-instance-17`.

Scenario calibration and replay fixtures must locate a family with a predicate such as:

```ts
const decision = game.decisions.find(
	(candidate) => candidate.kind === 'event' && candidate.eventId === 'supplier-terms'
);
```

They then resolve with `decision.id`. Static command sequences must not hard-code an event family as
a `decisionId`.

The original migration statement that no persisted v11 field outside `game.decisions` requires a
cross-object rewrite remains limited to persisted v11 game data. Source code, calibration helpers,
tests, and any command-log fixtures still require the identity update.

## 11. Migrated events preserve early-resolution recurrence

The original `cooldownDays` values of `3`, `4`, and `3` preserved only the path where a decision was
left unresolved until expiry. They incorrectly introduced a cooling-off period after early
resolution.

Current main can regenerate any of the three families on the next visible day after it is resolved,
provided eligibility and weighted cadence pass. The migrated definitions therefore use:

```text
cash-pressure.cooldownDays = 1
expansion-opportunity.cooldownDays = 1
supplier-terms.cooldownDays = 1
```

Cooldowns still begin at generation. Pending-instance exclusion, not a long cooldown, preserves the
existing unresolved lifecycle:

| Event | Resolved on first visible day `D` | Left unresolved |
| --- | ---: | ---: |
| Cash pressure | may regenerate `D + 1` | may regenerate after removal on `D + 3` |
| Expansion opportunity | may regenerate `D + 1` | may regenerate after removal on `D + 4` |
| Supplier terms | may regenerate `D + 1` when cadence passes | may regenerate after removal on `D + 3` when cadence passes |

This choice preserves current gameplay rather than adding a new hardship-pacing silence. Future
definitions may author longer cooldowns deliberately.

## 12. Modifier-alert type, routing, and ordering

`GameAlert.managementPanelId` widens from `'finance'` to:

```ts
managementPanelId?: 'finance' | 'decisions';
```

`GameAlertKind` gains `event-modifier`. `handleSelectAlert` must open the panel named by
`managementPanelId`; finance alerts additionally set `focusedFinanceLoanId`. The existing
`kind === 'decision'` fallback continues to open Decisions for compatibility.

Important modifier alerts use:

```ts
{
	id: `event-modifier:${modifier.id}`,
	kind: 'event-modifier',
	managementPanelId: 'decisions'
}
```

Alert group order is stable and preserves existing relative ordering:

1. store-stock alerts in existing store order;
2. pending decision alerts in queue order;
3. important event-modifier alerts ordered by `expiresOnDay`, then modifier ID;
4. factory-blocked alerts in existing building order;
5. finance alerts in their existing internal order.

Component and Playwright coverage must click an event-modifier alert, assert the Decisions panel is
open, and assert the matching Active Modifiers entry is visible.

## 13. Follow-up due predicate and overdue ordering

A scheduled follow-up is due when:

```ts
followUp.dueOnDay <= selectionDay
```

All due entries, including overdue entries, are processed in stable order by:

1. `dueOnDay`;
2. `sourceInstanceId`;
3. `eventId`.

At most one valid follow-up materializes on a selection day. Later due entries remain scheduled.
An entry blocked only by a matching pending instance also remains scheduled. Invalid missing
references are removed with their documented history entry while scanning.

A follow-up scheduled during resolution on player day `D` with `delayDays: 1` has
`dueOnDay = D + 1`; it is due during the close of day `D`, when the state advances and selects for
`selectionDay = D + 1`.

## 14. Availability and localization do not share gameplay payloads

The availability API reads the persisted decision and option ID:

```ts
getDecisionOptionAvailability(game, decision, optionId)
```

It never receives a localized option or presentation model. `localizeDecision` returns display-only
copy and identifiers; it does not expose finance effects, immediate effects, modifiers, or
follow-ups.

`DecisionQueue.svelte` continues to receive full `DecisionItem[]` and `game`. For each displayed
option it calls availability with the original decision and the displayed option ID, for example:

```ts
getDecisionOptionAvailability(game, decision, localizedOption.id)
```

The localized option supplies only copy and the stable option ID. This prevents UI presentation
models from becoming a second gameplay-data source.

## 15. Route and scenario failure semantics are atomic and explicit

`DecisionResolutionResult.ok === false` never counts as a successful command.

For sandbox play:

- the route controller returns a dedicated `decision-rejected` commit result carrying the decision
  failure code/context and optional finance failure;
- it does not assign state, autosave, or play the success sound;
- `changed` is false by construction.

For scenario play:

- `executeScenarioCommand` maps the failure to `ok: false`, `code: 'invalid-command'`, with a
  structured `decisionFailure` payload;
- the scenario command is not persisted or treated as a successful transition;
- the run, evaluation, result, revision, and game remain unchanged;
- no terminal or ordinary scenario persist occurs.

`GameRouteCommitResult` gains a dedicated decision-rejection variant rather than overloading the
finance-only `domain-rejected` variant:

```ts
{
	status: 'decision-rejected';
	code: DecisionResolutionFailureCode;
	context: Record<string, string | number>;
	financeFailure?: FinanceFailureCode;
}
```

The route adapter and scenario adapter are one Stage 3 deliverable with focused unchanged-state,
no-autosave/no-persist, and no-success-sound tests.

## 16. Weighted selection edge cases

The fixed three draws are consumed before any winner branch. Exactly one of follow-up, forced,
weighted, or no event is selected.

- If a follow-up or forced event wins, no weighted event is evaluated or materialized that day.
- If cadence passes but the eligible weighted pool is empty, draws two and three remain consumed
  and no event materializes.
- If the weighted pool is empty, `totalWeight` is zero and selection returns no weighted event; it
  never divides or indexes an empty array.
- A validated non-empty weighted pool has positive total weight because every definition weight is
  positive. The runtime guard still treats `totalWeight <= 0` as no selection.
- No branch may materialize a second event after a winner has been chosen.

Golden RNG tests cover follow-up-win, forced-win, cadence-pass/empty-pool, cadence-fail, and
no-candidate paths and assert the same three-draw advancement.

## 17. Additional lifecycle and implementation-plan constraints

### Cooldown pruning

A cooldown record may be pruned before selection only when:

```ts
record.eligibleOnDay <= selectionDay
```

At equality it no longer blocks selection. Records with a future `eligibleOnDay` remain
authoritative. History is evidence only and never substitutes for an unexpired cooldown record.

### Finance validation

The catalog validator continues to reject more than one `finance-borrow` effect in one option even
though cash adjustments may appear before or after the single finance effect.

### Unused store-reputation handler

`store-reputation-adjust` is removed from the initial v1 effect union because no migrated event or
timed-lifecycle fixture uses it. A later feature adds the typed handler together with its first real
production definition and tests. This keeps the initial union consistent with the design's YAGNI
rule.

### Same-day modifier start and copy

A modifier resolved during player actions on day `D` is active when day `D` closes. Short-duration
copy and Active Modifiers status must make the immediate start clear; remaining duration includes
the current day.

### Expiry history timestamp

When decision cleanup runs after advancing to `selectionDay`, an unresolved event that expired on
the just-closed day writes its history entry with `day: closingDay`, never `selectionDay`.

### Test-only catalog isolation

The Playwright fixture catalog is imported only by Node-side test support and is absent from the
production module graph. `eventCatalog.spec.ts` asserts the production catalog's exact event-ID
allowlist:

```ts
['cash-pressure', 'expansion-opportunity', 'supplier-terms']
```

The fixture event ID must not appear in that list or in the production bundle entry graph.

### Svelte workflow

Every implementation-plan stage that changes `DecisionQueue.svelte`, `ActiveModifiers.svelte`,
`ReportsPanel.svelte`, or `+page.svelte` includes the repository's required Svelte documentation
lookup and autofixer loop.

## Amended acceptance criteria

The original acceptance criteria remain in force except where explicitly superseded above. Add:

- `generatedOnDay` equals post-advance `selectionDay`, never `closingDay`.
- Event resolution always uses instance `DecisionItem.id`; family identity exists only in
  `eventId` and target identity.
- Scenario calibration locates event families by `eventId` and resolves the current instance ID.
- Migrated events use one-day generation cooldowns, preserving next-day recurrence after early
  resolution and existing recurrence after unresolved expiry.
- Inventory percentage effects change product stock and recalculate, rather than directly adjust,
  derived `stockHealth`.
- Existing valid scenario definitions contain no overlapping same-scope import-cost targets, making
  scenario-only first-match and multiplication equivalent by construction.
- A successfully materialized follow-up becomes the new cooldown anchor for its event and target.
- A follow-up is due when `dueOnDay <= selectionDay`; overdue entries use stable oldest-first order.
- The base material selector enumerates every registered `MATERIALS` entry in lexical ID order.
- Finance parity tests lock the current finance-effect ordering.
- Availability reads persisted decisions and IDs, never localized gameplay payloads.
- Failed decision resolution leaves sandbox/scenario state and persistence unchanged and returns the
  specified typed adapter failure.
- `GameAlert.managementPanelId` supports `decisions`; clicking an event-modifier alert opens
  Decisions and shows Active Modifiers.
- Empty weighted pools and prior-winner branches still consume exactly three RNG draws and never
  double-materialize.
- Cooldown pruning never removes a record whose eligibility day is still in the future.
- Modifier resolution on day `D` applies during the close of day `D`; unresolved-expiry history is
  stamped with `closingDay`.
- The production catalog allowlist excludes test-only lifecycle definitions.
- Event copy remains key-driven while system fallback copy remains inline.
- Migration rejects unsafe unknown v11 effects under the documented pre-release save policy.
