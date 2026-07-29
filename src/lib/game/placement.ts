import { ARCHETYPES, getArchetype } from './archetypes';
import {
	computeStoreLocalDemand,
	getTileById,
	getTilePlacementBlockDecisionIdPart,
	getTilePlacementBlockReason
} from './city';
import { clampScore } from './reports';
import { createNewGame, getExpansionSetupCost, openStore } from './state';
import { decisionContextLocationBlocked, decisionContextLocationGeneric } from './decisionContext';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason,
	type StoreFootprintPlacementBlockReason
} from './storeFootprint';
import type {
	ArchetypeId,
	City,
	CityTile,
	DecisionItem,
	GameState,
	OpeningForecast,
	Store,
	StoreLocation
} from './types';
import type { TilePlacementBlockReason } from './city';

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
	input: { tileId: string; archetypeId: ArchetypeId }
): GameState {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);
	const tile = city ? getTileById(city, input.tileId) : undefined;

	if (!city || !tile) {
		return appendLocationUnavailableDecision(game);
	}

	const tileLookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, tileLookup);
	const blockReason = getStoreFootprintPlacementBlockReason(tileLookup, tile, occupiedTileIds);

	if (blockReason) {
		return appendLocationUnavailableDecision(game, toTilePlacementDecisionReason(blockReason));
	}

	const expanded = openStore(game, {
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

export { financeRetailStoreOpening } from './expansionFinancing';

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

	const blockReason = getTilePlacementBlockReason(tile);

	if (blockReason) {
		throw new Error(`${blockReason}: ${tileId}`);
	}

	const footprintBlockReason = getStoreFootprintPlacementBlockReason(
		createCityTileLookup(city),
		tile
	);

	if (footprintBlockReason) {
		throw new Error(`${footprintBlockReason}: ${tileId}`);
	}

	return tile;
}

function toTilePlacementDecisionReason(
	reason: StoreFootprintPlacementBlockReason
): TilePlacementBlockReason | null {
	return reason === 'occupied' ? null : reason;
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
		localDemand: computeStoreLocalDemand(tile),
		reputation: clampScore(store.reputation + Math.round((fitScore - 60) / 8)),
		staffCapacity: clampScore(store.staffCapacity + Math.round((tile.footTraffic - 55) / 10))
	};
}

export function formatLocation(tile: CityTile): StoreLocation {
	return { neighborhoodId: tile.neighborhood, x: tile.x, y: tile.y };
}

function appendLocationUnavailableDecision(
	game: GameState,
	reason?: TilePlacementBlockReason | null
): GameState {
	const decision = locationUnavailableDecision(game, reason);

	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function locationUnavailableDecision(
	game: GameState,
	reason?: TilePlacementBlockReason | null
): DecisionItem {
	const idPart = getTilePlacementBlockDecisionIdPart(reason);

	return {
		id: `location-unavailable${idPart ? `-${idPart}` : ''}-${game.day}`,
		title: 'Location unavailable',
		// After Task 1b, TilePlacementBlockReason is already 'locked' | 'road' | 'river'
		// — no English-literal matching needed. The reason IS the stable code.
		context: reason ? decisionContextLocationBlocked(reason) : decisionContextLocationGeneric(),
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
