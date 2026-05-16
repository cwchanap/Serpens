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
			.element(page.getByRole('button', { name: /build convenience store/i }))
			.toBeVisible();
		await expect.element(page.getByText(/24 valid tiles/i)).toBeVisible();
		await page.getByRole('button', { name: /build convenience store/i }).click();
		expect(onChooseRetail).toHaveBeenCalledWith('convenience');
	});

	it('renders industry buildings and filters them by product chain search', async () => {
		expect.assertions(6);
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
		await expect.element(page.getByRole('dialog', { name: /product chain filter/i })).toBeVisible();
		await page.getByLabelText(/search products/i).fill('gift');
		await expect.element(page.getByRole('button', { name: /gifts/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /snacks/i })).not.toBeInTheDocument();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /build gift workshop/i })).toBeVisible();
		await page.getByRole('button', { name: /build gift workshop/i }).click();
		expect(onChooseIndustry).toHaveBeenCalledWith('gift-workshop');
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
