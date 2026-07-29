# Finance, Debt, Credit, and Cash Runway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inert scalar debt balance with deterministic loan instruments, daily servicing, explainable credit and runway metrics, finance-backed decisions and expansions, and a complete Finance management surface.

**Architecture:** `finance.ts` owns persisted finance state, exact micro-interest arithmetic, servicing, credit assessment, actions, decision availability, and atomic financed-purchase transitions. `financeMetrics.ts` imports that domain layer one way to derive display/report metrics and the 90-day runway projection. `simulateDay.ts` remains the daily orchestrator: it commits operating cash flow first, services finance second, writes the report from `currentDayActivity`, then resets that accumulator for the next day. Route and scenario controllers commit only successful typed action results.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes), Vitest, Playwright, browser/local and Tauri persistence.

**Spec:** `docs/superpowers/specs/2026-07-28-finance-debt-credit-cash-runway-design.md` — read it before starting every task. The spec is authoritative when this plan abbreviates a rule.

## Global Constraints

- Use `bun`; targeted server tests run with `bun run test:unit -- <files> --run --project server`, Svelte component tests add `--project client`.
- Every Vitest test must execute at least one `expect` because `expect.requireAssertions` is enabled.
- The simulation remains pure, immutable, deterministic, and seed-driven. Finance must not consume RNG or use wall-clock time.
- Cash and principal mutations are whole-dollar integers. Interest accrues in non-negative integer microdollars and is rounded to a whole dollar only at the explicit payment/close boundaries in the spec.
- `FinanceState.currentDayActivity`, not the capped transaction list, is the report reconciliation source. The transaction list is evidence only and is capped at 200 entries.
- Derive installment count from `termDays`; never persist a second count that can contradict it.
- Stable ordering uses `arrearsSinceDay`, then `openedOnDay`, then `id`, with ordinary string comparison rather than locale-sensitive sorting.
- Expected player failures return `FinanceActionResult`; they do not throw. Malformed persisted state still throws `SaveDataError`.
- A financed purchase is atomic: if target, cost, credit, transition, or postcondition validation fails, return the original `GameState` and leave no disbursement behind.
- Keep the existing cash purchase as the default. Only world-city opening, retail placement, and industrial placement gain embedded financing; upgrades and rail do not.
- `ScenarioDefinition.start.overrides.debt` remains authoring sugar. It is not reintroduced on `GameState`.
- Preserve the `DailyReport.netIncome` compatibility alias, but all new operating-performance logic reads `operatingCashFlow`.
- All user-facing copy goes through i18n. Add every key to `en`, `ja`, and `zh-Hant`, and update catalog-completeness tests.
- For every modified `.svelte` file, follow `CLAUDE.md`: call the Svelte MCP `list-sections` first, fetch every relevant section, and run `svelte-autofixer` until it reports no issues.
- Do not add a debt ticker to `TopBar.svelte`. Its existing alert-count behavior may change incidentally.
- Commit after every task. Do not combine task commits unless a preceding red/green slice cannot compile independently.

## File and Responsibility Map

**New domain files**

- `src/lib/game/finance.ts` — finance constructors, IDs, arithmetic, servicing, ledger, actions, credit, decision availability, and financed-purchase transitions.
- `src/lib/game/finance.spec.ts` — domain, action, decision, and atomic-purchase coverage.
- `src/lib/game/financeMetrics.ts` — finance overview, scheduled-service display window, coverage, runway, and rolling finance summaries.
- `src/lib/game/financeMetrics.spec.ts` — metric and projection coverage.
- `src/lib/components/game/FinancePanel.svelte` — overview, loan register, borrowing/refinance review, repayment actions, and transaction activity.
- `src/lib/components/game/FinancePanel.svelte.spec.ts` — accessibility and interaction coverage.

**Existing domain boundaries**

- `src/lib/game/types.ts` owns persisted shapes only.
- `src/lib/game/state.ts` creates the Founding Loan and resolves non-finance decision effects.
- `src/lib/game/simulateDay.ts` owns operation → finance servicing → report → D+1 sequencing.
- `src/lib/game/reports.ts` aggregates stored report fields without re-deriving finance.
- `src/lib/game/events.ts` generates stable finance effects in decisions.
- `src/lib/game/world.ts`, `placement.ts`, and `industryPlacement.ts` retain their cash-only transitions; finance wraps them atomically.
- `src/lib/game/placementPreview.ts` separates structural eligibility from cash/credit availability for the building-first workflow.

**Orchestration and persistence**

- `src/routes/gameRouteController.ts` adapts typed finance results to sandbox autosave and deterministic scenario commands.
- `src/lib/scenarios/*` validates, records, replays, and scores finance commands while preserving authored `debt` overrides.
- `src/lib/persistence/saveCodec.ts` performs v10→v11 migration and strict finance validation.
- `src/routes/+page.svelte` owns review-surface state, panel wiring, alert deep links, and financed-purchase confirmations.

---

### Task 1: Finance state model, founding loans, and scalar-debt removal

**Files:**

- Create: `src/lib/game/finance.ts`
- Create: `src/lib/game/finance.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/placement.ts`
- Modify: `src/lib/scenarios/setup.ts`
- Modify: `src/lib/scenarios/setup.spec.ts`
- Modify: every current-state fixture found by `rg -n '\bdebt:\s*|\.debt\b' src --glob '*.{ts,svelte}'`

**Interfaces:**

```ts
// types.ts
export type LoanPurpose =
	| 'founding'
	| 'workingCapital'
	| 'emergency'
	| 'supplierCredit'
	| 'expansion'
	| 'refinance';
export type LoanStatus = 'active' | 'delinquent' | 'paid' | 'refinanced';
export type LoanTermDays = 28 | 56 | 84;

export interface LoanInstrument {
	id: string;
	purpose: LoanPurpose;
	status: LoanStatus;
	openedOnDay: number;
	originalPrincipal: number;
	remainingPrincipal: number;
	annualInterestRateBps: number;
	termDays: LoanTermDays;
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

export type FinanceTransactionKind =
	| 'disbursement'
	| 'principalPayment'
	| 'interestPayment'
	| 'missedPayment'
	| 'refinance';

export interface FinanceTransaction {
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

export interface FinanceDayActivity {
	day: number;
	principalBorrowed: number;
	principalRepaid: number;
	interestPaid: number;
	interestCapitalized: number;
	refinancedPrincipal: number;
	financingCashFlow: number;
}

export interface FinanceState {
	loans: LoanInstrument[];
	transactions: FinanceTransaction[];
	nextLoanSequence: number;
	nextTransactionSequence: number;
	currentDayActivity: FinanceDayActivity;
}

// GameState removes debt: number and gains finance: FinanceState.
```

```ts
// finance.ts
export const LOAN_PAYMENT_FREQUENCY_DAYS = 7;
export const FOUNDING_LOAN_TERM_DAYS = 84;
export const FOUNDING_LOAN_APR_BPS = 1_200;
export const FINANCE_TRANSACTION_LIMIT = 200;

export function createEmptyFinanceState(day: number): FinanceState;
export function createFoundingFinanceState(day: number, principal: number): FinanceState;
export function replaceFoundingLoan(
	finance: FinanceState,
	day: number,
	principal: number
): FinanceState;
export function getInstallmentCount(termDays: LoanTermDays): number;
export function getTotalDebt(game: Pick<GameState, 'finance'>): number;
export function getTotalAmountDue(game: Pick<GameState, 'finance'>): number;
```

- [ ] **Step 1: Write failing constructor tests**

Add tests that create a new game for every archetype and assert:

```ts
it.each(ARCHETYPES)('creates one promotional founding loan for $name', (archetype) => {
	const game = createNewGame(archetype.id, 123);
	const loan = game.finance.loans[0]!;

	expect(game.cash).toBe(archetype.startingCash);
	expect(loan).toMatchObject({
		id: 'loan-1',
		purpose: 'founding',
		status: 'active',
		openedOnDay: 1,
		originalPrincipal: archetype.startingDebt,
		remainingPrincipal: archetype.startingDebt,
		annualInterestRateBps: 1_200,
		termDays: 84,
		installmentsProcessed: 0,
		nextPaymentDay: 8,
		lastInterestAccrualDay: 1,
		accruedInterestMicros: 0,
		overdueInterest: 0,
		overduePrincipal: 0,
		arrearsSinceDay: null,
		scheduledPaymentCount: 0,
		onTimePaymentCount: 0,
		missedPaymentCount: 0
	});
	expect(game.finance.nextLoanSequence).toBe(2);
	expect(game.finance.nextTransactionSequence).toBe(1);
	expect(game.finance.transactions).toEqual([]);
	expect(game.finance.currentDayActivity).toEqual({
		day: 1,
		principalBorrowed: 0,
		principalRepaid: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0
	});
});
```

Also test zero-principal state, 4/8/12 installment derivation, closed loans being excluded from total debt, and `getTotalAmountDue(game)` including overdue plus `Math.ceil(accruedInterestMicros / 1_000_000)`.

- [ ] **Step 2: Run the red test**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts --run --project server
```

Expected: FAIL because `finance.ts`, the finance types, and `GameState.finance` do not exist.

- [ ] **Step 3: Add types and constructors**

Implement the exact interfaces above. Use monotonic IDs (`loan-${nextLoanSequence}`, `finance-transaction-${nextTransactionSequence}`); do not derive them from array length. `createFoundingFinanceState` must keep cash out of its API so creating or replacing a founding balance cannot accidentally alter cash.

`replaceFoundingLoan` removes only the current Founding Loan, retains unrelated loans and history, allocates a fresh sequence when `principal > 0`, and creates none when `principal === 0`.

- [ ] **Step 4: Wire all new games and scenario setup**

In `createNewGame`, remove `debt` and call:

```ts
finance: createFoundingFinanceState(1, archetype.startingDebt)
```

Keep the existing cash and store economics unchanged. `createFoundingGameAtTile` continues to inherit the finance state from `createNewGame`.

In scenario setup, snapshot `{ cash, finance }` instead of `{ cash, debt }`. Preserve the authored `overrides.debt` field, but apply it with `replaceFoundingLoan` after the starting day is known:

```ts
finance:
	overrides.debt === undefined
		? baseFinances.finance
		: replaceFoundingLoan(baseFinances.finance, game.day, overrides.debt)
```

Keep `cash` controlled only by `overrides.cash`. Add setup tests for missing, positive, and zero debt overrides and assert neutral counters, day-relative first payment, and unchanged cash.

- [ ] **Step 5: Remove current-state scalar debt usage**

Update direct `GameState` fixtures to use `createEmptyFinanceState(day)` or `createFoundingFinanceState(day, principal)`. Keep `debt:` only in scenario definitions/tests that intentionally exercise authoring sugar and in v10 migration fixtures added later.

Run:

```bash
rg -n '\.debt\b|\bdebt:\s*' src --glob '*.{ts,svelte}'
```

Expected: only scenario override data/tests and intentional legacy-save fixtures remain.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts src/lib/game/state.spec.ts src/lib/scenarios/setup.spec.ts --run --project server
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game src/lib/scenarios src/routes src/lib/components src/lib/persistence
git commit -m "feat(finance): model founding loans"
```

---

### Task 2: Exact interest arithmetic, installments, servicing, and ledger evidence

**Files:**

- Modify: `src/lib/game/finance.ts`
- Modify: `src/lib/game/finance.spec.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`

**Interfaces:**

```ts
export interface FinanceServicingResult {
	finance: FinanceState;
	cash: number;
	interestAccruedThisDayMicros: number;
}

export function calculateDailyInterestMicros(
	principal: number,
	annualInterestRateBps: number
): number;
export function getScheduledPrincipalForInstallment(
	loan: LoanInstrument,
	installmentIndex: number
): number;
export function estimateNextLoanPayment(loan: LoanInstrument): number;
export function appendFinanceTransaction(
	finance: FinanceState,
	transaction: Omit<FinanceTransaction, 'id'>
): FinanceState;
export function serviceFinanceForDay(input: {
	finance: FinanceState;
	cash: number;
	day: number;
}): FinanceServicingResult;
export function resetFinanceDayActivity(finance: FinanceState, nextDay: number): FinanceState;
```

The exact daily formula is:

```ts
Math.round(
	(remainingPrincipal * annualInterestRateBps * 1_000_000) / (10_000 * 365)
);
```

- [ ] **Step 1: Write the golden timeline and arithmetic tests**

Add a day-1-through-day-9 Founding Loan test with deterministic expected:

- no same-day accrual on day 1;
- one daily micro-interest accrual on days 2–8;
- the first equal-principal obligation on day 8;
- transaction and activity stamps use the serviced day;
- returned cash and liabilities reconcile;
- day 9 starts from the post-payment principal.

Add focused tests for:

- exact micro-interest calculation and no arrears compounding;
- equal principal with a non-divisible final remainder;
- zero-dollar installment checkpoints advancing without transactions or history counters;
- full on-time payment;
- partial payment and full miss;
- arrears accumulation and a daily recovery sweep after maturity;
- stable servicing order for multiple cash-constrained delinquent loans;
- final fractional accrued interest closing with one ceiling operation;
- paid/refinanced loans being excluded from servicing but retained in the array;
- transaction IDs, chronological ordering, and pruning to the newest 200 entries;
- 201 same-day transactions still reconciling through `currentDayActivity`.

Use a small loan factory inside the spec; do not weaken production types with test-only optional fields.

- [ ] **Step 2: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts --run --project server
```

Expected: FAIL on missing servicing and ledger functions.

- [ ] **Step 3: Implement accrual and scheduled obligations**

Accrue once for each day strictly greater than `lastInterestAccrualDay`; same-day repeated servicing is a no-op. Process due loans by `nextPaymentDay`, then `openedOnDay`, then ordinary string ID order. For each due date:

1. calculate the scheduled principal for the current installment index;
2. move whole accrued interest into the cash obligation;
3. attempt interest before principal;
4. mark the loan delinquent and record arrears when cash cannot satisfy the positive scheduled obligation;
5. increment `scheduledPaymentCount` only for positive obligations;
6. increment `onTimePaymentCount` only when there were no prior arrears and the full obligation cleared that day;
7. otherwise increment `missedPaymentCount`;
8. advance `installmentsProcessed` and `nextPaymentDay`, using `null` after the final installment.

The final principal installment receives the floor-division remainder. A zero-dollar checkpoint advances installment state but adds no counters or transaction.

- [ ] **Step 4: Implement the arrears sweep and close boundary**

After regular due-date processing, sweep every delinquent loan daily, including matured loans. Sort by `arrearsSinceDay`, `openedOnDay`, and `id`. Allocate cash to:

1. overdue interest;
2. matured whole-dollar accrued interest;
3. overdue principal.

When cash can fully close the loan, include the single `Math.ceil` of remaining fractional micro-interest. Never compound arrears or add late fees. The sweep cannot rewrite the on-time/missed result recorded at the due checkpoint.

- [ ] **Step 5: Implement ledger and accumulator updates**

Every non-zero cash/principal event appends its typed transaction and updates `currentDayActivity` in the same immutable transition. `missedPayment` may have zero cash delta but records the unpaid obligation. Prune only `transactions`; never prune or reconstruct the current-day accumulator.

Assert after every helper path:

```ts
finance.currentDayActivity.financingCashFlow ===
	finance.currentDayActivity.principalBorrowed -
		finance.currentDayActivity.principalRepaid -
		finance.currentDayActivity.interestPaid;
```

`interestCapitalized` and `refinancedPrincipal` are disclosure components, not extra cash movements.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts --run --project server
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game/finance.ts src/lib/game/finance.spec.ts
git commit -m "feat(finance): service scheduled debt"
```

---

### Task 3: Credit assessment, offer rates, and schedule projection

**Files:**

- Modify: `src/lib/game/finance.ts`
- Modify: `src/lib/game/finance.spec.ts`

**Interfaces:**

```ts
export interface CreditScheduleEstimate {
	firstPayment: number;
	regularPayment: number;
	peakPayment: number;
}

export type CreditAssessmentReason =
	| 'delinquentObligation'
	| 'principalCapacityLimited'
	| 'debtServiceCapacityLimited';

export interface CreditAssessment {
	termDays: LoanTermDays;
	baseRateBps: number;
	healthPenaltyBps: number;
	historyPenaltyBps: number;
	annualInterestRateBps: number;
	averageDailyOperatingCashFlow: number;
	weeklyOperatingCashFlow: number;
	healthScore: number;
	healthFactor: number;
	lifetimeScheduledPaymentCount: number;
	lifetimeMissedPaymentCount: number;
	lifetimeMissRate: number;
	historyFactor: number;
	grossPrincipalLimit: number;
	outstandingPrincipal: number;
	principalHeadroom: number;
	weeklyPaymentBudget: number;
	existingWeeklyDebtService: number;
	weeklyServiceHeadroom: number;
	maxPrincipalByService: number;
	availableCredit: number;
	availableCreditSchedule: CreditScheduleEstimate;
	reasons: CreditAssessmentReason[];
}

export function getLifetimeRepaymentHistory(finance: FinanceState): {
	scheduledPaymentCount: number;
	onTimePaymentCount: number;
	missedPaymentCount: number;
	missRate: number;
};
export function getOfferRateBps(game: GameState, termDays: LoanTermDays): number;
export function projectLoanSchedule(input: {
	principal: number;
	annualInterestRateBps: number;
	termDays: LoanTermDays;
}): CreditScheduleEstimate;
export function getNormalizedWeeklyService(
	finance: FinanceState,
	options?: { excludeLoanId?: string }
): number;
export function assessCredit(
	game: GameState,
	termDays: LoanTermDays,
	options?: { excludeLoanId?: string }
): CreditAssessment;
```

- [ ] **Step 1: Write failing credit tests**

Cover:

- no-report baseline;
- positive and negative trailing-seven-day operating cash flow;
- scorecard health average;
- lifetime repayment history across active and closed loans;
- miss rate changing only when later scheduled payments dilute it;
- principal headroom;
- normalized existing weekly service independent of due-date position;
- zero credit whenever any loan is delinquent;
- zero service headroom producing exactly zero available credit;
- 28/56/84-day term differences;
- exact final-remainder and fractional-interest schedule peaks;
- deterministic APR penalties;
- refinancing assessment excluding the replaced loan from principal and service headroom.

Use reports with explicit `operatingCashFlow`; never drive these tests through `netIncome`.

- [ ] **Step 2: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts --run --project server -t "credit|offer|schedule|history"
```

Expected: FAIL on missing assessment functions.

- [ ] **Step 3: Implement the assessment inputs exactly**

```ts
const healthScore =
	(profit + customerSatisfaction + staffMorale + marketPosition) / 4;
const healthFactor = 0.75 + 0.5 * (healthScore / 100);
const historyFactor = Math.max(0.5, 1 - 0.5 * missRate);
const weeklyOperatingCashFlow = Math.max(0, averageDailyOperatingCashFlow * 7);

const grossPrincipalLimit = clamp(
	Math.floor(
		(15_000 + weeklyOperatingCashFlow * 2 + Math.max(0, cash) * 0.25) *
			healthFactor *
			historyFactor
	),
	0,
	100_000
);
const weeklyPaymentBudget = Math.max(
	0,
	Math.floor(
		(2_500 + weeklyOperatingCashFlow * 0.35) *
			healthFactor *
			historyFactor
	)
);
```

`principalHeadroom = max(0, grossPrincipalLimit - totalOpenPrincipal)`. Existing weekly debt service is each open loan's next scheduled principal plus exact seven-day interest, not a D+1..D+7 due-date sum.

- [ ] **Step 4: Implement exact capacity search and APR**

Base APRs are 1,000/1,200/1,400 bps for 28/56/84 days. Add:

```ts
Math.round((100 - healthScore) * 6) + Math.round(missRate * 800)
```

For the proposed loan, project the complete installment schedule using the same principal and micro-interest helpers as servicing. Binary-search whole-dollar principal from zero to `principalHeadroom`; accept a principal only when its projected peak weekly payment is within `weeklyServiceHeadroom`. If `weeklyServiceHeadroom === 0`, `maxPrincipalByService` and available credit are exactly zero. `availableCredit` is the minimum of principal and service capacity without another floor. Return all inputs/intermediate values above plus stable reasons, including `delinquentObligation` when arrears override capacity to zero.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts --run --project server
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game/finance.ts src/lib/game/finance.spec.ts
git commit -m "feat(finance): assess term credit"
```

---

### Task 4: Borrowing, repayment, payoff, and refinancing actions

**Files:**

- Modify: `src/lib/game/finance.ts`
- Modify: `src/lib/game/finance.spec.ts`

**Interfaces:**

```ts
export type FinanceFailureCode =
	| 'loanNotFound'
	| 'loanClosed'
	| 'loanDelinquent'
	| 'invalidAmount'
	| 'belowMinimumBorrowing'
	| 'insufficientCash'
	| 'overpayment'
	| 'unsupportedTerm'
	| 'insufficientCredit'
	| 'purchaseUnavailable'
	| 'purchaseCostChanged';

export type FinanceActionResult<TReceipt> =
	| { ok: true; game: GameState; receipt: TReceipt }
	| {
			ok: false;
			code: FinanceFailureCode;
			context: Record<string, string | number>;
	  };

export interface BorrowInput {
	purpose: Exclude<LoanPurpose, 'founding' | 'refinance'>;
	amount: number;
	termDays: LoanTermDays;
	allowBelowMinimum?: boolean;
}

export function borrow(game: GameState, input: BorrowInput): FinanceActionResult<{
	loanId: string;
	amount: number;
	annualInterestRateBps: number;
}>;
export function repayLoan(
	game: GameState,
	input: { loanId: string; amount: number }
): FinanceActionResult<{ loanId: string; principalPaid: number; interestPaid: number }>;
export function getPayoffQuote(game: GameState, loanId: string): FinanceActionResult<{
	loanId: string;
	amount: number;
}>;
export function payOffLoan(
	game: GameState,
	loanId: string
): FinanceActionResult<{ loanId: string; principalPaid: number; interestPaid: number }>;
export function refinanceLoan(
	game: GameState,
	input: { loanId: string; termDays: LoanTermDays }
): FinanceActionResult<{ oldLoanId: string; newLoanId: string; capitalizedInterest: number }>;
```

- [ ] **Step 1: Write failing action tests**

Cover successful and rejected:

- voluntary working-capital borrowing: whole dollar, at least $1,000, selected supported term, within term credit;
- disbursement increases cash/principal and updates transaction plus `currentDayActivity`;
- partial repayment allocation: overdue interest, whole accrued interest, overdue principal, remaining principal;
- insufficient cash, zero/fractional amount, closed loan, and overpayment;
- payoff quote and final close including fractional accrued interest;
- duplicate payoff;
- cash-neutral refinancing of one active, non-delinquent loan;
- refinance assessment excluding the old obligation;
- capitalized interest disclosure and symmetric links;
- delinquent/closed refinance rejection;
- borrowing changes financing cash flow but never improves `operatingCashFlow`, `netIncome`, or the profit score;
- lifetime micro-interest reconciliation, permitting only the explicit 0–999,999 micro close/refinance premium.

- [ ] **Step 2: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts --run --project server -t "borrow|repay|payoff|refinance"
```

Expected: FAIL on missing action functions.

- [ ] **Step 3: Implement borrowing and repayment**

Validate before mutation. `borrow` uses `assessCredit(game, termDays)` and rejects when `amount > availableCredit`. Only voluntary `workingCapital` enforces the $1,000 minimum; the private/shared expansion path later passes `allowBelowMinimum`.

Repayment uses the approved allocation order and may close the loan. Reject an amount above the payoff quote rather than silently treating it as a smaller payment. Each successful action updates cash, finance state, transactions, and activity exactly once.

- [ ] **Step 4: Implement payoff and refinance**

`getPayoffQuote` is remaining principal + overdue interest + `ceil(accruedInterestMicros / 1_000_000)`. Refinancing:

1. requires one active, non-delinquent loan;
2. assesses the selected term with that loan excluded;
3. creates no cash-out;
4. closes the old loan as `refinanced`;
5. capitalizes its remaining principal plus payoff interest into the new refinance loan;
6. links both loans symmetrically;
7. records one refinance transaction with `interestAmount` equal to capitalized interest;
8. updates `interestCapitalized` and `refinancedPrincipal` without changing financing cash flow.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts src/lib/game/simulateDay.spec.ts --run --project server
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game/finance.ts src/lib/game/finance.spec.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat(finance): add debt actions"
```

---

### Task 5: Daily simulation and report reconciliation

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/reports.ts`
- Modify: `src/lib/game/reports.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`

**Interfaces:**

```ts
export interface LoanPaymentSnapshot {
	loanId: string;
	day: number;
	amount: number;
}

// DailyReport gains:
cashBefore: number;
operatingIncome: number;
operatingCashFlow: number;
interestAccrued: number; // decimal game dollars, not integer-constrained
interestPaid: number;
interestCapitalized: number;
principalBorrowed: number;
principalRepaid: number;
refinancedPrincipal: number;
financingCashFlow: number;
netCashChange: number;
outstandingPrincipalAfter: number;
nextLoanPayment: LoanPaymentSnapshot | null;
// netIncome remains and equals operatingCashFlow.
```

`ReportWindowSummary` gains sums/averages for the same operating and finance fields, preserving fractional `interestAccrued`.

- [ ] **Step 1: Write failing day-order tests**

Add tests that:

- reconstruct `cashBefore` as `game.cash - game.finance.currentDayActivity.financingCashFlow`;
- apply and round operating cash flow exactly once;
- pass that stored integer to `buildScorecard`;
- service finance after operating cash flow;
- stamp manual and scheduled finance activity on current day D;
- produce a report for D and return state D+1;
- reset `currentDayActivity` to zero values stamped D+1 only after the report;
- reconcile `cashAfter === cashBefore + operatingCashFlow + financingCashFlow`;
- stack import, payroll, and finance service when their schedules coincide;
- preserve a fractional `interestAccrued` value.

Use the golden Founding Loan day-8 tick as the primary integration assertion.
Add a deterministic 28-day snapshot for every archetype that records each scheduled-payment day's
cash before/after, reserve warnings, cash-pressure decision presence, missed-payment count, and
arrears. Review the evidence against the pre-finance baseline; do not alter founding principal,
rate, or grace behavior inside this task.

- [ ] **Step 2: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts --run --project server
```

Expected: FAIL on missing report fields and unchanged tick ordering.

- [ ] **Step 3: Implement the normative tick**

At the start of `simulateDay`:

```ts
const closingDay = game.day;
const cashBefore =
	game.cash - game.finance.currentDayActivity.financingCashFlow;
```

Keep the current store/industry/import/payroll calculations. Replace independent net-income rounding with:

```ts
const operatingIncome = Math.round(grossMargin - operatingCosts);
const operatingCashFlow = Math.round(revenue - operatingCosts - importSpend);
const afterOperations = { ...gameAfterOperations, cash: game.cash + operatingCashFlow };
const serviced = serviceFinanceForDay({
	finance: afterOperations.finance,
	cash: afterOperations.cash,
	day: closingDay
});
```

Build the scorecard from `operatingCashFlow`. Build finance report fields from
`serviced.finance.currentDayActivity`, not by reducing `transactions`.

```ts
const financingCashFlow = serviced.finance.currentDayActivity.financingCashFlow;
const netCashChange = operatingCashFlow + financingCashFlow;
const cashAfter = serviced.cash;

if (cashAfter !== cashBefore + netCashChange) {
	throw new Error('Daily cash reconciliation failed');
}
```

`interestAccrued` is `serviced.interestAccruedThisDayMicros / 1_000_000`. `netIncome` is assigned the exact same integer as `operatingCashFlow`.

- [ ] **Step 4: Snapshot obligations and reset activity**

Store `outstandingPrincipalAfter = getTotalDebt(postServiceGame)` and the next open-loan obligation as `{ loanId, day, amount }`, deterministically selecting earliest day, then opened day, then ID.

Append the report, then return:

```ts
{
	...postServiceGame,
	day: closingDay + 1,
	finance: resetFinanceDayActivity(serviced.finance, closingDay + 1),
	reports: [...game.reports, report]
}
```

Do not reset before copying the accumulator into the report.

- [ ] **Step 5: Extend summaries and report UI**

Aggregate every added numeric report field for 7- and 30-day windows. Do not use an integer-only accumulator for `interestAccrued`. Update `ReportsPanel` to label operating income, operating cash flow, financing cash flow, principal/interest movements, and ending principal without relabeling principal as amount due.

Run Svelte docs lookup and `svelte-autofixer` until the modified component is clean.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts --run
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game/types.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.ts src/lib/game/reports.spec.ts src/lib/components/game/ReportsPanel.svelte src/lib/components/game/ReportsPanel.svelte.spec.ts
git commit -m "feat(finance): reconcile daily cash reports"
```

---

### Task 6: Finance overview metrics, debt-service coverage, and runway

**Files:**

- Create: `src/lib/game/financeMetrics.ts`
- Create: `src/lib/game/financeMetrics.spec.ts`

**Interfaces:**

```ts
export type CashRunway =
	| { kind: 'days'; days: number }
	| { kind: 'ninetyPlus' };

export interface ScheduledDebtService {
	day: number;
	principal: number;
	interest: number;
	total: number;
	loanIds: string[];
}

export interface FinanceMetrics {
	outstandingPrincipal: number;
	amountDue: number;
	nextLoanPayment: LoanPaymentSnapshot | null;
	trailingSevenDayOperatingCashFlow: number;
	averageDailyOperatingCashFlow: number;
	scheduledDebtServiceNextSevenDays: number;
	scheduledDebtServiceByDay: ScheduledDebtService[];
	debtServiceCoverage: number | null;
	creditAssessments: Record<LoanTermDays, CreditAssessment>;
	cashRunway: CashRunway;
}

export function projectScheduledDebtService(
	game: GameState,
	fromDay: number,
	throughDay: number
): ScheduledDebtService[];
export function projectCashRunway(game: GameState, horizonDays?: number): CashRunway;
export function getFinanceMetrics(game: GameState): FinanceMetrics;
```

- [ ] **Step 1: Write failing metric tests**

Cover:

- outstanding principal versus amount due;
- earliest next payment selection;
- trailing-seven report window;
- dated D+1 through D+7 scheduled service, excluding a due-today obligation;
- exact principal remainder and estimated interest in the display schedule;
- coverage clamping negative operating cash flow to zero;
- `null` coverage when no service is scheduled;
- runway 0 for already-negative cash;
- finite runway on the first projected negative day;
- `ninetyPlus` when the balance survives all 90 projected days;
- projections not assuming borrowing, builds, policy changes, or events.

- [ ] **Step 2: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/game/financeMetrics.spec.ts --run --project server
```

Expected: FAIL because `financeMetrics.ts` does not exist.

- [ ] **Step 3: Implement dated service projection**

Import arithmetic and assessments from `finance.ts`; do not create a reverse import. Project each open loan forward with the same integer principal and micro-interest helpers used by servicing. `getFinanceMetrics` uses `game.day + 1` through `game.day + 7` inclusive for display service.

```ts
const debtServiceCoverage =
	scheduledDebtServiceNextSevenDays === 0
		? null
		: Math.max(0, trailingSevenDayOperatingCashFlow) /
			scheduledDebtServiceNextSevenDays;
```

- [ ] **Step 4: Implement focused runway projection**

Start from current cash. For projected days 1–90:

1. add the average daily operating cash flow from the last up to seven reports;
2. subtract that projected day's scheduled principal and interest;
3. return the first day whose projected cash is below zero.

Return `{ kind: 'days', days: 0 }` for currently negative cash and `{ kind: 'ninetyPlus' }` when no crossing occurs.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts src/lib/game/financeMetrics.spec.ts --run --project server
bun run check
```

Expected: PASS and no import cycle.

Commit:

```bash
git add src/lib/game/financeMetrics.ts src/lib/game/financeMetrics.spec.ts
git commit -m "feat(finance): derive coverage and runway"
```

---

### Task 7: Save schema v11 migration and strict finance validation

**Files:**

- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/tauriSaveRepository.spec.ts`
- Modify: `src/lib/persistence/scenarioRepository.testUtils.ts`
- Modify: repository fixtures that represent current schema

**Migration entry points:**

```ts
function migrateV10Game(game: unknown): unknown;
function migrateV10SaveRecord(record: unknown): unknown;
// SAVE_SCHEMA_VERSION = 11
// MIGRATABLE_SCHEMA_VERSIONS includes 10.
```

- [ ] **Step 1: Write failing v10→v11 migration tests**

Build literal v10 fixtures rather than mutating current-game factories after encode. Assert:

- scalar positive debt is removed and becomes one Founding Loan;
- scalar zero debt becomes an empty finance state;
- cash is unchanged;
- opening/accrual day equals loaded `game.day`;
- first payment is loaded day + 7;
- all arrears, history, accrual, transaction, and current-day activity amounts start neutral;
- `currentDayActivity.day` equals loaded day;
- old reports backfill:

```ts
cashBefore = old.cashAfter - old.netIncome;
operatingCashFlow = old.netIncome;
operatingIncome = old.grossMargin - old.operatingCosts;
interestAccrued = 0;
interestPaid = 0;
interestCapitalized = 0;
principalBorrowed = 0;
principalRepaid = 0;
refinancedPrincipal = 0;
financingCashFlow = 0;
netCashChange = old.netIncome;
outstandingPrincipalAfter = migratedDebt;
nextLoanPayment = null;
```

Also assert a v4 fixture chains through every existing migration, including rail v9→v10 and finance v10→v11.

- [ ] **Step 2: Write failing validation tests**

Use table-driven corruptions with one expected `SaveDataError` for every invariant class:

- negative/non-integer sequences;
- duplicate loan/transaction IDs;
- non-finite, negative, or non-integer money/rate/day/counter fields as appropriate;
- unsupported purpose/status/term;
- processed installments beyond 4/8/12;
- overdue principal above remaining principal;
- paid/refinanced loans retaining balance, interest, or arrears;
- active loan with arrears;
- delinquent loan without arrears;
- contradictory `arrearsSinceDay`;
- contradictory `nextPaymentDay`/installment index;
- missing, asymmetric, or cyclic refinance links;
- transaction referencing an unknown loan;
- invalid transaction ordering or more than 200 entries;
- mismatched activity day, non-whole activity values, or non-reconciling financing cash flow;
- missing/non-finite added report fields;
- negative/non-finite `interestAccrued`, while allowing a finite positive fraction.

- [ ] **Step 3: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/persistence/saveCodec.spec.ts --run --project server
```

Expected: FAIL because schema 10 is still current and finance validation/migration do not exist.

- [ ] **Step 4: Implement migration in both chains**

Set `SAVE_SCHEMA_VERSION = 11`; add 10 to the migratable set. Apply `migrateV10Game` after `migrateV9Game` in `migrateSavedGameInternal`. Advance record metadata with `migrateV10SaveRecord` after the existing v9 record step.

Migration must use finance constructors/arithmetic where doing so cannot mask malformed old data. Delete `debt` from the copied record explicitly. Do not infer retroactive payments, interest, or history.

- [ ] **Step 5: Implement strict current-schema validation**

Replace `requireNumber(game.debt, ...)` with `validateSavedFinance(game.finance, game.day, ...)`. Validate the added report fields in `validateSavedReport`. Preserve extra structured-cloneable fields under the codec's current policy; Task 8 extends decision-option validation when it introduces the finance-effect shape.

Validate whole-dollar fields with finite integer checks, but validate `interestAccrued` only as finite and non-negative. Reuse `getInstallmentCount` rather than duplicating term arithmetic inside the codec.

- [ ] **Step 6: Verify all repository paths**

Run:

```bash
bun run test:unit -- src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts --run --project server
bun run check
```

`saveRepository.spec.ts` covers both the in-memory driver and `createBrowserSaveRepository`. Expected: PASS for codec round-trip, in-memory, browser, and Tauri-backed paths.

- [ ] **Step 7: Commit**

```bash
git add src/lib/persistence
git commit -m "feat(finance): migrate saves to schema v11"
```

---

### Task 8: Finance-backed decisions and live option availability

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/events.ts`
- Modify: `src/lib/game/events.spec.ts`
- Modify: `src/lib/game/finance.ts`
- Modify: `src/lib/game/finance.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/components/game/DecisionQueue.svelte`
- Modify: `src/lib/components/game/DecisionQueue.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**

```ts
export interface DecisionFinanceEffect {
	kind: 'borrow';
	purpose: 'emergency' | 'supplierCredit';
	amount: number;
	termDays: 28 | 56;
}

// DecisionOption.effects gains:
finance?: DecisionFinanceEffect;

export type DecisionOptionAvailability =
	| { available: true }
	| {
			available: false;
			code: 'insufficientCredit';
			reasons: CreditAssessmentReason[];
			context: Record<string, string | number>;
	  };

export function getDecisionOptionAvailability(
	game: GameState,
	option: DecisionOption
): DecisionOptionAvailability;
```

- [ ] **Step 1: Write failing decision-generation tests**

For cash pressure:

```ts
const roundedCapacity =
	Math.floor(assessCredit(game, 56).availableCredit / 1_000) * 1_000;
const emergencyPrincipal = Math.min(12_000, Math.max(4_000, roundedCapacity));
```

Assert the generated `short-loan` option stores that fixed whole-dollar amount as an emergency 56-day finance effect, removes the free `cash: 12_000` effect, and keeps the existing `profit: -4` and `marketPosition: -1`.

Assert supplier credit stores a fixed $4,000, 28-day supplier-credit effect, removes free cash, and keeps the margin/profit pressure. Confirm `cut-costs` remains a free $5,500 operating relief path.

- [ ] **Step 2: Write failing resolution and availability tests**

Cover:

- generated emergency amount remains stable even when credit later changes;
- current availability recomputes against that stable amount;
- adequate credit borrows before applying score/store effects and removes the decision;
- delinquency and insufficient credit disable the option with structured reason;
- a failed live recheck returns the original game and keeps the decision queued;
- a missing decision or option remains the existing no-op;
- supplier credit uses the same `borrow` action and ledger;
- finance success occurs before any non-finance effects, so a failed borrow cannot leak score/cash changes.

- [ ] **Step 3: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/game/events.spec.ts src/lib/game/state.spec.ts src/lib/game/finance.spec.ts --run --project server
```

Expected: FAIL on missing finance effect and availability.

- [ ] **Step 4: Implement generation and resolution**

Generate the cash-pressure assessment once when the decision is created and persist the chosen amount in the option. `getDecisionOptionAvailability` returns available for options without finance.

In `resolveDecision`, preserve the existing missing-option no-op. For a finance effect:

1. recompute availability;
2. call `borrow` with the persisted purpose, amount, and term;
3. return the original game when either rejects;
4. apply the remaining numeric effects to the successful borrowed game;
5. remove the resolved decision and refresh world progress.

Do not also apply `effects.cash` for finance options.

- [ ] **Step 5: Validate persisted decision finance effects**

Extend `validateSavedDecisionOption` with a closed validation of `effects.finance`: known kind/purpose, supported purpose-term pair, and finite positive whole-dollar amount. Add corrupt-save tests for unknown keys, kind, purpose, term, fractional amount, and non-positive amount.

- [ ] **Step 6: Surface per-option availability**

Change `DecisionQueue` to receive `game` or an availability map and disable each finance-backed option independently. Render a localized reason beside that option while leaving cash-free alternatives active. Keep the route-wide `canResolve`/pending gate as the outer disable.

Run the required Svelte docs and autofixer workflow for `DecisionQueue.svelte` and `+page.svelte`.

- [ ] **Step 7: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/events.spec.ts src/lib/game/state.spec.ts src/lib/game/finance.spec.ts src/lib/persistence/saveCodec.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts --run
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game src/lib/persistence src/lib/components/game/DecisionQueue.svelte src/lib/components/game/DecisionQueue.svelte.spec.ts src/routes/+page.svelte
git commit -m "feat(finance): fund decisions with loans"
```

---

### Task 9: Atomic financing for world, retail, and industrial expansion

**Files:**

- Modify: `src/lib/game/finance.ts`
- Modify: `src/lib/game/finance.spec.ts`
- Modify: `src/lib/game/world.ts`
- Modify: `src/lib/game/world.spec.ts`
- Modify: `src/lib/game/placement.ts`
- Modify: `src/lib/game/placement.spec.ts`
- Modify: `src/lib/game/placementPreview.ts`
- Modify: `src/lib/game/placementPreview.spec.ts`
- Modify: `src/lib/game/industryPlacement.ts`
- Modify: `src/lib/game/industryPlacement.spec.ts`

**Interfaces:**

```ts
export interface ExpansionFinanceOffer {
	principal: number;
	termDays: 84;
	annualInterestRateBps: number;
	estimatedPeakPayment: number;
}

export interface FinancedPurchaseReceipt {
	loanId: string;
	purchaseCost: number;
	financedPrincipal: number;
}

export function getExpansionFinanceOffer(
	game: GameState,
	purchaseCost: number
): ExpansionFinanceOffer | null;
export function financeWorldCityOpening(
	game: GameState,
	input: { cityId: WorldCityId; expectedCost: number }
): FinanceActionResult<FinancedPurchaseReceipt>;
export function financeRetailStoreOpening(
	game: GameState,
	input: { tileId: string; archetypeId: ArchetypeId; expectedCost: number }
): FinanceActionResult<FinancedPurchaseReceipt>;
export function financeIndustrialBuilding(
	game: GameState,
	input: {
		tileId: string;
		buildingTypeId: IndustrialBuildingTypeId;
		expectedCost: number;
	}
): FinanceActionResult<FinancedPurchaseReceipt>;

// WorldCityStatus gains:
financeOffer: ExpansionFinanceOffer | null;

// RetailBuildMenuOption gains:
financeOffer: ExpansionFinanceOffer | null;
```

- [ ] **Step 1: Write failing atomic-transition tests**

For each of world, retail, and industry, cover:

- cash-sufficient path still uses the existing transition and creates no loan;
- cash-short path borrows exactly `purchaseCost - cash`, including a sub-$1,000 shortfall;
- 84-day credit and rate are re-evaluated at commit;
- the intended city/entity is created and cash lands at the same post-purchase value as borrowing the exact shortfall;
- transaction/activity records the expansion disbursement once;
- stale target, changed cost, newly insufficient credit, placement failure, and postcondition failure return a typed failure and the original object/state;
- no loan, cash, transaction, sequence, or entity mutation survives a failed purchase;
- upgrades and rail remain cash-only.

For retail, explicitly mutate the selected tile/cost between preview and commit to exercise `purchaseCostChanged`.

- [ ] **Step 2: Run the red domain tests**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts src/lib/game/world.spec.ts src/lib/game/placement.spec.ts src/lib/game/placementPreview.spec.ts src/lib/game/industryPlacement.spec.ts --run --project server
```

Expected: FAIL on missing offers/transitions.

- [ ] **Step 3: Implement one shared atomic wrapper**

Use an internal helper that receives:

- target/cost revalidation;
- a cash-only purchase transition;
- a postcondition predicate.

The wrapper:

1. resolves the live cost;
2. rejects a mismatch with `purchaseCostChanged`;
3. computes `shortfall = liveCost - game.cash`;
4. returns the existing cash transition if `shortfall <= 0`;
5. assesses 84-day credit and rejects if shortfall exceeds it;
6. calls the expansion-purpose disbursement path with the voluntary-minimum bypass;
7. executes the existing cash-only transition against that borrowed state;
8. verifies the intended city/store/building was created;
9. returns the original-state failure if verification fails.

Never mutate first and attempt rollback.

- [ ] **Step 4: Separate structural placement from funding**

Refactor retail preview so structural tile validity, store cap, and footprint rules are calculated before funding. Build Menu setup-cost/revenue ranges come from structurally valid tiles.

- A cash-short retail card stays selectable when `getExpansionFinanceOffer(game, minimumSetupCost)` is non-null.
- Exact tile selection recomputes its forecast and finance offer.
- When neither cash nor credit covers it, retain `retail.requiresCash`.

Industrial placement keeps its fixed `buildCost`; a valid recipe card remains selectable when the exact shortfall has an offer. Retain `industry.requiresCash` when neither source covers it.

`getWorldCityStatus` keeps `canOpen` as cash-only and adds a separate offer only for a revealed, cash-short city.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/finance.spec.ts src/lib/game/world.spec.ts src/lib/game/placement.spec.ts src/lib/game/placementPreview.spec.ts src/lib/game/industryPlacement.spec.ts --run --project server
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game
git commit -m "feat(finance): finance expansion atomically"
```

---

### Task 10: Deterministic scenario commands, controller commits, and official-scenario balance

**Files:**

- Modify: `src/lib/scenarios/types.ts`
- Modify: `src/lib/scenarios/types.spec.ts`
- Modify: `src/lib/scenarios/capabilities.ts`
- Modify: `src/lib/scenarios/capabilities.spec.ts`
- Modify: `src/lib/scenarios/runtime.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`
- Modify: `src/lib/scenarios/runtimeInvalidCommand.spec.ts`
- Modify: `src/lib/scenarios/validation/shared.ts`
- Modify: `src/lib/scenarios/validation/start.ts`
- Modify: `src/lib/scenarios/validation.spec.ts`
- Modify: `src/lib/scenarios/metrics.ts`
- Modify: `src/lib/scenarios/metrics.spec.ts`
- Modify: `src/lib/scenarios/catalog.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`

**Command variants:**

```ts
| { kind: 'borrow'; amount: number; termDays: LoanTermDays }
| { kind: 'repayLoan'; loanId: string; amount: number }
| { kind: 'payOffLoan'; loanId: string }
| { kind: 'refinanceLoan'; loanId: string; termDays: LoanTermDays }
| { kind: 'financeWorldCity'; cityId: WorldCityId; expectedCost: number }
| {
		kind: 'financeRetailStore';
		tileId: string;
		archetypeId: ArchetypeId;
		expectedCost: number;
  }
| {
		kind: 'financeIndustrialBuilding';
		tileId: string;
		buildingTypeId: IndustrialBuildingTypeId;
		expectedCost: number;
  }
```

All numeric payloads are finite whole dollars. Borrow/refinance terms are supported terms. IDs are non-empty strings.

- [ ] **Step 1: Write failing scenario dispatch and capability tests**

For every new variant:

- assert the kind is known and can appear in `allowedCommands`;
- assert content restrictions for city, archetype, retail placement, and industrial placement still apply;
- execute, persist, and replay the exact payload deterministically;
- assert stale IDs/costs and typed finance failures become `invalid-command`, not thrown exceptions or persistence failures;
- assert unchanged/failed commands do not advance scenario state;
- assert finance activity cannot satisfy operating-performance objectives.

- [ ] **Step 2: Write failing controller tests**

Add typed controller method tests for sandbox and scenario modes:

```ts
borrowWorkingCapital(amount, termDays)
repayFinanceLoan(loanId, amount)
payOffFinanceLoan(loanId)
refinanceFinanceLoan(loanId, termDays)
financeWorldCity(cityId, expectedCost)
financeRetailStore(tileId, archetypeId, expectedCost)
financeIndustrialBuilding(tileId, buildingTypeId, expectedCost)
```

Assert:

- a failed `FinanceActionResult` is returned to the caller with code/context and is neither published nor autosaved;
- a successful sandbox result publishes/autosaves once;
- a successful scenario result flows through the existing command gate and CAS persistence once;
- pending/re-entrant commands cannot duplicate disbursement, payoff, or refinance;
- retry paths preserve the exact command payload;
- expected-cost rejection is classified as domain rejection, not persistence failure.

- [ ] **Step 3: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/scenarios/types.spec.ts src/lib/scenarios/capabilities.spec.ts src/lib/scenarios/runtime.spec.ts src/lib/scenarios/runtimeInvalidCommand.spec.ts src/routes/gameRouteController.spec.ts --run --project server
```

Expected: FAIL on missing commands and controller methods.

- [ ] **Step 4: Implement scenario validation and dispatch**

Add all kinds to `SCENARIO_COMMAND_KINDS`. Extend `isScenarioCommandAllowed` with the same content checks as the cash counterparts. Dispatch through finance action functions and unwrap only `ok: true`; map a typed failure to the runtime's existing `invalid-command` result.

Do not substitute live amounts or costs for command payloads. The pure finance transitions perform the final stale-cost/target checks.

- [ ] **Step 5: Adapt the route mutation boundary**

Introduce a normalized internal transition result:

```ts
type RouteTransitionResult<TReceipt = undefined> =
	| { ok: true; game: GameState; receipt: TReceipt }
	| { ok: false; code: FinanceFailureCode; context: Record<string, string | number> };
```

Wrap existing state-only transitions as success. Let finance methods pass their result directly. Extend the controller commit result with a typed domain-rejection variant carrying code/context; keep existing `rejected` for scenario/runtime rejection classes. Publish, play SFX, and autosave only the successful normalized state.

The scenario path still evaluates the command exactly once inside the command gate. Do not pre-run a finance transition and then run it again during persistence.

- [ ] **Step 6: Complete scenario override validation and metric semantics**

Keep `debt` in the closed `start.overrides` key set, but require a finite non-negative whole-dollar value. Change every profit-like report read in `src/lib/scenarios/metrics.ts` from `netIncome` to `operatingCashFlow` without changing public metric IDs.

- [ ] **Step 7: Replay all official scenarios**

Run all three reference openings and full deterministic scenario fixtures. Update authored cash/debt, objective thresholds, projected scores, or medal expectations only when the recorded evidence shows the new weekly obligations make the approved scenario contract impossible or materially miscalibrated. Every tuning change must be explicit in `catalog.ts` and its expected-score fixture.

Re-run the Task 5 archetype snapshots unchanged as a regression signal. Do not add a grace period or alter founding principal/rate without a separate product review.

- [ ] **Step 8: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/scenarios/types.spec.ts src/lib/scenarios/setup.spec.ts src/lib/scenarios/metrics.spec.ts src/lib/scenarios/capabilities.spec.ts src/lib/scenarios/validation.spec.ts src/lib/scenarios/runtime.spec.ts src/lib/scenarios/runtimeInvalidCommand.spec.ts src/routes/gameRouteController.spec.ts src/lib/game/simulateDay.spec.ts --run --project server
bun run check
```

Expected: all three official scenarios pass their reviewed fixtures, and the four Task 5 archetype baselines remain deterministic.

Commit:

```bash
git add src/lib/scenarios src/routes/gameRouteController.ts src/routes/gameRouteController.spec.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat(finance): record finance scenario commands"
```

---

### Task 11: Finance alerts, deep links, localization, and the Finance launcher

**Files:**

- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/lib/game/keyboardShortcuts.ts`
- Modify: `src/lib/game/keyboardShortcuts.spec.ts`
- Modify: `src/lib/i18n/gameLabels.ts`
- Modify: `src/lib/i18n/gameLabels.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/i18n/locales.ts`
- Modify: `src/lib/i18n/locales.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/components/game/ShortcutCheatSheet.svelte`
- Modify: `src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`
- Modify: `src/lib/components/game/TopBar.svelte.spec.ts` (alert copy/count fixture only; `TopBar.svelte` remains unchanged)
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Interfaces:**

```ts
export type GameAlertKind =
	| 'store-stock'
	| 'decision'
	| 'factory-blocked'
	| 'upcomingLoanPayment'
	| 'missedLoanPayment'
	| 'covenantRisk'
	| 'lowCashRunway';

// GameAlert gains:
loanId?: string;
managementPanelId?: 'finance';

// ManagementPanelId gains 'finance'.
// MANAGEMENT_PANEL_SHORTCUTS gains f: 'finance'.
```

- [ ] **Step 1: Write failing alert tests**

Cover:

- upcoming payment due today through D+3 inclusive;
- no upcoming alert for D+4;
- one missed alert per loan with arrears;
- covenant alert only when coverage is non-null and below 1.25;
- runway alert for 0–7 days, but not `ninetyPlus`;
- loan alerts carrying both `loanId` and `managementPanelId: 'finance'`;
- aggregate risk/runway alerts carrying only the panel target;
- global group order stock → decision → factory → finance;
- within finance: missed by `arrearsSinceDay`/ID, upcoming by `nextPaymentDay`/ID, covenant, runway;
- retained English `message` fallback.

- [ ] **Step 2: Write failing shortcut and localization tests**

Assert bare `F` toggles Finance, works from a focused non-native interactive control under the existing shortcut rules, appears in the cheat sheet and Control Desk, and does not conflict with typing/modifier/overlay suppression.

For all three locales, assert labels/copy exist for:

- Finance launcher and shortcut;
- loan purposes/statuses/terms;
- overview metrics and “No debt service due”;
- credit inputs/reasons/APR adjustments;
- failure codes;
- decision availability;
- finance alert kinds;
- financed-purchase actions/reviews;
- transaction kinds and activity explanations.

- [ ] **Step 3: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/game/alerts.spec.ts src/lib/game/keyboardShortcuts.spec.ts src/lib/i18n/gameLabels.spec.ts src/lib/i18n/gameCopy.spec.ts src/lib/i18n/locales.spec.ts src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/TopBar.svelte.spec.ts src/routes/page.svelte.spec.ts --run
```

Expected: FAIL on unknown alert kinds, panel ID, shortcut, and translation keys.

- [ ] **Step 4: Implement derived finance alerts**

Call `getFinanceMetrics(game)` once inside finance alert collection. Do not persist alerts. Construct stable IDs from kind plus loan where applicable. Preserve the existing three group builders and append finance alerts as the fourth group.

Update `localizeAlert` to switch on the stable finance kind and derive amounts/dates from the current loan/metrics where available, falling back to `alert.message` under the existing contract.

- [ ] **Step 5: Wire panel deep links and shortcut**

Add Finance to `managementPanelMenuConfig`. In `handleSelectAlert`, handle `managementPanelId` before decision/tile targets:

```ts
if (alert.managementPanelId === 'finance') {
	focusedFinanceLoanId = alert.loanId ?? null;
	openManagementPanel('finance');
	return;
}
```

Reset `focusedFinanceLoanId` with other transient route state. FinancePanel consumes it in Task 12.

Run the mandatory Svelte docs/autofixer flow for `ShortcutCheatSheet.svelte` and `+page.svelte`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/game/alerts.spec.ts src/lib/game/keyboardShortcuts.spec.ts src/lib/i18n/gameLabels.spec.ts src/lib/i18n/gameCopy.spec.ts src/lib/i18n/locales.spec.ts src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/TopBar.svelte.spec.ts src/routes/page.svelte.spec.ts --run
bun run check
```

Expected: PASS.

Commit:

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts src/lib/game/keyboardShortcuts.ts src/lib/game/keyboardShortcuts.spec.ts src/lib/i18n src/lib/components/game/ShortcutCheatSheet.svelte src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/TopBar.svelte.spec.ts src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(finance): add finance alerts and launcher"
```

---

### Task 12: Finance management panel and route action wiring

**Files:**

- Create: `src/lib/components/game/FinancePanel.svelte`
- Create: `src/lib/components/game/FinancePanel.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/gameRouteController.spec.ts`

**Component contract:**

```ts
interface FinancePanelProps {
	game: GameState;
	metrics: FinanceMetrics;
	i18n: I18nBundle;
	focusedLoanId?: string | null;
	mutationPending?: boolean;
	onBorrow: (amount: number, termDays: LoanTermDays) => Promise<GameRouteCommitResult>;
	onRepay: (loanId: string, amount: number) => Promise<GameRouteCommitResult>;
	onPayoff: (loanId: string) => Promise<GameRouteCommitResult>;
	onRefinance: (
		loanId: string,
		termDays: LoanTermDays
	) => Promise<GameRouteCommitResult>;
}
```

- [ ] **Step 1: Write failing overview/register tests**

Render with active, delinquent, paid, and refinanced loans. Assert:

- cash, outstanding principal, amount due, next payment, coverage, runway, and 84-day credit are labeled distinctly;
- principal is never labeled as “debt due”;
- null coverage says “No debt service due”;
- credit explanation lists operating cash flow, obligations, health, history, principal headroom, and service headroom;
- every loan shows purpose, text status, original/remaining principal, APR, term, arrears, next payment, and payoff quote;
- paid/refinanced history remains visible but mutation controls are unavailable;
- transaction activity is descending and explains cash/principal/interest separately;
- status/severity is conveyed in text, not only color.

- [ ] **Step 2: Write failing interaction/accessibility tests**

Cover:

- whole-dollar borrowing amount validation and 28/56/84 term switching;
- offered base APR, adjustments, final APR, available credit, and first/regular/peak payment;
- Borrow review step, explicit confirmation, cancel focus return, and no action before confirmation;
- partial repayment amount validation;
- payoff quote review and explicit confirmation;
- refinance term comparison with no cash-out field;
- localized typed failure beside the relevant field plus polite live status;
- controls disabled while pending;
- explicit labels for inputs/statuses;
- loan alert focus scrolls to the correct row;
- narrow viewport has no horizontal overflow.

- [ ] **Step 3: Run the red component test**

Run:

```bash
bun run test:unit -- src/lib/components/game/FinancePanel.svelte.spec.ts --run --project client
```

Expected: FAIL because `FinancePanel.svelte` does not exist.

- [ ] **Step 4: Implement the component state machine**

Use local runes for selected term, amount strings, review mode, action status, and focus-return element. Recompute the capacity/rate explanation from `metrics.creditAssessments[selectedTerm]`. For a valid entered principal, call `projectLoanSchedule` with that exact amount and the assessment's offered rate so first/regular/peak payment copy is amount-specific; do not present the maximum-credit schedule as the selected offer. Do not persist UI review state.

Submit only after explicit review confirmation. Interpret controller results:

- success: clear the form/review and announce localized success;
- `finance-rejected`: preserve input, show localized code/context, and return focus to the relevant field;
- busy/unavailable/failed: use existing route-operation copy without claiming mutation.

Loan rows use stable `id="finance-loan-${loan.id}"`; on `focusedLoanId`, scroll and focus the row once after mount/update.

- [ ] **Step 5: Wire reactive metrics and controller actions**

In `+page.svelte`:

```ts
let financeMetrics = $derived(game ? getFinanceMetrics(game) : getFinanceMetrics(starterMapState));
```

Render `<FinancePanel>` for `activeManagementPanel.id === 'finance'`, pass the pending gate, alert focus target, and controller methods. Do not duplicate finance mutations in route code.

Keep the existing overlay, focus trap, Escape handling, and map-pause behavior.

- [ ] **Step 6: Run Svelte validation**

Use official Svelte docs before editing. Run `svelte-autofixer` on the complete contents of `FinancePanel.svelte` and `+page.svelte` until no issues remain.

Then run:

```bash
bun run test:unit -- src/lib/components/game/FinancePanel.svelte.spec.ts src/routes/gameRouteController.spec.ts --run
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/game/FinancePanel.svelte src/lib/components/game/FinancePanel.svelte.spec.ts src/routes/+page.svelte src/routes/gameRouteController.spec.ts
git commit -m "feat(finance): add finance management panel"
```

---

### Task 13: Financed-purchase review surfaces

**Files:**

- Modify: `src/lib/components/game/WorldMap.svelte`
- Modify: `src/lib/components/game/WorldMap.svelte.spec.ts`
- Modify: `src/lib/components/game/BuildMenu.svelte`
- Modify: `src/lib/components/game/BuildMenu.svelte.spec.ts`
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: route component specs covering placement

**Route review state:**

```ts
type PendingFinancedPurchase =
	| {
			kind: 'world';
			cityId: WorldCityId;
			expectedCost: number;
			offer: ExpansionFinanceOffer;
	  }
	| {
			kind: 'retail';
			tileId: string;
			archetypeId: ArchetypeId;
			expectedCost: number;
			offer: ExpansionFinanceOffer;
	  }
	| {
			kind: 'industry';
			tileId: string;
			buildingTypeId: IndustrialBuildingTypeId;
			expectedCost: number;
			offer: ExpansionFinanceOffer;
	  };
```

- [ ] **Step 1: Write failing component/route tests**

Cover:

- WorldMap keeps the cash “Open city” action and adds separate “Finance opening” only when `financeOffer` exists;
- financed world review shows exact cost, cash, shortfall, term, APR, and peak payment;
- a cash-short retail card remains selectable when credit covers the minimum setup range;
- selecting a structurally valid retail tile rechecks exact cost and opens review instead of disbursing;
- fixed-cost industrial cards behave the same;
- confirmation calls the matching typed controller method with the exact expected cost;
- cancel returns focus and creates no state change;
- a live `purchaseCostChanged`/`insufficientCredit` failure preserves the review and shows localized feedback;
- when neither cash nor credit covers cost, existing cash-required reason remains;
- cash-covered placement continues through the existing default path without a finance review;
- upgrades and rail show no embedded finance actions.

- [ ] **Step 2: Run the red tests**

Run:

```bash
bun run test:unit -- src/lib/components/game/WorldMap.svelte.spec.ts src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run --project client
```

Expected: FAIL on missing finance actions/reviews.

- [ ] **Step 3: Implement world review**

Pass each `WorldCityStatus.financeOffer` into `WorldMap`. Its finance button selects the city and opens a review surface; it must not call the cash-only `openWorldCity`. Confirm through `gameRouteController.financeWorldCity(cityId, expectedCost)`.

- [ ] **Step 4: Implement building-first retail/industry review**

Keep current map highlighting and anchor resolution. On a valid clicked tile:

- if cash covers exact cost, call the existing cash transition;
- if cash is short and the exact offer exists, populate `pendingFinancedPurchase`;
- if the offer disappeared, show the current cash-required/credit reason and do not disburse.

Render the exact review in the relevant tile inspector or its existing adjacent confirmation surface. Confirmation uses the stored expected cost, while the domain transition revalidates it.

- [ ] **Step 5: Handle result and focus lifecycle**

On success, clear review/placement state and let controller-published game state update the map. On typed failure, keep the review and selection, update the offer/reason from live state, and announce it. On cancel/Escape/mode change/scenario replacement, clear pending review with the other transient placement state.

Run mandatory Svelte docs/autofixer for every touched `.svelte` file.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun run test:unit -- src/lib/components/game/WorldMap.svelte.spec.ts src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run --project client
bun run check
bun run lint
```

Expected: PASS.

Commit:

```bash
git add src/lib/components/game src/routes/+page.svelte
git commit -m "feat(finance): review financed expansion"
```

---

### Task 14: End-to-end acceptance and whole-branch verification

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: any targeted fixtures whose assertions legitimately changed under approved debt service
- Modify: `docs/superpowers/plans/2026-07-28-finance-debt-credit-cash-runway.md` only to check completed boxes during execution

- [ ] **Step 1: Add the core Finance Playwright flow**

Following existing route helpers and settled-canvas waits:

1. start a deterministic new game;
2. open Finance with `F`;
3. select a term and enter a valid working-capital amount;
4. review and confirm;
5. assert cash, outstanding principal, loan register, and activity update;
6. advance through a scheduled payment;
7. assert the report reconciles operating/financing cash flow;
8. select the upcoming/missed alert and verify Finance opens with the loan row focused;
9. make a partial repayment or payoff and assert the liability/activity update.

Use accessible labels/roles rather than CSS implementation selectors where practical.

- [ ] **Step 2: Add financed-expansion coverage**

Create a deterministic cash-short state through supported UI actions/fixture setup, then:

- open a revealed city or choose a retail/industry build that has an 84-day offer;
- assert the review shows exact shortfall and terms;
- confirm and assert one entity plus one expansion loan is created;
- assert no extra cash-out exists.

Keep stale-cost rejection primarily in domain/component tests unless the existing E2E harness has a stable way to alter the target between review and confirm.

- [ ] **Step 3: Run targeted E2E**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "finance|financed expansion"
```

Expected: PASS.

- [ ] **Step 4: Run the full verification matrix**

Run:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 5: Audit invariants and scope**

Run:

```bash
rg -n '\.debt\b|\bdebt:\s*' src --glob '*.{ts,svelte}'
rg -n 'TO[D]O|TB[D]|FIX[M]E|place[h]older' src/lib/game/finance.ts src/lib/game/financeMetrics.ts src/lib/components/game/FinancePanel.svelte
```

Expected:

- debt hits are limited to scenario authoring sugar and intentional v10 migration fixtures;
- no unfinished marker remains;
- `TopBar.svelte` has no principal ticker;
- no finance option exists for upgrades or rail;
- `finance.ts` does not import `financeMetrics.ts`;
- all three message catalogs contain every new key;
- transaction list cap is 200 while closed loans remain unpruned.

- [ ] **Step 6: Request whole-branch review and fix valid findings**

Use `superpowers:requesting-code-review` against the branch diff. Verify every finding against current source, fix only valid issues, and rerun the smallest affected test plus the full check/lint/unit matrix. Repeat until no actionable findings remain.

- [ ] **Step 7: Commit E2E/final review fixes**

```bash
git add src docs/superpowers/plans/2026-07-28-finance-debt-credit-cash-runway.md
git commit -m "test(finance): cover debt and expansion flows"
```

---

## Task Order and Review Gates

```text
1 state/founding
  → 2 servicing/ledger
    → 5 simulation/reports
      → 3 credit
        → 4 actions
          → 6 metrics
            → 7 persistence
              → 8 decisions
                → 9 financed purchases
                  → 10 scenarios/controller
                    → 11 alerts/launcher
                      → 12 Finance panel
                        → 13 purchase UI
                          → 14 E2E/final review
```

Review and keep the branch green after every task. The three larger acceptance gates are:

1. **After Task 7:** persisted loan model, daily servicing, actions, reporting, metrics, and v11 migration are complete.
2. **After Task 10:** decisions, expansion transitions, controller commits, deterministic scenario replay, and balance evidence are complete.
3. **After Task 14:** all UI, alerts, accessibility, E2E, and whole-branch verification are complete.

## Spec Coverage Checklist

- State model, monotonic sequences, open/closed debt definitions, Founding Loan terms → Tasks 1–2.
- Day-1-through-day-9 semantics, exact micro-interest, equal principal, maturity, arrears, counters, stable order → Task 2 and Task 5.
- Transactions, 200-entry pruning, fixed current-day accumulator, micro-interest reconciliation → Tasks 2, 4, 5.
- Explainable credit, rates, lifetime history, normalized weekly service, exact schedule search → Task 3.
- Borrow, partial repayment, payoff, refinance, and typed failures → Task 4.
- Operating versus financing cash flow, scorecard isolation, report snapshots, rolling summaries → Task 5.
- Next-seven-day service, coverage, term assessments, and 90-day runway → Task 6.
- v10→v11 chained migration, historical report backfill, strict finance/report validation, all repository paths → Task 7.
- Stable emergency/supplier offers, live availability, finance-first resolution, queue preservation → Task 8.
- Exact-shortfall 84-day loans and atomic world/retail/industry transitions → Task 9.
- Deterministic commands, content/cost validation, autosave-on-success, scenario overrides/metrics/balance replay → Task 10.
- Four alert kinds, source/sort order, localized current-state copy, Finance deep links, `F` launcher → Task 11.
- Overview, credit explanation, register, borrow/repay/payoff/refinance reviews, activity, focus/live status/responsive layout → Task 12.
- Separate financed-expansion offers and confirmation surfaces while cash remains default → Task 13.
- Player-visible borrowing/payment/alert/repayment and financed-expansion acceptance → Task 14.
- Non-goals remain absent: no overdraft, lender marketplace, credit tiers, collateral, bankruptcy, floating rates, cash-out refinance, upgrade/rail financing, Top Bar debt ticker, or arbitrary scenario loan schema.

## Plan Self-Review Checklist

- [ ] Every approved design section maps to at least one task above.
- [ ] Every new interface has one owner and one import direction.
- [ ] Every expected player failure is typed and leaves the original state uncommitted.
- [ ] Every persisted field has constructor, migration, validation, and round-trip coverage.
- [ ] Every Svelte change includes the mandatory docs/autofixer step.
- [ ] Every task contains a red test, implementation step, green command, and commit.
- [ ] No unfinished marker or unresolved product choice remains in this plan.
- [ ] The final verification matrix matches `CLAUDE.md`.

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-07-28-finance-debt-credit-cash-runway.md`. Choose one:

1. **Subagent-Driven (recommended):** implement task-by-task in a dedicated worktree using `superpowers:using-git-worktrees`, with a fresh worker and review gate for each task.
2. **Inline Execution:** implement sequentially in this task using `superpowers:executing-plans`, pausing at the three acceptance gates above.
