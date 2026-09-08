<script lang="ts">
	import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
	import IndustryTileInspector from '$lib/components/game/IndustryTileInspector.svelte';
	import LogisticsRouteInspector from '$lib/components/game/LogisticsRouteInspector.svelte';
	import RailSegmentInspector from '$lib/components/game/RailSegmentInspector.svelte';
	import TileInspector from '$lib/components/game/TileInspector.svelte';
	import type { RailSegment } from '$lib/game/rail';
	import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
	import type {
		CityTile,
		DailyStoreReport,
		GameState,
		IndustrialBuilding,
		IndustryTile,
		Store
	} from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
		disabledReason: string | null;

		showRetailInspector: boolean;
		selectedRetailTile: CityTile | null;
		selectedStore: Store | null;
		latestStoreReport: DailyStoreReport | null;
		canUpgradeStore: boolean;
		onUpgradeStore: (storeId: string) => void;
		onOpenStoreDetails: () => void;
		onRetailClickFeedback: () => void;
		onCloseRetailInspector: () => void;

		showIndustryInspector: boolean;
		selectedIndustryTile: IndustryTile | null;
		selectedIndustryBuilding: IndustrialBuilding | null;
		selectedRailSegments: RailSegment[] | null;
		allIndustryRailSegments: RailSegment[];
		industryCityId: string;
		canUpgradeIndustryBuilding: boolean;
		canUpgradeRail: boolean;
		canDemolishRail: boolean;
		onUpgradeIndustryBuilding: (buildingId: string) => void;
		onAddIndustryRoute?: (preset: RecurringRouteInput) => void;
		onDemolishIndustryBuilding?: (buildingId: string) => void;
		canDemolishIndustryBuilding?: boolean;
		onUpgradeRailSegment: (segmentId: string) => void;
		onDemolishRailSegment: (segmentId: string) => void;
		onCloseIndustryInspector: () => void;

		showLogisticsRouteInspector?: boolean;
		selectedLogisticsRoute?: RouteOperationalSummary | null;
		onManageLogisticsRoute?: (routeId: string) => void;
		onCloseLogisticsRouteInspector?: () => void;
	}

	let {
		game,
		i18n,
		disabledReason,
		showRetailInspector,
		selectedRetailTile,
		selectedStore,
		latestStoreReport,
		canUpgradeStore,
		onUpgradeStore,
		onOpenStoreDetails,
		onRetailClickFeedback,
		onCloseRetailInspector,
		showIndustryInspector,
		selectedIndustryTile,
		selectedIndustryBuilding,
		selectedRailSegments,
		allIndustryRailSegments,
		industryCityId,
		canUpgradeIndustryBuilding,
		canUpgradeRail,
		canDemolishRail,
		onUpgradeIndustryBuilding,
		onAddIndustryRoute,
		onDemolishIndustryBuilding,
		canDemolishIndustryBuilding = false,
		onUpgradeRailSegment,
		onDemolishRailSegment,
		onCloseIndustryInspector,
		showLogisticsRouteInspector = false,
		selectedLogisticsRoute = null,
		onManageLogisticsRoute = () => {},
		onCloseLogisticsRouteInspector = () => {}
	}: Props = $props();
</script>

{#if selectedRetailTile && showRetailInspector}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="false"
		aria-label={i18n.t('route.inspectors.retailDetails')}
	>
		<TileInspector
			{game}
			tile={selectedRetailTile}
			store={selectedStore}
			{latestStoreReport}
			{i18n}
			{onUpgradeStore}
			{canUpgradeStore}
			{disabledReason}
			onOpenDetails={onOpenStoreDetails}
			onClickFeedback={onRetailClickFeedback}
			onClose={onCloseRetailInspector}
		/>
	</div>
{/if}
{#if showLogisticsRouteInspector && selectedLogisticsRoute}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="false"
		aria-label={i18n.t('logisticsRouteInspector.ariaLabel')}
	>
		<LogisticsRouteInspector
			route={selectedLogisticsRoute}
			{i18n}
			onManageRoute={onManageLogisticsRoute}
			onClose={onCloseLogisticsRouteInspector}
		/>
	</div>
{/if}
{#if selectedRailSegments && showIndustryInspector}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="false"
		aria-label={i18n.t('railSegmentInspector.title')}
	>
		<RailSegmentInspector
			{game}
			cityId={industryCityId}
			segments={selectedRailSegments}
			allSegments={allIndustryRailSegments}
			{i18n}
			onClose={onCloseIndustryInspector}
			onUpgradeSegment={onUpgradeRailSegment}
			onDemolishSegment={onDemolishRailSegment}
			{canUpgradeRail}
			{canDemolishRail}
			{disabledReason}
		/>
	</div>
{:else if selectedIndustryTile && showIndustryInspector}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="false"
		aria-label={i18n.t('route.inspectors.industryDetails')}
	>
		<IndustryTileInspector
			{game}
			tile={selectedIndustryTile}
			building={selectedIndustryBuilding}
			{i18n}
			onUpgradeBuilding={onUpgradeIndustryBuilding}
			onAddRoute={onAddIndustryRoute}
			onDemolishBuilding={onDemolishIndustryBuilding}
			canDemolishBuilding={canDemolishIndustryBuilding}
			canUpgradeBuilding={canUpgradeIndustryBuilding}
			{disabledReason}
			onClose={onCloseIndustryInspector}
		/>
	</div>
{/if}

<style>
	.inspector-overlay {
		position: absolute;
		top: 5.25rem;
		right: 1rem;
		z-index: 10;
		width: min(400px, calc(100% - 7rem));
		max-height: calc(100dvh - 10.5rem);
		overflow: auto;
		padding: 0;
	}
	@media (max-width: 600px) {
		.inspector-overlay {
			position: fixed;
			inset: auto 0.5rem 8.7rem 0.5rem;
			width: auto;
			max-height: calc(100dvh - 16rem);
		}
	}
</style>
