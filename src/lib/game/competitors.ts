import { getArchetype } from './archetypes';
import { isTileBuildable } from './city';
import { BRANDS } from './brands';
import { getProductDefinition } from './products';
import { createRng, normalizeSeed, randomInt, type Rng } from './rng';
import { createCityTileLookup, getOccupiedStoreTileIds } from './storeFootprint';
import { getWorldCityDefinition } from './worldCatalog';
import type {
	ArchetypeId,
	BrandId,
	CityTile,
	CompanyPolicy,
	GameState,
	MarketCompetitor,
	ProductFamilyId,
	StoreLocation,
	WorldCityId
} from './types';

const COMPETITOR_COUNT = 2;
const COMPETITOR_NAMES: Readonly<Record<WorldCityId, readonly string[]>> = {
	'harbor-city': ['Harborline Market', 'Tideway Goods'],
	'campus-junction': ['Junction Circuit', 'Campus Corner'],
	'garden-borough': ['Garden Basket', 'Borough Basics'],
	'industry-city': [],
	'breadbasket-basin': [],
	'quarry-works': []
};
const ARCHETYPE_IDS: readonly ArchetypeId[] = ['convenience', 'boutique', 'electronics', 'grocery'];
const PRICE_POSTURES: readonly CompanyPolicy['pricing'][] = [
	'discount',
	'competitive',
	'standard',
	'premium'
];
const SPECIALIST_BRAND_IDS: readonly BrandId[] = ['budget-bay', 'northstar-select', 'fresh-field'];

export function ensureCompetitorsForRetailCity(
	game: GameState,
	cityId: WorldCityId | string
): GameState {
	const worldCity = getWorldCityDefinition(cityId);
	if (!worldCity || worldCity.kind !== 'retail') return game;
	if (!game.world.openedCityIds.includes(worldCity.id)) return game;

	const city = game.cities.find((candidate) => candidate.id === worldCity.id);
	if (!city) return game;

	const cityCompetitors = game.competitors.filter(
		(competitor) => competitor.cityId === worldCity.id
	);
	const expectedIds = new Set(
		Array.from({ length: COMPETITOR_COUNT }, (_, index) => competitorId(worldCity.id, index + 1))
	);
	if (
		cityCompetitors.length === COMPETITOR_COUNT &&
		new Set(cityCompetitors.map((competitor) => competitor.id)).size === COMPETITOR_COUNT &&
		cityCompetitors.every((competitor) => expectedIds.has(competitor.id))
	) {
		return game;
	}

	const rng = createRng(normalizeSeed(game.seed + worldCity.seed * 37 + 39_039));
	const cityLookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(
		city,
		game.stores.filter((store) => store.cityId === worldCity.id),
		cityLookup
	);
	const availableTiles = city.tiles.filter(
		(tile) => isTileBuildable(tile) && !occupiedTileIds.has(tile.id)
	);
	const fallbackTiles = city.tiles.filter(isTileBuildable);
	const selectedTileIds = new Set<string>();
	const generated: MarketCompetitor[] = [];

	for (let index = 0; index < COMPETITOR_COUNT; index += 1) {
		const archetypeId = ARCHETYPE_IDS[randomInt(rng, 0, ARCHETYPE_IDS.length - 1)]!;
		const productFocus = getArchetypeFamilyFocuses(archetypeId, rng);
		const compatibleSpecialists = SPECIALIST_BRAND_IDS.filter((brandId) =>
			productFocus.some((familyId) => BRANDS[brandId].supportedFamilyIds.includes(familyId))
		);
		const brandIds: BrandId[] = ['common-ground'];
		if (compatibleSpecialists.length > 0 && randomInt(rng, 0, 1) === 1) {
			brandIds.push(compatibleSpecialists[randomInt(rng, 0, compatibleSpecialists.length - 1)]!);
		}

		const tile = selectTile(availableTiles, fallbackTiles, selectedTileIds, rng);
		if (!tile) continue;
		selectedTileIds.add(tile.id);
		generated.push({
			id: competitorId(worldCity.id, index + 1),
			name: COMPETITOR_NAMES[worldCity.id][index] ?? `Market Rival ${index + 1}`,
			cityId: worldCity.id,
			location: toStoreLocation(tile),
			archetypeId,
			reputation: randomInt(rng, 45, 75),
			pricePosture: PRICE_POSTURES[randomInt(rng, 0, PRICE_POSTURES.length - 1)]!,
			productFocus,
			brandIds,
			status: 'active'
		});
	}

	if (generated.length !== COMPETITOR_COUNT) return game;

	return {
		...game,
		competitors: [
			...game.competitors.filter((competitor) => competitor.cityId !== worldCity.id),
			...generated
		].sort((left, right) => compareIds(left.id, right.id))
	};
}

export function competitorId(cityId: WorldCityId, ordinal: number): string {
	return `competitor-${cityId}-${ordinal}`;
}

function getArchetypeFamilyFocuses(archetypeId: ArchetypeId, rng: Rng): ProductFamilyId[] {
	const families = [
		...new Set(
			getArchetype(archetypeId).startingProductIds.map(
				(productId) => getProductDefinition(productId).familyId
			)
		)
	];
	const focusCount = Math.min(families.length, randomInt(rng, 1, 2));
	const shuffled = [...families];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = randomInt(rng, 0, index);
		[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
	}
	return shuffled.slice(0, focusCount);
}

function selectTile(
	availableTiles: readonly CityTile[],
	fallbackTiles: readonly CityTile[],
	selectedTileIds: ReadonlySet<string>,
	rng: Rng
): CityTile | undefined {
	const candidates = availableTiles.filter((tile) => !selectedTileIds.has(tile.id));
	const fallbackCandidates = fallbackTiles.filter((tile) => !selectedTileIds.has(tile.id));
	const pool = candidates.length > 0 ? candidates : fallbackCandidates;
	return pool.length > 0 ? pool[randomInt(rng, 0, pool.length - 1)] : undefined;
}

function toStoreLocation(tile: CityTile): StoreLocation {
	return { neighborhoodId: tile.neighborhood, x: tile.x, y: tile.y };
}

function compareIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
