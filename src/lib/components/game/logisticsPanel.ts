import {
	getCityInventory,
	getCityInventoryStats,
	supportsCityInventory
} from '$lib/game/cityInventory';
import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
import { MATERIALS } from '$lib/game/industry';
import {
	selectInTransitInventory,
	selectLogisticsTotals,
	selectRecentTransfers,
	selectRouteOperations,
	type RouteOperationalSummary,
	type InTransitInventorySummary,
	type RouteOperationalCondition
} from '$lib/game/logisticsReadModels';
import { WORLD_CITY_CATALOG } from '$lib/game/worldCatalog';
import type {
	DailyRouteDispatchAttempt,
	GameState,
	MaterialId,
	MaterialKind,
	TransferOrder,
	WorldCityId
} from '$lib/game/types';
import type { I18nBundle } from '$lib/i18n';

export interface LogisticsCityOption {
	cityId: WorldCityId;
	label: string;
	used: number;
	capacity: number;
	inventorySummary: string;
}

export interface LogisticsMaterialOption {
	materialId: MaterialId;
	label: string;
	kind: MaterialKind;
	stock: number;
}

export interface LogisticsAttemptView {
	originCityId: WorldCityId;
	originLabel: string;
	destinationCityId: WorldCityId;
	destinationLabel: string;
	materialId: MaterialId;
	materialLabel: string;
	destinationNeed: number;
	capacity: number;
	availableOriginStock: number;
	dispatchedQuantity: number;
	unusedCapacity: number;
	unmetDestinationNeed: number;
	transportCost: number;
	transferOrderId: string | null;
}

export interface LogisticsRouteView {
	routeId: string;
	originCityId: WorldCityId;
	originLabel: string;
	destinationCityId: WorldCityId;
	destinationLabel: string;
	materialId: MaterialId;
	materialLabel: string;
	capacity: number;
	frequencyDays: number;
	leadTimeDays: number;
	transportCostPerUnit: number;
	priority: number;
	state: 'active' | 'paused';
	stateLabel: string;
	nextDispatchOnDay: number;
	inTransitQuantity: number;
	utilization: number | null;
	unusedCapacity: number;
	unmetDestinationNeed: number;
	deliveredUnits: number;
	transportCost: number;
	condition: RouteOperationalCondition;
	conditionLabel: string;
	latestAttempt: LogisticsAttemptView | null;
}

export interface LogisticsInTransitView {
	destinationCityId: WorldCityId;
	destinationLabel: string;
	materialId: MaterialId;
	materialLabel: string;
	quantity: number;
	orderIds: readonly string[];
	earliestArrivalOnDay: number;
}

export interface LogisticsTransferView {
	id: string;
	originCityId: WorldCityId;
	originLabel: string;
	destinationCityId: WorldCityId;
	destinationLabel: string;
	materialId: MaterialId;
	materialLabel: string;
	quantity: number;
	dispatchedOnDay: number;
	arrivalOnDay: number;
	transportCost: number;
	status: TransferOrder['status'];
	statusLabel: string;
	sourceLabel: string;
	sourceRouteId: string | null;
}

export interface LogisticsTotalsView {
	deliveredUnits: number;
	transportCost: number;
}

export interface LogisticsPanelView {
	cityOptions: readonly LogisticsCityOption[];
	materialOptions: readonly LogisticsMaterialOption[];
	routes: readonly LogisticsRouteView[];
	inTransit: readonly LogisticsInTransitView[];
	recentTransfers: readonly LogisticsTransferView[];
	totals: LogisticsTotalsView;
}

export interface LogisticsRouteFormValues {
	originCityId: string;
	destinationCityId: string;
	materialId: string;
	capacity: string;
	frequencyDays: string;
	leadTimeDays: string;
	transportCostPerUnit: string;
	priority: string;
}

export function routePresetKey(input: RecurringRouteInput): string {
	return [
		input.originCityId,
		input.destinationCityId,
		input.materialId,
		input.capacity,
		input.frequencyDays,
		input.leadTimeDays,
		input.transportCostPerUnit,
		input.priority
	].join('\u0000');
}

export function applyRoutePreset(
	current: LogisticsRouteFormValues,
	preset: RecurringRouteInput,
	appliedKey: string | null
): { values: LogisticsRouteFormValues; appliedKey: string } {
	const nextKey = routePresetKey(preset);
	if (appliedKey === nextKey) {
		return { values: current, appliedKey: nextKey };
	}

	return {
		values: {
			originCityId: preset.originCityId,
			destinationCityId: preset.destinationCityId,
			materialId: preset.materialId,
			capacity: String(preset.capacity),
			frequencyDays: String(preset.frequencyDays),
			leadTimeDays: String(preset.leadTimeDays),
			transportCostPerUnit: String(preset.transportCostPerUnit),
			priority: String(preset.priority)
		},
		appliedKey: nextKey
	};
}

function scopedTranslation(
	i18n: I18nBundle,
	prefix: string,
	suffix: string,
	params?: Record<string, string | number>
): string {
	return i18n.t(`${prefix}.${suffix}` as never, params);
}

function cityLabel(cityId: WorldCityId, i18n: I18nBundle): string {
	return i18n.labels.worldCity(cityId).name;
}

function materialLabel(materialId: MaterialId, i18n: I18nBundle): string {
	return i18n.labels.material(materialId);
}

function buildCityOptions(game: GameState, i18n: I18nBundle): LogisticsCityOption[] {
	return WORLD_CITY_CATALOG.flatMap((city) => {
		if (!supportsCityInventory(game, city.id)) {
			return [];
		}

		const access = getCityInventory(game, city.id);
		if (!access.ok) {
			return [];
		}

		const stats = getCityInventoryStats(game, city.id);
		return [
			{
				cityId: city.id,
				label: cityLabel(city.id, i18n),
				used: stats.used,
				capacity: stats.capacity,
				inventorySummary: i18n.t('logisticsPanel.inventorySummary', {
					used: i18n.format.integer(stats.used),
					capacity: i18n.format.integer(stats.capacity)
				})
			}
		];
	});
}

function buildMaterialOptions(
	game: GameState,
	cityOptions: readonly LogisticsCityOption[],
	i18n: I18nBundle
): LogisticsMaterialOption[] {
	const stockByMaterial = new Map<MaterialId, number>();

	for (const city of cityOptions) {
		const access = getCityInventory(game, city.cityId);
		if (!access.ok) continue;

		for (const [materialId, quantity] of Object.entries(access.inventory.materials)) {
			const typedMaterialId = materialId as MaterialId;
			stockByMaterial.set(
				typedMaterialId,
				(stockByMaterial.get(typedMaterialId) ?? 0) + (quantity ?? 0)
			);
		}
	}

	return Object.values(MATERIALS).map((material) => ({
		materialId: material.id,
		label: materialLabel(material.id, i18n),
		kind: material.kind,
		stock: stockByMaterial.get(material.id) ?? 0
	}));
}

function localizeAttempt(
	attempt: DailyRouteDispatchAttempt,
	i18n: I18nBundle
): LogisticsAttemptView {
	return {
		...attempt,
		originLabel: cityLabel(attempt.originCityId, i18n),
		destinationLabel: cityLabel(attempt.destinationCityId, i18n),
		materialLabel: materialLabel(attempt.materialId, i18n)
	};
}

function localizeRoute(summary: RouteOperationalSummary, i18n: I18nBundle): LogisticsRouteView {
	const route = summary.route;
	return {
		routeId: route.id,
		originCityId: route.originCityId,
		originLabel: cityLabel(route.originCityId, i18n),
		destinationCityId: route.destinationCityId,
		destinationLabel: cityLabel(route.destinationCityId, i18n),
		materialId: route.materialId,
		materialLabel: materialLabel(route.materialId, i18n),
		capacity: route.capacity,
		frequencyDays: route.frequencyDays,
		leadTimeDays: route.leadTimeDays,
		transportCostPerUnit: route.transportCostPerUnit,
		priority: route.priority,
		state: route.state,
		stateLabel: scopedTranslation(i18n, 'logisticsPanel.states', route.state),
		nextDispatchOnDay: route.nextDispatchOnDay,
		inTransitQuantity: summary.inTransitQuantity,
		utilization: summary.utilization,
		unusedCapacity: summary.unusedCapacity,
		unmetDestinationNeed: summary.unmetDestinationNeed,
		deliveredUnits: summary.deliveredUnits,
		transportCost: summary.transportCost,
		condition: summary.condition,
		conditionLabel: scopedTranslation(i18n, 'logisticsPanel.conditions', summary.condition),
		latestAttempt: summary.latestAttempt ? localizeAttempt(summary.latestAttempt, i18n) : null
	};
}

function localizeInTransit(
	summary: InTransitInventorySummary,
	i18n: I18nBundle
): LogisticsInTransitView {
	return {
		...summary,
		destinationLabel: cityLabel(summary.destinationCityId, i18n),
		materialLabel: materialLabel(summary.materialId, i18n)
	};
}

function localizeTransfer(order: TransferOrder, i18n: I18nBundle): LogisticsTransferView {
	return {
		...order,
		originLabel: cityLabel(order.originCityId, i18n),
		destinationLabel: cityLabel(order.destinationCityId, i18n),
		materialLabel: materialLabel(order.materialId, i18n),
		statusLabel: scopedTranslation(i18n, 'logisticsPanel.statuses', order.status),
		sourceLabel:
			order.source.kind === 'manual'
				? i18n.t('logisticsPanel.sources.manual')
				: i18n.t('logisticsPanel.sources.recurringRoute'),
		sourceRouteId: order.source.kind === 'recurring-route' ? order.source.routeId : null
	};
}

export function buildLogisticsPanelView(game: GameState, i18n: I18nBundle): LogisticsPanelView {
	const cityOptions = buildCityOptions(game, i18n);
	return {
		cityOptions,
		materialOptions: buildMaterialOptions(game, cityOptions, i18n),
		routes: selectRouteOperations(game).map((summary) => localizeRoute(summary, i18n)),
		inTransit: selectInTransitInventory(game).map((summary) => localizeInTransit(summary, i18n)),
		recentTransfers: selectRecentTransfers(game).map((order) => localizeTransfer(order, i18n)),
		totals: selectLogisticsTotals(game)
	};
}
