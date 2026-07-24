import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
	createIndustryTileLookup
} from '$lib/game/industryFootprint';
import { RAIL_MAX_LEVEL, railCellKey } from '$lib/game/rail';
import { buildRail, buildRailPreview } from '$lib/game/railPlacement';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	IndustryCity
} from '$lib/game/types';
import { getWorldCityDefinition } from '$lib/game/world';
import type { AuthoredBuilding, ValidationContext } from './shared';
import {
	KNOWN_CITY_IDS,
	RAIL_KEYS,
	arrayValue,
	closedObject,
	diagnostic,
	getValidationCity,
	validateIncluded,
	validateKnownReference
} from './shared';
import {
	dedupePhysicalBuildings,
	isCoordinateInsideBuilding,
	physicalBuildingKey
} from './geometry';

function validateRails(
	context: ValidationContext,
	value: unknown,
	occupiedByCity: ReadonlyMap<string, Set<string>>
): void {
	const rails = arrayValue(context, value, 'start.rails');
	if (!rails) return;
	const byCity = new Map<string, Array<{ path: string; x: number; y: number; level: number }>>();
	const seen = new Set<string>();
	for (const [index, candidate] of rails.entries()) {
		const path = `start.rails[${index}]`;
		const rail = closedObject(context, candidate, path, RAIL_KEYS);
		if (!rail) continue;
		const validCity = validateKnownReference(
			context,
			rail.cityId,
			`${path}.cityId`,
			KNOWN_CITY_IDS,
			'city'
		);
		if (validCity) validateIncluded(context, rail.cityId, `${path}.cityId`, context.content.cities);
		const validX = typeof rail.x === 'number' && Number.isInteger(rail.x);
		const validY = typeof rail.y === 'number' && Number.isInteger(rail.y);
		if (!validX)
			diagnostic(
				context,
				`${path}.x`,
				'invalid-rail-coordinate',
				rail.x,
				'Rail x must be an integer coordinate.'
			);
		if (!validY)
			diagnostic(
				context,
				`${path}.y`,
				'invalid-rail-coordinate',
				rail.y,
				'Rail y must be an integer coordinate.'
			);
		if (
			typeof rail.level !== 'number' ||
			!Number.isInteger(rail.level) ||
			rail.level < 1 ||
			rail.level > RAIL_MAX_LEVEL
		) {
			diagnostic(
				context,
				`${path}.level`,
				'invalid-rail-level',
				rail.level,
				`Rail level must be an integer from 1 through ${RAIL_MAX_LEVEL}.`
			);
		}
		if (!validCity || !validX || !validY) continue;
		const cityId = rail.cityId as string;
		const key = `${cityId}:${railCellKey(rail.x as number, rail.y as number)}`;
		if (seen.has(key))
			diagnostic(
				context,
				path,
				'duplicate-rail-cell',
				candidate,
				`Duplicate authored rail cell ${key}.`
			);
		seen.add(key);
		const city = getValidationCity(context, cityId);
		const definition = getWorldCityDefinition(cityId);
		const tile =
			definition?.kind === 'industry' && city
				? createIndustryTileLookup(city as IndustryCity).byCoordinate.get(`${rail.x},${rail.y}`)
				: undefined;
		const overlapsPermittedBuilding = context.permittedBuildingPlacements.some(
			(building) =>
				building.validPlacement &&
				building.cityId === cityId &&
				isCoordinateInsideBuilding(rail.x as number, rail.y as number, building)
		);
		if (
			!tile ||
			tile.locked ||
			occupiedByCity.get(cityId)?.has(tile.id) ||
			overlapsPermittedBuilding
		) {
			diagnostic(
				context,
				path,
				'invalid-rail-coordinate',
				candidate,
				'Rail cells must be on unlocked, unoccupied industry tiles.'
			);
			continue;
		}
		const cityRails = byCity.get(cityId) ?? [];
		cityRails.push({ path, x: rail.x as number, y: rail.y as number, level: rail.level as number });
		byCity.set(cityId, cityRails);
		const authoredRails = context.authoredRailsByCity.get(cityId) ?? [];
		authoredRails.push({ x: rail.x as number, y: rail.y as number, level: rail.level as number });
		context.authoredRailsByCity.set(cityId, authoredRails);
	}
	if (rails.length > 0 && !hasValidRailTopology(context, byCity)) {
		diagnostic(
			context,
			'start.rails',
			'invalid-rail-topology',
			value,
			'Every authored rail component must connect at least two authored or permitted building footprints.'
		);
	}
}

function hasValidRailTopology(
	context: ValidationContext,
	byCity: ReadonlyMap<string, Array<{ x: number; y: number }>>
): boolean {
	let hasComponent = false;
	for (const [cityId, rails] of byCity) {
		const coordinates = new Set(rails.map((rail) => railCellKey(rail.x, rail.y)));
		const visited = new Set<string>();
		const permittedBuildings = context.allowedCommands.has('buildIndustrialBuilding')
			? context.permittedBuildingPlacements
			: [];
		const buildings = dedupePhysicalBuildings([
			...context.startBuildingPlacements,
			...permittedBuildings
		]).filter(
			(building) =>
				building.cityId === cityId && building.x !== undefined && building.y !== undefined
		);
		for (const start of coordinates) {
			if (visited.has(start)) continue;
			hasComponent = true;
			const queue = [start];
			const component = new Set<string>();
			visited.add(start);
			while (queue.length > 0) {
				const current = queue.shift()!;
				component.add(current);
				const [x, y] = current.split(',').map(Number);
				for (const [dx, dy] of [
					[0, -1],
					[1, 0],
					[0, 1],
					[-1, 0]
				] as const) {
					const neighbor = railCellKey((x ?? 0) + dx, (y ?? 0) + dy);
					if (coordinates.has(neighbor) && !visited.has(neighbor)) {
						visited.add(neighbor);
						queue.push(neighbor);
					}
				}
			}
			const attached = buildings.filter((building) => {
				const x = building.x!;
				const y = building.y!;
				for (let cellX = x; cellX < x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH; cellX++) {
					if (
						component.has(railCellKey(cellX, y - 1)) ||
						component.has(railCellKey(cellX, y + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT))
					)
						return true;
				}
				for (let cellY = y; cellY < y + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT; cellY++) {
					if (
						component.has(railCellKey(x - 1, cellY)) ||
						component.has(railCellKey(x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH, cellY))
					)
						return true;
				}
				return false;
			});
			if (attached.length < 2) return false;
			for (const building of attached) {
				const neighbors = context.railBuildingGraph.get(building.path) ?? new Set<string>();
				for (const neighbor of attached) {
					if (neighbor.path !== building.path) neighbors.add(neighbor.path);
				}
				context.railBuildingGraph.set(building.path, neighbors);
			}
		}
	}
	return hasComponent;
}

function canConnectBuildingsWithRail(
	context: ValidationContext,
	selected: readonly AuthoredBuilding[]
): boolean {
	const first = selected[0];
	if (!first || selected.some((building) => building.cityId !== first.cityId)) return false;
	const city = getValidationCity(context, first.cityId);
	if (!city || getWorldCityDefinition(first.cityId)?.kind !== 'industry') return false;

	const physicalBuildings = dedupePhysicalBuildings([
		...context.startBuildingPlacements.filter((building) => building.cityId === first.cityId),
		...selected
	]);
	const buildingIds = new Map<string, string>();
	const industrialBuildings: IndustrialBuilding[] = physicalBuildings.map((building, index) => {
		const id = `scenario-validation-building-${index}`;
		buildingIds.set(physicalBuildingKey(building), id);
		return {
			id,
			level: 1,
			typeId: building.typeId as IndustrialBuildingTypeId,
			cityId: building.cityId,
			tileId: building.tileId,
			mapX: building.x!,
			mapY: building.y!,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};
	});
	let game = {
		cash: Number.MAX_SAFE_INTEGER,
		industryCities: [
			{
				...(city as IndustryCity),
				rails: [...(context.authoredRailsByCity.get(first.cityId) ?? [])]
			}
		],
		industrialBuildings
	} as GameState;
	const connected = new Set<AuthoredBuilding>([first]);

	while (connected.size < selected.length) {
		let connectedOne = false;
		for (const origin of connected) {
			for (const destination of selected) {
				if (connected.has(destination)) continue;
				const originBuildingId = buildingIds.get(physicalBuildingKey(origin));
				const destinationBuildingId = buildingIds.get(physicalBuildingKey(destination));
				if (!originBuildingId || !destinationBuildingId) continue;
				const input = { originBuildingId, waypoints: [], destinationBuildingId };
				const preview = buildRailPreview(game, input);
				if (preview.blockReason && preview.blockReason.code !== 'railAlreadyConnected') continue;
				if (preview.blockReason === null) game = buildRail(game, input);
				connected.add(destination);
				connectedOne = true;
				break;
			}
			if (connectedOne) break;
		}
		if (!connectedOne) return false;
	}
	return true;
}

function areBuildingsRailConnected(
	context: ValidationContext,
	buildings: readonly AuthoredBuilding[]
): boolean {
	const first = buildings[0];
	if (!first || !context.railBuildingGraph.has(first.path)) return false;
	const visited = new Set<string>([first.path]);
	const queue = [first.path];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const neighbor of context.railBuildingGraph.get(current) ?? []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push(neighbor);
			}
		}
	}
	return buildings.every((building) => visited.has(building.path));
}

export { validateRails, canConnectBuildingsWithRail, areBuildingsRailConnected };
