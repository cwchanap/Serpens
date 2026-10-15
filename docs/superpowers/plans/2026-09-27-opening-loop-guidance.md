# HPA-284 Opening-Loop Guidance — Implementation Plan

> Implement this plan in the same HPA-284 PR. Do not split planning, First Profit copy, sandbox guidance, route integration, localization, or tests into separate PRs.

**Goal:** Teach the opening read-result → notice-current-problem → follow-existing-evidence loop without adding a tutorial system.

**Architecture:** One pure selector module, one compact Svelte card, and one route-local dismissal boolean. Reuse the route's existing `alerts` derivation, `handleSelectAlert`, HPA-293 stock recovery, HPA-282 `DailyResultSummary`, and existing scenario evaluation.

**Tech:** TypeScript, Svelte 5 / SvelteKit, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-27-opening-loop-guidance-design.md`

## Global constraints

- One ticket / one PR.
- No simulation, scenario-definition, scoring, save-schema, or catalog-structure changes.
- Other scenarios stay unchanged.
- Guidance navigates only; it never mutates gameplay or time.
- Use the existing current route `alerts` array; do not call `collectGameAlerts` again in the page.
- Finance guidance only treats `missedLoanPayment` and `lowCashRunway` as `cash-risk`.
- `upcomingLoanPayment` and `covenantRisk` remain normal TopBar alerts but do not dominate opening guidance.
- Stock navigation continues through `handleSelectAlert` / `resolveStockAlertDestination`.
- Result guidance continues through Dashboard / `DailyResultSummary`.
- Sandbox dismissal is route-local and never persisted.
- No new art or SFX.
- EN / JA / zh-Hant localization with existing `translate.spec.ts` key parity.

## Important calibration fact

Do not design tests or copy around a 14-day First Profit playthrough. The existing runtime calibration pins the no-action official-seed run as completed on **Day 4**, score **862**, gold.

That means:

- the new card is only visible during the short active run;
- a Day-5 First Profit finance test is impossible;
- copy must not imply the player has to change a setting to succeed.

---

## Task 1 — Build the selector around real alerts

**Create**

- `src/lib/game/openingGuidance.ts`
- `src/lib/game/openingGuidance.spec.ts`

### 1.1 Define the closed contract

Use:

```ts
export type OpeningGuidance =
  | { kind: 'cash-risk'; alert: GameAlert }
  | { kind: 'stock-recovery'; alert: GameAlert }
  | { kind: 'first-result' }
  | { kind: 'result-evidence' };

export function selectOpeningGuidance(
  game: GameState | null,
  alerts: readonly GameAlert[]
): OpeningGuidance | null;

export function isSandboxOpeningWindow(game: GameState | null): boolean;
```

Do not add an action descriptor or alert id. The selector returns the existing `GameAlert` object for alert-backed hints.

`isSandboxOpeningWindow` owns only:

- game exists;
- exactly one store;
- `reports.length <= 7`.

Play mode and dismissal remain in the page.

### 1.2 Test precedence first

Hand-built cases:

1. `missedLoanPayment` + stock => `cash-risk`;
2. `lowCashRunway` + stock => `cash-risk`;
3. `covenantRisk` + stock => `stock-recovery`;
4. `upcomingLoanPayment` + stock => `stock-recovery`;
5. stock + report guidance => stock;
6. zero reports => `first-result`;
7. one or more reports => `result-evidence`;
8. matching alerts preserve existing array order;
9. inputs are not mutated;
10. sandbox window is true for one store / 0–7 reports and false for 8 reports, two stores, or null.

The cash allowlist is exactly:

- `missedLoanPayment`;
- `lowCashRunway`.

### 1.3 Add real-game guard tests

Fixtures alone missed the structural Finance alerts, so add two real walks:

**Sandbox walk**

- found/create the deterministic convenience sandbox used by existing tests;
- derive alerts with real `collectGameAlerts`;
- advance with real `simulateDay`;
- assert the opening sequence does not get hijacked by `covenantRisk` / `upcomingLoanPayment`;
- pin Day 1 `first-result`, the real stock-recovery period, and the later `result-evidence` state inside the opening window.

**First Profit walk**

- start `first-profit` with its official seed via `startScenario`;
- derive real alerts at each active day;
- assert Day 1 `first-result` and report-backed guidance after the first advance;
- continue the no-action trace and confirm the scenario naturally terminates on Day 4 rather than planning guidance beyond it.

Keep these in `openingGuidance.spec.ts`; do not add another simulation harness.

Run:

```bash
bun run test:unit -- --run src/lib/game/openingGuidance.spec.ts
```

---

## Task 2 — Add the compact card and copy

**Create**

- `src/lib/components/game/OpeningGuidance.svelte`
- `src/lib/components/game/OpeningGuidance.svelte.spec.ts`

**Modify**

- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

### 2.1 Keep the component presentation-only

Props:

- `hint`;
- `I18nBundle`;
- `onAction`;
- optional `onDismiss`.

Render:

- heading;
- one short reason;
- one action button;
- optional Dismiss button.

Stable test ids may be `opening-guidance`, `opening-guidance-action`, and `opening-guidance-dismiss`.

No checklist, tour, modal, progress dots, animation framework, or focus manager.

### 2.2 Localize concise hint copy

Add one `openingGuidance` namespace in all three locales for:

- heading;
- four reasons;
- Finance action;
- stock action;
- Dashboard action;
- Dismiss.

Do not duplicate detailed Finance, stock-recovery, or daily-result explanations.

### 2.3 Tighten First Profit copy truthfully

Update only `scenarioDefinitions.firstProfit.summary`, `briefing`, and `strategyHint` in EN / JA / zh-Hant.

State the actual rules:

- cumulative income above zero;
- three consecutive positive-income reports;
- cash below zero fails;
- completed results and current warnings are the evidence to inspect.

Do not say a setting change is required. The calibrated no-action trace already wins.

No `catalog.ts` change and no scenario version bump.

### 2.4 Component tests

Cover:

- correct reason/action per hint kind;
- action callback once;
- Dismiss only when supplied;
- Dismiss callback once;
- buttons are normal keyboard-reachable controls;
- no autofocus/focus stealing;
- one primary action only.

Run:

```bash
bun run test:unit -- --run src/lib/components/game/OpeningGuidance.svelte.spec.ts src/lib/i18n/translate.spec.ts src/lib/i18n/scenarioCopy.spec.ts
```

---

## Task 3 — Wire the page without new route abstractions

**Modify**

- `src/routes/+page.svelte`

Do not add eligibility cases to `page.svelte.spec.ts`; it does not mount `+page.svelte`.

### 3.1 Add one dismissal boolean

```ts
let sandboxOpeningGuidanceDismissed = $state(false);
```

Scenario eligibility:

```ts
playMode === 'scenario' &&
activeScenarioRun?.definition.scenarioId === 'first-profit'
```

Sandbox eligibility:

```ts
playMode === 'sandbox' &&
isSandboxOpeningWindow(game) &&
!sandboxOpeningGuidanceDismissed
```

Do not put dismissal into the pure helper.

### 3.2 Select from the existing route alerts

Derive the hint from the existing current `game` and current localized `alerts` array:

```ts
selectOpeningGuidance(game, alerts)
```

Do not call `collectGameAlerts` a second time.

Because the selector carries the matched alert object, there is no click-time id lookup and no `followOpeningGuidance` helper required.

### 3.3 Delegate action directly

For `cash-risk` / `stock-recovery`:

- pass `hint.alert` to existing `handleSelectAlert`.

For `first-result` / `result-evidence`:

- call `openManagementPanel('dashboard')`.

Do not copy Finance routing, city switching, store focus, or product selection.

### 3.4 Reset dismissal only on successful loads

After `gameRouteController.resumeAutoSave()` returns `loaded`:

```ts
sandboxOpeningGuidanceDismissed = false;
```

After `gameRouteController.loadManualSave(slotId)` returns `loaded`:

```ts
sandboxOpeningGuidanceDismissed = false;
```

Nothing else resets it.

Specifically, do **not**:

- await/change `gameRouteController.foundStore` for this feature;
- add a founding reset;
- reset on day ticks, panel/map changes, autosave writes, or scenario mode changes.

A brand-new page/founding session starts false by construction. Failed loads return before the reset line.

### 3.5 Mount one card

Place `OpeningGuidance` near scenario progress / before `ControlDesk`.

- First Profit: no dismiss callback.
- Sandbox: dismiss callback sets the route-local boolean true.

Do not hide or disable existing controls.

Run:

```bash
bun run check
```

---

## Task 4 — Focus browser proof on new wiring

**Modify**

- `src/routes/retail-sim.e2e.ts`
- `src/routes/time-flow.e2e.ts` only if an existing helper makes the case smaller

Reuse existing challenge/snapshot helpers rather than creating a new harness.

### 4.1 First Profit result path

Use the existing challenge snapshot helpers.

Prove:

1. First Profit briefing/status contains the tightened income/streak/cash wording;
2. Day 1 shows `first-result` and its action opens Dashboard;
3. advance one day;
4. guidance becomes `result-evidence`;
5. its Dashboard action exposes the dated `DailyResultSummary`.

Stop there. Do not try to reach Day 5 and do not require a gameplay change.

### 4.2 Sandbox stock/action path and dismissal lifetime

Using the deterministic convenience sandbox:

1. reach the real Day-2 stock shortage;
2. assert the new card selects `stock-recovery` despite simultaneous structural Finance alerts;
3. click it and verify the existing Store Detail / affected-product handoff;
4. dismiss the card;
5. advance a day and verify it remains hidden;
6. successfully load the autosave and verify eligible guidance can appear again.

This single flow proves the new alert-button wiring plus the meaningful session reset.

Do not add separate HPA-284 browser cases for:

- Finance focus — existing E2E already covers the destination;
- failed founding/reset — no reset exists there;
- failed load reset — the reset sits after the existing `result !== 'loaded'` early return;
- scenario detour persistence — no code writes the boolean on a mode change.

### 4.3 Accessibility/layout

Reuse existing conventions. Verify the card does not autofocus, both buttons are keyboard reachable, it does not overlay/intercept normal controls, and copy wraps at the existing narrow viewport.

### 4.4 Scenario regression

Run existing scenario catalog/runtime/calibration/solvability coverage unchanged. Economic outputs must not change.

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

## Definition of done

HPA-284 is complete when:

- First Profit states its real objectives/failure without implying intervention is mandatory;
- exactly one deterministic contextual hint appears when applicable;
- only missed-payment / low-runway alerts count as opening-loop cash risk;
- structural covenant/calendar alerts cannot starve first-result or stock guidance;
- stock hints reuse the exact HPA-293 live destination;
- result hints reuse HPA-282 Dashboard evidence;
- sandbox window is derived from one store + first seven reports;
- dismissal is session-only and resets only on successful sandbox loads;
- First Profit and sandbox real-game selector walks pin the actual alert sequence;
- focused browser proof covers First Profit result guidance and sandbox stock/dismiss/load wiring;
- other scenarios and simulation outputs are unchanged;
- EN / JA / zh-Hant copy is complete;
- repository verification passes.

No second PR is needed.