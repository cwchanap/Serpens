<script lang="ts">
	import CityMap from '$lib/components/game/CityMap.svelte';
	import IndustryMap from '$lib/components/game/IndustryMap.svelte';
	import WorldMap from '$lib/components/game/WorldMap.svelte';
	import type { CityMapSnapshot } from '$lib/game/mapRender';
	import {
		shouldRenderMapView,
		type MapViewId,
		type VisitedMapViews
	} from '$lib/game/mapViewKeepAlive';
	import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';
	import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
	import type { WorldCityStatus } from '$lib/game/world';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		activeMapView: MapViewId;
		visitedMapViews: VisitedMapViews;
		isMapPaused: boolean;
		i18n: I18nBundle;

		worldCityStatuses: WorldCityStatus[];
		selectedWorldCityId: string | null;
		onSelectWorldCity: (cityId: string) => void;
		onOpenWorldCity: (cityId: string) => void;
		onFinanceWorldCity: (cityId: string) => void;
		onCloseWorldInspector: () => void;
		canOpenWorldCity: boolean;
		canFinanceWorldCity: boolean;
		allowedWorldCityIds: string[];
		mutationDisabledReason: string | null;
		logisticsRouteSummaries?: readonly RouteOperationalSummary[];
		selectedLogisticsRouteId?: string | null;
		onSelectLogisticsRoute?: (routeId: string) => void;

		mapSnapshot: CityMapSnapshot;
		onSelectRetailTile: (tileId: string) => void;

		industryMapSnapshot: IndustryMapSnapshot;
		onSelectIndustryTile: (tileId: string) => void;
		onCancelRailBuild: () => void;
		railKeyboardEnabled: boolean;
	}

	let {
		activeMapView,
		visitedMapViews,
		isMapPaused,
		i18n,
		worldCityStatuses,
		selectedWorldCityId,
		onSelectWorldCity,
		onOpenWorldCity,
		onFinanceWorldCity,
		onCloseWorldInspector,
		canOpenWorldCity,
		canFinanceWorldCity,
		allowedWorldCityIds,
		mutationDisabledReason,
		logisticsRouteSummaries = [],
		selectedLogisticsRouteId = null,
		onSelectLogisticsRoute = () => {},
		mapSnapshot,
		onSelectRetailTile,
		industryMapSnapshot,
		onSelectIndustryTile,
		onCancelRailBuild,
		railKeyboardEnabled
	}: Props = $props();
</script>

<div class="map-surfaces">
	{#if shouldRenderMapView(visitedMapViews, 'world')}
		<div
			class={{ 'map-surface': true, 'active-map-surface': activeMapView === 'world' }}
			aria-hidden={activeMapView !== 'world'}
		>
			<WorldMap
				statuses={worldCityStatuses}
				{i18n}
				selectedCityId={selectedWorldCityId}
				onSelectCity={onSelectWorldCity}
				onOpenCity={onOpenWorldCity}
				onFinanceCity={onFinanceWorldCity}
				onCloseInspector={onCloseWorldInspector}
				{canOpenWorldCity}
				{canFinanceWorldCity}
				allowedCityIds={allowedWorldCityIds}
				disabledReason={mutationDisabledReason}
				{logisticsRouteSummaries}
				{selectedLogisticsRouteId}
				{onSelectLogisticsRoute}
			/>
		</div>
	{/if}
	{#if shouldRenderMapView(visitedMapViews, 'retail')}
		<div
			class={{ 'map-surface': true, 'active-map-surface': activeMapView === 'retail' }}
			aria-hidden={activeMapView !== 'retail'}
		>
			<CityMap
				snapshot={mapSnapshot}
				onTileSelected={onSelectRetailTile}
				active={activeMapView === 'retail'}
				paused={isMapPaused}
				keyboardEnabled={railKeyboardEnabled}
				{i18n}
			/>
		</div>
	{/if}
	{#if shouldRenderMapView(visitedMapViews, 'industry')}
		<div
			class={{ 'map-surface': true, 'active-map-surface': activeMapView === 'industry' }}
			aria-hidden={activeMapView !== 'industry'}
		>
			<IndustryMap
				snapshot={industryMapSnapshot}
				onTileSelected={onSelectIndustryTile}
				onBuildCancelled={onCancelRailBuild}
				active={activeMapView === 'industry'}
				paused={isMapPaused}
				keyboardEnabled={railKeyboardEnabled}
				{i18n}
			/>
		</div>
	{/if}
</div>

<style>
	.map-surfaces {
		position: absolute;
		inset: 0 0 0 var(--control-desk-rail-width, 0);
		min-width: 0;
		min-height: 0;
	}

	.map-surface {
		position: absolute;
		inset: 0;
		min-width: 0;
		min-height: 0;
		pointer-events: none;
		visibility: hidden;
	}

	.active-map-surface {
		pointer-events: auto;
		visibility: visible;
	}

	@media (max-width: 980px) {
		.map-surfaces {
			inset: 0 0 var(--control-desk-compact-height, 0) 0;
		}
	}
</style>
