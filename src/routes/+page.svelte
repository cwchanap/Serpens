<script lang="ts">
	import { onMount } from 'svelte';
	import AudioSettings from '$lib/components/game/AudioSettings.svelte';
	import ControlDesk from '$lib/components/game/ControlDesk.svelte';
	import OpeningGuidance from '$lib/components/game/OpeningGuidance.svelte';
	import CashRecoveryGuidance from '$lib/components/game/CashRecoveryGuidance.svelte';
	import SavePanelHost from './SavePanelHost.svelte';
	import { createSaveUi } from './saveUi.svelte';
	import { createScenarioUi } from './scenarioUi.svelte';
	import ScenarioCatalogHost from './ScenarioCatalogHost.svelte';
	import ScenarioProgressHost from './ScenarioProgressHost.svelte';
	import ScenarioMenuActions from './ScenarioMenuActions.svelte';
	import ScenarioResultsHost from './ScenarioResultsHost.svelte';
	import ShortcutCheatSheet from '$lib/components/game/ShortcutCheatSheet.svelte';
	import StoreDetailModal from '$lib/components/game/StoreDetailModal.svelte';
	import SupplyAdvisor from '$lib/components/game/SupplyAdvisor.svelte';
	import TopBar from '$lib/components/game/TopBar.svelte';
	import { createGameAudioController, type GameAudioController } from '$lib/audio/audioController';
	import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from '$lib/audio/audioPreferences';
	import type { BgmCueId, SfxCueId } from '$lib/audio/audioCatalog';
	import { collectGameAlerts, type GameAlert } from '$lib/game/alerts';
	import { localizeGameAlert } from '$lib/i18n/gameCopy';
	import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
	import {
		selectMapViewSelections,
		selectMapHeading,
		selectWorldCityStatuses,
		resolveMapAlertDestination,
		resolveWorldCitySelection,
		resolveWorldCityOpening,
		resolveWorldCityFinancing
	} from './mapNavigationRoute';
	import {
		selectRetailInspector,
		selectIndustryInspector,
		selectInspectorRailSegments
	} from './mapInspectorRoute';
	import { createRoutePreviewGame } from './routePreviewGame';
	import {
		MANAGEMENT_PANEL_SHORTCUT_KEY,
		resolveShortcutAction,
		type ManagementPanelId
	} from '$lib/game/keyboardShortcuts';
	import { createIndustryMapSnapshot } from '$lib/game/industryMapRender';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import { resolveWorldCityId } from '$lib/game/cityInventory';
	import { buildRailNetwork, deriveRailSegments, type RailSegment } from '$lib/game/rail';
	import {
		createInitialVisitedMapViews,
		markMapViewVisited,
		type MapViewId
	} from '$lib/game/mapViewKeepAlive';
	import {
		resolveIndustrySelectionAnchorTileId,
		resolveSelectionAnchorTileId
	} from '$lib/game/placementPreview';
	import {
		createI18n,
		readLocalePreference,
		saveLocalePreference,
		type StorageLike
	} from '$lib/i18n/index';
	import type { SupportedLocale } from '$lib/i18n/locales';
	import { summarizeReports } from '$lib/game/reports';
	import {
		selectRouteGuidance,
		resolveGuidanceHandoff,
		type RouteGuidanceAction
	} from './routeGuidance';
	import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
	import {
		selectRecentDeliveredTransfers,
		selectRouteOperations,
		type RouteOperationalSummary
	} from '$lib/game/logisticsReadModels';
	import { getFinanceMetrics } from '$lib/game/financeMetrics';
	import { nextMapActivityBatch, type MapActivityBatch } from '$lib/game/mapActivityFeedback';
	import type { SupplyPlannerHorizonDays } from '$lib/game/supplyPlanner';
	import {
		deriveSupplyPlannerResult,
		getSupplyPlannerProductIds,
		handoffSupplyPlannerAction,
		resolveSupplyPlannerProductId,
		type SupplyPlannerHandoffHost,
		type SupplyPlannerUiContext
	} from './supplyPlannerRoute';
	import {
		encodeIndustrialPlacementKey,
		type SupplyPlannerAction,
		type SupplyPlannerActionAvailability
	} from '$lib/game/supplyPlannerActions';
	import { buildRetailCitySupplyViews } from '$lib/components/game/retailSupplySources';
	import { buildLogisticsPanelView } from '$lib/components/game/logisticsPanel';
	import { WORLD_CITY_CATALOG, isWorldCityId } from '$lib/game/world';
	import type {
		GameState,
		ProductId,
		StoreProductPatch,
		TransferOrder,
		WorldCityId
	} from '$lib/game/types';
	import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
	import { createScenarioRepository } from '$lib/persistence/scenarioRepositoryFactory';
	import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
	import {
		isLiveScenarioContentAllowed,
		shouldResetScenarioView,
		type ScenarioRouteIdentity
	} from './scenarioRoute';
	import type { ScenarioOperationError, ScenarioResult, ScenarioRun } from '$lib/scenarios/types';
	import {
		GameRouteController,
		createMutationAvailability,
		type GameRouteCommitResult,
		type GameRouteControllerState
	} from './gameRouteController';
	import { isGameRouteCommitted } from '$lib/game/commandResult';
	import {
		resolveEscapeTarget,
		selectOverlayGates,
		type OverlayId,
		type OverlaySnapshot
	} from './routeOverlays';
	import { createStoreDetailFocus } from './storeDetailFocus.svelte';
	import { createConstructionUi } from './constructionUi.svelte';
	import ConstructionControls from './ConstructionControls.svelte';
	import ManagementPanelHost from './ManagementPanelHost.svelte';
	import MapInspectorHost from './MapInspectorHost.svelte';
	import MapSurfaceHost from './MapSurfaceHost.svelte';

	interface ManagementPanelMenuItem {
		id: ManagementPanelId;
		label: string;
		shortcut: string;
	}

	type SimulationSpeed = 1 | 2 | 5;
	const SIMULATION_DAY_MS = 5_000;

	/**
	 * Returns `globalThis.localStorage` when accessible, or `null` when the
	 * browser blocks storage access (e.g. privacy-restricted origins, sandboxed
	 * iframes). Accessing the property itself can throw, so the try/catch must
	 * wrap the property access — not just the `getItem`/`setItem` calls that
	 * `readLocalePreference` / `saveLocalePreference` already guard internally.
	 */
	function safeLocalStorage(): StorageLike | null {
		try {
			return globalThis.localStorage;
		} catch {
			return null;
		}
	}

	/**
	 * Returns `navigator.languages` with `navigator.language` appended as a
	 * fallback candidate. Some webviews expose only `navigator.language` or an
	 * empty `navigator.languages` array; without this fallback a `ja-JP` or
	 * `zh-TW` user would start in English despite the browser preference.
	 */
	function collectNavigatorLocaleCandidates(): readonly string[] {
		const languages = globalThis.navigator.languages ?? [];
		const language = globalThis.navigator.language;

		if (language && !languages.includes(language)) {
			return [...languages, language];
		}

		return languages;
	}

	const managementPanelMenuConfig: Array<{ id: ManagementPanelId; shortcut: string }> = [
		{ id: 'dashboard', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.dashboard },
		{ id: 'policies', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.policies },
		{ id: 'staff', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.staff },
		{ id: 'stores', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.stores },
		{ id: 'decisions', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.decisions },
		{ id: 'reports', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.reports },
		{ id: 'productChains', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.productChains },
		{ id: 'finance', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.finance },
		{ id: 'logistics', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.logistics }
	];

	const starterMapState = createRoutePreviewGame();
	const starterCity = starterMapState.cities[0]!;
	const starterIndustryCity = starterMapState.industryCities[0]!;
	const bgmCueByMapView: Record<MapViewId, BgmCueId> = {
		retail: 'bgm.retail-map',
		industry: 'bgm.industry-map',
		world: 'bgm.world-map'
	};

	let sandboxGame = $state<GameState | null>(null);
	let activeScenarioRun = $state<ScenarioRun | null>(null);
	let lastScenarioResult = $state<ScenarioResult | null>(null);
	let lastScenarioBestUpdated = $state(false);
	let scenarioOperationError = $state<ScenarioOperationError | null>(null);
	let retryScenarioOperation = $state<(() => Promise<void>) | null>(null);
	let playMode = $state<'sandbox' | 'scenario'>('sandbox');
	let sandboxOpeningGuidanceDismissed = $state(false);
	// Measured height of the rendered guidance card — feeds --og-card-h on
	// .map-layout so the expanded scenario-progress panel caps above the card
	// and the placement plaque slots over it regardless of copy length (see
	// the *.opening-guidance-visible rules).
	let openingGuidanceCardHeight = $state(0);
	let simulationPaused = $state(false);
	let simulationSpeed = $state<SimulationSpeed>(1);
	let simulationTickPending = $state(false);
	// Bumped when an auto-tick is skipped because a scenario command is in
	// flight (mutationAvailability.advanceDay is false at fire time). The
	// auto-tick $effect reads this as a re-arm signal so the clock schedules a
	// fresh tick instead of stalling until the next user action. See the
	// effect below for why advanceDay itself is not a lifecycle dependency.
	let simulationTickRearm = $state(0);
	let scenarioCommandPending = $state(false);
	let scenariosReady = $state(false);
	// The latest accepted-change batch for map feedback. Only the route's accepted-change
	// observer replaces it; loads and adoptions never do.
	let mapActivity = $state<MapActivityBatch>({ seq: 0, activities: [] });
	const gameRouteController = new GameRouteController({
		createSaveRepository,
		createScenarioRepository,
		resolveScenarioDefinition,
		playSfx,
		onStateChange: synchronizeControllerState,
		onAcceptedGameChange: (previous, next) => {
			mapActivity = nextMapActivityBatch(mapActivity, previous, next);
		},
		onSaveSummary: (summary) => saves.acceptSummary(summary),
		onScenarioSummary: (summary) => scenarios.acceptSummary(summary),
		onScenarioTerminalRun: (run) => scenarios.acceptTerminalRun(run),
		onAutoSave: (metadata) => saves.acceptAutoSave(metadata),
		onAutoSaveError: (error) => saves.acceptAutoSaveError(error),
		onReadOnlySelection: (kind, tileId) => {
			if (kind === 'retail') {
				selectedTileId = tileId;
			} else {
				selectedIndustryTileId = tileId;
			}
		}
	});
	let game = $derived(playMode === 'scenario' ? (activeScenarioRun?.game ?? null) : sandboxGame);
	// Boolean projection of `game` existence. The auto-tick `$effect` reads this
	// instead of `game` so a new game snapshot (policy edit, build, hire, stock
	// change, etc.) does not re-trigger the timer lifecycle and reset the
	// pending day delay. `game` is a new object reference on every mutation, so
	// subscribing the timer to it would postpone the current day each time; a
	// primitive boolean only propagates when existence flips.
	let hasGame = $derived(game !== null);
	let activeMapView = $state<MapViewId>('retail');
	let visitedMapViews = $state(createInitialVisitedMapViews('retail'));
	let selectedWorldCityId = $state<string | null>(null);
	let selectedTileId = $state<string | null>(null);
	let selectedIndustryTileId = $state<string | null>(null);
	let selectedLogisticsRouteId = $state<string | null>(null);
	let focusedLogisticsRouteId = $state<string | null>(null);
	let logisticsRoutePreset = $state<RecurringRouteInput | null>(null);
	let focusedRetailSupplyCityId = $state<WorldCityId | null>(null);
	let isCheatSheetOpen = $state(false);
	let isGameMenuOpen = $state(false);
	let isAlertsMenuOpen = $state(false);
	let isSupplyAdvisorOpen = $state(false);
	let supplyPlannerUiContext = $state<SupplyPlannerUiContext>({
		productId: null,
		horizonDays: 30
	});
	let activeManagementPanelId = $state<ManagementPanelId | null>(null);
	let focusedFinanceLoanId = $state<string | null>(null);
	let activeLocale = $state<SupportedLocale>(
		readLocalePreference(safeLocalStorage(), collectNavigatorLocaleCandidates())
	);
	let i18n = $derived(createI18n(activeLocale));
	let activeScenarioDefinition = $derived.by(() => scenarios.definition);
	let mutationAvailability = $derived(
		createMutationAvailability({
			playMode,
			pending: scenarioCommandPending,
			definition: activeScenarioDefinition
		})
	);
	let mutationDisabledReason = $derived(
		playMode === 'scenario' ? i18n.t('buildMenu.unavailable') : null
	);
	let worldCitySelectionAvailable = $derived(
		playMode === 'sandbox' ||
			(!scenarioCommandPending &&
				activeScenarioDefinition !== null &&
				activeScenarioDefinition.allowedCommands.includes('selectWorldCity'))
	);
	let allowedWorldCityIds = $derived.by(() =>
		WORLD_CITY_CATALOG.map((city) => city.id).filter((cityId) =>
			isLiveScenarioContentAllowed(playMode, activeScenarioDefinition, { kind: 'city', cityId })
		)
	);
	let allowedIndustrialPlacements = $derived.by<ReadonlySet<string> | null>(() => {
		if (playMode === 'sandbox' || !activeScenarioDefinition) return null;
		return new Set(
			activeScenarioDefinition.content.industrialPlacements.map((placement) =>
				encodeIndustrialPlacementKey(placement.cityId, placement.tileId, placement.buildingTypeId)
			)
		);
	});
	// Construction owner: build menu, armed placements, rail build session and
	// the financed-purchase review. Existing root adapters stay until their
	// owning tasks extract them.
	const construction = createConstructionUi({
		getGame: () => game,
		getRetailCity: () => activeCity,
		getIndustryCity: () => industryCity,
		getFallback: () => starterMapState,
		getView: () => activeMapView,
		getMode: () => playMode,
		getDefinition: () => activeScenarioDefinition,
		getAvailability: () => mutationAvailability,
		getI18n: () => i18n,
		commands: gameRouteController,
		playSfx,
		onSelectPlacementTile: (kind, tileId) => {
			selectedWorldCityId = null;
			if (kind === 'retail') {
				selectedTileId = tileId;
				selectedIndustryTileId = null;
			} else {
				selectedIndustryTileId = tileId;
				selectedTileId = null;
			}
		},
		onClearSelections: () => {
			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
		},
		onFoundingPause: () => {
			simulationPaused = true;
		},
		onMenuOpen: () => {
			isGameMenuOpen = false;
			saves.close();
			activeManagementPanelId = null;
		}
	});
	let allowedProductIds = $derived.by(() => {
		const productIds = [
			...new Set(
				(game?.stores ?? []).flatMap((store) => store.products.map((product) => product.productId))
			)
		];
		return productIds.filter((productId) =>
			isLiveScenarioContentAllowed(playMode, activeScenarioDefinition, {
				kind: 'product',
				productId
			})
		);
	});
	let plannerProductIds = $derived.by(() =>
		getSupplyPlannerProductIds(game, activeCity.id as WorldCityId, allowedProductIds)
	);
	let effectivePlannerProductId = $derived(
		resolveSupplyPlannerProductId(supplyPlannerUiContext, plannerProductIds)
	);
	let plannerActionAvailability = $derived<SupplyPlannerActionAvailability>({
		// Planner candidate affordability is cash-only (game.cash >= buildCost),
		// so the planner must not advertise build actions when only the finance
		// command is available. The build-menu UI still uses
		// canStartIndustryExpansion to support both cash and finance paths.
		canBuildIndustry: mutationAvailability.buildIndustrialBuilding,
		canUpgradeIndustry: mutationAvailability.upgradeIndustrialBuilding,
		canBuildRail: mutationAvailability.buildRail,
		canManageLogistics: mutationAvailability.manageLogistics,
		canSetRetailSupplySource: mutationAvailability.setRetailSupplySource,
		allowedIndustryBuildingTypeIds: construction.allowedIndustryBuildingTypeIds,
		allowedIndustrialPlacements
	});
	const saves = createSaveUi({
		getGame: () => game,
		getI18n: () => i18n,
		commands: gameRouteController,
		playSfx,
		onOpen: () => {
			isGameMenuOpen = false;
			activeManagementPanelId = null;
		},
		onLoaded: resetViewStateAfterLoad
	});
	const scenarios = createScenarioUi({
		commands: gameRouteController,
		getActiveRun: () => activeScenarioRun,
		getResult: () => lastScenarioResult,
		getBestUpdated: () => lastScenarioBestUpdated,
		getError: () => scenarioOperationError,
		getRetry: () => retryScenarioOperation,
		getPending: () => scenarioCommandPending,
		getReady: () => scenariosReady,
		getMode: () => playMode,
		getGame: () => game,
		getI18n: () => i18n,
		resolveDefinition: resolveScenarioDefinition,
		onOpenCatalog: () => {
			isGameMenuOpen = false;
			saves.close();
			activeManagementPanelId = null;
		},
		onResultsClosed: () => {
			activeManagementPanelId = null;
		}
	});
	let audioController: GameAudioController | null = $state(null);
	let audioPreferences = $state<AudioPreferences>({ ...DEFAULT_AUDIO_PREFERENCES });
	let managementPanelMenuItems = $derived.by<ManagementPanelMenuItem[]>(() =>
		managementPanelMenuConfig.map((item) => ({
			...item,
			label: i18n.labels.managementPanel(item.id)
		}))
	);
	let activeManagementPanel = $derived.by(
		() => managementPanelMenuItems.find((item) => item.id === activeManagementPanelId) ?? null
	);
	let summary = $derived.by(() => {
		const currentGame: GameState | null = game;
		return currentGame ? summarizeReports(currentGame.reports) : summarizeReports([]);
	});
	let financeMetrics = $derived(
		activeManagementPanelId === 'finance' ? getFinanceMetrics(game ?? starterMapState) : null
	);
	let activeCity = $derived.by(() => {
		const currentGame: GameState | null = game;
		return currentGame?.cities.find((city) => city.id === currentGame.activeCityId) ?? starterCity;
	});
	let industryCity = $derived.by(() => {
		const currentGame: GameState | null = game;
		return (
			currentGame?.industryCities.find((city) => city.id === currentGame.activeIndustryCityId) ??
			starterIndustryCity
		);
	});
	let alerts = $derived.by((): LocalizedGameAlert[] => {
		const currentGame: GameState | null = game;
		return currentGame
			? collectGameAlerts(currentGame).map((alert) => localizeGameAlert(currentGame, alert, i18n))
			: [];
	});
	let { openingGuidanceHint, showOpeningGuidance, cashRecoveryPlan } = $derived(
		selectRouteGuidance({
			game,
			alerts,
			playMode,
			scenarioId: activeScenarioRun?.definition.scenarioId ?? null,
			openingDismissed: sandboxOpeningGuidanceDismissed
		})
	);
	let cashRecoveryCrisisKind = $derived(cashRecoveryPlan?.alert.kind ?? null);
	// Writable derived: dismissing hides the card for the current crisis only.
	// It re-arms whenever the crisis clears or escalates to another alert kind.
	let cashRecoveryDismissed = $derived.by(() => {
		void cashRecoveryCrisisKind;
		return false;
	});
	let showCashRecovery = $derived(cashRecoveryPlan !== null && !cashRecoveryDismissed);
	let { mapEyebrow, mapTitle } = $derived(
		selectMapHeading(activeMapView, activeCity.id, industryCity.id, i18n)
	);
	let worldCityStatuses = $derived(selectWorldCityStatuses(game));
	let logisticsRouteSummaries = $derived.by<RouteOperationalSummary[]>(() =>
		game ? selectRouteOperations(game) : []
	);
	let latestDeliveredTransfer = $derived.by<TransferOrder | null>(() => {
		if (!game || !selectedWorldCityId || !isWorldCityId(selectedWorldCityId)) return null;
		return selectRecentDeliveredTransfers(game, selectedWorldCityId)[0] ?? null;
	});
	let selectedLogisticsRoute = $derived.by<RouteOperationalSummary | null>(() =>
		selectedLogisticsRouteId
			? (logisticsRouteSummaries.find((summary) => summary.route.id === selectedLogisticsRouteId) ??
				null)
			: null
	);
	let logisticsPanelView = $derived(
		activeManagementPanelId === 'logistics'
			? buildLogisticsPanelView(game ?? starterMapState, i18n)
			: null
	);
	let { selectedTile, selectedStore } = $derived(
		selectRetailInspector(game, activeCity, selectedTileId)
	);
	let { selectedIndustryTile, selectedIndustryBuilding } = $derived(
		selectIndustryInspector(game, industryCity, selectedIndustryTileId)
	);
	// Focused store-detail overlay state (HPA-293 deep-link), extracted into
	// storeDetailFocus.svelte.ts so page.svelte.spec.ts can pin the open/close
	// focus contract.
	const storeDetailFocus = createStoreDetailFocus(() => selectedStore !== null);
	let latestSelectedStoreReport = $derived.by(() => {
		const store = selectedStore;
		return store
			? (summary.latest?.storeReports.find((report) => report.storeId === store.id) ?? null)
			: null;
	});
	// Rail network + segments for the current industry city. Depends only
	// on game state (rails + buildings), not on which tile is selected — so
	// clicking a different rail cell reuses the cached segments instead of
	// rebuilding the network and recomputing connected components.
	let industryRailSegments = $derived.by<RailSegment[]>(() => {
		const currentGame: GameState | null = game;
		if (!currentGame) return [];
		const network = buildRailNetwork(industryCity);
		return deriveRailSegments(network, currentGame.industrialBuildings);
	});
	let selectedRailSegments = $derived(
		selectInspectorRailSegments(
			industryCity,
			selectedIndustryTileId,
			construction.isRailActive,
			() => industryRailSegments
		)
	);
	// Read-only projection of existing owners, not a second overlay state authority.
	let overlaySnapshot = $derived.by<OverlaySnapshot>(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt from owners, never mutated after publication.
		const openOverlays = new Set<OverlayId>();
		if (construction.purchaseReview.purchase !== null) openOverlays.add('finance-review');
		if (saves.isOpen) openOverlays.add('save-panel');
		if (scenarios.isCatalogOpen) openOverlays.add('scenario-catalog');
		if (scenarios.isResultsOpen) openOverlays.add('scenario-results');
		if (isCheatSheetOpen) openOverlays.add('cheat-sheet');
		if (isSupplyAdvisorOpen) openOverlays.add('supply-advisor');
		if (storeDetailFocus.isOpen) openOverlays.add('store-detail');
		if (construction.isMenuOpen) openOverlays.add('build-menu');
		if (isGameMenuOpen) openOverlays.add('game-menu');
		if (isAlertsMenuOpen) openOverlays.add('alerts-menu');
		if (activeManagementPanelId !== null) openOverlays.add('management-panel');
		return {
			openOverlays,
			isPlacementActive: construction.isPlacementModeActive,
			isRailBuildActive: construction.isRailActive,
			isFinanceReviewPending: construction.purchaseReview.confirmationPending,
			selected: {
				worldCity: selectedWorldCityId !== null,
				retailTile: selectedTileId !== null,
				industryTile: selectedIndustryTileId !== null,
				logisticsRoute: selectedLogisticsRouteId !== null
			},
			allowMenuFallback: false // Set from the current keyboard event, never stored.
		};
	});
	let { isMapPaused, railKeyboardEnabled, hasBlockingOverlay } = $derived(
		selectOverlayGates(overlaySnapshot)
	);
	let shouldShowRetailInspector = $derived(
		selectedTile !== null &&
			(!construction.isPlacementModeActive || construction.placementFeedback !== null)
	);
	let shouldShowIndustryInspector = $derived(
		selectedIndustryTile !== null &&
			(!construction.isPlacementModeActive || construction.placementFeedback !== null)
	);
	let showLogisticsRouteInspector = $derived(
		activeMapView === 'world' && selectedLogisticsRoute !== null
	);
	// The world map is a navigation/overview surface with no time controls —
	// the ControlDesk (pause/resume + speed) is hidden there. Block the
	// auto-tick while it owns the screen so a running simulation can't advance
	// uncontrollably. Not folded into hasBlockingOverlay because that flag also
	// swallows every keyboard shortcut (panel mnemonics, 1/2/3 view navigation),
	// which must stay available on the world view.
	let simulationBlocked = $derived(hasBlockingOverlay || activeMapView === 'world');
	// Keep the planner calculation behind the advisor's open gate. This avoids
	// doing a full supply projection for a modal that is not mounted while the
	// route-local category/horizon context remains available for reopen.
	let supplyPlannerResult = $derived.by(() => {
		if (!isSupplyAdvisorOpen || !game || !effectivePlannerProductId) return null;
		return deriveSupplyPlannerResult({
			isOpen: true,
			game,
			retailCityId: activeCity.id as WorldCityId,
			productId: effectivePlannerProductId,
			availability: plannerActionAvailability,
			snapshotGame: snapshotPlannerGame
		});
	});
	const retailMapActivity = $derived({
		seq: mapActivity.seq,
		activities: mapActivity.activities.filter((activity) => activity.kind !== 'production')
	});
	const industryMapActivity = $derived({
		seq: mapActivity.seq,
		activities: mapActivity.activities.filter((activity) => activity.kind === 'production')
	});
	let mapSnapshot = $derived(
		createCityMapSnapshot(
			game ?? starterMapState,
			selectedTileId,
			construction.retailPlacementPreview
		)
	);
	let industryMapSnapshot = $derived(
		createIndustryMapSnapshot(
			game ?? starterMapState,
			selectedIndustryTileId,
			construction.industryPlacementPreview,
			construction.railPreviewRender
		)
	);

	onMount(() => {
		void saves.initialize().then(async () => {
			if (
				new URLSearchParams(window.location.search).get('ui-comparison') === '1' &&
				saves.autoSave
			) {
				await saves.resumeAutoSave();
				selectedTileId = game?.stores[0]?.tileId ?? null;
			}
		});
		void gameRouteController.initializeScenarios();

		const controller = createGameAudioController({
			onPreferencesChanged: (nextPreferences) => {
				audioPreferences = nextPreferences;
			}
		});

		audioController = controller;
		audioPreferences = controller.getPreferences();
		controller.setActiveBgm(bgmCueByMapView[activeMapView]);

		return () => {
			void controller.destroy();
			audioController = null;
		};
	});

	$effect(() => {
		document.documentElement.lang = activeLocale;
	});

	$effect(() => {
		audioController?.setActiveBgm(bgmCueByMapView[activeMapView]);
	});

	$effect(() => {
		const gameExists = hasGame;
		const paused = simulationPaused;
		const speed = simulationSpeed;
		const tickPending = simulationTickPending;
		const blockedByOverlay = simulationBlocked;
		// Re-arm signal: bumped by runSimulationTick() when a tick is skipped
		// because a scenario command is in flight. Reading it here keeps the
		// effect's timer lifecycle independent of transient command-busy state.
		void simulationTickRearm;

		// Deliberately NOT reading mutationAvailability.advanceDay here. In
		// scenario mode that flag flips with every persisted scenario command
		// (commitMutation sets scenarioCommandPending true for the duration of
		// each command via onPendingChange), so subscribing the timer lifecycle
		// to it would clear the armed timeout mid-interval and restart the
		// SIMULATION_DAY_MS / speed delay each time a policy/build/hire/etc.
		// action landed. Frequent gameplay could then postpone a day
		// indefinitely. runSimulationTick() re-checks advanceDay at fire time
		// and skips (bumping simulationTickRearm to re-arm) if a command is
		// still pending, so the deadline is preserved across the busy window.
		if (!gameExists || paused || tickPending || blockedByOverlay) {
			return;
		}

		const timer = globalThis.setTimeout(() => void runSimulationTick(), SIMULATION_DAY_MS / speed);
		return () => globalThis.clearTimeout(timer);
	});

	function changeLocale(locale: SupportedLocale): void {
		activeLocale = saveLocalePreference(locale, safeLocalStorage());
	}

	function clearLogisticsRouteSelection(): void {
		selectedLogisticsRouteId = null;
		focusedLogisticsRouteId = null;
	}

	function selectLogisticsRoute(routeId: string): void {
		if (!logisticsRouteSummaries.some((summary) => summary.route.id === routeId)) return;
		setActiveMapView('world');
		selectedWorldCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		construction.cancel();
		focusedLogisticsRouteId = null;
		selectedLogisticsRouteId = routeId;
	}

	function selectTile(tileId: string) {
		clearLogisticsRouteSelection();
		if (construction.tryConstructionClick('retail', tileId)) return;

		// Resolve a click inside a placed 2x2 store footprint to that store's
		// anchor so the inspector shows the anchor's tile-derived stats
		// (neighborhood/demand/rent) instead of the clicked cell's.
		gameRouteController.selectReadOnlyTile(
			'retail',
			game ? resolveSelectionAnchorTileId(activeCity, game.stores, tileId) : tileId
		);
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
	}

	function selectIndustryTile(tileId: string) {
		clearLogisticsRouteSelection();
		if (construction.tryConstructionClick('industry', tileId)) return;

		// Resolve a click inside a placed 2x2 industrial building footprint to
		// that building's anchor for the same reason as selectTile above.
		// A rail-cell tile has no footprint to resolve, so it is left as-is —
		// `selectedRailSegments` then derives the segment(s) for it, and the
		// template shows RailSegmentInspector instead of IndustryTileInspector.
		gameRouteController.selectReadOnlyTile(
			'industry',
			game
				? resolveIndustrySelectionAnchorTileId(industryCity, game.industrialBuildings, tileId)
				: tileId
		);
		selectedTileId = null;
		selectedWorldCityId = null;
	}

	function upgradeRailSegmentHandler(segmentId: string): void {
		if (game && mutationAvailability.upgradeRail) {
			void gameRouteController.upgradeRail(industryCity.id, segmentId);
		}
	}

	function demolishRailSegmentHandler(segmentId: string): void {
		if (game && mutationAvailability.demolishRail) {
			void gameRouteController.demolishRail(industryCity.id, segmentId);
		}
	}

	function showMap(view: MapViewId): void {
		setActiveMapView(view);
		({
			selectedTileId,
			selectedIndustryTileId,
			selectedWorldCityId,
			selectedLogisticsRouteId,
			focusedLogisticsRouteId
		} = selectMapViewSelections(view, {
			selectedTileId,
			selectedIndustryTileId,
			selectedWorldCityId,
			selectedLogisticsRouteId,
			focusedLogisticsRouteId
		}));
		if (view === 'world') construction.hideMenu();
		construction.cancel();
	}

	function setActiveMapView(mapView: MapViewId): void {
		activeMapView = mapView;
		visitedMapViews = markMapViewVisited(visitedMapViews, mapView);
	}

	async function selectWorldCityNode(cityId: string): Promise<void> {
		clearLogisticsRouteSelection();
		const selection = resolveWorldCitySelection(
			game,
			cityId,
			allowedWorldCityIds,
			worldCitySelectionAvailable
		);
		if (!selection) return;
		selectedWorldCityId = selection.cityId;
		if (!selection.mapView) return;

		const result = await gameRouteController.selectWorldCity(selection.cityId);
		// `unchanged` means the city is already the active one — the controller
		// skipped the write, but navigation to its map should still proceed.
		if (
			result.status !== 'committed' &&
			result.status !== 'sandbox-committed' &&
			result.status !== 'unchanged'
		) {
			return;
		}
		setActiveMapView(selection.mapView);
		selectedWorldCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		construction.cancel();
	}

	function openSelectedWorldCity(cityId: string): void {
		const legalCityId = resolveWorldCityOpening(
			game,
			cityId,
			allowedWorldCityIds,
			mutationAvailability.openWorldCity
		);
		if (!legalCityId) return;
		void gameRouteController.openWorldCity(legalCityId);
		selectedWorldCityId = legalCityId;
	}

	function reviewSelectedWorldCityFinancing(cityId: string): void {
		const purchase = resolveWorldCityFinancing(
			game,
			cityId,
			allowedWorldCityIds,
			mutationAvailability.financeWorldCity
		);
		if (purchase) construction.review(purchase);
	}

	function closeWorldInspector(): void {
		selectedWorldCityId = null;
	}

	function openManagementPanel(panelId: ManagementPanelId): void {
		isGameMenuOpen = false;
		saves.close();
		construction.hideMenu();
		if (panelId !== 'logistics') {
			focusedLogisticsRouteId = null;
			logisticsRoutePreset = null;
		}
		if (panelId !== 'stores') {
			focusedRetailSupplyCityId = null;
		}
		// Panels open even before a store is founded; they fall back to an empty
		// starter state and their action handlers no-op until a game exists.
		activeManagementPanelId = panelId;
	}

	function handleGuidanceAction(action: RouteGuidanceAction): void {
		const handoff = resolveGuidanceHandoff(action);
		if (handoff.kind === 'alert') {
			void handleSelectAlert(handoff.alert);
		} else if (handoff.panelId === 'logistics') {
			openLogisticsManagement();
		} else {
			openManagementPanel(handoff.panelId);
		}
	}

	function openLogisticsManagement(
		routeId: string | null = null,
		preset: RecurringRouteInput | null = null
	): void {
		openManagementPanel('logistics');
		focusedLogisticsRouteId = routeId;
		logisticsRoutePreset = preset;
	}

	function openStoresManagement(retailCityId: WorldCityId): void {
		openManagementPanel('stores');
		focusedRetailSupplyCityId = retailCityId;
	}

	function closeManagementPanel(): void {
		activeManagementPanelId = null;
		focusedLogisticsRouteId = null;
		logisticsRoutePreset = null;
		focusedRetailSupplyCityId = null;
	}

	function unlockAudio(): void {
		void audioController?.unlock();
	}

	function playSfx(cueId: SfxCueId): void {
		void audioController?.playSfx(cueId);
	}

	function updateAudioPreferences(patch: Partial<AudioPreferences>): void {
		audioController?.updatePreferences(patch);
	}

	let previousScenarioIdentity: ScenarioRouteIdentity | undefined = undefined;

	function resetTransientViewState(): void {
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		logisticsRoutePreset = null;
		focusedRetailSupplyCityId = null;
		storeDetailFocus.close();
		construction.hideMenu();
		isSupplyAdvisorOpen = false;
		// Pause the auto-tick whenever the active play mode or scenario run
		// changes (start/restart/import a challenge, return to sandbox, etc.)
		// so the player can review the new state before time resumes.
		simulationPaused = true;
		isGameMenuOpen = false;
		isAlertsMenuOpen = false;
		activeManagementPanelId = null;
		focusedFinanceLoanId = null;
		construction.cancel();
	}

	function synchronizeControllerState(state: Readonly<GameRouteControllerState>): void {
		sandboxGame = state.sandboxGame;
		activeScenarioRun = state.activeScenarioRun;
		lastScenarioResult = state.lastScenarioResult;
		lastScenarioBestUpdated = state.lastScenarioBestUpdated;
		scenarioOperationError = state.scenarioOperationError;
		retryScenarioOperation = state.retryScenarioOperation;
		playMode = state.playMode;
		scenarioCommandPending = state.scenarioCommandPending;
		scenariosReady = state.scenariosReady;
		if (state.playMode === 'sandbox') {
			scenarios.clearEvidence();
		}
		const identity: ScenarioRouteIdentity = {
			playMode: state.playMode,
			runId: state.activeScenarioRun?.runId ?? null,
			status: state.activeScenarioRun?.status ?? null,
			scenarioRunSyncEpoch: state.scenarioRunSyncEpoch
		};
		if (shouldResetScenarioView(previousScenarioIdentity, identity)) {
			resetTransientViewState();
		}
		previousScenarioIdentity = identity;
	}

	// Shared post-load reset for a successful auto/manual load: selections,
	// armed placement, guidance re-arm and a paused auto-tick. Failed or
	// missing loads never reset — the caller returns before reaching this.
	function resetViewStateAfterLoad(): void {
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		construction.cancel();
		// Only a successful load re-arms the sandbox opening and cash guidance.
		sandboxOpeningGuidanceDismissed = false;
		cashRecoveryDismissed = false;
		// Pause the auto-tick so the player can review the loaded state
		// before time resumes.
		simulationPaused = true;
	}

	function openSupplyAdvisor(productId?: ProductId): void {
		if (productId && plannerProductIds.includes(productId)) {
			supplyPlannerUiContext = {
				...supplyPlannerUiContext,
				productId
			};
		}
		construction.hideMenu();
		isSupplyAdvisorOpen = true;
	}

	function closeSupplyAdvisor(): void {
		isSupplyAdvisorOpen = false;
	}

	function selectSupplyPlannerProduct(productId: ProductId): void {
		if (!plannerProductIds.includes(productId)) return;
		supplyPlannerUiContext = {
			...supplyPlannerUiContext,
			productId
		};
	}

	function selectSupplyPlannerHorizon(horizonDays: SupplyPlannerHorizonDays): void {
		supplyPlannerUiContext = { ...supplyPlannerUiContext, horizonDays };
	}

	function planSupplyProduct(productId: ProductId): void {
		if (!plannerProductIds.includes(productId)) return;
		activeManagementPanelId = null;
		focusedLogisticsRouteId = null;
		logisticsRoutePreset = null;
		focusedRetailSupplyCityId = null;
		openSupplyAdvisor(productId);
	}

	function closePlannerOverlays(): void {
		isSupplyAdvisorOpen = false;
		construction.hideMenu();
		isGameMenuOpen = false;
		storeDetailFocus.close();
		isCheatSheetOpen = false;
		isAlertsMenuOpen = false;
		saves.close();
		scenarios.closeCatalog();
		activeManagementPanelId = null;
		focusedLogisticsRouteId = null;
		logisticsRoutePreset = null;
		focusedRetailSupplyCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		construction.cancel();
	}

	async function switchToPlannerSupplyCity(cityId: WorldCityId): Promise<boolean> {
		if (!game) return false;
		await selectWorldCityNode(cityId);
		const currentGame = game;
		if (!currentGame || currentGame.activeIndustryCityId !== cityId) return false;
		setActiveMapView('industry');
		selectedTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		return true;
	}

	function plannerHandoffHost(): SupplyPlannerHandoffHost {
		return {
			getGame: () => game,
			closeOverlays: closePlannerOverlays,
			switchToSupplyCity: switchToPlannerSupplyCity,
			armIndustryPlacement: construction.armIndustry,
			selectIndustryTile,
			openLogistics: openLogisticsManagement,
			openStores: openStoresManagement,
			enterRailBuildMode: (mode) => {
				isSupplyAdvisorOpen = false;
				construction.enterRailRouting(mode);
			},
			canBuildRail: mutationAvailability.buildRail,
			canManageLogistics: mutationAvailability.manageLogistics,
			canSetRetailSupplySource: mutationAvailability.setRetailSupplySource
		};
	}

	function snapshotPlannerGame(state: GameState): GameState {
		return $state.snapshot(state);
	}

	function currentSupplyPlannerResult(): ReturnType<typeof deriveSupplyPlannerResult> {
		return deriveSupplyPlannerResult({
			isOpen: true,
			game,
			retailCityId: activeCity.id as WorldCityId,
			productId: effectivePlannerProductId,
			availability: plannerActionAvailability,
			snapshotGame: snapshotPlannerGame
		});
	}

	function handleSupplyPlannerAction(action: SupplyPlannerAction): void {
		const currentResult = currentSupplyPlannerResult();
		if (!currentResult) return;
		void handoffSupplyPlannerAction(action, currentResult, plannerHandoffHost());
	}

	async function runSimulationTick(): Promise<void> {
		if (!game || simulationPaused || simulationTickPending) {
			return;
		}
		if (!mutationAvailability.advanceDay) {
			// A scenario command is in flight (scenarioCommandPending is true,
			// so commitMutation hasn't finished its persist/publish cycle). The
			// day deadline has already passed; bump the re-arm signal so the
			// auto-tick effect schedules a fresh tick instead of stalling the
			// clock until the next user action. runSimulationTick() re-checks
			// advanceDay when the new timer fires and proceeds once the command
			// bus clears.
			simulationTickRearm += 1;
			return;
		}

		simulationTickPending = true;
		try {
			await gameRouteController.advanceDay();
		} finally {
			simulationTickPending = false;
		}
	}

	function toggleSimulationPause(): void {
		if (!game) return;
		simulationPaused = !simulationPaused;
	}

	function setSimulationSpeed(speed: SimulationSpeed): void {
		simulationSpeed = speed;
	}

	async function removeRecurringRoute(routeId: string): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return { status: 'unavailable' };
		}
		const result = await gameRouteController.removeRecurringRoute(routeId);
		if (isGameRouteCommitted(result)) {
			if (selectedLogisticsRouteId === routeId) selectedLogisticsRouteId = null;
			if (focusedLogisticsRouteId === routeId) focusedLogisticsRouteId = null;
		}
		return result;
	}

	async function changeStoreProduct(
		storeId: string,
		productId: ProductId,
		patch: StoreProductPatch
	): Promise<GameRouteCommitResult | null> {
		// null = pre-command: no game, unknown product, or the mutation command
		// is unavailable in this run. Otherwise the controller result is passed
		// through unchanged so callers can acknowledge truthfully.
		if (!game) {
			return null;
		}
		const product = game.stores
			.find((store) => store.id === storeId)
			?.products.find((candidate) => candidate.productId === productId);
		if (!product) {
			return null;
		}

		if (patch.sellingPrice !== undefined) {
			if (!mutationAvailability.updateStoreSellingPrice) return null;
			return gameRouteController.updateStoreSellingPrice(storeId, productId, patch.sellingPrice);
		}
		if (!mutationAvailability.updateStoreInventoryTargets) return null;
		return gameRouteController.updateStoreInventoryTargets(
			storeId,
			productId,
			patch.reorderThreshold ?? product.reorderThreshold,
			patch.targetStock ?? product.targetStock
		);
	}

	async function upgradeStoreHandler(storeId: string): Promise<GameRouteCommitResult | null> {
		if (!game || !mutationAvailability.upgradeStore) return null;
		return gameRouteController.upgradeStore(storeId);
	}

	function closeInspector() {
		selectedTileId = null;
		storeDetailFocus.close();
	}

	/** Stock-table handoff: manage this store's retail supply source. */
	function manageStoreSupplySource(retailCityId: string): void {
		const cityId = resolveWorldCityId(retailCityId);
		if (!cityId) return;
		storeDetailFocus.close();
		openStoresManagement(cityId);
	}

	/** Stock-table handoff: open the supply planner for one product. */
	function planStoreSupplyProduct(productId: ProductId): void {
		storeDetailFocus.close();
		planSupplyProduct(productId);
	}

	function closeIndustryInspector() {
		selectedIndustryTileId = null;
	}

	function isTypingElement(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
	}

	// Interactive controls (buttons, links, disclosure summaries, and ARIA
	// interactive roles) own certain keypresses — Space activates a button, so
	// the global shortcut handler must not hijack it and call preventDefault().
	// Mnemonic letters are suppressed here too: per the review note, shortcut
	// handling should not fire from focused interactive controls. Dedicated
	// global keys (`?`, Escape) are handled separately and stay unaffected.
	const INTERACTIVE_CONTROL_SELECTOR =
		'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]';

	function isInteractiveControl(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		return target.closest(INTERACTIVE_CONTROL_SELECTOR) !== null;
	}

	async function handleSelectAlert(alert: GameAlert): Promise<void> {
		const destination = resolveMapAlertDestination(
			alert,
			game,
			allowedWorldCityIds,
			worldCitySelectionAvailable
		);
		if (!destination) return;
		if (destination.kind === 'world-route') {
			selectLogisticsRoute(destination.routeId);
			return;
		}
		if (destination.kind === 'panel') {
			focusedFinanceLoanId = destination.focusedFinanceLoanId;
			openManagementPanel(destination.panelId);
			return;
		}
		if (destination.cityIdToSelect) {
			const result = await gameRouteController.selectAlertCity(destination.cityIdToSelect);
			if (result.status !== 'committed' && result.status !== 'sandbox-committed') return;
		}
		if (destination.kind === 'retail') {
			showMap('retail');
			selectedTileId = destination.tileId;
			storeDetailFocus.openDirect(destination.productId);
			return;
		}
		showMap('industry');
		// Prefer a legal fix; otherwise inspect the building that raised the alert.
		if (destination.fix === 'warehouse' && construction.canStartWarehousePlacement) {
			construction.armIndustry('warehouse');
			return;
		}
		if (
			destination.fix === 'rail' &&
			destination.buildingId &&
			startRailFromBuilding(destination.buildingId)
		)
			return;
		selectedIndustryTileId = destination.tileId;
	}

	function startRailFromBuilding(buildingId: string): boolean {
		if (!game || !mutationAvailability.buildRail) return false;
		if (!game.industrialBuildings.some((building) => building.id === buildingId)) return false;
		isSupplyAdvisorOpen = false;
		selectedIndustryTileId = null;
		construction.enterRailRouting({
			step: 'routing',
			originBuildingId: buildingId,
			waypoints: []
		});
		return true;
	}

	function handleKeydown(event: KeyboardEvent) {
		unlockAudio();

		// Leave Cmd/Ctrl/Alt combinations to the browser/OS (e.g. Cmd+D, Cmd+S) —
		// only bare keypresses (Shift allowed) drive game shortcuts.
		const hasModifier = event.metaKey || event.ctrlKey || event.altKey;

		if (event.key === '?' && !hasModifier) {
			// `?` is a true toggle: it opens the cheat sheet when no overlay is
			// active, and closes it when the cheat sheet itself is the open
			// overlay. It stays suppressed when a *different* modal is open so
			// it can't stack on top of it.
			if (!isTypingElement(event.target) && (!hasBlockingOverlay || isCheatSheetOpen)) {
				event.preventDefault();
				isCheatSheetOpen = !isCheatSheetOpen;
			}
			return;
		}

		if (event.key === 'Escape') {
			const resolution = resolveEscapeTarget({
				...overlaySnapshot,
				allowMenuFallback: !hasModifier && !isTypingElement(event.target)
			});
			switch (resolution.type) {
				case 'close-overlay':
					switch (resolution.overlay) {
						case 'save-panel':
							saves.close();
							break;
						case 'cheat-sheet':
							isCheatSheetOpen = false;
							break;
						case 'supply-advisor':
							isSupplyAdvisorOpen = false;
							break;
						case 'store-detail':
							storeDetailFocus.close();
							break;
						case 'build-menu':
							construction.hideMenu();
							break;
						case 'game-menu':
							isGameMenuOpen = false;
							break;
						case 'alerts-menu':
							isAlertsMenuOpen = false;
							break;
						case 'management-panel':
							closeManagementPanel();
							break;
					}
					break;
				case 'cancel-placement':
					construction.cancel();
					break;
				case 'clear-selection':
					if (resolution.kind === 'worldCity') selectedWorldCityId = null;
					else if (resolution.kind === 'retailTile') selectedTileId = null;
					else if (resolution.kind === 'industryTile') selectedIndustryTileId = null;
					clearLogisticsRouteSelection();
					break;
				case 'open-game-menu':
					isGameMenuOpen = true;
					break;
				case 'external-owned':
				case 'none':
					break;
			}
			return;
		}

		const action = resolveShortcutAction({
			key: event.key,
			isTypingTarget: isTypingElement(event.target),
			isInteractiveTarget: isInteractiveControl(event.target),
			hasModifier,
			hasBlockingOverlay,
			isMenuOpen: construction.isMenuOpen || activeManagementPanelId !== null,
			activeMapView,
			hasGame: game !== null
		});

		if (!action) {
			return;
		}

		event.preventDefault();

		if (action.type === 'toggle-build') {
			if (construction.isMenuOpen) {
				construction.closeMenu();
			} else {
				construction.openMenu();
			}
		} else if (action.type === 'toggle-panel') {
			if (activeManagementPanelId === action.panel) {
				closeManagementPanel();
			} else {
				if (action.panel === 'logistics') openLogisticsManagement();
				else openManagementPanel(action.panel);
			}
		} else if (action.type === 'toggle-pause') {
			toggleSimulationPause();
		} else if (action.type === 'view') {
			showMap(action.view);
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('app.title')} · {mapEyebrow}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main
	class="app"
	data-play-mode={playMode}
	data-scenario-command-pending={scenarioCommandPending}
	data-simulation-paused={simulationPaused}
	data-simulation-blocked={simulationBlocked}
	data-active-map-view={activeMapView}
	data-scenario-result={lastScenarioResult?.outcome ?? ''}
	data-scenario-best-updated={lastScenarioBestUpdated}
	data-scenario-error={scenarioOperationError?.code ?? ''}
	data-scenario-retry-available={retryScenarioOperation !== null}
	onpointerdown={unlockAudio}
>
	<section
		class="map-layout"
		class:opening-guidance-visible={showOpeningGuidance || showCashRecovery}
		aria-label={i18n.t('route.cityPlanning')}
		style:--og-card-h="{openingGuidanceCardHeight}px"
	>
		<div class="map-surface-area">
			<MapSurfaceHost
				{activeMapView}
				{visitedMapViews}
				{isMapPaused}
				{i18n}
				{worldCityStatuses}
				{selectedWorldCityId}
				onSelectWorldCity={selectWorldCityNode}
				onOpenWorldCity={openSelectedWorldCity}
				onFinanceWorldCity={reviewSelectedWorldCityFinancing}
				onCloseWorldInspector={closeWorldInspector}
				canOpenWorldCity={mutationAvailability.openWorldCity}
				canFinanceWorldCity={mutationAvailability.financeWorldCity}
				{allowedWorldCityIds}
				{mutationDisabledReason}
				{logisticsRouteSummaries}
				{selectedLogisticsRouteId}
				onSelectLogisticsRoute={selectLogisticsRoute}
				{latestDeliveredTransfer}
				{mapSnapshot}
				{retailMapActivity}
				onSelectRetailTile={selectTile}
				{industryMapSnapshot}
				{industryMapActivity}
				onSelectIndustryTile={selectIndustryTile}
				onCancelRailBuild={construction.cancelRailStep}
				{railKeyboardEnabled}
			/>
		</div>
		<TopBar
			eyebrow={mapEyebrow}
			title={mapTitle}
			day={game?.day ?? null}
			cash={game?.cash ?? null}
			cashHistory={game?.reports.slice(-14).map((report) => report.cashAfter) ?? []}
			industryInventory={game?.cityInventories.find(
				(inventory) => inventory.cityId === industryCity.id
			)?.materials ?? {}}
			{alerts}
			{i18n}
			{activeLocale}
			onSelectAlert={handleSelectAlert}
			{activeMapView}
			onSelectView={showMap}
			onSelectLocale={changeLocale}
			bind:menuOpen={isGameMenuOpen}
			bind:alertsOpen={isAlertsMenuOpen}
		>
			{#snippet menuContent()}
				<div class="menu-section">
					<p class="menu-label">{i18n.t('route.menu.management')}</p>
					<div
						class="menu-management"
						role="group"
						aria-label={i18n.t('route.menu.managementPanels')}
					>
						{#each managementPanelMenuItems as item (item.id)}
							<button
								type="button"
								onclick={() =>
									item.id === 'logistics'
										? openLogisticsManagement()
										: openManagementPanel(item.id)}
							>
								{item.label}
							</button>
						{/each}
					</div>
				</div>
				<ScenarioMenuActions ui={scenarios} {playMode} {i18n} onOpenSaves={saves.open} />
				<AudioSettings {i18n} preferences={audioPreferences} onChange={updateAudioPreferences} />
			{/snippet}
		</TopBar>

		{#if scenarios.showProgress}
			<div class="scenario-progress">
				<ScenarioProgressHost ui={scenarios} {i18n} />
			</div>
		{/if}

		{#if showOpeningGuidance && openingGuidanceHint}
			<div class="opening-guidance" bind:clientHeight={openingGuidanceCardHeight}>
				<OpeningGuidance
					hint={openingGuidanceHint}
					{i18n}
					onAction={handleGuidanceAction}
					onDismiss={playMode === 'sandbox'
						? () => (sandboxOpeningGuidanceDismissed = true)
						: undefined}
				/>
			</div>
		{:else if showCashRecovery && cashRecoveryPlan}
			<div class="opening-guidance" bind:clientHeight={openingGuidanceCardHeight}>
				<CashRecoveryGuidance
					plan={cashRecoveryPlan}
					{i18n}
					onStep={handleGuidanceAction}
					onDismiss={() => (cashRecoveryDismissed = true)}
				/>
			</div>
		{/if}

		<ControlDesk
			worldView={activeMapView === 'world'}
			day={game?.day ?? 1}
			managementItems={managementPanelMenuItems}
			buildDisabled={activeMapView === 'world' ||
				(activeMapView === 'retail'
					? !construction.canStartRetailExpansion
					: !construction.canStartIndustryExpansion)}
			advanceDisabled={game === null || !mutationAvailability.advanceDay}
			pauseDisabled={game === null}
			railBuildDisabled={!mutationAvailability.buildRail}
			disabledReason={game === null ? i18n.t('controlDesk.timeLockedHint') : mutationDisabledReason}
			{i18n}
			onBuild={construction.openMenu}
			onOpenManagement={(id) =>
				id === 'logistics' ? openLogisticsManagement() : openManagementPanel(id)}
			paused={simulationPaused}
			{simulationSpeed}
			onTogglePause={toggleSimulationPause}
			onSelectSpeed={setSimulationSpeed}
			onOpenShortcuts={() => (isCheatSheetOpen = true)}
			showRailBuild={activeMapView === 'industry' && game !== null}
			railBuildActive={construction.isRailActive}
			onToggleRailBuild={construction.toggleRail}
		/>
		<ConstructionControls
			ui={construction}
			{i18n}
			cash={game?.cash ?? 0}
			view={activeMapView}
			guidanceVisible={showOpeningGuidance || showCashRecovery}
			onOpenAdvisor={openSupplyAdvisor}
		/>
		{#if isSupplyAdvisorOpen}
			<SupplyAdvisor
				result={supplyPlannerResult}
				productIds={plannerProductIds}
				selectedProductId={effectivePlannerProductId}
				horizonDays={supplyPlannerUiContext.horizonDays}
				{i18n}
				onSelectProduct={selectSupplyPlannerProduct}
				onSelectHorizon={selectSupplyPlannerHorizon}
				onAction={handleSupplyPlannerAction}
				onClose={closeSupplyAdvisor}
			/>
		{/if}
		<MapInspectorHost
			game={game ?? starterMapState}
			{i18n}
			disabledReason={mutationDisabledReason}
			showRetailInspector={shouldShowRetailInspector}
			selectedRetailTile={selectedTile}
			{selectedStore}
			latestStoreReport={latestSelectedStoreReport}
			canUpgradeStore={mutationAvailability.upgradeStore}
			onUpgradeStore={upgradeStoreHandler}
			onOpenStoreDetails={storeDetailFocus.open}
			onRetailClickFeedback={() => playSfx('sfx.ui.click')}
			onCloseRetailInspector={closeInspector}
			showIndustryInspector={shouldShowIndustryInspector}
			{selectedIndustryTile}
			{selectedIndustryBuilding}
			{selectedRailSegments}
			allIndustryRailSegments={industryRailSegments}
			industryCityId={industryCity.id}
			canUpgradeIndustryBuilding={mutationAvailability.upgradeIndustrialBuilding}
			canUpgradeRail={mutationAvailability.upgradeRail}
			canDemolishRail={mutationAvailability.demolishRail}
			onUpgradeIndustryBuilding={(id) => {
				void gameRouteController.upgradeIndustrialBuilding(id);
			}}
			onAddIndustryRoute={(preset) => openLogisticsManagement(null, preset)}
			canDemolishIndustryBuilding={playMode === 'sandbox' && game !== null}
			onDemolishIndustryBuilding={(id) => {
				void gameRouteController.demolishIndustrialBuilding(id);
			}}
			onBuildIndustryWarehouse={construction.canStartWarehousePlacement
				? () => construction.armIndustry('warehouse')
				: undefined}
			onBuildRailFromBuilding={mutationAvailability.buildRail
				? (id) => void startRailFromBuilding(id)
				: undefined}
			onUpgradeRailSegment={upgradeRailSegmentHandler}
			onDemolishRailSegment={demolishRailSegmentHandler}
			onCloseIndustryInspector={closeIndustryInspector}
			{showLogisticsRouteInspector}
			{selectedLogisticsRoute}
			onManageLogisticsRoute={openLogisticsManagement}
			onCloseLogisticsRouteInspector={clearLogisticsRouteSelection}
		/>
	</section>

	{#if storeDetailFocus.isOpen && selectedStore}
		<StoreDetailModal
			game={game ?? starterMapState}
			{i18n}
			store={selectedStore}
			staff={game?.staff ?? []}
			hiringCandidates={game?.hiringCandidates ?? []}
			latestStoreReport={latestSelectedStoreReport}
			focusedProductId={storeDetailFocus.focusedProductId}
			{plannerProductIds}
			onManageSupplySource={manageStoreSupplySource}
			onPlanSupply={planStoreSupplyProduct}
			onUpdateStoreProduct={changeStoreProduct}
			onUpdateStoreProductBrand={(storeId, productId, brandId) => {
				void gameRouteController.updateStoreProductBrand(storeId, productId, brandId);
			}}
			onHireStaff={(id) => {
				void gameRouteController.hireStaff(id);
			}}
			onAssignStaff={(staffId, storeId) => {
				void gameRouteController.assignStaff(staffId, storeId);
			}}
			onUnassignStaff={(id) => {
				void gameRouteController.unassignStaff(id);
			}}
			canUpdateSellingPrice={mutationAvailability.updateStoreSellingPrice}
			canUpdateInventoryTargets={mutationAvailability.updateStoreInventoryTargets}
			canUpdateBrand={mutationAvailability.updateStoreProductBrand}
			{allowedProductIds}
			canHireStaff={mutationAvailability.hireStaff}
			canAssignStaff={mutationAvailability.assignStaff}
			canUnassignStaff={mutationAvailability.unassignStaff}
			disabledReason={mutationDisabledReason}
			onClickFeedback={() => playSfx('sfx.ui.click')}
			onClose={storeDetailFocus.close}
		/>
	{/if}

	{#if activeManagementPanel}
		{@const panelGame = game ?? starterMapState}
		{@const retailSupplyViews = buildRetailCitySupplyViews(panelGame, i18n)}
		<ManagementPanelHost
			panelId={activeManagementPanel.id}
			panelLabel={activeManagementPanel.label}
			managementItems={managementPanelMenuItems}
			onSelectPanel={(id) =>
				id === 'logistics' ? openLogisticsManagement() : openManagementPanel(id)}
			{panelGame}
			currentCash={game ? game.cash : null}
			{summary}
			{financeMetrics}
			{retailSupplyViews}
			mutations={mutationAvailability}
			retailSupplyDisabled={game === null || !mutationAvailability.setRetailSupplySource}
			{focusedFinanceLoanId}
			{focusedRetailSupplyCityId}
			logisticsView={logisticsPanelView}
			{focusedLogisticsRouteId}
			{logisticsRoutePreset}
			sandboxProgressionGame={playMode === 'sandbox' ? game : null}
			{i18n}
			disabledReason={mutationDisabledReason}
			onClose={closeManagementPanel}
			onChangePolicy={(patch) => {
				void gameRouteController.updatePolicy(patch);
			}}
			onSetPolicyOverride={(scope, patch) => {
				void gameRouteController.setPolicyOverride(scope, patch);
			}}
			onClearPolicyOverrideField={(scope, field) => {
				void gameRouteController.clearPolicyOverrideField(scope, field);
			}}
			onResetPolicyOverrideScope={(scope) => {
				void gameRouteController.resetPolicyOverrideScope(scope);
			}}
			onSetManagerDelegation={(delegation) => {
				void gameRouteController.setManagerDelegation(delegation);
			}}
			onRemoveManagerDelegation={(id) => {
				void gameRouteController.removeManagerDelegation(id);
			}}
			onHireStaff={(id) => {
				void gameRouteController.hireStaff(id);
			}}
			onAssignStaff={(staffId, storeId) => {
				void gameRouteController.assignStaff(staffId, storeId);
			}}
			onUnassignStaff={(id) => {
				void gameRouteController.unassignStaff(id);
			}}
			onReleaseStaff={(id) => {
				void gameRouteController.releaseStaff(id);
			}}
			onPromoteStaff={(id) => {
				void gameRouteController.promoteStaff(id);
			}}
			onSetRetailSupplySource={(retailCityId, supplyCityId) => {
				void gameRouteController.setRetailSupplySource(retailCityId, supplyCityId);
			}}
			onChooseDecision={(decisionId, optionId) => {
				void gameRouteController.resolveDecision(decisionId, optionId);
			}}
			onBorrow={(amount, termDays) => gameRouteController.borrowWorkingCapital(amount, termDays)}
			onRepay={(loanId, amount) => gameRouteController.repayFinanceLoan(loanId, amount)}
			onPayoff={(loanId) => gameRouteController.payOffFinanceLoan(loanId)}
			onRefinance={(loanId, termDays) => gameRouteController.refinanceFinanceLoan(loanId, termDays)}
			onPlanProduct={planSupplyProduct}
			{plannerProductIds}
			onDispatchManualTransfer={(input) => gameRouteController.dispatchManualTransfer(input)}
			onCreateRecurringRoute={(input) => gameRouteController.createRecurringRoute(input)}
			onUpdateRecurringRoute={(routeId, input) =>
				gameRouteController.updateRecurringRoute(routeId, input)}
			onPauseRecurringRoute={(routeId) => gameRouteController.pauseRecurringRoute(routeId)}
			onResumeRecurringRoute={(routeId) => gameRouteController.resumeRecurringRoute(routeId)}
			onReprioritizeRecurringRoute={(routeId, priority) =>
				gameRouteController.reprioritizeRecurringRoute(routeId, priority)}
			onRemoveRecurringRoute={removeRecurringRoute}
		/>
	{/if}

	<SavePanelHost ui={saves} {game} {i18n} />

	<ScenarioCatalogHost ui={scenarios} {i18n} />
	<ScenarioResultsHost ui={scenarios} {i18n} />

	{#if isCheatSheetOpen}
		<ShortcutCheatSheet {i18n} onClose={() => (isCheatSheetOpen = false)} />
	{/if}
</main>

<style>
	.app {
		width: 100vw;
		height: 100dvh;
		/* dvh, not vh: on real phones the layout must anchor to the visible
		   viewport, or bottom-of-flow content (the guidance card) sits behind
		   fixed chrome while the browser's address bar is showing. */
		min-height: 100dvh;
		overflow: hidden;
		display: block;
	}

	.map-layout {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 100dvh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* While the guidance card is shown, the map surfaces end above the card's
	   strip (see .opening-guidance) so the canvas physically stops short of it
	   and tile clicks can never land underneath it. The band is measured from
	   the card itself — its bottom margin plus the bound --og-card-h — instead
	   of a hardcoded guess, so longer copy can never outgrow the reserved
	   space. The cap keeps the renderer's 520px minimum canvas height: on
	   windows too short for band + 520px the cap binds and the card instead
	   stacks over the canvas (position/z-index on .opening-guidance). When the
	   card is absent the band is released so the canvas reclaims the full
	   layout height. */
	.map-surface-area {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
	}

	.map-layout.opening-guidance-visible .map-surface-area {
		bottom: min(calc(5.75rem + var(--og-card-h, 0px)), calc(100% - 32.5rem));
	}

	.scenario-progress {
		position: fixed;
		top: 5rem;
		right: 0.75rem;
		left: 0.75rem;
		z-index: 29;
		max-height: calc(100dvh - 10rem);
		overflow: auto;
	}

	/* While the guidance card is rendered, the expanded panel caps above it:
	   the band is the card's bottom margin (5.75rem) plus the measured card
	   height (--og-card-h, bound to the card's clientHeight), so the strip's
	   bottom edge holds a gutter above the card top instead of covering its
	   action row at z 29. */
	.map-layout.opening-guidance-visible .scenario-progress {
		max-height: calc(100dvh - 5rem - 5.75rem - var(--og-card-h, 0px) - 0.5rem);
	}

	/* The guidance card is in flow at the bottom of the layout (the only
	   in-flow child; margin-top auto bottom-anchors it in the flex column).
	   Its 5.75rem bottom margin lifts the whole card clear of the centered
	   play/speed time cluster (fixed, bottom 1.25rem, ~4rem tall), so no fixed
	   chrome covers the card's copy or action row at any window width. The
	   position/z-index 5 matters only when the 520px canvas cap binds on short
	   windows, where the card stacks over the canvas like it already does on
	   short phones — above map content and the world node list (3) / inspector
	   (4), under the tile inspector (10), dock (25), and top chrome (29/30). */
	.opening-guidance {
		position: relative;
		z-index: 5;
		margin: auto 0.75rem 5.75rem 6.75rem;
	}

	/* On the world map the dock column is hidden (ControlDesk world-view), so
	   the card drops its left gap. Horizontal only: the bottom margin must
	   stay stable across map views or switching views mid-opening would
	   resize the reserved canvas band. */
	.app[data-active-map-view='world'] .opening-guidance {
		margin-left: 0.75rem;
	}

	@media (max-width: 600px) {
		/* Mobile mirror of the desktop band: the card holds 8.6rem off the
		   bottom (above the bottom-bar dock and the time cluster), the space is
		   measured from the card, and the cap keeps the renderer's 520px minimum
		   canvas height (below ~800px the cap binds and the card out-stacks the
		   canvas per .opening-guidance's z-index). */
		.map-layout.opening-guidance-visible .map-surface-area {
			bottom: min(calc(8.6rem + var(--og-card-h, 0px)), calc(100dvh - 32.5rem));
		}

		.opening-guidance {
			margin: auto 0.5rem 8.6rem 0.5rem;
		}

		/* Same cap as the desktop rule but against the mobile band: the card
		   holds 8.6rem off the bottom, so the expanded panel ends above the
		   measured card top plus the gutter. */
		.map-layout.opening-guidance-visible .scenario-progress {
			max-height: calc(100dvh - 5rem - 8.6rem - var(--og-card-h, 0px) - 0.5rem);
		}
	}

	/* Management launchers surfaced inside the hamburger menu so they remain
	   reachable on narrow viewports where the control desk hides the .manage
	   cluster. Mirrors GameMenu's .menu-label and .view-tab look. */
	.menu-section {
		display: grid;
		gap: 0.4rem;
	}

	.menu-label {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.menu-management {
		display: grid;
		gap: 0.3rem;
	}

	.menu-management button {
		width: 100%;
		text-align: left;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		padding: 0.45rem 0.6rem;
	}

	.menu-management button:hover,
	.menu-management button:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}
</style>
