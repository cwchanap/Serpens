<script lang="ts">
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import CityMap from '$lib/components/game/CityMap.svelte';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import TileInspector from '$lib/components/game/TileInspector.svelte';
	import { generateCity, getTileById } from '$lib/game/city';
	import { createCityMapSnapshot } from '$lib/game/mapRender';
	import {
		createFoundingGameAtTile,
		forecastOpening,
		getRecommendedArchetypes,
		openStoreAtTile
	} from '$lib/game/placement';
	import { summarizeReports } from '$lib/game/reports';
	import {
		DEFAULT_POLICY,
		getExpansionSetupCost,
		resolveDecision,
		updatePolicy
	} from '$lib/game/state';
	import { simulateDay } from '$lib/game/simulateDay';
	import type { ArchetypeId, CompanyPolicy, GameState } from '$lib/game/types';
	import { MAX_STORES } from '$lib/game/types';

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
	let forecast = $derived(
		selectedTile && recommendations[0] ? forecastOpening(selectedTile, recommendations[0]) : null
	);
	let expansionSetupCost = $derived.by(() => {
		const currentGame: GameState | null = game;
		const archetypeId = currentGame?.stores[0]?.archetypeId;
		return selectedTile && archetypeId ? getExpansionSetupCost(selectedTile, archetypeId) : null;
	});
	let openStoreDisabledReason = $derived.by(() => {
		const currentGame: GameState | null = game;

		if (!currentGame) {
			return 'Game not started';
		}

		if (!selectedTile) {
			return 'Select a tile';
		}

		if (selectedTile.locked) {
			return 'Locked location';
		}

		if (selectedStore) {
			return 'Occupied location';
		}

		if (currentGame.stores.length >= MAX_STORES) {
			return 'Store limit reached';
		}

		if (expansionSetupCost !== null && currentGame.cash < expansionSetupCost) {
			return `Requires ${expansionSetupCost.toLocaleString('en-US')} cash`;
		}

		return null;
	});
	let canOpenStore = $derived(openStoreDisabledReason === null);
	let mapSnapshot = $derived(createCityMapSnapshot(game ?? starterMapState, selectedTileId));

	function selectTile(tileId: string) {
		selectedTileId = tileId;
	}

	function foundStore(archetypeId: ArchetypeId) {
		if (!selectedTileId || !selectedTile || selectedTile.locked) {
			return;
		}

		game = createFoundingGameAtTile({
			archetypeId,
			city: starterCity,
			tileId: selectedTileId,
			seed: 20260503
		});
	}

	function advanceDay() {
		if (game) {
			game = simulateDay(game);
		}
	}

	function changePolicy(patch: Partial<CompanyPolicy>) {
		if (game) {
			game = updatePolicy(game, patch);
		}
	}

	function chooseDecision(decisionId: string, optionId: string) {
		if (game) {
			game = resolveDecision(game, decisionId, optionId);
		}
	}

	function addStoreAtSelectedTile() {
		if (!game || !selectedTileId) {
			return;
		}

		const next = game.stores.length + 1;
		game = openStoreAtTile(game, {
			tileId: selectedTileId,
			name: `Store #${next}`
		});
	}
</script>

<svelte:head>
	<title>Retail City Map</title>
</svelte:head>

<main class="app">
	<header>
		<div>
			<p class="eyebrow">Retail City Map</p>
			<h1>{activeCity.name}</h1>
		</div>

		{#if game}
			<div class="top-actions">
				<strong>${game.cash.toLocaleString('en-US')} cash</strong>
				<button type="button" class="primary" onclick={advanceDay}>Advance day</button>
			</div>
		{:else}
			<p class="status">Select an unlocked tile to found your first store.</p>
		{/if}
	</header>

	<section class="map-layout" aria-label="City planning">
		<CityMap snapshot={mapSnapshot} onTileSelected={selectTile} />
		<TileInspector
			tile={selectedTile}
			store={selectedStore}
			{forecast}
			{recommendations}
			gameStarted={game !== null}
			{canOpenStore}
			disabledReason={openStoreDisabledReason}
			onFoundStore={foundStore}
			onOpenStore={addStoreAtSelectedTile}
		/>
	</section>

	{#if game}
		<Scorecard scorecard={game.scorecard} />
		<PolicyPanel policy={game.policy} onChange={changePolicy} />

		<div class="grid">
			<StoreOverview stores={game.stores} latestReports={summary.latest?.storeReports ?? []} />
			<DecisionQueue decisions={game.decisions} onResolve={chooseDecision} />
		</div>

		<ReportsPanel {summary} />
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

	.top-actions strong {
		white-space: nowrap;
	}

	.top-actions button {
		padding: 0.7rem 0.9rem;
		white-space: nowrap;
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
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
		gap: 1rem;
		align-items: stretch;
		min-height: 680px;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
		gap: 1rem;
		align-items: start;
	}

	@media (max-width: 980px) {
		.map-layout,
		.grid {
			grid-template-columns: 1fr;
		}

		.map-layout {
			min-height: 0;
		}

		header,
		.top-actions {
			align-items: stretch;
			flex-direction: column;
		}

		h1 {
			font-size: 1.7rem;
		}
	}
</style>
