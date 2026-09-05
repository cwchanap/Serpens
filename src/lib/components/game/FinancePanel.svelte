<script lang="ts">
	import { tick } from 'svelte';
	import {
		assessCredit,
		estimateNextLoanPayment,
		getLoanArrearsAmount,
		getPayoffAmount,
		projectLoanSchedule
	} from '$lib/game/finance';
	import type { FinanceMetrics, CashRunway } from '$lib/game/financeMetrics';
	import type { I18nBundle } from '$lib/i18n';
	import type { FinanceFailureCode } from '$lib/game/finance';
	import type { GameState, LoanInstrument, LoanTermDays } from '$lib/game/types';
	import type { GameRouteCommitResult } from '$lib/game/commandResult';

	type ReviewAction =
		| { kind: 'borrow'; amount: number; termDays: LoanTermDays }
		| { kind: 'repay'; loanId: string; amount: number }
		| { kind: 'payoff'; loanId: string; amount: number }
		| { kind: 'refinance'; loanId: string; termDays: LoanTermDays; amount: number };

	/** Compact dossier limit for the recent-activity lines below the register. */
	const RECENT_TRANSACTION_LIMIT = 6;

	let {
		game,
		metrics,
		i18n,
		live = true,
		focusedLoanId = null,
		mutationPending = false,
		onBorrow,
		onRepay,
		onPayoff,
		onRefinance
	}: {
		game: GameState;
		metrics: FinanceMetrics;
		i18n: I18nBundle;
		/** False while no live game exists yet: card figures render muted '—' instead of synthetic values. */
		live?: boolean;
		focusedLoanId?: string | null;
		mutationPending?: boolean;
		onBorrow: (amount: number, termDays: LoanTermDays) => Promise<GameRouteCommitResult>;
		onRepay: (loanId: string, amount: number) => Promise<GameRouteCommitResult>;
		onPayoff: (loanId: string) => Promise<GameRouteCommitResult>;
		onRefinance: (loanId: string, termDays: LoanTermDays) => Promise<GameRouteCommitResult>;
	} = $props();

	let selectedTerm = $state<LoanTermDays>(84);
	let borrowAmount = $state('');
	let repaymentAmounts = $state<Record<string, string>>({});
	let review = $state<ReviewAction | null>(null);
	let fieldError = $state<{ field: string; message: string } | null>(null);
	let statusMessage = $state('');
	let returnFocusField = $state<string | null>(null);
	let reviewHeading = $state<HTMLHeadingElement | null>(null);
	let submitting = $state(false);

	let selectedAssessment = $derived(metrics.creditAssessments[selectedTerm]);
	let enteredBorrowAmount = $derived(parseWholeDollars(borrowAmount));
	let enteredBorrowSchedule = $derived(
		enteredBorrowAmount === null
			? null
			: projectLoanSchedule({
					principal: enteredBorrowAmount,
					annualInterestRateBps: selectedAssessment.annualInterestRateBps,
					termDays: selectedTerm
				})
	);
	let recentTransactions = $derived(
		[...game.finance.transactions].reverse().slice(0, RECENT_TRANSACTION_LIMIT)
	);
	let transactionsHidden = $derived(
		game.finance.transactions.length > RECENT_TRANSACTION_LIMIT
			? game.finance.transactions.length - RECENT_TRANSACTION_LIMIT
			: 0
	);

	// Runway/leverage card: the real 90-day cash projection from the trailing
	// reports plus debt service (cashRunway), and an honest leverage ratio of
	// outstanding principal over cash. The moss bar maps runway depth onto the
	// same 90-day horizon the projection already uses (presentational mapping).
	let runway = $derived(metrics.cashRunway);
	let runwayBarPercent = $derived(runway.kind === 'ninetyPlus' ? 100 : Math.min(100, runway.days));
	let leverageRatio = $derived(game.cash > 0 ? metrics.outstandingPrincipal / game.cash : null);
	let runwayHealthy = $derived(runway.kind === 'ninetyPlus' || runway.days >= 30);

	// Ledger-equation strip: signed real figures only. Positive terms are cash
	// and the trailing seven-day operating cash flow (moss when non-negative),
	// liabilities are outstanding principal and the next scheduled payment
	// (wax). Zero/absent terms are omitted so the strip never implies figures
	// the game does not have; the net is the plain sum.
	let ledgerEquation = $derived.by(
		(): {
			terms: { text: string; positive: boolean }[];
			net: string;
			netPositive: boolean;
		} | null => {
			if (!live) return null;
			const signed = (value: number): string =>
				(value >= 0 ? '+' : '') + i18n.format.currency(value);
			const terms: { text: string; positive: boolean }[] = [
				{ text: signed(game.cash), positive: game.cash >= 0 }
			];
			const flow = metrics.trailingSevenDayOperatingCashFlow;
			if (flow !== 0) terms.push({ text: signed(flow), positive: flow >= 0 });
			if (metrics.outstandingPrincipal > 0)
				terms.push({ text: signed(-metrics.outstandingPrincipal), positive: false });
			const next = metrics.nextLoanPayment;
			if (next !== null) terms.push({ text: signed(-next.amount), positive: false });
			const net =
				game.cash + flow - metrics.outstandingPrincipal - (next === null ? 0 : next.amount);
			return { terms, net: i18n.format.currency(net), netPositive: net >= 0 };
		}
	);

	$effect(() => {
		const id = focusedLoanId;
		if (!id) return;
		void tick().then(() => {
			const row = document.getElementById(`finance-loan-${id}`);
			row?.scrollIntoView({ block: 'nearest' });
			row?.focus();
		});
	});

	$effect(() => {
		if (!review) return;
		void tick().then(() => reviewHeading?.focus());
	});

	function parseWholeDollars(value: string): number | null {
		if (!/^\d+$/.test(value.trim())) return null;
		const amount = Number(value);
		return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
	}

	function formatRunway(runwayValue: CashRunway): string {
		return runwayValue.kind === 'ninetyPlus'
			? i18n.t('financePanel.ui.ninetyPlusDays')
			: i18n.t('financePanel.ui.days', { days: i18n.format.integer(runwayValue.days) });
	}

	function loanPayoffQuote(loan: LoanInstrument): number {
		return getPayoffAmount(loan);
	}

	function isOpenLoan(loan: LoanInstrument): boolean {
		return loan.status === 'active' || loan.status === 'delinquent';
	}

	function fieldIdForLoan(prefix: string, loanId: string): string {
		return `${prefix}-${loanId}`;
	}

	function setError(field: string, message: string): void {
		fieldError = { field, message };
		statusMessage = message;
	}

	function clearError(field: string): void {
		if (fieldError?.field === field) fieldError = null;
	}

	function openBorrowReview(): void {
		if (mutationPending) return;
		const amount = enteredBorrowAmount;
		if (amount === null) {
			setError('borrow', i18n.t('financePanel.failures.invalidAmount'));
			return;
		}
		if (amount < 1_000) {
			setError('borrow', i18n.t('financePanel.failures.belowMinimumBorrowing'));
			return;
		}
		if (amount > selectedAssessment.availableCredit) {
			setError('borrow', i18n.t('financePanel.failures.insufficientCredit'));
			return;
		}
		fieldError = null;
		returnFocusField = 'borrow-amount';
		review = { kind: 'borrow', amount, termDays: selectedTerm };
	}

	function openRepayReview(loan: LoanInstrument): void {
		if (mutationPending) return;
		const field = fieldIdForLoan('repay-amount', loan.id);
		const amount = parseWholeDollars(repaymentAmounts[loan.id] ?? '');
		if (amount === null) {
			setError(field, i18n.t('financePanel.failures.invalidAmount'));
			return;
		}
		const payoff = loanPayoffQuote(loan);
		if (amount > payoff) {
			setError(field, i18n.t('financePanel.failures.overpayment'));
			return;
		}
		fieldError = null;
		returnFocusField = field;
		review = { kind: 'repay', loanId: loan.id, amount };
	}

	function openPayoffReview(loan: LoanInstrument): void {
		if (mutationPending) return;
		returnFocusField = `payoff-${loan.id}`;
		review = { kind: 'payoff', loanId: loan.id, amount: loanPayoffQuote(loan) };
	}

	function openRefinanceReview(loan: LoanInstrument, termDays: LoanTermDays): void {
		if (mutationPending) return;
		returnFocusField = `refinance-${loan.id}-${termDays}`;
		review = { kind: 'refinance', loanId: loan.id, termDays, amount: loanPayoffQuote(loan) };
	}

	function refinanceComparison(action: Extract<ReviewAction, { kind: 'refinance' }>) {
		const assessment = assessCredit(game, action.termDays, { excludeLoanId: action.loanId });
		return {
			assessment,
			schedule: projectLoanSchedule({
				principal: action.amount,
				annualInterestRateBps: assessment.annualInterestRateBps,
				termDays: action.termDays
			})
		};
	}

	async function cancelReview(): Promise<void> {
		const focusId = returnFocusField;
		review = null;
		await tick();
		if (focusId) document.getElementById(focusId)?.focus();
	}

	function financeFailureMessage(code: FinanceFailureCode): string {
		switch (code) {
			case 'loanNotFound':
				return i18n.t('financePanel.failures.loanNotFound');
			case 'loanClosed':
				return i18n.t('financePanel.failures.loanClosed');
			case 'loanDelinquent':
				return i18n.t('financePanel.failures.loanDelinquent');
			case 'invalidAmount':
				return i18n.t('financePanel.failures.invalidAmount');
			case 'belowMinimumBorrowing':
				return i18n.t('financePanel.failures.belowMinimumBorrowing');
			case 'insufficientCash':
				return i18n.t('financePanel.failures.insufficientCash');
			case 'overpayment':
				return i18n.t('financePanel.failures.overpayment');
			case 'unsupportedTerm':
				return i18n.t('financePanel.failures.unsupportedTerm');
			case 'unsupportedPurpose':
				return i18n.t('financePanel.failures.unsupportedPurpose');
			case 'insufficientCredit':
				return i18n.t('financePanel.failures.insufficientCredit');
			case 'purchaseUnavailable':
				return i18n.t('financePanel.failures.purchaseUnavailable');
			case 'purchaseCostChanged':
				return i18n.t('financePanel.failures.purchaseCostChanged');
			case 'cashSufficient':
				return i18n.t('financePanel.failures.cashSufficient');
		}
	}

	function isCommitted(result: GameRouteCommitResult): boolean {
		return (
			result.status === 'committed' || (result.status === 'sandbox-committed' && result.changed)
		);
	}

	function describeResult(result: GameRouteCommitResult): string {
		if (result.status === 'domain-rejected') return financeFailureMessage(result.code);
		if (result.status === 'busy') return i18n.t('financePanel.ui.busy');
		if (result.status === 'unavailable')
			return i18n.t('financePanel.decisionAvailability.unavailable');
		if (result.status === 'confirmation-required')
			return i18n.t('financePanel.ui.confirmationRequired');
		if (result.status === 'unchanged' || result.status === 'sandbox-committed')
			return i18n.t('financePanel.ui.unchanged');
		if (result.status === 'failed' || result.status === 'rejected')
			return i18n.t('financePanel.ui.failed');
		return i18n.t('financePanel.ui.failed');
	}

	async function confirmReview(): Promise<void> {
		if (!review || mutationPending || submitting) return;
		const action = review;
		submitting = true;
		try {
			let result: GameRouteCommitResult;
			if (action.kind === 'borrow') {
				result = await onBorrow(action.amount, action.termDays);
			} else if (action.kind === 'repay') {
				result = await onRepay(action.loanId, action.amount);
			} else if (action.kind === 'payoff') {
				result = await onPayoff(action.loanId);
			} else {
				result = await onRefinance(action.loanId, action.termDays);
			}

			if (!isCommitted(result)) {
				const failure = describeResult(result);
				const field =
					action.kind === 'borrow'
						? 'borrow'
						: action.kind === 'repay'
							? fieldIdForLoan('repay-amount', action.loanId)
							: (returnFocusField ?? 'borrow');
				setError(field, failure);
				if (result.status === 'domain-rejected') {
					await tick();
					document.getElementById(returnFocusField ?? 'borrow-amount')?.focus();
				}
				return;
			}

			if (action.kind === 'borrow') borrowAmount = '';
			if (action.kind === 'repay') repaymentAmounts = { ...repaymentAmounts, [action.loanId]: '' };
			fieldError = null;
			review = null;
			statusMessage =
				action.kind === 'borrow'
					? i18n.t('financePanel.ui.borrowingConfirmed')
					: action.kind === 'repay'
						? i18n.t('financePanel.ui.repaymentConfirmed')
						: action.kind === 'payoff'
							? i18n.t('financePanel.ui.payoffConfirmed')
							: i18n.t('financePanel.ui.refinancingConfirmed');
		} finally {
			submitting = false;
		}
	}

	function transactionLabel(kind: GameState['finance']['transactions'][number]['kind']): string {
		return i18n.t(`financePanel.transactions.${kind}`);
	}

	function reviewActionLabel(action: ReviewAction['kind']): string {
		switch (action) {
			case 'borrow':
				return i18n.t('financePanel.ui.actionBorrowing');
			case 'repay':
				return i18n.t('financePanel.ui.actionRepayment');
			case 'payoff':
				return i18n.t('financePanel.ui.actionPayoff');
			case 'refinance':
				return i18n.t('financePanel.ui.actionRefinancing');
		}
	}
</script>

<section class="finance-panel" aria-labelledby="finance-heading">
	<h2 id="finance-heading" class="visually-hidden">{i18n.t('financePanel.title')}</h2>
	<p class="live-status" aria-live="polite" role="status">{statusMessage}</p>

	<div class="kpi-row">
		<article class="kpi-card">
			<p class="kpi-label">{i18n.t('financePanel.ui.cash')}</p>
			<strong class="kpi-value" class:wax={live && game.cash < 0} class:placeholder={!live}
				>{live ? i18n.format.currency(game.cash) : '—'}</strong
			>
		</article>
		<article class="kpi-card">
			<p class="kpi-label">{i18n.t('financePanel.metrics.outstanding')}</p>
			<strong class="kpi-value" class:placeholder={!live}
				>{live ? i18n.format.currency(metrics.outstandingPrincipal) : '—'}</strong
			>
		</article>
		<article class="kpi-card">
			<p class="kpi-label">{i18n.t('financePanel.metrics.nextPayment')}</p>
			{#if !live}
				<strong class="kpi-value placeholder">—</strong>
			{:else if metrics.nextLoanPayment === null}
				<strong class="kpi-value kpi-muted"
					>{i18n.t('financePanel.metrics.noDebtServiceDue')}</strong
				>
			{:else}
				<strong class="kpi-value wax">{i18n.format.currency(metrics.nextLoanPayment.amount)}</strong
				>
				<span class="kpi-note"
					>{i18n.t('financePanel.ui.day', {
						day: i18n.format.integer(metrics.nextLoanPayment.day)
					})}</span
				>
			{/if}
		</article>
		<article class="kpi-card">
			<p class="kpi-label">{i18n.t('financePanel.ui.runwayLeverage')}</p>
			{#if !live}
				<strong class="kpi-value placeholder">—</strong>
			{:else}
				<div class="kpi-value-row">
					<strong class="kpi-value">{formatRunway(runway)}</strong>
					{#if leverageRatio !== null}
						<span class="kpi-leverage" title={i18n.t('financePanel.ui.leverage')}
							>{leverageRatio.toFixed(2)}×</span
						>
					{/if}
				</div>
				<span class="runway-bar" aria-hidden="true">
					<span
						class:healthy={runwayHealthy}
						class:stressed={!runwayHealthy}
						style:width={`${runwayBarPercent}%`}
					></span>
				</span>
			{/if}
		</article>
	</div>

	<div class="dossier">
		<section class="dossier-col credit-col" aria-labelledby="credit-heading">
			<h3 id="credit-heading" class="eyebrow dossier-heading">
				{i18n.t('financePanel.ui.creditOffer')}
			</h3>
			<div class="term-cells" role="group" aria-label={i18n.t('financePanel.ui.loanTerm')}>
				{#each [28, 56, 84] as term (term)}
					{@const offer = metrics.creditAssessments[term as LoanTermDays]}
					<button
						type="button"
						class="term-cell"
						class:active={selectedTerm === term}
						aria-label={i18n.labels.loanTerm(term)}
						aria-pressed={selectedTerm === term}
						disabled={mutationPending}
						onclick={() => (selectedTerm = term as LoanTermDays)}
					>
						<span class="term-name">{i18n.labels.loanTerm(term)}</span>
						<span class="term-rate" aria-hidden="true"
							>{live
								? `${i18n.format.apr(offer.annualInterestRateBps)} ${i18n.t('financePanel.ui.apr')}`
								: '—'}</span
						>
						<span class="term-credit">
							{#if live}
								<span class="term-credit-label">{i18n.t('financePanel.ui.availableCredit')}</span
								><strong class="term-credit-value"
									>{i18n.format.currency(offer.availableCredit)}</strong
								>
							{:else}<span class="placeholder">—</span>{/if}
						</span>
					</button>
				{/each}
			</div>
			<div class="borrow-row">
				<label class="field" for="borrow-amount">
					<span class="field-label">{i18n.t('financePanel.ui.borrowAmount')}</span>
					<input
						id="borrow-amount"
						inputmode="numeric"
						autocomplete="off"
						aria-describedby={fieldError?.field === 'borrow' ? 'borrow-error' : undefined}
						aria-invalid={fieldError?.field === 'borrow'}
						disabled={mutationPending}
						bind:value={borrowAmount}
						oninput={() => clearError('borrow')}
					/>
				</label>
				<button
					type="button"
					class="review-cta"
					disabled={mutationPending}
					onclick={openBorrowReview}>{i18n.t('financePanel.ui.reviewBorrowing')}</button
				>
				{#if fieldError?.field === 'borrow'}<p id="borrow-error" class="error">
						{fieldError.message}
					</p>{/if}
			</div>
			{#if live}
				<p class="credit-facts">
					<span class="fact">
						<span class="fact-label">{i18n.t('financePanel.ui.finalApr')}</span>
						<strong>{i18n.format.apr(selectedAssessment.annualInterestRateBps)}</strong>
					</span>
					<span class="fact">
						<span class="fact-label">{i18n.t('financePanel.ui.availableCredit')}</span>
						<strong>{i18n.format.currency(selectedAssessment.availableCredit)}</strong>
					</span>
					<span class="fact">
						<span class="fact-label">{i18n.t('financePanel.ui.operatingCashFlow')}</span>
						<strong>{i18n.format.currency(selectedAssessment.weeklyOperatingCashFlow)}</strong
						>{i18n.t('financePanel.ui.perWeek')}
					</span>
					{#if selectedAssessment.baseRateBps !== selectedAssessment.annualInterestRateBps}
						<span class="fact fact-adjustments">
							<span class="fact-label">{i18n.t('financePanel.credit.adjustments')}</span>
							<strong
								>{i18n.t('financePanel.ui.healthAdjustment', {
									amount: i18n.format.apr(selectedAssessment.healthPenaltyBps)
								})} · {i18n.t('financePanel.ui.historyAdjustment', {
									amount: i18n.format.apr(selectedAssessment.historyPenaltyBps)
								})}</strong
							>
						</span>
					{/if}
				</p>
				{#if enteredBorrowSchedule}
					<p class="credit-facts">
						<span class="fact">
							<span class="fact-label">{i18n.t('financePanel.ui.firstPayment')}</span>
							<strong>{i18n.format.currency(enteredBorrowSchedule.firstPayment)}</strong>
						</span>
						<span class="fact">
							<span class="fact-label">{i18n.t('financePanel.ui.regularPayment')}</span>
							<strong>{i18n.format.currency(enteredBorrowSchedule.regularPayment)}</strong>
						</span>
						<span class="fact">
							<span class="fact-label">{i18n.t('financePanel.ui.peakPayment')}</span>
							<strong>{i18n.format.currency(enteredBorrowSchedule.peakPayment)}</strong>
						</span>
					</p>
				{/if}
				{#if selectedAssessment.reasons.length}
					<p class="credit-reason">
						{selectedAssessment.reasons
							.map((reason) => i18n.t(`financePanel.credit.reasons.${reason}`))
							.join(' · ')}
					</p>
				{/if}
			{:else}
				<p class="credit-facts placeholder">—</p>
			{/if}
		</section>

		<section class="dossier-col register-col" aria-labelledby="loans-heading">
			<h3 id="loans-heading" class="eyebrow dossier-heading">
				{i18n.t('financePanel.ui.loansAndHistory')}
			</h3>
			<div class="loan-notes">
				{#each game.finance.loans as loan (loan.id)}
					{@const open = isOpenLoan(loan)}
					{@const arrears = getLoanArrearsAmount(loan)}
					{@const payoff = loanPayoffQuote(loan)}
					<article
						id={`finance-loan-${loan.id}`}
						class="loan-note"
						class:loan-closed={!open}
						class:loan-delinquent={loan.status === 'delinquent'}
						tabindex="-1"
					>
						<div class="note-title">
							<h4 class="note-name">{i18n.labels.loanPurpose(loan.purpose)}</h4>
							<span class="note-dash" aria-hidden="true">—</span>
							<strong class="note-principal" class:placeholder={!open}
								>{i18n.format.currency(
									open ? loan.remainingPrincipal : loan.originalPrincipal
								)}</strong
							>
							{#if loan.status !== 'active'}
								<span class="note-status" class:wax={loan.status === 'delinquent'}
									>{i18n.labels.loanStatus(loan.status)}</span
								>
							{/if}
						</div>
						<p class="note-facts">
							<span class="fact">
								<span class="fact-label">{i18n.t('financePanel.ui.term')}</span>
								<strong>{i18n.labels.loanTerm(loan.termDays)}</strong>
							</span>
							<span class="fact">
								<strong
									>{i18n.format.apr(loan.annualInterestRateBps)}
									{i18n.t('financePanel.ui.apr')}</strong
								>
							</span>
							{#if loan.nextPaymentDay !== null}
								<span class="fact">
									<span class="fact-label">{i18n.t('financePanel.metrics.nextPayment')}</span>
									<strong>{i18n.format.currency(estimateNextLoanPayment(loan))}</strong>
									<span
										>{i18n.t('financePanel.ui.day', {
											day: i18n.format.integer(loan.nextPaymentDay)
										})}</span
									>
								</span>
							{/if}
							{#if arrears > 0}
								<span class="fact fact-arrears">
									<span class="fact-label">{i18n.t('financePanel.ui.arrears')}</span>
									<strong>{i18n.format.currency(arrears)}</strong>
								</span>
							{/if}
							{#if open}
								<span class="fact">
									<span class="fact-label">{i18n.t('financePanel.ui.payoffQuote')}</span>
									<strong>{i18n.format.currency(payoff)}</strong>
								</span>
							{/if}
						</p>
						{#if open}
							<div class="note-actions">
								<span class="repay-cluster">
									<span class="money-prefix" aria-hidden="true">$</span>
									<input
										id={fieldIdForLoan('repay-amount', loan.id)}
										class="amount-input"
										type="text"
										inputmode="numeric"
										autocomplete="off"
										aria-label={i18n.t('financePanel.ui.repayAmount')}
										disabled={mutationPending}
										aria-invalid={fieldError?.field === fieldIdForLoan('repay-amount', loan.id)}
										aria-describedby={fieldError?.field === fieldIdForLoan('repay-amount', loan.id)
											? `${fieldIdForLoan('repay-amount', loan.id)}-error`
											: undefined}
										value={repaymentAmounts[loan.id] ?? ''}
										oninput={(event) => {
											repaymentAmounts = {
												...repaymentAmounts,
												[loan.id]: event.currentTarget.value
											};
											clearError(fieldIdForLoan('repay-amount', loan.id));
										}}
									/>
									<button
										type="button"
										class="action-chip"
										disabled={mutationPending}
										aria-label={i18n.t('financePanel.ui.reviewRepayment')}
										title={i18n.t('financePanel.ui.reviewRepayment')}
										onclick={() => openRepayReview(loan)}
										>{i18n.t('financePanel.ui.actionRepayment')}</button
									>
								</span>
								<button
									id={`payoff-${loan.id}`}
									type="button"
									class="action-chip"
									disabled={mutationPending}
									aria-label={i18n.t('financePanel.ui.reviewPayoff')}
									title={i18n.t('financePanel.ui.reviewPayoff')}
									aria-describedby={fieldError?.field === `payoff-${loan.id}`
										? `payoff-${loan.id}-error`
										: undefined}
									onclick={() => openPayoffReview(loan)}
									>{i18n.t('financePanel.ui.actionPayoff')}</button
								>
								<span
									class="refi-cluster"
									role="group"
									aria-label={i18n.t('financePanel.ui.refinance')}
								>
									<span class="cluster-caption" aria-hidden="true"
										>{i18n.t('financePanel.ui.refinance')}</span
									>
									{#each [28, 56, 84] as term (term)}<button
											id={`refinance-${loan.id}-${term}`}
											type="button"
											class="term-chip"
											disabled={mutationPending || loan.status === 'delinquent'}
											aria-label={`${i18n.t('financePanel.ui.refinance')} ${i18n.labels.loanTerm(term)}`}
											title={`${i18n.t('financePanel.ui.refinance')} ${i18n.labels.loanTerm(term)}`}
											aria-describedby={fieldError?.field === `refinance-${loan.id}-${term}`
												? `refinance-${loan.id}-${term}-error`
												: undefined}
											onclick={() => openRefinanceReview(loan, term as LoanTermDays)}
											>{i18n.format.integer(term)}</button
										>{#if fieldError?.field === `refinance-${loan.id}-${term}`}<p
												id={`refinance-${loan.id}-${term}-error`}
												class="error"
											>
												{fieldError.message}
											</p>{/if}{/each}
								</span>
								{#if fieldError?.field === fieldIdForLoan('repay-amount', loan.id)}<p
										id={`${fieldIdForLoan('repay-amount', loan.id)}-error`}
										class="error"
									>
										{fieldError.message}
									</p>{/if}
								{#if fieldError?.field === `payoff-${loan.id}`}<p
										id={`payoff-${loan.id}-error`}
										class="error"
									>
										{fieldError.message}
									</p>{/if}
							</div>
						{/if}
					</article>
				{/each}
			</div>

			<section class="recent" aria-labelledby="recent-heading">
				<h3 id="recent-heading" class="eyebrow dossier-heading">
					{i18n.t('financePanel.ui.transactionActivity')}
				</h3>
				{#if recentTransactions.length}
					<ol class="transactions">
						{#each recentTransactions as transaction (transaction.id)}
							<li class="txn-row">
								<span class="txn-date"
									>{i18n.t('financePanel.ui.day', {
										day: i18n.format.integer(transaction.day)
									})}</span
								>
								<strong class="txn-kind">{transactionLabel(transaction.kind)}</strong>
								<span
									class="txn-amount"
									class:gain={transaction.cashDelta > 0}
									class:loss={transaction.cashDelta < 0}
									>{`${transaction.cashDelta >= 0 ? '+' : ''}${i18n.format.currency(transaction.cashDelta)}`}</span
								>
							</li>
						{/each}
					</ol>
					{#if transactionsHidden > 0}
						<p class="more-line" aria-hidden="true">+ {i18n.format.integer(transactionsHidden)}</p>
					{/if}
				{:else}<p class="no-activity">{i18n.t('financePanel.ui.noActivity')}</p>{/if}
			</section>
		</section>
	</div>

	<p class="ledger-strip">
		<span class="strip-caption">{i18n.t('financePanel.ui.netPosition')}</span>
		{#if !live}
			<span class="placeholder">—</span>
		{:else if ledgerEquation}
			{#each ledgerEquation.terms as term (term.text)}
				<span class="eq-term" class:pos={term.positive} class:neg={!term.positive}>{term.text}</span
				>
			{/each}
			<span class="eq-equals" aria-hidden="true">=</span>
			<strong
				class="eq-net"
				class:pos={ledgerEquation.netPositive}
				class:neg={!ledgerEquation.netPositive}>{ledgerEquation.net}</strong
			>
		{/if}
	</p>

	{#if review}
		<div class="review" role="group" aria-labelledby="finance-review-heading">
			<h3 id="finance-review-heading" tabindex="-1" bind:this={reviewHeading}>
				{i18n.t('financePanel.ui.reviewAction', { action: reviewActionLabel(review.kind) })}
			</h3>
			<p>
				{review.kind === 'refinance'
					? i18n.t('financePanel.ui.refinanceReview', {
							amount: i18n.format.currency(review.amount),
							term: i18n.labels.loanTerm(review.termDays)
						})
					: i18n.t('financePanel.ui.reviewSubmission', {
							amount: i18n.format.currency(review.amount)
						})}
			</p>
			{#if review.kind === 'refinance'}
				{@const comparison = refinanceComparison(review)}
				<p>
					{i18n.t('financePanel.ui.replacementComparison', {
						apr: i18n.format.apr(comparison.assessment.annualInterestRateBps),
						firstPayment: i18n.format.currency(comparison.schedule.firstPayment),
						peakPayment: i18n.format.currency(comparison.schedule.peakPayment)
					})}
				</p>
			{/if}
			<div class="review-actions">
				<button type="button" disabled={mutationPending || submitting} onclick={cancelReview}
					>{i18n.t('financePanel.ui.cancelReview')}</button
				><button type="button" disabled={mutationPending || submitting} onclick={confirmReview}
					>{i18n.t('financePanel.ui.confirm', { action: reviewActionLabel(review.kind) })}</button
				>
			</div>
		</div>
	{/if}
</section>

<style>
	.finance-panel {
		display: grid;
		min-width: 0;
		gap: 0.85rem;
		color: var(--ink-700);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	h3,
	h4,
	p {
		margin: 0;
	}

	h4 {
		font-family: var(--font-display);
		font-weight: 400;
	}

	.eyebrow.dossier-heading {
		margin: 0;
		font-size: 0.6rem;
		letter-spacing: 0.16em;
	}

	strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.placeholder {
		color: var(--ink-400);
	}

	/* ---- KPI row ---- */
	.kpi-row {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.kpi-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.35rem;
		padding: 0.6rem 0.7rem 0.55rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			0 1px 0 rgba(20, 16, 10, 0.08);
	}

	.kpi-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}

	.kpi-value {
		font-size: 1.15rem;
		overflow-wrap: anywhere;
	}

	.kpi-value.wax {
		color: var(--wax-red);
	}

	.kpi-value.kpi-muted {
		font-size: 0.76rem;
		letter-spacing: normal;
		text-transform: none;
		overflow-wrap: anywhere;
	}

	.kpi-value-row {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		min-width: 0;
	}

	.kpi-leverage {
		flex: none;
		color: var(--brass-700);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.kpi-note {
		margin-top: auto;
		color: var(--ink-400);
		font-family: var(--font-mono);
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
	}

	/* Runway health bar: depth of the real 90-day projection. Moss while the
	   projection clears the horizon comfortably, wax-red when it is stressed
	   (presentational severity mapping on a real day count). */
	.runway-bar {
		display: block;
		height: 5px;
		margin-top: auto;
		border: 1px solid var(--brass-300);
		border-radius: 1px;
		background: color-mix(in srgb, var(--paper-200) 70%, var(--brass-100));
		overflow: hidden;
	}

	.runway-bar > span {
		display: block;
		height: 100%;
	}

	.runway-bar > span.healthy {
		background: var(--moss);
	}

	.runway-bar > span.stressed {
		background: var(--wax-red);
	}

	/* ---- Lower dossier: credit offers left, loan register right ---- */
	.dossier {
		display: grid;
		grid-template-columns: minmax(0, 9fr) minmax(0, 11fr);
		align-items: start;
		gap: 0.9rem;
	}

	.dossier-col {
		display: grid;
		min-width: 0;
		gap: 0.5rem;
	}

	.term-cells {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.term-cell {
		display: grid;
		min-width: 0;
		gap: 0.18rem;
		align-content: start;
		text-align: left;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-50);
		color: var(--ink-700);
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			0 1px 0 rgba(20, 16, 10, 0.08);
	}

	.term-cell:hover,
	.term-cell:focus-visible {
		border-color: var(--brass-500);
	}

	/* Selected offer: pale brass fill (the mock's selection tint). */
	.term-cell.active {
		background: var(--brass-100);
		border-color: var(--brass-500);
		color: var(--ink-900);
		box-shadow:
			inset 0 0 0 1px var(--paper-50),
			0 1px 0 rgba(20, 16, 10, 0.08);
	}

	.term-cell.active .term-name,
	.term-cell.active .term-rate,
	.term-cell.active .term-credit-label,
	.term-cell.active .term-credit-value {
		color: var(--ink-900);
	}

	.term-name {
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.term-rate {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.term-credit {
		display: grid;
		min-width: 0;
		gap: 0.08rem;
	}

	.term-credit-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.term-credit-value {
		font-size: 0.7rem;
		overflow-wrap: anywhere;
	}

	.borrow-row {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
		padding: 0.55rem 0.6rem 0.55rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background-color: var(--paper-100);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
	}

	.field {
		display: grid;
		min-width: 0;
		gap: 0.2rem;
		flex: 1 1 8.5rem;
	}

	.field-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.field input {
		width: 100%;
		padding: 0.34rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.field input:focus-visible,
	.amount-input:focus-visible {
		outline: 2px solid var(--brass-500);
		outline-offset: 1px;
		border-color: var(--brass-700);
	}

	.review-cta {
		flex: none;
		background: var(--moss);
		border-color: var(--ink-900);
		color: var(--paper-50);
		box-shadow: inset 0 0 0 1px var(--moss-2);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 0.45rem 0.8rem;
		border-radius: 3px;
	}

	.review-cta:hover,
	.review-cta:focus-visible {
		background: var(--moss-2);
	}

	.credit-facts {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.9rem;
		row-gap: 0.2rem;
		padding-top: 0.1rem;
		font-family: var(--font-mono);
		font-size: 0.76rem;
	}

	.credit-facts.placeholder {
		font-family: var(--font-mono);
	}

	.fact {
		display: inline-flex;
		align-items: baseline;
		flex-wrap: wrap;
		column-gap: 0.35rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.fact-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.credit-facts .fact strong,
	.note-facts .fact strong {
		color: var(--ink-700);
		font-size: 0.76rem;
	}

	.credit-reason {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		overflow-wrap: anywhere;
	}

	.error {
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 700;
	}

	/* ---- Loan register: ruled, note-like rows ---- */
	.loan-notes {
		display: grid;
		min-width: 0;
	}

	.loan-note {
		display: grid;
		min-width: 0;
		gap: 0.28rem;
		padding: 0.5rem 0.15rem 0.45rem;
		border-bottom: 1px solid color-mix(in srgb, var(--brass-500) 35%, transparent);
	}

	.loan-note:focus {
		outline: 2px solid var(--brass-500);
		outline-offset: 3px;
	}

	.loan-note:last-child {
		border-bottom: 0;
	}

	.note-title {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		column-gap: 0.5rem;
		min-width: 0;
	}

	.note-name {
		font-size: 1.02rem;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.note-dash {
		color: var(--ink-400);
		font-family: var(--font-mono);
	}

	.note-principal {
		font-size: 0.95rem;
		overflow-wrap: anywhere;
	}

	.loan-closed .note-principal {
		font-size: 0.8rem;
	}

	.note-status {
		margin-left: auto;
		padding: 0.08rem 0.45rem;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		color: var(--ink-500);
		background: var(--paper-100);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.note-status.wax {
		border-color: color-mix(in srgb, var(--wax-red) 45%, transparent);
		color: var(--wax-red);
		background: color-mix(in srgb, var(--wax-red) 8%, var(--paper-50));
	}

	.note-facts {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		column-gap: 0.75rem;
		row-gap: 0.15rem;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--ink-400);
		overflow-wrap: anywhere;
	}

	.note-facts .fact span:not(.fact-label) {
		color: var(--ink-400);
	}

	.fact-arrears,
	.fact-arrears strong,
	.fact-arrears .fact-label {
		color: var(--wax-red);
	}

	/* Mutation controls: compact chips that keep their exact accessible names
	   (aria-label/title) while the visible glyph stays short. */
	.note-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
		padding-top: 0.05rem;
	}

	.repay-cluster {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-100);
		padding: 0.18rem 0.2rem 0.18rem 0.4rem;
	}

	.money-prefix {
		color: var(--ink-400);
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}

	.amount-input {
		width: 5.6rem;
		padding: 0.22rem 0.3rem;
		border: 0;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
	}

	.amount-input:focus-visible {
		outline-offset: 0;
	}

	.action-chip,
	.term-chip {
		padding: 0.28rem 0.55rem;
		border-radius: 3px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		box-shadow: inset 0 0 0 1px var(--paper-100);
	}

	.action-chip {
		border: 1px solid var(--brass-500);
	}

	.action-chip:hover,
	.action-chip:focus-visible,
	.term-chip:hover,
	.term-chip:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-700);
	}

	.refi-cluster {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.16rem 0.2rem 0.16rem 0.45rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-50);
	}

	.cluster-caption {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.term-chip {
		min-width: 1.9rem;
		padding: 0.24rem 0.3rem;
		border: 1px solid var(--brass-300);
		font-family: var(--font-mono);
		letter-spacing: normal;
		text-transform: none;
		font-size: 0.76rem;
	}

	.term-chip:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	button,
	input {
		max-width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font: inherit;
		padding: 0.45rem 0.6rem;
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	/* ---- Recent activity: dense mono ledger lines ---- */
	.recent {
		display: grid;
		min-width: 0;
		gap: 0.15rem;
		padding-top: 0.35rem;
	}

	.transactions {
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.txn-row {
		display: flex;
		align-items: baseline;
		gap: 0.15rem 0.9rem;
		padding: 0.18rem 0.1rem;
		border-top: 1px solid color-mix(in srgb, var(--brass-500) 30%, transparent);
		font-family: var(--font-mono);
		font-size: 0.76rem;
	}

	.txn-date {
		color: var(--ink-400);
		flex: none;
	}

	.txn-kind {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.txn-amount {
		margin-left: auto;
		flex: none;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		color: var(--ink-700);
	}

	.txn-amount.gain {
		color: var(--moss);
	}

	.txn-amount.loss {
		color: var(--wax-red);
	}

	.more-line {
		padding: 0.1rem 0.1rem 0;
		color: var(--ink-400);
		font-family: var(--font-mono);
		font-size: 0.76rem;
	}

	.no-activity {
		color: var(--ink-400);
		font-family: var(--font-mono);
		font-size: 0.76rem;
		padding: 0.2rem 0.1rem;
	}

	/* ---- Bottom ledger equation ---- */
	.ledger-strip {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.2rem 0.55rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-100);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
	}

	.strip-caption {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.eq-term {
		color: var(--ink-700);
		font-weight: 700;
	}

	.eq-term.pos,
	.eq-net.pos {
		color: var(--moss);
	}

	.eq-term.neg,
	.eq-net.neg {
		color: var(--wax-red);
	}

	.eq-equals {
		color: var(--ink-400);
		font-weight: 700;
	}

	.eq-net {
		font-size: 0.78rem;
	}

	.live-status {
		color: var(--moss);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.live-status:empty {
		display: none;
	}

	/* ---- Review dialog ---- */
	.review {
		display: grid;
		gap: 0.7rem;
		border: 2px solid var(--ink-700);
		border-radius: 3px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		padding: 1rem;
		box-shadow: var(--shadow-paper);
	}

	.review h3 {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 400;
	}

	.review p {
		font-family: var(--font-body);
		overflow-wrap: anywhere;
	}

	.review-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.review-actions button {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 700;
		padding: 0.45rem 0.9rem;
	}

	@media (max-width: 860px) {
		.kpi-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.dossier {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 520px) {
		.kpi-row {
			grid-template-columns: 1fr;
		}
		.finance-panel {
			overflow-x: hidden;
		}
	}
</style>
