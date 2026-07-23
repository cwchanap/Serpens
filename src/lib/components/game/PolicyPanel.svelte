<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import type { CompanyPolicy } from '$lib/game/types';

	let {
		i18n,
		policy,
		onChange,
		canUpdate = true,
		disabledReason = null
	}: {
		i18n: I18nBundle;
		policy: CompanyPolicy;
		onChange: (patch: Partial<CompanyPolicy>) => void;
		canUpdate?: boolean;
		disabledReason?: string | null;
	} = $props();

	const fields = [
		{
			key: 'pricing',
			options: ['discount', 'competitive', 'standard', 'premium']
		},
		{
			key: 'inventory',
			options: ['lean', 'balanced', 'generous']
		},
		{
			key: 'staffing',
			options: ['minimal', 'efficient', 'service']
		},
		{
			key: 'marketing',
			options: ['none', 'awareness', 'promotions', 'loyalty']
		},
		{
			key: 'service',
			options: ['speed', 'balanced', 'highTouch']
		}
	] as const satisfies readonly {
		key: keyof CompanyPolicy;
		options: readonly string[];
	}[];

	function update(key: keyof CompanyPolicy, value: string) {
		if (!canUpdate) return;
		onChange({ [key]: value } as Partial<CompanyPolicy>);
	}
</script>

<section class="panel paper" aria-labelledby="policy-heading">
	<h2 id="policy-heading">{i18n.t('policyPanel.title')}</h2>

	<div class="policy-grid">
		{#each fields as field (field.key)}
			{@const fieldLabel = i18n.labels.policyField(field.key)}
			<label>
				<span>{fieldLabel}</span>
				<select
					aria-label={fieldLabel}
					disabled={!canUpdate}
					value={policy[field.key]}
					onchange={(event) => update(field.key, event.currentTarget.value)}
				>
					{#each field.options as option (option)}
						<option value={option}>{i18n.labels.policyValue(field.key, option)}</option>
					{/each}
				</select>
			</label>
		{/each}
	</div>
	{#if !canUpdate && disabledReason}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.policy-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.85rem;
	}

	label {
		display: grid;
		min-width: 0;
		gap: 0.35rem;
	}

	span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	select {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.55rem 0.7rem;
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}

	@media (max-width: 980px) {
		.policy-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.policy-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
