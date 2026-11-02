import { describe, expect, test } from 'vitest';
import {
	INDUSTRIAL_BUILDING_TYPES,
	PRODUCTION_RECIPES,
	getIndustryTilesByResource
} from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
import { quantizeAtomicRecipeRatio, simulateIndustryProduction } from './industryProduction';
import {
	WAREHOUSE_OVERFLOW_COST_PER_UNIT,
	addCityInventoryMaterial,
	getCityInventoryStats,
	getCityInventoryUsed,
	removeCityInventoryMaterial
} from './cityInventory';
import { getRailCellDailyCapacity } from './rail';
import {
	DEFAULT_SIMULATION_RULES,
	type SimulationRuleSource,
	type SimulationRules
} from './simulationRules';
import { createNewGame } from './state';
import { openWorldCity } from './world';
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

describe('city inventory operations', () => {
	test('adds material without persisting derived inventory pressure', () => {
		expect.assertions(2);
		const inventory = addCityInventoryMaterial(
			{ cityId: 'industry-city', materials: {} },
			'snacks',
			8
		);

		expect(inventory.materials.snacks).toBe(8);
		expect(inventory).toEqual({ cityId: 'industry-city', materials: { snacks: 8 } });
	});

	test('removes available stock and returns shortage', () => {
		expect.assertions(3);
		const result = removeCityInventoryMaterial(
			{
				cityId: 'industry-city',
				materials: { snacks: 6 }
			},
			'snacks',
			10
		);

		expect(result.quantityRemoved).toBe(6);
		expect(result.shortage).toBe(4);
		expect(result.inventory.materials.snacks).toBe(0);
	});

	test('rejects negative stored stock before removing material', () => {
		expect.assertions(1);

		expect(() =>
			removeCityInventoryMaterial(
				{
					cityId: 'industry-city',
					materials: { snacks: -4 }
				},
				'snacks',
				10
			)
		).toThrow(RangeError);
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

	test('uses placed warehouse buildings as city-local inventory capacity', () => {
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

		expect(getCityInventoryStats(game, 'industry-city').capacity).toBe(200);
		expect(getCityInventoryStats(result.game, 'industry-city').capacity).toBe(200);
		expect(result.game.industrialBuildings[0]?.status).toBe('idle');
	});

	test('scopes rail pushes to the producer city inventory when two industrial cities are open', () => {
		expect.assertions(5);
		const starter = createNewGame('convenience', 20260804);
		const opened = openWorldCity(
			{
				...starter,
				cash: 100_000,
				world: {
					...starter.world,
					revealedCityIds: [...starter.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		const cityA = 'industry-city';
		const cityB = 'breadbasket-basin';
		const rails = straightRails(4, 2, 11, 10);
		const building = (
			id: string,
			typeId: IndustrialBuilding['typeId'],
			cityId: string,
			mapX: number
		): IndustrialBuilding => ({
			id,
			level: 1,
			typeId,
			cityId,
			tileId: `${cityId}-${mapX}-2`,
			mapX,
			mapY: 2,
			status: 'idle',
			inventory: {},
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0
		});
		const result = simulateIndustryProduction({
			...opened,
			industryCities: opened.industryCities.map((city) =>
				city.id === cityA ? { ...city, rails } : city
			),
			industrialBuildings: [
				// Prefilled so the level-10 line's daily capacity, not the pump's
				// 40-unit output, bounds the push.
				{ ...building('city-a-pump', 'water-pump', cityA, 2), inventory: { water: 80 } },
				building('city-a-warehouse', 'warehouse', cityA, 10),
				building('city-b-warehouse', 'warehouse', cityB, 10)
			],
			cityInventories: opened.cityInventories.map((inventory) =>
				inventory.cityId === cityB ? { ...inventory, materials: { water: 3 } } : inventory
			)
		});

		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === cityA)?.materials.water
		).toBe(getRailCellDailyCapacity(10));
		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === cityB)?.materials.water
		).toBe(3);
		expect(result.report.railShipments).toContainEqual({
			cityId: cityA,
			fromId: 'city-a-pump',
			kind: 'push-warehouse',
			materialId: 'water',
			quantity: getRailCellDailyCapacity(10),
			toId: 'city-a-warehouse',
			value: getRailCellDailyCapacity(10)
		});
		expect(result.game.cityInventories).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					cityId: cityA,
					materials: { water: getRailCellDailyCapacity(10) }
				}),
				expect.objectContaining({
					cityId: cityB,
					materials: { water: 3 }
				})
			])
		);
		expect(result.report.cityInventories).toEqual([
			{
				cityId: cityA,
				capacity: 200,
				used: getRailCellDailyCapacity(10),
				overflowUnits: 0,
				overflowCost: 0
			},
			{
				cityId: cityB,
				capacity: 200,
				used: 3,
				overflowUnits: 0,
				overflowCost: 0
			}
		]);
	});

	test('charges only the overflowing city at production close after rail pushes', () => {
		expect.assertions(7);
		const starter = createNewGame('convenience', 20260805);
		const opened = openWorldCity(
			{
				...starter,
				cash: 100_000,
				world: {
					...starter.world,
					revealedCityIds: [...starter.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		const cityA = 'industry-city';
		const cityB = 'breadbasket-basin';
		const rails = straightRails(4, 2, 11, 10);
		const building = (
			id: string,
			typeId: IndustrialBuilding['typeId'],
			cityId: string,
			mapX: number
		): IndustrialBuilding => ({
			id,
			level: 1,
			typeId,
			cityId,
			tileId: `${cityId}-${mapX}-2`,
			mapX,
			mapY: 2,
			status: 'idle',
			inventory: {},
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0
		});
		const baseGame: GameState = {
			...opened,
			industryCities: opened.industryCities.map((city) =>
				city.id === cityA ? { ...city, rails } : city
			),
			industrialBuildings: [
				// Prefilled so the level-10 line's daily capacity, not the pump's
				// 40-unit output, bounds the push.
				{ ...building('city-a-pump', 'water-pump', cityA, 2), inventory: { water: 80 } },
				building('city-a-warehouse', 'warehouse', cityA, 10),
				building('city-b-warehouse', 'warehouse', cityB, 10)
			],
			cityInventories: opened.cityInventories.map((inventory) =>
				inventory.cityId === cityA
					? { ...inventory, materials: { water: 250 } }
					: inventory.cityId === cityB
						? { ...inventory, materials: { water: 3 } }
						: inventory
			)
		};
		const withinCapacity = simulateIndustryProduction({
			...baseGame,
			cityInventories: baseGame.cityInventories.map((inventory) =>
				inventory.cityId === cityA ? { ...inventory, materials: { water: 90 } } : inventory
			)
		});
		const overflowing = simulateIndustryProduction(baseGame);
		const overflowingPump = overflowing.game.industrialBuildings.find(
			(candidate) => candidate.id === 'city-a-pump'
		)!;
		const externalOverflow = 50;

		// City A's pool arrived over capacity (250 > 200), so the 50-unit
		// overflow is charged — but the capped surplus push adds nothing on
		// top, and its water stays in the producer buffer.
		expect(overflowing.report.cityInventories).toEqual([
			{
				cityId: cityA,
				capacity: 200,
				used: 250,
				overflowUnits: externalOverflow,
				overflowCost: externalOverflow * WAREHOUSE_OVERFLOW_COST_PER_UNIT
			},
			{
				cityId: cityB,
				capacity: 200,
				used: 3,
				overflowUnits: 0,
				overflowCost: 0
			}
		]);
		expect(
			overflowing.report.railShipments.filter((shipment) => shipment.kind === 'push-warehouse')
		).toHaveLength(0);
		expect(overflowingPump.inventory.water).toBe(120);
		expect(overflowing.report.overflowUnits).toBe(externalOverflow);
		expect(overflowing.report.overflowCost).toBe(
			externalOverflow * WAREHOUSE_OVERFLOW_COST_PER_UNIT
		);
		// withinCapacity ships 10 units into the free raw share (used 90 →
		// 100 at the finished-goods reserve boundary, still no overflow); the
		// only cash difference is the external overflow charge.
		expect(
			withinCapacity.report.railShipments.filter((shipment) => shipment.kind === 'push-warehouse')
		).toHaveLength(1);
		expect(overflowing.game.cash).toBe(
			withinCapacity.game.cash - externalOverflow * WAREHOUSE_OVERFLOW_COST_PER_UNIT
		);
	});

	test('raw producers buffer materials locally when they have no rail connection', () => {
		expect.assertions(4);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		game = buildOnResource(game, 'grain-field', 'grain-farm');

		const result = simulateIndustryProduction(game);

		// Without a rail link to a warehouse, output stays in the farm's own
		// buffer — the shared warehouse pool is untouched.
		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')
				?.materials.grain ?? 0
		).toBe(0);
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
		expect(
			game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')?.materials
				.flour
		).toBeUndefined();
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
		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')
				?.materials.grain ?? 0
		).toBe(0);
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

	test('rejects invalid building ownership before production normalizes capacity', () => {
		expect.assertions(1);
		const game = {
			...makeProductionGame(makeIndustryCity([]), [
				{
					...makeIndustryBuilding('orphaned-pump', 'water-pump', 2, 2),
					cityId: 'missing-city',
					tileId: 'missing-city-2-2'
				}
			]),
			cash: 1_000
		};

		expect(() => simulateIndustryProduction(game)).toThrow(/city ownership/i);
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
			const game: GameState = {
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

	test('getCityInventoryUsed treats null material quantities as zero', () => {
		expect.assertions(1);
		const inventory = {
			cityId: 'industry-city' as const,
			materials: { snacks: null as unknown as number }
		};

		expect(getCityInventoryUsed(inventory)).toBe(0);
	});
});

// Minimal fixtures for the buffer/rail-fed production model. They retain a
// valid world-city lifecycle so production can access the owning city
// inventory rather than falling back to the temporary legacy projection.
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
		cityId: 'industry-city',
		tileId: `industry-city-${mapX}-${mapY}`,
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
	return { id: 'industry-city', name: 'Industry City', width: 30, height: 30, tiles: [], rails };
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

function makeProductionGame(city: IndustryCity, buildings: IndustrialBuilding[]): GameState {
	const base = createNewGame('convenience', 20260804);

	return {
		...base,
		cash: 10_000,
		reports: [],
		industryCities: [city],
		activeIndustryCityId: city.id,
		industrialBuildings: buildings,
		cityInventories: [{ cityId: 'industry-city', materials: {} }]
	};
}

// farm (2,2) footprint (2..3, 2..3); mill (10,2) footprint (10..11, 2..3) —
// same layout as railShipping.spec.ts so the rail-pull bottlenecks (the
// level-scaled per-cell daily capacity) are already-proven behavior.
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
// the owning city inventory so the mill's input shortage is satisfied by a
// rail pull from that city's warehouse (exercising the fromWarehouse report branch).
const warehousePullGame: GameState = {
	...makeProductionGame(makeIndustryCity(straightRails(4, 2, 11)), [
		makeIndustryBuilding('mill', 'flour-mill', 2, 2),
		makeIndustryBuilding('wh1', 'warehouse', 10, 2)
	]),
	cityInventories: [
		{
			cityId: 'industry-city',
			materials: { grain: 50 }
		}
	]
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
		expect(
			game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')?.materials
				.grain ?? 0
		).toBeGreaterThan(0);
		// Guard the push-resurrect invariant: the re-read at the end of
		// simulateIndustryProduction must reflect the push phase draining a
		// level-1 line's daily capacity via rail. If the re-read regressed to
		// buildingUpdates (post-production, pre-push), the farm would show
		// 30 — double-counting the pushed units in both the farm buffer and
		// the warehouse pool.
		expect(farm.inventory.grain ?? 0).toBe(30 - getRailCellDailyCapacity(1));
	});

	test('a full warehouse keeps surplus in the producer buffer, stalling the producer on later days', () => {
		expect.assertions(9);
		// City pool exactly at capacity (200) so the rail push can ship
		// nothing; the farm's buffer fills, then stalls — surplus stays local
		// instead of creating incremental warehouse overflow.
		const fullPoolGame: GameState = {
			...makeProductionGame(makeIndustryCity(straightRails(4, 2, 11, 3)), [
				makeIndustryBuilding('farm', 'grain-farm', 2, 2, { grain: 140 }),
				makeIndustryBuilding('wh1', 'warehouse', 10, 2)
			]),
			cityInventories: [{ cityId: 'industry-city', materials: { grain: 200 } }]
		};

		const day1 = simulateIndustryProduction(fullPoolGame);
		const farm1 = day1.game.industrialBuildings.find((building) => building.id === 'farm')!;

		// 10 free buffer slots → 10 produced → 150; the push ships 0.
		expect(farm1.inventory.grain).toBe(150);
		expect(farm1.status).toBe('stalled');
		expect(
			day1.report.railShipments.filter((shipment) => shipment.kind === 'push-warehouse')
		).toHaveLength(0);
		expect(day1.game.cityInventories[0]!.materials.grain).toBe(200);
		expect(day1.report.overflowUnits).toBe(0);

		const day2 = simulateIndustryProduction(day1.game);
		const farm2 = day2.game.industrialBuildings.find((building) => building.id === 'farm')!;

		// Backpressure persists next day: no production, no push, no overflow.
		expect(farm2.inventory.grain).toBe(150);
		expect(farm2.status).toBe('stalled');
		expect(day2.game.cityInventories[0]!.materials.grain).toBe(200);
		expect(day2.report.overflowUnits).toBe(0);
	});

	test('finished goods claim scarce warehouse space before raw surplus pushes', () => {
		expect.assertions(6);
		// 5 free pool units shared by a final-stage pantry-works and a raw
		// grain-farm on one rail line. The push phase runs final → raw, so the
		// retail-bound pantry lands in the pool and the farm's surplus stays
		// buffered instead of crowding it out.
		const contestedPoolGame: GameState = {
			...makeProductionGame(makeIndustryCity(straightRails(4, 2, 11, 10)), [
				makeIndustryBuilding('farm', 'grain-farm', 2, 2),
				makeIndustryBuilding('pantry', 'pantry-works', 6, 2, { flour: 10 }),
				makeIndustryBuilding('wh1', 'warehouse', 10, 2)
			]),
			cityInventories: [{ cityId: 'industry-city', materials: { grain: 190, pantry: 5 } }]
		};

		const { game, report } = simulateIndustryProduction(contestedPoolGame);
		const pushes = report.railShipments.filter((shipment) => shipment.kind === 'push-warehouse');
		const materials = game.cityInventories[0]!.materials;
		const farm = game.industrialBuildings.find((building) => building.id === 'farm')!;
		const pantry = game.industrialBuildings.find((building) => building.id === 'pantry')!;

		expect(pushes).toHaveLength(1);
		expect(pushes[0]).toMatchObject({ fromId: 'pantry', materialId: 'pantry', quantity: 5 });
		expect(materials.pantry).toBe(10);
		expect(materials.grain).toBe(190);
		expect(farm.inventory.grain).toBe(30);
		expect(pantry.inventory.pantry).toBe(3);
	});

	test('a raw-full pool drains through downstream pulls so finished goods recover space', () => {
		expect.assertions(13);
		// Ordinary construction order: pump + warehouse alone fill the
		// 200-unit pool with raw water; the bottler is connected only
		// afterwards. The finished-goods reserve caps further raw pushes at
		// the 100-unit share, but this pool is already saturated, so recovery
		// falls to the full-pool pull preference: while the pool is full the
		// bottler drains pooled water (cells 11–18 on the level-1 line, which
		// leaves no budget for its push that day); once a pull frees space,
		// the next tick pulls from the nearer pump buffer (cells 3–10) and
		// the bottled-water push claims the freed room. The pool rotates to
		// finished goods at ~5 units/day per direction instead of staying
		// stranded.
		const strandedPoolGame: GameState = {
			...makeProductionGame(makeIndustryCity(straightRails(4, 2, 19, 1)), [
				makeIndustryBuilding('pump', 'water-pump', 2, 2, { water: 200 }),
				makeIndustryBuilding('bottler', 'water-bottler', 10, 2),
				makeIndustryBuilding('wh1', 'warehouse', 18, 2)
			]),
			cityInventories: [{ cityId: 'industry-city', materials: { water: 200 } }]
		};

		const day1 = simulateIndustryProduction(strandedPoolGame);
		const materials1 = day1.game.cityInventories[0]!.materials;
		const day1Pushes = day1.report.railShipments.filter(
			(shipment) => shipment.kind === 'push-warehouse'
		);
		const pump1 = day1.game.industrialBuildings.find((building) => building.id === 'pump')!;
		const bottler1 = day1.game.industrialBuildings.find((building) => building.id === 'bottler')!;

		// Pool full → the pull drains pooled water; its 10 units consume the
		// whole level-1 budget on cells 11–18, so the push ships nothing yet.
		expect(day1.report.railShipments[0]).toMatchObject({
			kind: 'pull-warehouse',
			fromId: 'wh1',
			toId: 'bottler',
			materialId: 'water',
			quantity: 10
		});
		expect(day1Pushes).toHaveLength(0);
		expect(materials1.water).toBe(190);
		expect(materials1['bottled-water']).toBeUndefined();
		expect(pump1.inventory.water).toBe(200);
		expect(bottler1.status).toBe('produced');

		// Day 2: below capacity again → the nearer pump wins the pull
		// (disjoint cells 3–10), and the freed pool room takes the full
		// 10-unit bottled-water push down cells 11–18.
		const day2 = simulateIndustryProduction(day1.game);
		expect(day2.report.railShipments.map((s) => [s.kind, s.materialId, s.quantity])).toEqual([
			['pull-producer', 'water', 10],
			['push-warehouse', 'bottled-water', 10]
		]);
		expect(day2.game.cityInventories[0]!.materials).toEqual({
			water: 190,
			'bottled-water': 10
		});

		// The alternation continues — a full pool pulls from the warehouse,
		// a freed pool pulls from the pump and pushes — until the pooled
		// water is gone and the pool is all finished goods.
		let game = day2.game;
		for (let day = 3; day <= 40; day += 1) {
			game = simulateIndustryProduction(game).game;
		}
		expect(game.cityInventories[0]!.materials).toEqual({ water: 0, 'bottled-water': 200 });

		// With no pooled water left, the pull falls back to the pump buffer —
		// the pool is now all finished goods, so the bottler's push waits on
		// retail instead of being permanently starved by raw stock.
		const day41 = simulateIndustryProduction(game);
		const day41Pulls = day41.report.railShipments.filter(
			(shipment) => shipment.kind === 'pull-producer'
		);
		const pump41 = day41.game.industrialBuildings.find((building) => building.id === 'pump')!;
		const bottler41 = day41.game.industrialBuildings.find((building) => building.id === 'bottler')!;

		expect(day41Pulls).toEqual([
			expect.objectContaining({ fromId: 'pump', materialId: 'water', quantity: 10 })
		]);
		expect(day41.report.railShipments.some((s) => s.kind === 'push-warehouse')).toBe(false);
		expect(pump41.inventory.water).toBe(190);
		expect(bottler41.inventory['bottled-water']).toBe(100);
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
		// The pool was drained by the pulled quantity (the mill's 10-grain
		// recipe need, within the level-1 line's daily capacity).
		expect(
			game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')?.materials
				.grain ?? 0
		).toBeLessThan(50);
	});

	test('resolves inputs from own buffer, warehouse, same-city producer, then import in order', () => {
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
			const game: GameState = {
				// Level-1 line so the earlier warehouse pull (3 units on the shared
				// 11,4..18,4 cells) clips the mill's flour push to the remaining
				// daily capacity — the shared pull/push budget-contention guard.
				...makeProductionGame(makeIndustryCity(straightRails(4, 2, 19, 1)), [
					makeIndustryBuilding('source', fakeTypeId, 2, 2, { grain: 3 }),
					makeIndustryBuilding('mill', 'flour-mill', 10, 2, { grain: 2 }),
					makeIndustryBuilding('warehouse', 'warehouse', 18, 2)
				]),
				cityInventories: [
					{
						cityId: 'industry-city',
						materials: { grain: 3 }
					}
				]
			};

			const { report } = simulateIndustryProduction(game);

			expect(
				report.consumed
					.filter((movement) => movement.materialId === 'grain')
					.map((movement) => ({ source: movement.source, quantity: movement.quantity }))
				// Consumed buckets stay grouped rail-then-warehouse — the report
				// summarizes the pull's two source kinds, while railShipments
				// below pins the actual nearest-source pull order.
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
					// Shared budget: the pull-warehouse above consumed 3 units on
					// the same cells, so only the remaining capacity ships.
					quantity: getRailCellDailyCapacity(1) - 3
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

		// Level-3 line y=4 x=2..11 between farm (2,2) and mill (10,2). The pull
		// ships the mill's full daily grain recipe need along the
		// attach-connected path; assert the full deterministic usage map for
		// this fixture.
		const grainNeed = PRODUCTION_RECIPES['flour-milling'].inputs.find(
			(input) => input.materialId === 'grain'
		)!.quantity;
		expect(report.railUsage).toEqual({
			'industry-city:3,4': grainNeed,
			'industry-city:4,4': grainNeed,
			'industry-city:5,4': grainNeed,
			'industry-city:6,4': grainNeed,
			'industry-city:7,4': grainNeed,
			'industry-city:8,4': grainNeed,
			'industry-city:9,4': grainNeed,
			'industry-city:10,4': grainNeed
		});
	});

	test('same input state twice produces identical reports (determinism)', () => {
		expect.assertions(2);
		const first = simulateIndustryProduction(railGame);
		const second = simulateIndustryProduction(railGame);

		expect(first.report).toEqual(second.report);
		expect(first.game.cityInventories).toEqual(second.game.cityInventories);
	});

	test('marks a building as blocked when its city inventory is missing', () => {
		expect.assertions(2);
		let game = { ...createNewGame('convenience', 280_010), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'snack-factory'
		});
		const gameWithoutInventory = { ...game, cityInventories: [] };

		const result = simulateIndustryProduction(gameWithoutInventory);
		const building = result.game.industrialBuildings.find((b) => b.typeId === 'snack-factory')!;

		expect(building.status).toBe('blocked');
		expect(building.blockedDays).toBeGreaterThan(0);
	});
});
