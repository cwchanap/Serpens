<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import type { ScenarioProgressViewModel } from '$lib/i18n/scenarioCopy';

	interface Props {
		view: ScenarioProgressViewModel;
		i18n: I18nBundle;
		expanded: boolean;
		pending: boolean;
		error: string | null;
		onToggle: () => void;
		onRetry: () => void | Promise<void>;
		onDismissError: () => void;
	}

	let { view, i18n, expanded, pending, error, onToggle, onRetry, onDismissError }: Props = $props();
</script>

<section class="scenario-strip" aria-label={i18n.t('scenarioObjectives.heading')}>
	<div class="summary">
		<strong>{view.title} · {view.eligibilityLabel}</strong>
		<span>{view.dayLabel} · {view.remainingLabel}</span>
		<span>{view.requiredProgressLabel} · {view.optionalProgressLabel}</span>
		<span>{view.scoreLabel} · {view.medalLabel}</span>
		<button
			type="button"
			aria-expanded={expanded}
			aria-controls="scenario-objective-panel"
			onclick={onToggle}
		>
			{i18n.t(expanded ? 'scenarioStatus.hideDetails' : 'scenarioStatus.showDetails')}
		</button>
	</div>
	{#if view.modifierLabels.length > 0}
		<ul class="modifiers">
			{#each view.modifierLabels as modifier (modifier)}
				<li>{modifier}</li>
			{/each}
		</ul>
	{/if}
	{#if view.riskLabels.length > 0}
		<ul class="risks">
			{#each view.riskLabels as risk, index (`${index}:${risk}`)}
				<li>{risk}</li>
			{/each}
		</ul>
	{/if}
	<div class="live" aria-live="polite">{view.announcement}</div>
	{#if error}
		<div class="error" role="alert" aria-live="assertive">
			<span>{error}</span>
			<button type="button" disabled={pending} onclick={() => void onRetry()}>
				{i18n.t('scenarioCatalog.retry')}
			</button>
			<button type="button" disabled={pending} onclick={onDismissError}>
				{i18n.t('scenarioStatus.dismiss')}
			</button>
		</div>
	{/if}
</section>

<style>
	.scenario-strip {
		display: grid;
		gap: 0.4rem;
		border-bottom: 1px solid var(--brass-500);
		background: var(--paper-100);
		padding: 0.5rem 0.8rem;
		color: var(--ink-700);
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 1rem;
		align-items: center;
	}
	.summary button {
		margin-left: auto;
	}
	.modifiers,
	.risks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		margin: 0;
		padding-left: 1.2rem;
	}
	.risks {
		color: var(--wax-red);
	}
	.live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.error {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		border-left: 3px solid var(--wax-red);
		padding: 0.35rem 0.5rem;
	}
</style>
