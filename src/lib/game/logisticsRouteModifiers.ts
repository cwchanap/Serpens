import { isModifierActiveOnDay } from './eventModifiers';
import type { ActiveEventModifier, RecurringRoute, StructuredCopyRef } from './types';

export interface RouteModifierContributionBase {
	modifierId: string;
	source: ActiveEventModifier['source'];
	explanation: StructuredCopyRef;
}

/**
 * One in-memory row per active route modifier that affects the resolved route.
 * Discriminated by effect kind; carries the authored value relevant to the
 * effect. This is a resolver result, never the persisted daily-report shape.
 */
export type RouteModifierContribution =
	| (RouteModifierContributionBase & {
			effectKind: 'route-lead-time-adjustment';
			days: number;
	  })
	| (RouteModifierContributionBase & {
			effectKind: 'route-capacity-multiplier';
			multiplier: number;
	  })
	| (RouteModifierContributionBase & { effectKind: 'route-dispatch-suspension' })
	| (RouteModifierContributionBase & {
			effectKind: 'route-transport-cost-multiplier';
			multiplier: number;
	  });

/**
 * Derived effective route behavior for one day. Never persisted; the base
 * {@link RecurringRoute} stays the only authoritative route state.
 */
export interface EffectiveRecurringRoute {
	base: RecurringRoute;
	capacity: number;
	leadTimeDays: number;
	transportCostMultiplier: number;
	transportCostPerUnit: number;
	dispatchSuspended: boolean;
	contributions: RouteModifierContribution[];
}

/**
 * Resolve the effective route values from the base route plus the active
 * route-targeted modifiers that apply on `day`. Matching modifiers are sorted
 * by modifier ID before reduction; the route is never mutated.
 */
export function resolveEffectiveRecurringRoute(
	route: RecurringRoute,
	modifiers: readonly ActiveEventModifier[],
	day: number
): EffectiveRecurringRoute {
	const matchingModifiers = modifiers
		.filter(
			(modifier) =>
				modifier.target.kind === 'recurring-route' &&
				modifier.target.routeId === route.id &&
				isModifierActiveOnDay(modifier, day)
		)
		.sort(compareModifierIds);

	let leadTimeDays = route.leadTimeDays;
	let capacityMultiplier = 1;
	let transportCostMultiplier = 1;
	let dispatchSuspended = false;
	const contributions: RouteModifierContribution[] = [];

	for (const modifier of matchingModifiers) {
		const base = {
			modifierId: modifier.id,
			source: { ...modifier.source },
			explanation: { ...modifier.explanation, params: { ...modifier.explanation.params } }
		};
		switch (modifier.effect.kind) {
			case 'route-lead-time-adjustment':
				leadTimeDays = checkedAdd(leadTimeDays, modifier.effect.days, 'Recurring route lead time');
				contributions.push({
					...base,
					effectKind: 'route-lead-time-adjustment',
					days: modifier.effect.days
				});
				break;
			case 'route-capacity-multiplier':
				capacityMultiplier *= modifier.effect.multiplier;
				contributions.push({
					...base,
					effectKind: 'route-capacity-multiplier',
					multiplier: modifier.effect.multiplier
				});
				break;
			case 'route-dispatch-suspension':
				dispatchSuspended = true;
				contributions.push({ ...base, effectKind: 'route-dispatch-suspension' });
				break;
			case 'route-transport-cost-multiplier':
				transportCostMultiplier *= modifier.effect.multiplier;
				contributions.push({
					...base,
					effectKind: 'route-transport-cost-multiplier',
					multiplier: modifier.effect.multiplier
				});
				break;
			case 'import-cost-multiplier':
				// Unreachable for route-targeted modifiers: company modifiers are
				// filtered out above, and definitions reject route targets with
				// import-cost effects.
				continue;
		}
	}

	return {
		base: route,
		capacity: Math.max(1, Math.floor(route.capacity * capacityMultiplier)),
		leadTimeDays,
		transportCostMultiplier,
		transportCostPerUnit: route.transportCostPerUnit * transportCostMultiplier,
		dispatchSuspended,
		contributions
	};
}

function compareModifierIds(left: ActiveEventModifier, right: ActiveEventModifier): number {
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function checkedAdd(left: number, right: number, label: string): number {
	const sum = left + right;
	if (!Number.isSafeInteger(sum)) {
		throw new RangeError(`${label} exceeds the safe integer range`);
	}

	return sum;
}
