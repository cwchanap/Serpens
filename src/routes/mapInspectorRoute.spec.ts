import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import {
	buildIndustrialBuilding,
	getIndustrialPlacementBlockReason
} from '$lib/game/industryPlacement';
import { buildRailNetwork, deriveRailSegments } from '$lib/game/rail';
import {
	selectRetailInspector,
	selectIndustryInspector,
	selectInspectorRailSegments
} from './mapInspectorRoute';

const game = createNewGame('convenience', 1);
const city = game.cities[0]!;
const store = game.stores[0]!;

// Wrong city filtering or anchor-only matching would show the wrong inspector
// when a non-anchor cell is selected or cities share footprint coordinates.
describe('retail inspector selection', () => {
	it('finds a store on any cell of its footprint in the active city', () => {
		const tile = city.tiles.find((tile) => tile.x === store.mapX + 1 && tile.y === store.mapY + 1)!;
		const otherStore = { ...store, id: 'wrong-city', cityId: 'campus-junction' };
		expect(selectRetailInspector({ ...game, stores: [otherStore, store] }, city, tile.id)).toEqual({
			selectedTile: tile,
			selectedStore: store
		});
	});
	it('keeps tile inspection available without a game or a store', () => {
		expect(selectRetailInspector(null, city, store.tileId)).toMatchObject({
			selectedTile: { id: store.tileId },
			selectedStore: null
		});
		const emptyTile = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		expect(selectRetailInspector(game, city, emptyTile.id)).toEqual({
			selectedTile: emptyTile,
			selectedStore: null
		});
	});
	it.each([null, 'deleted-tile'])('returns no selection for %s', (tileId) => {
		expect(selectRetailInspector(game, city, tileId)).toEqual({
			selectedTile: null,
			selectedStore: null
		});
	});
});

describe('industry inspector selection', () => {
	const industryCity = game.industryCities[0]!;
	const anchor = industryCity.tiles.find(
		(tile) => getIndustrialPlacementBlockReason(game, tile.id, 'warehouse') === null
	)!;
	const built = buildIndustrialBuilding(
		{ ...game, cash: 100000 },
		{ tileId: anchor.id, buildingTypeId: 'warehouse' }
	);
	const building = built.industrialBuildings[0]!;
	it('matches non-anchor footprint cells in this city, not a building from another city', () => {
		const tile = industryCity.tiles.find(
			(tile) => tile.x === building.mapX + 1 && tile.y === building.mapY + 1
		)!;
		const other = { ...building, id: 'wrong-city', cityId: 'breadbasket-basin' };
		expect(
			selectIndustryInspector(
				{ ...built, industrialBuildings: [other, building] },
				industryCity,
				tile.id
			)
		).toEqual({ selectedIndustryTile: tile, selectedIndustryBuilding: building });
	});
	it('supports pre-game tile inspection, missing selection and non-building tiles', () => {
		expect(selectIndustryInspector(null, industryCity, anchor.id)).toEqual({
			selectedIndustryTile: anchor,
			selectedIndustryBuilding: null
		});
		expect(selectIndustryInspector(built, industryCity, null)).toEqual({
			selectedIndustryTile: null,
			selectedIndustryBuilding: null
		});
		expect(selectIndustryInspector(built, industryCity, 'deleted')).toEqual({
			selectedIndustryTile: null,
			selectedIndustryBuilding: null
		});
		const tile = industryCity.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		expect(
			selectIndustryInspector(built, industryCity, tile.id).selectedIndustryBuilding
		).toBeNull();
	});
});

describe('rail inspector selection', () => {
	const base = game.industryCities[0]!;
	const city = {
		...base,
		rails: [
			{ x: 5, y: 4, level: 1 },
			{ x: 5, y: 5, level: 1 },
			{ x: 6, y: 5, level: 1 },
			{ x: 5, y: 6, level: 1 }
		]
	};
	const segments = deriveRailSegments(buildRailNetwork(city), []);
	const junction = city.tiles.find((tile) => tile.x === 5 && tile.y === 5)!;
	const getSegments = () => segments;
	it('returns all segments at a junction from the precomputed network', () => {
		const selected = selectInspectorRailSegments(city, junction.id, false, getSegments);
		expect(selected).toHaveLength(3);
		expect(selected?.every((segment) => segments.includes(segment))).toBe(true);
	});
	it('suppresses rail selection during building and on missing/non-rail tiles', () => {
		expect(selectInspectorRailSegments(city, junction.id, true, getSegments)).toBeNull();
		expect(selectInspectorRailSegments(city, null, false, getSegments)).toBeNull();
		expect(selectInspectorRailSegments(city, 'deleted', false, getSegments)).toBeNull();
		const empty = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		expect(selectInspectorRailSegments(city, empty.id, false, getSegments)).toBeNull();
	});
	it('does not read the rail network dependency when no valid cell is being inspected', () => {
		const unread = () => {
			throw new Error('Unneeded rail-network read');
		};
		expect(selectInspectorRailSegments(city, junction.id, true, unread)).toBeNull();
		expect(selectInspectorRailSegments(city, null, false, unread)).toBeNull();
		expect(selectInspectorRailSegments(city, 'deleted', false, unread)).toBeNull();
	});
});
