<script lang="ts">
	import { onMount } from 'svelte';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import BuildMenu from '$lib/components/game/BuildMenu.svelte';
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import AudioSettings from '$lib/components/game/AudioSettings.svelte';
	import CityMap from '$lib/components/game/CityMap.svelte';
	import ControlDesk from '$lib/components/game/ControlDesk.svelte';
	import IndustryMap from '$lib/components/game/IndustryMap.svelte';
	import IndustryTileInspector from '$lib/components/game/IndustryTileInspector.svelte';
	import RailSegmentInspector from '$lib/components/game/RailSegmentInspector.svelte';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ProductChainsPanel from '$lib/components/game/ProductChainsPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import SavePanel from '$lib/components/game/SavePanel.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import ShortcutCheatSheet from '$lib/components/game/ShortcutCheatSheet.svelte';
	import StaffPanel from '$lib/components/game/StaffPanel.svelte';
	import StoreDetailModal from '$lib/components/game/StoreDetailModal.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import SupplyAdvisor from '$lib/components/game/SupplyAdvisor.svelte';
	import TileInspector from '$lib/components/game/TileInspector.svelte';
	import TopBar from '$lib/components/game/TopBar.svelte';
	import WorldMap from '$lib/components/game/WorldMap.svelte';
	import { createGameAudioController, type GameAudioController } from '$lib/audio/audioController';
	import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from '$lib/audio/audioPreferences';
	import type { BgmCueId, SfxCueId } from '$lib/audio/audioCatalog';
	import { collectGameAlerts, type GameAlert } from '$lib/game/alerts';
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
		generateIndustryCity,
		getIndustryTileById
	} from '$lib/game/industry';
	import {
		createIndustryMapSnapshot,
		type IndustryMapRailPreviewRender
	} from '$lib/game/industryMapRender';
	import { buildIndustrialBuilding, upgradeBuilding } from '$lib/game/industryPlacement';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import {
		buildRailNetwork,
		deriveRailSegments,
		getSegmentsForCell,
		parseRailCellKey,
		type RailSegment
	} from '$lib/game/rail';
	import {
		buildRail,
		buildRailPreview,
		demolishRailSegment,
		upgradeRailSegment
	} from '$lib/game/railPlacement';
	import {
		createInitialVisitedMapViews,
		markMapViewVisited,
		shouldRenderMapView,
		type MapViewId
	} from '$lib/game/mapViewKeepAlive';
	import { createFoundingGameAtTile, openStoreAtTile } from '$lib/game/placement';
	import {
		createIndustryPlacementPreview,
		createRetailPlacementPreview,
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
		createI18n,
		readLocalePreference,
		saveLocalePreference,
		type StorageLike,
		type TranslationKey
	} from '$lib/i18n/index';
	import type { SupportedLocale } from '$lib/i18n/locales';
	import { summarizeReports } from '$lib/game/reports';
	import {
		assignStaffToStore,
		hireCandidate,
		promoteStaff,
		unassignStaff
	} from '$lib/game/staffing';
	import { DEFAULT_POLICY, resolveDecision, updatePolicy, upgradeStore } from '$lib/game/state';
	import { buildSupplyAdvisor, getAvailableMaterialIds } from '$lib/game/supplyAdvisor';
	import type { AdvisorChain } from '$lib/game/supplyAdvisor';
	import { isTileInStoreFootprint } from '$lib/game/storeFootprint';
	import { isTileInIndustryBuildingFootprint } from '$lib/game/industryFootprint';
	import { updateStoreProduct } from '$lib/game/stock';
	import { simulateDay } from '$lib/game/simulateDay';
	import {
		STARTER_STORE_CAP,
		WORLD_CITY_CATALOG,
		createInitialWorldProgress,
		getWorldCityStatus,
		isWorldCityId,
		openWorldCity,
		selectWorldCity
	} from '$lib/game/world';
	import { decisionContextWorldCityNotAvailableYet } from '$lib/game/decisionContext';
	import type {
		ArchetypeId,
		CompanyPolicy,
		GameState,
		IndustrialBuildingTypeId,
		MaterialId,
		StoreProductPatch
	} from '$lib/game/types';
	import type { WorldCityStatus } from '$lib/game/world';
	import type { SaveRepository } from '$lib/persistence/saveRepository';
	import { SaveDataError } from '$lib/persistence/saveCodec';
	import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

	interface ManagementPanelMenuItem {
		id: ManagementPanelId;
		label: string;
		shortcut: string;
	}

	type SaveFeedbackKind = 'status' | 'error';

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
		{ id: 'productChains', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.productChains }
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
		debt: 0,
		policy: { ...DEFAULT_POLICY },
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
		warehouse: {
			capacity: 0,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		},
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: []
	};
	const bgmCueByMapView: Record<MapViewId, BgmCueId> = {
		retail: 'bgm.retail-map',
		industry: 'bgm.industry-map',
		world: 'bgm.world-map'
	};

	let game: GameState | null = $state(null);
	let activeMapView = $state<MapViewId>('retail');
	let visitedMapViews = $state(createInitialVisitedMapViews('retail'));
	let selectedWorldCityId = $state<string | null>(null);
	let selectedTileId = $state<string | null>(null);
	let selectedIndustryTileId = $state<string | null>(null);
	let isCheatSheetOpen = $state(false);
	let isStoreDetailOpen = $state(false);
	let isGameMenuOpen = $state(false);
	let isAlertsMenuOpen = $state(false);
	let isBuildMenuOpen = $state(false);
	let isSupplyAdvisorOpen = $state(false);
	let activeManagementPanelId = $state<ManagementPanelId | null>(null);
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
	let placementFeedback = $state<PlacementBlockReason | null>(null);
	let saveRepository: SaveRepository | null = $state(null);
	let autoSave = $state<SaveSlotMetadata | null>(null);
	let manualSaveSlots = $state<SaveSlotMetadata[]>([]);
	let isSavePanelOpen = $state(false);
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
	let alerts = $derived<GameAlert[]>(game ? collectGameAlerts(game) : []);
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
	// A rail-cell click (outside build mode) resolves to the same
	// `selectedIndustryTileId` a building click would — this derives the
	// segment(s) at that cell so the template can show RailSegmentInspector
	// instead of IndustryTileInspector. Junction cells return >1 segment.
	let selectedRailSegments = $derived.by((): RailSegment[] | null => {
		const currentGame: GameState | null = game;
		if (!currentGame || !selectedIndustryTileId || railBuildMode.step !== 'idle') {
			return null;
		}
		const tile = getIndustryTileById(industryCity, selectedIndustryTileId);
		if (!tile) {
			return null;
		}
		const network = buildRailNetwork(industryCity);
		const segments = deriveRailSegments(network, currentGame.industrialBuildings);
		const cellSegments = getSegmentsForCell(segments, tile.x, tile.y);
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
			(isSupplyAdvisorOpen ||
				isStoreDetailOpen ||
				isCheatSheetOpen ||
				isBuildMenuOpen ||
				activeManagementPanelId !== null ||
				isSavePanelOpen ||
				isGameMenuOpen)
	);
	let shouldShowRetailInspector = $derived(
		selectedTile !== null && (!isPlacementModeActive || placementFeedback !== null)
	);
	let shouldShowIndustryInspector = $derived(
		selectedIndustryTile !== null && (!isPlacementModeActive || placementFeedback !== null)
	);
	let retailBuildOptions = $derived(getRetailBuildMenuOptions({ game, city: activeCity }));
	let retailPlacementPreview = $derived(
		retailPlacementArchetypeId
			? createRetailPlacementPreview({
					game,
					city: activeCity,
					archetypeId: retailPlacementArchetypeId
				})
			: null
	);
	let industryPlacementPreview = $derived(
		industryPlacementBuildingTypeId
			? createIndustryPlacementPreview({
					game,
					buildingTypeId: industryPlacementBuildingTypeId
				})
			: null
	);
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
		if (!preview) {
			return null;
		}
		const newCellKeys = new Set(preview.newCellKeys);
		return {
			cells: preview.pathKeys.map((key) => {
				const { x, y } = parseRailCellKey(key);
				return { x, y, isNew: newCellKeys.has(key) };
			})
		};
	});
	// True when a modal/overlay that should swallow game shortcuts is open. Used both
	// to gate the `?` cheat-sheet toggle (so it doesn't stack on an open modal) and to
	// inform `resolveShortcutAction` that letter/Space/B keys must not fire behind it.
	let hasBlockingOverlay = $derived(
		isSupplyAdvisorOpen ||
			isStoreDetailOpen ||
			isCheatSheetOpen ||
			isSavePanelOpen ||
			isAlertsMenuOpen ||
			isGameMenuOpen ||
			isPlacementModeActive
	);
	// Advisor/availability work is gated on the overlay that consumes it, so the
	// chain walk only runs while the Supply Advisor or Build Menu is actually open.
	let supplyAdvisorChains = $derived<AdvisorChain[]>(
		isSupplyAdvisorOpen ? buildSupplyAdvisor(game ?? starterMapState) : []
	);
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

	// Text for the placement-status plaque while rail-building: a block
	// reason (if any) always wins, then a ready-to-confirm cost summary once
	// a valid destination attempt exists, then step-specific instructions.
	function railBuildStatusText(): string {
		const blocked = formatPlacementFeedback(placementFeedback);
		if (blocked) {
			return blocked;
		}

		const preview = railBuildPreview;
		if (preview && !preview.blockReason) {
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

	function changeLocale(locale: SupportedLocale): void {
		activeLocale = saveLocalePreference(locale, safeLocalStorage());
	}

	function selectTile(tileId: string) {
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
		selectedTileId = game ? resolveSelectionAnchorTileId(activeCity, game.stores, tileId) : tileId;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
	}

	function selectIndustryTile(tileId: string) {
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
		selectedIndustryTileId = game
			? resolveIndustrySelectionAnchorTileId(industryCity, game.industrialBuildings, tileId)
			: tileId;
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
				setGameAndAutosave(buildRail(game, input));
				playSfx('sfx.build.industry-place');
				railBuildMode = { step: 'idle' };
				railPreviewTargetBuildingId = null;
				placementFeedback = null;
				return;
			}

			railPreviewTargetBuildingId = building.id;
			placementFeedback = null;
			return;
		}

		// Empty, rail-legal tile → push as a waypoint. Reachability is
		// validated against the eventual destination via buildRailPreview.
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

		if (!game || activeMapView !== 'industry') {
			return;
		}

		isBuildMenuOpen = false;
		placementFeedback = null;
		railBuildMode = { step: 'origin' };
	}

	function upgradeRailSegmentHandler(segmentId: string): void {
		if (game) {
			setGameAndAutosaveWithSfx(
				game,
				upgradeRailSegment(game, industryCity.id, segmentId),
				'sfx.industry.upgrade'
			);
		}
	}

	function demolishRailSegmentHandler(segmentId: string): void {
		if (game) {
			setGameAndAutosave(demolishRailSegment(game, industryCity.id, segmentId));
		}
	}

	async function initializeSaves(): Promise<void> {
		try {
			saveRepository = await createSaveRepository();

			if (game) {
				await writeAutoSave(game);
			} else {
				await refreshSaveSummary();
			}
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
		if (activeMapView === 'world') {
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
		cancelPlacement();
	}

	function showIndustryMap() {
		setActiveMapView('industry');
		selectedTileId = null;
		selectedWorldCityId = null;
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

	function selectWorldCityNode(cityId: string): void {
		if (!game) {
			selectedWorldCityId = cityId;
			return;
		}

		const status = getWorldCityStatus(game, cityId);

		if (!status) {
			return;
		}

		selectedWorldCityId = cityId;

		if (status.state !== 'opened') {
			return;
		}

		const nextGame = selectWorldCity(game, status.city.id);
		game = nextGame;
		setActiveMapView(status.city.kind === 'retail' ? 'retail' : 'industry');
		selectedWorldCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		cancelPlacement();
		void writeAutoSave(nextGame);
	}

	function openSelectedWorldCity(cityId: string): void {
		if (!game) {
			return;
		}

		setGameAndAutosaveWithSfx(game, openWorldCity(game, cityId), 'sfx.world.city-unlock');
		selectedWorldCityId = cityId;
	}

	function closeWorldInspector(): void {
		selectedWorldCityId = null;
	}

	function openManagementPanel(panelId: ManagementPanelId): void {
		isGameMenuOpen = false;
		isSavePanelOpen = false;
		isBuildMenuOpen = false;
		// Panels open even before a store is founded; they fall back to an empty
		// starter state and their action handlers no-op until a game exists.
		activeManagementPanelId = panelId;
	}

	function closeManagementPanel(): void {
		activeManagementPanelId = null;
	}

	function setGameAndAutosave(nextGame: GameState): void {
		game = nextGame;
		void writeAutoSave(nextGame);
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

	function setGameAndAutosaveWithSfx(
		currentGame: GameState,
		nextGame: GameState,
		cueId: SfxCueId
	): void {
		setGameAndAutosave(nextGame);

		if (nextGame !== currentGame) {
			playSfx(cueId);
		}
	}

	async function writeAutoSave(nextGame: GameState): Promise<void> {
		if (!saveRepository) {
			return;
		}

		try {
			const metadata = await saveRepository.saveAuto(nextGame);
			autoSave = metadata;
			saveFeedback = {
				kind: 'status',
				messageKey: 'route.save.autoSavedDay',
				params: { day: metadata.day }
			};
		} catch (error) {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		}
	}

	async function resumeAutoSave(): Promise<void> {
		if (!saveRepository) {
			return;
		}

		try {
			const record = await saveRepository.getAutoSave();

			if (!record) {
				saveFeedback = { kind: 'status', messageKey: 'route.save.noAutoSaveFound' };
				return;
			}

			game = record.game;
			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			cancelPlacement();
			saveFeedback = { kind: 'status', messageKey: 'route.save.loadedAutoSave' };
			await refreshSaveSummary();
			playSfx('sfx.save.loaded');
		} catch (error) {
			saveFeedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
		}
	}

	async function saveManualSlot(name: string, slotId?: string): Promise<void> {
		if (!saveRepository || !game) {
			return;
		}

		try {
			const metadata = slotId
				? await saveRepository.overwriteManualSlot(slotId, name, game)
				: await saveRepository.createManualSlot(name, game);
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
		if (!saveRepository) {
			return;
		}

		try {
			const record = await saveRepository.loadManualSlot(slotId);

			if (!record) {
				saveFeedback = { kind: 'status', messageKey: 'route.save.manualSlotNotFound' };
				return;
			}

			game = record.game;
			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			cancelPlacement();
			saveFeedback = {
				kind: 'status',
				messageKey: 'route.save.loadedManualSlot',
				params: { name: record.metadata.name }
			};
			await refreshSaveSummary();
			playSfx('sfx.save.loaded');
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
		retailPlacementArchetypeId = archetypeId;
		industryPlacementBuildingTypeId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		placementFeedback = null;
		isBuildMenuOpen = false;
		playSfx('sfx.build.arm');
	}

	function armIndustryPlacement(buildingTypeId: IndustrialBuildingTypeId): void {
		industryPlacementBuildingTypeId = buildingTypeId;
		retailPlacementArchetypeId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		placementFeedback = null;
		isBuildMenuOpen = false;
		playSfx('sfx.build.arm');
	}

	function cancelPlacement(): void {
		retailPlacementArchetypeId = null;
		industryPlacementBuildingTypeId = null;
		railBuildMode = { step: 'idle' };
		railPreviewTargetBuildingId = null;
		placementFeedback = null;
	}

	function openSupplyAdvisor(): void {
		isBuildMenuOpen = false;
		isSupplyAdvisorOpen = true;
	}

	function closeSupplyAdvisor(): void {
		isSupplyAdvisorOpen = false;
	}

	function buildFromAdvisor(buildingTypeId: IndustrialBuildingTypeId): void {
		isSupplyAdvisorOpen = false;
		isBuildMenuOpen = false;
		// The advisor is reachable from the industry Build Menu, but the user can
		// switch map views while the advisor stays open. Ensure the industry map
		// is active before arming industry placement so the preview renders on
		// the correct map.
		setActiveMapView('industry');
		armIndustryPlacement(buildingTypeId);
	}

	function advanceDay() {
		if (game) {
			setGameAndAutosaveWithSfx(game, simulateDay(game), 'sfx.time.advance-day');
		}
	}

	function changePolicy(patch: Partial<CompanyPolicy>) {
		if (game) {
			setGameAndAutosaveWithSfx(game, updatePolicy(game, patch), 'sfx.policy.change');
		}
	}

	function chooseDecision(decisionId: string, optionId: string) {
		if (game) {
			setGameAndAutosaveWithSfx(
				game,
				resolveDecision(game, decisionId, optionId),
				'sfx.decision.resolve'
			);
		}
	}

	function hireStaff(candidateId: string) {
		if (game) {
			setGameAndAutosaveWithSfx(game, hireCandidate(game, candidateId), 'sfx.staff.hire');
		}
	}

	function assignStaff(staffId: string, storeId: string) {
		if (game) {
			setGameAndAutosaveWithSfx(
				game,
				assignStaffToStore(game, staffId, storeId),
				'sfx.staff.assign'
			);
		}
	}

	function unassignStoreStaff(staffId: string) {
		if (game) {
			setGameAndAutosaveWithSfx(game, unassignStaff(game, staffId), 'sfx.staff.unassign');
		}
	}

	function promoteStaffMember(staffId: string) {
		if (game) {
			setGameAndAutosaveWithSfx(game, promoteStaff(game, staffId), 'sfx.staff.promote');
		}
	}

	function changeStoreProduct(storeId: string, categoryId: string, patch: StoreProductPatch): void {
		if (game) {
			setGameAndAutosaveWithSfx(
				game,
				updateStoreProduct(game, storeId, categoryId, patch),
				'sfx.stock.edit'
			);
		}
	}

	function upgradeStoreHandler(storeId: string): void {
		if (game) {
			setGameAndAutosaveWithSfx(game, upgradeStore(game, storeId), 'sfx.store.upgrade');
		}
	}

	function upgradeBuildingHandler(buildingId: string): void {
		if (game) {
			setGameAndAutosaveWithSfx(game, upgradeBuilding(game, buildingId), 'sfx.industry.upgrade');
		}
	}

	function placeRetailAtTile(archetypeId: ArchetypeId, tileId: string): void {
		const blockReason = getRetailPlacementBlockReason({
			game,
			city: activeCity,
			tileId,
			archetypeId
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
			const tile = getTileById(activeCity, tileId);

			if (!tile) {
				placementFeedback = { code: 'retail.unknownCityTile' };
				playSfx('sfx.build.invalid');
				return;
			}

			setGameAndAutosave(
				createFoundingGameAtTile({
					archetypeId,
					city: activeCity,
					tileId: tile.id,
					seed: starterMapState.seed
				})
			);
			playSfx('sfx.build.retail-place');
		} else {
			setGameAndAutosaveWithSfx(
				game,
				openStoreAtTile(game, {
					tileId,
					archetypeId
				}),
				'sfx.build.retail-place'
			);
		}

		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		cancelPlacement();
	}

	function placeIndustryAtTile(buildingTypeId: IndustrialBuildingTypeId, tileId: string): void {
		const blockReason = getIndustryBuildPlacementBlockReason({
			game,
			tileId,
			buildingTypeId
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

		setGameAndAutosaveWithSfx(
			game,
			buildIndustrialBuilding(game, { tileId, buildingTypeId }),
			'sfx.build.industry-place'
		);
		selectedIndustryTileId = null;
		selectedTileId = null;
		selectedWorldCityId = null;
		cancelPlacement();
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

	function handleSelectAlert(alert: GameAlert): void {
		if (alert.kind === 'decision') {
			openManagementPanel('decisions');
			return;
		}
		if (alert.kind === 'store-stock' && alert.tileId) {
			if (
				game &&
				alert.cityId &&
				alert.cityId !== game.activeCityId &&
				isWorldCityId(alert.cityId)
			) {
				const switched = selectWorldCity(game, alert.cityId);
				if (switched !== game) {
					setGameAndAutosave(switched);
				}
			}
			showRetailMap();
			selectedTileId = alert.tileId;
			return;
		}
		if (alert.kind === 'factory-blocked' && alert.tileId) {
			if (
				game &&
				alert.cityId &&
				alert.cityId !== game.activeIndustryCityId &&
				isWorldCityId(alert.cityId)
			) {
				const switched = selectWorldCity(game, alert.cityId);
				if (switched !== game) {
					setGameAndAutosave(switched);
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
				activeManagementPanelId = null;
				return;
			}
			if (selectedWorldCityId !== null) {
				selectedWorldCityId = null;
				return;
			}
			if (selectedTileId !== null) {
				selectedTileId = null;
				return;
			}
			if (selectedIndustryTileId !== null) {
				selectedIndustryTileId = null;
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
				openManagementPanel(action.panel);
			}
		} else if (action.type === 'advance-day') {
			advanceDay();
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

<main class="app" onpointerdown={unlockAudio}>
	<section class="map-layout" aria-label={i18n.t('route.cityPlanning')}>
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
						onSelectCity={selectWorldCityNode}
						onOpenCity={openSelectedWorldCity}
						onCloseInspector={closeWorldInspector}
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
						onTileSelected={selectTile}
						active={activeMapView === 'retail'}
						paused={isMapPaused}
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
						onTileSelected={selectIndustryTile}
						onBuildCancelled={cancelRailBuildStep}
						active={activeMapView === 'industry'}
						paused={isMapPaused}
						{i18n}
					/>
				</div>
			{/if}
		</div>
		<TopBar
			eyebrow={mapEyebrow}
			title={mapTitle}
			day={game?.day ?? null}
			cash={game?.cash ?? null}
			{alerts}
			alertGame={game ?? starterMapState}
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
							<button type="button" onclick={() => openManagementPanel(item.id)}>
								{item.label}
							</button>
						{/each}
					</div>
				</div>
				<button type="button" onclick={openSavePanel}>{i18n.t('gameMenu.saves')}</button>
				<AudioSettings {i18n} preferences={audioPreferences} onChange={updateAudioPreferences} />
			{/snippet}
		</TopBar>

		<ControlDesk
			managementItems={managementPanelMenuItems}
			buildDisabled={activeMapView === 'world'}
			advanceDisabled={game === null}
			{i18n}
			onBuild={openBuildMenu}
			onOpenManagement={(id) => openManagementPanel(id)}
			onAdvanceDay={advanceDay}
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
		{#if isBuildMenuOpen && activeMapView !== 'world'}
			<BuildMenu
				activeMapView={activeMapView === 'industry' ? 'industry' : 'retail'}
				{i18n}
				retailOptions={retailBuildOptions}
				{industryLockedReason}
				{availableMaterialIds}
				onChooseRetail={armRetailPlacement}
				onChooseIndustry={armIndustryPlacement}
				onOpenAdvisor={openSupplyAdvisor}
				onClose={closeBuildMenu}
			/>
		{/if}
		{#if isSupplyAdvisorOpen}
			<SupplyAdvisor
				chains={supplyAdvisorChains}
				{i18n}
				onBuild={buildFromAdvisor}
				onClose={closeSupplyAdvisor}
			/>
		{/if}
		{#if selectedTile && shouldShowRetailInspector}
			<div
				class="inspector-overlay paper"
				role="dialog"
				aria-modal="false"
				aria-label={i18n.t('route.inspectors.retailDetails')}
			>
				<TileInspector
					game={game ?? starterMapState}
					tile={selectedTile}
					store={selectedStore}
					latestStoreReport={latestSelectedStoreReport}
					{i18n}
					onUpgradeStore={upgradeStoreHandler}
					onOpenDetails={openStoreDetail}
					onClickFeedback={() => playSfx('sfx.ui.click')}
					onClose={closeInspector}
				/>
			</div>
		{/if}
		{#if selectedRailSegments && shouldShowIndustryInspector}
			<div
				class="inspector-overlay paper"
				role="dialog"
				aria-modal="false"
				aria-label={i18n.t('railSegmentInspector.title')}
			>
				<RailSegmentInspector
					game={game ?? starterMapState}
					cityId={industryCity.id}
					segments={selectedRailSegments}
					{i18n}
					onClose={closeIndustryInspector}
					onUpgradeSegment={upgradeRailSegmentHandler}
					onDemolishSegment={demolishRailSegmentHandler}
				/>
			</div>
		{:else if selectedIndustryTile && shouldShowIndustryInspector}
			<div
				class="inspector-overlay paper"
				role="dialog"
				aria-modal="false"
				aria-label={i18n.t('route.inspectors.industryDetails')}
			>
				<IndustryTileInspector
					game={game ?? starterMapState}
					tile={selectedIndustryTile}
					building={selectedIndustryBuilding}
					{i18n}
					onUpgradeBuilding={upgradeBuildingHandler}
					onClose={closeIndustryInspector}
				/>
			</div>
		{/if}
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
			onHireStaff={hireStaff}
			onAssignStaff={assignStaff}
			onUnassignStaff={unassignStoreStaff}
			onClickFeedback={() => playSfx('sfx.ui.click')}
			onClose={closeStoreDetail}
		/>
	{/if}

	{#if activeManagementPanel}
		{#key activeManagementPanel.id}
			{@const panelGame = game ?? starterMapState}
			<div class="tower-backdrop">
				<button
					type="button"
					class="tower-backdrop-button"
					aria-label={i18n.t('route.controlTower.dismiss', {
						panel: activeManagementPanel.label
					})}
					onclick={closeManagementPanel}
				></button>
				<div
					class="control-tower-overlay paper"
					role="dialog"
					aria-modal="true"
					aria-label={activeManagementPanel.label}
					{@attach focusTrap}
				>
					<div class="tower-header">
						<div>
							<p class="eyebrow">{i18n.t('route.controlTower.eyebrow')}</p>
							<h2>{activeManagementPanel.label}</h2>
						</div>
						<div
							class="tower-actions"
							role="group"
							aria-label={i18n.t('route.controlTower.panelStatus', {
								panel: activeManagementPanel.label
							})}
						>
							<span class="ticker"
								>{i18n.t('topBar.day', { day: i18n.format.integer(panelGame.day) })}</span
							>
							<strong class="ticker">{i18n.format.currency(panelGame.cash)}</strong>
							<button
								type="button"
								class="close-tower btn-danger"
								aria-label={i18n.t('route.controlTower.closePanel', {
									panel: activeManagementPanel.label
								})}
								onclick={closeManagementPanel}
							>
								{i18n.t('route.controlTower.close')}
							</button>
						</div>
					</div>

					{#if activeManagementPanel.id === 'dashboard'}
						<Scorecard {i18n} scorecard={panelGame.scorecard} />
					{:else if activeManagementPanel.id === 'policies'}
						<PolicyPanel {i18n} policy={panelGame.policy} onChange={changePolicy} />
					{:else if activeManagementPanel.id === 'staff'}
						<StaffPanel
							{i18n}
							stores={panelGame.stores}
							staff={panelGame.staff}
							hiringCandidates={panelGame.hiringCandidates}
							cash={panelGame.cash}
							onHire={hireStaff}
							onAssign={assignStaff}
							onUnassign={unassignStoreStaff}
							onPromote={promoteStaffMember}
						/>
					{:else if activeManagementPanel.id === 'stores'}
						<StoreOverview
							{i18n}
							stores={panelGame.stores}
							staff={panelGame.staff}
							latestReports={summary.latest?.storeReports ?? []}
						/>
					{:else if activeManagementPanel.id === 'decisions'}
						<DecisionQueue {i18n} decisions={panelGame.decisions} onResolve={chooseDecision} />
					{:else if activeManagementPanel.id === 'reports'}
						<ReportsPanel {i18n} {summary} stores={panelGame.stores} />
					{:else if activeManagementPanel.id === 'productChains'}
						<ProductChainsPanel {i18n} game={panelGame} />
					{/if}
				</div>
			</div>
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

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	.map-layout {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 100vh;
		overflow: hidden;
	}

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

	.ticker {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
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

	.inspector-overlay {
		position: absolute;
		top: 5.9rem;
		right: 1rem;
		z-index: 10;
		width: min(360px, calc(100% - 2rem));
		/* Reserve bottom space for the fixed control desk (~3.4rem) plus a gap so
		   upgrade/detail buttons stay clickable on short wide layouts. */
		max-height: calc(100dvh - 10.5rem);
		overflow: auto;
		padding: 0;
	}

	.tower-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.74);
		backdrop-filter: blur(4px);
	}

	.tower-backdrop-button {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.control-tower-overlay {
		position: relative;
		z-index: 1;
		width: min(1180px, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		display: grid;
		gap: 1rem;
		padding: 1.25rem;
		animation-delay: 160ms;
	}

	.tower-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	.tower-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.tower-actions span,
	.tower-actions strong {
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.tower-actions strong {
		font-weight: 700;
	}

	.close-tower {
		white-space: nowrap;
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

	@media (max-width: 980px) {
		.inspector-overlay {
			position: fixed;
			/* Sit above the fixed control desk (compact here — .manage is hidden)
			   so the store card's Open Details button is never covered. */
			inset: auto 0 5rem 0;
			width: auto;
			max-height: 60dvh;
		}

		.control-tower-overlay {
			max-height: calc(100vh - 1rem);
			padding: 0.85rem;
		}

		.tower-header {
			align-items: stretch;
			flex-direction: column;
		}

		.tower-actions {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
