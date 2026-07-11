import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { LocalizedProductChainNode } from '$lib/i18n/localizedTypes';
import { createI18n } from '$lib/i18n';
import NodeBroadside from './NodeBroadside.svelte';

function shortageRecipeNode(): LocalizedProductChainNode {
	return {
		id: 'recipe:flour-milling',
		kind: 'recipe',
		label: 'Flour mill',
		materialId: null,
		recipeId: 'flour-milling',
		stage: 'process',
		layer: 1,
		row: 0,
		health: 'shortage',
		healthLabel: 'Shortage',
		warehouseStock: 0,
		capacity: { buildingCount: 1, outputPerDay: 20, inputPerDay: 20 },
		actual: {
			produced: 14,
			consumed: 22,
			importedInput: 0,
			warehousePulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 8
		},
		bottleneck: 'Insufficient flour input for the bakery.',
		statLine: '1 bldg · 20/d'
	};
}

describe('NodeBroadside', () => {
	it('renders the empty prompt when no node is selected', async () => {
		expect.assertions(1);
		render(NodeBroadside, { i18n: createI18n('en'), node: null });
		await expect
			.element(page.getByText('Select a graph node to inspect its latest flow metrics.'))
			.toBeVisible();
	});

	it('renders Japanese empty-state text', async () => {
		expect.assertions(1);

		render(NodeBroadside, { i18n: createI18n('ja'), node: null });

		await expect
			.element(page.getByText('グラフノードを選択して最新のフロー指標を確認します。'))
			.toBeVisible();
	});

	it('renders the node label, status, bottleneck, and metrics', async () => {
		expect.assertions(5);
		render(NodeBroadside, { i18n: createI18n('en'), node: shortageRecipeNode() });
		await expect.element(page.getByRole('heading', { name: 'Flour mill' })).toBeVisible();
		await expect.element(page.getByText('Shortage')).toBeVisible();
		await expect.element(page.getByText('Insufficient flour input for the bakery.')).toBeVisible();
		await expect.element(page.getByText('Missed').first()).toBeVisible();
		await expect.element(page.getByText('8')).toBeVisible();
	});

	it('renders a shared producer note and omits the verdict when there is no bottleneck', async () => {
		expect.assertions(3);
		const node: LocalizedProductChainNode = {
			...shortageRecipeNode(),
			id: 'recipe:shared-mill',
			label: 'Shared Mill',
			health: 'healthy',
			healthLabel: 'Healthy',
			bottleneck: '',
			sharedBranchCount: 3
		};

		render(NodeBroadside, { i18n: createI18n('en'), node });

		await expect.element(page.getByRole('heading', { name: 'Shared Mill' })).toBeVisible();
		await expect
			.element(page.getByText('Shared producer — drawn in 3 branches of this chain.'))
			.toBeVisible();

		const section = document.querySelector('section.broadside');
		expect(section?.querySelector('.verdict')).toBeNull();
	});

	it('preserves fractional capacity values for upgraded recipe nodes', async () => {
		expect.assertions(1);
		const node: LocalizedProductChainNode = {
			...shortageRecipeNode(),
			capacity: { buildingCount: 3, outputPerDay: 11.2, inputPerDay: 15.4 }
		};

		render(NodeBroadside, { i18n: createI18n('en'), node });

		await expect.element(page.getByText('11.2 out / 15.4 in')).toBeVisible();
	});
});
