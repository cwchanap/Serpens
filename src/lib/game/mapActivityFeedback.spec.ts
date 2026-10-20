import { describe, expect, test } from 'vitest';
import { createOneCityInventoryFixture } from './cityInventory.testUtils';
import { selectMapActivity, type MapActivity } from './mapActivityFeedback';
import { simulateDay } from './simulateDay';
import { createNewGame, openStore, updatePolicy, upgradeStore } from './state';
import type { DailyMaterialMovement, GameState, IndustrialBuilding, MaterialId } from './types';

const pumpActivity: MapActivity = {
	kind: 'production',
	cityId: 'industry-city',
	entityId: 'pump',
	materialId: 'water'
};

const bottlerActivity: MapActivity = {
	kind: 'production',
	cityId: 'industry-city',
	entityId: 'bottler',
	materialId: 'bottled-water'
};

// The fixture's pump and bottler really produce when one day closes.
function closedFixtureDay(): { before: GameState; after: GameState } {
	const before = createOneCityInventoryFixture();
	return { before, after: simulateDay(before) };
}

function withBuilding(
	game: GameState,
	buildingId: string,
	patch: Partial<IndustrialBuilding>
): GameState {
	return {
		...game,
		industrialBuildings: game.industrialBuildings.map((building) =>
			building.id === buildingId ? { ...building, ...patch } : building
		)
	};
}

function localOutput(materialId: MaterialId, quantity: number): DailyMaterialMovement {
	return { cityId: 'industry-city', materialId, quantity, value: quantity, source: 'local' };
}

describe('selectMapActivity', () => {
	describe('store lifecycle', () => {
		test('reports a founding store as opened and no production', () => {
			const { after } = closedFixtureDay();

			expect(selectMapActivity(null, after)).toEqual([
				{ kind: 'store-opened', cityId: 'harbor-city', entityId: 'store-1' }
			]);
		});

		test('reports only the newly opened store', () => {
			const before = { ...createNewGame('convenience', 20260603), cash: 1_000_000 };
			const after = openStore(before, {
				archetypeId: 'convenience',
				location: { neighborhoodId: 'downtown', x: 0, y: 0 }
			});

			expect(selectMapActivity(before, after)).toEqual([
				{ kind: 'store-opened', cityId: 'harbor-city', entityId: 'store-2' }
			]);
		});

		test('reports a higher store level as upgraded', () => {
			const before = { ...createNewGame('convenience', 20260603), cash: 100_000 };
			const after = upgradeStore(before, 'store-1');

			expect(selectMapActivity(before, after)).toEqual([
				{ kind: 'store-upgraded', cityId: 'harbor-city', entityId: 'store-1' }
			]);
		});
	});

	describe('unchanged and non-map transitions', () => {
		test('reports nothing for the same, cloned, or policy-only state', () => {
			const { before, after } = closedFixtureDay();

			expect(selectMapActivity(after, after)).toEqual([]);
			expect(selectMapActivity(after, structuredClone(after))).toEqual([]);
			expect(selectMapActivity(before, updatePolicy(before, { pricing: 'premium' }))).toEqual([]);
		});
	});

	describe('industrial production', () => {
		test('reports each producer with positive output from a newly appended report', () => {
			const { before, after } = closedFixtureDay();

			expect(selectMapActivity(before, after)).toEqual([bottlerActivity, pumpActivity]);
		});

		test.each(['produced', 'stalled', 'imported-inputs'] as const)(
			'reports positive output for a %s building',
			(status) => {
				const { before, after } = closedFixtureDay();
				const next = withBuilding(after, 'pump', {
					status,
					lastProduction: [localOutput('water', 3)]
				});

				expect(selectMapActivity(before, next)).toEqual([bottlerActivity, pumpActivity]);
			}
		);

		test('ignores producers with zero output or an empty full-buffer stall', () => {
			const { before, after } = closedFixtureDay();
			const next = withBuilding(
				withBuilding(after, 'pump', {
					status: 'produced',
					lastProduction: [localOutput('water', 0)]
				}),
				'bottler',
				{ status: 'stalled', lastProduction: [] }
			);

			expect(selectMapActivity(before, next)).toEqual([]);
		});

		test('does not replay stale output without a newly appended report', () => {
			const { before, after } = closedFixtureDay();
			const unrelated = { ...after, cash: after.cash + 1 };
			const outputWithoutReport = withBuilding(before, 'pump', {
				status: 'produced',
				lastProduction: [localOutput('water', 40)]
			});

			expect(selectMapActivity(after, unrelated)).toEqual([]);
			expect(selectMapActivity(before, outputWithoutReport)).toEqual([]);
		});

		test('ignores imports, rail moves, and inventory changes without a new report', () => {
			const { before } = closedFixtureDay();
			const moved: GameState = {
				...before,
				cityInventories: before.cityInventories.map((inventory) => ({
					...inventory,
					materials: { ...inventory.materials, water: 1 }
				})),
				industrialBuildings: before.industrialBuildings.map((building) => ({
					...building,
					status: 'imported-inputs',
					importedInputTotal: building.importedInputTotal + 5,
					inventory: { water: 5 }
				}))
			};

			expect(selectMapActivity(before, moved)).toEqual([]);
		});

		test('keeps every producer on a busy day in stable order', () => {
			const before = createOneCityInventoryFixture();
			const extraPumps = Array.from({ length: 10 }, (_, index) => ({
				...before.industrialBuildings[0]!,
				id: `pump-${index}`,
				tileId: `industry-city-${20 + index}-6`,
				mapX: 20 + index,
				mapY: 6
			}));
			const busyBefore = {
				...before,
				industrialBuildings: [...before.industrialBuildings, ...extraPumps]
			};
			const busyAfter = simulateDay(busyBefore);
			const activities = selectMapActivity(busyBefore, busyAfter);
			const reversed = {
				...busyAfter,
				industrialBuildings: [...busyAfter.industrialBuildings].reverse()
			};

			expect(activities.map((activity) => activity.entityId)).toEqual([
				'bottler',
				'pump',
				...extraPumps.map((pump) => pump.id)
			]);
			expect(selectMapActivity(busyBefore, reversed)).toEqual(activities);
		});

		test('orders mixed activity by kind, city, and entity', () => {
			const { before, after } = closedFixtureDay();
			const upgraded = upgradeStore(after, 'store-1');

			expect(selectMapActivity(before, upgraded)).toEqual([
				bottlerActivity,
				pumpActivity,
				{ kind: 'store-upgraded', cityId: 'harbor-city', entityId: 'store-1' }
			]);
		});
	});

	test('does not mutate the accepted states it reads', () => {
		const { before, after } = closedFixtureDay();
		const beforeSnapshot = structuredClone(before);
		const afterSnapshot = structuredClone(after);

		expect(selectMapActivity(before, after)).toEqual([bottlerActivity, pumpActivity]);
		expect(before).toEqual(beforeSnapshot);
		expect(after).toEqual(afterSnapshot);
	});
});
