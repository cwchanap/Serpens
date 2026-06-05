import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IndustryTileInspector from './IndustryTileInspector.svelte';
import { getIndustryTilesByResource } from '$lib/game/industry';
import { createNewGame } from '$lib/game/state';
import type { IndustrialBuilding } from '$lib/game/types';

describe('IndustryTileInspector', () => {
	it('shows empty industry tile stats without construction controls or product filters', async () => {
		expect.assertions(9);
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
		await expect.element(page.getByLabelText(/search products/i)).not.toBeInTheDocument();
		await expect.element(page.getByText('Search products')).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('dialog', { name: /confirm industrial build/i }))
			.not.toBeInTheDocument();
	});

	it('renders building details and material thumbnails with asset sources', async () => {
		expect.assertions(8);
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
			level: 1,
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
		const buildingDetails = page.getByLabelText('Industrial building details');
		const buildingDetailsElement = document.querySelector(
			'section[aria-label="Industrial building details"]'
		);
		const detailValues = Array.from(buildingDetailsElement?.querySelectorAll('dd') ?? []).map(
			(element) => element.textContent?.trim()
		);
		expect(buildingDetailsElement?.textContent).toContain('Status');
		expect(buildingDetailsElement?.textContent).toContain('Produced total');
		expect(buildingDetailsElement?.textContent).toContain('Imported inputs');
		expect(buildingDetailsElement?.textContent).toContain('Blocked days');
		expect(detailValues).toEqual(['Idle', '8', '0', '0']);
		await expect
			.element(page.getByTestId('industry-production-material-snacks'))
			.toHaveAttribute('src', '/assets/game/industry/materials/snacks.png');
		await expect.element(buildingDetails.getByText(/snacks: 8/i)).toBeVisible();
	});

	it('shows building level and fires upgrade callback', async () => {
		expect.assertions(2);
		const onUpgradeBuilding = vi.fn();
		const game = {
			...createNewGame('convenience', 20260512),
			cash: 999_999
		};
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const buildingId = 'industry-building-upgrade-test';
		const building: IndustrialBuilding = {
			id: buildingId,
			level: 1,
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

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			onClose: vi.fn(),
			onUpgradeBuilding
		});

		const level = page.getByText(/Level 1 \/ 10/i);
		await expect.element(level).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();
		expect(onUpgradeBuilding).toHaveBeenCalledWith(buildingId);
	});

	it('shows Max level button text and hides the cash hint at MAX_BUILDING_LEVEL', async () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-max',
			level: 10,
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

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Level 10 \/ 10/i)).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Max level/i });
		await expect.element(button).toBeDisabled();
		await expect.element(page.getByText('Not enough cash.')).not.toBeInTheDocument();
	});

	it('shows the cash hint when the building can upgrade but cash is insufficient', async () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 0 };
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-broke',
			level: 2,
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

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Level 2 \/ 10/i)).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Upgrade/i });
		await expect.element(button).toBeDisabled();
		await expect.element(page.getByText('Not enough cash.')).toBeVisible();
	});

	it('displays the throughput multiplier scaled by building level', async () => {
		expect.assertions(2);
		const game = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-throughput',
			level: 3,
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

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Level 3 \/ 10/i)).toBeInTheDocument();
		// throughput = 1 + 0.2 * (level - 1) = 1.4 at level 3
		await expect.element(page.getByText('1.4× output')).toBeVisible();
	});

	it('hides the upgrade section for warehouse buildings (no recipe)', async () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const warehouseTile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const building: IndustrialBuilding = {
			id: 'industry-building-warehouse-norecipe',
			level: 1,
			typeId: 'warehouse',
			cityId: warehouseTile.cityId,
			tileId: warehouseTile.id,
			mapX: warehouseTile.x,
			mapY: warehouseTile.y,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0
		};

		render(IndustryTileInspector, {
			game,
			tile: warehouseTile,
			building,
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Level 1 \/ 10/i)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /Upgrade/i })).not.toBeInTheDocument();
		await expect.element(page.getByText(/× output/)).not.toBeInTheDocument();
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
			level: 1,
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
