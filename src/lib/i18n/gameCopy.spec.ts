import { buildWarehouseFlowGraph } from '$lib/game/productChainGraph';
import { createNewGame, getExpansionSetupCost } from '$lib/game/state';
import { openStoreAtTile } from '$lib/game/placement';
import { isTileBuildable } from '$lib/game/city';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from '$lib/game/storeFootprint';
import {
	buildIndustrialBuilding,
	getIndustrialPlacementBlockReason
} from '$lib/game/industryPlacement';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import { generateDecisions } from '$lib/game/events';
import { getWorldCityDefinition, getWorldCityStatus, openWorldCity } from '$lib/game/world';
import type { GameAlert } from '$lib/game/alerts';
import type { DecisionItem, Store, MaterialId } from '$lib/game/types';
import type {
	ProductChainCategorySummary,
	ProductChainGraph,
	ProductChainNode
} from '$lib/game/productChainGraph';
import type { WorldCityId } from '$lib/game/types';
import {
	decisionContextExpansionCashBlocked,
	decisionContextExpansionUnavailable,
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialOccupiedTile,
	decisionContextIndustrialRequiresCash,
	decisionContextIndustrialRequiresIndustrialTile,
	decisionContextIndustrialRequiresResource,
	decisionContextIndustrialUnknownBuilding,
	decisionContextIndustrialUnknownTile,
	decisionContextLocationBlocked,
	decisionContextLocationGeneric,
	decisionContextWorldCityNotAvailableYet,
	decisionContextWorldCityOpeningCost,
	decisionContextWorldCityUnknown,
	decisionContextCashPressure,
	decisionContextExpansionOpportunity,
	decisionContextIndustrialTileHasRail,
	decisionContextRailAlreadyConnected,
	decisionContextRailNoValidPath,
	decisionContextRailRequiresCash,
	decisionContextRailSegmentAtMaxLevel,
	decisionContextRailCrossCity,
	decisionContextRailUnknownBuilding,
	decisionContextRailUnknownSegment,
	decisionContextSupplierTerms
} from '$lib/game/decisionContext';
import { describe, expect, it } from 'vitest';
import { createI18n } from './index';
import { messagesByLocale } from './messages';
import {
	formatPlacementBlockReason,
	localizeAlert,
	localizeDecision,
	localizeProductChainCategorySummary,
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
		).toBe('1 product out of stock and 1 product needs import');
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
					context: decisionContextIndustrialLockedTile()
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
		).not.toBe('Open a retail store to unlock construction.');
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
			context: decisionContextCashPressure(),
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

	it('labels recipe nodes with the building name, not the output material', () => {
		expect.assertions(2);
		const english = createI18n('en');
		const recipeNode: ProductChainNode = {
			id: 'recipe:flour-milling',
			kind: 'recipe',
			label: 'Flour Mill',
			subLabel: 'Flour',
			materialId: 'flour',
			recipeId: 'flour-milling',
			stage: 'intermediate',
			layer: 0,
			row: 0,
			health: 'healthy',
			healthLabel: 'Healthy',
			warehouseStock: 0,
			capacity: { buildingCount: 1, outputPerDay: 10, inputPerDay: 10 },
			actual: {
				produced: 0,
				consumed: 0,
				importedInput: 0,
				warehousePulled: 0,
				railPulled: 0,
				shopImported: 0,
				unitsSold: 0,
				demandMissed: 0
			},
			bottleneck: { code: 'healthStatus', health: 'healthy', label: 'Flour Mill' }
		};
		const graph: ProductChainGraph = {
			id: 'chain:snacks',
			title: 'Snacks chain',
			nodes: [recipeNode],
			edges: [],
			details: { 'recipe:flour-milling': recipeNode },
			warnings: [],
			emptyReason: null
		};

		const localized = localizeProductChainGraph(graph, english);

		expect(localized.nodes[0]?.label).toBe(english.labels.industrialBuilding('flour-mill'));
		expect(localized.nodes[0]?.label).not.toBe(english.labels.material('flour'));
	});

	it('preserves the chain suffix in localized product-chain graph titles', () => {
		expect.assertions(3);
		const english = createI18n('en');
		const japanese = createI18n('ja');
		const graph: ProductChainGraph = {
			id: 'chain:snacks',
			title: 'Snacks chain',
			nodes: [],
			edges: [],
			details: {},
			warnings: [],
			emptyReason: null
		};

		const enLocalized = localizeProductChainGraph(graph, english);
		const jaLocalized = localizeProductChainGraph(graph, japanese);

		expect(enLocalized.title).toBe(`${english.labels.material('snacks')} chain`);
		expect(enLocalized.title).not.toBe(english.labels.material('snacks'));
		expect(jaLocalized.title).toBe(`${japanese.labels.material('snacks')}チェーン`);
	});

	it('localizes node stat lines and edge health labels for non-English locales', () => {
		expect.assertions(8);
		const english = createI18n('en');
		const japanese = createI18n('ja');
		const recipeNode: ProductChainNode = {
			id: 'recipe:flour-milling',
			kind: 'recipe',
			label: 'Flour Mill',
			subLabel: 'Flour',
			materialId: 'flour',
			recipeId: 'flour-milling',
			stage: 'intermediate',
			layer: 0,
			row: 0,
			health: 'shortage',
			healthLabel: 'Shortage',
			warehouseStock: 0,
			capacity: { buildingCount: 2, outputPerDay: 30, inputPerDay: 30 },
			actual: {
				produced: 0,
				consumed: 0,
				importedInput: 0,
				warehousePulled: 0,
				railPulled: 0,
				shopImported: 0,
				unitsSold: 0,
				demandMissed: 0
			},
			bottleneck: { code: 'healthStatus', health: 'shortage', label: 'Flour Mill' }
		};
		const materialNode: ProductChainNode = {
			id: 'material:flour',
			kind: 'material',
			label: 'Flour',
			subLabel: undefined,
			materialId: 'flour',
			recipeId: null,
			stage: 'process',
			layer: 1,
			row: 0,
			health: 'no-report',
			healthLabel: 'No report yet',
			warehouseStock: 15,
			capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
			actual: {
				produced: 0,
				consumed: 0,
				importedInput: 0,
				warehousePulled: 0,
				railPulled: 0,
				shopImported: 0,
				unitsSold: 0,
				demandMissed: 0
			},
			bottleneck: { code: 'healthStatus', health: 'no-report', label: 'Flour' }
		};
		const graph: ProductChainGraph = {
			id: 'chain:flour',
			title: 'Flour chain',
			nodes: [recipeNode, materialNode],
			edges: [
				{
					id: 'material:flour->recipe:flour-milling',
					source: 'material:flour',
					target: 'recipe:flour-milling',
					materialId: 'flour',
					label: { code: 'in', quantity: 5 },
					requiredPerCycle: 5,
					actualPerDay: 5,
					health: 'no-report'
				}
			],
			details: { 'recipe:flour-milling': recipeNode, 'material:flour': materialNode },
			warnings: [],
			emptyReason: null
		};

		const enLocalized = localizeProductChainGraph(graph, english);
		const jaLocalized = localizeProductChainGraph(graph, japanese);

		// Recipe node stat line: en uses "bldg" and "/d", ja uses "棟" and "1日"
		expect(enLocalized.nodes[0]?.statLine).toBe('2 bldg · 30/d');
		expect(jaLocalized.nodes[0]?.statLine).not.toBe('2 bldg · 30/d');
		expect(jaLocalized.nodes[0]?.statLine).toContain('棟');

		// Material/warehouse node stat line: en uses "stock", ja uses "在庫"
		expect(enLocalized.nodes[1]?.statLine).toBe('stock 15');
		expect(jaLocalized.nodes[1]?.statLine).not.toBe('stock 15');
		expect(jaLocalized.nodes[1]?.statLine).toContain('在庫');

		// Edge health label: en uses "No report yet", ja uses localized health
		expect(enLocalized.edges[0]?.healthLabel).toBe('No report yet');
		expect(jaLocalized.edges[0]?.healthLabel).not.toBe('No report yet');
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
		expect.assertions(21);
		const japanese = createI18n('ja');
		const english = createI18n('en');

		const expansionOpportunity: DecisionItem = {
			id: 'expansion-opportunity',
			title: 'Expansion opportunity',
			context: decisionContextExpansionOpportunity(),
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
			context: decisionContextSupplierTerms(),
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
		expect(localizeDecision(worldDecision, english).options[0]?.description).toBe(
			'Return to the world map.'
		);
		expect(localizeDecision(worldDecision, japanese).options[0]?.description).toBe(
			japanese.t('copy.decisions.worldCity.acknowledge.description')
		);
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

	it('localizes every rail-construction decision context', () => {
		expect.assertions(16);
		const english = createI18n('en');
		const japanese = createI18n('ja');
		const baseDecision = {
			id: 'rail-construction-1',
			title: 'Rail construction delayed',
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

		const railUnknownBuilding: DecisionItem = {
			...baseDecision,
			context: decisionContextRailUnknownBuilding()
		};
		const railCrossCity: DecisionItem = {
			...baseDecision,
			context: decisionContextRailCrossCity()
		};
		const railNoValidPath: DecisionItem = {
			...baseDecision,
			context: decisionContextRailNoValidPath()
		};
		const railRequiresCash: DecisionItem = {
			...baseDecision,
			context: decisionContextRailRequiresCash(2_000, 500)
		};
		const railSegmentAtMaxLevel: DecisionItem = {
			...baseDecision,
			context: decisionContextRailSegmentAtMaxLevel()
		};
		const railUnknownSegment: DecisionItem = {
			...baseDecision,
			context: decisionContextRailUnknownSegment()
		};
		const industrialTileHasRail: DecisionItem = {
			...baseDecision,
			context: decisionContextIndustrialTileHasRail()
		};
		const railAlreadyConnected: DecisionItem = {
			...baseDecision,
			context: decisionContextRailAlreadyConnected()
		};

		expect(localizeDecision(railUnknownBuilding, english).context).toBe('Unknown rail building.');
		expect(localizeDecision(railCrossCity, english).context).toBe(
			'Rails cannot span different cities.'
		);
		expect(localizeDecision(railNoValidPath, english).context).toBe(
			'No valid rail path to the destination.'
		);
		expect(localizeDecision(railAlreadyConnected, english).context).toBe(
			'These buildings are already connected by rail.'
		);
		expect(localizeDecision(railRequiresCash, english).context).toBe(
			'Building this rail costs $2,000 but you only have $500.'
		);
		expect(localizeDecision(railSegmentAtMaxLevel, english).context).toBe(
			'This rail segment is already at the maximum level.'
		);
		expect(localizeDecision(railUnknownSegment, english).context).toBe('Unknown rail segment.');
		expect(localizeDecision(industrialTileHasRail, english).context).toBe(
			'This tile already has rail on it.'
		);
		// Non-English catalog must not leave the copy identical to English.
		expect(localizeDecision(railUnknownBuilding, japanese).context).not.toBe(
			'Unknown rail building.'
		);
		expect(localizeDecision(railCrossCity, japanese).context).not.toBe(
			'Rails cannot span different cities.'
		);
		expect(localizeDecision(railNoValidPath, japanese).context).not.toBe(
			'No valid rail path to the destination.'
		);
		expect(localizeDecision(railAlreadyConnected, japanese).context).not.toBe(
			'These buildings are already connected by rail.'
		);
		expect(localizeDecision(railRequiresCash, japanese).context).not.toBe(
			'Building this rail costs $2,000 but you only have $500.'
		);
		expect(localizeDecision(railSegmentAtMaxLevel, japanese).context).not.toBe(
			'This rail segment is already at the maximum level.'
		);
		expect(localizeDecision(railUnknownSegment, japanese).context).not.toBe(
			'Unknown rail segment.'
		);
		expect(localizeDecision(industrialTileHasRail, japanese).context).not.toBe(
			'This tile already has rail on it.'
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
			'railConstruction',
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
			railPulled: 0,
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
			emptyReason: 'noLocalChain'
		};
		const localizedEmptyReason = localizeProductChainGraph(graphWithNoLocalChain, japanese);
		expect(localizedEmptyReason.emptyReason).not.toBe('noLocalChain');

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

	it('product-chain graph quantities use locale-aware thousands separators', () => {
		expect.assertions(7);
		const japanese = createI18n('ja');

		const baseActual = {
			produced: 0,
			consumed: 0,
			importedInput: 0,
			warehousePulled: 0,
			railPulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 0
		};
		const baseCapacity = { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 };

		// Node stats: recipe node with 1,234 buildings and 1,500 output/day.
		const recipeNode: ProductChainNode = {
			id: 'recipe-1',
			kind: 'recipe',
			label: 'Grain Farm',
			materialId: null,
			recipeId: 'grain-harvest',
			stage: 'raw',
			layer: 1,
			row: 0,
			health: 'healthy',
			healthLabel: 'Healthy',
			warehouseStock: 0,
			capacity: { ...baseCapacity, buildingCount: 1234, outputPerDay: 1500 },
			actual: baseActual,
			bottleneck: { code: 'healthStatus', health: 'healthy', label: 'Grain Farm' }
		};
		const recipeGraph: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [recipeNode],
			edges: [],
			details: {},
			warnings: [],
			emptyReason: null
		};
		const localizedRecipe = localizeProductChainGraph(recipeGraph, japanese);
		expect(localizedRecipe.nodes[0]?.statLine).toContain(japanese.format.integer(1234));
		expect(localizedRecipe.nodes[0]?.statLine).toContain(japanese.format.integer(1500));
		expect(localizedRecipe.nodes[0]?.statLine).not.toContain('1234');

		// Node stats: warehouse node with 1,234 stock.
		const warehouseNode: ProductChainNode = {
			...recipeNode,
			id: 'warehouse',
			kind: 'warehouse',
			recipeId: null,
			stage: 'warehouse',
			warehouseStock: 1234,
			capacity: baseCapacity,
			bottleneck: { code: 'warehouseAvailable' }
		};
		const warehouseGraph: ProductChainGraph = { ...recipeGraph, nodes: [warehouseNode] };
		const localizedWarehouse = localizeProductChainGraph(warehouseGraph, japanese);
		expect(localizedWarehouse.nodes[0]?.statLine).toContain(japanese.format.integer(1234));

		// Edge labels: in/out with 1,234 units.
		const baseEdge = {
			id: 'e1',
			source: 'n1',
			target: 'n2',
			materialId: null,
			requiredPerCycle: 0,
			actualPerDay: 0,
			health: 'healthy' as const
		};
		const edgeInGraph: ProductChainGraph = {
			...recipeGraph,
			nodes: [],
			edges: [{ ...baseEdge, label: { code: 'in', quantity: 1234 } }]
		};
		expect(localizeProductChainGraph(edgeInGraph, japanese).edges[0]?.label).toContain(
			japanese.format.integer(1234)
		);

		// Overflow bottleneck with 1,234 units.
		const overflowNode: ProductChainNode = {
			...warehouseNode,
			bottleneck: { code: 'warehouseOverflow', quantity: 1234 }
		};
		const overflowGraph: ProductChainGraph = { ...recipeGraph, nodes: [overflowNode] };
		const localizedOverflow = localizeProductChainGraph(overflowGraph, japanese);
		expect(localizedOverflow.nodes[0]?.bottleneck).toContain(japanese.format.integer(1234));
		expect(localizedOverflow.nodes[0]?.bottleneck).not.toContain('1234 units');
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

	describe('real-builder golden-phrase guards', () => {
		it('real expansion-cash-blocked decision localizes to the exact Japanese phrase', () => {
			expect.assertions(3);
			// Use a deterministic seed so the city layout and setup cost are reproducible.
			const game = createNewGame('convenience', 1);
			const city = game.cities.find((c) => c.id === game.activeCityId)!;
			const lookup = createCityTileLookup(city);
			const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, lookup);

			// Find a real buildable tile whose 2x2 footprint is not occupied by the
			// founding store — not a placeholder like 'valid-tile'.
			const expansionTile = city.tiles.find(
				(tile) =>
					isTileBuildable(tile) &&
					tile.id !== game.stores[0]!.tileId &&
					getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) === null
			)!;
			expect(expansionTile).toBeDefined();

			// Set cash to 0 so the expansion is cash-blocked (setupCost > 0 for any
			// buildable tile). storeCap (STARTER_STORE_CAP) is already > 1 store.
			const cashBlockedGame = { ...game, cash: 0 };
			const result = openStoreAtTile(cashBlockedGame, {
				tileId: expansionTile.id,
				archetypeId: 'convenience'
			});
			const decision = result.decisions.find((d) => d.context.code === 'expansionCashBlocked');
			expect(decision).toBeDefined();

			const japanese = createI18n('ja');
			const setupCost = getExpansionSetupCost(expansionTile, 'convenience');
			const localized = localizeDecision(decision!, japanese);
			// Assert the EXACT expected Japanese phrase — computed from the locale
			// catalog with the structured params, not a vacuous inequality.
			expect(localized.context).toBe(
				japanese.t('copy.decisions.expansionCashBlocked.context', {
					cash: japanese.format.currency(setupCost)
				})
			);
		});

		it('real expansion-unavailable decision localizes to the exact Japanese phrase', () => {
			expect.assertions(2);
			const game = createNewGame('convenience', 1);
			const city = game.cities.find((c) => c.id === game.activeCityId)!;
			const lookup = createCityTileLookup(city);
			const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, lookup);

			// Find a real buildable tile whose footprint is free.
			const expansionTile = city.tiles.find(
				(tile) =>
					isTileBuildable(tile) &&
					tile.id !== game.stores[0]!.tileId &&
					getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) === null
			)!;

			// Cap stores at 1 (one founding store already exists) so the expansion
			// is rejected for capacity, not cash. Keep cash high to avoid the
			// cash-blocked branch.
			const cappedGame = { ...game, storeCap: 1, cash: 1_000_000 };
			const result = openStoreAtTile(cappedGame, {
				tileId: expansionTile.id,
				archetypeId: 'convenience'
			});
			const decision = result.decisions.find((d) => d.context.code === 'expansionUnavailable');
			expect(decision).toBeDefined();

			const japanese = createI18n('ja');
			const localized = localizeDecision(decision!, japanese);
			expect(localized.context).toBe(
				japanese.t('copy.decisions.expansionUnavailable.context', { storeCap: 1 })
			);
		});

		it('real location-blocked decision localizes to the exact Japanese phrase', () => {
			expect.assertions(3);
			const game = createNewGame('convenience', 1);
			const city = game.cities.find((c) => c.id === game.activeCityId)!;

			// Find a real non-buildable tile (locked, road, or river) so the
			// placement emits a locationBlocked decision with a stable reason code.
			const blockedTile = city.tiles.find((tile) => !isTileBuildable(tile))!;
			expect(blockedTile).toBeDefined();

			const result = openStoreAtTile(game, {
				tileId: blockedTile.id,
				archetypeId: 'convenience'
			});
			const decision = result.decisions.find((d) => d.context.code === 'locationBlocked');
			expect(decision).toBeDefined();

			const japanese = createI18n('ja');
			const ctx = decision!.context as {
				code: 'locationBlocked';
				reason: 'locked' | 'road' | 'river';
			};
			const localized = localizeDecision(decision!, japanese);
			expect(localized.context).toBe(
				japanese.t('copy.decisions.locationUnavailable.blockedContext', {
					reason: japanese.t(`copy.decisions.locationUnavailable.reasons.${ctx.reason}` as never)
				})
			);
		});

		it('real world-city-opening-cost decision localizes to the exact Japanese phrase', () => {
			expect.assertions(2);
			const game = createNewGame('convenience', 1);
			const campusJunction = getWorldCityDefinition('campus-junction')!;

			// Reveal campus-junction but keep cash below its openingCost (18_000)
			// so openWorldCity emits the opening-cost decision.
			const revealedGame = {
				...game,
				cash: campusJunction.openingCost - 1,
				world: {
					...game.world,
					revealedCityIds: [...game.world.revealedCityIds, 'campus-junction'] as WorldCityId[]
				}
			};
			const result = openWorldCity(revealedGame, 'campus-junction');
			const decision = result.decisions.find((d) => d.context.code === 'worldCityOpeningCost');
			expect(decision).toBeDefined();

			const japanese = createI18n('ja');
			const localized = localizeDecision(decision!, japanese);
			expect(localized.context).toBe(
				japanese.t('copy.decisions.worldCity.openingDelayed.context', {
					cash: japanese.format.currency(campusJunction.openingCost)
				})
			);
		});

		it('real world-city-not-available-yet decision localizes to the exact Japanese phrase', () => {
			expect.assertions(2);
			const game = createNewGame('convenience', 1);

			// garden-borough is not revealed by default, so opening it emits the
			// not-available-yet decision carrying the city's stable id.
			const result = openWorldCity(game, 'garden-borough');
			const decision = result.decisions.find((d) => d.context.code === 'worldCityNotAvailableYet');
			expect(decision).toBeDefined();

			const japanese = createI18n('ja');
			const localized = localizeDecision(decision!, japanese);
			expect(localized.context).toBe(
				japanese.t('copy.decisions.worldCity.notAvailableYet.context', {
					requirement: japanese.t('game.worldCities.garden-borough.unlockRequirement' as never)
				})
			);
		});

		it('real industrial-requires-cash decision localizes to the exact Japanese phrase', () => {
			expect.assertions(3);
			const game = createNewGame('convenience', 1);
			const industryCity = game.industryCities.find((c) => c.id === game.activeIndustryCityId)!;

			// Find a real industrial tile whose 2x2 footprint is buildable for a
			// warehouse (no resource requirement, requires industrial terrain).
			const warehouseType = INDUSTRIAL_BUILDING_TYPES.warehouse!;
			const buildableTile = industryCity.tiles.find(
				(tile) =>
					tile.terrain === 'industrial' &&
					!tile.locked &&
					getIndustrialPlacementBlockReason(game, tile.id, 'warehouse') === null
			)!;
			expect(buildableTile).toBeDefined();

			// Set cash below the warehouse buildCost so the build emits the
			// requires-cash decision.
			const cashShortGame = { ...game, cash: warehouseType.buildCost - 1 };
			const result = buildIndustrialBuilding(cashShortGame, {
				tileId: buildableTile.id,
				buildingTypeId: 'warehouse'
			});
			const decision = result.decisions.find((d) => d.context.code === 'industrialRequiresCash');
			expect(decision).toBeDefined();

			const japanese = createI18n('ja');
			const localized = localizeDecision(decision!, japanese);
			expect(localized.context).toBe(
				japanese.t('copy.decisions.industrialConstructionDelayed.contexts.requiresCash', {
					buildingName: japanese.labels.industrialBuilding('warehouse'),
					cash: japanese.format.currency(warehouseType.buildCost)
				})
			);
		});

		it('real cash-pressure decision localizes to the exact Japanese phrase', () => {
			expect.assertions(2);
			const game = createNewGame('convenience', 1);

			// generateDecisions emits a cash-pressure decision when cash < 0.
			const negativeCashGame = { ...game, cash: -1 };
			const decisions = generateDecisions(negativeCashGame);
			const decision = decisions.find((d) => d.context.code === 'cashPressure');
			expect(decision).toBeDefined();

			const japanese = createI18n('ja');
			const localized = localizeDecision(decision!, japanese);
			expect(localized.context).toBe(japanese.t('copy.decisions.cashPressure.context'));
		});
	});

	it('formats all remaining placement block reason codes', () => {
		// Covers the formatPlacementBlockReason branches not exercised by the
		// existing test: null input, retail tile/limit/location reasons, and
		// industry unknown-building-type.
		expect.assertions(9);
		const en = createI18n('en');

		expect(formatPlacementBlockReason(null, en)).toBeNull();
		expect(formatPlacementBlockReason({ code: 'retail.unknownCityTile' }, en)).toBe(
			'Unknown city tile'
		);
		expect(formatPlacementBlockReason({ code: 'retail.occupiedLocation' }, en)).toBe(
			'Occupied location'
		);
		expect(formatPlacementBlockReason({ code: 'retail.lockedLocation' }, en)).toBe(
			'Locked location'
		);
		expect(formatPlacementBlockReason({ code: 'retail.roadLocation' }, en)).toBe('Road location');
		expect(formatPlacementBlockReason({ code: 'retail.riverLocation' }, en)).toBe('River location');
		expect(
			formatPlacementBlockReason(
				{ code: 'industry.rawPlacementBlocked', context: decisionContextIndustrialOccupiedTile() },
				en
			)
		).toBe('Occupied industrial tile');
		expect(
			formatPlacementBlockReason(
				{
					code: 'industry.rawPlacementBlocked',
					context: decisionContextIndustrialRequiresIndustrialTile()
				},
				en
			)
		).toBe('Requires industrial tile');
		expect(formatPlacementBlockReason({ code: 'industry.unknownBuildingType' }, en)).toBe(
			'Unknown industrial building type'
		);
	});

	it('localizes industrial-occupied-tile and industrial-requires-industrial-tile decision contexts', () => {
		expect.assertions(4);
		const japanese = createI18n('ja');
		const occupied: DecisionItem = {
			id: 'industrial-construction-delayed-occupied-1',
			title: 'Industrial construction delayed',
			context: decisionContextIndustrialOccupiedTile(),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Ack',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};
		const requiresTile: DecisionItem = {
			id: 'industrial-construction-delayed-requires-tile-1',
			title: 'Industrial construction delayed',
			context: decisionContextIndustrialRequiresIndustrialTile(),
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Ack',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};

		expect(localizeDecision(occupied, japanese).context).not.toBe(occupied.context);
		expect(localizeDecision(occupied, japanese).context).not.toBe('');
		expect(localizeDecision(requiresTile, japanese).context).not.toBe(requiresTile.context);
		expect(localizeDecision(requiresTile, japanese).context).not.toBe('');
	});

	it('localizes decision and factory-blocked alerts', () => {
		expect.assertions(3);
		const en = createI18n('en');
		const game = createNewGame('convenience', 1);
		const cashDecision: DecisionItem = {
			id: 'cash-pressure',
			title: 'Cash pressure',
			context: decisionContextCashPressure(),
			expiresOnDay: 3,
			options: [
				{ id: 'short-loan', label: 'Short loan', description: '...', effects: { cash: 12000 } }
			]
		};
		const gameWithDecision = { ...game, decisions: [cashDecision] };
		const decisionAlert: GameAlert = {
			id: 'decision:cash-pressure',
			kind: 'decision',
			message: 'stale',
			decisionId: 'cash-pressure'
		};
		expect(localizeAlert(decisionAlert, gameWithDecision, en)).toContain(
			en.t('copy.decisions.cashPressure.title')
		);

		const gameWithBuilding = {
			...game,
			industrialBuildings: [
				{
					...game.industrialBuildings[0]!,
					id: 'building-1',
					typeId: 'warehouse' as const
				}
			]
		};
		const factoryAlert: GameAlert = {
			id: 'factory-blocked:building-1',
			kind: 'factory-blocked',
			message: 'stale',
			buildingId: 'building-1'
		};
		expect(localizeAlert(factoryAlert, gameWithBuilding, en)).toContain(
			en.labels.industrialBuilding('warehouse')
		);

		// Factory-blocked alert for a missing building falls back to the raw message.
		expect(localizeAlert({ ...factoryAlert, buildingId: 'missing' }, gameWithBuilding, en)).toBe(
			'stale'
		);
	});

	it('localizeStockTrouble returns null for all-healthy products and pluralizes multiple out-of-stock', () => {
		expect.assertions(2);
		const en = createI18n('en');

		expect(
			localizeStockTrouble(
				[
					{ stock: 10, reorderThreshold: 4 },
					{ stock: 20, reorderThreshold: 5 }
				],
				en
			)
		).toBeNull();

		expect(
			localizeStockTrouble(
				[
					{ stock: 0, reorderThreshold: 4 },
					{ stock: 0, reorderThreshold: 4 }
				],
				en
			)
		).toBe('2 products out of stock');
	});

	it('localizeStockTrouble joins out-of-stock and needs-import with a locale-aware list separator', () => {
		expect.assertions(3);
		const en = createI18n('en');
		const ja = createI18n('ja');
		const zh = createI18n('zh-Hant');

		const products = [
			{ stock: 0, reorderThreshold: 4 },
			{ stock: 2, reorderThreshold: 4 }
		];

		// English Intl.ListFormat conjunction joins two items with " and ".
		expect(localizeStockTrouble(products, en)).toBe(
			'1 product out of stock and 1 product needs import'
		);

		// Japanese must not retain the English ", " separator.
		expect(localizeStockTrouble(products, ja)).not.toContain(', ');

		// Traditional Chinese must not retain the English ", " separator.
		expect(localizeStockTrouble(products, zh)).not.toContain(', ');
	});

	it('localizeWorldCityStatus handles not-available-yet and null blocked reasons', () => {
		expect.assertions(4);
		const en = createI18n('en');
		const ja = createI18n('ja');
		const game = createNewGame('convenience', 1);

		// garden-borough is locked (not revealed) → blockedReason is
		// worldCityNotAvailableYet. The blocked reason is the localized
		// unlock requirement text.
		const lockedStatus = getWorldCityStatus(game, 'garden-borough');
		expect(lockedStatus).not.toBeNull();
		const localizedLocked = localizeWorldCityStatus(lockedStatus!, en);
		expect(localizedLocked.blockedReason).not.toBeNull();
		// In Japanese the blocked reason must differ from the English text.
		const localizedLockedJa = localizeWorldCityStatus(lockedStatus!, ja);
		expect(localizedLockedJa.blockedReason).not.toBe(lockedStatus!.city.unlockRequirement);

		// harbor-city is already opened → blockedReason is null.
		const openedStatus = getWorldCityStatus(game, 'harbor-city');
		expect(localizeWorldCityStatus(openedStatus!, en).blockedReason).toBeNull();
	});

	it('localizeProductChainGraph labels warehouse nodes, material nodes, and material sub-labels', () => {
		expect.assertions(4);
		const en = createI18n('en');

		const warehouseNode: ProductChainNode = {
			id: 'warehouse',
			kind: 'warehouse',
			label: 'Warehouse',
			materialId: null,
			recipeId: null,
			subLabel: undefined,
			stage: 'warehouse',
			layer: 1,
			row: 0,
			health: 'healthy',
			healthLabel: 'Healthy',
			warehouseStock: 100,
			capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
			actual: {
				produced: 0,
				consumed: 0,
				importedInput: 0,
				warehousePulled: 0,
				railPulled: 0,
				shopImported: 0,
				unitsSold: 0,
				demandMissed: 0
			},
			bottleneck: { code: 'warehouseAvailable' }
		};
		const materialNode: ProductChainNode = {
			id: 'material:bottled-water',
			kind: 'material',
			label: 'Water',
			materialId: 'bottled-water',
			recipeId: null,
			subLabel: 'Water',
			stage: 'raw',
			layer: 0,
			row: 0,
			health: 'healthy',
			healthLabel: 'Healthy',
			warehouseStock: 50,
			capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
			actual: {
				produced: 0,
				consumed: 0,
				importedInput: 0,
				warehousePulled: 0,
				railPulled: 0,
				shopImported: 0,
				unitsSold: 0,
				demandMissed: 0
			},
			bottleneck: { code: 'healthStatus', health: 'healthy', label: 'Water' }
		};
		const graph: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [warehouseNode, materialNode],
			edges: [],
			details: {},
			warnings: [],
			emptyReason: null
		};

		const localized = localizeProductChainGraph(graph, en);
		expect(localized.nodes[0]?.label).toBe(en.t('copy.productChainGraph.warehouseNode'));
		// The material node label is replaced with the localized material name.
		// 'Bottled Water' differs from the raw 'Water' label, proving the
		// materialId branch ran.
		expect(localized.nodes[1]?.label).toBe(en.labels.material('bottled-water'));
		expect(localized.nodes[1]?.label).not.toBe(materialNode.label);
		expect(localized.nodes[1]?.subLabel).toBe(en.labels.material('bottled-water'));
	});

	it('localizeProductChainGraph falls back to the raw title for unknown graph ids and null empty reason', () => {
		expect.assertions(2);
		const en = createI18n('en');
		const graph: ProductChainGraph = {
			id: 'unknown-graph-id',
			title: 'Custom Graph',
			nodes: [],
			edges: [],
			details: {},
			warnings: [],
			emptyReason: null
		};

		const localized = localizeProductChainGraph(graph, en);
		expect(localized.title).toBe('Custom Graph');
		expect(localized.emptyReason).toBeNull();
	});

	it('localizeProductChainGraph covers remaining cycle edge label combinations', () => {
		// produced+imported and used+not-imported are not covered by the
		// existing structured-dispatch guard test. Use Japanese to verify the
		// labels are localized (differ from the English phrase format).
		expect.assertions(2);
		const japanese = createI18n('ja');
		const baseEdge = {
			id: 'e1',
			source: 'n1',
			target: 'n2',
			materialId: null,
			requiredPerCycle: 0,
			actualPerDay: 0,
			health: 'healthy' as const
		};
		const graphProducedImported: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [],
			edges: [
				{
					...baseEdge,
					label: {
						code: 'cycle',
						direction: 'produced',
						actual: 12,
						required: 10,
						imported: true
					}
				}
			],
			details: {},
			warnings: [],
			emptyReason: null
		};
		expect(localizeProductChainGraph(graphProducedImported, japanese).edges[0]?.label).not.toBe(
			'12/day produced · 10/cycle · import'
		);

		const graphUsedNotImported: ProductChainGraph = {
			...graphProducedImported,
			edges: [
				{
					...baseEdge,
					label: {
						code: 'cycle',
						direction: 'used',
						actual: 3,
						required: 5,
						imported: false
					}
				}
			]
		};
		expect(localizeProductChainGraph(graphUsedNotImported, japanese).edges[0]?.label).not.toBe(
			'3/day used · 5/cycle'
		);
	});

	it('localizeProductChainGraph covers remaining health bottleneck states', () => {
		// watch, no-local-capacity, and no-report health states are not covered
		// by the existing tests.
		expect.assertions(3);
		const en = createI18n('en');
		const baseNode: ProductChainNode = {
			id: 'material:water',
			kind: 'material',
			label: 'Water',
			materialId: 'water',
			recipeId: null,
			subLabel: undefined,
			stage: 'raw',
			layer: 0,
			row: 0,
			health: 'healthy',
			healthLabel: 'Healthy',
			warehouseStock: 0,
			capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
			actual: {
				produced: 0,
				consumed: 0,
				importedInput: 0,
				warehousePulled: 0,
				railPulled: 0,
				shopImported: 0,
				unitsSold: 0,
				demandMissed: 0
			},
			bottleneck: { code: 'healthStatus', health: 'healthy', label: 'Water' }
		};

		const graphWithWatch: ProductChainGraph = {
			id: 'warehouse-flow',
			title: 'Warehouse flow',
			nodes: [
				{
					...baseNode,
					health: 'watch',
					bottleneck: { code: 'healthStatus', health: 'watch', label: 'Water' }
				}
			],
			edges: [],
			details: {},
			warnings: [],
			emptyReason: null
		};
		expect(localizeProductChainGraph(graphWithWatch, en).nodes[0]?.bottleneck).not.toBe('');

		const graphWithNoCapacity: ProductChainGraph = {
			...graphWithWatch,
			nodes: [
				{
					...baseNode,
					health: 'no-local-capacity',
					bottleneck: { code: 'healthStatus', health: 'no-local-capacity', label: 'Water' }
				}
			]
		};
		expect(localizeProductChainGraph(graphWithNoCapacity, en).nodes[0]?.bottleneck).not.toBe('');

		const graphWithNoReport: ProductChainGraph = {
			...graphWithWatch,
			nodes: [
				{
					...baseNode,
					health: 'no-report',
					bottleneck: { code: 'healthStatus', health: 'no-report', label: 'Water' }
				}
			]
		};
		expect(localizeProductChainGraph(graphWithNoReport, en).nodes[0]?.bottleneck).not.toBe('');
	});

	it('localizeProductChainCategorySummary localizes the bottleneck field', () => {
		expect.assertions(2);
		const en = createI18n('en');
		const summary: ProductChainCategorySummary = {
			categoryId: 'snacks',
			name: 'Snacks',
			tier: 1,
			health: 'healthy',
			healthLabel: 'Healthy',
			bottleneck: { code: 'healthStatus', health: 'healthy', label: 'Snacks' },
			warehouseStock: 100,
			produced: 10,
			consumed: 5,
			imported: 0
		};

		const localized = localizeProductChainCategorySummary(summary, en);
		expect(localized.bottleneck).not.toBe(summary.bottleneck);
		expect(localized.bottleneck).not.toBe('');
	});

	it('localizeReportWarning falls back to the raw storeId when the store is not found', () => {
		expect.assertions(1);
		const en = createI18n('en');
		const stores: Store[] = [];

		// When no store matches the storeId, resolveStoreName returns the raw
		// storeId, which is interpolated into the warning text.
		expect(
			localizeReportWarning({ code: 'stockPressure', storeId: 'ghost-store' }, stores, en)
		).toContain('ghost-store');
	});

	it('localizeDecisionTitle falls back to the raw title for unrecognized world-city contexts', () => {
		// The worldCity family's default branch returns decision.title when the
		// context code is not one of the three known world-city codes.
		expect.assertions(1);
		const en = createI18n('en');
		const worldDecision: DecisionItem = {
			id: 'world-city-unknown-ctx-1',
			title: 'Custom World Title',
			context: { code: 'expansionUnavailable', storeCap: 5 },
			expiresOnDay: 2,
			options: [{ id: 'acknowledge', label: 'Ack', description: '...', effects: {} }]
		};

		// The id starts with 'world-city-' so classifyDecision returns
		// 'worldCity', but the context code is not a world-city code, so the
		// default branch returns the raw title.
		expect(localizeDecision({ ...worldDecision, id: 'world-city-custom-1' }, en).title).toBe(
			'Custom World Title'
		);
	});

	it('localizeDecision preserves stored options for unrecognized world-city decisions', () => {
		// A saved or future decision whose id starts with 'world-city-' but
		// whose context code is not a recognized world-city code must not have
		// its acknowledge option rewritten with world-city copy. The stored
		// option label and description must be preserved as-is.
		expect.assertions(2);
		const en = createI18n('en');
		const decision: DecisionItem = {
			id: 'world-city-custom-1',
			title: 'Custom World Title',
			context: { code: 'expansionUnavailable', storeCap: 5 },
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Custom Ack',
					description: 'Custom ack description',
					effects: {}
				}
			]
		};

		const localized = localizeDecision(decision, en);
		const option = localized.options[0]!;
		expect(option.label).toBe('Custom Ack');
		expect(option.description).toBe('Custom ack description');
	});
});
