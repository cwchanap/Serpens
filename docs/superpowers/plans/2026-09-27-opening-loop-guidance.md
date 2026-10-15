# HPA-284 Opening-Loop Guidance — Implementation Plan

> Implement this plan in the same HPA-284 PR. Do not split planning, First Profit copy, sandbox guidance, route integration, localization, or tests into separate PRs.

**Goal:** Teach the read-result → identify-problem → change-one-thing → inspect-next-result loop by pointing at existing Serpens evidence and controls.

**Architecture:** Add one pure hint selector plus one pure sandbox-eligibility helper, one compact presentation component, and route-local sandbox dismissal. Reuse `collectGameAlerts`, the existing alert navigation handler, HPA-293 stock recovery, HPA-282 `DailyResultSummary`, and existing scenario evaluation. No new tutorial state machine, save data, scenario schema, analytics framework, art, or SFX.

**Tech:** TypeScript, Svelte 5 / SvelteKit, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-27-opening-loop-guidance-design.md`

## Global constraints

- One ticket / one PR.
- HPA-284 is the only scope of this PR.
- First Profit seed, setup, command/content permissions, objectives, failures, scoring, medals, and terminal behavior stay unchanged.
- Other scenarios stay unchanged.
- Objective progress is read from the existing `ScenarioRun` evaluation.
- Alerts remain derived by `collectGameAlerts`.
- Hint selection and click-time alert resolution use the same current route `alerts` derivation.
- Stock navigation reuses `resolveStockAlertDestination` through the existing alert handler.
- Completed-day explanation remains `DailyResultSummary` on Dashboard.
- Guidance navigates only; it never mutates gameplay.
- Sandbox dismissal is presentation-only and never persisted.
- No new alert priority/severity model.
- No new global store/controller field for coaching.
- No save schema or migration.
- No new art or SFX.
- Use EN / JA / zh-Hant localization and existing locale parity coverage.
- Keep browser coverage focused; do not create a second simulation harness.

## Delivery shape

```text
GameState + current route alerts
        |
        +--> isSandboxOpeningGuidanceEligible (pure eligibility only)
        |
        v
selectOpeningGuidance (pure)
        |
        v
OpeningGuidance (presentation only)
        |
        +--> same current alerts[] lookup --> existing handleSelectAlert
        |                                      --> Finance or exact stock-recovery destination
        |
        +--> openManagementPanel('dashboard') --> existing DailyResultSummary
```

Scenario-mode eligibility and the dismissal boolean stay in `src/routes/+page.svelte`. The sandbox eligibility truth table lives in the pure helper so it can be unit-tested without mounting the page.

---

## Task 1 — Add the pure bounded hint selector and sandbox eligibility helper

**Create**

- `src/lib/game/openingGuidance.ts`
- `src/lib/game/openingGuidance.spec.ts`

### 1.1 Define the smallest closed contract

Use a discriminated union with four hint kinds:

- `cash-risk`;
- `stock-recovery`;
- `first-result`;
- `result-evidence`.

Use only two action shapes:

- alert action carrying `alertId`;
- Dashboard action.

Do not include localized strings, callbacks, route state, or `GameState` mutations.

The selector accepts the current `GameState` and current readonly `GameAlert[]`.

Also export:

```ts
export function isSandboxOpeningGuidanceEligible(
  game: GameState | null,
  dismissed: boolean
): boolean;
```

This helper owns only the pure sandbox rule:

- game exists;
- exactly one store;
- `reports.length <= 7`;
- not dismissed.

Play mode remains route state and is intentionally not part of this helper.

### 1.2 Lock deterministic precedence and eligibility with tests first

Add controlled unit cases proving:

1. finance risk outranks store stock;
2. store stock outranks report guidance;
3. zero reports selects `first-result`;
4. one or more reports selects `result-evidence`;
5. missing/unsupported input returns null;
6. multiple finance alerts preserve their existing array order;
7. selector does not mutate alerts or `GameState`;
8. sandbox one store + 0 reports + not dismissed is eligible;
9. sandbox one store + 7 reports + not dismissed is eligible;
10. sandbox one store + 8 reports is ineligible;
11. sandbox two stores is ineligible;
12. dismissed sandbox is ineligible;
13. null game is ineligible.

The finance-risk allowlist is exactly:

- `missedLoanPayment`;
- `upcomingLoanPayment`;
- `covenantRisk`;
- `lowCashRunway`.

Do not sort them again. `collectGameAlerts` already gives stable deterministic order.

### 1.3 Implement as straight-line logic

Selector pseudo-shape:

- find first matching finance alert;
- else find first `store-stock` alert;
- else inspect `reports.length`;
- return one hint.

Eligibility helper pseudo-shape:

- return `game !== null && !dismissed && game.stores.length === 1 && game.reports.length <= 7`.

No registry, rules engine, or second module.

Run:

```bash
bun run test:unit -- --run src/lib/game/openingGuidance.spec.ts
```

---

## Task 2 — Add compact guidance UI and truthful copy

**Create**

- `src/lib/components/game/OpeningGuidance.svelte`
- `src/lib/components/game/OpeningGuidance.svelte.spec.ts`

**Modify**

- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- existing locale tests only if a new assertion is genuinely required

### 2.1 Keep the component presentation-only

Props should contain:

- hint;
- `I18nBundle`;
- `onAction` callback;
- optional `onDismiss` callback.

The component renders one compact card with:

- heading;
- short reason;
- one action button;
- optional Dismiss button.

Do not add a checklist, progress dots, step counter, modal, popover tour, or animated coach mark.

Pin a small stable test surface:

- `opening-guidance`;
- `opening-guidance-action`;
- `opening-guidance-dismiss`.

### 2.2 Add localized hint copy

Add one `openingGuidance` namespace in all three locales for:

- heading;
- four reason strings;
- action to review the current finance warning;
- action to inspect the stock issue;
- action to open Dashboard;
- Dismiss.

Do not duplicate detailed finance, stock-recovery, or daily-result explanation text. The card only explains why the existing destination is relevant.

### 2.3 Tighten existing First Profit copy

Update the existing `scenarioDefinitions.firstProfit` summary, briefing, and strategyHint keys in EN / JA / zh-Hant.

Required content:

- cumulative income above zero;
- three consecutive positive-income reports;
- cash below zero fails;
- inspect completed results and respond to current evidence.

Do not modify `src/lib/scenarios/catalog.ts` unless a test proves a structural change is required. No scenario version bump.

### 2.4 Component tests

Cover:

- each hint kind maps to the expected concise copy/action;
- action callback fires once;
- Dismiss appears only when callback supplied;
- Dismiss callback fires once;
- buttons are normal keyboard-reachable controls;
- component never autofocuses;
- no second action appears.

Run:

```bash
bun run test:unit -- --run src/lib/components/game/OpeningGuidance.svelte.spec.ts src/lib/i18n/scenarioCopy.spec.ts
```

---

## Task 3 — Integrate route eligibility, dismissal, and existing navigation

**Modify**

- `src/routes/+page.svelte`

Do not plan new eligibility assertions in `src/routes/page.svelte.spec.ts`: that file does not mount `+page.svelte` and cannot observe a page-local `$state` boolean or `$derived` value.

### 3.1 Derive context; do not persist it

Add one route-local boolean:

```ts
sandboxOpeningGuidanceDismissed
```

Scenario eligibility remains three route-state checks:

- `playMode === 'scenario'`;
- active scenario run exists;
- scenario id is `first-profit`.

Sandbox eligibility is:

```ts
playMode === 'sandbox' &&
isSandboxOpeningGuidanceEligible(game, sandboxOpeningGuidanceDismissed)
```

Do not duplicate the one-store/report-count/dismissed conditions in the page.

### 3.2 Pin one alert derivation for selection and action resolution

Use the existing current route `alerts` derivation for both:

1. `selectOpeningGuidance(game, alerts)`;
2. click-time `alertId` lookup.

`LocalizedGameAlert` extends `GameAlert`, so the existing localized array is a valid selector input.

Do not call `collectGameAlerts` again for guidance, and do not resolve the selected id against `scenarioEvidenceGame` or another snapshot. Selection and navigation must describe the same live game.

### 3.3 Reuse the current alert action path

Add a tiny `followOpeningGuidance` helper.

For an alert action:

1. find the current alert by id in that same `alerts` array;
2. if absent, no-op;
3. call `handleSelectAlert(alert)`.

Do not copy `resolveAlertNavigation`, city switching, store selection, or product focus logic.

For Dashboard:

- `openManagementPanel('dashboard')`.

Nothing else.

### 3.4 Reset sandbox dismissal only at real session boundaries

Set `sandboxOpeningGuidanceDismissed = false` after a successful:

- `resumeAutoSave`;
- `loadManualSlot`;
- founding-store commit for a new sandbox game.

Do not reset it merely because play mode or scenario-run lifecycle changes. Entering a scenario and returning to the same sandbox must preserve that sandbox session's dismissal.

Do not reset it on:

- `advanceDay`;
- policy/product/staff changes;
- panel open/close;
- map changes;
- ordinary autosave writes.

Change the new-game founding call to await the existing `GameRouteCommitResult` only as much as needed to distinguish success from rejection. Do not move game creation into the page.

### 3.5 Mount one card in the existing game chrome

Render `OpeningGuidance` near the scenario progress block and before `ControlDesk`.

For First Profit:

- no dismiss callback.

For sandbox:

- pass the dismiss callback.

Do not hide or disable `ControlDesk`, `TopBar`, scenario objectives, or time controls.

### 3.6 Route/session behavior belongs in browser coverage

The browser tests own the page-local wiring that cannot be reached through `page.svelte.spec.ts`:

- alert action reaches the existing handler/destination;
- Dashboard action opens Dashboard;
- dismissal survives panel navigation and day advancement;
- successful load/new-game resets dismissal;
- failed load/new-game does not reset dismissal where the existing harness can make that case deterministic;
- entering a scenario and returning to the same sandbox preserves dismissal;
- other scenarios never render First Profit guidance.

The pure helper owns the one-store / 0–7 reports / expansion / dismissed eligibility truth table.

Run:

```bash
bun run check
```

---

## Task 4 — Browser proof and regression gates

**Modify**

- `src/routes/retail-sim.e2e.ts`
- `src/routes/time-flow.e2e.ts` only where its existing scenario/time helpers make the test smaller

### 4.1 First Profit focused journey with a named finance trigger

Extend the existing First Profit browser coverage rather than adding another scenario harness.

The test should prove:

1. the briefing/status exposes the real income/streak/cash condition;
2. opening guidance is visible and non-blocking;
3. after the first completed day, the hint opens Dashboard;
4. the dated `DailyResultSummary` is visible;
5. advance through four completed days so the current game reaches Day 5 without altering the founding loan schedule;
6. assert `upcomingLoanPayment` for the Founding loan due on Day 8 is now the selected `cash-risk` hint;
7. follow it and assert the existing Finance panel opens with the Founding loan destination focused/visible;
8. change one already-permitted setting;
9. inspect a later completed result.

Why Day 5 is deterministic:

- First Profit starts on Day 1 with founding debt;
- `LOAN_PAYMENT_FREQUENCY_DAYS` is 7, so the first payment is Day 8;
- `collectGameAlerts` emits `upcomingLoanPayment` when the payment is between `game.day` and `game.day + 3`;
- therefore Day 5 enters the existing upcoming-payment window;
- finance risk outranks any simultaneous store-stock hint.

Do not assert that the hinted setting change guarantees profit. Assert navigation and evidence only.

### 4.2 Sandbox smoke

Using an existing deterministic sandbox setup, prove:

- opening guidance appears within the one-store/first-seven-report window;
- Dismiss removes it;
- opening/closing panels and advancing a day do not bring it back;
- the usual controls remain usable;
- loading/starting a different game session makes it eligible again when the new state qualifies.

Keep this case short; the eligibility matrix already belongs to `openingGuidance.spec.ts`.

### 4.3 Accessibility / layout

Reuse existing narrow-screen and keyboard conventions.

Verify:

- no autofocus or focus stealing;
- action and Dismiss are keyboard reachable;
- no card overlay intercepts map/control interactions;
- copy wraps at the existing narrow viewport breakpoint.

No bespoke focus manager is required.

### 4.4 Scenario regression

Run the existing scenario catalog/evaluator/golden/solvability coverage. Do not update expected economic outputs because HPA-284 has no simulation changes.

---

## Final verification

Run:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test
bun run build
```

If the full `bun run test` already includes the unit + affected Playwright suite in this repository, do not duplicate CI-only work locally beyond what is useful for diagnosis.

## Definition of done

HPA-284 is complete when:

- First Profit states its actual objectives/failure clearly;
- exactly one deterministic contextual hint is shown when applicable;
- finance hints reuse the existing Finance alert destination;
- stock hints preserve the exact HPA-293 city/store/product context;
- result hints reuse HPA-282 Dashboard evidence;
- sandbox guidance is derived, optional, and session-only;
- sandbox eligibility is directly unit-tested without mounting the page;
- hint selection and click-time alert resolution use one current alert source;
- the Day-5 founding-loan warning proves the finance path in browser coverage;
- guidance never mutates gameplay or time;
- other scenarios are unchanged;
- the same First Profit action sequence still yields the same simulation outcome;
- EN / JA / zh-Hant copy is complete;
- focused browser proof and full repository gates pass.

No second PR is needed for implementation.
