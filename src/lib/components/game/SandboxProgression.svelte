<script lang="ts">
	import { getCompanyBookValue } from '$lib/game/companyBookValue';
	import { evaluateProgression } from '$lib/game/progression';
	import { evaluateMetric } from '$lib/scenarios/metrics';
	import type { GameState } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import { conditionViews, resolveScenarioContributorLabel } from '$lib/i18n/scenarioCopy';
	import ScenarioObjectivePanel from './ScenarioObjectivePanel.svelte';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
	}

	let { game, i18n }: Props = $props();

	// Live Dashboard headline (design §4): book value computed straight from
	// the game state, formatted by the shared currency formatter.
	const bookValueLabel = $derived(i18n.format.currency(getCompanyBookValue(game).total));
	const progression = $derived(evaluateProgression(game));
	const currentTier = $derived(progression.currentTier);
	const currentTierHeading = $derived(
		currentTier
			? i18n.t('progression.panel.nextMilestone', { tier: i18n.t(currentTier.tier.titleKey) })
			: ''
	);
	const tierRows = $derived(
		currentTier
			? conditionViews(
					currentTier.tier.goals,
					currentTier.goals.map((goal) => ({
						conditionId: goal.goal.id,
						status: goal.passes ? ('satisfied' as const) : ('pending' as const),
						evidence: goal.evidence
					})),
					i18n,
					(id) => resolveScenarioContributorLabel(game, id, i18n)
				)
			: []
	);
	const finalSummary = $derived(
		progression.allTiersClaimed
			? {
					claimedOnDay: game.progression.claims.at(-1)?.claimedOnDay ?? game.day,
					peakBookValue: evaluateMetric(
						game,
						{ metric: 'peak-company-book-value' },
						{ kind: 'run-to-date' }
					).actual,
					storeCap: game.storeCap
				}
			: null
	);
</script>

<section id="sandbox-progression" class="panel paper" aria-labelledby="sandbox-progression-title">
	<h2 id="sandbox-progression-title">{i18n.t('progression.panel.title')}</h2>
	<p class="book-value">
		<span>{i18n.t('progression.panel.bookValue')}</span>
		<strong>{bookValueLabel}</strong>
	</p>
	{#if currentTier}
		<p class="reward">{i18n.t('progression.panel.reward')}</p>
		<ScenarioObjectivePanel
			id="sandbox-progression-objectives"
			view={{ required: tierRows, optional: [], failures: [], deadlineLabel: null }}
			requiredHeading={currentTierHeading}
			{i18n}
		/>
	{:else if finalSummary}
		<h3>{i18n.t('progression.panel.completeHeading')}</h3>
		<ul class="final-summary">
			<li>
				{i18n.t('progression.panel.claimedOnDay', {
					day: i18n.format.integer(finalSummary.claimedOnDay)
				})}
			</li>
			<li>
				{i18n.t('progression.panel.peakBookValue', {
					value: i18n.format.currency(finalSummary.peakBookValue)
				})}
			</li>
			<li>
				{i18n.t('progression.panel.storeCap', { cap: i18n.format.integer(finalSummary.storeCap) })}
			</li>
		</ul>
		<!-- Play never ends: no "continue" action is offered here by design. -->
	{/if}
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}
	h2 {
		margin: 0 0 0.6rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}
	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}
	.book-value {
		margin: 0 0 0.6rem;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem 0.8rem;
	}
	.book-value span {
		color: var(--ink-500);
		font-size: 0.85rem;
	}
	.book-value strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 1.35rem;
		color: var(--ink-900);
	}
	.reward {
		margin: 0 0 0.6rem;
		color: var(--ink-500);
		font-size: 0.85rem;
	}
	.final-summary {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.3rem;
		color: var(--ink-700);
	}
	@media (max-width: 600px) {
		.book-value strong {
			font-size: 1.15rem;
		}
	}
</style>
