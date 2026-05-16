import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IndustryTileInspector from './IndustryTileInspector.svelte';
import { getIndustryTilesByResource } from '$lib/game/industry';
import { createNewGame } from '$lib/game/state';
import type { IndustrialBuilding } from '$lib/game/types';

describe('IndustryTileInspector', () => {
	it('shows empty industry tile stats without construction controls or product filters', async () => {
		expect.assertions(7);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;

		render(IndustryTileInspector, {
			game,
			tile,
			building: null,
			onClose: vi.fn()
		});

		await expect
			.element(page.getByRole('heading', { name: `Industry Tile ${tile.x}, ${tile.y}` }))
			.toBeVisible();
		await expect.element(page.getByText('Terrain')).toBeVisible();
		await expect.element(page.getByText('Grain Field')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Build' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /build grain farm/i }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /filter:/i })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('dialog', { name: /confirm industrial build/i }))
			.not.toBeInTheDocument();
	});

	it('renders building and material thumbnails with asset sources', async () => {
		expect.assertions(3);
		const game = {
			...createNewGame('convenience', 20260512),
			warehouse: {
				capacity: 200,
				materials: {
					snacks: 42
				},
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const warehouseTile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const warehouseBuilding: IndustrialBuilding = {
			id: 'industry-building-warehouse',
			typeId: 'warehouse',
			cityId: warehouseTile.cityId,
			tileId: warehouseTile.id,
			mapX: warehouseTile.x,
			mapY: warehouseTile.y,
			status: 'idle',
			lastProduction: [
				{
					materialId: 'snacks',
					quantity: 8,
					value: 120,
					source: 'local'
				}
			],
			producedTotal: 8,
			importedInputTotal: 0,
			blockedDays: 0
		};

		render(IndustryTileInspector, {
			game,
			tile: warehouseTile,
			building: warehouseBuilding,
			onClose: vi.fn()
		});

		await expect
			.element(page.getByTestId('industry-building-thumbnail-warehouse'))
			.toHaveAttribute('src', '/assets/game/industry/buildings/warehouse.png');
		await expect
			.element(page.getByTestId('industry-warehouse-material-snacks'))
			.toHaveAttribute('src', '/assets/game/industry/materials/snacks.png');
		await expect.element(page.getByText(/snacks: 42/i)).toBeVisible();
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
