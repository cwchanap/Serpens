import { createRng, randomInt } from './rng';
import type { City, CityTile, CityTileFeature, NeighborhoodId, TerrainId } from './types';

export type TilePlacementBlockReason = 'Locked location' | 'Road location' | 'River location';

const TILE_PLACEMENT_BLOCK_DECISION_ID_PART: Record<TilePlacementBlockReason, string> = {
	'Locked location': 'locked',
	'Road location': 'road',
	'River location': 'river'
};

interface GenerateCityInput {
	id: string;
	name: string;
	width: number;
	height: number;
	seed: number;
}

interface NeighborhoodProfile {
	id: NeighborhoodId;
	terrain: TerrainId;
	demand: number;
	rent: number;
	footTraffic: number;
	customerFit: number;
}

const NEIGHBORHOOD_PROFILES: Record<NeighborhoodId, NeighborhoodProfile> = {
	downtown: {
		id: 'downtown',
		terrain: 'commercial',
		demand: 82,
		rent: 2200,
		footTraffic: 88,
		customerFit: 78
	},
	campus: {
		id: 'campus',
		terrain: 'commercial',
		demand: 72,
		rent: 1500,
		footTraffic: 76,
		customerFit: 86
	},
	residential: {
		id: 'residential',
		terrain: 'residential',
		demand: 58,
		rent: 1200,
		footTraffic: 52,
		customerFit: 64
	},
	mall: {
		id: 'mall',
		terrain: 'commercial',
		demand: 76,
		rent: 1900,
		footTraffic: 82,
		customerFit: 72
	},
	transit: {
		id: 'transit',
		terrain: 'transit',
		demand: 68,
		rent: 1350,
		footTraffic: 84,
		customerFit: 58
	},
	industrial: {
		id: 'industrial',
		terrain: 'industrial',
		demand: 42,
		rent: 850,
		footTraffic: 38,
		customerFit: 44
	},
	suburb: {
		id: 'suburb',
		terrain: 'residential',
		demand: 46,
		rent: 950,
		footTraffic: 42,
		customerFit: 56
	},
	parkEdge: {
		id: 'parkEdge',
		terrain: 'green',
		demand: 50,
		rent: 1000,
		footTraffic: 56,
		customerFit: 62
	}
};

export function generateCity(input: GenerateCityInput): City {
	const rng = createRng(input.seed);
	const width = normalizeDimension(input.width);
	const height = normalizeDimension(input.height);
	const tiles: CityTile[] = [];

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const profile = NEIGHBORHOOD_PROFILES[getNeighborhood(width, height, x, y)];
			const locked = x === 0 || y === 0 || x === width - 1 || y === height - 1;
			const feature = getTileFeature(width, height, x, y, locked);

			tiles.push({
				id: `${input.id}-${x}-${y}`,
				cityId: input.id,
				x,
				y,
				neighborhood: profile.id,
				terrain: profile.terrain,
				feature,
				demand: clamp(profile.demand + randomInt(rng, -10, 10), 20, 100),
				rent: clamp(profile.rent + randomInt(rng, -180, 180), 400, 2600),
				footTraffic: clamp(profile.footTraffic + randomInt(rng, -12, 12), 20, 100),
				customerFit: clamp(profile.customerFit + randomInt(rng, -10, 10), 20, 100),
				locked
			});
		}
	}

	return {
		id: input.id,
		name: input.name,
		width,
		height,
		tiles
	};
}

export function getTileById(city: City, tileId: string): CityTile | undefined {
	return city.tiles.find((tile) => tile.id === tileId);
}

export function getTilesByNeighborhood(city: City, neighborhood: NeighborhoodId): CityTile[] {
	return city.tiles.filter((tile) => tile.neighborhood === neighborhood);
}

export function getTilePlacementBlockReason(tile: CityTile): TilePlacementBlockReason | null {
	if (tile.locked) {
		return 'Locked location';
	}

	if (tile.feature === 'road') {
		return 'Road location';
	}

	if (tile.feature === 'river') {
		return 'River location';
	}

	return null;
}

export function isTileBuildable(tile: CityTile): boolean {
	return getTilePlacementBlockReason(tile) === null;
}

export function getTilePlacementBlockDecisionIdPart(
	reason?: TilePlacementBlockReason | null
): string | null {
	return reason ? TILE_PLACEMENT_BLOCK_DECISION_ID_PART[reason] : null;
}

function getNeighborhood(width: number, height: number, x: number, y: number): NeighborhoodId {
	const centerX = (width - 1) / 2;
	const centerY = (height - 1) / 2;
	const normalizedDistance =
		Math.abs(x - centerX) / Math.max(1, width / 2) +
		Math.abs(y - centerY) / Math.max(1, height / 2);
	const left = x < width * 0.35;
	const right = x > width * 0.65;
	const top = y < height * 0.35;
	const bottom = y > height * 0.65;

	if (normalizedDistance < 0.45) {
		return 'downtown';
	}

	if (top && right) {
		return 'campus';
	}

	if (top && left) {
		return 'industrial';
	}

	if (bottom && right) {
		return 'suburb';
	}

	if (bottom && left) {
		return 'parkEdge';
	}

	if (Math.abs(x - centerX) <= 1 || Math.abs(y - centerY) <= 1) {
		return 'transit';
	}

	if (right) {
		return 'mall';
	}

	return 'residential';
}

function getTileFeature(
	width: number,
	height: number,
	x: number,
	y: number,
	locked: boolean
): CityTileFeature {
	if (locked || width < 5 || height < 5) {
		return null;
	}

	if (isRoadTile(width, height, x, y)) {
		return 'road';
	}

	if (isRiverTile(width, height, x, y)) {
		return 'river';
	}

	return null;
}

function isRoadTile(width: number, height: number, x: number, y: number): boolean {
	const spineX = Math.floor(width / 2);
	const crossY = Math.floor(height / 2);

	return x === spineX || y === crossY;
}

function isRiverTile(width: number, height: number, x: number, y: number): boolean {
	const upperX = Math.max(1, Math.floor(width / 4));
	const bendY = Math.max(2, Math.floor(height * 0.55));
	const lowerX = Math.max(1, Math.min(width - 2, upperX + Math.max(1, Math.floor(width / 5))));

	if (y <= bendY) {
		return x === upperX;
	}

	const bendProgress = y - bendY;
	const expectedX = Math.min(lowerX, upperX + bendProgress);

	return x === expectedX;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function normalizeDimension(value: number): number {
	if (!Number.isFinite(value)) {
		return 1;
	}

	return Math.max(1, Math.floor(value));
}
