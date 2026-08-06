import { describe, expect, it } from 'vitest';
import { DEFAULT_RETAIL_CITY_HEIGHT, DEFAULT_RETAIL_CITY_WIDTH } from '$lib/game/city';
import { createFixtureScenarioRun, resolveFixtureDefinition } from './scenarioRepository.testUtils';

describe('resolveFixtureDefinition', () => {
	it('returns the fixture definition for the first-profit v1 ref', () => {
		const definition = resolveFixtureDefinition({ scenarioId: 'first-profit', version: 1 });
		expect(definition).toBeDefined();
		expect(definition?.id).toBe('first-profit');
		expect(definition?.version).toBe(1);
		expect(definition?.officialSeed).toBe(280_001);
	});

	it('returns undefined for an unknown scenario id', () => {
		expect(resolveFixtureDefinition({ scenarioId: 'import-squeeze', version: 1 })).toBeUndefined();
	});

	it('returns undefined for a mismatched version', () => {
		expect(resolveFixtureDefinition({ scenarioId: 'first-profit', version: 2 })).toBeUndefined();
	});
});

describe('createFixtureScenarioRun', () => {
	it('builds an active ranked run for first-profit v1', () => {
		const run = createFixtureScenarioRun();
		expect(run.definition).toEqual({ scenarioId: 'first-profit', version: 1 });
		expect(run.seed).toBe(280_001);
		expect(run.eligibility).toBe('ranked');
		expect(run.status).toBe('active');
		expect(run.result).toBeNull();
		expect(run.runId).toMatch(/^[0-9a-f]{8}-/);
	});

	it('produces a game state with the fixture seed and default-size harbor city', () => {
		const run = createFixtureScenarioRun();
		const city = run.game.cities[0];
		expect(run.game.seed).toBe(280_001);
		expect(run.game.cash).toBe(11_000);
		expect(run.game.cities).toHaveLength(1);
		expect(city?.id).toBe('harbor-city');
		expect(city?.width).toBe(DEFAULT_RETAIL_CITY_WIDTH);
		expect(city?.height).toBe(DEFAULT_RETAIL_CITY_HEIGHT);
		expect(city?.tiles).toHaveLength(DEFAULT_RETAIL_CITY_WIDTH * DEFAULT_RETAIL_CITY_HEIGHT);
	});

	it('produces an evaluation derived from the fixture definition and game', () => {
		const run = createFixtureScenarioRun();
		expect(run.evaluation.day).toBe(run.game.day);
		// The fixture definition has one required objective (cash >= 1_000_000).
		expect(run.evaluation.required).toHaveLength(1);
		expect(run.evaluation.required[0]?.conditionId).toBe('cash-goal');
	});

	it('returns a fresh run id on each call', () => {
		const first = createFixtureScenarioRun();
		const second = createFixtureScenarioRun();
		expect(first.runId).not.toBe(second.runId);
	});
});
