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

const decisions: DecisionItem[] = [
	{
		id: 'd1',
		title: 'Staff Dispute',
		context: decisionContextCashPressure(),
		expiresOnDay: 12,
		options: [
			{
				id: 'o1',
				label: 'Mediate',
				description: 'Sit them down and negotiate.',
				effects: { staffMorale: 5 }
			},
			{
				id: 'o2',
				label: 'Ignore',
				description: 'Let them sort it out.',
				effects: { staffMorale: -3 }
			}
		]
	},
	{
		id: 'd2',
		title: 'Supplier Delay',
		context: decisionContextExpansionOpportunity(),
		expiresOnDay: 15,
		options: [
			{
				id: 'o3',
				label: 'Wait',
				description: 'Accept the delay.',
				effects: { cash: 0 }
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
	}> = {}
) {
	const props = {
		decisions: decisions as DecisionItem[],
		i18n: createI18n('en'),
		onResolve: vi.fn(),
		...overrides
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

	it('omits the disabled-copy paragraph when canResolve is false but no reason is supplied', async () => {
		expect.assertions(2);
		renderQueue({ canResolve: false });

		await expect.element(page.getByRole('button', { name: /Mediate/ })).toBeDisabled();
		await expect.element(page.getByRole('status')).not.toBeInTheDocument();
	});
});
