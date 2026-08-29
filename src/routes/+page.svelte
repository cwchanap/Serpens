<script lang="ts">
	import { onMount, tick } from 'svelte';
	import BuildMenu from '$lib/components/game/BuildMenu.svelte';
	import AudioSettings from '$lib/components/game/AudioSettings.svelte';
	import ControlDesk from '$lib/components/game/ControlDesk.svelte';
	import SavePanel from '$lib/components/game/SavePanel.svelte';
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
	import { resolveAlertNavigation } from './alertNavigation';
	import { createInitialEventRuntime } from '$lib/game/eventSelection';
	import {
		MANAGEMENT_PANEL_SHORTCUT_KEY,
		resolveShortcutAction,
		type ManagementPanelId
	} from '$lib/game/keyboardShortcuts';
	import {
		DEFAULT_RETAIL_CITY_HEIGHT,
		DEFAULT_RETAIL_CITY_WIDTH,
		generateCity,
		getTileById
	} from '$lib/game/city';
	import {
		DEFAULT_INDUSTRY_CITY_HEIGHT,
		DEFAULT_INDUSTRY_CITY_WIDTH,
		INDUSTRIAL_BUILDING_TYPES,
		generateIndustryCity,
		getIndustryTileById
	} from '$lib/game/industry';
	import {
		createIndustryMapSnapshot,
		type IndustryMapRailPreviewRender
	} from '$lib/game/industryMapRender';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import {
		buildRailNetwork,
		deriveRailSegments,
		getSegmentsForCell,
		parseRailCellKey,
		type RailSegment
	} from '$lib/game/rail';
	import {
		buildRailPreview,
		buildRailWaypointPreview,
		isRailWaypointTarget
	} from '$lib/game/railPlacement';
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
	import {
		buildScenarioProgressView,
		buildScenarioResultsView,
		buildScenarioCatalogCards,
		scenarioDiagnosticText,
		scenarioShareCodeErrorText,
		type ScenarioCatalogActionResult,
		type ScenarioCatalogCardViewModel
	} from '$lib/i18n/scenarioCopy';
	import {
		createI18n,
		readLocalePreference,
		saveLocalePreference,
		type StorageLike,
		type TranslationKey
	} from '$lib/i18n/index';
	import type { SupportedLocale } from '$lib/i18n/locales';
	import { summarizeReports } from '$lib/game/reports';
	import {
		createEmptyFinanceState,
		getExpansionFinanceOffer,
		type FinanceFailureCode
	} from '$lib/game/finance';
	import { forecastOpening } from '$lib/game/placement';
	import type {
		ManualTransferInput,
		RecurringRouteInput,
		RecurringRouteUpdateInput
	} from '$lib/game/interCityLogistics';
	import {
		selectRouteOperations,
		type RouteOperationalSummary
	} from '$lib/game/logisticsReadModels';
	import { getFinanceMetrics } from '$lib/game/financeMetrics';
	import { DEFAULT_POLICY } from '$lib/game/state';
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
		buildSupplyPlan,
		encodeIndustrialPlacementKey,
		type SupplyPlannerAction,
		type SupplyPlannerActionAvailability
	} from '$lib/game/supplyPlannerActions';
	import { isTileInStoreFootprint } from '$lib/game/storeFootprint';
	import { isTileInIndustryBuildingFootprint } from '$lib/game/industryFootprint';
	import { buildRetailCitySupplyViews } from '$lib/components/game/retailSupplySources';
	import { buildLogisticsPanelView } from '$lib/components/game/logisticsPanel';
	import {
		STARTER_STORE_CAP,
		WORLD_CITY_CATALOG,
		createInitialWorldProgress,
		getWorldCityStatus,
		isWorldCityId
	} from '$lib/game/world';
	import {
		decisionContextRailNoValidPath,
		decisionContextWorldCityNotAvailableYet
	} from '$lib/game/decisionContext';
	import type {
		ArchetypeId,
		BrandId,
		CompanyPolicy,
		GameState,
		IndustrialBuildingTypeId,
		LoanTermDays,
		ManagerDelegation,
		MaterialId,
		PolicyOverrideScope,
		ProductId,
		StoreProductPatch,
		WorldCityId
	} from '$lib/game/types';
	import type { WorldCityStatus } from '$lib/game/world';
	import type { SaveRepository } from '$lib/persistence/saveRepository';
	import { SaveDataError } from '$lib/persistence/saveCodec';
	import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';
	import { createScenarioRepository } from '$lib/persistence/scenarioRepositoryFactory';
	import {
		currentScenarioDefinition,
		listScenarioCatalogEntries,
		resolveScenarioDefinition
	} from '$lib/scenarios/catalog';
	import { isScenarioContentAllowed } from '$lib/scenarios/capabilities';
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
	import {
		beginFinancePurchaseConfirmation,
		createFinancePurchaseReviewState,
		dismissFinancePurchaseReview,
		isFinanceReviewEscapeOwned,
		openFinancePurchaseReview,
		resolveExpansionPurchasePaymentPath,
		settleFinancePurchaseConfirmation,
		type PendingFinancedPurchase,
		shouldRefreshFinancedPurchase
	} from './financePurchaseReview';
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
	type SaveFeedbackKind = 'status' | 'error';

	const SIMULATION_DAY_MS = 5_000;

	interface SaveFeedback {
		kind: SaveFeedbackKind;
		messageKey: TranslationKey;
		params?: Record<string, string | number>;
	}

	// Rail build click routing on the industry map: `origin` waits for the
	// first building click, `routing` accumulates waypoint clicks until a
	// second building click resolves the destination (or the player cancels).
	type RailBuildMode =
		| { step: 'idle' }
		| { step: 'origin' }
		| { step: 'routing'; originBuildingId: string; waypoints: Array<{ x: number; y: number }> };

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

	const starterCity = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed: 20260503
	});
	const starterIndustryCity = generateIndustryCity({
		id: 'industry-city',
		name: 'Industry City',
		width: DEFAULT_INDUSTRY_CITY_WIDTH,
		height: DEFAULT_INDUSTRY_CITY_HEIGHT,
		seed: 20260512
	});

	const starterMapState: GameState = {
		seed: 20260503,
		rngState: 0,
		day: 1,
		cash: 0,
		finance: createEmptyFinanceState(1),
		policy: { ...DEFAULT_POLICY },
		policyOverrides: [],
		managerDelegations: [],
		managerActionHistory: [],
		scorecard: {
			profit: 0,
			customerSatisfaction: 0,
			staffMorale: 0,
			marketPosition: 0
		},
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		cities: [starterCity],
		activeCityId: starterCity.id,
		industryCities: [starterIndustryCity],
		activeIndustryCityId: starterIndustryCity.id,
		industrialBuildings: [],
		cityInventories: [
			{
				cityId: 'industry-city',
				materials: {}
			}
		],
		retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }],
		logistics: {
			transferOrders: [],
			recurringRoutes: [],
			nextTransferSequence: 1,
			nextRouteSequence: 1
		},
		stores: [],
		competitors: [],
		staff: [],
		hiringCandidates: [],
		events: createInitialEventRuntime(20260503),
		decisions: [],
		reports: []
	};
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
	let simulationPaused = $state(false);
	let simulationSpeed = $state<SimulationSpeed>(1);
	let simulationTickPending = $state(false);
	let scenarioCommandPending = $state(false);
	let scenariosReady = $state(false);
	const gameRouteController = new GameRouteController({
		createSaveRepository,
		createScenarioRepository,
		resolveScenarioDefinition,
		playSfx,
		onStateChange: synchronizeControllerState,
		onSaveRepositoryReady: (repository) => {
			saveRepository = repository;
		},
		onSaveSummary: (summary) => {
			autoSave = summary.autoSave;
			manualSaveSlots = summary.manualSlots;
		},
		onScenarioSummary: (summary) => {
			scenarioSummary = summary;
		},
		onScenarioTerminalRun: (run) => {
			scenarioEvidenceGame = run.game;
		},
		onAutoSave: (metadata) => {
			autoSave = metadata;
			saveFeedback = {
				kind: 'status',
				messageKey: 'route.save.autoSavedDay',
				params: { day: metadata.day }
			};
		},
		onAutoSaveError: (error) => {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		},
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
	let isStoreDetailOpen = $state(false);
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
			.filter(
				(archetypeId) =>
					playMode === 'sandbox' ||
					(activeScenarioDefinition !== null &&
						isScenarioContentAllowed(activeScenarioDefinition, {
							kind: 'archetype',
							archetypeId
						}))
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
					isScenarioContentAllowed(activeScenarioDefinition, {
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
		WORLD_CITY_CATALOG.map((city) => city.id).filter(
			(cityId) =>
				playMode === 'sandbox' ||
				(activeScenarioDefinition !== null &&
					isScenarioContentAllowed(activeScenarioDefinition, { kind: 'city', cityId }))
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
		return productIds.filter(
			(productId) =>
				playMode === 'sandbox' ||
				(activeScenarioDefinition !== null &&
					isScenarioContentAllowed(activeScenarioDefinition, {
						kind: 'product',
						productId
					}))
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
	let saveRepository: SaveRepository | null = $state(null);
	let autoSave = $state<SaveSlotMetadata | null>(null);
	let manualSaveSlots = $state<SaveSlotMetadata[]>([]);
	let isSavePanelOpen = $state(false);
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
	let saveFeedback = $state<SaveFeedback | null>(null);
	let saveStatus = $derived.by(() => {
		const feedback = saveFeedback;
		if (!feedback || feedback.kind !== 'status') {
			return '';
		}
		return renderSaveFeedback(feedback);
	});
	let saveError = $derived.by(() => {
		const feedback = saveFeedback;
		if (!feedback || feedback.kind !== 'error') {
			return null;
		}
		return renderSaveFeedback(feedback);
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
	let mapEyebrow = $derived(
		activeMapView === 'world'
			? i18n.t('route.mapEyebrow.world')
			: activeMapView === 'industry'
				? i18n.t('route.mapEyebrow.industry')
				: i18n.t('route.mapEyebrow.retail')
	);
	let mapTitle = $derived(
		activeMapView === 'world'
			? i18n.t('route.mapTitle.world')
			: activeMapView === 'industry'
				? i18n.labels.worldCity(industryCity.id).name
				: i18n.labels.worldCity(activeCity.id).name
	);
	let worldCityStatuses = $derived.by((): WorldCityStatus[] => {
		const currentGame: GameState | null = game;
		return WORLD_CITY_CATALOG.map((city) =>
			currentGame
				? getWorldCityStatus(currentGame, city.id)
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
	});
	let logisticsRouteSummaries = $derived.by<RouteOperationalSummary[]>(() =>
		game ? selectRouteOperations(game) : []
	);
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
	let selectedTile = $derived(
		selectedTileId ? (getTileById(activeCity, selectedTileId) ?? null) : null
	);
	let selectedIndustryTile = $derived(
		selectedIndustryTileId
			? (getIndustryTileById(industryCity, selectedIndustryTileId) ?? null)
			: null
	);
	let selectedStore = $derived.by(() => {
		const currentGame: GameState | null = game;
		const tile = selectedTile;

		return currentGame && tile
			? (currentGame.stores.find(
					(store) => store.cityId === activeCity.id && isTileInStoreFootprint(tile, store)
				) ?? null)
			: null;
	});
	let selectedIndustryBuilding = $derived.by(() => {
		const currentGame: GameState | null = game;
		const tile = selectedIndustryTile;

		return currentGame && tile
			? (currentGame.industrialBuildings.find(
					(building) =>
						building.cityId === industryCity.id && isTileInIndustryBuildingFootprint(tile, building)
				) ?? null)
			: null;
	});
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
	// A rail-cell click (outside build mode) resolves to the same
	// `selectedIndustryTileId` a building click would — this derives the
	// segment(s) at that cell so the template can show RailSegmentInspector
	// instead of IndustryTileInspector. Junction cells return >1 segment.
	let selectedRailSegments = $derived.by((): RailSegment[] | null => {
		if (!selectedIndustryTileId || railBuildMode.step !== 'idle') {
			return null;
		}
		const tile = getIndustryTileById(industryCity, selectedIndustryTileId);
		if (!tile) {
			return null;
		}
		const cellSegments = getSegmentsForCell(industryRailSegments, tile.x, tile.y);
		return cellSegments.length > 0 ? cellSegments : null;
	});
	let isPlacementModeActive = $derived(
		retailPlacementArchetypeId !== null ||
			industryPlacementBuildingTypeId !== null ||
			railBuildMode.step !== 'idle'
	);
	// Pause the Phaser render loop while an overlay covers the map or the map
	// menu is open. The large-city render loop iterates thousands of terrain
	// sprites every frame; pausing it frees the main thread so menu/panel
	// interactions stay responsive (and stops e2e actionability timeouts).
	// Placement mode is excluded because the scene must keep rendering the
	// placement preview over the map.
	let isMapPaused = $derived(
		!isPlacementModeActive &&
			(financePurchaseReview.purchase !== null ||
				isSupplyAdvisorOpen ||
				isStoreDetailOpen ||
				isCheatSheetOpen ||
				isBuildMenuOpen ||
				activeManagementPanelId !== null ||
				isSavePanelOpen ||
				isScenarioCatalogOpen ||
				isScenarioResultsDialogOpen ||
				isGameMenuOpen)
	);
	// When false, the industry map scene suppresses its Escape-to-cancel-build
	// listener so Escape that closes any page-level overlay does not also fire
	// buildCancelled behind the overlay. Covers every overlay the page-level
	// Escape handler closes, including the alerts dropdown (which does not
	// pause the map but still competes for the Escape key).
	let railKeyboardEnabled = $derived(
		financePurchaseReview.purchase === null &&
			!isSavePanelOpen &&
			!isScenarioCatalogOpen &&
			!isScenarioResultsDialogOpen &&
			!isCheatSheetOpen &&
			!isSupplyAdvisorOpen &&
			!isStoreDetailOpen &&
			!isBuildMenuOpen &&
			!isGameMenuOpen &&
			!isAlertsMenuOpen &&
			activeManagementPanelId === null
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
			financeCommandAvailable: mutationAvailability.financeRetailStore
		})
	);
	let industrialBuildOptions = $derived(
		getIndustrialBuildMenuOptions({
			game,
			cashCommandAvailable: mutationAvailability.buildIndustrialBuilding,
			financeCommandAvailable: mutationAvailability.financeIndustrialBuilding
		})
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
		const validTileIds = preview.validTileIds.filter((tileId) =>
			isScenarioContentAllowed(activeScenarioDefinition!, {
				kind: 'retail-placement',
				cityId,
				tileId,
				archetypeId
			})
		);
		return {
			...preview,
			validTileIds,
			invalidTileIds: [
				...new Set([
					...preview.invalidTileIds,
					...preview.validTileIds.filter((tileId) => !validTileIds.includes(tileId))
				])
			]
		};
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
		const validTileIds = preview.validTileIds.filter((tileId) =>
			isScenarioContentAllowed(activeScenarioDefinition!, {
				kind: 'industrial-placement',
				cityId,
				tileId,
				buildingTypeId
			})
		);
		return {
			...preview,
			validTileIds,
			invalidTileIds: [
				...new Set([
					...preview.invalidTileIds,
					...preview.validTileIds.filter((tileId) => !validTileIds.includes(tileId))
				])
			]
		};
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
	let railPreview = $derived.by((): IndustryMapRailPreviewRender | null => {
		const preview = railBuildPreview;
		if (preview) {
			const newCellKeys = new Set(preview.newCellKeys);
			return {
				cells: preview.pathKeys.map((key) => {
					const { x, y } = parseRailCellKey(key);
					return { x, y, isNew: newCellKeys.has(key) };
				})
			};
		}
		// No destination selected yet: show a partial preview so the player
		// can see legal attach cells after selecting an origin and watch the
		// auto-path extend through waypoints as they are added.
		const currentGame: GameState | null = game;
		if (railBuildMode.step === 'routing' && currentGame) {
			const waypointPreview = buildRailWaypointPreview(
				currentGame,
				railBuildMode.originBuildingId,
				railBuildMode.waypoints
			);
			if (waypointPreview) {
				const newCellKeys = new Set(waypointPreview.newCellKeys);
				return {
					cells: waypointPreview.pathKeys.map((key) => {
						const { x, y } = parseRailCellKey(key);
						return { x, y, isNew: newCellKeys.has(key) };
					})
				};
			}
		}
		return null;
	});
	// True when a modal/overlay that should swallow game shortcuts is open. Used both
	// to gate the `?` cheat-sheet toggle (so it doesn't stack on an open modal) and to
	// inform `resolveShortcutAction` that letter/Space/B keys must not fire behind it.
	let hasBlockingOverlay = $derived(
		financePurchaseReview.purchase !== null ||
			isSupplyAdvisorOpen ||
			isStoreDetailOpen ||
			isCheatSheetOpen ||
			isSavePanelOpen ||
			isScenarioCatalogOpen ||
			isScenarioResultsDialogOpen ||
			isAlertsMenuOpen ||
			isGameMenuOpen ||
			isPlacementModeActive
	);
	// Keep the planner calculation behind the advisor's open gate. This avoids
	// doing a full supply projection for a modal that is not mounted while the
	// route-local category/horizon context remains available for reopen.
	let supplyPlannerResult = $derived.by(() => {
		if (!isSupplyAdvisorOpen || !game || !effectivePlannerProductId) return null;
		return buildSupplyPlan(
			snapshotPlannerGame(game),
			{ retailCityId: activeCity.id as WorldCityId, productId: effectivePlannerProductId },
			plannerActionAvailability
		);
	});
	let availableMaterialIds = $derived<MaterialId[]>(
		isBuildMenuOpen && activeMapView === 'industry'
			? getAvailableMaterialIds(game ?? starterMapState)
			: []
	);
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
		void initializeSaves();
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
		const canAdvance = mutationAvailability.advanceDay;
		const tickPending = simulationTickPending;
		const blockedByOverlay = hasBlockingOverlay;

		if (!gameExists || paused || !canAdvance || tickPending || blockedByOverlay) {
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

	/**
	 * Rail build click routing (step 'origin' | 'routing' only, see
	 * `RailBuildMode`). Origin/waypoint/destination clicks all flow through
	 * `selectIndustryTile` above rather than the normal tile-selection path.
	 */
	function handleRailBuildTileClick(tileId: string): void {
		if (!game) {
			return;
		}

		const tile = getIndustryTileById(industryCity, tileId);
		if (!tile) {
			return;
		}

		const building = game.industrialBuildings.find(
			(candidate) =>
				candidate.cityId === industryCity.id && isTileInIndustryBuildingFootprint(tile, candidate)
		);

		if (railBuildMode.step === 'origin') {
			if (!building) {
				return; // Ignore clicks that aren't on a building footprint.
			}
			placementFeedback = null;
			railBuildMode = { step: 'routing', originBuildingId: building.id, waypoints: [] };
			return;
		}

		if (railBuildMode.step !== 'routing') {
			return;
		}

		if (building) {
			const input = {
				originBuildingId: railBuildMode.originBuildingId,
				waypoints: railBuildMode.waypoints,
				destinationBuildingId: building.id
			};
			const preview = buildRailPreview(game, input);

			if (preview.blockReason) {
				railPreviewTargetBuildingId = building.id;
				placementFeedback = { code: 'industry.rawPlacementBlocked', context: preview.blockReason };
				playSfx('sfx.build.invalid');
				return;
			}

			// First valid destination click only stores the target and keeps
			// routing/preview active. A subsequent click on the same building
			// (or an explicit confirm) commits the build.
			if (railPreviewTargetBuildingId === building.id) {
				void gameRouteController.buildRail(input);
				railBuildMode = { step: 'idle' };
				railPreviewTargetBuildingId = null;
				placementFeedback = null;
				return;
			}

			railPreviewTargetBuildingId = building.id;
			placementFeedback = null;
			return;
		}

		// Empty, rail-legal tile → push as a waypoint. Reject blocked/locked/
		// occupied cells up front (existing rail cells stay valid) so the
		// waypoint is reachable by findFullPath; otherwise the next
		// destination click would always report railNoValidPath and force the
		// player to undo the bad waypoint. Reachability to the eventual
		// destination is still validated via buildRailPreview.
		if (!isRailWaypointTarget(game, industryCity.id, tile.x, tile.y)) {
			placementFeedback = {
				code: 'industry.rawPlacementBlocked',
				context: decisionContextRailNoValidPath()
			};
			playSfx('sfx.build.invalid');
			return;
		}
		placementFeedback = null;
		railBuildMode = {
			step: 'routing',
			originBuildingId: railBuildMode.originBuildingId,
			waypoints: [...railBuildMode.waypoints, { x: tile.x, y: tile.y }]
		};
	}

	/**
	 * Handles the industry map's `buildCancelled` event (Escape or right-click
	 * on the canvas while a rail is being routed): pops the last waypoint, or
	 * exits build mode outright when there is nothing left to pop.
	 */
	function cancelRailBuildStep(): void {
		if (railBuildMode.step === 'idle') {
			return;
		}

		if (railBuildMode.step === 'routing' && railBuildMode.waypoints.length > 0) {
			railBuildMode = {
				step: 'routing',
				originBuildingId: railBuildMode.originBuildingId,
				waypoints: railBuildMode.waypoints.slice(0, -1)
			};
			// Popping a waypoint invalidates the last destination attempt's
			// feedback: the shortened route may now be valid (or have a
			// different blocker), so clear the stale error and let the next
			// destination click recompute it. Also drop the preview target so
			// the old path highlight does not persist for a route that no
			// longer matches.
			railPreviewTargetBuildingId = null;
			placementFeedback = null;
			return;
		}

		railBuildMode = { step: 'idle' };
		railPreviewTargetBuildingId = null;
		placementFeedback = null;
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

	async function initializeSaves(): Promise<void> {
		try {
			await gameRouteController.initializeSaves();
		} catch (error) {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		}
	}

	async function refreshSaveSummary(): Promise<void> {
		if (!saveRepository) {
			return;
		}

		const saveSummary = await saveRepository.getSummary();
		autoSave = saveSummary.autoSave;
		manualSaveSlots = saveSummary.manualSlots;
	}

	function openSavePanel(): void {
		isGameMenuOpen = false;
		activeManagementPanelId = null;
		isSavePanelOpen = true;
		saveFeedback = null;
		void refreshSaveSummary().catch((error) => {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		});
	}

	function closeSavePanel(): void {
		isSavePanelOpen = false;
	}

	function openScenarioCatalog(): void {
		isGameMenuOpen = false;
		isSavePanelOpen = false;
		activeManagementPanelId = null;
		isScenarioCatalogOpen = true;
	}

	function resolveScenarioContributor(id: string): string {
		const currentGame = activeScenarioRun?.game ?? scenarioEvidenceGame ?? game;
		const reportMatch = /^report:(\d+)/.exec(id);
		if (reportMatch) {
			const storeMatch = /\/store:([^/]+)/.exec(id);
			if (storeMatch) {
				try {
					const storeId = decodeURIComponent(storeMatch[1]!);
					const store = currentGame?.stores.find((candidate) => candidate.id === storeId);
					if (store) return store.name || i18n.t('store.defaultName');
				} catch {
					// Preserve the canonical ID below when a segment cannot be decoded.
				}
			}
			return i18n.t('scenarioObjectives.reportContributor', { day: reportMatch[1]! });
		}
		const store = currentGame?.stores.find((candidate) => candidate.id === id);
		if (store) return store.name || i18n.t('store.defaultName');
		const building = currentGame?.industrialBuildings.find((candidate) => candidate.id === id);
		if (building) return i18n.labels.industrialBuilding(building.typeId);
		return i18n.labels.material(id);
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
		if (result.status === 'confirmation-required') {
			return {
				status: 'confirmation-required',
				message: i18n.t('scenarioCatalog.startReplacementConfirmation'),
				expectedRunId: result.expectedRunId,
				expectedRevision: result.expectedRevision
			};
		}
		if (result.status !== 'committed') {
			return {
				status: 'error',
				message: scenarioOperationError
					? scenarioDiagnosticText(scenarioOperationError, i18n)
					: i18n.t('scenarioDiagnostics.persistenceWriteFailed')
			};
		}
		isScenarioCatalogOpen = false;
		return { status: 'started' };
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
		if (result.status === 'confirmation-required') {
			return {
				status: 'confirmation-required',
				message: i18n.t('scenarioCatalog.olderVersionConfirmation'),
				expectedRunId: result.expectedRunId,
				expectedRevision: result.expectedRevision
			};
		}
		if (result.status !== 'committed') {
			return {
				status: 'error',
				message: scenarioOperationError
					? scenarioDiagnosticText(scenarioOperationError, i18n)
					: i18n.t('scenarioDiagnostics.persistenceWriteFailed')
			};
		}
		isScenarioCatalogOpen = false;
		return { status: 'started' };
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
		if (result.status === 'confirmation-required') {
			return {
				status: 'confirmation-required',
				message: i18n.t('scenarioCatalog.importReplacementConfirmation'),
				expectedRunId: result.expectedRunId,
				expectedRevision: result.expectedRevision
			};
		}
		if (result.status !== 'committed') {
			return {
				status: 'error',
				message: scenarioOperationError
					? scenarioDiagnosticText(scenarioOperationError, i18n)
					: i18n.t('scenarioDiagnostics.persistenceWriteFailed')
			};
		}
		isScenarioCatalogOpen = false;
		return { status: 'started' };
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

	function describeSaveErrorKey(error: unknown): TranslationKey {
		console.error('Save operation failed:', error);

		if (error instanceof SaveDataError) {
			switch (error.code) {
				case 'storage-unavailable':
					return 'route.save.errorStorageUnavailable';
				case 'slot-not-found':
					return 'route.save.errorSlotNotFound';
				default:
					return 'route.save.errorCorrupt';
			}
		}

		return 'route.save.errorGeneric';
	}

	function renderSaveFeedback(feedback: SaveFeedback): string {
		const params = feedback.params ? { ...feedback.params } : undefined;

		if (params && typeof params.day === 'number') {
			params.day = i18n.format.integer(params.day);
		}

		return i18n.t(feedback.messageKey, params);
	}

	function openBuildMenu(): void {
		if (
			activeMapView === 'world' ||
			(activeMapView === 'retail' ? !canStartRetailExpansion : !canStartIndustryExpansion)
		) {
			return;
		}

		isGameMenuOpen = false;
		isSavePanelOpen = false;
		activeManagementPanelId = null;
		isBuildMenuOpen = true;
		playSfx('sfx.ui.panel-open');
	}

	function closeBuildMenu(): void {
		isBuildMenuOpen = false;
		playSfx('sfx.ui.panel-close');
	}

	function showRetailMap() {
		setActiveMapView('retail');
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		cancelPlacement();
	}

	function showIndustryMap() {
		setActiveMapView('industry');
		selectedTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		cancelPlacement();
	}

	function showWorldMap(): void {
		setActiveMapView('world');
		selectedTileId = null;
		selectedIndustryTileId = null;
		isBuildMenuOpen = false;
		cancelPlacement();
	}

	function setActiveMapView(mapView: MapViewId): void {
		activeMapView = mapView;
		visitedMapViews = markMapViewVisited(visitedMapViews, mapView);
	}

	async function selectWorldCityNode(cityId: string): Promise<void> {
		clearLogisticsRouteSelection();
		if (!isWorldCityId(cityId) || !allowedWorldCityIds.includes(cityId)) {
			return;
		}
		if (!game) {
			selectedWorldCityId = cityId;
			return;
		}

		const status = getWorldCityStatus(game, cityId);

		if (!status) {
			return;
		}

		// Read-only inspector selection is always available — only the
		// opened-city transition (which switches the active map) is gated
		// by worldCitySelectionAvailable so navigation survives pending writes.
		selectedWorldCityId = cityId;

		if (status.state !== 'opened' || !worldCitySelectionAvailable) {
			return;
		}

		const result = await gameRouteController.selectWorldCity(status.city.id);
		// `unchanged` means the city is already the active one — the controller
		// skipped the write, but navigation to its map should still proceed.
		if (
			result.status !== 'committed' &&
			result.status !== 'sandbox-committed' &&
			result.status !== 'unchanged'
		) {
			return;
		}
		setActiveMapView(status.city.kind === 'retail' ? 'retail' : 'industry');
		selectedWorldCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		cancelPlacement();
	}

	function openSelectedWorldCity(cityId: string): void {
		if (!game) {
			return;
		}

		if (
			!isWorldCityId(cityId) ||
			!mutationAvailability.openWorldCity ||
			!allowedWorldCityIds.includes(cityId)
		) {
			return;
		}
		void gameRouteController.openWorldCity(cityId);
		selectedWorldCityId = cityId;
	}

	function reviewSelectedWorldCityFinancing(cityId: string): void {
		if (
			!game ||
			!isWorldCityId(cityId) ||
			!mutationAvailability.financeWorldCity ||
			!allowedWorldCityIds.includes(cityId)
		) {
			return;
		}

		const status = getWorldCityStatus(game, cityId);
		if (!status?.financeOffer || game.cash >= status.city.openingCost) {
			return;
		}

		openFinancedPurchaseReview({
			kind: 'world',
			cityId,
			expectedCost: status.city.openingCost,
			offer: status.financeOffer
		});
	}

	function closeWorldInspector(): void {
		selectedWorldCityId = null;
	}

	function openManagementPanel(panelId: ManagementPanelId): void {
		isGameMenuOpen = false;
		isSavePanelOpen = false;
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

	let previousPlayMode: 'sandbox' | 'scenario' | undefined = undefined;
	let previousScenarioRunKey: string | null | undefined = undefined;
	// Track the active run object reference so a restart/import that reuses the
	// same `scenarioId:seed` key (restartScenario reuses run.seed, and importing
	// the same seed produces the same key) still triggers a transient-state
	// reset. The controller keeps the reference stable on a no-op resume (see
	// resumeScenarioRun's deep-equality short-circuit) so resume-same-run
	// preserves selections, while start/restart/import/resume-different-run
	// assign a fresh ScenarioRun and trigger the reset.
	let previousScenarioRunRef: ScenarioRun | null | undefined = undefined;

	function resetTransientViewState(): void {
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		clearLogisticsRouteSelection();
		logisticsRoutePreset = null;
		focusedRetailSupplyCityId = null;
		isStoreDetailOpen = false;
		isBuildMenuOpen = false;
		isSupplyAdvisorOpen = false;
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
		// Reset route-only selections, detail/advisor/build overlays, menu state,
		// and retail/industry/rail placement modes whenever the active mode or
		// scenario run changes — otherwise an armed placement or inspector from
		// the previous GameState stays active against the new one (e.g. a
		// placement armed in sandbox remaining armed inside a challenge that
		// forbids it). Skip on the first synchronizer call (initial state).
		const runKey = state.activeScenarioRun
			? `${state.activeScenarioRun.definition.scenarioId}:${state.activeScenarioRun.seed}`
			: null;
		const runRef = state.activeScenarioRun;
		if (
			previousPlayMode !== undefined &&
			(previousPlayMode !== state.playMode ||
				previousScenarioRunKey !== runKey ||
				previousScenarioRunRef !== runRef)
		) {
			resetTransientViewState();
		}
		previousPlayMode = state.playMode;
		previousScenarioRunKey = runKey;
		previousScenarioRunRef = runRef;
	}

	async function resumeAutoSave(): Promise<void> {
		try {
			const result = await gameRouteController.resumeAutoSave();
			if (result !== 'loaded') {
				saveFeedback = { kind: 'status', messageKey: 'route.save.noAutoSaveFound' };
				return;
			}

			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			clearLogisticsRouteSelection();
			cancelPlacement();
			saveFeedback = { kind: 'status', messageKey: 'route.save.loadedAutoSave' };
			await refreshSaveSummary();
		} catch (error) {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		}
	}

	async function saveManualSlot(name: string, slotId?: string): Promise<void> {
		if (!saveRepository || !game) {
			return;
		}

		// `game` is a Svelte reactive Proxy ($derived from a $state field).
		// The save codec's plain-snapshot boundary rejects Proxies during
		// structuredClone, so unwrap to a plain object before handing it to
		// the repository. Autosaves go through the route controller's raw
		// (non-proxy) state, which is why they don't need this.
		const snapshot = $state.snapshot(game);

		try {
			const metadata = slotId
				? await saveRepository.overwriteManualSlot(slotId, name, snapshot)
				: await saveRepository.createManualSlot(name, snapshot);
			saveFeedback = {
				kind: 'status',
				messageKey: 'route.save.savedManualSlot',
				params: { name: metadata.name }
			};
			await refreshSaveSummary();
			playSfx('sfx.save.saved');
		} catch (error) {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		}
	}

	async function loadManualSlot(slotId: string): Promise<void> {
		try {
			const slotName = manualSaveSlots.find((slot) => slot.id === slotId)?.name ?? slotId;
			const result = await gameRouteController.loadManualSave(slotId);
			if (result !== 'loaded') {
				saveFeedback = { kind: 'status', messageKey: 'route.save.manualSlotNotFound' };
				return;
			}

			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			clearLogisticsRouteSelection();
			cancelPlacement();
			saveFeedback = {
				kind: 'status',
				messageKey: 'route.save.loadedManualSlot',
				params: { name: slotName }
			};
			await refreshSaveSummary();
		} catch (error) {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		}
	}

	async function deleteManualSlot(slotId: string): Promise<void> {
		if (!saveRepository) {
			return;
		}

		try {
			await saveRepository.deleteManualSlot(slotId);
			saveFeedback = { kind: 'status', messageKey: 'route.save.deletedManualSlot' };
			await refreshSaveSummary();
		} catch (error) {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		}
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
		isStoreDetailOpen = false;
		isCheatSheetOpen = false;
		isAlertsMenuOpen = false;
		isSavePanelOpen = false;
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
		return deriveSupplyPlannerResult(
			{
				isOpen: true,
				game,
				retailCityId: activeCity.id as WorldCityId,
				productId: effectivePlannerProductId,
				availability: plannerActionAvailability
			},
			buildSupplyPlan,
			snapshotPlannerGame
		);
	}

	function handleSupplyPlannerAction(action: SupplyPlannerAction): void {
		const currentResult = currentSupplyPlannerResult();
		if (!currentResult) return;
		void handoffSupplyPlannerAction(action, currentResult, plannerHandoffHost());
	}

	async function runSimulationTick(): Promise<void> {
		if (!game || simulationPaused || simulationTickPending || !mutationAvailability.advanceDay) {
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

	function changePolicy(patch: Partial<CompanyPolicy>) {
		if (game && mutationAvailability.updatePolicy) {
			void gameRouteController.updatePolicy(patch);
		}
	}

	function setPolicyOverride(scope: PolicyOverrideScope, patch: Partial<CompanyPolicy>): void {
		if (game && mutationAvailability.scopedPolicy) {
			void gameRouteController.setPolicyOverride(scope, patch);
		}
	}

	function clearPolicyOverrideField(scope: PolicyOverrideScope, field: keyof CompanyPolicy): void {
		if (game && mutationAvailability.scopedPolicy) {
			void gameRouteController.clearPolicyOverrideField(scope, field);
		}
	}

	function resetPolicyOverrideScope(scope: PolicyOverrideScope): void {
		if (game && mutationAvailability.scopedPolicy) {
			void gameRouteController.resetPolicyOverrideScope(scope);
		}
	}

	function setManagerDelegation(delegation: ManagerDelegation): void {
		if (game && mutationAvailability.delegation) {
			void gameRouteController.setManagerDelegation(delegation);
		}
	}

	function removeManagerDelegation(managerId: string): void {
		if (game && mutationAvailability.delegation) {
			void gameRouteController.removeManagerDelegation(managerId);
		}
	}

	function chooseDecision(decisionId: string, optionId: string) {
		if (game && mutationAvailability.resolveDecision) {
			void gameRouteController.resolveDecision(decisionId, optionId);
		}
	}

	function setRetailSupplySource(retailCityId: string, supplyCityId: string | null): void {
		if (game && mutationAvailability.setRetailSupplySource) {
			void gameRouteController.setRetailSupplySource(retailCityId, supplyCityId);
		}
	}

	function dispatchManualTransfer(input: ManualTransferInput): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return Promise.resolve({ status: 'unavailable' });
		}
		return gameRouteController.dispatchManualTransfer(input);
	}

	function createRecurringRoute(input: RecurringRouteInput): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return Promise.resolve({ status: 'unavailable' });
		}
		return gameRouteController.createRecurringRoute(input);
	}

	function updateRecurringRoute(
		routeId: string,
		input: RecurringRouteUpdateInput
	): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return Promise.resolve({ status: 'unavailable' });
		}
		return gameRouteController.updateRecurringRoute(routeId, input);
	}

	function pauseRecurringRoute(routeId: string): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return Promise.resolve({ status: 'unavailable' });
		}
		return gameRouteController.pauseRecurringRoute(routeId);
	}

	function resumeRecurringRoute(routeId: string): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return Promise.resolve({ status: 'unavailable' });
		}
		return gameRouteController.resumeRecurringRoute(routeId);
	}

	function reprioritizeRecurringRoute(
		routeId: string,
		priority: number
	): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return Promise.resolve({ status: 'unavailable' });
		}
		return gameRouteController.reprioritizeRecurringRoute(routeId, priority);
	}

	function isCommittedResult(result: GameRouteCommitResult): boolean {
		return (
			result.status === 'committed' || (result.status === 'sandbox-committed' && result.changed)
		);
	}

	async function removeRecurringRoute(routeId: string): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.manageLogistics) {
			return { status: 'unavailable' };
		}
		const result = await gameRouteController.removeRecurringRoute(routeId);
		if (isCommittedResult(result)) {
			if (selectedLogisticsRouteId === routeId) selectedLogisticsRouteId = null;
			if (focusedLogisticsRouteId === routeId) focusedLogisticsRouteId = null;
		}
		return result;
	}

	function borrowWorkingCapital(
		amount: number,
		termDays: LoanTermDays
	): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.borrow) return Promise.resolve({ status: 'unavailable' });
		return gameRouteController.borrowWorkingCapital(amount, termDays);
	}

	function repayFinanceLoan(loanId: string, amount: number): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.repayLoan) return Promise.resolve({ status: 'unavailable' });
		return gameRouteController.repayFinanceLoan(loanId, amount);
	}

	function payOffFinanceLoan(loanId: string): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.payOffLoan)
			return Promise.resolve({ status: 'unavailable' });
		return gameRouteController.payOffFinanceLoan(loanId);
	}

	function refinanceFinanceLoan(
		loanId: string,
		termDays: LoanTermDays
	): Promise<GameRouteCommitResult> {
		if (!game || !mutationAvailability.refinanceLoan) {
			return Promise.resolve({ status: 'unavailable' });
		}
		return gameRouteController.refinanceFinanceLoan(loanId, termDays);
	}

	function hireStaff(candidateId: string) {
		if (game && mutationAvailability.hireStaff) {
			void gameRouteController.hireStaff(candidateId);
		}
	}

	function assignStaff(staffId: string, storeId: string) {
		if (game && mutationAvailability.assignStaff) {
			void gameRouteController.assignStaff(staffId, storeId);
		}
	}

	function unassignStoreStaff(staffId: string) {
		if (game && mutationAvailability.unassignStaff) {
			void gameRouteController.unassignStaff(staffId);
		}
	}

	function promoteStaffMember(staffId: string) {
		if (game && mutationAvailability.promoteStaff) {
			void gameRouteController.promoteStaff(staffId);
		}
	}

	function changeStoreProduct(
		storeId: string,
		productId: ProductId,
		patch: StoreProductPatch
	): void {
		if (!game) {
			return;
		}
		const product = game.stores
			.find((store) => store.id === storeId)
			?.products.find((candidate) => candidate.productId === productId);
		if (!product) {
			return;
		}

		if (patch.sellingPrice !== undefined) {
			if (!mutationAvailability.updateStoreSellingPrice) return;
			void gameRouteController.updateStoreSellingPrice(storeId, productId, patch.sellingPrice);
			return;
		}
		if (!mutationAvailability.updateStoreInventoryTargets) return;
		void gameRouteController.updateStoreInventoryTargets(
			storeId,
			productId,
			patch.reorderThreshold ?? product.reorderThreshold,
			patch.targetStock ?? product.targetStock
		);
	}

	function changeStoreProductBrand(storeId: string, productId: ProductId, brandId: BrandId): void {
		if (!game || !mutationAvailability.updateStoreProductBrand) return;
		void gameRouteController.updateStoreProductBrand(storeId, productId, brandId);
	}

	function upgradeStoreHandler(storeId: string): void {
		if (game && mutationAvailability.upgradeStore) {
			void gameRouteController.upgradeStore(storeId);
		}
	}

	function upgradeBuildingHandler(buildingId: string): void {
		if (game && mutationAvailability.upgradeIndustrialBuilding) {
			void gameRouteController.upgradeIndustrialBuilding(buildingId);
		}
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
			const expectedCost = forecastOpening(tile, archetypeId).setupCost;
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

	function refreshedFinancedPurchase(
		purchase: PendingFinancedPurchase,
		currentGame: GameState
	): PendingFinancedPurchase | null {
		if (purchase.kind === 'world') {
			const status = getWorldCityStatus(currentGame, purchase.cityId);
			if (!status) return { ...purchase, offer: null };
			return {
				...purchase,
				expectedCost: status.city.openingCost,
				offer: status.financeOffer
			};
		}

		if (purchase.kind === 'retail') {
			const city = currentGame.cities.find(
				(candidate) => candidate.id === currentGame.activeCityId
			);
			const tile = city ? getTileById(city, purchase.tileId) : undefined;
			if (!tile) return { ...purchase, offer: null };
			const expectedCost = forecastOpening(tile, purchase.archetypeId).setupCost;
			const offer = getExpansionFinanceOffer(currentGame, expectedCost);
			return { ...purchase, expectedCost, offer };
		}

		const expectedCost = INDUSTRIAL_BUILDING_TYPES[purchase.buildingTypeId]?.buildCost;
		if (expectedCost === undefined) return { ...purchase, offer: null };
		const offer = getExpansionFinanceOffer(currentGame, expectedCost);
		return { ...purchase, expectedCost, offer };
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

		if (isCommittedResult(result)) {
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
		isStoreDetailOpen = false;
	}

	function openStoreDetail(): void {
		if (selectedStore) {
			isStoreDetailOpen = true;
		}
	}

	function closeStoreDetail(): void {
		isStoreDetailOpen = false;
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
		const navigation = resolveAlertNavigation(alert);
		if (navigation) {
			if ('kind' in navigation) {
				selectLogisticsRoute(navigation.routeId);
				return;
			}

			focusedFinanceLoanId = navigation.focusedFinanceLoanId;
			openManagementPanel(navigation.panelId);
			return;
		}
		if (alert.kind === 'store-stock' && alert.tileId) {
			if (game && alert.cityId && alert.cityId !== game.activeCityId) {
				if (
					!isWorldCityId(alert.cityId) ||
					!worldCitySelectionAvailable ||
					!allowedWorldCityIds.includes(alert.cityId)
				) {
					return;
				}
				const result = await gameRouteController.selectAlertCity(alert.cityId);
				if (result.status !== 'committed' && result.status !== 'sandbox-committed') {
					return;
				}
			}
			showRetailMap();
			selectedTileId = alert.tileId;
			return;
		}
		if (alert.kind === 'factory-blocked' && alert.tileId) {
			if (game && alert.cityId && alert.cityId !== game.activeIndustryCityId) {
				if (
					!isWorldCityId(alert.cityId) ||
					!worldCitySelectionAvailable ||
					!allowedWorldCityIds.includes(alert.cityId)
				) {
					return;
				}
				const result = await gameRouteController.selectAlertCity(alert.cityId);
				if (result.status !== 'committed' && result.status !== 'sandbox-committed') {
					return;
				}
			}
			showIndustryMap();
			selectedIndustryTileId = alert.tileId;
		}
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
			if (isFinanceReviewEscapeOwned(financePurchaseReview)) return;
			if (isSavePanelOpen) {
				isSavePanelOpen = false;
				return;
			}
			if (isCheatSheetOpen) {
				isCheatSheetOpen = false;
				return;
			}
			if (isSupplyAdvisorOpen) {
				isSupplyAdvisorOpen = false;
				return;
			}
			if (isStoreDetailOpen) {
				isStoreDetailOpen = false;
				return;
			}
			if (isBuildMenuOpen) {
				isBuildMenuOpen = false;
				return;
			}
			if (isGameMenuOpen) {
				isGameMenuOpen = false;
				return;
			}
			if (isAlertsMenuOpen) {
				isAlertsMenuOpen = false;
				return;
			}
			if (railBuildMode.step !== 'idle') {
				// The industry map canvas has its own Escape/right-click handling
				// for rail build mode (IndustryMap's onBuildCancelled ->
				// cancelRailBuildStep), which pops the last waypoint instead of
				// exiting outright. Returning here (rather than falling into the
				// generic isPlacementModeActive branch) avoids handling the same
				// Escape keydown a second time at the page level.
				return;
			}
			if (isPlacementModeActive) {
				cancelPlacement();
				return;
			}
			if (activeManagementPanelId !== null) {
				closeManagementPanel();
				return;
			}
			if (selectedWorldCityId !== null) {
				selectedWorldCityId = null;
				clearLogisticsRouteSelection();
				return;
			}
			if (selectedTileId !== null) {
				selectedTileId = null;
				clearLogisticsRouteSelection();
				return;
			}
			if (selectedIndustryTileId !== null) {
				selectedIndustryTileId = null;
				clearLogisticsRouteSelection();
				return;
			}
			if (selectedLogisticsRouteId !== null) {
				clearLogisticsRouteSelection();
				return;
			}
			// Nothing else was open or selected — Escape toggles the hamburger menu open.
			if (!hasModifier && !isTypingElement(event.target)) {
				isGameMenuOpen = true;
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
			if (action.view === 'retail') {
				showRetailMap();
			} else if (action.view === 'industry') {
				showIndustryMap();
			} else {
				showWorldMap();
			}
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
	data-scenario-result={lastScenarioResult?.outcome ?? ''}
	data-scenario-best-updated={lastScenarioBestUpdated}
	data-scenario-error={scenarioOperationError?.code ?? ''}
	data-scenario-retry-available={retryScenarioOperation !== null}
	onpointerdown={unlockAudio}
>
	<section class="map-layout" aria-label={i18n.t('route.cityPlanning')}>
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
			{mapSnapshot}
			onSelectRetailTile={selectTile}
			{industryMapSnapshot}
			onSelectIndustryTile={selectIndustryTile}
			onCancelRailBuild={cancelRailBuildStep}
			{railKeyboardEnabled}
		/>
		<TopBar
			eyebrow={mapEyebrow}
			title={mapTitle}
			day={game?.day ?? null}
			cash={game?.cash ?? null}
			{alerts}
			{i18n}
			{activeLocale}
			onSelectAlert={handleSelectAlert}
			{activeMapView}
			onSelectView={(view) => {
				if (view === 'retail') showRetailMap();
				else if (view === 'industry') showIndustryMap();
				else showWorldMap();
			}}
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
					<button type="button" onclick={openSavePanel}>{i18n.t('gameMenu.saves')}</button>
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

		<ControlDesk
			managementItems={managementPanelMenuItems}
			buildDisabled={activeMapView === 'world' ||
				(activeMapView === 'retail' ? !canStartRetailExpansion : !canStartIndustryExpansion)}
			advanceDisabled={game === null || !mutationAvailability.advanceDay}
			pauseDisabled={game === null}
			railBuildDisabled={!mutationAvailability.buildRail}
			disabledReason={mutationDisabledReason}
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
							i18n.t('placement.chooseHighlightedTile'))}</span
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
			onOpenStoreDetails={openStoreDetail}
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
			onUpgradeIndustryBuilding={upgradeBuildingHandler}
			onUpgradeRailSegment={upgradeRailSegmentHandler}
			onDemolishRailSegment={demolishRailSegmentHandler}
			onCloseIndustryInspector={closeIndustryInspector}
			{showLogisticsRouteInspector}
			{selectedLogisticsRoute}
			onManageLogisticsRoute={openLogisticsManagement}
			onCloseLogisticsRouteInspector={clearLogisticsRouteSelection}
		/>
	</section>

	{#if isStoreDetailOpen && selectedStore}
		<StoreDetailModal
			game={game ?? starterMapState}
			{i18n}
			store={selectedStore}
			staff={game?.staff ?? []}
			hiringCandidates={game?.hiringCandidates ?? []}
			latestStoreReport={latestSelectedStoreReport}
			onUpdateStoreProduct={changeStoreProduct}
			onUpdateStoreProductBrand={changeStoreProductBrand}
			onHireStaff={hireStaff}
			onAssignStaff={assignStaff}
			onUnassignStaff={unassignStoreStaff}
			canUpdateSellingPrice={mutationAvailability.updateStoreSellingPrice}
			canUpdateInventoryTargets={mutationAvailability.updateStoreInventoryTargets}
			canUpdateBrand={mutationAvailability.updateStoreProductBrand}
			{allowedProductIds}
			canHireStaff={mutationAvailability.hireStaff}
			canAssignStaff={mutationAvailability.assignStaff}
			canUnassignStaff={mutationAvailability.unassignStaff}
			disabledReason={mutationDisabledReason}
			onClickFeedback={() => playSfx('sfx.ui.click')}
			onClose={closeStoreDetail}
		/>
	{/if}

	{#if activeManagementPanel}
		{#key activeManagementPanel.id}
			{@const panelGame = game ?? starterMapState}
			{@const retailSupplyViews = buildRetailCitySupplyViews(panelGame, i18n)}
			<ManagementPanelHost
				panelId={activeManagementPanel.id}
				panelLabel={activeManagementPanel.label}
				{panelGame}
				{summary}
				{financeMetrics}
				{retailSupplyViews}
				mutations={mutationAvailability}
				retailSupplyDisabled={game === null || !mutationAvailability.setRetailSupplySource}
				{focusedFinanceLoanId}
				{focusedRetailSupplyCityId}
				logisticsView={logisticsPanelView}
				manageLogistics={mutationAvailability.manageLogistics}
				{focusedLogisticsRouteId}
				{logisticsRoutePreset}
				{i18n}
				disabledReason={mutationDisabledReason}
				onClose={closeManagementPanel}
				onChangePolicy={changePolicy}
				onSetPolicyOverride={setPolicyOverride}
				onClearPolicyOverrideField={clearPolicyOverrideField}
				onResetPolicyOverrideScope={resetPolicyOverrideScope}
				onSetManagerDelegation={setManagerDelegation}
				onRemoveManagerDelegation={removeManagerDelegation}
				onHireStaff={hireStaff}
				onAssignStaff={assignStaff}
				onUnassignStaff={unassignStoreStaff}
				onPromoteStaff={promoteStaffMember}
				onSetRetailSupplySource={setRetailSupplySource}
				onChooseDecision={chooseDecision}
				onBorrow={borrowWorkingCapital}
				onRepay={repayFinanceLoan}
				onPayoff={payOffFinanceLoan}
				onRefinance={refinanceFinanceLoan}
				onPlanProduct={planSupplyProduct}
				{plannerProductIds}
				onDispatchManualTransfer={dispatchManualTransfer}
				onCreateRecurringRoute={createRecurringRoute}
				onUpdateRecurringRoute={updateRecurringRoute}
				onPauseRecurringRoute={pauseRecurringRoute}
				onResumeRecurringRoute={resumeRecurringRoute}
				onReprioritizeRecurringRoute={reprioritizeRecurringRoute}
				onRemoveRecurringRoute={removeRecurringRoute}
			/>
		{/key}
	{/if}

	{#if isSavePanelOpen}
		<SavePanel
			activeGame={game}
			{autoSave}
			slots={manualSaveSlots}
			status={saveStatus}
			error={saveError}
			{i18n}
			onResumeAutoSave={resumeAutoSave}
			onSaveSlot={saveManualSlot}
			onLoadSlot={loadManualSlot}
			onDeleteSlot={deleteManualSlot}
			onClose={closeSavePanel}
		/>
	{/if}

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
		min-height: 100vh;
		overflow: hidden;
		display: block;
	}

	.map-layout {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 100vh;
		overflow: hidden;
	}

	.scenario-progress {
		position: fixed;
		top: 5rem;
		right: 0.75rem;
		left: 0.75rem;
		z-index: 29;
		max-height: calc(100vh - 10rem);
		overflow: auto;
	}

	.placement-status {
		position: absolute;
		left: 1rem;
		bottom: 4.5rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.65rem 0.8rem;
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
</style>
