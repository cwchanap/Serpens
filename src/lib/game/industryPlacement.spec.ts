import { describe, expect, test } from 'vitest';
import { getIndustryTilesByResource } from './industry';
import {
	buildIndustrialBuilding,
	getAllowedIndustrialBuildingTypes,
	getIndustrialPlacementBlockReason,
	upgradeBuilding
} from './industryPlacement';
import { getBuildingUpgradeCost, MAX_BUILDING_LEVEL } from './leveling';
import { createNewGame } from './state';
import type { IndustrialBuildingTypeId } from './types';

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

	test('rejects insufficient cash with a construction decision', () => {
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

	test('blocks locked industrial tiles before resource checks', () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const lockedTile = city.tiles.find((tile) => tile.locked)!;
		const blocked = buildIndustrialBuilding(game, {
			tileId: lockedTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(getIndustrialPlacementBlockReason(game, lockedTile.id, 'grain-farm')).toBe(
			'Locked industrial tile'
		);
		expect(blocked.industrialBuildings).toHaveLength(0);
		expect(blocked.decisions.at(-1)?.context).toContain('Locked industrial tile');
	});

	test('keeps different same-day construction failures as separate decisions', () => {
		expect.assertions(4);
		const game = { ...createNewGame('convenience', 20260512), cash: 0 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const saltTile = getIndustryTilesByResource(city, 'salt-deposit')[0]!;
		const cashBlocked = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const resourceBlocked = buildIndustrialBuilding(cashBlocked, {
			tileId: saltTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(resourceBlocked.industrialBuildings).toHaveLength(0);
		expect(resourceBlocked.decisions).toHaveLength(2);
		expect(new Set(resourceBlocked.decisions.map((decision) => decision.id)).size).toBe(2);
		expect(resourceBlocked.decisions.map((decision) => decision.context)).toEqual([
			'Grain Farm requires 600 cash.',
			'Requires grain field'
		]);
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

	test('upgradeBuilding deducts cost and increments level', () => {
		expect.assertions(2);
		const base = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const buildingId = game.industrialBuildings[0]!.id;
		const cashBefore = game.cash;

		const next = upgradeBuilding(game, buildingId);

		expect(next.industrialBuildings[0]!.level).toBe(2);
		expect(next.cash).toBe(cashBefore - getBuildingUpgradeCost(1));
	});

	test('upgradeBuilding is a no-op when cash is insufficient', () => {
		expect.assertions(1);
		const base = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const broke = { ...game, cash: 0 };

		expect(upgradeBuilding(broke, game.industrialBuildings[0]!.id)).toBe(broke);
	});

	test('upgradeBuilding is a no-op for warehouse buildings (no recipe)', () => {
		expect.assertions(1);
		const base = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const buildingId = game.industrialBuildings[0]!.id;
		const clone = {
			...game,
			industrialBuildings: game.industrialBuildings.map((building) =>
				building.id === buildingId ? { ...building, typeId: 'warehouse' as const } : building
			)
		};

		expect(upgradeBuilding(clone, buildingId)).toBe(clone);
	});

	test('upgradeBuilding is a no-op at max level', () => {
		expect.assertions(1);
		const base = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const maxed = {
			...game,
			industrialBuildings: game.industrialBuildings.map((building) => ({
				...building,
				level: MAX_BUILDING_LEVEL
			}))
		};

		expect(upgradeBuilding(maxed, maxed.industrialBuildings[0]!.id)).toBe(maxed);
	});

	test('upgradeBuilding is a no-op when the building id does not exist', () => {
		expect.assertions(1);
		const base = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(upgradeBuilding(game, 'building-does-not-exist')).toBe(game);
	});

	test('upgradeBuilding is a no-op when the building typeId is unknown', () => {
		expect.assertions(1);
		const base = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const clone = {
			...game,
			industrialBuildings: game.industrialBuildings.map((building) =>
				building.id === game.industrialBuildings[0]!.id
					? { ...building, typeId: 'missing-type' as IndustrialBuildingTypeId }
					: building
			)
		};

		expect(upgradeBuilding(clone, game.industrialBuildings[0]!.id)).toBe(clone);
	});
});
