# HPA-284 Opening-Loop Guidance — Design

**Linear:** HPA-284  
**Status:** implementation design for the single HPA-284 delivery PR  
**Baseline:** main at ee4a1784c1ffdf49b0c6d8f1084ebbd7c2ff3bde, after HPA-282 / PR #61

## Goal

Teach the existing early-game loop without creating a tutorial system:

1. read the latest completed result;
2. notice the most important current problem;
3. navigate to the existing control that can address it;
4. change one permitted setting;
5. inspect a later result.

First Profit gets this guidance for the whole active run. Sandbox gets the same compact guidance only during the opening window and may dismiss it for the current loaded/new-game session.

Everything ships in one HPA-284 PR: planning, UI/copy, implementation, localization, and tests.

## Why HPA-284 is next

The Serpens backlog currently contains HPA-284 and HPA-295 only. HPA-284 is Medium priority and its two blockers are now complete:

- HPA-293 owns truthful stock-recovery diagnosis and the store/product handoff;
- HPA-282 owns the completed-day result and profit-vs-cash explanation.

HPA-295 is explicitly the final, lower-priority map-polish slice. HPA-284 can therefore consume the two finished prerequisite surfaces instead of rebuilding them.

## Product boundaries

Keep these owners unchanged:

- scenario definitions and objective evaluation remain under src/lib/scenarios;
- active scenario evaluation remains the only source of objective/failure progress;
- src/lib/game/alerts.ts remains the source of current actionable alerts;
- src/routes/alertNavigation.ts and the existing route alert handler remain the navigation authority for alert destinations;
- HPA-293 stock recovery remains in Store Detail / StoreStockTable;
- HPA-282 completed-day explanation remains DailyResultSummary on Dashboard;
- the route remains the composition root for presentation-only session state.

Do not add:

- a tutorial or quest state machine;
- persisted onboarding progress;
- a second objective evaluator;
- a new alert severity system;
- an action history;
- a global coaching store;
- a backend or AI advisor;
- scenario schema/version changes;
- save schema changes or migrations;
- new art or SFX.

## Current code facts

### First Profit already contains the right game rules

src/lib/scenarios/catalog.ts currently defines First Profit with:

- scenario id first-profit, version 1;
- official seed 280001;
- 14-day limit;
- one convenience store and one allowed product;
- required cumulative-net-income > 0;
- required three-report positive-income streak;
- negative cash as the failure condition;
- the standard retail command set only.

The guidance must not change any of those values or allowed commands.

### Objective progress is already presentation-ready

buildScenarioProgressView in src/lib/i18n/scenarioCopy.ts consumes the existing ScenarioRun evaluation and exposes required objectives, failure evidence, deadline, day, score, and medal copy.

ScenarioStatusStrip and ScenarioObjectivePanel already render that evidence. HPA-284 should improve First Profit wording and place the contextual hint beside this existing evidence rather than extending the evaluator.

### Stock recovery already has an exact route handoff

resolveStockAlertDestination derives the live city, store, tile, and currently affected product from a store-stock alert.

The current route handler then:

1. switches city when needed;
2. returns to the retail map;
3. selects the store tile;
4. opens Store Detail focused on the affected product.

Opening guidance must reuse that alert path. It must not recreate stock diagnosis or product selection.

### Daily result already has the correct evidence surface

DailyResultSummary on Dashboard now owns:

- the latest completed day;
- revenue;
- operating income;
- net cash change;
- current cash;
- the operating/financing cash bridge;
- recorded cash contributors;
- Reports and Finance handoffs.

Both the first-result hint and the normal completed-result hint should navigate to Dashboard instead of introducing another result card.

### Route-local transient state is already the right lifetime

src/routes/+page.svelte already owns transient map/panel/focus state and has resetTransientViewState for play-mode / scenario-run lifecycle transitions.

Sandbox save loads have explicit successful resumeAutoSave and loadManualSlot paths. New sandbox games commit through gameRouteController.foundStore.

This is enough to keep dismissal session-only. No controller field or persisted flag is needed.

## Design

### 1. Add one pure bounded selector

Create src/lib/game/openingGuidance.ts with one closed hint union and one selector.

Conceptually:

- cash-risk
- stock-recovery
- first-result
- result-evidence

Each selected hint contains only:

- its kind;
- one action descriptor.

The action descriptor has only two shapes:

- existing alert id;
- Dashboard.

Do not put localized copy, callbacks, GameState mutation, or route state in the selector.

The route resolves an alert id against the current derived alerts at click time, then calls the existing alert navigation handler. This avoids stale navigation payloads and keeps HPA-293 context preservation intact.

### 2. Use deterministic precedence, not a coaching framework

Given an eligible game, return at most one hint using this fixed precedence:

1. first current finance-risk alert;
2. first current store-stock alert;
3. no completed report;
4. latest completed result exists;
5. otherwise null.

Finance-risk means one of the existing finance alert kinds:

- missedLoanPayment;
- upcomingLoanPayment;
- covenantRisk;
- lowCashRunway.

Do not invent a new urgency score. Preserve the order already produced by collectGameAlerts when more than one matching finance alert exists.

Cash risk intentionally outranks stock pressure because the ticket calls out the cash-failure condition first. Stock recovery remains the next actionable operating problem.

The final result-evidence row is a standing pointer to existing evidence, not a fabricated task. Alert hints disappear naturally when their underlying alert disappears; first-result becomes result-evidence after the first completed report.

### 3. Keep First Profit eligibility explicit

Show opening guidance in scenario mode only when:

- there is an active scenario run;
- its scenario id is first-profit.

Other authored scenarios get no new guidance.

Do not add a generic field to ScenarioDefinition. HPA-284 owns one scenario-specific polish rule, so a reusable scenario coaching schema would be premature.

First Profit guidance is not dismissible. The scenario already has an explicit authored objective and a finite 14-day lifecycle.

### 4. Keep sandbox eligibility derived

Show the sandbox card only when all are true:

- a sandbox game exists;
- exactly one store exists;
- there are at most seven completed DailyReports;
- the card has not been dismissed in the current session.

This makes the opening window cover the pre-first-report state plus the first seven completed-day results. It stops after the eighth completed report or immediately after expansion.

Do not use GameState.day as the counter; completed reports are the evidence this feature teaches and remain correct if day numbering or setup changes.

### 5. Dismissal is route-local only

Add one route-local boolean for sandbox dismissal.

It stays true across:

- opening/closing panels;
- map navigation;
- ordinary game mutations;
- day advancement.

Reset it only when the sandbox game itself is successfully replaced:

- successful new sandbox founding;
- successful autosave load;
- successful manual save load.

Entering a scenario and later returning to the same sandbox does not replace that sandbox session, so it must not clear the dismissal.

Do not write dismissal into GameState, autosave, manual saves, localStorage, or scenario persistence.

A failed load/founding attempt must not reset dismissal.

### 6. Add one compact presentation component

Create src/lib/components/game/OpeningGuidance.svelte.

Props stay presentation-only:

- selected hint kind;
- localized reason/action labels;
- action callback;
- optional dismiss callback.

The component renders:

- a small heading;
- one short reason;
- one action button;
- Dismiss only when the sandbox callback is supplied.

It never receives mutation commands and never advances or pauses time.

Mount it in the page-level game chrome near ScenarioStatusStrip / before ControlDesk so it is visible without opening a management panel and remains reachable on narrow layouts.

Do not merge this into ScenarioStatusStrip: sandbox also uses it, and the scenario strip already has objective/error responsibilities.

### 7. Reuse existing navigation for every action

For an alert action:

- resolve the current alert by id;
- call the existing handleSelectAlert path.

For a Dashboard action:

- call openManagementPanel('dashboard').

No hint action may:

- update policy or stock values;
- advance a day;
- start construction;
- change simulation speed;
- pause/resume time;
- synthesize a scenario command.

This also guarantees First Profit never suggests industry construction or expansion, which its command/content rules do not permit.

### 8. Improve First Profit copy without changing the definition

Keep catalog.ts structurally unchanged.

Update only the existing localized First Profit summary/briefing/strategy hint in English, Japanese, and Traditional Chinese so the text explicitly communicates:

- cumulative income must finish above zero;
- three consecutive positive-income reports are required;
- cash below zero fails the run;
- after a completed day, inspect the result and respond to the current problem.

The exact objective labels/evidence continue to come from the evaluator-backed scenario progress view.

Add opening-guidance copy under one localized namespace and rely on the existing whole-catalog locale parity test.

## Suggested copy intent

The copy should be concise rather than tutorial-like.

First Profit briefing intent:

“Finish with cumulative income above zero and record three straight positive-income days. The run fails if cash drops below zero.”

Strategy intent:

“After each completed day, read the result. If cash risk or a stock shortage appears, follow the linked control and change one permitted setting before checking the next result.”

Hint intent:

- cash-risk: explain that an active finance warning can threaten the cash condition; action opens its existing destination;
- stock-recovery: explain that a current shelf shortage is the next concrete operating problem; action opens the exact affected store/product;
- first-result: explain that one completed day creates the first evidence to inspect; action opens Dashboard;
- result-evidence: explain that the latest dated result is the evidence for the next decision; action opens Dashboard.

Do not claim a specific action will improve profit, guarantee success, or identify a cause not recorded by the simulation.

## Testing boundaries

### Pure selector

Controlled fixtures cover:

- cash warning + stock warning => cash wins;
- stock warning without cash warning => stock wins;
- no reports => first-result;
- completed report => result-evidence;
- no usable input => null;
- deterministic choice among multiple finance alerts;
- input arrays/state are not mutated.

### Component

Cover:

- one reason and one action only;
- sandbox Dismiss visibility;
- no Dismiss in First Profit;
- keyboard-accessible buttons;
- no autofocus/focus stealing;
- narrow layout remains readable.

### Route/session integration

Prove:

- alert action reuses the current alert handler;
- stock hint preserves city/store/product focus;
- Dashboard hint opens the existing Dashboard;
- dismissal survives panel navigation and day ticks;
- successful autosave/manual load resets dismissal;
- successful new-game founding resets dismissal;
- failed load/founding does not reset dismissal;
- expansion or an eighth completed report removes sandbox guidance;
- other scenarios never render it.

### Scenario regression

Retain existing First Profit definition/golden/solvability tests unchanged except for localized text expectations.

The same official-seed action sequence must produce identical:

- objective evaluation;
- score;
- medal;
- terminal outcome.

### E2E

Add one focused First Profit browser journey:

1. start First Profit;
2. observe the objective/failure wording;
3. complete the first day;
4. follow the current guidance to existing evidence;
5. follow an applicable stock/cash handoff when present in the controlled journey;
6. change one already-permitted setting;
7. inspect a later completed result.

Add one sandbox smoke case proving:

- opening guidance is optional;
- dismiss persists through panel navigation/day advancement;
- normal controls remain available;
- a newly loaded/new sandbox session can show guidance again.

## Verification

Before marking HPA-284 ready:

- bun run check
- bun run lint
- bun run test:unit -- --run
- affected retail-sim / time-flow Playwright coverage
- bun run build

No separate implementation PR is planned. This design, the implementation plan, production code, localization, and tests stay in the same HPA-284 draft PR.
