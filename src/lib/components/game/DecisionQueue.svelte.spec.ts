import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n, type I18nBundle } from '$lib/i18n';
import DecisionQueue from './DecisionQueue.svelte';
import {
	decisionContextCashPressure,
	decisionContextExpansionOpportunity,
	decisionContextLocationGeneric
} from '$lib/game/decisionContext';
import type { DecisionItem } from '$lib/game/types';
import type { GameState } from '$lib/game/types';
import { createNewGame } from '$lib/game/state';

const decisions: DecisionItem[] = [
	{
		kind: 'system',
		id: 'd1',
		title: 'Staff Dispute',
		context: decisionContextCashPressure(),
		expiresOnDay: 12,
		options: [
			{
				id: 'o1',
				label: 'Mediate',
				description: 'Sit them down and negotiate.'
			},
			{
				id: 'o2',
				label: 'Ignore',
				description: 'Let them sort it out.'
			}
		]
	},
	{
		kind: 'system',
		id: 'd2',
		title: 'Supplier Delay',
		context: decisionContextExpansionOpportunity(),
		expiresOnDay: 15,
		options: [
			{
				id: 'o3',
				label: 'Wait',
				description: 'Accept the delay.'
			}
		]
	}
];

function renderQueue(
	overrides: Partial<{
		decisions: DecisionItem[];
		i18n: I18nBundle;
		onResolve: (decisionId: string, optionId: string) => void;
		canResolve: boolean;
		disabledReason: string;
		game: GameState;
	}> = {}
) {
	const selectedDecisions = overrides.decisions ?? decisions;
	const props = {
		decisions: selectedDecisions,
		i18n: createI18n('en'),
		onResolve: vi.fn(),
		...overrides,
		...(overrides.game ? { game: { ...overrides.game, decisions: selectedDecisions } } : {})
	};

	render(DecisionQueue, props);

	return props;
}

describe('DecisionQueue', () => {
	it('shows empty message when no decisions', async () => {
		expect.assertions(2);

		renderQueue({ decisions: [] });

		await expect.element(page.getByRole('heading', { name: 'Decision Queue' })).toBeVisible();
		await expect.element(page.getByText('No urgent decisions today.')).toBeVisible();
	});

	it('renders decision cards with title, context, expiry, and option buttons', async () => {
		expect.assertions(6);

		renderQueue();

		await expect.element(page.getByRole('heading', { name: 'Decision Queue' })).toBeVisible();
		await expect
			.element(page.getByRole('heading', { level: 3, name: 'Staff Dispute' }))
			.toBeVisible();
		await expect
			.element(
				page.getByText(
					'Cash is below zero. Choose how to keep operations moving while protecting the brand.'
				)
			)
			.toBeVisible();
		await expect.element(page.getByText('Expires day 12')).toBeVisible();
		await expect
			.element(page.getByRole('heading', { level: 3, name: 'Supplier Delay' }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /Mediate/ })).toBeVisible();
	});

	it('calls onResolve with correct IDs when option is clicked', async () => {
		expect.assertions(2);

		const props = renderQueue();

		await page.getByRole('button', { name: /Ignore/ }).click();

		expect(props.onResolve).toHaveBeenCalledOnce();
		expect(props.onResolve).toHaveBeenCalledWith('d1', 'o2');
	});

	it('renders a decision card with no option buttons when options is empty', async () => {
		expect.assertions(3);

		renderQueue({
			decisions: [
				{
					kind: 'system',
					id: 'd-empty',
					title: 'Mystery Offer',
					context: decisionContextLocationGeneric(),
					expiresOnDay: 20,
					options: []
				}
			]
		});

		await expect
			.element(page.getByRole('heading', { level: 3, name: 'Mystery Offer' }))
			.toBeVisible();
		await expect.element(page.getByText('Expires day 20')).toBeVisible();
		// Explicitly cover the empty-options branch: the rendered card must contain
		// no option buttons, not just display its copy.
		expect(document.querySelector('article')?.querySelector('button')).toBeNull();
	});

	it('renders a localized fixed label outside English', async () => {
		expect.assertions(2);

		renderQueue({ decisions: [], i18n: createI18n('ja') });

		await expect.element(page.getByRole('heading', { name: '意思決定キュー' })).toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Decision Queue' }))
			.not.toBeInTheDocument();
	});

	it('keeps decisions readable while disabling resolution and protecting the callback', async () => {
		expect.assertions(4);
		const onResolve = vi.fn();
		renderQueue({
			onResolve,
			canResolve: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('heading', { name: 'Staff Dispute' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Mediate/ })).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(onResolve).not.toHaveBeenCalled();
	});

	it('guards onResolve when a click is dispatched on a disabled option button', async () => {
		expect.assertions(1);
		const onResolve = vi.fn();
		renderQueue({ onResolve, canResolve: false });

		// A programmatic click still reaches the onclick handler, which must
		// bail out via the `if (canResolve) return` guard.
		const button = await page.getByRole('button', { name: /Ignore/ }).element();
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onResolve).not.toHaveBeenCalled();
	});

	it('disables only a finance-backed option when live credit is unavailable', async () => {
		expect.assertions(4);
		const base = createNewGame('grocery', 75);
		const game = {
			...base,
			cash: 40_000,
			finance: {
				...base.finance,
				loans: [{ ...base.finance.loans[0]!, status: 'delinquent' as const }]
			}
		};
		const onResolve = vi.fn();
		renderQueue({
			game,
			onResolve,
			decisions: [
				{
					kind: 'event',
					id: 'credit-choice',
					eventId: 'cash-pressure',
					definitionVersion: 1,
					generatedOnDay: 1,
					expiresOnDay: 12,
					target: { kind: 'company' },
					copy: { key: 'events.cashPressure', params: {} },
					options: [
						{
							id: 'short-loan',
							effects: [
								{
									kind: 'finance-borrow',
									purpose: 'emergency',
									amount: 4_000,
									termDays: 56
								}
							],
							modifiers: []
						},
						{ id: 'hold-course', effects: [], modifiers: [] }
					]
				}
			]
		});

		await expect.element(page.getByRole('button', { name: /Short loan/ })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /Hold course/ })).not.toBeDisabled();
		await expect
			.element(page.getByText('Borrowing is unavailable while an obligation is delinquent.'))
			.toBeVisible();
		await page.getByRole('button', { name: /Hold course/ }).click();
		expect(onResolve).toHaveBeenCalledWith('credit-choice', 'hold-course');
	});

	it('shows the debt-service-capacity reason when service headroom limits credit', async () => {
		expect.assertions(2);
		const base = createNewGame('grocery', 75);
		const game = { ...base, cash: 40_000 };
		renderQueue({
			game,
			decisions: [
				{
					kind: 'event',
					id: 'credit-choice',
					eventId: 'cash-pressure',
					definitionVersion: 1,
					generatedOnDay: 1,
					expiresOnDay: 12,
					target: { kind: 'company' },
					copy: { key: 'events.cashPressure', params: {} },
					options: [
						{
							id: 'short-loan',
							effects: [
								{
									kind: 'finance-borrow',
									purpose: 'emergency',
									amount: 200_000,
									termDays: 56
								}
							],
							modifiers: []
						}
					]
				}
			]
		});

		await expect.element(page.getByRole('button', { name: /Short loan/ })).toBeDisabled();
		await expect
			.element(page.getByText('Current debt-service capacity cannot cover this loan.'))
			.toBeVisible();
	});

	it('shows the credit-capacity reason when principal headroom limits credit', async () => {
		expect.assertions(2);
		const base = createNewGame('grocery', 75);
		const game = {
			...base,
			cash: 0,
			finance: {
				...base.finance,
				loans: [{ ...base.finance.loans[0]!, remainingPrincipal: 14_900 }]
			}
		};
		renderQueue({
			game,
			decisions: [
				{
					kind: 'event',
					id: 'credit-choice',
					eventId: 'cash-pressure',
					definitionVersion: 1,
					generatedOnDay: 1,
					expiresOnDay: 12,
					target: { kind: 'company' },
					copy: { key: 'events.cashPressure', params: {} },
					options: [
						{
							id: 'short-loan',
							effects: [
								{
									kind: 'finance-borrow',
									purpose: 'emergency',
									amount: 1_000,
									termDays: 56
								}
							],
							modifiers: []
						}
					]
				}
			]
		});

		await expect.element(page.getByRole('button', { name: /Short loan/ })).toBeDisabled();
		await expect
			.element(page.getByText('Current credit capacity cannot cover this loan.'))
			.toBeVisible();
	});

	it('omits the disabled-copy paragraph when canResolve is false but no reason is supplied', async () => {
		expect.assertions(2);
		renderQueue({ canResolve: false });

		await expect.element(page.getByRole('button', { name: /Mediate/ })).toBeDisabled();
		await expect.element(page.getByRole('status')).not.toBeInTheDocument();
	});
});
