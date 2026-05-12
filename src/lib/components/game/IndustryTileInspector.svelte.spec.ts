import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IndustryTileInspector from './IndustryTileInspector.svelte';
import { getIndustryTilesByResource } from '$lib/game/industry';
import { createNewGame } from '$lib/game/state';
import type { IndustrialBuilding } from '$lib/game/types';

describe('IndustryTileInspector', () => {
	it('shows allowed raw building for a matching resource tile', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const onBuild = vi.fn();

		render(IndustryTileInspector, {
			game,
			tile,
			building: null,
			onBuild,
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: /industry tile/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /build grain farm/i })).toBeVisible();
	});

	it('shows warehouse capacity and material totals for a warehouse building', async () => {
		expect.assertions(4);
		const game = {
			...createNewGame('convenience', 20260512),
			warehouse: {
				capacity: 200,
				materials: {
					snacks: 42,
					drinks: 18
				},
				overflowUnits: 3,
				overflowCost: 15
			}
		};
		const tile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const building: IndustrialBuilding = {
			id: 'industry-building-warehouse',
			typeId: 'warehouse',
			cityId: tile.cityId,
			tileId: tile.id,
			mapX: tile.x,
			mapY: tile.y,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			onBuild: vi.fn(),
			onClose: vi.fn()
		});

		const warehouseSummary = page.getByLabelText('Warehouse summary');

		await expect
			.element(warehouseSummary.getByRole('heading', { name: /warehouse/i }))
			.toBeVisible();
		await expect.element(warehouseSummary.getByText('200')).toBeVisible();
		await expect.element(warehouseSummary.getByText('60')).toBeVisible();
		await expect.element(warehouseSummary.getByText(/snacks: 42/i)).toBeVisible();
	});
});
