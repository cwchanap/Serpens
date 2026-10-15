<script lang="ts">
	import type { OpeningGuidance } from '$lib/game/openingGuidance';
	import type { I18nBundle, TranslationKey } from '$lib/i18n';

	interface Props {
		hint: OpeningGuidance;
		i18n: I18nBundle;
		onAction: (hint: OpeningGuidance) => void;
		onDismiss?: () => void;
	}

	let { hint, i18n, onAction, onDismiss }: Props = $props();

	const REASON_KEYS: Record<OpeningGuidance['kind'], TranslationKey> = {
		'cash-risk': 'openingGuidance.reason.cashRisk',
		'stock-recovery': 'openingGuidance.reason.stockRecovery',
		'first-result': 'openingGuidance.reason.firstResult',
		'result-evidence': 'openingGuidance.reason.resultEvidence'
	};

	const ACTION_LABEL_KEYS: Record<OpeningGuidance['kind'], TranslationKey> = {
		'cash-risk': 'openingGuidance.financeAction',
		'stock-recovery': 'openingGuidance.stockAction',
		'first-result': 'openingGuidance.dashboardAction',
		'result-evidence': 'openingGuidance.dashboardAction'
	};
</script>

<section
	class="panel paper"
	aria-labelledby="opening-guidance-heading"
	data-testid="opening-guidance"
>
	<h2 id="opening-guidance-heading">{i18n.t('openingGuidance.heading')}</h2>
	<p>{i18n.t(REASON_KEYS[hint.kind])}</p>
	<div class="actions">
		<button
			type="button"
			class="btn-primary"
			data-testid="opening-guidance-action"
			onclick={() => onAction(hint)}
		>
			{i18n.t(ACTION_LABEL_KEYS[hint.kind])}
		</button>
		{#if onDismiss}
			<button
				type="button"
				class="dismiss"
				data-testid="opening-guidance-dismiss"
				onclick={onDismiss}
			>
				{i18n.t('openingGuidance.dismiss')}
			</button>
		{/if}
	</div>
</section>

<style>
	.panel {
		display: grid;
		gap: 0.55rem;
		padding: 0.9rem 1rem;
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-700);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.dismiss {
		margin-left: auto;
	}
</style>
