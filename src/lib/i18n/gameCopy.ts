import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import { PRODUCTION_EVENT_CATALOG } from '$lib/game/eventCatalog';
import { estimateNextLoanPayment, getLoanArrearsAmount, hasLoanArrears } from '$lib/game/finance';
import { getFinanceMetrics } from '$lib/game/financeMetrics';
import { PRODUCTS } from '$lib/game/products';
import type { PlacementBlockReason } from '$lib/game/placementPreview';
import type {
	BottleneckInfo,
	EdgeLabelInfo,
	GraphEmptyReason,
	GraphWarning,
	ProductChainCategorySummary,
	ProductChainGraph,
	ProductChainHealth,
	ProductChainNode
} from '$lib/game/productChainGraph';
import { COVENANT_THRESHOLD, type GameAlert } from '$lib/game/alerts';
import type { LogisticsFailureCode } from '$lib/game/commandResult';
import type {
	DailyReportWarning,
	DailyRouteModifierRecovery,
	GameState,
	DecisionItem,
	RouteDispatchModifierImpact,
	Store,
	SystemDecisionOption,
	StoreLocation,
	StructuredCopyRef
} from '$lib/game/types';
import type { DecisionOptionAvailability } from '$lib/game/eventEffects';
import type { DecisionContext } from '$lib/game/decisionContext';
import type { WorldCityStatus } from '$lib/game/world';
import type { StoreProductStatus } from '$lib/game/stock';
import type { I18nBundle } from './index';
import type {
	LocalizedDecision,
	LocalizedDecisionOption,
	LocalizedGameAlert,
	LocalizedProductChainCategorySummary,
	LocalizedProductChainEdge,
	LocalizedProductChainGraph,
	LocalizedWorldCityStatus
} from './localizedTypes';

const RECIPE_ID_TO_BUILDING_TYPE_ID = new Map<string, string>(
	Object.values(INDUSTRIAL_BUILDING_TYPES)
		.filter((type) => type.recipeId !== null)
		.map((type) => [type.recipeId as string, type.id])
);

export type {
	LocalizedDecision,
	LocalizedDecisionOption,
	LocalizedGameAlert,
	LocalizedProductChainCategorySummary,
	LocalizedProductChainGraph,
	LocalizedWorldCityStatus
} from './localizedTypes';

export function storeDisplayName(
	store: Pick<Store, 'name'>,
	ordinal: number,
	i18n: I18nBundle
): string {
	return store.name || i18n.t('store.defaultName', { ordinal });
}

export function formatStoreLocation(location: StoreLocation, i18n: I18nBundle): string {
	return i18n.t('store.location', {
		neighborhood: i18n.labels.neighborhood(location.neighborhoodId),
		x: location.x,
		y: location.y
	});
}

export function formatPlacementBlockReason(
	reason: PlacementBlockReason | null,
	i18n: I18nBundle
): string | null {
	if (reason === null) {
		return null;
	}

	switch (reason.code) {
		case 'retail.unknownCityTile':
			return i18n.t('placement.retail.unknownCityTile');
		case 'retail.storeLimitReached':
			return i18n.t('placement.retail.storeLimitReached');
		case 'retail.requiresCash':
			return i18n.t('placement.retail.requiresCash', {
				amount: i18n.format.currency(reason.amount)
			});
		case 'retail.occupiedLocation':
			return i18n.t('placement.retail.occupiedLocation');
		case 'retail.lockedLocation':
			return i18n.t('placement.retail.lockedLocation');
		case 'retail.roadLocation':
			return i18n.t('placement.retail.roadLocation');
		case 'retail.riverLocation':
			return i18n.t('placement.retail.riverLocation');
		case 'retail.noValidTiles':
			return i18n.t('placement.retail.noValidTiles');
		case 'industry.lockedUntilRetail':
			return i18n.t('placement.industry.lockedUntilRetail');
		case 'industry.unknownBuildingType':
			return i18n.t('placement.industry.unknownBuildingType');
		case 'industry.requiresCash':
			return i18n.t('placement.industry.requiresCash', {
				buildingName: i18n.labels.industrialBuilding(reason.buildingTypeId),
				amount: i18n.format.currency(reason.amount)
			});
		case 'industry.rawPlacementBlocked':
			return localizeDecisionContextValue(reason.context, i18n);
	}
}

function translateMessage(
	i18n: I18nBundle,
	key: string,
	params?: Record<string, string | number>
): string | null {
	const value = i18n.t(key as never, params);
	return value === key ? null : value;
}

/**
 * Resolves persisted route-context IDs in event decision copy params to
 * localized labels. The persisted params intentionally store stable IDs
 * (originCityId, destinationCityId, materialId) so a materialized decision
 * survives route deletion, but those IDs must not reach the player-facing
 * message directly. This derives localized `origin`/`destination`/`material`
 * params from the IDs (via the i18n label catalog — no route lookup) while
 * passing every other param (e.g. `routeId`) through unchanged. The IDs
 * themselves are kept in the returned object so message templates that still
 * reference them remain valid, but the freight-disruption templates use the
 * localized names.
 */
function resolveEventCopyParams(
	params: Record<string, string | number>,
	i18n: I18nBundle
): Record<string, string | number> {
	const resolved: Record<string, string | number> = { ...params };
	if (typeof params.originCityId === 'string') {
		resolved.origin = i18n.labels.worldCity(params.originCityId).name;
	}
	if (typeof params.destinationCityId === 'string') {
		resolved.destination = i18n.labels.worldCity(params.destinationCityId).name;
	}
	if (typeof params.materialId === 'string') {
		resolved.material = i18n.labels.material(params.materialId);
	}
	return resolved;
}

/**
 * Looks up a translation key built from a fixed prefix plus a dynamic suffix
 * (e.g. a union-valued enum). Centralises the `as never` cast so it lives in
 * one place rather than at every call site.
 */
function tScoped(
	i18n: I18nBundle,
	prefix: string,
	suffix: string,
	params?: Record<string, string | number>
): string {
	return i18n.t(`${prefix}.${suffix}` as never, params);
}

function formatCountMessage(i18n: I18nBundle, baseKey: string, count: number): string {
	return tScoped(i18n, baseKey, count === 1 ? 'one' : 'other', { count });
}

/**
 * Locale-aware quantity formatter for product-chain graph text. Mirrors the
 * integer/decimal split of the pure `formatQuantity` helper but routes
 * through the active locale's `Intl.NumberFormat` so thousands separators
 * (e.g. `1,234`) appear for ja/zh-Hant instead of raw `1234`.
 */
function formatQuantityForLocale(quantity: number, i18n: I18nBundle): string {
	return Number.isInteger(quantity) ? i18n.format.integer(quantity) : i18n.format.decimal(quantity);
}

function localizeHealth(health: ProductChainHealth, i18n: I18nBundle): string {
	return tScoped(i18n, 'copy.productChainGraph.health', health);
}

function localizeNodeStatLine(node: ProductChainNode, i18n: I18nBundle): string {
	if (node.kind === 'recipe') {
		return i18n.t('copy.productChainGraph.nodeStats.recipe', {
			buildings: formatQuantityForLocale(node.capacity.buildingCount, i18n),
			output: formatQuantityForLocale(node.capacity.outputPerDay, i18n)
		});
	}
	return i18n.t('copy.productChainGraph.nodeStats.stock', {
		stock: formatQuantityForLocale(node.warehouseStock, i18n)
	});
}

function localizeHealthBottleneck(
	health: ProductChainHealth,
	label: string,
	i18n: I18nBundle
): string {
	switch (health) {
		case 'healthy':
			return i18n.t('copy.productChainGraph.bottlenecks.healthy', { label });
		case 'watch':
			return i18n.t('copy.productChainGraph.bottlenecks.watch', { label });
		case 'shortage':
			return i18n.t('copy.productChainGraph.bottlenecks.shortage', { label });
		case 'no-local-capacity':
			return i18n.t('copy.productChainGraph.bottlenecks.noLocalCapacity', { label });
		case 'no-report':
			return i18n.t('copy.productChainGraph.bottlenecks.noReport', { label });
	}
}

function localizeBottleneckInfo(info: BottleneckInfo, label: string, i18n: I18nBundle): string {
	switch (info.code) {
		case 'warehouseNoCapacity':
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseNoCapacity');
		case 'warehouseOverflow':
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseOverflow', {
				quantity: formatQuantityForLocale(info.quantity, i18n)
			});
		case 'warehouseAvailable':
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseAvailable');
		case 'healthStatus':
			return localizeHealthBottleneck(info.health, label, i18n);
	}
}

function localizeBottleneck(node: ProductChainNode, label: string, i18n: I18nBundle): string {
	return localizeBottleneckInfo(node.bottleneck, label, i18n);
}

function localizeEdgeLabel(labelInfo: EdgeLabelInfo, i18n: I18nBundle): string {
	switch (labelInfo.code) {
		case 'in':
			return i18n.t('copy.productChainGraph.edges.in', {
				quantity: formatQuantityForLocale(labelInfo.quantity, i18n)
			});
		case 'out':
			return i18n.t('copy.productChainGraph.edges.out', {
				quantity: formatQuantityForLocale(labelInfo.quantity, i18n)
			});
		case 'cycle': {
			const key =
				labelInfo.direction === 'produced'
					? labelInfo.imported
						? 'copy.productChainGraph.edges.producedImported'
						: 'copy.productChainGraph.edges.produced'
					: labelInfo.imported
						? 'copy.productChainGraph.edges.usedImported'
						: 'copy.productChainGraph.edges.used';
			return i18n.t(key as never, {
				actual: formatQuantityForLocale(labelInfo.actual, i18n),
				required: formatQuantityForLocale(labelInfo.required, i18n)
			});
		}
	}
}

function localizeGraphTitle(graph: ProductChainGraph, i18n: I18nBundle): string {
	if (graph.id === 'warehouse-flow') {
		return i18n.t('copy.productChainGraph.title.warehouseFlow');
	}

	if (graph.id.startsWith('chain:')) {
		const chainId = graph.id.slice('chain:'.length);
		return i18n.t('copy.productChainGraph.title.productChain', {
			label: Object.hasOwn(PRODUCTS, chainId)
				? i18n.labels.productCategory(chainId)
				: i18n.labels.material(chainId)
		});
	}

	return graph.title;
}

function localizeGraphReason(reason: GraphEmptyReason | null, i18n: I18nBundle): string | null {
	if (reason === null) {
		return null;
	}

	switch (reason) {
		case 'noWarehouseData':
			return i18n.t('copy.productChainGraph.emptyReason.noWarehouseData');
		case 'noLocalChain':
			return i18n.t('copy.productChainGraph.emptyReason.noLocalChain');
	}
}

export function localizeReportWarning(
	warning: DailyReportWarning,
	stores: Store[],
	i18n: I18nBundle
): string {
	const resolveStoreName = (storeId: string): string => {
		const store = stores.find((candidate) => candidate.id === storeId);
		if (!store) return storeId;
		const ordinal = stores.findIndex((candidate) => candidate.id === storeId) + 1;
		return storeDisplayName(store, ordinal, i18n);
	};

	switch (warning.code) {
		case 'stockPressure':
			return i18n.t('copy.reportWarnings.stockPressure', {
				storeName: resolveStoreName(warning.storeId)
			});
		case 'nearStaffCapacity':
			return i18n.t('copy.reportWarnings.nearStaffCapacity', {
				storeName: resolveStoreName(warning.storeId)
			});
		case 'shortManager':
			return i18n.t('copy.reportWarnings.shortManager', {
				storeName: resolveStoreName(warning.storeId),
				count: i18n.format.integer(warning.count)
			});
		case 'shortGeneral':
			return i18n.t('copy.reportWarnings.shortGeneral', {
				storeName: resolveStoreName(warning.storeId),
				count: i18n.format.integer(warning.count)
			});
		case 'missedProductDemand':
			return i18n.t('copy.reportWarnings.missedProductDemand', {
				storeName: resolveStoreName(warning.storeId)
			});
		case 'reputationSlipping':
			return i18n.t('copy.reportWarnings.reputationSlipping', {
				storeName: resolveStoreName(warning.storeId)
			});
		case 'cashReservesLow':
			return i18n.t('copy.reportWarnings.cashReservesLow');
	}
}

function localizeGraphWarning(warning: GraphWarning, i18n: I18nBundle): string {
	switch (warning.code) {
		case 'noDailyReport':
			return i18n.t('copy.productChainGraph.warnings.noDailyReport');
		case 'noProductionRecipe':
			return i18n.t('copy.productChainGraph.warnings.noProductionRecipe', {
				materialName: i18n.labels.material(warning.materialId)
			});
	}
}

function isWorldCityContext(context: DecisionContext): boolean {
	return (
		context.code === 'worldCityOpeningCost' ||
		context.code === 'worldCityUnknown' ||
		context.code === 'worldCityNotAvailableYet'
	);
}

function classifyDecision(decision: DecisionItem): string | null {
	if (decision.kind !== 'system') return null;
	if (decision.id.startsWith('expansion-unavailable-')) return 'expansionUnavailable';
	if (decision.id.startsWith('expansion-cash-blocked-')) return 'expansionCashBlocked';
	if (decision.id.startsWith('location-unavailable')) return 'locationUnavailable';
	if (decision.id.startsWith('industrial-construction-delayed'))
		return 'industrialConstructionDelayed';
	// Restrict the world-city family to decisions carrying a recognized
	// world-city context code. A saved or future decision whose id merely
	// shares the 'world-city-' prefix (e.g. 'world-city-custom-1') but has
	// an unrelated context must fall through to null so its stored options
	// are preserved instead of being rewritten with world-city copy.
	if (decision.id.startsWith('world-city-') && isWorldCityContext(decision.context))
		return 'worldCity';
	return null;
}

function localizeDecisionContextValue(ctx: DecisionContext, i18n: I18nBundle): string {
	switch (ctx.code) {
		case 'expansionUnavailable':
			return i18n.t('copy.decisions.expansionUnavailable.context', { storeCap: ctx.storeCap });
		case 'expansionCashBlocked':
			return i18n.t('copy.decisions.expansionCashBlocked.context', {
				cash: i18n.format.currency(ctx.cash)
			});
		case 'locationBlocked':
			return i18n.t('copy.decisions.locationUnavailable.blockedContext', {
				reason: tScoped(i18n, 'copy.decisions.locationUnavailable.reasons', ctx.reason)
			});
		case 'locationGeneric':
			return i18n.t('copy.decisions.locationUnavailable.genericContext');
		case 'worldCityOpeningCost':
			return i18n.t('copy.decisions.worldCity.openingDelayed.context', {
				cash: i18n.format.currency(ctx.cash)
			});
		case 'worldCityUnknown':
			return i18n.t('copy.decisions.worldCity.cityUnavailable.context');
		case 'worldCityNotAvailableYet':
			// ctx.cityId is a stable WorldCityId enum; the requirement text is
			// translated under a per-city key. Do NOT use city.unlockRequirement
			// (that is a free-form English string, not a key).
			return i18n.t('copy.decisions.worldCity.notAvailableYet.context', {
				requirement: tScoped(i18n, `game.worldCities.${ctx.cityId}`, 'unlockRequirement')
			});
		case 'industrialUnknownTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.unknownTile');
		case 'industrialUnknownBuilding':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.unknownBuildingType');
		case 'industrialLockedTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.lockedTile');
		case 'industrialOccupiedTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.occupiedTile');
		case 'industrialRequiresResource':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.requiresResource', {
				resource: i18n.labels.industryResource(ctx.resourceId)
			});
		case 'industrialRequiresIndustrialTile':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.requiresIndustrialTile');
		case 'industrialRequiresCash':
			return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.requiresCash', {
				buildingName: i18n.labels.industrialBuilding(ctx.buildingTypeId),
				cash: i18n.format.currency(ctx.cash)
			});
		case 'cashPressure':
			return i18n.t('copy.decisions.cashPressure.context');
		case 'expansionOpportunity':
			return i18n.t('copy.decisions.expansionOpportunity.context');
		case 'supplierTerms':
			return i18n.t('copy.decisions.supplierTerms.context');
		case 'railUnknownBuilding':
			return i18n.t('copy.decisions.railConstruction.contexts.unknownBuilding');
		case 'railCrossCity':
			return i18n.t('copy.decisions.railConstruction.contexts.crossCity');
		case 'railSelfConnected':
			return i18n.t('copy.decisions.railConstruction.contexts.selfConnected');
		case 'railNoValidPath':
			return i18n.t('copy.decisions.railConstruction.contexts.noValidPath');
		case 'railAlreadyConnected':
			return i18n.t('copy.decisions.railConstruction.contexts.alreadyConnected');
		case 'railRequiresCash':
			return i18n.t('copy.decisions.railConstruction.contexts.requiresCash', {
				cost: i18n.format.currency(ctx.cost),
				cash: i18n.format.currency(ctx.cash)
			});
		case 'railSegmentAtMaxLevel':
			return i18n.t('copy.decisions.railConstruction.contexts.segmentAtMaxLevel');
		case 'railUnknownSegment':
			return i18n.t('copy.decisions.railConstruction.contexts.unknownSegment');
		case 'industrialTileHasRail':
			return i18n.t('copy.decisions.railConstruction.contexts.tileHasRail');
	}
}

function localizeDecisionTitle(decision: DecisionItem, i18n: I18nBundle): string {
	if (decision.kind === 'event') {
		return (
			translateMessage(
				i18n,
				`copy.${decision.copy.key}.title`,
				resolveEventCopyParams(decision.copy.params, i18n)
			) ?? decision.copy.key
		);
	}
	const family = classifyDecision(decision);

	switch (family) {
		case 'expansionUnavailable':
		case 'expansionCashBlocked':
		case 'locationUnavailable':
		case 'industrialConstructionDelayed':
			return translateMessage(i18n, `copy.decisions.${family}.title`) ?? decision.title;
		case 'worldCity':
			switch (decision.context.code) {
				case 'worldCityUnknown':
					return i18n.t('copy.decisions.worldCity.cityUnavailable.title');
				case 'worldCityNotAvailableYet':
					return i18n.t('copy.decisions.worldCity.notAvailableYet.title');
				case 'worldCityOpeningCost':
					return i18n.t('copy.decisions.worldCity.openingDelayed.title');
				default:
					return decision.title;
			}
		default:
			return decision.title;
	}
}

function localizeDecisionContext(decision: DecisionItem, i18n: I18nBundle): string {
	if (decision.kind === 'event') {
		return (
			translateMessage(
				i18n,
				`copy.${decision.copy.key}.context`,
				resolveEventCopyParams(decision.copy.params, i18n)
			) ?? decision.copy.key
		);
	}
	return localizeDecisionContextValue(decision.context, i18n);
}

function localizeEventDecisionOption(
	decision: Extract<DecisionItem, { kind: 'event' }>,
	optionId: string,
	i18n: I18nBundle
): LocalizedDecisionOption {
	// Option copy shares the enriched params of the title/context so a
	// materialized route decision stays understandable from its persisted copy
	// reference alone — even after the live route is removed.
	const key = `copy.${decision.copy.key}.options.${optionId}`;
	const params = resolveEventCopyParams(decision.copy.params, i18n);
	return {
		id: optionId,
		label: translateMessage(i18n, `${key}.label`, params) ?? optionId,
		description: translateMessage(i18n, `${key}.description`, params) ?? ''
	};
}

function localizeSystemDecisionOption(
	decision: Extract<DecisionItem, { kind: 'system' }>,
	option: SystemDecisionOption,
	i18n: I18nBundle
): LocalizedDecisionOption {
	const family = classifyDecision(decision);

	if (family === null) {
		return { id: option.id, label: option.label, description: option.description };
	}

	if (option.id === 'acknowledge') {
		const descriptionKey =
			family === 'industrialConstructionDelayed'
				? 'copy.decisions.industrialConstructionDelayed.acknowledge.description'
				: family === 'locationUnavailable'
					? 'copy.decisions.locationUnavailable.acknowledge.description'
					: family === 'worldCity'
						? 'copy.decisions.worldCity.acknowledge.description'
						: 'copy.decisions.acknowledge.description';

		return {
			id: option.id,
			label: i18n.t('copy.decisions.acknowledge.label'),
			description: i18n.t(descriptionKey as never)
		};
	}

	return {
		id: option.id,
		label:
			translateMessage(i18n, `copy.decisions.${family}.options.${option.id}.label`) ?? option.label,
		description:
			translateMessage(i18n, `copy.decisions.${family}.options.${option.id}.description`) ??
			option.description
	};
}

export function localizeStockStatus(status: StoreProductStatus, i18n: I18nBundle): string {
	switch (status) {
		case 'Out of stock':
			return i18n.t('copy.stockStatus.outOfStock');
		case 'Needs import':
			return i18n.t('copy.stockStatus.needsImport');
		default:
			return i18n.t('copy.stockStatus.healthy');
	}
}

export function localizeStockTrouble(
	products: Array<
		Pick<GameState['stores'][number]['products'][number], 'stock' | 'reorderThreshold'>
	>,
	i18n: I18nBundle
): string | null {
	let outOfStock = 0;
	let needsImport = 0;

	for (const product of products) {
		const status =
			product.stock <= 0
				? 'Out of stock'
				: product.stock < product.reorderThreshold
					? 'Needs import'
					: 'Healthy';
		if (status === 'Out of stock') {
			outOfStock += 1;
		} else if (status === 'Needs import') {
			needsImport += 1;
		}
	}

	const parts: string[] = [];
	if (outOfStock > 0) {
		parts.push(formatCountMessage(i18n, 'copy.stockTrouble.outOfStock', outOfStock));
	}
	if (needsImport > 0) {
		parts.push(formatCountMessage(i18n, 'copy.stockTrouble.needsImport', needsImport));
	}

	return parts.length > 0 ? i18n.format.list(parts) : null;
}

export function localizeAlert(alert: GameAlert, game: GameState, i18n: I18nBundle): string {
	if (alert.kind === 'store-stock' && alert.storeId) {
		const store = game.stores.find((candidate) => candidate.id === alert.storeId);
		if (store) {
			const summary = localizeStockTrouble(store.products, i18n);
			if (summary) {
				return i18n.t('copy.alerts.storeStock', {
					storeName: storeDisplayName(
						store,
						game.stores.findIndex((candidate) => candidate.id === alert.storeId) + 1,
						i18n
					),
					summary
				});
			}
		}
	}

	if (alert.kind === 'decision' && alert.decisionId) {
		const decision = game.decisions.find((candidate) => candidate.id === alert.decisionId);
		if (decision) {
			return i18n.t('copy.alerts.decision', {
				title: localizeDecisionTitle(decision, i18n)
			});
		}
	}

	if (alert.kind === 'event-modifier' && alert.modifierId) {
		const modifier = game.events.activeModifiers.find(
			(candidate) => candidate.id === alert.modifierId
		);
		if (modifier) {
			return i18n.t('copy.alerts.eventModifier', {
				title: localizeEventSourceTitle(modifier.source.eventId, i18n)
			});
		}
	}

	if (alert.kind === 'factory-blocked' && alert.buildingId) {
		const building = game.industrialBuildings.find(
			(candidate) => candidate.id === alert.buildingId
		);
		if (building) {
			return i18n.t('copy.alerts.factoryBlocked', {
				buildingName: i18n.labels.industrialBuilding(building.typeId)
			});
		}
	}

	if (
		(alert.kind === 'logistics-origin-stock' || alert.kind === 'logistics-route-capacity') &&
		alert.routeId
	) {
		const route = game.logistics.recurringRoutes.find(
			(candidate) => candidate.id === alert.routeId
		);
		if (route) {
			const origin = i18n.labels.worldCity(route.originCityId).name;
			const destination = i18n.labels.worldCity(route.destinationCityId).name;
			const material = i18n.labels.material(route.materialId);
			if (alert.kind === 'logistics-origin-stock') {
				return i18n.t('copy.alerts.logisticsOriginStock', { origin, material });
			}
			return i18n.t('copy.alerts.logisticsRouteCapacity', { origin, destination, material });
		}
	}

	if (alert.kind === 'upcomingLoanPayment' && alert.loanId) {
		const loan = game.finance.loans.find((candidate) => candidate.id === alert.loanId);
		if (loan && loan.nextPaymentDay !== null) {
			return i18n.t('copy.alerts.upcomingLoanPayment', {
				purpose: i18n.labels.loanPurpose(loan.purpose),
				amount: i18n.format.currency(estimateNextLoanPayment(loan)),
				day: loan.nextPaymentDay
			});
		}
	}

	if (alert.kind === 'missedLoanPayment' && alert.loanId) {
		const loan = game.finance.loans.find((candidate) => candidate.id === alert.loanId);
		if (loan && hasLoanArrears(loan)) {
			return i18n.t('copy.alerts.missedLoanPayment', {
				purpose: i18n.labels.loanPurpose(loan.purpose),
				amount: i18n.format.currency(getLoanArrearsAmount(loan))
			});
		}
	}

	if (alert.kind === 'covenantRisk') {
		const coverage = getFinanceMetrics(game).debtServiceCoverage;
		if (coverage !== null) {
			return i18n.t('copy.alerts.covenantRisk', {
				coverage: coverage.toFixed(2),
				threshold: COVENANT_THRESHOLD.toFixed(2)
			});
		}
	}

	if (alert.kind === 'lowCashRunway') {
		const runway = getFinanceMetrics(game).cashRunway;
		if (runway.kind === 'days') {
			return i18n.t('copy.alerts.lowCashRunway', { days: runway.days });
		}
	}

	return alert.message ?? '';
}

export function localizeGameAlert(
	game: GameState,
	alert: GameAlert,
	i18n: I18nBundle
): LocalizedGameAlert {
	return { ...alert, message: localizeAlert(alert, game, i18n) };
}

export function localizeEventSourceTitle(eventId: string, i18n: I18nBundle): string {
	const definition = PRODUCTION_EVENT_CATALOG.byId.get(eventId);
	if (!definition) return eventId;
	return (
		translateMessage(i18n, `copy.${definition.copy.key}.title`, definition.copy.params) ?? eventId
	);
}

export function localizeStructuredCopy(ref: StructuredCopyRef, i18n: I18nBundle): string {
	return translateMessage(i18n, `copy.${ref.key}`, ref.params) ?? ref.key;
}

/**
 * Localize one persisted dispatch-attempt impact row. Reads only persisted
 * fields, so historical evidence stays valid after the modifiers expire.
 */
export function localizeRouteModifierImpact(
	impact: RouteDispatchModifierImpact,
	i18n: I18nBundle
): string {
	switch (impact.effectKind) {
		case 'route-lead-time-adjustment':
			return i18n.t('copy.modifiers.impactLeadTime', {
				from: i18n.format.integer(impact.baselineLeadTimeDays),
				to: i18n.format.integer(impact.effectiveLeadTimeDays)
			});
		case 'route-capacity-multiplier':
			return i18n.t('copy.modifiers.impactCapacity', {
				from: i18n.format.integer(impact.baselineCapacity),
				to: i18n.format.integer(impact.effectiveCapacity),
				fromDispatched: i18n.format.integer(impact.baselineDispatchedQuantity),
				toDispatched: i18n.format.integer(impact.effectiveDispatchedQuantity)
			});
		case 'route-dispatch-suspension':
			return i18n.t('copy.modifiers.impactSuspension', {
				from: i18n.format.integer(impact.baselineDispatchedQuantity),
				to: i18n.format.integer(impact.effectiveDispatchedQuantity)
			});
		case 'route-transport-cost-multiplier':
			return i18n.t('copy.modifiers.impactTransportCost', {
				from: i18n.format.currency(impact.baselineTransportCost),
				to: i18n.format.currency(impact.effectiveTransportCost)
			});
	}
}

/**
 * Localize one persisted modifier-recovery row. Rows are rendered as-is: the
 * same-day same-kind rows per route already carry combined effective values.
 */
export function localizeRouteModifierRecovery(
	recovery: DailyRouteModifierRecovery,
	i18n: I18nBundle
): string {
	switch (recovery.effectKind) {
		case 'route-lead-time-adjustment':
			return i18n.t('copy.modifiers.recoveryLeadTime', {
				routeId: recovery.routeId,
				from: i18n.format.integer(recovery.disruptedLeadTimeDays),
				to: i18n.format.integer(recovery.recoveredLeadTimeDays)
			});
		case 'route-capacity-multiplier':
			return i18n.t('copy.modifiers.recoveryCapacity', {
				routeId: recovery.routeId,
				from: i18n.format.integer(recovery.disruptedCapacity),
				to: i18n.format.integer(recovery.recoveredCapacity)
			});
		case 'route-dispatch-suspension':
			return i18n.t('copy.modifiers.recoverySuspension', { routeId: recovery.routeId });
		case 'route-transport-cost-multiplier':
			return i18n.t('copy.modifiers.recoveryTransportCost', {
				routeId: recovery.routeId,
				from: i18n.format.currency(recovery.disruptedTransportCostPerUnit),
				to: i18n.format.currency(recovery.recoveredTransportCostPerUnit)
			});
	}
}

export function localizeDecision(decision: DecisionItem, i18n: I18nBundle): LocalizedDecision {
	const options =
		decision.kind === 'event'
			? decision.options.map((option) => localizeEventDecisionOption(decision, option.id, i18n))
			: decision.options.map((option) => localizeSystemDecisionOption(decision, option, i18n));

	return {
		id: decision.id,
		title: localizeDecisionTitle(decision, i18n),
		context: localizeDecisionContext(decision, i18n),
		options
	};
}

export function localizeDecisionFailure(
	availability: DecisionOptionAvailability,
	i18n: I18nBundle
): string | null {
	if (availability.available) return null;

	switch (availability.code) {
		case 'decision-not-found':
			return i18n.t('copy.decisionFailures.decisionNotFound');
		case 'option-not-found':
			return i18n.t('copy.decisionFailures.optionNotFound');
		case 'decision-expired':
			return i18n.t('copy.decisionFailures.decisionExpired');
		case 'effect-rejected':
			return i18n.t('copy.decisionFailures.effectRejected');
		case 'finance-unavailable':
			if (availability.reasons?.includes('delinquentObligation')) {
				return i18n.t('copy.decisionFailures.financeDelinquent');
			}
			if (availability.reasons?.includes('debtServiceCapacityLimited')) {
				return i18n.t('copy.decisionFailures.financeDebtService');
			}
			return i18n.t('copy.decisionFailures.financeCapacity');
	}
}

export function localizeLogisticsFailure(reason: LogisticsFailureCode, i18n: I18nBundle): string {
	switch (reason) {
		case 'invalid-origin':
			return i18n.t('logisticsPanel.failures.invalidOrigin');
		case 'invalid-destination':
			return i18n.t('logisticsPanel.failures.invalidDestination');
		case 'same-city':
			return i18n.t('logisticsPanel.failures.sameCity');
		case 'invalid-material':
			return i18n.t('logisticsPanel.failures.invalidMaterial');
		case 'invalid-quantity':
			return i18n.t('logisticsPanel.failures.invalidQuantity');
		case 'insufficient-origin-stock':
			return i18n.t('logisticsPanel.failures.insufficientOriginStock');
		case 'insufficient-cash':
			return i18n.t('logisticsPanel.failures.insufficientCash');
		case 'invalid-capacity':
			return i18n.t('logisticsPanel.failures.invalidCapacity');
		case 'invalid-frequency-days':
			return i18n.t('logisticsPanel.failures.invalidFrequencyDays');
		case 'invalid-lead-time-days':
			return i18n.t('logisticsPanel.failures.invalidLeadTimeDays');
		case 'invalid-transport-cost-per-unit':
			return i18n.t('logisticsPanel.failures.invalidTransportCostPerUnit');
		case 'invalid-priority':
			return i18n.t('logisticsPanel.failures.invalidPriority');
		case 'route-not-found':
			return i18n.t('logisticsPanel.failures.routeNotFound');
	}
}

export function localizeWorldCityStatus(
	status: WorldCityStatus,
	i18n: I18nBundle
): LocalizedWorldCityStatus {
	const cityLabel = i18n.labels.worldCity(status.city.id);
	let blockedReason: string | null = null;

	if (status.blockedReason) {
		switch (status.blockedReason.code) {
			case 'worldCityOpeningCost':
				blockedReason = i18n.t('copy.worldCity.blockedOpeningCost', {
					cash: i18n.format.currency(status.blockedReason.cash)
				});
				break;
			case 'worldCityNotAvailableYet':
				blockedReason =
					translateMessage(
						i18n,
						`game.worldCities.${status.blockedReason.cityId}.unlockRequirement`
					) ?? status.city.unlockRequirement;
				break;
			default:
				blockedReason = null;
		}
	}

	return {
		...status,
		city: {
			...status.city,
			name: cityLabel.name,
			unlockRequirement:
				translateMessage(i18n, `game.worldCities.${status.city.id}.unlockRequirement`) ??
				status.city.unlockRequirement,
			specialtySummary:
				translateMessage(i18n, `game.worldCities.${status.city.id}.specialtySummary`) ??
				status.city.specialtySummary
		},
		blockedReason,
		kindLabel: tScoped(i18n, 'copy.worldCity.kind', status.city.kind),
		stateLabel: tScoped(i18n, 'copy.worldCity.state', status.state)
	};
}

export function localizeProductChainGraph(
	graph: ProductChainGraph,
	i18n: I18nBundle
): LocalizedProductChainGraph {
	const localizedNodes = graph.nodes.map((node) => {
		const label =
			node.id === 'warehouse'
				? i18n.t('copy.productChainGraph.warehouseNode')
				: node.recipeId
					? i18n.labels.industrialBuilding(
							RECIPE_ID_TO_BUILDING_TYPE_ID.get(node.recipeId) ?? node.label
						)
					: node.materialId
						? i18n.labels.material(node.materialId)
						: node.label;

		return {
			...node,
			label,
			subLabel:
				node.subLabel && node.materialId ? i18n.labels.material(node.materialId) : node.subLabel,
			healthLabel: localizeHealth(node.health, i18n),
			statLine: localizeNodeStatLine(node, i18n),
			bottleneck: localizeBottleneck(node, label, i18n)
		};
	});

	const localizedNodeMap = Object.fromEntries(localizedNodes.map((node) => [node.id, node]));

	return {
		...graph,
		title: localizeGraphTitle(graph, i18n),
		nodes: localizedNodes,
		edges: graph.edges.map(
			(edge): LocalizedProductChainEdge => ({
				...edge,
				label: localizeEdgeLabel(edge.label, i18n),
				healthLabel: localizeHealth(edge.health, i18n)
			})
		),
		details: localizedNodeMap,
		warnings: graph.warnings.map((warning) => localizeGraphWarning(warning, i18n)),
		emptyReason: localizeGraphReason(graph.emptyReason, i18n)
	};
}

export function localizeProductChainCategorySummary(
	summary: ProductChainCategorySummary,
	i18n: I18nBundle
): LocalizedProductChainCategorySummary {
	return {
		...summary,
		bottleneck: localizeBottleneckInfo(summary.bottleneck, summary.name, i18n)
	};
}
