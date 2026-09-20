# HPA-282 Daily Results & Profit-vs-Cash — Implementation Plan

> Implement this plan in the **same HPA-282 PR**. Do not split the read model, Dashboard/Reports presentation, store result, localization, or tests into separate PRs.

**Goal:** Surface one truthful completed-day result, explain the exact profit-vs-cash distinction from recorded report evidence, compare it with the prior completed day, and show a precisely scoped store operating result.

**Architecture:** Keep `DailyReport` / `DailyStoreReport` and `simulateDay` authoritative. Add one pure latest-day projection in `reports.ts`; render it through one reusable Daily Result component on Dashboard and Reports; reuse existing management-panel navigation for supporting detail. The selected-store inspector reads the existing store report directly. No schema, finance-engine, simulation, persistence, action-history, or analytics-framework work.

**Tech:** TypeScript, Svelte 5 / SvelteKit, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-19-daily-results-profit-cash-design.md`

## Global constraints

- One ticket / one PR.
- Completed reports remain the only historical source of truth.
- `netCashChange` is never recomputed from live cash.
- `operatingCashFlow + financingCashFlow` is the only displayed cash reconciliation.
- Contributors are supporting evidence, not another additive bridge.
- Never double-subtract import spend, principal repayment, or interest paid.
- Do not reinterpret existing `netIncome` semantics, and do not surface company `netIncome` as a separate headline because the real simulation aliases it to `operatingCashFlow`.
- No `DailyReport` / `DailyStoreReport` schema changes.
- No save codec/migration.
- No transaction/action ledger.
- No store cost-allocation model.
- No new report window/history.
- No finance rule changes.
- No economic rebalance.
- No new art or SFX.
- Preserve existing 7/14/30 report-window controls and detailed evidence.
- Reuse existing management navigation instead of route/deep-link infrastructure.

## Delivery shape

The implementation should stay small:

```text
DailyReport[]
    |
    v
buildDailyResultView (pure)
    |
    +--> DailyResultSummary --> Dashboard
    |                       --> Reports
    |
DailyStoreReport -----------> TileInspector
```

Do not route the card through a new global store or controller.

---

## Task 1 — Add the pure daily-result read model

**Modify**

- `src/lib/game/reports.ts`
- `src/lib/game/reports.spec.ts`

### 1.1 Extend the existing `report()` fixture first

Do not add a second `DailyReport` builder. Extend the existing `report()` helper in `reports.spec.ts` with options for the recorded fields needed by the projection, including:

- `operatingIncome`;
- store / production import spend;
- principal borrowed / repaid;
- interest paid;
- `financingCashFlow`;
- `netCashChange`.

Keep the real company invariant `netIncome === operatingCashFlow` in normal fixtures. Do not create a normal case where those differ; that would model a report the simulation does not produce.

Use the extended fixture for:

1. no reports;
2. one ordinary completed day;
3. two completed days with absolute comparison;
4. positive operating income + negative net cash change from recorded cash pressure;
5. import-purchase evidence;
6. principal-repayment evidence;
7. borrowing inflow;
8. paid interest;
9. more than two candidate contributors;
10. equal-magnitude candidates.

Do not run `simulateDay` just to test a presentation projection.

### 1.2 Add `buildDailyResultView`

Add the read-model types beside the existing report summary types:

```ts
export type DailyCashContributorKind =
  | 'import-spend'
  | 'principal-repaid'
  | 'interest-paid'
  | 'principal-borrowed';

export interface DailyCashContributor {
  kind: DailyCashContributorKind;
  amount: number;
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

Implementation rules:

- use `reports.at(-1)`;
- use only `reports.at(-2)` for comparison;
- absolute signed deltas, no percentages;
- signed contributor values;
- remove zero contributors;
- sort by `Math.abs(amount)` descending;
- break ties by the fixed candidate declaration order;
- `.slice(0, 2)`.

Do not change `ReportSummary` shape; that would force unrelated fixture churn for no product value.

### 1.3 Pin exact accounting boundaries

Tests must explicitly prove:

```text
latest.netCashChange is consumed directly
latest.operatingCashFlow is consumed directly
latest.financingCashFlow is consumed directly
```

The helper must not derive any of those values.

Also prove the source report objects/array are not mutated.

### 1.4 Keep non-cash evidence out of contributors

Do not add:

- `interestAccrued`;
- `interestCapitalized`;
- `refinancedPrincipal`;
- `inventoryLossExpense`.

These can remain visible in existing Reports detail.

Run:

```bash
bun run test:unit -- --run src/lib/game/reports.spec.ts
```

---

## Task 2 — Build one reusable Daily Result component and localized copy

**Create**

- `src/lib/components/game/DailyResultSummary.svelte`
- `src/lib/components/game/DailyResultSummary.svelte.spec.ts`

**Modify**

- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/i18n/locales.spec.ts` only if explicit key-parity coverage requires updates

### 2.1 Component API

Keep the API presentation-only:

```ts
interface Props {
  reports: readonly DailyReport[];
  currentCash: number | null;
  i18n: I18nBundle;
  onOpenReports?: () => void;
  onOpenFinance?: () => void;
}
```

The component calls `buildDailyResultView(reports)`.

No `GameState`, controller, mutation callback, or writable state.

### 2.2 Empty state

When the view is null:

- render “No completed-day results yet”;
- do not render zero revenue/income/cash change;
- if `currentCash !== null`, render it in a separate current-cash block;
- do not render comparison/contributors.

### 2.3 Latest completed result

Render:

- explicit “Day N completed result”;
- Revenue;
- Operating income;
- Net cash change.

Do **not** render company `netIncome`; in the real write path it duplicates `operatingCashFlow`, which already appears in the cash bridge.

Each metric may render a comparison subline only when `comparison !== null`:

```text
+$120 vs Day 6
-$45 vs Day 6
```

No percentages.

Reuse `i18n.format.currency` for all currency values. A tiny local `formatSignedDelta` may prefix `+` when the delta is positive, then delegate the amount formatting to `i18n.format.currency`. Do not create another currency formatter.

### 2.4 Separate live cash

Render “Current cash” outside the completed-day metric group.

Never label `latest.cashAfter` as current.

If `currentCash === null`, omit the live-cash value rather than falling back to report cash.

### 2.5 Exact cash bridge

Render the recorded totals as one readable equation/flow:

```text
Operating cash flow      $A
Financing cash flow      $B
Net cash change          $C
```

Do not add contributor amounts into this equation.

### 2.6 Explanation / evidence

If `latest.operatingIncome > 0 && latest.netCashChange < 0`, show the focused divergence copy.

Otherwise show the neutral distinction between operating performance and cash movement.

For `view.contributors`:

- map the four closed contributor kinds to localized labels;
- render at most two;
- label them as “Recorded cash contributors” / equivalent;
- do not say “caused by”.

If contributors are empty, omit the list.

### 2.7 Optional actions

If supplied:

- `onOpenReports` → Reports;
- `onOpenFinance` → Finance.

Normal buttons only. No bespoke focus handling.

### 2.8 Component tests

Cover:

- no-report state;
- current cash separate from report, with a pinned fixture where live cash is 1,000 and `latest.cashAfter` is 800 and only 1,000 appears in the current-cash block;
- exact three headline metrics;
- one-report no comparison;
- signed delta with explicit previous day;
- negative values;
- exact operating/financing/net bridge;
- positive-operating / negative-cash explanation;
- contributor ordering + at-most-two presentation;
- optional Reports callback;
- optional Finance callback;
- buttons absent when callbacks omitted.

Run:

```bash
bun run test:unit -- --run src/lib/components/game/DailyResultSummary.svelte.spec.ts
bun run check
```

---

## Task 3 — Reuse the card on Dashboard and Reports

**Modify**

- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`

`ReportsPanel.svelte` and its existing specs should remain unchanged unless implementation reveals a real integration need. The host already owns composition and has both `panelGame.reports` and panel navigation.

### 3.1 Dashboard composition

For `panelId === 'dashboard'`, render:

```text
DailyResultSummary
Scorecard
```

Pass:

- `reports={panelGame.reports}`;
- `currentCash={panelGame.cash}`;
- Reports action → `onSelectPanel('reports')`;
- Finance action → `onSelectPanel('finance')`.

Keep Scorecard unchanged.

Add one small `.dashboard-surfaces` grid/gap rule if needed. Do not build a Dashboard component merely to wrap two children.

### 3.2 Pin host navigation

In `ManagementPanelHost.svelte.spec.ts`, prove:

- Dashboard renders latest completed result;
- Reports action calls/switches the existing panel selection path;
- Finance action does the same;
- scorecard remains present.

Do this before E2E so browser failures are not used to debug host wiring.

### 3.3 Reports composition stays in the host

Do **not** make `ReportsPanel` own a second report-history input and do not synthesize `[summary.latest]`.

In the existing `panelId === 'reports'` branch, compose:

```text
if summary.latest exists:
  DailyResultSummary(
    reports = panelGame.reports,
    currentCash = panelGame.cash,
    onOpenFinance = () => onSelectPanel('finance')
  )

ReportsPanel(existing props)
```

When `summary.latest` is absent, skip the Daily Result card entirely so `ReportsPanel` keeps its existing `reportsPanel.empty` message as the sole Reports empty state.

This also means existing `ReportsPanel.svelte.spec.ts` cases that omit `game` do not need fake one-day history or another empty-state assertion.

### 3.4 Preserve existing report UX

Do not change:

- revenue/cost chart math;
- 7/14/30 controls;
- by-store/by-product evidence;
- report details;
- market/logistics/modifier sections.

The new card is an explanation layer above them.

### 3.5 Host composition tests

In `ManagementPanelHost.svelte.spec.ts`, add focused assertions for:

- Dashboard explicit latest Day N card;
- three headline metrics;
- current cash separate;
- Reports callback from Dashboard;
- Finance callback from Dashboard;
- Reports branch renders the same card when a latest report exists;
- Reports branch does **not** render the card when no latest report exists;
- Scorecard and existing ReportsPanel remain present.

Keep existing ReportsPanel chart/window/detail specs unchanged.

Run:

```bash
bun run test:unit -- --run src/routes/ManagementPanelHost.svelte.spec.ts
```

---

## Task 4 — Add the precise store operating result to the existing inspector

**Modify**

- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- locale files from Task 2

### 4.1 Keep the store report authoritative

Derive:

```ts
const dailyRevenue = $derived(latestStoreReport?.revenue ?? null);
const dailyStoreResult = $derived(latestStoreReport?.netIncome ?? null);
const latestReportDay = $derived(
  latestStoreReport ? (game.reports.at(-1)?.day ?? null) : null
);
```

Do not calculate the store result in Svelte.

### 4.2 Present result beside sales

Reuse the existing revenue block/sparkline area.

Show:

- revenue;
- “Store operating result”;
- Day N when known.

Keep the existing 14-day revenue sparkline; do not add a second profit chart.

### 4.3 Scope disclosure

Add one compact localized disclosure:

```text
Uses this store report's gross margin, store operating costs, and inventory loss only.
Import purchases and shared payroll, production, logistics, and financing are outside this store result.
```

This avoids implying company-wide profit allocation.

### 4.4 Honest unavailable state

If `latestStoreReport === null`:

- both result values remain unavailable/em dash;
- no Day 0;
- no fake zero result.

### 4.5 Inspector tests

Cover:

- no report;
- positive store result;
- negative store result;
- explicit Day N;
- disclosure text;
- selecting a different store/report updates result;
- existing HPA-283 upgrade card/reachability behavior remains unchanged.

Run:

```bash
bun run test:unit -- --run src/lib/components/game/TileInspector.svelte.spec.ts
```

---

## Task 5 — Add one browser journey and run final gates

**Modify**

- `src/routes/retail-sim.e2e.ts`

Use `src/routes/time-flow.e2e.ts` only as an affected verification target; do not duplicate its time-advance harness unless the focused journey genuinely belongs there.

### 5.1 Deterministic completed-result journey

Reuse the existing `installSandboxAutoSave` / `replaceBrowserAutoSave` helpers instead of creating a new fixture framework.

The browser journey should:

1. load a game with at least two completed reports;
2. keep live current cash intentionally different from the latest report’s `cashAfter` so the separation is observable;
3. open Dashboard;
4. assert “Day N completed result”;
5. assert Revenue / Operating income / Net cash change;
6. assert current cash separately;
7. assert absolute comparison references the preceding Day N-1;
8. click Reports and verify existing supporting report detail;
9. navigate to Finance via the Daily Result action and verify the existing finance panel;
10. return to retail map, select a store, and assert Day N store operating result + scope.

Do not create a browser-only accounting implementation. The save/report fixture is the source.

### 5.2 Narrow-layout / keyboard smoke

At <=600px, in the same deterministic setup:

- open the management Dashboard;
- assert the Daily Result metric blocks stack/read without horizontal clipping;
- tab to a supporting-detail action and activate it;
- assert negative values remain text-visible.

Do not repeat the whole journey at the narrow viewport.

### 5.3 Keep exact accounting edges in unit/component tests

The following remain fixture-level tests, not expensive E2E scenarios:

- profitable operating result + negative cash;
- inventory import pressure;
- principal repayment;
- equal contributor ties;
- zero previous values.

### 5.4 Full verification

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
git diff --check main...HEAD
```

Also keep the existing daily accounting reconciliation tests green:

```bash
bun run test:unit -- --run src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
```

Do not expand HPA-282 into accounting fixes if an unrelated existing failure appears.

## Completion checklist

- [ ] `buildDailyResultView` is pure and lives in `reports.ts`.
- [ ] `ReportSummary` shape remains unchanged.
- [ ] Latest + previous report only; no new history/window.
- [ ] Three distinct headline metrics are explicitly dated; company `netIncome` is not shown as a duplicate of operating cash flow.
- [ ] Comparisons are absolute signed deltas with explicit previous day.
- [ ] No report = no fabricated zeros.
- [ ] Current cash is visibly separate and live.
- [ ] Net cash change is consumed from the report, never wallet-derived.
- [ ] Operating + financing cash flow exactly reconcile displayed net cash change.
- [ ] Contributor evidence is at most two, deterministic, and not added twice.
- [ ] Interest accrued is not presented as paid cash.
- [ ] Principal repayment is not presented as another operating expense.
- [ ] Dashboard reuses existing panel navigation.
- [ ] Reports keeps existing 7/14/30 windows and detailed evidence.
- [ ] Store inspector uses `DailyStoreReport.netIncome` directly.
- [ ] Store result disclosure explicitly excludes import purchases and shared/company-level costs.
- [ ] EN / JA / zh-Hant copy is complete.
- [ ] Narrow/keyboard smoke passes.
- [ ] No schema, persistence, simulation, finance-engine, allocation, backend, art, or SFX work.
- [ ] Full gates pass.
