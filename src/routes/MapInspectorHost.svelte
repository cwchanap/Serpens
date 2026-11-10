<script module lang="ts">
	import type { GameRouteController } from './gameRouteController';

	/** Inspector command port: local industry/rail edits and staff writes. */
	export type MapInspectorCommands = Pick<
		GameRouteController,
		| 'upgradeIndustrialBuilding'
		| 'demolishIndustrialBuilding'
		| 'upgradeRail'
		| 'demolishRail'
		| 'hireStaff'
		| 'assignStaff'
		| 'unassignStaff'
	>;
</script>

<script lang="ts">
	import IndustryTileInspector from '$lib/components/game/IndustryTileInspector.svelte';
	import LogisticsRouteInspector from '$lib/components/game/LogisticsRouteInspector.svelte';
	import RailSegmentInspector from '$lib/components/game/RailSegmentInspector.svelte';
	import StoreDetailModal from '$lib/components/game/StoreDetailModal.svelte';
	import TileInspector from '$lib/components/game/TileInspector.svelte';
	import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
	import { buildRailNetwork, deriveRailSegments, type RailSegment } from '$lib/game/rail';
	import { selectIndustryInspector, selectInspectorRailSegments } from './mapInspectorRoute';
	import type { PlacementBlockReason } from '$lib/game/placementPreview';
	import type { GameState, ProductId } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import type { MutationAvailability } from './gameRouteController';
	import type { MapSession } from './mapSession.svelte';
	import type { RetailInspection } from './retailInspection.svelte';

	interface Props {
		/** Map session: selected ids, active cities and logistics views. */
		session: MapSession;
		retail: RetailInspection;
		game: GameState | null;
		fallback: GameState;
		i18n: I18nBundle;
		availability: MutationAvailability;
		disabledReason: string | null;
		mode: 'sandbox' | 'scenario';
		isPlacementActive: boolean;
		placementFeedback: PlacementBlockReason | null;
		isRailActive: boolean;
		commands: MapInspectorCommands;
		plannerProductIds: readonly ProductId[];
		allowedProductIds: readonly ProductId[];
		onAddIndustryRoute?: (preset: RecurringRouteInput) => void;
		onManageLogisticsRoute: (routeId: string) => void;
		onBuildWarehouse?: () => void;
		onBuildRailFromBuilding?: (buildingId: string) => void;
		onPlayClickSfx: () => void;
	}

	let {
		session,
		retail,
		game,
		fallback,
		i18n,
		availability,
		disabledReason,
		mode,
		isPlacementActive,
		placementFeedback,
		isRailActive,
		commands,
		plannerProductIds,
		allowedProductIds,
		onAddIndustryRoute,
		onManageLogisticsRoute,
		onBuildWarehouse,
		onBuildRailFromBuilding,
		onPlayClickSfx
	}: Props = $props();

	const panelGame = $derived(game ?? fallback);
	const industry = $derived(
		selectIndustryInspector(game, session.activeIndustryCity, session.selectedIndustryTileId)
	);
	// Cached rail model: the network depends only on the industry city's rails
	// and buildings, never on the selected tile, so tile changes reuse it. It
	// is read lazily — hidden, build-active and invalid selections never build
	// the network.
	const industryRailSegments = $derived.by<RailSegment[]>(() => {
		const currentGame: GameState | null = game;
		if (!currentGame) return [];
		const network = buildRailNetwork(session.activeIndustryCity);
		return deriveRailSegments(network, currentGame.industrialBuildings);
	});
	const showRetailInspector = $derived(
		retail.selectedTile !== null && (!isPlacementActive || placementFeedback !== null)
	);
	const showIndustryInspector = $derived(
		industry.selectedIndustryTile !== null && (!isPlacementActive || placementFeedback !== null)
	);
	const selectedRailSegments = $derived(
		showIndustryInspector
			? selectInspectorRailSegments(
					session.activeIndustryCity,
					session.selectedIndustryTileId,
					isRailActive,
					() => industryRailSegments
				)
			: null
	);
	const showLogisticsRouteInspector = $derived(
		session.activeMapView === 'world' && session.selectedLogisticsRoute !== null
	);
	// Industrial demolition stays sandbox-only; rail edits stay capability-gated.
	const canDemolishIndustryBuilding = $derived(mode === 'sandbox' && game !== null);

	function upgradeRailSegment(segmentId: string): void {
		if (game && availability.upgradeRail) {
			void commands.upgradeRail(session.activeIndustryCity.id, segmentId);
		}
	}

	function demolishRailSegment(segmentId: string): void {
		if (game && availability.demolishRail) {
			void commands.demolishRail(session.activeIndustryCity.id, segmentId);
		}
	}
</script>

{#if retail.selectedTile && showRetailInspector}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="false"
		aria-label={i18n.t('route.inspectors.retailDetails')}
	>
		<TileInspector
			game={panelGame}
			tile={retail.selectedTile}
			store={retail.selectedStore}
			latestStoreReport={retail.latestReport}
			{i18n}
			onUpgradeStore={retail.upgradeStore}
			canUpgradeStore={retail.canUpgradeStore}
			{disabledReason}
			onOpenDetails={(productId) => retail.open(productId ?? null)}
			onClickFeedback={onPlayClickSfx}
			onClose={retail.closeInspector}
		/>
	</div>
{/if}
{#if showLogisticsRouteInspector && session.selectedLogisticsRoute}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="false"
		aria-label={i18n.t('logisticsRouteInspector.ariaLabel')}
	>
		<LogisticsRouteInspector
			route={session.selectedLogisticsRoute}
			{i18n}
			onManageRoute={onManageLogisticsRoute}
			onClose={() => session.clearSelection('logisticsRoute')}
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
			game={panelGame}
			cityId={session.activeIndustryCity.id}
			segments={selectedRailSegments}
			allSegments={industryRailSegments}
			{i18n}
			onClose={() => session.clearSelection('industryTile')}
			onUpgradeSegment={upgradeRailSegment}
			onDemolishSegment={demolishRailSegment}
			canUpgradeRail={availability.upgradeRail}
			canDemolishRail={availability.demolishRail}
			{disabledReason}
		/>
	</div>
{:else if industry.selectedIndustryTile && showIndustryInspector}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="false"
		aria-label={i18n.t('route.inspectors.industryDetails')}
	>
		<IndustryTileInspector
			game={panelGame}
			tile={industry.selectedIndustryTile}
			building={industry.selectedIndustryBuilding}
			{i18n}
			onUpgradeBuilding={(buildingId) => {
				if (!game || !availability.upgradeIndustrialBuilding) return;
				void commands.upgradeIndustrialBuilding(buildingId);
			}}
			onAddRoute={onAddIndustryRoute}
			onDemolishBuilding={(buildingId) => {
				if (!game || !canDemolishIndustryBuilding) return;
				void commands.demolishIndustrialBuilding(buildingId);
			}}
			{onBuildWarehouse}
			onBuildRailFrom={onBuildRailFromBuilding}
			canDemolishBuilding={canDemolishIndustryBuilding}
			canUpgradeBuilding={availability.upgradeIndustrialBuilding}
			{disabledReason}
			onClose={() => session.clearSelection('industryTile')}
		/>
	</div>
{/if}

{#if retail.focus.isOpen && retail.selectedStore}
	<StoreDetailModal
		game={panelGame}
		{i18n}
		store={retail.selectedStore}
		staff={game?.staff ?? []}
		hiringCandidates={game?.hiringCandidates ?? []}
		latestStoreReport={retail.latestReport}
		focusedProductId={retail.focus.focusedProductId}
		{plannerProductIds}
		onManageSupplySource={retail.manageSupplySource}
		onPlanSupply={retail.planSupplyProduct}
		onUpdateStoreProduct={retail.changeStoreProduct}
		onUpdateStoreProductBrand={retail.changeStoreProductBrand}
		onHireStaff={(candidateId) => {
			if (!game || !availability.hireStaff) return;
			void commands.hireStaff(candidateId);
		}}
		onAssignStaff={(staffId, storeId) => {
			if (!game || !availability.assignStaff) return;
			void commands.assignStaff(staffId, storeId);
		}}
		onUnassignStaff={(staffId) => {
			if (!game || !availability.unassignStaff) return;
			void commands.unassignStaff(staffId);
		}}
		canUpdateSellingPrice={retail.canUpdateSellingPrice}
		canUpdateInventoryTargets={retail.canUpdateInventoryTargets}
		canUpdateBrand={retail.canUpdateBrand}
		{allowedProductIds}
		canHireStaff={availability.hireStaff}
		canAssignStaff={availability.assignStaff}
		canUnassignStaff={availability.unassignStaff}
		{disabledReason}
		onClickFeedback={onPlayClickSfx}
		onClose={retail.close}
	/>
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
