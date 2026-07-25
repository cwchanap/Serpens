<script lang="ts">
	import { tick } from 'svelte';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import type { I18nBundle } from '$lib/i18n';
	import type { ScenarioResultsViewModel } from '$lib/i18n/scenarioCopy';
	import ScenarioObjectivePanel from './ScenarioObjectivePanel.svelte';

	interface Props {
		view: ScenarioResultsViewModel;
		i18n: I18nBundle;
		pending: boolean;
		error: string | null;
		onRestart: () => void | Promise<void>;
		onCatalog: () => void | Promise<void>;
		onSandbox: () => void | Promise<void>;
		onRetry: () => void | Promise<void>;
		onDismissError: () => void | Promise<void>;
		onClose: () => void;
	}

	let {
		view,
		i18n,
		pending,
		error,
		onRestart,
		onCatalog,
		onSandbox,
		onRetry,
		onDismissError,
		onClose
	}: Props = $props();
	let restartButton: HTMLButtonElement;

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		onClose();
	}

	async function dismissError(): Promise<void> {
		await onDismissError();
		await tick();
		restartButton?.focus({ preventScroll: true });
	}

	async function retryError(): Promise<void> {
		await onRetry();
		await tick();
		// Mirror dismissError: a successful retry clears the error block and would
		// leave focus on document.body. Refocus the stable primary action.
		restartButton?.focus({ preventScroll: true });
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
		{#if error}
			<div class="error" role="alert" aria-live="assertive">
				<span>{error}</span>
				<button type="button" disabled={pending} onclick={() => void retryError()}>
					{i18n.t('scenarioCatalog.retry')}
				</button>
				<button type="button" disabled={pending} onclick={() => void dismissError()}>
					{i18n.t('scenarioStatus.dismiss')}
				</button>
			</div>
		{/if}
		<div class="actions">
			<button
				bind:this={restartButton}
				type="button"
				disabled={pending}
				onclick={() => void onRestart()}
			>
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
	.error {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.8rem;
		border-left: 3px solid var(--wax-red);
		padding: 0.35rem 0.5rem;
	}
	.live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
