<script lang="ts">
	import { tick } from 'svelte';
	import { assessCredit, estimateNextLoanPayment, projectLoanSchedule } from '$lib/game/finance';
	import type { FinanceMetrics } from '$lib/game/financeMetrics';
	import type { I18nBundle } from '$lib/i18n';
	import type { FinanceFailureCode } from '$lib/game/finance';
	import type { GameState, LoanInstrument, LoanTermDays } from '$lib/game/types';
	import type { GameRouteCommitResult } from '../../../routes/gameRouteController';

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

	function formatApr(bps: number): string {
		return new Intl.NumberFormat(i18n.locale, {
			style: 'percent',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(bps / 10_000);
	}

	function formatRunway(): string {
		return metrics.cashRunway.kind === 'ninetyPlus'
			? i18n.t('financePanel.ui.ninetyPlusDays')
			: i18n.t('financePanel.ui.days', { days: i18n.format.integer(metrics.cashRunway.days) });
	}

	function loanPayoffQuote(loan: LoanInstrument): number {
		return (
			loan.remainingPrincipal +
			loan.overdueInterest +
			Math.ceil(loan.accruedInterestMicros / 1_000_000)
		);
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
			case 'insufficientCredit':
				return i18n.t('financePanel.failures.insufficientCredit');
			case 'purchaseUnavailable':
				return i18n.t('financePanel.failures.purchaseUnavailable');
			case 'purchaseCostChanged':
				return i18n.t('financePanel.failures.purchaseCostChanged');
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
		if (!review || mutationPending) return;
		const action = review;
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

<section class="panel" aria-labelledby="finance-heading">
	<h2 id="finance-heading">{i18n.t('financePanel.title')}</h2>
	<p class="live-status" aria-live="polite" role="status">{statusMessage}</p>

	<div class="metrics" aria-label={i18n.t('financePanel.title')}>
		<div>
			<span>{i18n.t('financePanel.ui.cash')}</span><strong>{i18n.format.currency(game.cash)}</strong
			>
		</div>
		<div>
			<span>{i18n.t('financePanel.metrics.outstandingPrincipal')}</span><strong
				>{i18n.format.currency(metrics.outstandingPrincipal)}</strong
			>
		</div>
		<div>
			<span>{i18n.t('financePanel.metrics.amountDue')}</span><strong
				>{i18n.format.currency(metrics.amountDue)}</strong
			>
		</div>
		<div>
			<span>{i18n.t('financePanel.metrics.nextPayment')}</span><strong
				>{metrics.nextLoanPayment
					? `${i18n.format.currency(metrics.nextLoanPayment.amount)} · ${i18n.t('financePanel.ui.day', { day: i18n.format.integer(metrics.nextLoanPayment.day) })}`
					: i18n.t('financePanel.metrics.noDebtServiceDue')}</strong
			>
		</div>
		<div>
			<span>{i18n.t('financePanel.metrics.debtServiceCoverage')}</span><strong
				>{metrics.debtServiceCoverage === null
					? i18n.t('financePanel.metrics.noDebtServiceDue')
					: metrics.debtServiceCoverage.toFixed(2)}</strong
			>
		</div>
		<div>
			<span>{i18n.t('financePanel.metrics.cashRunway')}</span><strong>{formatRunway()}</strong>
		</div>
		<div>
			<span>{i18n.t('financePanel.metrics.availableCredit')}</span><strong
				>{i18n.format.currency(metrics.creditAssessments[84].availableCredit)}</strong
			>
		</div>
	</div>

	<section class="credit" aria-labelledby="credit-heading">
		<h3 id="credit-heading">{i18n.t('financePanel.ui.creditOffer')}</h3>
		<p>
			{i18n.t('financePanel.ui.creditExplanation')}
		</p>
		<div class="term-buttons" role="group" aria-label={i18n.t('financePanel.ui.loanTerm')}>
			{#each [28, 56, 84] as term (term)}
				<button
					type="button"
					class:active={selectedTerm === term}
					aria-pressed={selectedTerm === term}
					disabled={mutationPending}
					onclick={() => (selectedTerm = term as LoanTermDays)}>{i18n.labels.loanTerm(term)}</button
				>
			{/each}
		</div>
		<div class="credit-grid">
			<div>
				<span>{i18n.t('financePanel.credit.baseApr')}</span><strong
					>{formatApr(selectedAssessment.baseRateBps)}</strong
				>
			</div>
			<div>
				<span>{i18n.t('financePanel.credit.adjustments')}</span><strong
					>{i18n.t('financePanel.ui.healthAdjustment', {
						amount: formatApr(selectedAssessment.healthPenaltyBps)
					})} · {i18n.t('financePanel.ui.historyAdjustment', {
						amount: formatApr(selectedAssessment.historyPenaltyBps)
					})}</strong
				>
			</div>
			<div>
				<span>{i18n.t('financePanel.ui.finalApr')}</span><strong
					>{formatApr(selectedAssessment.annualInterestRateBps)}</strong
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
		{#if selectedAssessment.reasons.length}
			<p class="reason">
				{selectedAssessment.reasons
					.map((reason) => i18n.t(`financePanel.credit.reasons.${reason}`))
					.join(' · ')}
			</p>
		{/if}
		<label class="field" for="borrow-amount">
			<span>{i18n.t('financePanel.ui.borrowAmount')}</span>
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
		<button type="button" disabled={mutationPending} onclick={openBorrowReview}
			>{i18n.t('financePanel.ui.reviewBorrowing')}</button
		>
	</section>

	<section aria-labelledby="loans-heading">
		<h3 id="loans-heading">{i18n.t('financePanel.ui.loansAndHistory')}</h3>
		<div class="loan-list">
			{#each game.finance.loans as loan (loan.id)}
				<article id={`finance-loan-${loan.id}`} class="loan" tabindex="-1">
					<h4>{i18n.labels.loanPurpose(loan.purpose)} · {i18n.labels.loanStatus(loan.status)}</h4>
					<p>
						{i18n.t('financePanel.ui.originalPrincipal')}
						{i18n.format.currency(loan.originalPrincipal)} · {i18n.t(
							'financePanel.ui.remainingPrincipal'
						)}
						{i18n.format.currency(loan.remainingPrincipal)} · {i18n.t('financePanel.ui.apr')}
						{formatApr(loan.annualInterestRateBps)} · {i18n.t('financePanel.ui.term')}
						{i18n.labels.loanTerm(loan.termDays)}
					</p>
					<p>
						{i18n.t('financePanel.ui.arrears')}
						{i18n.format.currency(loan.overduePrincipal + loan.overdueInterest)} · {i18n.t(
							'financePanel.metrics.nextPayment'
						)}
						{loan.nextPaymentDay === null
							? i18n.t('financePanel.ui.noPaymentScheduled')
							: `${i18n.format.currency(estimateNextLoanPayment(loan))} · ${i18n.t('financePanel.ui.day', { day: i18n.format.integer(loan.nextPaymentDay) })}`}
						· {i18n.t('financePanel.ui.payoffQuote')}
						{i18n.format.currency(loanPayoffQuote(loan))}
					</p>
					{#if loan.status === 'active' || loan.status === 'delinquent'}
						<div class="loan-actions">
							<label class="field" for={fieldIdForLoan('repay-amount', loan.id)}
								><span>{i18n.t('financePanel.ui.repayAmount')}</span><input
									id={fieldIdForLoan('repay-amount', loan.id)}
									inputmode="numeric"
									autocomplete="off"
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
								/></label
							>
							{#if fieldError?.field === fieldIdForLoan('repay-amount', loan.id)}<p
									id={`${fieldIdForLoan('repay-amount', loan.id)}-error`}
									class="error"
								>
									{fieldError.message}
								</p>{/if}
							<button type="button" disabled={mutationPending} onclick={() => openRepayReview(loan)}
								>{i18n.t('financePanel.ui.reviewRepayment')}</button
							>
							<button
								id={`payoff-${loan.id}`}
								type="button"
								disabled={mutationPending}
								aria-describedby={fieldError?.field === `payoff-${loan.id}`
									? `payoff-${loan.id}-error`
									: undefined}
								onclick={() => openPayoffReview(loan)}
								>{i18n.t('financePanel.ui.reviewPayoff')}</button
							>
							{#if fieldError?.field === `payoff-${loan.id}`}<p
									id={`payoff-${loan.id}-error`}
									class="error"
								>
									{fieldError.message}
								</p>{/if}
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
					{/if}
				</article>
			{/each}
		</div>
	</section>

	<section aria-labelledby="activity-heading">
		<h3 id="activity-heading">{i18n.t('financePanel.ui.transactionActivity')}</h3>
		{#if transactions.length}
			<ol class="transactions">
				{#each transactions as transaction (transaction.id)}
					<li>
						<strong>{transactionLabel(transaction.kind)}</strong> · {i18n.t('financePanel.ui.day', {
							day: i18n.format.integer(transaction.day)
						})} · {i18n.t('financePanel.ui.cash')}
						{i18n.format.currency(transaction.cashDelta)} · {i18n.t('financePanel.ui.principal')}
						{i18n.format.currency(transaction.principalAmount)} · {i18n.t(
							'financePanel.ui.interest'
						)}
						{i18n.format.currency(transaction.interestAmount)}
					</li>
				{/each}
			</ol>
		{:else}<p>{i18n.t('financePanel.ui.noActivity')}</p>{/if}
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
						apr: formatApr(comparison.assessment.annualInterestRateBps),
						firstPayment: i18n.format.currency(comparison.schedule.firstPayment),
						peakPayment: i18n.format.currency(comparison.schedule.peakPayment)
					})}
				</p>
			{/if}
			<div class="review-actions">
				<button type="button" disabled={mutationPending} onclick={cancelReview}
					>{i18n.t('financePanel.ui.cancelReview')}</button
				><button type="button" disabled={mutationPending} onclick={confirmReview}
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
		padding: 1.1rem 1.2rem;
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
		font-size: 1rem;
	}
	h4 {
		font-size: 0.95rem;
	}
	p {
		overflow-wrap: anywhere;
		font-family: var(--font-body);
	}
	.metrics,
	.credit-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
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
		border-top: 1px solid var(--brass-300);
		padding-top: 0.9rem;
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
</style>
