import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity
} from '$lib/game/city';
import { createFoundingGameAtTile } from '$lib/game/placement';
import type { GameState } from '$lib/game/types';
import { evaluateScenario, executeScenarioCommand } from './runtime';
import type { ScenarioCommand, ScenarioCondition, ScenarioDefinition, ScenarioRun } from './types';

// Force openStoreAtTile to throw while keeping every other placement export
// (including createFoundingGameAtTile, used to build the fixture game) real.
// No dispatched transition currently throws in production — this mock exercises
// the defensive try/catch in executeScenarioCommand so a future transition
// that does throw surfaces as invalid-command instead of propagating to the
// controller catch-all (which would mislabel it as persistence-write-failed).
vi.mock('$lib/game/placement', async (importActual) => {
	const actual = await importActual<typeof import('$lib/game/placement')>();
	return {
		...actual,
		openStoreAtTile: () => {
			throw new Error('forced transition failure');
		}
	};
});

function foundingGame(seed = 280_001): GameState {
	const city = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed
	});
	return {
		...createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: 'harbor-city-1-1',
			seed
		}),
		cash: 1_000_000,
		storeCap: 10
	};
}

function cashCondition(
	id: string,
	comparator: ScenarioCondition['comparator'],
	target: number
): ScenarioCondition {
	return {
		id,
		labelKey: 'store.defaultName',
		query: { metric: 'cash' },
		comparator,
		target,
		window: { kind: 'current' }
	};
}

function openStoreDefinition(): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280_001,
		dayLimit: 100,
		start: {
			foundingStore: {
				ref: 'founder',
				archetypeId: 'convenience',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			},
			industrialBuildings: [],
			rails: [],
			overrides: {}
		},
		content: {
			cityIds: ['harbor-city'],
			archetypeIds: ['convenience', 'boutique', 'electronics', 'grocery'],
			productIds: [
				'bottled-water',
				'snacks',
				'soft-drinks',
				'essentials',
				'games',
				'accessories',
				'devices',
				'gifts',
				'produce',
				'pantry',
				'prepared'
			],
			materialIds: ['water', 'bottled-water', 'grain', 'snacks'],
			buildingTypeIds: ['grain-farm', 'water-pump', 'water-bottler', 'warehouse'],
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-city-1-1',
					archetypeId: 'convenience'
				}
			],
			industrialPlacements: []
		},
		allowedCommands: ['openStore'] as const satisfies readonly ScenarioCommand['kind'][],
		modifiers: [],
		requiredObjectives: [cashCondition('unreachable-cash', 'gt', 2_000_000_000)],
		optionalObjectives: [],
		failures: [cashCondition('catastrophic-cash', 'lt', -2_000_000_000)],
		scoreComponents: [],
		medalThresholds: { silver: 700, gold: 850 }
	};
}

function activeRun(definition: ScenarioDefinition, game: GameState): ScenarioRun {
	return {
		runId: crypto.randomUUID(),
		definition: { scenarioId: definition.id, version: definition.version },
		seed: game.seed,
		eligibility: 'unranked',
		status: 'active',
		game,
		evaluation: evaluateScenario(definition, game, false),
		result: null
	};
}

describe('executeScenarioCommand transition-throw hardening', () => {
	it('rejects a command whose transition throws as invalid-command instead of propagating', () => {
		const game = foundingGame();
		const definition = openStoreDefinition();
		const command: ScenarioCommand = {
			kind: 'openStore',
			tileId: 'harbor-city-1-1',
			archetypeId: 'convenience'
		};

		const result = executeScenarioCommand(activeRun(definition, game), definition, command);

		expect(result).toEqual({ ok: false, code: 'invalid-command' });
	});
});
