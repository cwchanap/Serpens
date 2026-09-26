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

Company-level `DailyReport.netIncome` is currently a legacy alias of `operatingCashFlow` in the real simulation write path. HPA-282 keeps that persisted field untouched but **does not surface it as a separate company headline or comparison metric**. Showing both would present one recorded cash-flow value under two names.

Store-level `DailyStoreReport.netIncome` has different semantics: it is the store-scoped operating result `grossMargin - operatingCosts - inventoryLossExpense`. The inspector may read that field directly, but labels it **Store operating result**, never company net income.

The profit-vs-cash explanation therefore uses `operatingIncome` for operating performance and the authoritative operating/financing cash-flow totals for cash reconciliation. This avoids quietly changing economic semantics while also avoiding a misleading duplicate “profit” number.

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
| import spend | `-getImportSpend(report)` | reconciled inventory/import cash purchase |
| principal repaid | `-report.principalRepaid` | financing cash outflow |
| interest paid | `-report.interestPaid` | cash interest payment |
| principal borrowed | `+report.principalBorrowed` | financing cash inflow |

Explicitly exclude:

- interest accrued: accounting evidence, not necessarily same-day cash;
- interest capitalized: not a cash payment;
- refinanced principal: useful finance evidence but not a standalone net cash direction;
- inventory loss expense: operating-income evidence, not a same-day cash purchase;
- current cash commands after report close.

Reuse the existing `getImportSpend(report)` reconciliation from `reports.ts` rather than reading raw `report.importSpend` directly. Export that helper so both window summaries and the new daily-result projection use the same answer. In normal simulation output the raw and detailed totals agree; the shared helper also keeps hand-built fixtures/saves consistent with existing report-window semantics.

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

### 5. Add one presentation-only Daily Result card for Dashboard

Add one small reusable presentation component:

`src/lib/components/game/DailyResultSummary.svelte`

Keep result derivation outside the component. `ManagementPanelHost` derives `buildDailyResultView(panelGame.reports)` once and passes the projection:

```ts
interface Props {
  view: DailyResultView | null;
  currentCash: number | null;
  i18n: I18nBundle;
  onOpenReports?: () => void;
  onOpenFinance?: () => void;
}
```

The component shows:

- **Day N completed result** heading;
- revenue;
- operating income;
- net cash change;
- signed absolute delta vs **Day N-1** when available;
- current cash in a visually separate block;
- exact operating + financing cash-flow bridge;
- at most two recorded contributors;
- short scope/explanation copy;
- existing Reports / Finance navigation actions only when callbacks are supplied.

Company `netIncome` is intentionally absent because the real simulation stores it as the same value as `operatingCashFlow`, which the cash bridge already shows.

Use shared `i18n.format.signedCurrency` for signed deltas. Add it to `createLocaleFormatters` with `Intl.NumberFormat(..., { signDisplay: 'exceptZero' })`; do not add another component-local sign/currency formatter.

Pin stable semantic test IDs before tests are written:

- `daily-result`;
- `daily-result-day`;
- `daily-result-revenue`;
- `daily-result-operating-income`;
- `daily-result-net-cash-change`;
- `daily-result-current-cash`;
- `daily-result-bridge`;
- repeated `daily-result-contributor`.

No chart, history selector, modal, or new dashboard app.

### 6. Current cash is not report cash

The Daily Result card receives current cash separately from the report.

Rules:

- “Current cash” comes from the page as `game ? game.cash : null` — live game cash only; `null` (starter map, no company yet) hides the line rather than fabricating starter cash;
- the latest completed result comes only from the latest `DailyReport`;
- report `cashAfter` remains detail evidence in Reports;
- spending/upgrading after day close can change current cash without changing the completed result;
- never calculate `netCashChange` as `currentCash - report.cashBefore`.

The Dashboard tower header already renders the same live cash as an unlabeled ticker. Keep that existing header behavior; the HPA-282 card is the **labeled explanatory current-cash surface** and exposes `data-testid="daily-result-current-cash"` so tests never accidentally match the header ticker.

This is a core correctness boundary.

### 7. Dashboard becomes a useful landing surface, not a second Reports panel

For `panelId === 'dashboard'`, compose:

1. Daily Result card;
2. existing Scorecard.

The card can navigate to:

- Reports for full completed-day evidence;
- Finance for loans / financing detail.

Use `ManagementPanelHost`’s existing `onSelectPanel`; do not create route state or a new navigation system.

### 8. Keep Reports as the detailed evidence surface

Do not mount `DailyResultSummary` on Reports. The existing `ReportsPanel` detail grid already renders revenue, operating income, operating cash flow, financing cash flow, cash-after, import spend, principal/interest activity, and the rest of the supporting evidence.

Add exactly one missing row to that existing `.metrics` grid:

- **Net cash change** = `summary.latest.netCashChange`.

Place it immediately after operating cash flow / financing cash flow so the recorded bridge reads naturally in one place.

Reports otherwise keeps unchanged:

- 7 / 14 / 30 chart window controls;
- existing detailed report expander;
- product/store/market/logistics evidence;
- existing aggregation semantics;
- existing `reportsPanel.empty` behavior.

This removes the duplicate Reports card, the extra host branch, and the split empty-state rule. Dashboard is the only Daily Result card surface; its “Reports” action opens this existing detailed evidence surface.

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

Add `data-testid="store-operating-result"` to the value.

Keep scope explanation compact so HPA-282 does not undo HPA-283’s bottom-sheet reachability work. Use the repo’s existing native disclosure idiom (`<details>/<summary>`, modeled on compact scope/finance disclosures) rather than an always-visible two-sentence paragraph:

> Uses this store report’s gross margin, store operating costs, and inventory loss only; import purchases and shared payroll, production, logistics, and financing are outside this store result.

Derive Day N from `game.reports.at(-1)?.day` only when `latestStoreReport` exists.

Do not modify `DailyStoreReport`, invent cost allocation, or add a store profit history.

### 10. Preserve honest empty and first-report states

No reports:

- Dashboard shows the Daily Result card’s “No completed-day results yet” state plus labeled current cash and Scorecard;
- Reports keeps its existing `reportsPanel.empty` state;
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

Presentation-only derived data:

- `ManagementPanelHost` derives one `DailyResultView | null` from `panelGame.reports` and passes it to the Dashboard card.

No additional writable state is required beyond existing management-panel selection.

No dismissal state, cache, global store, telemetry, or backend.

## Accessibility / responsive requirements

- latest-day heading includes explicit Day N;
- current cash is labelled separately from completed-day metrics;
- signed negative values remain readable;
- comparison always names previous day;
- navigation uses normal buttons;
- focus is never stolen arbitrarily: after a keyed panel swap destroys the focused control and focus falls to `<body>`, the host recovers focus onto the new panel tab (the document-level trap would only reclaim it on the next Tab);
- contributor meaning is available as text, not color;
- metric grid collapses cleanly at <=600px;
- keyboard navigation continues through existing management tabs/actions.

## Localization

Before adding HPA-282 copy, add one catalog-wide parity assertion in `locales.spec.ts` using the existing `collectLeafPaths`: Japanese and Traditional Chinese leaf paths must equal English leaf paths. This prevents silent English fallback from hiding future missing locale keys.

If that test exposes pre-existing intentional asymmetries, use a small explicit allowlist with reasons; do **not** allowlist any HPA-282 key. If pre-existing omissions are small/unintentional, fill them in this PR rather than adding another scoped feature-key list.

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

Extend the existing `report()` fixture in `reports.spec.ts`; do not fork a second `DailyReport` builder. Add options for the recorded fields needed by these cases while preserving the real company invariant `netIncome === operatingCashFlow`.

Cover:

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
- current cash displayed separately, including a fixture where live cash is 1,000 and report `cashAfter` is 800 so only `daily-result-current-cash` contains 1,000;
- three headline metrics: revenue, operating income, net cash change;
- Day N / Day N-1 labels;
- signed absolute deltas through `i18n.format.signedCurrency`;
- exact cash bridge;
- at most two contributors;
- divergence explanation;
- optional navigation callbacks;
- negative-value accessibility;
- pinned semantic test IDs;
- narrow-layout class/structure.

### Dashboard / Reports composition

Pin:

- `ManagementPanelHost` derives `buildDailyResultView(panelGame.reports)` once for Dashboard;
- Dashboard renders Daily Result + existing Scorecard;
- Dashboard Reports action switches through existing host navigation;
- Dashboard Finance action switches through existing host navigation;
- Reports does **not** mount Daily Result;
- Reports detail adds `netCashChange` beside operating/financing cash flow;
- existing report windows, empty state, and detailed evidence remain intact.

### Store inspector

Cover:

- no completed store report → em dash / unavailable result;
- latest report → revenue + `store-operating-result`;
- explicit Day N;
- collapsed compact scope disclosure;
- negative store result;
- selecting another store uses that store’s report only;
- existing HPA-283 upgrade actions remain reachable on the <=600px bottom sheet with the new result present.

### E2E

One focused management journey, reusing the existing `installSandboxAutoSave` / `replaceBrowserAutoSave` helpers instead of creating another browser-save fixture path:

1. load a deterministic game with completed report evidence;
2. open Dashboard;
3. assert explicit Day N completed result;
4. assert current cash is separate;
5. inspect the three distinct headline metrics;
6. follow Reports action and verify the existing detail grid includes recorded Net cash change beside operating/financing cash flow;
7. reopen Dashboard and follow Finance action where financing evidence exists;
8. select a store and verify the store-scoped result;
9. repeat the Dashboard Daily Result surface at a narrow viewport to prove readable stacking/keyboard access;
10. extend the existing <=600px store-card reachability regression so Upgrade/Open Details remain reachable with the new store operating result present.

Exact positive-income/negative-cash accounting edge cases remain cheaper and more deterministic in pure/component fixtures; the browser test proves navigation/composition, not a second simulation harness.

## Risks

### Existing company/store `netIncome` semantics differ

Company `DailyReport.netIncome` is an alias of operating cash flow, while store `DailyStoreReport.netIncome` is a store-scoped operating result.

Mitigation:

- do not surface company `netIncome` as a separate metric;
- do not rename or migrate either persisted field;
- label the store field “Store operating result” and disclose its scope, including excluded import purchases;
- use operating income + the exact cash-flow bridge for company-level explanation;
- keep economic changes out of this ticket.

### Double-counting cash contributors

Import spend and debt payments are already reflected in authoritative cash-flow totals.

Mitigation:

- show operating/financing totals as the reconciliation;
- label contributors as evidence only;
- never add them again to derive net cash change;
- reuse exported `getImportSpend(report)` so the daily card and report-window summaries agree even for hand-built fixtures.

### Current cash drift after day close

Player commands can change cash after the latest report, and the Dashboard header already shows the same live cash as an unlabeled ticker.

Mitigation:

- the Daily Result card’s labeled `daily-result-current-cash` is the authoritative HPA-282 explanatory surface;
- keep the existing header ticker unchanged;
- the Daily Result card never uses current cash in report arithmetic.

### Store result overclaim and narrow inspector budget

Store reports omit import purchases and company/shared costs, while the <=600px inspector is height-capped and recently gained the HPA-283 upgrade card.

Mitigation:

- label “Store operating result”;
- explicitly disclose that import purchases plus shared payroll, production, logistics, and financing are outside the store result;
- put the longer scope explanation behind a compact native disclosure rather than always-visible body copy;
- extend the existing <=600px store-card reachability regression instead of adding a second narrow inspector test;
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
