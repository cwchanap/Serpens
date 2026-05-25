import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DecisionQueue from './DecisionQueue.svelte';
import type { DecisionItem } from '$lib/game/types';

const decisions: DecisionItem[] = [
	{
		id: 'd1',
		title: 'Staff Dispute',
		context: 'Two employees are arguing over shift schedules.',
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
		context: 'A shipment is running late.',
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
		onResolve: (decisionId: string, optionId: string) => void;
	}> = {}
) {
	const props = {
		decisions: decisions as DecisionItem[],
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
		await expect.element(page.getByRole('heading', { level: 3, name: 'Staff Dispute' })).toBeVisible();
		await expect.element(page.getByText('Two employees are arguing over shift schedules.')).toBeVisible();
		await expect.element(page.getByText('Expires day 12')).toBeVisible();
		await expect.element(page.getByRole('heading', { level: 3, name: 'Supplier Delay' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Mediate/ })).toBeVisible();
	});

	it('calls onResolve with correct IDs when option is clicked', async () => {
		expect.assertions(2);

		const props = renderQueue();

		await page.getByRole('button', { name: /Ignore/ }).click();

		expect(props.onResolve).toHaveBeenCalledOnce();
		expect(props.onResolve).toHaveBeenCalledWith('d1', 'o2');
	});
});
