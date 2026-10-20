import { compareCodeUnits } from './eventTargets';
import type { GameState, MaterialId } from './types';

export type MapActivity =
	| { kind: 'store-opened' | 'store-upgraded'; cityId: string; entityId: string }
	| { kind: 'production'; cityId: string; entityId: string; materialId: MaterialId };

/**
 * Presentation-only diff of an accepted state change. Production counts only
 * when a daily report was appended; a producer's lastProduction is then the
 * same movement list the aggregate report recorded for that tick.
 */
export function selectMapActivity(previous: GameState | null, next: GameState): MapActivity[] {
	const activities: MapActivity[] = [];
	const previousStores = new Map(
		(previous?.stores ?? []).map((store) => [store.id, store] as const)
	);

	for (const store of next.stores) {
		const before = previousStores.get(store.id);

		if (!before) {
			activities.push({ kind: 'store-opened', cityId: store.cityId, entityId: store.id });
		} else if (store.level > before.level) {
			activities.push({ kind: 'store-upgraded', cityId: store.cityId, entityId: store.id });
		}
	}

	if (previous && hasNewDailyReport(previous, next)) {
		for (const building of next.industrialBuildings) {
			const output = building.lastProduction.find((movement) => movement.quantity > 0);

			if (output) {
				activities.push({
					kind: 'production',
					cityId: building.cityId,
					entityId: building.id,
					materialId: output.materialId
				});
			}
		}
	}

	return activities.sort(compareActivities);
}

export interface MapActivityBatch {
	seq: number;
	activities: readonly MapActivity[];
}

/**
 * Next route batch for an accepted change: the same batch object when nothing
 * is visible, otherwise a new sequence. Never throws, because an exception in
 * the accepted-change observer would read as a failed write for a commit that
 * already landed.
 */
export function nextMapActivityBatch(
	current: MapActivityBatch,
	previous: GameState | null,
	next: GameState
): MapActivityBatch {
	try {
		const activities = selectMapActivity(previous, next);
		return activities.length > 0 ? { seq: current.seq + 1, activities } : current;
	} catch (error) {
		console.warn('Unable to project map activity for an accepted change', error);
		return current;
	}
}

function hasNewDailyReport(previous: GameState, next: GameState): boolean {
	const latest = next.reports.at(-1);

	if (!latest || next.reports.length <= previous.reports.length) {
		return false;
	}

	const prior = previous.reports.at(-1);
	return !prior || latest.day > prior.day;
}

function compareActivities(left: MapActivity, right: MapActivity): number {
	return (
		compareCodeUnits(left.kind, right.kind) ||
		compareCodeUnits(left.cityId, right.cityId) ||
		compareCodeUnits(left.entityId, right.entityId)
	);
}
