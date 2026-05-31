import { describe, expect, test } from 'vitest';
import {
	STARTER_STORE_CAP,
	WORLD_CITY_CATALOG,
	createInitialWorldProgress,
	getWorldCityDefinition,
	getWorldCityStatus
} from './world';
import type { GameState } from './types';

function gameStub(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260530,
		rngState: 1,
		day: 1,
		cash: 20_000,
		debt: 0,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
		},
		cities: [],
		activeCityId: 'harbor-city',
		industryCities: [],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		warehouse: {
			capacity: 0,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		},
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		...overrides
	};
}

describe('world city catalog', () => {
	test('defines three retail and three industry city nodes with unique ids', () => {
		expect.assertions(5);
		const ids = WORLD_CITY_CATALOG.map((city) => city.id);

		expect(WORLD_CITY_CATALOG).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
		expect(WORLD_CITY_CATALOG.filter((city) => city.kind === 'retail')).toHaveLength(3);
		expect(WORLD_CITY_CATALOG.filter((city) => city.kind === 'industry')).toHaveLength(3);
		expect(WORLD_CITY_CATALOG.every((city) => city.openingCost >= 0)).toBe(true);
	});

	test('creates initial world progress with the starter retail and industry cities opened', () => {
		expect.assertions(4);
		const progress = createInitialWorldProgress();

		expect(progress.openedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(progress.revealedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(progress.claimedMilestoneIds).toEqual([]);
		expect(STARTER_STORE_CAP).toBeGreaterThan(1);
	});

	test('returns world city status from saved progress and company cash', () => {
		expect.assertions(5);
		const game = gameStub({
			cash: 1_000,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		});

		const harbor = getWorldCityStatus(game, 'harbor-city');
		const campus = getWorldCityStatus(game, 'campus-junction');
		const garden = getWorldCityStatus(game, 'garden-borough');

		expect(harbor?.state).toBe('opened');
		expect(campus?.state).toBe('revealed');
		expect(campus?.canOpen).toBe(false);
		expect(garden?.state).toBe('locked');
		expect(getWorldCityDefinition('missing-city')).toBeUndefined();
	});
});
