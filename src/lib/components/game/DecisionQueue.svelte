<script lang="ts">
	import { getDecisionOptionAvailability } from '$lib/game/state';
	import type { DecisionItem, GameState } from '$lib/game/types';
	import { localizeDecision, localizeDecisionFailure } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n';

	let {
		decisions,
		game,
		i18n,
		onResolve,
		canResolve = true,
		disabledReason = null
	}: {
		decisions: DecisionItem[];
		game?: GameState;
		i18n: I18nBundle;
		onResolve: (decisionId: string, optionId: string) => void;
		canResolve?: boolean;
		disabledReason?: string | null;
	} = $props();
</script>

<section class="panel paper" aria-labelledby="decision-heading">
	<h2 id="decision-heading">{i18n.t('decisionQueue.title')}</h2>

	{#if decisions.length === 0}
		<p class="empty">{i18n.t('decisionQueue.empty')}</p>
	{:else}
		<div class="queue">
			{#each decisions as decision (decision.id)}
				{@const localizedDecision = localizeDecision(decision, i18n)}
				<article data-decision-kind={decision.kind}>
					<div class="decision-copy">
						<div class="decision-meta">
							<span class="decision-kind" data-kind={decision.kind}>
								{decision.kind === 'event'
									? i18n.t('decisionQueue.kind.event')
									: i18n.t('decisionQueue.kind.system')}
							</span>
							{#if decision.kind === 'event'}
								<span class="event-provenance">
									{i18n.t('decisionQueue.eventProvenance', {
										eventTitle: localizedDecision.title,
										eventId: decision.eventId,
										instanceId: decision.id
									})}
								</span>
							{/if}
						</div>
						<h3>{localizedDecision.title}</h3>
						<p>{localizedDecision.context}</p>
						<span class="expires"
							><span class="seal" data-urgent="true"
								>{i18n.t('decisionQueue.expiresDay', {
									day: i18n.format.integer(decision.expiresOnDay)
								})}</span
							></span
						>
					</div>

					<div class="options">
						{#each localizedDecision.options as option (option.id)}
							{@const optionAvailability = game
								? getDecisionOptionAvailability(game, decision, option.id)
								: ({ available: true } as const)}
							{@const optionDisabled = !canResolve || !optionAvailability.available}
							<button
								type="button"
								disabled={optionDisabled}
								onclick={() => {
									if (!optionDisabled) onResolve(decision.id, option.id);
								}}
							>
								<strong>{option.label}</strong>
								<span>{option.description}</span>
							</button>
							{#if !optionAvailability.available}
								<p class="option-disabled-copy" role="status">
									{localizeDecisionFailure(optionAvailability, i18n)}
								</p>
							{/if}
						{/each}
					</div>
				</article>
			{/each}
		</div>
		{#if !canResolve && disabledReason}
			<p class="disabled-copy" role="status">{disabledReason}</p>
		{/if}
	{/if}
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.empty,
	p,
	.decision-copy span,
	button span {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	.queue,
	article,
	.decision-copy,
	.options {
		display: grid;
		gap: 0.65rem;
	}

	article {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
	}

	article[data-decision-kind='event'] {
		border-left: 4px solid var(--brass-500);
	}

	article[data-decision-kind='system'] {
		border-left: 4px solid var(--ink-500);
	}

	.decision-copy {
		gap: 0.4rem;
	}

	.decision-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
	}

	.decision-kind {
		display: inline-flex;
		width: fit-content;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
		background: var(--paper-100);
		padding: 0.2rem 0.45rem;
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.decision-kind[data-kind='event'] {
		border-color: var(--brass-500);
		color: var(--brass-700);
	}

	.decision-kind[data-kind='system'] {
		border-color: var(--ink-500);
		color: var(--ink-700);
	}

	.event-provenance {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		line-height: 1.4;
	}

	.decision-copy p {
		font-size: 0.92rem;
	}

	.expires {
		display: inline-flex;
	}

	button {
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		text-align: left;
	}

	button:hover,
	button:focus-visible {
		background: var(--paper-200);
	}

	button strong {
		font-weight: 700;
	}

	button span {
		font-size: 0.85rem;
	}

	.option-disabled-copy {
		font-size: 0.85rem;
	}
</style>
