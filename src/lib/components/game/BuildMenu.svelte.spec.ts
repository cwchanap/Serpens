import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { RetailBuildMenuOption } from '$lib/game/placementPreview';
import BuildMenu from './BuildMenu.svelte';

const retailOptions: RetailBuildMenuOption[] = [
	{
		archetypeId: 'convenience',
		setupCostRange: { min: 1100, max: 1500 },
		projectedDailyRevenueRange: { min: 700, max: 980 },
		validTileCount: 24,
		disabledReason: null
	},
	{
		archetypeId: 'boutique',
		setupCostRange: { min: 1200, max: 1900 },
		projectedDailyRevenueRange: { min: 420, max: 880 },
		validTileCount: 18,
		disabledReason: null
	}
];

async function waitForFocusEffect(): Promise<void> {
	await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function pressKey(key: string, init: KeyboardEventInit = {}): void {
	const target = document.activeElement ?? document.body;

	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			bubbles: true,
			cancelable: true,
			...init
		})
	);
}

function getBuildMenuDialog(): HTMLElement {
	return document.querySelector<HTMLElement>('[role="dialog"][aria-label="Build menu"]')!;
}

describe('BuildMenu', () => {
	it('renders retail store types and chooses a retail placement tool', async () => {
		expect.assertions(5);
		const onChooseRetail = vi.fn();

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail,
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('dialog', { name: /build menu/i })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: /build retail/i })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /^build convenience store\b/i }))
			.toBeVisible();
		await expect.element(page.getByText(/24 valid tiles/i)).toBeVisible();
		await page.getByRole('button', { name: /build convenience store/i }).click();
		expect(onChooseRetail).toHaveBeenCalledWith('convenience');
	});

	it('focuses the modal controls, traps Tab, and closes on Escape', async () => {
		expect.assertions(4);
		const onClose = vi.fn();

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose
		});

		await waitForFocusEffect();

		const dialog = getBuildMenuDialog();
		const closeButton = dialog.querySelector<HTMLButtonElement>('button.close')!;
		const buildButtons = Array.from(
			dialog.querySelectorAll<HTMLButtonElement>('button.build-option')
		);
		const lastBuildButton = buildButtons.at(-1)!;

		expect(document.activeElement).toBe(closeButton);

		lastBuildButton.focus();
		pressKey('Tab');
		expect(document.activeElement).toBe(closeButton);

		closeButton.focus();
		pressKey('Tab', { shiftKey: true });
		expect(document.activeElement).toBe(lastBuildButton);

		pressKey('Escape');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('renders industry buildings and filters them by product chain search', async () => {
		expect.assertions(7);
		const onChooseIndustry = vi.fn();

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry,
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: /build industry/i })).toBeVisible();
		await page.getByRole('button', { name: /filter: all products/i }).click();
		const filterPopover = page.getByRole('dialog', { name: /product chain filter/i });
		await expect.element(filterPopover).toBeVisible();
		await expect.element(filterPopover).not.toHaveAttribute('aria-modal');
		await page.getByLabelText(/search products/i).fill('gift');
		await expect.element(page.getByRole('button', { name: /gifts/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /snacks/i })).not.toBeInTheDocument();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /build gift workshop/i })).toBeVisible();
		await page.getByRole('button', { name: /build gift workshop/i }).click();
		expect(onChooseIndustry).toHaveBeenCalledWith('gift-workshop');
	});

	it('dismisses the product filter popover with the close button and Escape', async () => {
		expect.assertions(5);
		const onClose = vi.fn();

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose
		});

		await page.getByRole('button', { name: /filter: all products/i }).click();
		const filterPopover = page.getByRole('dialog', { name: /product chain filter/i });

		await expect.element(filterPopover).toBeVisible();
		await expect.element(filterPopover).not.toHaveAttribute('aria-modal');
		await page.getByRole('button', { name: /close product chain filter/i }).click();
		await expect.element(filterPopover).not.toBeInTheDocument();

		await page.getByRole('button', { name: /filter: all products/i }).click();
		pressKey('Escape');

		await expect.element(filterPopover).not.toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('sorts industry building options by tier, then cost, then name', async () => {
		expect.assertions(3);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		const dialog = getBuildMenuDialog();
		const labels = Array.from(
			dialog.querySelectorAll<HTMLElement>('button.build-option strong')
		).map((element) => element.textContent ?? '');

		const waterBottlerIndex = labels.findIndex((label) => label.includes('Water Bottler'));
		const snackFactoryIndex = labels.findIndex((label) => label.includes('Snack Factory'));

		expect(waterBottlerIndex).toBeGreaterThanOrEqual(0);
		expect(snackFactoryIndex).toBeGreaterThanOrEqual(0);
		expect(waterBottlerIndex).toBeLessThan(snackFactoryIndex);
	});

	it('explains locked industry construction before a store exists', async () => {
		expect.assertions(2);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: 'Found a retail store to unlock construction.',
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect
			.element(page.getByText('Found a retail store to unlock construction.'))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeDisabled();
	});

	it('formats a fixed setup cost range and singular valid tile count', async () => {
		expect.assertions(3);

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions: [
				{
					archetypeId: 'convenience',
					setupCostRange: { min: 1500, max: 1500 },
					projectedDailyRevenueRange: { min: 700, max: 980 },
					validTileCount: 1,
					disabledReason: null
				}
			],
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Setup \$1,500 \|/)).toBeVisible();
		await expect.element(page.getByText('1 valid tile')).toBeVisible();
		await expect.element(page.getByText('1 valid tiles')).not.toBeInTheDocument();
	});

	it('renders a disabled retail option with a disabled reason', async () => {
		expect.assertions(3);
		const onChooseRetail = vi.fn();

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions: [
				{
					archetypeId: 'boutique',
					setupCostRange: { min: 1200, max: 1900 },
					projectedDailyRevenueRange: { min: 420, max: 880 },
					validTileCount: 0,
					disabledReason: 'No valid tiles for this store type.'
				}
			],
			industryLockedReason: null,
			onChooseRetail,
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		const button = page.getByRole('button', { name: /build boutique goods/i });
		await expect.element(button).toBeDisabled();
		await expect.element(page.getByText('No valid tiles for this store type.')).toBeVisible();
		// A native click on the raw disabled element exercises the disabled branch:
		// a disabled button suppresses activation, so onChooseRetail stays uncalled.
		// If the button ever became clickable, this click would dispatch onclick and
		// fail the assertion.
		document.querySelector<HTMLButtonElement>('button.build-option')!.click();
		expect(onChooseRetail).not.toHaveBeenCalled();
	});

	it('renders an empty retail options message', async () => {
		expect.assertions(1);

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions: [],
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect.element(page.getByText('No retail buildings available')).toBeVisible();
	});

	it('shows no matching products when the filter search matches nothing', async () => {
		expect.assertions(1);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: /filter: all products/i }).click();
		await page.getByLabelText(/search products/i).fill('zzzznotachain');

		await expect.element(page.getByText('No matching products')).toBeVisible();
	});

	it('disables a product filter with no industry chain and shows no buildings when selected', async () => {
		expect.assertions(2);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: /filter: all products/i }).click();
		const apparelButton = page.getByRole('button', { name: /apparel no industry chain yet/i });
		await expect.element(apparelButton).toBeDisabled();
		await expect.element(apparelButton).toBeVisible();
	});

	it('clears the product filter with the clear button', async () => {
		expect.assertions(2);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: /filter: all products/i }).click();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: gifts/i })).toBeVisible();
		await page.getByRole('button', { name: /clear product filter/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: all products/i })).toBeVisible();
	});

	it('resets to all products by clicking the "All products" filter entry', async () => {
		expect.assertions(2);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: /filter: all products/i }).click();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: gifts/i })).toBeVisible();

		// Reopen the filter popover and pick "All products" to clear the active filter.
		await page.getByRole('button', { name: /filter: gifts/i }).click();
		await page.getByRole('button', { name: /all products/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: all products/i })).toBeVisible();
	});

	it('traps focus to the last element when shift-tabbing from outside the dialog', async () => {
		expect.assertions(1);

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await waitForFocusEffect();

		const dialog = getBuildMenuDialog();
		const buildButtons = Array.from(
			dialog.querySelectorAll<HTMLButtonElement>('button.build-option')
		);
		const lastBuildButton = buildButtons.at(-1)!;

		// Focus an element outside the dialog, then shift-tab to wrap to the last element.
		document.body.focus();
		pressKey('Tab', { shiftKey: true });

		expect(document.activeElement).toBe(lastBuildButton);
	});

	it('ignores non-Tab and non-Escape keys in the dialog keydown handler', async () => {
		expect.assertions(1);
		const onClose = vi.fn();

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose
		});

		await waitForFocusEffect();
		pressKey('a');
		pressKey('Enter');
		expect(onClose).not.toHaveBeenCalled();
	});

	it('does not wrap focus when tabbing forward from a non-last focusable element', async () => {
		expect.assertions(1);

		render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await waitForFocusEffect();

		const dialog = getBuildMenuDialog();
		const buildButtons = Array.from(
			dialog.querySelectorAll<HTMLButtonElement>('button.build-option')
		);
		const firstBuildButton = buildButtons[0]!;

		firstBuildButton.focus();
		pressKey('Tab');

		// Tab from a non-last element does not wrap; focus stays put because the
		// synthetic event does not trigger native focus movement.
		expect(document.activeElement).toBe(firstBuildButton);
	});

	it('reconciles retail option list when rerendered with changed data for the same archetype ids', async () => {
		expect.assertions(2);

		const { rerender } = render(BuildMenu, {
			activeMapView: 'retail',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect
			.element(page.getByRole('button', { name: /build convenience store/i }))
			.toBeVisible();

		rerender({
			activeMapView: 'retail',
			retailOptions: [
				{
					archetypeId: 'convenience',
					setupCostRange: { min: 2000, max: 3000 },
					projectedDailyRevenueRange: { min: 800, max: 1200 },
					validTileCount: 30,
					disabledReason: null
				},
				{
					archetypeId: 'boutique',
					setupCostRange: { min: 1200, max: 1900 },
					projectedDailyRevenueRange: { min: 420, max: 880 },
					validTileCount: 18,
					disabledReason: null
				}
			],
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/30 valid tiles/i)).toBeVisible();
	});

	it('reconciles industry building list when the product filter changes', async () => {
		expect.assertions(2);

		const { rerender } = render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeVisible();

		// Rerender with a locked reason to change the industry building rendering path.
		rerender({
			activeMapView: 'industry',
			retailOptions,
			industryLockedReason: 'Found a retail store to unlock construction.',
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeDisabled();
	});
});

describe('BuildMenu industry recipe cards', () => {
	it('shows a Starter badge and opens the advisor', async () => {
		expect.assertions(2);
		const onOpenAdvisor = vi.fn();
		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions: [],
			industryLockedReason: null,
			availableMaterialIds: [],
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onOpenAdvisor,
			onClose: vi.fn()
		});
		await expect.element(page.getByText(/starter/i).first()).toBeVisible();
		await page.getByRole('button', { name: /supply advisor|what should i build/i }).click();
		expect(onOpenAdvisor).toHaveBeenCalledTimes(1);
	});

	it('shows the producer hint for a missing recipe ingredient', async () => {
		expect.assertions(1);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions: [],
			industryLockedReason: null,
			availableMaterialIds: [],
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		// Water Bottler's recipe consumes water, which no producer supplies when
		// availableMaterialIds is empty, so its missing-input chip should surface
		// the building that produces water (the Water Pump).
		await expect.element(page.getByText(/needs water pump/i).first()).toBeVisible();
	});

	it('surfaces the resource-tile requirement for a Starter extraction building', async () => {
		expect.assertions(1);

		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions: [],
			industryLockedReason: null,
			availableMaterialIds: [],
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});

		// The Water Pump has requiredResource: 'water-source' and a recipe with no
		// inputs, so the resource-tile hint must render independently of the
		// (never-missing) recipe branch.
		await expect
			.element(page.getByText(/needs a water source resource tile/i).first())
			.toBeVisible();
	});
});
