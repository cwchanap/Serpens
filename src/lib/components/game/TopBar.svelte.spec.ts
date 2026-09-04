import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
import { createI18n } from '$lib/i18n';
import TopBar from './TopBar.svelte';

const alerts: LocalizedGameAlert[] = [
	{
		id: 'event-modifier:event-modifier-1',
		kind: 'event-modifier',
		message: 'Corner Market modifier is active',
		modifierId: 'event-modifier-1',
		managementPanelId: 'decisions'
	}
];

function baseProps() {
	return {
		eyebrow: 'Retail City Map',
		title: 'Harbor City',
		day: 1,
		cash: 0,
		alerts: [] as LocalizedGameAlert[],
		i18n: createI18n('en'),
		activeLocale: 'en' as const,
		onSelectAlert: vi.fn(),
		activeMapView: 'retail' as const,
		onSelectView: vi.fn(),
		onSelectLocale: vi.fn()
	};
}

describe('TopBar', () => {
	it('renders the location, day and cash', async () => {
		expect.assertions(4);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 42,
			cash: 128400,
			alerts: [],
			i18n: createI18n('en'),
			activeLocale: 'en' as const,
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn(),
			onSelectLocale: vi.fn()
		});
		await expect.element(page.getByRole('banner', { name: /status bar/i })).toBeVisible();
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
			i18n: createI18n('en'),
			activeLocale: 'en' as const,
			onSelectAlert,
			activeMapView: 'retail',
			onSelectView: vi.fn(),
			onSelectLocale: vi.fn()
		});
		await expect.element(page.getByText('1', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: /alert/i }).click();
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
			i18n: createI18n('en'),
			activeLocale: 'en' as const,
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn(),
			onSelectLocale: vi.fn()
		});
		await page.getByRole('button', { name: /alert/i }).click();
		await expect.element(page.getByRole('group', { name: /alerts list/i })).toBeVisible();
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(page.getByRole('group', { name: /alerts list/i })).not.toBeInTheDocument();
	});

	it('switches map views directly from the top HUD', async () => {
		expect.assertions(4);
		const onSelectView = vi.fn();
		render(TopBar, { ...baseProps(), activeMapView: 'retail', onSelectView });

		const retail = page.getByRole('button', { name: /retail city map/i });
		const industry = page.getByRole('button', { name: /industry city map/i });
		const world = page.getByRole('button', { name: /world map/i });

		await expect.element(retail).toHaveAttribute('aria-pressed', 'true');
		await expect.element(industry).toHaveAttribute('aria-pressed', 'false');
		await expect.element(world).toBeVisible();
		await industry.click();
		expect(onSelectView).toHaveBeenCalledWith('industry');
	});

	it('floats the map-view cluster beside the plaque, clear of the status readouts', async () => {
		expect.assertions(6);
		await page.viewport(1280, 800);
		render(TopBar, baseProps());

		const plaque = document.querySelector<HTMLElement>('.location.plaque');
		const group = document.querySelector<HTMLElement>('.map-controls');
		const readouts = document.querySelector<HTMLElement>('.readouts');
		const medallion = document.querySelector<HTMLElement>('.location .medallion');
		if (!plaque || !group || !readouts || !medallion) {
			throw new Error('TopBar chrome elements did not render');
		}

		// The three map-view launchers no longer live in the status strip.
		expect(readouts.contains(group)).toBe(false);

		const plaqueBox = plaque.getBoundingClientRect();
		const groupBox = group.getBoundingClientRect();
		const readoutsBox = readouts.getBoundingClientRect();
		// Mock: the launcher cluster sits beside the plaque (its wrap row lands
		// under it only when the viewport cannot fit both), clear of the
		// right-hand readouts strip.
		expect(groupBox.left).toBeGreaterThanOrEqual(plaqueBox.right - 2);
		// Same top band: the cluster's vertical span overlaps the plaque's.
		expect(groupBox.top < plaqueBox.bottom - 8 && groupBox.bottom > plaqueBox.top + 8).toBe(true);
		expect(groupBox.right).toBeLessThanOrEqual(readoutsBox.left);
		// The plaque carries the ~56px brass medallion anatomy.
		const medallionStyle = getComputedStyle(medallion);
		expect(medallionStyle.width).toBe('56px');
		expect(medallionStyle.borderRadius).toBe('999px');
	});

	it('shows muted placeholders for day and cash when no game exists yet', async () => {
		expect.assertions(4);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: null,
			cash: null,
			alerts: [],
			i18n: createI18n('en'),
			activeLocale: 'en' as const,
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn(),
			onSelectLocale: vi.fn()
		});
		await expect.element(page.getByText(/day \d/i)).not.toBeInTheDocument();
		await expect.element(page.getByText(/\$/)).not.toBeInTheDocument();
		await expect.element(page.getByText(/^Day —$/)).toBeVisible();
		await expect.element(page.getByTestId('cash-readout')).toHaveTextContent('—');
	});

	it('shows a brass medallion for the active map view', async () => {
		expect.assertions(5);
		render(TopBar, { ...baseProps(), activeMapView: 'retail' });
		const medallionIcon = (icon: string) => {
			const nodes = document.querySelectorAll('.location .medallion');
			const node = nodes[nodes.length - 1]?.querySelector(`svg[data-icon="${icon}"]`);
			return page.elementLocator(node as HTMLElement);
		};
		const medallion = () => {
			const nodes = document.querySelectorAll('.location .medallion');
			return page.elementLocator(nodes[nodes.length - 1] as HTMLElement);
		};
		await expect.element(medallion()).toBeVisible();
		await expect.element(medallion()).toHaveAttribute('aria-hidden', 'true');
		await expect.element(medallionIcon('retail')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();

		render(TopBar, { ...baseProps(), activeMapView: 'industry' });
		await expect.element(medallionIcon('industry')).toBeVisible();
	});

	it('shows a moss up-arrow cash trend chip with a one-decimal percent', async () => {
		expect.assertions(3);
		render(TopBar, {
			...baseProps(),
			cash: 248310,
			cashTrend: { direction: 'up', percent: 0.062 }
		});
		const chip = page.getByTestId('cash-trend');
		await expect.element(chip).toBeVisible();
		await expect.element(chip).toHaveAttribute('aria-label', 'Up 6.2%');
		await expect.element(chip).toHaveTextContent('▲ 6.2%');
	});

	it('shows a wax-red down-arrow cash trend chip when cash fell', async () => {
		expect.assertions(3);
		render(TopBar, {
			...baseProps(),
			cash: 100000,
			cashTrend: { direction: 'down', percent: 0.034 }
		});
		const chip = page.getByTestId('cash-trend');
		await expect.element(chip).toBeVisible();
		await expect.element(chip).toHaveAttribute('aria-label', 'Down 3.4%');
		await expect.element(chip).toHaveTextContent('▼ 3.4%');
	});

	it('shows a sign-only chip when the trend has no baseline report', async () => {
		expect.assertions(3);
		render(TopBar, {
			...baseProps(),
			cashTrend: { direction: 'down', percent: null }
		});
		const chip = page.getByTestId('cash-trend');
		await expect.element(chip).toBeVisible();
		await expect.element(chip).toHaveAttribute('aria-label', 'Down');
		await expect.element(chip).toHaveTextContent('▼');
	});

	it('omits the cash trend chip when no trend is known', async () => {
		expect.assertions(2);
		render(TopBar, { ...baseProps(), cashTrend: null });
		await expect.element(page.getByTestId('cash-trend')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('cash-readout')).toBeVisible();
	});

	it('shows a "No alerts" message when the popover is opened with zero alerts', async () => {
		expect.assertions(1);
		render(TopBar, {
			eyebrow: 'Retail City Map',
			title: 'Harbor City',
			day: 1,
			cash: 0,
			alerts: [],
			i18n: createI18n('en'),
			activeLocale: 'en' as const,
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn(),
			onSelectLocale: vi.fn()
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
			i18n: createI18n('en'),
			activeLocale: 'en' as const,
			onSelectAlert: vi.fn(),
			activeMapView: 'retail',
			onSelectView: vi.fn(),
			onSelectLocale: vi.fn()
		});
		await expect.element(page.getByText(/2 alerts/i)).toBeVisible();
	});
});
