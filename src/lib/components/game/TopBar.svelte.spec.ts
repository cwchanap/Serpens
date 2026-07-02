import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { GameAlert } from '$lib/game/alerts';
import TopBar from './TopBar.svelte';

const alerts: GameAlert[] = [
	{
		id: 'store-stock:s1',
		kind: 'store-stock',
		message: 'Corner Market: 2 products out of stock',
		tileId: 'tile-1'
	}
];

describe('TopBar', () => {
	it('renders the location, day and cash', async () => {
		expect.assertions(3);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 42,
			cash: 128400,
			alerts: [],
			onSelectAlert: vi.fn()
		});
		await expect.element(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
		await expect.element(page.getByText(/day 42/i)).toBeVisible();
		await expect.element(page.getByText(/\$128,400/)).toBeVisible();
	});

	it('shows the alert count and deep-links a clicked alert', async () => {
		expect.assertions(2);
		const onSelectAlert = vi.fn();
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 1,
			cash: 0,
			alerts,
			onSelectAlert
		});
		await expect.element(page.getByText('1', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: /alerts/i }).click();
		await page.getByRole('button', { name: /corner market/i }).click();
		expect(onSelectAlert).toHaveBeenCalledWith(alerts[0]);
	});
});
