<script lang="ts">
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import { ARCHETYPES } from '$lib/game/archetypes';
	import { summarizeReports } from '$lib/game/reports';
	import { createNewGame, openStore, resolveDecision, updatePolicy } from '$lib/game/state';
	import { simulateDay } from '$lib/game/simulateDay';
	import type { ArchetypeId, CompanyPolicy, GameState } from '$lib/game/types';

	let game: GameState | null = $state(null);
	let summary = $derived.by(() => {
		const currentGame: GameState | null = game;
		return currentGame ? summarizeReports(currentGame.reports) : summarizeReports([]);
	});

	function start(archetypeId: ArchetypeId) {
		game = createNewGame(archetypeId, 20260502);
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

	function addStore() {
		if (!game) {
			return;
		}

		const next = game.stores.length + 1;
		game = openStore(game, {
			name: `Store #${next}`,
			location: next === 2 ? 'West Mall' : 'North Campus'
		});
	}
</script>

<svelte:head>
	<title>Retail Control Tower</title>
</svelte:head>

{#if game === null}
	<main class="start">
		<section>
			<p class="eyebrow">Retail Business Simulation</p>
			<h1>Choose your first store</h1>
			<div class="archetypes">
				{#each ARCHETYPES as archetype (archetype.id)}
					<button type="button" onclick={() => start(archetype.id)}>
						<strong>{archetype.name}</strong>
						<span>{archetype.description}</span>
					</button>
				{/each}
			</div>
		</section>
	</main>
{:else}
	<main class="app">
		<header>
			<div>
				<p class="eyebrow">Control Tower</p>
				<h1>Day {game.day}</h1>
			</div>

			<div class="top-actions">
				<strong>${game.cash.toLocaleString('en-US')} cash</strong>
				<button type="button" onclick={addStore}>Open store</button>
				<button type="button" class="primary" onclick={advanceDay}>Advance day</button>
			</div>
		</header>

		<Scorecard scorecard={game.scorecard} />
		<PolicyPanel policy={game.policy} onChange={changePolicy} />

		<div class="grid">
			<StoreOverview stores={game.stores} latestReports={summary.latest?.storeReports ?? []} />
			<DecisionQueue decisions={game.decisions} onResolve={chooseDecision} />
		</div>

		<ReportsPanel {summary} />
	</main>
{/if}

<style>
	.start,
	.app {
		width: min(1180px, calc(100vw - 2rem));
		margin: 0 auto;
		padding: 1.5rem 0;
	}

	.start {
		display: grid;
		min-height: 100vh;
		align-items: center;
	}

	.start section {
		max-width: 980px;
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		color: #81b4ff;
		font-size: 0.76rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: 2.6rem;
		line-height: 1;
	}

	.archetypes {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.8rem;
		margin-top: 1.5rem;
	}

	.archetypes button,
	.top-actions button {
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #151f2d;
		color: #edf2f7;
	}

	.archetypes button {
		display: grid;
		min-width: 0;
		gap: 0.55rem;
		padding: 1rem;
		text-align: left;
	}

	.archetypes button:hover,
	.archetypes button:focus-visible,
	.top-actions button:hover,
	.top-actions button:focus-visible {
		border-color: #5f8fd0;
		background: #1b2a3d;
	}

	.archetypes span {
		color: #a7b4c8;
		font-size: 0.9rem;
	}

	.app {
		display: grid;
		gap: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
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

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
		gap: 1rem;
		align-items: start;
	}

	@media (max-width: 980px) {
		.archetypes,
		.grid {
			grid-template-columns: 1fr;
		}

		header,
		.top-actions {
			align-items: stretch;
			flex-direction: column;
		}

		h1 {
			font-size: 2.1rem;
		}
	}
</style>
