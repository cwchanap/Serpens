# HPA-284 Opening-Loop Guidance — Implementation Plan

> Implement this plan in the same HPA-284 PR. Do not split planning, First Profit copy, sandbox guidance, route integration, localization, or tests into separate PRs.

**Goal:** Teach the read-result → identify-problem → change-one-thing → inspect-next-result loop by pointing at existing Serpens evidence and controls.

**Architecture:** Add one pure hint selector, one compact presentation component, and route-local sandbox dismissal. Reuse collectGameAlerts, the existing alert navigation handler, HPA-293 stock recovery, HPA-282 DailyResultSummary, and existing scenario evaluation. No new tutorial state machine, save data, scenario schema, analytics framework, art, or SFX.

**Tech:** TypeScript, Svelte 5 / SvelteKit, Vitest, Playwright, Bun.

**Spec:** docs/superpowers/specs/2026-09-27-opening-loop-guidance-design.md

## Global constraints

- One ticket / one PR.
- HPA-284 is the only scope of this PR.
- First Profit seed, setup, command/content permissions, objectives, failures, scoring, medals, and terminal behavior stay unchanged.
- Other scenarios stay unchanged.
- Objective progress is read from the existing ScenarioRun evaluation.
- Alerts remain derived by collectGameAlerts.
- Stock navigation reuses resolveStockAlertDestination through the existing alert handler.
- Completed-day explanation remains DailyResultSummary on Dashboard.
- Guidance navigates only; it never mutates gameplay.
- Sandbox dismissal is presentation-only and never persisted.
- No new alert priority/severity model.
- No new global store/controller field for coaching.
- No save schema or migration.
- No new art or SFX.
- Use EN / JA / zh-Hant localization and existing locale parity coverage.
- Keep browser coverage focused; do not create a second simulation harness.

## Delivery shape

The implementation should remain:

GameState + current GameAlert[]
        |
        v
selectOpeningGuidance (pure)
        |
        v
OpeningGuidance (presentation only)
        |
        +--> existing handleSelectAlert --> Finance or exact stock-recovery destination
        |
        +--> openManagementPanel('dashboard') --> existing DailyResultSummary

Eligibility and dismissal stay in src/routes/+page.svelte.

---

## Task 1 — Add the pure bounded hint selector

**Create**

- src/lib/game/openingGuidance.ts
- src/lib/game/openingGuidance.spec.ts

### 1.1 Define the smallest closed contract

Use a discriminated union with four hint kinds:

- cash-risk;
- stock-recovery;
- first-result;
- result-evidence.

Use only two action shapes:

- alert action carrying alertId;
- Dashboard action.

Do not include localized strings, callbacks, route state, or GameState mutations.

The selector should accept the current GameState and current readonly GameAlert array. Eligibility by play mode/scenario and sandbox dismissal remains outside this pure function.

### 1.2 Lock deterministic precedence with tests first

Add controlled unit cases proving:

1. finance risk outranks store stock;
2. store stock outranks report guidance;
3. zero reports selects first-result;
4. one or more reports selects result-evidence;
5. missing/unsupported input returns null;
6. multiple finance alerts preserve their existing array order;
7. selector does not mutate alerts or GameState.

The finance-risk allowlist is exactly:

- missedLoanPayment;
- upcomingLoanPayment;
- covenantRisk;
- lowCashRunway.

Do not sort them again. collectGameAlerts already gives stable deterministic order.

### 1.3 Implement the selector

Implementation should be a straight-line filter/find sequence, not a registry or rules engine.

Pseudo-shape:

- find first matching finance alert;
- else find first store-stock alert;
- else inspect reports.length;
- return one hint.

No configuration tables beyond the small closed finance-kind set are needed.

Run:

bun run test:unit -- --run src/lib/game/openingGuidance.spec.ts

---

## Task 2 — Add compact guidance UI and truthful copy

**Create**

- src/lib/components/game/OpeningGuidance.svelte
- src/lib/components/game/OpeningGuidance.svelte.spec.ts

**Modify**

- src/lib/i18n/messages/en.ts
- src/lib/i18n/messages/ja.ts
- src/lib/i18n/messages/zh-Hant.ts
- existing locale tests only if a new assertion is genuinely required

### 2.1 Keep the component presentation-only

Props should contain:

- hint kind;
- reason label/text from the route/i18n boundary or enough data to localize it locally;
- onAction callback;
- optional onDismiss callback.

Prefer passing the hint and i18n bundle, matching existing game components, so the component owns copy selection but not game logic.

The component renders one compact card with:

- heading;
- short reason;
- one action button;
- optional Dismiss button.

Do not add a checklist, progress dots, step counter, modal, popover tour, or animated coach mark.

Pin a small stable test surface such as:

- opening-guidance
- opening-guidance-action
- opening-guidance-dismiss

### 2.2 Add localized hint copy

Add one openingGuidance namespace in all three locales for:

- heading;
- four reason strings;
- action to review Finance/current alert;
- action to inspect stock issue;
- action to open Dashboard;
- Dismiss.

The cash/stock action label may stay generic enough that navigation authority remains in the route.

Do not duplicate the detailed finance, stock recovery, or daily-result explanation text. The card only explains why the destination is relevant.

### 2.3 Tighten existing First Profit copy

Update the existing scenarioDefinitions.firstProfit summary, briefing, and strategyHint keys in EN / JA / zh-Hant.

Required content:

- cumulative income above zero;
- three consecutive positive-income reports;
- cash below zero fails;
- inspect completed results and respond to current evidence.

Do not modify src/lib/scenarios/catalog.ts unless a test proves a structural change is required. No scenario version bump.

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

bun run test:unit -- --run src/lib/components/game/OpeningGuidance.svelte.spec.ts src/lib/i18n/scenarioCopy.spec.ts

---

## Task 3 — Integrate eligibility, dismissal, and existing navigation in the route

**Modify**

- src/routes/+page.svelte
- src/routes/page.svelte.spec.ts or the nearest existing route-focused unit spec

### 3.1 Derive context; do not persist it

Add one route-local boolean:

sandboxOpeningGuidanceDismissed

Derive scenario eligibility as:

- playMode === scenario;
- activeScenarioRun exists;
- activeScenarioRun.definition.scenarioId === first-profit.

Derive sandbox eligibility as:

- playMode === sandbox;
- game exists;
- game.stores.length === 1;
- game.reports.length <= 7;
- dismissal is false.

Only when either context is eligible should the route call/select a hint.

Do not add an eligibility field to GameState or ScenarioDefinition.

### 3.2 Reuse the current alert action path

Add a tiny followOpeningGuidance helper.

For an alert action:

1. find the current alert by id in the current derived alerts;
2. if absent, no-op;
3. call handleSelectAlert(alert).

Do not copy resolveAlertNavigation, city switching, store selection, or product focus logic.

For Dashboard:

- openManagementPanel('dashboard').

Nothing else.

### 3.3 Reset sandbox dismissal only at real session boundaries

Set sandboxOpeningGuidanceDismissed = false after a successful:

- resumeAutoSave;
- loadManualSlot;
- founding-store commit for a new sandbox game.

Do not reset it merely because play mode or scenario-run lifecycle changes. Entering a scenario and returning to the same sandbox must preserve that sandbox session's dismissal.

Do not reset it on:

- advanceDay;
- policy/product/staff changes;
- panel open/close;
- map changes;
- ordinary autosave writes.

Change the new-game founding route call to await the existing GameRouteCommitResult only as much as needed to distinguish success from rejection. Do not move game creation into the page.

### 3.4 Mount one card in the existing game chrome

Render OpeningGuidance near the scenario progress block and before ControlDesk.

For First Profit:

- no dismiss callback.

For sandbox:

- pass the dismiss callback.

Do not hide or disable ControlDesk, TopBar, scenario objectives, or time controls.

### 3.5 Route-focused tests

Use the smallest available route test seam. Prove:

- First Profit eligible; Import Squeeze/Local Lifeline not eligible;
- sandbox with one store and 0–7 reports eligible;
- sandbox with 8 reports not eligible;
- sandbox with two stores not eligible;
- dismissed sandbox remains dismissed after day/game snapshot updates;
- load/new-session reset is success-only;
- alert action flows through the existing handler;
- Dashboard action opens dashboard.

Do not create a new page controller or state machine just to test dismissal.

Run focused route unit tests, then:

bun run check

---

## Task 4 — Browser proof and regression gates

**Modify**

- src/routes/retail-sim.e2e.ts
- src/routes/time-flow.e2e.ts only where its existing scenario/time helpers make the test smaller

### 4.1 First Profit focused journey

Extend the existing First Profit browser coverage rather than adding another scenario harness.

The test should prove:

1. the briefing/status exposes the real income/streak/cash condition;
2. opening guidance is visible and non-blocking;
3. after the first completed day, the hint opens Dashboard;
4. the dated DailyResultSummary is visible;
5. when a controlled stock or cash alert is present, following the hint reaches the existing exact destination;
6. one already-permitted setting can be changed;
7. a later completed result can be inspected.

Do not assert that the hinted change guarantees profit. Assert navigation and evidence only.

### 4.2 Sandbox smoke

Using an existing deterministic sandbox setup, prove:

- opening guidance appears within the one-store/first-seven-report window;
- Dismiss removes it;
- opening/closing panels and advancing a day do not bring it back;
- the usual controls remain usable;
- loading/starting a different game session makes it eligible again when the new state qualifies.

Keep this case short; detailed persistence behavior belongs in unit/route tests.

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

bun run check
bun run lint
bun run test:unit -- --run
bun run test
bun run build

If the full bun run test already includes the unit + affected Playwright suite in this repository, do not duplicate CI-only work locally beyond what is useful for diagnosis.

## Definition of done

HPA-284 is complete when:

- First Profit states its actual objectives/failure clearly;
- exactly one deterministic contextual hint is shown when applicable;
- finance hints reuse the existing Finance alert destination;
- stock hints preserve the exact HPA-293 city/store/product context;
- result hints reuse HPA-282 Dashboard evidence;
- sandbox guidance is derived, optional, and session-only;
- guidance never mutates gameplay or time;
- other scenarios are unchanged;
- the same First Profit action sequence still yields the same simulation outcome;
- EN / JA / zh-Hant copy is complete;
- focused browser proof and full repository gates pass.

No second PR is needed for implementation.
