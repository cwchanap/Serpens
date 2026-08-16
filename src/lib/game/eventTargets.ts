import type {
	EventTarget,
	EventTargetSelector,
	GameState,
	RecurringRoute,
	StructuredCopyParams
} from './types';

export function resolveEventTargets(game: GameState, selector: EventTargetSelector): EventTarget[] {
	if (selector.kind === 'company') {
		return [{ kind: 'company' }];
	}
	return game.logistics.recurringRoutes
		.filter((route) => route.state === selector.state)
		.map((route) => ({ kind: 'recurring-route' as const, routeId: route.id }))
		.sort((first, second) => compareCodeUnits(first.routeId, second.routeId));
}

export function isEventTargetEligibleForSelection(game: GameState, target: EventTarget): boolean {
	if (target.kind === 'company') return true;
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
	return findRoute(game, target.routeId) !== undefined;
}

export function sameEventTarget(left: EventTarget, right: EventTarget): boolean {
	if (left.kind === 'company' || right.kind === 'company') {
		return left.kind === right.kind;
	}
	return left.routeId === right.routeId;
}

export function cloneEventTarget(target: EventTarget): EventTarget {
	if (target.kind === 'company') return { kind: 'company' };
	return { kind: 'recurring-route', routeId: target.routeId };
}

export function getEventTargetCopyParams(
	game: GameState,
	target: EventTarget
): StructuredCopyParams {
	if (target.kind === 'company') return {};
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

function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}
