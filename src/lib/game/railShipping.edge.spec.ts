import { describe, expect, it } from 'vitest';
import {
	createRailTickState as createCityRailTickState,
	pullViaRail,
	pushSurplusViaRail,
	type RailTickState
} from './railShipping';
import { createNewGame } from './state';
import { openWorldCity } from './world';
import type {
	GameState,
	IndustrialBuilding,
	IndustryCity,
	MaterialId,
	RailCell,
	WarehouseInventory
} from './types';

function makeBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	mapX: number,
	mapY: number,
	inventory: Partial<Record<MaterialId, number>> = {},
	cityId = 'industry-city'
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId,
		tileId: `${cityId}-${mapX}-${mapY}`,
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

function makeCity(id: string, rails: RailCell[]): IndustryCity {
	return { id, name: id, width: 30, height: 30, tiles: [], rails };
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

function makeWarehouse(materials: WarehouseInventory['materials'] = {}): WarehouseInventory {
	return { capacity: 500, materials, overflowUnits: 0, overflowCost: 0 };
}

function makeGame(cities: IndustryCity[], buildings: IndustrialBuilding[]): GameState {
	const base = createNewGame('convenience', 20260804);

	return {
		...base,
		cash: 100_000,
		industryCities: cities,
		industrialBuildings: buildings,
		warehouse: makeWarehouse()
	};
}

function createRailTickState(
	game: GameState,
	warehouse: WarehouseInventory = game.warehouse
): RailTickState & { readonly warehouse: WarehouseInventory } {
	const state = createCityRailTickState({
		...game,
		cityInventories: [
			{
				cityId: 'industry-city',
				...warehouse,
				materials: { ...warehouse.materials }
			}
		]
	});

	return Object.defineProperty(state, 'warehouse', {
		get: () => state.cityInventoriesByCityId.get('industry-city')!
	}) as RailTickState & { readonly warehouse: WarehouseInventory };
}

const LINE = straightRails(4, 2, 11);

describe('rail shipping edge cases', () => {
	it('sorts reversed building input deterministically', () => {
		const later = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const earlier = makeBuilding('industry-building-1', 'grain-farm', 2, 2);
		const state = createRailTickState(
			makeGame([makeCity('industry-city', LINE)], [later, earlier]),
			makeWarehouse()
		);

		expect(state.sortedBuildings.map(([id]) => id)).toEqual([
			'industry-building-1',
			'industry-building-2'
		]);
	});

	it('does not enter the pull loop for a non-positive request', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(
			makeGame([makeCity('industry-city', LINE)], [farm, mill]),
			makeWarehouse()
		);

		expect(pullViaRail(state, mill, 'grain', -3)).toEqual({
			fromProducers: 0,
			fromWarehouse: 0
		});
		expect(state.inventories.get(farm.id)?.grain).toBe(5);
		expect(state.shipments).toHaveLength(0);
	});

	it('returns zero when the consumer city is absent from the rail tick state', () => {
		const consumer = makeBuilding('industry-building-1', 'flour-mill', 10, 2, {}, 'missing-city');
		const state = createRailTickState(
			makeGame([makeCity('industry-city', LINE)], [consumer]),
			makeWarehouse({ grain: 10 })
		);

		expect(pullViaRail(state, consumer, 'grain', 1)).toEqual({
			fromProducers: 0,
			fromWarehouse: 0
		});
		expect(state.shipments).toHaveLength(0);
	});

	it('draws same-city warehouse pulls from the owning city inventory', () => {
		const warehouse = makeBuilding('industry-building-1', 'warehouse', 2, 2);
		const consumer = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(
			makeGame([makeCity('industry-city', straightRails(4, 2, 11, 3))], [warehouse, consumer]),
			makeWarehouse({ grain: 3 })
		);

		expect(pullViaRail(state, consumer, 'grain', 3)).toEqual({
			fromProducers: 0,
			fromWarehouse: 3
		});
		expect(state.warehouse.materials.grain).toBe(0);
		expect(state.shipments).toEqual([
			{
				cityId: 'industry-city',
				materialId: 'grain',
				quantity: 3,
				value: 3,
				kind: 'pull-warehouse',
				fromId: 'industry-building-1',
				toId: 'industry-building-2'
			}
		]);
	});

	it('keeps producer buffers and warehouse stock isolated between open industry cities', () => {
		expect.assertions(6);
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
		const rails = straightRails(4, 2, 11, 3);
		const withOpenCities = (buildings: IndustrialBuilding[]): GameState => ({
			...opened,
			industryCities: opened.industryCities.map((city) => ({ ...city, rails })),
			industrialBuildings: buildings,
			cityInventories: opened.cityInventories?.map((inventory) =>
				inventory.cityId === cityB
					? { ...inventory, materials: { grain: 7 } }
					: { ...inventory, materials: {} }
			)
		});

		const aConsumer = makeBuilding('a-mill', 'flour-mill', 10, 2, {}, cityA);
		const remoteProducer = makeBuilding('b-farm', 'grain-farm', 2, 2, { grain: 20 }, cityB);
		const pullState = createCityRailTickState(
			withOpenCities([
				makeBuilding('a-warehouse', 'warehouse', 2, 2, {}, cityA),
				aConsumer,
				remoteProducer,
				makeBuilding('b-warehouse', 'warehouse', 10, 2, {}, cityB)
			])
		);

		expect(pullViaRail(pullState, aConsumer, 'grain', 3)).toEqual({
			fromProducers: 0,
			fromWarehouse: 0
		});
		expect(pullState.inventories.get(remoteProducer.id)?.grain).toBe(20);
		expect(pullState.cityInventoriesByCityId.get(cityB)?.materials.grain).toBe(7);

		const localProducer = makeBuilding('a-farm', 'grain-farm', 2, 2, { grain: 3 }, cityA);
		const pushState = createCityRailTickState(
			withOpenCities([
				localProducer,
				makeBuilding('a-warehouse', 'warehouse', 10, 2, {}, cityA),
				makeBuilding('b-warehouse', 'warehouse', 10, 2, {}, cityB)
			])
		);

		pushSurplusViaRail(pushState, localProducer);

		expect(pushState.cityInventoriesByCityId.get(cityA)?.materials.grain).toBe(3);
		expect(pushState.cityInventoriesByCityId.get(cityB)?.materials.grain).toBe(7);
		expect(pushState.shipments).toEqual([
			{
				cityId: cityA,
				materialId: 'grain',
				quantity: 3,
				value: 3,
				kind: 'push-warehouse',
				fromId: 'a-farm',
				toId: 'a-warehouse'
			}
		]);
	});

	it('ignores remote-city sources and local sources with no usable stock', () => {
		const localFarm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: -4 });
		const localWarehouse = makeBuilding('industry-building-2', 'warehouse', 6, 2);
		const consumer = makeBuilding('industry-building-3', 'flour-mill', 10, 2);
		const remoteFarm = makeBuilding(
			'industry-building-4',
			'grain-farm',
			2,
			2,
			{ grain: 20 },
			'other-city'
		);
		const state = createRailTickState(
			makeGame(
				[makeCity('industry-city', LINE), makeCity('other-city', straightRails(4, 2, 3))],
				[localFarm, localWarehouse, consumer, remoteFarm]
			),
			makeWarehouse({ grain: 0 })
		);

		expect(pullViaRail(state, consumer, 'grain', 2)).toEqual({
			fromProducers: 0,
			fromWarehouse: 0
		});
		expect(state.inventories.get(remoteFarm.id)?.grain).toBe(20);
		expect(state.shipments).toHaveLength(0);
	});

	it('does not push when the producer city is absent from the rail tick state', () => {
		const producer = makeBuilding(
			'industry-building-1',
			'grain-farm',
			2,
			2,
			{ grain: 3 },
			'missing-city'
		);
		const state = createRailTickState(
			makeGame([makeCity('industry-city', LINE)], [producer]),
			makeWarehouse()
		);

		pushSurplusViaRail(state, producer);

		expect(state.inventories.get(producer.id)?.grain).toBe(3);
		expect(state.shipments).toHaveLength(0);
	});

	it('does not treat a recipe-less warehouse inventory as producer output', () => {
		const warehouse = makeBuilding('industry-building-1', 'warehouse', 2, 2, { grain: 3 });
		const state = createRailTickState(
			makeGame([makeCity('industry-city', LINE)], [warehouse]),
			makeWarehouse()
		);

		pushSurplusViaRail(state, warehouse);

		expect(state.inventories.get(warehouse.id)).toEqual({ grain: 3 });
		expect(state.shipments).toHaveLength(0);
	});

	it('exits the push loop normally after fully draining an output', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 1 });
		const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const state = createRailTickState(
			makeGame([makeCity('industry-city', LINE)], [farm, warehouse]),
			makeWarehouse()
		);

		pushSurplusViaRail(state, farm);

		expect(state.inventories.get(farm.id)?.grain).toBe(0);
		expect(state.warehouse.materials.grain).toBe(1);
		expect(state.shipments).toHaveLength(1);
	});
});
