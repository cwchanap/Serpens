import { describe, expect, test } from 'vitest';
import { getIndustryTilesByResource } from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
import {
	addWarehouseMaterial,
	getWarehouseCapacity,
	removeWarehouseMaterial,
	simulateIndustryProduction
} from './industryProduction';
import { createNewGame } from './state';

function buildOnResource(
	game: ReturnType<typeof createNewGame>,
	resource: Parameters<typeof getIndustryTilesByResource>[1],
	typeId: Parameters<typeof buildIndustrialBuilding>[1]['buildingTypeId']
) {
	const tile = getIndustryTilesByResource(game.industryCities[0]!, resource)[0]!;
	return buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId: typeId });
}

describe('warehouse operations', () => {
	test('adds material and reports overflow cost above capacity', () => {
		expect.assertions(4);
		const warehouse = addWarehouseMaterial(
			{ capacity: 5, materials: {}, overflowUnits: 0, overflowCost: 0 },
			'snacks',
			8
		);

		expect(warehouse.materials.snacks).toBe(8);
		expect(warehouse.capacity).toBe(5);
		expect(warehouse.overflowUnits).toBe(3);
		expect(warehouse.overflowCost).toBeGreaterThan(0);
	});

	test('removes available stock and returns shortage', () => {
		expect.assertions(3);
		const result = removeWarehouseMaterial(
			{ capacity: 20, materials: { snacks: 6 }, overflowUnits: 0, overflowCost: 0 },
			'snacks',
			10
		);

		expect(result.quantityRemoved).toBe(6);
		expect(result.shortage).toBe(4);
		expect(result.warehouse.materials.snacks).toBe(0);
	});
});

describe('industry production simulation', () => {
	test('uses placed warehouse buildings as warehouse capacity', () => {
		expect.assertions(3);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'warehouse'
		});

		const result = simulateIndustryProduction(game);

		expect(getWarehouseCapacity(game)).toBe(200);
		expect(result.game.warehouse.capacity).toBe(200);
		expect(result.game.industrialBuildings[0]?.status).toBe('idle');
	});

	test('raw producers add materials to warehouse inventory', () => {
		expect.assertions(3);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		game = buildOnResource(game, 'grain-field', 'grain-farm');

		const result = simulateIndustryProduction(game);

		expect(result.game.warehouse.materials.grain).toBeGreaterThan(0);
		expect(result.report.produced.some((item) => item.materialId === 'grain')).toBe(true);
		expect(result.game.industrialBuildings[0]?.status).toBe('produced');
	});

	test('processors import missing inputs and report import spend', () => {
		expect.assertions(4);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'flour-mill'
		});

		const result = simulateIndustryProduction(game);

		expect(result.report.importedInputs.some((item) => item.materialId === 'grain')).toBe(true);
		expect(result.report.importSpend).toBeGreaterThan(0);
		expect(result.game.cash).toBeLessThan(game.cash);
		expect(result.game.warehouse.materials.flour).toBeGreaterThan(0);
	});

	test('runs raw production before processors can withdraw local inputs', () => {
		expect.assertions(5);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		game = buildOnResource(game, 'grain-field', 'grain-farm');
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'flour-mill'
		});

		const result = simulateIndustryProduction(game);

		expect(result.game.warehouse.materials.grain).toBe(20);
		expect(result.game.warehouse.materials.flour).toBe(8);
		expect(result.report.importedInputs.some((item) => item.materialId === 'grain')).toBe(false);
		expect(result.report.warehousePulls.some((item) => item.materialId === 'grain')).toBe(true);
		expect(result.game.industrialBuildings.map((building) => building.status)).toEqual([
			'produced',
			'produced'
		]);
	});
});
