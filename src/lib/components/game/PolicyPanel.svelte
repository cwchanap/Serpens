<script lang="ts">
	import type { CompanyPolicy } from '$lib/game/types';

	let {
		policy,
		onChange
	}: {
		policy: CompanyPolicy;
		onChange: (patch: Partial<CompanyPolicy>) => void;
	} = $props();

	const fields = [
		{
			key: 'pricing',
			label: 'Pricing',
			options: ['discount', 'competitive', 'standard', 'premium']
		},
		{
			key: 'inventory',
			label: 'Inventory',
			options: ['lean', 'balanced', 'generous']
		},
		{
			key: 'staffing',
			label: 'Staffing',
			options: ['minimal', 'efficient', 'service']
		},
		{
			key: 'marketing',
			label: 'Marketing',
			options: ['none', 'awareness', 'promotions', 'loyalty']
		},
		{
			key: 'service',
			label: 'Service',
			options: ['speed', 'balanced', 'highTouch']
		}
	] as const satisfies readonly {
		key: keyof CompanyPolicy;
		label: string;
		options: readonly string[];
	}[];

	function update(key: keyof CompanyPolicy, value: string) {
		onChange({ [key]: value } as Partial<CompanyPolicy>);
	}
</script>

<section class="panel" aria-labelledby="policy-heading">
	<h2 id="policy-heading">Policies</h2>

	<div class="policy-grid">
		{#each fields as field (field.key)}
			<label>
				<span>{field.label}</span>
				<select
					aria-label={field.label}
					value={policy[field.key]}
					onchange={(event) => update(field.key, event.currentTarget.value)}
				>
					{#each field.options as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
		{/each}
	</div>
</section>

<style>
	.panel {
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 1rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
	}

	.policy-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.75rem;
	}

	label {
		display: grid;
		min-width: 0;
		gap: 0.35rem;
	}

	span {
		color: #a7b4c8;
		font-size: 0.78rem;
	}

	select {
		width: 100%;
		border: 1px solid #31445c;
		border-radius: 6px;
		background: #0b111a;
		color: #edf2f7;
		padding: 0.55rem 0.6rem;
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
