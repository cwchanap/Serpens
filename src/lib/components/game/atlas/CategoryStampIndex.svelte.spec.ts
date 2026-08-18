import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { LocalizedProductChainCategorySummary } from '$lib/i18n/localizedTypes';
import { createI18n } from '$lib/i18n';
import CategoryStampIndex from './CategoryStampIndex.svelte';

function summary(
	overrides: Partial<LocalizedProductChainCategorySummary>
): LocalizedProductChainCategorySummary {
	return {
		productId: 'snacks',
		name: 'Snacks',
		tier: 3,
		health: 'healthy',
		healthLabel: 'Healthy',
		bottleneck: '',
		warehouseStock: 100,
		produced: 30,
		consumed: 28,
		imported: 0,
		...overrides
	};
}

describe('CategoryStampIndex', () => {
	it('renders one stamp per summary with status seal text', async () => {
		expect.assertions(2);
		const onSelectProduct = vi.fn();
		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [
				summary({
					productId: 'snacks',
					name: 'Snacks',
					health: 'shortage',
					healthLabel: 'Shortage'
				}),
				summary({ productId: 'soft-drinks', name: 'Drinks' })
			],
			activeProductId: 'snacks',
			mode: 'store-categories',
			onSelectProduct
		});

		await expect.element(page.getByRole('button', { name: /Snacks/i })).toBeVisible();
		await expect.element(page.getByText('Shortage')).toBeVisible();
	});

	it('marks the active stamp with aria-pressed when in store-categories mode', async () => {
		expect.assertions(1);
		const onSelectProduct = vi.fn();
		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [summary({ productId: 'snacks', name: 'Snacks' })],
			activeProductId: 'snacks',
			mode: 'store-categories',
			onSelectProduct
		});

		await expect
			.element(page.getByRole('button', { name: /Snacks/i }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('does not mark stamps active when in warehouse-flow mode', async () => {
		expect.assertions(1);
		const onSelectProduct = vi.fn();
		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [summary({ productId: 'snacks', name: 'Snacks' })],
			activeProductId: 'snacks',
			mode: 'warehouse-flow',
			onSelectProduct
		});

		await expect
			.element(page.getByRole('button', { name: /Snacks/i }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('calls onSelectProduct when a stamp is clicked', async () => {
		expect.assertions(1);
		const onSelectProduct = vi.fn();
		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [summary({ productId: 'snacks', name: 'Snacks' })],
			activeProductId: null,
			mode: 'store-categories',
			onSelectProduct
		});

		await page.getByRole('button', { name: /Snacks/i }).click();
		expect(onSelectProduct).toHaveBeenCalledWith('snacks');
	});

	it('shows a tier badge on tiered categories', async () => {
		expect.assertions(1);
		const onSelectProduct = vi.fn();
		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [summary({ productId: 'bottled-water', name: 'Bottled Water', tier: 1 })],
			activeProductId: null,
			mode: 'store-categories',
			onSelectProduct
		});

		const stamp = document.querySelector('[data-testid="category-stamp-bottled-water"]');
		expect(stamp?.textContent).toContain('Tier 1');
	});

	it('resolves soft-drinks stamp art through its drinks material', async () => {
		expect.assertions(1);
		const onSelectProduct = vi.fn();

		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [summary({ productId: 'soft-drinks', name: 'Soft Drinks', tier: 1 })],
			activeProductId: null,
			mode: 'store-categories',
			onSelectProduct
		});

		const stamp = document.querySelector('[data-testid="category-stamp-soft-drinks"]');
		expect(stamp?.querySelector('img')?.getAttribute('src')).toBe(
			'/assets/game/industry/materials/drinks.png'
		);
	});

	it('formats metric quantities with the active locale formatter', async () => {
		expect.assertions(2);
		const onSelectProduct = vi.fn();

		render(CategoryStampIndex, {
			i18n: createI18n('zh-Hant'),
			summaries: [
				summary({
					productId: 'snacks',
					name: 'Snacks',
					warehouseStock: 1234.5,
					produced: 9876,
					consumed: 12.25
				})
			],
			activeProductId: null,
			mode: 'store-categories',
			onSelectProduct
		});

		const stamp = document.querySelector('[data-testid="category-stamp-snacks"]');
		expect(stamp?.textContent).toContain('庫存 1,234.5 · 生產 9,876/日 · 售出 12.25/日');
		expect(stamp?.textContent).not.toContain('庫存 1234.5');
	});

	it('does not show a tier badge for categories without a tier', async () => {
		expect.assertions(1);
		const onSelectProduct = vi.fn();
		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [summary({ productId: 'snacks', name: 'Snacks', tier: null })],
			activeProductId: null,
			mode: 'store-categories',
			onSelectProduct
		});

		const stamp = document.querySelector('[data-testid="category-stamp-snacks"]');
		expect(stamp?.textContent).not.toContain('Tier');
	});

	it('omits the icon image for categories without industry material art', async () => {
		expect.assertions(2);
		const onSelectProduct = vi.fn();

		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [summary({ productId: 'apparel', name: 'Apparel' })],
			activeProductId: null,
			mode: 'store-categories',
			onSelectProduct
		});

		const stamp = document.querySelector('[data-testid="category-stamp-apparel"]');
		expect(stamp?.querySelector('img')).toBeNull();
		await expect.element(page.getByRole('button', { name: /Apparel/i })).toBeVisible();
	});
});
