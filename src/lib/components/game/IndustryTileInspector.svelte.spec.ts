import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IndustryTileInspector from './IndustryTileInspector.svelte';
import { getIndustryTilesByResource } from '$lib/game/industry';
import { createI18n } from '$lib/i18n';
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
			i18n: createI18n('en'),
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile: warehouseTile,
			building: warehouseBuilding,
			i18n: createI18n('en'),
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn(),
			onUpgradeBuilding
		});

		const level = page.getByText(/Level 1 \/ 10/i);
		await expect.element(level).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();
		expect(onUpgradeBuilding).toHaveBeenCalledWith(buildingId);
	});

	it('combines upgrade permission with level and affordability constraints', async () => {
		expect.assertions(3);
		const onUpgradeBuilding = vi.fn();
		const game = { ...createNewGame('convenience', 20260512), cash: 999_999 };
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-capability-test',
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn(),
			onUpgradeBuilding,
			canUpgradeBuilding: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(onUpgradeBuilding).not.toHaveBeenCalled();
	});

	it('guards onUpgradeBuilding when a click is dispatched on a disabled upgrade button', async () => {
		expect.assertions(1);
		const onUpgradeBuilding = vi.fn();
		const game = { ...createNewGame('convenience', 20260512), cash: 999_999 };
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-guard-test',
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn(),
			onUpgradeBuilding,
			canUpgradeBuilding: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		// A programmatic click still reaches the onclick handler, which must
		// bail out via the `if (upgradeAllowed) return` guard.
		const button = await page.getByRole('button', { name: /upgrade/i }).element();
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onUpgradeBuilding).not.toHaveBeenCalled();
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile: warehouseTile,
			building,
			i18n: createI18n('en'),
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
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

	it('shows Locked access for a locked industry tile', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);
		const lockedTile = game.industryCities[0]!.tiles.find((candidate) => candidate.locked)!;

		render(IndustryTileInspector, {
			game,
			tile: lockedTile,
			building: null,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect
			.element(
				page.getByRole('heading', { name: `Industry Tile ${lockedTile.x}, ${lockedTile.y}` })
			)
			.toBeVisible();
		const stats = page.getByLabelText('Industry tile stats');
		await expect.element(stats.getByText('Locked', { exact: true })).toBeVisible();
	});

	it('renders an unknown building type fallback when the typeId is unrecognized', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);
		const tile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const building: IndustrialBuilding = {
			id: 'industry-building-unknown',
			level: 1,
			typeId: 'nonexistent-type' as IndustrialBuilding['typeId'],
			cityId: tile.cityId,
			tileId: tile.id,
			mapX: tile.x,
			mapY: tile.y,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText('Unknown building type')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Upgrade/i })).not.toBeInTheDocument();
	});

	it('shows No materials stored when the warehouse has no materials', async () => {
		expect.assertions(1);
		const game = {
			...createNewGame('convenience', 20260512),
			warehouse: {
				capacity: 200,
				materials: {},
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const tile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const building: IndustrialBuilding = {
			id: 'industry-building-warehouse-empty',
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText('No materials stored')).toBeVisible();
	});

	it('falls back to a labelled name for an unrecognized warehouse material id', async () => {
		expect.assertions(1);
		const game = {
			...createNewGame('convenience', 20260512),
			warehouse: {
				capacity: 200,
				materials: { 'mystery-goods': 7 } as Record<string, number>,
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const tile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const building: IndustrialBuilding = {
			id: 'industry-building-warehouse-mystery',
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Mystery Goods: 7/i)).toBeVisible();
	});

	it('falls back to a labelled name for an unrecognized production material id', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-mystery-production',
			level: 1,
			typeId: 'grain-farm',
			cityId: tile.cityId,
			tileId: tile.id,
			mapX: tile.x,
			mapY: tile.y,
			status: 'idle',
			lastProduction: [
				{
					materialId: 'mystery-goods' as never,
					quantity: 5,
					value: 30,
					source: 'local'
				}
			],
			producedTotal: 5,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Mystery Goods: 5/i)).toBeVisible();
	});

	it('shows No tile selected when no tile is provided', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);

		render(IndustryTileInspector, {
			game,
			tile: null,
			building: null,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: 'Industry tile' })).toBeVisible();
		await expect.element(page.getByText('No tile selected')).toBeVisible();
	});

	it('reconciles building details when rerendered with the same building id but changed data', async () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 999_999 };
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-rerender',
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
			blockedDays: 0,
			inventory: {}
		};

		const result = render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/Level 1 \/ 10/i)).toBeInTheDocument();

		await result.rerender({
			game,
			tile,
			building: { ...building, level: 3, producedTotal: 42, status: 'produced' },
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		const buildingDetails = page.getByLabelText('Industrial building details');
		await expect.element(page.getByText(/Level 3 \/ 10/i)).toBeInTheDocument();
		// Scope to the building details section so the produced-total reconciliation
		// is verified against the updated row rather than an unrelated "42" text.
		await expect.element(buildingDetails.getByText('42')).toBeVisible();
	});

	it('reconciles warehouse materials when rerendered with changed material quantities', async () => {
		expect.assertions(2);
		const game = {
			...createNewGame('convenience', 20260512),
			warehouse: {
				capacity: 200,
				materials: { snacks: 10 },
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const tile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const building: IndustrialBuilding = {
			id: 'industry-building-warehouse-rerender',
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
			blockedDays: 0,
			inventory: {}
		};

		const result = render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/snacks: 10/i)).toBeVisible();

		await result.rerender({
			game: {
				...game,
				warehouse: { ...game.warehouse, materials: { snacks: 99 } }
			},
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText(/snacks: 99/i)).toBeVisible();
	});

	it('treats an undefined warehouse material quantity as zero', async () => {
		expect.assertions(1);
		const game = {
			...createNewGame('convenience', 20260512),
			warehouse: {
				capacity: 200,
				materials: { snacks: undefined } as unknown as Record<string, number>,
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const tile = game.industryCities[0]!.tiles.find(
			(candidate) => candidate.terrain === 'industrial' && !candidate.locked
		)!;
		const building: IndustrialBuilding = {
			id: 'industry-building-warehouse-undefined',
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
			blockedDays: 0,
			inventory: {}
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText('No materials stored')).toBeVisible();
	});

	it('renders a localized fixed label outside English', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);

		render(IndustryTileInspector, {
			game,
			tile: null,
			building: null,
			i18n: createI18n('ja'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText('タイル未選択')).toBeVisible();
		await expect.element(page.getByText('No tile selected')).not.toBeInTheDocument();
	});

	it('shows empty buffer state when inventory has no positive quantities', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-empty-buffer',
			level: 1,
			typeId: 'flour-mill',
			cityId: tile.cityId,
			tileId: tile.id,
			mapX: tile.x,
			mapY: tile.y,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: { grain: 0, flour: 0 }
		};

		render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		await expect.element(page.getByText('No materials buffered')).toBeVisible();
	});

	it('renders non-empty buffer rows with icons, excluding zeros, in id order', async () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const building: IndustrialBuilding = {
			id: 'industry-building-buffer',
			level: 1,
			typeId: 'flour-mill',
			cityId: tile.cityId,
			tileId: tile.id,
			mapX: tile.x,
			mapY: tile.y,
			status: 'produced',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			// grain inserted before flour to verify alphabetical sorting (not Object.entries order); zero snacks must be excluded.
			inventory: { grain: 12, flour: 8, snacks: 0 }
		};

		const { rerender } = render(IndustryTileInspector, {
			game,
			tile,
			building,
			i18n: createI18n('en'),
			onClose: vi.fn()
		});

		const bufferList = page.getByRole('list', { name: 'Buffer' });
		const rows = bufferList.getByRole('listitem');
		await expect.element(rows.nth(0)).toHaveTextContent(/Flour: 8/);
		await expect.element(rows.nth(1)).toHaveTextContent(/Grain: 12/);
		await expect
			.element(page.getByTestId('industry-buffer-material-flour'))
			.toHaveAttribute('src', '/assets/game/industry/materials/flour.png');
		await expect
			.element(page.getByTestId('industry-buffer-material-grain'))
			.toHaveAttribute('src', '/assets/game/industry/materials/grain.png');
		await expect
			.element(page.getByTestId('industry-buffer-material-snacks'))
			.not.toBeInTheDocument();

		await rerender({
			game,
			tile,
			building: { ...building, inventory: { flour: 3, grain: 12 } },
			i18n: createI18n('en'),
			onClose: vi.fn()
		});
		await expect.element(page.getByText(/Flour: 3/)).toBeVisible();
	});
});
