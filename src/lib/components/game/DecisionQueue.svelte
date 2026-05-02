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

<section class="panel" aria-labelledby="decision-heading">
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
						<span>Expires day {decision.expiresOnDay}</span>
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
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 1rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-size: 0.95rem;
	}

	.empty,
	p,
	.decision-copy span,
	button span {
		color: #a7b4c8;
	}

	.queue,
	article,
	.decision-copy,
	.options {
		display: grid;
		gap: 0.75rem;
	}

	article {
		border: 1px solid #26374d;
		border-radius: 8px;
		background: #151f2d;
		padding: 0.85rem;
	}

	.decision-copy {
		gap: 0.3rem;
	}

	.decision-copy span,
	button span {
		font-size: 0.82rem;
	}

	button {
		display: grid;
		gap: 0.25rem;
		border: 1px solid #345172;
		border-radius: 8px;
		background: #16283b;
		color: #edf2f7;
		padding: 0.75rem;
		text-align: left;
	}

	button:hover,
	button:focus-visible {
		border-color: #5f8fd0;
		background: #1c334d;
	}
</style>
