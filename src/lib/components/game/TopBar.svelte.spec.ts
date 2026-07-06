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
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn()
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
			onSelectAlert,
			activeMapView: 'retail',
			onSelectView: vi.fn()
		});
		await expect.element(page.getByText('1', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: /^alerts/i }).click();
		await page.getByRole('button', { name: /corner market/i }).click();
		expect(onSelectAlert).toHaveBeenCalledWith(alerts[0]);
	});

	it('dismisses the alerts popover on an outside pointer press', async () => {
		expect.assertions(2);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 1,
			cash: 0,
			alerts,
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn()
		});
		await page.getByRole('button', { name: /^alerts/i }).click();
		await expect.element(page.getByRole('group', { name: /alerts list/i })).toBeVisible();
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(page.getByRole('group', { name: /alerts list/i })).not.toBeInTheDocument();
	});

	it('hosts the map-view menu and switches views', async () => {
		expect.assertions(2);
		const onSelectView = vi.fn();
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 1,
			cash: 0,
			alerts: [],
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView
		});
		await expect
			.element(page.getByRole('button', { name: /industry city map/i }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: /^menu$/i }).click();
		await page.getByRole('button', { name: /industry city map/i }).click();
		expect(onSelectView).toHaveBeenCalledWith('industry');
	});

	it('omits the day and cash readouts when they are null', async () => {
		expect.assertions(2);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: null,
			cash: null,
			alerts: [],
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn()
		});
		await expect.element(page.getByText(/day \d/i)).not.toBeInTheDocument();
		await expect.element(page.getByText(/\$/)).not.toBeInTheDocument();
	});

	it('shows a "No alerts" message when the popover is opened with zero alerts', async () => {
		expect.assertions(1);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 1,
			cash: 0,
			alerts: [],
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn()
		});
		await page.getByRole('button', { name: /^alerts$/i }).click();
		await expect.element(page.getByText(/no alerts/i)).toBeVisible();
	});

	it('announces a plural alert count when there is more than one alert', async () => {
		expect.assertions(1);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 1,
			cash: 0,
			alerts: [
				{ id: 'a1', kind: 'store-stock', message: 'First alert' },
				{ id: 'a2', kind: 'decision', message: 'Second alert' }
			],
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn()
		});
		await expect.element(page.getByText(/2 alerts/i)).toBeVisible();
	});
});
