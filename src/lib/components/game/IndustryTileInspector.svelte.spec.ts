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

	it('opens a confirmation dialog before building on the selected resource tile', async () => {
		expect.assertions(5);
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

		await page.getByRole('button', { name: /build grain farm/i }).click();

		expect(onBuild).not.toHaveBeenCalled();
		const dialog = page.getByRole('dialog', { name: /confirm industrial build/i });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog).not.toHaveAttribute('aria-modal', 'true');
		await expect.element(page.getByRole('heading', { name: /grain farm/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /confirm build/i })).toBeVisible();
	});

	it('cancels a pending industrial build without closing the inspector', async () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const onBuild = vi.fn();
		const onClose = vi.fn();

		render(IndustryTileInspector, {
			game,
			tile,
			building: null,
			onBuild,
			onClose
		});

		await page.getByRole('button', { name: /build grain farm/i }).click();
		await page.getByRole('button', { name: /^cancel$/i }).click();

		await expect
			.element(page.getByRole('dialog', { name: /confirm industrial build/i }))
			.not.toBeInTheDocument();
		expect(onBuild).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('confirms an industrial build once and closes the inspector', async () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const onBuild = vi.fn();
		const onClose = vi.fn();

		render(IndustryTileInspector, {
			game,
			tile,
			building: null,
			onBuild,
			onClose
		});

		await page.getByRole('button', { name: /build grain farm/i }).click();
		await page.getByRole('button', { name: /confirm build/i }).click();

		expect(onBuild).toHaveBeenCalledTimes(1);
		expect(onBuild).toHaveBeenCalledWith('grain-farm', tile.id);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('clears a pending build when the same tile becomes occupied', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const onBuild = vi.fn();
		const occupiedBuilding: IndustrialBuilding = {
			id: 'industry-building-grain-farm',
			typeId: 'grain-farm',
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

		const { rerender } = render(IndustryTileInspector, {
			game,
			tile,
			building: null,
			onBuild,
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: /build grain farm/i }).click();

		await rerender({
			game,
			tile,
			building: occupiedBuilding,
			onBuild,
			onClose: vi.fn()
		});

		await expect
			.element(page.getByRole('dialog', { name: /confirm industrial build/i }))
			.not.toBeInTheDocument();
		expect(onBuild).not.toHaveBeenCalled();
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
		const grainTile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
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

		const { rerender } = render(IndustryTileInspector, {
			game,
			tile: grainTile,
			building: null,
			onBuild: vi.fn(),
			onClose: vi.fn()
		});

		await expect
			.element(page.getByTestId('industry-building-option-grain-farm'))
			.toHaveAttribute('src', '/assets/game/industry/buildings/grain-farm.png');

		await rerender({
			game,
			tile: warehouseTile,
			building: warehouseBuilding,
			onBuild: vi.fn(),
			onClose: vi.fn()
		});

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
