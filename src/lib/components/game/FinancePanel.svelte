<script lang="ts">
	import { tick } from 'svelte';
	import HudIcon from './HudIcon.svelte';
	import {
		assessCredit,
		estimateNextLoanPayment,
		getLoanArrearsAmount,
		getPayoffAmount,
		projectLoanSchedule
	} from '$lib/game/finance';
	import type { FinanceMetrics } from '$lib/game/financeMetrics';
	import type { I18nBundle } from '$lib/i18n';
	import type { FinanceFailureCode } from '$lib/game/finance';
	import type { GameState, LoanInstrument, LoanTermDays } from '$lib/game/types';
	import { isGameRouteCommitted, type GameRouteCommitResult } from '$lib/game/commandResult';

	type ReviewAction =
		| { kind: 'borrow'; amount: number; termDays: LoanTermDays }
		| { kind: 'repay'; loanId: string; amount: number }
		| { kind: 'payoff'; loanId: string; amount: number }
		| { kind: 'refinance'; loanId: string; termDays: LoanTermDays; amount: number };

	let {
		game,
		metrics,
		i18n,
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
	let expandedLoanId = $state<string | null>(null);
	const expandedLoan = $derived(
		expandedLoanId ??
			focusedLoanId ??
			game.finance.loans.find((loan) => loan.status === 'active' || loan.status === 'delinquent')
				?.id
	);

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
	let transactions = $derived([...game.finance.transactions].reverse());

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

	function formatRunway(): string {
		return metrics.cashRunway.kind === 'ninetyPlus'
			? i18n.t('financePanel.ui.ninetyPlusDays')
			: i18n.t('financePanel.ui.days', { days: i18n.format.integer(metrics.cashRunway.days) });
	}

	function loanPayoffQuote(loan: LoanInstrument): number {
		return getPayoffAmount(loan);
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

			if (!isGameRouteCommitted(result)) {
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
	const cashPoints = $derived.by(() => {
		const values = game.reports.slice(-14).map((report) => report.cashAfter);
		const low = Math.min(...values),
			high = Math.max(...values);
		return values
			.map(
				(value, index) =>
					`${(index * 180) / Math.max(1, values.length - 1)},${30 - ((value - low) * 24) / Math.max(1, high - low)}`
			)
			.join(' ');
	});
</script>

<section class="panel" aria-labelledby="finance-heading">
	<h2 id="finance-heading" class="sr-only">{i18n.t('financePanel.title')}</h2>
	<p class="live-status" aria-live="polite" role="status">{statusMessage}</p>

	<div class="metrics" aria-label={i18n.t('financePanel.title')}>
		<div>
			<span class="metric-label"><HudIcon name="finance" />{i18n.t('financePanel.ui.cash')}</span>
			<strong>{i18n.format.currency(game.cash)}</strong>
			<svg class="cash-chart" viewBox="0 0 180 36" preserveAspectRatio="none" aria-hidden="true"
				><polyline points={cashPoints} fill="none" stroke="var(--moss)" stroke-width="2" /></svg
			>
		</div>
		<div>
			<span class="metric-label"
				><svg viewBox="0 0 24 24" aria-hidden="true"
					><path d="M4 7h16v13H4z M8 7V4h8v3 M9 13h6" /></svg
				>{i18n.t('financePanel.ui.outstanding')}</span
			>
			<strong>{i18n.format.currency(metrics.outstandingPrincipal)}</strong>
			<meter
				class="debt-meter"
				min="0"
				max={Math.max(1, metrics.outstandingPrincipal, selectedAssessment.grossPrincipalLimit)}
				value={metrics.outstandingPrincipal}
				aria-label={i18n.t('financePanel.metrics.outstandingPrincipal')}
			></meter>
			<small
				><span class="metric-note">{i18n.t('financePanel.metrics.amountDue')}</span>
				{i18n.format.currency(metrics.amountDue)}</small
			>
		</div>
		<div class:payment-due={metrics.nextLoanPayment !== null}>
			<span class="metric-label"
				><HudIcon name="clock" />{i18n.t('financePanel.metrics.nextPayment')}</span
			>
			{#if metrics.nextLoanPayment}
				<strong>{i18n.format.currency(metrics.nextLoanPayment.amount)}</strong>
				<div class="payment-timing">
					<small class="payment-day"
						>{i18n.t('financePanel.ui.day', {
							day: i18n.format.integer(metrics.nextLoanPayment.day)
						})}</small
					>
					<small
						>{new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'always' }).format(
							metrics.nextLoanPayment.day - game.day,
							'day'
						)}</small
					>
				</div>
			{:else}<small>{i18n.t('financePanel.metrics.noDebtServiceDue')}</small>{/if}
		</div>
		<div>
			<span class="metric-label"
				><svg viewBox="0 0 24 24" aria-hidden="true"
					><path d="M3 18h18 M6 18V9 M12 18V5 M18 18v-6" /></svg
				>{i18n.t('financePanel.ui.runwayCoverage')}</span
			>
			<div class="runway-value">
				<strong aria-label={formatRunway()}
					>{i18n.t('financePanel.ui.daysShort', {
						days:
							metrics.cashRunway.kind === 'ninetyPlus'
								? '90+'
								: i18n.format.integer(metrics.cashRunway.days)
					})}</strong
				>
				<small
					aria-label={i18n.t('financePanel.metrics.debtServiceCoverage')}
					title={i18n.t('financePanel.metrics.debtServiceCoverage')}
					>{metrics.debtServiceCoverage === null
						? '—'
						: `${metrics.debtServiceCoverage.toFixed(2)}×`}</small
				>
			</div>
			<meter
				min="0"
				max="90"
				value={metrics.cashRunway.kind === 'ninetyPlus' ? 90 : metrics.cashRunway.days}
				aria-label={i18n.t('financePanel.metrics.cashRunway')}
				aria-valuetext={formatRunway()}
			></meter>
		</div>
	</div>

	<section class="credit" aria-labelledby="credit-heading">
		<h3 id="credit-heading">{i18n.t('financePanel.ui.creditOffer')}</h3>
		<div class="term-buttons" role="group" aria-label={i18n.t('financePanel.ui.loanTerm')}>
			{#each [28, 56, 84] as term (term)}
				<button
					type="button"
					class:active={selectedTerm === term}
					aria-pressed={selectedTerm === term}
					disabled={mutationPending}
					aria-label={i18n.labels.loanTerm(term)}
					onclick={() => (selectedTerm = term as LoanTermDays)}
					><span>{i18n.labels.loanTerm(term)}</span><strong
						>{i18n.format.apr(
							metrics.creditAssessments[term as LoanTermDays].annualInterestRateBps
						)}</strong
					><small
						>{i18n.format.currency(
							metrics.creditAssessments[term as LoanTermDays].availableCredit
						)}</small
					></button
				>
			{/each}
		</div>
		<div class="borrow-row">
			<label class="field" for="borrow-amount">
				<span>{i18n.t('financePanel.ui.borrow')}</span>
				<input
					id="borrow-amount"
					aria-label={i18n.t('financePanel.ui.borrowAmount')}
					inputmode="numeric"
					autocomplete="off"
					aria-describedby={fieldError?.field === 'borrow' ? 'borrow-error' : undefined}
					aria-invalid={fieldError?.field === 'borrow'}
					disabled={mutationPending}
					bind:value={borrowAmount}
					oninput={() => clearError('borrow')}
				/>
			</label><button
				type="button"
				disabled={mutationPending}
				onclick={openBorrowReview}
				aria-label={i18n.t('financePanel.ui.reviewBorrowing')}
				>{i18n.t('financePanel.ui.compactReview')}</button
			>
		</div>
		{#if selectedAssessment.reasons.length}
			<p class="reason">
				{selectedAssessment.reasons
					.map((reason) => i18n.t(`financePanel.credit.reasons.${reason}`))
					.join(' · ')}
			</p>
		{/if}
		{#if fieldError?.field === 'borrow'}<p id="borrow-error" class="error">
				{fieldError.message}
			</p>{/if}
		{#if enteredBorrowSchedule}
			<p class="schedule">
				{i18n.t('financePanel.ui.firstPayment')}
				{i18n.format.currency(enteredBorrowSchedule.firstPayment)} · {i18n.t(
					'financePanel.ui.regularPayment'
				)}
				{i18n.format.currency(enteredBorrowSchedule.regularPayment)} · {i18n.t(
					'financePanel.ui.peakPayment'
				)}
				{i18n.format.currency(enteredBorrowSchedule.peakPayment)}
			</p>
		{/if}
		<details class="credit-details">
			<summary>{i18n.t('financePanel.ui.creditOffer')} · {i18n.t('financePanel.ui.apr')}</summary>
			<p>{i18n.t('financePanel.ui.creditExplanation')}</p>
			<div class="credit-grid">
				<div>
					<span>{i18n.t('financePanel.metrics.availableCredit')}</span>
					<strong>{i18n.format.currency(metrics.creditAssessments[84].availableCredit)}</strong>
				</div>
				<div>
					<span>{i18n.t('financePanel.credit.baseApr')}</span><strong
						>{i18n.format.apr(selectedAssessment.baseRateBps)}</strong
					>
				</div>
				<div>
					<span>{i18n.t('financePanel.credit.adjustments')}</span><strong
						>{i18n.t('financePanel.ui.healthAdjustment', {
							amount: i18n.format.apr(selectedAssessment.healthPenaltyBps)
						})} · {i18n.t('financePanel.ui.historyAdjustment', {
							amount: i18n.format.apr(selectedAssessment.historyPenaltyBps)
						})}</strong
					>
				</div>
				<div>
					<span>{i18n.t('financePanel.ui.finalApr')}</span><strong
						>{i18n.format.apr(selectedAssessment.annualInterestRateBps)}</strong
					>
				</div>
				<div>
					<span>{i18n.t('financePanel.ui.availableCredit')}</span><strong
						>{i18n.format.currency(selectedAssessment.availableCredit)}</strong
					>
				</div>
				<div>
					<span>{i18n.t('financePanel.ui.operatingCashFlow')}</span><strong
						>{i18n.format.currency(selectedAssessment.weeklyOperatingCashFlow)}
						{i18n.t('financePanel.ui.perWeek')}</strong
					>
				</div>
				<div>
					<span>{i18n.t('financePanel.ui.principalHeadroom')}</span><strong
						>{i18n.format.currency(selectedAssessment.principalHeadroom)}</strong
					>
				</div>
				<div>
					<span>{i18n.t('financePanel.ui.serviceHeadroom')}</span><strong
						>{i18n.format.currency(selectedAssessment.weeklyServiceHeadroom)}
						{i18n.t('financePanel.ui.perWeek')}</strong
					>
				</div>
			</div>
		</details>
	</section>

	<section class="loans" aria-labelledby="loans-heading">
		<h3 id="loans-heading" aria-label={i18n.t('financePanel.ui.loansAndHistory')}>
			{i18n.t('financePanel.ui.loans')}
		</h3>
		<div class="loan-list">
			{#each game.finance.loans as loan (loan.id)}
				<article
					id={`finance-loan-${loan.id}`}
					class="loan"
					class:delinquent={loan.status === 'delinquent'}
					tabindex="-1"
				>
					<div class="loan-heading">
						<h4 title={i18n.labels.loanStatus(loan.status)}>
							{#if loan.status === 'active' || loan.status === 'delinquent'}
								<button
									type="button"
									aria-expanded={expandedLoan === loan.id}
									aria-controls={`loan-controls-${loan.id}`}
									aria-label={`${i18n.labels.loanPurpose(loan.purpose)} · ${i18n.labels.loanStatus(loan.status)}`}
									onclick={() => (expandedLoanId = expandedLoan === loan.id ? '' : loan.id)}
								>
									{i18n.labels.loanPurpose(loan.purpose)}{#if loan.status === 'delinquent'}
										· {i18n.labels.loanStatus(loan.status)}{/if}
								</button>
							{:else}
								{i18n.labels.loanPurpose(loan.purpose)} · {i18n.labels.loanStatus(loan.status)}
							{/if}
						</h4>
						<strong>{i18n.format.currency(loan.remainingPrincipal)}</strong>
					</div>
					<meter
						min="0"
						max={loan.originalPrincipal}
						value={loan.remainingPrincipal}
						aria-label={`${i18n.labels.loanPurpose(loan.purpose)} · ${i18n.t('financePanel.metrics.outstandingPrincipal')}`}
					></meter>
					<div class="loan-summary">
						<span
							>{i18n.format.apr(loan.annualInterestRateBps)} {i18n.t('financePanel.ui.apr')}</span
						>
						<span>{i18n.labels.loanTerm(loan.termDays)}</span>
						<span
							>{loan.nextPaymentDay === null
								? i18n.t('financePanel.ui.noPaymentScheduled')
								: `${i18n.t('financePanel.ui.day', { day: i18n.format.integer(loan.nextPaymentDay) })} · ${i18n.format.currency(estimateNextLoanPayment(loan))}`}</span
						>
						<details class="loan-info">
							<summary
								aria-label={i18n.t('tileInspector.openDetails')}
								title={i18n.t('tileInspector.openDetails')}>ⓘ</summary
							>
							<div>
								<p>{i18n.labels.loanStatus(loan.status)}</p>

								<p>
									{i18n.t('financePanel.ui.originalPrincipal')}
									{i18n.format.currency(loan.originalPrincipal)} · {i18n.t(
										'financePanel.ui.remainingPrincipal'
									)}
									{i18n.format.currency(loan.remainingPrincipal)} · {i18n.t('financePanel.ui.apr')}
									{i18n.format.apr(loan.annualInterestRateBps)} · {i18n.t('financePanel.ui.term')}
									{i18n.labels.loanTerm(loan.termDays)}
								</p>
								<p>
									{i18n.t('financePanel.ui.arrears')}
									{i18n.format.currency(getLoanArrearsAmount(loan))} · {i18n.t(
										'financePanel.metrics.nextPayment'
									)}
									{loan.nextPaymentDay === null
										? i18n.t('financePanel.ui.noPaymentScheduled')
										: `${i18n.format.currency(estimateNextLoanPayment(loan))} · ${i18n.t('financePanel.ui.day', { day: i18n.format.integer(loan.nextPaymentDay) })}`}
									· {i18n.t('financePanel.ui.payoffQuote')}
									{i18n.format.currency(loanPayoffQuote(loan))}
								</p>
							</div>
						</details>
					</div>
					{#if loan.status === 'active' || loan.status === 'delinquent'}
						<div
							class="loan-controls"
							id={`loan-controls-${loan.id}`}
							hidden={expandedLoan !== loan.id}
						>
							<details>
								<summary
									aria-label={i18n.t('financePanel.ui.actionRepayment')}
									title={i18n.t('financePanel.ui.repayAmount')}
									><svg aria-hidden="true" viewBox="0 0 24 24"
										><path d="M12 4v16m-7-7 7 7 7-7" /></svg
									></summary
								>
								<div class="loan-actions">
									<label class="field" for={fieldIdForLoan('repay-amount', loan.id)}
										><span>{i18n.t('financePanel.ui.repayAmount')}</span><input
											id={fieldIdForLoan('repay-amount', loan.id)}
											inputmode="numeric"
											autocomplete="off"
											disabled={mutationPending}
											aria-invalid={fieldError?.field === fieldIdForLoan('repay-amount', loan.id)}
											aria-describedby={fieldError?.field ===
											fieldIdForLoan('repay-amount', loan.id)
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
										/></label
									>
									{#if fieldError?.field === fieldIdForLoan('repay-amount', loan.id)}<p
											id={`${fieldIdForLoan('repay-amount', loan.id)}-error`}
											class="error"
										>
											{fieldError.message}
										</p>{/if}
									<button
										type="button"
										disabled={mutationPending}
										onclick={() => openRepayReview(loan)}
										>{i18n.t('financePanel.ui.reviewRepayment')}</button
									>
								</div>
							</details>
							<button
								id={`payoff-${loan.id}`}
								aria-label={i18n.t('financePanel.ui.reviewPayoff')}
								title={i18n.t('financePanel.ui.reviewPayoff')}
								type="button"
								disabled={mutationPending}
								aria-describedby={fieldError?.field === `payoff-${loan.id}`
									? `payoff-${loan.id}-error`
									: undefined}
								onclick={() => openPayoffReview(loan)}
								><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 5 5L20 6" /></svg
								></button
							>
							{#if fieldError?.field === `payoff-${loan.id}`}<p
									id={`payoff-${loan.id}-error`}
									class="error"
								>
									{fieldError.message}
								</p>{/if}
							<details>
								<summary
									aria-label={i18n.t('financePanel.ui.refinance')}
									title={i18n.t('financePanel.ui.refinance')}
									><svg aria-hidden="true" viewBox="0 0 24 24"
										><path d="m9 5-5 5 5 5m-5-5h10a5 5 0 0 1 0 10" /></svg
									></summary
								>
								<div class="loan-actions">
									{#each [28, 56, 84] as term (term)}<button
											id={`refinance-${loan.id}-${term}`}
											type="button"
											disabled={mutationPending || loan.status === 'delinquent'}
											aria-describedby={fieldError?.field === `refinance-${loan.id}-${term}`
												? `refinance-${loan.id}-${term}-error`
												: undefined}
											onclick={() => openRefinanceReview(loan, term as LoanTermDays)}
											>{i18n.t('financePanel.ui.refinance')} {i18n.labels.loanTerm(term)}</button
										>{#if fieldError?.field === `refinance-${loan.id}-${term}`}<p
												id={`refinance-${loan.id}-${term}-error`}
												class="error"
											>
												{fieldError.message}
											</p>{/if}{/each}
								</div>
							</details>
						</div>
					{/if}
				</article>
			{/each}
		</div>
		<section aria-labelledby="activity-heading">
			<h3 id="activity-heading" title={i18n.t('financePanel.ui.transactionActivity')}>
				{i18n.t('financePanel.ui.ledger')}
			</h3>
			{#if transactions.length}
				<div class="ledger-strip">
					{#each transactions.slice(0, 3) as transaction (transaction.id)}<span
							title={transactionLabel(transaction.kind)}
							><b class:cash-out={transaction.cashDelta < 0}
								>{transaction.cashDelta < 0 ? '▼' : '▲'}</b
							>
							{i18n.format.integer(transaction.day)} · {i18n.format.currency(
								transaction.cashDelta
							)}</span
						>{/each}
					<details class="ledger-history">
						<summary
							aria-label={i18n.t('financePanel.ui.transactionActivity')}
							title={i18n.t('financePanel.ui.transactionActivity')}>⋯</summary
						>
						<ol class="transactions">
							{#each transactions as transaction (transaction.id)}
								<li>
									<strong>{transactionLabel(transaction.kind)}</strong><span
										class="transaction-values"
									>
										· {i18n.t('financePanel.ui.day', {
											day: i18n.format.integer(transaction.day)
										})} · {i18n.t('financePanel.ui.cash')}
										{i18n.format.currency(transaction.cashDelta)} · {i18n.t(
											'financePanel.ui.principal'
										)}
										{i18n.format.currency(transaction.principalAmount)} · {i18n.t(
											'financePanel.ui.interest'
										)}
										{i18n.format.currency(transaction.interestAmount)}</span
									>
								</li>
							{/each}
						</ol>
					</details>
				</div>
			{:else}<p>{i18n.t('financePanel.ui.noActivity')}</p>{/if}
		</section>
	</section>

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
	.panel {
		display: grid;
		gap: 1rem;
		min-width: 0;
		padding: 0;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		color: var(--ink-700);
	}
	h2,
	h3,
	h4,
	p {
		margin: 0;
	}
	h2,
	h3,
	h4 {
		font-family: var(--font-display);
		font-weight: 400;
	}
	h2 {
		font-size: 1.1rem;
	}
	h3 {
		font-size: 18px;
	}
	h4 {
		font-size: 18px;
	}
	p {
		overflow-wrap: anywhere;
		font-family: var(--font-body);
	}
	.metrics {
		grid-column: 1 / -1;
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.metrics,
	.credit-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.7rem;
	}
	.metrics > div,
	.credit-grid > div {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
	}
	span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	strong {
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.credit,
	.loan,
	section[aria-labelledby='activity-heading'] {
		display: grid;
		min-width: 0;
		gap: 0.65rem;
		padding-top: 0;
		align-content: start;
	}
	.term-buttons,
	.loan-actions,
	.review-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
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
	button.active {
		background: var(--ink-700);
		color: var(--paper-50);
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.field {
		display: grid;
		min-width: 0;
		gap: 0.3rem;
		max-width: 18rem;
	}
	.error {
		color: var(--wax-red);
		font-weight: 700;
	}
	.reason {
		color: var(--brass-700);
	}
	.loan-list {
		display: grid;
		gap: 0.7rem;
	}
	.loan {
		border: 1px solid var(--brass-300);
		padding: 0.75rem;
	}
	.loan:focus {
		outline: 3px solid var(--brass-500);
		outline-offset: 2px;
	}
	.transactions {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding-left: 1.25rem;
	}
	.live-status:empty {
		display: none;
	}
	.review {
		display: grid;
		gap: 0.7rem;
		border: 2px solid var(--ink-700);
		background: var(--paper-50);
		padding: 1rem;
	}
	@media (max-width: 520px) {
		.metrics,
		.credit-grid {
			grid-template-columns: 1fr;
		}
		.panel {
			overflow-x: hidden;
		}
	}
	.metrics > div {
		padding: 0.85rem;
		border: 1px solid var(--paper-edge);
		border-top: 1px solid var(--paper-edge);
		background: var(--paper-50);
	}
	.metrics > div:first-child {
		border-top-color: var(--paper-edge);
	}
	.metrics strong {
		font-size: 1.35rem;
	}
	.loan {
		border-left: 4px solid var(--moss);
		background: var(--paper-50);
	}
	.term-buttons button {
		flex: 1;
		padding: 0.8rem;
		border-color: var(--brass-500);
	}
	.term-buttons button.active {
		background: var(--paper-300);
		color: var(--ink-700);
	}
	.term-buttons button {
		display: grid;
		gap: 0.5rem;
		text-align: left;
	}
	.term-buttons strong {
		font-size: 22px;
	}
	.loans {
		display: grid;
		gap: 0.65rem;
	}
	.credit-details {
		display: grid;
		margin-top: 0.5rem;
	}
	.credit-details summary {
		cursor: pointer;
		color: var(--brass-700);
	}
	.credit-details p {
		margin: 0.6rem 0;
	}
	.credit-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.panel > .review,
	.live-status,
	section[aria-labelledby='activity-heading'] {
		grid-column: 1 / -1;
	}
	.borrow-row > button {
		background: var(--moss);
		color: var(--paper-50);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	@media (max-width: 700px) {
		.panel {
			grid-template-columns: 1fr;
		}
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.metrics > div {
		padding: 12px;
		gap: 0.2rem;
		align-content: start;
		min-height: 7rem;
	}
	.metrics strong {
		font-size: 28px;
		line-height: 1.15;
	}
	.borrow-row {
		display: flex;
		gap: 8px;
		align-items: end;
		padding: 10px 12px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
	}
	.borrow-row .field {
		flex: 1;
		max-width: none;
	}
	.borrow-row input {
		font: 18px var(--font-mono);
	}
	.borrow-row button {
		background: var(--moss);
		color: var(--paper-50);
		font: 700 14px var(--font-ui);
		box-shadow: inset 0 0 0 1px var(--moss-2);
		min-height: 2.5rem;
	}
	.reason,
	.schedule,
	.credit-details {
		font-size: 0.75rem;
	}
	.loan {
		gap: 0.4rem;
		padding: 12px;
		border-left-width: 4px;
	}
	.loan p {
		font-size: 0.75rem;
		line-height: 1.35;
	}
	.loan-actions {
		gap: 0.25rem;
		align-items: end;
		font-size: 0.7rem;
	}
	.loan-actions .field {
		width: 6rem;
	}
	.loan-actions button {
		padding: 0.35rem;
	}
	section[aria-labelledby='activity-heading'] {
		grid-column: 1 / -1;
		margin-top: 0;
		gap: 8px;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		border: 1px solid var(--paper-edge);
		font-size: 0.7rem;
		padding: 0.5rem;
		background: var(--paper-50);
	}
	section[aria-labelledby='activity-heading'] h3 {
		font: 600 0.65rem var(--font-ui);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	.transactions {
		display: flex;
		overflow-x: auto;
		padding: 0;
		list-style: none;
		gap: 1rem;
	}
	.transactions li {
		flex: 0 0 auto;
		white-space: nowrap;
	}
	@media (max-width: 700px) {
		section[aria-labelledby='activity-heading'] {
			grid-column: 1;
		}
	}
	.transaction-values {
		font: inherit;
		letter-spacing: normal;
		text-transform: none;
	}
	.cash-chart {
		width: 100%;
		height: 32px;
		margin-top: 2px;
	}
	.panel {
		gap: 16px 14px;
		align-items: start;
	}
	.metrics > div {
		min-height: 114px;
		box-sizing: border-box;
	}
	.term-buttons button {
		padding: 10px;
		gap: 6px;
		min-height: 88px;
		line-height: 1.15;
	}
	.term-buttons small {
		font-size: 12px;
	}
	.loan-heading h4,
	.loan-heading strong,
	.loan-summary {
		line-height: 1.2;
	}
	.loan-summary {
		font-size: 12px;
	}
	.loan-heading,
	.loan-summary,
	.ledger-strip {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	.loan-heading {
		justify-content: space-between;
	}
	.loan-summary > span,
	.ledger-strip > span {
		font: 0.7rem var(--font-mono);
		letter-spacing: normal;
		text-transform: none;
	}
	.loan-info {
		margin-left: auto;
	}
	.loan-info,
	.ledger-history {
		position: relative;
	}
	.loan-info summary,
	.ledger-history summary {
		cursor: pointer;
		list-style: none;
	}
	.loan-info[open] > div,
	.ledger-history[open] > ol {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 3;
		width: min(420px, 70vw);
		max-height: 200px;
		overflow: auto;
		padding: 12px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		box-shadow: var(--shadow-paper);
	}
	.ledger-history {
		margin-left: auto;
	}
	.ledger-history .transactions {
		display: grid;
	}
	.ledger-history .transactions li {
		white-space: normal;
	}
	.ledger-strip b {
		color: var(--moss);
	}
	.ledger-strip .cash-out {
		color: var(--wax-red);
	}
	.loan-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		gap: 6px;
	}
	.loan-controls[hidden] {
		display: none;
	}
	.loan-heading button {
		padding: 0;
		border: none;
		border-radius: 0;
		background: none;
		color: inherit;
		text-align: left;
		font: inherit;
	}
	.loan-heading button:hover {
		text-decoration: underline;
	}
	.loan-controls > button,
	.loan-controls summary {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: 40px;
		height: 36px;
		padding: 8px;
		color: var(--ink-700);
		background: var(--paper-100);
	}
	.loan-controls summary {
		cursor: pointer;
		list-style: none;
	}
	.loan-controls details[open] .loan-actions {
		margin-top: 0.5rem;
	}
	@media (max-width: 700px) {
		section[aria-labelledby='activity-heading'] {
			grid-row: auto;
		}
		.loans {
			padding-bottom: 0;
		}
	}
	.metric-label {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 10px;
	}
	.metric-label :global(svg) {
		width: 17px;
		height: 17px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
	.metrics .payment-due {
		border-color: var(--wax-red);
	}
	.payment-due .metric-label {
		color: var(--wax-red);
	}
	.payment-timing {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.payment-day {
		justify-self: start;
		padding: 3px 8px;
		border-radius: 12px;
		color: var(--paper-50);
		background: var(--wax-red);
		font: 700 11px var(--font-ui);
	}
	.metric-note {
		font: inherit;
		letter-spacing: normal;
		text-transform: none;
		color: inherit;
	}
	.metrics small {
		font-size: 12px;
	}
	.runway-value {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.runway-value small {
		font: 700 18px var(--font-mono);
		color: var(--moss);
	}
	meter {
		appearance: none;
		display: block;
		width: 100%;
		height: 8px;
		border: none;
		background: none;
		margin: 2px 0;
	}
	meter::-webkit-meter-bar {
		height: 8px;
		border: none;
		border-radius: 6px;
		background: var(--paper-300);
		box-shadow: none;
	}
	meter::-webkit-meter-optimum-value {
		background: var(--moss);
		border-radius: 6px;
	}
	meter::-moz-meter-bar {
		background: var(--moss);
		border-radius: 6px;
	}
	.debt-meter::-webkit-meter-optimum-value {
		background: var(--brass-700);
	}
	.debt-meter::-moz-meter-bar {
		background: var(--brass-700);
	}
	.loan.delinquent {
		border-left-color: var(--wax-red);
	}
	.loan-controls svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.loan-controls summary::-webkit-details-marker {
		display: none;
	}
	.loan-controls details[open] {
		flex-basis: 100%;
	}
	.ledger-strip {
		min-width: 0;
		flex-wrap: wrap;
		gap: 6px;
	}
</style>
