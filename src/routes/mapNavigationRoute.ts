import type { GameAlert } from '$lib/game/alerts';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';
import type { GameState, ProductId, WorldCityId } from '$lib/game/types';
import {
	getWorldCityStatus,
	isWorldCityId,
	WORLD_CITY_CATALOG,
	type WorldCityStatus
} from '$lib/game/world';
import { decisionContextWorldCityNotAvailableYet } from '$lib/game/decisionContext';
import type { I18nBundle } from '$lib/i18n';
import {
	resolveAlertNavigation,
	resolveStockAlertDestination,
	type AlertPanelNavigation,
	type AlertWorldRouteNavigation
} from './alertNavigation';
import type { PendingFinancedPurchase } from './financePurchaseReview';

export function selectMapHeading(
	view: MapViewId,
	retailCityId: string,
	industryCityId: string,
	i18n: I18nBundle
) {
	return {
		mapEyebrow:
			view === 'world'
				? i18n.t('route.mapEyebrow.world')
				: view === 'industry'
					? i18n.t('route.mapEyebrow.industry')
					: i18n.t('route.mapEyebrow.retail'),
		mapTitle:
			view === 'world'
				? i18n.t('route.mapTitle.world')
				: i18n.labels.worldCity(view === 'industry' ? industryCityId : retailCityId).name
	};
}

export function selectWorldCityStatuses(game: GameState | null): WorldCityStatus[] {
	return WORLD_CITY_CATALOG.map((city) =>
		game
			? getWorldCityStatus(game, city.id)
			: {
					city,
					state: city.initiallyOpened ? 'opened' : 'locked',
					canOpen: false,
					blockedReason: city.initiallyOpened
						? null
						: decisionContextWorldCityNotAvailableYet(city.id),
					storeCount: 0,
					buildingCount: 0
				}
	).filter((status): status is WorldCityStatus => status !== null);
}

interface MapViewSelections {
	selectedTileId: string | null;
	selectedIndustryTileId: string | null;
	selectedWorldCityId: string | null;
	selectedLogisticsRouteId: string | null;
	focusedLogisticsRouteId: string | null;
}

export function selectMapViewSelections(
	view: MapViewId,
	selections: MapViewSelections
): MapViewSelections {
	return {
		selectedTileId: view === 'retail' ? selections.selectedTileId : null,
		selectedIndustryTileId: view === 'industry' ? selections.selectedIndustryTileId : null,
		selectedWorldCityId: view === 'world' ? selections.selectedWorldCityId : null,
		selectedLogisticsRouteId: view === 'world' ? selections.selectedLogisticsRouteId : null,
		focusedLogisticsRouteId: view === 'world' ? selections.focusedLogisticsRouteId : null
	};
}

export function resolveWorldCitySelection(
	game: GameState | null,
	cityId: string,
	allowedCityIds: readonly WorldCityId[],
	canSelectCity: boolean
): { cityId: WorldCityId; mapView: 'retail' | 'industry' | null } | null {
	if (!isWorldCityId(cityId) || !allowedCityIds.includes(cityId)) return null;
	if (!game) return { cityId, mapView: null };
	const status = getWorldCityStatus(game, cityId);
	if (!status) return null;
	// Inspection survives pending writes; switching an opened city's active map does not.
	return {
		cityId,
		mapView: status.state === 'opened' && canSelectCity ? status.city.kind : null
	};
}

export function resolveWorldCityOpening(
	game: GameState | null,
	cityId: string,
	allowedCityIds: readonly WorldCityId[],
	canOpenCity: boolean
): WorldCityId | null {
	return game && isWorldCityId(cityId) && canOpenCity && allowedCityIds.includes(cityId)
		? cityId
		: null;
}

export function resolveWorldCityFinancing(
	game: GameState | null,
	cityId: string,
	allowedCityIds: readonly WorldCityId[],
	canFinanceCity: boolean
): Extract<PendingFinancedPurchase, { kind: 'world' }> | null {
	const legalCityId = resolveWorldCityOpening(game, cityId, allowedCityIds, canFinanceCity);
	if (!game || !legalCityId) return null;
	const status = getWorldCityStatus(game, legalCityId);
	if (!status?.financeOffer || game.cash >= status.city.openingCost) return null;
	return {
		kind: 'world',
		cityId: legalCityId,
		expectedCost: status.city.openingCost,
		offer: status.financeOffer
	};
}

type MapAlertDestination =
	| (AlertPanelNavigation & { kind: 'panel' })
	| AlertWorldRouteNavigation
	| {
			kind: 'retail';
			cityIdToSelect: WorldCityId | null;
			tileId: string;
			productId: ProductId | null;
	  }
	| {
			kind: 'industry';
			cityIdToSelect: WorldCityId | null;
			tileId: string;
			fix: 'warehouse' | 'rail' | null;
			buildingId: string | undefined;
	  };

export function resolveMapAlertDestination(
	alert: GameAlert,
	game: GameState | null,
	allowedCityIds: readonly WorldCityId[],
	canSelectCity: boolean
): MapAlertDestination | null {
	const navigation = resolveAlertNavigation(alert);
	if (navigation) {
		return 'kind' in navigation ? navigation : { kind: 'panel', ...navigation };
	}
	if (alert.kind === 'store-stock') {
		const destination = game ? resolveStockAlertDestination(alert, game) : null;
		if (!destination || !game) return null;
		let cityIdToSelect: WorldCityId | null = null;
		if (destination.cityId !== game.activeCityId) {
			if (
				!isWorldCityId(destination.cityId) ||
				!canSelectCity ||
				!allowedCityIds.includes(destination.cityId)
			)
				return null;
			cityIdToSelect = destination.cityId;
		}
		return {
			kind: 'retail',
			cityIdToSelect,
			tileId: destination.tileId,
			productId: destination.productId
		};
	}
	if (
		(alert.kind === 'factory-blocked' ||
			alert.kind === 'industry-warehouse-missing' ||
			alert.kind === 'industry-rail-disconnected') &&
		alert.tileId
	) {
		let cityIdToSelect: WorldCityId | null = null;
		if (game && alert.cityId && alert.cityId !== game.activeIndustryCityId) {
			if (!isWorldCityId(alert.cityId) || !canSelectCity || !allowedCityIds.includes(alert.cityId))
				return null;
			cityIdToSelect = alert.cityId;
		}
		return {
			kind: 'industry',
			cityIdToSelect,
			tileId: alert.tileId,
			fix:
				alert.kind === 'industry-warehouse-missing'
					? 'warehouse'
					: alert.kind === 'industry-rail-disconnected'
						? 'rail'
						: null,
			buildingId: alert.buildingId
		};
	}
	return null;
}
