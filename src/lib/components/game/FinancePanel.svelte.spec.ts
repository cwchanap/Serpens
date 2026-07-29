import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { borrow } from '$lib/game/finance';
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
			'84-day available credit',
			'Operating cash flow',
			'Principal headroom',
			'Service headroom',
			'Loan disbursement'
		]) {
			await expect.element(page.getByText(label, { exact: true })).toBeVisible();
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
		await expect.element(page.getByText('$725')).toBeVisible();
		expect(document.body.textContent).toMatch(/Payoff quote\s+\$725/);
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
		await expect.element(page.getByRole('heading', { name: '信用方案' })).toBeVisible();
		await expect.element(page.getByText(/14\.42%/)).toBeVisible();
	});

	it('focuses the alert-target loan row', async () => {
		expect.assertions(1);
		const game = gameWithLoan();
		const id = game.finance.loans.at(-1)!.id;
		renderPanel({ game, focusedLoanId: id });
		await expect.element(page.getByRole('article').nth(1)).toHaveFocus();
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
});
