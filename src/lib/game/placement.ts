import { ARCHETYPES, getArchetype } from './archetypes';
import { getTileById } from './city';
import { clampScore } from './reports';
import { createNewGame, getExpansionSetupCost, openStore } from './state';
import type {
	ArchetypeId,
	City,
	CityTile,
	DecisionItem,
	GameState,
	OpeningForecast,
	Store
} from './types';

const ARCHETYPE_NEIGHBORHOOD_FIT: Record<
	ArchetypeId,
	Partial<Record<CityTile['neighborhood'], number>>
> = {
	convenience: {
		downtown: 10,
		transit: 14,
		campus: 6,
		residential: 4
	},
	boutique: {
		downtown: 12,
		mall: 14,
		parkEdge: 8,
		suburb: 4
	},
	electronics: {
		campus: 18,
		mall: 12,
		downtown: 8,
		transit: 4
	},
	grocery: {
		residential: 14,
		suburb: 12,
		transit: 6,
		parkEdge: 4
	}
};

const ARCHETYPE_TERRAIN_FIT: Record<ArchetypeId, Partial<Record<CityTile['terrain'], number>>> = {
	convenience: {
		commercial: 8,
		transit: 12,
		residential: 4
	},
	boutique: {
		commercial: 12,
		green: 5
	},
	electronics: {
		commercial: 14,
		transit: 4
	},
	grocery: {
		residential: 10,
		commercial: 5
	}
};

export function getRecommendedArchetypes(tile: CityTile): ArchetypeId[] {
	return ARCHETYPES.map((archetype) => ({
		id: archetype.id,
		score: scoreTileForArchetype(tile, archetype.id)
	}))
		.sort((left, right) => right.score - left.score)
		.map((recommendation) => recommendation.id);
}

export function forecastOpening(tile: CityTile, archetypeId: ArchetypeId): OpeningForecast {
	const archetype = getArchetype(archetypeId);
	const fitScore = scoreTileForArchetype(tile, archetypeId);
	const demandScore = clampScore((tile.demand + tile.footTraffic + fitScore) / 3);
	const projectedDailyRevenue = Math.round(
		(archetype.baseTraffic * 7 + tile.demand * 10 + tile.footTraffic * 6) * (fitScore / 100)
	);

	return {
		tileId: tile.id,
		setupCost: getExpansionSetupCost(tile, archetypeId),
		projectedDailyRevenue,
		projectedDailyRent: tile.rent,
		demandScore,
		customerFit: fitScore,
		risks: getOpeningRisks(tile, fitScore, demandScore)
	};
}

export function createFoundingGameAtTile(input: {
	archetypeId: ArchetypeId;
	city: City;
	tileId: string;
	seed: number;
}): GameState {
	const tile = getAvailableTileOrThrow(input.city, input.tileId);
	const game = createNewGame(input.archetypeId, input.seed);
	const foundingStore = game.stores[0];

	if (!foundingStore) {
		throw new Error('Founding store was not created');
	}

	const placedStore = placeStoreOnTile(foundingStore, tile);

	return {
		...game,
		cities: [input.city],
		activeCityId: input.city.id,
		stores: [placedStore],
		scorecard: {
			...game.scorecard,
			staffMorale: placedStore.staffMorale
		}
	};
}

export function openStoreAtTile(
	game: GameState,
	input: { tileId: string; name: string; archetypeId: ArchetypeId }
): GameState {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);
	const tile = city ? getTileById(city, input.tileId) : undefined;

	if (!city || !tile || tile.locked || game.stores.some((store) => store.tileId === input.tileId)) {
		return appendLocationUnavailableDecision(game);
	}

	const expanded = openStore(game, {
		name: input.name,
		archetypeId: input.archetypeId,
		location: formatLocation(tile),
		tileId: tile.id
	});

	if (expanded.stores.length === game.stores.length) {
		return expanded;
	}

	return {
		...expanded,
		stores: expanded.stores.map((store, index) =>
			index === expanded.stores.length - 1 ? placeStoreOnTile(store, tile) : store
		)
	};
}

function scoreTileForArchetype(tile: CityTile, archetypeId: ArchetypeId): number {
	const neighborhoodFit = ARCHETYPE_NEIGHBORHOOD_FIT[archetypeId][tile.neighborhood] ?? 0;
	const terrainFit = ARCHETYPE_TERRAIN_FIT[archetypeId][tile.terrain] ?? 0;

	return clampScore(
		tile.customerFit * 0.55 +
			tile.demand * 0.25 +
			tile.footTraffic * 0.2 +
			neighborhoodFit +
			terrainFit
	);
}

function getOpeningRisks(tile: CityTile, fitScore: number, demandScore: number): string[] {
	const risks: string[] = [];

	if (tile.rent >= 2_000) {
		risks.push('High rent pressure');
	}

	if (fitScore < 55) {
		risks.push('Weak customer fit');
	}

	if (demandScore < 50) {
		risks.push('Low local demand');
	}

	if (tile.locked) {
		risks.push('Location is locked');
	}

	return risks;
}

function getAvailableTileOrThrow(city: City, tileId: string): CityTile {
	const tile = getTileById(city, tileId);

	if (!tile) {
		throw new Error(`Unknown tile: ${tileId}`);
	}

	if (tile.locked) {
		throw new Error(`Tile is locked: ${tileId}`);
	}

	return tile;
}

function placeStoreOnTile(store: Store, tile: CityTile): Store {
	const fitScore = scoreTileForArchetype(tile, store.archetypeId);

	return {
		...store,
		cityId: tile.cityId,
		tileId: tile.id,
		mapX: tile.x,
		mapY: tile.y,
		location: formatLocation(tile),
		localDemand: Math.max(1, Math.round((tile.demand + tile.footTraffic) / 2)),
		reputation: clampScore(store.reputation + Math.round((fitScore - 60) / 8)),
		staffCapacity: clampScore(store.staffCapacity + Math.round((tile.footTraffic - 55) / 10))
	};
}

function formatLocation(tile: CityTile): string {
	return `${formatNeighborhood(tile.neighborhood)} (${tile.x}, ${tile.y})`;
}

function formatNeighborhood(neighborhood: CityTile['neighborhood']): string {
	return neighborhood
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (character) => character.toUpperCase());
}

function appendLocationUnavailableDecision(game: GameState): GameState {
	const decision = locationUnavailableDecision(game);

	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function locationUnavailableDecision(game: GameState): DecisionItem {
	return {
		id: `location-unavailable-${game.day}`,
		title: 'Location unavailable',
		context: 'Choose an unlocked, unoccupied city tile before opening this store.',
		expiresOnDay: game.day + 1,
		options: [
			{
				id: 'acknowledge',
				label: 'Acknowledge',
				description: 'Return to location planning.',
				effects: {}
			}
		]
	};
}
