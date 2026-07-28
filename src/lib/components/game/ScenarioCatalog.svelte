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
		onStart: (
			card: ScenarioCatalogCardViewModel,
			confirmed: boolean,
			expectedRunId?: string | null,
			expectedRevision?: number | null
		) => ScenarioCatalogActionResult | Promise<ScenarioCatalogActionResult>;
		onResume: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onRestart: (card: ScenarioCatalogCardViewModel) => void | Promise<void>;
		onStartCurrent: (
			card: ScenarioCatalogCardViewModel,
			confirmed: boolean,
			expectedRunId?: string | null,
			expectedRevision?: number | null
		) => ScenarioCatalogActionResult | Promise<ScenarioCatalogActionResult>;
		onImport: (
			code: string,
			confirmed: boolean,
			expectedRunId?: string | null,
			expectedRevision?: number | null
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
	let confirmButton = $state<HTMLButtonElement | undefined>(undefined);
	// Focus the primary action when the replacement confirmation opens so keyboard
	// users do not have to Tab through the remaining catalog cards.
	$effect(() => {
		if (confirmation) confirmButton?.focus({ preventScroll: true });
	});
	let confirmation = $state<
		| {
				kind: 'start';
				card: ScenarioCatalogCardViewModel;
				message: string;
				expectedRunId?: string | null;
				expectedRevision?: number | null;
		  }
		| {
				kind: 'current';
				card: ScenarioCatalogCardViewModel;
				message: string;
				expectedRunId?: string | null;
				expectedRevision?: number | null;
		  }
		| {
				kind: 'import';
				code: string;
				message: string;
				expectedRunId?: string | null;
				expectedRevision?: number | null;
		  }
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
			confirmation = {
				kind: 'import',
				code,
				message: result.message,
				expectedRunId: result.expectedRunId,
				expectedRevision: result.expectedRevision
			};
			announcement = '';
		} else if (result.status === 'error') {
			announcement = result.message;
		} else {
			announcement = '';
		}
	}

	// Route the ordinary Start action through the same confirmation-result
	// flow used by Start Current and Import. When another tab starts the same
	// scenario after this tab loaded an empty catalogue, the controller
	// returns confirmation-required from the (confirmed=false) call; routing
	// it through here surfaces the replacement prompt with the existing run's
	// (runId, revision) token instead of silently discarding it and leaving
	// the stale Start button doing nothing visible on repeated clicks.
	async function requestStart(card: ScenarioCatalogCardViewModel): Promise<void> {
		const result = await onStart(card, false);
		if (result.status === 'confirmation-required') {
			confirmation = {
				kind: 'start',
				card,
				message: result.message,
				expectedRunId: result.expectedRunId,
				expectedRevision: result.expectedRevision
			};
			announcement = '';
		} else if (result.status === 'error') {
			announcement = result.message;
		} else {
			announcement = '';
		}
	}

	// Route the current-version replacement through the controller's initial
	// (confirmed=false) call so the confirmation token carries the revision
	// observed at dialog-open time, not just the runId from the (revision-less)
	// catalog summary. Binding the confirmed write to that revision makes a
	// concurrent tab that advances the same run (runId unchanged, revision
	// bumped) between dialog-open and confirm-click lose the CAS and re-surface
	// confirmation instead of silently clobbering the other tab's progress.
	async function requestStartCurrent(card: ScenarioCatalogCardViewModel): Promise<void> {
		const result = await onStartCurrent(card, false);
		if (result.status === 'confirmation-required') {
			confirmation = {
				kind: 'current',
				card,
				message: result.message,
				expectedRunId: result.expectedRunId,
				expectedRevision: result.expectedRevision
			};
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
		const result =
			pendingConfirmation.kind === 'start'
				? await onStart(
						pendingConfirmation.card,
						true,
						pendingConfirmation.expectedRunId,
						pendingConfirmation.expectedRevision
					)
				: pendingConfirmation.kind === 'current'
					? await onStartCurrent(
							pendingConfirmation.card,
							true,
							pendingConfirmation.expectedRunId,
							pendingConfirmation.expectedRevision
						)
					: await onImport(
							pendingConfirmation.code,
							true,
							pendingConfirmation.expectedRunId,
							pendingConfirmation.expectedRevision
						);
		if (result.status === 'confirmation-required') {
			// The confirmed write lost the compare-and-swap to a newer run
			// that appeared between the initial conflict and this confirmed
			// write. Reopen the confirmation with the new message and token
			// so the user can reconcile instead of silently discarding the
			// conflict (which would leave an empty announcement and no way
			// to surface the newer run). The start, current-version, and
			// import replacement flows share this reopen path.
			confirmation =
				pendingConfirmation.kind === 'import'
					? {
							kind: 'import',
							code: pendingConfirmation.code,
							message: result.message,
							expectedRunId: result.expectedRunId,
							expectedRevision: result.expectedRevision
						}
					: {
							kind: pendingConfirmation.kind,
							card: pendingConfirmation.card,
							message: result.message,
							expectedRunId: result.expectedRunId,
							expectedRevision: result.expectedRevision
						};
			announcement = '';
		} else if (result.status === 'error') {
			announcement = result.message;
		} else {
			announcement = '';
		}
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
								void (card.primaryAction === 'resume' ? onResume(card) : requestStart(card))}
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
								onclick={() => void requestStartCurrent(card)}
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
				<button
					bind:this={confirmButton}
					type="button"
					disabled={pending}
					onclick={() => void confirmReplacement()}
				>
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
