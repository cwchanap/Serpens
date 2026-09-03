import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { assessCredit, borrow } from '$lib/game/finance';
import { simulateDay } from '$lib/game/simulateDay';
import { getFinanceMetrics } from '$lib/game/financeMetrics';
import { createI18n, type I18nBundle } from '$lib/i18n';
import { createNewGame } from '$lib/game/state';
import type { GameState, LoanTermDays } from '$lib/game/types';
import type { GameRouteCommitResult } from '../../../routes/gameRouteController';
import FinancePanel from './FinancePanel.svelte';

function creditworthyGame(): GameState {
	const game = createNewGame('grocery', 44);
	return {
		...game,
		cash: 50_000
	};
}

function gameWithLoan(): GameState {
	const result = borrow(creditworthyGame(), {
		purpose: 'workingCapital',
		amount: 2_000,
		termDays: 56
	});
	if (!result.ok) throw new Error('expected fixture loan');
	return result.game;
}

function renderPanel(
	overrides: Partial<{
		game: GameState;
		i18n: I18nBundle;
		mutationPending: boolean;
		live: boolean;
		focusedLoanId: string | null;
		onBorrow: (amount: number, term: LoanTermDays) => Promise<GameRouteCommitResult>;
		onRepay: (id: string, amount: number) => Promise<GameRouteCommitResult>;
		onPayoff: (id: string) => Promise<GameRouteCommitResult>;
		onRefinance: (id: string, term: LoanTermDays) => Promise<GameRouteCommitResult>;
	}> = {}
) {
	const game = overrides.game ?? gameWithLoan();
	const props = {
		game,
		metrics: getFinanceMetrics(game),
		i18n: createI18n('en'),
		mutationPending: false,
		onBorrow: vi.fn().mockResolvedValue({ status: 'sandbox-committed', changed: true }),
		onRepay: vi.fn().mockResolvedValue({ status: 'sandbox-committed', changed: true }),
		onPayoff: vi.fn().mockResolvedValue({ status: 'sandbox-committed', changed: true }),
		onRefinance: vi.fn().mockResolvedValue({ status: 'sandbox-committed', changed: true }),
		...overrides
	};
	render(FinancePanel, props);
	return props;
}

describe('FinancePanel', () => {
	it('renders distinct overview, credit, loan register, and activity labels', async () => {
		expect.assertions(10);
		renderPanel();
		for (const label of [
			'Outstanding principal',
			'Amount due',
			'Next payment',
			'Debt-service coverage',
			'Cash runway',
			'Available credit',
			'Operating cash flow',
			'Principal headroom',
			'Service headroom',
			'Loan disbursement'
		]) {
			await expect.element(page.getByText(label, { exact: true }).first()).toBeVisible();
		}
	});

	it('validates a whole-dollar borrow before showing an explicit review', async () => {
		expect.assertions(3);
		const props = renderPanel();
		await page.getByLabelText('Borrow amount').fill('12.50');
		await page.getByRole('button', { name: 'Review borrowing' }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Enter a whole-dollar amount');
		expect(props.onBorrow).not.toHaveBeenCalled();
		await page.getByLabelText('Borrow amount').fill('1200');
		await page.getByRole('button', { name: 'Review borrowing' }).click();
		await expect.element(page.getByRole('heading', { name: 'Review borrowing' })).toBeVisible();
	});

	it('does not borrow until confirmation and restores focus after cancelling review', async () => {
		expect.assertions(3);
		const props = renderPanel();
		await page.getByLabelText('Borrow amount').fill('1200');
		await page.getByRole('button', { name: 'Review borrowing' }).click();
		expect(props.onBorrow).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Cancel review' }).click();
		await expect.element(page.getByLabelText('Borrow amount')).toHaveFocus();
		expect(props.onBorrow).not.toHaveBeenCalled();
	});

	it('confirms borrowing with the selected term only after review', async () => {
		expect.assertions(2);
		const props = renderPanel();
		await page.getByLabelText('Borrow amount').fill('1200');
		await page.getByRole('button', { name: '56 days', exact: true }).click();
		await page.getByRole('button', { name: 'Review borrowing' }).click();
		await page.getByRole('button', { name: 'Confirm borrowing' }).click();
		expect(props.onBorrow).toHaveBeenCalledWith(1200, 56);
		await expect.element(page.getByRole('status')).toBeVisible();
	});

	it('keeps paid/refinanced history visible without mutation controls', async () => {
		expect.assertions(2);
		const active = gameWithLoan();
		const closed = {
			...active,
			finance: {
				...active.finance,
				loans: active.finance.loans.map((loan) => ({ ...loan, status: 'paid' as const }))
			}
		};
		renderPanel({ game: closed });
		await expect.element(page.getByRole('button', { name: /Repay/ })).not.toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: /Paid/ }).nth(0)).toBeVisible();
	});

	it('disables all mutation controls while pending', async () => {
		expect.assertions(3);
		renderPanel({ mutationPending: true });
		await expect.element(page.getByRole('button', { name: 'Review borrowing' })).toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: /Review repayment/ }).nth(0))
			.toBeDisabled();
		await expect.element(page.getByRole('button', { name: /Review payoff/ }).nth(0)).toBeDisabled();
	});

	it.each([
		{ status: 'confirmation-required', expected: 'Confirmation is required' },
		{ status: 'unchanged', expected: 'No finance changes were made.' }
	] as const)(
		'keeps the borrow review and input for non-committed $status results',
		async ({ status, expected }) => {
			expect.assertions(3);
			const onBorrow = vi.fn().mockResolvedValue({ status });
			renderPanel({ onBorrow });
			await page.getByLabelText('Borrow amount').fill('1200');
			await page.getByRole('button', { name: 'Review borrowing' }).click();
			await page.getByRole('button', { name: 'Confirm borrowing' }).click();
			expect(onBorrow).toHaveBeenCalledOnce();
			await expect.element(page.getByRole('heading', { name: 'Review borrowing' })).toBeVisible();
			await expect.element(page.getByRole('status')).toHaveTextContent(expected);
		}
	);

	it('does not double-count delinquent principal in amount due or payoff quote', async () => {
		expect.assertions(2);
		const game = gameWithLoan();
		const loan = game.finance.loans.at(-1)!;
		const delinquent = {
			...game,
			finance: {
				...game.finance,
				loans: game.finance.loans.map((candidate) =>
					candidate.id === loan.id
						? {
								...candidate,
								status: 'delinquent' as const,
								remainingPrincipal: 700,
								overduePrincipal: 200,
								overdueInterest: 25
							}
						: candidate
				)
			}
		};
		renderPanel({ game: delinquent });
		await expect.element(page.getByText('$725').first()).toBeVisible();
		expect(document.body.textContent).toMatch(/Payoff quote\s*\$725/);
	});

	it('shows a matured fractional interest balance as one dollar of arrears', async () => {
		expect.assertions(1);
		const game = gameWithLoan();
		const loan = game.finance.loans.at(-1)!;
		const matured = {
			...game,
			finance: {
				...game.finance,
				loans: game.finance.loans.map((candidate) =>
					candidate.id === loan.id
						? {
								...candidate,
								status: 'delinquent' as const,
								remainingPrincipal: 0,
								nextPaymentDay: null,
								accruedInterestMicros: 1,
								arrearsSinceDay: game.day
							}
						: candidate
				)
			}
		};

		renderPanel({ game: matured });
		expect(document.body.textContent).toMatch(/Arrears\s*\$1/);
	});

	it('renders localized finance copy outside English', async () => {
		expect.assertions(1);
		renderPanel({ i18n: createI18n('ja') });
		await expect.element(page.getByRole('heading', { name: '信用オファー' })).toBeVisible();
	});

	it('associates payoff and refinance domain errors with their invoking controls', async () => {
		expect.assertions(4);
		const onPayoff = vi.fn().mockResolvedValue({
			status: 'domain-rejected',
			code: 'insufficientCash',
			context: { cash: 0 }
		});
		renderPanel({ onPayoff });
		const payoff = page.getByRole('button', { name: 'Review payoff' }).nth(0);
		await payoff.click();
		await page.getByRole('button', { name: 'Confirm payoff' }).click();
		await expect.element(payoff).not.toHaveAttribute('aria-invalid');
		const describedBy = (await payoff.element()).getAttribute('aria-describedby');
		expect(describedBy).toMatch(/payoff-.+-error/);
		await expect.element(page.getByRole('status')).toHaveTextContent('Insufficient cash');
		expect(onPayoff).toHaveBeenCalledOnce();
	});

	it('renders the full panel in Traditional Chinese and formats APR with locale punctuation', async () => {
		expect.assertions(2);
		renderPanel({ i18n: createI18n('zh-Hant') });
		// Derive the expected final APR from the same assessment the panel renders
		// for the default 84-day term, rather than hard-coding the value.
		const expectedAprBps = assessCredit(creditworthyGame(), 84).annualInterestRateBps;
		const expectedAprPercent = (expectedAprBps / 100).toFixed(2).replace('.', '\\.');
		await expect.element(page.getByRole('heading', { name: '信用方案' })).toBeVisible();
		await expect
			.element(page.getByText(new RegExp(`${expectedAprPercent}%`)).first())
			.toBeVisible();
	});

	it('focuses the alert-target loan row', async () => {
		expect.assertions(1);
		const game = gameWithLoan();
		const id = game.finance.loans.at(-1)!.id;
		renderPanel({ game, focusedLoanId: id });
		await expect.element(document.getElementById(`finance-loan-${id}`)).toHaveFocus();
	});

	it('associates refinance rejection with its action control while retaining review', async () => {
		expect.assertions(3);
		const onRefinance = vi.fn().mockResolvedValue({
			status: 'domain-rejected',
			code: 'insufficientCredit',
			context: { availableCredit: 0 }
		});
		renderPanel({ onRefinance });
		const refinance = page.getByRole('button', { name: 'Refinance 28 days' }).nth(0);
		await refinance.click();
		await page.getByRole('button', { name: 'Confirm refinancing' }).click();
		expect((await refinance.element()).getAttribute('aria-describedby')).toMatch(
			/refinance-.+-error/
		);
		await expect.element(page.getByRole('heading', { name: 'Review refinancing' })).toBeVisible();
		expect(onRefinance).toHaveBeenCalledOnce();
	});

	it('fits the complete finance panel within a narrow viewport', async () => {
		expect.assertions(4);
		const originalViewport = { width: window.innerWidth, height: window.innerHeight };
		try {
			await page.viewport(320, 800);
			renderPanel();
			const panel = page.getByRole('region', { name: 'Finance' }).element();
			expect(panel.clientWidth).toBeGreaterThan(0);
			expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
		} finally {
			await page.viewport(originalViewport.width, originalViewport.height);
		}
		expect(window.innerWidth).toBe(originalViewport.width);
		expect(window.innerHeight).toBe(originalViewport.height);
	});

	it('rejects a borrow below the minimum and above the available credit', async () => {
		expect.assertions(3);
		const props = renderPanel();
		await page.getByLabelText('Borrow amount').fill('500');
		await page.getByRole('button', { name: 'Review borrowing' }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Amount is below the minimum borrowing');
		await page.getByLabelText('Borrow amount').fill('999999');
		await page.getByRole('button', { name: 'Review borrowing' }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('Insufficient credit');
		expect(props.onBorrow).not.toHaveBeenCalled();
	});

	it('confirms a repayment after review and clears the input', async () => {
		expect.assertions(3);
		const onRepay = vi.fn().mockResolvedValue({ status: 'sandbox-committed', changed: true });
		renderPanel({ onRepay });
		const loanId = gameWithLoan().finance.loans[0]!.id;
		await page.getByLabelText('Repay amount').nth(0).fill('100');
		await page.getByRole('button', { name: 'Review repayment' }).nth(0).click();
		await expect.element(page.getByRole('heading', { name: 'Review repayment' })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm repayment' }).click();
		expect(onRepay).toHaveBeenCalledWith(loanId, 100);
		await expect.element(page.getByLabelText('Repay amount').nth(0)).toHaveValue('');
	});

	it('rejects a repayment that exceeds the payoff quote', async () => {
		expect.assertions(2);
		const onRepay = vi.fn();
		renderPanel({ onRepay });
		await page.getByLabelText('Repay amount').nth(0).fill('999999');
		await page.getByRole('button', { name: 'Review repayment' }).nth(0).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Amount exceeds the payoff quote');
		expect(onRepay).not.toHaveBeenCalled();
	});

	it.each([
		{ code: 'loanNotFound', expected: 'Loan not found' },
		{ code: 'loanClosed', expected: 'Loan is closed' },
		{ code: 'loanDelinquent', expected: 'Loan is delinquent' },
		{ code: 'invalidAmount', expected: 'Enter a whole-dollar amount' },
		{ code: 'belowMinimumBorrowing', expected: 'Amount is below the minimum borrowing' },
		{ code: 'overpayment', expected: 'Amount exceeds the payoff quote' },
		{ code: 'unsupportedTerm', expected: 'Unsupported loan term' },
		{ code: 'unsupportedPurpose', expected: 'Unsupported loan purpose' },
		{ code: 'purchaseUnavailable', expected: 'Purchase is unavailable' },
		{ code: 'purchaseCostChanged', expected: 'Purchase cost changed' }
	] as const)('maps a $code domain rejection to the right message', async ({ code, expected }) => {
		expect.assertions(2);
		const onBorrow = vi.fn().mockResolvedValue({
			status: 'domain-rejected',
			code,
			context: {}
		});
		renderPanel({ onBorrow });
		await page.getByLabelText('Borrow amount').fill('1200');
		await page.getByRole('button', { name: 'Review borrowing' }).click();
		await page.getByRole('button', { name: 'Confirm borrowing' }).click();
		expect(onBorrow).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('status')).toHaveTextContent(expected);
	});

	it.each([
		{ status: 'failed', expected: 'Finance action could not be completed.' },
		{ status: 'rejected', expected: 'Finance action could not be completed.' },
		{ status: 'busy', expected: 'A finance action is already in progress.' },
		{ status: 'unavailable', expected: 'Financing unavailable' }
	] as const)(
		'shows the right message for a $status borrow result',
		async ({ status, expected }) => {
			expect.assertions(2);
			const onBorrow = vi.fn().mockResolvedValue({ status });
			renderPanel({ onBorrow });
			await page.getByLabelText('Borrow amount').fill('1200');
			await page.getByRole('button', { name: 'Review borrowing' }).click();
			await page.getByRole('button', { name: 'Confirm borrowing' }).click();
			expect(onBorrow).toHaveBeenCalledOnce();
			await expect.element(page.getByRole('status')).toHaveTextContent(expected);
		}
	);

	it('lays out stat cards, term-offer cards, and the borrow review CTA', async () => {
		expect.assertions(6);
		renderPanel();
		for (const label of ['Cash', 'Outstanding principal', 'Latest daily profit', 'Daily revenue']) {
			await expect.element(page.getByText(label, { exact: true })).toBeVisible();
		}
		await expect.element(page.getByText('No report yet').first()).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: '84 days', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('shows the selected term rate on the matching offer card', async () => {
		expect.assertions(1);
		const props = renderPanel();
		const expectedApr = props.i18n.format.apr(assessCredit(props.game, 84).annualInterestRateBps);
		await expect
			.element(page.getByText(`${expectedApr} APR`, { exact: true }).first())
			.toBeVisible();
	});

	it('shows the real per-term available credit on each offer card', async () => {
		expect.assertions(3);
		const props = renderPanel();
		for (const term of [28, 56, 84] as const) {
			const card = page.getByRole('button', {
				name: props.i18n.labels.loanTerm(term),
				exact: true
			});
			const expected = props.i18n.format.currency(assessCredit(props.game, term).availableCredit);
			await expect.element(card).toHaveTextContent(expected);
		}
	});

	it('renders muted placeholders instead of synthetic figures before a game exists', async () => {
		renderPanel({ game: creditworthyGame(), live: false });

		await vi.waitFor(() => {
			const statCards = [...document.querySelectorAll<HTMLElement>('.stat-card')];
			expect(statCards).toHaveLength(4);
			expect(statCards.every((card) => card.textContent?.includes('—'))).toBe(true);
			expect(
				[...document.querySelectorAll<HTMLElement>('.term-card')].every((card) =>
					card.textContent?.includes('—')
				)
			).toBe(true);
		});
		const surfaces = [
			...document.querySelectorAll<HTMLElement>('.stat-card, .term-card, .credit-grid')
		];
		expect(surfaces.every((surface) => !/\$[0-9]/.test(surface.textContent ?? ''))).toBe(true);
		await expect.element(page.getByText('No report yet')).not.toBeInTheDocument();
	});

	it('renders each loan card with a ledger strip of payment facts', async () => {
		const game = gameWithLoan();
		renderPanel({ game });
		const loan = game.finance.loans.find((candidate) => candidate.originalPrincipal === 2_000)!;
		await expect.element(page.getByText('Ledger', { exact: true }).first()).toBeVisible();
		await vi.waitFor(() => {
			const article = document.getElementById(`finance-loan-${loan.id}`);
			expect(article?.textContent).toMatch(/Original principal\s*\$2,000/);
			expect(article?.textContent).toMatch(/Payoff quote\s*\$[0-9,]+/);
		});
	});

	it('draws the revenue spark from the trailing daily reports', async () => {
		let game = creditworthyGame();
		for (let day = 0; day < 7; day += 1) {
			game = simulateDay(game);
		}
		renderPanel({ game });

		const series = game.reports.slice(-7).map((report) => report.revenue);
		const peak = Math.max(...series);
		await vi.waitFor(() => {
			expect(document.querySelectorAll('.spark-bar')).toHaveLength(7);
		});
		const heights = [...document.querySelectorAll<HTMLElement>('.spark-bar')].map((bar) =>
			Number.parseFloat(bar.style.height)
		);
		expect(
			heights.every((height, index) => height === Math.round((series[index]! / peak) * 100))
		).toBe(true);
	});

	it('shows the no-activity message when there are no transactions', async () => {
		expect.assertions(1);
		const game = creditworthyGame();
		renderPanel({ game });
		await expect.element(page.getByText('No finance activity yet.')).toBeVisible();
	});
});
