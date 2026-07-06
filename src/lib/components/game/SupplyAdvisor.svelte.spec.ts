import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { AdvisorChain } from '$lib/game/supplyAdvisor';
import SupplyAdvisor from './SupplyAdvisor.svelte';

const chains: AdvisorChain[] = [
	{
		finishedMaterialId: 'bottled-water',
		categoryName: 'Bottled Water',
		tier: 1,
		complete: false,
		nextBuildTypeId: 'water-pump',
		steps: [
			{
				buildingTypeId: 'water-pump',
				name: 'Water Pump',
				tier: 1,
				state: 'buildable',
				isNextBuild: true
			},
			{
				buildingTypeId: 'water-bottler',
				name: 'Water Bottler',
				tier: 1,
				state: 'blocked',
				isNextBuild: false
			}
		]
	}
];

describe('SupplyAdvisor', () => {
	it('lists the chain and builds the recommended next step', async () => {
		expect.assertions(3);
		const onBuild = vi.fn();
		render(SupplyAdvisor, { chains, onBuild, onClose: vi.fn() });
		await expect.element(page.getByRole('heading', { name: /bottled water/i })).toBeVisible();
		await expect.element(page.getByText(/water bottler/i)).toBeVisible();
		await page.getByRole('button', { name: /build water pump/i }).click();
		expect(onBuild).toHaveBeenCalledWith('water-pump');
	});

	it('shows an empty state when there are no chains', async () => {
		expect.assertions(1);
		render(SupplyAdvisor, { chains: [], onBuild: vi.fn(), onClose: vi.fn() });
		await expect.element(page.getByText(/nothing to plan/i)).toBeVisible();
	});

	it('closes via the header Close button', async () => {
		expect.assertions(1);
		const onClose = vi.fn();
		render(SupplyAdvisor, { chains, onBuild: vi.fn(), onClose });
		await page.getByRole('button', { name: /close supply advisor/i }).click();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes via the backdrop', async () => {
		expect.assertions(1);
		const onClose = vi.fn();
		render(SupplyAdvisor, { chains, onBuild: vi.fn(), onClose });
		const backdrop = document.querySelector<HTMLButtonElement>('.backdrop-button')!;
		backdrop.click();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('marks a completed, non-starter chain with the built checkmark and supplied badge', async () => {
		expect.assertions(3);
		const complete: AdvisorChain[] = [
			{
				finishedMaterialId: 'snacks',
				categoryName: 'Snacks',
				tier: 2,
				complete: true,
				nextBuildTypeId: null,
				steps: [
					{
						buildingTypeId: 'grain-farm',
						name: 'Grain Farm',
						tier: 1,
						state: 'built',
						isNextBuild: false
					}
				]
			}
		];
		render(SupplyAdvisor, { chains: complete, onBuild: vi.fn(), onClose: vi.fn() });
		await expect.element(page.getByText(/supplied/i)).toBeVisible();
		await expect.element(page.getByText('✓', { exact: true })).toBeVisible();
		await expect.element(page.getByText(/starter/i)).not.toBeInTheDocument();
	});
});
