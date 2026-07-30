# Finance, Debt, Credit, and Cash Runway Design

**Date:** 2026-07-28

**Linear:** [HPA-277](https://linear.app/cwchanap/issue/HPA-277/finance-debt-credit-and-cash-runway-model)

**Status:** Approved design, review amendments incorporated, awaiting written-spec re-review

## Outcome

Make starting debt and financing decisions strategically meaningful. Debt becomes a set of
deterministic, inspectable loan obligations instead of an inert scalar, and every borrowing
action creates matching cash and liability changes.

The feature remains one implementation ticket with three staged delivery slices:

1. finance state, persistence, interest, and scheduled servicing;
2. borrowing, repayment, refinancing, and credit capacity;
3. reporting, alerts, finance UI, and decision/expansion integration.

## Current baseline

The current checkout has:

- `GameState.cash` and a scalar `GameState.debt`;
- archetype-specific `startingCash` and `startingDebt`;
- no interest accrual, repayment schedule, or debt servicing in `simulateDay`;
- cash-pressure and supplier-credit decisions that add cash without creating liabilities;
- reports that expose revenue, operating/import spending, `netIncome`, and ending cash without
  separating financing flows;
- seven Control Desk management panels and derived alerts with deep-link behavior;
- save schema version 10 with chained migrations and a pre-release compatibility policy;
  version 10 is already occupied by the rail-transport migration.

The scalar debt is currently inert outside construction, validation, scenario setup, and test
fixtures; no production UI reads it, and the initial profit score reads
`archetype.startingDebt` directly. The design therefore removes a low-coupling scalar and
introduces `getTotalDebt` for the new finance, reporting, alert, and credit consumers rather than
as a compatibility shim for existing UI.

## Goals

- Represent each obligation as a deterministic installment loan.
- Turn every new game's existing archetype debt into a real Founding Loan.
- Accrue simple interest daily and service due loans in a stable order.
- Handle insufficient cash without crashing or forcing debt-service cash below its existing
  negative balance.
- Provide typed, non-mutating failure results for all player finance actions.
- Derive available credit from cash flow, obligations, repayment history, and business health.
- Separate operating performance from financing cash flows in reports.
- Explain outstanding principal, interest, payments, credit, coverage, and runway.
- Reuse the same loan model for manual, emergency, supplier-credit, and expansion financing.
- Keep one company-level finance ledger across every city, store, industrial building, and route.
- Add an accessible Finance management panel and finance alerts with deep links.
- Decode existing supported saves according to the project's pre-release policy.

## Non-goals

- Full balance-sheet, accrual-accounting, taxation, or equity models.
- Collateral, lender marketplaces, variable-rate loans, balloon payments, or revolving credit.
- Compound interest, late fees, asset seizure, bankruptcy, or permanent default.
- A hidden credit score.
- Replacing HPA-276's broader capacity and supply forecast.
- New raster artwork or a new visual language.
- Financing store or industrial-building upgrades.
- Financing rail construction or rail upgrades.

## Approved product rules

- Missed payments consume available positive cash, interest first and principal second. Unpaid
  amounts become arrears.
- Arrears are swept from positive cash every day, including after the final scheduled installment.
- Any arrears reduce available credit to zero until cured.
- Interest continues on remaining principal, but arrears do not compound and attract no fee.
- Existing archetype starting debt becomes an automatic Founding Loan; the founding flow gains
  no extra financing-choice step.
- Finance is a dedicated Control Desk management panel.
- Scheduled payments use equal principal installments plus accrued interest every seven days.
- Player-selected working-capital terms are 28, 56, or 84 days.
- Cash-pressure emergency offers scale from $4,000 through $12,000 but never bypass delinquency.
- Refinancing is cash-neutral and never releases additional working capital.
- Finance is company-level; cities and individual entities do not own separate ledgers.

## Architecture

Finance follows the existing pure-transition architecture.

### New pure modules

- `src/lib/game/finance.ts`
  - loan creation and identifiers;
  - interest accrual and scheduled servicing;
  - borrowing, repayment, payoff, and refinancing;
  - finance transactions and reconciliation helpers;
  - credit assessment, offer rates, and decision-option availability;
  - typed success and failure results.
- `src/lib/game/financeMetrics.ts`
  - finance-overview aggregation over `finance.ts` projections;
  - debt-service coverage;
  - cash runway;
  - alert inputs and report-window finance summaries.

Finance types remain in `src/lib/game/types.ts`, matching the repository's central domain-type
pattern. Neither pure module accesses Svelte state, persistence, the route controller, or the
live RNG.

The dependency direction is one-way: `financeMetrics.ts` imports pure calculations from
`finance.ts`; `finance.ts` never imports `financeMetrics.ts`. Borrow, refinance, financed
purchase, and decision availability all call `assessCredit` inside `finance.ts`, so callers
cannot supply a stale precomputed assessment.

### UI and orchestration

- `FinancePanel.svelte` renders finance state and invokes typed actions through
  `GameRouteController`.
- `GameRouteController` commits successful actions through the existing sandbox/scenario,
  autosave, locking, and sound boundary.
- `simulateDay` calls the pure daily finance transition after operating cash flow is calculated.
- `alerts.ts`, `reports.ts`, and the route compose derived finance data; they do not own loan
  mutation rules.

## State model

`GameState.debt` is removed from the persisted domain model and replaced with:

```ts
interface FinanceState {
	loans: LoanInstrument[];
	transactions: FinanceTransaction[];
	nextLoanSequence: number;
	nextTransactionSequence: number;
	currentDayActivity: FinanceDayActivity;
}

interface FinanceDayActivity {
	day: number;
	principalBorrowed: number;
	principalRepaid: number;
	interestPaid: number;
	interestCapitalized: number;
	refinancedPrincipal: number;
	financingCashFlow: number;
}

type LoanPurpose =
	| 'founding'
	| 'workingCapital'
	| 'emergency'
	| 'supplierCredit'
	| 'expansion'
	| 'refinance';

type LoanStatus = 'active' | 'delinquent' | 'paid' | 'refinanced';

interface LoanInstrument {
	id: string;
	purpose: LoanPurpose;
	status: LoanStatus;
	openedOnDay: number;
	originalPrincipal: number;
	remainingPrincipal: number;
	annualInterestRateBps: number;
	termDays: 28 | 56 | 84;
	installmentsProcessed: number;
	nextPaymentDay: number | null;
	lastInterestAccrualDay: number;
	accruedInterestMicros: number;
	overdueInterest: number;
	overduePrincipal: number;
	arrearsSinceDay: number | null;
	scheduledPaymentCount: number;
	onTimePaymentCount: number;
	missedPaymentCount: number;
	refinancedFromLoanId?: string;
	refinancedByLoanId?: string;
}
```

Money that changes `cash` or principal uses whole game dollars. Interest accrual uses integer
microdollars so daily accrual is deterministic without repeatedly rounding whole dollars.
Rates use integer basis points.

Payment frequency is the module constant `LOAN_PAYMENT_FREQUENCY_DAYS = 7`.
`getInstallmentCount(termDays)` derives `4 | 8 | 12`; neither payment frequency nor installment
count is duplicated in persisted loan state.

New games initialize `currentDayActivity` with `day: 1` and zero amounts. Scenario setup and save
migration initialize the same accumulator with their actual starting/loaded day.

`getTotalDebt(game)` is the sole total-debt definition:

```ts
sum(active-or-delinquent loan.remainingPrincipal)
```

Filtering to open statuses documents the public meaning of outstanding debt. The closed-loan
zero-balance decoder invariant is deliberately redundant defense against malformed state, not a
second total-debt rule.

This is deliberately an **outstanding-principal** measure, not the full payoff amount.
`getTotalAmountDue(game)` separately sums
`remainingPrincipal + overdueInterest + ceil(accruedInterestMicros / 1_000_000)` for each active
or delinquent loan. Overdue principal is already included in remaining principal and is not
double-counted. Credit headroom uses outstanding principal; repayment controls and obligation
copy use the amount due or a per-loan payoff quote.

Paid and refinanced loans remain in history with zero remaining principal. Loan IDs are
monotonic (`loan-1`, `loan-2`, ...) and never reused.

Version 1 does not prune paid or refinanced loans because their counters are the durable
repayment-history input to credit assessment. The transaction ledger remains capped at 200
entries. Compacting closed instruments into a separate history summary can be considered later
if real save sizes justify it.

## Founding loans

Every new game creates one Founding Loan with:

- principal equal to the archetype's existing `startingDebt`;
- no additional cash change, because existing `startingCash` already reflects the current
  founding balance;
- 84-day term;
- fixed 12.00% promotional APR, rather than the normal 84-day offer rate;
- first payment on day 8;
- 12 weekly equal-principal installments.

The loan opens on day 1 and starts accruing on day 2. This produces seven accrual days before
the day-8 payment. Its initial `lastInterestAccrualDay` is `1`.

The initial profit score keeps its current
`archetype.startingCash - archetype.startingDebt` formula. Founding Loan construction uses the
same archetype value but does not become an extra scorecard dependency.

Turning founding debt into weekly service is an intentional balance change, not a neutral data
migration. Before sequence 1 is accepted, deterministic 28-day baselines for every archetype
must record cash before/after each payment, cash-reserve warnings, cash-pressure decisions, and
misses for review against the pre-finance behavior. The fixed day-8 schedule remains the default;
changing principal, rate, or grace period in response to that evidence is a product decision, not
an implementation-side balance tweak. An interest-only grace period is not part of this design
without that additional review.

## Interest and installment calculations

For each non-closed loan whose `game.day` is later than `lastInterestAccrualDay`, accrue each
missing day exactly once:

```ts
dailyInterestMicros = round(
	remainingPrincipal * annualInterestRateBps * 1_000_000 / (10_000 * 365)
);
```

Interest is simple:

- it accrues only on `remainingPrincipal`;
- overdue interest never earns interest;
- refinancing capitalizes the current payoff quote into a new principal, after which the new
  principal follows the same simple-interest rule.

For a loan with `N` installments:

```ts
basePrincipal = floor(originalPrincipal / N);
finalRemainder = originalPrincipal % N;
```

Installments 1 through `N - 1` schedule `basePrincipal`. The final installment schedules
`basePrincipal + finalRemainder`. Early principal repayments reduce future scheduled principal;
each due calculation is capped at the non-overdue remaining principal.

On an ordinary due date, whole-dollar accrued interest is moved to `overdueInterest` using
`floor(accruedInterestMicros / 1_000_000)`. The fractional remainder stays accrued. The final
installment uses `ceil` so a successfully completed loan closes with no stranded fractional
interest.

When a small principal produces a zero-dollar principal installment and no whole-dollar interest
is due, servicing advances the installment index and next-payment date without emitting a
transaction or incrementing `scheduledPaymentCount`, `onTimePaymentCount`, or
`missedPaymentCount`. Those counters describe positive payment obligations, not calendar
checkpoints. The final remainder still collects all unscheduled principal.

## Daily servicing

`game.day` is the calendar day currently open for player actions. `simulateDay` closes that
same day: it produces a report stamped with the current value and advances the state only after
the report is complete. A loan created on day `D` sets `lastInterestAccrualDay = D`,
`nextPaymentDay = D + 7`, and receives no same-day interest.

For one calendar day `D`, the normative order is:

1. the player performs any borrow, repay, build, or other actions while `game.day === D`; finance
   transactions are stamped `D`;
2. `simulateDay` starts while `game.day === D`;
3. day-`D` operating cash flow is applied;
4. finance accrues through `D`, then services every loan due on `D`;
5. scheduled finance transactions are also stamped `D`;
6. the reconciled `DailyReport` is stamped `D`;
7. the returned state advances to day `D + 1`.

The Founding Loan therefore follows this normative opening timeline:

| `state.day` at tick start | Interest accrued by tick | Payment due? | Scheduled cash movement | `report.day` | `lastInterestAccrualDay` after | Returned `state.day` |
| ---: | --- | --- | --- | ---: | ---: | ---: |
| 1 | none | no | none | 1 | 1 | 2 |
| 2 | day 2 | no | none | 2 | 2 | 3 |
| 3 | day 3 | no | none | 3 | 3 | 4 |
| 4 | day 4 | no | none | 4 | 4 | 5 |
| 5 | day 5 | no | none | 5 | 5 | 6 |
| 6 | day 6 | no | none | 6 | 6 | 7 |
| 7 | day 7 | no | none | 7 | 7 | 8 |
| 8 | day 8 | yes | interest then principal, limited by cash | 8 | 8 | 9 |
| 9 | day 9 | no | automatic arrears sweep if any arrears and positive cash remain | 9 | 9 | 10 |

This means the first payment belongs to the day-8 report and occurs on the day-8-to-day-9 tick,
not the day-7-to-day-8 tick. A golden unit test against this table is part of sequence-1
acceptance.

After operating cash flow is applied, the daily finance transition:

1. accrues interest through the current game day;
2. selects every loan due on the current day and orders them by `nextPaymentDay`, then
   `openedOnDay`, then loan ID;
3. moves each positive current interest/principal installment into overdue buckets, setting
   `arrearsSinceDay` when the first unpaid amount appears;
4. advances each due loan's installment index and sets its next weekly payment or `null` after
   the final scheduled installment;
5. moves whole-dollar post-maturity accrued interest into `overdueInterest`; when available cash
   can clear a matured loan's entire remaining payoff, it uses `ceil` once for the final
   fractional interest so the automatic sweep can close the loan;
6. selects every loan with arrears, including matured loans whose `nextPaymentDay` is `null`, and
   orders them by `arrearsSinceDay`, then `openedOnDay`, then loan ID;
7. every day, allocates `max(0, cash)` across that queue, overdue interest first and overdue
   principal second for each loan;
8. records interest and principal cash movements separately;
9. marks a loan delinquent if any due amount remains;
10. clears `arrearsSinceDay` and returns a non-matured loan to `active` immediately when its
   arrears clear;
11. marks a loan paid only when principal, overdue interest, and accrued interest are all cleared.

Debt service never makes a negative cash balance more negative. Operating simulation may still
produce negative cash.

If cash is insufficient:

- paid principal reduces both `overduePrincipal` and `remainingPrincipal`;
- unpaid principal remains in both values;
- unpaid interest remains in `overdueInterest`;
- `missedPaymentCount` increments once for that positive scheduled payment;
- `scheduledPaymentCount` increments once for that positive scheduled payment;
- later scheduled amounts stack on the existing arrears.

For each positive scheduled obligation, `onTimePaymentCount` increments only when the loan had no
arrears at the start of the day and that day's allocation clears the newly scheduled amount.
Otherwise `missedPaymentCount` increments once. Later daily sweeps never rewrite either result.

Clearing arrears before maturity returns the loan to `active`. A matured loan with a remaining
balance stays `delinquent`, continues simple-interest accrual on that principal, and participates
in the automatic arrears sweep every day; it does not require the player to discover a manual
repayment control. When scheduled allocation, the daily sweep, or a manual repayment clears every
arrears bucket on a non-matured loan, it returns to `active` immediately.

Loan service intentionally stacks with any import cycle or payroll cash drain that falls on the
same calendar day. This is part of the liquidity pressure model, not a scheduling exception.

## Finance transactions

Every cash-affecting finance transition appends structured entries:

```ts
type FinanceTransactionKind =
	| 'disbursement'
	| 'principalPayment'
	| 'interestPayment'
	| 'missedPayment'
	| 'refinance';

interface FinanceTransaction {
	id: string;
	day: number;
	kind: FinanceTransactionKind;
	loanId: string;
	relatedLoanId?: string;
	cashDelta: number;
	principalAmount: number;
	principalDelta: number;
	interestAmount: number;
}
```

Transactions use monotonic IDs, reference existing loans, and are retained in chronological
order. The state keeps the latest 200 transactions; pruning removes the oldest entries only
after a new entry is appended. Per-loan counters preserve repayment history after transaction
pruning.

The transaction ledger is explanatory history, not the report-reconciliation source. Every
finance action also folds its amounts into `finance.currentDayActivity`, whose `day` must equal
`game.day`. Manual actions and scheduled servicing update this fixed-size accumulator before
transaction pruning. `simulateDay` copies it into the day report and resets it to a zero-valued
accumulator for `D + 1` only after the day-`D` report is complete. Therefore even more than 200
same-day actions cannot remove cash-flow inputs needed by the exact report invariant.

`cashDelta` and `principalDelta` are signed changes:

- a disbursement has positive cash and principal deltas and records the disbursed principal as
  `principalAmount`;
- a principal payment has equal negative cash and principal deltas and records the paid principal
  as `principalAmount`;
- an interest payment has negative cash, zero principal delta, and positive `interestAmount`;
- a refinance has zero cash delta, uses the new loan as `loanId`, links the old loan through
  `relatedLoanId`, records the replacement principal as `principalAmount`, and records the net
  principal change caused by capitalized payoff interest; `interestAmount` records that
  capitalized interest explicitly;
- a missed-payment entry has zero cash and principal deltas and records the unpaid principal and
  interest as `principalAmount` and `interestAmount`.

## Player actions

All actions return a discriminated result:

```ts
type FinanceActionResult<TReceipt> =
	| { ok: true; game: GameState; receipt: TReceipt }
	| {
			ok: false;
			code: FinanceFailureCode;
			context: Record<string, string | number>;
	  };
```

Failure results return the original state by omission: callers cannot accidentally commit a
partially changed game.

### Borrow working capital

The player selects:

- a whole-dollar amount of at least $1,000;
- 28, 56, or 84 days.

The action calculates the term-specific assessment and rate, rejects an amount above available
credit, creates the loan, adds the exact principal to cash, and records a matching
disbursement.

### Partial repayment

Manual repayment applies in this order:

1. overdue interest;
2. whole-dollar accrued interest;
3. overdue principal;
4. other remaining principal.

The action rejects zero, negative, non-finite, or above-payoff amounts. It does not silently
clamp an overpayment.

### Full payoff

The payoff quote is:

```ts
remainingPrincipal
	+ overdueInterest
	+ ceil(accruedInterestMicros / 1_000_000);
```

A full payoff requires enough cash, clears all loan balances, and marks the loan paid. Repeating
the action on a closed loan returns `loanClosed`; a second commit of the same quoted payoff
therefore cannot duplicate the cash movement.

### Refinancing

Only one active, non-delinquent loan can be refinanced at a time.

- The replacement principal equals the old loan's payoff quote.
- The player selects 28, 56, or 84 days.
- The assessment is recomputed for the selected term with the old loan's remaining principal
  and projected payments excluded, while the old loan's repayment-history counters remain
  included.
- The replacement passes only when its payoff-quote principal is less than or equal to that
  hypothetical assessment's `availableCredit`.
- The replacement APR comes from that same hypothetical assessment.
- The old loan becomes `refinanced` with zero remaining principal.
- The new loan records `refinancedFromLoanId`; the old loan records `refinancedByLoanId`.
- Cash does not change and no cash-out refinancing is supported.

### Failure codes

The typed failure union includes:

- `loanNotFound`;
- `loanClosed`;
- `loanDelinquent`;
- `invalidAmount`;
- `belowMinimumBorrowing`;
- `insufficientCash`;
- `overpayment`;
- `unsupportedTerm`;
- `insufficientCredit`;
- `purchaseUnavailable`;
- `purchaseCostChanged`.

UI copy localizes these codes and their structured context. Domain results contain no
presentation strings.

## Credit assessment

Credit is term-specific and fully explainable.

### Inputs

```ts
averageDailyOperatingCashFlow =
	average(last up to 7 reports' operatingCashFlow) or 0;

weeklyOperatingCashFlow = max(0, averageDailyOperatingCashFlow * 7);

healthScore = average(
	scorecard.profit,
	scorecard.customerSatisfaction,
	scorecard.staffMorale,
	scorecard.marketPosition
);

healthFactor = 0.75 + 0.5 * (healthScore / 100);

missRate =
	totalScheduledPayments === 0
		? 0
		: totalMissedPayments / totalScheduledPayments;

historyFactor = max(0.5, 1 - 0.5 * missRate);
```

Per-loan scheduled and missed counters include closed loans, so repayment history survives
payoff and refinancing. `totalScheduledPayments` and `totalMissedPayments` are sums of the
per-loan counters across every active, delinquent, paid, and refinanced loan; transaction pruning
never changes credit capacity.

History is intentionally lifetime rather than time-decayed. A missed payment does not disappear
merely because days pass, but later positive scheduled payments dilute its share of the lifetime
denominator. Version 1 does not add a recency window or passive forgiveness.

### Principal headroom

```ts
grossPrincipalLimit = floor(
	(15_000
		+ weeklyOperatingCashFlow * 2
		+ max(0, cash) * 0.25)
	* healthFactor
	* historyFactor
);

grossPrincipalLimit = clamp(grossPrincipalLimit, 0, 100_000);

principalHeadroom = max(0, grossPrincipalLimit - getTotalDebt(game));
```

### Debt-service headroom

```ts
weeklyPaymentBudget = floor(
	(2_500 + weeklyOperatingCashFlow * 0.35)
	* healthFactor
	* historyFactor
);

existingWeeklyDebtService =
	sum(next scheduled principal + exact seven-day interest for every open loan);

weeklyServiceHeadroom =
	max(0, weeklyPaymentBudget - existingWeeklyDebtService);
```

Credit uses this normalized weekly obligation rather than a date-window sum. It therefore counts
a loan opened today and does not jump merely because a due date moves across a projection
boundary. Arrears still override the final assessment to zero.

For a proposed principal `P`, term installment count `N`, and offered rate in basis points,
credit projection calls the same integer helpers used by servicing. It simulates the complete
no-prepayment schedule, including the final principal remainder and final interest `ceil`:

```ts
projectedFirstPrincipal = floor(P / N);
projectedFirstInterestMicros = dailyInterestMicros(P, offeredRateBps) * 7;
projectedFirstInterest = floor(projectedFirstInterestMicros / 1_000_000);
projectedFirstWeeklyPayment = projectedFirstPrincipal + projectedFirstInterest;
projectedPeakWeeklyPayment = max(projectedWeeklyPayments);
```

When `weeklyServiceHeadroom === 0`, `maxPrincipalByService` is exactly zero even if a sub-
installment principal would produce a zero-dollar first checkpoint. Otherwise,
`maxPrincipalByService` is found with a deterministic whole-dollar downward scan from
`min(principalHeadroom, weeklyServiceHeadroom * installmentCount)` through `0`. The
interest-free upper bound is sound because any affordable principal satisfies
`ceil(principal / installmentCount) <= weeklyServiceHeadroom`; clamping to
`principalHeadroom` preserves the principal-cap constraint. It is the largest `P` whose exact
`projectedPeakWeeklyPayment <= weeklyServiceHeadroom`; checking the peak prevents a sub-`N`
principal from hiding its final remainder behind zero-dollar early checkpoints. Peak payments
are deliberately non-monotonic across consecutive principals, so a binary search would be
unsafe; the downward scan stays exact at remainder boundaries. Servicing, offer
previews, debt-service projections, and runway all reuse these integer principal and
micro-interest helpers; there is no separate floating-point payment formula.

```ts
availableCredit =
	min(principalHeadroom, maxPrincipalByService);
```

Any loan with arrears overrides the result to zero and adds the `delinquentObligation` reason.

The assessment returns every input, intermediate limit, final available amount, and stable
reason codes for localization and tests.

## Offer rates

Base APR by term:

| Term | Base APR |
| --- | ---: |
| 28 days | 10.00% |
| 56 days | 12.00% |
| 84 days | 14.00% |

The deterministic risk spread is:

```ts
healthPenaltyBps = round((100 - healthScore) * 6);
historyPenaltyBps = round(missRate * 800);
offeredRateBps = baseRateBps + healthPenaltyBps + historyPenaltyBps;
```

The Finance panel displays the base rate, each adjustment, and final APR. The Founding Loan is
fixed at 12.00% and is not retroactively repriced.

## Reporting

`DailyReport` adds:

- `cashBefore`;
- `operatingIncome`;
- `operatingCashFlow`;
- `interestAccrued`;
- `interestPaid`;
- `interestCapitalized`;
- `principalBorrowed`;
- `principalRepaid`;
- `refinancedPrincipal`;
- `financingCashFlow`;
- `netCashChange`;
- `outstandingPrincipalAfter`;
- `nextLoanPayment`.

Definitions:

```ts
operatingIncome = round(grossMargin - operatingCosts);

operatingCashFlow = round(revenue - operatingCosts - importSpend);

financingCashFlow =
	finance disbursement cash
	- principal-payment cash
	- interest-payment cash;

netCashChange = operatingCashFlow + financingCashFlow;

cashAfter = cashBefore + netCashChange;
```

`game.cash`, every cash-changing action, `operatingCashFlow`, `financingCashFlow`, and
`cashAfter` are whole-dollar integers. Simulation computes and rounds operating cash flow once,
stores that value in the report, passes that same value to `buildScorecard`, and advances cash by
that stored value. It does not independently round the report and resulting cash.

The existing `netIncome` field remains for compatibility during this ticket and equals
`operatingCashFlow`. New UI, summaries, finance metrics, and profit-score updates use the
explicit operating fields. Borrowed principal never improves profit or operating-performance
metrics. `buildScorecard` uses `operatingCashFlow`, never `financingCashFlow` or borrowed cash,
for the existing profit-score update.

`interestAccrued` is stored as decimal game dollars derived from the exact daily microdollar
change; it is not rounded to a whole dollar in the report. Cash movements, principal, and all
other report money remain whole game dollars. Financing report fields come from
`finance.currentDayActivity`, which includes manual actions earlier that day and scheduled
servicing produced by that day's simulation. Transactions provide itemized evidence but are not
reduced again to derive the report.

The save codec validates `interestAccrued` as a finite, non-negative number but deliberately
does not require an integer. Seven- and thirty-day report summaries sum the decimal values
without integer coercion; only currency presentation rounds or formats the aggregate.

`cashBefore` is the reconciliation baseline after non-financing player actions for that day but
before finance activity stamped with that day. At the start of `simulateDay`, it is reconstructed
as `game.cash - finance.currentDayActivity.financingCashFlow`. After scheduled servicing updates
the accumulator, the invariant
`cashAfter === cashBefore + netCashChange` must hold exactly. Build, upgrade, and other
non-financing purchases are therefore already reflected in `cashBefore` rather than being
misclassified as operating or financing cash flow.

Seven- and thirty-day summaries aggregate the new fields. The finance transaction ledger
provides itemized explanations for manual actions that occur between daily transitions.

Interest reconciliation is performed in microdollars, not by asserting that one day's decimal
`interestAccrued` equals whole-dollar `interestPaid`. Before a final payoff or refinance:

```ts
lifetimeInterestAccruedMicros =
	lifetimeInterestPaid * 1_000_000
	+ lifetimeInterestCapitalized * 1_000_000
	+ currentAccruedInterestMicros
	+ currentOverdueInterest * 1_000_000;
```

Final payoff and refinance use `ceil`, so each such close/capitalization may add a rounding
premium from zero through `999_999` microdollars. Tests calculate the exact premium and otherwise
require equality; a loan that closes without refinancing must have lifetime interest paid within
less than one dollar above its exact lifetime accrual.

## Derived finance metrics

`getFinanceMetrics(game)` returns:

- outstanding principal;
- next scheduled payment date and estimated amount;
- trailing seven-day operating cash flow;
- scheduled debt service for the next seven days;
- debt-service coverage;
- term-specific credit assessments;
- cash runway.

For display and debt-service coverage, “the next seven days” means calendar days `D + 1` through
`D + 7`, inclusive, where `D` is the currently open `game.day`. A payment due today is exposed
separately as the next-payment obligation and by the due-today alert. Unlike credit assessment,
this display metric intentionally reflects dated cash movement rather than normalized weekly
capacity.

Debt-service coverage is:

```ts
max(0, trailingSevenDayOperatingCashFlow)
	/ scheduledDebtServiceNextSevenDays;
```

When no payment is scheduled, coverage is `null` and the UI displays “No debt service due”
instead of infinity.

### Cash runway

Runway projects days 1 through 90 from current cash:

1. add `averageDailyOperatingCashFlow` from the trailing-seven-day window for each projected day;
2. subtract the principal and estimated interest scheduled on that day;
3. do not assume new borrowing, builds, policy changes, or random events;
4. return the first projected day whose cash is below zero;
5. return `0` when current cash is already below zero;
6. return `90+` when no projected day crosses below zero.

This is intentionally a focused liquidity estimate, not a second simulation engine.

## Alerts and deep links

Derived finance alerts are not persisted:

- `upcomingLoanPayment`: a payment is due today or on one of days `D + 1` through `D + 3`;
- `missedLoanPayment`: a loan has arrears;
- `covenantRisk`: debt-service coverage is non-null and below 1.25;
- `lowCashRunway`: runway is seven days or fewer.

`GameAlertKind` gains those four stable finance kinds. `GameAlert` gains optional
`loanId?: string` and `managementPanelId?: 'finance'`; it retains `message` as the English
fallback used by the existing alert contract. `localizeAlert` switches on the stable finance kind
and formats localized copy from current loan/metric state, following the existing
kind-plus-fallback pattern rather than persisting presentation strings.

Loan alerts carry both fields and open Finance with that loan focused. Aggregate risk and runway
alerts carry only `managementPanelId` and open the Finance overview. The route handles the panel
target before existing tile targets.

Global source order remains stock alerts, decision alerts, factory alerts, then finance alerts, so
the three existing groups retain their relative order. Within the finance group, missed payments
sort by `arrearsSinceDay`, then loan ID; upcoming payments sort by `nextPaymentDay`, then loan ID;
covenant risk and low runway follow in that order.

## Decision integration

The existing cash-pressure “Short loan” option becomes:

- purpose `emergency`;
- a fixed principal chosen when the decision is generated;
- 56-day term;
- current assessed APR.

The generated principal is:

```ts
roundedCapacity = floor(assessment56.availableCredit / 1_000) * 1_000;
emergencyPrincipal = min(12_000, max(4_000, roundedCapacity));
```

This preserves a meaningful $4,000 minimum, scales up to the existing $12,000 relief, and avoids
deleting the option for an otherwise creditworthy cash-short company with less than $12,000 of
capacity. The chosen amount is persisted in the decision's finance effect and shown in its
localized copy. Live availability still rechecks that exact amount; it disables when current
56-day credit falls below the offer, with the assessment reason shown in the Decision Queue.

This remains true during delinquency: arrears reduce credit to zero, so the emergency Short loan
cannot cure the crisis that caused it. That constraint is intentional. A delinquent player must
choose the existing “Cut costs” operational relief or recover through operations, then cure
arrears before new credit becomes available. “Cut costs” retains its existing $5,500 cash effect
as operational relief and does not create a liability.

The supplier “Negotiate credit” option becomes:

- purpose `supplierCredit`;
- $4,000 principal;
- 28-day term;
- current assessed APR.

It likewise disables when capacity is insufficient. The remaining scorecard/store effects stay
unchanged.

`DecisionOption.effects` gains this explicit optional member rather than encoding borrowing as a
positive `cash` effect:

```ts
interface DecisionFinanceEffect {
	kind: 'borrow';
	purpose: 'emergency' | 'supplierCredit';
	amount: number;
	termDays: 28 | 56;
}

interface DecisionOptionEffects {
	// Existing scorecard/store/cash fields remain.
	finance?: DecisionFinanceEffect;
}
```

Option availability is not persisted on the multi-day `DecisionItem`. `+page.svelte` derives a
keyed availability map from the current game using `getDecisionOptionAvailability` and passes it
to `DecisionQueue`, so cash-flow, health, credit, and arrears changes immediately update the
buttons and localized reasons.

`resolveDecision` defensively recomputes the same live availability. An unavailable option
returns the original game and remains queued. An available finance option calls the same pure
borrowing transition used by Finance; only after borrowing succeeds does resolution apply the
remaining scorecard/store effects and remove the decision. Scenario replay follows the same
path, so direct callers cannot bypass current credit capacity.

The existing missing-option behavior remains distinct: a missing option ID is a no-op under the
current decision contract, while a present but currently unavailable finance option returns the
original game and keeps the decision queued. Tests lock both paths.

Keeping the existing `profit` and `marketPosition` penalties in addition to the new repayment
obligation is a deliberate difficulty increase: the score effects represent reputational and
operational pressure, while the loan models the actual financing cost.

## Expansion financing

Supported financing entry points are:

- opening a revealed world city;
- retail-store placement with a discrete setup cost;
- industrial-building placement with a discrete build cost.

Each entry point exposes the offer before calling its existing cash-gated transition:

- World status keeps `canOpen` as the cash-only action and adds a derived `financeOffer`.
  `WorldMap` shows a separate “Finance opening” action when the city is revealed, cash is short,
  and the exact opening shortfall fits 84-day credit.
- Retail placement separates structural tile validity from funding. A cash-short Build Menu card
  remains selectable when credit can cover its minimum setup range; after the player selects a
  structurally valid tile, the exact setup cost and current cash determine the shortfall. The
  review re-runs the 84-day assessment against that exact principal before it can commit.
- Industrial placement uses the fixed building `buildCost`. A cash-short recipe card remains
  selectable when 84-day credit covers the exact shortfall, and the selected valid tile completes
  through the financed-build transition.

When neither cash nor credit covers the relevant amount, the current cash-required reason
remains and no financed action is shown. Existing `DecisionContext` cash-required variants
continue to protect direct domain callers; finance-offer failures use the typed finance failure
and assessment reason codes rather than new decision-context variants.

When cash is insufficient, the relevant confirmation surface offers an 84-day expansion loan
for:

```ts
purchaseCost - cash;
```

The exact shortfall must be positive and may be less than $1,000. The $1,000 minimum applies only
to voluntary working-capital borrowing; expansion financing never forces extra cash-out.

The offer appears only when 84-day available credit covers that principal. Financing and the
purchase commit atomically:

1. revalidate the target and current cost;
2. recompute the exact shortfall from the revalidated cost and current cash;
3. recompute the term assessment and reject when current credit no longer covers it;
4. create and disburse the expansion loan;
5. execute the existing purchase transition;
6. verify that the intended city/entity was created;
7. return the original state with a typed failure if any step fails.

A failed, stale, or changed-cost purchase can never leave a disbursed loan behind.

When cash already covers the purchase, the existing cash purchase remains the default; players
can still borrow separately through Finance if they want additional working capital.

## Finance management panel

Finance becomes an eighth `ManagementPanelId` and Control Desk launcher with the `F` shortcut.
It uses the existing parchment, brass, ink, moss, and wax-red Mercantile Ledger language.

### Overview

The opening view shows:

- cash;
- outstanding principal;
- total amount due, including interest and arrears;
- next payment;
- debt-service coverage;
- cash runway;
- 84-day available credit.

The credit explanation lists operating cash flow, existing obligations, health, repayment
history, principal headroom, and debt-service headroom.

Copy never labels principal alone as “debt due.” “Outstanding principal” always means
`getTotalDebt`; “Amount due” includes interest and arrears. The existing Top Bar does not gain a
principal-only debt ticker in this ticket. Finance alerts can change its existing alert count,
while obligation amounts and their definitions live in the Finance panel.

### Loan register

Each loan row/card shows:

- purpose and status;
- original and remaining principal;
- APR and term;
- arrears;
- next payment date and estimate;
- payoff quote;
- partial repayment, full payoff, and refinance actions.

Loan-specific alert navigation focuses and scrolls to the corresponding row.

### Borrowing

The borrowing form provides:

- labeled whole-dollar amount input;
- 28/56/84-day selector;
- offered APR and adjustment explanation;
- available credit for the selected term;
- estimated first, regular, and peak weekly payment;
- a review step followed by explicit confirmation.

Refinancing uses the same term comparison and review treatment but never offers a cash-out
amount.

### Activity

The panel lists the latest finance transactions in descending order with localized purpose,
cash, principal, and interest explanations.

### Accessibility and interaction

- Every input and status has an explicit accessible label.
- Validation appears beside its field and in a polite live status region.
- Borrow/refinance confirmation moves focus into the review surface and returns focus on cancel.
- Mutation controls disable while the route controller is committing.
- Loan status and alert severity never rely on color alone.
- The panel follows the existing overlay Escape, focus containment, and map-pause behavior.
- Narrow layouts stack metrics, forms, and the register without requiring horizontal scrolling.

## Route controller and scenario commands

`GameRouteController` gains finance methods that:

- run the pure action;
- expose typed failures without committing;
- commit successful state through the existing sandbox/scenario boundary;
- autosave only successful state changes;
- prevent duplicate submission while a scenario command is pending.

`ScenarioCommand` gains deterministic variants for:

- borrowing;
- partial/full repayment;
- refinancing;
- financed world-city opening;
- financed retail placement;
- financed industrial placement.

Command payloads contain stable IDs, whole-dollar amounts, terms, and expected costs. Scenario
runtime validation rejects stale targets or costs rather than substituting live values.

### Scenario starting debt

`ScenarioDefinition.start.overrides.debt` remains supported authoring sugar; scenarios do not
gain a second, arbitrary loan-list schema in this ticket.

- With no debt override, scenario setup retains the Founding Loan created by normal game setup.
- A positive whole-dollar override replaces that one Founding Loan with a Founding Loan whose
  original and remaining principal equal the override.
- A zero override removes the Founding Loan.
- The replacement opens on the scenario's current starting day, sets
  `lastInterestAccrualDay` to that day, schedules its first payment seven days later, uses the
  84-day term and fixed 12.00% promotional APR, and starts with neutral arrears and repayment
  counters.
- The override never changes cash; `start.overrides.cash` remains the only authored starting-cash
  override.
- Setup allocates loan and transaction sequences through the normal finance helpers, then applies
  the remaining authored overrides and validates the completed state.

Scenario validation continues to recognize `debt` in the closed override-key set but requires a
finite, non-negative whole-dollar value. Existing catalog values are the initial mapping, not a
claim of unchanged difficulty: before sequence 3 is accepted, all three official scenarios must
be replayed against their objectives, failure thresholds, projected scores, and medal bands with
the new weekly obligations. Any tuning to authored cash, debt, objectives, or thresholds must be
captured as explicit expected-score fixture changes rather than hidden in the finance model.
`src/lib/scenarios/metrics.ts` switches its profit-like report inputs from the compatibility
`netIncome` alias to explicit `operatingCashFlow`, preserving the current numbers while proving
that borrowing cannot satisfy operating-performance metrics.

## Persistence and compatibility

The save schema advances from version 10 to version 11, and `SAVE_SCHEMA_VERSION` becomes `11`.

### Version 10 to 11 migration

Version 10 already contains the rail-transport shape produced by `migrateV9Game`. Finance adds
`migrateV10Game` and `migrateV10SaveRecord` after that migration in both
`migrateSavedGameInternal` and `migrateSaveRecord`. `MIGRATABLE_SCHEMA_VERSIONS` adds version 10.

For each saved game:

1. read the scalar `debt`;
2. remove it from the migrated object;
3. create `finance` with empty sequences/history and a zero-valued
   `currentDayActivity` stamped with the loaded game day;
4. when debt is positive, create one Founding Loan:
   - principal and remaining principal equal saved debt;
   - 84-day term and 12.00% APR;
   - opening day equal the loaded game day;
   - last interest-accrual day equal the loaded game day;
   - first payment equal loaded day plus seven;
   - zero prior accrual, arrears, and repayment counters;
5. leave cash unchanged;
6. migrate historical reports with:
   - `cashBefore = old cashAfter - old netIncome`;
   - `operatingCashFlow = old netIncome`;
   - `operatingIncome = old grossMargin - old operatingCosts`;
   - zero historical finance activity;
   - `netCashChange = old netIncome`;
   - the migrated debt as the historical outstanding-principal snapshot;
   - no historical next-payment snapshot.

Older supported schema versions continue through the existing chained migrations, including the
version-9-to-10 rail migration, before the version-10-to-11 finance migration.

This follows the pre-release policy: it preserves currently supported data without inventing
retroactive missed payments, interest, or transactions. Migrated loans intentionally start with
neutral repayment history (`scheduledPaymentCount = 0`, `missedPaymentCount = 0`), even for
late-run saves; inferring either good or bad history from an inert legacy balance would be less
accurate.

### Validation invariants

Decode rejects finance state when:

- sequences are negative or non-integer;
- loan or transaction IDs are duplicated;
- amounts, rates, days, or counters are non-finite or negative;
- purpose, status, or term is unsupported;
- processed installments exceed `getInstallmentCount(termDays)`;
- overdue principal exceeds remaining principal;
- a paid/refinanced loan retains principal, accrued interest, or arrears;
- an active loan contains arrears;
- a delinquent loan has neither overdue interest nor overdue principal;
- `arrearsSinceDay` is missing for arrears or present without arrears;
- next-payment state contradicts the installment index;
- refinance links are missing, asymmetric, or cyclic;
- a transaction references an unknown loan;
- `currentDayActivity.day !== game.day`, an activity amount is not a whole-dollar integer, or
  its component cash movements do not reconcile to `financingCashFlow`;
- transaction ordering or the 200-entry cap is invalid.

Report decoding applies the existing finite-number checks to every added field.
`interestAccrued` alone may be fractional but must remain non-negative; whole-dollar cash,
principal, repayment, and borrowing fields retain integer validation. Report-summary decoding
and aggregation must not coerce `interestAccrued` to an integer.

Repository round-trip tests cover browser, in-memory, and Tauri-backed save paths through the
shared codec.

## Error handling

- Domain actions never throw for expected player errors.
- Malformed persisted finance state remains a `SaveDataError`.
- Internal invariant violations in development tests fail loudly.
- UI action failures preserve state, show localized reasons, and do not autosave.
- Atomic financed purchases return the original game on any validation or purchase failure.
- No retry path duplicates a disbursement, payoff, or refinance.

## Testing

### Pure finance tests

- Founding-loan construction for all archetypes.
- Golden Founding Loan day-1-through-day-9 timeline, including report/transaction stamps.
- Exact daily micro-interest accrual and no same-day accrual.
- Equal-principal installments and final remainder.
- On-time payment allocation and cash/liability reconciliation.
- Partial payment, full miss, accumulating arrears, and recovery.
- Daily arrears sweeps continue after maturity and cannot permanently strand a cash-positive loan.
- No compounding or late fees.
- Final payoff including fractional accrued interest.
- Microdollar lifetime-interest reconciliation, including payoff/refinance rounding premiums.
- Partial repayment allocation and overpayment rejection.
- Closed-loan and duplicate-payoff rejection.
- Cash-neutral refinancing and refinance-link invariants.
- Delinquent-refinance rejection.
- Stable multiple-loan ordering when cash is constrained.
- Zero-dollar installment checkpoints advance without transactions or repayment-history counters.
- Transaction IDs, ordering, references, and 200-entry pruning.
- More than 200 same-day transactions still reconcile through `currentDayActivity`.
- Paid/refinanced loans remain available to repayment-history calculations.

### Credit and metric tests

- No-report baseline.
- Positive and negative operating cash flow.
- Principal and debt-service headroom.
- Health and repayment-history adjustments.
- Lifetime misses recover only through later positive scheduled payments, not elapsed days.
- Zero credit during delinquency.
- Zero service headroom produces exactly zero credit for sub-installment principals.
- Term-specific capacity, exact integer full-schedule/peak-payment projection, and deterministic
  APR.
- Normalized existing weekly service has no due-date boundary sawtooth; the display window
  includes `D + 1` through `D + 7`.
- Debt-service coverage with and without scheduled payments.
- Runway at zero, finite days, and 90+.

### Simulation and reporting tests

- Operating cash flow precedes servicing.
- Operating cash flow is rounded once and the stored value advances cash exactly.
- Borrowing never improves operating performance or profit score.
- Daily and rolling finance fields reconcile to `currentDayActivity`; retained transactions
  provide itemized evidence but are not required to reconstruct a pruned day.
- Scheduled payment, interest, principal, and ending cash reconcile.
- Multiple loans retain stable order across save/load.
- Fractional `interestAccrued` survives codec round-trip and rolling-summary aggregation.

### Integration tests

- Cash-pressure and supplier decisions create loans, not free cash.
- Non-delinquent cash-pressure decisions scale to a fixed $4,000-$12,000 generated offer.
- Insufficient credit disables finance decision options with a reason.
- Missing decision options remain no-ops; unavailable finance options remain queued.
- Financed world, retail, and industrial purchases are atomic.
- Retail exact-cost revalidation rejects a now-insufficient credit assessment without disbursing.
- Scenario debt overrides create, replace, or remove the Founding Loan without changing cash.
- Archetype 28-day balance baselines and all official scenario objective/score fixtures are
  revalidated under scheduled debt service.
- Scenario commands record and replay finance actions deterministically.
- Autosave occurs only on successful mutations.

### Persistence tests

- Version-10 scalar debt migration with positive and zero debt.
- Migrated `currentDayActivity` is zero-valued and stamped with the loaded day.
- No retroactive interest, arrears, or repayment history.
- Historical report-field migration.
- Version-4-through-10 chained migration to version 11.
- Finance validation failures for each invariant class.
- Repository round trips.

### Component and end-to-end tests

- Finance overview, term switching, assessment explanations, and loan register.
- Borrow, repayment, payoff, and refinance validation.
- Keyboard access, focus movement, live status, and non-color status text.
- Alert-to-loan deep link.
- Playwright flow: take a loan, advance to a scheduled payment, follow the alert, and repay.
- Playwright financed-expansion happy path and stale-cost rejection where practical.

### Completion commands

- `bun run check`
- `bun run lint`
- `bun run test:unit -- --run`
- targeted `bun run test:e2e -- ...` finance flows
- full `bun run test:e2e`

## File plan

### New

- `src/lib/game/finance.ts`
- `src/lib/game/finance.spec.ts`
- `src/lib/game/financeMetrics.ts`
- `src/lib/game/financeMetrics.spec.ts`
- `src/lib/components/game/FinancePanel.svelte`
- `src/lib/components/game/FinancePanel.svelte.spec.ts`

### Modified

- `src/lib/game/types.ts`
- `src/lib/game/state.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/reports.ts`
- `src/lib/game/events.ts`
- `src/lib/game/alerts.ts`
- `src/lib/game/keyboardShortcuts.ts`
- `src/lib/game/world.ts`
- `src/lib/game/placement.ts`
- `src/lib/game/placementPreview.ts`
- `src/lib/game/industryPlacement.ts`
- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/scenarioRepository.testUtils.ts`
- save, repository, simulation, report, event, alert, shortcut, placement, world, and scenario specs
- `src/lib/scenarios/types.ts`
- `src/lib/scenarios/setup.ts`
- `src/lib/scenarios/metrics.ts`
- `src/lib/scenarios/runtime.ts`
- `src/lib/scenarios/catalog.ts`
- `src/lib/scenarios/validation.ts`
- `src/lib/scenarios/validation/start.ts`
- `src/lib/scenarios/validation/shared.ts`
- `src/routes/gameRouteController.ts`
- `src/routes/+page.svelte`
- `src/lib/components/game/ControlDesk.svelte`
- `src/lib/components/game/ShortcutCheatSheet.svelte`
- `src/lib/components/game/DecisionQueue.svelte`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/WorldMap.svelte`
- `src/lib/components/game/BuildMenu.svelte`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/IndustryTileInspector.svelte`
- corresponding route and component specs
- `src/lib/i18n/gameLabels.ts`
- `src/lib/i18n/gameCopy.ts`
- `src/lib/i18n/locales.ts`
- corresponding i18n specs
- targeted Playwright route coverage

`getDecisionOptionAvailability` remains in `finance.ts` because both finance-backed decision
options use the same credit transition; no separate availability module is needed. `TopBar.svelte`
is intentionally absent except for any incidental alert-count fixture update.

## Acceptance mapping

- Loan state, servicing, and migration satisfy implementation sequence 1.
- Typed borrowing, repayment, payoff, refinancing, and credit assessment satisfy sequence 2.
- Reports, metrics, alerts, decisions, expansion financing, and Finance UI satisfy sequence 3.
- Stable sort order, integer money changes, micro-interest accrual, the current-day accumulator,
  and transaction evidence provide deterministic reconciliation.
- The same `LoanInstrument` and finance actions power every borrowing entry point.
- The UI exposes obligations and the reasons behind cash, credit, and runway changes.
- Unit, persistence, component, scenario, and Playwright coverage map directly to HPA-277's
  acceptance criteria.
