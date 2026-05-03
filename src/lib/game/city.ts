import { createRng, randomInt } from './rng';
import type { City, CityTile, NeighborhoodId, TerrainId } from './types';

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
	const tiles: CityTile[] = [];

	for (let y = 0; y < input.height; y += 1) {
		for (let x = 0; x < input.width; x += 1) {
			const profile = NEIGHBORHOOD_PROFILES[getNeighborhood(input.width, input.height, x, y)];

			tiles.push({
				id: `${input.id}-${x}-${y}`,
				cityId: input.id,
				x,
				y,
				neighborhood: profile.id,
				terrain: profile.terrain,
				demand: clamp(profile.demand + randomInt(rng, -10, 10), 20, 100),
				rent: clamp(profile.rent + randomInt(rng, -180, 180), 400, 2600),
				footTraffic: clamp(profile.footTraffic + randomInt(rng, -12, 12), 20, 100),
				customerFit: clamp(profile.customerFit + randomInt(rng, -10, 10), 20, 100),
				locked: x === 0 || y === 0 || x === input.width - 1 || y === input.height - 1
			});
		}
	}

	return {
		id: input.id,
		name: input.name,
		width: input.width,
		height: input.height,
		tiles
	};
}

export function getTileById(city: City, tileId: string): CityTile | undefined {
	return city.tiles.find((tile) => tile.id === tileId);
}

export function getTilesByNeighborhood(city: City, neighborhood: NeighborhoodId): CityTile[] {
	return city.tiles.filter((tile) => tile.neighborhood === neighborhood);
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

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
