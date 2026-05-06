<script lang="ts">
	import { onMount } from 'svelte';
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import CityMap from '$lib/components/game/CityMap.svelte';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import SavePanel from '$lib/components/game/SavePanel.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import TileInspector from '$lib/components/game/TileInspector.svelte';
	import { generateCity, getTileById, getTilePlacementBlockReason } from '$lib/game/city';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import {
		createFoundingGameAtTile,
		forecastOpening,
		getRecommendedArchetypes,
		openStoreAtTile
	} from '$lib/game/placement';
	import { summarizeReports } from '$lib/game/reports';
	import { DEFAULT_POLICY, resolveDecision, updatePolicy } from '$lib/game/state';
	import { simulateDay } from '$lib/game/simulateDay';
	import type { ArchetypeId, CompanyPolicy, GameState, OpeningOption } from '$lib/game/types';
	import { MAX_STORES } from '$lib/game/types';
	import type { SaveRepository } from '$lib/persistence/saveRepository';
	import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

	const starterCity = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: 20,
		height: 20,
		seed: 20260503
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
		cities: [starterCity],
		activeCityId: starterCity.id,
		stores: [],
		decisions: [],
		reports: []
	};

	let game: GameState | null = $state(null);
	let selectedTileId = $state<string | null>(null);
	let isViewMenuOpen = $state(false);
	let isControlTowerOpen = $state(false);
	let saveRepository: SaveRepository | null = $state(null);
	let autoSave = $state<SaveSlotMetadata | null>(null);
	let manualSaveSlots = $state<SaveSlotMetadata[]>([]);
	let isSavePanelOpen = $state(false);
	let saveStatus = $state('');
	let saveError = $state<string | null>(null);
	let summary = $derived.by(() => {
		const currentGame: GameState | null = game;
		return currentGame ? summarizeReports(currentGame.reports) : summarizeReports([]);
	});
	let activeCity = $derived.by(() => {
		const currentGame: GameState | null = game;
		return currentGame?.cities.find((city) => city.id === currentGame.activeCityId) ?? starterCity;
	});
	let selectedTile = $derived(
		selectedTileId ? (getTileById(activeCity, selectedTileId) ?? null) : null
	);
	let selectedStore = $derived.by(() => {
		const currentGame: GameState | null = game;
		return selectedTileId
			? (currentGame?.stores.find((store) => store.tileId === selectedTileId) ?? null)
			: null;
	});
	let recommendations = $derived(selectedTile ? getRecommendedArchetypes(selectedTile) : []);
	let openingOptions = $derived.by<OpeningOption[]>(() => {
		const tile = selectedTile;

		if (!tile) {
			return [];
		}

		return recommendations.map((archetypeId) => {
			const optionForecast = forecastOpening(tile, archetypeId);

			return {
				archetypeId,
				forecast: optionForecast,
				disabledReason: getOpenStoreDisabledReason(optionForecast.setupCost)
			};
		});
	});
	let selectedTileDisabledReason = $derived.by(() => getSelectedTileDisabledReason());
	let mapSnapshot = $derived(createCityMapSnapshot(game ?? starterMapState, selectedTileId));

	onMount(() => {
		void initializeSaves();
	});

	function selectTile(tileId: string) {
		selectedTileId = tileId;
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

	function getSelectedTileDisabledReason(): string | null {
		const currentGame: GameState | null = game;

		if (!selectedTile) {
			return 'Select a tile';
		}

		const tileBlockReason = getTilePlacementBlockReason(selectedTile);

		if (tileBlockReason) {
			return tileBlockReason;
		}

		if (selectedStore) {
			return 'Occupied location';
		}

		if (currentGame && currentGame.stores.length >= MAX_STORES) {
			return 'Store limit reached';
		}

		return null;
	}

	function getOpenStoreDisabledReason(setupCost: number): string | null {
		const tileReason = getSelectedTileDisabledReason();
		const currentGame: GameState | null = game;

		if (tileReason) {
			return tileReason;
		}

		if (currentGame && currentGame.cash < setupCost) {
			return `Requires ${setupCost.toLocaleString('en-US')} cash`;
		}

		return null;
	}

	function toggleViewMenu() {
		isViewMenuOpen = !isViewMenuOpen;
	}

	function openControlTower() {
		isViewMenuOpen = false;
		isControlTowerOpen = true;
	}

	function closeControlTower() {
		isControlTowerOpen = false;
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

	function foundStore(archetypeId: ArchetypeId, tileId: string) {
		const tile = getTileById(starterCity, tileId);

		if (!tile || getTilePlacementBlockReason(tile)) {
			return;
		}

		selectedTileId = tile.id;
		setGameAndAutosave(
			createFoundingGameAtTile({
				archetypeId,
				city: starterCity,
				tileId: tile.id,
				seed: 20260503
			})
		);
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

	function addStoreAtSelectedTile(archetypeId: ArchetypeId, tileId: string) {
		if (!game || !getTileById(activeCity, tileId)) {
			return;
		}

		const next = game.stores.length + 1;
		selectedTileId = tileId;
		setGameAndAutosave(
			openStoreAtTile(game, {
				tileId,
				name: `Store #${next}`,
				archetypeId
			})
		);
	}

	function closeInspector() {
		selectedTileId = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') {
			return;
		}

		if (isSavePanelOpen) {
			isSavePanelOpen = false;
			isViewMenuOpen = false;
			return;
		}

		if (isControlTowerOpen) {
			isControlTowerOpen = false;
			isViewMenuOpen = false;
			return;
		}

		if (isViewMenuOpen) {
			isViewMenuOpen = false;
			return;
		}

		if (selectedTileId !== null) {
			selectedTileId = null;
		}
	}
</script>

<svelte:head>
	<title>Retail City Map</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="app">
	<header>
		<div>
			<p class="eyebrow">Retail City Map</p>
			<h1>{activeCity.name}</h1>
		</div>

		{#if game}
			<div class="top-actions">
				<button type="button" onclick={openSavePanel}>Saves</button>
				<div class="view-menu">
					<button
						type="button"
						class="view-menu-toggle"
						aria-haspopup="menu"
						aria-expanded={isViewMenuOpen}
						onclick={toggleViewMenu}
					>
						Views
					</button>

					{#if isViewMenuOpen}
						<div class="view-dropdown" role="menu" aria-label="Map views">
							<button type="button" role="menuitem" onclick={openControlTower}>
								Control Tower
							</button>
						</div>
					{/if}
				</div>
				<strong>${game.cash.toLocaleString('en-US')} cash</strong>
				<button type="button" class="primary" onclick={advanceDay}>Advance day</button>
			</div>
		{:else}
			<div class="top-actions">
				<button type="button" onclick={openSavePanel}>Saves</button>
				<p class="status">Select an unlocked tile to found your first store.</p>
			</div>
		{/if}
	</header>

	<section class="map-layout" aria-label="City planning">
		<CityMap snapshot={mapSnapshot} onTileSelected={selectTile} />
		{#if selectedTile}
			<div class="inspector-overlay" role="dialog" aria-modal="false" aria-label="Tile details">
				<TileInspector
					tile={selectedTile}
					store={selectedStore}
					{openingOptions}
					gameStarted={game !== null}
					disabledReason={selectedTileDisabledReason}
					onFoundStore={foundStore}
					onOpenStore={addStoreAtSelectedTile}
					onClose={closeInspector}
				/>
			</div>
		{/if}
	</section>

	{#if game && isControlTowerOpen}
		<div class="tower-backdrop">
			<button
				type="button"
				class="tower-backdrop-button"
				aria-label="Dismiss control tower"
				onclick={closeControlTower}
			></button>
			<div class="control-tower-overlay" role="dialog" aria-modal="true" aria-label="Control Tower">
				<div class="tower-header">
					<div>
						<p class="eyebrow">Control Tower</p>
						<h2>Management View</h2>
					</div>
					<div class="tower-actions" role="group" aria-label="Control tower status">
						<span>Day {game.day}</span>
						<strong>${game.cash.toLocaleString('en-US')} cash</strong>
						<button type="button" class="primary" onclick={advanceDay}>Advance day</button>
						<button
							type="button"
							class="close-tower"
							aria-label="Close control tower"
							onclick={closeControlTower}
						>
							Close
						</button>
					</div>
				</div>

				<Scorecard scorecard={game.scorecard} />
				<PolicyPanel policy={game.policy} onChange={changePolicy} />

				<div class="grid">
					<StoreOverview stores={game.stores} latestReports={summary.latest?.storeReports ?? []} />
					<DecisionQueue decisions={game.decisions} onResolve={chooseDecision} />
				</div>

				<ReportsPanel {summary} />
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
		width: min(1440px, calc(100vw - 2rem));
		margin: 0 auto;
		padding: 1.5rem 0;
		display: grid;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		color: #f0bd68;
		font-size: 0.76rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: 2rem;
		line-height: 1;
	}

	.top-actions button {
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #151f2d;
		color: #edf2f7;
	}

	.top-actions button:hover,
	.top-actions button:focus-visible {
		border-color: #5f8fd0;
		background: #1b2a3d;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.status {
		margin: 0;
		color: #b8b3a7;
		font-size: 0.9rem;
	}

	.top-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.view-menu {
		position: relative;
	}

	.top-actions strong {
		white-space: nowrap;
	}

	.top-actions button {
		padding: 0.7rem 0.9rem;
		white-space: nowrap;
	}

	.view-dropdown {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: 0;
		z-index: 30;
		min-width: 180px;
		padding: 0.35rem;
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #0f1724;
		box-shadow: 0 18px 40px rgb(0 0 0 / 0.35);
	}

	.view-dropdown button {
		width: 100%;
		padding: 0.65rem 0.7rem;
		border-color: transparent;
		background: transparent;
		text-align: left;
	}

	.view-dropdown button:hover,
	.view-dropdown button:focus-visible {
		border-color: #31445c;
		background: #172235;
	}

	.primary {
		border-color: #3574d6 !important;
		background: #235fae !important;
	}

	.primary:hover,
	.primary:focus-visible {
		background: #2b72cd !important;
	}

	.map-layout {
		position: relative;
		min-height: 620px;
	}

	.inspector-overlay {
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 10;
		width: min(360px, calc(100% - 2rem));
	}

	.tower-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(4 8 13 / 0.72);
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
		padding: 1rem;
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #0b111b;
		box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
	}

	.tower-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.tower-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.tower-actions span,
	.tower-actions strong {
		white-space: nowrap;
	}

	.tower-actions button {
		padding: 0.65rem 0.85rem;
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #151f2d;
		color: #edf2f7;
		white-space: nowrap;
	}

	.tower-actions button:hover,
	.tower-actions button:focus-visible {
		border-color: #5f8fd0;
		background: #1b2a3d;
	}

	h2 {
		margin: 0;
		font-size: 1.35rem;
		line-height: 1.1;
	}

	.close-tower {
		padding: 0.65rem 0.85rem;
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #151f2d;
		color: #edf2f7;
		white-space: nowrap;
	}

	.close-tower:hover,
	.close-tower:focus-visible {
		border-color: #5f8fd0;
		background: #1b2a3d;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
		gap: 1rem;
		align-items: start;
	}

	@media (max-width: 980px) {
		.grid {
			grid-template-columns: 1fr;
		}

		.map-layout {
			min-height: 460px;
		}

		.inspector-overlay {
			position: fixed;
			inset: auto 0 0;
			width: auto;
			padding: 0.75rem;
			background: linear-gradient(to top, rgb(0 0 0 / 0.5), transparent);
		}

		header,
		.top-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.view-dropdown {
			left: 0;
			right: auto;
		}

		.control-tower-overlay {
			max-height: calc(100vh - 1rem);
			padding: 0.75rem;
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
			font-size: 1.7rem;
		}
	}
</style>
