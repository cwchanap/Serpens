<script lang="ts">
	import { onMount, tick } from 'svelte';
	import BuildMenu from '$lib/components/game/BuildMenu.svelte';
	import AudioSettings from '$lib/components/game/AudioSettings.svelte';
	import ControlDesk from '$lib/components/game/ControlDesk.svelte';
	import OpeningGuidance from '$lib/components/game/OpeningGuidance.svelte';
	import CashRecoveryGuidance from '$lib/components/game/CashRecoveryGuidance.svelte';
	import SavePanelHost from './SavePanelHost.svelte';
	import { createSaveUi } from './saveUi.svelte';
	import ScenarioCatalog from '$lib/components/game/ScenarioCatalog.svelte';
	import ScenarioMenuSection from '$lib/components/game/ScenarioMenuSection.svelte';
	import ScenarioObjectivePanel from '$lib/components/game/ScenarioObjectivePanel.svelte';
	import ScenarioResultsDialog from '$lib/components/game/ScenarioResultsDialog.svelte';
	import ScenarioStatusStrip from '$lib/components/game/ScenarioStatusStrip.svelte';
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
	import { getTileById } from '$lib/game/city';
	import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
	import { createIndustryMapSnapshot } from '$lib/game/industryMapRender';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import { resolveWorldCityId } from '$lib/game/cityInventory';
	import { buildRailNetwork, deriveRailSegments, type RailSegment } from '$lib/game/rail';
	import { buildRailPreview } from '$lib/game/railPlacement';
	import {
		cancelRailBuildStep,
		deriveRailPreviewRender,
		reduceRailBuildClick,
		type RailBuildMode
	} from './railBuild';
	import {
		createInitialVisitedMapViews,
		markMapViewVisited,
		type MapViewId
	} from '$lib/game/mapViewKeepAlive';
	import {
		createIndustryPlacementPreview,
		createRetailPlacementPreview,
		getIndustrialBuildMenuOptions,
		getIndustryBuildPlacementBlockReason,
		getRetailBuildMenuOptions,
		getRetailPlacementBlockReason,
		resolveIndustryPlacementAnchorTileId,
		resolveIndustrySelectionAnchorTileId,
		resolveRetailPlacementAnchorTileId,
		resolveSelectionAnchorTileId,
		type PlacementBlockReason
	} from '$lib/game/placementPreview';
	import { formatPlacementBlockReason } from '$lib/i18n/gameCopy';
	import { restrictPreviewToScenario } from './placementRoute';
	import {
		buildScenarioProgressView,
		buildScenarioResultsView,
		buildScenarioCatalogCards,
		resolveScenarioContributorLabel,
		scenarioDiagnosticText,
		scenarioShareCodeErrorText,
		type ScenarioCatalogActionResult,
		type ScenarioCatalogCardViewModel
	} from '$lib/i18n/scenarioCopy';
	import {
		createI18n,
		readLocalePreference,
		saveLocalePreference,
		type StorageLike
	} from '$lib/i18n/index';
	import type { SupportedLocale } from '$lib/i18n/locales';
	import { summarizeReports } from '$lib/game/reports';
	import { getExpansionFinanceOffer, type FinanceFailureCode } from '$lib/game/finance';
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
	import { getExpansionSetupCost } from '$lib/game/state';
	import { getAvailableMaterialIds } from '$lib/game/supplyAdvisor';
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
		ArchetypeId,
		GameState,
		IndustrialBuildingTypeId,
		MaterialId,
		ProductId,
		StoreProductPatch,
		TransferOrder,
		WorldCityId
	} from '$lib/game/types';
	import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
	import { createScenarioRepository } from '$lib/persistence/scenarioRepositoryFactory';
	import {
		currentScenarioDefinition,
		listScenarioCatalogEntries,
		resolveScenarioDefinition
	} from '$lib/scenarios/catalog';
	import {
		isLiveScenarioContentAllowed,
		shouldResetScenarioView,
		toCatalogActionResult,
		type ScenarioRouteIdentity
	} from './scenarioRoute';
	import { decodeScenarioShareCode } from '$lib/scenarios/shareCode';
	import type {
		ScenarioDefinition,
		ScenarioOperationError,
		ScenarioPersistenceSummary,
		ScenarioResult,
		ScenarioRun
	} from '$lib/scenarios/types';
	import {
		GameRouteController,
		createMutationAvailability,
		type GameRouteCommitResult,
		type GameRouteControllerState
	} from './gameRouteController';
	import { isGameRouteCommitted } from '$lib/game/commandResult';
	import {
		beginFinancePurchaseConfirmation,
		createFinancePurchaseReviewState,
		dismissFinancePurchaseReview,
		openFinancePurchaseReview,
		resolveExpansionPurchasePaymentPath,
		refreshedFinancedPurchase,
		settleFinancePurchaseConfirmation,
		type PendingFinancedPurchase,
		shouldRefreshFinancedPurchase
	} from './financePurchaseReview';
	import {
		resolveEscapeTarget,
		selectOverlayGates,
		type OverlayId,
		type OverlaySnapshot
	} from './routeOverlays';
	import { createStoreDetailFocus } from './storeDetailFocus.svelte';
	import FinancePurchaseReviewHost from './FinancePurchaseReviewHost.svelte';
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
	let scenarioEvidenceGame = $state<GameState | null>(null);
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
		onScenarioSummary: (summary) => {
			scenarioSummary = summary;
		},
		onScenarioTerminalRun: (run) => {
			scenarioEvidenceGame = run.game;
		},
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
	let isBuildMenuOpen = $state(false);
	let isSupplyAdvisorOpen = $state(false);
	let supplyPlannerUiContext = $state<SupplyPlannerUiContext>({
		productId: null,
		horizonDays: 30
	});
	let activeManagementPanelId = $state<ManagementPanelId | null>(null);
	let focusedFinanceLoanId = $state<string | null>(null);
	let retailPlacementArchetypeId = $state<ArchetypeId | null>(null);
	let industryPlacementBuildingTypeId = $state<IndustrialBuildingTypeId | null>(null);
	let railBuildMode = $state<RailBuildMode>({ step: 'idle' });
	// Set on each destination-building click while routing, so `railPreview`
	// below can keep showing the last attempted path (including blocked
	// attempts) until the player clicks a different building or cancels.
	// There is no map hover event to drive this continuously.
	let railPreviewTargetBuildingId = $state<string | null>(null);
	let activeLocale = $state<SupportedLocale>(
		readLocalePreference(safeLocalStorage(), collectNavigatorLocaleCandidates())
	);
	let i18n = $derived(createI18n(activeLocale));
	let activeScenarioDefinition = $derived<ScenarioDefinition | null>(
		activeScenarioRun ? (resolveScenarioDefinition(activeScenarioRun.definition) ?? null) : null
	);
	let activeScenarioTitle = $derived(
		activeScenarioDefinition
			? i18n.t(activeScenarioDefinition.titleKey)
			: (activeScenarioRun?.definition.scenarioId ?? '')
	);
	let activeScenarioVersionLabel = $derived(
		activeScenarioRun
			? i18n.t('scenarioStatus.versionEligibility', {
					version: activeScenarioRun.definition.version,
					eligibility: i18n.t(
						activeScenarioRun.eligibility === 'ranked'
							? 'scenarioStatus.ranked'
							: 'scenarioStatus.unranked'
					)
				})
			: ''
	);
	let dismissedScenarioResult = $state<ScenarioResult | null>(null);
	let isScenarioObjectivePanelOpen = $state(false);
	let scenarioProgressView = $derived(
		activeScenarioDefinition && activeScenarioRun
			? buildScenarioProgressView(
					activeScenarioDefinition,
					activeScenarioRun,
					i18n,
					resolveScenarioContributor
				)
			: null
	);
	let lastScenarioDefinition = $derived(
		lastScenarioResult ? (resolveScenarioDefinition(lastScenarioResult.definition) ?? null) : null
	);
	let scenarioResultsView = $derived(
		lastScenarioDefinition && lastScenarioResult
			? buildScenarioResultsView(
					lastScenarioDefinition,
					lastScenarioResult,
					lastScenarioBestUpdated,
					i18n,
					resolveScenarioContributor
				)
			: null
	);
	let isScenarioResultsDialogOpen = $derived(
		scenarioResultsView !== null &&
			lastScenarioResult !== null &&
			lastScenarioResult !== dismissedScenarioResult
	);
	let mutationAvailability = $derived(
		createMutationAvailability({
			playMode,
			pending: scenarioCommandPending,
			definition: activeScenarioDefinition
		})
	);
	let canStartRetailExpansion = $derived(
		mutationAvailability.openStore || mutationAvailability.financeRetailStore
	);
	let canStartIndustryExpansion = $derived(
		mutationAvailability.buildIndustrialBuilding || mutationAvailability.financeIndustrialBuilding
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
	let allowedRetailArchetypeIds = $derived.by<ArchetypeId[]>(() =>
		retailBuildOptions
			.map((option) => option.archetypeId)
			.filter((archetypeId) =>
				isLiveScenarioContentAllowed(playMode, activeScenarioDefinition, {
					kind: 'archetype',
					archetypeId
				})
			)
	);
	let allowedIndustryBuildingTypeIds = $derived.by<IndustrialBuildingTypeId[]>(() =>
		(Object.keys(INDUSTRIAL_BUILDING_TYPES) as IndustrialBuildingTypeId[]).filter(
			(buildingTypeId) => {
				if (playMode === 'sandbox') return true;
				if (!activeScenarioDefinition) return false;
				// buildingTypeIds includes pre-placed starting buildings that may
				// have no permitted future placement entries. Only offer types
				// that have at least one industrial placement slot so the player
				// cannot arm a placement that can never commit.
				return (
					isLiveScenarioContentAllowed(playMode, activeScenarioDefinition, {
						kind: 'building',
						buildingTypeId
					}) &&
					activeScenarioDefinition.content.industrialPlacements.some(
						(placement) => placement.buildingTypeId === buildingTypeId
					)
				);
			}
		)
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
		allowedIndustryBuildingTypeIds,
		allowedIndustrialPlacements
	});
	let placementFeedback = $state<PlacementBlockReason | null>(null);
	let financePurchaseReview = $state(createFinancePurchaseReviewState());
	let financedPurchaseReturnFocus = $state<HTMLElement | null>(null);
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
	let isScenarioCatalogOpen = $state(false);
	let scenarioSummary = $state<ScenarioPersistenceSummary>({
		activeRunsByScenarioId: {},
		bestResultsByDefinitionKey: {},
		diagnostics: []
	});
	let inspectedScenarioRefs = $state<
		Partial<Record<ScenarioRun['definition']['scenarioId'], ScenarioRun['definition']>>
	>({});
	let effectiveScenarioSummary = $derived<ScenarioPersistenceSummary>({
		...scenarioSummary,
		activeRunsByScenarioId: activeScenarioRun
			? {
					...scenarioSummary.activeRunsByScenarioId,
					[activeScenarioRun.definition.scenarioId]: activeScenarioRun
				}
			: scenarioSummary.activeRunsByScenarioId
	});
	let scenarioCatalogCards = $derived(
		buildScenarioCatalogCards(
			listScenarioCatalogEntries(),
			effectiveScenarioSummary,
			i18n,
			inspectedScenarioRefs
		)
	);
	let scenarioOperationErrorText = $derived(
		scenarioOperationError ? scenarioDiagnosticText(scenarioOperationError, i18n) : null
	);
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
			railBuildMode.step !== 'idle',
			() => industryRailSegments
		)
	);
	let isPlacementModeActive = $derived(
		retailPlacementArchetypeId !== null ||
			industryPlacementBuildingTypeId !== null ||
			railBuildMode.step !== 'idle'
	);
	// Read-only projection of existing owners, not a second overlay state authority.
	let overlaySnapshot = $derived.by<OverlaySnapshot>(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt from owners, never mutated after publication.
		const openOverlays = new Set<OverlayId>();
		if (financePurchaseReview.purchase !== null) openOverlays.add('finance-review');
		if (saves.isOpen) openOverlays.add('save-panel');
		if (isScenarioCatalogOpen) openOverlays.add('scenario-catalog');
		if (isScenarioResultsDialogOpen) openOverlays.add('scenario-results');
		if (isCheatSheetOpen) openOverlays.add('cheat-sheet');
		if (isSupplyAdvisorOpen) openOverlays.add('supply-advisor');
		if (storeDetailFocus.isOpen) openOverlays.add('store-detail');
		if (isBuildMenuOpen) openOverlays.add('build-menu');
		if (isGameMenuOpen) openOverlays.add('game-menu');
		if (isAlertsMenuOpen) openOverlays.add('alerts-menu');
		if (activeManagementPanelId !== null) openOverlays.add('management-panel');
		return {
			openOverlays,
			isPlacementActive: isPlacementModeActive,
			isRailBuildActive: railBuildMode.step !== 'idle',
			isFinanceReviewPending: financePurchaseReview.confirmationPending,
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
		selectedTile !== null && (!isPlacementModeActive || placementFeedback !== null)
	);
	let shouldShowIndustryInspector = $derived(
		selectedIndustryTile !== null && (!isPlacementModeActive || placementFeedback !== null)
	);
	let showLogisticsRouteInspector = $derived(
		activeMapView === 'world' && selectedLogisticsRoute !== null
	);
	let retailBuildOptions = $derived(
		getRetailBuildMenuOptions({
			game,
			city: activeCity,
			cashCommandAvailable: mutationAvailability.openStore,
			financeCommandAvailable: mutationAvailability.financeRetailStore,
			seed: starterMapState.seed
		})
	);
	let industrialBuildOptions = $derived(
		getIndustrialBuildMenuOptions({
			game,
			cashCommandAvailable: mutationAvailability.buildIndustrialBuilding,
			financeCommandAvailable: mutationAvailability.financeIndustrialBuilding,
			allowedIndustrialPlacements:
				playMode === 'sandbox' || !activeScenarioDefinition
					? null
					: activeScenarioDefinition.content.industrialPlacements
		})
	);
	// Shortcuts to a Warehouse placement (link alert, inspector notice) use the
	// same availability as the Build menu option, so they never arm a
	// placement with no legal or affordable tile.
	let canStartWarehousePlacement = $derived(
		canStartIndustryExpansion &&
			allowedIndustryBuildingTypeIds.includes('warehouse') &&
			industrialBuildOptions.some(
				(option) => option.buildingTypeId === 'warehouse' && option.disabledReason === null
			)
	);
	let retailPlacementPreview = $derived.by(() => {
		const archetypeId = retailPlacementArchetypeId;
		if (!archetypeId) return null;
		const preview = createRetailPlacementPreview({
			game,
			city: activeCity,
			archetypeId,
			cashCommandAvailable: mutationAvailability.openStore,
			financeCommandAvailable: mutationAvailability.financeRetailStore
		});
		if (playMode === 'sandbox' || !activeScenarioDefinition) return preview;
		if (!isWorldCityId(activeCity.id)) return { ...preview, validTileIds: [] };
		const cityId = activeCity.id;
		return restrictPreviewToScenario(preview, (tileId) =>
			isLiveScenarioContentAllowed(playMode, activeScenarioDefinition, {
				kind: 'retail-placement',
				cityId,
				tileId,
				archetypeId
			})
		);
	});
	let industryPlacementPreview = $derived.by(() => {
		const buildingTypeId = industryPlacementBuildingTypeId;
		if (!buildingTypeId) return null;
		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId,
			financeCommandAvailable: mutationAvailability.financeIndustrialBuilding
		});
		if (playMode === 'sandbox' || !activeScenarioDefinition) return preview;
		if (!isWorldCityId(industryCity.id)) return { ...preview, validTileIds: [] };
		const cityId = industryCity.id;
		return restrictPreviewToScenario(preview, (tileId) =>
			isLiveScenarioContentAllowed(playMode, activeScenarioDefinition, {
				kind: 'industrial-placement',
				cityId,
				tileId,
				buildingTypeId
			})
		);
	});
	let industryLockedReason = $derived<PlacementBlockReason | null>(
		game ? null : { code: 'industry.lockedUntilRetail' }
	);
	// Full preview (path, new/reused cells, cost, block reason) for the last
	// destination-building attempt while routing. There is no continuous map
	// hover event, so this only updates on a destination click — including a
	// blocked one, so the toast and the highlighted path stay in sync.
	let railBuildPreview = $derived.by(() => {
		const currentGame: GameState | null = game;
		if (railBuildMode.step !== 'routing' || !currentGame || !railPreviewTargetBuildingId) {
			return null;
		}
		return buildRailPreview(currentGame, {
			originBuildingId: railBuildMode.originBuildingId,
			waypoints: railBuildMode.waypoints,
			destinationBuildingId: railPreviewTargetBuildingId
		});
	});
	let railPreview = $derived(deriveRailPreviewRender(game, railBuildMode, railBuildPreview));
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
	let availableMaterialIds = $derived<MaterialId[]>(
		isBuildMenuOpen && activeMapView === 'industry'
			? getAvailableMaterialIds(game ?? starterMapState)
			: []
	);
	const retailMapActivity = $derived({
		seq: mapActivity.seq,
		activities: mapActivity.activities.filter((activity) => activity.kind !== 'production')
	});
	const industryMapActivity = $derived({
		seq: mapActivity.seq,
		activities: mapActivity.activities.filter((activity) => activity.kind === 'production')
	});
	let mapSnapshot = $derived(
		createCityMapSnapshot(game ?? starterMapState, selectedTileId, retailPlacementPreview)
	);
	let industryMapSnapshot = $derived(
		createIndustryMapSnapshot(
			game ?? starterMapState,
			selectedIndustryTileId,
			industryPlacementPreview,
			railPreview
		)
	);

	function formatPlacementFeedback(reason: PlacementBlockReason | null): string | null {
		return formatPlacementBlockReason(reason, i18n);
	}

	function financeFailureMessage(code: FinanceFailureCode): string {
		return i18n.t(`financePanel.failures.${code}` as never);
	}

	function clearPendingFinancedPurchase(): void {
		financePurchaseReview = dismissFinancePurchaseReview(financePurchaseReview);
		financedPurchaseReturnFocus = null;
	}

	function openFinancedPurchaseReview(purchase: PendingFinancedPurchase): void {
		financedPurchaseReturnFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		financePurchaseReview = openFinancePurchaseReview(financePurchaseReview, purchase);
	}

	// Text for the placement-status plaque while rail-building: a block
	// reason (if any) always wins, then a ready-to-confirm cost summary once
	// a valid destination attempt exists, then step-specific instructions.
	// The block reason can come from either an explicit destination-click
	// rejection (placementFeedback) or the derived preview recomputing
	// against a freshly pushed waypoint that makes the route unreachable —
	// handleRailBuildTileClick clears placementFeedback when a waypoint is
	// added, so without surfacing preview.blockReason the plaque would
	// silently fall back to "pick destination" and hide the real blocker.
	function railBuildStatusText(): string {
		const blocked = formatPlacementFeedback(placementFeedback);
		if (blocked) {
			return blocked;
		}

		const preview = railBuildPreview;
		if (preview?.blockReason) {
			return (
				formatPlacementBlockReason(
					{ code: 'industry.rawPlacementBlocked', context: preview.blockReason },
					i18n
				) ?? i18n.t('railBuild.pickDestination')
			);
		}

		if (preview) {
			return i18n.t('railBuild.confirm', {
				cells: i18n.format.integer(preview.newCellKeys.length),
				cost: i18n.format.currency(preview.cost)
			});
		}

		return railBuildMode.step === 'origin'
			? i18n.t('railBuild.pickOrigin')
			: i18n.t('railBuild.pickDestination');
	}

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
		cancelPlacement();
		focusedLogisticsRouteId = null;
		selectedLogisticsRouteId = routeId;
	}

	function selectTile(tileId: string) {
		clearLogisticsRouteSelection();
		if (retailPlacementArchetypeId) {
			// Placement previews only mark valid 2x2 anchors. If the user clicks a
			// non-anchor cell that sits inside a valid footprint, resolve to that
			// footprint's anchor so the click places the store instead of being
			// rejected as an invalid anchor.
			const anchorTileId = retailPlacementPreview
				? resolveRetailPlacementAnchorTileId(retailPlacementPreview, activeCity, tileId)
				: tileId;
			placeRetailAtTile(retailPlacementArchetypeId, anchorTileId);
			return;
		}

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
		if (railBuildMode.step !== 'idle') {
			handleRailBuildTileClick(tileId);
			return;
		}

		if (industryPlacementBuildingTypeId) {
			const anchorTileId = industryPlacementPreview
				? resolveIndustryPlacementAnchorTileId(industryPlacementPreview, industryCity, tileId)
				: tileId;
			placeIndustryAtTile(industryPlacementBuildingTypeId, anchorTileId);
			return;
		}

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

	function handleRailBuildTileClick(tileId: string): void {
		const result = reduceRailBuildClick(
			{
				game,
				city: industryCity,
				mode: railBuildMode,
				targetBuildingId: railPreviewTargetBuildingId
			},
			tileId
		);
		if (!result) return;
		if (result.commit) void gameRouteController.buildRail(result.commit);
		railBuildMode = result.mode;
		railPreviewTargetBuildingId = result.targetBuildingId;
		placementFeedback = result.feedback;
		if (result.sfx) playSfx(result.sfx);
	}

	// Canvas owns Escape/right-click; the page must not cancel the same event again.
	function handleRailBuildCancelled(): void {
		const result = cancelRailBuildStep(railBuildMode);
		if (!result) return;
		railBuildMode = result.mode;
		railPreviewTargetBuildingId = result.targetBuildingId;
		placementFeedback = result.feedback;
	}

	function toggleRailBuildMode(): void {
		if (railBuildMode.step !== 'idle') {
			railBuildMode = { step: 'idle' };
			railPreviewTargetBuildingId = null;
			placementFeedback = null;
			return;
		}

		if (!game || activeMapView !== 'industry' || !mutationAvailability.buildRail) {
			return;
		}

		isBuildMenuOpen = false;
		retailPlacementArchetypeId = null;
		industryPlacementBuildingTypeId = null;
		placementFeedback = null;
		railBuildMode = { step: 'origin' };
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

	function openScenarioCatalog(): void {
		isGameMenuOpen = false;
		saves.close();
		activeManagementPanelId = null;
		isScenarioCatalogOpen = true;
	}

	function resolveScenarioContributor(id: string): string {
		return resolveScenarioContributorLabel(
			activeScenarioRun?.game ?? scenarioEvidenceGame ?? game,
			id,
			i18n
		);
	}

	function handleScenarioCardResult(result: GameRouteCommitResult): void {
		if (result.status === 'committed') {
			isScenarioCatalogOpen = false;
		} else if (result.status === 'unavailable' && !scenarioOperationError) {
			scenarioOperationError = { code: 'persistence-read-failed', diagnostics: [] };
		}
	}

	async function startScenarioCard(
		card: ScenarioCatalogCardViewModel,
		confirmed: boolean,
		expectedRunId?: string | null,
		expectedRevision?: number | null
	): Promise<ScenarioCatalogActionResult> {
		const definition = currentScenarioDefinition(card.id);
		if (!definition) {
			return {
				status: 'error',
				message: i18n.t('scenarioDiagnostics.staleDefinition')
			};
		}
		const result = await gameRouteController.startScenarioRun(
			definition,
			definition.officialSeed,
			confirmed,
			expectedRunId,
			expectedRevision
		);
		const action = toCatalogActionResult(
			result,
			'scenarioCatalog.startReplacementConfirmation',
			scenarioOperationError,
			i18n
		);
		if (action.status === 'started') isScenarioCatalogOpen = false;
		return action;
	}

	async function startCurrentVersionCard(
		card: ScenarioCatalogCardViewModel,
		confirmed: boolean,
		expectedRunId?: string | null,
		expectedRevision?: number | null
	): Promise<ScenarioCatalogActionResult> {
		const definition = currentScenarioDefinition(card.id);
		if (!definition) {
			return {
				status: 'error',
				message: i18n.t('scenarioDiagnostics.staleDefinition')
			};
		}
		const result = await gameRouteController.startScenarioRun(
			definition,
			definition.officialSeed,
			confirmed,
			expectedRunId,
			expectedRevision
		);
		const action = toCatalogActionResult(
			result,
			'scenarioCatalog.olderVersionConfirmation',
			scenarioOperationError,
			i18n
		);
		if (action.status === 'started') isScenarioCatalogOpen = false;
		return action;
	}

	async function resumeScenarioCard(card: ScenarioCatalogCardViewModel): Promise<void> {
		const result = await gameRouteController.resumeScenarioRun(card.id);
		handleScenarioCardResult(result);
	}

	async function restartScenarioCard(card: ScenarioCatalogCardViewModel): Promise<void> {
		if (!card.activeDefinitionRef) return;
		const result = await gameRouteController.restartScenarioRun(card.activeDefinitionRef);
		handleScenarioCardResult(result);
	}

	async function restartActiveScenario(): Promise<void> {
		if (!activeScenarioRun) return;
		const result = await gameRouteController.restartScenarioRun(activeScenarioRun.definition);
		if (result.status === 'committed') isScenarioCatalogOpen = false;
	}

	async function restartResultScenario(): Promise<void> {
		if (!lastScenarioResult || !lastScenarioDefinition) return;
		const result = await gameRouteController.startScenarioRun(
			lastScenarioDefinition,
			lastScenarioResult.seed
		);
		if (result.status === 'committed') dismissedScenarioResult = lastScenarioResult;
	}

	function closeScenarioResults(): void {
		dismissedScenarioResult = lastScenarioResult;
		// After terminal publication `activeScenarioRun` is null and `playMode`
		// is still `scenario`, so `game` is null and the menu no longer offers
		// Return to sandbox — `foundStore` is also rejected by the scenario-mode
		// gate. Flip back to sandbox so the player can continue sandbox play.
		gameRouteController.returnToSandbox();
		// An open control-tower panel would fall back to the starter state under
		// the sandbox game; clear it to avoid rendering a stale panel.
		activeManagementPanelId = null;
	}

	function openCatalogFromResults(): void {
		closeScenarioResults();
		openScenarioCatalog();
	}

	function returnToSandboxFromResults(): void {
		closeScenarioResults();
		gameRouteController.returnToSandbox();
	}

	async function importScenarioCode(
		code: string,
		confirmed: boolean,
		expectedRunId?: string | null,
		expectedRevision?: number | null
	): Promise<ScenarioCatalogActionResult> {
		const decoded = decodeScenarioShareCode(code, resolveScenarioDefinition);
		if (!decoded.ok)
			return { status: 'error', message: scenarioShareCodeErrorText(decoded.code, i18n) };
		inspectedScenarioRefs = {
			...inspectedScenarioRefs,
			[decoded.value.definition.scenarioId]: decoded.value.definition
		};
		const definition = resolveScenarioDefinition(decoded.value.definition);
		if (!definition) {
			return {
				status: 'error',
				message: scenarioShareCodeErrorText('unsupported-version', i18n)
			};
		}
		const result = await gameRouteController.importScenarioRun(
			definition,
			decoded.value.seed,
			confirmed,
			expectedRunId,
			expectedRevision
		);
		const action = toCatalogActionResult(
			result,
			'scenarioCatalog.importReplacementConfirmation',
			scenarioOperationError,
			i18n
		);
		if (action.status === 'started') isScenarioCatalogOpen = false;
		return action;
	}

	async function copyScenarioCode(code: string): Promise<boolean> {
		try {
			await globalThis.navigator.clipboard.writeText(code);
			return true;
		} catch {
			return false;
		}
	}

	async function abandonActiveScenario(): Promise<void> {
		// The controller refreshes the scenario summary after abandon (including
		// the conflict case where a newer replacement run survives in storage),
		// so the catalog stays in sync via onScenarioSummary. Do not manually
		// delete the entry here — that would hide a replacement run that the
		// controller intentionally preserved.
		await gameRouteController.abandonScenarioRun();
	}

	function openBuildMenu(): void {
		if (
			activeMapView === 'world' ||
			(activeMapView === 'retail' ? !canStartRetailExpansion : !canStartIndustryExpansion)
		) {
			return;
		}

		isGameMenuOpen = false;
		saves.close();
		activeManagementPanelId = null;
		isBuildMenuOpen = true;
		playSfx('sfx.ui.panel-open');
	}

	function closeBuildMenu(): void {
		isBuildMenuOpen = false;
		playSfx('sfx.ui.panel-close');
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
		if (view === 'world') isBuildMenuOpen = false;
		cancelPlacement();
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
		cancelPlacement();
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
		if (purchase) openFinancedPurchaseReview(purchase);
	}

	function closeWorldInspector(): void {
		selectedWorldCityId = null;
	}

	function openManagementPanel(panelId: ManagementPanelId): void {
		isGameMenuOpen = false;
		saves.close();
		isBuildMenuOpen = false;
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
		isBuildMenuOpen = false;
		isSupplyAdvisorOpen = false;
		// Pause the auto-tick whenever the active play mode or scenario run
		// changes (start/restart/import a challenge, return to sandbox, etc.)
		// so the player can review the new state before time resumes.
		simulationPaused = true;
		isGameMenuOpen = false;
		isAlertsMenuOpen = false;
		activeManagementPanelId = null;
		focusedFinanceLoanId = null;
		cancelPlacement();
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
			scenarioEvidenceGame = null;
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
		cancelPlacement();
		// Only a successful load re-arms the sandbox opening and cash guidance.
		sandboxOpeningGuidanceDismissed = false;
		cashRecoveryDismissed = false;
		// Pause the auto-tick so the player can review the loaded state
		// before time resumes.
		simulationPaused = true;
	}

	function armRetailPlacement(archetypeId: ArchetypeId): void {
		if (!canStartRetailExpansion || !allowedRetailArchetypeIds.includes(archetypeId)) return;
		retailPlacementArchetypeId = archetypeId;
		industryPlacementBuildingTypeId = null;
		railBuildMode = { step: 'idle' };
		railPreviewTargetBuildingId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		placementFeedback = null;
		isBuildMenuOpen = false;
		playSfx('sfx.build.arm');
	}

	function armIndustryPlacement(buildingTypeId: IndustrialBuildingTypeId): void {
		if (!canStartIndustryExpansion || !allowedIndustryBuildingTypeIds.includes(buildingTypeId))
			return;
		industryPlacementBuildingTypeId = buildingTypeId;
		retailPlacementArchetypeId = null;
		railBuildMode = { step: 'idle' };
		railPreviewTargetBuildingId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		placementFeedback = null;
		isBuildMenuOpen = false;
		playSfx('sfx.build.arm');
	}

	function clearPlacementMode(): void {
		retailPlacementArchetypeId = null;
		industryPlacementBuildingTypeId = null;
		railBuildMode = { step: 'idle' };
		railPreviewTargetBuildingId = null;
		placementFeedback = null;
	}

	function cancelPlacement(): void {
		clearPlacementMode();
		clearPendingFinancedPurchase();
	}

	function openSupplyAdvisor(productId?: ProductId): void {
		if (productId && plannerProductIds.includes(productId)) {
			supplyPlannerUiContext = {
				...supplyPlannerUiContext,
				productId
			};
		}
		isBuildMenuOpen = false;
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
		isBuildMenuOpen = false;
		isGameMenuOpen = false;
		storeDetailFocus.close();
		isCheatSheetOpen = false;
		isAlertsMenuOpen = false;
		saves.close();
		isScenarioCatalogOpen = false;
		activeManagementPanelId = null;
		focusedLogisticsRouteId = null;
		logisticsRoutePreset = null;
		focusedRetailSupplyCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		cancelPlacement();
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
			armIndustryPlacement,
			selectIndustryTile,
			openLogistics: openLogisticsManagement,
			openStores: openStoresManagement,
			enterRailBuildMode: (mode) => {
				isSupplyAdvisorOpen = false;
				isBuildMenuOpen = false;
				retailPlacementArchetypeId = null;
				industryPlacementBuildingTypeId = null;
				railBuildMode = mode;
				railPreviewTargetBuildingId = null;
				placementFeedback = null;
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

	function placeRetailAtTile(archetypeId: ArchetypeId, tileId: string): void {
		if (!canStartRetailExpansion || !allowedRetailArchetypeIds.includes(archetypeId)) return;
		// Don't early-return on tiles outside the preview's validTileIds: let
		// the block-reason helper run so a click on a road/river/occupied tile
		// surfaces the specific reason instead of a silent no-op.
		const blockReason = getRetailPlacementBlockReason({
			game,
			city: activeCity,
			tileId,
			archetypeId,
			cashCommandAvailable: mutationAvailability.openStore,
			financeCommandAvailable: mutationAvailability.financeRetailStore
		});

		if (blockReason) {
			selectedTileId = tileId;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			placementFeedback = blockReason;
			playSfx('sfx.build.invalid');
			return;
		}

		if (!game) {
			if (!mutationAvailability.openStore) return;
			const tile = getTileById(activeCity, tileId);

			if (!tile) {
				placementFeedback = { code: 'retail.unknownCityTile' };
				playSfx('sfx.build.invalid');
				return;
			}

			// Pause the auto-tick so the player can review their newly founded
			// store before time starts flowing.
			simulationPaused = true;
			void gameRouteController.foundStore({
				archetypeId,
				city: activeCity,
				tileId: tile.id,
				seed: starterMapState.seed
			});
		} else {
			const tile = getTileById(activeCity, tileId);
			if (!tile) {
				placementFeedback = { code: 'retail.unknownCityTile' };
				playSfx('sfx.build.invalid');
				return;
			}
			const expectedCost = getExpansionSetupCost(tile, archetypeId);
			const paymentPath = resolveExpansionPurchasePaymentPath({
				cashCommandAvailable: mutationAvailability.openStore,
				financeCommandAvailable: mutationAvailability.financeRetailStore,
				cash: game.cash,
				expectedCost
			});
			if (paymentPath === 'finance') {
				const offer = getExpansionFinanceOffer(game, expectedCost);
				if (!offer) {
					placementFeedback = { code: 'retail.requiresCash', amount: expectedCost };
					playSfx('sfx.build.invalid');
					return;
				}
				openFinancedPurchaseReview({ kind: 'retail', tileId, archetypeId, expectedCost, offer });
				clearPlacementMode();
				selectedTileId = tileId;
				selectedIndustryTileId = null;
				selectedWorldCityId = null;
				return;
			}
			if (paymentPath === 'requiresCash') {
				placementFeedback = { code: 'retail.requiresCash', amount: expectedCost };
				playSfx('sfx.build.invalid');
				return;
			}
			void gameRouteController.openStore(tileId, archetypeId);
		}

		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		cancelPlacement();
	}

	function placeIndustryAtTile(buildingTypeId: IndustrialBuildingTypeId, tileId: string): void {
		if (!canStartIndustryExpansion || !allowedIndustryBuildingTypeIds.includes(buildingTypeId))
			return;
		// Don't early-return on tiles outside the preview's validTileIds: let
		// the block-reason helper run so a click on a wrong-resource/occupied
		// tile surfaces the specific reason instead of a silent no-op.
		const blockReason = getIndustryBuildPlacementBlockReason({
			game,
			tileId,
			buildingTypeId,
			financeCommandAvailable: mutationAvailability.financeIndustrialBuilding
		});

		if (blockReason) {
			selectedIndustryTileId = tileId;
			selectedTileId = null;
			selectedWorldCityId = null;
			placementFeedback = blockReason;
			playSfx('sfx.build.invalid');
			return;
		}

		if (!game) {
			placementFeedback = { code: 'industry.lockedUntilRetail' };
			playSfx('sfx.build.invalid');
			return;
		}

		const expectedCost = INDUSTRIAL_BUILDING_TYPES[buildingTypeId]?.buildCost;
		if (expectedCost === undefined) {
			placementFeedback = { code: 'industry.unknownBuildingType' };
			playSfx('sfx.build.invalid');
			return;
		}
		const paymentPath = resolveExpansionPurchasePaymentPath({
			cashCommandAvailable: mutationAvailability.buildIndustrialBuilding,
			financeCommandAvailable: mutationAvailability.financeIndustrialBuilding,
			cash: game.cash,
			expectedCost
		});
		if (paymentPath === 'finance') {
			const offer = getExpansionFinanceOffer(game, expectedCost);
			if (!offer) {
				placementFeedback = { code: 'industry.requiresCash', buildingTypeId, amount: expectedCost };
				playSfx('sfx.build.invalid');
				return;
			}
			openFinancedPurchaseReview({ kind: 'industry', tileId, buildingTypeId, expectedCost, offer });
			clearPlacementMode();
			selectedIndustryTileId = tileId;
			selectedTileId = null;
			selectedWorldCityId = null;
			return;
		}
		if (paymentPath === 'requiresCash') {
			placementFeedback = { code: 'industry.requiresCash', buildingTypeId, amount: expectedCost };
			playSfx('sfx.build.invalid');
			return;
		}

		void gameRouteController.buildIndustrialBuilding(tileId, buildingTypeId);
		selectedIndustryTileId = null;
		selectedTileId = null;
		selectedWorldCityId = null;
		cancelPlacement();
	}

	async function confirmFinancedPurchase(): Promise<void> {
		if (!game) return;
		const gameSnapshot = game;
		const started = beginFinancePurchaseConfirmation(financePurchaseReview);
		if (!started) return;
		financePurchaseReview = started.state;
		const { request } = started;

		let result: GameRouteCommitResult;
		if (request.command.kind === 'world') {
			result = await gameRouteController.financeWorldCity(...request.command.args);
		} else if (request.command.kind === 'retail') {
			result = await gameRouteController.financeRetailStore(...request.command.args);
		} else {
			result = await gameRouteController.financeIndustrialBuilding(...request.command.args);
		}

		if (isGameRouteCommitted(result)) {
			if (financePurchaseReview.generation !== request.generation) return;
			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			clearPlacementMode();
			financePurchaseReview = settleFinancePurchaseConfirmation(financePurchaseReview, request, {
				kind: 'committed'
			});
			return;
		}

		const feedback =
			result.status === 'domain-rejected'
				? financeFailureMessage(result.code)
				: i18n.t('financePanel.ui.failed');
		financePurchaseReview = settleFinancePurchaseConfirmation(financePurchaseReview, request, {
			kind: 'rejected',
			feedback,
			refreshedPurchase: shouldRefreshFinancedPurchase(result)
				? refreshedFinancedPurchase(request.purchase, game ?? gameSnapshot)
				: undefined
		});
	}

	function finishFinancedPurchaseReviewDismissal(): void {
		clearPlacementMode();
		const returnFocus = financedPurchaseReturnFocus;
		financedPurchaseReturnFocus = null;
		if (returnFocus) {
			void tick().then(() => returnFocus.focus());
		}
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
		if (destination.fix === 'warehouse' && startWarehousePlacement()) return;
		if (
			destination.fix === 'rail' &&
			destination.buildingId &&
			startRailFromBuilding(destination.buildingId)
		)
			return;
		selectedIndustryTileId = destination.tileId;
	}

	function startWarehousePlacement(): boolean {
		if (!canStartWarehousePlacement) return false;
		armIndustryPlacement('warehouse');
		return true;
	}

	function startRailFromBuilding(buildingId: string): boolean {
		if (!game || !mutationAvailability.buildRail) return false;
		if (!game.industrialBuildings.some((building) => building.id === buildingId)) return false;
		isBuildMenuOpen = false;
		isSupplyAdvisorOpen = false;
		retailPlacementArchetypeId = null;
		industryPlacementBuildingTypeId = null;
		selectedIndustryTileId = null;
		placementFeedback = null;
		railPreviewTargetBuildingId = null;
		railBuildMode = { step: 'routing', originBuildingId: buildingId, waypoints: [] };
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
							isBuildMenuOpen = false;
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
					cancelPlacement();
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
			isMenuOpen: isBuildMenuOpen || activeManagementPanelId !== null,
			activeMapView,
			hasGame: game !== null
		});

		if (!action) {
			return;
		}

		event.preventDefault();

		if (action.type === 'toggle-build') {
			if (isBuildMenuOpen) {
				closeBuildMenu();
			} else {
				openBuildMenu();
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
				onCancelRailBuild={handleRailBuildCancelled}
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
				{#if playMode === 'scenario' && activeScenarioRun}
					<ScenarioMenuSection
						{i18n}
						title={activeScenarioTitle}
						versionLabel={activeScenarioVersionLabel}
						pending={scenarioCommandPending}
						onDetails={openScenarioCatalog}
						onRestart={restartActiveScenario}
						onCatalog={openScenarioCatalog}
						onSandbox={() => gameRouteController.returnToSandbox()}
						onAbandon={abandonActiveScenario}
					/>
				{:else}
					<button type="button" onclick={openScenarioCatalog}>
						{i18n.t('scenarioCatalog.catalog')}
					</button>
					<button type="button" onclick={saves.open}>{i18n.t('gameMenu.saves')}</button>
				{/if}
				<AudioSettings {i18n} preferences={audioPreferences} onChange={updateAudioPreferences} />
			{/snippet}
		</TopBar>

		{#if playMode === 'scenario' && activeScenarioRun && scenarioProgressView}
			<div class="scenario-progress">
				<ScenarioStatusStrip
					view={scenarioProgressView}
					{i18n}
					expanded={isScenarioObjectivePanelOpen}
					pending={scenarioCommandPending}
					error={scenarioOperationErrorText}
					onToggle={() => (isScenarioObjectivePanelOpen = !isScenarioObjectivePanelOpen)}
					onRetry={() => retryScenarioOperation?.()}
					onDismissError={() => gameRouteController.dismissScenarioOperationError()}
				/>
				{#if isScenarioObjectivePanelOpen}
					<ScenarioObjectivePanel view={scenarioProgressView} {i18n} />
				{/if}
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
				(activeMapView === 'retail' ? !canStartRetailExpansion : !canStartIndustryExpansion)}
			advanceDisabled={game === null || !mutationAvailability.advanceDay}
			pauseDisabled={game === null}
			railBuildDisabled={!mutationAvailability.buildRail}
			disabledReason={game === null ? i18n.t('controlDesk.timeLockedHint') : mutationDisabledReason}
			{i18n}
			onBuild={openBuildMenu}
			onOpenManagement={(id) =>
				id === 'logistics' ? openLogisticsManagement() : openManagementPanel(id)}
			paused={simulationPaused}
			{simulationSpeed}
			onTogglePause={toggleSimulationPause}
			onSelectSpeed={setSimulationSpeed}
			onOpenShortcuts={() => (isCheatSheetOpen = true)}
			showRailBuild={activeMapView === 'industry' && game !== null}
			railBuildActive={railBuildMode.step !== 'idle'}
			onToggleRailBuild={toggleRailBuildMode}
		/>
		{#if isPlacementModeActive}
			<div
				class="placement-status plaque z-[26]"
				role="status"
				aria-label={i18n.t('route.placement.status')}
			>
				<span
					>{railBuildMode.step !== 'idle'
						? railBuildStatusText()
						: (formatPlacementFeedback(placementFeedback) ??
							(industryPlacementPreview?.requiredResource
								? i18n.t('placement.chooseResourceTile', {
										resource: i18n.labels.industryResource(
											industryPlacementPreview.requiredResource
										)
									})
								: i18n.t('placement.chooseHighlightedTile')))}</span
				>
				<button type="button" class="btn-danger" onclick={cancelPlacement}>
					{i18n.t('route.placement.cancel')}
				</button>
			</div>
		{/if}
		<FinancePurchaseReviewHost
			bind:review={financePurchaseReview}
			cash={game?.cash ?? 0}
			{i18n}
			formatApr={i18n.format.apr}
			onConfirm={confirmFinancedPurchase}
			onDismiss={finishFinancedPurchaseReviewDismissal}
		/>
		{#if isBuildMenuOpen && activeMapView !== 'world'}
			<BuildMenu
				activeMapView={activeMapView === 'industry' ? 'industry' : 'retail'}
				{i18n}
				retailOptions={retailBuildOptions}
				industryOptions={industrialBuildOptions}
				{industryLockedReason}
				{availableMaterialIds}
				canOpenStore={mutationAvailability.openStore}
				canFinanceRetailStore={mutationAvailability.financeRetailStore}
				canBuildIndustrialBuilding={mutationAvailability.buildIndustrialBuilding}
				canFinanceIndustrialBuilding={mutationAvailability.financeIndustrialBuilding}
				{allowedRetailArchetypeIds}
				{allowedIndustryBuildingTypeIds}
				disabledReason={mutationDisabledReason}
				onChooseRetail={armRetailPlacement}
				onChooseIndustry={armIndustryPlacement}
				onOpenAdvisor={openSupplyAdvisor}
				onClose={closeBuildMenu}
			/>
		{/if}
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
			onBuildIndustryWarehouse={canStartWarehousePlacement
				? () => void startWarehousePlacement()
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

	{#if isScenarioCatalogOpen}
		<ScenarioCatalog
			cards={scenarioCatalogCards}
			{i18n}
			operationError={scenarioOperationErrorText}
			pending={scenarioCommandPending}
			persistenceReady={scenariosReady}
			onStart={startScenarioCard}
			onResume={resumeScenarioCard}
			onRestart={restartScenarioCard}
			onStartCurrent={startCurrentVersionCard}
			onImport={importScenarioCode}
			onCopy={copyScenarioCode}
			onRetry={() => retryScenarioOperation?.()}
			onClose={() => (isScenarioCatalogOpen = false)}
		/>
	{/if}

	{#if isScenarioResultsDialogOpen && scenarioResultsView}
		<ScenarioResultsDialog
			view={scenarioResultsView}
			{i18n}
			pending={scenarioCommandPending}
			error={scenarioOperationErrorText}
			onRestart={restartResultScenario}
			onCatalog={openCatalogFromResults}
			onSandbox={returnToSandboxFromResults}
			onRetry={() => retryScenarioOperation?.()}
			onDismissError={() => gameRouteController.dismissScenarioOperationError()}
			onClose={closeScenarioResults}
		/>
	{/if}

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

	.placement-status {
		position: absolute;
		left: 6rem;
		bottom: 4.5rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.65rem 0.8rem;
	}

	/* While the guidance card owns the bottom strip, the plaque takes the
	   non-overlapping slot directly above the measured card — the default
	   4.5rem bottom edge sits inside the card's band, so the opaque plaque
	   would otherwise paint over the card's reason text. */
	.map-layout.opening-guidance-visible .placement-status {
		bottom: calc(5.75rem + var(--og-card-h, 0px) + 0.5rem);
	}

	.placement-status span {
		min-width: 0;
		color: var(--ink-700);
		font-family: var(--font-body);
		font-size: 0.9rem;
		font-style: italic;
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
	@media (max-width: 600px) {
		.placement-status {
			left: 0.5rem;
			bottom: 8.6rem;
		}

		/* Mobile mirror of the desktop slot: the card holds 8.6rem off the
		   bottom, so the plaque clears the measured card top instead of
		   landing on its bottom edge. */
		.map-layout.opening-guidance-visible .placement-status {
			bottom: calc(8.6rem + var(--og-card-h, 0px) + 0.5rem);
		}
	}
</style>
