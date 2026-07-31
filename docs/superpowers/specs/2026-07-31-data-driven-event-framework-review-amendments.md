# HPA-278 Design Review Amendments

**Date:** 2026-07-31

**Linear:** [HPA-278](https://linear.app/cwchanap/issue/HPA-278/data-driven-event-framework-with-timed-modifiers)

**Pull request:** [#28](https://github.com/cwchanap/Serpens/pull/28)

**Amends:** `docs/superpowers/specs/2026-07-30-data-driven-event-framework-timed-modifiers-design.md`

**Status:** Normative clarifications incorporated after written-spec review

This document resolves the review clarifications on PR #28. It is authoritative wherever it
narrows or clarifies the original design. The implementation plan must read this document together
with the original design spec.

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

An event generated after day `closingDay` is closed is first visible while
`game.day === selectionDay`. The selector must never stamp `generatedOnDay` with `closingDay`.

In the earliest-recurrence table from the original spec, `D` means the **first day the event is
visible to the player**, not the day whose simulation has just closed:

| Event | First visible day `D` | Valid through | Earliest current reroll | Cooldown eligibility |
| --- | ---: | ---: | ---: | ---: |
| Cash pressure | `D` | `D + 2` | `D + 3` | `D + 3` |
| Expansion opportunity | `D` | `D + 3` | `D + 4` | `D + 4` |
| Supplier terms | `D` | `D + 2` | `D + 3` | `D + 3` |

Parity tests must assert both the stored `generatedOnDay` and the first eligible recurrence day so
an implementation cannot pass expiry tests while stamping the wrong day.

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

The original risk section required scenario replay tests because `simulationRules.ts` currently
uses first-match resolution while the new resolver multiplies every match.

Current scenario validation already rejects overlapping import-cost targets within the same scope:

- `src/lib/scenarios/validation/commands.ts#trackModifierTargetOverlap` rejects an `all` target
  combined with any previous same-scope target and rejects duplicate IDs across same-scope `ids`
  targets.
- `src/lib/scenarios/validation.spec.ts` covers this with
  `rejects overlapping import-cost-multiplier targets within the same scope`.

Consequently, a valid current scenario can contribute at most one matching scenario multiplier for
a given scope and target ID. For scenario-only rules:

```text
first matching multiplier === product of all matching multipliers
```

by construction.

Multiplication becomes observable only when a scenario rule overlaps an event modifier, or when
multiple event modifiers overlap. Scenario regression tests remain required, but they verify the
validation and compilation invariant rather than discover whether current content accidentally
relied on first-match precedence.

## 4. Follow-up materialization resets the cooldown clock

A due follow-up bypasses the ordinary cooldown eligibility check so that an explicitly authored
chain cannot be blocked by the referenced event's previous generation.

When the follow-up successfully materializes, it is a new generation and therefore writes or
replaces the cooldown for its own `eventId` and resolved target:

```ts
cooldown.generatedOnDay = selectionDay;
cooldown.eligibleOnDay = selectionDay + definition.cooldownDays;
```

This reset is intentional. Every successfully materialized instance, whether selected as a normal
forced/weighted event or as a due follow-up, becomes the newest cooldown anchor for that event and
target.

The following cases do **not** change cooldown state:

- a due follow-up remains scheduled because the same event/target is already pending;
- a follow-up is skipped because its definition is missing;
- an inherited target is missing;
- a reselected follow-up has no valid target.

A follow-up referencing a different event updates only the referenced event's cooldown. A chain
that returns to the same event deliberately pushes that event's next ordinary eligibility out from
the follow-up's generated day.

## 5. Material target enumeration uses the registered material catalog

For `EventTargetSelector.kind === 'material'`, "supported material IDs" means every registered
material definition in `MATERIALS`:

```ts
Object.keys(MATERIALS).sort(compareStrings)
```

Enumeration is independent of:

- whether a production building currently exists;
- whether the material has a live local production source;
- current warehouse inventory;
- opened cities;
- current recipes or production capacity.

A material target exists when its `materialId` remains a registered key in `MATERIALS`. A future
event that needs only locally produced, stocked, imported, or otherwise state-qualified materials
must introduce an explicit typed selector/filter; it must not silently change the base material
selector's meaning.

## 6. Finance availability parity depends on the migrated option shapes

The new ordered effect model evaluates a `finance-borrow` effect against the tentative state at
that effect's position. The current implementation checks finance availability once before applying
non-finance effects.

The three migrated event families remain observationally identical because no migrated option has
a cash-increasing or other credit-affecting effect before `finance-borrow`:

- `cash-pressure.short-loan` borrows before its score adjustments;
- `supplier-terms.negotiate-credit` borrows before its score adjustment;
- no other migrated option combines borrowing with an earlier immediate effect.

The immediate-effect parity requirement is therefore contingent on these current option shapes,
not on the old and new evaluators being generally equivalent.

Parity tests must lock the exact materialized effect order for the two finance options. Future
events may intentionally use tentative-state ordering, but availability dry runs and real
resolution must continue to share the same ordered preparation path.

## 7. The alert target is the existing Decisions management panel

The existing management surface is the `decisions` management-panel branch in
`src/routes/+page.svelte`. It currently renders `DecisionQueue.svelte`.

HPA-278 adds `ActiveModifiers.svelte` as a sibling within that same `decisions` branch. It does not
turn `DecisionQueue.svelte` into a new management panel and does not introduce a separate panel ID.

Important modifier alerts use:

```ts
managementPanelId: 'decisions'
```

Following the alert opens the existing Decisions management panel, where both the decision queue
and active-modifier list are visible.

## 8. Event and system option copy differ deliberately

`SystemDecisionOption` retains inline `label` and `description` strings because system notices are
owned by command transitions, preserve their existing fallback copy, and continue through the
existing context/family localization path.

`EventDecisionOption` does not persist inline label or description strings. Event option copy is
resolved from:

```text
persisted event copy key + option ID + structured parameters
```

This keeps strategic-event copy catalog-driven, localizable, and covered by locale-completeness
tests while keeping materialized gameplay payloads stable. Both variants are converted to a
localized presentation model before `DecisionQueue.svelte` renders them.

## 9. Strict v11-to-v12 migration follows the pre-release save policy

The repository's `CLAUDE.md`/`AGENTS.md` legacy-save policy states that the game has not shipped and
in-development autosaves are not open-ended legacy formats requiring best-effort preservation.

The v11-to-v12 migration therefore supports the known v11 shapes produced by current code and
rejects unknown or semantically unsafe shapes:

- missing, duplicate, or unknown options in a known strategic family are corrupt;
- non-empty effect objects on unknown system notices are corrupt;
- unsupported effect payloads are not silently discarded or converted into acknowledgements.

This strictness prevents a migration from silently dropping gameplay effects. It is deliberate and
consistent with the repository policy, not an omission of a generic fallback migration.

## Amended acceptance criteria

The original acceptance criteria remain in force with these additions:

- `generatedOnDay` equals the post-advance `selectionDay`, never `closingDay`.
- Earliest recurrence tests use the event's first visible day as their origin.
- Inventory percentage effects change product stock and recalculate, rather than directly adjust,
  the derived `stockHealth` metric.
- Existing valid scenario definitions contain no overlapping same-scope import-cost targets, making
  scenario-only first-match and multiplication equivalent by construction.
- A successfully materialized follow-up becomes the new cooldown anchor for its event and target.
- The base material selector enumerates every registered `MATERIALS` entry in lexical ID order.
- Finance parity tests lock the current finance-effect ordering that makes the migrated options
  observationally equivalent.
- Important modifier alerts open the existing `decisions` management panel.
- Event copy remains key-driven while system option fallback copy remains inline.
- Migration rejects unsafe unknown v11 decision effects under the documented pre-release save
  policy.
