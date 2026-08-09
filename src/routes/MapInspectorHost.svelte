<script lang="ts">
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
		class="inspector-overlay paper"
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
		class="inspector-overlay paper"
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
		class="inspector-overlay paper"
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
		class="inspector-overlay paper"
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
			canUpgradeBuilding={canUpgradeIndustryBuilding}
			{disabledReason}
			onClose={onCloseIndustryInspector}
		/>
	</div>
{/if}

<style>
	.inspector-overlay {
		position: absolute;
		top: 5.9rem;
		right: 1rem;
		bottom: 8.5rem;
		z-index: 10;
		width: min(360px, calc(100% - 2rem));
		/* The eight management launchers wrap the desktop control desk to two
		   rows at common laptop widths. Pin the inspector above that measured
		   footprint so its upgrade/detail actions remain ordinary pointer targets. */
		overflow: auto;
		padding: 0;
	}

	@media (min-width: 981px) and (max-width: 1023px) {
		.inspector-overlay {
			/* Just above the compact breakpoint the desktop launcher cluster
			   wraps to three rows before .manage is hidden at 980px. */
			bottom: 11.5rem;
		}
	}

	@media (max-width: 980px) {
		.inspector-overlay {
			position: fixed;
			/* Sit above the fixed control desk (compact here — .manage is hidden)
			   so the store card's Open Details button is never covered. */
			inset: auto 0 5rem 0;
			width: auto;
			max-height: 60dvh;
		}
	}
</style>
