import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import type { DailyProductReport, DailyReport, DailyStoreReport } from '$lib/game/types';
import type { ProgressionRunResult } from './bots';
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
		expect(chainMaterialIds('electronic-accessories')).toEqual([
			'chemical-feedstock',
			'circuit-boards',
			'copper-ore',
			'electronic-accessories',
			'packaging',
			'paper-pulp',
			'plastic',
			'pulpwood'
		]);
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
			fakeDailyReport(1, []),
			fakeDailyReport(2, []),
			fakeDailyReport(3, []),
			fakeDailyReport(4, []),
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

	it('throws when options.days does not match game.reports count', () => {
		const game = createNewGame('electronics', 424242);
		game.reports = [fakeDailyReport(1, [])];
		expect(() =>
			summarizeChainEvidence(424242, fakeRunResult(game), {
				days: 5,
				product: 'accessories',
				costBuildings: []
			})
		).toThrow(/options\.days/);
	});

	it('captures chain evidence fields from synthetic run data without running a full simulation', () => {
		const game = createNewGame('electronics', 424242);
		const copperMine = {
			id: 'b-1',
			typeId: 'copper-mine' as const,
			cityId: 'industry-city',
			tileId: 'tile-copper',
			level: 1,
			mapX: 0,
			mapY: 0,
			status: 'idle' as const,
			lastProduction: [],
			blockedDays: 0,
			producedTotal: 50,
			importedInputTotal: 10,
			inventory: { 'copper-ore': 5 }
		};
		const warehouse = {
			id: 'b-2',
			typeId: 'warehouse' as const,
			cityId: 'industry-city',
			tileId: 'tile-warehouse',
			level: 1,
			mapX: 0,
			mapY: 0,
			status: 'idle' as const,
			lastProduction: [],
			blockedDays: 0,
			producedTotal: 0,
			importedInputTotal: 0,
			inventory: {}
		};
		game.industrialBuildings = [copperMine, warehouse];

		const r1 = fakeDailyReport(1, []);
		r1.productionReport.produced = [
			{
				materialId: 'electronic-accessories',
				quantity: 20,
				value: 0,
				source: 'local',
				cityId: 'industry-city'
			}
		];
		r1.productionReport.importedInputs = [
			{
				materialId: 'copper-ore',
				quantity: 10,
				value: 50,
				source: 'import',
				cityId: 'industry-city'
			}
		];

		const r2 = fakeDailyReport(2, [fakeStoreReport('store-1', 15)]);

		game.reports = [r1, r2];

		const runResult = fakeRunResult(game);
		runResult.ledger.actions = [
			{
				day: 1,
				bot: 'progression',
				action: 'progression:build-producer',
				outcome: 'applied',
				detail: 'copper-mine on tile-copper'
			},
			{
				day: 2,
				bot: 'progression',
				action: 'progression:build-warehouse',
				outcome: 'applied',
				detail: 'warehouse on tile-warehouse'
			},
			{
				day: 1,
				bot: 'progression',
				action: 'progression:plan',
				outcome: 'no-op',
				detail: 'accessories: blocked: No path available'
			},
			{
				day: 2,
				bot: 'progression',
				action: 'progression:none',
				outcome: 'no-op',
				detail: 'accessories: complete'
			},
			{
				day: 2,
				bot: 'progression',
				action: 'progression:connect-rail',
				outcome: 'rejected',
				detail: '{"code":"UNREACHABLE"}'
			}
		];

		const evidence = summarizeChainEvidence(424242, runResult, {
			days: 2,
			product: 'accessories',
			costBuildings: ['copper-mine']
		});

		expect(evidence.product.warehouseUnits).toBe(15);
		expect(evidence.product.firstLocalDeliveryDay).toBe(2);
		expect(evidence.product.localDeliveryDays).toBe(1);

		expect(evidence.chainMaterials['electronic-accessories']?.produced).toBe(20);
		expect(evidence.chainMaterials['copper-ore']?.importedInputQuantity).toBe(10);

		const copperBuilding = evidence.buildings.find((b) => b.typeId === 'copper-mine')!;
		expect(copperBuilding.builtOnDay).toBe(1);
		expect(copperBuilding.chainBuilding).toBe(true);
		expect(copperBuilding.fixedOperatingCost).toBeGreaterThan(0);

		const warehouseBuilding = evidence.buildings.find((b) => b.typeId === 'warehouse')!;
		expect(warehouseBuilding.builtOnDay).toBe(2);
		expect(warehouseBuilding.fixedOperatingCost).toBe(0);

		expect(evidence.costScope.buildingTypeIds).toEqual(['copper-mine']);
		expect(evidence.costScope.fixedOperating).toBe(copperBuilding.fixedOperatingCost);

		expect(evidence.plannerNoOpReasons).toEqual({
			'blocked: No path available': 1,
			complete: 1
		});
		expect(evidence.railFailureReasons).toEqual({
			UNREACHABLE: 1
		});
	});
});
