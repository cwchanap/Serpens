<script lang="ts">
	import { focusTrap } from '$lib/a11y/focusTrap';
	import type { I18nBundle } from '$lib/i18n';
	import type {
		ScenarioCatalogActionResult,
		ScenarioCatalogCardViewModel
	} from '$lib/i18n/scenarioCopy';

	interface Props {
		cards: ScenarioCatalogCardViewModel[];
		i18n: I18nBundle;
		operationError: string | null;
		pending: boolean;
		persistenceReady: boolean;
		onStart: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onResume: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onRestart: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onStartCurrent: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onImport: (
			code: string,
			confirmed: boolean
		) => ScenarioCatalogActionResult | Promise<ScenarioCatalogActionResult>;
		onCopy: (code: string) => boolean | Promise<boolean>;
		onRetry: () => void | Promise<void>;
		onClose: () => void;
	}

	let {
		cards,
		i18n,
		operationError,
		pending,
		persistenceReady,
		onStart,
		onResume,
		onRestart,
		onStartCurrent,
		onImport,
		onCopy,
		onRetry,
		onClose
	}: Props = $props();

	let shareCode = $state('');
	let announcement = $state('');
	let confirmation = $state<
		| { kind: 'current'; card: ScenarioCatalogCardViewModel; message: string }
		| { kind: 'import'; code: string; message: string }
		| null
	>(null);

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		if (confirmation) {
			confirmation = null;
		} else {
			onClose();
		}
	}

	async function importCode(): Promise<void> {
		const code = shareCode.trim();
		if (!code) return;
		const result = await onImport(code, false);
		if (result.status === 'confirmation-required') {
			confirmation = { kind: 'import', code, message: result.message };
			announcement = '';
		} else if (result.status === 'error') {
			announcement = result.message;
		} else {
			announcement = '';
		}
	}

	async function confirmReplacement(): Promise<void> {
		const pendingConfirmation = confirmation;
		confirmation = null;
		if (!pendingConfirmation) return;
		if (pendingConfirmation.kind === 'current') {
			await onStartCurrent(pendingConfirmation.card);
			return;
		}
		const result = await onImport(pendingConfirmation.code, true);
		announcement = result.status === 'error' ? result.message : '';
	}

	async function copyCode(card: ScenarioCatalogCardViewModel): Promise<void> {
		announcement = (await onCopy(card.shareCode))
			? i18n.t('scenarioCatalog.copySuccess')
			: i18n.t('scenarioCatalog.copyFailure');
	}
</script>

<div class="catalog-backdrop">
	<div
		class="catalog paper"
		role="dialog"
		aria-modal="true"
		aria-labelledby="scenario-catalog-title"
		tabindex="-1"
		onkeydown={handleKeydown}
		{@attach focusTrap}
	>
		<header>
			<h2 id="scenario-catalog-title">{i18n.t('scenarioCatalog.title')}</h2>
			<button type="button" aria-label={i18n.t('scenarioCatalog.close')} onclick={onClose}>×</button
			>
		</header>

		{#if operationError}
			<div class="operation-error" role="alert">
				<p>{operationError}</p>
				<button type="button" disabled={pending} onclick={() => void onRetry()}>
					{i18n.t('scenarioCatalog.retry')}
				</button>
			</div>
		{/if}

		<div class="cards">
			{#each cards as card (card.id)}
				<article class:unavailable={!card.available}>
					<h3>{card.title}</h3>
					<p>{card.summary}</p>
					<p>{card.briefing}</p>
					<p>{card.strategyHint}</p>
					<p>{card.dayLimitLabel} · {card.seedLabel} · {card.eligibilityLabel}</p>
					<p>{card.allowedContentSummary}</p>
					<ul>
						{#each card.objectiveSummaries as objective, objectiveIndex (objectiveIndex)}
							<li>{objective}</li>
						{/each}
					</ul>
					{#if card.activeVersionLabel}<p>{card.activeVersionLabel}</p>{/if}
					{#if card.best}
						<p>{card.best.medalLabel} · {card.best.scoreLabel}</p>
					{/if}
					{#if card.priorVersionResult}
						<p>
							{i18n.t('scenarioCatalog.priorVersion')}: {card.priorVersionResult.medalLabel} ·
							{card.priorVersionResult.scoreLabel}
						</p>
					{/if}
					{#if card.unavailableReason}<p role="alert">{card.unavailableReason}</p>{/if}
					<div class="actions">
						<button
							type="button"
							disabled={pending || !persistenceReady || !card.available}
							aria-label={`${card.primaryLabel} ${card.title}`}
							onclick={() =>
								void (card.primaryAction === 'resume' ? onResume(card) : onStart(card))}
						>
							{card.primaryLabel}
						</button>
						{#if card.showRestart}
							<button
								type="button"
								disabled={pending || !persistenceReady}
								aria-label={`${i18n.t('scenarioCatalog.restart')} ${card.title}`}
								onclick={() => void onRestart(card)}
							>
								{i18n.t('scenarioCatalog.restart')}
							</button>
						{/if}
						{#if card.showStartCurrent}
							<button
								type="button"
								disabled={pending || !persistenceReady || !card.available}
								aria-label={`${i18n.t('scenarioCatalog.startCurrent')} ${card.title}`}
								onclick={() =>
									(confirmation = {
										kind: 'current',
										card,
										message: i18n.t('scenarioCatalog.olderVersionConfirmation')
									})}
							>
								{i18n.t('scenarioCatalog.startCurrent')}
							</button>
						{/if}
						<button
							type="button"
							disabled={pending}
							aria-label={i18n.t('scenarioCatalog.copyCode', { title: card.title })}
							onclick={() => void copyCode(card)}
						>
							{i18n.t('scenarioCatalog.copyCode', { title: card.title })}
						</button>
					</div>
				</article>
			{/each}
		</div>

		<form
			onsubmit={(event) => {
				event.preventDefault();
				void importCode();
			}}
		>
			<label for="scenario-share-code">{i18n.t('scenarioCatalog.shareCode')}</label>
			<input id="scenario-share-code" bind:value={shareCode} />
			<button type="submit" disabled={pending || !persistenceReady}
				>{i18n.t('scenarioCatalog.importCode')}</button
			>
		</form>

		<div aria-live="polite">{announcement}</div>
		{#if confirmation}
			<div class="confirmation" role="alertdialog" aria-label={confirmation.message}>
				<p>{confirmation.message}</p>
				<button type="button" disabled={pending} onclick={() => void confirmReplacement()}>
					{i18n.t('scenarioCatalog.confirmReplacement')}
				</button>
				<button type="button" onclick={() => (confirmation = null)}>
					{i18n.t('scenarioCatalog.cancel')}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.catalog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		background: rgb(20 16 10 / 70%);
		padding: 1rem;
	}
	.catalog {
		width: min(70rem, 100%);
		max-height: 92vh;
		overflow: auto;
		padding: 1rem;
	}
	header,
	.actions,
	form {
		display: flex;
		gap: 0.6rem;
		align-items: center;
	}
	header {
		justify-content: space-between;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.8rem;
	}
	article {
		border: 1px solid var(--paper-edge);
		padding: 0.8rem;
	}
	article.unavailable {
		opacity: 0.72;
	}
	.actions {
		flex-wrap: wrap;
	}
	form {
		margin-top: 1rem;
		flex-wrap: wrap;
	}
	.operation-error,
	.confirmation {
		border: 1px solid var(--brass-500);
		padding: 0.7rem;
		margin-block: 0.7rem;
	}
</style>
