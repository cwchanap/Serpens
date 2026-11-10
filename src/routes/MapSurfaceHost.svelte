<script lang="ts">
	import CityMap from '$lib/components/game/CityMap.svelte';
	import IndustryMap from '$lib/components/game/IndustryMap.svelte';
	import WorldMap from '$lib/components/game/WorldMap.svelte';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import {
		createIndustryMapSnapshot,
		type IndustryMapRailPreviewRender
	} from '$lib/game/industryMapRender';
	import type { MapActivityBatch } from '$lib/game/mapActivityFeedback';
	import { shouldRenderMapView } from '$lib/game/mapViewKeepAlive';
	import type { PlacementPreview } from '$lib/game/placementPreview';
	import { isWorldCityId } from '$lib/game/world';
	import type { GameState } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import type { MutationAvailability } from './gameRouteController';
	import type { MapSession } from './mapSession.svelte';

	interface Props {
		/** Map navigation owner: views, selections, world read models, cities. */
		session: MapSession;
		game: GameState | null;
		fallback: GameState;
		i18n: I18nBundle;
		retailPlacementPreview: PlacementPreview | null;
		industryPlacementPreview: PlacementPreview | null;
		railPreviewRender: IndustryMapRailPreviewRender | null;
		/** Latest accepted-change batch; filtered here per surface. */
		activity: MapActivityBatch;
		isMapPaused: boolean;
		railKeyboardEnabled: boolean;
		availability: MutationAvailability;
		disabledReason: string | null;
		onCancelRailBuild: () => void;
	}

	let {
		session,
		game,
		fallback,
		i18n,
		retailPlacementPreview,
		industryPlacementPreview,
		railPreviewRender,
		activity,
		isMapPaused,
		railKeyboardEnabled,
		availability,
		disabledReason,
		onCancelRailBuild
	}: Props = $props();

	// Render inputs are derived here from the live game/fallback, not built
	// by the page: the hosts own their snapshot/activity projections.
	const mapSnapshot = $derived(
		createCityMapSnapshot(game ?? fallback, session.selectedTileId, retailPlacementPreview)
	);
	const industryMapSnapshot = $derived(
		createIndustryMapSnapshot(
			game ?? fallback,
			session.selectedIndustryTileId,
			industryPlacementPreview,
			railPreviewRender
		)
	);
	const retailMapActivity = $derived({
		seq: activity.seq,
		activities: activity.activities.filter((entry) => entry.kind !== 'production')
	});
	const industryMapActivity = $derived({
		seq: activity.seq,
		activities: activity.activities.filter((entry) => entry.kind === 'production')
	});

	/** WorldMap hands over raw city ids; the session commands validate them. */
	function selectWorldCityNode(cityId: string): void {
		session.clearSelection('logisticsRoute');
		if (isWorldCityId(cityId)) void session.selectWorldCity(cityId);
	}

	function openWorldCityNode(cityId: string): void {
		if (isWorldCityId(cityId)) void session.openWorldCity(cityId);
	}

	function financeWorldCityNode(cityId: string): void {
		if (isWorldCityId(cityId)) session.reviewWorldCityFinancing(cityId);
	}
</script>

<div class="map-surfaces" class:world-view={session.activeMapView === 'world'}>
	{#if shouldRenderMapView(session.visitedMapViews, 'world')}
		<div
			class={{ 'map-surface': true, 'active-map-surface': session.activeMapView === 'world' }}
			aria-hidden={session.activeMapView !== 'world'}
		>
			<WorldMap
				statuses={session.worldCityStatuses}
				{i18n}
				selectedCityId={session.selectedWorldCityId}
				onSelectCity={selectWorldCityNode}
				onOpenCity={openWorldCityNode}
				onFinanceCity={financeWorldCityNode}
				onCloseInspector={() => session.clearSelection('worldCity')}
				canOpenWorldCity={availability.openWorldCity}
				canFinanceWorldCity={availability.financeWorldCity}
				allowedCityIds={session.allowedWorldCityIds}
				{disabledReason}
				logisticsRouteSummaries={session.logisticsRouteSummaries}
				selectedLogisticsRouteId={session.selectedLogisticsRouteId}
				onSelectLogisticsRoute={session.selectLogisticsRoute}
				latestDeliveredTransfer={session.latestDeliveredTransfer}
			/>
		</div>
	{/if}
	{#if shouldRenderMapView(session.visitedMapViews, 'retail')}
		<div
			class={{ 'map-surface': true, 'active-map-surface': session.activeMapView === 'retail' }}
			aria-hidden={session.activeMapView !== 'retail'}
		>
			<CityMap
				snapshot={mapSnapshot}
				activity={retailMapActivity}
				onTileSelected={session.selectRetailTile}
				active={session.activeMapView === 'retail'}
				paused={isMapPaused}
				keyboardEnabled={railKeyboardEnabled}
				{i18n}
			/>
		</div>
	{/if}
	{#if shouldRenderMapView(session.visitedMapViews, 'industry')}
		<div
			class={{ 'map-surface': true, 'active-map-surface': session.activeMapView === 'industry' }}
			aria-hidden={session.activeMapView !== 'industry'}
		>
			<IndustryMap
				snapshot={industryMapSnapshot}
				activity={industryMapActivity}
				onTileSelected={session.selectIndustryTile}
				onBuildCancelled={onCancelRailBuild}
				active={session.activeMapView === 'industry'}
				paused={isMapPaused}
				keyboardEnabled={railKeyboardEnabled}
				{i18n}
			/>
		</div>
	{/if}
</div>

<style>
	.map-surfaces,
	.map-surface {
		position: absolute;
		inset: 0;
		min-width: 0;
		min-height: 0;
	}

	.map-surface {
		pointer-events: none;
		visibility: hidden;
	}

	.active-map-surface {
		pointer-events: auto;
		visibility: visible;
	}
	@media (min-width: 601px) {
		.map-surfaces {
			left: 6rem;
		}
	}
	.map-surfaces.world-view {
		left: 0;
	}
</style>
