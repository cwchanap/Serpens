import { buildWarehouseFlowGraph } from '$lib/game/productChainGraph';
import { createNewGame } from '$lib/game/state';
import type { GameAlert } from '$lib/game/alerts';
import type { DecisionItem, Store, MaterialId } from '$lib/game/types';
import type { DecisionContext } from '$lib/game/decisionContext';
import type { ProductChainGraph, ProductChainNode } from '$lib/game/productChainGraph';
import type { WorldCityId } from '$lib/game/types';
import {
	decisionContextExpansionCashBlocked,
	decisionContextExpansionUnavailable,
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialRequiresCash,
	decisionContextIndustrialRequiresResource,
	decisionContextIndustrialUnknownBuilding,
	decisionContextIndustrialUnknownTile,
	decisionContextLocationBlocked,
	decisionContextLocationGeneric,
	decisionContextWorldCityNotAvailableYet,
	decisionContextWorldCityOpeningCost,
	decisionContextWorldCityUnknown
} from '$lib/game/decisionContext';
import { getWorldCityStatus } from '$lib/game/world';
import { describe, expect, it } from 'vitest';
import { createI18n } from './index';
import { messagesByLocale } from './messages';
import {
	formatPlacementBlockReason,
	localizeAlert,
	localizeDecision,
	localizeProductChainGraph,
	localizeReportWarning,
	localizeStockStatus,
	localizeStockTrouble,
	localizeWorldCityStatus,
	storeDisplayName
} from './gameCopy';
import { flattenStrings } from './testUtils';

describe('game copy builders', () => {
	it('localizes stock status and stock-trouble summaries', () => {
		expect.assertions(3);
		const i18n = createI18n('en');
		expect(localizeStockStatus('Healthy', i18n)).toBe('Healthy');
		expect(
			localizeStockTrouble(
				[
					{ stock: 0, reorderThreshold: 4 },
					{ stock: 2, reorderThreshold: 4 }
				],
				i18n
			)
		).toBe('1 product out of stock, 1 product needs import');
		expect(localizeStockStatus('Healthy', createI18n('ja'))).not.toBe('Healthy');
	});

	it('formats placement block reasons', () => {
		expect.assertions(4);
		const i18n = createI18n('en');
		expect(formatPlacementBlockReason({ code: 'retail.storeLimitReached' }, i18n)).toBe(
			'Store limit reached'
		);
		expect(formatPlacementBlockReason({ code: 'retail.requiresCash', amount: 12000 }, i18n)).toBe(
			'Requires $12,000 cash'
		);
		expect(
			formatPlacementBlockReason(
				{ code: 'industry.requiresCash', buildingTypeId: 'warehouse', amount: 8000 },
				i18n
			)
		).toBe('Warehouse requires $8,000 cash.');
		expect(
			formatPlacementBlockReason(
				{
					code: 'industry.rawPlacementBlocked',
					message: decisionContextIndustrialLockedTile()
				},
				i18n
			)
		).toBe('Locked industrial tile');
	});

	it('formats placement block reasons in non-English locales', () => {
		expect.assertions(2);
		const japanese = createI18n('ja');
		expect(formatPlacementBlockReason({ code: 'retail.noValidTiles' }, japanese)).toBe(
			'有効な立地がありません'
		);
		expect(
			formatPlacementBlockReason({ code: 'industry.lockedUntilRetail' }, createI18n('zh-Hant'))
		).not.toBe('Found a retail store to unlock construction.');
	});

	it('rebuilds known alerts and falls back for unknown ones', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260708);
		const troubledGame = {
			...game,
			stores: game.stores.map((store) =>
				store.id === 'store-1'
					? {
							...store,
							products: store.products.map((product) => ({
								...product,
								stock: 0,
								reorderThreshold: 4
							}))
						}
					: store
			)
		};
		const alert: GameAlert = {
			id: 'store-stock:store-1',
			kind: 'store-stock',
			message: 'stale',
			storeId: 'store-1'
		};

		expect(localizeAlert(alert, troubledGame, createI18n('en'))).toBe(
			'Store #1: 1 product out of stock'
		);
		expect(
			localizeAlert(
				{ id: 'unknown', kind: 'decision', message: 'Keep original message' },
				troubledGame,
				createI18n('en')
			)
		).toBe('Keep original message');
	});

	it('localizes known decisions, world-city status copy, and product-chain graph labels', () => {
		expect.assertions(9);
		const english = createI18n('en');
		const japanese = createI18n('ja');
		const decision: DecisionItem = {
			id: 'cash-pressure',
			title: 'Cash pressure',
			context:
				'Cash is below zero. Choose how to keep operations moving while protecting the brand.' as unknown as DecisionContext,
			expiresOnDay: 3,
			options: [
				{
					id: 'short-loan',
					label: 'Short loan',
					description: 'Add emergency working capital and accept pressure on profitability.',
					effects: { cash: 12_000 }
				}
			]
		};
		const localizedDecision = localizeDecision(decision, japanese);
		const game = {
			...createNewGame('convenience', 20260708),
			cash: 1_000,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'] as WorldCityId[],
				openedCityIds: ['harbor-city', 'industry-city'] as WorldCityId[],
				claimedMilestoneIds: []
			}
		};
		const worldStatus = getWorldCityStatus(game, 'campus-junction');
		const graph = buildWarehouseFlowGraph(createNewGame('convenience', 20260708));
		const localizedGraph = localizeProductChainGraph(graph, japanese);

		expect(localizedDecision.title).not.toBe(decision.title);
		expect(localizedDecision.options[0]?.label).not.toBe(decision.options[0]?.label);
		expect(localizeDecision({ ...decision, id: 'unknown' }, english).title).toBe(decision.title);
		expect(worldStatus).not.toBeNull();
		expect(localizeWorldCityStatus(worldStatus!, english).city.name).toBe('Campus Junction');
		expect(localizeWorldCityStatus(worldStatus!, japanese).city.name).not.toBe('Campus Junction');
		expect(localizedGraph.id).toBe(graph.id);
		expect(localizedGraph.title).not.toBe(graph.title);
		expect(localizedGraph.emptyReason).not.toBe(graph.emptyReason);
	});

	it('formats world-city cash requirements with the active locale currency formatter', () => {
		expect.assertions(5);
		const japanese = createI18n('ja');
		const expectedCash = japanese.format.currency(18_000);
		const worldDecision: DecisionItem = {
			id: 'world-city-city-opening-delayed-opening-this-city-requires-18-000-cash-1',
			title: 'City opening delayed',
			context: decisionContextWorldCityOpeningCost(18_000),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const game = {
			...createNewGame('convenience', 20260708),
			cash: 1_000,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'] as WorldCityId[],
				openedCityIds: ['harbor-city', 'industry-city'] as WorldCityId[],
				claimedMilestoneIds: []
			}
		};
		const worldStatus = getWorldCityStatus(game, 'campus-junction');
		const localizedDecision = localizeDecision(worldDecision, japanese);

		expect(worldStatus?.blockedReason).toEqual(decisionContextWorldCityOpeningCost(18_000));
		expect(localizedDecision.context).toContain(expectedCash);
		expect(localizedDecision.context).not.toContain(' 18,000 ');
		expect(worldStatus).not.toBeNull();
		expect(localizeWorldCityStatus(worldStatus!, japanese).blockedReason).toContain(expectedCash);
	});

	it('localizes missing recipe product-chain warnings with material labels', () => {
		expect.assertions(3);
		const japanese = createI18n('ja');
		const graph: ProductChainGraph = {
			id: 'chain:drinks',
			title: 'Drinks',
			nodes: [],
			edges: [],
			details: {},
			warnings: [
				{ code: 'noProductionRecipe', materialId: 'water' },
				{ code: 'noProductionRecipe', materialId: 'unknown-material' as MaterialId }
			],
			emptyReason: null
		};

		const localized = localizeProductChainGraph(graph, japanese);

		expect(localized.warnings[0]).toContain(japanese.labels.material('water'));
		expect(localized.warnings[0]).not.toBe(graph.warnings[0]);
		expect(localized.warnings[1]).toBe(
			japanese.t('copy.productChainGraph.warnings.noProductionRecipe', {
				materialName: japanese.labels.material('unknown-material')
			})
		);
	});

	it('localizes known generated report warnings while preserving fallback text', () => {
		expect.assertions(3);
		const japanese = createI18n('ja');
		const chinese = createI18n('zh-Hant');
		const stores: Store[] = [
			{ ...createNewGame('convenience', 1).stores[0]!, name: 'Founding Store' }
		];

		expect(
			localizeReportWarning(
				{ code: 'shortGeneral', storeId: 'store-1', count: 1234 },
				stores,
				japanese
			)
		).toBe(`Founding Store の一般スタッフが ${japanese.format.integer(1234)} 名不足`);
		expect(localizeReportWarning({ code: 'cashReservesLow' }, stores, japanese)).toBe(
			'現金準備が少なくなっています'
		);
		expect(
			localizeReportWarning({ code: 'stockPressure', storeId: 'store-1' }, stores, chinese)
		).toBe('Founding Store 有庫存壓力');
	});

	it('localizes event, state, and world decision families while preserving unknown fallback', () => {
		expect.assertions(19);
		const japanese = createI18n('ja');
		const english = createI18n('en');

		const expansionOpportunity: DecisionItem = {
			id: 'expansion-opportunity',
			title: 'Expansion opportunity',
			context:
				'Strong profit and cash reserves make a second storefront plausible.' as unknown as DecisionContext,
			expiresOnDay: 5,
			options: [
				{
					id: 'prepare',
					label: 'Prepare',
					description: 'Start scouting locations and lining up the opening plan.',
					effects: {}
				},
				{
					id: 'pass',
					label: 'Pass',
					description: 'Keep capital focused on the current store.',
					effects: {}
				}
			]
		};
		const supplierTerms: DecisionItem = {
			id: 'supplier-terms',
			title: 'Supplier terms',
			context:
				'A supplier is open to revising ordering terms before the next replenishment cycle.' as unknown as DecisionContext,
			expiresOnDay: 5,
			options: [
				{
					id: 'negotiate-credit',
					label: 'Negotiate credit',
					description: 'Stretch payment timing for a small margin penalty.',
					effects: {}
				},
				{
					id: 'bulk-discount',
					label: 'Bulk discount',
					description: 'Commit to larger orders for better unit economics.',
					effects: {}
				}
			]
		};
		const stateDecision: DecisionItem = {
			id: 'location-unavailable-road-1',
			title: 'Location unavailable',
			context: decisionContextLocationBlocked('road'),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const worldDecision: DecisionItem = {
			id: 'world-city-city-opening-delayed-opening-this-city-requires-18-000-cash-1',
			title: 'City opening delayed',
			context: decisionContextWorldCityOpeningCost(18_000),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const unavailableDecision: DecisionItem = {
			id: 'expansion-unavailable-1',
			title: 'Expansion unavailable',
			context: decisionContextExpansionUnavailable(3),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const industrialDecision: DecisionItem = {
			id: 'industrial-construction-delayed-grain-farm-industry-city-1-1-locked-industrial-tile-2',
			title: 'Industrial construction delayed',
			context: decisionContextIndustrialLockedTile(),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};
		const industrialResourceDecision: DecisionItem = {
			id: 'industrial-construction-delayed-grain-farm-industry-city-1-1-requires-grain-field-2',
			title: 'Industrial construction delayed',
			context: decisionContextIndustrialRequiresResource('grain-field'),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};
		const industrialCashDecision: DecisionItem = {
			id: 'industrial-construction-delayed-grain-farm-industry-city-1-1-grain-farm-requires-1-000-cash-2',
			title: 'Industrial construction delayed',
			context: decisionContextIndustrialRequiresCash('grain-farm', 1_000),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};

		expect(localizeDecision(expansionOpportunity, japanese).title).not.toBe(
			expansionOpportunity.title
		);
		expect(localizeDecision(expansionOpportunity, japanese).options[0]?.label).not.toBe(
			expansionOpportunity.options[0]?.label
		);
		expect(localizeDecision(supplierTerms, japanese).title).not.toBe(supplierTerms.title);
		expect(localizeDecision(supplierTerms, japanese).options[0]?.label).not.toBe(
			supplierTerms.options[0]?.label
		);
		expect(localizeDecision(stateDecision, japanese).title).not.toBe(stateDecision.title);
		expect(localizeDecision(stateDecision, japanese).context).not.toBe(stateDecision.context);
		expect(localizeDecision(worldDecision, japanese).title).not.toBe(worldDecision.title);
		expect(localizeDecision(worldDecision, japanese).context).not.toBe(worldDecision.context);
		expect(localizeDecision(unavailableDecision, japanese).context).not.toBe(
			unavailableDecision.context
		);
		expect(localizeDecision(unavailableDecision, japanese).options[0]?.description).not.toBe(
			unavailableDecision.options[0]?.description
		);
		expect(localizeDecision(stateDecision, english).options[0]?.description).toBe(
			'Return to location planning.'
		);
		expect(localizeDecision(industrialDecision, japanese).title).not.toBe(industrialDecision.title);
		expect(localizeDecision(industrialDecision, japanese).context).not.toBe(
			industrialDecision.context
		);
		expect(localizeDecision(industrialDecision, english).options[0]?.description).toBe(
			'Return to industry planning.'
		);
		expect(localizeDecision(industrialResourceDecision, japanese).context).not.toContain(
			'grain field'
		);
		expect(localizeDecision(industrialCashDecision, japanese).context).not.toContain('Grain Farm');
		expect(localizeDecision(industrialCashDecision, japanese).context).toContain(
			japanese.format.currency(1_000)
		);
		expect(localizeDecision(industrialResourceDecision, english).context).toBe(
			'Requires Grain Field'
		);
		expect(localizeDecision({ ...worldDecision, id: 'unknown-decision' }, english).title).toBe(
			worldDecision.title
		);
	});

	it('does not leave known decision-copy branches equal to English in localized catalogs', () => {
		expect.assertions(2);
		const knownDecisionFamilies = [
			'cashPressure',
			'expansionOpportunity',
			'supplierTerms',
			'expansionUnavailable',
			'expansionCashBlocked',
			'locationUnavailable',
			'industrialConstructionDelayed',
			'worldCity',
			'acknowledge'
		] as const;
		const english = messagesByLocale.en.copy.decisions;

		for (const locale of ['ja', 'zh-Hant'] as const) {
			const identicalKeys = knownDecisionFamilies.flatMap((family) => {
				const localized = messagesByLocale[locale].copy.decisions[family];
				const englishFamily = english[family];
				return flattenStrings(localized, [family])
					.filter(({ key, value }) => {
						const englishValue = flattenStrings(englishFamily).find(
							(entry) => `${family}.${entry.key}` === key
						)?.value;
						return englishValue === value;
					})
					.map(({ key }) => key);
			});

			expect(identicalKeys).toEqual([]);
		}
	});

	it('structured-context guard: structured decision contexts localize correctly', () => {
		expect.assertions(11);
		const japanese = createI18n('ja');

		const expansionCashBlocked: DecisionItem = {
			id: 'expansion-cash-blocked-1',
			title: 'Expansion delayed',
			context: decisionContextExpansionCashBlocked(15_000),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const expansionCashLocalized = localizeDecision(expansionCashBlocked, japanese);
		expect(expansionCashLocalized.context).not.toBe(expansionCashBlocked.context);
		expect(expansionCashLocalized.context).toContain(japanese.format.currency(15_000));

		const lockedLocation: DecisionItem = {
			id: 'location-unavailable-locked-1',
			title: 'Location unavailable',
			context: decisionContextLocationBlocked('locked'),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		expect(localizeDecision(lockedLocation, japanese).context).not.toBe(lockedLocation.context);

		const riverLocation: DecisionItem = {
			id: 'location-unavailable-river-1',
			title: 'Location unavailable',
			context: decisionContextLocationBlocked('river'),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		expect(localizeDecision(riverLocation, japanese).context).not.toBe(riverLocation.context);

		const genericLocation: DecisionItem = {
			id: 'location-unavailable-generic-1',
			title: 'Location unavailable',
			context: decisionContextLocationGeneric(),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		expect(localizeDecision(genericLocation, japanese).context).not.toBe(genericLocation.context);

		const cityUnavailable: DecisionItem = {
			id: 'world-city-city-unavailable-1',
			title: 'City unavailable',
			context: decisionContextWorldCityUnknown(),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		expect(localizeDecision(cityUnavailable, japanese).title).not.toBe(cityUnavailable.title);
		expect(localizeDecision(cityUnavailable, japanese).context).not.toBe(cityUnavailable.context);

		const cityNotAvailableYet: DecisionItem = {
			id: 'world-city-city-is-not-available-yet-1',
			title: 'City is not available yet',
			context: decisionContextWorldCityNotAvailableYet('campus-junction'),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		expect(localizeDecision(cityNotAvailableYet, japanese).title).not.toBe(
			cityNotAvailableYet.title
		);
		expect(localizeDecision(cityNotAvailableYet, japanese).context).not.toBe(
			cityNotAvailableYet.context
		);

		const industrialUnknownTile: DecisionItem = {
			id: 'industrial-construction-delayed-1',
			title: 'Industrial construction delayed',
			context: decisionContextIndustrialUnknownTile(),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};
		expect(localizeDecision(industrialUnknownTile, japanese).context).not.toBe(
			industrialUnknownTile.context
		);

		const industrialUnknownBuilding: DecisionItem = {
			id: 'industrial-construction-delayed-2',
			title: 'Industrial construction delayed',
			context: decisionContextIndustrialUnknownBuilding(),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};
		expect(localizeDecision(industrialUnknownBuilding, japanese).context).not.toBe(
			industrialUnknownBuilding.context
		);
	});

	it('golden-phrase guard: regex-matched report warnings still match game module output', () => {
		expect.assertions(4);
		const japanese = createI18n('ja');
		const stores: Store[] = [
			{ ...createNewGame('convenience', 1).stores[0]!, name: 'Founding Store' }
		];

		expect(
			localizeReportWarning({ code: 'nearStaffCapacity', storeId: 'store-1' }, stores, japanese)
		).not.toBe('Founding Store is near staff capacity');
		expect(
			localizeReportWarning(
				{ code: 'shortManager', storeId: 'store-1', count: 2 },
				stores,
				japanese
			)
		).not.toBe('Founding Store is short 2 manager');
		expect(
			localizeReportWarning({ code: 'missedProductDemand', storeId: 'store-1' }, stores, japanese)
		).not.toBe('Founding Store missed product demand');
		expect(
			localizeReportWarning({ code: 'reputationSlipping', storeId: 'store-1' }, stores, japanese)
		).not.toBe('Founding Store reputation is slipping');
	});

	it('structured-dispatch guard: product-chain graph phrases still match game module output', () => {
		expect.assertions(9);
		const japanese = createI18n('ja');

		const baseActual = {
			produced: 0,
			consumed: 0,
			importedInput: 0,
			warehousePulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 0
		};
		const baseCapacity = { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 };
		const warehouseNoCapacityNode: ProductChainNode = {
			id: 'warehouse',
			kind: 'warehouse',
			label: 'Warehouse',
			materialId: null,
			recipeId: null,
			stage: 'warehouse',
			layer: 1,
			row: 0,
			health: 'shortage',
			healthLabel: 'Shortage',
			warehouseStock: 0,
			capacity: baseCapacity,
			actual: baseActual,
			bottleneck: { code: 'warehouseNoCapacity' }
		};
		const graphWithBottleneck: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [warehouseNoCapacityNode],
			edges: [],
			details: {},
			warnings: [],
			emptyReason: null
		};
		const localizedBottleneck = localizeProductChainGraph(graphWithBottleneck, japanese);
		expect(localizedBottleneck.nodes[0]?.bottleneck).not.toBe(
			'No warehouse capacity is available.'
		);

		const overflowNode: ProductChainNode = {
			...warehouseNoCapacityNode,
			bottleneck: { code: 'warehouseOverflow', quantity: 42 }
		};
		const graphWithOverflow: ProductChainGraph = {
			...graphWithBottleneck,
			nodes: [overflowNode]
		};
		const localizedOverflow = localizeProductChainGraph(graphWithOverflow, japanese);
		expect(localizedOverflow.nodes[0]?.bottleneck).not.toBe('42 units are in overflow storage.');

		const availableNode: ProductChainNode = {
			...warehouseNoCapacityNode,
			health: 'healthy',
			bottleneck: { code: 'warehouseAvailable' }
		};
		const graphWithAvailable: ProductChainGraph = {
			...graphWithBottleneck,
			nodes: [availableNode]
		};
		const localizedAvailable = localizeProductChainGraph(graphWithAvailable, japanese);
		expect(localizedAvailable.nodes[0]?.bottleneck).not.toBe('Warehouse capacity is available.');

		const graphWithNoDailyReport: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [],
			edges: [],
			details: {},
			warnings: [{ code: 'noDailyReport' }],
			emptyReason: null
		};
		const localizedWarning = localizeProductChainGraph(graphWithNoDailyReport, japanese);
		expect(localizedWarning.warnings[0]).not.toBe(
			'No daily report yet; latest-day flow is unavailable.'
		);

		const graphWithNoLocalChain: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [],
			edges: [],
			details: {},
			warnings: [],
			emptyReason: 'No local production chain available for this category yet.'
		};
		const localizedEmptyReason = localizeProductChainGraph(graphWithNoLocalChain, japanese);
		expect(localizedEmptyReason.emptyReason).not.toBe(
			'No local production chain available for this category yet.'
		);

		const baseEdge = {
			id: 'e1',
			source: 'n1',
			target: 'n2',
			materialId: null,
			requiredPerCycle: 0,
			actualPerDay: 0,
			health: 'healthy' as const
		};
		const graphWithEdgeIn: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [],
			edges: [{ ...baseEdge, label: { code: 'in', quantity: 10 } }],
			details: {},
			warnings: [],
			emptyReason: null
		};
		expect(localizeProductChainGraph(graphWithEdgeIn, japanese).edges[0]?.label).not.toBe(
			'10/day in'
		);

		const graphWithEdgeOut: ProductChainGraph = {
			...graphWithEdgeIn,
			edges: [{ ...baseEdge, label: { code: 'out', quantity: 5 } }]
		};
		expect(localizeProductChainGraph(graphWithEdgeOut, japanese).edges[0]?.label).not.toBe(
			'5/day out'
		);

		const graphWithEdgeProduced: ProductChainGraph = {
			...graphWithEdgeIn,
			edges: [
				{
					...baseEdge,
					label: {
						code: 'cycle',
						direction: 'produced',
						actual: 8,
						required: 10,
						imported: false
					}
				}
			]
		};
		expect(localizeProductChainGraph(graphWithEdgeProduced, japanese).edges[0]?.label).not.toBe(
			'8/day produced · 10/cycle'
		);

		const graphWithEdgeUsedImported: ProductChainGraph = {
			...graphWithEdgeIn,
			edges: [
				{
					...baseEdge,
					label: {
						code: 'cycle',
						direction: 'used',
						actual: 3,
						required: 5,
						imported: true
					}
				}
			]
		};
		expect(localizeProductChainGraph(graphWithEdgeUsedImported, japanese).edges[0]?.label).not.toBe(
			'3/day used · 5/cycle · import'
		);
	});

	it('storeDisplayName localizes auto-named stores and preserves custom names', () => {
		expect.assertions(4);
		const english = createI18n('en');
		const japanese = createI18n('ja');

		const autoNamed = { name: '' };
		expect(storeDisplayName(autoNamed, 1, english)).toBe('Store #1');
		expect(storeDisplayName(autoNamed, 1, japanese)).toBe('店舗 #1');

		const customNamed = { name: 'My Shop' };
		expect(storeDisplayName(customNamed, 3, english)).toBe('My Shop');
		expect(storeDisplayName(customNamed, 3, japanese)).toBe('My Shop');
	});
});
