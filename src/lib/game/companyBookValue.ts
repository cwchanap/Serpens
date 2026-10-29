import { getTileById } from './city';
import { getTotalDebt } from './finance';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS } from './industry';
import { getBuildingUpgradeCost, getStoreUpgradeCost } from './leveling';
import { PRODUCTS } from './products';
import { RAIL_BUILD_COST_PER_CELL, RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL } from './rail';
import { getExpansionSetupCost } from './state';
import { WORLD_CITY_CATALOG } from './worldCatalog';
import type { GameState, MaterialId } from './types';

/**
 * Pure company book-value proxy (design §1 "deliberately simple"): an
 * estimated cost of everything the company currently owns, minus debt.
 * Store/city/industry values are recomputed from immutable location and
 * catalog data — an estimate, not a historical receipt ledger.
 */
export interface CompanyBookValueBreakdown {
	total: number;
	cash: number;
	retailAssets: number;
	cityAccessAssets: number;
	industryAssets: number;
	railAssets: number;
	inventory: number;
	debt: number;
}

/** The founding store was created free, so it contributes no setup cost. */
const FOUNDING_STORE_ID = 'store-1';

/** Sum of completed store-upgrade costs for levels 1 through level − 1. */
function getStoreUpgradeAssetValue(level: number): number {
	let total = 0;
	for (let completed = 1; completed < level; completed++) {
		total += getStoreUpgradeCost(completed);
	}
	return total;
}

function getRetailAssets(game: GameState): number {
	let total = 0;
	for (const store of game.stores) {
		if (store.id !== FOUNDING_STORE_ID) {
			const city = game.cities.find((candidate) => candidate.id === store.cityId);
			const tile = city ? getTileById(city, store.tileId) : undefined;
			if (tile) {
				total += getExpansionSetupCost(tile, store.archetypeId);
			}
		}
		total += getStoreUpgradeAssetValue(store.level);
	}
	return total;
}

/** Each opened nonstarter city is an owned access right worth its catalog openingCost. */
function getCityAccessAssets(game: GameState): number {
	let total = 0;
	for (const cityId of game.world.openedCityIds) {
		const definition = WORLD_CITY_CATALOG.find((city) => city.id === cityId);
		if (definition) {
			total += definition.openingCost;
		}
	}
	return total;
}

/** Sum of completed building-upgrade costs for levels 1 through level − 1. */
function getBuildingUpgradeAssetValue(level: number): number {
	let total = 0;
	for (let completed = 1; completed < level; completed++) {
		total += getBuildingUpgradeCost(completed);
	}
	return total;
}

function getIndustryAssets(game: GameState): number {
	let total = 0;
	for (const building of game.industrialBuildings) {
		total += INDUSTRIAL_BUILDING_TYPES[building.typeId].buildCost;
		total += getBuildingUpgradeAssetValue(building.level);
	}
	return total;
}

function getRailAssets(game: GameState): number {
	let total = 0;
	for (const city of game.industryCities) {
		for (const cell of city.rails) {
			total += RAIL_BUILD_COST_PER_CELL + (cell.level - 1) * RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL;
		}
	}
	return total;
}

/**
 * Remaining owned inventory at flat catalog cost: store product lots, on-hand
 * city/building materials, plus in-transit transfer quantities (dispatch
 * already removed them from the origin, so they are counted exactly once).
 */
function getInventoryValue(game: GameState): number {
	let total = 0;

	for (const store of game.stores) {
		for (const product of store.products) {
			for (const lot of product.lots) {
				total += lot.quantity * PRODUCTS[product.productId].importCost;
			}
		}
	}

	const addMaterials = (materials: Partial<Record<MaterialId, number>>) => {
		for (const [materialId, quantity] of Object.entries(materials)) {
			if (quantity) {
				total += quantity * MATERIALS[materialId as MaterialId].importCost;
			}
		}
	};

	for (const inventory of game.cityInventories) {
		addMaterials(inventory.materials);
	}
	for (const building of game.industrialBuildings) {
		addMaterials(building.inventory);
	}
	for (const transfer of game.logistics.transferOrders) {
		if (transfer.status === 'in-transit') {
			total += transfer.quantity * MATERIALS[transfer.materialId].importCost;
		}
	}

	return total;
}

/**
 * Deterministic book value of the whole company. Sums exact (possibly
 * fractional) catalog-valued amounts and rounds the final total once;
 * negative totals are preserved. Never mutates `game`.
 */
export function getCompanyBookValue(game: GameState): CompanyBookValueBreakdown {
	const cash = game.cash;
	const retailAssets = getRetailAssets(game);
	const cityAccessAssets = getCityAccessAssets(game);
	const industryAssets = getIndustryAssets(game);
	const railAssets = getRailAssets(game);
	const inventory = getInventoryValue(game);
	const debt = getTotalDebt(game);

	const total = Math.round(
		cash + retailAssets + cityAccessAssets + industryAssets + railAssets + inventory - debt
	);

	return {
		total,
		cash,
		retailAssets,
		cityAccessAssets,
		industryAssets,
		railAssets,
		inventory,
		debt
	};
}
