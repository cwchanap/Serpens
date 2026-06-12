import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProductChainCategorySummary } from '$lib/game/productChainGraph';
import CategoryStampIndex from './CategoryStampIndex.svelte';

function summary(overrides: Partial<ProductChainCategorySummary>): ProductChainCategorySummary {
	return {
		categoryId: 'snacks',
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
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [
				summary({
					categoryId: 'snacks',
					name: 'Snacks',
					health: 'shortage',
					healthLabel: 'Shortage'
				}),
				summary({ categoryId: 'drinks', name: 'Drinks' })
			],
			activeCategoryId: 'snacks',
			mode: 'store-categories',
			onSelectCategory
		});

		await expect.element(page.getByRole('button', { name: /Snacks/i })).toBeVisible();
		await expect.element(page.getByText('Shortage')).toBeVisible();
	});

	it('marks the active stamp with aria-pressed when in store-categories mode', async () => {
		expect.assertions(1);
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [summary({ categoryId: 'snacks', name: 'Snacks' })],
			activeCategoryId: 'snacks',
			mode: 'store-categories',
			onSelectCategory
		});

		await expect
			.element(page.getByRole('button', { name: /Snacks/i }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('does not mark stamps active when in warehouse-flow mode', async () => {
		expect.assertions(1);
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [summary({ categoryId: 'snacks', name: 'Snacks' })],
			activeCategoryId: 'snacks',
			mode: 'warehouse-flow',
			onSelectCategory
		});

		await expect
			.element(page.getByRole('button', { name: /Snacks/i }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('calls onSelectCategory when a stamp is clicked', async () => {
		expect.assertions(1);
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [summary({ categoryId: 'snacks', name: 'Snacks' })],
			activeCategoryId: null,
			mode: 'store-categories',
			onSelectCategory
		});

		await page.getByRole('button', { name: /Snacks/i }).click();
		expect(onSelectCategory).toHaveBeenCalledWith('snacks');
	});
});
