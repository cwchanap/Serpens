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

<section class="panel paper" aria-labelledby="scorecard-heading">
	<h2 id="scorecard-heading">Scorecard</h2>

	<div class="score-grid">
		{#each items as item (item.key)}
			<div class="score-item">
				<div class="score-label">
					<span>{item.label}</span>
					<strong>{scorecard[item.key]}</strong>
				</div>
				<meter aria-label={item.label} min="0" max="100" value={scorecard[item.key]}>
					{scorecard[item.key]}
				</meter>
			</div>
		{/each}
	</div>
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.score-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
	}

	.score-item {
		display: grid;
		min-width: 0;
		gap: 0.4rem;
	}

	.score-label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	span {
		min-width: 0;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 1.4rem;
		color: var(--ink-700);
		line-height: 1;
	}

	meter {
		width: 100%;
		height: 0.45rem;
		border-radius: 0;
	}

	@media (max-width: 760px) {
		.score-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
