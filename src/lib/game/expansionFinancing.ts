import {
	FOUNDING_LOAN_TERM_DAYS,
	borrow,
	type FinanceActionResult,
	type FinancedPurchaseReceipt
} from './finance';
import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { getIndustrialPlacementBlockReason, buildIndustrialBuilding } from './industryPlacement';
import { getTileById } from './city';
import { openStoreAtTile } from './placement';
import { getExpansionSetupCost } from './state';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from './storeFootprint';
import { getWorldCityDefinition, openWorldCity } from './world';
import type { ArchetypeId, GameState, IndustrialBuildingTypeId, WorldCityId } from './types';

interface ExpansionPurchaseInput {
	expectedCost: number;
	resolveLiveCost: (candidate: GameState) => number | null;
	cashOnlyPurchase: (candidate: GameState) => GameState;
	postcondition: (candidate: GameState) => boolean;
}

function purchaseFailure(
	game: GameState,
	code: 'purchaseUnavailable' | 'purchaseCostChanged',
	context: Record<string, string | number> = {}
): Extract<FinanceActionResult<FinancedPurchaseReceipt>, { ok: false }> {
	return { ok: false, game, code, context };
}

function financeExpansionPurchase(
	game: GameState,
	input: ExpansionPurchaseInput
): FinanceActionResult<FinancedPurchaseReceipt> {
	const purchaseCost = input.resolveLiveCost(game);
	if (purchaseCost === null || !Number.isSafeInteger(purchaseCost) || purchaseCost < 0) {
		return purchaseFailure(game, 'purchaseUnavailable');
	}
	if (input.expectedCost !== purchaseCost) {
		return purchaseFailure(game, 'purchaseCostChanged', {
			expectedCost: input.expectedCost,
			purchaseCost
		});
	}

	const shortfall = purchaseCost - game.cash;
	if (shortfall <= 0) {
		const purchased = input.cashOnlyPurchase(game);
		return input.postcondition(purchased)
			? {
					ok: true,
					game: purchased,
					receipt: { loanId: '', purchaseCost, financedPrincipal: 0 }
				}
			: purchaseFailure(game, 'purchaseUnavailable');
	}

	const borrowed = borrow(game, {
		purpose: 'expansion',
		amount: shortfall,
		termDays: FOUNDING_LOAN_TERM_DAYS,
		allowBelowMinimum: true
	});
	if (!borrowed.ok) return { ...borrowed, game };

	const purchased = input.cashOnlyPurchase(borrowed.game);
	if (!input.postcondition(purchased)) return purchaseFailure(game, 'purchaseUnavailable');

	return {
		ok: true,
		game: purchased,
		receipt: {
			loanId: borrowed.receipt.loanId,
			purchaseCost,
			financedPrincipal: shortfall
		}
	};
}

export function financeWorldCityOpening(
	game: GameState,
	input: { cityId: WorldCityId; expectedCost: number }
): FinanceActionResult<FinancedPurchaseReceipt> {
	return financeExpansionPurchase(game, {
		expectedCost: input.expectedCost,
		resolveLiveCost: (candidate) => {
			const city = getWorldCityDefinition(input.cityId);
			return city &&
				!candidate.world.openedCityIds.includes(city.id) &&
				candidate.world.revealedCityIds.includes(city.id)
				? city.openingCost
				: null;
		},
		cashOnlyPurchase: (candidate) => openWorldCity(candidate, input.cityId),
		postcondition: (candidate) => candidate.world.openedCityIds.includes(input.cityId)
	});
}

export function financeRetailStoreOpening(
	game: GameState,
	input: { tileId: string; archetypeId: ArchetypeId; expectedCost: number }
): FinanceActionResult<FinancedPurchaseReceipt> {
	return financeExpansionPurchase(game, {
		expectedCost: input.expectedCost,
		resolveLiveCost: (candidate) => {
			const city = candidate.cities.find((item) => item.id === candidate.activeCityId);
			const tile = city ? getTileById(city, input.tileId) : undefined;
			if (!city || !tile || candidate.stores.length >= candidate.storeCap) return null;

			const tileLookup = createCityTileLookup(city);
			const occupiedTileIds = getOccupiedStoreTileIds(city, candidate.stores, tileLookup);
			if (getStoreFootprintPlacementBlockReason(tileLookup, tile, occupiedTileIds)) return null;

			return getExpansionSetupCost(tile, input.archetypeId);
		},
		cashOnlyPurchase: (candidate) => openStoreAtTile(candidate, input),
		postcondition: (candidate) =>
			candidate.stores.length === game.stores.length + 1 &&
			candidate.stores.some(
				(store) => store.tileId === input.tileId && store.archetypeId === input.archetypeId
			)
	});
}

export function financeIndustrialBuilding(
	game: GameState,
	input: {
		tileId: string;
		buildingTypeId: IndustrialBuildingTypeId;
		expectedCost: number;
	}
): FinanceActionResult<FinancedPurchaseReceipt> {
	return financeExpansionPurchase(game, {
		expectedCost: input.expectedCost,
		resolveLiveCost: (candidate) => {
			const buildingType = INDUSTRIAL_BUILDING_TYPES[input.buildingTypeId];
			return buildingType &&
				getIndustrialPlacementBlockReason(candidate, input.tileId, input.buildingTypeId) === null
				? buildingType.buildCost
				: null;
		},
		cashOnlyPurchase: (candidate) => buildIndustrialBuilding(candidate, input),
		postcondition: (candidate) =>
			candidate.industrialBuildings.length === game.industrialBuildings.length + 1 &&
			candidate.industrialBuildings.some(
				(building) => building.tileId === input.tileId && building.typeId === input.buildingTypeId
			)
	});
}
