import { describe, expect, test } from 'vitest';
import { getIndustryTileById, getIndustryTilesByResource } from './industry';
import {
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialOccupiedTile,
	decisionContextIndustrialRequiresCash,
	decisionContextIndustrialRequiresIndustrialTile,
	decisionContextIndustrialRequiresResource,
	decisionContextIndustrialUnknownBuilding,
	decisionContextIndustrialUnknownTile
} from './decisionContext';
import { createIndustryTileLookup } from './industryFootprint';
import {
	buildIndustrialBuilding,
	createIndustrialPlacementContext,
	getAllowedIndustrialBuildingTypes,
	getIndustrialPlacementBlockReason,
	getIndustrialPlacementBlockReasonWithContext,
	upgradeBuilding
} from './industryPlacement';
import { getBuildingUpgradeCost, MAX_BUILDING_LEVEL } from './leveling';
import { createNewGame } from './state';
import type { IndustrialBuildingTypeId, IndustryCity, IndustryTile } from './types';

describe('industrial placement', () => {
	test('allows raw buildings only on matching resource tiles', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const saltTile = getIndustryTilesByResource(city, 'salt-deposit')[0]!;

		expect(getIndustrialPlacementBlockReason(game, grainTile.id, 'grain-farm')).toBeNull();
		expect(getIndustrialPlacementBlockReason(game, saltTile.id, 'grain-farm')).toEqual(
			decisionContextIndustrialRequiresResource('grain-field')
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
		expect(blocked.decisions.at(-1)?.context).toEqual(
			decisionContextIndustrialRequiresCash('grain-farm', 600)
		);
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

		expect(getIndustrialPlacementBlockReason(game, lockedTile.id, 'grain-farm')).toEqual(
			decisionContextIndustrialLockedTile()
		);
		expect(blocked.industrialBuildings).toHaveLength(0);
		expect(blocked.decisions.at(-1)?.context).toEqual(decisionContextIndustrialLockedTile());
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
			decisionContextIndustrialRequiresCash('grain-farm', 600),
			decisionContextIndustrialRequiresResource('grain-field')
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

		expect(getIndustrialPlacementBlockReason(built, grainTile.id, 'grain-farm')).toEqual(
			decisionContextIndustrialOccupiedTile()
		);
		expect(blocked.industrialBuildings).toHaveLength(1);
		expect(blocked.decisions.at(-1)?.title).toBe('Industrial construction delayed');
		expect(blocked.decisions.at(-1)?.context).toEqual(decisionContextIndustrialOccupiedTile());
	});

	test('blocks placement when a 2x2 footprint overlaps an existing industrial building', () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const overlappingAnchor = getIndustryTileById(
			city,
			`${city.id}-${grainTile.x + 1}-${grainTile.y}`
		)!;
		const built = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(overlappingAnchor.id).not.toBe(grainTile.id);
		expect(getIndustrialPlacementBlockReason(built, overlappingAnchor.id, 'warehouse')).toEqual(
			decisionContextIndustrialOccupiedTile()
		);
		expect(
			buildIndustrialBuilding(built, {
				tileId: overlappingAnchor.id,
				buildingTypeId: 'warehouse'
			}).industrialBuildings
		).toHaveLength(1);
	});

	test('blocks placement when a 2x2 footprint reaches locked border tiles', () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const edgeAnchor = getIndustryTileById(
			city,
			`${city.id}-${city.width - 2}-${city.height - 2}`
		)!;

		expect(edgeAnchor.locked).toBe(false);
		expect(getIndustrialPlacementBlockReason(game, edgeAnchor.id, 'warehouse')).toEqual(
			decisionContextIndustrialLockedTile()
		);
		expect(
			buildIndustrialBuilding(game, {
				tileId: edgeAnchor.id,
				buildingTypeId: 'warehouse'
			}).industrialBuildings
		).toHaveLength(0);
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

	test('reports unknown industrial tile and unknown industrial building type block reasons', () => {
		expect.assertions(2);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;

		expect(getIndustrialPlacementBlockReason(game, 'missing-tile', 'warehouse')).toEqual(
			decisionContextIndustrialUnknownTile()
		);
		expect(
			getIndustrialPlacementBlockReason(
				game,
				grainTile.id,
				'missing-type' as IndustrialBuildingTypeId
			)
		).toEqual(decisionContextIndustrialUnknownBuilding());
	});

	test('deduplicates identical same-day construction failures into a single decision', () => {
		expect.assertions(2);
		const game = { ...createNewGame('convenience', 20260512), cash: 0 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const first = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		const duplicate = buildIndustrialBuilding(first, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(duplicate).toBe(first);
		expect(duplicate.decisions).toHaveLength(1);
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

	test('getIndustrialPlacementBlockReason reports unknown tile when the active industry city is missing', () => {
		expect.assertions(1);
		const game = {
			...createNewGame('convenience', 20260512),
			activeIndustryCityId: 'missing-city'
		};

		expect(getIndustrialPlacementBlockReason(game, 'any-tile', 'warehouse')).toEqual(
			decisionContextIndustrialUnknownTile()
		);
	});

	test('buildIndustrialBuilding reports unknown tile when the active industry city is missing', () => {
		expect.assertions(2);
		const game = {
			...createNewGame('convenience', 20260512),
			cash: 100_000,
			activeIndustryCityId: 'missing-city'
		};

		const result = buildIndustrialBuilding(game, {
			tileId: 'any-tile',
			buildingTypeId: 'warehouse'
		});

		expect(result.industrialBuildings).toHaveLength(0);
		expect(result.decisions.at(-1)?.context).toEqual(decisionContextIndustrialUnknownTile());
	});

	test('upgradeBuilding leaves sibling buildings unchanged when upgrading one of multiple buildings', () => {
		expect.assertions(3);
		const base = { ...createNewGame('convenience', 20260512), cash: 1_000_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const waterTile = getIndustryTilesByResource(city, 'water-source')[0]!;
		let game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});
		game = buildIndustrialBuilding(game, {
			tileId: waterTile.id,
			buildingTypeId: 'water-pump'
		});
		const firstBuildingId = game.industrialBuildings[0]!.id;
		const siblingBefore = game.industrialBuildings[1]!;

		const upgraded = upgradeBuilding(game, firstBuildingId);

		const siblingAfter = upgraded.industrialBuildings.find(
			(building) => building.id === siblingBefore.id
		)!;
		expect(
			upgraded.industrialBuildings.find((building) => building.id === firstBuildingId)?.level
		).toBe(2);
		expect(siblingAfter.level).toBe(1);
		expect(siblingAfter).toBe(siblingBefore);
	});

	test('blocks industrial buildings whose 2x2 footprint includes a non-industrial tile', () => {
		// Exercises the footprint (not anchor) branch of the industrial-terrain
		// guard: the anchor itself is industrial, but one of its 2x2 footprint
		// tiles is non-industrial. The starter city has no industrial anchor
		// whose footprint naturally crosses into unlocked non-industrial
		// terrain (edge tiles are locked `blocked`), so poison one footprint
		// neighbor of an all-industrial anchor with farmland terrain.
		expect.assertions(2);
		const base = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = base.industryCities[0]!;
		const anchor = city.tiles.find(
			(tile) =>
				tile.terrain === 'industrial' &&
				!tile.locked &&
				[
					[1, 0],
					[0, 1],
					[1, 1]
				].every(([dx, dy]) => {
					const footprintTile = city.tiles.find(
						(other) => other.x === tile.x + dx && other.y === tile.y + dy
					);
					return (
						footprintTile !== undefined &&
						footprintTile.terrain === 'industrial' &&
						!footprintTile.locked
					);
				})
		)!;
		const poisonedTileId = city.tiles.find(
			(tile) => tile.x === anchor.x + 1 && tile.y === anchor.y
		)!.id;
		const mutatedCity: IndustryCity = {
			...city,
			tiles: city.tiles.map((tile) =>
				tile.id === poisonedTileId ? { ...tile, terrain: 'farmland' } : tile
			)
		};
		const game = {
			...base,
			industryCities: [mutatedCity, ...base.industryCities.slice(1)]
		};

		expect(getIndustrialPlacementBlockReason(game, anchor.id, 'flour-mill')).toEqual(
			decisionContextIndustrialRequiresIndustrialTile()
		);
		expect(
			buildIndustrialBuilding(game, {
				tileId: anchor.id,
				buildingTypeId: 'flour-mill'
			}).industrialBuildings
		).toHaveLength(0);
	});

	test('blocks placement when the 2x2 footprint extends beyond the map edge', () => {
		expect.assertions(1);
		const city = createUnlockedEdgeIndustryCity(3, 3);
		const context = {
			city,
			tileLookup: createIndustryTileLookup(city),
			occupiedTileIds: new Set<string>()
		};
		const cornerTile = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		expect(
			getIndustrialPlacementBlockReasonWithContext(context, cornerTile.id, 'warehouse')
		).toEqual(decisionContextIndustrialLockedTile());
	});

	test('createIndustrialPlacementContext resolves occupied tile ids from existing buildings', () => {
		expect.assertions(2);
		const base = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = base.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(base, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		const context = createIndustrialPlacementContext(game);

		expect(context).not.toBeNull();
		expect(context!.occupiedTileIds.size).toBeGreaterThanOrEqual(4);
	});
});

function createUnlockedEdgeIndustryCity(width: number, height: number): IndustryCity {
	const tiles: IndustryTile[] = [];
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			tiles.push({
				id: `edge-city-${x}-${y}`,
				cityId: 'edge-city',
				x,
				y,
				terrain: 'industrial',
				resource: null,
				locked: false
			});
		}
	}
	return { id: 'edge-city', name: 'Edge City', width, height, tiles, rails: [] };
}
