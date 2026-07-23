<script lang="ts">
	import { focusTrap } from '$lib/a11y/focusTrap';
	import type { I18nBundle } from '$lib/i18n';
	import type { ScenarioResultsViewModel } from '$lib/i18n/scenarioCopy';
	import ScenarioObjectivePanel from './ScenarioObjectivePanel.svelte';

	interface Props {
		view: ScenarioResultsViewModel;
		i18n: I18nBundle;
		pending: boolean;
		onRestart: () => void | Promise<void>;
		onCatalog: () => void | Promise<void>;
		onSandbox: () => void | Promise<void>;
		onClose: () => void;
	}

	let { view, i18n, pending, onRestart, onCatalog, onSandbox, onClose }: Props = $props();

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		onClose();
	}
</script>

<div class="results-backdrop">
	<div
		class="results paper"
		role="dialog"
		aria-modal="true"
		aria-labelledby="scenario-results-title"
		tabindex="-1"
		onkeydown={handleKeydown}
		{@attach focusTrap}
	>
		<header>
			<div>
				<p>{view.title}</p>
				<h2 id="scenario-results-title">{i18n.t('scenarioResults.title')}</h2>
			</div>
			<button type="button" aria-label={i18n.t('scenarioResults.close')} onclick={onClose}>×</button
			>
		</header>
		<h3>{view.outcomeLabel}</h3>
		<p>{view.medalLabel} · {view.scoreLabel}</p>
		<p>{view.bestLabel}</p>
		{#if view.nextMedalLabel}<p>{view.nextMedalLabel}</p>{/if}
		<ScenarioObjectivePanel {view} {i18n} />
		<div class="actions">
			<button type="button" disabled={pending} onclick={() => void onRestart()}>
				{i18n.t('scenarioCatalog.restartChallenge')}
			</button>
			<button type="button" disabled={pending} onclick={() => void onCatalog()}>
				{i18n.t('scenarioCatalog.catalog')}
			</button>
			<button type="button" disabled={pending} onclick={() => void onSandbox()}>
				{i18n.t('scenarioCatalog.returnSandbox')}
			</button>
		</div>
		<div class="live" aria-live="assertive">{view.announcement}</div>
	</div>
</div>

<style>
	.results-backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: center;
		background: rgb(20 16 10 / 75%);
		padding: 1rem;
	}
	.results {
		width: min(48rem, 100%);
		max-height: 92vh;
		overflow: auto;
		padding: 1rem;
		color: var(--ink-700);
	}
	header,
	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
	}
	header p,
	header h2,
	h3 {
		margin: 0;
	}
	.actions {
		justify-content: flex-start;
		flex-wrap: wrap;
		margin-top: 0.8rem;
	}
	.live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
