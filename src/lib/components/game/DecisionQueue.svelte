<script lang="ts">
	import type { DecisionItem } from '$lib/game/types';

	let {
		decisions,
		onResolve
	}: {
		decisions: DecisionItem[];
		onResolve: (decisionId: string, optionId: string) => void;
	} = $props();
</script>

<section class="panel paper" aria-labelledby="decision-heading">
	<h2 id="decision-heading">Decision Queue</h2>

	{#if decisions.length === 0}
		<p class="empty">No urgent decisions today.</p>
	{:else}
		<div class="queue">
			{#each decisions as decision (decision.id)}
				<article>
					<div class="decision-copy">
						<h3>{decision.title}</h3>
						<p>{decision.context}</p>
						<span class="expires"
							><span class="seal" data-urgent="true">Day {decision.expiresOnDay}</span></span
						>
					</div>

					<div class="options">
						{#each decision.options as option (option.id)}
							<button type="button" onclick={() => onResolve(decision.id, option.id)}>
								<strong>{option.label}</strong>
								<span>{option.description}</span>
							</button>
						{/each}
					</div>
				</article>
			{/each}
		</div>
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

	.decision-copy {
		gap: 0.4rem;
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
</style>
