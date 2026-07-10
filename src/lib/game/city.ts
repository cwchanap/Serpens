import { createRng, randomInt } from './rng';
import type { City, CityTile, CityTileFeature, NeighborhoodId, TerrainId } from './types';

export type TilePlacementBlockReason = 'locked' | 'road' | 'river';

export const DEFAULT_RETAIL_CITY_WIDTH = 56;
export const DEFAULT_RETAIL_CITY_HEIGHT = 48;

/** Tuning values that lay out road grid columns. Two layouts are used: a denser 5-divider grid for wide cities (>= ROAD_DIVIDER_WIDE_WIDTH) and a simpler 3-divider grid for narrower cities. */
const ROAD_DIVIDER_WIDE_WIDTH = 40;
const ROAD_DIVIDER_WIDE_FRACTIONS = [0.14, 0.3, 0.5, 0.68, 0.84];
const ROAD_DIVIDER_NARROW_FRACTIONS = [0.18, 0.5, 0.74];

/** Tuning values that lay out road grid rows. Two layouts are used: a denser 5-divider grid for tall cities (>= ROAD_DIVIDER_WIDE_HEIGHT) and a simpler 3-divider grid for shorter cities. */
const ROAD_DIVIDER_WIDE_HEIGHT = 36;
const ROAD_DIVIDER_WIDE_ROW_FRACTIONS = [0.18, 0.34, 0.5, 0.66, 0.82];
const ROAD_DIVIDER_NARROW_ROW_FRACTIONS = [0.25, 0.5, 0.75];

/** Fraction of city height where the river makes its horizontal bend from the upper to lower channel. */
const RIVER_BEND_HEIGHT_FRACTION = 0.32;

const TILE_PLACEMENT_BLOCK_DECISION_ID_PART: Record<TilePlacementBlockReason, string> = {
	locked: 'locked',
	road: 'road',
	river: 'river'
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
	// Retail city generation (getNeighborhood) intentionally never produces an
	// 'industrial' neighborhood — industrial terrain belongs to IndustryCity
	// (see CLAUDE.md). This entry exists only to satisfy the
	// Record<NeighborhoodId, NeighborhoodProfile> type and the save-validation
	// schema (NeighborhoodId enumerates 'industrial'); it is unreachable from
	// generateCity but kept for type completeness.
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

/**
 * Tile-derived local demand snapshot used whenever a store is (re)placed onto a
 * tile. Lives here (rather than next to placement code) so both placement.ts
 * and state.ts can share it without an import cycle, and so saveCodec's
 * relocation path stays consistent with live placement.
 */
export function computeStoreLocalDemand(tile: CityTile): number {
	return Math.max(1, Math.round((tile.demand + tile.footTraffic) / 2));
}

export function getTilesByNeighborhood(city: City, neighborhood: NeighborhoodId): CityTile[] {
	return city.tiles.filter((tile) => tile.neighborhood === neighborhood);
}

export function getTilePlacementBlockReason(tile: CityTile): TilePlacementBlockReason | null {
	if (tile.locked) {
		return 'locked';
	}

	if (tile.feature === 'road') {
		return 'road';
	}

	if (tile.feature === 'river') {
		return 'river';
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
		return 'residential';
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
	if (isRiverTile(width, height, x, y)) {
		return false;
	}

	return getRoadDividerColumns(width).includes(x) || getRoadDividerRows(height).includes(y);
}

function getRoadDividerColumns(width: number): number[] {
	const dividerFractions =
		width >= ROAD_DIVIDER_WIDE_WIDTH ? ROAD_DIVIDER_WIDE_FRACTIONS : ROAD_DIVIDER_NARROW_FRACTIONS;

	return uniqueInteriorPositions(
		width,
		dividerFractions.map((fraction) => Math.floor(width * fraction))
	);
}

function getRoadDividerRows(height: number): number[] {
	const dividerFractions =
		height >= ROAD_DIVIDER_WIDE_HEIGHT
			? ROAD_DIVIDER_WIDE_ROW_FRACTIONS
			: ROAD_DIVIDER_NARROW_ROW_FRACTIONS;

	return uniqueInteriorPositions(
		height,
		dividerFractions.map((fraction) => Math.floor(height * fraction))
	);
}

function uniqueInteriorPositions(size: number, positions: number[]): number[] {
	return [...new Set(positions.map((position) => Math.max(1, Math.min(size - 2, position))))].sort(
		(a, b) => a - b
	);
}

function isRiverTile(width: number, height: number, x: number, y: number): boolean {
	const upperX = Math.max(1, Math.floor(width / 4));
	const bendY = Math.max(2, Math.floor(height * RIVER_BEND_HEIGHT_FRACTION));
	const lowerX = getRiverLowerX(width);
	// Run the river from the top edge down to one row above the bottommost
	// road divider row.  Stopping short keeps the last road row intact as a
	// horizontal bridge across the river, preserving road-grid contiguity.
	const roadRows = getRoadDividerRows(height);
	// uniqueInteriorPositions always yields at least one row for any height
	// (it clamps each fraction to [1, height - 2] and the fraction list is
	// never empty), so the last divider row is always defined.
	const lastRoadRow = roadRows[roadRows.length - 1]!;
	const riverEndY = Math.max(bendY, Math.min(lastRoadRow - 1, height - 2));

	if (y < bendY) {
		return x === upperX;
	}

	if (y === bendY && x >= upperX && x <= lowerX) {
		return true;
	}

	if (y <= riverEndY) {
		return x === lowerX;
	}

	return false;
}

function getRiverLowerX(width: number): number {
	const upperX = Math.max(1, Math.floor(width / 4));

	return Math.max(1, Math.min(width - 2, upperX + Math.max(1, Math.floor(width / 6))));
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
