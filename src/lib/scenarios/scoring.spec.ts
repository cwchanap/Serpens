import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import type {
	ScenarioDefinition,
	ScenarioEvaluation,
	ScenarioResult,
	ScenarioScoreComponent
} from './types';
import {
	calculateScenarioScore,
	calculateScenarioScoreProjection,
	medalForScore,
	pointsToNextMedal,
	shouldReplaceBestResult
} from './scoring';

function definition(scoreComponents: readonly ScenarioScoreComponent[] = []): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280_001,
		dayLimit: 10,
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
			archetypeIds: ['convenience'],
			productCategoryIds: ['bottled-water'],
			materialIds: [],
			buildingTypeIds: [],
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-city-1-1',
					archetypeId: 'convenience'
				}
			],
			industrialPlacements: []
		},
		allowedCommands: ['advanceDay'],
		modifiers: [],
		requiredObjectives: [],
		optionalObjectives: [
			{
				id: 'optional-cash',
				labelKey: 'store.defaultName',
				query: { metric: 'cash' },
				comparator: 'gte',
				target: 1,
				window: { kind: 'current' }
			}
		],
		failures: [],
		scoreComponents,
		medalThresholds: { silver: 700, gold: 850 }
	};
}

function game(overrides: Partial<GameState> = {}): GameState {
	return { ...createNewGame('convenience', 280_001), ...overrides };
}

function evaluation(
	overrides: Partial<Omit<ScenarioEvaluation, 'projection'>> = {}
): Omit<ScenarioEvaluation, 'projection'> {
	return {
		day: 1,
		required: [],
		optional: [
			{
				conditionId: 'optional-cash',
				status: 'pending',
				evidence: {
					conditionId: 'optional-cash',
					metric: 'cash',
					comparator: 'gte',
					target: 1,
					actual: 0,
					day: 1,
					window: { kind: 'current' },
					contributingIds: []
				}
			}
		],
		failures: [],
		deadline: null,
		risks: [],
		...overrides
	};
}

function result(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
	const scenario = definition();
	const state = game();
	const conditions = evaluation();
	const projection = calculateScenarioScoreProjection(scenario, state, conditions);
	const completeEvaluation = { ...conditions, projection };
	return {
		definition: { scenarioId: scenario.id, version: scenario.version },
		seed: scenario.officialSeed,
		eligibility: 'ranked',
		outcome: 'completed',
		completionDay: state.day,
		score: projection.score,
		medal: 'bronze',
		evaluation: completeEvaluation,
		...overrides
	};
}

describe('scenario scoring', () => {
	it('rounds each normalized component to an integer once', () => {
		const scenario = definition([
			{
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'current' },
				zeroBonusAt: 0,
				fullBonusAt: 2,
				points: 5
			}
		]);

		expect(calculateScenarioScore(scenario, game({ cash: 1 }), evaluation())).toBe(503);
	});

	it('emits canonical evidence for a standalone customer-satisfaction metric component', () => {
		const scenario = definition([
			{
				kind: 'metric',
				query: { metric: 'scorecard', score: 'customerSatisfaction' },
				window: { kind: 'current' },
				zeroBonusAt: 0,
				fullBonusAt: 100,
				points: 500
			}
		]);
		const state = game({
			scorecard: { ...game().scorecard, customerSatisfaction: 80 }
		});

		expect(calculateScenarioScoreProjection(scenario, state, evaluation())).toEqual({
			score: 900,
			medal: 'gold',
			componentPoints: [400],
			componentEvidence: [
				{
					kind: 'metric',
					query: { metric: 'scorecard', score: 'customerSatisfaction' },
					window: { kind: 'current' },
					actual: 80,
					day: state.day,
					windowComplete: true
				}
			]
		});
	});

	it('clamps component values outside their anchors and the final score to 0 through 1000', () => {
		const scenario = definition([
			{
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'current' },
				zeroBonusAt: 0,
				fullBonusAt: 10,
				points: 700
			},
			{
				kind: 'metric',
				query: { metric: 'scorecard', score: 'profit' },
				window: { kind: 'current' },
				zeroBonusAt: 100,
				fullBonusAt: 200,
				points: 200
			}
		]);

		expect(calculateScenarioScore(scenario, game({ cash: 100 }), evaluation())).toBe(1000);
		expect(calculateScenarioScore(scenario, game({ cash: -100 }), evaluation())).toBe(500);
	});

	it('uses the same normalization for inverse lower-is-better anchors', () => {
		const scenario = definition([
			{
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'current' },
				zeroBonusAt: 100,
				fullBonusAt: 0,
				points: 100
			}
		]);

		expect(calculateScenarioScore(scenario, game({ cash: 25 }), evaluation())).toBe(575);
	});

	it('adds fixed satisfied optional points and normalized remaining-day points', () => {
		const scenario = definition([
			{ kind: 'optional-objective', objectiveId: 'optional-cash', points: 100 },
			{ kind: 'remaining-days', zeroBonusAt: 0, fullBonusAt: 10, points: 100 }
		]);
		const conditions = evaluation({
			optional: [
				{
					...evaluation().optional[0]!,
					status: 'satisfied'
				}
			]
		});

		expect(calculateScenarioScore(scenario, game({ day: 5 }), conditions)).toBe(650);
		expect(calculateScenarioScoreProjection(scenario, game({ day: 5 }), conditions)).toEqual({
			score: 650,
			medal: 'bronze',
			componentPoints: [100, 50],
			componentEvidence: [null, null]
		});
	});

	it('always supplies the 500-point clear floor', () => {
		expect(calculateScenarioScore(definition(), game(), evaluation())).toBe(500);
	});

	it('awards Bronze below 700, Silver from 700, and Gold from 850 only on completion', () => {
		const scenario = definition();

		expect(medalForScore(scenario, 'completed', 500)).toBe('bronze');
		expect(medalForScore(scenario, 'completed', 699)).toBe('bronze');
		expect(medalForScore(scenario, 'completed', 700)).toBe('silver');
		expect(medalForScore(scenario, 'completed', 849)).toBe('silver');
		expect(medalForScore(scenario, 'completed', 850)).toBe('gold');
		expect(medalForScore(scenario, 'failed', 1000)).toBeNull();
		expect(medalForScore(scenario, 'abandoned', 1000)).toBeNull();
	});

	it('reports the exact points required for the next medal', () => {
		const scenario = definition();

		expect(pointsToNextMedal(scenario, 650)).toEqual({ medal: 'silver', points: 50 });
		expect(pointsToNextMedal(scenario, 700)).toEqual({ medal: 'gold', points: 150 });
		expect(pointsToNextMedal(scenario, 850)).toBeNull();
	});

	it('retains an equal-score ranked best result', () => {
		const existing = result({ score: 800, medal: 'silver' });
		const candidate = result({ score: 800, medal: 'silver', completionDay: 2 });

		expect(shouldReplaceBestResult(existing, candidate)).toBe(false);
		expect(shouldReplaceBestResult(existing, { ...candidate, score: 801 })).toBe(true);
	});

	it('never compares results across definition versions', () => {
		const existing = result({ score: 500 });
		const candidate = result({
			definition: { scenarioId: 'first-profit', version: 2 },
			score: 1000,
			medal: 'gold'
		});

		expect(shouldReplaceBestResult(existing, candidate)).toBe(false);
	});

	it('rejects unranked, failed, and abandoned candidates from best-result replacement', () => {
		expect(shouldReplaceBestResult(null, result({ eligibility: 'unranked', score: 1000 }))).toBe(
			false
		);
		expect(shouldReplaceBestResult(null, result({ outcome: 'failed', score: 1000 }))).toBe(false);
		expect(shouldReplaceBestResult(null, result({ outcome: 'abandoned', score: 1000 }))).toBe(
			false
		);
	});
});
