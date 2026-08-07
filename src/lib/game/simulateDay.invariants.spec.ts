import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('./interCityLogistics', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./interCityLogistics')>();
	return {
		...actual,
		processRecurringRouteDispatches: vi.fn(actual.processRecurringRouteDispatches)
	};
});

import { processRecurringRouteDispatches } from './interCityLogistics';
import { simulateDay } from './simulateDay';
import { createNewGame } from './state';

afterEach(() => {
	vi.mocked(processRecurringRouteDispatches).mockReset();
});

describe('simulateDay defensive invariants', () => {
	test('throws when recurring route dispatch changes cash', () => {
		vi.mocked(processRecurringRouteDispatches).mockImplementation((game) => ({
			game: { ...game, cash: game.cash + 1 },
			attempts: [],
			scheduledTransportCost: 0
		}));

		expect(() => simulateDay(createNewGame('convenience', 20260806))).toThrow(
			/Recurring route dispatch cash reconciliation failed/
		);
	});
});
