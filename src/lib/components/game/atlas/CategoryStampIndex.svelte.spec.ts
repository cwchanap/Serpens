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
	it('renders one art-only circular stamp per summary with the category name as its accessible name', async () => {
		expect.assertions(3);
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

		await expect.element(page.getByRole('button', { name: 'Snacks' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Drinks' })).toBeVisible();
		// Art-first: the accessible name comes from aria-label, images are decorative.
		expect(
			document
				.querySelector<HTMLImageElement>('[data-testid="category-stamp-snacks"] img')
				?.getAttribute('alt')
		).toBe('');
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
			.element(page.getByRole('button', { name: 'Snacks' }))
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
			.element(page.getByRole('button', { name: 'Snacks' }))
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

		await page.getByRole('button', { name: 'Snacks' }).click();
		expect(onSelectProduct).toHaveBeenCalledWith('snacks');
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

	it('shows a wax attention badge on shortage categories', async () => {
		expect.assertions(2);
		const onSelectProduct = vi.fn();

		render(CategoryStampIndex, {
			i18n: createI18n('en'),
			summaries: [
				summary({ productId: 'snacks', name: 'Snacks', health: 'shortage' }),
				summary({ productId: 'soft-drinks', name: 'Drinks' })
			],
			activeProductId: null,
			mode: 'store-categories',
			onSelectProduct
		});

		const badge = document.querySelector('[data-testid="category-stamp-snacks"] .attention');
		expect(badge?.textContent).toBe('!');
		expect(
			document.querySelector('[data-testid="category-stamp-soft-drinks"] .attention')
		).toBeNull();
	});

	it('shows a dash instead of art for categories without industry material art', async () => {
		expect.assertions(3);
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
		expect(stamp?.querySelector('.dash')).not.toBeNull();
		await expect.element(page.getByRole('button', { name: 'Apparel' })).toBeVisible();
	});
});
