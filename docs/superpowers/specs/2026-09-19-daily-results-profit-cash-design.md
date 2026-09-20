# HPA-282 Daily Results & Profit-vs-Cash — Design

**Linear:** HPA-282\
**Status:** implementation design for the single HPA-282 delivery PR\
**Baseline:** `main` after HPA-283 / PR #60 (`c5c6ba690e50b412c47f6dd49596854df993775d`)

## Goal

Make the latest completed business day understandable without turning Reports into another accounting system.

From the existing management surfaces, the player should be able to answer:

1. what happened on the latest completed day;
2. whether operating performance was positive or negative;
3. whether cash increased or decreased;
4. why income and cash can move differently;
5. where the underlying report/finance evidence already lives;
6. how the result changed from the preceding completed day.

The same ticket also gives the selected-store inspector one precise report-backed operating result beside revenue.

Everything remains in **one ticket / one PR**.

## Existing authority boundaries

Keep these owners unchanged:

- `src/lib/game/simulateDay.ts`: authoritative completed-day accounting and cash reconciliation;
- `src/lib/game/types.ts::DailyReport`: persisted completed-day evidence;
- `src/lib/game/types.ts::DailyStoreReport`: store-scoped completed-day evidence;
- `src/lib/game/reports.ts`: pure report aggregation/read models;
- `src/lib/components/game/ReportsPanel.svelte`: detailed report evidence;
- `src/lib/components/game/FinancePanel.svelte`: loan/finance detail;
- `src/routes/ManagementPanelHost.svelte`: management-panel composition/navigation;
- `src/lib/components/game/TileInspector.svelte`: selected-store compact presentation.

No simulation rule, save schema, finance engine, transaction ledger, forecast, or attribution system is required.

## Current accounting facts

The current daily report already records every field HPA-282 needs:

- revenue;
- operating income;
- net income;
- operating cash flow;
- financing cash flow;
- net cash change;
- import spend;
- interest accrued / paid / capitalized;
- principal borrowed / repaid / refinanced;
- cash before / after.

The current simulation also owns the exact cash bridge:

```text
netCashChange = operatingCashFlow + financingCashFlow
cashAfter = cashBefore + netCashChange
```

HPA-282 must **display these recorded values**, not recalculate them from the current wallet or replay the day.

The ticket deliberately does not reinterpret the existing `netIncome` field. It remains a recorded report value and is rendered as-is. The profit-vs-cash explanation uses the authoritative operating/financing cash-flow totals for reconciliation and uses `operatingIncome` for the specific “positive operating result while cash fell” case.

This avoids quietly changing economic semantics in a presentation-polish ticket.

## Current UX gap

The Reports panel already contains much of the raw evidence, but it is buried behind the detail expander and spread across unrelated rows.

Today:

- Dashboard shows only four scorecard gauges;
- Reports leads with revenue trend / margin / customers / spoilage;
- operating and financing cash flow are only in expanded detail;
- net cash change is not surfaced as a first-class latest-day metric;
- current cash can be confused with the last report’s end-of-day cash;
- there is no previous-day absolute comparison;
- the store inspector shows revenue only.

The player can reconstruct the answer, but the UI does not explain it.

## Design decisions

### 1. Add one pure latest-day projection in `reports.ts`

Do not add a reporting service, store, or analytics subsystem.

Add one small read model:

```ts
export type DailyCashContributorKind =
  | 'import-spend'
  | 'principal-repaid'
  | 'interest-paid'
  | 'principal-borrowed';

export interface DailyCashContributor {
  kind: DailyCashContributorKind;
  amount: number; // signed: inflow positive, outflow negative
}

export interface DailyResultComparison {
  previousDay: number;
  revenueDelta: number;
  operatingIncomeDelta: number;
  netIncomeDelta: number;
  netCashChangeDelta: number;
}

export interface DailyResultView {
  latest: DailyReport;
  comparison: DailyResultComparison | null;
  contributors: DailyCashContributor[];
}

export function buildDailyResultView(
  reports: readonly DailyReport[]
): DailyResultView | null;
```

Behavior:

- no reports → `null`;
- latest = final completed report;
- comparison uses only the immediately preceding completed report;
- comparisons are signed **absolute** deltas, never percentages;
- one report → `comparison: null`;
- contributors contain at most two non-zero recorded cash contributors.

The helper is pure and does not read current `GameState.cash`.

### 2. Keep the exact cash bridge separate from contributor evidence

The UI always reconciles cash with the report totals:

```text
Operating cash flow + Financing cash flow = Net cash change
```

That is the complete bridge.

The optional contributor list is only supporting recorded evidence. It must never be summed as though it were another complete reconciliation.

Candidate evidence:

| Kind | Signed amount | Meaning |
| --- | ---: | --- |
| import spend | `-report.importSpend` | recorded inventory/import cash purchase |
| principal repaid | `-report.principalRepaid` | financing cash outflow |
| interest paid | `-report.interestPaid` | cash interest payment |
| principal borrowed | `+report.principalBorrowed` | financing cash inflow |

Explicitly exclude:

- interest accrued: accounting evidence, not necessarily same-day cash;
- interest capitalized: not a cash payment;
- refinanced principal: useful finance evidence but not a standalone net cash direction;
- inventory loss expense: operating-income evidence, not a same-day cash purchase;
- current cash commands after report close.

This keeps the explanation honest.

### 3. Deterministically select at most two contributors

Filter zero values, then sort by:

1. absolute amount descending;
2. fixed candidate order above for ties.

Take the first two.

Do not introduce a configurable “materiality” threshold. For this small game, non-zero + top-two is predictable and testable.

If no candidate exists, show only the exact cash-flow totals and scope copy. Do not invent a residual.

### 4. Explain the important divergence without causal storytelling

When:

```text
latest.operatingIncome > 0
latest.netCashChange < 0
```

show a compact “Operating result was positive, but cash fell” explanation.

The explanation can say:

- inventory/import purchases are reflected in operating cash flow;
- financing activity is reflected in financing cash flow;
- principal repayment is a cash outflow, not another operating expense;
- accrued interest and paid interest are different recorded values.

It must **not** say that a particular click, upgrade, purchase, or player decision caused the outcome.

For all other sign combinations, use the same compact cash bridge without manufacturing a special story.

### 5. Reuse one Daily Result card on Dashboard and Reports

Add a small reusable presentation component, for example:

`src/lib/components/game/DailyResultSummary.svelte`

Inputs stay narrow:

```ts
interface Props {
  reports: readonly DailyReport[];
  currentCash: number | null;
  i18n: I18nBundle;
  onOpenReports?: () => void;
  onOpenFinance?: () => void;
}
```

The component derives `buildDailyResultView(reports)`.

It shows:

- **Day N completed result** heading;
- revenue;
- operating income;
- net income;
- net cash change;
- signed absolute delta vs **Day N-1** when available;
- current cash in a visually separate block;
- exact operating + financing cash-flow bridge;
- at most two recorded contributors;
- short scope/explanation copy;
- existing Reports / Finance navigation actions only when callbacks are supplied.

No chart, history selector, modal, or new dashboard app.

### 6. Current cash is not report cash

The Daily Result card receives current cash separately from the report.

Rules:

- “Current cash” comes from live `panelGame.cash`;
- the latest completed result comes only from the latest `DailyReport`;
- report `cashAfter` remains detail evidence in Reports;
- spending/upgrading after day close can change current cash without changing the completed result;
- never calculate `netCashChange` as `currentCash - report.cashBefore`.

This is a core correctness boundary.

### 7. Dashboard becomes a useful landing surface, not a second Reports panel

For `panelId === 'dashboard'`, compose:

1. Daily Result card;
2. existing Scorecard.

The card can navigate to:

- Reports for full completed-day evidence;
- Finance for loans / financing detail.

Use `ManagementPanelHost`’s existing `onSelectPanel`; do not create route state or a new navigation system.

### 8. Reports reuses the same card and keeps existing 7/14/30-day behavior

Place the Daily Result card near the top of Reports before the existing trend/evidence sections.

Reports keeps:

- 7 / 14 / 30 chart window controls;
- existing detailed report expander;
- product/store/market/logistics evidence;
- existing aggregation semantics.

The card’s comparison is always latest completed day vs immediately preceding completed day, independent of chart window. It does not create another history range.

Inside Reports, only the Finance action is needed; “Open Reports” would be redundant.

### 9. Store inspector shows a store-scoped operating result, not company profit

`DailyStoreReport.netIncome` is already the store-scoped report result:

```text
store gross margin
- store operating costs
- store inventory loss expense
```

It does **not** allocate all company-level costs.

Add beside the existing revenue metric:

- Day N revenue;
- Day N **Store operating result**.

Add compact disclosure:

> Uses this store report’s gross margin, store operating costs, and inventory loss only; shared payroll, production, logistics, and financing are outside this store result.

Derive Day N from `game.reports.at(-1)?.day` only when `latestStoreReport` exists.

Do not modify `DailyStoreReport`, invent cost allocation, or add a store profit history.

### 10. Preserve honest empty and first-report states

No reports:

- “No completed-day results yet.”
- current cash may still be shown separately;
- no zero revenue/income/cash-change values are fabricated;
- no comparison appears.

Exactly one report:

- show latest values;
- no comparison placeholder pretending there was a Day 0 result.

Negative values:

- render signed currency/readable minus sign;
- do not encode meaning by color alone.

Zero prior values:

- absolute delta still works;
- no percentage or divide-by-zero path exists.

### 11. No `simulateDay.ts`, `types.ts`, or persistence change by default

Current report contracts already contain the necessary evidence.

Implementation should therefore **not** edit:

- `src/lib/game/types.ts`;
- save codec/schema/migrations;
- finance state;
- `simulateDay.ts`.

If a focused test uncovers a genuine existing accounting bug, stop and reassess scope rather than smuggling an economic rewrite into HPA-282.

## State ownership

Persisted state: unchanged.

Pure derived state:

- `buildDailyResultView(reports)`;
- latest/previous comparison;
- top-two contributor selection.

Presentation-only state:

- none required beyond existing management-panel selection.

No dismissal state, cache, global store, telemetry, or backend.

## Accessibility / responsive requirements

- latest-day heading includes explicit Day N;
- current cash is labelled separately from completed-day metrics;
- signed negative values remain readable;
- comparison always names previous day;
- navigation uses normal buttons;
- no focus stealing;
- contributor meaning is available as text, not color;
- metric grid collapses cleanly at <=600px;
- keyboard navigation continues through existing management tabs/actions.

## Localization

Update EN / JA / zh-Hant for:

- completed-day heading;
- current cash;
- net cash change;
- comparison vs previous day;
- no-report state;
- cash-bridge labels/explanation;
- positive-operating-result / negative-cash explanation;
- import purchase / principal repayment / interest paid / borrowing contributor labels;
- Reports / Finance actions if existing generic labels cannot be reused;
- store operating result + scope disclosure.

Reuse existing metric names where already available.

## Test strategy

### Pure report read model

In `reports.spec.ts`, cover:

- no reports;
- one report;
- ordinary two-report comparison;
- negative values;
- zero previous values;
- positive operating income + negative net cash change;
- import-spend contributor;
- principal-repayment contributor;
- borrowing inflow;
- interest-paid evidence;
- top-two truncation;
- deterministic equal-magnitude tie;
- purity / input unchanged.

### Daily Result component

Cover:

- no-report state without fabricated zeros;
- current cash displayed separately;
- four required latest-day metrics;
- Day N / Day N-1 labels;
- signed absolute deltas;
- exact cash bridge;
- at most two contributors;
- divergence explanation;
- optional navigation callbacks;
- negative-value accessibility;
- narrow-layout class/structure.

### Dashboard / Reports composition

Pin:

- Dashboard renders Daily Result + existing Scorecard;
- Dashboard Reports action switches through existing host navigation;
- Dashboard Finance action switches through existing host navigation;
- Reports renders the same latest-day card;
- existing report windows and detailed evidence remain intact.

### Store inspector

Cover:

- no completed store report → em dash / unavailable result;
- latest report → revenue + store operating result;
- explicit Day N;
- scope disclosure;
- negative store result;
- selecting another store uses that store’s report only.

### E2E

One focused management journey:

1. load a deterministic game with completed report evidence;
2. open Dashboard;
3. assert explicit Day N completed result;
4. assert current cash is separate;
5. inspect the four required metrics;
6. follow Reports action and verify detailed evidence;
7. follow Finance action where financing evidence exists;
8. select a store and verify the store-scoped result;
9. repeat the Daily Result surface at a narrow viewport to prove readable stacking/keyboard access.

Exact positive-income/negative-cash accounting edge cases remain cheaper and more deterministic in pure/component fixtures; the browser test proves navigation/composition, not a second simulation harness.

## Risks

### Existing `netIncome` semantics

The field already has established persisted/runtime semantics.

Mitigation:

- render it verbatim;
- do not redefine it;
- use operating income + the exact cash-flow bridge for explanation;
- keep economic changes out of this ticket.

### Double-counting cash contributors

Import spend and debt payments are already reflected in authoritative cash-flow totals.

Mitigation:

- show operating/financing totals as the reconciliation;
- label contributors as evidence only;
- never add them again to derive net cash change.

### Current cash drift after day close

Player commands can change cash after the latest report.

Mitigation:

- current cash has its own live label;
- the Daily Result card never uses current cash in report arithmetic.

### Store result overclaim

Store reports omit company/shared costs.

Mitigation:

- label “Store operating result”;
- keep an explicit scope disclosure;
- never call it company profit.

## Non-goals

- accounting-system redesign;
- changing `DailyReport` semantics;
- transaction/action history;
- causal attribution of clicks;
- cost allocation across stores;
- new report persistence/history;
- save migration or compatibility work;
- finance rebalance;
- forecast / trend prediction;
- another analytics window;
- new dashboard application;
- modal daily-report interruption;
- backend/telemetry;
- new art or SFX;
- HPA-284 onboarding guidance;
- HPA-295 map activity polish.
