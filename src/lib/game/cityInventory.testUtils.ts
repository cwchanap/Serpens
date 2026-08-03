import { createNewGame } from './state';
import { openWorldCity } from './world';
import type { GameState, IndustrialBuilding, MaterialId, RailCell } from './types';

function createFixtureBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	mapX: number,
	mapY: number,
	inventory: Partial<Record<MaterialId, number>> = {}
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId: 'industry-city',
		tileId: `industry-city-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		inventory,
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function createFixtureRails(): RailCell[] {
	const rails: RailCell[] = [];

	for (let x = 2; x <= 19; x += 1) {
		rails.push({ x, y: 4, level: 10 });
	}

	return rails;
}

export function createOneCityInventoryFixture(): GameState {
	const game = createNewGame('convenience', 20260802);
	const store = game.stores[0]!;

	return {
		...game,
		day: 7,
		cash: 100_000,
		industryCities: game.industryCities.map((city) =>
			city.id === 'industry-city' ? { ...city, rails: createFixtureRails() } : city
		),
		industrialBuildings: [
			createFixtureBuilding('pump', 'water-pump', 2, 2),
			createFixtureBuilding('bottler', 'water-bottler', 10, 2),
			createFixtureBuilding('warehouse', 'warehouse', 18, 2)
		],
		cityInventories: [
			{
				cityId: 'industry-city',
				capacity: 200,
				materials: { water: 190, 'bottled-water': 5 },
				overflowUnits: 0,
				overflowCost: 0
			}
		],
		stores: [
			{
				...store,
				products: [
					{
						categoryId: 'bottled-water',
						stock: 0,
						reorderThreshold: 20,
						targetStock: 20,
						sellingPrice: 3
					}
				]
			}
		]
	};
}

export function createOpenedMultiCityFixture(): GameState {
	const game = createNewGame('convenience', 20260803);

	return openWorldCity(
		{
			...game,
			cash: 100_000,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
			}
		},
		'campus-junction'
	);
}

export function projectOneCityParity(game: GameState) {
	const latest = game.reports.at(-1);
	return {
		cash: game.cash,
		cityInventories: game.cityInventories.map((inventory) => ({
			cityId: inventory.cityId,
			capacity: inventory.capacity,
			materials: { ...inventory.materials },
			overflowUnits: inventory.overflowUnits,
			overflowCost: inventory.overflowCost
		})),
		stores: game.stores.map((store) => ({
			id: store.id,
			products: store.products.map((product) => ({
				categoryId: product.categoryId,
				stock: product.stock
			}))
		})),
		report: latest
			? {
					importSpend: latest.importSpend,
					netCashChange: latest.netCashChange,
					production: latest.productionReport
				}
			: null
	};
}
