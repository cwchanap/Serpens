import { describe, expect, test } from 'vitest';
import { INDUSTRIAL_BUILDING_TYPES, getIndustryTilesByResource } from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
import {
	addWarehouseMaterial,
	getWarehouseCapacity,
	getWarehouseUsed,
	quantizeAtomicRecipeRatio,
	removeWarehouseMaterial,
	simulateIndustryProduction
} from './industryProduction';
import {
	DEFAULT_SIMULATION_RULES,
	type SimulationRuleSource,
	type SimulationRules
} from './simulationRules';
import { createNewGame } from './state';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	IndustryCity,
	RailCell
} from './types';

const scenarioSource: SimulationRuleSource = {
	kind: 'scenario',
	sourceId: 'scenario:test:modifier:0'
};

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
		expect(warehouse.overflowCost).toBe(6);
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

	test('clamps negative stored stock before removing material', () => {
		expect.assertions(3);
		const result = removeWarehouseMaterial(
			{ capacity: 20, materials: { snacks: -4 }, overflowUnits: 0, overflowCost: 0 },
			'snacks',
			10
		);

		expect(result.quantityRemoved).toBe(0);
		expect(result.shortage).toBe(10);
		expect(result.warehouse.materials.snacks).toBe(0);
	});
});

describe('industry production simulation', () => {
	test('keeps omitted and explicit defaults deeply equal', () => {
		let game = { ...createNewGame('convenience', 280_004), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'flour-mill'
		});

		expect(simulateIndustryProduction(game)).toEqual(
			simulateIndustryProduction(game, DEFAULT_SIMULATION_RULES)
		);
	});

	test('multiplies only selected industrial paid-input fallback movements', () => {
		let game = { ...createNewGame('convenience', 280_005), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'snack-factory'
		});
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'industrial-material',
					target: { kind: 'ids', ids: ['salt'] },
					multiplier: 2
				}
			]
		};
		const baseline = simulateIndustryProduction(game);
		const doubled = simulateIndustryProduction(game, rules);
		const baselineByMaterial = new Map(
			baseline.report.importedInputs.map((movement) => [movement.materialId, movement])
		);

		for (const movement of doubled.report.importedInputs) {
			const baselineMovement = baselineByMaterial.get(movement.materialId)!;
			expect(movement.quantity).toBe(baselineMovement.quantity);
			expect(movement.value).toBe(
				movement.materialId === 'salt' ? baselineMovement.value * 2 : baselineMovement.value
			);
		}
		expect(doubled.report.importSpend).toBe(
			baseline.report.importSpend + baselineByMaterial.get('salt')!.value
		);
		expect(doubled.importCostApplications).toEqual([
			{
				scope: 'industrial-material',
				targetId: 'salt',
				baselineCost: baselineByMaterial.get('salt')!.value,
				resolvedMultiplier: 2,
				actualCost: baselineByMaterial.get('salt')!.value * 2,
				contributions: [{ source: scenarioSource, multiplier: 2 }]
			}
		]);
	});

	test('rounds the whole industrial paid-input movement after applying its multiplier', () => {
		let game = { ...createNewGame('convenience', 280_006), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'flour-mill'
		});
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'industrial-material',
					target: { kind: 'ids', ids: ['grain'] },
					multiplier: 1.025
				}
			]
		};

		const result = simulateIndustryProduction(game, rules);

		expect(
			result.report.importedInputs.find((movement) => movement.materialId === 'grain')?.value
		).toBe(21);
		expect(result.importCostApplications).toContainEqual({
			scope: 'industrial-material',
			targetId: 'grain',
			baselineCost: 20,
			resolvedMultiplier: 1.025,
			actualCost: 21,
			contributions: [{ source: scenarioSource, multiplier: 1.025 }]
		});
	});

	test('does not apply same-id retail rules to industrial paid inputs', () => {
		let game = { ...createNewGame('convenience', 280_007), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'flour-mill'
		});
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['grain'] },
					multiplier: 2
				}
			]
		};

		expect(simulateIndustryProduction(game, rules)).toEqual(simulateIndustryProduction(game));
	});

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

	test('raw producers buffer materials locally when they have no rail connection', () => {
		expect.assertions(4);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		game = buildOnResource(game, 'grain-field', 'grain-farm');

		const result = simulateIndustryProduction(game);

		// Without a rail link to a warehouse, output stays in the farm's own
		// buffer — the shared warehouse pool is untouched.
		expect(result.game.warehouse.materials.grain ?? 0).toBe(0);
		expect(result.game.industrialBuildings[0]?.inventory.grain).toBeGreaterThan(0);
		expect(result.report.produced.some((item) => item.materialId === 'grain')).toBe(true);
		expect(result.game.industrialBuildings[0]?.status).toBe('produced');
	});

	test('processors import missing inputs and report import spend', () => {
		expect.assertions(7);
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
		expect(result.report.importSpend).toBe(20);
		expect(result.report.operatingCost).toBe(42);
		// Output fills the mill's own buffer (bufferCapacity 90), not the shared
		// warehouse, so there's no warehouse-capacity overflow to pay for.
		expect(result.report.overflowCost).toBe(0);
		expect(result.game.cash).toBe(
			game.cash -
				result.report.importSpend -
				result.report.operatingCost -
				result.report.overflowCost
		);
		expect(result.game.industrialBuildings[0]?.inventory.flour).toBe(8);
		expect(game.warehouse.materials.flour).toBeUndefined();
	});

	test('building level scales produced output', () => {
		expect.assertions(2);
		const game = {
			...buildOnResource(createNewGame('convenience', 20260603), 'grain-field', 'grain-farm'),
			cash: 1_000_000
		};
		const level1 = simulateIndustryProduction(game);
		const leveled = {
			...game,
			industrialBuildings: game.industrialBuildings.map((building) => ({ ...building, level: 6 })) // x2.0
		};
		const level6 = simulateIndustryProduction(leveled);

		const produced1 = level1.report.produced.reduce(
			(total, movement) => total + movement.quantity,
			0
		);
		const produced6 = level6.report.produced.reduce(
			(total, movement) => total + movement.quantity,
			0
		);

		expect(produced6).toBeGreaterThan(produced1);
		expect(produced6 / produced1).toBeCloseTo(2.0, 1);
	});

	test('operating cost is integerized at non-integer throughput levels', () => {
		expect.assertions(2);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'flour-mill'
		});
		// Level 2 → throughput 1.2 → recipe operatingCost 18 × 1.2 = 21.6 (fractional
		// without rounding). Adding dailyOperatingCost 24 gives 45.6 before rounding.
		const leveled = {
			...game,
			industrialBuildings: game.industrialBuildings.map((building) => ({
				...building,
				level: 2
			}))
		};

		const result = simulateIndustryProduction(leveled);

		expect(Number.isInteger(result.report.operatingCost)).toBe(true);
		expect(result.report.operatingCost).toBe(46); // Math.round(18 * 1.2 + 24)
	});

	test('output rounding is single-pass at non-integer throughput (level 2)', () => {
		// Oil-press at level 2: throughput 1.2, recipe output 7 cooking-oil →
		// raw desired = 7 × 1.2 = 8.4. With 77 cooking-oil already in the
		// 85-cap buffer, free = 8. Pre-rounding 8.4 → 8 would make ratio =
		// 8/8 = 1.0 (full production, 12 oilseeds imported), but the raw 8.4
		// desired exceeds the 8 free units, so ratio must be 8/8.4 ≈ 0.952
		// (stalled, 11 oilseeds imported). This pins the single-round output
		// behavior and prevents reintroducing the double-round asymmetry that
		// caused ±1-unit import drift and a misleading status at level ≥ 2.
		expect.assertions(4);
		const game = makeProductionGame(makeIndustryCity([]), [
			makeIndustryBuilding('press', 'oil-press', 2, 2, { 'cooking-oil': 77 })
		]);
		const leveled = {
			...game,
			industrialBuildings: game.industrialBuildings.map((building) => ({
				...building,
				level: 2
			}))
		};

		const { game: result, report } = simulateIndustryProduction(leveled);
		const press = result.industrialBuildings[0]!;

		expect(press.status).toBe('stalled');
		expect(press.inventory['cooking-oil']).toBe(85);
		const oilseedImport = report.importedInputs.find((m) => m.materialId === 'oilseeds');
		expect(oilseedImport?.quantity).toBe(11);
		expect(report.produced.some((m) => m.materialId === 'cooking-oil' && m.quantity === 8)).toBe(
			true
		);
	});

	test('without a rail link, a same-day raw producer cannot feed a processor and its inputs import instead', () => {
		expect.assertions(6);
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

		// Grain and flour both stay trapped in their own producers' buffers —
		// there is no rail connecting farm, mill, or a warehouse building.
		expect(result.game.warehouse.materials.grain ?? 0).toBe(0);
		expect(
			result.game.industrialBuildings.find((building) => building.typeId === 'grain-farm')
				?.inventory.grain
		).toBe(30);
		expect(
			result.game.industrialBuildings.find((building) => building.typeId === 'flour-mill')
				?.inventory.flour
		).toBe(8);
		expect(result.report.importedInputs.some((item) => item.materialId === 'grain')).toBe(true);
		expect(result.report.warehousePulls.some((item) => item.materialId === 'grain')).toBe(false);
		expect(result.game.industrialBuildings.map((building) => building.status)).toEqual([
			'produced',
			'imported-inputs'
		]);
	});

	test('marks buildings with unknown type ids as blocked and increments blocked days', () => {
		expect.assertions(2);
		const built = buildOnResource(
			{ ...createNewGame('convenience', 20260512), cash: 100_000 },
			'grain-field',
			'grain-farm'
		);
		const game = {
			...built,
			industrialBuildings: built.industrialBuildings.map((building) => ({
				...building,
				typeId: 'missing-type' as IndustrialBuildingTypeId,
				blockedDays: 0
			}))
		};

		const result = simulateIndustryProduction(game);

		expect(result.game.industrialBuildings[0]?.status).toBe('blocked');
		expect(result.game.industrialBuildings[0]?.blockedDays).toBe(1);
	});

	test('marks buildings with a dangling recipeId as blocked', () => {
		// A building type whose recipeId doesn't exist in PRODUCTION_RECIPES
		// is a data-integrity error — the production tick must mark the
		// building as blocked rather than crashing on a missing recipe.
		expect.assertions(2);
		const fakeTypeId = 'fake-dangling-recipe' as IndustrialBuildingTypeId;
		const types = INDUSTRIAL_BUILDING_TYPES as Record<string, unknown>;
		const original = types[fakeTypeId];
		types[fakeTypeId] = {
			id: fakeTypeId,
			name: 'Fake Dangling Recipe',
			buildCost: 100,
			dailyOperatingCost: 1,
			requiredResource: null,
			requiresIndustrialTile: false,
			recipeId: 'nonexistent-recipe',
			warehouseCapacity: 0,
			bufferCapacity: 10,
			tier: 1
		};
		try {
			const built = buildOnResource(
				{ ...createNewGame('convenience', 20260512), cash: 100_000 },
				'grain-field',
				'grain-farm'
			);
			const game = {
				...built,
				industrialBuildings: built.industrialBuildings.map((building) => ({
					...building,
					typeId: fakeTypeId,
					blockedDays: 0
				}))
			};

			const result = simulateIndustryProduction(game);
			expect(result.game.industrialBuildings[0]?.status).toBe('blocked');
			expect(result.game.industrialBuildings[0]?.blockedDays).toBe(1);
		} finally {
			if (original === undefined) {
				delete types[fakeTypeId];
			} else {
				types[fakeTypeId] = original;
			}
		}
	});

	test('getWarehouseUsed treats null material quantities as zero', () => {
		expect.assertions(1);
		const warehouse = {
			capacity: 10,
			materials: { snacks: null as unknown as number },
			overflowUnits: 0,
			overflowCost: 0
		};

		expect(getWarehouseUsed(warehouse)).toBe(0);
	});
});

// Minimal fixtures for the buffer/rail-fed production model: a GameState
// stub the way railShipping.spec.ts builds one, since simulateIndustryProduction
// only touches cash, warehouse, industryCities, and industrialBuildings.
function makeIndustryBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	mapX: number,
	mapY: number,
	inventory: IndustrialBuilding['inventory'] = {},
	level = 1
): IndustrialBuilding {
	return {
		id,
		level,
		typeId,
		cityId: 'ind-city',
		tileId: `ind-city-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		inventory,
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function makeIndustryCity(rails: RailCell[]): IndustryCity {
	return { id: 'ind-city', name: 'Industry City', width: 30, height: 30, tiles: [], rails };
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

function makeProductionGame(city: IndustryCity, buildings: IndustrialBuilding[]): GameState {
	return {
		cash: 10_000,
		reports: [],
		industryCities: [city],
		activeIndustryCityId: city.id,
		industrialBuildings: buildings,
		warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 }
	} as unknown as GameState;
}

// farm (2,2) footprint (2..3, 2..3); mill (10,2) footprint (10..11, 2..3) —
// same layout as railShipping.spec.ts so the rail-pull bottlenecks (1/day at
// level 1, 3/day at level 3) are already-proven behavior.
const baseGame = makeProductionGame(makeIndustryCity([]), [
	makeIndustryBuilding('farm', 'grain-farm', 2, 2),
	makeIndustryBuilding('mill', 'flour-mill', 20, 20)
]);

const railGame = makeProductionGame(makeIndustryCity(straightRails(4, 2, 11, 3)), [
	makeIndustryBuilding('farm', 'grain-farm', 2, 2),
	makeIndustryBuilding('mill', 'flour-mill', 10, 2)
]);

const fullBufferGame = makeProductionGame(makeIndustryCity([]), [
	makeIndustryBuilding('farm', 'grain-farm', 2, 2, { grain: 150 })
]);

const partialBufferGame = makeProductionGame(makeIndustryCity([]), [
	makeIndustryBuilding('mill', 'flour-mill', 2, 2, { flour: 86 })
]);

const farmWarehouseGame = makeProductionGame(makeIndustryCity(straightRails(4, 2, 11)), [
	makeIndustryBuilding('farm', 'grain-farm', 2, 2),
	makeIndustryBuilding('wh1', 'warehouse', 10, 2)
]);

// Mill connected by rail to a warehouse building, with grain pre-stocked in
// the shared warehouse pool so the mill's input shortage is satisfied by a
// rail pull from the warehouse (exercising the fromWarehouse report branch).
const warehousePullGame: GameState = {
	...makeProductionGame(makeIndustryCity(straightRails(4, 2, 11)), [
		makeIndustryBuilding('mill', 'flour-mill', 2, 2),
		makeIndustryBuilding('wh1', 'warehouse', 10, 2)
	]),
	warehouse: { capacity: 100, materials: { grain: 50 }, overflowUnits: 0, overflowCost: 0 }
};

describe('rail-fed production', () => {
	test('unconnected mill imports its inputs (fallback) and warehouse pool stays untouched', () => {
		expect.assertions(3);
		const { game, report } = simulateIndustryProduction(baseGame);
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;

		expect(mill.status).toBe('imported-inputs');
		expect(report.importedInputs.some((m) => m.materialId === 'grain')).toBe(true);
		expect(report.railShipments).toHaveLength(0);
	});

	test('rail-connected mill pulls grain from the farm buffer same-day', () => {
		expect.assertions(3);
		const { game, report } = simulateIndustryProduction(railGame);

		expect(report.railShipments.some((s) => s.kind === 'pull-producer')).toBe(true);
		expect(report.consumed.some((m) => m.source === 'rail')).toBe(true);
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
		expect(mill.importedInputTotal).toBeLessThan(10); // partially rail-fed
	});

	test('farm with a full buffer and no outlet stalls and pays only dailyOperatingCost', () => {
		expect.assertions(3);
		const { game, report } = simulateIndustryProduction(fullBufferGame);
		const farm = game.industrialBuildings.find((b) => b.typeId === 'grain-farm')!;

		expect(farm.status).toBe('stalled');
		expect(farm.lastProduction).toHaveLength(0);
		// operating cost = only the flat 10 (no recipe cost at ratio 0)
		expect(report.operatingCost).toBe(10);
	});

	test('partially full buffer clips production and consumes proportional inputs', () => {
		expect.assertions(3);
		// flour-mill bufferCapacity 90, prefilled { flour: 86 } → free = 4.
		// Desired output at level 1 = 8 flour → ratio = 4/8 = 0.5.
		// Inputs scale: round(10 grain × 0.5) = 5 (imported — no rails here).
		const { game, report } = simulateIndustryProduction(partialBufferGame);
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;

		expect(mill.status).toBe('stalled');
		expect(mill.inventory.flour).toBe(90);
		const grainImport = report.importedInputs.find((m) => m.materialId === 'grain');
		expect(grainImport?.quantity).toBe(5);
	});

	test('partial multi-input runs stay atomic and never undercharge required ingredients', () => {
		expect.assertions(4);
		// snack-factory bufferCapacity 95; prefill snacks so only 1 free slot.
		// Naive ratio 1/8 rounds flour to 1 but salt/oil/packaging to 0 while still
		// producing 1 snack. Atomic quantize must refuse that partial run.
		const snackFactory = makeProductionGame(makeIndustryCity([]), [
			makeIndustryBuilding('snacks', 'snack-factory', 2, 2, { snacks: 94 })
		]);

		const { game, report } = simulateIndustryProduction(snackFactory);
		const factory = game.industrialBuildings.find((b) => b.typeId === 'snack-factory')!;

		expect(factory.status).toBe('stalled');
		expect(factory.lastProduction).toHaveLength(0);
		expect(report.produced.filter((m) => m.materialId === 'snacks')).toHaveLength(0);
		expect(report.importedInputs.reduce((total, movement) => total + movement.quantity, 0)).toBe(0);
	});

	test('quantizeAtomicRecipeRatio drops scales that zero any required input', () => {
		expect.assertions(2);
		const snackInputs = [
			{ materialId: 'flour' as const, quantity: 6 },
			{ materialId: 'cooking-oil' as const, quantity: 2 },
			{ materialId: 'salt' as const, quantity: 1 },
			{ materialId: 'packaging' as const, quantity: 2 }
		];
		const snackOutputs = [{ materialId: 'snacks' as const, quantity: 8 }];

		expect(quantizeAtomicRecipeRatio(1 / 8, 8, 1, snackInputs, snackOutputs)).toBe(0);
		expect(quantizeAtomicRecipeRatio(0.5, 8, 1, snackInputs, snackOutputs)).toBe(0.5);
	});

	test('quantizeAtomicRecipeRatio returns 0 when the scale is too small to round any output above zero', () => {
		// With a tiny ratio and a large desiredTotal, the only candidate
		// (units=1) yields output.quantity * (1/desiredTotal) < 0.5, so
		// Math.round(...) = 0 for every output — isAtomicRecipeScale's
		// !hasOutput early return fires and the loop exhausts to 0.
		expect.assertions(2);
		const inputs = [{ materialId: 'grain' as const, quantity: 10 }];
		const outputs = [{ materialId: 'flour' as const, quantity: 1 }];

		expect(quantizeAtomicRecipeRatio(0.001, 1000, 1, inputs, outputs)).toBe(0);
		// Sanity: a large enough ratio still produces a valid scale.
		expect(quantizeAtomicRecipeRatio(0.5, 1000, 1, inputs, outputs)).toBe(0.5);
	});

	test('processor whose buffer is full of recipe inputs can still produce', () => {
		// flour-mill capacity 90 filled entirely with grain (its recipe input).
		// Projected free after consuming 10 grain is 10, enough for 8 flour.
		expect.assertions(5);
		const fullInputMill = makeProductionGame(makeIndustryCity([]), [
			makeIndustryBuilding('mill', 'flour-mill', 2, 2, { grain: 90 })
		]);
		const { game, report, importCostApplications } = simulateIndustryProduction(fullInputMill, {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'industrial-material',
					target: { kind: 'ids', ids: ['grain'] },
					multiplier: 2
				}
			]
		});
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;

		expect(mill.status).toBe('produced');
		expect(mill.inventory.grain).toBe(80);
		expect(mill.inventory.flour).toBe(8);
		expect(report.produced.some((m) => m.materialId === 'flour' && m.quantity === 8)).toBe(true);
		expect(importCostApplications).toEqual([]);
	});

	test('level-2 partial buffer uses unrounded desiredOutputs for ratio (single-round, no drift)', () => {
		// flour-mill at level 2: throughput = 1.2, so desiredOutputs flour =
		// 8 × 1.2 = 9.6 (kept unrounded). Buffer pre-filled with 83 flour →
		// free = 7, ratio = 7 / 9.6 ≈ 0.7292.
		// Input needed = Math.round(10 × 1.2 × 0.7292) = Math.round(8.75) = 9.
		// If desiredOutputs were pre-rounded to 10, ratio would be 7/10 = 0.7
		// and input needed would be Math.round(8.4) = 8 — a 1-unit drift.
		// This test pins the single-round behavior documented in
		// industryProduction.ts:140-148.
		expect.assertions(3);
		const level2Mill = makeProductionGame(makeIndustryCity([]), [
			makeIndustryBuilding('mill', 'flour-mill', 2, 2, { flour: 83 }, 2)
		]);
		const { game, report } = simulateIndustryProduction(level2Mill);
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;

		const grainImport = report.importedInputs.find((m) => m.materialId === 'grain');
		expect(grainImport?.quantity).toBe(9);
		expect(mill.inventory.flour).toBe(90);
		expect(mill.status).toBe('stalled');
	});

	test('connected farm pushes surplus to the warehouse pool for retail', () => {
		expect.assertions(3);
		const { game, report } = simulateIndustryProduction(farmWarehouseGame);
		const farm = game.industrialBuildings.find((b) => b.typeId === 'grain-farm')!;

		expect(report.railShipments.some((s) => s.kind === 'push-warehouse')).toBe(true);
		expect(game.warehouse.materials.grain ?? 0).toBeGreaterThan(0);
		// Guard the push-resurrect invariant: the re-read at the end of
		// simulateIndustryProduction must reflect the push phase draining 1
		// unit via the level-1 rail. If the re-read regressed to
		// buildingUpdates (post-production, pre-push), the farm would show
		// 30 — double-counting the pushed unit in both the farm buffer and
		// the warehouse pool.
		expect(farm.inventory.grain ?? 0).toBe(29);
	});

	test('rail-connected mill pulls inputs from the warehouse pool and records the pull', () => {
		expect.assertions(4);
		const { game, report } = simulateIndustryProduction(warehousePullGame);

		// The mill's grain shortage is satisfied by a rail pull from the
		// warehouse building, so fromWarehouse > 0 surfaces as both a
		// warehouse-labeled consumed movement and a warehousePulls entry.
		expect(report.railShipments.some((s) => s.kind === 'pull-warehouse')).toBe(true);
		expect(report.consumed.some((m) => m.source === 'warehouse' && m.materialId === 'grain')).toBe(
			true
		);
		expect(report.warehousePulls.some((m) => m.materialId === 'grain')).toBe(true);
		// The pool was drained by the pulled quantity (level-1 line → 1 unit).
		expect(game.warehouse.materials.grain ?? 0).toBeLessThan(50);
	});

	test('resolves inputs from own buffer, same-city producer, warehouse, then import in order', () => {
		const fakeTypeId = 'test-grain-cache' as IndustrialBuildingTypeId;
		const types = INDUSTRIAL_BUILDING_TYPES as Record<string, unknown>;
		const original = types[fakeTypeId];
		types[fakeTypeId] = {
			id: fakeTypeId,
			name: 'Test Grain Cache',
			buildCost: 0,
			dailyOperatingCost: 0,
			requiredResource: null,
			requiresIndustrialTile: false,
			recipeId: 'grain-harvest',
			warehouseCapacity: 0,
			bufferCapacity: 3,
			tier: 1
		};

		try {
			const game = {
				...makeProductionGame(makeIndustryCity(straightRails(4, 2, 19, 10)), [
					makeIndustryBuilding('source', fakeTypeId, 2, 2, { grain: 3 }),
					makeIndustryBuilding('mill', 'flour-mill', 10, 2, { grain: 2 }),
					makeIndustryBuilding('warehouse', 'warehouse', 18, 2)
				]),
				warehouse: {
					capacity: 200,
					materials: { grain: 3 },
					overflowUnits: 0,
					overflowCost: 0
				}
			};

			const { report } = simulateIndustryProduction(game);

			expect(
				report.consumed
					.filter((movement) => movement.materialId === 'grain')
					.map((movement) => ({ source: movement.source, quantity: movement.quantity }))
			).toEqual([
				{ source: 'local', quantity: 2 },
				{ source: 'rail', quantity: 3 },
				{ source: 'warehouse', quantity: 3 },
				{ source: 'import', quantity: 2 }
			]);
			expect(
				report.railShipments.map((shipment) => ({
					kind: shipment.kind,
					fromId: shipment.fromId,
					toId: shipment.toId,
					materialId: shipment.materialId,
					quantity: shipment.quantity
				}))
			).toEqual([
				{
					kind: 'pull-producer',
					fromId: 'source',
					toId: 'mill',
					materialId: 'grain',
					quantity: 3
				},
				{
					kind: 'pull-warehouse',
					fromId: 'warehouse',
					toId: 'mill',
					materialId: 'grain',
					quantity: 3
				},
				{
					kind: 'push-warehouse',
					fromId: 'mill',
					toId: 'warehouse',
					materialId: 'flour',
					quantity: 7
				}
			]);
		} finally {
			if (original === undefined) {
				delete types[fakeTypeId];
			} else {
				types[fakeTypeId] = original;
			}
		}
	});

	test('railUsage records per-cell units for the segment inspector', () => {
		const { report } = simulateIndustryProduction(railGame);

		// Level-3 line y=4 x=2..11 between farm (2,2) and mill (10,2). Pull
		// ships 3 grain/day along the attach-connected path; assert the full
		// deterministic usage map for this fixture.
		expect(report.railUsage).toEqual({
			'ind-city:3,4': 3,
			'ind-city:4,4': 3,
			'ind-city:5,4': 3,
			'ind-city:6,4': 3,
			'ind-city:7,4': 3,
			'ind-city:8,4': 3,
			'ind-city:9,4': 3,
			'ind-city:10,4': 3
		});
	});

	test('same input state twice produces identical reports (determinism)', () => {
		expect.assertions(2);
		const first = simulateIndustryProduction(railGame);
		const second = simulateIndustryProduction(railGame);

		expect(first.report).toEqual(second.report);
		expect(first.game.warehouse).toEqual(second.game.warehouse);
	});
});
