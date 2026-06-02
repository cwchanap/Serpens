<script lang="ts">
	import { onMount } from 'svelte';
	import BuildMenu from '$lib/components/game/BuildMenu.svelte';
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import CityMap from '$lib/components/game/CityMap.svelte';
	import IndustryMap from '$lib/components/game/IndustryMap.svelte';
	import IndustryTileInspector from '$lib/components/game/IndustryTileInspector.svelte';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ProductChainsPanel from '$lib/components/game/ProductChainsPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import SavePanel from '$lib/components/game/SavePanel.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import StaffPanel from '$lib/components/game/StaffPanel.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import TileInspector from '$lib/components/game/TileInspector.svelte';
	import WorldMap from '$lib/components/game/WorldMap.svelte';
	import { generateCity, getTileById } from '$lib/game/city';
	import { generateIndustryCity, getIndustryTileById } from '$lib/game/industry';
	import { createIndustryMapSnapshot } from '$lib/game/industryMapRender';
	import { buildIndustrialBuilding } from '$lib/game/industryPlacement';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import { createFoundingGameAtTile, openStoreAtTile } from '$lib/game/placement';
	import {
		createIndustryPlacementPreview,
		createRetailPlacementPreview,
		getIndustryBuildPlacementBlockReason,
		getRetailBuildMenuOptions,
		getRetailPlacementBlockReason
	} from '$lib/game/placementPreview';
	import { summarizeReports } from '$lib/game/reports';
	import { assignStaffToStore, hireCandidate, unassignStaff } from '$lib/game/staffing';
	import { DEFAULT_POLICY, resolveDecision, updatePolicy } from '$lib/game/state';
	import { updateStoreProduct } from '$lib/game/stock';
	import { simulateDay } from '$lib/game/simulateDay';
	import {
		STARTER_STORE_CAP,
		WORLD_CITY_CATALOG,
		createInitialWorldProgress,
		getWorldCityStatus,
		openWorldCity,
		selectWorldCity
	} from '$lib/game/world';
	import type {
		ArchetypeId,
		CompanyPolicy,
		GameState,
		IndustrialBuildingTypeId,
		StoreProductPatch
	} from '$lib/game/types';
	import type { WorldCityStatus } from '$lib/game/world';
	import type { SaveRepository } from '$lib/persistence/saveRepository';
	import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

	type ManagementPanelId =
		| 'dashboard'
		| 'policies'
		| 'staff'
		| 'stores'
		| 'decisions'
		| 'reports'
		| 'productChains';

	interface ManagementPanelMenuItem {
		id: ManagementPanelId;
		label: string;
	}

	const starterCity = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: 20,
		height: 20,
		seed: 20260503
	});
	const starterIndustryCity = generateIndustryCity({
		id: 'industry-city',
		name: 'Industry City',
		width: 18,
		height: 18,
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
	const managementPanelMenuItems: ManagementPanelMenuItem[] = [
		{ id: 'dashboard', label: 'Dashboard' },
		{ id: 'policies', label: 'Policies' },
		{ id: 'staff', label: 'Staff' },
		{ id: 'stores', label: 'Stores' },
		{ id: 'decisions', label: 'Decisions' },
		{ id: 'reports', label: 'Reports' },
		{ id: 'productChains', label: 'Product Chains' }
	];

	let game: GameState | null = $state(null);
	let activeMapView = $state<'world' | 'retail' | 'industry'>('retail');
	let selectedWorldCityId = $state<string | null>(null);
	let selectedTileId = $state<string | null>(null);
	let selectedIndustryTileId = $state<string | null>(null);
	let isViewMenuOpen = $state(false);
	let isBuildMenuOpen = $state(false);
	let activeManagementPanelId = $state<ManagementPanelId | null>(null);
	let retailPlacementArchetypeId = $state<ArchetypeId | null>(null);
	let industryPlacementBuildingTypeId = $state<IndustrialBuildingTypeId | null>(null);
	let placementFeedback = $state<string | null>(null);
	let saveRepository: SaveRepository | null = $state(null);
	let autoSave = $state<SaveSlotMetadata | null>(null);
	let manualSaveSlots = $state<SaveSlotMetadata[]>([]);
	let isSavePanelOpen = $state(false);
	let saveStatus = $state('');
	let saveError = $state<string | null>(null);
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
	let worldCityStatuses = $derived.by((): WorldCityStatus[] => {
		const currentGame: GameState | null = game;
		return WORLD_CITY_CATALOG.map((city) =>
			currentGame
				? getWorldCityStatus(currentGame, city.id)
				: {
						city,
						state: city.initiallyOpened ? 'opened' : 'locked',
						canOpen: false,
						blockedReason: city.unlockRequirement,
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
		return selectedTileId
			? (currentGame?.stores.find((store) => store.tileId === selectedTileId) ?? null)
			: null;
	});
	let selectedIndustryBuilding = $derived.by(() => {
		const currentGame: GameState | null = game;
		return selectedIndustryTileId
			? (currentGame?.industrialBuildings.find(
					(building) => building.tileId === selectedIndustryTileId
				) ?? null)
			: null;
	});
	let latestSelectedStoreReport = $derived.by(() => {
		const store = selectedStore;
		return store
			? (summary.latest?.storeReports.find((report) => report.storeId === store.id) ?? null)
			: null;
	});
	let isPlacementModeActive = $derived(
		retailPlacementArchetypeId !== null || industryPlacementBuildingTypeId !== null
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
	let industryLockedReason = $derived(game ? null : 'Found a retail store to unlock construction.');
	let mapSnapshot = $derived(
		createCityMapSnapshot(game ?? starterMapState, selectedTileId, retailPlacementPreview)
	);
	let industryMapSnapshot = $derived(
		createIndustryMapSnapshot(
			game ?? starterMapState,
			selectedIndustryTileId,
			industryPlacementPreview
		)
	);

	onMount(() => {
		void initializeSaves();
	});

	function selectTile(tileId: string) {
		if (retailPlacementArchetypeId) {
			placeRetailAtTile(retailPlacementArchetypeId, tileId);
			return;
		}

		selectedTileId = tileId;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
	}

	function selectIndustryTile(tileId: string) {
		if (industryPlacementBuildingTypeId) {
			placeIndustryAtTile(industryPlacementBuildingTypeId, tileId);
			return;
		}

		selectedIndustryTileId = tileId;
		selectedTileId = null;
		selectedWorldCityId = null;
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
			saveError = describeSaveError(error);
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
		isViewMenuOpen = false;
		activeManagementPanelId = null;
		isSavePanelOpen = true;
		saveStatus = '';
		saveError = null;
		void refreshSaveSummary().catch((error) => {
			saveError = describeSaveError(error);
		});
	}

	function closeSavePanel(): void {
		isSavePanelOpen = false;
	}

	function describeSaveError(error: unknown): string {
		return error instanceof Error ? error.message : 'Save operation failed';
	}

	function toggleViewMenu() {
		isViewMenuOpen = !isViewMenuOpen;
	}

	function openBuildMenu(): void {
		if (activeMapView === 'world') {
			return;
		}

		isViewMenuOpen = false;
		isSavePanelOpen = false;
		activeManagementPanelId = null;
		isBuildMenuOpen = true;
	}

	function closeBuildMenu(): void {
		isBuildMenuOpen = false;
	}

	function showRetailMap() {
		activeMapView = 'retail';
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		isViewMenuOpen = false;
		cancelPlacement();
	}

	function showIndustryMap() {
		activeMapView = 'industry';
		selectedTileId = null;
		selectedWorldCityId = null;
		isViewMenuOpen = false;
		cancelPlacement();
	}

	function showWorldMap(): void {
		activeMapView = 'world';
		selectedTileId = null;
		selectedIndustryTileId = null;
		isViewMenuOpen = false;
		isBuildMenuOpen = false;
		cancelPlacement();
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
		activeMapView = status.city.kind === 'retail' ? 'retail' : 'industry';
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

		const nextGame = openWorldCity(game, cityId);
		setGameAndAutosave(nextGame);
		selectedWorldCityId = cityId;
	}

	function closeWorldInspector(): void {
		selectedWorldCityId = null;
	}

	function openManagementPanel(panelId: ManagementPanelId): void {
		isViewMenuOpen = false;
		isSavePanelOpen = false;
		isBuildMenuOpen = false;

		if (!game) {
			activeManagementPanelId = null;
			return;
		}

		activeManagementPanelId = panelId;
	}

	function closeManagementPanel(): void {
		activeManagementPanelId = null;
	}

	function setGameAndAutosave(nextGame: GameState): void {
		game = nextGame;
		void writeAutoSave(nextGame);
	}

	async function writeAutoSave(nextGame: GameState): Promise<void> {
		if (!saveRepository) {
			return;
		}

		try {
			const metadata = await saveRepository.saveAuto(nextGame);
			autoSave = metadata;
			saveStatus = `Auto-saved day ${metadata.day}`;
			saveError = null;
		} catch (error) {
			saveError = describeSaveError(error);
		}
	}

	async function resumeAutoSave(): Promise<void> {
		if (!saveRepository) {
			return;
		}

		try {
			const record = await saveRepository.getAutoSave();

			if (!record) {
				saveStatus = 'No auto-save found';
				return;
			}

			game = record.game;
			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			cancelPlacement();
			saveStatus = 'Loaded auto-save';
			saveError = null;
			await refreshSaveSummary();
		} catch (error) {
			saveError = describeSaveError(error);
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
			saveStatus = `Saved ${metadata.name}`;
			saveError = null;
			await refreshSaveSummary();
		} catch (error) {
			saveError = describeSaveError(error);
		}
	}

	async function loadManualSlot(slotId: string): Promise<void> {
		if (!saveRepository) {
			return;
		}

		try {
			const record = await saveRepository.loadManualSlot(slotId);

			if (!record) {
				saveStatus = 'Manual save slot not found';
				return;
			}

			game = record.game;
			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
			cancelPlacement();
			saveStatus = `Loaded ${record.metadata.name}`;
			saveError = null;
			await refreshSaveSummary();
		} catch (error) {
			saveError = describeSaveError(error);
		}
	}

	async function deleteManualSlot(slotId: string): Promise<void> {
		if (!saveRepository) {
			return;
		}

		try {
			await saveRepository.deleteManualSlot(slotId);
			saveStatus = 'Deleted save slot';
			saveError = null;
			await refreshSaveSummary();
		} catch (error) {
			saveError = describeSaveError(error);
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
	}

	function armIndustryPlacement(buildingTypeId: IndustrialBuildingTypeId): void {
		industryPlacementBuildingTypeId = buildingTypeId;
		retailPlacementArchetypeId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
		placementFeedback = null;
		isBuildMenuOpen = false;
	}

	function cancelPlacement(): void {
		retailPlacementArchetypeId = null;
		industryPlacementBuildingTypeId = null;
		placementFeedback = null;
	}

	function advanceDay() {
		if (game) {
			setGameAndAutosave(simulateDay(game));
		}
	}

	function changePolicy(patch: Partial<CompanyPolicy>) {
		if (game) {
			setGameAndAutosave(updatePolicy(game, patch));
		}
	}

	function chooseDecision(decisionId: string, optionId: string) {
		if (game) {
			setGameAndAutosave(resolveDecision(game, decisionId, optionId));
		}
	}

	function hireStaff(candidateId: string) {
		if (game) {
			setGameAndAutosave(hireCandidate(game, candidateId));
		}
	}

	function assignStaff(staffId: string, storeId: string) {
		if (game) {
			setGameAndAutosave(assignStaffToStore(game, staffId, storeId));
		}
	}

	function unassignStoreStaff(staffId: string) {
		if (game) {
			setGameAndAutosave(unassignStaff(game, staffId));
		}
	}

	function changeStoreProduct(storeId: string, categoryId: string, patch: StoreProductPatch): void {
		if (game) {
			setGameAndAutosave(updateStoreProduct(game, storeId, categoryId, patch));
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
			return;
		}

		if (!game) {
			const tile = getTileById(activeCity, tileId);

			if (!tile) {
				placementFeedback = 'Unknown city tile';
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
		} else {
			const next = game.stores.length + 1;
			setGameAndAutosave(
				openStoreAtTile(game, {
					tileId,
					name: `Store #${next}`,
					archetypeId
				})
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
			return;
		}

		if (!game) {
			placementFeedback = 'Found a retail store to unlock construction.';
			return;
		}

		setGameAndAutosave(buildIndustrialBuilding(game, { tileId, buildingTypeId }));
		selectedIndustryTileId = null;
		selectedTileId = null;
		selectedWorldCityId = null;
		cancelPlacement();
	}

	function closeInspector() {
		selectedTileId = null;
	}

	function closeIndustryInspector() {
		selectedIndustryTileId = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') {
			return;
		}

		if (isBuildMenuOpen) {
			isBuildMenuOpen = false;
			isViewMenuOpen = false;
			return;
		}

		if (isPlacementModeActive) {
			cancelPlacement();
			return;
		}

		if (isSavePanelOpen) {
			isSavePanelOpen = false;
			isViewMenuOpen = false;
			return;
		}

		if (activeManagementPanelId !== null) {
			activeManagementPanelId = null;
			isViewMenuOpen = false;
			return;
		}

		if (isViewMenuOpen) {
			isViewMenuOpen = false;
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
		}
	}
</script>

<svelte:head>
	<title>
		{activeMapView === 'world'
			? 'World Map'
			: activeMapView === 'industry'
				? 'Industry City Map'
				: 'Retail City Map'}
	</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="app">
	<section class="map-layout" aria-label="City planning">
		{#if activeMapView === 'world'}
			<WorldMap
				statuses={worldCityStatuses}
				selectedCityId={selectedWorldCityId}
				onSelectCity={selectWorldCityNode}
				onOpenCity={openSelectedWorldCity}
				onCloseInspector={closeWorldInspector}
			/>
		{:else if activeMapView === 'retail'}
			<CityMap snapshot={mapSnapshot} onTileSelected={selectTile} />
		{:else}
			<IndustryMap snapshot={industryMapSnapshot} onTileSelected={selectIndustryTile} />
		{/if}
		<div class="map-hud" aria-label="Map controls">
			<div class="map-title plaque" aria-label="Map title">
				<span class="bookmark map-title-bookmark" aria-hidden="true"></span>
				<p class="eyebrow">
					{activeMapView === 'world'
						? 'World Map'
						: activeMapView === 'industry'
							? 'Industry City Map'
							: 'Retail City Map'}
				</p>
				<h1>
					{activeMapView === 'world'
						? 'Regional Network'
						: activeMapView === 'industry'
							? industryCity.name
							: activeCity.name}
				</h1>
				{#if activeMapView === 'world'}
					{#if game}
						<p class="status">
							Day <span class="ticker">{game.day}</span> ·
							<span class="ticker">{game.world.openedCityIds.length}</span> cities open
						</p>
					{:else}
						<p class="status">Found a store to unlock the regional network.</p>
					{/if}
				{:else if activeMapView === 'industry'}
					{#if game}
						<p class="status">
							Day <span class="ticker">{game.day}</span> ·
							<span class="ticker">{game.industrialBuildings.length}</span> industrial buildings
						</p>
					{:else}
						<p class="status">Found a store to unlock construction.</p>
					{/if}
				{:else if game}
					<p class="status">
						Day <span class="ticker">{game.day}</span> ·
						<span class="ticker">${game.cash.toLocaleString('en-US')}</span> cash
					</p>
				{:else}
					<p class="status">Select an unlocked tile to found your first store.</p>
				{/if}
			</div>

			<div class="map-actions">
				<button
					type="button"
					class="map-icon-button btn-icon"
					aria-label="Build"
					aria-pressed={isPlacementModeActive}
					disabled={activeMapView === 'world'}
					onclick={openBuildMenu}
				>
					<svg aria-hidden="true" viewBox="0 0 24 24">
						<path d="M4 20h16" />
						<path d="M6 20V8l6-4 6 4v12" />
						<path d="M9 20v-6h6v6" />
					</svg>
				</button>

				{#if game}
					<div class="hud-status plaque" role="status" aria-label="Company status">
						<strong class="ticker">${game.cash.toLocaleString('en-US')}</strong>
						<span>cash</span>
					</div>
					<button
						type="button"
						class="map-icon-button btn-icon primary"
						aria-label="Advance day"
						onclick={advanceDay}
					>
						<svg aria-hidden="true" viewBox="0 0 24 24">
							<path d="M5 4.75v14.5l6.75-7.25L5 4.75Z" />
							<path d="M13 4.75v14.5L19.75 12 13 4.75Z" />
						</svg>
					</button>
				{/if}

				<div class="hud-menu">
					<button
						type="button"
						class="map-icon-button btn-icon"
						aria-label="Open menu"
						aria-haspopup="menu"
						aria-expanded={isViewMenuOpen}
						onclick={toggleViewMenu}
					>
						<svg aria-hidden="true" viewBox="0 0 24 24">
							<path d="M4 6.5h16" />
							<path d="M4 12h16" />
							<path d="M4 17.5h16" />
						</svg>
					</button>

					{#if isViewMenuOpen}
						<div class="hud-dropdown paper" role="menu" aria-label="Map menu">
							<button
								type="button"
								role="menuitem"
								class:active-view={activeMapView === 'world'}
								disabled={!game}
								onclick={showWorldMap}
							>
								World Map
							</button>
							<button
								type="button"
								role="menuitem"
								class:active-view={activeMapView === 'retail'}
								onclick={showRetailMap}
							>
								Retail City Map
							</button>
							<button
								type="button"
								role="menuitem"
								class:active-view={activeMapView === 'industry'}
								onclick={showIndustryMap}
							>
								Industry City Map
							</button>
							<button type="button" role="menuitem" onclick={openSavePanel}>Saves</button>
							{#each managementPanelMenuItems as item (item.id)}
								<button type="button" role="menuitem" onclick={() => openManagementPanel(item.id)}>
									{item.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
		{#if isPlacementModeActive}
			<div class="placement-status plaque" role="status" aria-label="Placement status">
				<span>{placementFeedback ?? 'Choose a highlighted tile to build.'}</span>
				<button type="button" class="btn-danger" onclick={cancelPlacement}>Cancel</button>
			</div>
		{/if}
		{#if isBuildMenuOpen && activeMapView !== 'world'}
			<BuildMenu
				activeMapView={activeMapView === 'industry' ? 'industry' : 'retail'}
				retailOptions={retailBuildOptions}
				{industryLockedReason}
				onChooseRetail={armRetailPlacement}
				onChooseIndustry={armIndustryPlacement}
				onClose={closeBuildMenu}
			/>
		{/if}
		{#if selectedTile && shouldShowRetailInspector}
			<div
				class="inspector-overlay paper"
				role="dialog"
				aria-modal="false"
				aria-label="Tile details"
			>
				<TileInspector
					game={game ?? starterMapState}
					tile={selectedTile}
					store={selectedStore}
					staff={game?.staff ?? []}
					hiringCandidates={game?.hiringCandidates ?? []}
					latestStoreReport={latestSelectedStoreReport}
					onUpdateStoreProduct={changeStoreProduct}
					onHireStaff={hireStaff}
					onAssignStaff={assignStaff}
					onUnassignStaff={unassignStoreStaff}
					onClose={closeInspector}
				/>
			</div>
		{/if}
		{#if selectedIndustryTile && shouldShowIndustryInspector}
			<div
				class="inspector-overlay paper"
				role="dialog"
				aria-modal="false"
				aria-label="Industry tile details"
			>
				<IndustryTileInspector
					game={game ?? starterMapState}
					tile={selectedIndustryTile}
					building={selectedIndustryBuilding}
					onClose={closeIndustryInspector}
				/>
			</div>
		{/if}
	</section>

	{#if game && activeManagementPanel}
		<div class="tower-backdrop">
			<button
				type="button"
				class="tower-backdrop-button"
				aria-label={`Dismiss ${activeManagementPanel.label}`}
				onclick={closeManagementPanel}
			></button>
			<div
				class="control-tower-overlay paper"
				role="dialog"
				aria-modal="true"
				aria-label={activeManagementPanel.label}
			>
				<div class="tower-header">
					<div>
						<p class="eyebrow">Management</p>
						<h2>{activeManagementPanel.label}</h2>
					</div>
					<div
						class="tower-actions"
						role="group"
						aria-label={`${activeManagementPanel.label} status`}
					>
						<span class="ticker">Day {game.day}</span>
						<strong class="ticker">${game.cash.toLocaleString('en-US')} cash</strong>
						<button
							type="button"
							class="close-tower btn-danger"
							aria-label={`Close ${activeManagementPanel.label}`}
							onclick={closeManagementPanel}
						>
							Close
						</button>
					</div>
				</div>

				{#if activeManagementPanel.id === 'dashboard'}
					<Scorecard scorecard={game.scorecard} />
				{:else if activeManagementPanel.id === 'policies'}
					<PolicyPanel policy={game.policy} onChange={changePolicy} />
				{:else if activeManagementPanel.id === 'staff'}
					<StaffPanel
						stores={game.stores}
						staff={game.staff}
						hiringCandidates={game.hiringCandidates}
						onHire={hireStaff}
						onAssign={assignStaff}
						onUnassign={unassignStoreStaff}
					/>
				{:else if activeManagementPanel.id === 'stores'}
					<StoreOverview
						stores={game.stores}
						staff={game.staff}
						latestReports={summary.latest?.storeReports ?? []}
					/>
				{:else if activeManagementPanel.id === 'decisions'}
					<DecisionQueue decisions={game.decisions} onResolve={chooseDecision} />
				{:else if activeManagementPanel.id === 'reports'}
					<ReportsPanel {summary} />
				{:else if activeManagementPanel.id === 'productChains'}
					<ProductChainsPanel {game} />
				{/if}
			</div>
		</div>
	{/if}

	{#if isSavePanelOpen}
		<SavePanel
			activeGame={game}
			{autoSave}
			slots={manualSaveSlots}
			status={saveStatus}
			error={saveError}
			onResumeAutoSave={resumeAutoSave}
			onSaveSlot={saveManualSlot}
			onLoadSlot={loadManualSlot}
			onDeleteSlot={deleteManualSlot}
			onClose={closeSavePanel}
		/>
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

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 400;
		line-height: 1.05;
		color: var(--ink-700);
	}

	h1::before {
		content: '';
		display: block;
		width: 2.5rem;
		height: 1px;
		margin-bottom: 0.5rem;
		background: var(--brass-500);
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

	.map-hud {
		position: absolute;
		inset: 1rem 1rem auto;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		pointer-events: none;
	}

	.map-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		pointer-events: auto;
	}

	.map-title {
		position: relative;
		max-width: min(24rem, calc(100vw - 8rem));
		padding: 0.75rem 0.95rem;
	}

	.map-title-bookmark {
		left: 1rem;
	}

	.status {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.9rem;
	}

	.ticker {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	.placement-status {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		z-index: 22;
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

	.hud-menu {
		position: relative;
	}

	.hud-status {
		display: grid;
		gap: 0.05rem;
		min-width: 7.5rem;
		padding: 0.55rem 0.75rem;
	}

	.hud-status strong {
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--ink-700);
		white-space: nowrap;
	}

	.hud-status span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.hud-dropdown {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: 0;
		z-index: 30;
		min-width: 200px;
		padding: 0.45rem;
		animation: none;
	}

	.hud-dropdown button {
		width: 100%;
		padding: 0.6rem 0.7rem;
		border: 0;
		background: transparent;
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.88rem;
		text-align: left;
		border-radius: 2px;
	}

	.hud-dropdown button:hover,
	.hud-dropdown button:focus-visible {
		background: var(--paper-200);
	}

	.hud-dropdown button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.hud-dropdown button.active-view {
		background: var(--paper-300);
		color: var(--ink-900);
		font-weight: 700;
	}

	.primary {
		background-color: var(--moss) !important;
		border-color: var(--ink-900) !important;
		color: var(--paper-50) !important;
		transform: rotate(-0.6deg);
	}

	.primary:hover,
	.primary:focus-visible {
		background-color: var(--moss-2) !important;
	}

	.inspector-overlay {
		position: absolute;
		top: 5.9rem;
		right: 1rem;
		z-index: 10;
		width: min(360px, calc(100% - 2rem));
		max-height: calc(100dvh - 6.9rem);
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

	@media (max-width: 980px) {
		.map-hud {
			align-items: flex-start;
			inset: 0.75rem 0.75rem auto;
		}

		.inspector-overlay {
			position: fixed;
			inset: auto 0 0;
			width: auto;
			max-height: 60dvh;
		}

		.map-title {
			max-width: min(18rem, calc(100vw - 7rem));
			padding: 0.65rem 0.7rem;
		}

		.map-actions {
			gap: 0.5rem;
		}

		.hud-status {
			display: none;
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

		h1 {
			font-size: 1.5rem;
		}
	}
</style>
