import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
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
import type { GameAlert } from '$lib/game/alerts';
import type {
	DailyReportWarning,
	GameState,
	DecisionItem,
	DecisionOption,
	Store
} from '$lib/game/types';
import type { DecisionContext } from '$lib/game/decisionContext';
import type { WorldCityStatus } from '$lib/game/world';
import type { StoreProductStatus } from '$lib/game/stock';
import type { I18nBundle } from './index';
import type {
	LocalizedDecision,
	LocalizedDecisionOption,
	LocalizedProductChainCategorySummary,
	LocalizedProductChainEdge,
	LocalizedProductChainGraph,
	LocalizedWorldCityStatus
} from './localizedTypes';

export type {
	LocalizedDecision,
	LocalizedDecisionOption,
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
			return localizeDecisionContextValue(reason.message, i18n);
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

function localizeHealth(health: ProductChainHealth, i18n: I18nBundle): string {
	return tScoped(i18n, 'copy.productChainGraph.health', health);
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
				quantity: info.quantity
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
			return i18n.t('copy.productChainGraph.edges.in', { quantity: labelInfo.quantity });
		case 'out':
			return i18n.t('copy.productChainGraph.edges.out', { quantity: labelInfo.quantity });
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
				actual: labelInfo.actual,
				required: labelInfo.required
			});
		}
	}
}

function localizeGraphTitle(graph: ProductChainGraph, i18n: I18nBundle): string {
	if (graph.id === 'warehouse-flow') {
		return i18n.t('copy.productChainGraph.title.warehouseFlow');
	}

	if (graph.id.startsWith('chain:')) {
		const materialId = graph.id.slice('chain:'.length);
		return i18n.labels.material(materialId);
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

function classifyDecision(decision: DecisionItem): string | null {
	if (decision.id === 'cash-pressure') return 'cashPressure';
	if (decision.id === 'expansion-opportunity') return 'expansionOpportunity';
	if (decision.id === 'supplier-terms') return 'supplierTerms';
	if (decision.id.startsWith('expansion-unavailable-')) return 'expansionUnavailable';
	if (decision.id.startsWith('expansion-cash-blocked-')) return 'expansionCashBlocked';
	if (decision.id.startsWith('location-unavailable')) return 'locationUnavailable';
	if (decision.id.startsWith('industrial-construction-delayed'))
		return 'industrialConstructionDelayed';
	if (decision.id.startsWith('world-city-')) return 'worldCity';
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
	}
}

function localizeDecisionTitle(decision: DecisionItem, i18n: I18nBundle): string {
	const family = classifyDecision(decision);

	switch (family) {
		case 'cashPressure':
		case 'expansionOpportunity':
		case 'supplierTerms':
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
	return localizeDecisionContextValue(decision.context, i18n);
}

function localizeDecisionOption(
	decision: DecisionItem,
	option: DecisionOption,
	i18n: I18nBundle
): LocalizedDecisionOption {
	const family = classifyDecision(decision);

	if (family === null) {
		return { ...option };
	}

	if (option.id === 'acknowledge') {
		const descriptionKey =
			family === 'industrialConstructionDelayed'
				? 'copy.decisions.industrialConstructionDelayed.acknowledge.description'
				: family === 'locationUnavailable'
					? 'copy.decisions.locationUnavailable.acknowledge.description'
					: 'copy.decisions.acknowledge.description';

		return {
			...option,
			label: i18n.t('copy.decisions.acknowledge.label'),
			description: i18n.t(descriptionKey as never)
		};
	}

	return {
		...option,
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

	return parts.length > 0 ? parts.join(', ') : null;
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
				title: localizeDecision(decision, i18n).title
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

	return alert.message;
}

export function localizeDecision(decision: DecisionItem, i18n: I18nBundle): LocalizedDecision {
	return {
		...decision,
		title: localizeDecisionTitle(decision, i18n),
		context: localizeDecisionContext(decision, i18n),
		options: decision.options.map((option) => localizeDecisionOption(decision, option, i18n))
	};
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
				blockedReason = tScoped(
					i18n,
					`game.worldCities.${status.blockedReason.cityId}`,
					'unlockRequirement'
				);
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
				: node.materialId
					? i18n.labels.material(node.materialId)
					: node.recipeId
						? i18n.labels.industrialBuilding(
								Object.values(INDUSTRIAL_BUILDING_TYPES).find(
									(type) => type.recipeId === node.recipeId
								)?.id ?? node.label
							)
						: node.label;

		return {
			...node,
			label,
			subLabel:
				node.subLabel && node.materialId ? i18n.labels.material(node.materialId) : node.subLabel,
			healthLabel: localizeHealth(node.health, i18n),
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
				label: localizeEdgeLabel(edge.label, i18n)
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
