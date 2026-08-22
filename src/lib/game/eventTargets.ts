import type {
	EventTarget,
	EventTargetSelector,
	GameState,
	MarketCompetitor,
	RecurringRoute,
	StructuredCopyParams
} from './types';

export function resolveEventTargets(game: GameState, selector: EventTargetSelector): EventTarget[] {
	if (selector.kind === 'company') {
		return [{ kind: 'company' }];
	}
	if (selector.kind === 'competitor') {
		return game.competitors
			.filter((competitor) => competitor.status === selector.status)
			.map((competitor) => ({ kind: 'competitor' as const, competitorId: competitor.id }))
			.sort((first, second) => compareCodeUnits(first.competitorId, second.competitorId));
	}
	return game.logistics.recurringRoutes
		.filter((route) => route.state === selector.state)
		.map((route) => ({ kind: 'recurring-route' as const, routeId: route.id }))
		.sort((first, second) => compareCodeUnits(first.routeId, second.routeId));
}

export function isEventTargetEligibleForSelection(game: GameState, target: EventTarget): boolean {
	if (target.kind === 'company') return true;
	if (target.kind === 'competitor') {
		const competitor = findCompetitor(game, target.competitorId);
		return (
			competitor !== undefined &&
			game.world.openedCityIds.includes(competitor.cityId) &&
			game.cities.some((city) => city.id === competitor.cityId)
		);
	}
	const route = findRoute(game, target.routeId);
	return (
		route !== undefined &&
		route.state === 'active' &&
		game.world.openedCityIds.includes(route.originCityId) &&
		game.world.openedCityIds.includes(route.destinationCityId)
	);
}

export function isEventTargetResolvable(game: GameState, target: EventTarget): boolean {
	if (target.kind === 'company') return true;
	if (target.kind === 'competitor') return findCompetitor(game, target.competitorId) !== undefined;
	return findRoute(game, target.routeId) !== undefined;
}

export function sameEventTarget(left: EventTarget, right: EventTarget): boolean {
	if (left.kind === 'company' || right.kind === 'company') {
		return left.kind === right.kind;
	}
	if (left.kind === 'competitor' && right.kind === 'competitor') {
		return left.competitorId === right.competitorId;
	}
	if (left.kind === 'competitor' || right.kind === 'competitor') return false;
	return left.routeId === right.routeId;
}

export function cloneEventTarget(target: EventTarget): EventTarget {
	if (target.kind === 'company') return { kind: 'company' };
	if (target.kind === 'competitor') {
		return { kind: 'competitor', competitorId: target.competitorId };
	}
	return { kind: 'recurring-route', routeId: target.routeId };
}

export function getEventTargetCopyParams(
	game: GameState,
	target: EventTarget
): StructuredCopyParams {
	if (target.kind === 'company') return {};
	if (target.kind === 'competitor') {
		const competitor = findCompetitor(game, target.competitorId);
		if (!competitor) return { competitorId: target.competitorId };
		return {
			competitorId: competitor.id,
			competitorName: competitor.name,
			cityId: competitor.cityId
		};
	}
	const route = findRoute(game, target.routeId);
	if (!route) return { routeId: target.routeId };
	return {
		routeId: route.id,
		originCityId: route.originCityId,
		destinationCityId: route.destinationCityId,
		materialId: route.materialId
	};
}

function findRoute(game: GameState, routeId: string): RecurringRoute | undefined {
	return game.logistics.recurringRoutes.find((candidate) => candidate.id === routeId);
}

function findCompetitor(game: GameState, competitorId: string): MarketCompetitor | undefined {
	return game.competitors.find((candidate) => candidate.id === competitorId);
}

export function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}
