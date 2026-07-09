import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import type { PlacementBlockReason } from '$lib/game/placementPreview';
import type {
	ProductChainEdge,
	ProductChainGraph,
	ProductChainNode
} from '$lib/game/productChainGraph';
import type { GameAlert } from '$lib/game/alerts';
import type { GameState, DecisionItem, DecisionOption } from '$lib/game/types';
import { WORLD_CITY_CATALOG } from '$lib/game/world';
import type { WorldCityStatus } from '$lib/game/world';
import type { StoreProductStatus } from '$lib/game/stock';
import type { I18nBundle } from './index';

const INDUSTRY_RESOURCE_ID_BY_RAW_LABEL = new Map(
	Object.values(INDUSTRIAL_BUILDING_TYPES)
		.map((buildingType) => buildingType.requiredResource)
		.filter((resourceId): resourceId is NonNullable<typeof resourceId> => resourceId !== null)
		.map((resourceId) => [resourceId.replaceAll('-', ' '), resourceId] as const)
);

const INDUSTRIAL_BUILDING_ID_BY_NAME = new Map(
	Object.values(INDUSTRIAL_BUILDING_TYPES).map(
		(buildingType) => [buildingType.name, buildingType.id] as const
	)
);

export type LocalizedDecisionOption = DecisionOption;

export interface LocalizedDecision extends DecisionItem {
	options: LocalizedDecisionOption[];
}

export interface LocalizedWorldCityStatus extends WorldCityStatus {
	city: WorldCityStatus['city'];
	kindLabel: string;
	stateLabel: string;
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
			return i18n.t('placement.retail.unknownCityTile' as never);
		case 'retail.storeLimitReached':
			return i18n.t('placement.retail.storeLimitReached' as never);
		case 'retail.requiresCash':
			return i18n.t('placement.retail.requiresCash' as never, {
				amount: i18n.format.currency(reason.amount)
			});
		case 'retail.occupiedLocation':
			return i18n.t('placement.retail.occupiedLocation' as never);
		case 'retail.lockedLocation':
			return i18n.t('placement.retail.lockedLocation' as never);
		case 'retail.roadLocation':
			return i18n.t('placement.retail.roadLocation' as never);
		case 'retail.riverLocation':
			return i18n.t('placement.retail.riverLocation' as never);
		case 'retail.noValidTiles':
			return i18n.t('placement.retail.noValidTiles' as never);
		case 'industry.lockedUntilRetail':
			return i18n.t('placement.industry.lockedUntilRetail' as never);
		case 'industry.unknownBuildingType':
			return i18n.t('placement.industry.unknownBuildingType' as never);
		case 'industry.requiresCash':
			return i18n.t('placement.industry.requiresCash' as never, {
				buildingName: i18n.labels.industrialBuilding(reason.buildingTypeId),
				amount: i18n.format.currency(reason.amount)
			});
		case 'industry.rawPlacementBlocked':
			return reason.message;
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

function formatCountMessage(i18n: I18nBundle, baseKey: string, count: number): string {
	return i18n.t(`${baseKey}.${count === 1 ? 'one' : 'other'}` as never, { count });
}

function formatQuantity(quantity: string): string {
	return quantity;
}

function localizeHealth(health: ProductChainNode['health'], i18n: I18nBundle): string {
	return i18n.t(`copy.productChainGraph.health.${health}` as never);
}

function localizeBottleneck(node: ProductChainNode, label: string, i18n: I18nBundle): string {
	if (node.id === 'warehouse') {
		if (node.bottleneck === 'No warehouse capacity is available.') {
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseNoCapacity' as never);
		}

		const overflowMatch = node.bottleneck.match(/^(\d+) units are in overflow storage\.$/);
		if (overflowMatch) {
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseOverflow' as never, {
				quantity: overflowMatch[1] ?? '0'
			});
		}

		if (node.bottleneck === 'Warehouse capacity is available.') {
			return i18n.t('copy.productChainGraph.bottlenecks.warehouseAvailable' as never);
		}
	}

	switch (node.health) {
		case 'healthy':
			return i18n.t('copy.productChainGraph.bottlenecks.healthy' as never, { label });
		case 'watch':
			return i18n.t('copy.productChainGraph.bottlenecks.watch' as never, { label });
		case 'shortage':
			return i18n.t('copy.productChainGraph.bottlenecks.shortage' as never, { label });
		case 'no-local-capacity':
			return i18n.t('copy.productChainGraph.bottlenecks.noLocalCapacity' as never, { label });
		default:
			return i18n.t('copy.productChainGraph.bottlenecks.noReport' as never, { label });
	}
}

function localizeEdgeLabel(label: string, i18n: I18nBundle): string {
	const inMatch = label.match(/^(.+)\/day in$/);
	if (inMatch) {
		return i18n.t('copy.productChainGraph.edges.in' as never, {
			quantity: formatQuantity(inMatch[1]!)
		});
	}

	const outMatch = label.match(/^(.+)\/day out$/);
	if (outMatch) {
		return i18n.t('copy.productChainGraph.edges.out' as never, {
			quantity: formatQuantity(outMatch[1]!)
		});
	}

	const cycleMatch = label.match(/^(.+)\/day (produced|used) · (.+)\/cycle( · import)?$/);
	if (cycleMatch) {
		const actual = cycleMatch[1]!;
		const verb = cycleMatch[2]!;
		const required = cycleMatch[3]!;
		const imported = Boolean(cycleMatch[4]);
		const key =
			verb === 'produced'
				? imported
					? 'copy.productChainGraph.edges.producedImported'
					: 'copy.productChainGraph.edges.produced'
				: imported
					? 'copy.productChainGraph.edges.usedImported'
					: 'copy.productChainGraph.edges.used';

		return i18n.t(key as never, { actual, required });
	}

	return label;
}

function localizeGraphTitle(graph: ProductChainGraph, i18n: I18nBundle): string {
	if (graph.id === 'warehouse-flow') {
		return i18n.t('copy.productChainGraph.title.warehouseFlow' as never);
	}

	if (graph.id.startsWith('chain:')) {
		const materialId = graph.id.slice('chain:'.length);
		return i18n.labels.material(materialId);
	}

	return graph.title;
}

function localizeGraphReason(reason: string | null, i18n: I18nBundle): string | null {
	if (reason === null) {
		return null;
	}

	if (reason === 'No warehouse stock or daily report yet.') {
		return i18n.t('copy.productChainGraph.emptyReason.noWarehouseData' as never);
	}

	if (reason === 'No local production chain available for this category yet.') {
		return i18n.t('copy.productChainGraph.emptyReason.noLocalChain' as never);
	}

	return reason;
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

function localizeLocationUnavailableContext(context: string, i18n: I18nBundle): string {
	const blockedMatch = context.match(
		/^(Locked location|Road location|River location) blocks store placement\. Choose another city tile\.$/
	);
	if (blockedMatch) {
		const reason = blockedMatch[1]!;
		const reasonKey =
			reason === 'Locked location' ? 'locked' : reason === 'Road location' ? 'road' : 'river';
		return i18n.t('copy.decisions.locationUnavailable.blockedContext' as never, {
			reason: i18n.t(`copy.decisions.locationUnavailable.reasons.${reasonKey}` as never)
		});
	}

	if (context === 'Choose an unlocked, unoccupied city tile before opening this store.') {
		return i18n.t('copy.decisions.locationUnavailable.genericContext' as never);
	}

	return context;
}

function localizeWorldDecisionContext(decision: DecisionItem, i18n: I18nBundle): string {
	if (decision.title === 'City unavailable' && decision.context === 'Unknown city.') {
		return i18n.t('copy.decisions.worldCity.cityUnavailable.context' as never);
	}

	if (decision.title === 'City is not available yet') {
		const city = WORLD_CITY_CATALOG.find((entry) => entry.unlockRequirement === decision.context);
		if (city) {
			return i18n.t('copy.decisions.worldCity.notAvailableYet.context' as never, {
				requirement: i18n.t(`game.worldCities.${city.id}.unlockRequirement` as never)
			});
		}
	}

	if (decision.title === 'City opening delayed') {
		const match = decision.context.match(/^Opening this city requires ([\d,]+) cash\.$/);
		if (match) {
			return i18n.t('copy.decisions.worldCity.openingDelayed.context' as never, {
				cash: match[1] ?? '0'
			});
		}
	}

	return decision.context;
}

function localizeIndustrialConstructionContext(context: string, i18n: I18nBundle): string {
	const directContexts: Record<string, string> = {
		'Unknown industrial tile': 'copy.decisions.industrialConstructionDelayed.contexts.unknownTile',
		'Unknown industrial building type':
			'copy.decisions.industrialConstructionDelayed.contexts.unknownBuildingType',
		'Locked industrial tile': 'copy.decisions.industrialConstructionDelayed.contexts.lockedTile',
		'Occupied industrial tile':
			'copy.decisions.industrialConstructionDelayed.contexts.occupiedTile',
		'Requires industrial tile':
			'copy.decisions.industrialConstructionDelayed.contexts.requiresIndustrialTile'
	};
	const directKey = directContexts[context];
	if (directKey) {
		return i18n.t(directKey as never);
	}

	const resourceMatch = context.match(/^Requires (.+)$/);
	if (resourceMatch) {
		const rawResource = resourceMatch[1] ?? context;
		const resourceId = INDUSTRY_RESOURCE_ID_BY_RAW_LABEL.get(rawResource);
		return i18n.t(
			'copy.decisions.industrialConstructionDelayed.contexts.requiresResource' as never,
			{
				resource: resourceId ? i18n.labels.industryResource(resourceId) : rawResource
			}
		);
	}

	const cashMatch = context.match(/^(.+) requires ([\d,]+) cash\.$/);
	if (cashMatch) {
		const rawBuildingName = cashMatch[1] ?? '';
		const buildingTypeId = INDUSTRIAL_BUILDING_ID_BY_NAME.get(rawBuildingName);
		return i18n.t('copy.decisions.industrialConstructionDelayed.contexts.requiresCash' as never, {
			buildingName: buildingTypeId
				? i18n.labels.industrialBuilding(buildingTypeId)
				: rawBuildingName,
			cash: cashMatch[2] ?? '0'
		});
	}

	return context;
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
			if (decision.title === 'City unavailable') {
				return i18n.t('copy.decisions.worldCity.cityUnavailable.title' as never);
			}
			if (decision.title === 'City is not available yet') {
				return i18n.t('copy.decisions.worldCity.notAvailableYet.title' as never);
			}
			if (decision.title === 'City opening delayed') {
				return i18n.t('copy.decisions.worldCity.openingDelayed.title' as never);
			}
			return decision.title;
		default:
			return decision.title;
	}
}

function localizeDecisionContext(decision: DecisionItem, i18n: I18nBundle): string {
	const family = classifyDecision(decision);

	switch (family) {
		case 'cashPressure':
		case 'expansionOpportunity':
		case 'supplierTerms':
			return translateMessage(i18n, `copy.decisions.${family}.context`) ?? decision.context;
		case 'expansionUnavailable': {
			const match = decision.context.match(/^This chain can operate up to (\d+) stores for now\.$/);
			return match
				? i18n.t('copy.decisions.expansionUnavailable.context' as never, {
						storeCap: match[1] ?? '0'
					})
				: decision.context;
		}
		case 'expansionCashBlocked': {
			const match = decision.context.match(/^Opening another store requires ([\d,]+) cash\.$/);
			return match
				? i18n.t('copy.decisions.expansionCashBlocked.context' as never, {
						cash: match[1] ?? '0'
					})
				: decision.context;
		}
		case 'locationUnavailable':
			return localizeLocationUnavailableContext(decision.context, i18n);
		case 'industrialConstructionDelayed':
			return localizeIndustrialConstructionContext(decision.context, i18n);
		case 'worldCity':
			return localizeWorldDecisionContext(decision, i18n);
		default:
			return decision.context;
	}
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
			label: i18n.t('copy.decisions.acknowledge.label' as never),
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
			return i18n.t('copy.stockStatus.outOfStock' as never);
		case 'Needs import':
			return i18n.t('copy.stockStatus.needsImport' as never);
		default:
			return i18n.t('copy.stockStatus.healthy' as never);
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
				return i18n.t('copy.alerts.storeStock' as never, {
					storeName: store.name,
					summary
				});
			}
		}
	}

	if (alert.kind === 'decision' && alert.decisionId) {
		const decision = game.decisions.find((candidate) => candidate.id === alert.decisionId);
		if (decision) {
			return i18n.t('copy.alerts.decision' as never, {
				title: localizeDecision(decision, i18n).title
			});
		}
	}

	if (alert.kind === 'factory-blocked' && alert.buildingId) {
		const building = game.industrialBuildings.find(
			(candidate) => candidate.id === alert.buildingId
		);
		if (building) {
			return i18n.t('copy.alerts.factoryBlocked' as never, {
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
	let blockedReason = status.blockedReason;

	if (status.blockedReason === status.city.unlockRequirement) {
		blockedReason =
			translateMessage(i18n, `game.worldCities.${status.city.id}.unlockRequirement`) ??
			status.blockedReason;
	} else if (status.blockedReason) {
		const match = status.blockedReason.match(/^Opening this city requires ([\d,]+) cash\.$/);
		if (match) {
			blockedReason = i18n.t('copy.worldCity.blockedOpeningCost' as never, {
				cash: match[1] ?? '0'
			});
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
		kindLabel: i18n.t(`copy.worldCity.kind.${status.city.kind}` as never),
		stateLabel: i18n.t(`copy.worldCity.state.${status.state}` as never)
	};
}

export function localizeProductChainGraph(
	graph: ProductChainGraph,
	i18n: I18nBundle
): ProductChainGraph {
	const localizedNodes = graph.nodes.map((node) => {
		const label =
			node.id === 'warehouse'
				? i18n.t('copy.productChainGraph.warehouseNode' as never)
				: node.materialId
					? i18n.labels.material(node.materialId)
					: node.recipeId
						? i18n.labels.industrialBuilding(
								Object.values(INDUSTRIAL_BUILDING_TYPES).find(
									(type) => type.recipeId === node.recipeId
								)?.id ?? node.label
							)
						: node.label;

		const localizedNode: ProductChainNode = {
			...node,
			label,
			subLabel:
				node.subLabel && node.materialId ? i18n.labels.material(node.materialId) : node.subLabel,
			healthLabel: localizeHealth(node.health, i18n),
			bottleneck: localizeBottleneck(node, label, i18n)
		};

		return localizedNode;
	});

	const localizedNodeMap = Object.fromEntries(localizedNodes.map((node) => [node.id, node]));
	const localizedEdges = graph.edges.map(
		(edge): ProductChainEdge => ({
			...edge,
			label: localizeEdgeLabel(edge.label, i18n)
		})
	);

	return {
		...graph,
		title: localizeGraphTitle(graph, i18n),
		nodes: localizedNodes,
		edges: localizedEdges,
		details: localizedNodeMap,
		warnings: graph.warnings.map((warning) =>
			warning === 'No daily report yet; latest-day flow is unavailable.'
				? i18n.t('copy.productChainGraph.warnings.noDailyReport' as never)
				: warning
		),
		emptyReason: localizeGraphReason(graph.emptyReason, i18n)
	};
}
