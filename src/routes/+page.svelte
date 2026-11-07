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
	import TopBar from '$lib/components/game/TopBar.svelte';
	import { createGameAudioController, type GameAudioController } from '$lib/audio/audioController';
	import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from '$lib/audio/audioPreferences';
	import type { BgmCueId, SfxCueId } from '$lib/audio/audioCatalog';
	import { collectGameAlerts, type GameAlert } from '$lib/game/alerts';
	import { localizeGameAlert } from '$lib/i18n/gameCopy';
	import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
	import { resolveMapAlertDestination } from './mapNavigationRoute';
	import { createRoutePreviewGame } from './routePreviewGame';
	import { resolveShortcutAction, type ManagementPanelId } from '$lib/game/keyboardShortcuts';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import { encodeIndustrialPlacementKey } from '$lib/game/supplyPlannerActions';
	import { WORLD_CITY_CATALOG } from '$lib/game/world';
	import type { GameState, WorldCityId } from '$lib/game/types';
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
		type GameRouteControllerState
	} from './gameRouteController';
	import {
		resolveEscapeTarget,
		selectOverlayGates,
		type OverlayId,
		type OverlaySnapshot
	} from './routeOverlays';
	import { createConstructionUi } from './constructionUi.svelte';
	import { createManagementUi } from './managementUi.svelte';
	import ConstructionControls from './ConstructionControls.svelte';
	import { createSupplyPlannerUi } from './supplyPlannerUi.svelte';
	import SupplyAdvisorHost from './SupplyAdvisorHost.svelte';
	import ManagementPanelHost from './ManagementPanelHost.svelte';
	import MapInspectorHost from './MapInspectorHost.svelte';
	import MapSurfaceHost from './MapSurfaceHost.svelte';
	import { createMapSession } from './mapSession.svelte';
	import { createRetailInspection } from './retailInspection.svelte';
	import type { SupplyPlannerHandoffHost } from './supplyPlannerRoute';
	import { nextMapActivityBatch, type MapActivityBatch } from '$lib/game/mapActivityFeedback';
	import {
		selectRouteGuidance,
		resolveGuidanceHandoff,
		type RouteGuidanceAction
	} from './routeGuidance';
	import {
		createI18n,
		readLocalePreference,
		saveLocalePreference,
		type StorageLike
	} from '$lib/i18n/index';
	import type { SupportedLocale } from '$lib/i18n/locales';

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

	const starterMapState = createRoutePreviewGame();
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
	// fresh tick instead of stalling until the next user action. See
	// the effect below for why advanceDay itself is not a lifecycle dependency.
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
		// Read-only receiver: updates only the named selection atom.
		onReadOnlySelection: (kind, tileId) => session.acceptReadOnlySelection(kind, tileId)
	});
	let game = $derived(playMode === 'scenario' ? (activeScenarioRun?.game ?? null) : sandboxGame);
	// Boolean projection of `game` existence. The auto-tick `$effect` reads this
	// instead of `game` so a new game snapshot (policy edit, build, hire, stock
	// change, etc.) does not re-trigger the timer lifecycle and reset the
	// pending day delay. `game` is a new object reference on every mutation, so
	// subscribing the timer to it would postpone the current day each time; a
	// primitive boolean only propagates when existence flips.
	let hasGame = $derived(game !== null);
	let isCheatSheetOpen = $state(false);
	let isGameMenuOpen = $state(false);
	let isAlertsMenuOpen = $state(false);
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
	// Management navigation owner: the active panel, its localized menu and
	// the panel-scoped focus atoms. Panels own no game state; the host drives
	// the controller command port.
	const management = createManagementUi({
		getI18n: () => i18n,
		onOpen: () => {
			isGameMenuOpen = false;
			saves.close();
			construction.hideMenu();
		}
	});
	// Map session owner: the active/visited views, the four selection ids,
	// the active cities with their headings and the world map read models.
	// Root keeps alert/guidance orchestration and calls the named operations.
	const session = createMapSession({
		getGame: () => game,
		getFallback: () => starterMapState,
		getI18n: () => i18n,
		getAvailability: () => mutationAvailability,
		getAllowedWorldCityIds: () => allowedWorldCityIds,
		getWorldSelectionAvailable: () => worldCitySelectionAvailable,
		getFocusedLogisticsRouteId: () => management.focusedLogisticsRouteId,
		tryConstructionClick: (kind, tileId) => construction.tryConstructionClick(kind, tileId),
		onCancelConstruction: () => construction.cancel(),
		onClearLogisticsFocus: () => management.clearLogisticsFocus(),
		onReviewPurchase: (purchase) => construction.review(purchase),
		commands: gameRouteController
	});
	// Construction owner: build menu, armed placements, rail build session and
	// the financed-purchase review. Placement selections route through the map
	// session's placement operations.
	const construction = createConstructionUi({
		getGame: () => game,
		getRetailCity: () => session.activeRetailCity,
		getIndustryCity: () => session.activeIndustryCity,
		getFallback: () => starterMapState,
		getView: () => session.activeMapView,
		getMode: () => playMode,
		getDefinition: () => activeScenarioDefinition,
		getAvailability: () => mutationAvailability,
		getI18n: () => i18n,
		commands: gameRouteController,
		playSfx,
		onSelectPlacementTile: session.selectPlacementTile,
		onClearSelections: session.clearPlacementSelections,
		onFoundingPause: () => {
			simulationPaused = true;
		},
		onMenuOpen: () => {
			isGameMenuOpen = false;
			saves.close();
			management.hide();
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
	// Supply advisor owner: durable category/horizon context plus the lazy
	// plan calculation and live handoff revalidation. The root bridge below
	// composes the handoff protocol from the named owner operations.
	const planner = createSupplyPlannerUi({
		getGame: () => game,
		getRetailCityId: () => session.activeRetailCity.id as WorldCityId,
		getAllowedProductIds: () => allowedProductIds,
		getAllowedIndustryBuildingTypeIds: () => construction.allowedIndustryBuildingTypeIds,
		getAllowedIndustrialPlacements: () => allowedIndustrialPlacements,
		getAvailability: () => mutationAvailability,
		createHost: plannerHandoffHost,
		onOpen: () => construction.hideMenu(),
		onPlanProduct: () => {
			management.close();
		}
	});
	// Retail inspection owner: selected tile/store/report, the focused
	// store-detail overlay and the guarded store-product mutations.
	const retail = createRetailInspection({
		getGame: () => game,
		getCity: () => session.activeRetailCity,
		getSelectedTileId: () => session.selectedTileId,
		getAvailability: () => mutationAvailability,
		commands: gameRouteController,
		onClearRetailSelection: () => session.clearSelection('retailTile'),
		onManageSupply: (cityId) => management.openStores(cityId),
		onPlanProduct: (productId) => planner.planProduct(productId)
	});
	const saves = createSaveUi({
		getGame: () => game,
		getI18n: () => i18n,
		commands: gameRouteController,
		playSfx,
		onOpen: () => {
			isGameMenuOpen = false;
			management.hide();
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
			management.hide();
		},
		onResultsClosed: () => {
			management.hide();
		}
	});
	let audioController: GameAudioController | null = $state(null);
	let audioPreferences = $state<AudioPreferences>({ ...DEFAULT_AUDIO_PREFERENCES });
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
	// Read-only projection of existing owners, not a second overlay state authority.
	let overlaySnapshot = $derived.by<OverlaySnapshot>(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt from owners, never mutated after publication.
		const openOverlays = new Set<OverlayId>();
		if (construction.purchaseReview.purchase !== null) openOverlays.add('finance-review');
		if (saves.isOpen) openOverlays.add('save-panel');
		if (scenarios.isCatalogOpen) openOverlays.add('scenario-catalog');
		if (scenarios.isResultsOpen) openOverlays.add('scenario-results');
		if (isCheatSheetOpen) openOverlays.add('cheat-sheet');
		if (planner.isOpen) openOverlays.add('supply-advisor');
		if (retail.focus.isOpen) openOverlays.add('store-detail');
		if (construction.isMenuOpen) openOverlays.add('build-menu');
		if (isGameMenuOpen) openOverlays.add('game-menu');
		if (isAlertsMenuOpen) openOverlays.add('alerts-menu');
		if (management.activePanelId !== null) openOverlays.add('management-panel');
		return {
			openOverlays,
			isPlacementActive: construction.isPlacementModeActive,
			isRailBuildActive: construction.isRailActive,
			isFinanceReviewPending: construction.purchaseReview.confirmationPending,
			selected: {
				worldCity: session.selectedWorldCityId !== null,
				retailTile: session.selectedTileId !== null,
				industryTile: session.selectedIndustryTileId !== null,
				logisticsRoute: session.selectedLogisticsRouteId !== null
			},
			allowMenuFallback: false // Set from the current keyboard event, never stored.
		};
	});
	let { isMapPaused, railKeyboardEnabled, hasBlockingOverlay } = $derived(
		selectOverlayGates(overlaySnapshot)
	);
	// The world map is a navigation/overview surface with no time controls —
	// the ControlDesk (pause/resume + speed) is hidden there. Block the
	// auto-tick while it owns the screen so a running simulation can't advance
	// uncontrollably. Not folded into hasBlockingOverlay because that flag also
	// swallows every keyboard shortcut (panel mnemonics, 1/2/3 view navigation),
	// which must stay available on the world view.
	let simulationBlocked = $derived(hasBlockingOverlay || session.activeMapView === 'world');

	onMount(() => {
		void saves.initialize().then(async () => {
			if (
				new URLSearchParams(window.location.search).get('ui-comparison') === '1' &&
				saves.autoSave
			) {
				await saves.resumeAutoSave();
				const tileId = game?.stores[0]?.tileId ?? null;
				if (tileId !== null) session.acceptReadOnlySelection('retail', tileId);
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
		controller.setActiveBgm(bgmCueByMapView[session.activeMapView]);

		return () => {
			void controller.destroy();
			audioController = null;
		};
	});

	$effect(() => {
		document.documentElement.lang = activeLocale;
	});

	$effect(() => {
		audioController?.setActiveBgm(bgmCueByMapView[session.activeMapView]);
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

	/** Shell view switch: the world view hides the build menu (root policy);
	 * the navigation itself belongs to the map session owner. */
	function showMap(view: MapViewId): void {
		if (view === 'world') construction.hideMenu();
		session.setView(view);
	}

	function handleGuidanceAction(action: RouteGuidanceAction): void {
		const handoff = resolveGuidanceHandoff(action);
		if (handoff.kind === 'alert') {
			void handleSelectAlert(handoff.alert);
		} else if (handoff.panelId === 'logistics') {
			management.openLogistics();
		} else {
			management.open(handoff.panelId);
		}
	}

	/** Shell entry opens (keyboard/hamburger/ControlDesk) keep the legacy
	 * fresh-open logistics semantics; only explicit handoffs prefill focus. */
	function openManagementEntry(id: ManagementPanelId): void {
		if (id === 'logistics') management.openLogistics();
		else management.open(id);
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
		session.clearSelection('retailTile');
		session.clearSelection('industryTile');
		session.clearSelection('worldCity');
		session.clearSelection('logisticsRoute');
		retail.close();
		construction.hideMenu();
		planner.close();
		// Pause the auto-tick whenever the active play mode or scenario run
		// changes (start/restart/import a challenge, return to sandbox, etc.)
		// so the player can review the new state before time resumes.
		simulationPaused = true;
		isGameMenuOpen = false;
		isAlertsMenuOpen = false;
		management.close();
		management.clearFinanceFocus();
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
		session.clearSelection('retailTile');
		session.clearSelection('industryTile');
		session.clearSelection('worldCity');
		session.clearSelection('logisticsRoute');
		construction.cancel();
		// Only a successful load re-arms the sandbox opening and cash guidance.
		sandboxOpeningGuidanceDismissed = false;
		cashRecoveryDismissed = false;
		// Pause the auto-tick so the player can review the loaded state
		// before time resumes.
		simulationPaused = true;
	}

	function closePlannerOverlays(): void {
		planner.close();
		construction.hideMenu();
		isGameMenuOpen = false;
		retail.close();
		isCheatSheetOpen = false;
		isAlertsMenuOpen = false;
		saves.close();
		scenarios.closeCatalog();
		management.close();
		session.clearSelection('retailTile');
		session.clearSelection('industryTile');
		session.clearSelection('worldCity');
		session.clearSelection('logisticsRoute');
		construction.cancel();
	}

	function plannerHandoffHost(): SupplyPlannerHandoffHost {
		return {
			getGame: () => game,
			closeOverlays: closePlannerOverlays,
			switchToSupplyCity: (cityId) => session.switchToSupplyCity(cityId),
			armIndustryPlacement: construction.armIndustry,
			selectIndustryTile: session.selectIndustryTile,
			openLogistics: management.openLogistics,
			openStores: management.openStores,
			enterRailBuildMode: (mode) => {
				planner.close();
				construction.enterRailRouting(mode);
			},
			canBuildRail: mutationAvailability.buildRail,
			canManageLogistics: mutationAvailability.manageLogistics,
			canSetRetailSupplySource: mutationAvailability.setRetailSupplySource
		};
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
			session.allowedWorldCityIds,
			worldCitySelectionAvailable
		);
		if (!destination) return;
		if (destination.kind === 'world-route') {
			session.selectLogisticsRoute(destination.routeId);
			return;
		}
		if (destination.kind === 'panel') {
			if (destination.focusedFinanceLoanId === null) management.clearFinanceFocus();
			else management.focusFinance(destination.focusedFinanceLoanId);
			management.open(destination.panelId);
			return;
		}
		if (destination.cityIdToSelect) {
			const result = await gameRouteController.selectAlertCity(destination.cityIdToSelect);
			if (result.status !== 'committed' && result.status !== 'sandbox-committed') return;
		}
		if (destination.kind === 'retail') {
			showMap('retail');
			session.acceptReadOnlySelection('retail', destination.tileId);
			retail.openDirect(destination.productId);
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
		session.acceptReadOnlySelection('industry', destination.tileId);
	}

	function startRailFromBuilding(buildingId: string): boolean {
		if (!game || !mutationAvailability.buildRail) return false;
		if (!game.industrialBuildings.some((building) => building.id === buildingId)) return false;
		planner.close();
		session.clearSelection('industryTile');
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
							planner.close();
							break;
						case 'store-detail':
							retail.close();
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
							management.close();
							break;
					}
					break;
				case 'cancel-placement':
					construction.cancel();
					break;
				case 'clear-selection':
					session.clearSelection(resolution.kind);
					if (resolution.kind !== 'logisticsRoute') {
						session.clearSelection('logisticsRoute');
					}
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
			isMenuOpen: construction.isMenuOpen || management.activePanelId !== null,
			activeMapView: session.activeMapView,
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
			if (management.activePanelId === action.panel) {
				management.close();
			} else {
				openManagementEntry(action.panel);
			}
		} else if (action.type === 'toggle-pause') {
			toggleSimulationPause();
		} else if (action.type === 'view') {
			showMap(action.view);
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('app.title')} · {session.mapEyebrow}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main
	class="app"
	data-play-mode={playMode}
	data-scenario-command-pending={scenarioCommandPending}
	data-simulation-paused={simulationPaused}
	data-simulation-blocked={simulationBlocked}
	data-active-map-view={session.activeMapView}
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
				{session}
				{game}
				fallback={starterMapState}
				{i18n}
				retailPlacementPreview={construction.retailPlacementPreview}
				industryPlacementPreview={construction.industryPlacementPreview}
				railPreviewRender={construction.railPreviewRender}
				activity={mapActivity}
				{isMapPaused}
				{railKeyboardEnabled}
				availability={mutationAvailability}
				disabledReason={mutationDisabledReason}
				onCancelRailBuild={construction.cancelRailStep}
			/>
		</div>
		<TopBar
			eyebrow={session.mapEyebrow}
			title={session.mapTitle}
			day={game?.day ?? null}
			cash={game?.cash ?? null}
			cashHistory={game?.reports.slice(-14).map((report) => report.cashAfter) ?? []}
			industryInventory={game?.cityInventories.find(
				(inventory) => inventory.cityId === session.activeIndustryCity.id
			)?.materials ?? {}}
			{alerts}
			{i18n}
			{activeLocale}
			onSelectAlert={handleSelectAlert}
			activeMapView={session.activeMapView}
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
						{#each management.menu as item (item.id)}
							<button type="button" onclick={() => openManagementEntry(item.id)}>
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
			worldView={session.activeMapView === 'world'}
			day={game?.day ?? 1}
			managementItems={management.menu}
			buildDisabled={session.activeMapView === 'world' ||
				(session.activeMapView === 'retail'
					? !construction.canStartRetailExpansion
					: !construction.canStartIndustryExpansion)}
			advanceDisabled={game === null || !mutationAvailability.advanceDay}
			pauseDisabled={game === null}
			railBuildDisabled={!mutationAvailability.buildRail}
			disabledReason={game === null ? i18n.t('controlDesk.timeLockedHint') : mutationDisabledReason}
			{i18n}
			onBuild={construction.openMenu}
			onOpenManagement={openManagementEntry}
			paused={simulationPaused}
			{simulationSpeed}
			onTogglePause={toggleSimulationPause}
			onSelectSpeed={setSimulationSpeed}
			onOpenShortcuts={() => (isCheatSheetOpen = true)}
			showRailBuild={session.activeMapView === 'industry' && game !== null}
			railBuildActive={construction.isRailActive}
			onToggleRailBuild={construction.toggleRail}
		/>
		<ConstructionControls
			ui={construction}
			{i18n}
			cash={game?.cash ?? 0}
			view={session.activeMapView}
			guidanceVisible={showOpeningGuidance || showCashRecovery}
			onOpenAdvisor={planner.open}
		/>
		<SupplyAdvisorHost ui={planner} {i18n} />
		<MapInspectorHost
			{session}
			{retail}
			{game}
			fallback={starterMapState}
			{i18n}
			availability={mutationAvailability}
			disabledReason={mutationDisabledReason}
			mode={playMode}
			isPlacementActive={construction.isPlacementModeActive}
			placementFeedback={construction.placementFeedback}
			isRailActive={construction.isRailActive}
			commands={gameRouteController}
			plannerProductIds={planner.productIds}
			{allowedProductIds}
			onAddIndustryRoute={(preset) => management.openLogistics(null, preset)}
			onManageLogisticsRoute={management.openLogistics}
			onBuildWarehouse={construction.canStartWarehousePlacement
				? () => construction.armIndustry('warehouse')
				: undefined}
			onBuildRailFromBuilding={mutationAvailability.buildRail
				? (id) => void startRailFromBuilding(id)
				: undefined}
			onPlayClickSfx={() => playSfx('sfx.ui.click')}
		/>
	</section>

	{#if management.activePanelId}
		<ManagementPanelHost
			ui={management}
			{game}
			fallback={starterMapState}
			mode={playMode}
			{i18n}
			availability={mutationAvailability}
			disabledReason={mutationDisabledReason}
			commands={gameRouteController}
			plannerProductIds={planner.productIds}
			onPlanProduct={planner.planProduct}
			onRouteRemoved={session.acceptRouteRemoved}
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
