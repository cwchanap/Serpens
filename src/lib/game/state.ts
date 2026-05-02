import { getArchetype } from './archetypes';
import { clampScore } from './reports';
import { createRng, normalizeSeed, randomInt } from './rng';
import type {
	ArchetypeId,
	CompanyPolicy,
	DecisionItem,
	DecisionOption,
	GameState,
	Scorecard,
	Store
} from './types';
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
	location: string;
}

const EXPANSION_SETUP_COST = 14_000;

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

	return {
		seed: normalizedSeed,
		rngState: normalizedSeed,
		day: 1,
		cash: archetype.startingCash,
		debt: archetype.startingDebt,
		policy: { ...DEFAULT_POLICY },
		scorecard: {
			profit: clampScore(
				50 + Math.round((archetype.startingCash - archetype.startingDebt) / 2_000)
			),
			customerSatisfaction: clampScore(archetype.customerExpectation),
			staffMorale: openingStore.staffMorale,
			marketPosition: clampScore(35 + Math.round(archetype.baseTraffic / 10))
		},
		stores: [openingStore],
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
	if (game.stores.length >= MAX_STORES) {
		return appendDecision(game, expansionUnavailableDecision(game));
	}

	if (game.cash < EXPANSION_SETUP_COST) {
		return appendDecision(game, expansionCashBlockedDecision(game));
	}

	const archetypeId = game.stores[0]?.archetypeId ?? 'convenience';
	const rng = createRng(game.rngState);
	const store = createStore({
		id: `store-${game.stores.length + 1}`,
		name: input.name,
		archetypeId,
		location: input.location,
		daysOpen: 0,
		rng
	});

	return {
		...game,
		rngState: rng.getState(),
		cash: game.cash - EXPANSION_SETUP_COST,
		stores: [...game.stores, store],
		scorecard: {
			...game.scorecard,
			marketPosition: clampScore(game.scorecard.marketPosition + 4)
		}
	};
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

function appendDecision(game: GameState, decision: DecisionItem): GameState {
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

function expansionCashBlockedDecision(game: GameState): DecisionItem {
	return {
		id: `expansion-cash-blocked-${game.day}`,
		title: 'Expansion delayed',
		context: `Opening another store requires ${EXPANSION_SETUP_COST.toLocaleString('en-US')} cash.`,
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
