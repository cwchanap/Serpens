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
				<div class="dial-wrap">
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
					</svg>
					<strong class="dial-value-text">{i18n.format.integer(value)}</strong>
				</div>
				<meter aria-label={label} min="0" max="100" {value}>{value}</meter>
			</article>
		{/each}
	</div>
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
		display: flex;
		flex-direction: column;
	}

	h2 {
		margin: 0 0 0.9rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.score-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-template-rows: minmax(0, 1fr);
		flex: 1 1 auto;
		gap: 1.4rem;
	}

	.gauge-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		min-width: 0;
		min-height: 0;
		padding: 1.3rem 0.75rem 1.1rem;
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
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		text-align: center;
	}

	.dial {
		display: block;
		width: min(11rem, 100%);
		height: auto;
		fill: none;
		stroke-linecap: round;
	}

	.dial-wrap {
		position: relative;
		width: min(11rem, 100%);
		flex: none;
	}

	.dial-value-text {
		position: absolute;
		inset-inline: 0;
		bottom: 1rem;
		text-align: center;
		line-height: 1;
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 1.85rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums lining-nums;
	}

	.dial-track {
		stroke: var(--paper-200);
		stroke-width: 9;
	}

	.dial-value {
		stroke-width: 9;
	}

	meter {
		width: min(9rem, 100%);
		height: 0.5rem;
		border-radius: 0;
		flex: none;
	}

	@media (max-width: 760px) {
		.score-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.dial,
		.dial-wrap {
			width: min(8rem, 100%);
		}

		.dial-value-text {
			font-size: 1.35rem;
			bottom: 0.73rem;
		}
	}
</style>
