import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import { openWorldCity } from '$lib/game/world';
import { createI18n } from '$lib/i18n';
import { buildRetailCitySupplyViews } from './retailSupplySources';
import type { GameState, IndustrialBuilding, WorldCityId } from '$lib/game/types';

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

function warehouseBuilding(cityId: WorldCityId, id: string): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId: 'warehouse',
		cityId,
		tileId: `${cityId}-warehouse`,
		mapX: 0,
		mapY: 0,
		status: 'idle',
		inventory: {},
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function supplyFixture(): GameState {
	let game = createNewGame('convenience', 292_014);
	game = openCity(game, 'breadbasket-basin');
	game = openCity(game, 'campus-junction');
	game = openCity(game, 'garden-borough');

	return {
		...game,
		industrialBuildings: [
			warehouseBuilding('industry-city', 'industry-city-warehouse'),
			warehouseBuilding('breadbasket-basin', 'breadbasket-basin-warehouse')
		],
		cityInventories: game.cityInventories.map((inventory) => {
			if (inventory.cityId === 'industry-city') {
				return {
					...inventory,
					materials: { snacks: 207 }
				};
			}

			if (inventory.cityId === 'breadbasket-basin') {
				return {
					...inventory,
					materials: { drinks: 3 }
				};
			}

			return inventory;
		}),
		retailSupplyAssignments: [
			{ retailCityId: 'garden-borough', supplyCityId: null },
			{ retailCityId: 'harbor-city', supplyCityId: 'breadbasket-basin' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]
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
		expect(views[0]!.sourceOptions.map((option) => option.supplyCityId)).toEqual([
			'industry-city',
			'breadbasket-basin'
		]);
	});

	it('reads availability, used capacity, and overflow from each named city inventory', () => {
		const [harbor] = buildRetailCitySupplyViews(supplyFixture(), createI18n('en'));
		const industryCity = harbor!.sourceOptions.find(
			(option) => option.supplyCityId === 'industry-city'
		)!;
		const breadbasket = harbor!.sourceOptions.find(
			(option) => option.supplyCityId === 'breadbasket-basin'
		)!;

		expect(industryCity.inventorySummary).toBe('207 / 200 city inventory used.');
		expect(industryCity.overflowSummary).toBe('Overflow: 7 units ($14).');
		expect(breadbasket.inventorySummary).toBe('3 / 200 city inventory used.');
		expect(breadbasket.overflowSummary).toBe('No overflow.');
		expect(`${industryCity.inventorySummary} ${industryCity.overflowSummary}`).not.toContain('40');
	});

	it('keeps zero capacity, empty stock, and overflow text-distinguishable', () => {
		const game = supplyFixture();
		const views = buildRetailCitySupplyViews(
			{
				...game,
				industrialBuildings: game.industrialBuildings.filter(
					(building) => building.cityId !== 'industry-city'
				),
				cityInventories: game.cityInventories!.map((inventory) => {
					if (inventory.cityId === 'industry-city') {
						return {
							...inventory,
							materials: { snacks: 1 }
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

		expect(industryCity.inventorySummary).toBe('1 / 0 city inventory used.');
		expect(industryCity.overflowSummary).toBe('Overflow: 1 unit ($2).');
		expect(breadbasket.inventorySummary).toBe('0 / 200 city inventory used.');
	});

	it('keeps explicit Imports only distinct from local supply', () => {
		const game = supplyFixture();
		const views = buildRetailCitySupplyViews(game, createI18n('en'));

		const importsOnly = views.find((view) => view.retailCityId === 'garden-borough')!;

		expect(importsOnly.currentSelection).toBeNull();
		expect(importsOnly.currentSummary).toBe(
			'Imports only. All replenishment is covered by external imports.'
		);
	});

	it('requires an assignment for each opened retail city instead of fabricating a missing configuration', () => {
		const game = supplyFixture();

		expect(() =>
			buildRetailCitySupplyViews(
				{
					...game,
					retailSupplyAssignments: game.retailSupplyAssignments.filter(
						(assignment) => assignment.retailCityId !== 'campus-junction'
					)
				},
				createI18n('en')
			)
		).toThrow('Retail supply invariant: missing assignment for campus-junction');
	});

	it('requires a configured source to resolve instead of adding a stale synthetic option', () => {
		const game = supplyFixture();

		expect(() =>
			buildRetailCitySupplyViews(
				{
					...game,
					retailSupplyAssignments: game.retailSupplyAssignments.map((assignment) =>
						assignment.retailCityId === 'harbor-city'
							? { ...assignment, supplyCityId: 'quarry-works' }
							: assignment
					)
				},
				createI18n('en')
			)
		).toThrow('City inventory invariant: city-closed for quarry-works');
	});
});
