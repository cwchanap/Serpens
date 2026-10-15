# HPA-284 Opening-Loop Guidance — Design

**Linear:** HPA-284  
**Status:** implementation design for the single HPA-284 delivery PR  
**Baseline:** `main` at `ee4a1784c1ffdf49b0c6d8f1084ebbd7c2ff3bde`, after HPA-282 / PR #61

## Goal

Teach one small opening loop without creating a tutorial system:

1. find the first useful evidence;
2. notice one concrete current problem when one exists;
3. navigate to the existing screen that explains or addresses it;
4. inspect the next result.

First Profit gets the card for its active run. Sandbox gets the same compact card only while the company has one store and at most seven completed reports, and may dismiss it for the current loaded sandbox session.

Everything stays in one HPA-284 PR: design, implementation, copy, localization, and tests.

## Product boundaries

Keep existing owners unchanged:

- scenario objectives/failures/scoring remain under `src/lib/scenarios`;
- `collectGameAlerts` remains the source of current alerts;
- `handleSelectAlert` plus `src/routes/alertNavigation.ts` remain the navigation authority;
- HPA-293 remains the stock-recovery diagnosis and live store/product handoff;
- HPA-282 `DailyResultSummary` on Dashboard remains the completed-day evidence surface;
- `src/routes/+page.svelte` owns session-only dismissal.

Do not add a tutorial FSM, persisted onboarding state, objective reimplementation, alert severity model, action history, coaching store, backend/AI advisor, save/schema migration, art, or SFX.

## Verified code facts

### First Profit is much shorter than its 14-day limit

The catalog still defines the same official rules: seed `280001`, 14-day limit, one convenience store, cumulative income above zero, three consecutive positive-income reports, and failure when cash drops below zero.

The existing runtime calibration also proves something the guidance design must respect: the official First Profit **no-action** trace completes on Day 4 with score 862 and a gold medal. The documented reference trace also completes on Day 4.

Therefore HPA-284 must not imply that changing a setting is required to win, and browser coverage cannot depend on reaching Day 5 inside First Profit. The card teaches how to read evidence and reach existing controls; it is not a claim that the player must intervene.

### `covenantRisk` and `upcomingLoanPayment` are not First Profit cash-failure signals

`covenantRisk` compares trailing seven-day operating cash flow with scheduled debt service. Before the first report, trailing operating cash is zero while every founding loan already has a payment in the next seven days, so the covenant alert is structural at the opening.

`upcomingLoanPayment` is a calendar reminder: it appears whenever an active loan payment falls inside the existing three-day look-ahead window, regardless of current cash strength.

Using either as opening-loop `cash-risk` would crowd out the useful first-result and stock-recovery hints and could tell a well-funded sandbox company that cash is at risk when it is not.

For HPA-284, `cash-risk` is intentionally narrower than “all Finance alerts.” It means only:

- `missedLoanPayment`;
- `lowCashRunway`.

Those two are the existing Finance alerts that actually describe an immediate cash-pressure condition relevant to First Profit's negative-cash failure.

Existing TopBar behavior for `covenantRisk` is out of scope.

### Stock recovery and result evidence already have correct destinations

`resolveStockAlertDestination` resolves a `store-stock` alert against the live `GameState`, including the currently affected product. Opening guidance should pass that alert to the existing `handleSelectAlert` path rather than recreate the handoff.

`DailyResultSummary` already owns the latest completed-day evidence on Dashboard. Both report-oriented hints navigate there.

### The route alert list is already the right selector input

`+page.svelte` derives one localized `alerts` array from the current `game`. `LocalizedGameAlert` extends `GameAlert`, so the selector can consume that exact array; it must not call `collectGameAlerts` a second time.

The selector can carry the selected `GameAlert` object directly. `TopBar` already passes alert objects directly to `handleSelectAlert`, and stock navigation re-resolves the live store/product from the current game. An alert-id action descriptor plus click-time lookup adds no useful state boundary.

### Page-local dismissal has only two meaningful reset hooks

`GameRouteController` starts with `sandboxGame: null`; founding only occurs while the page has no game. At that point the new route-local dismissal boolean is necessarily still false, so an explicit “founding reset” and a new awaited `foundStore` result are dead work.

The meaningful replacement boundaries are the two existing successful load branches:

- `resumeAutoSave` returning `loaded`;
- `loadManualSlot` returning `loaded`.

A brand-new page/new founding session starts with dismissal false by construction.

## Design

### 1. One selector module, no action descriptor

Create `src/lib/game/openingGuidance.ts` with this closed shape:

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

`isSandboxOpeningWindow` owns only stable game-state eligibility:

- game exists;
- exactly one store;
- `reports.length <= 7`.

It does not take play mode or dismissal. Those are route/session concerns.

No localized copy, callbacks, mutations, route state, or configuration framework belongs here.

### 2. Deterministic precedence uses only actionable cash pressure

For an eligible game, return at most one hint in this order:

1. first `missedLoanPayment` or `lowCashRunway` alert, preserving existing alert order;
2. first `store-stock` alert;
3. `first-result` when `reports.length === 0`;
4. `result-evidence` when at least one report exists;
5. otherwise `null`.

Do not include `upcomingLoanPayment` or `covenantRisk` in the opening-loop cash allowlist. Do not invent a severity score.

The selector returns the selected alert object itself for cash/stock hints. The route therefore has no alert-id lookup helper and no “id missing” branch.

### 3. Lock the selector against real game sequences, not fixtures alone

Hand-built precedence fixtures are still useful, but they are insufficient because they can miss structural alerts.

Add two integration-style unit walks in `openingGuidance.spec.ts` using real game/scenario construction:

- convenience sandbox opening: the selector should produce the real opening sequence expected under the existing simulation — Day 1 `first-result`, stock recovery when the real `store-stock` alert appears during the first week, and `result-evidence` once stock pressure clears while the opening window remains eligible;
- First Profit official seed: Day 1 `first-result`, then `result-evidence` after a completed day, with the run naturally terminating on Day 4 under the existing no-action calibration.

These tests should call the real `collectGameAlerts` and `simulateDay` / scenario runtime path so a future structural alert cannot silently dominate the guidance again.

### 4. Eligibility stays small

Scenario mode renders guidance only when the active scenario id is `first-profit`. Other authored scenarios remain unchanged. First Profit guidance is not dismissible.

Sandbox mode renders guidance only when:

```ts
playMode === 'sandbox' &&
isSandboxOpeningWindow(game) &&
!sandboxOpeningGuidanceDismissed
```

Use completed report count, not `game.day`.

### 5. Dismissal is one route-local boolean

Add `sandboxOpeningGuidanceDismissed` in `+page.svelte`.

It remains true across ordinary mutations, day advancement, panels, maps, and scenario detours because no code writes it during those actions.

Reset it to false only after successful sandbox replacement through:

- `resumeAutoSave`;
- `loadManualSlot`.

Do not add a founding reset, do not await `foundStore` just for guidance, and do not persist dismissal anywhere.

### 6. One compact presentation component

Create `src/lib/components/game/OpeningGuidance.svelte` with presentation-only props:

- selected hint;
- `I18nBundle`;
- `onAction`;
- optional `onDismiss`.

Render only a small heading, one reason, one action button, and optional Dismiss. No checklist, step counter, modal, popover tour, coach marks, or focus manager.

Mount it near `ScenarioStatusStrip` / before `ControlDesk`. It never hides controls, changes time, or mutates gameplay.

### 7. Navigation delegates directly to existing owners

For `cash-risk` or `stock-recovery`, the action passes `hint.alert` directly to `handleSelectAlert`.

For `first-result` or `result-evidence`, the action calls `openManagementPanel('dashboard')`.

No named `followOpeningGuidance` helper is required unless implementation readability genuinely improves; there is no second navigation algorithm to abstract.

### 8. Copy must describe evidence, not prescribe unnecessary intervention

Keep `catalog.ts` structurally unchanged and do not bump the scenario version.

Update the existing First Profit summary/briefing/strategy copy in EN / JA / zh-Hant to state:

- cumulative income must finish above zero;
- three consecutive positive-income reports are required;
- cash below zero fails;
- inspect completed results and current warnings to understand the run.

Do **not** say that the player must change a setting after every result. The calibrated no-action run already wins.

Hint intent:

- `cash-risk`: a missed payment or short cash runway deserves attention; open its existing Finance destination;
- `stock-recovery`: a current shelf shortage is the next concrete operating issue; open the affected store/product;
- `first-result`: complete a day to create the first evidence, with Dashboard as the evidence home;
- `result-evidence`: inspect the latest dated result on Dashboard.

Do not promise that a hinted action improves profit or guarantees success.

## Test boundaries

### Selector/window unit tests

Cover hand-built cases for:

- `missedLoanPayment` / `lowCashRunway` outrank stock;
- `covenantRisk` / `upcomingLoanPayment` do **not** become `cash-risk`;
- stock outranks report guidance;
- no reports => `first-result`;
- reports => `result-evidence`;
- deterministic first matching alert;
- no mutation of inputs;
- sandbox window: one store + 0–7 reports true, 8 reports/two stores/null false.

Also include the real sandbox and First Profit walks described above.

### Component tests

Cover one reason/action, optional Dismiss, non-dismissible First Profit usage, callback behavior, keyboard-reachable buttons, no autofocus, and narrow layout.

### Browser proof

Keep browser work focused because the destinations already have independent E2E coverage.

First Profit:

1. start First Profit from an installed challenge snapshot;
2. verify the tightened objective/failure copy;
3. verify Day 1 `first-result` and open Dashboard;
4. advance one day;
5. verify `result-evidence` and a dated `DailyResultSummary`.

Do not plan a Day-5 Finance path or a mandatory setting change; the scenario terminates on Day 4 under the no-action calibration.

Sandbox:

1. use the existing deterministic convenience-store setup;
2. advance to the real Day-2 stock shortage;
3. follow `stock-recovery` and verify the existing Store Detail/product handoff;
4. dismiss guidance;
5. advance a day and verify it stays hidden;
6. load the autosave successfully and verify eligible guidance can appear again.

Existing dedicated E2E already proves Finance focus and stock deep-link destination behavior; HPA-284 only needs to prove its new button reaches the reused path.

### Scenario regression

Existing scenario catalog/evaluator/calibration/solvability outputs stay unchanged. HPA-284 changes presentation only.

## Verification

Before marking HPA-284 ready:

- `bun run check`
- `bun run lint`
- `bun run test:unit -- --run`
- affected Playwright coverage
- `bun run test`
- `bun run build`

No separate implementation PR is planned.