import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import type { DailyProductReport, DailyReport, DailyStoreReport } from '$lib/game/types';
import { runProgressionBot, type ProgressionRunResult } from './bots';
import { chainMaterialIds, parseChainEvidenceArgs, summarizeChainEvidence } from './chainEvidence';

const BASE_ARGS = [
	'--seeds',
	'20260503',
	'--days',
	'365',
	'--archetype',
	'electronics',
	'--product',
	'accessories'
];

describe('parseChainEvidenceArgs', () => {
	it('rejects a literal ellipsis placeholder in --seeds', () => {
		expect(() =>
			parseChainEvidenceArgs([
				...BASE_ARGS.slice(0, 1),
				'20260501,…,20260550',
				...BASE_ARGS.slice(2)
			])
		).toThrow(/positive integer/);
	});

	it('requires archetype and product flags', () => {
		expect(() => parseChainEvidenceArgs(['--seeds', '42', '--days', '10'])).toThrow(/--archetype/);
	});

	it('rejects products without a production material', () => {
		expect(() =>
			parseChainEvidenceArgs([
				'--seeds',
				'42',
				'--days',
				'10',
				'--archetype',
				'boutique',
				'--product',
				'apparel'
			])
		).toThrow(/productionMaterialId/);
	});
});

describe('chainMaterialIds', () => {
	it('derives the accessories upstream closure from the recipe graph', () => {
		const materials = chainMaterialIds('electronic-accessories');
		for (const expected of [
			'electronic-accessories',
			'circuit-boards',
			'packaging',
			'copper-ore',
			'plastic'
		]) {
			expect(materials).toContain(expected);
		}
	});
});

function fakeProductReport(warehouseUnits: number): DailyProductReport {
	return {
		productId: 'accessories',
		brandId: 'common-ground',
		name: 'Accessories',
		unitsSold: 0,
		demandMissed: 0,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		endingStock: 0,
		warehouseUnits,
		warehouseValue: 0,
		importedUnits: 0,
		importCost: 0,
		importSpend: 0,
		wasteUnits: 0,
		wasteValue: 0,
		shrinkUnits: 0,
		shrinkValue: 0,
		stockoutLostDemand: 0,
		averageAgeDays: null,
		oldestSellableAgeDays: null,
		trendMultiplier: 1,
		obsolescenceMultiplier: 1,
		baseSellingPrice: 0,
		effectiveSellingPrice: 0,
		markdownAmount: 0
	};
}

function fakeStoreReport(storeId: string, warehouseUnits: number): DailyStoreReport {
	return {
		storeId,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		importSpend: 0,
		netIncome: 0,
		customersServed: 0,
		demandMissed: 0,
		staffingCoverage: 1,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 100,
		staffMorale: 50,
		reputation: 50,
		brandReputationAdjustment: 0,
		marketPosition: 50,
		productReports: [fakeProductReport(warehouseUnits)],
		inventoryLossExpense: 0,
		warnings: [],
		replenishment: null
	};
}

function fakeDailyReport(day: number, storeReports: DailyStoreReport[]): DailyReport {
	return {
		day,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		payrollCost: 0,
		importSpend: 0,
		cashBefore: 0,
		operatingIncome: 0,
		operatingCashFlow: 0,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: 0,
		netIncome: 0,
		cashAfter: 0,
		outstandingPrincipalAfter: 0,
		companyBookValueAfter: 0,
		nextLoanPayment: null,
		scorecard: { profit: 0, customerSatisfaction: 0, staffMorale: 0, marketPosition: 0 },
		productionReport: {
			produced: [],
			consumed: [],
			importedInputs: [],
			warehousePulls: [],
			shopImports: [],
			importSpend: 0,
			operatingCost: 0,
			overflowUnits: 0,
			overflowCost: 0,
			warehouseCapacity: 0,
			warehouseUsed: 0,
			railShipments: [],
			railUsage: {},
			cityInventories: []
		},
		logistics: {
			arrivals: [],
			routeDispatchAttempts: [],
			deliveredUnits: 0,
			scheduledTransportCost: 0,
			modifierRecoveries: []
		},
		storeReports,
		marketReports: [],
		inventoryLossExpense: 0,
		modifierImpacts: [],
		modifierLifecycle: [],
		warnings: []
	};
}

function fakeRunResult(game: ReturnType<typeof createNewGame>): ProgressionRunResult {
	return {
		game,
		ledger: {
			seed: game.seed,
			archetypeId: 'electronics',
			bot: 'progression',
			foundingTileId: 'tile-a1',
			foundingCash: 0,
			openings: [],
			actions: []
		},
		progression: {
			claims: [],
			creditEvents: [],
			repayments: [],
			supplyChainsComplete: new Set()
		},
		digest: { actions: [], claims: [], creditEvents: [], repayments: [], finalCash: 0 }
	};
}

describe('summarizeChainEvidence', () => {
	it('counts distinct delivery days when several stores receive stock on one day', () => {
		const game = createNewGame('electronics', 424242);
		game.reports = [
			fakeDailyReport(5, [fakeStoreReport('store-1', 3), fakeStoreReport('store-2', 4)]),
			fakeDailyReport(6, [fakeStoreReport('store-1', 0), fakeStoreReport('store-2', 0)]),
			fakeDailyReport(7, [fakeStoreReport('store-2', 2)])
		];
		const evidence = summarizeChainEvidence(424242, fakeRunResult(game), {
			days: 7,
			product: 'accessories',
			costBuildings: []
		});
		expect(evidence.product.warehouseUnits).toBe(9);
		expect(evidence.product.firstLocalDeliveryDay).toBe(5);
		expect(evidence.product.localDeliveryDays).toBe(2);
	});

	// Re-runs the real 365-day electronics progression bot, so it needs the
	// heavy-spec headroom progressionBots.spec.ts reserves for the same run.
	it(
		'captures deterministic chain evidence for the 20260503 reference run',
		{ timeout: 30_000 },
		() => {
			const evidence = summarizeChainEvidence(
				20260503,
				runProgressionBot('electronics', 20260503, 365),
				{
					days: 365,
					product: 'accessories',
					costBuildings: ['copper-mine', 'circuit-board-plant', 'accessory-assembly-plant']
				}
			);
			expect(evidence.claims).toEqual([
				{ tierId: 'local-shop', claimedOnDay: 49 },
				{ tierId: 'neighborhood-chain', claimedOnDay: 57 },
				{ tierId: 'regional-supplier', claimedOnDay: 260 }
			]);
			expect(evidence.product).toMatchObject({
				warehouseUnits: 463,
				firstLocalDeliveryDay: 245,
				localDeliveryDays: 17,
				demandMissed: 25041
			});
			expect(evidence.chainMaterials['electronic-accessories']!.produced).toBe(541);
			expect(evidence.chainMaterials['circuit-boards']!.produced).toBe(489);
			expect(evidence.chainMaterials['copper-ore']!.importedInputQuantity).toBe(149);
			const copperMine = evidence.buildings.find((building) => building.typeId === 'copper-mine');
			expect(copperMine).toMatchObject({ builtOnDay: 15, producedTotal: 265, chainBuilding: true });
			expect(copperMine!.fixedOperatingCost).toBeGreaterThan(0);
			const warehouse = evidence.buildings.find((building) => building.typeId === 'warehouse');
			expect(warehouse).toMatchObject({ builtOnDay: 113 });
			expect(warehouse!.fixedOperatingCost).toBe(0);
			expect(warehouse!.recipeOperatingEstimate).toBe(0);
			expect(evidence.costScope.buildingTypeIds).toEqual([
				'accessory-assembly-plant',
				'circuit-board-plant',
				'copper-mine'
			]);
			expect(evidence.costScope.fixedOperating).toBeGreaterThan(0);
		}
	);
});
