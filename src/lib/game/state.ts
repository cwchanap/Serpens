import { getArchetype } from './archetypes';
import {
	generateCity,
	getTilePlacementBlockDecisionIdPart,
	getTilePlacementBlockReason,
	isTileBuildable
} from './city';
import { clampScore } from './reports';
import { createRng, normalizeSeed, randomInt } from './rng';
import {
	generateHiringCandidates,
	generateStarterStaffForStore,
	HIRING_CANDIDATE_COUNT
} from './staffing';
import type {
	ArchetypeId,
	City,
	CityTile,
	CompanyPolicy,
	DecisionItem,
	DecisionOption,
	GameState,
	Scorecard,
	Store
} from './types';
import type { TilePlacementBlockReason } from './city';
import { MAX_STORES } from './types';

export const DEFAULT_POLICY: CompanyPolicy = {
	pricing: 'standard',
	inventory: 'balanced',
	staffing: 'efficient',
	marketing: 'awareness',
	service: 'balanced'
};

interface OpenStoreInput {
	name: string;
	archetypeId: ArchetypeId;
	location: string;
	tileId?: string;
}

interface ExpansionTileResult {
	tile?: CityTile;
	blockReason?: TilePlacementBlockReason | null;
}

export function createNewGame(archetypeId: ArchetypeId, seed = Date.now()): GameState {
	const archetype = getArchetype(archetypeId);
	const normalizedSeed = normalizeSeed(seed);
	const rng = createRng(normalizedSeed);
	const openingStore = createStore({
		id: 'store-1',
		name: archetype.name,
		archetypeId,
		location: 'Founding location',
		daysOpen: 1,
		rng
	});
	const city = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: 20,
		height: 20,
		seed: normalizedSeed
	});
	const fallbackTile = city.tiles.find(isTileBuildable) ?? city.tiles[0]!;
	const placedOpeningStore = {
		...openingStore,
		cityId: city.id,
		tileId: fallbackTile.id,
		mapX: fallbackTile.x,
		mapY: fallbackTile.y,
		location: `Founding location (${fallbackTile.x}, ${fallbackTile.y})`
	};
	const staff = generateStarterStaffForStore({
		storeId: placedOpeningStore.id,
		archetypeId,
		day: 1,
		rng
	});
	const hiringCandidates = generateHiringCandidates({ count: HIRING_CANDIDATE_COUNT, day: 1, rng });

	return {
		seed: normalizedSeed,
		rngState: rng.getState(),
		day: 1,
		cash: archetype.startingCash,
		debt: archetype.startingDebt,
		policy: { ...DEFAULT_POLICY },
		scorecard: {
			profit: clampScore(
				50 + Math.round((archetype.startingCash - archetype.startingDebt) / 2_000)
			),
			customerSatisfaction: clampScore(archetype.customerExpectation),
			staffMorale: placedOpeningStore.staffMorale,
			marketPosition: clampScore(35 + Math.round(archetype.baseTraffic / 10))
		},
		cities: [city],
		activeCityId: city.id,
		stores: [placedOpeningStore],
		staff,
		hiringCandidates,
		decisions: [],
		reports: []
	};
}

export function updatePolicy(game: GameState, patch: Partial<CompanyPolicy>): GameState {
	return {
		...game,
		policy: {
			...game.policy,
			...patch
		}
	};
}

export function openStore(game: GameState, input: OpenStoreInput): GameState {
	const archetypeId = input.archetypeId;
	const expansionTile = getExpansionTile(game, input.tileId);
	const tile = expansionTile.tile;

	if (!tile) {
		return appendDecision(game, locationUnavailableDecision(game, expansionTile.blockReason));
	}

	if (game.stores.length >= MAX_STORES) {
		return appendDecision(game, expansionUnavailableDecision(game));
	}

	const setupCost = getExpansionSetupCost(tile, archetypeId);

	if (game.cash < setupCost) {
		return appendDecision(game, expansionCashBlockedDecision(game, setupCost));
	}

	const rng = createRng(game.rngState);
	const store = createStore({
		id: `store-${game.stores.length + 1}`,
		name: input.name,
		archetypeId,
		location: input.location,
		daysOpen: 0,
		rng
	});
	const placedStore = placeStore(store, tile);

	return {
		...game,
		rngState: rng.getState(),
		cash: game.cash - setupCost,
		stores: [...game.stores, placedStore],
		scorecard: {
			...game.scorecard,
			marketPosition: clampScore(game.scorecard.marketPosition + 4)
		}
	};
}

export function getExpansionSetupCost(tile: CityTile, archetypeId: ArchetypeId): number {
	const archetype = getArchetype(archetypeId);
	const demandScore = clampScore((tile.demand + tile.footTraffic + tile.customerFit) / 3);

	return Math.round(9_000 + tile.rent * 2.5 + archetype.baseRent * 18 + demandScore * 24);
}

export function resolveDecision(game: GameState, decisionId: string, optionId: string): GameState {
	const decision = game.decisions.find((candidate) => candidate.id === decisionId);
	const option = decision?.options.find((candidate) => candidate.id === optionId);

	if (!decision || !option) {
		return game;
	}

	return {
		...game,
		cash: game.cash + (option.effects.cash ?? 0),
		scorecard: applyScoreEffects(game.scorecard, option),
		stores: game.stores.map((store) => applyStoreEffects(store, option)),
		decisions: game.decisions.filter((candidate) => candidate.id !== decisionId)
	};
}

function createStore(input: {
	id: string;
	name: string;
	archetypeId: ArchetypeId;
	location: string;
	daysOpen: number;
	rng: ReturnType<typeof createRng>;
}): Store {
	const archetype = getArchetype(input.archetypeId);

	return {
		id: input.id,
		name: input.name,
		archetypeId: input.archetypeId,
		location: input.location,
		cityId: 'harbor-city',
		tileId: `${input.id}-unplaced`,
		mapX: 0,
		mapY: 0,
		daysOpen: input.daysOpen,
		reputation: clampScore(archetype.customerExpectation + randomInt(input.rng, -4, 4)),
		stockHealth: clampScore(62 + randomInt(input.rng, -5, 5)),
		staffMorale: clampScore(60 + randomInt(input.rng, -6, 6)),
		staffCapacity: clampScore(64 + randomInt(input.rng, -5, 5)),
		localDemand: Math.max(0, archetype.baseTraffic + randomInt(input.rng, -8, 8)),
		competition: clampScore(45 + randomInt(input.rng, -10, 10)),
		managerQuality: clampScore(58 + randomInt(input.rng, -7, 7))
	};
}

function applyScoreEffects(scorecard: Scorecard, option: DecisionOption): Scorecard {
	return {
		profit: clampScore(scorecard.profit + (option.effects.profit ?? 0)),
		customerSatisfaction: clampScore(
			scorecard.customerSatisfaction + (option.effects.customerSatisfaction ?? 0)
		),
		staffMorale: clampScore(scorecard.staffMorale + (option.effects.staffMorale ?? 0)),
		marketPosition: clampScore(scorecard.marketPosition + (option.effects.marketPosition ?? 0))
	};
}

function applyStoreEffects(store: Store, option: DecisionOption): Store {
	return {
		...store,
		stockHealth: clampScore(store.stockHealth + (option.effects.stockHealth ?? 0)),
		staffMorale: clampScore(store.staffMorale + (option.effects.staffMorale ?? 0)),
		reputation: clampScore(store.reputation + (option.effects.reputation ?? 0))
	};
}

function getExpansionTile(
	game: GameState,
	requestedTileId: string | undefined
): ExpansionTileResult {
	const city = getActiveCity(game);

	if (!city) {
		return {};
	}

	if (requestedTileId) {
		const requestedTile = city.tiles.find((tile) => tile.id === requestedTileId);

		if (!requestedTile) {
			return {};
		}

		const blockReason = getTilePlacementBlockReason(requestedTile);

		if (blockReason || isTileOccupied(game, requestedTile.id)) {
			return { blockReason };
		}

		return { tile: requestedTile };
	}

	return {
		tile: city.tiles.find((tile) => isTileBuildable(tile) && !isTileOccupied(game, tile.id))
	};
}

function getActiveCity(game: GameState): City | undefined {
	return game.cities.find((city) => city.id === game.activeCityId);
}

function isTileOccupied(game: GameState, tileId: string): boolean {
	return game.stores.some((store) => store.tileId === tileId);
}

function placeStore(store: Store, tile: CityTile): Store {
	return {
		...store,
		cityId: tile.cityId,
		tileId: tile.id,
		mapX: tile.x,
		mapY: tile.y,
		location: `${store.location} (${tile.x}, ${tile.y})`,
		localDemand: Math.max(1, Math.round((tile.demand + tile.footTraffic) / 2))
	};
}

function appendDecision(game: GameState, decision: DecisionItem): GameState {
	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function expansionUnavailableDecision(game: GameState): DecisionItem {
	return {
		id: `expansion-unavailable-${game.day}`,
		title: 'Expansion unavailable',
		context: `This local chain can operate up to ${MAX_STORES} stores for now.`,
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}

function expansionCashBlockedDecision(game: GameState, setupCost: number): DecisionItem {
	return {
		id: `expansion-cash-blocked-${game.day}`,
		title: 'Expansion delayed',
		context: `Opening another store requires ${setupCost.toLocaleString('en-US')} cash.`,
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
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
		context: reason
			? `${reason} blocks store placement. Choose another city tile.`
			: 'Choose an unlocked, unoccupied city tile before opening this store.',
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}

function acknowledgeOption(): DecisionOption {
	return {
		id: 'acknowledge',
		label: 'Acknowledge',
		description: 'Return to operations planning.',
		effects: {}
	};
}
