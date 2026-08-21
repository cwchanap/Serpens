import { describe, expect, it } from 'vitest';
import {
	cloneEventTarget,
	getEventTargetCopyParams,
	isEventTargetEligibleForSelection,
	isEventTargetResolvable,
	resolveEventTargets,
	sameEventTarget
} from './eventTargets';
import { createTwoIndustryCityGame, withRecurringRoutes } from './interCityLogistics.testUtils';
import { createNewGame } from './state';
import type { GameState, MarketCompetitor, RecurringRoute } from './types';

function route(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 30,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 0,
		...overrides
	};
}

function gameWithRoutes(routes: readonly RecurringRoute[] = []): GameState {
	return withRecurringRoutes(createTwoIndustryCityGame({ seed: 7 }), [...routes]);
}

function competitor(overrides: Partial<MarketCompetitor> = {}): MarketCompetitor {
	return {
		id: 'competitor-harbor-city-1',
		name: 'Harborline Market',
		cityId: 'harbor-city',
		location: { neighborhoodId: 'downtown', x: 2, y: 2 },
		archetypeId: 'convenience',
		reputation: 50,
		pricePosture: 'standard',
		productFocus: ['beverages'],
		brandIds: ['common-ground'],
		status: 'active',
		...overrides
	};
}

function gameWithCompetitors(competitors: readonly MarketCompetitor[]): GameState {
	const game = createNewGame('grocery', 7);
	return { ...game, competitors: [...competitors] };
}

describe('event target resolution', () => {
	it('resolves the company selector to the company target', () => {
		expect(resolveEventTargets(gameWithRoutes([route()]), { kind: 'company' })).toEqual([
			{ kind: 'company' }
		]);
	});

	it('resolves active opened routes in raw id order', () => {
		const game = gameWithRoutes([
			route({ id: 'route-20', state: 'active', priority: 0 }),
			route({ id: 'route-3', state: 'active', priority: 99 }),
			route({ id: 'route-1', state: 'paused', priority: 0 })
		]);

		expect(resolveEventTargets(game, { kind: 'recurring-route', state: 'active' })).toEqual([
			{ kind: 'recurring-route', routeId: 'route-20' },
			{ kind: 'recurring-route', routeId: 'route-3' }
		]);
	});

	it('orders resolved routes by raw route id, not insertion order or priority', () => {
		const game = gameWithRoutes([
			route({ id: 'route-3', state: 'active', priority: 99 }),
			route({ id: 'route-20', state: 'active', priority: 0 })
		]);

		expect(resolveEventTargets(game, { kind: 'recurring-route', state: 'active' })).toEqual([
			{ kind: 'recurring-route', routeId: 'route-20' },
			{ kind: 'recurring-route', routeId: 'route-3' }
		]);
	});

	it('excludes paused routes from resolution', () => {
		const game = gameWithRoutes([
			route({ id: 'route-1', state: 'paused' }),
			route({ id: 'route-2', state: 'active' })
		]);

		expect(resolveEventTargets(game, { kind: 'recurring-route', state: 'active' })).toEqual([
			{ kind: 'recurring-route', routeId: 'route-2' }
		]);
	});

	it('resolves no recurring-route targets when no routes exist', () => {
		expect(
			resolveEventTargets(gameWithRoutes(), { kind: 'recurring-route', state: 'active' })
		).toEqual([]);
	});

	it('resolves active and closed competitor selectors in canonical ID order', () => {
		const game = gameWithCompetitors([
			competitor({ id: 'competitor-harbor-city-2', status: 'closed' }),
			competitor({ id: 'competitor-harbor-city-1', status: 'active' }),
			competitor({ id: 'competitor-harbor-city-3', status: 'active' })
		]);

		expect(resolveEventTargets(game, { kind: 'competitor', status: 'active' } as never)).toEqual([
			{ kind: 'competitor', competitorId: 'competitor-harbor-city-1' },
			{ kind: 'competitor', competitorId: 'competitor-harbor-city-3' }
		]);
		expect(resolveEventTargets(game, { kind: 'competitor', status: 'closed' } as never)).toEqual([
			{ kind: 'competitor', competitorId: 'competitor-harbor-city-2' }
		]);
	});
});

describe('event target selection eligibility', () => {
	it('keeps the company target always eligible for selection', () => {
		expect(isEventTargetEligibleForSelection(gameWithRoutes(), { kind: 'company' })).toBe(true);
	});

	it('requires the route to exist and be active', () => {
		const game = gameWithRoutes([route({ id: 'route-1', state: 'paused' })]);
		expect(
			isEventTargetEligibleForSelection(game, { kind: 'recurring-route', routeId: 'route-1' })
		).toBe(false);
		expect(
			isEventTargetEligibleForSelection(game, { kind: 'recurring-route', routeId: 'route-2' })
		).toBe(false);
	});

	it('requires both endpoints to be opened world cities for selection eligibility', () => {
		const unopened = gameWithRoutes([route({ id: 'route-1', originCityId: 'quarry-works' })]);
		expect(
			isEventTargetEligibleForSelection(unopened, { kind: 'recurring-route', routeId: 'route-1' })
		).toBe(false);

		const opened = gameWithRoutes([route({ id: 'route-1' })]);
		expect(
			isEventTargetEligibleForSelection(opened, { kind: 'recurring-route', routeId: 'route-1' })
		).toBe(true);
	});

	it('keeps a known closed competitor resolvable but not an unknown rival', () => {
		const game = gameWithCompetitors([competitor({ status: 'closed' })]);
		const closedTarget = { kind: 'competitor', competitorId: competitor().id } as never;
		const unknownTarget = { kind: 'competitor', competitorId: 'competitor-harbor-city-9' } as never;

		expect(isEventTargetEligibleForSelection(game, closedTarget)).toBe(true);
		expect(isEventTargetResolvable(game, closedTarget)).toBe(true);
		expect(isEventTargetResolvable(game, unknownTarget)).toBe(false);
	});
});

describe('event target resolution eligibility', () => {
	it('keeps the company target always resolvable', () => {
		expect(isEventTargetResolvable(gameWithRoutes(), { kind: 'company' })).toBe(true);
	});

	it('resolves any existing route regardless of state or opened endpoints', () => {
		const paused = gameWithRoutes([route({ id: 'route-1', state: 'paused' })]);
		expect(isEventTargetResolvable(paused, { kind: 'recurring-route', routeId: 'route-1' })).toBe(
			true
		);

		const unopened = gameWithRoutes([route({ id: 'route-1', originCityId: 'quarry-works' })]);
		expect(isEventTargetResolvable(unopened, { kind: 'recurring-route', routeId: 'route-1' })).toBe(
			true
		);

		const missing = gameWithRoutes();
		expect(isEventTargetResolvable(missing, { kind: 'recurring-route', routeId: 'route-1' })).toBe(
			false
		);
	});
});

describe('event target equality and cloning', () => {
	it('compares concrete targets by kind and route id', () => {
		const company = { kind: 'company' as const };
		const firstRoute = { kind: 'recurring-route' as const, routeId: 'route-1' };
		const secondRoute = { kind: 'recurring-route' as const, routeId: 'route-2' };

		expect(sameEventTarget(company, company)).toBe(true);
		expect(sameEventTarget(firstRoute, { ...firstRoute })).toBe(true);
		expect(sameEventTarget(firstRoute, secondRoute)).toBe(false);
		expect(sameEventTarget(company, firstRoute)).toBe(false);
		expect(
			sameEventTarget(
				{ kind: 'competitor', competitorId: 'competitor-harbor-city-1' } as never,
				{ kind: 'competitor', competitorId: 'competitor-harbor-city-1' } as never
			)
		).toBe(true);
		expect(
			sameEventTarget(
				{ kind: 'competitor', competitorId: 'competitor-harbor-city-1' } as never,
				{ kind: 'competitor', competitorId: 'competitor-harbor-city-2' } as never
			)
		).toBe(false);
	});

	it('clones concrete targets without sharing references', () => {
		const company = { kind: 'company' as const };
		const routeTarget = { kind: 'recurring-route' as const, routeId: 'route-1' };

		expect(cloneEventTarget(company)).toEqual(company);
		expect(cloneEventTarget(routeTarget)).toEqual(routeTarget);
		expect(cloneEventTarget(routeTarget)).not.toBe(routeTarget);
		const competitorTarget = {
			kind: 'competitor',
			competitorId: 'competitor-harbor-city-1'
		} as never;
		expect(cloneEventTarget(competitorTarget)).toEqual(competitorTarget);
		expect(cloneEventTarget(competitorTarget)).not.toBe(competitorTarget);
	});
});

describe('event target copy params', () => {
	it('adds no copy params for the company target', () => {
		expect(getEventTargetCopyParams(gameWithRoutes(), { kind: 'company' })).toEqual({});
	});

	it('builds stable copy params for a recurring-route target', () => {
		const game = gameWithRoutes([route({ id: 'route-1' })]);
		expect(getEventTargetCopyParams(game, { kind: 'recurring-route', routeId: 'route-1' })).toEqual(
			{
				routeId: 'route-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water'
			}
		);
	});

	it('keeps the route id when the route no longer exists', () => {
		expect(
			getEventTargetCopyParams(gameWithRoutes(), { kind: 'recurring-route', routeId: 'route-1' })
		).toEqual({ routeId: 'route-1' });
	});

	it('builds stable copy params for a competitor target and retains its id after closure', () => {
		const rival = competitor();
		const game = gameWithCompetitors([rival]);
		expect(
			getEventTargetCopyParams(game, {
				kind: 'competitor',
				competitorId: rival.id
			} as never)
		).toEqual({ competitorId: rival.id, competitorName: rival.name, cityId: rival.cityId });

		const closed = gameWithCompetitors([{ ...rival, status: 'closed' }]);
		expect(
			getEventTargetCopyParams(closed, {
				kind: 'competitor',
				competitorId: rival.id
			} as never)
		).toEqual({ competitorId: rival.id, competitorName: rival.name, cityId: rival.cityId });
	});

	it('keeps the competitor id when the target no longer exists', () => {
		expect(
			getEventTargetCopyParams(gameWithCompetitors([]), {
				kind: 'competitor',
				competitorId: 'competitor-harbor-city-1'
			} as never)
		).toEqual({ competitorId: 'competitor-harbor-city-1' });
	});
});
