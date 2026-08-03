import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import { openWorldCity } from '$lib/game/world';
import { createI18n } from '$lib/i18n';
import { buildRetailCitySupplyViews } from './retailSupplySources';
import type { GameState, WorldCityId } from '$lib/game/types';

function openCity(game: GameState, cityId: WorldCityId): GameState {
	return openWorldCity(
		{
			...game,
			cash: 1_000_000,
			world: {
				...game.world,
				revealedCityIds: game.world.revealedCityIds.includes(cityId)
					? game.world.revealedCityIds
					: [...game.world.revealedCityIds, cityId]
			}
		},
		cityId
	);
}

function supplyFixture(): GameState {
	let game = createNewGame('convenience', 292_014);
	game = openCity(game, 'breadbasket-basin');
	game = openCity(game, 'campus-junction');
	game = openCity(game, 'garden-borough');

	return {
		...game,
		cityInventories: game.cityInventories!.map((inventory) => {
			if (inventory.cityId === 'industry-city') {
				return {
					...inventory,
					capacity: 20,
					materials: { snacks: 27 },
					overflowUnits: 7,
					overflowCost: 14
				};
			}

			if (inventory.cityId === 'breadbasket-basin') {
				return {
					...inventory,
					capacity: 40,
					materials: { drinks: 3 },
					overflowUnits: 0,
					overflowCost: 0
				};
			}

			return inventory;
		}),
		retailSupplyAssignments: [
			{ retailCityId: 'garden-borough', supplyCityId: null },
			{ retailCityId: 'harbor-city', supplyCityId: 'breadbasket-basin' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		],
		warehouse: {
			capacity: 999,
			materials: { snacks: 999 },
			overflowUnits: 999,
			overflowCost: 999
		}
	};
}

describe('buildRetailCitySupplyViews', () => {
	it('uses the canonical catalog order for opened retail cities and valid source options', () => {
		const views = buildRetailCitySupplyViews(supplyFixture(), createI18n('en'));

		expect(views.map((view) => view.retailCityId)).toEqual([
			'harbor-city',
			'campus-junction',
			'garden-borough'
		]);
		expect(
			views[0]!.sourceOptions
				.filter((option) => !option.disabled)
				.map((option) => option.supplyCityId)
		).toEqual(['industry-city', 'breadbasket-basin']);
	});

	it('reads availability, used capacity, and overflow from each named city inventory', () => {
		const [harbor] = buildRetailCitySupplyViews(supplyFixture(), createI18n('en'));
		const industryCity = harbor!.sourceOptions.find(
			(option) => option.supplyCityId === 'industry-city'
		)!;
		const breadbasket = harbor!.sourceOptions.find(
			(option) => option.supplyCityId === 'breadbasket-basin'
		)!;

		expect(industryCity.inventorySummary).toBe('27 / 20 city inventory used.');
		expect(industryCity.overflowSummary).toBe('Overflow: 7 units ($14).');
		expect(breadbasket.inventorySummary).toBe('3 / 40 city inventory used.');
		expect(breadbasket.overflowSummary).toBe('No overflow.');
		expect(`${industryCity.inventorySummary} ${industryCity.overflowSummary}`).not.toContain('999');
	});

	it('keeps zero capacity, empty stock, and overflow text-distinguishable', () => {
		const game = supplyFixture();
		const views = buildRetailCitySupplyViews(
			{
				...game,
				cityInventories: game.cityInventories!.map((inventory) => {
					if (inventory.cityId === 'industry-city') {
						return {
							...inventory,
							capacity: 0,
							materials: {},
							overflowUnits: 1,
							overflowCost: 2
						};
					}

					if (inventory.cityId === 'breadbasket-basin') {
						return { ...inventory, materials: {} };
					}

					return inventory;
				})
			},
			createI18n('en')
		);
		const [harbor] = views;
		const industryCity = harbor!.sourceOptions.find(
			(option) => option.supplyCityId === 'industry-city'
		)!;
		const breadbasket = harbor!.sourceOptions.find(
			(option) => option.supplyCityId === 'breadbasket-basin'
		)!;

		expect(industryCity.inventorySummary).toBe('0 / 0 city inventory used.');
		expect(industryCity.overflowSummary).toBe('Overflow: 1 units ($2).');
		expect(breadbasket.inventorySummary).toBe('0 / 40 city inventory used.');
	});

	it('keeps explicit Imports only separate from a missing assignment', () => {
		const game = supplyFixture();
		const views = buildRetailCitySupplyViews(
			{
				...game,
				retailSupplyAssignments: game.retailSupplyAssignments!.filter(
					(assignment) => assignment.retailCityId !== 'campus-junction'
				)
			},
			createI18n('en')
		);

		const importsOnly = views.find((view) => view.retailCityId === 'garden-borough')!;
		const missing = views.find((view) => view.retailCityId === 'campus-junction')!;

		expect(importsOnly.currentSelection).toBeNull();
		expect(importsOnly.currentSummary).toBe(
			'Imports only. All replenishment is covered by external imports.'
		);
		expect(missing.currentSelection).toBe('missing');
		expect(missing.currentSummary).toBe('Supply configuration unavailable.');
	});

	it('keeps a stale configured source visible and disabled without treating it as a valid option', () => {
		const game = supplyFixture();
		const views = buildRetailCitySupplyViews(
			{
				...game,
				retailSupplyAssignments: game.retailSupplyAssignments!.map((assignment) =>
					assignment.retailCityId === 'harbor-city'
						? { ...assignment, supplyCityId: 'quarry-works' }
						: assignment
				)
			},
			createI18n('en')
		);
		const harbor = views.find((view) => view.retailCityId === 'harbor-city')!;
		const stale = harbor.sourceOptions.find((option) => option.supplyCityId === 'quarry-works')!;

		expect(harbor.currentSelection).toBe('quarry-works');
		expect(harbor.currentSummary).toBe('Quarry Works is unavailable.');
		expect(stale).toMatchObject({ disabled: true, available: false });
		expect(harbor.sourceOptions.filter((option) => !option.disabled)).not.toContainEqual(stale);
	});
});
