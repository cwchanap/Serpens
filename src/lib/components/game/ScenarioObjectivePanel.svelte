<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import type {
		ScenarioEvidenceViewModel,
		ScenarioProgressViewModel
	} from '$lib/i18n/scenarioCopy';

	interface Props {
		view: Pick<ScenarioProgressViewModel, 'required' | 'optional' | 'failures' | 'deadlineLabel'>;
		i18n: I18nBundle;
	}

	let { view, i18n }: Props = $props();
</script>

{#snippet evidenceSection(title: string, items: ScenarioEvidenceViewModel[])}
	{#if items.length > 0}
		<section>
			<h3>{title}</h3>
			<div class="objective-list">
				{#each items as item (item.id)}
					<article>
						<header>
							<h4>{item.label}</h4>
							<strong>{item.statusLabel}</strong>
						</header>
						<p>{item.evidenceLabel}</p>
						<p>{item.windowLabel}</p>
						<p class="contributors">
							{i18n.t('scenarioObjectives.contributors')}:
							{item.contributorLabels.length > 0
								? i18n.format.list(item.contributorLabels)
								: i18n.t('scenarioObjectives.noContributors')}
						</p>
					</article>
				{/each}
			</div>
		</section>
	{/if}
{/snippet}

<div id="scenario-objective-panel" class="objective-panel">
	{@render evidenceSection(i18n.t('scenarioObjectives.requiredHeading'), view.required)}
	{@render evidenceSection(i18n.t('scenarioObjectives.optionalHeading'), view.optional)}
	{@render evidenceSection(i18n.t('scenarioObjectives.failuresHeading'), view.failures)}
	{#if view.deadlineLabel}<p class="deadline">{view.deadlineLabel}</p>{/if}
</div>

<style>
	.objective-panel {
		display: grid;
		gap: 0.8rem;
		border-bottom: 1px solid var(--brass-500);
		background: var(--paper-50);
		padding: 0.8rem;
		color: var(--ink-700);
	}
	section,
	.objective-list {
		display: grid;
		gap: 0.5rem;
	}
	h3,
	h4,
	p {
		margin: 0;
	}
	article {
		border: 1px solid var(--paper-edge);
		padding: 0.6rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.contributors {
		color: var(--ink-500);
	}
	.deadline {
		font-weight: 700;
	}
</style>
