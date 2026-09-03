<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import type { ScoreKey, Scorecard } from '$lib/game/types';

	let { i18n, scorecard }: { i18n: I18nBundle; scorecard: Scorecard } = $props();

	const items: { key: ScoreKey }[] = [
		{ key: 'profit' },
		{ key: 'customerSatisfaction' },
		{ key: 'staffMorale' },
		{ key: 'marketPosition' }
	];

	function gaugeColor(value: number): string {
		if (value >= 70) return 'var(--moss)';
		if (value >= 40) return 'var(--brass-700)';
		return 'var(--wax-red)';
	}
</script>

<section class="panel paper" aria-labelledby="scorecard-heading">
	<h2 id="scorecard-heading">{i18n.t('scorecard.title')}</h2>

	<div class="score-grid">
		{#each items as item (item.key)}
			{@const label = i18n.labels.scoreKey(item.key)}
			{@const value = scorecard[item.key]}
			<article class="gauge-card">
				<h3>{label}</h3>
				<svg class="dial" viewBox="0 0 72 46" aria-hidden="true">
					<path class="dial-track" d="M8 40a28 28 0 0 1 56 0" />
					{#if value > 0}
						<path
							class="dial-value"
							style:stroke={gaugeColor(value)}
							d="M8 40a28 28 0 0 1 56 0"
							pathLength="100"
							stroke-dasharray={`${value} 100`}
						/>
					{/if}
					<text x="36" y="40" text-anchor="middle">{value}</text>
				</svg>
				<meter aria-label={label} min="0" max="100" {value}>{value}</meter>
			</article>
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

	.gauge-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.8rem 0.6rem 0.65rem;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow: 0 1px 0 rgba(20, 16, 10, 0.08);
	}

	h3 {
		margin: 0;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-align: center;
	}

	.dial {
		display: block;
		width: 6.25rem;
		height: auto;
		fill: none;
		stroke-linecap: round;
	}

	.dial-track {
		stroke: var(--paper-200);
		stroke-width: 7;
	}

	.dial-value {
		stroke-width: 7;
	}

	.dial text {
		fill: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 700;
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
