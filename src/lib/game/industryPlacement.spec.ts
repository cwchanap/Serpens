import { describe, expect, test } from 'vitest';
import { getIndustryTilesByResource } from './industry';
import {
	buildIndustrialBuilding,
	getAllowedIndustrialBuildingTypes,
	getIndustrialPlacementBlockReason
} from './industryPlacement';
import { createNewGame } from './state';

describe('industrial placement', () => {
	test('allows raw buildings only on matching resource tiles', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const saltTile = getIndustryTilesByResource(city, 'salt-deposit')[0]!;

		expect(getIndustrialPlacementBlockReason(game, grainTile.id, 'grain-farm')).toBeNull();
		expect(getIndustrialPlacementBlockReason(game, saltTile.id, 'grain-farm')).toBe(
			'Requires grain field'
		);
		expect(getAllowedIndustrialBuildingTypes(game, grainTile.id).map((type) => type.id)).toContain(
			'grain-farm'
		);
	});

	test('builds an industrial building immutably and charges cash', () => {
		expect.assertions(7);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const result = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(result).not.toBe(game);
		expect(result.industrialBuildings).toHaveLength(1);
		expect(result.industrialBuildings[0]?.typeId).toBe('grain-farm');
		expect(result.industrialBuildings[0]?.tileId).toBe(grainTile.id);
		expect(result.industrialBuildings[0]?.mapX).toBe(grainTile.x);
		expect(result.cash).toBeLessThan(game.cash);
		expect(game.industrialBuildings).toHaveLength(0);
	});

	test('rejects occupied tiles and insufficient cash with decisions', () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 0 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const blocked = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(blocked.industrialBuildings).toHaveLength(0);
		expect(blocked.decisions.at(-1)?.title).toBe('Industrial construction delayed');
		expect(blocked.decisions.at(-1)?.context).toContain('requires');
	});

	test('blocks occupied industrial tiles after construction', () => {
		expect.assertions(4);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const built = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const blocked = buildIndustrialBuilding(built, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(getIndustrialPlacementBlockReason(built, grainTile.id, 'grain-farm')).toBe(
			'Occupied industrial tile'
		);
		expect(blocked.industrialBuildings).toHaveLength(1);
		expect(blocked.decisions.at(-1)?.title).toBe('Industrial construction delayed');
		expect(blocked.decisions.at(-1)?.context).toContain('Occupied industrial tile');
	});
});
