import { describe, expect, it } from 'vitest';
import {
	createRailTickState as createCityRailTickState,
	pullViaRail,
	pushSurplusViaRail,
	type RailTickState
} from './railShipping';
import { createNewGame } from './state';
import type {
	GameState,
	CityInventory,
	IndustrialBuilding,
	IndustryCity,
	MaterialId,
	RailCell
} from './types';

function makeBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	mapX: number,
	mapY: number,
	inventory: Partial<Record<MaterialId, number>> = {}
): IndustrialBuilding {
	return {
		id,
		level: 1,
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

function makeCity(rails: RailCell[]): IndustryCity {
	return { id: 'industry-city', name: 'Rail City', width: 20, height: 20, tiles: [], rails };
}

function line(level = 1): RailCell[] {
	return Array.from({ length: 10 }, (_, index) => ({ x: index + 2, y: 4, level }));
}

function makeGame(buildings: IndustrialBuilding[], rails = line()): GameState {
	const base = createNewGame('convenience', 20260804);

	return {
		...base,
		cash: 100_000,
		industryCities: [makeCity(rails)],
		industrialBuildings: buildings,
		cityInventories: [{ cityId: 'industry-city', materials: {} }]
	};
}

function createRailTickState(
	game: GameState,
	cityInventory: CityInventory = game.cityInventories[0]!
): RailTickState {
	return createCityRailTickState({
		...game,
		cityInventories: [
			{
				...cityInventory,
				cityId: 'industry-city',
				materials: { ...cityInventory.materials }
			}
		]
	});
}

describe('rail shipping remaining branch coverage', () => {
	it('keeps equal building ids stable in the pre-sorted tick index', () => {
		const first = makeBuilding('duplicate', 'grain-farm', 2, 2);
		const second = makeBuilding('duplicate', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame([first, second]), makeGame([]).cityInventories[0]!);

		expect(state.sortedBuildings).toHaveLength(2);
		expect(state.sortedBuildings.map(([, building]) => building.typeId)).toEqual([
			'grain-farm',
			'flour-mill'
		]);
	});

	it('ignores an unknown producer type even when it has matching stock', () => {
		const unknown = makeBuilding('unknown', 'grain-farm', 2, 2, { grain: 5 });
		unknown.typeId = 'unknown-type' as IndustrialBuilding['typeId'];
		const mill = makeBuilding('mill', 'flour-mill', 10, 2);
		const game = makeGame([unknown, mill]);
		const state = createRailTickState(game, game.cityInventories[0]!);

		expect(pullViaRail(state, mill, 'grain', 2)).toEqual({
			fromProducers: 0,
			fromWarehouse: 0
		});
		expect(state.inventories.get(unknown.id)?.grain).toBe(5);
	});

	it('treats negative warehouse stock as unavailable', () => {
		const warehouse = makeBuilding('warehouse', 'warehouse', 2, 2);
		const mill = makeBuilding('mill', 'flour-mill', 10, 2);
		const game = makeGame([warehouse, mill]);
		const state = createRailTickState(game, {
			...game.cityInventories[0]!,
			materials: { grain: -5 }
		});

		expect(pullViaRail(state, mill, 'grain', 1)).toEqual({
			fromProducers: 0,
			fromWarehouse: 0
		});
		expect(state.shipments).toHaveLength(0);
	});

	it('checks recipe outputs but skips the push loop when output stock is absent', () => {
		const farm = makeBuilding('farm', 'grain-farm', 2, 2);
		const warehouse = makeBuilding('warehouse', 'warehouse', 10, 2);
		const game = makeGame([farm, warehouse]);
		const state = createRailTickState(game, game.cityInventories[0]!);

		pushSurplusViaRail(state, farm);

		expect(state.shipments).toHaveLength(0);
		expect(state.inventories.get(farm.id)).toEqual({});
	});

	it('does not push inventory from an unknown recipe-less producer type', () => {
		const unknown = makeBuilding('unknown', 'grain-farm', 2, 2, { grain: 3 });
		unknown.typeId = 'unknown-type' as IndustrialBuilding['typeId'];
		const warehouse = makeBuilding('warehouse', 'warehouse', 10, 2);
		const game = makeGame([unknown, warehouse]);
		const state = createRailTickState(game, game.cityInventories[0]!);

		pushSurplusViaRail(state, unknown);

		expect(state.shipments).toHaveLength(0);
		expect(state.inventories.get(unknown.id)?.grain).toBe(3);
	});
});
