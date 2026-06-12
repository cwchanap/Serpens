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
		expect.assertions(1);

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
});
