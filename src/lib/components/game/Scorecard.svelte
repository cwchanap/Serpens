<script lang="ts">
	import type { ScoreKey, Scorecard } from '$lib/game/types';

	let { scorecard }: { scorecard: Scorecard } = $props();

	const items: { key: ScoreKey; label: string }[] = [
		{ key: 'profit', label: 'Profit' },
		{ key: 'customerSatisfaction', label: 'Customers' },
		{ key: 'staffMorale', label: 'Staff' },
		{ key: 'marketPosition', label: 'Market' }
	];
</script>

<section class="panel" aria-labelledby="scorecard-heading">
	<h2 id="scorecard-heading">Scorecard</h2>

	<div class="score-grid">
		{#each items as item (item.key)}
			<div class="score-item">
				<div class="score-label">
					<span>{item.label}</span>
					<strong>{scorecard[item.key]}</strong>
				</div>
				<meter min="0" max="100" value={scorecard[item.key]}>{scorecard[item.key]}</meter>
			</div>
		{/each}
	</div>
</section>

<style>
	.panel {
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 1rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
		font-weight: 700;
	}

	.score-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.score-item {
		display: grid;
		min-width: 0;
		gap: 0.45rem;
	}

	.score-label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	span {
		min-width: 0;
		color: #a7b4c8;
		font-size: 0.78rem;
	}

	strong {
		font-size: 1.25rem;
		line-height: 1;
	}

	meter {
		width: 100%;
		height: 0.55rem;
	}

	@media (max-width: 760px) {
		.score-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
